const fs = require('fs');
const path = require('path');

// Loads the vendored SRD 5.1 dataset (5e-bits/5e-database, CC-BY-4.0 content)
// into memory once at boot. ~4MB total.
const DATA_DIR = path.join(__dirname, '..', 'data');

function load(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const raw = {
  races: load('Races'),
  subraces: load('Subraces'),
  traits: load('Traits'),
  classes: load('Classes'),
  subclasses: load('Subclasses'),
  levels: load('Levels'),
  features: load('Features'),
  spells: load('Spells'),
  monsters: load('Monsters'),
  conditions: load('Conditions'),
  equipment: load('Equipment'),
  equipmentCategories: load('Equipment-Categories'),
  magicItems: load('Magic-Items'),
  skills: load('Skills'),
  languages: load('Languages'),
  alignments: load('Alignments'),
  weaponProperties: load('Weapon-Properties'),
  rules: load('Rules'),
  ruleSections: load('Rule-Sections'),
  proficiencies: load('Proficiencies'),
  damageTypes: load('Damage-Types'),
  magicSchools: load('Magic-Schools'),
  backgrounds: load('Backgrounds-App'), // hand-authored: SRD 5.1 Acolyte + SRD 5.2 Criminal/Sage/Soldier
};

function indexBy(arr) {
  const map = new Map();
  for (const item of arr) map.set(item.index, item);
  return map;
}

const byIndex = {};
for (const [key, arr] of Object.entries(raw)) byIndex[key] = indexBy(arr);

// ---- Summaries for list endpoints (small payloads) ----

const crToNumber = (cr) => cr; // already numeric in dataset (0.125 etc.)

const monsterSummaries = raw.monsters.map((m) => ({
  index: m.index,
  name: m.name,
  size: m.size,
  type: m.type,
  alignment: m.alignment,
  cr: crToNumber(m.challenge_rating),
  xp: m.xp,
  hp: m.hit_points,
  hit_dice: m.hit_dice,
  ac: Array.isArray(m.armor_class) && m.armor_class.length ? m.armor_class[0].value : 10,
  speed: m.speed && m.speed.walk ? m.speed.walk : '30 ft.',
}));

const spellSummaries = raw.spells.map((s) => ({
  index: s.index,
  name: s.name,
  level: s.level,
  school: s.school ? s.school.name : '',
  classes: (s.classes || []).map((c) => c.index),
  casting_time: s.casting_time,
  range: s.range,
  concentration: s.concentration,
  ritual: s.ritual,
  damage_type: s.damage && s.damage.damage_type ? s.damage.damage_type.name : null,
}));

const equipmentSummaries = raw.equipment.map((e) => ({
  index: e.index,
  name: e.name,
  category: e.equipment_category ? e.equipment_category.index : '',
  weapon_category: e.weapon_category || null,
  weapon_range: e.weapon_range || null,
  armor_category: e.armor_category || null,
  cost: e.cost ? `${e.cost.quantity} ${e.cost.unit}` : '',
  weight: e.weight || 0,
  damage: e.damage ? { dice: e.damage.damage_dice, type: e.damage.damage_type.name } : null,
  armor_class: e.armor_class || null,
  str_minimum: e.str_minimum || 0,
  stealth_disadvantage: e.stealth_disadvantage || false,
  properties: (e.properties || []).map((p) => p.index),
}));

const magicItemSummaries = raw.magicItems.map((mi) => ({
  index: mi.index,
  name: mi.name,
  category: mi.equipment_category ? mi.equipment_category.name : '',
  rarity: mi.rarity ? mi.rarity.name : '',
}));

// Race detail merged with its traits' full text + subraces
function raceDetail(index) {
  const race = byIndex.races.get(index);
  if (!race) return null;
  const traits = (race.traits || []).map((t) => byIndex.traits.get(t.index)).filter(Boolean);
  const subraces = (race.subraces || [])
    .map((s) => byIndex.subraces.get(s.index))
    .filter(Boolean)
    .map((s) => ({
      ...s,
      racial_traits: (s.racial_traits || []).map((t) => byIndex.traits.get(t.index)).filter(Boolean),
    }));
  return { ...race, traits, subraces };
}

function classDetail(index) {
  const cls = byIndex.classes.get(index);
  if (!cls) return null;
  const subclasses = (cls.subclasses || []).map((s) => byIndex.subclasses.get(s.index)).filter(Boolean);
  return { ...cls, subclasses };
}

function classLevels(index) {
  return raw.levels
    .filter((l) => l.class && l.class.index === index && !l.subclass)
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      ...l,
      features: (l.features || []).map((f) => byIndex.features.get(f.index) || f),
    }));
}

function subclassLevels(index) {
  return raw.levels
    .filter((l) => l.subclass && l.subclass.index === index)
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      ...l,
      features: (l.features || []).map((f) => byIndex.features.get(f.index) || f),
    }));
}

module.exports = {
  raw,
  byIndex,
  monsterSummaries,
  spellSummaries,
  equipmentSummaries,
  magicItemSummaries,
  raceDetail,
  classDetail,
  classLevels,
  subclassLevels,
};
