#!/bin/bash
# Runs the 3D world demo: its own mongod, the server serving client/dist on
# one origin, and a Cloudflare quick tunnel in front. Keeps all three alive.
# The share link is written to $STATE/url.txt (it changes if the tunnel has
# to be recreated). Build first: demo/build.sh
#   demo/run.sh        start (single instance)      demo/stop.sh   stop
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE="${DND_DEMO_STATE:-$HOME/.cache/dnd-world}"
PORT="${DND_DEMO_PORT:-5095}"
MPORT=27028
CF="$STATE/cloudflared"
mkdir -p "$STATE/mongodata" "$STATE/logs"
exec 9>"$STATE/run.lock"
flock -n 9 || { echo "demo already running — link: $(cat "$STATE/url.txt" 2>/dev/null)"; exit 0; }
echo $$ > "$STATE/run.pid"

if [ ! -x "$CF" ]; then
    if [ -x "$HOME/.cache/mtg-tabletop/cloudflared" ]; then cp "$HOME/.cache/mtg-tabletop/cloudflared" "$CF"
    else curl -sL -o "$CF" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x "$CF"; fi
fi

mongo_up() { (echo > /dev/tcp/127.0.0.1/$MPORT) 2>/dev/null; }
server_up() { curl -s --max-time 3 "http://127.0.0.1:$PORT/api/health" | grep -q ok; }

start_mongo() {
    # Children must not inherit the lock fd (9), or they keep "the demo is
    # running" true after the watchdog dies.
    mongod --dbpath "$STATE/mongodata" --port $MPORT --bind_ip 127.0.0.1 --fork --logpath "$STATE/logs/mongod.log" >/dev/null 9>&-
}
start_server() {
    local holder; holder=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
    [ -n "${holder:-}" ] && kill "$holder" 2>/dev/null && sleep 1
    # Accounts live in the "mtg" database next to "dnd" (models/accounts.js).
    ( cd "$DIR/server" && SERVE_CLIENT=1 PORT=$PORT MONGODB_URI="mongodb://127.0.0.1:$MPORT/dnd" \
        CLIENT_URL="http://localhost:$PORT" setsid nohup node index.js >> "$STATE/logs/server.log" 2>&1 9>&- & )
    for _ in $(seq 1 20); do server_up && return 0; sleep 0.5; done
    echo "[demo] server did not come up — see $STATE/logs/server.log"
}
tunnel_up() {
    local url; url=$(cat "$STATE/url.txt" 2>/dev/null)
    [ -n "$url" ] && [ -f "$STATE/tunnel.pid" ] && kill -0 "$(cat "$STATE/tunnel.pid")" 2>/dev/null || return 1
    [ "$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ]
}
start_tunnel() {
    [ -f "$STATE/tunnel.pid" ] && kill "$(cat "$STATE/tunnel.pid")" 2>/dev/null
    : > "$STATE/logs/tunnel.log"
    # http2 over IPv4: QUIC/UDP has been flaky on this network.
    setsid nohup "$CF" tunnel --no-autoupdate --protocol http2 --edge-ip-version 4 --url "http://localhost:$PORT" \
        > "$STATE/logs/tunnel.log" 2>&1 9>&- &
    echo $! > "$STATE/tunnel.pid"
    for _ in $(seq 1 40); do
        local url; url=$(grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/logs/tunnel.log" | grep -v '//api\.' | head -1)
        if [ -n "$url" ]; then
            for _ in $(seq 1 30); do
                [ "$(curl -s --max-time 6 -o /dev/null -w '%{http_code}' "$url/api/health")" = 200 ] && break
                sleep 2
            done
            echo "$url" > "$STATE/url.txt"; echo "[demo] link: $url"; return 0
        fi
        sleep 1
    done
    echo "[demo] tunnel failed, retrying later"; return 1
}

mongo_up || start_mongo
start_server   # always: picks up server code changes
[ "${NO_TUNNEL:-}" ] || { tunnel_up || start_tunnel; }
fails=0
while true; do
    sleep 15 9>&-   # (a killed watchdog's sleep must not keep holding the lock)
    mongo_up || { echo "[demo] mongod down, restarting"; start_mongo; }
    server_up || { echo "[demo] server down, restarting"; start_server; }
    [ "${NO_TUNNEL:-}" ] && continue
    # A new tunnel means a new link and cuts off every open tab, so only
    # recreate it when cloudflared has died or the link has been dead ~3 min.
    if tunnel_up; then fails=0; else
        fails=$((fails + 1))
        alive=0; kill -0 "$(cat "$STATE/tunnel.pid" 2>/dev/null)" 2>/dev/null && alive=1
        if [ $alive = 0 ] || [ $fails -ge 12 ]; then start_tunnel && fails=0; fi
    fi
done
