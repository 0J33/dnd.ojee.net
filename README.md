# dnd.ojee.net — D&D 5e Virtual Tabletop

A beginner-first virtual tabletop for Dungeons & Dragons, live at **https://dnd.ojee.net**.
Sibling app to mtg.ojee.net; built to be nicer-looking and rules-aware, with a guided
"Learn to Play" adventure so a whole group can play their first game with nobody knowing the rules.

Unofficial fan project, compatible with fifth edition. Built on the CC-BY 5e SRD. Not affiliated
with Wizards of the Coast. See the in-app "licenses & credits" for the required SRD attribution.

## What it does

- **Character builder** — guided step-by-step creation: all 12 SRD classes, 9 races, 4 backgrounds,
  ability-score methods (standard array / point buy / roll), spell selection, plus 6 ready-made
  pregens for instant play.
- **Interactive character sheets** — click any stat/skill/save/attack to roll it; spell slots,
  rests, death saves, conditions, level-up, all math derived automatically (`client/src/rules/engine.js`).
- **Portraits** — every hero gets a drawn likeness derived from their race, class and name
  (`client/src/components/Portrait.jsx`). The same artwork is the map token, the party-list row, the
  lobby card and the sheet header, so a character is recognisable everywhere. Monsters and NPCs get
  matching silhouettes chosen from their SRD type and name.
- **Battle maps** — pan/zoom canvas with a 5-ft grid, drag-drop tokens, fog of war, ruler, pings,
  drawing; a browsable library of ~30 built-in maps across five categories, plus blank grids and
  image URLs.
- **Map builder** — the DM paints the map live with the Build tool: ~55 terrain and object tiles
  (walls, doors, stairs, furniture, chests, braziers, trees, water, lava, altars, webs…) with brush,
  fill-area, room and flood modes, plus resize and re-material. Everything is a single character in
  the scene's `cells` grid, drawn by one shared renderer (`client/src/render/sceneRender.js`) that
  also produces the scene thumbnails and palette swatches.
- **Campaign prep** — a Prep workspace with two tabs. *Scenes* is a visual library: real previews,
  rename, duplicate, reorder, per-scene DM notes, and starter map sets. *Story* is an ordered
  outline of beats; each beat holds a scene, an encounter and read-aloud text, and running one
  switches the table, places the creatures and posts the narration in a single click.
- **Dice** — full polyhedral tray with advantage/disadvantage buttons, dice pool, `2d6+3` notation,
  hidden/GM rolls; server-authoritative and broadcast to everyone with animated results.
- **DM tools** — the full SRD monster library (~330 creatures) with stat blocks and an encounter-XP
  budget hint, initiative tracker, a scene strip for instant scene switching, XP awards, one-click
  auto monster turns.
- **Guided adventure** — "The Cellar of the Gilded Flagon", a 17-scene scripted first quest where the
  app narrates and runs the monsters; teaches checks → advantage → combat → saves → healing → boss →
  level-up. No experienced DM required (`client/src/data/tutorialScript.js`).
- **Multiplayer** — persistent campaigns with 6-char codes + invite links, real-time sync, reconnect.

See `RESEARCH.md` (D&D rules + VTT + codebase findings) and `PLAN.md` (design decisions).

## Stack

- **server/** — Node/Express 5 + Socket.IO 4 + Mongoose (MongoDB `dnd`). Cookie-session auth
  (bcryptjs + Mongo session TTL, `dndSession` httpOnly cross-site cookie). In-memory campaign rooms
  with 30s autosave + 90-day inactivity TTL; per-viewer sanitized state; 80ms debounced broadcast +
  append-only chat/log deltas. Vendored SRD 5.1 JSON in `server/data/` (from 5e-bits/5e-database),
  served under `/api/srd/*`. Port **5005**.
- **client/** — Vite + React 19, single shared socket, fetch API wrapper, hand-rolled routing.
  Warm candlelit dark theme (Cinzel + EB Garamond, gold + ember accents) in `src/styles/`.
  Interface art is SVG throughout — no emoji are used as icons. Below 820px the board switches to a
  bottom tab bar (Map / Party / Chat / More) with the tools and dice stacked above it; every tap
  target is at least 44px. Keyboard focus rings and `prefers-reduced-motion` are honoured globally.

## Local development

```bash
# server (needs local MongoDB on :27017)
cd server && npm install && npm run dev      # :5005, reads .env

# client
cd client && npm install && npm run dev      # :5173, reads .env (VITE_SERVER_URL=http://localhost:5005)
```

CORS/cookies require the client origin to match `CLIENT_URL` in `server/.env` (default
`http://localhost:5173`).

## Deployment (disinteg)

Same pattern as mtg.ojee.net. From this repo:

```bash
# 1. build client (bakes VITE_SERVER_URL=https://dnd-api.ojee.net from .env.production)
cd client && npm run build

# 2. sync to the box (tailscale up first; alias: `disinteg`)
rsync -az --delete --exclude node_modules --exclude '.env*' server/ disinteg@100.118.201.77:~/dnd-server/
rsync -az --delete client/dist/ disinteg@100.118.201.77:~/dnd-client/

# 3. on the box: install server deps + restart
ssh disinteg 'cd ~/dnd-server && /opt/node22/bin/npm install --omit=dev && sudo systemctl restart dnd-server'
```

Infrastructure on the box (already provisioned):
- `dnd-server.service` — systemd unit, `/opt/node22/bin/node index.js`, port 5005, `~/dnd-server/.env`
  holds prod values (`MONGODB_URI=…/dnd`, `CLIENT_URL=https://dnd.ojee.net`).
- nginx site `dnd` — `dnd.ojee.net` serves static `~/dnd-client`; `dnd-api.ojee.net` proxies :5005
  with websocket upgrade headers.
- Cloudflare tunnel `minecraft` (`/etc/cloudflared/config.yml`) — ingress rules for `dnd.ojee.net`
  and `dnd-api.ojee.net` → `http://localhost:80`; DNS CNAMEs created via `cloudflared tunnel route dns`.

## Licensing

Ships SRD 5.1 (and some SRD 5.2) content under CC-BY-4.0. Attribution paragraphs are rendered on the
in-app credits screen and must remain. Interface art is original. Code: MIT.
