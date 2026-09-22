---
name: dnd.ojee.net
description: A candlelit, beginner-first D&D 5e tabletop; home is the guild register, the table is lit by one candle.
colors:
  bg-deep: "#070604"
  bg-base: "#0d0b08"
  bg-panel: "#14110c"
  bg-panel-2: "#181410"
  bg-elev: "#1e1912"
  bg-hover: "#282218"
  ledger-page: "#16120c"
  ledger-page-2: "#120e09"
  ledger-well: "#0b0906"
  border-soft: "#2b261c"
  border: "#3b3428"
  border-strong: "#5a4f38"
  ledger-rule: "rgba(212, 169, 79, 0.2)"
  ledger-rule-strong: "rgba(212, 169, 79, 0.42)"
  text: "#ece5d6"
  text-mid: "#b3a992"
  text-dim: "#857b64"
  text-faint: "#57503e"
  text-dim-lifted: "#968b72"
  text-faint-lifted: "#7d735c"
  gold: "#d4a94f"
  gold-bright: "#e8c476"
  gold-dim: "#8a7448"
  gold-ink: "#1d150a"
  ember: "#c2542e"
  ember-bright: "#e07040"
  magic: "#8f7fd4"
  danger: "#b04444"
  danger-bright: "#d05c5c"
  success: "#6f9f5f"
  info: "#5f87a8"
typography:
  display:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 700
    letterSpacing: "0.14em"
  headline:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  title:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "1.06rem"
    fontWeight: 700
    letterSpacing: "0.05em"
  body:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  marginalia:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "0.68rem"
    fontWeight: 400
    letterSpacing: "0.16em"
  button:
    fontFamily: "Cinzel, Georgia, serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.14em"
rounded:
  page: "3px"
  sm: "4px"
  md: "6px"
  pill: "16px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "22px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "38px"
  button-primary-disabled:
    backgroundColor: "rgba(212, 169, 79, 0.08)"
    textColor: "{colors.gold}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "38px"
  button-secondary-hover:
    backgroundColor: "rgba(212, 169, 79, 0.06)"
    textColor: "{colors.gold-bright}"
  button-panel:
    backgroundColor: "{colors.bg-elev}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.gold-bright}"
    typography: "{typography.marginalia}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-mid}"
    rounded: "{rounded.sm}"
    size: "34px"
  input-ledger:
    backgroundColor: "{colors.ledger-well}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "44px"
  input:
    backgroundColor: "{colors.bg-deep}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  chip-choice:
    backgroundColor: "{colors.bg-elev}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
    height: "32px"
  chip-choice-on:
    backgroundColor: "rgba(212, 169, 79, 0.12)"
    textColor: "{colors.gold-bright}"
  ledger-page:
    backgroundColor: "{colors.ledger-page}"
    textColor: "{colors.text}"
    padding: "30px 34px 34px"
  modal:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    width: "560px"
---

# Design System: dnd.ojee.net

## Overview

**Creative North Star: "The Guild Ledger by Candlelight"**

The whole app is one candlelit room: a warm near-black ramp that never goes neutral grey, gold as the light that falls on anything you can act on, ember as the flame itself, and a faint violet reserved for magic. Headings are engraved in Cinzel, everything a person reads runs in EB Garamond, and asides are set as italic marginalia rather than as small grey UI text. This base (the builder, the sheet, the board, every modal and menu) is the incumbent world; it is dense, panelled and practical, because a table mid-session needs many controls at once.

The sign-in and home are the Guild Ledger, which sits inside that room and inherits all of its tokens. Home is the adventurers' register opened to a spread: your heroes on the left page, your quests on the right, a gold-ruled gutter where the book is bound. Rows are register entries separated by hairline gold rules, not equal cards; the empty slot at the foot of each page is a dashed "blank line" you write into; the first quest carries one poured-wax seal. Sign-in is the register's front page with a double engraved rule. The Ledger is quieter and more generous than the table: more air, larger portraits, prose in place of labels.

Every hero has a drawn likeness (derived from race, class and name) that appears wherever the character does, from a 34px map token to the 132px editor stage. Portraits are part of the visual system, not decoration: they carry the hero's chosen colour as a ring and a lit backdrop.

**Key Characteristics:**
- Warm near-black ramp (#070604 up to #282218); no neutral greys, no pure black surfaces.
- Gold marks what you can act on; ember appears once per surface at most (the seal, a fire-lit glow).
- Cinzel for engraved headings, labels and buttons; EB Garamond for reading and italic marginalia.
- Ledger surfaces are ruled pages and entries, not grids of cards.
- Every character is shown by its drawn portrait, sized to the context.
- Icons are one drawn SVG set (Material Symbols, shared across ojee.net); controls never use text glyphs.

## Colors

A candlelit palette: a warm brown-black ramp lit by one gold, with ember and magic as rare secondary lights.

### Primary
- **Candle Gold** (#d4a94f): the accent for everything interactive or important: primary buttons, focus rings, selected states, the logo, page rules (as 20% and 42% alpha rules). Its brighter step **Lamplit Gold** (#e8c476) carries headings on Ledger pages, hover text and links; **Tarnished Gold** (#8a7448) is the hover border and the icon tint inside stat rows. **Gold Ink** (#1d150a) is the text on a gold button.

### Secondary
- **Ember** (#c2542e) and **Ember Bright** (#e07040): the flame. The warm glow at the top of the Ledger background, ember chips, and the first-quest wax seal (drawn in a #e27a48 to #7a2a10 radial). Never a button colour.

### Tertiary
- **Arcane Violet** (#8f7fd4): magic only (spell chips, magical effects). It does not appear on the Ledger.

### Neutral
- **Deep Night** (#070604): page background behind everything.
- **Panel ramp** (#0d0b08, #14110c, #181410, #1e1912, #282218): base, panel, raised panel, elevated control, hover. Panels are vertical gradients between two adjacent steps.
- **Ledger Page** (#16120c to #120e09): the register page, a vertical gradient slightly warmer than a panel. **Ink Well** (#0b0906) is the Ledger input field.
- **Borders** (#2b261c soft, #3b3428 default, #5a4f38 strong): dividers, control outlines, modal edges.
- **Parchment text** (#ece5d6), **Faded ink** (#b3a992) for marginalia and secondary text, **Dim** (#857b64) and **Faint** (#57503e) on the page background only.
- **Lifted dims** (#968b72, #7d735c): inside modals, panels, the builder and context menus, `--text-dim` and `--text-faint` are redefined to these values so they hold 4.5:1 on the lifted surfaces.
- **Status**: danger #b04444 / #d05c5c (delete, retire, HP), success #6f9f5f (connected, "at the table"), info #5f87a8 (temp HP).

### Named Rules
**The Candle Rule.** Gold is the light that falls on what you can act on. A gold surface is always a control or the single most important heading on its page.

**The One Flame Rule.** Ember is the flame, not a colour for UI. On the Ledger it appears exactly once, as the wax seal on the first quest, plus the faint ember glow in the page background.

**The Lifted Scope Rule.** Anything that opens over the page (modal, panel, builder, context menu) uses the lifted dim and faint values. Never put page-level #57503e text on a lifted surface.

## Typography

**Display Font:** Cinzel (with Georgia, serif)
**Body Font:** EB Garamond (with Georgia, serif)

**Character:** Cinzel is carved: capitals only, widely tracked, for names, headings, labels and buttons. EB Garamond is the hand in the margins: roman for reading, italic for asides, hints, counts and empty states.

### Hierarchy
- **Display** (700, 1.75rem, 0.14em): the wordmark on the register's front page, in Lamplit Gold with a soft gold glow.
- **Headline** (700, 1.25rem, 0.12em): Ledger page heads ("Your heroes", "Quests"), Lamplit Gold, `text-wrap: balance`. The base app's h2 uses the same size at 2px tracking.
- **Title** (700, 1.06rem, 0.05em): register entry names (hero names, campaign names) in Parchment, turning Lamplit Gold on hover. The first-quest heading is a title at 1.15rem, 0.06em, line-height 1.25, balanced.
- **Body** (400, 17px, 1.45): all reading text. Quest descriptions cap at 54ch; empty states at 52ch; footers at 60ch.
- **Marginalia** (400 italic, 1rem, 1.35): entry subtitles ("Level 1 Hill Dwarf Fighter"), page notes ("4 in the register"), blank-line prompts, hints, the footer. Faded ink (#b3a992).
- **Label** (400, 0.68rem, 0.16em, uppercase): form field names in Cinzel, text-mid on the Ledger, text-dim in the portrait editor.
- **Button** (600, 0.72rem, 0.14em, uppercase): every Cinzel button. The front-page primary goes up to 0.8rem at 48px tall.

### Named Rules
**The Two Hands Rule.** Cinzel names things; Garamond explains them. A hint inside a heading or a field label drops to Garamond italic with no capitals, because Cinzel has no lowercase and cannot say a sentence.

**The Marginalia Rule.** Secondary information is set as italic Garamond prose in Faded ink, not as small uppercase grey UI text.

## Layout

The base app is panelled and dense: modals up to 560px (portrait editor 760px), panel headers at 10px 14px, modal body 16px 18px, tight 10px flex gaps.

The Ledger is a two-page spread: a centred grid of two equal columns, max 1240px, with 30px 26px outer padding and 30px 34px page padding. Entries are three-column rows (portrait, text, actions) with 16px gaps and 16px vertical padding. Spacing on the Ledger steps through 4, 8, 14, 22 and 30px. The sign-in front page is a single centred page, max 430px wide, 44px 38px padding, 14px internal rhythm.

Responsive: at 900px the spread becomes one column, Quests first (the first quest leads on a phone), entry actions drop to their own right-aligned row, and the seal moves above the first-quest text. At 520px the join line puts its question on its own row and keeps the code input and Join button together on the next. The portrait editor collapses to one column at 640px. On coarse pointers every Ledger control grows to 44px.

## Elevation & Depth

Depth is candlelight and paper, not floating material. Surfaces separate by tonal steps in the warm ramp and by long, soft, dark drop shadows that read as the page resting on a table. The Ledger pages add inner gutter shadows so the spread reads as a bound book; the front page draws its double engraved rule with inset box-shadows. Gold glow is the only lit shadow and is used for the primary button, the logo and the connection dot.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 6px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)`): base panels.
- **Modal** (`box-shadow: 0 24px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,169,79,0.08)`): dialogs, over a 82% warm-black overlay with 3px blur.
- **Pop** (`box-shadow: 0 12px 40px rgba(0,0,0,0.8)`): context menus, toasts, popovers.
- **Page rest** (`box-shadow: 0 30px 60px -34px rgba(0,0,0,1)`): Ledger pages on the table.
- **Gutter** (`box-shadow: inset -22px 0 30px -26px rgba(0,0,0,0.9)` mirrored): the bound fold on each page of the spread.
- **Engraved rule** (`box-shadow: inset 0 0 0 7px #16120c, inset 0 0 0 8px rgba(212,169,79,0.42)`): the register's front page border.
- **Gold lift** (`box-shadow: 0 6px 16px -8px rgba(212,169,79,0.6)`): the Ledger primary button.

### Named Rules
**The Soft Table Rule.** Shadows are long, blurred and dark, like paper resting under a candle. No hard offset shadows.

## Shapes

Corners are barely softened. Controls, fields and inputs share a 4px radius; modals, panels and context menus 6px; the register's front page and the first-quest entry 3px, and the spread's outer corners 4px with square inner corners at the gutter. Pills (16px) are only for choice chips; circles only for portraits, colour swatches and the connection dot. Rules are the main form device: hairline gold rules between entries, a stronger gold rule under each page head and down the gutter, a gradient rule that fades out at both ends, and a dashed rule for a blank line waiting to be written.

## Components

### Buttons
Engraved and quiet; one gold slab per page area.
- **Shape:** gently squared (4px), 38px minimum height (44px on touch).
- **Primary (Ledger):** a vertical gold gradient (#e2bd67 to #c79a45) with a Lamplit Gold border, Gold Ink text and the gold lift shadow. Hover brightens to #edcb7d to #d4a94f. Disabled stays a readable outline (8% gold wash, Tarnished Gold border, Candle Gold text), never a faded slab.
- **Primary (base, in modals and the table):** gradient Lamplit Gold to Candle Gold, text #241c0d with a light top text-shadow, hover adds a gold glow. Same disabled-as-outline rule inside the lifted scope.
- **Secondary (Ledger):** transparent with a default border; hover turns the border Tarnished Gold, the text Lamplit Gold and adds a 6% gold wash.
- **Panel button (base):** a dark gradient (#1e1912 to #14110c), 9px 18px, hover lifts one ramp step with a faint gold glow, press nudges down 1px. Ghost, danger, small and big variants follow the same shape.
- **Link:** Garamond italic in Lamplit Gold with a 45% gold underline at 3px offset. Used for secondary actions beside a primary ("Start it fresh", "Read the player's guide").
- **Icon button:** 34px square (44px touch), transparent until hover; the danger variant turns danger-bright on hover. The icon is always a drawn SVG.

### Chips
- **Status chips (base):** 10px radius, elevated background, gold, ember and magic tints at 8 to 9% with a matching border.
- **Choice chips (portrait editor):** Garamond, 16px pill, 32px tall (40px on phones); selected gets a gold border, Lamplit Gold text and a 12% gold wash.

### Cards / Containers
- **Ledger page:** Ledger Page gradient, default border, page-rest shadow, gutter shadow on the bound side, 30px 34px padding.
- **Register entry:** not a card. A row on the page divided by a 20% gold hairline; the whole name block is one button that opens the sheet.
- **Blank line:** a dashed 42% gold rule with an italic prompt and a secondary button at the right.
- **Panel / modal (base):** raised-panel gradient, 6px radius, default or strong border, panel or modal shadow. Modal header in tracked uppercase gold Cinzel, actions right-aligned over a soft top border. Confirmations name their action on the button ("Delete", "Retire", "Start fresh"), never "OK".

### Inputs / Fields
- **Ledger field:** Ink Well (#0b0906) background, default border, 4px radius, 44px tall, Garamond at 1.08rem; placeholder in italic. Focus turns the border Candle Gold with a 3px 16% gold halo.
- **Base field:** Deep Night background with a soft inset shadow, 8px 12px; focus uses a Tarnished Gold border and a 2px gold halo. Selects carry a drawn chevron; checkboxes a drawn tick.
- **Code field:** Cinzel, tracked 0.26em, centred and uppercased, 9em wide.
- **Error:** danger-bright italic Garamond, announced with role="alert".

### Navigation
The Ledger bar is sticky, 12px 26px, a near-opaque warm-black gradient with a soft bottom border and 6px backdrop blur. The wordmark sits left in Cinzel Lamplit Gold beside the dragon d20 logo; the right holds the Guide button, an italic username with a connection dot (success green with a soft glow when connected) and a sign-out icon button. The base app uses underline tabs: dim Cinzel labels, the active tab in gold with a 2px gold underline.

### Portrait (signature)
A drawn bust in a 64-unit SVG, framed in a circle. Behind it is a radial backdrop mixed from the hero's colour into the warm dark; around it a 1.5px ring of the hero's colour darkened 45%, with a small drop shadow. Every tone in the face is derived from a few authored colours with two mixes: shade toward #140c08 and light toward #fff3dc, so every skin is lit by the same candle. Class sets garb and trim; worn items like a rogue's mask are cloth mixed from garb and trim. Sizes in use: 34 (map token), 54 (editor picks), 72 (register entry), 132 (editor stage). A player's own picture replaces the drawing in the same frame.

### Portrait editor
A stage column (204px, sticky) with the large portrait, the map-token preview, "Roll a new face" and "Use my own picture", beside a list of trait rows: a 96px Cinzel label and the choices. Colours are 28px circular swatches (34px on phones) with a gold ring when selected. Choices you judge by eye (hair, facial hair) are shown as small portraits cropped to the head. When a mask hides a choice, the previews are drawn without it and a note in italic marginalia explains why. Row order runs Colour, Skin, Hair, Hair colour, Headwear, Facial hair, Eyes, Expression, Marks.

### Wax seal (signature, single use)
The first quest's seal: an authored SVG of poured wax with an uneven rim, a pressed well and a d20 impressed in it, lit from the upper left. It stamps in (scale and rotate, 0.8s) and desaturates once the quest has been started. It is the only ember object on the Ledger.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the warm ramp (#070604 to #282218) and the gold family; take ember and violet only for flame and magic.
- **Do** put names, headings, labels and buttons in tracked Cinzel, and every sentence, hint and count in EB Garamond (italic for asides).
- **Do** show a character by its drawn portrait at a size suited to the context (34, 54, 72, 132px), ringed in the hero's colour.
- **Do** present lists on the Ledger as ruled register entries with a dashed blank line at the foot, not as a grid of equal cards.
- **Do** keep a disabled primary as a readable gold outline (8% wash, Tarnished Gold border).
- **Do** name the action on a confirmation button ("Delete", "Start fresh").
- **Do** draw every control icon as an SVG from the shared icon set; draw close and minus too (XIcon, MinusIcon).
- **Do** grow Ledger controls to 44px on coarse pointers and balance heading wraps.

### Don't:
- **Don't** use neutral greys or pure black for surfaces or text; everything leans warm.
- **Don't** use ember as a button or a general accent; it is the one flame on a surface.
- **Don't** set sentences or hints in Cinzel, or add small uppercase kickers above headings.
- **Don't** use text glyphs (×, —, ✓) as controls or icons.
- **Don't** use hard offset shadows; shadows are long, soft and dark.
- **Don't** put page-level dim or faint text (#857b64, #57503e) on modals, panels, the builder or menus.
- **Don't** add a second wax seal or turn the seal into a button; it marks the first quest only.
