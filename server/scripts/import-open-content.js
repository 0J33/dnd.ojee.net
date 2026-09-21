#!/usr/bin/env node
// Builds the open-licensed expansion data served next to the SRD:
//
//   server/data/Open-Races.json       races + subraces beyond SRD 5.1
//   server/data/Open-Subclasses.json  subclasses beyond SRD 5.1
//
// Rules text comes from the Open5e API (api.open5e.com), which only carries
// content released under an open licence. Every source used here is listed in
// server/srd/sources.js with its licence and attribution, and nothing outside
// that list is imported. The structured mechanics (which scores go up, which
// skills are granted, speed, size...) are authored below, because Open5e only
// ships them as prose. A few size/speed lines missing from Open5e were checked
// against the Kobold Press OGL wiki (kpogl.wikidot.com).
//
// Usage:  node scripts/import-open-content.js     (from server/)

const fs = require('fs');
const path = require('path');
const { asiSummary } = require('../srd/asi');

const API = 'https://api.open5e.com';
const OUT = path.join(__dirname, '..', 'data');

// Only these Open5e documents are imported. Keys match server/srd/sources.js.
const DOCS = { 'srd-2024': 'srd52', toh: 'toh', tdcs: 'tdcs', open5e: 'open5e' };


async function getAll(url) {
  const out = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`${res.status} ${next}`);
    const page = await res.json();
    out.push(...page.results);
    next = page.next;
  }
  return out;
}

// ---------------------------------------------------------------- text

// Markdown tables become one line per row, cells separated by " · ".
function tableToText(block) {
  const rows = block
    .split('\n')
    .filter((l) => l.includes('|'))
    .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-*:?$/.test(c)));
  return rows.map((cells) => cells.filter((c, i) => c || i < cells.length - 1).join(' · ')).join('\n');
}

function clean(md) {
  if (!md) return '';
  let s = String(md).replace(/\r/g, '');
  // table blocks: consecutive lines with at least two pipes
  s = s.replace(/(?:^[^\n]*\|[^\n]*\|[^\n]*(?:\n|$))+/gm, (block) => `${tableToText(block)}\n`);
  s = s.replace(/^\s*\*\*([^*\n]+?) \(table\)\*\*\s*$/gm, '$1'); // "**X Spells (table)**" captions
  s = s.replace(/\(table\)/g, '');
  s = s.replace(/^#{2,6}\s*/gm, ''); // inline sub-headings become plain lines
  for (let i = 0; i < 3; i++) s = s.replace(/(\*{1,3}|_{1,2})(?=\S)([^*_\n]+?)(?<=\S)\1/g, '$2');
  s = s.replace(/\*+/g, '');
  s = s.replace(/^\s*[-*]\s+/gm, '• ');
  // cross-references to other Kobold Press books this app doesn't carry
  s = s.replace(/\s*\(see [^)]*(?:Handbook|Tome of Beasts|Creature Codex|Deep Magic|Midgard)[^)]*\)/g, '');
  s = s.replace(/\b(don|can|isn|aren|doesn|won|wouldn|couldn|shouldn|hasn|haven|didn|wasn|weren)-t\b/g, "$1't");
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

const firstSentence = (s, max = 220) => {
  const t = clean(s).split('\n')[0];
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  const out = m ? m[0] : t;
  return out.length > max ? `${out.slice(0, max - 1).trim()}…` : out;
};

const slug = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "Starting at 6th level", "At 10th level", "When you reach 13th level"... -
// only when the text opens with it; "...another cantrip at 10th level" later in
// a sentence is not the level the feature arrives at.
function levelFromText(text) {
  const m = String(text).trim().match(/^(?:at|starting at|beginning at|when you reach|upon reaching|once you reach|by)\s+(\d{1,2})(?:st|nd|rd|th)[ -]level\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------- races
//
// Field glossary (the builder reads these):
//   ability_bonuses   fixed increases, { ability: bonus }
//   ability_choices   [{ choose, bonus, from?, exclude? }] - picks must be distinct abilities
//   replaces_ability  a subrace whose increases replace the base race's
//   replaces_traits   base-race traits a subrace replaces
//   skills / skill_choices, weapon_profs, armor_profs, tool_profs
//   languages + language_note (free-text extra picks)
//   natural_attacks   [{ name, damage, damageType }] - STR-based unarmed strikes
//   hp_per_level      e.g. Dwarven Toughness
//   subrace_label / subrace_required / subrace_optional

const SKIP_TRAITS = new Set([
  'Ability Score Increase', 'Speed', 'Age', 'Alignment', 'Size', 'Languages',
  'Race Chassis', 'Heritage Subrace', 'Subrace', 'Living Origin',
]);

const RACES = [
  // ---- SRD 5.2 (2024 species). Their ability increases live on backgrounds in
  // the 2024 rules; this table uses 2014-style backgrounds, so the species gets
  // the standard +2/+1 instead, stated in an explicit trait.
  {
    key: 'srd-2024_goliath', index: 'goliath', name: 'Goliath', source: 'srd52',
    size: 'Medium', speed: 35, darkvision: 0,
    ability_choices: [{ choose: 1, bonus: 2 }, { choose: 1, bonus: 1 }],
    languages: ['Common'], language_note: 'plus one language of your choice',
    blurb: 'Towering giant-kin (+2/+1 where you like). Pick a giant ancestry boon; grow to Large size from level 5.',
    adaptedAsi: true,
    subrace_label: 'Giant Ancestry', subrace_required: true,
    ancestryFrom: 'Giant Ancestry',
  },
  {
    key: 'srd-2024_orc', index: 'orc', name: 'Orc', source: 'srd52',
    size: 'Medium', speed: 30, darkvision: 120,
    ability_choices: [{ choose: 1, bonus: 2 }, { choose: 1, bonus: 1 }],
    languages: ['Common', 'Orc'],
    blurb: 'Relentless and quick (+2/+1 where you like): dash as a bonus action for temp HP, refuse to drop at 0 HP.',
    adaptedAsi: true,
  },

  // ---- Tome of Heroes (Kobold Press)
  {
    key: 'toh_alseid', index: 'alseid', name: 'Alseid', source: 'toh',
    size: 'Medium', speed: 40, darkvision: 60,
    ability_bonuses: { dex: 2, wis: 1 },
    skills: ['stealth'], weapon_profs: ['Spears', 'Shortbows'],
    languages: ['Common', 'Elvish'],
    blurb: 'Swift deer-bodied forest folk (+2 DEX, +1 WIS). 40 ft speed, stealthy, trained with spear and shortbow.',
  },
  {
    key: 'toh_catfolk', index: 'catfolk', name: 'Catfolk', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { dex: 2 },
    skills: ['perception', 'stealth'],
    languages: ['Common'],
    natural_attacks: [{ name: 'Claws', damage: '1d4', damageType: 'slashing' }],
    blurb: 'Lithe hunters (+2 DEX) with keen senses and claws. Proficient in Perception and Stealth.',
    subrace_label: 'Catfolk type', subrace_required: true,
    subraces: [
      { key: 'toh_malkin', index: 'malkin', name: 'Malkin', display: 'Malkin Catfolk', size: 'Small', ability_bonuses: { int: 1 }, skills: ['investigation'] },
      { key: 'toh_pantheran', index: 'pantheran', name: 'Pantheran', display: 'Pantheran Catfolk', ability_bonuses: { wis: 1 }, skill_choices: [{ choose: 1, from: ['insight', 'medicine', 'nature', 'survival'] }] },
    ],
  },
  {
    key: 'toh_darakhul', index: 'darakhul', name: 'Darakhul', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { con: 1 },
    languages: ['Common', 'Darakhul'], language_note: 'plus a language of your heritage',
    natural_attacks: [{ name: 'Bite', damage: '1d4', damageType: 'piercing' }],
    blurb: 'Intelligent ghouls who kept a spark of their old lives (+1 CON, plus your heritage). Tough, hungry, undead-ish.',
    subrace_label: 'Heritage', subrace_required: true,
    subraces: [
      { key: 'toh_derro-heritage', index: 'darakhul-derro', name: 'Derro Heritage', size: 'Small', speed: 30, ability_bonuses: { cha: 2 } },
      { key: 'toh_dragonborn-heritage', index: 'darakhul-dragonborn', name: 'Dragonborn Heritage', speed: 25, ability_bonuses: { str: 2 } },
      { key: 'toh_drow-heritage', index: 'darakhul-drow', name: 'Drow Heritage', ability_bonuses: { int: 2 } },
      { key: 'toh_dwarf-heritage', index: 'darakhul-dwarf', name: 'Dwarf Heritage', speed: 25, ability_bonuses: { wis: 2 }, hp_per_level: 1 },
      { key: 'toh_elfshadow-fey-heritage', index: 'darakhul-elf', name: 'Elf/Shadow Fey Heritage', ability_bonuses: { dex: 2 }, skills: ['perception'] },
      { key: 'toh_gnome-heritage', index: 'darakhul-gnome', name: 'Gnome Heritage', size: 'Small', speed: 25, ability_bonuses: { int: 2 } },
      { key: 'toh_halfling-heritage', index: 'darakhul-halfling', name: 'Halfling Heritage', size: 'Small', speed: 25, ability_bonuses: { dex: 2 } },
      { key: 'toh_humanhalf-elf-heritage', index: 'darakhul-human', name: 'Human/Half-Elf Heritage', ability_choices: [{ choose: 1, bonus: 2, exclude: ['con'] }], skill_choices: [{ choose: 2 }] },
      { key: 'toh_kobold-heritage', index: 'darakhul-kobold', name: 'Kobold Heritage', size: 'Small', speed: 30, ability_bonuses: { int: 2 } },
      { key: 'toh_ravenfolk', index: 'darakhul-ravenfolk', name: 'Ravenfolk Heritage', ability_bonuses: { dex: 2 } },
      // Open5e prints +1 here; every other heritage (and the Kobold Press OGL wiki) gives +2.
      { key: 'toh_tiefling-heritage', index: 'darakhul-tiefling', name: 'Tiefling Heritage', ability_bonuses: { cha: 2 } },
      { key: 'toh_trollkin-heritage', index: 'darakhul-trollkin', name: 'Trollkin Heritage', ability_bonuses: { str: 2 } },
    ],
  },
  {
    key: 'toh_derro', index: 'derro', name: 'Derro', source: 'toh',
    size: 'Small', speed: 30, darkvision: 120,
    ability_bonuses: { dex: 2 },
    languages: ['Common', 'Dwarvish'], language_note: 'Undercommon may replace Common',
    blurb: 'Small, quick, and touched by madness (+2 DEX). See 120 ft in the dark; resist spells that target your body.',
    subrace_label: 'Derro type', subrace_required: true,
    subraces: [
      { key: 'toh_far-touched', index: 'far-touched', name: 'Far-Touched', display: 'Far-Touched Derro', ability_bonuses: { cha: 1 } },
      { key: 'toh_mutated', index: 'mutated', name: 'Mutated', display: 'Mutated Derro', ability_bonuses: { str: 1 }, skills: ['athletics'] },
      { key: 'toh_uncorrupted', index: 'uncorrupted', name: 'Uncorrupted', display: 'Uncorrupted Derro', ability_bonuses: { wis: 1 }, skills: ['insight'] },
    ],
  },
  {
    key: 'toh_drow', index: 'drow', name: 'Drow', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 120,
    ability_bonuses: { int: 2 },
    languages: ['Common', 'Elvish'], language_note: 'Undercommon may replace Common',
    blurb: 'Underground elves with minds of steel (+2 INT). Superior darkvision, charm-resistant, sleep-immune.',
    subrace_label: 'Caste', subrace_required: true,
    subraces: [
      { key: 'toh_delver', index: 'delver', name: 'Delver', display: 'Delver Drow', ability_choices: [{ choose: 1, bonus: 1, from: ['str', 'dex'] }], skill_choices: [{ choose: 1 }], armor_profs: ['Light armor'] },
      { key: 'toh_fever-bit', index: 'fever-bit', name: 'Fever-Bit', display: 'Fever-Bit Drow', ability_bonuses: { con: 1 } },
      { key: 'toh_purified', index: 'purified', name: 'Purified', display: 'Purified Drow', ability_bonuses: { cha: 1 }, skill_choices: [{ choose: 2, from: ['history', 'insight', 'performance', 'persuasion'] }] },
    ],
  },
  {
    key: 'toh_erina', index: 'erina', name: 'Erina', source: 'toh',
    size: 'Small', speed: 25, darkvision: 60,
    ability_bonuses: { dex: 2 }, ability_choices: [{ choose: 1, bonus: 1, from: ['wis', 'cha'] }],
    skills: ['perception'],
    languages: ['Erina', 'Common'], language_note: 'Sylvan may replace Common',
    blurb: 'Hedgehog folk (+2 DEX, +1 WIS or CHA). Spiny, poison-hardy, and able to burrow through earth.',
  },
  {
    key: 'toh_gearforged', index: 'gearforged', name: 'Gearforged', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 0,
    ability_choices: [{ choose: 2, bonus: 1 }],
    languages: ['Common', 'Machine Speech'],
    blurb: 'A soul bound into a clockwork machine body (+1 to two scores). Needs no food, air or sleep; shrugs off poison and disease.',
    subrace_label: 'Race Chassis', subrace_required: true,
    subraces: [
      { key: 'toh_dwarf-chassis', index: 'dwarf-chassis', name: 'Dwarf Chassis', display: 'Gearforged (Dwarf Chassis)', speed: 25, ability_bonuses: { con: 1 }, languages: ['Dwarvish'], armor_profs: ['Light armor', 'Medium armor'] },
      { key: 'toh_gnome-chassis', index: 'gnome-chassis', name: 'Gnome Chassis', display: 'Gearforged (Gnome Chassis)', size: 'Small', speed: 25, ability_bonuses: { int: 1 }, languages: ['Gnomish'] },
      { key: 'toh_human-chassis', index: 'human-chassis', name: 'Human Chassis', display: 'Gearforged (Human Chassis)', speed: 30, ability_choices: [{ choose: 1, bonus: 1 }], skill_choices: [{ choose: 2 }], language_note: 'plus one language of your choice' },
      { key: 'toh_kobold-chassis', index: 'kobold-chassis', name: 'Kobold Chassis', display: 'Gearforged (Kobold Chassis)', size: 'Small', speed: 30, ability_bonuses: { dex: 1 }, languages: ['Draconic'] },
    ],
  },
  {
    key: 'toh_minotaur', index: 'minotaur', name: 'Minotaur', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { str: 2, con: 1 },
    languages: ['Common', 'Minotaur'],
    natural_attacks: [{ name: 'Horns', damage: '1d6', damageType: 'piercing' }],
    blurb: 'Horned powerhouses (+2 STR, +1 CON). Gore with your horns and charge foes off their feet.',
    subrace_label: 'Variant', subrace_optional: true, subrace_none: 'Standard minotaur',
    subraces: [
      { key: 'toh_bhain-kwai', index: 'bhain-kwai', name: 'Bhain Kwai', display: 'Bhain Kwai Minotaur', ability_bonuses: { con: 2, str: 1 }, replaces_ability: true, replaces_traits: ['Charge'] },
      { key: 'toh_boghaid', index: 'boghaid', name: 'Boghaid', display: 'Boghaid Minotaur', ability_bonuses: { wis: 2, con: 1 }, replaces_ability: true, replaces_traits: ['Charge'], skills: ['performance'] },
    ],
  },
  {
    key: 'toh_mushroomfolk', index: 'mushroomfolk', name: 'Mushroomfolk', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { wis: 2 },
    skills: ['survival'],
    languages: ['Common', 'Mushroomfolk'], language_note: 'Undercommon may replace Common',
    blurb: 'Fungal folk of the deep (+2 WIS). Poison- and disease-proof survivors with spore-born gifts.',
    subrace_label: 'Clan role', subrace_required: true,
    subraces: [
      { key: 'toh_acid-cap', index: 'acid-cap', name: 'Acid Cap', display: 'Acid Cap Mushroomfolk', ability_bonuses: { str: 1 }, skills: ['athletics'] },
      { key: 'toh_favored', index: 'favored', name: 'Favored', display: 'Favored Mushroomfolk', ability_bonuses: { cha: 1 }, skills: ['persuasion'] },
      { key: 'toh_morel', index: 'morel', name: 'Morel', display: 'Morel Mushroomfolk', size: 'Small', speed: 35, ability_bonuses: { dex: 1 }, skills: ['stealth'] },
    ],
  },
  {
    key: 'toh_satarre', index: 'satarre', name: 'Satarre', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { con: 2, int: 1 },
    skills: ['arcana'], skill_choices: [{ choose: 1, from: ['history', 'insight', 'religion'] }],
    languages: ['Common'], language_note: 'plus Abyssal, Infernal or Void Speech',
    blurb: 'Tall, eerie scholars of the void (+2 CON, +1 INT). Necrotic-resistant; spread a rotting curse.',
  },
  {
    key: 'toh_shade', index: 'shade', name: 'Shade', source: 'toh',
    size: 'Medium', speed: 30, darkvision: 60,
    ability_bonuses: { cha: 1 },
    languages: ['Common'],
    blurb: 'A soul that refused to move on (+1 CHA, +1 from your old life). Drain life, and later turn ghostly.',
    subrace_label: 'Living Origin', subrace_required: true,
    v1Slug: 'shade', // v2 has no traits for shade; v1 does
    livingOrigins: true,
  },
];

// Shade: "your size and speed are those of your Living Origin, and you know one
// language spoken by it"; +1 to one score that origin (or its subrace) raises.
const LIVING_ORIGINS = [
  { index: 'dwarf', name: 'Dwarf', size: 'Medium', speed: 25, lang: 'Dwarvish', from: ['con', 'wis'] },
  { index: 'elf', name: 'Elf', size: 'Medium', speed: 30, lang: 'Elvish', from: ['dex', 'int'] },
  { index: 'halfling', name: 'Halfling', size: 'Small', speed: 25, lang: 'Halfling', from: ['dex', 'con'] },
  { index: 'human', name: 'Human', size: 'Medium', speed: 30, lang: null, from: null },
  { index: 'dragonborn', name: 'Dragonborn', size: 'Medium', speed: 30, lang: 'Draconic', from: ['str'] },
  { index: 'gnome', name: 'Gnome', size: 'Small', speed: 25, lang: 'Gnomish', from: ['int', 'con'] },
  { index: 'half-elf', name: 'Half-Elf', size: 'Medium', speed: 30, lang: 'Elvish', from: null },
  { index: 'half-orc', name: 'Half-Orc', size: 'Medium', speed: 30, lang: 'Orc', from: ['str', 'con'] },
  { index: 'tiefling', name: 'Tiefling', size: 'Medium', speed: 30, lang: 'Infernal', from: ['int'] },
  { index: 'goliath', name: 'Goliath', size: 'Medium', speed: 35, lang: 'Giant', from: null },
  { index: 'orc', name: 'Orc', size: 'Medium', speed: 30, lang: 'Orc', from: null },
];

// Subraces for SRD 5.1 races, from other open sources.
const SRD_SUBRACES = [
  {
    parent: 'halfling', key: 'open5e_stoor-halfling', index: 'stoor-halfling', name: 'Stoor Halfling', source: 'open5e',
    ability_bonuses: { con: 1 },
  },
];

function traitList(species, exclude = []) {
  return (species?.traits || [])
    .filter((t) => !SKIP_TRAITS.has(t.name) && !exclude.includes(t.name))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => ({ name: t.name.replace(/\.$/, ''), desc: clean(t.desc) }));
}

function v1Traits(v1race) {
  // "***Name.*** text" paragraphs
  const out = [];
  const re = /\*\*\*([^*]+?)\.\*\*\*\s*([\s\S]*?)(?=\n\s*\*\*\*|$)/g;
  let m;
  while ((m = re.exec(v1race.traits || ''))) {
    if (SKIP_TRAITS.has(m[1].trim())) continue;
    out.push({ name: m[1].trim(), desc: clean(m[2]) });
  }
  const dv = (v1race.vision || '').match(/\*\*\*([^*]+?)\.\*\*\*\s*([\s\S]*)/);
  if (dv) out.unshift({ name: dv[1].trim(), desc: clean(dv[2]) });
  return out;
}

function buildRaces(species, v1races) {
  const byKey = new Map(species.map((s) => [s.key, s]));
  const races = [];

  for (const def of RACES) {
    const sp = byKey.get(def.key);
    if (!sp && !def.v1Slug) throw new Error(`missing species ${def.key}`);
    let traits = def.v1Slug ? v1Traits(v1races.find((r) => r.slug === def.v1Slug)) : traitList(sp);
    let subraces = [];

    if (def.adaptedAsi) {
      traits.unshift({
        name: 'Ability Score Increase',
        desc: 'Increase one ability score by 2 and a different one by 1. (SRD 5.2 grants these through your background; this table uses the classic backgrounds, so your species carries them instead.)',
      });
    }

    if (def.ancestryFrom) {
      // Goliath: the ancestry boons are one pick-one trait - offer them as the choice.
      const t = sp.traits.find((x) => x.name === def.ancestryFrom);
      const [intro, ...rest] = t.desc.split(/\n\s*-\s+/);
      const uses = (intro.match(/you can use the chosen benefit (.+?):?\s*$/) || [])[1];
      traits = traits.filter((x) => x.name !== def.ancestryFrom);
      subraces = rest.map((bullet) => {
        const m = bullet.match(/^\*\*(.+?)\s*\((.+?)\)\*\*\.\s*([\s\S]*)$/);
        return {
          index: `goliath-${slug(m[2])}`, name: m[2], display: `Goliath (${m[2]})`,
          blurb: clean(m[3]),
          traits: [{ name: `${def.ancestryFrom}: ${m[1]}`, desc: `${clean(m[3])}${uses ? ` You can use this ${uses.replace(/^a number/, 'a number')}.` : ''}` }],
        };
      });
    }

    for (const sdef of def.subraces || []) {
      const ss = byKey.get(sdef.key);
      if (!ss) throw new Error(`missing subspecies ${sdef.key}`);
      const { key, ...rest } = sdef;
      subraces.push({
        display: `${def.name} (${sdef.name})`,
        ...rest,
        blurb: firstSentence(ss.desc),
        traits: traitList(ss),
      });
    }

    if (def.livingOrigins) {
      subraces = LIVING_ORIGINS.map((o) => ({
        index: `shade-${o.index}`, name: `${o.name} origin`, display: `Shade (${o.name})`,
        size: o.size, speed: o.speed,
        languages: o.lang ? [o.lang] : [],
        language_note: o.lang ? undefined : 'plus one language of your choice',
        ability_choices: [{ choose: 1, bonus: 1, ...(o.from ? { from: o.from } : {}), exclude: ['cha'] }],
        blurb: `In life you were ${/^[aeiou]/i.test(o.name) ? 'an' : 'a'} ${o.name.toLowerCase()}: you keep that size (${o.size}) and speed (${o.speed} ft).`,
        traits: [],
      }));
    }

    const {
      key, adaptedAsi, ancestryFrom, v1Slug, livingOrigins, subraces: _s, ...fields
    } = def;
    const race = { ...fields, desc: sp ? firstSentence(sp.desc, 400) : '', traits, subraces };
    race.asi_summary = adaptedAsi ? '+2 and +1 to scores you choose' : asiSummary(race.ability_bonuses, race.ability_choices);
    for (const s of race.subraces) s.asi_summary = asiSummary(s.ability_bonuses, s.ability_choices);
    races.push(race);
  }

  const extraSubraces = SRD_SUBRACES.map(({ key, ...rest }) => {
    const ss = byKey.get(key);
    return { ...rest, blurb: firstSentence(ss.desc), traits: traitList(ss), asi_summary: asiSummary(rest.ability_bonuses, rest.ability_choices) };
  });

  return { races, srd_subraces: extraSubraces };
}

// ---------------------------------------------------------------- subclasses

const CLASS_OF = (key) => key.replace(/^srd_/, '');

function splitFeature(feature, baseLevel) {
  // A heading inside a feature is either a sub-section ("Cantrips" under
  // Spellcasting) or a separate feature Open5e glued on ("Covered in Ash" at
  // 6th level). Only the second kind, which states a different level, splits.
  const parts = String(feature.desc || '').split(/\n(?=#{2,6}\s*\S)/);
  const out = [{ name: feature.name, level: baseLevel, desc: parts[0] }];
  for (const part of parts.slice(1)) {
    const m = part.match(/^#{2,6}\s*(.+)\n([\s\S]*)$/);
    const lvl = m ? levelFromText(m[2]) : null;
    if (m && lvl && lvl !== baseLevel) out.push({ name: m[1].trim(), level: lvl, desc: m[2] });
    else out[out.length - 1].desc += `\n${part}`;
  }
  return out.map((f) => ({ ...f, name: f.name.replace(/\s*\(table\)/i, '').replace(/\.$/, '').trim(), desc: clean(f.desc) }));
}

function v1Features(desc, baseLevel) {
  const parts = String(desc).split(/\n(?=#{3,6}\s*\S)/);
  const flavor = clean(parts[0]);
  const features = parts.slice(1).map((p) => {
    const m = p.match(/^#{3,6}\s*(.+)\n([\s\S]*)$/);
    return { name: m[1].trim(), level: levelFromText(m[2]) || baseLevel, desc: clean(m[2]) };
  });
  return { flavor, features };
}

const SUBCLASS_LEVEL = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };

function buildSubclasses(classes, v1classes) {
  const out = [];
  for (const c of classes) {
    const source = DOCS[c.document.key];
    if (!source || source === 'srd52' || !c.subclass_of) continue;
    if (!/^srd_/.test(c.subclass_of.key)) continue; // 2024-rules or non-SRD parent classes
    const cls = CLASS_OF(c.subclass_of.key);
    const baseLevel = SUBCLASS_LEVEL[cls] || 3;

    let features = [];
    let flavor = clean(c.desc);
    if (!c.features.length) {
      const v1 = v1classes.find((x) => x.slug === cls);
      const arch = v1 && v1.archetypes.find((a) => a.name === c.name && a.document__slug === c.document.key);
      if (!arch) { console.warn(`skip ${c.key}: no features`); continue; }
      ({ flavor, features } = v1Features(arch.desc, baseLevel));
    } else {
      for (const f of c.features) {
        // nothing arrives before the class picks its subclass (Open5e lists a
        // few rogue features at level 1)
        const listed = (f.gained_at && f.gained_at.length) ? Math.min(...f.gained_at.map((g) => g.level)) : baseLevel;
        features.push(...splitFeature(f, Math.max(baseLevel, listed)));
      }
    }

    // restriction notes ("Restriction: Alseid") surface on the picker card
    const restriction = features.find((f) => /^Restriction/i.test(f.name));
    features.sort((a, b) => a.level - b.level);
    const levels = {};
    for (const f of features) (levels[f.level] = levels[f.level] || []).push({ name: f.name, desc: f.desc });

    // Open5e Originals open with "Compare to core book's X" rather than flavour
    const compare = flavor.match(/^Compare to (?:the )?core book[’']s ([^.\n]+)/i);
    if (compare) flavor = `An open-licence take on the core book's ${compare[1].trim()}.${flavor.slice(compare[0].length).replace(/^\.?/, '')}`.trim();

    out.push({
      index: c.key.replace('_', '-'),
      name: c.name,
      class: cls,
      source,
      desc: flavor,
      blurb: firstSentence(flavor),
      restriction: restriction ? restriction.desc : null,
      levels,
    });
  }
  out.sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name));
  return out;
}

// ---------------------------------------------------------------- main

(async () => {
  console.log('fetching Open5e…');
  const [species, classes, v1races] = await Promise.all([
    getAll(`${API}/v2/species/?limit=200`),
    getAll(`${API}/v2/classes/?limit=500`),
    getAll(`${API}/v1/races/?limit=200`),
  ]);
  const v1classes = await getAll(`${API}/v1/classes/?limit=50`);
  const ogl = await (await fetch(`${API}/v2/licenses/ogl-10a/`)).json();

  const races = buildRaces(species, v1races);
  const subclasses = buildSubclasses(classes, v1classes);

  fs.writeFileSync(path.join(OUT, 'Open-Races.json'), `${JSON.stringify(races, null, 1)}\n`);
  fs.writeFileSync(path.join(OUT, 'Open-Subclasses.json'), `${JSON.stringify(subclasses, null, 1)}\n`);
  // Sections 1-14 verbatim; Section 15 (our copyright notices) is built from sources.js.
  const body = ogl.desc.replace(/\r/g, '').split(/\n15\. COPYRIGHT NOTICE/)[0].trim();
  fs.writeFileSync(path.join(OUT, 'OGL-1.0a.txt'), `${body}\n`);

  const bySource = {};
  for (const s of subclasses) bySource[s.source] = (bySource[s.source] || 0) + 1;
  console.log(`races: ${races.races.length} (+${races.srd_subraces.length} SRD subraces)`);
  console.log(`subclasses: ${subclasses.length}`, bySource);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
