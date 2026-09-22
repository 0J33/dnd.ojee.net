export const VERSION = '1.2.0';

export const CHANGELOG = [
  {
    version: '1.2.0',
    date: '2026-09-22',
    notes: [
      'One account for dnd.ojee.net and mtg.ojee.net: make it on either site and it works on both; signing in or out of one does the same on the other. Existing dnd accounts were joined to the matching mtg account (the mtg password is the one to use)',
      'New sign-in: the guild register\'s front page. New home: your heroes on the left page, quests on the right, with the first quest sealed at the top and campaigns with their codes below',
      'Portraits redrawn: faces with brows, noses, mouths, eye colour and candlelight, and far more variety in hair, beards, expressions and marks. Dragonborn get scales and horns instead of hair',
      'New portrait editor in the builder and on every sheet (click the portrait): roll a new face, pick skin, hair, facial hair, eyes, expression, headwear and marks, or use your own picture. It follows you onto the battle map',
      'Menus fixed up: Escape closes only the top window, keyboard focus moves into dialogs, readable hints and dimmer text, builder steps open at the top, the sheet\'s tabs fit on phones, clearer guide and quest wording, loading and empty states in the monster browser, and an "Added" confirmation when you place a monster',
      'Fixes: a DM with no hero was offered a monster\'s initiative roll; the guided campaign is named after its quest',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-09-22',
    notes: [
      'Learn spells: new cantrips and spells as you level (bards, sorcerers, warlocks, rangers), a growing wizard spellbook, and extra cantrips for every caster',
      'Subclasses that grant spellcasting (Eldritch Trickster, Arcane Warrior, Soulspy, Underfoot, Smuggler) now get spell slots and a Spells tab',
      'Level-up starts on the classic subclass, as the builder does; Circle of Wind and Underfoot features arrive at the right levels',
      'After an update the page reloads itself instead of running old code; subclass shown on hero cards',
      'Fixes: short-rest healing message, phone dice tray covering the map tools, cramped sheet name on phones',
      'Shade: +1 CHA, +1 to another score and +1 from your living origin (the usual +3)',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-22',
    notes: [
      '13 new races: Goliath and Orc (SRD 5.2) plus eleven from Tome of Heroes, including the clockwork Gearforged',
      'Subraces, heritages and chassis are real choices now; floating ability increases and racial skills are picked in the builder',
      '108 subclasses across all 12 classes (SRD, Tome of Heroes, Tal\'Dorei, Open5e) - chosen at the right level and granted on level-up',
      'Natural weapons (claws, horns, bite) show up as attacks; Dwarven Toughness and Draconic Resilience count in HP and AC',
      'Fixes: Half-Elf ability picks and Elf/Half-Orc skills were never applied; Dragonborn now pick an ancestry; Gear tab crash',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-09',
    notes: [
      'Initial release: campaigns, character builder (all 12 SRD classes, 9 races), full character sheets with click-to-roll',
      'Battle maps with grid, tokens, fog of war, ruler, pings and drawing',
      'Initiative tracker, full polyhedral dice with advantage/disadvantage, SRD monster library',
      'Guided Learn-to-Play adventure: The Cellar of the Gilded Flagon',
      'In-app guide, rules reference, DM screen, pregenerated heroes',
    ],
  },
];
