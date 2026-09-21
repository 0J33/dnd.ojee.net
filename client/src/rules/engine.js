// Rules engine - SRD 5.1 (2014 rules) math.
// The character sheet document is plain data; everything displayable is derived here.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
export const ABILITY_BLURBS = {
  str: 'Raw muscle. Melee attacks, jumping, carrying, breaking things.',
  dex: 'Agility and reflexes. Armor Class, initiative, bows, stealth.',
  con: 'Toughness. Hit points and resisting poison or exhaustion.',
  int: 'Reasoning and memory. Investigation, lore, wizard magic.',
  wis: 'Awareness and willpower. Perception, insight, cleric magic.',
  cha: 'Force of personality. Persuasion, deception, bard/sorcerer magic.',
};

export const SKILLS = [
  { index: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { index: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { index: 'arcana', name: 'Arcana', ability: 'int' },
  { index: 'athletics', name: 'Athletics', ability: 'str' },
  { index: 'deception', name: 'Deception', ability: 'cha' },
  { index: 'history', name: 'History', ability: 'int' },
  { index: 'insight', name: 'Insight', ability: 'wis' },
  { index: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { index: 'investigation', name: 'Investigation', ability: 'int' },
  { index: 'medicine', name: 'Medicine', ability: 'wis' },
  { index: 'nature', name: 'Nature', ability: 'int' },
  { index: 'perception', name: 'Perception', ability: 'wis' },
  { index: 'performance', name: 'Performance', ability: 'cha' },
  { index: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { index: 'religion', name: 'Religion', ability: 'int' },
  { index: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { index: 'stealth', name: 'Stealth', ability: 'dex' },
  { index: 'survival', name: 'Survival', ability: 'wis' },
];
export const SKILL_BY_INDEX = Object.fromEntries(SKILLS.map((s) => [s.index, s]));

export const CONDITIONS = [
  { index: 'blinded', name: 'Blinded', brief: 'Auto-fail sight checks. Attacks against you have advantage; yours have disadvantage.' },
  { index: 'charmed', name: 'Charmed', brief: "Can't attack the charmer; they have advantage on social checks against you." },
  { index: 'deafened', name: 'Deafened', brief: 'Auto-fail hearing checks.' },
  { index: 'frightened', name: 'Frightened', brief: 'Disadvantage on checks/attacks while the source is visible. Can\'t move closer to it.' },
  { index: 'grappled', name: 'Grappled', brief: 'Speed becomes 0.' },
  { index: 'incapacitated', name: 'Incapacitated', brief: 'No actions or reactions.' },
  { index: 'invisible', name: 'Invisible', brief: 'Attacks against you have disadvantage; yours have advantage.' },
  { index: 'paralyzed', name: 'Paralyzed', brief: 'Incapacitated, auto-fail STR/DEX saves, attacks vs you have advantage; hits within 5 ft are crits.' },
  { index: 'petrified', name: 'Petrified', brief: 'Turned to stone: incapacitated, resistance to all damage.' },
  { index: 'poisoned', name: 'Poisoned', brief: 'Disadvantage on attack rolls and ability checks.' },
  { index: 'prone', name: 'Prone', brief: 'Your attacks have disadvantage. Melee attacks vs you have advantage; ranged have disadvantage. Standing costs half speed.' },
  { index: 'restrained', name: 'Restrained', brief: 'Speed 0. Attacks vs you have advantage, yours disadvantage. Disadvantage on DEX saves.' },
  { index: 'stunned', name: 'Stunned', brief: 'Incapacitated, auto-fail STR/DEX saves, attacks vs you have advantage.' },
  { index: 'unconscious', name: 'Unconscious', brief: 'Incapacitated + prone, drop items. Hits within 5 ft are crits. Auto-fail STR/DEX saves.' },
  { index: 'concentrating', name: 'Concentrating', brief: 'Maintaining a spell. CON save (DC 10 or half damage) when you take damage or the spell ends.' },
];

export const mod = (score) => Math.floor(((score || 10) - 10) / 2);
export const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);
export const proficiencyBonus = (level) => Math.min(6, 2 + Math.floor(((level || 1) - 1) / 4));

export const XP_THRESHOLDS = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const xpToLevel = (xp) => {
  let level = 1;
  for (let i = 2; i <= 20; i++) if ((xp || 0) >= XP_THRESHOLDS[i]) level = i;
  return level;
};

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

// Encounter XP budget per character (2024 DMG method, levels 1-10)
export const ENCOUNTER_BUDGET = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
};

export const AVG_HIT_DIE = { 6: 4, 8: 5, 10: 6, 12: 7 };

// ---- Spell slots ----
const FULL_SLOTS = {
  1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1],
  8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2], 11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1], 16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1], 19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};
const HALF_SLOTS = {
  1: [], 2: [2], 3: [3], 4: [3], 5: [4, 2], 6: [4, 2], 7: [4, 3], 8: [4, 3], 9: [4, 3, 2],
  10: [4, 3, 2], 11: [4, 3, 3], 12: [4, 3, 3], 13: [4, 3, 3, 1], 14: [4, 3, 3, 1],
  15: [4, 3, 3, 2], 16: [4, 3, 3, 2], 17: [4, 3, 3, 3, 1], 18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2], 20: [4, 3, 3, 3, 2],
};
const PACT = {
  1: { slots: 1, level: 1 }, 2: { slots: 2, level: 1 }, 3: { slots: 2, level: 2 }, 4: { slots: 2, level: 2 },
  5: { slots: 2, level: 3 }, 6: { slots: 2, level: 3 }, 7: { slots: 2, level: 4 }, 8: { slots: 2, level: 4 },
  9: { slots: 2, level: 5 }, 10: { slots: 2, level: 5 }, 11: { slots: 3, level: 5 }, 12: { slots: 3, level: 5 },
  13: { slots: 3, level: 5 }, 14: { slots: 3, level: 5 }, 15: { slots: 3, level: 5 }, 16: { slots: 3, level: 5 },
  17: { slots: 4, level: 5 }, 18: { slots: 4, level: 5 }, 19: { slots: 4, level: 5 }, 20: { slots: 4, level: 5 },
};

// ---- Class metadata (SRD 5.1) ----
// caster: 'full' | 'half' | 'pact' | null; prepared: how the prepared list size is computed
export const CLASS_META = {
  barbarian: {
    name: 'Barbarian', hitDie: 12, primary: ['str'], saves: ['str', 'con'], caster: null,
    blurb: 'A raging melee powerhouse. Hits hard, has the most HP, shrugs off damage while raging.',
    playstyle: 'Run at the biggest enemy and hit it with a big axe. Simple and devastating.',
    armor: ['light', 'medium', 'shields'], weapons: 'martial',
    skillChoices: { n: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    speedNote: null,
  },
  bard: {
    name: 'Bard', hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'], caster: 'full',
    castingAbility: 'cha', preparedKind: 'known', l1: { cantrips: 2, known: 4 }, ritual: true,
    blurb: 'A magical performer. Inspires allies, talks their way through anything, flexible spells.',
    playstyle: 'Support your friends with Bardic Inspiration and charm every NPC you meet.',
    armor: ['light'], weapons: 'simple',
    skillChoices: { n: 3, from: SKILLS.map((s) => s.index) },
  },
  cleric: {
    name: 'Cleric', hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'], caster: 'full',
    castingAbility: 'wis', preparedKind: 'prepared', preparedFormula: (lvl, abilityMod) => Math.max(1, abilityMod + lvl), l1: { cantrips: 3 }, ritual: true,
    blurb: 'A divine champion. Heals the wounded, protects the party, smites the unholy.',
    playstyle: 'Keep everyone alive with healing magic, and hold the line in armor.',
    armor: ['light', 'medium', 'shields'], weapons: 'simple',
    skillChoices: { n: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
  },
  druid: {
    name: 'Druid', hitDie: 8, primary: ['wis'], saves: ['int', 'wis'], caster: 'full',
    castingAbility: 'wis', preparedKind: 'prepared', preparedFormula: (lvl, abilityMod) => Math.max(1, abilityMod + lvl), l1: { cantrips: 2 }, ritual: true,
    blurb: 'A shapeshifting nature priest. Commands beasts, plants, and the elements.',
    playstyle: 'Entangle enemies, heal allies, and later turn into a bear.',
    armor: ['light', 'medium', 'shields'], weapons: 'druid weapons (clubs, staffs, scimitars...)',
    skillChoices: { n: 2, from: ['arcana', 'animal-handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
  },
  fighter: {
    name: 'Fighter', hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'], caster: null,
    blurb: 'The master of weapons and armor. Reliable, tough, and hits more often than anyone.',
    playstyle: 'The easiest class to learn: attack, use Second Wind to heal, Action Surge for burst.',
    armor: ['light', 'medium', 'heavy', 'shields'], weapons: 'martial',
    skillChoices: { n: 2, from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
  },
  monk: {
    name: 'Monk', hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: null,
    blurb: 'An unarmored martial artist. Fast, precise, strikes in flurries.',
    playstyle: 'Dart around the battlefield punching things surprisingly hard.',
    armor: [], weapons: 'simple + shortswords', unarmoredDefense: 'wis',
    skillChoices: { n: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
  },
  paladin: {
    name: 'Paladin', hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'], caster: 'half',
    castingAbility: 'cha', preparedKind: 'prepared', preparedFormula: (lvl, abilityMod) => Math.max(1, abilityMod + Math.floor(lvl / 2)), l1: { cantrips: 0 },
    blurb: 'A holy knight bound by an oath. Heavy armor, healing hands, devastating smites.',
    playstyle: 'Tanky frontliner who can heal and unleash huge burst damage on a hit.',
    armor: ['light', 'medium', 'heavy', 'shields'], weapons: 'martial',
    skillChoices: { n: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
  },
  ranger: {
    name: 'Ranger', hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: 'half',
    castingAbility: 'wis', preparedKind: 'known', l1: { cantrips: 0, known: 0 },
    blurb: 'A wilderness hunter. Deadly with a bow, at home in the wild, tracks anything.',
    playstyle: 'Shoot from range, guide the party through the wilderness.',
    armor: ['light', 'medium', 'shields'], weapons: 'martial',
    skillChoices: { n: 3, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
  },
  rogue: {
    name: 'Rogue', hitDie: 8, primary: ['dex'], saves: ['dex', 'int'], caster: null,
    blurb: 'A cunning skill expert. Strikes from the shadows for massive Sneak Attack damage.',
    playstyle: 'Sneak, pick locks, and stab things when they least expect it.',
    armor: ['light'], weapons: 'simple + rapiers, shortswords, hand crossbows',
    skillChoices: { n: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth'] },
    expertiseAtCreate: 2,
  },
  sorcerer: {
    name: 'Sorcerer', hitDie: 6, primary: ['cha'], saves: ['con', 'cha'], caster: 'full',
    castingAbility: 'cha', preparedKind: 'known', l1: { cantrips: 4, known: 2 },
    blurb: 'A born spellcaster with magic in their blood. Raw arcane power, shaped on the fly.',
    playstyle: 'Sling powerful spells and later bend them with metamagic.',
    armor: [], weapons: 'daggers, darts, slings, quarterstaffs, light crossbows',
    skillChoices: { n: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
  },
  warlock: {
    name: 'Warlock', hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'], caster: 'pact',
    castingAbility: 'cha', preparedKind: 'known', l1: { cantrips: 2, known: 2 },
    blurb: 'Bound to an otherworldly patron. Few spells, but always at full power, plus Eldritch Blast.',
    playstyle: 'Blast enemies with your signature cantrip; recharge spells on short rests.',
    armor: ['light'], weapons: 'simple',
    skillChoices: { n: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
  },
  wizard: {
    name: 'Wizard', hitDie: 6, primary: ['int'], saves: ['int', 'wis'], caster: 'full',
    castingAbility: 'int', preparedKind: 'spellbook', preparedFormula: (lvl, abilityMod) => Math.max(1, abilityMod + lvl), l1: { cantrips: 3, spellbook: 6 }, ritual: true,
    blurb: 'A student of arcane magic. The largest spell list in the game - answers for everything.',
    playstyle: 'Fragile but brilliant: control the battlefield and solve problems with the right spell.',
    armor: [], weapons: 'daggers, darts, slings, quarterstaffs, light crossbows',
    skillChoices: { n: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
  },
};

// ---- Subclasses ----
// The class level each class picks its subclass at (2014 rules).
const SUBCLASS_LEVEL = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };
export const subclassLevel = (classIndex) => SUBCLASS_LEVEL[classIndex] || 3;
export const SUBCLASS_LABEL = {
  barbarian: 'Primal Path', bard: 'Bard College', cleric: 'Divine Domain', druid: 'Druid Circle',
  fighter: 'Martial Archetype', monk: 'Monastic Tradition', paladin: 'Sacred Oath', ranger: 'Ranger Archetype',
  rogue: 'Roguish Archetype', sorcerer: 'Sorcerous Origin', warlock: 'Otherworldly Patron', wizard: 'Arcane Tradition',
};

// Sheets made before subclasses were selectable had the SRD's single option
// baked in for the three classes that choose at level 1. `null` on a sheet
// means "not chosen yet"; only a missing key falls back.
const LEGACY_SUBCLASS = { cleric: 'life', sorcerer: 'draconic', warlock: 'fiend' };
export function subclassOf(sheet) {
  if (!sheet) return null;
  if (sheet.subclass !== undefined) return sheet.subclass;
  return LEGACY_SUBCLASS[sheet.classIndex] || null;
}

// Subclass features that change the sheet's numbers rather than just its text.
const SUBCLASS_RULES = {
  draconic: { unarmoredAc: 13, hpPerLevel: 1 }, // Draconic Resilience
};

// Extra max HP per level from race (Dwarven Toughness...) and subclass.
export function hpPerLevelBonus(sheet) {
  const racial = sheet.hpPerLevel ?? (sheet.race === 'dwarf' ? 1 : 0); // pre-expansion sheets: only Hill Dwarf had it
  return racial + (SUBCLASS_RULES[subclassOf(sheet)]?.hpPerLevel || 0);
}

// Starting equipment: sensible default package per class (SRD options resolved to
// beginner-recommended picks). stats snapshots let the engine derive attacks/AC offline.
const W = (name, damage, type, props = [], range = null) => ({ name, qty: 1, equipped: true, kind: 'weapon', stats: { damage, damageType: type, properties: props, range } });
const A = (name, base, cat, maxDex = null) => ({ name, qty: 1, equipped: true, kind: 'armor', stats: { acBase: base, category: cat, maxDex } });
const G = (name, qty = 1) => ({ name, qty, kind: 'gear' });
const SHIELD = { name: 'Shield', qty: 1, equipped: true, kind: 'shield', stats: { acBonus: 2 } };

export const STARTING_EQUIPMENT = {
  barbarian: [W('Greataxe', '1d12', 'slashing', ['heavy', 'two-handed']), W('Handaxe', '1d6', 'slashing', ['light', 'thrown'], '20/60'), W('Javelin', '1d6', 'piercing', ['thrown'], '30/120'), G('Javelin (spare)', 3), G("Explorer's pack")],
  bard: [W('Rapier', '1d8', 'piercing', ['finesse']), W('Dagger', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60'), A('Leather armor', 11, 'light'), G('Lute'), G("Entertainer's pack")],
  cleric: [W('Mace', '1d6', 'bludgeoning'), A('Scale mail', 14, 'medium', 2), SHIELD, W('Light crossbow', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320'), G('Crossbow bolts (20)'), G('Holy symbol'), G("Priest's pack")],
  druid: [W('Scimitar', '1d6', 'slashing', ['finesse', 'light']), A('Leather armor', 11, 'light'), SHIELD, G('Druidic focus'), G("Explorer's pack")],
  fighter: [A('Chain mail', 16, 'heavy', 0), W('Longsword', '1d8', 'slashing', ['versatile']), SHIELD, W('Light crossbow', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320'), G('Crossbow bolts (20)'), G("Dungeoneer's pack")],
  monk: [W('Shortsword', '1d6', 'piercing', ['finesse', 'light']), W('Dart', '1d4', 'piercing', ['finesse', 'thrown'], '20/60'), G('Darts (spare)', 9), G("Explorer's pack")],
  paladin: [A('Chain mail', 16, 'heavy', 0), W('Longsword', '1d8', 'slashing', ['versatile']), SHIELD, W('Javelin', '1d6', 'piercing', ['thrown'], '30/120'), G('Javelin (spare)', 4), G('Holy symbol'), G("Priest's pack")],
  ranger: [A('Leather armor', 11, 'light'), W('Longbow', '1d8', 'piercing', ['ammunition', 'heavy', 'two-handed'], '150/600'), G('Arrows (20)'), W('Shortsword', '1d6', 'piercing', ['finesse', 'light']), W('Shortsword (off-hand)', '1d6', 'piercing', ['finesse', 'light']), G("Explorer's pack")],
  rogue: [W('Rapier', '1d8', 'piercing', ['finesse']), W('Shortbow', '1d6', 'piercing', ['ammunition', 'two-handed'], '80/320'), G('Arrows (20)'), A('Leather armor', 11, 'light'), W('Dagger', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60'), G("Thieves' tools"), G("Burglar's pack")],
  sorcerer: [W('Light crossbow', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320'), G('Crossbow bolts (20)'), W('Dagger', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60'), G('Arcane focus'), G("Dungeoneer's pack")],
  warlock: [W('Light crossbow', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320'), G('Crossbow bolts (20)'), W('Dagger', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60'), A('Leather armor', 11, 'light'), G('Arcane focus'), G("Scholar's pack")],
  wizard: [W('Quarterstaff', '1d6', 'bludgeoning', ['versatile']), G('Arcane focus'), G('Spellbook'), G("Scholar's pack")],
};

// Recommended L1 spells per casting class (beginner defaults; all SRD).
export const RECOMMENDED_SPELLS = {
  bard: { cantrips: ['vicious-mockery', 'light'], spells: ['cure-wounds', 'charm-person', 'healing-word', 'thunderwave'] },
  cleric: { cantrips: ['sacred-flame', 'guidance', 'light'], spells: ['cure-wounds', 'bless', 'healing-word', 'guiding-bolt', 'shield-of-faith'] },
  druid: { cantrips: ['produce-flame', 'guidance'], spells: ['cure-wounds', 'entangle', 'thunderwave', 'healing-word'] },
  sorcerer: { cantrips: ['fire-bolt', 'light', 'mage-hand', 'prestidigitation'], spells: ['magic-missile', 'shield'] },
  warlock: { cantrips: ['eldritch-blast', 'mage-hand'], spells: ['hellish-rebuke', 'charm-person'] },
  wizard: { cantrips: ['fire-bolt', 'mage-hand', 'light'], spells: ['magic-missile', 'shield', 'sleep', 'mage-armor', 'detect-magic', 'burning-hands'] },
  paladin: { cantrips: [], spells: [] },
  ranger: { cantrips: [], spells: [] },
};

export function maxSpellSlots(classIndex, level) {
  const meta = CLASS_META[classIndex];
  if (!meta || !meta.caster) return {};
  if (meta.caster === 'pact') {
    const pact = PACT[level] || PACT[1];
    return { pact: { slots: pact.slots, level: pact.level } };
  }
  const table = meta.caster === 'full' ? FULL_SLOTS : HALF_SLOTS;
  const row = table[Math.min(20, Math.max(1, level))] || [];
  const slots = {};
  row.forEach((n, i) => (slots[i + 1] = n));
  return slots;
}

export function preparedCount(classIndex, level, abilities) {
  const meta = CLASS_META[classIndex];
  if (!meta || !meta.preparedFormula) return null;
  return meta.preparedFormula(level, mod(abilities[meta.castingAbility]));
}

// ---- Derivation ----

export function deriveSheet(sheet) {
  const abilities = sheet.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const level = sheet.level || 1;
  const pb = proficiencyBonus(level);
  const mods = {};
  for (const a of ABILITIES) mods[a] = mod(abilities[a]);

  const meta = CLASS_META[sheet.classIndex] || {};
  const profSaves = sheet.profSaves || meta.saves || [];
  const saves = {};
  for (const a of ABILITIES) saves[a] = mods[a] + (profSaves.includes(a) ? pb : 0);

  const profSkills = sheet.profSkills || [];
  const expertise = sheet.expertiseSkills || [];
  const skills = {};
  for (const s of SKILLS) {
    const isProf = profSkills.includes(s.index);
    const isExp = expertise.includes(s.index);
    skills[s.index] = { bonus: mods[s.ability] + (isProf ? pb : 0) + (isExp ? pb : 0), prof: isProf, expertise: isExp, ability: s.ability, name: s.name };
  }

  // AC
  const equipment = sheet.equipment || [];
  const armor = equipment.find((e) => e.kind === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.kind === 'shield' && e.equipped);
  let ac;
  if (armor) {
    const { acBase, category, maxDex } = armor.stats || {};
    if (category === 'heavy') ac = acBase;
    else if (category === 'medium') ac = acBase + Math.min(mods.dex, maxDex ?? 2);
    else ac = acBase + mods.dex;
  } else if (SUBCLASS_RULES[subclassOf(sheet)]?.unarmoredAc) {
    ac = SUBCLASS_RULES[subclassOf(sheet)].unarmoredAc + mods.dex;
  } else if (sheet.classIndex === 'barbarian') {
    ac = 10 + mods.dex + mods.con;
  } else if (sheet.classIndex === 'monk') {
    ac = 10 + mods.dex + mods.wis;
  } else {
    ac = 10 + mods.dex;
  }
  if (shield && !(sheet.classIndex === 'monk' && !armor)) ac += 2;
  if (sheet.acBonus) ac += sheet.acBonus; // e.g. mage armor toggle / magic items
  if (sheet.acOverride) ac = sheet.acOverride;

  // Attacks from equipped weapons
  const attacks = [];
  for (const item of equipment) {
    if (item.kind !== 'weapon' || item.equipped === false) continue;
    const stats = item.stats || {};
    const props = stats.properties || [];
    const isRanged = !!stats.range && !props.includes('thrown');
    const finesse = props.includes('finesse');
    let ability = 'str';
    if (isRanged) ability = 'dex';
    else if (finesse) ability = mods.dex > mods.str ? 'dex' : 'str';
    const abilityMod = mods[ability];
    attacks.push({
      name: item.name,
      bonus: abilityMod + pb,
      damage: stats.damage || '1d4',
      damageMod: abilityMod,
      damageType: stats.damageType || 'bludgeoning',
      range: stats.range || null,
      properties: props,
      ability,
    });
  }
  if (sheet.classIndex === 'monk') {
    const ma = Math.max(mods.dex, mods.str);
    attacks.push({ name: 'Unarmed strike', bonus: ma + pb, damage: '1d4', damageMod: ma, damageType: 'bludgeoning', range: null, properties: [], ability: 'dex' });
  }
  // Claws, horns, bites: unarmed strikes that use STR and are always proficient.
  for (const n of sheet.naturalAttacks || []) {
    attacks.push({ name: n.name, bonus: mods.str + pb, damage: n.damage, damageMod: mods.str, damageType: n.damageType, range: null, properties: ['natural'], ability: 'str' });
  }
  for (const custom of sheet.attacksCustom || []) attacks.push(custom);

  // Spellcasting
  let spell = null;
  if (meta.caster && sheet.spellcasting) {
    const castMod = mods[meta.castingAbility];
    spell = {
      ability: meta.castingAbility,
      dc: 8 + pb + castMod,
      attackBonus: pb + castMod,
      maxSlots: maxSpellSlots(sheet.classIndex, level),
      preparedMax: preparedCount(sheet.classIndex, level, abilities),
    };
  }

  const hitDie = meta.hitDie || 8;

  return {
    abilities, mods, pb, saves, skills, ac,
    initiative: mods.dex,
    passivePerception: 10 + skills.perception.bonus,
    speed: sheet.speed || 30,
    size: sheet.size || 'Medium',
    darkvision: sheet.darkvision || 0,
    attacks, spell, hitDie,
    profSaves,
    maxHp: sheet.maxHp,
  };
}

// Level-1 max HP. `perLevel` is hpPerLevelBonus() of the sheet being built.
export function level1Hp(classIndex, abilities, perLevel = 0) {
  const meta = CLASS_META[classIndex];
  return Math.max(1, (meta ? meta.hitDie : 8) + mod(abilities.con) + perLevel);
}

export function levelUpHp(sheet, roll = null, conScore = sheet.abilities.con) {
  const meta = CLASS_META[sheet.classIndex] || { hitDie: 8 };
  return Math.max(1, (roll ?? AVG_HIT_DIE[meta.hitDie]) + mod(conScore) + hpPerLevelBonus(sheet));
}

export const formatCr = (cr) => {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return `${cr}`;
};

export const XP_BY_CR = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900 };

export const COIN_NAMES = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };

// Dice helper for display
export function describeRoll(roll) {
  if (!roll || !roll.parts) return '';
  const bits = roll.parts.map((p) => {
    const shown = p.rolls.map((r, i) => (p.kept.includes(i) ? `${r}` : `~${r}~`)).join(', ');
    return `${p.n}d${p.sides} [${shown}]`;
  });
  const modStr = roll.modifier ? (roll.modifier > 0 ? ` + ${roll.modifier}` : ` - ${Math.abs(roll.modifier)}`) : '';
  return `${bits.join(' + ')}${modStr}`;
}
