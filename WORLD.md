# The world — dnd.ojee.net in 3D (branch `world3d`, unreleased)

Every scene becomes a lit, living place you look into from above: a tavern
with a crackling hearth and rain at the windows, a cellar of crates and
cobwebs, a goblin warren lit by braziers, a vault with a magic circle
humming. Heroes are figures built from their portrait (race, class, every
customization), monsters are figures built from their SRD type, and
everything moves: heroes walk to where you click, swing, cast, flinch,
fall, level up in a pillar of light.

Nothing about the game's data changes shape. A scene is still a grid of
tile characters and tokens; the 3D world is generated from it, so every
built-in map, every map a DM paints, the tutorial, and every existing
campaign appear in 3D without anyone redoing anything. The 2D board stays
one click away (and stays the default on phones).

## Art direction

Painted miniatures in a candle-lit diorama. Warm, slightly stylised, low
poly with soft light — the look of a hand-built tabletop set, not a video
game trying to be photo-real. It matches the site's ember-and-gold look
and stays fast.

* **Places** come from the grid: floors are painted by the same tile
  drawings the 2D map uses (so materials match), walls rise as stone,
  timber, rough cave rock or hedge, and each of the ~45 prop tiles (doors,
  tables, barrels, braziers, altars, trees, crystals, wells…) has a 3D
  model. Static geometry is merged into a handful of draw calls.
* **Environments** are read from the scene: indoors (dark beyond the walls,
  warm point lights from every hearth, brazier, torch and forge, dust in
  the air, rain against the windows for the tavern), outdoors (sky, sun,
  long shadows, drifting leaves or snow by material), caves (cold blue dark,
  glowing crystals and mushrooms), lava and water that move and glow.
* **Creatures** are chunky painted miniatures (rebuilt from scratch in v1.5):
  a big head, about a third of the height, so faces read from across the
  table; eyes with whites, irises and a glint; brows and mouths that show the
  mood; chamfered blocks (`Kit.bevel`) for bodies, clothes and gear; small
  readable details (belts, buckles, trims, pouches, rivets) and one shared
  palette for figures and rooms alike (`world/palette.js`). Each figure is a
  few pivoted parts (legs, torso, head, arms with hand groups, cloak, tail,
  wings) so it can move.
  - The look itself is data in `client/src/look/`: `catalog.js` lists every
    option (presentation, build, height, face, eyes, brows, nose, marks, 18
    hairstyles, 11 facial hair, 10 outfits, 6 armours, cloaks, 12 headwear,
    17 main-hand and 9 off-hand items, extras, cloth/trim/cloak/leather/metal
    paints), the class kits (each class's default silhouette) and the NPC
    roles (innkeeper, guard, knight, merchant, noble, smith, …, read from the
    token's name). `resolve.js` turns a sheet (or an NPC) into a full look;
    old saved looks (headwear on/off, gearforged frames) map onto new choices.
  - Builders: `world/fig/hero.js` (people, gearforged, skeletons), `fig/gear.js`
    (weapons, shields, foci, carried things), `fig/beasts.js` (rats to dragons,
    and the humanoid monsters' looks), `fig/rig.js` (the Figure base),
    `world/figures.js` (the biped rig and the entry points).
  - The 2D portrait (`components/Portrait.jsx`) draws the same look; options it
    has no drawing for map to the nearest one it has (`catalog.js` `BUST`).
  - QA contact sheets: `?world3d=qa&figqa=<set>` in dev, sets races, random,
    gear, classes, hair, beards, outfits, hats, weapons, npcs, monsters
    (`&faces=1` for close-ups).
* **Motion**: idle breathing, walking along the real path, attack lunges
  and swings, arrows, spell bolts coloured by damage type, hit sparks and
  floating numbers, healing motes, death falls, a level-up pillar, a 3D d20
  that tumbles over the roller when anyone rolls.
* **Light**: ACES tone mapping, bloom on fire and magic, one shadow-casting
  key light plus up to a dozen flickering point lights.

## Playing (quality of life, for everyone)

The rule: the common things are one click, and the app does the maths.

* **Move**: click your hero — the squares it can reach this turn light up
  (walls, difficult terrain and other creatures respected); click a square
  and it walks there along the path. Dragging still works.
* **Attack / cast**: with your hero selected, click an enemy. A small menu
  lists your attacks and damaging spells with their odds; pick one and the
  app rolls to hit against the target's AC, rolls damage, applies it, and
  plays it out. Saving-throw spells roll the target's save. Nobody needs to
  know what AC is for the first session — it's shown when it matters.
* **Turns**: a turn bar shows whose turn it is (camera glides to them),
  what they've used (movement, action), and an End turn button. Monsters
  act on their own in guided mode, and with one click for a DM.
* **Initiative**: Start combat rolls it for everyone (heroes from their
  sheets) — no typing numbers.
* **Seeing**: fog of war fills in by itself from what the heroes can see
  (line of sight on the grid), so nobody paints fog by hand unless they
  want to. Hidden creatures stay hidden.
* **Doors**: click a door next to your hero to open or close it.
* **Info**: hover any creature for its card — health bar, conditions, AC
  (when known); health bars float over everyone in combat.
* **Camera**: follows your hero (toggle), one key back to your hero, one
  key for the whole scene; orbit, zoom, pan like the mtg table.

## Running a game (DM and guided)

* Drag monsters from the library straight into the world; they land where
  you drop them, facing the party.
* Right-click anything for its actions (hide, damage/heal, conditions,
  remove, make it act).
* Scene switches play as a short fade through black with the new place
  assembling, so a story beat feels like a cut.
* Everything the 2D board offers (build tool, fog tools, drawing, prep,
  story beats) keeps working; build paints into the 3D world live.

## Order of work

1. Engine (renderer, camera, post FX, loop) + world builder (floors, walls,
   props, lights, environments) for every built-in scene.
2. Figures: hero / NPC builder from `resolveLook`, monster archetypes,
   animation set.
3. Board integration: Map3D with MapCanvas's interface, 2D/3D switch,
   selection, click-to-move with paths, drag, pings, hover cards.
4. Combat QoL: targeted attacks/spells (server-resolved), turn bar,
   initiative for all, effects and numbers, 3D dice.
5. Auto fog (line of sight), doors.
6. Demo: one-origin build + tunnel, guided campaign ready to play.
7. DM tools in 3D (drag spawn, build, fog brush), then polish.

## Added after the first demo

- **Premade adventures** (`client/src/data/adventures.js`): The Lantern Road and
  Beneath Greywater, plus the first quest, in one format. *Play, no DM needed*
  runs them in guided mode (the app narrates, monsters act on their own, fights
  scale with party size via `minHeroes`). *Run it as DM* creates a DM campaign
  with the adventure's scenes, NPCs and one story beat per step (read-aloud,
  encounter, notes) ready in Prep.
- **Server-run monster turns** in guided games (and DM games with "Monsters act
  on their own"); `Begin!` rolls initiative for anyone who hasn't.
- **Table HUD** (`components/TableHud.jsx`, `styles/hud.css`), after the mtg
  table: party portraits top-left, your hero bar at the bottom (HP, AC, whose
  turn, End turn / Enter), icon tool rail, dice and chat tucked into corners
  (chat counts unread and peeks new lines), and a "⋯" menu for rules, guide,
  settings, 2D/3D and the invite link. Guided games hide the DM tools behind
  that menu.
- **Body** trait on looks (feminine / masculine / androgynous) in the portrait
  editor, set for the ready-made heroes and adventure NPCs; it decides default
  beards, hair and build in both the portrait and the 3D figure.
- Fog of war is one feathered layer that fades as you see more; drawings and
  the eraser work in 3D; left-drag picks a creature up and sets it down.

## DM toolkit, map making, sound

- **Secrets tool (T)** (`server/socket/dmTools.js`, `client/src/components/DmTools.jsx`):
  traps, hidden passages, chests, levers (linked to doors), notes, exits to
  other scenes, and events. Each has a trigger (walk onto it, use it, find it
  by searching, or only when the DM sets it off) and a list of effects
  (narrate, damage with a save, heal, loot, open doors, go to scene, spawn
  monsters, reveal fog). Players only receive objects they know about;
  passive Perception notices hidden ones nearby; the hero bar's Search button
  rolls Perception.
- **Patrols**: right-click a creature → patrol route; it walks the loop until
  it sees a hero (and starts a fight in no-DM games).
- **Table panel (crown)**: narrate or whisper, big titles, handouts with
  pictures, ask players for a roll, speak as an NPC (right-click it), show
  everyone your view; Mood: time of day, weather, light, music.
- **Build**: fill area, room, flood, copy/paste, 16 stamps, a raised dais
  (^) and a pit (o), Ctrl+Z undo, and generated dungeons, caves and forests.
- **Sound** (`client/src/audio/`): generated adaptive music (explore,
  tavern, sneak, tension, battle, boss, rest + stings), effects (CC0 samples
  in `client/public/sounds`, the rest synthesized), ambience per place and
  weather; music / effects / ambience each with volume and mute.

## Running it fast (DM quick tools, undo, templates)

- **Undo / redo** (`client/src/editHistory.js`): every edit the DM sends for a
  scene (painting, stamps, generated maps, placing / moving / hurting / hiding /
  removing creatures, doors, fog, secrets, drawings, mood, a reset) is
  remembered as the parts of the scene it can touch, per scene. Ctrl+Z,
  Ctrl+Shift+Z (or Ctrl+Y), and the arrows at the foot of the tool rail and in
  the build panel. Terrain goes back as a painted delta, the rest in one
  `restoreScene` message; heroes are never touched.
- **Prepared state and reset** (`server/socket/sceneTools.js`): a scene
  remembers how it was when the party first arrived (switch, a story beat, or
  the first fight there), or whenever the DM presses *Save as prepared*. *Reset*
  puts back creatures (HP, places, the fallen), doors, fog and chests / traps;
  anything built since stays built and heroes stay where they are. The
  snapshot never leaves the server (the DM sees only `prepAt`).
- **The DM pills** (top left, beside the party): *Scenes* (every scene, one
  click to go, new from a template), *Creatures* (HP −/+, conditions, hide,
  run a turn; an overlay that never pushes the map), *Quick* (`QuickDm.jsx`):
  a balanced fight by theme and party level (`data/encounters.js`, SRD 5.1
  creatures, the SRD 5.2 XP budget), one-click people with names and SRD
  stats, loot / traps / secrets scaled to the party, an ambush square, room
  stamps, new scenes from ten generated templates, clear a layer, fog
  shortcuts, duplicate / save / reset the scene. Right-click a square for a
  fight, a person or loot *there*; right-click a creature for HP and
  conditions in one small board, or another one like it.
- **Templates and quick campaigns** (`data/presets.js`, `data/mapKit.js`):
  tavern, crypt, forest clearing, cave, road ambush, throne room, dungeon
  corridor, dungeon, raider camp, ruins, each different every time, with their
  people, mood and read-aloud. A quick campaign (five stories) builds four
  scenes, a story beat each with its fight balanced for the party and a chest
  at the end, from *New campaign → A quick campaign* or Prep. Story beats can
  fill their fight in one click, and a beat's creatures now wait on the far
  side of the map from where the party comes in.
- **Layout rule**: a tool's options open as a flyout beside its button, the
  build panel lies over the map instead of shrinking it, and the DM's panels
  open under the pills beside the tool rail, so opening anything never moves
  anything else.

## Nothing is lost (auto-save, restarts, updates)

- **Everything saves itself.** Scene names and notes, every part of a story
  beat, the campaign name, a secret's name and its monsters, a hero's sheet,
  look and spells save a moment after you stop typing (`autosave.jsx`
  `useAutoSave`; at once on blur, close, leaving the table and page hide).
  The editors say *Saving… / Saved / Offline: your changes are kept*; their
  Save buttons became *Done* (the look keeps a *Revert*). Unsent text also sits
  in localStorage as a draft against the value it was typed over, and comes
  back if the page died first and nobody changed that field since. The
  builder keeps a half-made hero (*Start over* drops it); the DM's unsent
  narration and handout stay put; lobby sheets keep a draft against the
  server's `updatedAt`.
- **Edits wait until written** (`sync.js` outbox, in localStorage per tab id;
  the id rides the socket handshake and survives a reload but not a
  duplicated tab). The server remembers per room which of each tab's edits it
  has applied (`syncSeen`, saved in the same write as the edits), skips a
  resend it already has, and tells the tab `saved { seq }` after each write.
  Edits made while disconnected, or before the rejoin's full state, are only
  predicted and kept; after the rejoin whatever the server lacks is sent
  again in order, so each lands exactly once, also after a crash that lost
  what it had applied but not saved. Chat and rolls sent while away wait for
  the rejoin too. A full state carries the sync version (`_p`); a page that
  doesn't know it takes full states instead of patches and asks for the
  update banner.
- **The server saves a room 1.5 s after a change** (dirty-only, one write at
  a time per room; the 30 s timer stays as a backstop). SIGTERM/SIGINT write
  every room and then die by that signal (a clean stop for systemd); SIGUSR2
  writes every room and exits 75, which `Restart=on-failure` restarts.
  `deploy.sh` without root sends SIGUSR2 and waits up to 20 s for the exit
  before falling back to `kill -9`.
- **Updates.** The banner never reloads by itself. Its *Reload* sends every
  waiting field, waits up to 4 s for the server to write what's in flight
  (the rest goes again from the outbox), notes where you were
  (`uiContext.js`: open panels, prep tab, the scene or beat being edited,
  scroll, sheet tab, 3D camera, the builder or a hero's sheet in the lobby)
  and comes back there. A dropped connection shows *Reconnecting… your
  changes are kept*.

## Weak hardware

- **Quality tiers** (`world/engine.js` `TIERS`): high, good, fair, low, lowest.
  The engine compares each frame's interval with what it asked for (60 a
  second while something moves, 30 idle, 12 behind a dialog) and steps down
  when two seconds run ~45% over; it steps back up only after several busy
  windows at full speed, and a step up that doesn't hold doubles the wait.
  Each step drops what shows least first: pixel density on hi-dpi screens,
  bloom resolution and shadow-map size, then bloom, render scale, the weakest
  point lights, shadows. The tier is remembered per browser
  (`localStorage['dnd.w3.tier']`). Without bloom the scene draws straight to
  the canvas (no composer copy).
- **Figure detail**: every figure has a second build at half the segments
  (`kit.js` `DETAIL`, used by the Kit shapes and anatomy shells), made the
  first time the figure stands under ~80 px tall on screen and swapped in by
  `WorldView._lod`; distant idle figures are posed every other frame. Spell
  lights are two pooled lights (adding a light recompiles every material).
- **Hero previews** (`world/FigureStage.jsx`) share one offscreen WebGL
  context and hand each stage its frame (`transferToImageBitmap`), so the
  builder's two previews and the sheet's cost one context and one shader
  compile; a look change rebuilds the figure after the next frame.
- 2D: the battle map repaints its terrain only when the cells change; scene
  thumbnails cache their terrain; portraits redraw only when the look
  changes; dialogs don't blur what's behind them. The board, builder and
  sheet are separate downloads, fetched in the background after sign-in.

## Learning the table (DM training, practice round, handbook)

- **DM training ground** (lobby: *Learn to DM*; `client/src/training/dmCourse.js`,
  `components/Training.jsx`, `server/socket/training.js`): a sandbox campaign of
  its own (`room.training`), a blank workshop and a tavern, and two practice
  heroes sitting at it as members (`bot:1`, `bot:2`) who take their own turns in
  a fight. Four chapters, 21 one-line steps, about ten minutes, any order: build,
  fill, run a fight, tell the story. The coach rings the real button to press
  (the first of a step's selectors on screen, so a path of clicks leads itself),
  ticks the step when the server sees the DM do it (one socket middleware maps
  messages to steps, nothing else changed), and keeps out of the way of open
  panels. Skip, Again, Reset; *View as a player* shows the board as a practice
  hero's player gets it and lets the DM play that hero.
- **Practice round** (in a game: menu, *DM handbook & practice round*): a
  practice yard is added and the party taken there; each player gets one prompt
  at a time, only when it's relevant (walk, talk, roll, door, search, then in
  the sparring fight attack and a power, then the chest), with the button in the
  prompt itself where the flat map or a phone has none. The DM sees who has
  tried what and springs the fight. Ending it removes the scene, goes back, and
  puts every hero sheet back as it was (`practiceSnap`, server-only). Everyone
  gets a *Ready to play* summary.
- **DM handbook**: short searchable cards per tool and for a first session
  (session zero, pacing, the XP budget, premades), from the lobby and in game.
- State travels in the room view like everything else (`training`, `practice`,
  both small); the snapshot never leaves the server.
