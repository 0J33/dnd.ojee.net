# D&D Tabletop — Build Plan

A beginner-first D&D 5e virtual tabletop for playing with friends, sibling app to mtg.ojee.net.
Working name: **Dragonhold** (dnd.ojee.net). "Compatible with fifth edition" — built on the
CC-BY SRD; no WotC trademarks/logos.

## Product pillars

1. **A real table**: battle maps with a 5-ft grid, tokens, fog of war, full polyhedral dice,
   initiative tracker, chat + rolls, DM tools with all ~330 SRD monsters.
2. **Real character sheets**: guided step-by-step builder (all 12 classes, 9 races, 4
   backgrounds, spells), click-any-stat-to-roll sheets, rests, death saves, leveling.
3. **Nobody at the table has ever played**: a scripted guided first adventure ("Learn to Play")
   where the app is the narrator/DM — teaches checks → combat → saves → healing → boss →
   level-up in 60–90 min. Plus pregens, a paged guide, rules popups, and a DM screen.

## Architecture (inherits mtg.ojee.net patterns)

- `server/` Node 18+ / Express / Socket.IO / Mongoose, port **5005**, DB `mongodb://localhost:27017/dnd`.
  - Auth: bcryptjs + Mongo Session TTL docs + `dndSession` httpOnly cookie (SameSite=None, Secure).
  - Vendored SRD 5.1 JSON (5e-bits dataset) served via `/api/srd/*` with search/filters.
  - In-memory campaign rooms + 30 s autosave + Mongo persistence; campaigns persist (90-day
    inactivity TTL instead of MTG's 6 h — these are ongoing games).
  - Server-side dice (fairness), simple monster-turn automation for guided mode.
- `client/` **Vite + React 19** (not CRA — faster, current), socket.io-client, no router lib.
  - Views: Login → Lobby (campaigns / characters / learn) → Table (GameBoard) | Builder | Sheet.
  - Board: pan/zoom map canvas, snap-to-grid tokens, fog layer, ruler, pings, drawing,
    initiative bar, party HP panel, dice tray (visual + notation), chat/log, monster browser +
    stat blocks, rules reference, DM screen.
- Style: MTG's dark near-black + Cinzel/EB Garamond family, elevated: ember/gold dual accent,
  richer panels, glows, textures. Tokens in `styles/index.css`.

## Data

- Vendor from `5e-bits/5e-database` (src/2014): races, subraces, traits, classes, subclasses,
  levels, features, spells, monsters, equipment, equipment-categories, magic-items, conditions,
  skills, languages, alignments, weapon-properties, rules, rule-sections, proficiencies.
- Hand-authored: 4 backgrounds (SRD 5.1 Acolyte + SRD 5.2 Criminal/Sage/Soldier, flattened to
  2014 shape), 6 pregens with level-up scripts, tutorial adventure script + scenes, guide pages.

## Multiplayer model

- Campaign = persistent room with 6-char code + invite link. Creator picks: **DM mode** (they
  run the table) or **Guided mode** (app narrates the tutorial adventure; no DM needed).
- Players join with an account (username+password, like MTG), pick/create a character, get a
  token. DM controls scenes, fog, monsters, combat; players control their token + sheet.
- Live sync: debounced full-state broadcast + append-only chat/log/rolls; reconnect via
  localStorage + persistent rooms.

## The tutorial adventure — "The Cellar of the Gilded Flagon" (original, SRD monsters only)

Town-inn hook → 5 scenes teaching one mechanic each:
1. **Taproom** — talk to innkeep (social), first ability check (Perception).
2. **Cellar stairs** — Stealth group check; first combat: 2 giant rats (initiative, attack,
   damage).
3. **Broken wall** — Investigation; dart trap (DEX save); optional secret cache.
4. **Goblin warren** — 2 goblins; teaches advantage (Help action), healing (potion).
5. **Boss** — goblin boss + treasure + level-up moment.
Scripted steps with narration cards, "click your Stealth skill" prompts, rule cards on first
occurrence, auto-run monster turns.

## Deploy (disinteg)

- `~/dnd-client` static + nginx `dnd.ojee.net`; `~/dnd-server` + systemd `dnd-server.service`
  (`/opt/node22/bin/node index.js`, port 5005); nginx `dnd-api.ojee.net` → 127.0.0.1:5005 with
  websocket upgrade.
- DNS: `cloudflared tunnel route dns` for dnd.ojee.net + dnd-api.ojee.net onto the existing
  tunnel; add ingress (dashboard-managed remote config — verify at deploy; fallback documented).
- Env: server `.env.production` (PORT=5005, MONGODB_URI=…/dnd, CLIENT_URL=https://dnd.ojee.net);
  client `VITE_SERVER_URL=https://dnd-api.ojee.net`.

## Milestones

1. Scaffold + SRD data vendored
2. Server complete (auth, SRD API, characters, campaigns, sockets, dice, combat)
3. Client core (login/lobby/styles) → builder + sheet → board
4. Tutorial + guide + pregens
5. Local end-to-end test
6. Deploy + DNS + live verify
