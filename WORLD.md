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
* **Creatures**: heroes are assembled from `resolveLook()` — skin, hair
  colour and style, beard, eyes, headwear, build, ears and race features
  (horns, tusks, snout, antlers, cat ears, mushroom cap, clockwork plating)
  plus class garb, trim, outfit and a class weapon. Change the portrait,
  the figure changes. NPCs use the same system. Monsters use the 30
  creature archetypes (rat, wolf, spider, goblinoid, skeleton, ghost,
  dragon, ooze, golem…) with sizes from the token.
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
