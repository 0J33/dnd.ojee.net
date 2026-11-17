// ================= The look catalogue =================
//
// Everything a hero (or a person in the world) can look like, as data. The
// 3D figure builder (world/figures.js), the portrait (components/Portrait.jsx)
// and the look editor (components/PortraitEditor.jsx) all read from here, so
// a choice exists in exactly one place.
//
// A look is layered, like dressing a miniature:
//   who      ancestry (from the sheet), presentation, frame, height
//   face     skin, face shape, eyes, brows, nose, expression, marks
//   hair     style, colour, facial hair
//   clothes  outfit, armour, cloak, headwear, extras
//   gear     main hand, off hand
//   paint    cloth, trim, cloak, leather and metal colours
// Every layer has a default from the ancestry and the class kit, so a hero
// nobody has touched still looks like a deliberate character.

/* ---------------- colours ---------------- */

export const SKIN = {
  porcelain: '#f2d4bf', pale: '#e8c2a4', fair: '#dcab86', honey: '#cf9a68', tan: '#c08a5e', olive: '#a87b52',
  bronze: '#966440', brown: '#82522f', deep: '#623a22', ebony: '#452819',
  grey: '#9aa0a8', green: '#7d9464', red: '#b56a63', scaled: '#8a9a6a', blue: '#7d94b5',
};
export const HUMAN_SKINS = [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.honey, SKIN.tan, SKIN.olive, SKIN.bronze, SKIN.brown, SKIN.deep, SKIN.ebony];

export const HAIR_COLORS = [
  '#16120f', '#2b2018', '#45301e', '#6b4a28', '#8a6a3a', '#b89058', '#e0cc90',
  '#a83a2a', '#c86030', '#e0d8c8', '#8a8a90',
  '#3a3a54', '#4a64b0', '#7a4a9a', '#3a8a6a', '#c85a8a',
];
export const NATURAL_HAIR = HAIR_COLORS.slice(0, 11);

export const EYE_COLORS = {
  brown: '#5a3620', hazel: '#8a6630', green: '#4f8a44', blue: '#4f7fb8', grey: '#8a939c',
  amber: '#c8902c', violet: '#8a64c0', red: '#c83a30', gold: '#e0b440', ice: '#bfe8ff',
};
const E = EYE_COLORS;
export const ROBOT_GLOW = ['#5ef0e0', '#7fd0ff', '#ffb347', '#9dff8a', '#ff6a5a', '#d08aff'];

// Dyes for cloth (outfit, trim, cloak): earthy, dyed-cloth colours that sit
// well on the candle-lit table.
export const CLOTH_COLORS = ['#e2d6bc', '#b8ac94', '#6d6a63', '#2c2c30', '#6b4a28', '#a8643c', '#c8962e', '#8c2e32', '#b8566e', '#5c3466', '#6a4a9a', '#2a3a64', '#5f87a8', '#235a5a', '#2f5032', '#5a6a34', '#8a9a72', '#1c1a1e'];
export const TRIM_COLORS = ['#d8ae4c', '#c8ccd2', '#a8743a', '#e8c476', '#c2542e', '#8f7fd4', '#5f87a8', '#8fae6a', '#ece4d0', '#c94f6d', '#6b4a28', '#2a2622'];
export const LEATHERS = { tan: '#93683e', brown: '#6e4a2a', dark: '#4a301c', black: '#2a2420', red: '#7a3a28', grey: '#6a625a' };
export const METALS = { steel: 'Steel', iron: 'Dark iron', bronze: 'Bronze', gold: 'Gilded', silver: 'Silver', blackened: 'Blackened' };
export const METAL_PAINT = { steel: '#a2aab2', iron: '#5e636a', bronze: '#a8743a', gold: '#d8ae4c', silver: '#d0d4da', blackened: '#3a3c40' };

/* ---------------- who ---------------- */

// Presentation: how the face and body read. It is a look, not a rule, and
// it only steers defaults (hair, facial hair) — every option stays open.
export const BODIES = { feminine: 'Feminine', masculine: 'Masculine', neutral: 'Androgynous' };

// Frame: build, independent of presentation.
export const FRAMES = {
  slight: { label: 'Slight', w: 0.86, d: 0.9, limb: 0.85 },
  lean: { label: 'Lean', w: 0.93, d: 0.95, limb: 0.92 },
  average: { label: 'Average', w: 1, d: 1, limb: 1 },
  athletic: { label: 'Athletic', w: 1.08, d: 1, limb: 1.1, chest: 1.08 },
  broad: { label: 'Broad', w: 1.16, d: 1.08, limb: 1.16 },
  heavy: { label: 'Heavy', w: 1.16, d: 1.24, limb: 1.12, belly: 1.2 },
};
export const HEIGHTS = { short: 'Short', average: 'Average', tall: 'Tall' };
export const HEIGHT_SCALE = { short: 0.93, average: 1, tall: 1.07 };

/* ---------------- face ---------------- */

export const FACES = { oval: 'Oval', round: 'Round', square: 'Square', long: 'Long', heart: 'Heart' };
export const EYE_SHAPES = { round: 'Round', almond: 'Almond', narrow: 'Narrow', wide: 'Wide-set' };
export const BROWS = { soft: 'Soft', straight: 'Straight', arched: 'Arched', heavy: 'Heavy', none: 'None' };
export const NOSES = { button: 'Button', straight: 'Straight', broad: 'Broad', hooked: 'Hooked' };
export const MOODS = { calm: 'Calm', smile: 'Smiling', grin: 'Grinning', stern: 'Stern', smirk: 'Smirking' };
export const MARKS = {
  none: 'None', freckles: 'Freckles', scar: 'Cheek scar', eyescar: 'Eye scar', warpaint: 'War paint',
  tattoo: 'Tattoo', eyepatch: 'Eyepatch', mask: 'Face mask',
};

/* ---------------- hair ---------------- */

// len: how far it falls (0 none .. 3 past the shoulders); the figure builder
// and the portrait both read the key.
export const HAIR_STYLES = {
  bald: 'Bald', shaved: 'Shaved', crop: 'Cropped', swept: 'Swept', quiff: 'Quiff', undercut: 'Undercut',
  mohawk: 'Mohawk', bob: 'Bob', long: 'Long', wild: 'Wild', curls: 'Curls', afro: 'Afro', locs: 'Locs',
  braids: 'Braids', ponytail: 'Ponytail', highpony: 'High tail', bun: 'Bun', topknot: 'Topknot',
};
export const BEARDS = {
  none: 'None', stubble: 'Stubble', moustache: 'Moustache', handlebar: 'Handlebar', goatee: 'Goatee',
  chinstrap: 'Chinstrap', short: 'Short beard', full: 'Full beard', braided: 'Braided beard', forked: 'Forked beard', mutton: 'Mutton chops',
};

/* ---------------- clothes ---------------- */

export const OUTFITS = {
  tunic: 'Tunic', doublet: 'Doublet', coat: 'Long coat', leathers: 'Leathers', robe: 'Robe', vestments: 'Vestments',
  dress: 'Gown', wraps: 'Wraps', furs: 'Furs', apron: 'Work apron',
};
export const ARMOURS = { none: 'None', leather: 'Leather', mail: 'Chain mail', scale: 'Scale', half: 'Breastplate', plate: 'Full plate' };
export const CLOAKS = { none: 'None', cape: 'Short cape', cloak: 'Long cloak', mantle: 'Fur mantle' };
export const HATS = {
  none: 'None', hood: 'Hood', helm: 'Helm', greathelm: 'Great helm', horned: 'Horned helm', wizard: 'Wizard hat',
  widebrim: 'Wide hat', cap: 'Feathered cap', circlet: 'Circlet', bandana: 'Bandana', headwrap: 'Head wrap', antlers: 'Antler crown',
};
export const EXTRAS = {
  pouch: 'Belt pouch', satchel: 'Satchel', scarf: 'Scarf', pauldron: 'Pauldron', bracers: 'Bracers',
  pendant: 'Pendant', quiver: 'Quiver', lute: 'Lute on back', bedroll: 'Bedroll',
};

/* ---------------- gear ---------------- */

export const MAIN_HANDS = {
  none: 'Nothing', sword: 'Sword', rapier: 'Rapier', greatsword: 'Greatsword', axe: 'Axe', greataxe: 'Greataxe',
  mace: 'Mace', hammer: 'Warhammer', spear: 'Spear', staff: 'Staff', wand: 'Wand', dagger: 'Dagger',
  bow: 'Bow', crossbow: 'Crossbow', lute: 'Lute', pitchfork: 'Pitchfork', mug: 'Tankard',
};
export const OFF_HANDS = {
  none: 'Nothing', shield: 'Round shield', kite: 'Kite shield', buckler: 'Buckler', dagger: 'Dagger',
  torch: 'Torch', lantern: 'Lantern', orb: 'Orb', book: 'Tome',
};
// Things that need both hands: the off hand stays empty.
export const TWO_HANDED = new Set(['greatsword', 'greataxe', 'hammer', 'spear', 'staff', 'bow', 'crossbow', 'lute', 'pitchfork']);

/* ---------------- gearforged ---------------- */

export const ROBOT_HEADS = { visor: 'Visor', dome: 'Dome', crest: 'Crested', grille: 'Grille' };
export const ROBOT_FINISHES = { polished: 'Polished', worn: 'Worn', rusted: 'Rusted' };
export const ROBOT_ACCENTS = ['#c8a050', '#b8734e', '#a8aeb5', '#e8d8a0', '#5ef0e0', '#7fd0ff', '#ff8a4a', '#c94f6d', '#8fe07a', '#b07aff', '#2a2d33'];

/* ---------------- ancestries ---------------- */
// What the ancestry gives the face and body. The figure and the portrait
// both read these flags.
//   build   body width        face    default face shape     jaw  0.35 fine .. 0.66 heavy
//   ears    round | point | halfpoint | frill | cat | bolt | none
//   beard   [chance, kinds] for a masculine or unset presentation
//   features: tusks horns snout slit hairless crest markings robot antlers
//             cat fangs glowEyes spines bull cap ghostly bigNose bushy

const COMMON_BEARDS = ['stubble', 'moustache', 'goatee', 'short', 'full', 'chinstrap'];

export const RACES = {
  human: { skins: HUMAN_SKINS, ears: 'round', build: 1, face: 'oval', jaw: 0.5, eyes: [E.brown, E.brown, E.hazel, E.blue, E.green, E.grey], beard: [0.4, COMMON_BEARDS] },
  elf: { skins: [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown], ears: 'point', build: 0.94, face: 'long', longFace: true, jaw: 0.36, eyes: [E.green, E.blue, E.hazel, E.violet, E.gold, E.grey], eyeShape: 'almond' },
  'half-elf': { skins: HUMAN_SKINS, ears: 'halfpoint', build: 0.97, face: 'heart', jaw: 0.44, eyes: [E.green, E.blue, E.hazel, E.brown, E.grey], beard: [0.25, ['stubble', 'goatee', 'short']] },
  dwarf: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown, SKIN.deep], ears: 'round', build: 1.14, face: 'square', jaw: 0.62, bushy: true, bigNose: true, nose: 'broad', short: true, eyes: [E.brown, E.grey, E.blue, E.hazel], beard: [1, ['full', 'braided', 'forked', 'full', 'short']] },
  halfling: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.olive, SKIN.brown, SKIN.deep], ears: 'halfpoint', build: 0.9, face: 'round', roundFace: true, jaw: 0.55, nose: 'button', eyes: [E.brown, E.hazel, E.green, E.blue], beard: [0.12, ['stubble', 'mutton']] },
  gnome: { skins: [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.tan], ears: 'point', build: 0.88, face: 'round', roundFace: true, jaw: 0.55, bigNose: true, nose: 'button', eyes: [E.blue, E.green, E.hazel, E.violet, E.brown], beard: [0.55, ['short', 'moustache', 'goatee', 'full', 'handlebar']] },
  'half-orc': { skins: [SKIN.green, SKIN.grey, '#8a8a6a', SKIN.brown], ears: 'point', build: 1.16, face: 'square', jaw: 0.66, tusks: true, bigNose: true, nose: 'broad', eyes: [E.brown, E.amber, E.red, E.grey], beard: [0.3, ['stubble', 'goatee', 'short']] },
  dragonborn: { skins: [SKIN.scaled, SKIN.red, SKIN.blue, SKIN.grey, '#b89a4a', '#4a5a4a', '#c8ccd0'], ears: 'frill', build: 1.1, face: 'long', jaw: 0.6, snout: true, slit: true, hairless: true, crest: true, eyes: [E.gold, E.amber, E.red, E.green] },
  tiefling: { skins: [SKIN.red, '#9a4a6a', '#6a4a8a', SKIN.tan, SKIN.deep], ears: 'point', build: 1, face: 'heart', jaw: 0.45, horns: true, tail: true, glowEyes: true, eyes: [E.gold, E.red, E.amber, E.violet], hairColors: ['#16120f', '#2b2018', '#3a2a4a', '#5a2a3a', '#3a3a54', '#7a4a9a'], beard: [0.25, ['goatee', 'stubble']] },

  // ---- SRD 5.2
  goliath: { skins: ['#9aa0a8', '#8a8f96', '#b0a89c', '#7d8590'], ears: 'round', build: 1.2, face: 'square', jaw: 0.62, markings: true, tall: true, eyes: [E.blue, E.grey, E.green, E.brown], beard: [0.15, ['stubble', 'short']] },
  orc: { skins: [SKIN.green, '#6f8a5a', SKIN.grey], ears: 'point', build: 1.16, face: 'square', jaw: 0.66, tusks: true, bigNose: true, nose: 'broad', eyes: [E.amber, E.red, E.brown], beard: [0.3, ['stubble', 'goatee', 'short']] },

  // ---- Tome of Heroes
  // A soul in a clockwork body: metal plating, lit eyes, a glowing core.
  gearforged: { skins: ['#b8923f', '#8e98a3', '#a0703e', '#b8734e', '#6f757c', '#3f454c'], ears: 'bolt', build: 1.02, face: 'square', robot: true, hairless: true, eyes: ROBOT_GLOW },
  alseid: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown], ears: 'point', build: 0.96, face: 'long', jaw: 0.4, antlers: true, eyes: [E.brown, E.hazel, E.green, E.amber] },
  catfolk: { skins: ['#c9a068', '#9a9088', '#4a4038', '#c8844a', '#e0cfae'], ears: 'cat', build: 0.96, face: 'round', jaw: 0.42, cat: true, slit: true, tail: true, eyes: [E.green, E.amber, E.gold, E.blue] },
  darakhul: { skins: ['#8f948c', '#7f8a78', '#a09a8e'], ears: 'point', build: 0.98, face: 'long', longFace: true, jaw: 0.4, fangs: true, glowEyes: true, eyes: ['#e6dc9a', E.gold, E.red], beard: [0.2, ['stubble']] },
  derro: { skins: ['#8fa4c0', '#a7b6cc', '#9a94b8'], ears: 'round', build: 0.88, face: 'round', jaw: 0.55, bigNose: true, nose: 'hooked', eyes: [E.grey, E.violet, E.ice], hairColors: ['#ece8e0', '#cfcac0', '#b8b2a8'], beard: [0.5, ['short', 'full', 'moustache']] },
  drow: { skins: ['#3d3446', '#4a3f5a', '#2f3440'], ears: 'point', build: 0.94, face: 'long', longFace: true, jaw: 0.36, glowEyes: true, eyeShape: 'almond', eyes: [E.red, E.violet, '#d8a0d8'], hairColors: ['#ece8f0', '#d8d2e0', '#c0b8d0'] },
  erina: { skins: ['#8a6a4a', '#a8845c', '#6f5238'], ears: 'round', build: 0.88, face: 'round', roundFace: true, jaw: 0.5, spines: true, nose: 'button', eyes: [E.brown, '#2a1a10'] },
  minotaur: { skins: ['#6b4a30', '#4a3426', '#8a6444', '#2f2622'], ears: 'point', build: 1.18, face: 'long', jaw: 0.66, bull: true, tall: true, eyes: [E.brown, '#2a1a10', E.red] },
  mushroomfolk: { skins: ['#d8ccb4', '#bdb4a4', '#c8b8c8'], ears: 'none', build: 0.98, face: 'round', jaw: 0.5, cap: '#b0473a', hairless: true, eyes: [E.brown, '#2a1a10'] },
  satarre: { skins: ['#6f6a85', '#5a6b6a', '#7a6a7a'], ears: 'point', build: 0.95, face: 'long', longFace: true, jaw: 0.4, glowEyes: true, eyes: ['#b8e090', E.gold] },
  shade: { skins: ['#b8c4d0', '#a9b8c8', '#c8d0d8'], ears: 'round', build: 1, face: 'oval', jaw: 0.5, ghostly: true, glowEyes: true, eyes: [E.ice] },
};

// Looks that depend on the subrace.
export const SUBRACE_LOOKS = {
  'dwarf-chassis': { beardFixed: 'full', build: 1.12, short: true },
  'gnome-chassis': { roundFace: true, face: 'round', build: 0.88 },
  'kobold-chassis': { ears: 'frill', build: 0.9 },
  malkin: { build: 0.86, roundFace: true },
  'acid-cap': { cap: '#a8b83a' },
  favored: { cap: '#8a5aa8' },
  morel: { cap: '#7a5a3a', capPits: true, build: 0.9 },
};
export const SHADE_SKINS = ['#b8c4d0', '#a9b8c8', '#c8d0d8'];

/* ---------------- class kits ---------------- */
// What a class wears and carries when nobody has chosen otherwise. Each is a
// silhouette you can tell apart across the table: the barbarian's bare arms
// and greataxe, the wizard's hat and staff, the ranger's hood and bow.
//   hat: [kind, chance]   extras: always   mark: [kind, chance]

export const KITS = {
  barbarian: { outfit: 'furs', armour: 'none', cloak: 'mantle', hat: ['horned', 0.25], main: 'greataxe', off: 'none', extras: ['bracers'], garb: '#6b4a28', trim: '#8c2e32', leather: 'brown', metal: 'iron', hairs: ['wild', 'braids', 'mohawk', 'long', 'undercut', 'locs'], moods: ['stern', 'grin'], mark: ['warpaint', 0.6] },
  bard: { outfit: 'doublet', armour: 'none', cloak: 'cape', hat: ['cap', 0.7], main: 'rapier', off: 'none', extras: ['lute', 'pouch'], garb: '#5c3466', trim: '#e8c476', leather: 'tan', metal: 'gold', hairs: ['swept', 'long', 'curls', 'ponytail', 'quiff', 'bob'], moods: ['smile', 'smirk', 'grin'] },
  cleric: { outfit: 'vestments', armour: 'mail', cloak: 'none', hat: ['hood', 0.35], main: 'mace', off: 'shield', extras: ['pendant'], garb: '#e2d6bc', trim: '#d8ae4c', leather: 'brown', metal: 'steel', hairs: ['crop', 'bun', 'swept', 'shaved', 'braids'], moods: ['calm', 'smile'] },
  druid: { outfit: 'robe', armour: 'none', cloak: 'mantle', hat: ['antlers', 0.6], main: 'staff', off: 'none', extras: ['pouch', 'pendant'], garb: '#5a6a34', trim: '#8fae6a', leather: 'brown', metal: 'bronze', hairs: ['long', 'braids', 'curls', 'wild', 'locs'], moods: ['calm', 'smile'], staff: 'gnarled' },
  fighter: { outfit: 'tunic', armour: 'half', cloak: 'cape', hat: ['helm', 0.55], main: 'sword', off: 'shield', extras: ['pouch'], garb: '#8c2e32', trim: '#c8ccd2', leather: 'brown', metal: 'steel', hairs: ['crop', 'swept', 'ponytail', 'shaved', 'undercut'], moods: ['stern', 'calm', 'grin'] },
  monk: { outfit: 'wraps', armour: 'none', cloak: 'none', hat: ['none', 0], main: 'staff', off: 'none', extras: ['bracers'], garb: '#c8962e', trim: '#8c2e32', leather: 'tan', metal: 'bronze', hairs: ['topknot', 'bald', 'bun', 'shaved', 'highpony'], moods: ['calm', 'smile'], staff: 'plain' },
  paladin: { outfit: 'tunic', armour: 'plate', cloak: 'cloak', hat: ['greathelm', 0.35], main: 'sword', off: 'kite', extras: [], garb: '#e2d6bc', trim: '#d8ae4c', leather: 'dark', metal: 'silver', hairs: ['crop', 'swept', 'long', 'braids'], moods: ['calm', 'stern'] },
  ranger: { outfit: 'leathers', armour: 'leather', cloak: 'cloak', hat: ['hood', 0.6], main: 'bow', off: 'none', extras: ['quiver', 'bedroll'], garb: '#2f5032', trim: '#6b4a28', leather: 'brown', metal: 'iron', hairs: ['long', 'ponytail', 'braids', 'swept', 'undercut'], moods: ['calm', 'stern'] },
  rogue: { outfit: 'leathers', armour: 'leather', cloak: 'cape', hat: ['hood', 0.6], main: 'dagger', off: 'dagger', extras: ['pouch', 'scarf'], garb: '#2c2c30', trim: '#5f87a8', leather: 'black', metal: 'blackened', hairs: ['swept', 'crop', 'ponytail', 'undercut', 'bob'], moods: ['smirk', 'calm'], mark: ['mask', 0.45] },
  sorcerer: { outfit: 'coat', armour: 'none', cloak: 'none', hat: ['none', 0], main: 'none', off: 'orb', extras: ['pendant'], garb: '#8c2e32', trim: '#e07040', leather: 'dark', metal: 'gold', hairs: ['wild', 'swept', 'curls', 'long', 'quiff', 'highpony'], moods: ['smirk', 'smile'], spark: true },
  warlock: { outfit: 'coat', armour: 'none', cloak: 'cloak', hat: ['circlet', 0.7], main: 'wand', off: 'book', extras: ['pendant'], garb: '#3a2a4a', trim: '#8f7fd4', leather: 'black', metal: 'blackened', hairs: ['long', 'swept', 'bun', 'undercut', 'bob'], moods: ['smirk', 'stern'], spark: true },
  wizard: { outfit: 'robe', armour: 'none', cloak: 'none', hat: ['wizard', 0.85], main: 'staff', off: 'book', extras: ['satchel'], garb: '#2a3a64', trim: '#8f7fd4', leather: 'brown', metal: 'silver', hairs: ['long', 'swept', 'bun', 'bald', 'wild'], moods: ['calm', 'smile'], staff: 'crystal' },
  npc: { outfit: 'tunic', armour: 'none', cloak: 'none', hat: ['none', 0], main: 'none', off: 'none', extras: [], garb: '#6d6a63', trim: '#6b4a28', leather: 'brown', metal: 'iron', hairs: ['crop', 'swept', 'long', 'bob', 'bun', 'ponytail', 'curls'], moods: ['calm', 'smile'] },
};

/* ---------------- people in the world ---------------- */
// An NPC's role, read from their name on the map ("Marta the innkeeper",
// "Captain of the guard"). Each is a kit like a class's, so a guard, a smith
// and a noble can be told apart at a glance.

export const ROLES = {
  innkeeper: { re: /innkeep|barkeep|tavern|bartend|cook|marla/i, outfit: 'apron', main: 'mug', garb: '#8a6a3a', trim: '#e2d6bc', extras: ['scarf'], moods: ['smile', 'grin'] },
  guard: { re: /guard|watch|sentry|soldier|captain|sergeant|warden/i, outfit: 'tunic', armour: 'mail', hat: 'helm', main: 'spear', off: 'shield', garb: '#2a3a64', trim: '#d8ae4c', moods: ['stern'] },
  knight: { re: /knight|veteran|champion|lord commander/i, outfit: 'tunic', armour: 'plate', cloak: 'cloak', main: 'sword', off: 'kite', garb: '#8c2e32', trim: '#d8ae4c', moods: ['stern', 'calm'] },
  merchant: { re: /merchant|trader|shop|peddler|vendor|pedlar/i, outfit: 'coat', hat: 'widebrim', extras: ['satchel', 'pouch'], garb: '#235a5a', trim: '#d8ae4c', moods: ['smile', 'smirk'] },
  noble: { re: /noble|lord|lady|duke|duchess|count|baron|prince|princess|king|queen|mayor|regent/i, outfit: 'doublet', cloak: 'cape', hat: 'circlet', main: 'rapier', garb: '#5c3466', trim: '#d8ae4c', extras: ['pendant'], moods: ['stern', 'smirk'] },
  smith: { re: /smith|forge|armou?rer|blacksmith/i, outfit: 'apron', main: 'hammer', extras: ['bracers'], garb: '#6d6a63', trim: '#6b4a28', leatherApron: true, frame: 'broad', moods: ['stern', 'grin'] },
  scholar: { re: /scholar|sage|librar|scribe|archivist|tutor|professor/i, outfit: 'robe', off: 'book', extras: ['satchel'], garb: '#6a4a9a', trim: '#e2d6bc', moods: ['calm'] },
  priest: { re: /priest|acolyte|cleric|abbot|monk|friar|sister|brother|templ/i, outfit: 'vestments', hat: 'hood', extras: ['pendant'], garb: '#e2d6bc', trim: '#c8962e', moods: ['calm'] },
  mage: { re: /mage|wizard|sorcer|warlock|witch|enchant|cultist|archmage|necro/i, outfit: 'robe', hat: 'wizard', main: 'staff', garb: '#2a3a64', trim: '#8f7fd4', moods: ['stern', 'smirk'] },
  hunter: { re: /hunter|ranger|scout|trapper|tracker|woods/i, outfit: 'leathers', armour: 'leather', hat: 'hood', cloak: 'cloak', main: 'bow', extras: ['quiver'], garb: '#2f5032', trim: '#6b4a28', moods: ['calm', 'stern'] },
  rogue: { re: /bandit|thief|thug|spy|informant|cutpurse|assassin|smuggl|brigand|raider/i, outfit: 'leathers', armour: 'leather', hat: 'bandana', cloak: 'cape', main: 'dagger', garb: '#2c2c30', trim: '#8c2e32', moods: ['smirk', 'stern'] },
  sellsword: { re: /sellsword|mercenar|sword for hire|bodyguard|thug/i, outfit: 'tunic', armour: 'leather', main: 'axe', off: 'buckler', garb: '#6b4a28', trim: '#8c2e32', moods: ['stern', 'grin'] },
  sailor: { re: /sailor|captain of|pirate|ferry|fisher|boat/i, outfit: 'tunic', hat: 'bandana', main: 'none', extras: ['scarf'], garb: '#e2d6bc', trim: '#2a3a64', moods: ['grin'] },
  farmer: { re: /farmer|villager|peasant|miller|herder|shepherd|carter|townsfolk|commoner/i, outfit: 'tunic', hat: 'widebrim', main: 'pitchfork', garb: '#8a9a72', trim: '#6b4a28', moods: ['calm', 'smile'] },
  herbalist: { re: /herbal|healer|wise woman|hermit|druid|apothec|alchem/i, outfit: 'robe', hat: 'headwrap', main: 'staff', extras: ['satchel', 'pouch'], garb: '#5a6a34', trim: '#a8643c', moods: ['calm', 'smile'], staff: 'gnarled' },
  elder: { re: /elder|old |grand(ma|pa|mother|father)|chief|chieftain|matriarch|patriarch/i, outfit: 'robe', main: 'staff', cloak: 'mantle', garb: '#6b4a28', trim: '#c8962e', moods: ['calm', 'stern'], grey: true, staff: 'gnarled' },
  captive: { re: /captive|prisoner|hostage|kidnapped/i, outfit: 'tunic', main: 'none', garb: '#b8ac94', trim: '#6d6a63', moods: ['calm'], bound: true },
  child: { re: /child|kid|boy|girl|urchin|orphan|youngster/i, outfit: 'tunic', main: 'none', garb: '#c8962e', trim: '#5f87a8', moods: ['smile', 'grin'], child: true },
  bard: { re: /bard|minstrel|singer|musician|jester|player/i, outfit: 'doublet', hat: 'cap', main: 'lute', garb: '#8c2e32', trim: '#e8c476', moods: ['grin', 'smile'] },
};
export const ROLE_NAMES = Object.keys(ROLES);

/* ---------------- the portrait's older vocabulary ---------------- */
// The 2D portrait draws a smaller set of styles. New choices map onto the
// nearest one it knows, so a hero's bust and figure always agree in spirit.

export const BUST = {
  hair: { shaved: 'bald', quiff: 'swept', undercut: 'swept', bob: 'long', afro: 'curls', locs: 'braids', highpony: 'ponytail' },
  beard: { handlebar: 'moustache', chinstrap: 'short', forked: 'braided', mutton: 'short' },
  mark: { eyescar: 'scar', eyepatch: 'scar' },
  // hat key -> the bust's headwear kind (null: drawn bare-headed)
  hat: { hood: 'hood', helm: 'helm', greathelm: 'greathelm', horned: 'helm', wizard: 'wizhat', widebrim: 'cap', cap: 'cap', circlet: 'circlet', antlers: 'antlers', headwrap: 'hood', bandana: null, none: null },
};
