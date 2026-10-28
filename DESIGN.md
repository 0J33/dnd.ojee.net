---
name: dnd.ojee.net
description: A table in the Gilded Flagon. Everything you use is an object on the table or the wall.
colors:
  oak-deep: "#0b0604"
  oak-base: "#120b07"
  oak-panel: "#1a100a"
  oak-panel-2: "#21150d"
  oak-elev: "#2b1b11"
  oak-hover: "#382416"
  oak-border-soft: "#34231a"
  oak-border: "#4a3222"
  oak-border-strong: "#6a4a2e"
  board-edge: "#4a3020"
  candle-text: "#f2e6cc"
  candle-text-mid: "#cdb894"
  candle-text-dim: "#a68f6a"
  candle-text-faint: "#806b4e"
  brass: "#cfa75b"
  brass-bright: "#ebcb88"
  brass-dim: "#8f703f"
  brass-plate: "#c99d52"
  brass-plate-edge: "#6e4f22"
  brass-ink: "#2a1906"
  wax: "#b8402f"
  wax-deep: "#8a2519"
  wax-text: "#fbe3d8"
  danger: "#a8322a"
  danger-bright: "#e0624e"
  ember: "#b8372a"
  success: "#7da35f"
  info: "#6a93b0"
  magic: "#9a88df"
  paper: "#e9dcbc"
  paper-panel: "#eadcbc"
  paper-panel-2: "#efe3c7"
  paper-edge: "#b89a68"
  ink: "#2a1b0f"
  ink-mid: "#4b3520"
  ink-dim: "#6a5034"
  ink-faint: "#806546"
  ink-red: "#7a2a14"
  ink-sepia: "#7a3f0c"
  ink-brass: "#8c5418"
  slate: "#262b2e"
  chalk: "#f4f7f6"
  field-inlay: "#0e0805"
typography:
  display:
    fontFamily: "'IM Fell English SC', 'IM Fell English', Georgia, serif"
    fontSize: "clamp(2rem, 5vw, 2.8rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  headline:
    fontFamily: "'IM Fell English SC', 'IM Fell English', Georgia, serif"
    fontSize: "clamp(1.35rem, 2.7vh, 1.7rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.02em"
  title:
    fontFamily: "'IM Fell English SC', 'IM Fell English', Georgia, serif"
    fontSize: "1.12em"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.04em"
  script:
    fontFamily: "'IM Fell English', Georgia, serif"
    fontSize: "1.08rem"
    fontWeight: 400
  body:
    fontFamily: "'Alegreya', Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "'Alegreya Sans SC', 'Alegreya', sans-serif"
    fontSize: "0.86em"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  notice: "2px"
  sheet: "3px"
  sm: "4px"
  md: "5px"
  hud: "8px"
  seal: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.oak-elev}"
    textColor: "{colors.candle-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  button-default-hover:
    backgroundColor: "{colors.oak-hover}"
    textColor: "{colors.brass-bright}"
  button-primary:
    backgroundColor: "{colors.brass-plate}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
  button-danger:
    backgroundColor: "{colors.wax}"
    textColor: "{colors.wax-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  button-danger-hover:
    backgroundColor: "{colors.wax-deep}"
  wax-seal-button:
    backgroundColor: "{colors.wax}"
    textColor: "{colors.wax-text}"
    rounded: "{rounded.seal}"
    size: "30px"
  field-oak:
    backgroundColor: "{colors.field-inlay}"
    textColor: "{colors.candle-text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
  field-paper:
    backgroundColor: "{colors.paper-panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
  quest-notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.notice}"
    padding: "20px 18px 16px"
  hero-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    width: "clamp(178px, 15.4vw, 226px)"
    height: "clamp(240px, 44vh, 340px)"
  campaign-plaque:
    backgroundColor: "{colors.oak-panel}"
    textColor: "{colors.brass-bright}"
    rounded: "{rounded.sm}"
    padding: "11px 13px 10px"
    width: "248px"
  slate:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.chalk}"
    typography: "{typography.script}"
    rounded: "{rounded.sheet}"
    width: "236px"
  tab-active:
    textColor: "{colors.brass-bright}"
    typography: "{typography.label}"
---

# Design System: dnd.ojee.net

## Overview

**Creative North Star: "The Tavern Table"**

You sit down at a table in the Gilded Flagon, and everything you use is an object on that table or on the wall. The system has no abstract surfaces. Each element is made of one of three materials: **oak** (the table, and every board that holds controls: the sign bar, dialogs, menus, the game HUD), **paper** (documents you read and write on: hero sheets, quest notices, the character sheet, the builder, the guide, the story note, handouts) or **slate** (the chalk board for a friend's code). **Brass** is what you press and **red wax** is what destroys. One candle lights the room, so light is warm, comes from the middle of the table and fades to black at the edges.

The materials are real raster textures (`/tex/oak.webp`, `paper.webp`, `slate.webp`, `brass.webp`), drawn from periodic noise by `client/scripts/make-textures.py` so every tile repeats without a seam. Gradients sit on top of the textures to darken oak enough to hold text, to burn the edges of paper and to light brass from above. Objects sit at small tilts and settle into place when they arrive. The home screen is one desktop viewport with no page scroll. On phones one part of the table fills the screen at a time.

The world rejects a dashboard of cards and a book spread. A notice is pinned paper with an iron tack, not a card with a header. A campaign is a wooden plaque, not a row in a table.

**Key Characteristics:**
- Three materials (oak, paper, slate) and two fittings (brass, wax). Every surface is one of them.
- Warm candle light from the middle of the table, falling to black at the edges.
- Real textures with gradient light on top. Never flat color fills that stand in for a material.
- Small tilts and settle-in motion on paper objects. Boards and controls stay square.
- Typography from early modern print: IM Fell small caps for names and titles, Alegreya for reading, Alegreya Sans SC for anything you press.

## Colors

A warm, low-key palette of oiled oak lit by candle, with brass and red wax as the only accents. Inside a paper scope every token flips to inks on rag paper.

### Primary
- **Candlelit Brass** (`brass`, with `brass-bright` and `brass-dim`): the press color. It is the textured plate behind every primary button, the color of carved headings and plaque names on oak, the active tab underline, the checked checkbox, the scrollbar rail and the caret. Its glow (`rgba(235, 190, 110, 0.32)`) is the only hover halo in the system.
- **Brass Plate** (`brass-plate`, edge `brass-plate-edge`, text `brass-ink`): the base under the brass texture on primary buttons, with dark-brown engraved text.

### Secondary
- **Red Wax** (`wax`, `wax-deep`, text `wax-text`): destruction only. Danger buttons, the round wax seal that retires a hero or deletes a campaign, the "Dmg" button on the sheet. On the home table it is the one thing that destroys.
- **Seal Wax** (radial `#e27a48` to `#7a2a10`, drawn in the WaxSeal SVG): the poured seal on the first quest. It is decoration, not a control, and it desaturates once that quest has started.

### Tertiary
- **Ink Red** (`ink-red`): the rubric ink on paper. Paper headings, hero names, quest titles, the drop cap of the story narration, "Your move" in the story note, the faces and pips of the bone dice.
- **Sepia Ink** (`ink-sepia`, `ink-brass`): what brass turns into on paper. Links, link-buttons, the focus ring and the active-tab underline inside a paper scope.

### Neutral
- **Oak ramp** (`oak-deep` through `oak-hover`): the room behind the table (`oak-deep`) up to a lit board (`oak-elev`) and its hover (`oak-hover`). Boards always use the textured `--board` (oak under a 46 to 60% dark wash), not a flat panel color.
- **Oak borders** (`oak-border-soft`, `oak-border`, `oak-border-strong`, `board-edge`): the seams between boards. `board-edge` is the fixed edge of every panel, modal, menu and HUD board.
- **Candle text** (`candle-text`, `-mid`, `-dim`, `-faint`): parchment-colored text on oak. Inside boards, `-dim` and `-faint` are raised (`#ae976f`, `#8d7756`) to keep contrast against the dark wash.
- **Rag paper** (`paper`, `paper-panel`, `paper-panel-2`, edge `paper-edge`): the paper texture's base color and its two panel tones.
- **Inks** (`ink`, `ink-mid`, `ink-dim`, `ink-faint`): text on paper.
- **Slate and chalk** (`slate`, `chalk`): only on the friend's-code slate and on the chalked campaign codes on plaques.
- **Field inlay** (`field-inlay`): the dark sunken well of a field cut into oak.
- **Status** (`success`, `info`, `magic`, `danger-bright`): game semantics only (a live table, temp HP, spell effects, damage). Each has a darker paper-scope variant.

### Named Rules
**The Brass Presses, Wax Destroys Rule.** A control that commits an action is brass. A control that deletes, retires or deals damage is red wax. No other accent marks an action, and wax never marks anything that is not destructive.

**The Scope Flip Rule.** Paper is a token scope, not a separate palette. A paper surface re-points the same custom properties (`--text` becomes ink, `--gold` becomes sepia ink, `--bg-panel` becomes rag). Components read the tokens and take the right material from their scope. Do not hard-code oak colors into a component that can sit on paper.

**The One Candle Rule.** Light is warm and comes from the middle of the table. The room's radial vignette, the breathing candlelight on the home table and the lit top edge of every board (`inset 0 1px 0 rgba(255, 214, 160, 0.07)`) all assume one warm source above. No cool glows and no colored light from other directions.

## Typography

**Display Font:** IM Fell English SC (with IM Fell English, Georgia, serif)
**Script Font:** IM Fell English italic (with Georgia, serif)
**Body Font:** Alegreya (with Georgia, serif)
**Label Font:** Alegreya Sans SC (with Alegreya, sans-serif)

All four are self-hosted through @fontsource. `font-synthesis: none` is set globally, so only the shipped weights (Alegreya 400/400i/500/700, Alegreya Sans SC 500/700, IM Fell 400/400i) ever render.

**Character:** IM Fell is the printed small caps of a 17th-century broadsheet, worn and a little uneven, used for names and titles. Alegreya is a calligraphic book face that stays readable at length. Alegreya Sans SC is the stamped small-cap label on a brass plate or a peg.

### Hierarchy
- **Display** (IM Fell SC 400, clamp(2rem, 5vw, 2.8rem), line-height 1): the site name on the tavern door. Nowhere else.
- **Headline** (IM Fell SC 400, clamp(1.35rem, 2.7vh, 1.7rem), 1.15): the first quest's title. Other quest titles use clamp(1.1rem, 2vh, 1.3rem), hero names 1.22rem, the brand on the sign 1.4rem, carved table labels ("Your heroes", "Quest board", "Your tables") clamp(1.15rem, 1.9vh, 1.4rem).
- **Title** (IM Fell SC 400, 1.12em, 0.04em tracking): dialog and panel headers, in brass on oak and ink red on paper. The same face covers topbar titles, plaque names (1.06rem) and choice-card headings (1.05rem).
- **Script** (IM Fell English italic, 1.08rem): chalk on slate only, meaning the slate's label and placeholder.
- **Body** (Alegreya 400, 1rem, 1.35 on notices): all reading text. Metadata, hints, empty states, the signed-in name and the footer are set in Alegreya *italic*, which plays the "pencilled note" role. Notice lines are capped at 56ch and notes at 46ch.
- **Label** (Alegreya Sans SC 700, 0.86em, 0.06em tracking, never `text-transform`): buttons, tabs, field labels (0.82em, 0.08em), menu headers (0.78em), stat numerals (tabular figures). The small caps come from the font, not from uppercasing.

### Named Rules
**The Small Caps Are Cut, Not Forced Rule.** Small capitals come from the SC fonts. Do not use `text-transform: uppercase` with wide tracking to fake them. The only uppercase text in the system is a typed campaign code on the slate.

**The Italic Is a Pencil Note Rule.** Alegreya italic marks secondary information: metadata, hints, empty states, the footer, "click to roll". Do not use it for emphasis inside body copy.

## Layout

**Home (desktop, 761px and up):** one viewport, `100dvh`, no page scroll. A three-row grid holds the sign (an oak bar), the table and the footer. The table is a two-column grid (`1.05fr` / `1fr`) with areas `party board` over `edge edge`. Gaps are clamp(14px, 2.4vh, 28px) by clamp(20px, 3vw, 52px) and padding scales with viewport height, so the whole table fits rather than scrolls. Hero sheets fan out in an auto-flow column grid whose columns are 34px narrower than a sheet, so sheets overlap like a hand of cards and overlap more as heroes are added. The quest board is a two-column notice grid, with the first quest spanning both columns. The near edge holds a horizontally scrolling row of plaques, with the slate set in the right column. The candle and dice tray are absolutely placed props, hidden below 1100px wide or 700px tall.

**Short or narrow desktops:** below 760px tall the sheets shorten to 236px and secondary notice metadata drops out. Between 761 and 1100px wide the notice board goes to one column and secondary notice lines hide.

**Phones (760px and below):** one zone (Quests, Heroes or Tables) owns the screen, switched by three full-width pegs (46px tall) in an oak bar at the bottom that respects the safe-area inset. Sheets sit in a 2-up grid with alternating ±1° tilts. Notices go single column, with the seal moved above the first quest's title. The slate moves to the top of the Tables zone. Touch targets are at least 40 to 46px.

**Rhythm:** working gaps step 6, 8, 12, 16 and 24px. Inner padding of paper objects is about 14 to 24px, scaled with `vh` on the home table.

**Breakpoints in use:** 1100px (props, notice columns), 760/761px (phone versus desktop table), plus component-level steps at 640px and 820px in the older base sheets.

## Elevation & Depth

Depth is physical. Objects cast shadows onto the table, boards have a lit top edge and a dark seam, fields are sunk into the wood, and paper lifts when you reach for it. Every shadow is soft, warm-black and falls downward from the one candle. Hover lifts paper (sheets rise 12px and straighten to 0°, notices rise 3px) and deepens its shadow. Brass gains a warm halo on hover. Pressing a button pushes it down 1px into an inset shadow.

### Shadow Vocabulary
- **Board** (`0 10px 28px -6px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,214,160,0.07), inset 0 0 0 1px rgba(0,0,0,0.35)`): panels and every oak board.
- **Modal** (`0 34px 80px -10px rgba(0,0,0,0.92), inset 0 1px 0 rgba(255,214,160,0.08), inset 0 0 0 1px rgba(0,0,0,0.4)`): dialogs over a `rgba(6,3,1,0.72)` overlay with a 2px blur.
- **Pop** (`0 16px 40px -6px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,214,160,0.07)`): context menus and floating HUD boards (hero bar, tool dock, dice tray, chat).
- **Paper** (`0 2px 3px rgba(20,10,4,0.35), 0 18px 34px -12px rgba(0,0,0,0.8)`): every paper object lying on the table.
- **Inlay** (`inset 0 2px 5px rgba(0,0,0,0.6)`): fields and die wells cut into oak.
- **Brass glow** (`0 0 20px -4px rgba(235,190,110,0.32)`): hover on brass, the selected choice card, and the hero board on your turn.

### Named Rules
**The Cast, Not Offset Rule.** Shadows are soft, blurred and fall downward. No hard-edged offset shadows and no flat outline "lift". This world is lit by a candle, not printed.

**The Lit Edge Rule.** Every oak board and wooden button carries a 1px warm top highlight (`inset 0 1px 0 rgba(255,214,160,0.07 to 0.14)`). That edge is what makes a dark panel read as a lit board instead of a hole.

## Shapes

Shapes are nearly square, the way cut wood and paper are. Paper corners are almost sharp (2px on notices, 3px on sheets and the slate). Boards, plaques and fields use 4 to 5px. HUD boards that float over the map soften to 6 to 8px. Fully round shapes are for physical round things: the wax seal button, the iron tack, the connection dot, avatar frames, the quill well.

Paper objects tilt. Hero sheets cycle through −4°, 2.6°, −1.8°, 3.4°, −2.8° and 1.6°. Notices cycle through −0.6°, 1.3° and −1.1°. The slate sits at −1° and the dice tray at −4°. Tilt is applied through a `--tilt` custom property, so motion can straighten it. Boards, bars, dialogs and controls never tilt.

The hero sheet carries a printed double rule inside its edge: two inset ink-red hairlines at 7px and 10px. That frame marks a character sheet. The slate has a 7px oak frame. The quest board is a recessed oak frame with an inset 9px rail. Dashed borders mean "blank, make one": the blank hero sheet, the new-campaign plaque and the quill well.

## Components

### Buttons
Every button is a fitting on the table: a wooden peg, a brass plate or a blob of wax.
- **Shape:** gently squared (5px).
- **Default (peg):** dark oak gradient (`#3a2617` to `#26180e`), a 1px `#5a3d25` border, the lit top edge and a small drop shadow. Label face. On hover the border turns brass-dim, the text turns brass-bright and a faint brass halo appears.
- **Primary (brass plate):** the brass texture at 260px, lit by a top-down gradient, over `brass-plate`, with a `brass-plate-edge` border and engraved `brass-ink` text that has a light text-shadow below it. Hover brightens the plate and adds the brass glow. Press drops 1px.
- **Danger (red wax):** a `wax` to `wax-deep` gradient with `wax-text` and a pinkish top highlight.
- **Wax seal (icon):** a 30px round seal (36px on coarse pointers) with a radial wax gradient and a trash icon. It sits on a hero sheet's corner and appears on hover or focus (always visible on touch), or inline on a plaque.
- **Ghost:** transparent with an oak border and mid text. Used for Cancel.
- **Link:** Alegreya italic, underlined in translucent brass with a 3px offset. Used for secondary actions such as "Start fresh" and "Run it as DM". On paper it is sepia, and its destructive form is wax-red.
- **On paper:** a plain button becomes an inked outline (a translucent cream fill with a brown hairline). Brass and wax stay exactly as they are.

### Chips
- **Style:** label face 500, a translucent dark fill and a strong oak border. On paper: a cream fill, a brown hairline and ink-mid text. The `gold` variant is sepia on a brass tint.
- **Chalk code:** campaign codes on plaques are short slate strips in label 700 with 0.16em tracking and chalk text.

### Cards / Containers
- **Boards (panels, dialogs, menus, HUD):** the textured `--board` background, a `board-edge` border, 5px corners and the Board, Modal or Pop shadow. Header rules are brass at 18% opacity. Titles are brass-bright with a dark text-shadow.
- **Paper documents (sheet, builder, guide, story note, handouts, the sign-in notice):** the paper texture at 512px over `paper` with a burned radial vignette, a `paper-edge` border, the Paper shadow and an inner cream hairline. Everything inside reads the flipped tokens.
- **Choice cards** (mode, pack, pregen, option): buttons that read in the body face. Their heading is set in IM Fell, and the selected state is a brass border with the brass glow.

### Inputs / Fields
- **On oak:** a sunken `field-inlay` well with an oak border and the Inlay shadow. Body face.
- **On paper:** written on the sheet. A cream wash at 45%, a brown hairline and a light inset. The select chevron is an inline SVG in ink-dim.
- **Focus:** the border turns brass (sepia on paper) plus a 3px ring of the same color at 16 to 18%.
- **On slate:** no box. A 2px dashed chalk underline, the code in label 700 at 1.25rem with 0.28em tracking, and a script placeholder.
- **Error:** Alegreya italic in wax-red (`#9a2a1c` on paper).

### Navigation
- **Sign bar:** an oak board across the top with the dragon mark and the brand in IM Fell. Pegs on the right (Guide, sign out), and the signed-in name in italic with a connection dot that glows green when connected.
- **Tabs:** label face with no fill. Inactive tabs are dim and the active tab is brass-bright with a 2px brass underline (ink red with a sepia underline on paper).
- **Phone zone pegs:** three equal pegs in a bottom oak bar. The active peg looks pressed in (inset shadow, brass-dim border, brass-bright text).

### Quest Notice (signature)
Pinned paper on the recessed oak quest board. A 13px iron tack is centered at the top, the corners are 2px, the notice tilts and pins in from above (`th-pin`, 0.55s). The title is IM Fell in ink red, followed by one body line, italic metadata and actions (one brass button plus link-buttons). The first quest spans the board, is larger, and carries the drawn wax seal with a pressed d20, which stamps in on load.

### Hero Sheet (signature)
A paper character sheet with the double ink-red frame. It shows the hero's drawn portrait (92px), the name in IM Fell ink red, an italic level/race/class line and a footer rule with HP, AC and passive Perception in label numerals with icons. Sheets are dealt in on load (`th-deal`, staggered 50ms) and rise and straighten on hover.

### Campaign Plaque (signature)
A wooden plaque, 248px wide, cut from darker oak with a brass name, a chalk code with its mode, and an italic line saying who is there. A live table gets a green border and glow. "New campaign" is a dashed brass outline.

### The Slate (signature)
A chalk slate in a 7px oak frame, tilted −1°, with a script label and a chalk-underline input. It is used only for entering a friend's code.

### Table Props
A candle in a brass dish and a felt-lined dice tray holding bone dice, drawn as inline SVG. The flame and its halo breathe (2.6s, 1.9s and 3.1s loops) and the table's candlelight flickers over 5.2s. All of it stops under `prefers-reduced-motion`. In the game HUD the dice buttons repeat the same bone-and-red-ink dice in sunken wells.

### Story Note (game HUD)
The tutorial panel is a paper document over the map. Narration opens with an IM Fell ink-red drop cap. Rules sit in a ruled brown-ink box. "Your move" is a sticky sepia-tinted box that never scrolls out of view.

### Motion
Arrival uses `cubic-bezier(0.16, 1, 0.3, 1)`. Dialogs and the builder settle in (0.32s, rising 14px). Paper deals or pins. Hover transitions run 0.3 to 0.4s on paper and 0.15s on controls. Ambient motion is limited to the candle and stops for reduced motion.

## Do's and Don'ts

### Do:
- **Do** make every new surface one of the three materials. Controls and chrome go on an oak board (`--board`). Anything read or written goes in a paper scope (`.paper`), which flips the tokens for you.
- **Do** use brass (`.primary-btn`) for the one action that commits, and red wax (`.danger-btn` or the round seal) for anything that deletes, retires or deals damage.
- **Do** set names and titles in IM Fell English SC, reading text in Alegreya, metadata in Alegreya italic, and anything pressable in Alegreya Sans SC 700.
- **Do** give paper objects a small tilt through `--tilt` and let hover straighten and lift them. Keep boards and controls square.
- **Do** cast soft downward shadows from the Shadow Vocabulary, and give every oak board its warm 1px lit top edge.
- **Do** keep the desktop home table to one viewport with no page scroll, and give phones one zone at a time with pegs at the bottom.
- **Do** show every hero by their drawn portrait, everywhere a hero appears.
- **Do** take icons from the shared ojee.net icon set as inline SVG components (`Icons.jsx`).
- **Do** keep the licenses and credits screen (sources, OGL text, Section 15) reachable from the footer.
- **Do** stop all ambient motion under `prefers-reduced-motion`.

### Don't:
- **Don't** use religious symbols anywhere: no crosses, holy symbols, mitres or halos in art, icons, seals or tiles.
- **Don't** add rules content that is not open-licensed (SRD 5.1/5.2 and OGL 1.0a via Open5e only). No non-SRD Wizards of the Coast material, trademarks or logos.
- **Don't** use text glyphs or emoji as icons. A glyph is fine as typography, such as a × between map dimensions.
- **Don't** fake small caps with `text-transform: uppercase` and wide tracking. Use the SC faces.
- **Don't** build a dashboard of cards or a book spread. A notice is pinned paper, a campaign is a plaque, a code goes on slate.
- **Don't** use flat color fills in place of a material, or put translucent blurred glass panels over the map. HUD boards are oak.
- **Don't** use hard-edged offset shadows or cool, colored glows.
- **Don't** use wax red for anything that is not destructive, or add a new accent hue for actions.
- **Don't** put slate anywhere except the friend's-code board and chalked campaign codes.
