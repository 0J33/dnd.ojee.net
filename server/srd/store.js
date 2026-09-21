const fs = require('fs');
const path = require('path');
const { asiSummary } = require('./asi');
const { SOURCES, OGL_TEXT, OGL_SECTION_15 } = require('./sources');

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

// =====================================================================
// Races and subclasses, in one shape whatever the source.
//
// SRD 5.1 entries are converted from the vendored 5e-bits records; the
// open-licensed expansions (scripts/import-open-content.js) already use this
// shape. The builder applies these fields directly - see the glossary at the
// top of that script.

const openRaces = load('Open-Races');
const openSubclasses = load('Open-Subclasses');

const firstSentence = (text) => {
  const t = String(text || '').split('\n')[0];
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
};

// Short beginner-facing pitch for each SRD race.
const SRD_BLURBS = {
  dwarf: 'Stout mountain folk. Tough (+2 CON), poison-resistant, see in the dark. Slow but unshakeable.',
  elf: 'Graceful and long-lived. Nimble (+2 DEX), keen senses, see in the dark, immune to magical sleep.',
  halfling: 'Small, cheerful and absurdly lucky (+2 DEX). Reroll natural 1s. Brave beyond their size.',
  human: 'Adaptable and ambitious: +1 to every ability score. Good at absolutely everything.',
  dragonborn: 'Dragon-blooded warriors (+2 STR, +1 CHA) with a literal breath weapon.',
  gnome: 'Small, brilliant tinkerers (+2 INT) with advantage on mental saves vs magic.',
  'half-elf': 'Charismatic wanderers between worlds: +2 CHA, +1 to two others, two free skills.',
  'half-orc': 'Fierce and unstoppable (+2 STR, +1 CON): survive lethal blows, crit harder.',
  tiefling: 'Marked by infernal heritage (+2 CHA, +1 INT): fire-resistant, innate magic.',
};

const bonusMap = (list) => {
  const out = {};
  for (const b of list || []) out[b.ability_score.index] = (out[b.ability_score.index] || 0) + b.bonus;
  return out;
};

const traitText = (t) => ({ name: t.name, desc: (t.desc || []).join(' ') });

// Proficiencies a set of SRD traits grants: Keen Senses -> Perception, etc.
function srdGrants(traits) {
  const g = { skills: [], skill_choices: [], weapon_profs: [], armor_profs: [], tool_profs: [], hp_per_level: 0 };
  for (const t of traits) {
    for (const p of t.proficiencies || []) {
      const type = byIndex.proficiencies.get(p.index)?.type;
      if (type === 'Skills') g.skills.push(p.index.replace(/^skill-/, ''));
      else if (type === 'Weapons') g.weapon_profs.push(p.name);
      else if (type === 'Armor') g.armor_profs.push(p.name);
      else g.tool_profs.push(p.name);
    }
    const pc = t.proficiency_choices;
    const opts = pc ? pc.from.options.map((o) => o.item.index) : [];
    // Skill Versatility becomes a pick; a tool pick (Dwarf) stays in the trait text.
    if (pc && opts.every((i) => byIndex.proficiencies.get(i)?.type === 'Skills')) {
      const from = opts.map((i) => i.replace(/^skill-/, ''));
      g.skill_choices.push(from.length >= 18 ? { choose: pc.choose } : { choose: pc.choose, from });
    }
    if (t.index === 'dwarven-toughness') g.hp_per_level += 1;
  }
  return g;
}

function srdAbilityChoices(options) {
  if (!options) return [];
  const from = options.from.options.map((o) => o.ability_score.index);
  return [{ choose: options.choose, bonus: options.from.options[0].bonus, from }];
}

// Dragonborn's ancestry is a real choice (colour -> damage type and breath
// shape), so it's offered the same way as a subrace.
function dragonbornAncestries() {
  return raw.traits
    .filter((t) => t.parent && t.parent.index === 'draconic-ancestry')
    .map((t) => {
      const colour = t.name.match(/\((.+)\)/)[1];
      const ts = t.trait_specific;
      const aoe = ts.breath_weapon.area_of_effect;
      const shape = aoe.type === 'line' ? `5 by ${aoe.size} ft. line` : `${aoe.size} ft. cone`;
      const dmg = ts.damage_type.name.toLowerCase();
      const save = ts.breath_weapon.dc.dc_type.name;
      return {
        index: `dragonborn-${slugify(colour)}`, name: colour, display: `${colour} Dragonborn`, source: 'srd51',
        blurb: `${ts.damage_type.name} breath in a ${shape} (${save} save); resistance to ${dmg} damage.`,
        traits: [{
          name: t.name,
          desc: `Your breath weapon deals ${dmg} damage in a ${shape}, and targets make a ${save} saving throw. You have resistance to ${dmg} damage.`,
        }],
      };
    });
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normaliseSrdRace(race) {
  const traits = (race.traits || []).map((t) => byIndex.traits.get(t.index)).filter(Boolean);
  const grants = srdGrants(traits);
  let subraces = (race.subraces || []).map((ref) => {
    const sub = byIndex.subraces.get(ref.index);
    const subTraits = (sub.racial_traits || []).map((t) => byIndex.traits.get(t.index)).filter(Boolean);
    const ability_bonuses = bonusMap(sub.ability_bonuses);
    return {
      index: sub.index, name: sub.name, display: sub.name, source: 'srd51',
      blurb: firstSentence(sub.desc),
      ability_bonuses,
      asi_summary: asiSummary(ability_bonuses),
      ...srdGrants(subTraits),
      traits: subTraits.map(traitText),
    };
  });
  subraces.push(...openRaces.srd_subraces.filter((s) => s.parent === race.index).map(({ parent, ...s }) => ({ display: s.name, ...s })));
  let subraceLabel = 'Subrace';
  if (race.index === 'dragonborn') {
    subraces = dragonbornAncestries();
    subraceLabel = 'Draconic Ancestry';
  }
  const ability_bonuses = bonusMap(race.ability_bonuses);
  const ability_choices = srdAbilityChoices(race.ability_bonus_options);
  return {
    index: race.index,
    name: race.name,
    source: 'srd51',
    size: race.size,
    speed: race.speed,
    darkvision: traits.some((t) => t.index === 'darkvision') ? 60 : 0,
    blurb: SRD_BLURBS[race.index] || '',
    desc: race.size_description || '',
    ability_bonuses,
    ability_choices,
    asi_summary: asiSummary(ability_bonuses, ability_choices),
    ...grants,
    languages: (race.languages || []).map((l) => l.name),
    language_note: race.language_options ? 'plus one language of your choice' : undefined,
    natural_attacks: [],
    traits: traits.filter((t) => !t.parent).map(traitText),
    subrace_label: subraceLabel,
    subrace_required: subraces.length > 0,
    subraces,
  };
}

const allRaces = [...raw.races.map(normaliseSrdRace), ...openRaces.races];
const raceByIndex = new Map(allRaces.map((r) => [r.index, r]));

// Speeds and sizes a race can end up with once its subrace is chosen (a
// Gearforged is 25 or 30 ft, Small or Medium, depending on the chassis).
function outcomes(r, key) {
  const subs = r.subraces || [];
  const values = r.subrace_required && subs.length ? subs.map((s) => s[key] || r[key]) : [r[key], ...subs.map((s) => s[key] || r[key])];
  return [...new Set(values)].sort();
}

const raceSummaries = allRaces.map((r) => ({
  index: r.index,
  name: r.name,
  source: r.source,
  size: r.size,
  speed: r.speed,
  sizes: outcomes(r, 'size'),
  speeds: outcomes(r, 'speed').map(Number).sort((a, b) => a - b),
  darkvision: r.darkvision || 0,
  blurb: r.blurb,
  asi_summary: r.asi_summary,
  subrace_label: r.subrace_label || null,
  subrace_count: (r.subraces || []).length,
}));

// ---- subclasses ----

// The SRD spells a subclass always has prepared, when they depend on level only.
function srdSubclassSpells(sc) {
  const spells = sc.spells || [];
  if (!spells.length || !spells.every((s) => s.prerequisites.every((p) => p.type === 'level'))) return null;
  const byLevel = new Map();
  for (const s of spells) {
    const lvl = parseInt(s.prerequisites[0].index.split('-').pop(), 10);
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(s.spell.name.toLowerCase());
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([l, names]) => `Level ${l}: ${names.join(', ')}`).join('\n');
}

function srdFeatureText(f) {
  let text = (f.desc || []).join(' ');
  const opts = f.feature_specific?.subfeature_options?.from?.options || [];
  for (const o of opts) {
    const sub = byIndex.features.get(o.item.index);
    if (sub) text += `\n• ${sub.name.replace(/^.*?:\s*/, '')}: ${(sub.desc || []).join(' ')}`;
  }
  return text;
}

const SUBCLASS_FLAVOR = Object.fromEntries(raw.subclasses.map((s) => [s.class.index, s.subclass_flavor]));
// 5e-bits shortens the SRD's subclass names ("Draconic"); show them as the SRD prints them.
const SRD_SUBCLASS_NAMES = {
  berserker: 'Path of the Berserker', lore: 'College of Lore', life: 'Life Domain', land: 'Circle of the Land',
  champion: 'Champion', 'open-hand': 'Way of the Open Hand', devotion: 'Oath of Devotion', hunter: 'Hunter',
  thief: 'Thief', draconic: 'Draconic Bloodline', fiend: 'The Fiend', evocation: 'School of Evocation',
};
const SPELL_FEATURE = { cleric: 'Domain Spells', paladin: 'Oath Spells', warlock: 'Expanded Spell List' };

function normaliseSrdSubclass(sc) {
  const levels = {};
  for (const l of subclassLevels(sc.index)) {
    const feats = (l.features || []).map((f) => ({ name: f.name, desc: srdFeatureText(f) }));
    if (feats.length) levels[l.level] = feats;
  }
  const spells = srdSubclassSpells(sc);
  if (spells) {
    const first = Math.min(...Object.keys(levels).map(Number));
    levels[first].push({ name: SPELL_FEATURE[sc.class.index] || 'Subclass Spells', desc: `Always prepared, and they don't count against your prepared spells:\n${spells}` });
  }
  const desc = (sc.desc || []).join('\n');
  return { index: sc.index, name: SRD_SUBCLASS_NAMES[sc.index] || sc.name, class: sc.class.index, source: 'srd51', desc, blurb: firstSentence(desc), restriction: null, levels };
}

const allSubclasses = [...raw.subclasses.map(normaliseSrdSubclass), ...openSubclasses];
for (const s of allSubclasses) s.flavor = SUBCLASS_FLAVOR[s.class];
const subclassByIndex = new Map(allSubclasses.map((s) => [s.index, s]));
const SOURCE_ORDER = Object.fromEntries(SOURCES.map((s, i) => [s.key, i]));

function subclassesFor(cls) {
  return allSubclasses
    .filter((s) => s.class === cls)
    .sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.name.localeCompare(b.name))
    .map(({ levels, desc, ...summary }) => ({ ...summary, first_level: Math.min(...Object.keys(levels).map(Number)) }));
}

module.exports = {
  raw,
  byIndex,
  monsterSummaries,
  spellSummaries,
  equipmentSummaries,
  magicItemSummaries,
  classDetail,
  classLevels,
  subclassLevels,
  raceSummaries,
  raceByIndex,
  subclassesFor,
  subclassByIndex,
  sources: { list: SOURCES, oglText: OGL_TEXT, oglSection15: OGL_SECTION_15 },
};
