# D&D Tabletop — Research Findings

Compiled 2026-07-09 from three research passes: (1) the mtg.ojee.net codebase, (2) D&D 5e rules
(verified against the SRD PDFs and live rules sources), (3) virtual-tabletop products and
beginner-onboarding patterns. This document is the factual basis for PLAN.md.

---

## 1. What D&D actually is

- One **Dungeon Master (DM)** narrates the world, plays all monsters/NPCs, and adjudicates rules.
  Everyone else is a **player** controlling one **player character (PC)**. Nobody "wins" — the DM
  is a referee-narrator, not an opponent.
- **The core loop**: DM describes the situation → players say what their characters do → dice
  decide uncertain outcomes → DM narrates results. Repeat.
- **Three pillars**: combat (tactical, turn-based, the most proceduralized), exploration
  (dungeons, traps, travel), social (talking, persuading). Pillars 2–3 run almost entirely on
  ability checks + rulings.
- A **session** = one 2–4h sitting. An **adventure** = one story arc. A **campaign** = a series of
  adventures over months. Party size norm: **3–5 players + DM**; encounter math assumes 4.

## 2. Dice & the core mechanic

- Polyhedral set: **d4 d6 d8 d10 d12 d20** + percentile **d100** (two d10s). Notation `NdX+M`.
- Everything funnels through one mechanic:
  **d20 + ability modifier + proficiency bonus (if proficient) vs a target number**
  - Ability check vs **DC** (Easy 10 / Medium 15 / Hard 20 / Very Hard 25)
  - Attack roll vs **AC** — meets it beats it
  - Saving throw vs effect DC
- **Advantage / disadvantage**: roll 2d20 keep higher / lower. Never stacks; adv + dis cancel to
  a straight roll. This is THE beginner concept to teach early.
- Nat 20 / nat 1 auto-hit+crit / auto-miss on **attack rolls** (and death saves). Crit = roll all
  damage **dice** twice (not modifiers).

## 3. Character sheet — full field inventory

Header: name, class & level, background, race, alignment, XP.

- **Six ability scores** (1–20 for PCs): STR, DEX, CON, INT, WIS, CHA.
  **Modifier = floor((score − 10) / 2)** → 8–9 = −1, 10–11 = +0, 12–13 = +1, 14–15 = +2,
  16–17 = +3, 18–19 = +4, 20 = +5.
- **Proficiency bonus by level**: 1–4 = +2, 5–8 = +3, 9–12 = +4, 13–16 = +5, 17–20 = +6.
- **Saving throws**: one per ability; each class is proficient in exactly 2.
- **18 skills** (bonus = ability mod + PB if proficient):
  STR Athletics · DEX Acrobatics, Sleight of Hand, Stealth · INT Arcana, History, Investigation,
  Nature, Religion · WIS Animal Handling, Insight, Medicine, Perception, Survival ·
  CHA Deception, Intimidation, Performance, Persuasion.
- **Passive Perception** = 10 + Perception bonus.
- **AC**: 10 + DEX unarmored; light armor = base + DEX; medium = base + DEX (max 2); heavy =
  fixed; shield +2.
- **Initiative** = DEX mod. **Speed**: 30 ft most races (dwarf/halfling/gnome 25).
- **HP** max/current/**temp** (temp doesn't stack, lost first). **Hit Dice** pool = 1 per level,
  spent on short rests (roll + CON each).
- **Death saves**: 3 successes = stable, 3 failures = dead (see combat).
- Attacks block (name, to-hit, damage dice + type), spellcasting block (DC, attack bonus, slots),
  equipment + coins (10 cp = 1 sp, 10 sp = 1 gp, 10 gp = 1 pp), personality traits / ideals /
  bonds / flaws, inspiration, features & traits, proficiencies & languages, conditions.

## 4. Character creation (2014 SRD path we implement)

1. **Race** — SRD 5.1: Hill Dwarf, High Elf, Lightfoot Halfling, Human (+1 all), Dragonborn,
   Rock Gnome, Half-Elf, Half-Orc, Tiefling (each with fixed ability increases + traits like
   darkvision, Lucky, breath weapon).
2. **Class** — all 12 SRD classes, one SRD subclass each:

   | Class | Hit die | Primary | Saves | SRD subclass |
   |---|---|---|---|---|
   | Barbarian | d12 | STR | STR CON | Berserker |
   | Bard | d8 | CHA | DEX CHA | College of Lore |
   | Cleric | d8 | WIS | WIS CHA | Life Domain |
   | Druid | d8 | WIS | INT WIS | Circle of the Land |
   | Fighter | d10 | STR/DEX | STR CON | Champion |
   | Monk | d8 | DEX+WIS | STR DEX | Open Hand |
   | Paladin | d10 | STR+CHA | WIS CHA | Devotion |
   | Ranger | d10 | DEX+WIS | STR DEX | Hunter |
   | Rogue | d8 | DEX | DEX INT | Thief |
   | Sorcerer | d6 | CHA | CON CHA | Draconic |
   | Warlock | d8 | CHA | WIS CHA | Fiend |
   | Wizard | d6 | INT | INT WIS | Evocation |

3. **Background** — 2 skills + gear + roleplay feature. SRD 5.1 has only Acolyte; SRD 5.2
   (also CC-BY) adds Criminal, Sage, Soldier → we ship those 4.
4. **Ability scores** — Standard array **15 14 13 12 10 8** (beginner default) · Point buy
   (27 points; 8=0 9=1 10=2 11=3 12=4 13=5 14=7 15=9) · Rolled (4d6 drop lowest ×6).
5. **Equipment** — class starting package + background gear; compute AC.
6. **Level-1 HP** = max hit die + CON mod.

## 5. Combat rules (the subsystem the app must teach + support)

- **Initiative**: everyone rolls DEX check once; fixed descending order; a round ≈ 6 s.
- **A turn** = Movement (splittable) + 1 Action + 1 Bonus Action (if granted) + 1 free object
  interaction; 1 Reaction per round (opportunity attacks, *shield*).
- **Actions**: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search,
  Use an Object.
- **Attack**: d20 + ability + PB vs AC → damage dice + ability mod, typed. Resistance halves,
  vulnerability doubles, immunity zeroes.
- **Cover**: +2 AC/DEX-saves (half), +5 (three-quarters), untargetable (total).
- **Opportunity attack**: reaction melee attack when a creature leaves your reach (Disengage
  avoids it).
- **Grid**: 1 square = **5 ft**; Medium = 1 square, Large 2×2, Huge 3×3; difficult terrain ×2;
  standard diagonal = 5 ft.
- **15 conditions**: blinded, charmed, deafened, frightened, grappled, incapacitated, invisible,
  paralyzed (hits within 5 ft auto-crit), petrified, poisoned, prone, restrained, stunned,
  unconscious, exhaustion (6 levels).
- **Concentration**: one effect at a time; CON save DC max(10, dmg/2) when damaged.
- **0 HP** → unconscious + dying → **death saves**: flat d20, 10+ success; 3 successes stable /
  3 failures dead; nat 1 = 2 failures, nat 20 = wake with 1 HP; damage at 0 = a failure. Any
  healing returns you to consciousness.
- **Rests**: short (1h, spend Hit Dice) / long (8h, full HP, half Hit Dice back, slots back,
  1/24h).

## 6. Spellcasting

- Levels 0–9; **cantrips** at-will (scale at character levels 5/11/17); leveled spells consume a
  **slot** of that level or higher (upcasting).
- Full casters share one slot table (L1: 2×1st … L5: 4/3/2 … L20: 4/3/3/3/3/2/2/1/1); paladin/
  ranger are half-casters from L2; **warlock** has 1–4 same-level slots refreshed on **short**
  rest.
- Prepared casters (cleric/druid: mod + level from whole list daily; wizard: from spellbook;
  paladin: mod + half level) vs known casters (bard/sorcerer/warlock/ranger: fixed list).
- **Spell save DC = 8 + PB + casting mod**; **spell attack = PB + casting mod**. Casting ability:
  INT wizard, WIS cleric/druid/ranger, CHA bard/sorcerer/warlock/paladin.
- Rituals (+10 min, no slot), components V/S/M (focus covers un-costed M), concentration per §5,
  one leveled spell per turn if you also cast a bonus-action spell.

## 7. Leveling

- **XP thresholds** (cumulative): L2 300, L3 900, L4 2 700, L5 6 500, L6 14 000, L7 23 000,
  L8 34 000, L9 48 000, L10 64 000 … L20 355 000.
- **Milestone leveling** (DM awards levels at story beats) is the dominant real-table method →
  our default, XP optional.
- On level-up: +1 Hit Die; HP += fixed average (d6→4 d8→5 d10→6 d12→7) + CON (beginner default)
  or roll; PB per table; class features; slots/spells; **ASI at 4/8/12/16/19** (+2 or +1/+1).

## 8. Monsters & the DM side

- Stat block: AC, HP (avg + formula), speeds, six abilities, saves/skills,
  vulnerabilities/resistances/immunities, senses + passive Perception, languages, **CR + XP**,
  traits, actions (Multiattack), reactions, legendary actions.
- XP by CR: 1/8 = 25, 1/4 = 50 (goblin), 1/2 = 100, 1 = 200, 2 = 450, 3 = 700 …
- Encounter building (2024 simplified method — no multipliers): XP budget = per-PC value × party
  size; L1 low/moderate/high = 50/75/100 per PC. Rule of thumb: no single monster with
  CR > party level at low levels.
- Adventuring day: ~6–8 medium encounters between long rests by the book; real tables run fewer.

## 9. Licensing & data (what we can legally ship)

- **SRD 5.1** (2014 rules, 403 pp) is **CC-BY-4.0** since Jan 2023: all 12 classes (1 subclass
  each), 9 races, 319 spells, ~330 monsters, ~240 magic items, equipment, conditions, 1
  background, multiclassing. NOT included: beholders/mind flayers/etc., setting names, most
  subclasses, named-wizard spell names (*Bigby's* → *Arcane Hand*).
- **SRD 5.2.1** (2024 rules, 364 pp, Apr–May 2025) also **CC-BY-4.0**: adds Goliath/Orc, 4
  backgrounds, 17 feats, weapon mastery, ~338 spells, 2024 glossary. Aasimar/artificer excluded.
- Both require a **verbatim attribution paragraph** (shipped in our credits page + README); no
  other WotC attribution allowed; "compatible with fifth edition / 5E compatible" statements are
  permitted. The D&D logo/trade dress may NOT be used.
- **Data source**: `github.com/5e-bits/5e-database` (the dnd5eapi.co dataset, MIT code / CC-BY
  data) has clean JSON for SRD 5.1: 319 spells, 334 monsters, 12 classes with **structured
  per-level progression tables** (`/levels`), races, equipment, conditions, skills. Open5e's v2
  API covers SRD 5.2 but with weaker class-progression structure. **Decision: vendor the 5e-bits
  2014 JSON at build time** (no runtime dependency on third-party APIs), layer 5.2 backgrounds by
  hand.
- 2014 vs 2024 for a new player: core d20 math is identical; ~10 subsystems differ (surprise,
  hiding, exhaustion −2×level on d20s, grapple = save vs 8+STR+PB, Heroic Inspiration = reroll,
  action renames, weapon mastery, background ASIs + origin feats, subclass-at-3, encounter
  budgets). We implement the 2014 SRD engine (best data, matches most learning material) and
  document the 2024 deltas in the guide.

## 10. VTT market — what exists and what wins

- **Shared standard feature set**: scenes/maps, snap-to-grid tokens, fog of war, dice roller with
  `NdX+M` notation, character sheets, initiative tracker, chat with roll commands, handouts,
  measurement, ping, drawing, GM-vs-player permissions.
- **Roll20**: browser standard, 70 px/square convention, huge but clunky/dated; dynamic lighting
  paywalled. **Foundry** ($50, self-hosted): most powerful, hosting/setup hostile to novices.
  **Fantasy Grounds**: deepest automation, steepest learning curve. **D&D Beyond Maps**: simple
  2D official tool (free since Sept 2025); WotC's 3D "Sigil" VTT effectively died in 2025 —
  simple 2D execution beat 3D ambition. **Tabletop Simulator**: physics jank, long setup.
- **Owlbear Rodeo is the simplicity benchmark**: join via bare link in under a minute, dry-erase-
  mat metaphor, anti-feature-bloat policy (extensions for everything optional), visual dice tray
  with **advantage/disadvantage as first-class buttons**, deterministic shared 3D dice, free tier
  goodwill. It deliberately has NO character sheets / rules help.
- **The market gap we occupy**: rules-aware but beginner-first — Owlbear-simple table + SRD-
  powered sheets/monsters + a built-in guided first adventure that needs **no experienced DM**
  (no mainstream VTT has this).
- **Dice UX synthesis**: click a sheet stat to roll it; adv/dis buttons; per-die breakdown in
  chat; GM/private toggle; notation available but never required. (Roll20 notation: `2d20kh1+5`
  = advantage.)
- **Battle-map convention**: 5 ft = 1 square = 70 px (Roll20 default; Foundry 100 px). Grid is
  easier than theater-of-the-mind for brand-new players — positioning and AoE become visible.
- **Tutorial patterns that work** (BG3, Solasta, Root, starter sets): progressive disclosure (one
  concept at the moment it matters), scripted guided first turn, rules cards on first occurrence,
  redundant reference (tutorial + tooltips + cheat sheet), pregens with 2–3 highlighted abilities,
  "learn by playing" not "read a manual". D&D starter sets teach via **pregens + boxed read-aloud
  text + just-in-time sidebars**; the 2025 Heroes of the Borderlands set componentizes everything
  into cards/boards — the model to digitize.
- **Canonical intro-dungeon shape** (Delian Tomb / starter sets): town hook → travel/skill beat →
  easy guarded-entrance combat (2–3 goblins) → trap/riddle (saves + checks) → optional secret
  room → boss + minions → treasure + level-up. Level 1, 60–120 min, SRD monsters only.
- **Asset licensing**: bundle only CC0/CC-BY (Kenney CC0 packs, game-icons.net CC-BY,
  @3d-dice themes CC0, own SVG art); 2-Minute Tabletop is CC-BY-**NC** (users may import, we
  can't bundle in anything commercial); DMs Guild free adventures are NOT reusable; Forgotten
  Adventures/Devin Night are personal-use → user-import only. Watabou's one-page-dungeon
  generator output is free to use; drawing our own SVG maps dodges licensing entirely.

## 11. The mtg.ojee.net codebase (architecture we inherit)

- **Server**: Node/Express 5 + Socket.IO 4 + Mongoose. Cookie-session auth (bcryptjs + uuid
  session tokens in Mongo with TTL, `httpOnly SameSite=None Secure` cookie, `trust proxy`).
- **Game state**: in-memory `Map` of rooms (authoritative) + 30 s autosave to Mongo + TTL expiry;
  per-viewer sanitized state; **80 ms debounced full-state broadcast + append-only deltas**
  (action log, chat, position updates); 10 s client staleness watchdog; undo via JSON snapshot
  stack; spectator gating via `socket.use()` allowlist; 6-char room codes (no 0/O/1/I).
- **Client**: CRA React 19, hand-rolled routing (no react-router at runtime), single shared
  socket (`autoConnect:false`), fetch wrapper, native HTML5 drag-drop + custom long-press touch
  drag, portals for menus/dialogs/previews, localStorage-persisted panel positions, dice as
  server-rolled `rollResult` broadcast with animated toast.
- **Style tokens**: near-black ramp `#050505→#252525`, borders `#2a2a2a/#3a3a3a/#555`, text ramp
  `#e8e8e8/#b0b0b0/#808080`, single warm-gold accent `#d4af6f`, danger `#b04444`; Cinzel display
  serif + EB Garamond body; 2–4 px radii; deep shadows; gold glow on active turn.
- **Deploy**: static client dir served by nginx (`try_files → index.html`) + node service proxied
  at `*-api.ojee.net` with websocket upgrade headers; systemd unit per app; MongoDB shared on the
  box; Cloudflare in front.

### SRD attribution (ships verbatim in-app)

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards
> of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document.
> The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License
> available at https://creativecommons.org/licenses/by/4.0/legalcode.

> This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards
> of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under
> the Creative Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.
