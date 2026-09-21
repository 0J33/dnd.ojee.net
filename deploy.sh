#!/usr/bin/env bash
# Deploy dnd.ojee.net to disinteg. Layout on the box, which already exists and
# is what nginx is pointed at:
#
#   /home/$REMOTE_USER/dnd-client/   <-- built Vite bundle (nginx root)
#   /home/$REMOTE_USER/dnd-server/   <-- Node API, run by dnd-server.service on :5005
#
# Required env (put these in deploy.local.env, which is gitignored):
#   REMOTE_HOST   target machine (Tailscale IP or hostname)
#   REMOTE_USER   ssh login user
#   SSHPASS       ssh password, consumed by `sshpass -e`. Leave unset to use
#                 key-based auth; the sshpass wrapper drops out on its own.
# Optional:
#   DND_API_URL   absolute URL of the API. Vite inlines this at build time, so
#                 it has to be right before the build, not at runtime. Defaults
#                 to whatever client/.env.production says.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f deploy.local.env ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source deploy.local.env
  set +o allexport
fi

: "${REMOTE_HOST:?REMOTE_HOST not set — see deploy.local.env.example}"
: "${REMOTE_USER:?REMOTE_USER not set — see deploy.local.env.example}"

# `sshpass -e` reads the password from SSHPASS, so it never appears on a
# command line or in a process listing. With no SSHPASS, plain ssh is used and
# key auth applies.
if [[ -n "${SSHPASS:-}" ]]; then
  export SSHPASS
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}")
  RSYNC=(sshpass -e rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new")
else
  SSH=(ssh -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}")
  RSYNC=(rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new")
fi
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

echo "[1/5] building client"
# vite build runs in production mode, so client/.env.production supplies
# VITE_SERVER_URL unless DND_API_URL overrides it here.
if [[ -n "${DND_API_URL:-}" ]]; then
  (cd client && VITE_SERVER_URL="$DND_API_URL" npx vite build >/dev/null)
else
  (cd client && npx vite build >/dev/null)
fi
grep -q 'dnd-api\|localhost:5005' client/dist/assets/index-*.js \
  || { echo "  no API origin found in the bundle — check client/.env.production" >&2; exit 1; }
echo "  API origin in bundle: $(grep -ohE 'https?://[a-z0-9.:-]*(dnd-api[a-z0-9.-]*|localhost:5005)' client/dist/assets/index-*.js | sort -u | head -1)"

echo "[2/5] rsync client -> $REMOTE:/home/$REMOTE_USER/dnd-client/"
# Previous builds' hashed assets are protected from --delete: a browser still
# holding the old index.html asks for the old script, and nginx's try_files
# would answer a missing one with index.html, which the browser then tries to
# run as JavaScript. They're pruned after two weeks in step 4.
"${RSYNC[@]}" --filter='P assets/*' client/dist/ "$REMOTE:/home/${REMOTE_USER}/dnd-client/"

echo "[3/5] rsync server -> $REMOTE:/home/$REMOTE_USER/dnd-server/"
# No --delete of .env: the live MONGODB_URI lives only on the box. node_modules
# is installed remotely rather than shipped, so the box's own arch/node build
# is the one that gets used.
"${RSYNC[@]}" \
  --exclude 'node_modules/' --exclude '.env' --exclude '.env.*' --exclude '.git/' \
  server/ "$REMOTE:/home/${REMOTE_USER}/dnd-server/"

echo "[4/5] install deps + restart dnd-server.service"
"${SSH[@]}" bash -s <<'REMOTE_SH'
set -u
find "$HOME/dnd-client/assets" -type f -mtime +14 -delete 2>/dev/null
cd "$HOME/dnd-server"
PATH=/opt/node22/bin:$PATH
npm install --omit=dev --silent 2>&1 | tail -3

unit=dnd-server.service
before=$(systemctl show "$unit" -p MainPID --value)
# disinteg has no NOPASSWD rule for this unit, and a sudo that falls through to
# a password prompt would fail *after* the files were copied — a deploy that
# looks finished while the old code is still serving. The unit is
# Restart=on-failure, so killing our own process is a restart and needs no
# privilege at all. Same pattern as teg.ojee.net's deploy.
if sudo -n systemctl restart "$unit" 2>/dev/null; then
  echo "  restarted via sudo"
else
  echo "  no sudo for $unit; killing pid $before — Restart=on-failure brings it back"
  [ -n "$before" ] && [ "$before" != "0" ] && kill -9 "$before" 2>/dev/null
fi

for _ in $(seq 1 25); do
  sleep 1
  now=$(systemctl show "$unit" -p MainPID --value)
  state=$(systemctl show "$unit" -p ActiveState --value)
  if [ "$state" = "active" ] && [ -n "$now" ] && [ "$now" != "0" ] && [ "$now" != "$before" ]; then
    echo "  up as pid $now"
    exit 0
  fi
done
echo "  FAILED: $unit did not come back" >&2
exit 1
REMOTE_SH

echo "[5/5] health check"
# Through nginx, not just the socket — that is what a browser actually hits.
# Retried: the service was restarted a second ago, so the first request can
# still land on a closed port and 502 through the proxy.
probe() {  # $1 = url. Prints "<code> <body>"; non-zero if it never reached 200.
  local url="$1" out code body
  for _ in $(seq 1 15); do
    out=$(curl -s -m 20 -w '\n%{http_code}' "$url" || true)
    code=${out##*$'\n'}; body=${out%$'\n'*}
    [[ "$code" == 200 ]] && { echo "$code $body"; return 0; }
    sleep 2
  done
  echo "$code $body"
  return 1
}

# Command substitution, not `read < <(...)`: process substitution does not
# propagate its exit status, so the failure branch would never fire.
if out=$(probe https://dnd-api.ojee.net/api/health); then
  echo "  dnd-api.ojee.net/api/health -> $out"
else
  echo "  dnd-api.ojee.net/api/health -> $out"; echo "  API is not healthy" >&2; exit 1
fi
if out=$(probe https://dnd.ojee.net/); then
  echo "  dnd.ojee.net -> ${out%% *}"
else
  echo "  dnd.ojee.net -> ${out%% *}"; echo "  frontend is not serving" >&2; exit 1
fi

# The build id the bundle compares itself against (client/src/freshness.jsx).
want=$(sed -n 's/.*"build":"\([0-9]*\)".*/\1/p' client/dist/version.json)
live=$(curl -s -m 20 "https://dnd.ojee.net/version.json?t=$(date +%s)" | sed -n 's/.*"build":"\([0-9]*\)".*/\1/p')
if [[ -n "$want" && "$want" == "$live" ]]; then
  echo "  dnd.ojee.net/version.json -> $live"
else
  echo "  dnd.ojee.net/version.json -> '${live}', expected '${want}'" >&2; exit 1
fi

echo
echo "Deployed."
