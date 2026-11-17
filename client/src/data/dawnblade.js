// The Dawnblade: a long campaign for a DM to run (several sessions).
// Heroes leave the town of Thornwick, gather the three Dawn Relics, remake a
// shattered sword and end the Demon King in his castle in the cursed east.
//
// DM-run only: each step becomes a story beat in Prep with its read-aloud,
// DM notes and the fight it starts. NPCs stand on the maps already; chests,
// traps and secrets are placed as map objects. Levels are milestones.
// Monsters and magic items are SRD (open-licensed) only.
import { sceneFromBuiltin } from './scenes';
import { isBlockedChar } from './tiles';

/* ---------------- places ---------------- */

// Nearest open square to a point given as fractions of the map (0..1).
function spot(cells, fx, fy) {
  const h = cells.length, w = cells[0].length;
  const tx = Math.round(fx * (w - 1)), ty = Math.round(fy * (h - 1));
  let best = null, bd = Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isBlockedChar(cells[y][x])) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best || { x: tx, y: ty };
}

const NPC = (label, fx, fy, color, body, note = '') => ({ kind: 'npc', label, color, fx, fy, body, note });
const OBJ = (fx, fy, object) => ({ fx, fy, object });

function place(key, id, name, { entry = [0.5, 0.9], npcs = [], objects = [], notes = '' } = {}) {
  const b = sceneFromBuiltin(key);
  const at = (fx, fy) => spot(b.cells, fx, fy);
  return {
    id,
    name,
    bg: { kind: 'builtin', floor: b.floor },
    grid: { w: b.w, h: b.h },
    cells: b.cells,
    fogEnabled: true,
    notes,
    entry: at(entry[0], entry[1]),
    tokens: npcs.map(({ fx, fy, ...t }) => ({ ...t, letter: t.label[0], ...at(fx, fy) })),
    objects: objects.map(({ fx, fy, object }) => ({ ...object, ...at(fx, fy) })),
  };
}

const loot = (name, text, more = {}) => ({ kind: 'chest', name, effects: [{ type: 'loot', text }], ...more });
const trap = (name, dc, damage, damageType, save, text) => ({ kind: 'trap', name, dc, effects: [{ type: 'damage', damage, damageType, save, saveDc: dc, text }] });
const secret = (name, dc, text) => ({ kind: 'secret', name, dc, effects: [{ type: 'text', text }] });
const note = (name, text) => ({ kind: 'note', name, effects: [{ type: 'text', private: true, text }] });

const buildScenes = () => [
  place('taproom', 'db-inn', 'Thornwick: The Last Lantern Inn', {
    entry: [0.5, 0.92],
    npcs: [
      NPC('Elder Maren', 0.5, 0.35, '#b39ddb', 'feminine', 'Old, sharp, tired. Keeper of the town\'s memory. Knows the legend of the Dawnblade.'),
      NPC('Bram the innkeeper', 0.2, 0.25, '#c98a4b', 'masculine', 'Big, kind, gossips. Gives the heroes free rooms if they help.'),
      NPC('Odo the merchant', 0.78, 0.6, '#806b4e', 'masculine', 'SECRET: a cultist of the Demon King. Smiles too much. Asks where the heroes are going.'),
    ],
    notes: 'Opening scene. Let everyone introduce their hero here. Odo is a spy; reward a hero who watches him (Insight DC 13: he is far too interested).',
  }),
  place('village', 'db-square', 'Thornwick Square', {
    npcs: [
      NPC('Captain Holt', 0.45, 0.45, '#5f87a8', 'masculine', 'Tired guard captain with four guards for a whole town. Honest. Will lend a horse.'),
      NPC('Sela the smith', 0.25, 0.6, '#c2542e', 'feminine', 'Can sharpen, mend and (later) help remake the Dawnblade. Sells basic weapons and armour.'),
      NPC('Pip', 0.62, 0.7, '#e0c060', 'neutral', 'A child who saw the bandits take the grain carts east.'),
    ],
    objects: [OBJ(0.8, 0.3, note('Wanted poster', 'WANTED: "Redcap" Garrick and his bandits. 50 gold from the town, alive or dead.'))],
  }),
  place('vault', 'db-vault', 'The Old Watch Vault', {
    objects: [
      OBJ(0.5, 0.25, loot('Stone coffer', 'The SHATTERED DAWNBLADE: a hilt with no light in it and three hand-span shards of pale steel, wrapped in faded blue cloth. Too broken to fight with.', { name: 'Stone coffer' })),
      OBJ(0.5, 0.55, trap('Pressure plate', 12, '2d6', 'piercing', 'dex', 'Click. Rusted spears jab up from the floor!')),
      OBJ(0.2, 0.3, loot('Old weapon rack', 'Two potions of healing and a +1 shield (whoever takes it: +1 AC on top of a normal shield).')),
    ],
    notes: 'Under the town hall. The watch sealed it a century ago. Animated armour still guards it.',
  }),
  place('field', 'db-road', 'The East Road', { entry: [0.1, 0.5] }),
  place('keep', 'db-hideout', 'Redcap Hideout', {
    npcs: [NPC('Tamsin (captive)', 0.75, 0.3, '#d4a94f', 'feminine', 'A carter kidnapped with the grain. Heard the bandits talk about "the man in grey" who pays them.')],
    objects: [
      OBJ(0.8, 0.2, loot('Bandit strongbox', '60 gold pieces, the town\'s grain tallies, and a letter sealed with black wax: "Burn the granaries before winter. The King rewards the faithful. - O."')),
      OBJ(0.3, 0.75, secret('Loose stones', 13, 'A crawlway behind the stones: a quiet way into the yard (the heroes can surprise the bandits).')),
    ],
  }),
  place('bridge', 'db-bridge', 'Greyfang Crossing', { notes: 'The bridge is the only crossing for a day\'s ride. Worgs and goblin riders hold it.' }),
  place('goblincamp', 'db-camp', 'The Burnt Tusk Camp', {
    npcs: [NPC('Chief Snagga', 0.5, 0.4, '#6a8a3d', 'feminine', 'Goblin chief. Her tribe is enslaved by cultists. Will deal if the heroes free them.')],
    objects: [OBJ(0.2, 0.25, loot('Cult chest', 'A MAP OF THE THREE RELICS (Moonwell in the Sunken Mire, the Ember Forge under Cinderpeak, the Tomb of Ser Varric beneath the Starfall Archive) and 40 gold.'))],
  }),
  place('clearing', 'db-wood', 'The Witchwood', {
    objects: [
      OBJ(0.7, 0.3, loot('Cocooned traveller', 'An old elf ranger, long dead. On her: Boots of Elvenkind (advantage on Stealth to move silently) and a silver arrowhead.')),
      OBJ(0.4, 0.6, trap('Web snare', 12, '1d6', 'bludgeoning', 'dex', 'Sticky webs! Fail and you are restrained until you spend an action to pull free (Strength DC 12).')),
    ],
  }),
  place('swamp', 'db-mire', 'The Sunken Mire', {
    npcs: [NPC('Old Wenna', 0.25, 0.7, '#8fa36b', 'feminine', 'A swamp herbalist. Her village of stilt-houses lives off the Moonwell\'s clean water.')],
  }),
  place('mushroom', 'db-moonwell', 'The Moonwell Grotto', {
    npcs: [NPC('The Well Spirit', 0.5, 0.35, '#9fd8e0', 'neutral', 'A calm, cold voice in the water. Not evil, not kind. It keeps bargains exactly.')],
    objects: [OBJ(0.5, 0.25, loot('The Moonwell', 'THE TEAR OF THE MOON: a fist-sized drop of silver water that never spills. Whoever carries it sees through illusions and shapechanges within 30 feet.'))],
  }),
  place('mountain', 'db-pass', 'Cinderpeak Pass', {
    objects: [OBJ(0.6, 0.4, trap('Loose scree', 13, '2d8', 'bludgeoning', 'dex', 'Rocks slide down the slope!'))],
  }),
  place('lavacave', 'db-forge', 'The Ember Forge', {
    npcs: [NPC('Thrain Ashbeard (ghost)', 0.5, 0.3, '#ffb74d', 'masculine', 'The last dwarf forgemaster, a friendly ghost. Wants his forge freed. He can tell the heroes how to remake the blade.')],
    objects: [
      OBJ(0.5, 0.2, loot('The great anvil', 'THE HEART OF EMBERS: a warm red stone that beats slowly. Whoever carries it has resistance to fire damage.')),
      OBJ(0.2, 0.7, loot('Thrain\'s rack', 'A FLAME TONGUE longsword (bonus action: it bursts into flame; +2d6 fire damage on a hit; bright light 40 ft).')),
    ],
  }),
  place('library', 'db-library', 'The Starfall Archive', {
    npcs: [NPC('Archivist Quill', 0.3, 0.3, '#8f7fd4', 'masculine', 'A nervous scholar who never left when the curse came. Knows the tomb\'s riddle.')],
    objects: [
      OBJ(0.75, 0.6, loot('Reading desk', 'A Wand of Magic Missiles (7 charges; regains 1d6+1 at dawn) and the journal of Ser Varric.')),
      OBJ(0.5, 0.15, secret('Star-map floor', 14, 'The stars on the floor match the riddle. Press them in order and the floor opens: stairs down to the tomb.')),
    ],
  }),
  place('crypt', 'db-crypt', 'The Tomb of Ser Varric', {
    objects: [
      OBJ(0.5, 0.2, loot('Ser Varric\'s sarcophagus', 'THE STARLIGHT HILT: a silver crossguard set with a white gem. It fits the Dawnblade\'s broken hilt exactly.')),
      OBJ(0.3, 0.5, trap('Grave-dust vent', 13, '2d6', 'necrotic', 'con', 'Grey dust bursts from the floor!')),
    ],
  }),
  place('desert', 'db-wastes', 'The Ashen Wastes', {
    npcs: [NPC('Ash pilgrim', 0.3, 0.6, '#9e9e9e', 'neutral', 'A wanderer who lost everything to the curse. Can guide the heroes to the castle\'s side gate for a price, or for kindness.')],
    notes: 'The cursed land. Ash falls instead of snow. Short rests here only heal half. Set the mood to Ash weather.',
  }),
  place('corridors', 'db-castle', 'Castle Malzar: the Dungeons', {
    npcs: [NPC('Prisoner Ser Liane', 0.8, 0.3, '#5f87a8', 'feminine', 'A captured knight from the west. Freed, she fights beside the heroes in the final battle (Knight stats).')],
    objects: [
      OBJ(0.2, 0.3, loot('Jailer\'s locker', 'Keys to the throne room\'s side door, a Potion of Greater Healing (4d4+4) and a Ring of Protection (+1 AC and saves).')),
      OBJ(0.5, 0.5, trap('Fire grate', 14, '3d6', 'fire', 'dex', 'Flames roar up through the grate!')),
    ],
  }),
  place('throne', 'db-throne', 'The Throne of Ash', { entry: [0.5, 0.95], notes: 'Final battle. Malzareth sits on a throne of black stone. Set the mood to Night with Embers.' }),
];

/* ---------------- the story ---------------- */
// encounter: [[monsterIndex, count, name?]] for a party of four (drop one
// creature per missing hero, add one per extra hero).

const STEPS = [
  /* ===== Act I: Thornwick ===== */
  {
    act: 'Act I: Thornwick',
    title: 'The Last Lantern',
    scene: 'db-inn',
    readAloud:
      `Rain drums on the roof of the Last Lantern Inn. The fire is warm, the stew is thin, and every face in Thornwick is worried.\n\nFor a month now the sky in the east has glowed a dull red at night. Crops wilt. Wells taste of ash. Travellers speak of a dark castle rising from cursed land, and of a name nobody likes to say out loud: MALZARETH, THE DEMON KING.\n\nThe door opens and ELDER MAREN steps in, leaning on her stick. She looks straight at you. "You. You have the look of people who don't run. I need to show you something under the town hall. Something we were told never to forget."`,
    dm: `Let each player describe their hero and why they are in Thornwick. Then Maren tells the legend (read slowly):\n"Three hundred years ago Malzareth rose before. Queen Elowen stopped him with the DAWNBLADE, a sword forged with three relics: the Tear of the Moon, the Heart of Embers and the Starlight Hilt. When he was banished, the blade shattered and the relics were hidden in three far places so no one could misuse them. If he has returned, the blade must be remade."\nOdo the merchant (a secret cultist) listens from the corner. Insight DC 13 spots him paying too much attention. If confronted he lies smoothly and leaves town that night (he will turn up again).`,
  },
  {
    title: 'The vault under the hall',
    scene: 'db-vault',
    readAloud:
      `Maren unlocks an iron door older than the town. Stairs lead down into dust and silence. At the bottom, a vault of the old watch: weapon racks, cracked banners, and a stone coffer on a raised step.\n\nAs your light falls on the coffer, the suits of armour standing by the walls turn their empty helmets toward you. Metal grinds. They step down from their plinths.`,
    dm: `The animated armour are the old guardians. They stop fighting if Maren shouts the watch's password, but she has forgotten it (a hero who studies the banners can find it: Investigation DC 14 = "Dawn holds").\nA pressure-plate trap sits in front of the coffer (Perception DC 12 to spot).\nIn the coffer: the SHATTERED DAWNBLADE. Maren: "Three relics to wake it. Each one far away. I'm sorry. There is no one else."\nOn the rack: 2 potions of healing and a +1 shield.`,
    encounter: [['animated-armor', 2]],
  },
  {
    title: 'Bandits on the east road',
    scene: 'db-square',
    readAloud:
      `In the square the next morning, Captain Holt is shouting at his four guards. "Three grain carts. Gone. Again. That's half our winter."\n\nA small girl, PIP, tugs at your sleeve. "I saw them. Men in red caps. They went east, along the old road, to the broken castle on the hill."\n\nThe road east is also the road toward the red sky. Wherever the relics are, you will have to start that way.`,
    dm: `Shopping and preparation scene. Sela the smith sells SRD weapons and armour at book prices. Holt pays 50 gold for the grain returned and offers a horse to share.\nThe wanted poster names "Redcap" Garrick. Players who ask around (Persuasion or Investigation DC 12) learn the bandits only started raiding after a "man in grey" began paying them.`,
  },
  {
    title: 'Ambush on the road',
    scene: 'db-road',
    readAloud:
      `Half a day east the road runs between low hills and broken fences. Fresh cart tracks. Then a whistle, and arrows thunk into the mud around you.\n\nRed-capped figures rise from behind the hedges. "Toll road, friends! Everything you carry, and maybe you walk home."`,
    dm: `A good first real fight. The bandits flee when half of them drop.\nTOUGH CHOICE: a captured bandit begs for mercy. He says he only joined because his family was starving. Let him go, bring him to Holt for judgement, or recruit him as a guide to the hideout (he knows the crawlway). Remember what they chose.`,
    encounter: [['bandit', 4], ['thug', 1]],
  },
  {
    title: 'Redcap Hideout',
    scene: 'db-hideout',
    readAloud:
      `The ruined castle crouches on its hill like a broken tooth. Smoke rises from the courtyard where the grain carts stand, still loaded. Laughter drifts over the walls, and a big man in a battered red cap is counting coins on an upturned barrel.\n\nThere are many ways into a ruin. The front gate is not the only one.`,
    dm: `Let the players plan: sneaking (the hidden crawlway behind loose stones, Perception DC 13, lets them surprise the yard), bluffing, or charging.\nGarrick fights to the end unless the heroes show him the black-wax letter: then he realises he was a pawn of the cult and surrenders, and may tell them "Odo" is the man in grey.\nTamsin the carter is tied up in the corner. The strongbox holds 60 gold and the letter from "O".\nTOUGH CHOICE: Garrick surrenders. Hand him to Holt (the town hangs him), set him to work rebuilding the carts, or let him go in return for his crew guarding Thornwick while the heroes are away.`,
    encounter: [['bandit-captain', 1, 'Redcap Garrick'], ['bandit', 3], ['thug', 1]],
    milestone: 2,
  },
  {
    title: 'The road east',
    scene: 'db-square',
    readAloud:
      `Thornwick cheers as the grain carts roll home. That night Maren lays the shattered blade on the inn table and an old map beside it.\n\n"The legends say the relics went where the world is wildest. A Moonwell in the Sunken Mire. A dwarven forge under the Cinderpeak. A knight's tomb under the Starfall Archive. I don't know more. But the goblins of the eastern woods trade in old things. Start with them."\n\nOdo the merchant's stall is empty. He left in the night, heading east.`,
    dm: `If the heroes figured out Odo is the cultist, Holt sends riders but they don't catch him.\nThe next step is the crossing and the goblin camp, where the heroes find the map that marks all three relic sites.\nThe heroes can rest and buy gear. From here on, short rests are fine but long rests in the wild may be interrupted (roll a d6: on a 1, a random encounter of wolves or goblins).`,
  },

  /* ===== Act II: The Wild East ===== */
  {
    act: 'Act II: The Wild East',
    title: 'Greyfang Crossing',
    scene: 'db-bridge',
    readAloud:
      `Two days east, the road ends at a fast grey river. A single stone bridge crosses it. On the far side, huge wolves with eyes like coals pace back and forth, and small figures in crude armour ride on their backs.\n\nOne of the goblins stands up in her stirrups and shrieks: "Bridge closed! By order of the Red Masters! Turn back or be dinner!"`,
    dm: `Worgs and goblin riders. The goblins are terrified of the "Red Masters" (cultists) and will talk if one is captured: their tribe is enslaved, forced to hunt for the cult.\nTalking first works too: Persuasion or Intimidation DC 14 makes the goblins let the heroes cross, as long as the heroes promise to "not tell the Red Masters".`,
    encounter: [['worg', 2], ['goblin', 3]],
  },
  {
    title: 'The Burnt Tusk Camp',
    scene: 'db-camp',
    readAloud:
      `The goblin camp sits in a burned clearing. Goblins in chains haul wood and dig pits while robed men in red stand over them with whips. In the middle a tall cultist preaches to the trembling goblins: "The King rises! Those who serve, live. Those who don't, feed the hounds."\n\nIn a cage at the edge of the camp, a goblin with a broken crown on her head watches you with sharp yellow eyes.`,
    dm: `Chief Snagga is in the cage. Free her (lock: Thieves' Tools DC 13, or Strength DC 15) and the goblins rise up and fight the cultists with the heroes (give the heroes advantage on their first attacks).\nThe cult fanatic leads; if he drops, the cultists flee.\nThe cult chest holds THE MAP OF THE THREE RELICS and 40 gold.\nTOUGH CHOICE: the freed goblins have raided human farms for years. Thornwick wants them gone. Snagga asks for the old woods to live in. Let them stay (they become allies, and 6 goblin archers join the final battle), drive them out, or let Thornwick decide.`,
    encounter: [['cult-fanatic', 1, 'Brother Vael'], ['cultist', 4]],
  },
  {
    title: 'The Witchwood',
    scene: 'db-wood',
    readAloud:
      `The shortest way to all three relic sites runs through the Witchwood. The trees grow too close. Grey webs hang between them like sails, and the only sound is a soft, patient clicking.\n\nSomething large moves in the canopy above you.`,
    dm: `Giant spiders and an ettercap. Web snares on the paths (Perception DC 12 to spot).\nA cocooned dead ranger carries Boots of Elvenkind.\nGoblin allies (if freed) know a safer path: with them, skip the snare and the heroes get a surprise round.\nAt the far edge of the wood the paths split three ways. The heroes can now seek the relics in ANY ORDER. Run the matching act next (Moonwell, Ember Forge or Starfall Archive). After each relic, grant a level.`,
    encounter: [['giant-spider', 2], ['ettercap', 1]],
    milestone: 3,
  },

  /* ===== Act III-A: The Tear of the Moon ===== */
  {
    act: 'Act III: The Three Relics (any order)',
    title: 'The Sunken Mire',
    scene: 'db-mire',
    readAloud:
      `The ground softens, then sinks. Black water, grey reeds, and drowned trees standing like old men in the fog. Lights float over the water, pale and blue, always a little too far away.\n\nOn stilts above the swamp, a village of reed houses. An old woman with a basket of herbs calls to you: "Don't follow the lights, fools! Come up before they come for you!"`,
    dm: `Old Wenna's village lives on the Moonwell's clean water. She guides the heroes there, but warns: "The Well gives, but it always takes the same in return."\nOn the way, will-o'-wisps lure travellers into the deep mud while lizardfolk hunt them. Following the lights: Wisdom save DC 12 or walk toward them.`,
    encounter: [['will-o-wisp', 1], ['lizardfolk', 3]],
  },
  {
    title: 'The Moonwell\'s price',
    scene: 'db-moonwell',
    readAloud:
      `Under a hill of moss, a cave glows soft blue. Mushrooms as tall as people light the way to a round pool so still it looks like glass. At its bottom lies a single drop of silver.\n\nThe water speaks, calm and cold. "Queen Elowen asked for the Tear once. She paid. Will you? The Tear keeps this swamp clean. Take it, and the water turns foul. Or give me something of equal worth, and I will make another drop in a hundred years."`,
    dm: `TOUGH CHOICE. Options the spirit accepts:\n1) Just take the Tear: the swamp village's water goes bad. Wenna's people must leave their homes. (They will remember.)\n2) A hero gives a precious memory: the spirit takes one of their happiest memories forever (player picks; roleplay it). The swamp stays clean.\n3) A hero gives up years of life: they age 20 years. The swamp stays clean.\n4) Clever ideas: let the players bargain. The spirit is fair and literal.\nIf they attack the spirit, it summons wisps (2) and the Tear sinks; they must then take it by force (Strength DC 15, the water burns cold for 2d6).\nTHE TEAR OF THE MOON: its carrier sees through illusions and shapechanges within 30 ft. In the final battle it reveals Malzareth's true form.`,
    milestone: 'next',
  },

  /* ===== Act III-B: The Heart of Embers ===== */
  {
    title: 'Cinderpeak Pass',
    scene: 'db-pass',
    readAloud:
      `The mountain road climbs into thin, cold air. Far below, the world spreads out like a map, and in the east the red sky is darker than ever.\n\nScreeching echoes off the cliffs. Winged women with talons drop from the rocks above, singing a song that makes your legs want to walk off the edge. Behind them a huge ogre stomps out of a cave, dragging a tree trunk like a club.`,
    dm: `Harpies use their Luring Song (Wisdom save DC 11 or be charmed and walk toward them, even off ledges: falling = 2d6 per 10 ft). Loose scree on the slope is a trap.\nThe ogre is hungry and stupid: a clever hero can trick it (offer food: Persuasion DC 12) and it leaves.`,
    encounter: [['harpy', 2], ['ogre', 1]],
  },
  {
    title: 'The Ember Forge',
    scene: 'db-forge',
    readAloud:
      `Deep inside the mountain the air shimmers with heat. Rivers of lava run in stone channels. Hammers hang on the walls, rows of them, each one sized for dwarven hands.\n\nAt the far end stands a great anvil glowing red. Something beats on it, slow and steady, like a heart. Between you and it, black hounds with smoke curling from their jaws lift their heads and growl.`,
    dm: `The cult sent hell hounds to guard the forge. The ghost of THRAIN ASHBEARD, the last forgemaster, appears once the hounds are dead (or helps during the fight by pulling a lever to flood one lava channel).\nOn the anvil: THE HEART OF EMBERS (fire resistance for whoever carries it).\nThrain also tells them HOW to remake the Dawnblade: "Bring the three relics and the broken blade to any forge. Lay them together and strike once with a true heart." He gives his own Flame Tongue sword to the hero he likes most.\nTOUGH CHOICE: Thrain asks the heroes to stay one night and rekindle the forge so his spirit can rest. If they do, they lose a day (the curse spreads: one more minion in the final battle) but Thrain blesses their weapons (+1 to hit for the final battle).`,
    encounter: [['hell-hound', 2]],
    milestone: 'next',
  },

  /* ===== Act III-C: The Starlight Hilt ===== */
  {
    title: 'The Starfall Archive',
    scene: 'db-library',
    readAloud:
      `A tower of white stone stands alone on a plain, its roof shaped like a star. Inside, endless shelves climb into darkness. Dust lies thick on everything except a single desk, where a nervous little man looks up from his book.\n\n"Visitors! Oh dear. Oh dear oh dear. Please don't touch the third chest by the window. It isn't a chest."`,
    dm: `Archivist Quill has hidden here for months. He knows the riddle that opens the tomb below:\n"I am seen only in the dark, I guide sailors, and I fell to make a sword. Walk my path from north to dawn."\nAnswer: a star. The floor is a star map; pressing the stars from north to east opens the stairs (Investigation DC 14 or solving the riddle).\nOne chest by the window is a MIMIC. The reading desk holds a Wand of Magic Missiles and Ser Varric's journal: he was Queen Elowen's champion, and he swore to guard the hilt "until a worthy hand comes".`,
    encounter: [['mimic', 1]],
  },
  {
    title: 'The Tomb of Ser Varric',
    scene: 'db-crypt',
    readAloud:
      `Cold stairs spiral down into a long hall of stone coffins. Your breath turns to mist. At the end, on a raised slab, lies a knight in silver armour gone grey with age, his hands folded on the hilt of a sword with no blade.\n\nHis eyes open. They burn pale blue. "Three hundred years," he whispers. "Are you worthy? Or are you His?"`,
    dm: `Ser Varric is a WIGHT, bound here by his oath. He is not evil but the curse has twisted him.\nTOUGH CHOICE:\n1) Fight him: he and two specters attack. Win and take the Starlight Hilt.\n2) Prove worth: he asks each hero one question: "What would you give up to defeat the King?" Good, honest answers (DM judges) earn his respect. Then he gives the hilt and asks to be released: if the heroes agree (a short ritual), he finds peace.\n3) Promise him revenge: he joins them as a spirit and fights at their side in the final battle (Wight stats, cannot leave the throne room), but he never rests.\nGrave-dust vents in the floor (Perception DC 13).`,
    encounter: [['wight', 1, 'Ser Varric'], ['specter', 2]],
    milestone: 'next',
  },

  /* ===== Act IV: The Cursed Land ===== */
  {
    act: 'Act IV: The Demon King',
    title: 'Remaking the Dawnblade',
    scene: 'db-square',
    readAloud:
      `Back in Thornwick, Sela's forge roars hotter than it ever has. You lay out what you have carried across half the world: the broken blade, and beside it the Tear of the Moon, the Heart of Embers and the Starlight Hilt.\n\nThe relics begin to glow. The shards slide together. Someone must lift the hammer and strike once.`,
    dm: `Let the party choose who strikes; that hero becomes the bearer of the DAWNBLADE (a +2 longsword that deals an extra 2d8 radiant damage to fiends and undead and sheds bright light 20 ft). Any hero proficient with martial weapons can use it; others become proficient while holding it.\nIf the party is missing a relic (they lost it, or chose not to take it), the blade is weaker: only +1, and +1d8 radiant.\nMaren gives the heroes her blessing and her last gift: 4 potions of healing.\nRemember: Odo the merchant (cultist). If he wasn't dealt with, he tries to steal the blade tonight (stealth contest; or a spy fight in the inn).`,
  },
  {
    title: 'The Ashen Wastes',
    scene: 'db-wastes',
    readAloud:
      `East of the last green hill the world turns grey. Ash falls like snow. Dead trees, dry riverbeds, the bones of villages. The red sky presses down on you, and on the horizon a castle of black stone stands with a single burning window at its top.\n\nThe ground ahead shifts. Hyena-headed raiders rise from the ash, and behind them pale, hungry figures crawl from a ruined graveyard.`,
    dm: `The curse: short rests here only heal half. Gnolls and ghouls, hungry and wild.\nThe Ash Pilgrim can guide the heroes to the castle's side gate (skipping the front gate battle) if they share food or water, or pay 50 gold. A hero who shows kindness gets a secret: "The King fears his own face. Show it to him."\n(That hints at the Tear of the Moon.)`,
    encounter: [['gnoll', 3], ['ghoul', 2]],
  },
  {
    title: 'The castle dungeons',
    scene: 'db-castle',
    readAloud:
      `You slip into Castle Malzar through the lowest gate. The dungeons stink of smoke and old fear. Chains rattle somewhere ahead. Stone creatures perched on the arches stretch their wings and turn their heads.\n\nBeyond them, behind iron bars, a knight in dented armour grips the bars and calls out: "If you're here to kill him, get me out of here and give me a sword!"`,
    dm: `Gargoyles on the arches and the minotaur jailer. A fire-grate trap in the middle corridor (Perception DC 14).\nSer Liane is a captured knight. Freed, she fights beside the heroes in the final battle (give her Knight stats; she is controlled by the DM or a player).\nThe jailer's locker: keys to the throne room's side door (the heroes can enter without the throne room guards seeing them: surprise round), a Potion of Greater Healing and a Ring of Protection.\nThis is the last safe-ish place: let them take a short rest before the end.`,
    encounter: [['gargoyle', 2], ['minotaur', 1, 'The Jailer']],
  },
  {
    title: 'The Throne of Ash',
    scene: 'db-throne',
    readAloud:
      `The throne room is vast and dark. Pillars of black stone rise into shadow, and a carpet of ash leads to a throne carved from a single cracked rock. On it sits a tall man in a crown of iron thorns, handsome and calm, chin resting on one fist.\n\n"Heroes," says MALZARETH. "From Thornwick. I know all about you. Your choices. Your little bargains." He smiles. "Put down that sword and I will give each of you whatever you want most. A kingdom. A lost love back. Or keep it, and die here, the way the last ones did."`,
    dm: `THE OFFER (tough choice, let them talk): he truly offers each hero their heart's desire. Anyone who accepts must give up the Dawnblade; the others can still fight. Roleplay it. He keeps his promises in the most twisted way possible.\n\nTHE FIGHT: Malzareth uses the Glabrezu stat block (he looks human until the Tear of the Moon shows his true four-armed demon form; without the Tear, the heroes have disadvantage on attacks against him for the first round). Two quasits and dretches serve him.\nRelics: Heart of Embers = resistance to his fire. Tear of the Moon = no disadvantage, his illusions fail. Starlight Hilt + blade = the Dawnblade's radiant damage.\nBalance: this is the hardest fight of the campaign. With all three relics, the Dawnblade's light burns him as the fight starts: set his HP to 110 on his token. For each relic the party DID NOT bring: +30 HP and +2 dretches. With 3 or fewer heroes, drop the quasits. If the heroes are about to fall, let an ally from their earlier choices burst in.\nAllies who may arrive (from earlier choices): Ser Liane, Ser Varric's spirit, 6 goblin archers, Garrick's crew.\nAt half HP he grows to his full height and the throne room starts to crumble (difficult terrain spreads).\nHe dies only to the Dawnblade's final blow (the next beat, Dawn, covers what happens to the blade).`,
    encounter: [['glabrezu', 1, 'Malzareth, the Demon King'], ['quasit', 2], ['dretch', 2]],
  },
  {
    title: 'Dawn',
    scene: 'db-throne',
    readAloud:
      `With a scream like a forge cooling, the Demon King breaks apart into ash and red light. The light rushes into the Dawnblade, and the blade begins to crack.\n\nOutside, for the first time in months, the sky turns grey, then gold. The sun comes up over the cursed land, and where it touches the ash, small green things push up through it.`,
    dm: `FINAL CHOICE: the Dawnblade holds Malzareth's essence now.\n1) Shatter it again and hide the relics, as Elowen did: he is gone for another age, maybe forever.\n2) Keep it whole: a mighty weapon, but it whispers to its bearer (every year, Wisdom save DC 15 or do one cruel thing).\n3) Give it to the Moonwell spirit, Thrain's forge or Ser Varric's tomb: each will keep it safe, at a price (DM's choice).\n\nEpilogue: go around the table. Ask each player what their hero does now. Then show what the heroes' choices did: the swamp village, the goblins, Garrick, Thornwick, Odo. Grant a final level and a hero's welcome in Thornwick.`,
    milestone: 'next',
  },
];

/* ---------------- as DM beats ---------------- */

export const DAWNBLADE = {
  key: 'dawnblade',
  dmOnly: true,
  leveling: 'milestone',
  name: 'The Dawnblade',
  tagline: 'The Demon King stirs in the cursed east. Gather three relics, remake the blade, and end him.',
  blurb: 'A long campaign for a DM: a beginner town, three relic quests in any order, hard choices that come back at the end, and a final battle in a dark castle.',
  levels: 'Levels 1-7',
  length: 'Several sessions (8-12 hours)',
  buildScenes,
  steps: STEPS,
};

const SRD_NAMES = {
  'animated-armor': 'Animated Armor', bandit: 'Bandit', thug: 'Thug', 'bandit-captain': 'Bandit Captain', worg: 'Worg', goblin: 'Goblin',
  'cult-fanatic': 'Cult Fanatic', cultist: 'Cultist', 'giant-spider': 'Giant Spider', ettercap: 'Ettercap', 'will-o-wisp': "Will-o'-Wisp",
  lizardfolk: 'Lizardfolk', harpy: 'Harpy', ogre: 'Ogre', 'hell-hound': 'Hell Hound', mimic: 'Mimic', wight: 'Wight', specter: 'Specter',
  gnoll: 'Gnoll', ghoul: 'Ghoul', gargoyle: 'Gargoyle', minotaur: 'Minotaur', glabrezu: 'Glabrezu', quasit: 'Quasit', dretch: 'Dretch',
};

/** One Prep beat per step: read-aloud, DM notes (with the level-up reminder) and the fight. */
export function dawnbladeBeats(sceneIdFor) {
  let level = 1;
  return STEPS.map((st) => {
    let lvl = '';
    if (st.milestone) {
      level = st.milestone === 'next' ? level + 1 : st.milestone;
      lvl = `LEVEL UP when this beat is done: grant a level (More > Campaign settings > Grant a level). ${level >= 4 && level <= 6 ? 'Relic quests can run in any order: one level per relic, so after all three they are level 6.' : `The heroes should now be level ${level}.`}`;
    }
    const enc = (st.encounter || []).map(([monsterIndex, count, name]) => ({ monsterIndex, count, name: name || SRD_NAMES[monsterIndex] || monsterIndex }));
    const notes = [
      st.act ? `${st.act.toUpperCase()}` : '',
      st.dm,
      enc.length ? 'The fight is balanced for 4 heroes: remove one creature per missing hero, add one per extra hero.' : '',
      lvl,
    ].filter(Boolean).join('\n\n');
    return { title: st.title, sceneId: sceneIdFor(st.scene), readAloud: st.readAloud, notes, encounter: enc };
  });
}
