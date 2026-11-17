import { generateMap } from './mapKit';
import { TILES } from './tiles';
import { buildEncounter, describeEncounter, seeded } from './encounters';

// Ready-made pieces for running a game fast: people to drop in, loot and
// traps to place, whole scenes from a template, and a short campaign built
// from a theme in two clicks. Creature stats come from the SRD 5.1 monster
// list (open content); everything else here is written for this app.

/* ================= people ================= */

const NAMES = {
  feminine: ['Marta', 'Isolde', 'Wren', 'Hilde', 'Brina', 'Esme', 'Tamsin', 'Odile', 'Yara', 'Nell', 'Greta', 'Sorcha', 'Liesl', 'Mira'],
  masculine: ['Brannoc', 'Aldo', 'Cormac', 'Tobin', 'Garrick', 'Osric', 'Fenn', 'Hamish', 'Ulric', 'Piet', 'Dunstan', 'Emeric', 'Bram', 'Jory'],
};

// stats: an SRD creature whose numbers the person borrows (HP, AC, attack)
export const NPC_PRESETS = [
  { key: 'innkeeper', role: 'Innkeeper', color: '#c98a4b', stats: 'commoner', note: 'Warm, nosy, and knows every rumour in town.' },
  { key: 'guard', role: 'Guard', color: '#5f87a8', stats: 'guard', note: 'Bored until something happens. Then very loud.' },
  { key: 'merchant', role: 'Merchant', color: '#7fb069', stats: 'commoner', note: 'Will sell anything, for a price. Haggles for fun.' },
  { key: 'noble', role: 'Noble', color: '#b06ab0', stats: 'noble', note: 'Used to being obeyed. Needs the heroes more than they admit.' },
  { key: 'villager', role: 'Villager', color: '#a5b05f', stats: 'commoner', note: 'Frightened, honest, and hungry for news.' },
  { key: 'smith', role: 'Smith', color: '#c2542e', stats: 'commoner', note: 'Strong arms, short temper, fair prices.' },
  { key: 'scholar', role: 'Scholar', color: '#8f7fd4', stats: 'commoner', note: 'Knows old maps and older stories. Easily distracted.' },
  { key: 'hunter', role: 'Hunter', color: '#5fb0a5', stats: 'scout', note: 'Knows the woods. Has seen tracks that worry her.' },
  { key: 'informant', role: 'Informant', color: '#806b4e', stats: 'spy', note: 'Sells secrets to anyone. Lies when it pays.' },
  { key: 'sellsword', role: 'Sellsword', color: '#8a6a3d', stats: 'thug', note: 'Fights for coin. Might switch sides for more.' },
  { key: 'captive', role: 'Captive', color: '#d4a94f', stats: 'commoner', note: 'Bound and gagged. Very grateful if freed.' },
  { key: 'child', role: 'Child', color: '#e0c060', stats: null, hp: 2, note: 'Saw everything. Will only talk to the kindest hero.' },
];

export function npcName(preset, r = Math.random) {
  const body = r() < 0.5 ? 'feminine' : 'masculine';
  const pool = NAMES[body];
  const name = pool[Math.floor(r() * pool.length)];
  return { label: `${name} the ${preset.role.toLowerCase()}`.slice(0, 40), body };
}

/* ================= loot, traps and other things ================= */

const tier = (level) => (level >= 11 ? 2 : level >= 5 ? 1 : 0);
const LOOT = [
  [
    '14 gold pieces and a potion of healing.',
    'A pouch of 23 silver pieces and a silver ring worth 25 gp.',
    'A potion of healing, a fine dagger and 8 gold pieces.',
    '35 gold pieces wrapped in a scrap of an old map.',
    'Two potions of healing and a bag of 40 copper pieces.',
  ],
  [
    '120 gold pieces, two potions of healing and a +1 shield.',
    'A bag of holding with 90 gold pieces inside.',
    'A cloak of protection folded around 60 gold pieces.',
    'A wand of magic missiles and three small gems (50 gp each).',
    '200 gold pieces and a potion of greater healing.',
  ],
  [
    '900 gold pieces, a potion of superior healing and a +2 weapon.',
    'A ring of protection and a chest of 1,200 gold pieces.',
    'Boots of speed and four gems worth 250 gp each.',
    'A staff of the woodlands and 700 gold pieces in a lacquered box.',
  ],
];

const trapDc = (level) => [12, 15, 18][tier(level)];
const trapDamage = (level, small, mid, big) => [small, mid, big][tier(level)];

// Each makes a placeObject payload (server/socket/dmTools.js cleans it).
export const THING_PRESETS = [
  { key: 'chest', name: 'Treasure chest', hint: 'Loot for the party\'s level', make: (lvl, r) => ({ kind: 'chest', name: 'Chest', effects: [{ type: 'loot', text: LOOT[tier(lvl)][Math.floor(r() * LOOT[tier(lvl)].length)] }] }) },
  { key: 'potions', name: 'Healing potions', hint: 'A satchel with two potions', make: () => ({ kind: 'chest', name: 'Satchel', effects: [{ type: 'loot', text: 'A satchel, carefully wrapped.', items: [{ kind: 'potion', name: 'Potion of Healing', qty: 2, magic: true, desc: 'Regain 2d4 + 2 hit points.', stats: { heal: '2d4+2' } }] }] }) },
  { key: 'pit', name: 'Pit trap', hint: 'Hidden; DEX save or fall', make: (lvl) => ({ kind: 'trap', name: 'Pit trap', dc: trapDc(lvl), effects: [{ type: 'damage', damage: trapDamage(lvl, '2d6', '4d6', '10d6'), damageType: 'bludgeoning', save: 'dex', saveDc: trapDc(lvl), text: 'The floor gives way!' }] }) },
  { key: 'darts', name: 'Dart trap', hint: 'Hidden; poisoned darts', make: (lvl) => ({ kind: 'trap', name: 'Dart trap', dc: trapDc(lvl), effects: [{ type: 'damage', damage: trapDamage(lvl, '1d4+2', '3d6', '8d6'), damageType: 'poison', save: 'con', saveDc: trapDc(lvl), text: 'Click. Darts hiss out of the wall!' }] }) },
  { key: 'secret', name: 'Hidden passage', hint: 'Found by searching', make: (lvl) => ({ kind: 'secret', name: 'Hidden passage', dc: trapDc(lvl) + 1, effects: [{ type: 'text', text: 'A draught from behind the stones: a hidden way through.' }] }) },
  { key: 'note', name: 'A note', hint: 'Only the reader sees it', make: () => ({ kind: 'note', name: 'Crumpled note', effects: [{ type: 'text', private: true, text: 'Meet me at the old mill when the bell tolls twice. Come alone.' }] }) },
  { key: 'lever', name: 'Lever', hint: 'Link it to doors', make: () => ({ kind: 'lever', name: 'Lever' }) },
  { key: 'exit', name: 'Way on', hint: 'Walk onto it to change scene', make: () => ({ kind: 'exit', name: 'Way on' }) },
];

/** An ambush: a hidden event square that brings a group out when a hero steps on it. */
export function ambushObject(themeKey, party, seed) {
  const enc = buildEncounter(themeKey, { ...party, difficulty: 'moderate', seed });
  return {
    kind: 'zone',
    name: 'Ambush',
    effects: [
      { type: 'text', text: 'Shapes break from cover. It\'s an ambush!' },
      { type: 'spawn', monsters: enc.groups.slice(0, 8).map((g) => ({ index: g.index, count: Math.min(6, g.count) })) },
    ],
  };
}

/* ================= scene templates ================= */

// gen: a generator in mapKit.js. theme: the creatures that fit (encounters.js).
export const SCENE_TEMPLATES = [
  { key: 'tavern', name: 'Tavern', gen: 'tavern', w: 22, h: 15, theme: 'bandits', npcs: ['innkeeper', 'merchant', 'villager'], mood: { music: 'tavern' },
    blurb: 'A common room: bar, hearth, tables.', read: 'Warm light, loud talk and the smell of stew. Every head turns when the door opens, then turns back to its drink.' },
  { key: 'crypt', name: 'Crypt', gen: 'crypt', w: 22, h: 13, theme: 'undead', fog: true, mood: { music: 'tension' },
    blurb: 'Grave alcoves, bones and a sealed door.', read: 'Cold air, still as held breath. Names worn off the stones. Something has been scratching at the far door from the inside.' },
  { key: 'clearing', name: 'Forest clearing', gen: 'forest', w: 26, h: 18, theme: 'wolves', mood: { time: 'day' },
    blurb: 'Trees thick at the edges, a path, a fire.', read: 'Sunlight falls through the leaves onto a trampled clearing. The fire is cold, but whoever left it has not gone far.' },
  { key: 'cave', name: 'Cave', gen: 'cave', w: 28, h: 20, theme: 'caves', fog: true, mood: { music: 'sneak' },
    blurb: 'Twisting rock, a pool, mushrooms.', read: 'Water drips somewhere in the dark. Your light catches pale fungus and, for a moment, something that moves away from it.' },
  { key: 'ambush', name: 'Road ambush', gen: 'road', w: 30, h: 18, theme: 'bandits', mood: { time: 'dusk' },
    blurb: 'A road through woods, a wrecked cart.', read: 'A cart lies on its side across the road, one wheel still turning. No driver. The woods on either side have gone very quiet.' },
  { key: 'throne', name: 'Throne room', gen: 'throne', w: 22, h: 16, theme: 'guards', npcs: ['noble', 'guard', 'guard'], mood: { music: 'tension' },
    blurb: 'Carpet to a raised throne, pillars, banners.', read: 'Banners hang still above a long red carpet. At its end, on the raised seat, someone has been waiting for you.' },
  { key: 'corridor', name: 'Dungeon corridor', gen: 'corridor', w: 30, h: 15, theme: 'goblins', fog: true, mood: { music: 'sneak' },
    blurb: 'A long passage with cells off it.', read: 'A long passage, torches guttering in their brackets. Doors on either side. One of them is not quite closed.' },
  { key: 'dungeon', name: 'Dungeon', gen: 'dungeon', w: 34, h: 24, theme: 'kobolds', fog: true, mood: { music: 'explore' },
    blurb: 'Rooms joined by corridors.', read: 'Stone steps lead down into a maze of rooms. The air tastes of dust and old smoke.' },
  { key: 'camp', name: 'Raider camp', gen: 'camp', w: 26, h: 20, theme: 'goblins', mood: { time: 'night' },
    blurb: 'A palisade, fires and plunder.', read: 'Firelight behind a rough palisade. Laughter, the clank of stolen pots, and a gap in the stakes just wide enough to slip through.' },
  { key: 'ruins', name: 'Ruins', gen: 'ruins', w: 28, h: 20, theme: 'spiders', mood: { time: 'day' },
    blurb: 'Broken walls in long grass.', read: 'Broken walls rise from the grass like old teeth. Webs glint between the stones, thick as rope in places.' },
];
export const templateByKey = (key) => SCENE_TEMPLATES.find((t) => t.key === key) || SCENE_TEMPLATES[0];

const walkable = (ch) => !TILES[ch]?.blocked && !'t21ERJ)BbC!cGKMN?}$'.includes(ch);

/** Where the party comes in: inside a door on the edge if there is one, else bottom middle. */
export function entryOf(cells) {
  const h = cells.length, w = cells[0].length;
  const at = (x, y) => cells[y]?.[x];
  const edges = [];
  for (let x = 0; x < w; x++) edges.push([x, h - 1, 0, -1], [x, 0, 0, 1]);
  for (let y = 0; y < h; y++) edges.push([0, y, 1, 0], [w - 1, y, -1, 0]);
  for (const [x, y, dx, dy] of edges) if ('Dd'.includes(at(x, y)) && walkable(at(x + dx, y + dy))) return { x: x + dx, y: y + dy };
  for (let y = h - 1; y >= 0; y--) for (let d = 0; d < w / 2; d++) for (const x of [Math.floor(w / 2) - d, Math.floor(w / 2) + d]) if (walkable(at(x, y))) return { x, y };
  return { x: Math.floor(w / 2), y: h - 2 };
}

/** The walkable square farthest (on foot) from `from`: where the creatures wait. */
export function farPoint(cells, from) {
  const h = cells.length, w = cells[0].length;
  const seen = new Set([`${from.x},${from.y}`]);
  let q = [from], last = from;
  while (q.length) {
    const next = [];
    for (const c of q) {
      last = c;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c.x + dx, y = c.y + dy, k = `${x},${y}`;
        if (x < 0 || y < 0 || x >= w || y >= h || seen.has(k)) continue;
        const ch = cells[y][x];
        if (!walkable(ch) && !'Dd'.includes(ch)) continue;
        seen.add(k); next.push({ x, y });
      }
    }
    q = next;
  }
  return last;
}

/** A scene payload (for addScene) from a template, plus the people in it. */
export function sceneFromTemplate(tpl, { seed = Date.now(), name } = {}) {
  const t = typeof tpl === 'string' ? templateByKey(tpl) : tpl;
  const { cells, floor } = generateMap(t.gen, t.w, t.h, seed);
  const entry = entryOf(cells);
  const r = seeded(seed + 7);
  const free = [];
  for (let y = 1; y < t.h - 1; y++) for (let x = 1; x < t.w - 1; x++) if (walkable(cells[y][x])) free.push({ x, y });
  const tokens = (t.npcs || []).map((key) => {
    const p = NPC_PRESETS.find((n) => n.key === key);
    // the innkeeper stands behind the bar (row 1 of a generated tavern)
    const pool = key === 'innkeeper' && t.gen === 'tavern' ? free.filter((c) => c.y === 1) : free;
    const pick = pool.length ? pool[Math.floor(r() * pool.length)] : null;
    const spot = (pick && free.splice(free.indexOf(pick), 1)[0]) || entry;
    const who = npcName(p, r);
    return { kind: 'npc', label: who.label, body: who.body, color: p.color, note: p.note, x: spot.x, y: spot.y, art: 'humanoid' };
  });
  return {
    name: (name || t.name).slice(0, 60), floor, cells, w: t.w, h: t.h, entry, tokens,
    fogEnabled: !!t.fog, notes: t.blurb, mood: { time: 'auto', weather: 'none', light: 1, music: 'auto', ...(t.mood || {}) },
  };
}

/* ================= quick campaigns ================= */

// A short campaign from a theme: four scenes, each with a story beat, its
// read-aloud, the fight waiting there (balanced when it's built) and a chest
// at the end.
export const QUICK_CAMPAIGNS = [
  {
    key: 'goblin-trouble', name: 'Goblin trouble', blurb: 'Raiders hit the village. Follow them to their camp, and the chief beneath it.',
    steps: [
      { tpl: 'tavern', name: 'The Crooked Lantern', beat: 'A plea for help', read: 'The innkeeper slams down a tankard. "Third farm this month. Goblins, bold as you like. Somebody has to go after them."', notes: 'The innkeeper offers 50 gp. A villager saw the raiders take the mill road.' },
      { tpl: 'ambush', name: 'The Mill Road', beat: 'Ambush on the road', theme: 'goblins', diff: 'low', read: 'Fresh tracks, small and many, cross the road. Then the bushes rustle.', notes: 'The goblins flee toward their camp when half are down.' },
      { tpl: 'camp', name: 'The Raider Camp', beat: 'The raider camp', theme: 'goblins', diff: 'moderate', read: 'Smoke rises over a ring of sharpened stakes. Stolen hens squawk in a cage by the fire.', notes: 'A tunnel under the biggest tent leads down to the warren.' },
      { tpl: 'cave', name: 'The Warren', beat: 'The chief', theme: 'goblins', diff: 'high', read: 'The tunnel opens into a stinking cave. On a heap of stolen sacks sits the one giving the orders.', notes: 'The chief bargains if bloodied: the stolen goods for its life.', loot: true },
    ],
  },
  {
    key: 'restless-dead', name: 'The restless dead', blurb: 'Graves stand open in the old cemetery. Something below is calling the dead.',
    steps: [
      { tpl: 'tavern', name: 'The Gravedigger\'s Rest', beat: 'Open graves', read: 'The gravedigger has not stopped shaking. "Empty. All of them. Dug out from underneath."', notes: 'The old ruin on the hill has a stair down to the family crypt.' },
      { tpl: 'ruins', name: 'The Hill Ruins', beat: 'The ruin on the hill', theme: 'spiders', diff: 'low', read: 'The old walls are long gone. Only the stair remains, choked with webs.', notes: 'A loose stone hides the crypt key.' },
      { tpl: 'corridor', name: 'The Ossuary Passage', beat: 'Bones that walk', theme: 'undead', diff: 'moderate', read: 'Bones line the walls in neat stacks. Some of the stacks are missing pieces. Some of the pieces are moving.', notes: 'Cold spots mark where the dead were raised.' },
      { tpl: 'crypt', name: 'The Old Crypt', beat: 'Whoever calls them', theme: 'undead', diff: 'high', read: 'At the end of the crypt the sealed door stands open. Pale light, and a voice that should not be speaking.', notes: 'Destroying the leader lays every raised body to rest.', loot: true },
    ],
  },
  {
    key: 'greenwood', name: 'Wolves of the Greenwood', blurb: 'Hunters are going missing in the woods, and the wolves have grown bold.',
    steps: [
      { tpl: 'tavern', name: 'The Hunter\'s Horn', beat: 'Missing hunters', read: 'A hunter\'s horn hangs over the bar, cracked down the middle. "Found it on the trail," says the keeper. "No sign of Bram."', notes: 'A hunter NPC can guide them; she saw huge tracks.' },
      { tpl: 'clearing', name: 'The Glade', beat: 'Into the woods', theme: 'wolves', diff: 'low', read: 'The trail ends at a clearing ringed by tall trees. Grey shapes pace between the trunks.', notes: 'Bram\'s pack lies by the fire; a map in it marks a cave.' },
      { tpl: 'ambush', name: 'The Old Logging Road', beat: 'Poachers', theme: 'bandits', diff: 'moderate', read: 'Someone has been setting traps along the road. Big ones. And here they come to check them.', notes: 'The poachers have been feeding the wolves to keep them close.' },
      { tpl: 'cave', name: 'The Den', beat: 'The den', theme: 'wolves', diff: 'high', read: 'The cave stinks of wet fur. Deep inside, something much bigger than a wolf raises its head.', notes: 'Bram is alive, tied up near the back.', loot: true },
    ],
  },
  {
    key: 'bandit-king', name: 'The bandit king', blurb: 'The roads are not safe. Someone has hired an army of cutthroats, and given them a throne.',
    steps: [
      { tpl: 'tavern', name: 'The Waystation', beat: 'A merchant\'s offer', read: 'A merchant with a black eye pushes a purse across the table. "The road to the city. Clear it, and this is yours."', notes: 'The merchant knows the bandits wear a crowned-coin badge.' },
      { tpl: 'ambush', name: 'The King\'s Road', beat: 'Road ambush', theme: 'bandits', diff: 'low', read: 'A tree has been felled across the road. Too neatly. Figures step out with crossbows raised.', notes: 'A captured bandit talks about the hold in the old ruins.' },
      { tpl: 'ruins', name: 'The Broken Hold', beat: 'The outer hold', theme: 'bandits', diff: 'moderate', read: 'Lookouts on the broken walls, a fire in the old yard. Beyond, a door into the one hall still standing.', notes: 'A guard can be bribed for 20 gp to look the other way.' },
      { tpl: 'throne', name: 'The Bandit Court', beat: 'The bandit king', theme: 'bandits', diff: 'high', read: 'A hall full of stolen finery. On a throne built from cart wheels sits the bandit king.', notes: 'The king is a deposed noble; the merchant who hired the heroes was once his steward.', loot: true },
    ],
  },
  {
    key: 'deep-delve', name: 'Into the deep', blurb: 'A mine broke into something older. The miners are gone. Go down and find out why.',
    steps: [
      { tpl: 'tavern', name: 'The Miner\'s Arms', beat: 'The silent mine', read: 'Half the tables are empty. "They broke through into old stonework," the foreman says. "Then the lamps went out."', notes: 'The foreman gives them the mine key and a lantern.' },
      { tpl: 'dungeon', name: 'The Old Works', beat: 'The old works', theme: 'kobolds', diff: 'low', read: 'Past the mine, worked stone: rooms, doors, and the scratch-marks of small claws.', notes: 'The kobolds fled from something below and will bargain.' },
      { tpl: 'corridor', name: 'The Sealed Hall', beat: 'What guards the hall', theme: 'guardians', diff: 'moderate', read: 'A long hall of doors, every one locked. At the far end, armour on stands. One of the helmets turns to watch you.', notes: 'A lever behind the second door opens the way down.' },
      { tpl: 'cave', name: 'The Deep Cavern', beat: 'The thing below', theme: 'caves', diff: 'high', read: 'The stair ends in a vast cave. Fungus glows on the walls. Something heavy shifts in the pool.', notes: 'The missing miners are trapped in a side tunnel.', loot: true },
    ],
  },
];

/**
 * Everything a quick campaign needs, ready to send: scenes (addScenes),
 * beats (addBeat, `scene` = index into scenes), and things (placeObject).
 */
export function buildQuickCampaign(key, { level = 1, size = 4, seed = Date.now() } = {}) {
  const qc = QUICK_CAMPAIGNS.find((c) => c.key === key) || QUICK_CAMPAIGNS[0];
  const scenes = [], beats = [], things = [];
  qc.steps.forEach((step, i) => {
    const scene = sceneFromTemplate(step.tpl, { seed: seed + i * 101, name: step.name });
    scene.notes = step.notes || scene.notes;
    scenes.push(scene);
    const enc = step.theme ? buildEncounter(step.theme, { level, size, difficulty: step.diff || 'moderate', seed: seed + i * 13 }) : null;
    beats.push({
      scene: i,
      title: step.beat,
      readAloud: step.read,
      notes: [step.notes, enc && `Waiting here: ${describeEncounter(enc.groups)} (${enc.total} XP, ${step.diff || 'moderate'} for level ${level}).`].filter(Boolean).join('\n'),
      encounter: enc ? enc.groups.map((g) => ({ monsterIndex: g.index, name: g.name, count: g.count })) : [],
    });
    if (step.loot) {
      const far = farPoint(scene.cells, scene.entry);
      things.push({ scene: i, object: { ...THING_PRESETS[0].make(level, seeded(seed + i)), x: far.x, y: far.y } });
    }
  });
  return { name: qc.name, scenes, beats, things };
}
