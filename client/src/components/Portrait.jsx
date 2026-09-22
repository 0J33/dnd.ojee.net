import React, { useId, useMemo } from 'react';

// ================= Character & creature likenesses =================
//
// One drawing system, two sizes:
//   <Avatar>    framed bust - lobby cards, party list, sheet header, pickers
//   <TokenFace> the same bust cropped into the map token's disc
//
// A hero's look starts from their race, class and name, so the same character
// is recognisably the same person in the lobby and on the battle map without
// anyone having to upload a picture. Every trait can then be changed by hand
// (sheet.portrait.look), or replaced by the player's own picture
// (sheet.portrait.image). Both follow the character everywhere.

/* ---------------- deterministic per-character variation ---------------- */

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str || '').length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const pick = (arr, t) => arr[Math.floor(t * arr.length) % arr.length];

/* ---------------- colour ---------------- */
// Colours are authored as #rrggbb; light and shadow are mixed from them so a
// face is lit the same way whatever its skin.

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0x808080;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
const shade = (c, t = 0.3) => mix(c, '#140c08', t);
const light = (c, t = 0.2) => mix(c, '#fff3dc', t);
const luma = (c) => {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/* ---------------- the options a player can choose from ---------------- */

const SKIN = {
  porcelain: '#f0d2bc', pale: '#e6c1a2', fair: '#d9aa84', tan: '#c38e64', olive: '#a87c52',
  brown: '#8a5838', deep: '#643c24', ebony: '#46291a',
  grey: '#9aa0a8', green: '#7d9464', red: '#b56a63', scaled: '#8a9a6a', blue: '#7d94b5',
};
const HUMAN_SKINS = [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.tan, SKIN.olive, SKIN.brown, SKIN.deep, SKIN.ebony];

export const HAIR_COLORS = [
  '#1a1512', '#2b2018', '#4a3320', '#6b4a28', '#8a6a3a', '#c8a860', '#e0cc90',
  '#a83a2a', '#c86030', '#d8d2c2', '#8a8a90',
  '#3a3a54', '#4a64b0', '#7a4a9a', '#3a8a6a', '#c85a8a',
];
const NATURAL_HAIR = HAIR_COLORS.slice(0, 11);

export const EYE_COLORS = {
  brown: '#5a3620', hazel: '#8a6630', green: '#4f8a44', blue: '#4f7fb8', grey: '#8a939c',
  amber: '#c8902c', violet: '#8a64c0', red: '#c83a30', gold: '#e0b440', ice: '#bfe8ff',
};
const E = EYE_COLORS;
const ROBOT_GLOW = ['#5ef0e0', '#7fd0ff', '#ffb347', '#9dff8a', '#ff6a5a', '#d08aff'];

export const HAIR_STYLES = {
  crop: 'Cropped', swept: 'Swept', long: 'Long', wild: 'Wild', curls: 'Curls', braids: 'Braids',
  ponytail: 'Ponytail', bun: 'Bun', topknot: 'Topknot', mohawk: 'Mohawk', bald: 'Bald',
};
export const BEARDS = {
  none: 'None', stubble: 'Stubble', moustache: 'Moustache', goatee: 'Goatee',
  short: 'Short beard', full: 'Full beard', braided: 'Braided beard',
};
export const MOODS = { calm: 'Calm', smile: 'Smiling', grin: 'Grinning', stern: 'Stern', smirk: 'Smirking' };
export const MARKS = { none: 'None', scar: 'Scar', freckles: 'Freckles', warpaint: 'War paint', tattoo: 'Tattoo', mask: 'Face mask' };
const HEADWEAR_NAMES = {
  helm: 'Helm', greathelm: 'Great helm', hood: 'Hood', mitre: 'Mitre', cap: 'Feathered cap',
  wizhat: 'Wizard hat', antlers: 'Antler crown', circlet: 'Circlet',
};

/* ---------------- races ---------------- */
// jaw   - chin width, 0.35 fine to 0.66 heavy
// beard - how often a hero of this people has one, and which kinds

const COMMON_BEARDS = ['stubble', 'moustache', 'goatee', 'short', 'full'];

const RACES = {
  human: { skins: HUMAN_SKINS, ears: 'round', build: 1, jaw: 0.5, eyes: [E.brown, E.brown, E.hazel, E.blue, E.green, E.grey], beard: [0.4, COMMON_BEARDS] },
  elf: { skins: [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown], ears: 'point', build: 0.94, longFace: true, jaw: 0.36, eyes: [E.green, E.blue, E.hazel, E.violet, E.gold, E.grey] },
  'half-elf': { skins: HUMAN_SKINS, ears: 'halfpoint', build: 0.97, jaw: 0.44, eyes: [E.green, E.blue, E.hazel, E.brown, E.grey], beard: [0.25, ['stubble', 'goatee', 'short']] },
  dwarf: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown, SKIN.deep], ears: 'round', build: 1.12, jaw: 0.62, bushy: true, bigNose: true, eyes: [E.brown, E.grey, E.blue, E.hazel], beard: [1, ['full', 'braided', 'full', 'short']] },
  halfling: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.olive, SKIN.brown, SKIN.deep], ears: 'round', build: 0.88, roundFace: true, jaw: 0.55, eyes: [E.brown, E.hazel, E.green, E.blue], beard: [0.12, ['stubble', 'short']] },
  gnome: { skins: [SKIN.porcelain, SKIN.pale, SKIN.fair, SKIN.tan], ears: 'point', build: 0.86, roundFace: true, jaw: 0.55, bigNose: true, eyes: [E.blue, E.green, E.hazel, E.violet, E.brown], beard: [0.55, ['short', 'moustache', 'goatee', 'full']] },
  'half-orc': { skins: [SKIN.green, SKIN.grey, '#8a8a6a', SKIN.brown], ears: 'point', build: 1.16, jaw: 0.66, tusks: true, bigNose: true, eyes: [E.brown, E.amber, E.red, E.grey], beard: [0.3, ['stubble', 'goatee', 'short']] },
  dragonborn: { skins: [SKIN.scaled, SKIN.red, SKIN.blue, SKIN.grey, '#b89a4a', '#4a5a4a', '#c8ccd0'], ears: 'frill', build: 1.1, jaw: 0.6, snout: true, slit: true, hairless: true, crest: true, eyes: [E.gold, E.amber, E.red, E.green] },
  tiefling: { skins: [SKIN.red, '#9a4a6a', '#6a4a8a', SKIN.tan, SKIN.deep], ears: 'point', build: 1, jaw: 0.45, horns: true, glowEyes: true, eyes: [E.gold, E.red, E.amber, E.violet], hairColors: ['#1a1512', '#2b2018', '#3a2a4a', '#5a2a3a', '#3a3a54', '#7a4a9a'], beard: [0.25, ['goatee', 'stubble']] },

  // ---- SRD 5.2
  goliath: { skins: ['#9aa0a8', '#8a8f96', '#b0a89c', '#7d8590'], ears: 'round', build: 1.2, jaw: 0.62, markings: true, eyes: [E.blue, E.grey, E.green, E.brown], beard: [0.15, ['stubble', 'short']] },
  orc: { skins: [SKIN.green, '#6f8a5a', SKIN.grey], ears: 'point', build: 1.16, jaw: 0.66, tusks: true, bigNose: true, eyes: [E.amber, E.red, E.brown], beard: [0.3, ['stubble', 'goatee', 'short']] },

  // ---- Tome of Heroes
  // A soul in a clockwork body: metal plating, a visor with lit eyes, a glowing core.
  gearforged: { skins: ['#b8923f', '#8e98a3', '#a0703e', '#b8734e', '#6f757c', '#3f454c'], ears: 'bolt', build: 1.02, robot: true, hairless: true, eyes: ROBOT_GLOW },
  alseid: { skins: [SKIN.pale, SKIN.fair, SKIN.tan, SKIN.brown], ears: 'point', build: 0.96, jaw: 0.4, antlers: true, eyes: [E.brown, E.hazel, E.green, E.amber] },
  catfolk: { skins: ['#c9a068', '#9a9088', '#4a4038', '#c8844a', '#e0cfae'], ears: 'cat', build: 0.96, jaw: 0.42, cat: true, slit: true, eyes: [E.green, E.amber, E.gold, E.blue] },
  darakhul: { skins: ['#8f948c', '#7f8a78', '#a09a8e'], ears: 'point', build: 0.98, longFace: true, jaw: 0.4, fangs: true, glowEyes: true, eyes: ['#e6dc9a', E.gold, E.red], beard: [0.2, ['stubble']] },
  derro: { skins: ['#8fa4c0', '#a7b6cc', '#9a94b8'], ears: 'round', build: 0.88, jaw: 0.55, bigNose: true, eyes: [E.grey, E.violet, E.ice], hairColors: ['#ece8e0', '#cfcac0', '#b8b2a8'], beard: [0.5, ['short', 'full', 'moustache']] },
  drow: { skins: ['#3d3446', '#4a3f5a', '#2f3440'], ears: 'point', build: 0.94, longFace: true, jaw: 0.36, glowEyes: true, eyes: [E.red, E.violet, '#d8a0d8'], hairColors: ['#ece8f0', '#d8d2e0', '#c0b8d0'] },
  erina: { skins: ['#8a6a4a', '#a8845c', '#6f5238'], ears: 'round', build: 0.86, roundFace: true, jaw: 0.5, spines: true, eyes: [E.brown, '#2a1a10'] },
  minotaur: { skins: ['#6b4a30', '#4a3426', '#8a6444', '#2f2622'], ears: 'point', build: 1.18, jaw: 0.66, bull: true, eyes: [E.brown, '#2a1a10', E.red] },
  mushroomfolk: { skins: ['#d8ccb4', '#bdb4a4', '#c8b8c8'], ears: 'none', build: 0.98, jaw: 0.5, cap: '#b0473a', hairless: true, eyes: [E.brown, '#2a1a10'] },
  satarre: { skins: ['#6f6a85', '#5a6b6a', '#7a6a7a'], ears: 'point', build: 0.95, longFace: true, jaw: 0.4, glowEyes: true, eyes: ['#b8e090', E.gold] },
  shade: { skins: ['#b8c4d0', '#a9b8c8', '#c8d0d8'], ears: 'round', build: 1, jaw: 0.5, ghostly: true, glowEyes: true, eyes: [E.ice] },
};

// Looks that depend on the subrace: a gearforged's chassis, a mushroomfolk's
// clan, a shade's living origin.
const SUBRACE_LOOKS = {
  'dwarf-chassis': { beardFixed: 'full', build: 1.1 },
  'gnome-chassis': { roundFace: true, build: 0.88 },
  'kobold-chassis': { ears: 'frill', build: 0.9 },
  malkin: { build: 0.86, roundFace: true },
  'acid-cap': { cap: '#a8b83a' },
  favored: { cap: '#8a5aa8' },
  morel: { cap: '#7a5a3a', capPits: true, build: 0.9 },
};
const SHADE_SKINS = ['#b8c4d0', '#a9b8c8', '#c8d0d8'];

function raceLook(sheet) {
  const base = lookup(RACES, sheet?.raceIndex || sheet?.race || sheet?.raceName, 'human');
  const sub = sheet?.subrace;
  if (!sub) return base;
  if (/^shade-/.test(sub)) {
    // the shade keeps the shape of who they were, drained of colour
    const origin = RACES[sub.replace(/^shade-/, '')] || RACES.human;
    return { ...origin, skins: SHADE_SKINS, ghostly: true, glowEyes: true, eyes: [E.ice], hairColors: ['#d8dce4', '#b8c0cc'] };
  }
  return SUBRACE_LOOKS[sub] ? { ...base, ...SUBRACE_LOOKS[sub] } : base;
}

/* ---------------- classes ---------------- */
// garb/trim - clothing colours    head - headwear    hairs/moods - likely looks
// outfit    - what shows at the shoulders

const CLASSES = {
  barbarian: { garb: '#6b4a28', trim: '#c2542e', head: 'none', hairs: ['wild', 'braids', 'mohawk', 'long', 'bald'], moods: ['stern', 'grin'], mark: 'warpaint', outfit: 'fur' },
  bard: { garb: '#6b3a6b', trim: '#e8c476', head: 'cap', hairs: ['swept', 'long', 'curls', 'ponytail'], moods: ['smile', 'smirk', 'grin'], outfit: 'ruff' },
  cleric: { garb: '#c9c2ae', trim: '#d4a94f', head: 'mitre', hairs: ['crop', 'bun', 'swept', 'bald'], moods: ['calm', 'smile'], chest: 'symbol', outfit: 'stole' },
  druid: { garb: '#4a5c34', trim: '#8fae6a', head: 'antlers', hairs: ['long', 'braids', 'curls', 'wild'], moods: ['calm', 'smile'], outfit: 'leaf' },
  fighter: { garb: '#6d6a63', trim: '#9aa0a8', head: 'helm', hairs: ['crop', 'swept', 'ponytail', 'bald'], moods: ['stern', 'calm', 'grin'], outfit: 'plate' },
  monk: { garb: '#a86a3a', trim: '#e8c476', head: 'none', hairs: ['topknot', 'bald', 'bun'], moods: ['calm', 'smile'], outfit: 'wrap' },
  paladin: { garb: '#8d8a95', trim: '#e8c476', head: 'greathelm', hairs: ['crop', 'swept', 'long'], moods: ['calm', 'stern'], chest: 'symbol', outfit: 'plate' },
  ranger: { garb: '#3f5a3a', trim: '#6b4a28', head: 'hood', hairs: ['long', 'ponytail', 'braids', 'swept'], moods: ['calm', 'stern'], outfit: 'quiver' },
  rogue: { garb: '#2f3138', trim: '#5f87a8', head: 'hood', hairs: ['swept', 'crop', 'ponytail'], moods: ['smirk', 'calm'], mark: 'mask', outfit: 'strap' },
  sorcerer: { garb: '#7a2f3a', trim: '#e07040', head: 'none', hairs: ['wild', 'swept', 'curls', 'long'], moods: ['smirk', 'smile'], spark: true, outfit: 'collar' },
  warlock: { garb: '#3a2f52', trim: '#8f7fd4', head: 'circlet', hairs: ['long', 'swept', 'bun'], moods: ['smirk', 'stern'], spark: true, outfit: 'collar' },
  wizard: { garb: '#2f3f6b', trim: '#8f7fd4', head: 'wizhat', hairs: ['long', 'swept', 'bun', 'bald'], moods: ['calm', 'smile'], chest: 'symbol', outfit: 'robe' },
  npc: { garb: '#5a5348', trim: '#8d8a95', head: 'none', hairs: ['crop', 'swept', 'long'], moods: ['calm'] },
};

// How often a hero wears their class's headwear when nobody has chosen.
const HEAD_CHANCE = { helm: 0.55, greathelm: 0.35, hood: 0.6, mitre: 0.5, cap: 0.7, wizhat: 0.85, antlers: 0.6, circlet: 1 };

/* ---------------- resolving a sheet to a look ---------------- */

/**
 * Every trait of a hero's portrait: the player's own choice where they made
 * one, otherwise the default their race, class and name give them.
 */
export function resolveLook(sheet) {
  const race = raceLook(sheet);
  const classSource = sheet?.classIndex || sheet?.className;
  const cls = lookup(CLASSES, classSource, 'npc');
  const look = (sheet && sheet.portrait && sheet.portrait.look) || {};
  const seed = look.seed || sheet?.name || 'hero';
  const h = (k) => hashString(`${seed}-${k}`);

  const [beardChance, beardPool] = race.beard || [0, []];
  const defaultBeard = race.robot ? race.beardFixed || 'none' : h('beard') < beardChance ? pick(beardPool, h('beardkind')) : 'none';
  const lightSkin = (c) => luma(c) > 0.5;

  const skin = look.skin || pick(race.skins, h('skin'));
  let defaultMark = 'none';
  if (cls.mark && h('classmark') < 0.6) defaultMark = cls.mark;
  else if (!race.robot) {
    const r = h('mark');
    if (r < 0.14) defaultMark = 'scar';
    else if (r < 0.26 && lightSkin(skin)) defaultMark = 'freckles';
  }

  return {
    race,
    cls,
    classKey: String(classSource || 'npc').toLowerCase(),
    seed,
    skin,
    hair: look.hair || (race.robot ? '#4a4540' : pick(race.hairColors || NATURAL_HAIR, h('hair'))),
    hairStyle: race.hairless ? 'bald' : look.hairStyle || pick(cls.hairs, h('style')),
    beard: race.robot ? race.beardFixed || 'none' : look.beard || defaultBeard,
    eyes: look.eyes || pick(race.eyes || [E.brown], h('eyes')),
    mood: look.mood || pick(cls.moods, h('mood')),
    headwear: cls.head !== 'none' && !race.cap && (look.headwear ? look.headwear === 'on' : h('head') < (HEAD_CHANCE[cls.head] || 0)),
    mark: race.robot ? 'none' : look.mark || defaultMark,
  };
}

/** What the portrait editor offers for this hero; null means "not for this body". */
export function lookOptions(sheet) {
  const race = raceLook(sheet);
  const cls = lookup(CLASSES, sheet?.classIndex || sheet?.className, 'npc');
  const organic = !race.robot;
  const faceHair = organic && !race.snout && !race.cat && !race.bull && !race.cap;
  const eyes = race.robot ? ROBOT_GLOW : [...new Set([...(race.eyes || []), ...Object.values(EYE_COLORS)])];
  return {
    skins: race.skins,
    hairColors: organic && !race.hairless ? [...new Set([...(race.hairColors || []), ...HAIR_COLORS])] : null,
    hairStyles: organic && !race.hairless ? HAIR_STYLES : null,
    beards: faceHair ? BEARDS : null,
    eyes,
    eyesLabel: race.robot ? 'Eye glow' : 'Eyes',
    skinLabel: race.robot ? 'Plating' : race.snout ? 'Scales' : race.cat || race.bull ? 'Fur' : 'Skin',
    moods: organic ? MOODS : null,
    headwear: cls.head !== 'none' && !race.cap ? HEADWEAR_NAMES[cls.head] : null,
    marks: organic ? MARKS : null,
  };
}

/** A portrait picture a player uploaded, if it is one we are willing to draw. */
export function safePortraitImage(src) {
  return typeof src === 'string' && src.length < 400000 && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src) ? src : null;
}

/* ---------------- creature archetypes (monsters, NPCs, markers) ---------------- */
// Each is a compact silhouette that stays legible at 22px on the battle map.

const CREATURES = {
  rat: (c) => (
    <g fill={c}>
      <ellipse cx="30" cy="38" rx="16" ry="10" />
      <circle cx="46" cy="34" r="8" />
      <circle cx="44" cy="26" r="4" />
      <circle cx="51" cy="27" r="3.4" />
      <path d="M14 38q-9 4-11 12" stroke={c} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="33" r="1.8" fill="#1a1a1a" />
    </g>
  ),
  wolf: (c) => (
    <g fill={c}>
      <ellipse cx="26" cy="38" rx="17" ry="10" />
      <path d="M8 40q-7 3-6 12l6-1q-1-6 4-8z" />
      <path d="M40 32q6-3 10 0l8-3-3 7 3 3-8 5-10-2z" />
      <path d="M40 26l1-11 7 9zM50 25l7-9 1 10z" />
      <circle cx="52" cy="34" r="1.9" fill="#1a1a1a" />
      <path d="M56 38h5" stroke="#1a1a1a" strokeWidth="1.6" />
      <path d="M14 46l4 12M28 46l3 12M38 44l3 12" stroke={c} strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  bear: (c) => (
    <g fill={c}>
      <circle cx="16" cy="16" r="7" />
      <circle cx="48" cy="16" r="7" />
      <circle cx="32" cy="24" r="16" />
      <path d="M12 44q0-8 20-8t20 8v18H12z" />
      <ellipse cx="32" cy="30" rx="8" ry="6.5" fill="#efe7d4" opacity="0.9" />
      <ellipse cx="32" cy="27" rx="3" ry="2.2" fill="#1a1a1a" />
      <circle cx="25" cy="20" r="2" fill="#1a1a1a" />
      <circle cx="39" cy="20" r="2" fill="#1a1a1a" />
    </g>
  ),
  boar: (c) => (
    <g fill={c}>
      <path d="M10 46q2-18 16-18t18 8l14 4-4 12-16 4q-16 2-28-10z" />
      <path d="M52 42q5 1 6 6M46 44q5 2 5 7" stroke="#efe7d4" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <circle cx="52" cy="38" r="1.8" fill="#1a1a1a" />
      <path d="M40 30l3-9 5 8z" />
      <path d="M16 52l2 10M28 54l1 9M40 52l2 10" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <path d="M8 40q-6-2-7-8 5 1 8 5z" />
    </g>
  ),
  spider: (c) => (
    <g stroke={c} strokeWidth="3.4" fill="none" strokeLinecap="round">
      <path d="M22 22 8 12M22 30 6 26M22 38 6 42M24 44 12 56M42 22 56 12M42 30 58 26M42 38 58 42M40 44 52 56" />
      <ellipse cx="32" cy="38" rx="13" ry="14" fill={c} stroke="none" />
      <circle cx="32" cy="23" r="8" fill={c} stroke="none" />
      <circle cx="29" cy="21" r="1.8" fill="#1a1a1a" stroke="none" />
      <circle cx="35" cy="21" r="1.8" fill="#1a1a1a" stroke="none" />
    </g>
  ),
  snake: (c) => (
    <g fill="none" stroke={c} strokeWidth="7" strokeLinecap="round">
      <path d="M10 50q10-10 20 0t22-8" />
      <circle cx="52" cy="40" r="5" fill={c} stroke="none" />
      <path d="M56 40h7" strokeWidth="2.4" stroke="#c94f6d" />
    </g>
  ),
  bat: (c) => (
    <g fill={c}>
      <path d="M32 26q-8-12-22-10 6 6 4 12 8 2 10 8zM32 26q8-12 22-10-6 6-4 12-8 2-10 8z" />
      <ellipse cx="32" cy="34" rx="7" ry="10" />
      <path d="M27 22l-2-8 7 6zM37 22l2-8-7 6z" />
    </g>
  ),
  bird: (c) => (
    <g fill={c}>
      <path d="M32 20 8 34l18 2z" />
      <path d="M32 20 56 34l-18 2z" />
      <ellipse cx="32" cy="36" rx="8" ry="14" />
      <path d="M32 50l-5 10h10z" />
      <circle cx="32" cy="24" r="6" />
      <path d="M32 24l8 3-8 3z" fill="#e8c476" />
    </g>
  ),
  insect: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="40" rx="12" ry="17" />
      <ellipse cx="32" cy="22" rx="9" ry="8" />
      <path d="M23 16l-6-8M41 16l6-8" stroke={c} strokeWidth="3" strokeLinecap="round" />
      <path d="M20 32H8M20 42H8M44 32h12M44 42h12" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 24v34" stroke="#1a1a1a" strokeWidth="2" opacity="0.4" />
    </g>
  ),
  goblinoid: (c) => (
    <g fill={c}>
      <path d="M32 18q11 0 11 12 0 10-11 10T21 30q0-12 11-12z" />
      <path d="M21 26 6 18l13 12zM43 26 58 18 45 30z" />
      <path d="M22 42h20l6 18H16z" />
      <circle cx="27" cy="28" r="2.2" fill="#f2c14e" />
      <circle cx="37" cy="28" r="2.2" fill="#f2c14e" />
      <path d="M27 35h10l-5 4z" fill="#1a1a1a" opacity="0.6" />
    </g>
  ),
  orc: (c) => (
    <g fill={c}>
      <path d="M20 20q0-10 12-10t12 10v9q0 11-12 13T20 29z" />
      <path d="M20 24 8 18l11 10zM44 24 56 18 45 28z" />
      <path d="M18 44h28l6 18H12z" />
      <path d="M26 36l-1.5 7 4-4zM38 36l1.5 7-4-4z" fill="#efe7d4" />
      <path d="M22 22h8M34 22h8" stroke="#1a1a1a" strokeWidth="2.4" opacity="0.5" />
      <circle cx="26" cy="27" r="2.3" fill="#c94f6d" />
      <circle cx="38" cy="27" r="2.3" fill="#c94f6d" />
    </g>
  ),
  skeleton: (c) => (
    <g fill={c}>
      <path d="M32 12q12 0 12 14 0 8-4 11H24q-4-3-4-11 0-14 12-14z" />
      <circle cx="27" cy="26" r="3.6" fill="#141414" />
      <circle cx="37" cy="26" r="3.6" fill="#141414" />
      <path d="M30 33h4l-2 4z" fill="#141414" />
      <path d="M26 40h12v4H26z" />
      <path d="M20 48h24M22 54h20M24 60h16" stroke={c} strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  zombie: (c) => (
    <g fill={c}>
      <ellipse cx="30" cy="20" rx="10" ry="11" />
      <path d="M21 33h18l4 29H17z" />
      <path d="M39 38h20v6H39zM39 46h17v6H39z" />
      <circle cx="26" cy="18" r="2.6" fill="#141414" />
      <circle cx="35" cy="20" r="1.8" fill="#141414" />
      <path d="M25 27q5 3 10 0" stroke="#141414" strokeWidth="1.8" fill="none" />
      <path d="M23 40l4 8-5 3z" fill="#141414" opacity="0.35" />
    </g>
  ),
  ghost: (c) => (
    <g fill={c} opacity="0.85">
      <path d="M32 10q14 0 14 18v26l-6-6-6 6-6-6-6 6V28q0-18 10-18z" />
      <circle cx="27" cy="26" r="3" fill="#0d0d12" />
      <circle cx="38" cy="26" r="3" fill="#0d0d12" />
    </g>
  ),
  dragon: (c) => (
    <g fill={c}>
      <path d="M24 30 2 16q0 18 8 26 8-4 14-4z" />
      <path d="M40 30 62 16q0 18-8 26-8-4-14-4z" />
      <path d="M32 18q11 0 11 12 0 8-4 12l-7 8-7-8q-4-4-4-12 0-12 11-12z" />
      <path d="M22 20 14 8l12 6zM42 20 50 8 38 14z" />
      <circle cx="27" cy="28" r="2.6" fill="#f2c14e" />
      <circle cx="37" cy="28" r="2.6" fill="#f2c14e" />
      <path d="M28 38h8l-4 5z" fill="#1a1a1a" opacity="0.55" />
    </g>
  ),
  ooze: (c) => (
    <g fill={c} opacity="0.88">
      <path d="M12 46q0-24 20-24t20 24q0 8-20 8t-20-8z" />
      <circle cx="25" cy="36" r="4" fill="#0d0d12" opacity="0.4" />
      <circle cx="40" cy="41" r="6" fill="#0d0d12" opacity="0.3" />
      <path d="M12 46q4 8 20 8t20-8" stroke={c} strokeWidth="3" fill="none" />
    </g>
  ),
  elemental: (c) => (
    <g fill={c}>
      <path d="M32 6q6 14 14 18-6 4-6 12t-8 20q-8-12-8-20t-6-12q8-4 14-18z" />
      <path d="M32 22q3 8 7 11-4 3-4 8t-3 10q-3-5-3-10t-4-8q4-3 7-11z" fill="#ffe08a" opacity="0.55" />
    </g>
  ),
  golem: (c) => (
    <g fill={c}>
      <rect x="22" y="8" width="20" height="15" rx="2" />
      <rect x="21" y="27" width="22" height="22" rx="2" />
      <rect x="5" y="28" width="12" height="14" rx="2" />
      <rect x="47" y="28" width="12" height="14" rx="2" />
      <rect x="6" y="44" width="10" height="11" rx="2" />
      <rect x="48" y="44" width="10" height="11" rx="2" />
      <rect x="23" y="53" width="7" height="9" rx="1.5" />
      <rect x="34" y="53" width="7" height="9" rx="1.5" />
      <rect x="26" y="13" width="4.5" height="4.5" fill="#f2c14e" />
      <rect x="33.5" y="13" width="4.5" height="4.5" fill="#f2c14e" />
      <path d="M21 36h22" stroke="#1a1a1a" strokeWidth="1.6" opacity="0.4" />
    </g>
  ),
  giant: (c) => (
    <g fill={c}>
      <circle cx="28" cy="14" r="9" />
      <path d="M15 27h26l5 24H10z" />
      <path d="M10 30 2 44l7 5" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M42 30l6 6" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M44 32 60 8" stroke="#6b4a28" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="58" cy="11" rx="7" ry="8" fill="#6b4a28" transform="rotate(-32 58 11)" />
      <path d="M18 53l3 9M36 53l3 9" stroke={c} strokeWidth="5" strokeLinecap="round" />
      <circle cx="24" cy="13" r="2" fill="#1a1a1a" />
      <circle cx="33" cy="13" r="2" fill="#1a1a1a" />
    </g>
  ),
  fiend: (c) => (
    <g fill={c}>
      <path d="M32 16q12 0 12 13t-12 15-12-15 12-13z" />
      <path d="M21 20 14 6l12 8zM43 20 50 6 38 14z" />
      <path d="M22 44h20l6 18H16z" />
      <path d="M18 30q-12-6-16 4 10 0 14 8zM46 30q12-6 16 4-10 0-14 8z" opacity="0.85" />
      <circle cx="27" cy="27" r="2.4" fill="#f2c14e" />
      <circle cx="37" cy="27" r="2.4" fill="#f2c14e" />
    </g>
  ),
  celestial: (c) => (
    <g fill={c}>
      <circle cx="32" cy="24" r="10" />
      <path d="M22 38h20l5 22H17z" />
      <path d="M22 30q-14-8-20 2 12 0 18 8zM42 30q14-8 20 2-12 0-18 8z" opacity="0.9" />
      <circle cx="32" cy="9" r="7" fill="none" stroke="#e8c476" strokeWidth="2.6" />
    </g>
  ),
  fey: (c) => (
    <g fill={c}>
      <path d="M26 24 8 8q-6 14 4 22 8 2 14-6zM38 24 56 8q6 14-4 22-8 2-14-6z" opacity="0.55" />
      <path d="M26 32 12 30q0 10 8 12 5 0 7-6zM38 32l14-2q0 10-8 12-5 0-7-6z" opacity="0.4" />
      <circle cx="32" cy="26" r="8" />
      <path d="M25 36h14l3 20H22z" />
      <path d="M28 16q4-8 8 0z" fill="#e8c476" />
    </g>
  ),
  plant: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="18" rx="19" ry="13" />
      <circle cx="18" cy="22" r="8" />
      <circle cx="46" cy="22" r="8" />
      <path d="M26 28h12v28H26z" />
      <path d="M26 36 12 28l-4 8 18 8zM38 36l14-8 4 8-18 8z" />
      <path d="M20 62q4-10 12-8t12 8z" />
      <circle cx="28" cy="42" r="2.2" fill="#1a1a1a" />
      <circle cx="36" cy="42" r="2.2" fill="#1a1a1a" />
    </g>
  ),
  aberration: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="30" rx="16" ry="15" />
      <circle cx="32" cy="30" r="8" fill="#f2f0e2" />
      <circle cx="32" cy="30" r="4" fill="#141414" />
      <path d="M20 42q-8 10-14 10M44 42q8 10 14 10M28 45v14M36 45v14" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  ),
  construct: (c) => (
    <g fill={c}>
      <rect x="18" y="16" width="28" height="26" rx="4" />
      <rect x="24" y="44" width="16" height="16" rx="2" />
      <circle cx="27" cy="27" r="3.4" fill="#5f87a8" />
      <circle cx="38" cy="27" r="3.4" fill="#5f87a8" />
      <rect x="26" y="34" width="12" height="3" fill="#141414" opacity="0.6" />
      <path d="M32 10v6" stroke={c} strokeWidth="3" />
      <circle cx="32" cy="8" r="3" />
    </g>
  ),
  humanoid: (c) => (
    <g fill={c}>
      <circle cx="32" cy="22" r="10" />
      <path d="M20 36h24l5 24H15z" />
    </g>
  ),
  monstrosity: (c) => (
    <g fill={c}>
      <path d="M30 22q10 0 10 10t-10 12-10-12 10-10z" />
      <path d="M22 16l-4-11 10 7zM38 16l4-11-10 7z" />
      <ellipse cx="30" cy="44" rx="16" ry="11" />
      <path d="M18 34l3-7 4 6 4-7 4 6 4-7 3 7z" />
      <path d="M44 46q10 2 13 12l-5 2q-2-7-9-8z" />
      <path d="M20 54l2 8M34 54l2 8" stroke={c} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="25" cy="30" r="2.2" fill="#c94f6d" />
      <circle cx="35" cy="30" r="2.2" fill="#c94f6d" />
      <path d="M25 37h10l-5 4z" fill="#efe7d4" />
    </g>
  ),
  swarm: (c) => (
    <g fill={c}>
      {[[16, 22], [32, 16], [48, 24], [22, 36], [38, 34], [12, 46], [30, 48], [48, 44], [40, 56], [20, 56]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="5" ry="3.6" transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
    </g>
  ),
  marker: (c) => (
    <g fill={c}>
      <path d="M32 6 39 24l19 1-15 12 5 19-16-11-16 11 5-19-15-12 19-1z" />
    </g>
  ),
  chest: (c) => (
    <g fill={c}>
      <path d="M8 26q24-16 48 0v6H8z" />
      <rect x="8" y="32" width="48" height="24" rx="2" />
      <path d="M8 32h48" stroke="#1a1a1a" strokeWidth="2" opacity="0.5" />
      <rect x="18" y="20" width="5" height="36" fill="#1a1a1a" opacity="0.35" />
      <rect x="41" y="20" width="5" height="36" fill="#1a1a1a" opacity="0.35" />
      <rect x="28" y="30" width="8" height="12" rx="1.5" fill="#e8c476" />
      <circle cx="32" cy="36" r="1.8" fill="#1a1a1a" />
    </g>
  ),
};

/* ---------------- resolving a creature to an archetype ---------------- */

const NAME_HINTS = [
  [/\brat\b|vermin/i, 'rat'],
  [/wolf|jackal|hyena|dog|mastiff/i, 'wolf'],
  [/bear|ape|gorilla/i, 'bear'],
  [/boar|pig|hog/i, 'boar'],
  [/spider|scorpion/i, 'spider'],
  [/snake|serpent|viper|constrictor|naga/i, 'snake'],
  [/bat\b/i, 'bat'],
  [/eagle|hawk|owl|raven|vulture|bird|harpy/i, 'bird'],
  [/beetle|wasp|ant\b|centipede|locust|fly\b/i, 'insect'],
  [/goblin|kobold|hobgoblin|bugbear/i, 'goblinoid'],
  [/orc|troll|ogre/i, 'orc'],
  [/skeleton|bones/i, 'skeleton'],
  [/zombie|ghoul|ghast|mummy/i, 'zombie'],
  [/ghost|spectre|specter|wraith|shadow|banshee|will-o/i, 'ghost'],
  [/dragon|drake|wyvern|wyrm|hydra/i, 'dragon'],
  [/ooze|slime|pudding|jelly|cube/i, 'ooze'],
  [/elemental|salamander|magmin|mephit/i, 'elemental'],
  [/golem|homunculus|animated|armor/i, 'golem'],
  [/giant|ettin|cyclops|titan/i, 'giant'],
  [/demon|devil|imp|quasit|hell|balor|fiend/i, 'fiend'],
  [/angel|deva|planetar|solar|unicorn|pegasus/i, 'celestial'],
  [/sprite|pixie|dryad|satyr|fey|blink/i, 'fey'],
  [/treant|shambling|vine|plant|shrieker|fungus|myconid/i, 'plant'],
  [/aboleth|beholder|mind flayer|gazer|aberrat/i, 'aberration'],
  [/swarm/i, 'swarm'],
];

const TYPE_TO_ART = {
  aberration: 'aberration', beast: 'wolf', celestial: 'celestial', construct: 'construct',
  dragon: 'dragon', elemental: 'elemental', fey: 'fey', fiend: 'fiend', giant: 'giant',
  humanoid: 'humanoid', monstrosity: 'monstrosity', ooze: 'ooze', plant: 'plant',
  undead: 'skeleton', swarm: 'swarm',
};

// SRD stat blocks that are just people. They are checked before the shape
// hints so "half-red-dragon-veteran" stays a person rather than becoming a
// dragon, and so a token that only stored its index (as every token saved
// before art existed did) doesn't fall through to the generic monster shape.
// Goblins, orcs, kobolds and lycanthropes are deliberately absent - they have
// silhouettes of their own.
const HUMANOID_NPCS = new Set([
  'acolyte', 'archmage', 'assassin', 'bandit', 'bandit-captain', 'berserker', 'commoner',
  'cult-fanatic', 'cultist', 'deep-gnome-svirfneblin', 'drow', 'druid', 'duergar', 'gladiator',
  'gnoll', 'grimlock', 'guard', 'half-red-dragon-veteran', 'knight', 'lizardfolk', 'mage',
  'merfolk', 'noble', 'priest', 'sahuagin', 'scout', 'spy', 'thug', 'tribal-warrior', 'veteran',
]);

const slug = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '-');

/** Best silhouette for a monster, from its name first and its SRD type second. */
export function artKeyForMonster({ name, type, index } = {}) {
  const label = `${name || ''} ${index || ''}`;
  if (/swarm/i.test(label)) return 'swarm';
  // A numbered copy on the map is still the same creature ("Goblin 2").
  const bare = slug(name).replace(/-\d+$/, '');
  if (HUMANOID_NPCS.has(slug(index)) || HUMANOID_NPCS.has(bare)) return 'humanoid';
  for (const [re, key] of NAME_HINTS) if (re.test(label)) return key;
  return TYPE_TO_ART[String(type || '').toLowerCase()] || 'monstrosity';
}

/* ---------------- the hero bust ---------------- */

// Exact match first, then the longest matching key, so "half-elf" never
// resolves to "elf" and "lightfoot halfling" lands on halfling.
function lookup(table, value, fallbackKey) {
  const key = String(value || '').toLowerCase().replace(/\s+/g, '-');
  if (table[key]) return table[key];
  const hit = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => key.includes(k));
  return hit ? table[hit] : table[fallbackKey];
}

// Hair behind the head: whatever falls past the ears. Drawn before the
// shoulders, so long hair reads as falling behind them.
function hairBack(style, g, fill) {
  const { cx, cy, rx, top, chin } = g;
  switch (style) {
    case 'long':
      return <path d={`M${cx - rx - 1.6} ${cy} C${cx - rx - 1.6} ${top - 4.5} ${cx + rx + 1.6} ${top - 4.5} ${cx + rx + 1.6} ${cy} L${cx + rx + 3} ${chin + 7} Q${cx} ${chin + 10} ${cx - rx - 3} ${chin + 7}Z`} fill={fill} />;
    case 'braids':
      return <path d={`M${cx - rx - 1.2} ${cy} C${cx - rx - 1.2} ${top - 4} ${cx + rx + 1.2} ${top - 4} ${cx + rx + 1.2} ${cy} L${cx + rx + 1} ${chin} H${cx - rx - 1}Z`} fill={fill} />;
    case 'ponytail':
      return <path d={`M${cx + rx * 0.3} ${top + 1} C${cx + rx + 8} ${top - 1} ${cx + rx + 7} ${cy + 9} ${cx + rx + 3.5} ${chin + 5} C${cx + rx + 1.5} ${cy + 9} ${cx + rx + 2.5} ${top + 7} ${cx + rx * 0.1} ${top + 5}Z`} fill={fill} />;
    case 'wild': {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * (0.9 + (i / 14) * 1.2);
        const r = i % 2 ? 1.5 : 6.5;
        pts.push(`${cx + Math.cos(a) * (rx + r)} ${cy + Math.sin(a) * (g.ry + r)}`);
      }
      return <path d={`M${cx - rx - 1} ${cy + 7} L${pts.join(' L')} L${cx + rx + 1} ${cy + 7}Z`} fill={fill} />;
    }
    case 'curls': {
      const dots = [];
      for (let i = 0; i <= 11; i++) {
        const a = Math.PI * (0.82 + (i / 11) * 1.36);
        dots.push([cx + Math.cos(a) * (rx + 1.2), cy + Math.sin(a) * (g.ry + 1.2)]);
      }
      dots.push([cx - rx - 0.5, cy + 6], [cx + rx + 0.5, cy + 6]);
      return <g fill={fill}>{dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.9" />)}</g>;
    }
    default:
      return null;
  }
}

// Hair over the crown: every style's hairline stays above the brows.
function hairFront(style, g, fill, skin) {
  const { cx, cy, rx, top, hl } = g;
  const cap = (lift, side, inner) => {
    const k = (cy - (top - lift)) * 1.333;
    return `M${cx - rx - 0.8} ${cy + side} L${cx - rx - 0.8} ${cy} C${cx - rx - 0.8} ${cy - k} ${cx + rx + 0.8} ${cy - k} ${cx + rx + 0.8} ${cy} L${cx + rx + 0.8} ${cy + side} ${inner}Z`;
  };
  const even = (side, dip = 0) => `L${cx + rx - 1.6} ${cy + side} Q${cx + rx - 1} ${hl} ${cx + rx * 0.5} ${hl - 0.3 + dip} Q${cx} ${hl - 1 + dip} ${cx - rx * 0.5} ${hl - 0.3 + dip} Q${cx - rx + 1} ${hl} ${cx - rx + 1.6} ${cy + side}`;
  const parted = (side) => `L${cx + rx - 1.3} ${cy + side} Q${cx + rx * 0.8} ${hl - 1} ${cx + 0.5} ${top + 2.2} L${cx - 0.5} ${top + 2.2} Q${cx - rx * 0.8} ${hl - 1} ${cx - rx + 1.3} ${cy + side}`;
  switch (style) {
    case 'crop':
      return <path d={cap(1.2, 1, even(1))} fill={fill} />;
    case 'swept':
      return <path d={cap(2.2, 1, `L${cx + rx - 1.6} ${cy + 1} Q${cx + rx - 1.2} ${hl - 3} ${cx + rx * 0.3} ${hl - 2.6} Q${cx - rx * 0.2} ${hl - 1.2} ${cx - rx * 0.55} ${hl + 1.1} Q${cx - rx + 1} ${hl + 1.4} ${cx - rx + 1.6} ${cy + 1}`)} fill={fill} />;
    case 'long':
    case 'braids':
      return <path d={cap(1.8, style === 'long' ? 6 : 3, parted(style === 'long' ? 6 : 3))} fill={fill} />;
    case 'wild':
      return <path d={cap(3, 2, `L${cx + rx - 1.6} ${cy + 2} L${cx + rx * 0.7} ${hl - 2} L${cx + rx * 0.45} ${hl + 0.9} L${cx + rx * 0.15} ${hl - 1.8} L${cx - rx * 0.15} ${hl + 1.1} L${cx - rx * 0.45} ${hl - 1.6} L${cx - rx * 0.7} ${hl + 0.7} L${cx - rx + 1.6} ${cy + 2}`)} fill={fill} />;
    case 'curls':
      return (
        <g fill={fill}>
          <path d={cap(2.4, 1, even(1, -1))} />
          {[-1, -0.5, 0, 0.5, 1].map((t) => <circle key={t} cx={cx + t * rx * 0.78} cy={hl - 1.2 + Math.abs(t) * 1.4} r="2.5" />)}
        </g>
      );
    case 'ponytail':
    case 'bun':
    case 'topknot':
      return (
        <g fill={fill}>
          <path d={cap(0.7, 0, even(0, -0.9))} />
          {style === 'bun' && <circle cx={cx} cy={top - 2.6} r="4.6" />}
          {style === 'topknot' && (
            <>
              <ellipse cx={cx} cy={top - 4.2} rx="3.6" ry="4.2" />
              <rect x={cx - 2.4} y={top - 1.4} width="4.8" height="1.8" rx="0.8" fill="#c2542e" />
            </>
          )}
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path d={cap(0.4, 0, even(0, -1))} fill={fill} opacity="0.28" />
          <path d={`M${cx - 3} ${hl - 1} Q${cx - 4.2} ${top - 7} ${cx} ${top - 9} Q${cx + 4.2} ${top - 7} ${cx + 3} ${hl - 1} Q${cx} ${hl - 2.2} ${cx - 3} ${hl - 1}Z`} fill={fill} />
        </g>
      );
    case 'bald':
      return <ellipse cx={cx - rx * 0.32} cy={top + 3.6} rx="3.4" ry="1.7" fill={light(skin, 0.5)} opacity="0.45" />;
    default:
      return null;
  }
}

function beardShape(kind, g, fill) {
  const { cx, cy, rx, ry, chin, mouthY } = g;
  if (kind === 'none' || !kind) return null;
  const moustache = (
    <path d={`M${cx - 5} ${mouthY + 0.3} Q${cx - 4.2} ${mouthY - 2.6} ${cx} ${mouthY - 1.8} Q${cx + 4.2} ${mouthY - 2.6} ${cx + 5} ${mouthY + 0.3} Q${cx + 2.4} ${mouthY - 0.8} ${cx} ${mouthY - 0.5} Q${cx - 2.4} ${mouthY - 0.8} ${cx - 5} ${mouthY + 0.3}Z`} fill={fill} />
  );
  if (kind === 'stubble') {
    return <path d={`M${cx - rx * 0.96} ${cy + 1} C${cx - rx * 0.96} ${cy + ry * 0.6} ${cx - rx * 0.5} ${chin} ${cx} ${chin} C${cx + rx * 0.5} ${chin} ${cx + rx * 0.96} ${cy + ry * 0.6} ${cx + rx * 0.96} ${cy + 1} Q${cx} ${cy + 5.5} ${cx - rx * 0.96} ${cy + 1}Z`} fill={fill} opacity="0.3" />;
  }
  if (kind === 'moustache') return moustache;
  if (kind === 'goatee') {
    return (
      <>
        {moustache}
        <path d={`M${cx - 2.6} ${mouthY + 1.8} Q${cx} ${mouthY + 1.1} ${cx + 2.6} ${mouthY + 1.8} L${cx + 1.7} ${chin + 2.6} Q${cx} ${chin + 3.4} ${cx - 1.7} ${chin + 2.6}Z`} fill={fill} />
      </>
    );
  }
  const bb = kind === 'short' ? chin + 2.4 : chin + 7.5;
  // sideburns from the ears, down the jaw, leaving the cheeks bare
  return (
    <>
      <path
        d={`M${cx - rx * 0.99} ${cy - 1} C${cx - rx} ${cy + ry * 0.8} ${cx - rx * 0.62} ${bb} ${cx} ${bb} C${cx + rx * 0.62} ${bb} ${cx + rx} ${cy + ry * 0.8} ${cx + rx * 0.99} ${cy - 1} L${cx + rx * 0.84} ${cy - 1} Q${cx + rx * 0.74} ${cy + 5.6} ${cx + 3.4} ${mouthY - 1.5} Q${cx} ${mouthY - 2.5} ${cx - 3.4} ${mouthY - 1.5} Q${cx - rx * 0.74} ${cy + 5.6} ${cx - rx * 0.84} ${cy - 1}Z`}
        fill={fill}
      />
      {moustache}
      {kind === 'braided' && [-1, 1].map((d) => (
        <g key={d} fill={fill} stroke="#000000" strokeOpacity="0.25" strokeWidth="0.5">
          {[0, 1, 2].map((i) => <ellipse key={i} cx={cx + d * 2.6} cy={bb + 1.4 + i * 2.6} rx="1.9" ry="1.6" />)}
          <rect x={cx + d * 2.6 - 1.6} y={bb + 8.4} width="3.2" height="1.4" rx="0.5" fill="#d4a94f" stroke="none" />
        </g>
      ))}
    </>
  );
}

function HeroBust({ sheet }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const L = resolveLook(sheet);
  const { race, cls, classKey, skin, hair, hairStyle, beard, eyes, mood, mark } = L;
  const showHeadwear = L.headwear;
  const b = race.build;
  const hb = 1 + (b - 1) * 0.5; // the head grows with the body, but less

  // Head geometry. Everything else is positioned relative to these, so a
  // headdress can never end up over the eyes.
  const cx = 32;
  const cy = 28.5;
  const rx = (race.roundFace ? 12.4 : race.longFace ? 11 : 11.7) * hb;
  const ry = (race.longFace ? 14.6 : race.roundFace ? 12.4 : 13.6) * hb;
  const top = cy - ry; // crown of the head
  const chin = cy + ry;
  const jaw = race.jaw ?? 0.5;
  const eyeY = cy + 1.2;
  const ex = rx * 0.42;
  const browY = eyeY - 4.2;
  const hatLine = cy - 4.4; // nothing opaque on the head may sit below this line
  const hl = cy - 5.6; // hairline
  const noseY = eyeY + 4.4;
  const mouthY = cy + ry * 0.58;
  const nb = chin + 0.4; // base of the neck
  const g = { cx, cy, rx, ry, top, chin, hl, mouthY };

  const fullFace = cls.head === 'greathelm' && showHeadwear;
  const faceHair = !race.robot && !race.snout && !race.cat && !race.bull && !race.cap;
  const hairFill = `url(#h${uid})`;
  const k = ry * 1.333;
  const face = `M${cx - rx} ${cy} C${cx - rx} ${cy - k} ${cx + rx} ${cy - k} ${cx + rx} ${cy} C${cx + rx} ${cy + ry * 0.6} ${cx + rx * jaw} ${chin} ${cx} ${chin} C${cx - rx * jaw} ${chin} ${cx - rx} ${cy + ry * 0.6} ${cx - rx} ${cy}Z`;
  const sw = 21.5 * b; // half the shoulder width
  const torso = `M${cx - 5.5} ${nb - 1} C${cx - 12} ${nb} ${cx - sw} ${nb + 2} ${cx - sw - 1.5} ${nb + 9} L${cx - sw - 3} 68 H${cx + sw + 3} L${cx + sw + 1.5} ${nb + 9} C${cx + sw} ${nb + 2} ${cx + 12} ${nb} ${cx + 5.5} ${nb - 1}Z`;
  const lid = shade(skin, 0.6);
  const lip = shade(skin, 0.52);
  const brow = hairStyle === 'bald' || race.hairless ? shade(skin, 0.45) : shade(hair, 0.08);
  const skinShade = shade(skin, 0.4);
  const glowing = race.glowEyes || race.robot;

  return (
    // scaled about the bottom edge so the shoulders still fill the frame
    <g transform="translate(1.6 3) scale(0.95)" opacity={race.ghostly ? 0.9 : undefined}>
      <defs>
        <radialGradient id={`f${uid}`} cx="0.38" cy="0.32" r="0.78">
          <stop offset="0" stopColor={light(skin, 0.16)} />
          <stop offset="0.55" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, 0.34)} />
        </radialGradient>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor={light(cls.garb, 0.14)} />
          <stop offset="0.55" stopColor={cls.garb} />
          <stop offset="1" stopColor={shade(cls.garb, 0.38)} />
        </linearGradient>
        <linearGradient id={`h${uid}`} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={light(hair, 0.18)} />
          <stop offset="1" stopColor={shade(hair, 0.32)} />
        </linearGradient>
        <linearGradient id={`t${uid}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor={light(cls.trim, 0.3)} />
          <stop offset="1" stopColor={shade(cls.trim, 0.3)} />
        </linearGradient>
      </defs>

      {/* ---- a ranger's arrows over the shoulder ---- */}
      {cls.outfit === 'quiver' && (
        <g>
          <path d={`M${cx + sw - 9} ${nb + 6} L${cx + sw - 1} ${nb - 12}`} stroke="#5a3a20" strokeWidth="3.4" strokeLinecap="round" />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${cx + sw - 4 + i * 2.2} ${nb - 8 - i} l-1.4 -4.4 2.6 1.6z`} fill={i === 1 ? '#c2542e' : '#e8e0cc'} />
          ))}
        </g>
      )}

      {/* ---- hair that falls behind the shoulders ---- */}
      {!race.hairless && hairBack(hairStyle, g, hairFill)}

      {/* ---- hood sits behind the head so it frames the face ---- */}
      {showHeadwear && cls.head === 'hood' && (
        <path
          d={`M${cx} ${top - 5}
              q-${rx + 7} 0 -${rx + 7} ${ry + 11}
              q0 6 4 8
              l${rx * 2 + 6} 0
              q4 -2 4 -8
              q0 -${ry + 11} -${rx + 7} -${ry + 11}z`}
          fill={`url(#g${uid})`}
        />
      )}

      {/* hedgehog spines fan out behind the head */}
      {race.spines && (
        <path
          d={Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * (1.05 + (i / 8) * 0.9);
            const tip = (r) => `${cx + Math.cos(a) * (rx + r)} ${cy + Math.sin(a) * (ry + r)}`;
            const side = (d, r) => `${cx + Math.cos(a + d) * (rx + r)} ${cy + Math.sin(a + d) * (ry + r)}`;
            return `M${side(-0.17, -1)} L${tip(10)} L${side(0.17, -1)}Z`;
          }).join(' ')}
          fill="#8a6a48"
          stroke="#d8c4a0"
          strokeWidth="0.5"
        />
      )}

      {/* ---- shoulders and what the class wears on them ---- */}
      <path d={torso} fill={`url(#g${uid})`} />
      {cls.outfit === 'fur' && (
        <>
          <path d={`M${cx - sw + 5} ${nb + 3} L${cx + sw - 7} 68`} stroke="#3a2618" strokeWidth="3.6" />
          <path
            d={`M${cx - sw - 1} ${nb + 8} Q${cx - sw + 2} ${nb - 1} ${cx - 6} ${nb - 1.5} L${cx + 6} ${nb - 1.5} Q${cx + sw - 2} ${nb - 1} ${cx + sw + 1} ${nb + 8} ${Array.from({ length: 9 }, (_, i) => {
              const x = cx + sw + 1 - ((i + 1) * (2 * sw + 2)) / 10;
              return `L${x + 2.4} ${nb + 6 + (i % 2) * 1.5} L${x} ${nb + 9.5}`;
            }).join(' ')} Z`}
            fill="#8a6a48"
          />
          <path d={`M${cx - sw + 1} ${nb + 4} Q${cx} ${nb - 2.5} ${cx + sw - 1} ${nb + 4}`} stroke="#b89a70" strokeWidth="1" fill="none" opacity="0.6" />
        </>
      )}
      {cls.outfit === 'plate' && (
        <>
          {[-1, 1].map((d) => (
            <g key={d}>
              <ellipse cx={cx + d * (sw - 9.5)} cy={nb + 9} rx="9.6" ry="7.4" fill={`url(#t${uid})`} />
              <path d={`M${cx + d * (sw - 17)} ${nb + 9} q${d * 7.5} -5 ${d * 15} 0`} stroke={shade(cls.trim, 0.45)} strokeWidth="0.8" fill="none" />
              <ellipse cx={cx + d * (sw - 11.5)} cy={nb + 5.6} rx="3.2" ry="1.3" fill="#fff8e8" opacity="0.35" />
            </g>
          ))}
          <path d={`M${cx - 7.5} ${nb - 1} Q${cx} ${nb + 4} ${cx + 7.5} ${nb - 1} L${cx + 8} ${nb + 3.5} Q${cx} ${nb + 8.5} ${cx - 8} ${nb + 3.5}Z`} fill={shade(cls.trim, 0.2)} />
        </>
      )}
      {cls.outfit === 'ruff' && [-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <circle key={i} cx={cx + i * 2.9} cy={nb + 1.2 + Math.abs(i) * -0.35} r="2.3" fill="#efe6d0" stroke="#b8ab8c" strokeWidth="0.5" />
      ))}
      {cls.outfit === 'stole' && [-1, 1].map((d) => (
        <path key={d} d={`M${cx + d * 6.5} ${nb - 0.5} Q${cx + d * 5.6} ${nb + 10} ${cx + d * 6} 68 H${cx + d * 2.8} Q${cx + d * 2.6} ${nb + 10} ${cx + d * 3.3} ${nb + 0.5}Z`} fill={`url(#t${uid})`} />
      ))}
      {cls.outfit === 'leaf' && [-1, 1].map((d) => (
        <path key={d} d={`M${cx + d * 2} ${nb + 4} q${d * 5} -5 ${d * 9} -1 q${d * -4} 5 ${d * -9} 1z`} fill={cls.trim} stroke={shade(cls.trim, 0.4)} strokeWidth="0.5" />
      ))}
      {cls.outfit === 'wrap' && (
        <>
          <path d={`M${cx - 8} ${nb} L${cx + 6} ${nb + 15} L${cx + 3.4} ${nb + 16} L${cx - 10} ${nb + 1.5}Z`} fill={shade(cls.garb, 0.28)} />
          <rect x={cx - sw} y={nb + 15.5} width={sw * 2} height="3.4" fill={cls.trim} opacity="0.85" />
        </>
      )}
      {(cls.outfit === 'strap' || cls.outfit === 'quiver') && (
        <>
          <path d={`M${cx + sw - 6} ${nb + 3} L${cx - sw + 7} 68`} stroke="#3a2618" strokeWidth="3" />
          <rect x={cx - 3.2} y={nb + 12.4} width="4" height="3.4" rx="0.6" fill="none" stroke="#c8b070" strokeWidth="0.9" transform={`rotate(-38 ${cx - 1.2} ${nb + 14})`} />
        </>
      )}
      {cls.outfit !== 'plate' && cls.outfit !== 'ruff' && cls.outfit !== 'fur' && (
        /* collar: a V-neck in the trim colour, never a stripe down the chest */
        <path d={`M${cx - 6.5} ${nb - 1} L${cx} ${nb + 8} L${cx + 6.5} ${nb - 1} L${cx + 9} ${nb + 1} L${cx} ${nb + 12.5} L${cx - 9} ${nb + 1}Z`} fill={cls.trim} opacity="0.55" />
      )}
      {cls.chest === 'symbol' && <circle cx={cx} cy={nb + 12} r="4.4" fill={`url(#t${uid})`} stroke={shade(cls.trim, 0.45)} strokeWidth="0.6" />}
      {race.robot && cls.chest !== 'symbol' && (
        <>
          <circle cx={cx} cy={nb + 12} r="5.4" fill="#1c1f24" />
          <circle cx={cx} cy={nb + 12} r="3.4" fill={eyes} />
          <circle cx={cx} cy={nb + 12} r="5.4" fill={eyes} opacity="0.25" />
        </>
      )}

      {/* a sorcerer's or warlock's standing collar, behind the neck */}
      {cls.outfit === 'collar' && [-1, 1].map((d) => (
        <path key={d} d={`M${cx + d * 7.5} ${nb + 1.5} L${cx + d * 11.5} ${chin - 6} Q${cx + d * 8.5} ${chin - 2.5} ${cx + d * 5.5} ${nb - 1}Z`} fill={`url(#t${uid})`} />
      ))}

      {/* ---- neck, with the jaw's shadow on it ---- */}
      <path d={`M${cx - 5 * hb} ${cy + ry * 0.45} V${nb + 1.5} Q${cx} ${nb + 4.5} ${cx + 5 * hb} ${nb + 1.5} V${cy + ry * 0.45}Z`} fill={shade(skin, 0.14)} />
      <path d={`M${cx - 5 * hb} ${chin - 3.5} Q${cx} ${chin + 3} ${cx + 5 * hb} ${chin - 3.5} V${chin + 0.5} Q${cx} ${chin + 4} ${cx - 5 * hb} ${chin + 0.5}Z`} fill={skinShade} opacity="0.5" />
      {race.robot && <path d={`M${cx - 5} ${chin + 1.5}h10M${cx - 5} ${chin + 4}h10`} stroke="#1c1f24" strokeWidth="1" opacity="0.6" />}

      {/* braids hang in front of the shoulders */}
      {hairStyle === 'braids' && !race.hairless && [-1, 1].map((d) => (
        <g key={d} fill={hairFill}>
          {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx={cx + d * (rx - 0.6)} cy={cy + 4 + i * 3.6} rx="2.3" ry="2.2" stroke={shade(hair, 0.45)} strokeWidth="0.5" />)}
          <rect x={cx + d * (rx - 0.6) - 1.8} y={cy + 20.5} width="3.6" height="1.6" rx="0.6" fill="#d4a94f" />
        </g>
      ))}

      {/* cat ears stand on the crown */}
      {race.ears === 'cat' && [-1, 1].map((d) => (
        <g key={d}>
          <path d={`M${cx + d * rx * 0.95} ${top + 7} L${cx + d * rx * 0.62} ${top - 6} L${cx + d * rx * 0.12} ${top + 2}Z`} fill={shade(skin, 0.08)} />
          <path d={`M${cx + d * rx * 0.78} ${top + 5} L${cx + d * rx * 0.6} ${top - 2} L${cx + d * rx * 0.32} ${top + 3}Z`} fill="#d99a90" opacity="0.8" />
        </g>
      ))}

      {/* ---- ears ---- */}
      {(race.ears === 'point' || race.ears === 'halfpoint' || race.ears === 'frill') && [-1, 1].map((d) => {
        const reach = race.ears === 'point' ? 8 : 4.5;
        const lift = race.ears === 'point' ? 11 : 6;
        return (
          <g key={d}>
            <path d={`M${cx + d * (rx - 1)} ${cy - 2} L${cx + d * (rx + reach)} ${cy - lift} L${cx + d * (rx - 2)} ${cy + 5} Z`} fill={d < 0 ? skin : shade(skin, 0.12)} />
            <path d={`M${cx + d * (rx + 0.5)} ${cy} L${cx + d * (rx + reach * 0.7)} ${cy - lift * 0.72}`} stroke={skinShade} strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
          </g>
        );
      })}
      {race.ears === 'round' && [-1, 1].map((d) => (
        <g key={d}>
          <ellipse cx={cx + d * rx} cy={cy + 1.5} rx="2.6" ry="3.6" fill={d < 0 ? skin : shade(skin, 0.12)} />
          <path d={`M${cx + d * (rx + 0.6)} ${cy} q${d * 0.9} 1.6 0 3`} stroke={skinShade} strokeWidth="0.8" fill="none" opacity="0.75" />
        </g>
      ))}

      {/* ---- head ---- */}
      {race.robot
        ? <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} rx={rx * 0.5} fill={`url(#f${uid})`} />
        : <path d={face} fill={`url(#f${uid})`} />}

      {/* gearforged: visor, lit eyes, speaker grille, plate seam, rivets, ear bolts */}
      {race.robot && (
        <>
          <path d={`M${cx} ${top + 1.5}V${eyeY - 3.5}`} stroke="#1c1f24" strokeWidth="0.9" opacity="0.45" />
          <rect x={cx - rx * 0.8} y={eyeY - 3.2} width={rx * 1.6} height="6.4" rx="3.2" fill="#15181c" />
          {[-1, 1].map((d) => (
            <g key={d}>
              <circle cx={cx + d * rx * 0.38} cy={eyeY} r="3.4" fill={eyes} opacity="0.3" />
              <circle cx={cx + d * rx * 0.38} cy={eyeY} r="1.9" fill={eyes} />
            </g>
          ))}
          {beard === 'none' && <path d={`M${cx - 4} ${mouthY - 0.5}h8M${cx - 4} ${mouthY + 1.7}h8M${cx - 3} ${mouthY + 3.9}h6`} stroke="#1c1f24" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />}
          {[-1, 1].map((d) => (
            <g key={d} fill="#1c1f24" opacity="0.55">
              <circle cx={cx + d * (rx - 2.4)} cy={cy - ry * 0.45} r="0.9" />
              <circle cx={cx + d * (rx - 2.4)} cy={cy + ry * 0.55} r="0.9" />
            </g>
          ))}
        </>
      )}
      {race.ears === 'bolt' && [-1, 1].map((d) => (
        <g key={d}>
          <circle cx={cx + d * rx} cy={cy + 1} r="3.3" fill="#2a2d33" />
          <circle cx={cx + d * rx} cy={cy + 1} r="1.4" fill="#8e98a3" />
        </g>
      ))}
      {race.robot && (cls.head === 'none' || cls.head === 'circlet' || !showHeadwear) && (
        <>
          <path d={`M${cx} ${top}V${top - 6}`} stroke="#2a2d33" strokeWidth="1.6" />
          <circle cx={cx} cy={top - 7} r="1.9" fill={eyes} />
        </>
      )}

      {/* ---- the face ---- */}
      {!fullFace && !race.robot && (
        <>
          {/* cheeks catch the warmth of the candlelight */}
          {!race.ghostly && [-1, 1].map((d) => (
            <ellipse key={d} cx={cx + d * ex * 1.3} cy={eyeY + 3.8} rx="2.5" ry="1.4" fill="#e0705a" opacity="0.13" />
          ))}
          {race.markings && (
            <path d={`M${cx - rx * 0.72} ${cy + 3} l3 2.2 M${cx + rx * 0.72} ${cy + 3} l-3 2.2 M${cx - 3} ${browY - 2} h6`} stroke="#4a4f56" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" fill="none" />
          )}
          {mark === 'freckles' && [[-1.3, 0.2], [-0.9, 1.3], [-0.5, 0.4], [0.5, 0.4], [0.9, 1.3], [1.3, 0.2]].map(([dx, dy], i) => (
            <circle key={i} cx={cx + dx * ex} cy={eyeY + 3 + dy} r="0.5" fill={shade(skin, 0.45)} opacity="0.8" />
          ))}
          {mark === 'tattoo' && (
            <path d={`M${cx - ex - 2.6} ${browY - 1.5} q-1.6 3.4 0 6.4 M${cx - ex - 3.4} ${eyeY + 3} q1.2 1.8 3.2 2 M${cx - 1.2} ${hl + 1.6} l1.2 -1.6 1.2 1.6`} stroke="#2f3f66" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.75" />
          )}

          {/* minotaur muzzle: eyes stay visible above it */}
          {race.bull && (
            <>
              <ellipse cx={cx} cy={mouthY - 0.5} rx={rx * 0.58} ry={ry * 0.32} fill={light(skin, 0.35)} />
              <ellipse cx={cx - 2.6} cy={mouthY - 1} rx="1.2" ry="0.9" fill="#241c14" />
              <ellipse cx={cx + 2.6} cy={mouthY - 1} rx="1.2" ry="0.9" fill="#241c14" />
              <path d={`M${cx - 2.4} ${mouthY + 2.2} Q${cx} ${mouthY + 3} ${cx + 2.4} ${mouthY + 2.2}`} stroke="#241c14" strokeWidth="0.8" fill="none" />
            </>
          )}
          {/* dragonborn muzzle */}
          {race.snout && (
            <>
              <ellipse cx={cx} cy={mouthY} rx={rx * 0.64} ry={ry * 0.36} fill={light(skin, 0.08)} />
              <path d={`M${cx - rx * 0.5} ${mouthY + 1.6} Q${cx} ${mouthY + 3} ${cx + rx * 0.5} ${mouthY + 1.6}`} stroke={shade(skin, 0.5)} strokeWidth="0.9" fill="none" />
              <circle cx={cx - 2.6} cy={mouthY - 1.8} r="0.9" fill="#241c14" />
              <circle cx={cx + 2.6} cy={mouthY - 1.8} r="0.9" fill="#241c14" />
              {[-1, 0, 1].map((i) => <path key={i} d={`M${cx + i * 3} ${top + 3} l1.4 2.2 -2.8 0z`} fill={shade(skin, 0.3)} />)}
            </>
          )}

          {/* eyes */}
          {[-1, 1].map((d) => {
            const x = cx + d * ex;
            const y = race.snout ? eyeY - 1.4 : eyeY;
            if (glowing) {
              return (
                <g key={d}>
                  <ellipse cx={x} cy={y} rx="3.6" ry="2.7" fill={eyes} opacity="0.22" />
                  <path d={`M${x - 2.4} ${y} Q${x} ${y - 2.2} ${x + 2.4} ${y} Q${x} ${y + 1.7} ${x - 2.4} ${y}Z`} fill={eyes} />
                  <path d={`M${x - 2.6} ${y + 0.1} Q${x} ${y - 2.5} ${x + 2.6} ${y + 0.1}`} stroke={lid} strokeWidth="0.8" fill="none" />
                </g>
              );
            }
            return (
              <g key={d}>
                <ellipse cx={x} cy={y - 1.3} rx="3" ry="1.5" fill={skinShade} opacity="0.3" />
                <path d={`M${x - 2.4} ${y} Q${x} ${y - 2.2} ${x + 2.4} ${y} Q${x} ${y + 1.8} ${x - 2.4} ${y}Z`} fill="#ece4d4" />
                <circle cx={x} cy={y - 0.1} r={race.cat || race.slit ? 1.55 : 1.3} fill={eyes} />
                {race.cat || race.slit
                  ? <ellipse cx={x} cy={y - 0.1} rx="0.42" ry="1.3" fill="#120c08" />
                  : <circle cx={x} cy={y - 0.1} r="0.62" fill="#120c08" />}
                <circle cx={x - 0.5} cy={y - 0.6} r="0.38" fill="#ffffff" opacity="0.9" />
                <path d={`M${x - 2.6} ${y + 0.1} Q${x} ${y - 2.5} ${x + 2.6} ${y + 0.1}`} stroke={lid} strokeWidth="0.85" fill="none" strokeLinecap="round" />
              </g>
            );
          })}

          {/* nose: a shadow down one side and under the tip */}
          {faceHair && (
            <>
              <path d={`M${cx + 0.4} ${eyeY + 0.8} Q${cx + (race.bigNose ? 2.4 : 1.8)} ${noseY - 0.6} ${cx + 0.2} ${noseY + 0.5}`} stroke={skinShade} strokeWidth="0.9" fill="none" strokeLinecap="round" />
              <path d={`M${cx - (race.bigNose ? 2.4 : 1.7)} ${noseY + 0.5} Q${cx} ${noseY + 1.8} ${cx + (race.bigNose ? 2.4 : 1.7)} ${noseY + 0.5}`} stroke={skinShade} strokeWidth="0.75" fill="none" strokeLinecap="round" opacity="0.75" />
            </>
          )}
          {race.cat && (
            <>
              <path d={`M${cx - 1.6} ${noseY - 0.6} h3.2 l-1.6 2z`} fill="#8a4a44" />
              <path d={`M${cx} ${noseY + 1.4} v1 M${cx} ${noseY + 2.4} q-1.4 1 -2.6 0 M${cx} ${noseY + 2.4} q1.4 1 2.6 0`} stroke="#3a2420" strokeWidth="0.7" fill="none" />
              <path d={`M${cx - 3} ${noseY + 1.4} L${cx - rx - 2} ${noseY} M${cx - 3} ${noseY + 2.4} L${cx - rx - 2} ${noseY + 3.2} M${cx + 3} ${noseY + 1.4} L${cx + rx + 2} ${noseY} M${cx + 3} ${noseY + 2.4} L${cx + rx + 2} ${noseY + 3.2}`} stroke="#f0e8d8" strokeWidth="0.55" opacity="0.8" />
            </>
          )}

          {/* beard, then the mouth on top of it so the expression survives */}
          {faceHair && beardShape(beard, g, hairFill)}
          {faceHair && (beard === 'short' || beard === 'full' || beard === 'braided') && (
            <ellipse cx={cx} cy={mouthY + 0.4} rx="2.8" ry="1.1" fill={shade(skin, 0.2)} />
          )}
          {faceHair && mark !== 'mask' && (
            mood === 'grin' ? (
              <>
                <path d={`M${cx - 3.4} ${mouthY - 0.6} Q${cx} ${mouthY + 3.8} ${cx + 3.4} ${mouthY - 0.6} Q${cx} ${mouthY + 0.4} ${cx - 3.4} ${mouthY - 0.6}Z`} fill="#3a1814" />
                <path d={`M${cx - 2.9} ${mouthY - 0.3} Q${cx} ${mouthY + 0.8} ${cx + 2.9} ${mouthY - 0.3} L${cx + 2.5} ${mouthY + 0.5} Q${cx} ${mouthY + 1.4} ${cx - 2.5} ${mouthY + 0.5}Z`} fill="#efe8d8" />
              </>
            ) : (
              <>
                <path
                  d={{
                    calm: `M${cx - 2.6} ${mouthY} Q${cx} ${mouthY + 0.8} ${cx + 2.6} ${mouthY}`,
                    smile: `M${cx - 3} ${mouthY - 0.6} Q${cx} ${mouthY + 2.4} ${cx + 3} ${mouthY - 0.6}`,
                    stern: `M${cx - 2.6} ${mouthY + 0.5} Q${cx} ${mouthY - 0.2} ${cx + 2.6} ${mouthY + 0.5}`,
                    smirk: `M${cx - 2.6} ${mouthY + 0.3} Q${cx + 0.6} ${mouthY + 1.1} ${cx + 2.9} ${mouthY - 1.1}`,
                  }[mood] || `M${cx - 2.6} ${mouthY} Q${cx} ${mouthY + 0.8} ${cx + 2.6} ${mouthY}`}
                  stroke={lip}
                  strokeWidth="1"
                  fill="none"
                  strokeLinecap="round"
                />
                {beard !== 'goatee' && beard !== 'short' && beard !== 'full' && beard !== 'braided' && (
                  <path d={`M${cx - 1.2} ${mouthY + 2.1} h2.4`} stroke={skinShade} strokeWidth="0.8" strokeLinecap="round" opacity="0.45" />
                )}
              </>
            )
          )}
          {/* half-orc tusks sit at the mouth, under the eyes */}
          {race.tusks && (
            <>
              <path d={`M${cx - 4.5} ${mouthY + 2} l-1.6 -4.6 3.2 0z`} fill="#e8e2cc" />
              <path d={`M${cx + 4.5} ${mouthY + 2} l1.6 -4.6 -3.2 0z`} fill="#e8e2cc" />
            </>
          )}
          {race.fangs && (
            <>
              <path d={`M${cx - 2.2} ${mouthY + 0.2} l0.8 2.4 0.8 -2.4z`} fill="#ece6d2" />
              <path d={`M${cx + 0.6} ${mouthY + 0.2} l0.8 2.4 0.8 -2.4z`} fill="#ece6d2" />
            </>
          )}

          {/* brows set the expression */}
          {[-1, 1].map((d) => {
            const inner = mood === 'stern' ? 1.3 : mood === 'smile' || mood === 'grin' ? -0.3 : 0;
            const arch = mood === 'smirk' && d === 1 ? 1.4 : mood === 'smile' ? 0.5 : 0;
            const y = race.snout ? browY - 1.2 : browY;
            return (
              <path
                key={d}
                d={`M${cx + d * 1.7} ${y + inner} Q${cx + d * (ex + 0.4)} ${y - 1.3 - arch} ${cx + d * (ex + 2.9)} ${y + 0.4 - arch * 0.4}`}
                stroke={race.snout ? shade(skin, 0.35) : brow}
                strokeWidth={race.bushy || race.snout ? 1.9 : 1.3}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}

          {/* war paint and scars go on last so hair never hides them */}
          {mark === 'warpaint' && [-1, 1].map((d) => (
            <path key={d} d={`M${cx + d * (ex - 2.2)} ${eyeY + 2.4} h${d * 4.4}`} stroke={cls.trim === '#e8c476' ? '#c2542e' : cls.trim} strokeWidth="1.6" strokeLinecap="round" />
          ))}
          {mark === 'scar' && (
            <>
              <path d={`M${cx + ex - 1.4} ${browY - 1.4} L${cx + ex + 1.6} ${eyeY + 4.8}`} stroke={light(skin, 0.3)} strokeWidth="1" strokeLinecap="round" />
              <path d={`M${cx + ex - 1.2} ${browY + 1.2} l1.6 -0.4 M${cx + ex + 0.4} ${eyeY + 2.8} l1.6 -0.4`} stroke={skinShade} strokeWidth="0.5" />
            </>
          )}
        </>
      )}
      {/* a full beard shows under a great helm */}
      {fullFace && faceHair && (beard === 'full' || beard === 'braided') && beardShape(beard, g, hairFill)}

      {/* ---- hair: crown only, stops above the brow ---- */}
      {!race.hairless && !fullFace && hairFront(hairStyle, g, hairFill, skin)}

      {/* ---- minotaur horns sweep out from the crown ---- */}
      {race.bull && [-1, 1].map((d) => (
        <path
          key={d}
          d={`M${cx + d * rx * 0.5} ${top + 3} Q${cx + d * (rx + 9)} ${top + 4} ${cx + d * (rx + 8)} ${top - 8} Q${cx + d * (rx + 3)} ${top} ${cx + d * rx * 0.8} ${top + 7}Z`}
          fill="#e6dcc2"
          stroke="#8a7a5a"
          strokeWidth="0.6"
        />
      ))}
      {/* alseid antlers (a druid's antler headdress already covers this) */}
      {race.antlers && !(showHeadwear && cls.head === 'antlers') && (
        <g stroke="#8a6a44" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d={`M${cx - 5} ${top + 2} l-4 -7 l-4 -1.5 M${cx - 9} ${top - 5} l1 -5`} />
          <path d={`M${cx + 5} ${top + 2} l4 -7 l4 -1.5 M${cx + 9} ${top - 5} l-1 -5`} />
        </g>
      )}
      {/* mushroomfolk: the cap is the head's crown, so it replaces hat and hair */}
      {race.cap && (
        <>
          <path d={`M${cx - rx - 7} ${top + 8} Q${cx} ${top - 17} ${cx + rx + 7} ${top + 8} Q${cx} ${top + 4} ${cx - rx - 7} ${top + 8}Z`} fill={race.cap} />
          <path d={`M${cx - rx - 5} ${top + 6.4} Q${cx} ${top + 3} ${cx + rx + 5} ${top + 6.4}`} stroke={shade(race.cap, 0.4)} strokeWidth="1" fill="none" />
          {(race.capPits ? [[-6, 0], [0, -4], [6, 0], [-3, 4], [3, 4]] : [[-7, 2], [0, -3], [6, 1]]).map(([dx, dy], i) => (
            <circle key={i} cx={cx + dx} cy={top + dy} r={race.capPits ? 1.5 : 2.1} fill={race.capPits ? '#4a3420' : '#f2ead6'} opacity="0.85" />
          ))}
        </>
      )}

      {/* ---- a dragonborn's crest of horns sweeps back from the brow ---- */}
      {race.crest && [-1, 1].map((d) => (
        <path key={d} d={`M${cx + d * rx * 0.55} ${top + 4} Q${cx + d * (rx + 2)} ${top - 1} ${cx + d * (rx + 5)} ${top - 7} Q${cx + d * (rx + 1)} ${top + 2} ${cx + d * rx * 0.9} ${top + 7}Z`} fill={shade(skin, 0.35)} stroke={shade(skin, 0.55)} strokeWidth="0.5" />
      ))}

      {/* ---- tiefling horns ---- */}
      {race.horns && [-1, 1].map((d) => (
        <path key={d} d={`M${cx + d * rx * 0.66} ${top + 3} q${d * -6.5} -9 ${d * 1.5} -13.5 ${d * -2} 6.5 ${d * 3} 11.5z`} fill="#3a2f2a" stroke="#5a4a40" strokeWidth="0.5" />
      ))}

      {/* ---- headwear: everything opaque stays above the brow ---- */}
      {showHeadwear && cls.head === 'hood' && (
        /* front rim of the hood - a crescent over the crown, never the eyes */
        <path
          d={`M${cx - rx - 3} ${hatLine + 1}
              q0 -${ry + 5} ${rx + 3} -${ry + 5}
              q${rx + 3} 0 ${rx + 3} ${ry + 5}
              q-2 -4 -6 -4
              q0 -${ry - 3} -${rx - 3} -${ry - 3}
              q-${rx - 3} 0 -${rx - 3} ${ry - 3}
              q-4 0 -6 4z`}
          fill={`url(#g${uid})`}
        />
      )}
      {showHeadwear && cls.head === 'wizhat' && (
        <>
          <path d={`M${cx + 2} ${top - 17} Q${cx + 5} ${top - 8} ${cx + 13} ${top + 3} H${cx - 13} Q${cx - 4} ${top - 7} ${cx + 2} ${top - 17}z`} fill={`url(#g${uid})`} />
          <ellipse cx={cx} cy={top + 3.4} rx="18" ry="3" fill={cls.garb} />
          <rect x={cx - 7.5} y={top - 3} width="15" height="3.6" rx="1" fill={cls.trim} />
          <path d={`M${cx - 4} ${top - 9} l0.9 1.8 2 .3 -1.45 1.4 .35 2 -1.8 -.95 -1.8 .95 .35 -2 -1.45 -1.4 2 -.3z`} fill={cls.trim} opacity="0.9" />
        </>
      )}
      {showHeadwear && cls.head === 'cap' && (
        <>
          <path d={`M${cx - rx - 2} ${hatLine} q${rx + 2} -11 ${rx * 2 + 4} 0z`} fill={`url(#g${uid})`} />
          <path d={`M${cx + rx - 1} ${hatLine - 3} q11 -8 13 -1 -7.5 0 -11 4.5z`} fill={cls.trim} />
        </>
      )}
      {showHeadwear && cls.head === 'helm' && (
        <>
          {/* dome over the crown */}
          <path d={`M${cx - rx - 1} ${hatLine} q0 -${ry + 5} ${rx + 1} -${ry + 5} q${rx + 1} 0 ${rx + 1} ${ry + 5}z`} fill={`url(#t${uid})`} />
          <rect x={cx - rx - 1} y={hatLine - 2} width={rx * 2 + 2} height="2" fill={shade(cls.trim, 0.3)} />
          {/* cheek guards down the sides, leaving the eyes clear */}
          <path d={`M${cx - rx - 1} ${hatLine} l3.5 0 0 ${ry * 0.9} -3.5 2z`} fill={cls.trim} />
          <path d={`M${cx + rx + 1} ${hatLine} l-3.5 0 0 ${ry * 0.9} 3.5 2z`} fill={shade(cls.trim, 0.2)} />
          {/* nose guard */}
          <rect x={cx - 1.4} y={hatLine} width="2.8" height={ry * 0.62} fill={cls.trim} />
        </>
      )}
      {showHeadwear && cls.head === 'greathelm' && (
        <>
          <path d={`M${cx - rx - 1.5} ${cy + 6} q0 -${ry + 8} ${rx + 1.5} -${ry + 8} q${rx + 1.5} 0 ${rx + 1.5} ${ry + 8}z`} fill={`url(#t${uid})`} />
          <rect x={cx - 8} y={cy - 1.6} width="16" height="3.6" rx="1.4" fill="#141414" />
          <rect x={cx - 1.6} y={cy + 3} width="3.2" height={ry * 0.25} fill="#141414" opacity="0.45" />
          <path d={`M${cx - 7} ${top - 2} ${cx} ${top - 10} ${cx + 7} ${top - 2}z`} fill="#e8c476" />
        </>
      )}
      {showHeadwear && cls.head === 'mitre' && (
        <path
          d={`M${cx} ${top - 13} q${rx + 3} 6 ${rx + 3} ${ry * 0.85} l-${rx * 2 + 6} 0 q0 -${ry * 0.85 - 6} ${rx + 3} -${ry * 0.85 + 6}z`}
          fill={`url(#g${uid})`}
          stroke={cls.trim}
          strokeWidth="1.6"
        />
      )}
      {showHeadwear && cls.head === 'antlers' && (
        <g stroke="#7a5a38" strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d={`M${cx - 6} ${top + 2} l-6 -9 l-5.5 -2.5 M${cx - 12} ${top - 7} l1.5 -7`} />
          <path d={`M${cx + 6} ${top + 2} l6 -9 l5.5 -2.5 M${cx + 12} ${top - 7} l-1.5 -7`} />
          <path d={`M${cx - rx} ${hatLine - 1} q${rx} -4 ${rx * 2} 0`} stroke={cls.trim} strokeWidth="2" />
        </g>
      )}
      {showHeadwear && cls.head === 'circlet' && (
        <>
          <path d={`M${cx - rx + 1} ${hatLine - 0.5} q${rx - 1} 5 ${rx * 2 - 2} 0`} stroke={cls.trim} strokeWidth="2.2" fill="none" />
          <circle cx={cx} cy={hatLine + 1.8} r="2.3" fill={cls.trim} stroke={shade(cls.trim, 0.5)} strokeWidth="0.5" />
        </>
      )}

      {/* a rogue's mask covers nose and mouth, not the eyes */}
      {mark === 'mask' && !fullFace && !race.robot && (
        <path d={`M${cx - rx + 0.6} ${cy + 3.6} q${rx - 0.6} 2.4 ${rx * 2 - 1.2} 0 l0 5.6 q-${rx - 0.6} 5.4 -${rx * 2 - 1.2} 0z`} fill="#1c1c22" opacity="0.94" />
      )}
      {cls.spark && <circle cx={cx + rx + 4} cy={top + 4} r="2.8" fill={cls.trim} opacity="0.95" />}
      {cls.spark && <circle cx={cx + rx + 4} cy={top + 4} r="5" fill={cls.trim} opacity="0.2" />}
    </g>
  );
}

/* ---------------- public components ---------------- */

/**
 * What a character or creature looks like. Everything else (portrait frames,
 * map tokens, list rows) wraps this.
 */
export function CreatureArt({ sheet, art, color = '#d4a94f', size = 64 }) {
  const body = useMemo(() => {
    if (art && CREATURES[art]) return CREATURES[art](color);
    return null;
  }, [art, color]);
  const picture = !body && safePortraitImage(sheet?.portrait?.image);

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      {body || (picture
        ? <image href={picture} x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" />
        : <HeroBust sheet={sheet?.name ? sheet : { ...sheet, name: sheet?.name || 'hero' }} />)}
    </svg>
  );
}

/**
 * Framed portrait. Use for lobby cards, the party list, sheet headers and
 * every character picker.
 */
export function Avatar({ sheet, art, name, color = '#d4a94f', size = 44, shape = 'round', ring = true, className = '', title }) {
  const label = name || sheet?.name || 'Character';
  return (
    <span
      className={`avatar avatar-${shape} ${ring ? 'avatar-ring' : ''} ${className}`}
      style={{ '--av-size': `${size}px`, '--av-color': color }}
      role="img"
      aria-label={`${label} portrait`}
      title={title || label}
    >
      <span className="avatar-bg" />
      <CreatureArt sheet={sheet ? { ...sheet, name: sheet.name || label } : { name: label }} art={art} color={art ? '#efe7d4' : color} size={size} />
    </span>
  );
}

/**
 * Which silhouette a token should wear.
 *
 * Tokens created before art existed carry no `art` key, so a monster's look is
 * re-derived from its name and stat-block index. Without this every creature on
 * an older campaign's map would fall through to the generic hero bust.
 */
export function artForToken(token) {
  if (!token) return null;
  if (token.art) return token.art;
  if (token.kind === 'marker') return 'marker';
  if (token.kind === 'monster') return artKeyForMonster({ name: token.label, type: token.monsterType, index: token.monsterIndex });
  if (token.kind === 'npc') return 'humanoid';
  return null; // a PC draws its hero bust from the character sheet
}

/** The same likeness, sized and clipped for a map token disc. */
export function TokenFace({ token, sheet, size }) {
  return (
    <span className="token-face" aria-hidden="true">
      <CreatureArt sheet={sheet ? { ...sheet, name: sheet.name || token.label } : { name: token.label }} art={artForToken(token)} color="#f2ecdc" size={size} />
    </span>
  );
}

export const CREATURE_ART_KEYS = Object.keys(CREATURES);
export const NPC_ART_KEYS = ['humanoid', 'goblinoid', 'orc', 'skeleton', 'zombie', 'ghost', 'fey', 'celestial', 'construct', 'golem'];
