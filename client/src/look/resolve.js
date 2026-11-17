import {
  RACES, SUBRACE_LOOKS, SHADE_SKINS, KITS, ROLES, BUST, EYE_COLORS, NATURAL_HAIR, HAIR_COLORS, ROBOT_GLOW, ROBOT_ACCENTS,
  BODIES, FRAMES, HEIGHTS, FACES, EYE_SHAPES, BROWS, NOSES, MOODS, MARKS, HAIR_STYLES, BEARDS, OUTFITS, ARMOURS, CLOAKS,
  HATS, EXTRAS, MAIN_HANDS, OFF_HANDS, TWO_HANDED, ROBOT_HEADS, ROBOT_FINISHES, CLOTH_COLORS, TRIM_COLORS, LEATHERS,
  METALS, METAL_PAINT,
} from './catalog';

// ================= Resolving a sheet to a look =================
//
// resolveLook(sheet) is every trait of a hero: the player's own choice where
// they made one (sheet.portrait.look), otherwise what their ancestry, class
// and name give them. The same name always gives the same defaults.
//
// Looks saved before this catalogue (headwear 'on'/'off', gearforged frames
// slim/standard/heavy) are read as their nearest new choice.

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str || '').length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
const pick = (arr, t) => arr[Math.floor(t * arr.length) % arr.length];
const luma = (hex) => {
  const n = parseInt(String(hex || '#808080').slice(1), 16) || 0;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const mix = (a, b, t) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const shade = (c, t = 0.3) => mix(c, '#140c08', t);

// Exact key first, then the longest key it contains ("half-elf" never lands
// on "elf"; "lightfoot halfling" lands on halfling).
export function lookup(table, value, fallbackKey) {
  const key = String(value || '').toLowerCase().replace(/\s+/g, '-');
  if (table[key]) return table[key];
  const hit = Object.keys(table).sort((a, b) => b.length - a.length).find((k) => key.includes(k));
  return hit ? table[hit] : table[fallbackKey];
}

export function raceLook(sheet) {
  const base = lookup(RACES, sheet?.raceIndex || sheet?.race || sheet?.raceName, 'human');
  const sub = sheet?.subrace;
  if (!sub) return base;
  if (/^shade-/.test(sub)) {
    // a shade keeps the shape of who they were, drained of colour
    const origin = RACES[sub.replace(/^shade-/, '')] || RACES.human;
    return { ...origin, skins: SHADE_SKINS, ghostly: true, glowEyes: true, eyes: [EYE_COLORS.ice], hairColors: ['#d8dce4', '#b8c0cc'] };
  }
  return SUBRACE_LOOKS[sub] ? { ...base, ...SUBRACE_LOOKS[sub] } : base;
}

const classKitOf = (sheet) => lookup(KITS, sheet?.classIndex || sheet?.className, 'npc');
const classKeyOf = (sheet) => {
  const src = String(sheet?.classIndex || sheet?.className || 'npc').toLowerCase();
  return Object.keys(KITS).find((k) => src.includes(k)) || 'npc';
};

const OLD_FRAMES = { slim: 'slight', standard: 'average', heavy: 'heavy' };
const ok = (table, v) => (v && Object.prototype.hasOwnProperty.call(table, v) ? v : null);

// What the portrait's older drawing calls each outfit (it draws a quiver,
// a fur collar, a ruff, a standing collar, a robe, plate…).
function bustOutfit(L) {
  if (L.extras.includes('quiver') || L.main === 'bow') return 'quiver';
  if (L.armour === 'plate' || L.armour === 'half') return 'plate';
  return { furs: 'fur', doublet: 'ruff', coat: 'collar', robe: 'robe', vestments: 'stole', wraps: 'wrap', leathers: 'strap', dress: 'collar' }[L.outfit] || null;
}

/**
 * Every trait of a hero or a person. `sheet` is a character sheet (race,
 * class, name, portrait.look); NPCs pass { name, role, body } instead.
 */
export function resolveLook(sheet) {
  const race = raceLook(sheet);
  const role = sheet?.role ? ROLES[sheet.role] : null;
  const kit = role ? { ...KITS.npc, ...role, hat: role.hat ? [role.hat, 1] : ['none', 0] } : classKitOf(sheet);
  const classKey = role ? 'npc' : classKeyOf(sheet);
  const look = (sheet && sheet.portrait && sheet.portrait.look) || {};
  const seed = look.seed || sheet?.name || 'hero';
  const h = (k) => hashString(`${seed}-${k}`);
  const robot = !!race.robot;

  // ---- who
  const body = ok(BODIES, look.body) || ok(BODIES, sheet?.body) || PREGEN_BODIES[sheet?.name] || null;
  const frame = ok(FRAMES, look.frame) || OLD_FRAMES[look.frame] || kit.frame || (race.build >= 1.14 ? 'broad' : race.build <= 0.9 ? 'lean' : pick(['average', 'average', 'lean', 'athletic', 'heavy'], h('frame')));
  const height = ok(HEIGHTS, look.height) || 'average';

  // ---- face
  const skin = look.skin || pick(race.skins, h('skin'));
  const face = ok(FACES, look.face) || race.face || 'oval';
  const eyeShape = ok(EYE_SHAPES, look.eyeShape) || race.eyeShape || pick(['round', 'almond', 'round', 'narrow'], h('eyeshape'));
  const brows = ok(BROWS, look.brows) || (race.bushy ? 'heavy' : body === 'feminine' ? 'arched' : body === 'masculine' ? pick(['straight', 'heavy'], h('brows')) : 'soft');
  const nose = ok(NOSES, look.nose) || race.nose || pick(['straight', 'button', 'straight', 'hooked'], h('nose'));
  const mood = ok(MOODS, look.mood) || pick(kit.moods || ['calm'], h('mood'));
  let defaultMark = 'none';
  if (kit.mark && h('classmark') < kit.mark[1]) defaultMark = kit.mark[0];
  else if (!robot) {
    const r = h('mark');
    if (r < 0.12) defaultMark = 'scar';
    else if (r < 0.24 && luma(skin) > 0.5) defaultMark = 'freckles';
  }
  const mark = robot ? 'none' : ok(MARKS, look.mark) || defaultMark;

  // ---- hair: feminine and androgynous people don't get facial hair unless
  // the player picks it, and lean to longer hair
  const [beardChance, beardPool] = race.beard || [0, []];
  const beardOdds = body === 'feminine' || body === 'neutral' ? 0 : body === 'masculine' ? Math.min(1, beardChance + 0.25) : beardChance;
  const defaultBeard = h('beard') < beardOdds ? pick(beardPool, h('beardkind')) : 'none';
  const hairs = kit.hairs || KITS.npc.hairs;
  const hairPool = body === 'feminine' ? [...new Set([...hairs.filter((x) => !['bald', 'shaved', 'crop', 'mohawk'].includes(x)), 'long', 'braids', 'bun'])]
    : body === 'masculine' ? [...new Set([...hairs, 'crop'])] : hairs;
  const hairless = robot || race.hairless;
  const greyHair = role?.grey ? ['#d8d2c2', '#a8a8a8', '#e8e4dc'] : null;
  const hair = look.hair || (robot ? '#4a4540' : pick(greyHair || race.hairColors || NATURAL_HAIR, h('hair')));
  const hairStyle = hairless ? 'bald' : ok(HAIR_STYLES, look.hairStyle) || pick(hairPool, h('style'));
  const beard = robot ? 'none' : race.beardFixed && !look.beard ? race.beardFixed : ok(BEARDS, look.beard) || defaultBeard;

  // ---- clothes and gear
  const outfit = ok(OUTFITS, look.outfit) || kit.outfit || 'tunic';
  const armour = ok(ARMOURS, look.armour) || kit.armour || 'none';
  const cloak = ok(CLOAKS, look.cloak) || kit.cloak || 'none';
  let hat = ok(HATS, look.hat);
  if (!hat) {
    const [kind, chance] = kit.hat || ['none', 0];
    if (look.headwear === 'off') hat = 'none';
    else if (look.headwear === 'on') hat = kind !== 'none' ? kind : 'hood';
    else hat = kind !== 'none' && h('head') < chance ? kind : 'none';
  }
  if (race.cap && ['hood', 'helm', 'greathelm', 'horned', 'wizard', 'widebrim', 'cap', 'bandana', 'headwrap'].includes(hat)) hat = 'none'; // a mushroom cap wears nothing over it
  const extras = Array.isArray(look.extras) ? look.extras.filter((x) => EXTRAS[x]) : [...(kit.extras || [])];
  const main = ok(MAIN_HANDS, look.main) || kit.main || 'none';
  let off = ok(OFF_HANDS, look.off) || kit.off || 'none';
  if (TWO_HANDED.has(main)) off = 'none';

  // ---- paint: a gearforged's "clothes" are plating a shade darker than its
  // head, its trim the accent metal or the light along its seams
  const garb = robot ? look.garb || shade(skin, 0.12) : look.garb || kit.garb;
  const trim = look.trim || (robot ? ROBOT_ACCENTS[0] : kit.trim);
  const cloakColor = look.cloakColor || (cloak === 'mantle' ? '#8a6a48' : shade(garb, 0.25));
  const leatherKey = ok(LEATHERS, look.leather) || kit.leather || 'brown';
  const metal = ok(METALS, look.metal) || kit.metal || 'steel';

  const L = {
    race, classKey, role: sheet?.role || null, seed, robot,
    body, frame, height, skin, face, eyeShape, brows, nose, eyes: look.eyes || pick(race.eyes || [EYE_COLORS.brown], h('eyes')), mood, mark,
    hair, hairStyle, beard,
    outfit, armour, cloak, hat, extras, main, off,
    garb, trim, cloakColor, leather: LEATHERS[leatherKey], leatherKey, metal, metalPaint: METAL_PAINT[metal],
    staff: kit.staff || 'plain', spark: !!kit.spark, child: !!role?.child, bound: !!role?.bound, leatherApron: !!role?.leatherApron,
    // gearforged only
    robotHead: robot ? ok(ROBOT_HEADS, look.robotHead) || 'visor' : null,
    finish: robot ? ok(ROBOT_FINISHES, look.finish) || 'worn' : null,
  };
  // The portrait's vocabulary (components/Portrait.jsx HeroBust).
  L.headwear = !!BUST.hat[hat];
  L.cls = { garb, trim, head: BUST.hat[hat] || 'none', outfit: robot ? 'chassis' : bustOutfit(L), chest: extras.includes('pendant') ? 'symbol' : null, spark: L.spark, trimDyed: !!look.trim };
  L.bust = {
    hairStyle: BUST.hair[hairStyle] || hairStyle,
    beard: BUST.beard[beard] || beard,
    mark: BUST.mark[mark] || mark,
    frame: frame === 'slight' ? 'slim' : frame === 'heavy' || frame === 'broad' ? 'heavy' : 'standard',
  };
  return L;
}

// Ready-made heroes copied before presentation was a trait still look like themselves.
const PREGEN_BODIES = { 'Brenna Ironvow': 'feminine', 'Piper Thistledown': 'neutral', 'Ansel Morrow': 'masculine', 'Sylvara Nightbreeze': 'feminine', 'Korgan Flamebrand': 'masculine', 'Elowen Vale': 'feminine' };

/** A person in the world, from their name on the map. */
export function npcLook({ label = '', seed, body, role } = {}) {
  const key = role && ROLES[role] ? role : Object.keys(ROLES).find((k) => ROLES[k].re.test(label)) || 'farmer';
  const s = seed || label || 'npc';
  // most townsfolk are human; some are not
  const r = hashString(`${s}-folk`);
  const raceIndex = /dwarf/i.test(label) ? 'dwarf' : /elf|elven/i.test(label) ? 'elf' : /halfling/i.test(label) ? 'halfling' : /gnome/i.test(label) ? 'gnome' : /orc/i.test(label) ? 'half-orc'
    : r < 0.1 ? 'dwarf' : r < 0.18 ? 'halfling' : r < 0.25 ? 'elf' : r < 0.29 ? 'half-orc' : r < 0.32 ? 'gnome' : 'human';
  const L = resolveLook({ name: s, role: key, raceIndex, body });
  L.raceIndex = raceIndex;
  if (/ghost|spirit|shade|phantom|spectr/i.test(label)) { L.race = { ...L.race, ghostly: true, glowEyes: true }; L.eyes = '#bfe8ff'; }
  return L;
}

/* ---------------- the editor's menu ---------------- */

/** What the look editor offers this hero; null means "not for this body". */
export function lookOptions(sheet) {
  const race = raceLook(sheet);
  const robot = !!race.robot;
  const organic = !robot;
  const faceHair = organic && !race.snout && !race.cat && !race.bull && !race.cap;
  return {
    skins: race.skins,
    skinLabel: robot ? 'Plating' : race.snout ? 'Scales' : race.cat || race.bull ? 'Fur' : 'Skin',
    bodies: race.skull ? null : BODIES,
    frames: FRAMES,
    heights: HEIGHTS,
    faces: organic && !race.snout && !race.bull ? FACES : null,
    eyeShapes: organic ? EYE_SHAPES : null,
    brows: organic ? BROWS : null,
    noses: faceHair ? NOSES : null,
    eyes: robot ? ROBOT_GLOW : [...new Set([...(race.eyes || []), ...Object.values(EYE_COLORS)])],
    eyesLabel: robot ? 'Eye glow' : 'Eyes',
    moods: organic ? MOODS : null,
    marks: organic ? MARKS : null,
    hairStyles: organic && !race.hairless ? HAIR_STYLES : null,
    hairColors: organic && !race.hairless ? [...new Set([...(race.hairColors || []), ...HAIR_COLORS])] : null,
    beards: faceHair ? BEARDS : null,
    outfits: robot ? null : OUTFITS,
    armours: ARMOURS,
    cloaks: CLOAKS,
    hats: race.cap ? { none: 'None', circlet: 'Circlet', antlers: 'Antler crown' } : HATS,
    extras: EXTRAS,
    mains: MAIN_HANDS,
    offs: OFF_HANDS,
    garbs: [...new Set([classKitOf(sheet).garb, ...CLOTH_COLORS])],
    garbLabel: robot ? 'Tabard' : 'Clothes',
    trims: robot ? ROBOT_ACCENTS : [...new Set([classKitOf(sheet).trim, ...TRIM_COLORS])],
    trimLabel: robot ? 'Accent' : 'Trim',
    cloakColors: CLOTH_COLORS,
    leathers: LEATHERS,
    metals: METALS,
    robotHeads: robot ? ROBOT_HEADS : null,
    finishes: robot ? ROBOT_FINISHES : null,
  };
}

/** Every trait at random (keeps what's in `keep`, e.g. the presentation). */
export function randomLook(sheet, keep = {}) {
  const o = lookOptions(sheet);
  const R = Math.random;
  const r = (xs) => (xs && xs.length ? xs[Math.floor(R() * xs.length)] : undefined);
  const k = (obj) => (obj ? r(Object.keys(obj)) : undefined);
  const kit = classKitOf(sheet);
  const look = { seed: R().toString(36).slice(2, 10), ...keep };
  const set = (key, v) => { if (v !== undefined && keep[key] === undefined) look[key] = v; };
  set('skin', r(o.skins));
  set('frame', k(o.frames));
  set('height', R() < 0.6 ? 'average' : k(o.heights));
  set('face', k(o.faces));
  set('eyeShape', k(o.eyeShapes));
  set('brows', k(o.brows));
  set('nose', k(o.noses));
  set('eyes', r(o.eyes));
  set('mood', k(o.moods));
  if (o.marks) set('mark', R() < 0.65 ? 'none' : r(Object.keys(o.marks).filter((x) => x !== 'mask')));
  set('hair', r(o.hairColors));
  set('hairStyle', k(o.hairStyles));
  if (o.beards) set('beard', look.body === 'feminine' || keep.body === 'feminine' ? 'none' : R() < 0.45 ? k(o.beards) : 'none');
  // Clothes: mostly the class's own kit, re-dyed, sometimes something else.
  if (o.outfits) set('outfit', R() < 0.6 ? kit.outfit : k(o.outfits));
  set('armour', R() < 0.7 ? kit.armour : k(o.armours));
  set('cloak', R() < 0.5 ? kit.cloak : k(o.cloaks));
  set('hat', R() < 0.45 ? 'none' : R() < 0.6 ? kit.hat[0] : k(o.hats));
  set('garb', r(o.garbs));
  set('trim', r(o.trims.filter((c) => c !== look.garb)));
  set('cloakColor', r(o.cloakColors));
  set('leather', k(o.leathers));
  set('metal', k(o.metals));
  set('robotHead', k(o.robotHeads));
  set('finish', k(o.finishes));
  return look;
}

export { TWO_HANDED };
