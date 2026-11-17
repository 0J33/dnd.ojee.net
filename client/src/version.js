export const VERSION = '1.4.0';

export const CHANGELOG = [
  {
    version: '1.4.0',
    date: '2026-10-31',
    notes: [
      'Items you can make on the spot: weapons, armor and shields with +1 to +3 magic, healing potions, worn relics that add to AC and saves, and anything else with its own words. "Add item" on the Gear tab opens the maker',
      'The magic item list: every open-licensed magic item, searchable, one click to start from',
      'DM: right-click a hero, then Give an item. It lands in their gear and the table hears about it',
      'Potions: Drink on the Gear tab rolls the healing and uses one up',
      'Chests hold real items: whoever opens one gets them in their gear (the Secrets editor: Loot, then Put an item in it)',
      'Merchants: right-click an NPC, then Make them a merchant, and stock it with prices and stock. Players double-click (or right-click) them to shop, and the coins come out of their purse',
      'Magic weapons add to hit and damage, magic armor and shields to AC, everywhere attacks are rolled',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-10-31',
    notes: [
      'DM: a new "Adding visible / Adding hidden" switch beside Quick. With it on, every creature, NPC and object you add mid-game starts hidden from the players until you reveal it',
      'DM: hidden creatures and objects carry a purple "Hidden" badge, and creatures the players can\'t see through the fog say "In the dark", so you can tell at a glance without Player view',
      'DM: drag a chest, lever, trap or any other object to move it, or right-click it and pick Move it',
      'Click a selected creature or hero again to let it go',
      'New "Walls: cut / up" button by the camera buttons: keep every wall standing instead of dropping the ones between you and the room',
      'Fog now stays dark from every camera angle: walls, furniture and fires in unseen squares no longer show from the side when walls drop',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-10-31',
    notes: [
      'The quest board fits on one screen again: four quests sit two by two, with no scrollbar',
      'Click a picked race, class, background, fighting style, subclass or Prep map again to unpick it',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-31',
    notes: [
      'New long campaign for a DM: The Dawnblade. A beginner town, three relic quests in any order, hard choices that come back at the end, and a Demon King in a dark castle. 17 places, 20 story beats with read-aloud and DM notes, levels 1 to 7',
      'Walls sit on top of the floor: erasing a wall brings back the floor under it, repainting a floor keeps the walls and furniture, and painting never removes levers, traps or creatures. New eraser in Build',
      'Floor levels: paint a platform or upper floor on top of the map, and show or hide it (also just for players)',
      'Undo and redo cover every map edit, one step per stroke, including drawings',
      'Pointer tool, first in the rail: left-drag moves the map, right-drag turns it, middle-drag selects. Click a creature to select it, double-click opens its sheet, Ctrl+click selects several, then act on all of them at once',
      'Right-click a lever, door, chest or creature for its menu. The browser\'s own right-click menu no longer opens over the game',
      'Every key can be changed: More > Controls & keys',
      'Monsters: one-click add next to the party, drag from the list onto the map, or Place on map to put down several',
      'DM-only notes on each hero and creature',
      'Player view button for the DM: see the table as your players do',
      'Panels no longer overlap or push each other, clicking a tool again closes its menu, and the tutorial highlight stays inside its panel when you scroll',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-22',
    notes: [
      'The first quest\'s seal is real poured wax now, with the d20 pressed into it',
      'Portrait editor: picking a hairstyle takes off a hood or hat the hero was only wearing by default, hair colour sits right under hair, and a rogue\'s mask no longer hides the beard choices. The mask itself is drawn as cloth, folds and knot included',
      '"Start it fresh" on the first quest asks before starting over, and Continue always opens your latest run. Confirm buttons say what they do (Delete, Retire, Start fresh)',
      'Keyboard: Tab stays inside an open window, and the map\'s right-click menu works with the arrow keys',
      'On phones the join-by-code line keeps the code box and Join side by side',
    ],
  },
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
