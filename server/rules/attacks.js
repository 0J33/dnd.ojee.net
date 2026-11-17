const srd = require('../srd/store');

// A hero's attacks and damaging spells, worked out here from the sheet the
// server holds (abilities, level, equipped weapons, spells known), so the
// numbers that decide a hit are never the ones a client typed. Mirrors
// deriveSheet() in client/src/rules/engine.js and spellDice() in
// client/src/components/CharacterSheet.jsx; keep them in step.

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const mod = (score) => Math.floor((clamp(score || 10, 1, 30) - 10) / 2);
const pbFor = (level) => Math.min(6, 2 + Math.floor((clamp(level || 1, 1, 20) - 1) / 4));

const CLASS_CASTING = { bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int' };
const SUBCLASS_CASTING = { 'open5e-eldritch-trickster': 'int', 'open5e-arcane-warrior': 'int', 'toh-soulspy': 'wis', 'toh-underfoot': 'wis', 'toh-smuggler': 'int' };
// Spells that never miss: no attack roll, no save.
const AUTO_HIT = new Set(['magic-missile']);
const EXTRA_ATTACK = { fighter: [[20, 4], [11, 3], [5, 2]], barbarian: [[5, 2]], paladin: [[5, 2]], ranger: [[5, 2]], monk: [[5, 2]] };

const weaponsByName = new Map();
for (const e of srd.byIndex.equipment.values()) if (e.equipment_category?.index === 'weapon') weaponsByName.set(e.name.toLowerCase(), e);

// "1d8", "2d6+1": a sane damage formula, capped so a hand-edited sheet can't
// carry a siege engine. Anything else falls back to 1d4.
function cleanDice(f, { dice = 2, sides = 12, flat = 0 } = {}) {
  const m = /^(\d{1,2})d(\d{1,3})([+-]\d{1,2})?$/.exec(String(f || '').replace(/\s+/g, ''));
  if (!m) return '1d4';
  const n = clamp(m[1], 1, dice), d = clamp(m[2], 2, sides), k = m[3] ? clamp(m[3], -flat, flat) : 0;
  return `${n}d${d}${k ? (k > 0 ? `+${k}` : k) : ''}`;
}

function parseRange(r) {
  if (!r) return null;
  if (typeof r === 'object') return { normal: clamp(r.normal, 5, 600), long: clamp(r.long ?? r.normal, 5, 600) };
  const [a, b] = String(r).split('/').map((x) => parseInt(x, 10));
  if (!a) return null;
  return { normal: clamp(a, 5, 600), long: clamp(b || a, 5, 600) };
}

const withMod = (dice, k) => (k ? `${dice}${k > 0 ? `+${k}` : k}` : dice);

/** Weapon (and unarmed, natural, custom) attacks for a sheet. */
function weaponAttacks(sheet) {
  const mods = {};
  for (const a of ABILITIES) mods[a] = mod(sheet.abilities?.[a]);
  const pb = pbFor(sheet.level);
  const out = [];
  for (const item of Array.isArray(sheet.equipment) ? sheet.equipment : []) {
    if (!item || item.kind !== 'weapon' || item.equipped === false) continue;
    const ref = weaponsByName.get(String(item.name || '').toLowerCase());
    const stats = item.stats || {};
    // What the sheet says (what its owner sees in the menu), else the SRD weapon.
    const props = Array.isArray(stats.properties) ? stats.properties.map(String) : (ref?.properties || []).map((p) => p.index);
    const srdRange = ref && (ref.weapon_range === 'Ranged' || props.includes('thrown')) ? parseRange(ref.throw_range || ref.range) : null;
    const range = stats.range ? parseRange(stats.range) : srdRange;
    const isRanged = !!range && !props.includes('thrown');
    let ability = isRanged ? 'dex' : 'str';
    if (!isRanged && props.includes('finesse')) ability = mods.dex > mods.str ? 'dex' : 'str';
    const dice = stats.damage ? cleanDice(stats.damage) : ref?.damage?.damage_dice || '1d4';
    const magic = clamp(stats.bonus || 0, 0, 3); // a +1 / +2 / +3 weapon: to hit and to damage
    out.push({
      name: String(item.name || 'Weapon').slice(0, 60), ability, bonus: mods[ability] + pb + magic,
      damage: withMod(dice, mods[ability] + magic), damageType: String(stats.damageType || ref?.damage?.damage_type?.index || 'bludgeoning').slice(0, 20),
      range, reach: props.includes('reach') ? 2 : 1, thrown: props.includes('thrown'),
    });
  }
  if (sheet.classIndex === 'monk') {
    const m = Math.max(mods.dex, mods.str);
    out.push({ name: 'Unarmed strike', ability: 'dex', bonus: m + pb, damage: withMod('1d4', m), damageType: 'bludgeoning', range: null, reach: 1 });
  }
  for (const n of Array.isArray(sheet.naturalAttacks) ? sheet.naturalAttacks : []) {
    out.push({ name: String(n.name || 'Claws').slice(0, 60), ability: 'str', bonus: mods.str + pb, damage: withMod(cleanDice(n.damage, { dice: 1 }), mods.str), damageType: String(n.damageType || 'slashing').slice(0, 20), range: null, reach: 1 });
  }
  // The sheet's own lines (a +1 sword): kept within what a magic weapon can do.
  const best = Math.max(mods.str, mods.dex);
  for (const c of Array.isArray(sheet.attacksCustom) ? sheet.attacksCustom : []) {
    if (!c || !c.name) continue;
    out.push({
      name: String(c.name).slice(0, 60), ability: 'str', bonus: clamp(c.bonus, -5, best + pb + 3),
      damage: cleanDice(`${c.damage || '1d4'}${c.damageMod ? (c.damageMod > 0 ? `+${c.damageMod}` : c.damageMod) : ''}`, { dice: 4, flat: best + 3 }),
      damageType: String(c.damageType || 'slashing').slice(0, 20), range: parseRange(c.range), reach: 1,
    });
  }
  return out;
}

function castingAbility(sheet) {
  if (!sheet.spellcasting) return null;
  const a = CLASS_CASTING[sheet.classIndex] || SUBCLASS_CASTING[sheet.subclass] || sheet.spellcasting.ability;
  return ABILITIES.includes(a) ? a : null;
}

function spellDice(spell, slotLvl, charLevel) {
  const pick = (table, lvl) => {
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    let best = null;
    for (const k of keys) if (k <= lvl) best = k;
    return best;
  };
  const dmg = spell.damage;
  if (dmg?.damage_at_slot_level) {
    const k = pick(dmg.damage_at_slot_level, slotLvl);
    if (k !== null) return dmg.damage_at_slot_level[k].replace(/\s/g, '');
  }
  if (dmg?.damage_at_character_level) {
    const table = dmg.damage_at_character_level;
    const k = pick(table, charLevel) ?? Object.keys(table).map(Number).sort((a, b) => a - b)[0];
    return table[k].replace(/\s/g, '');
  }
  return null;
}

/** A damaging spell the sheet can cast at a creature, or an error. */
function spellAttack(sheet, spellIndex, slot) {
  const ability = castingAbility(sheet);
  if (!ability) return { error: 'This hero casts no spells' };
  const sc = sheet.spellcasting;
  const knows = [...(sc.cantrips || []), ...(sc.prepared || []), ...(sc.known || [])].includes(spellIndex);
  if (!knows) return { error: 'That spell isn\'t ready' };
  const sp = srd.byIndex.spells.get(spellIndex);
  // Sleep's "5d8" is a pool of hit points it puts to sleep, not damage: only
  // spells whose damage has a type hurt.
  if (!sp || !sp.damage?.damage_type) return { error: 'That spell does no damage to a creature' };
  const level = clamp(sheet.level, 1, 20);
  // A levelled spell needs a free slot on the sheet the server holds.
  const s = pickSlot(sheet, sp.level, slot);
  if (s.error) return s;
  const slotLvl = sp.level ? s.level : 1;
  const dice = spellDice(sp, Math.max(1, slotLvl), level);
  if (!dice) return { error: 'That spell does no damage to a creature' };
  const pb = pbFor(level), m = mod(sheet.abilities?.[ability]);
  const rangeFt = /self/i.test(sp.range || '') ? 5 : parseInt(sp.range, 10) || (/touch/i.test(sp.range || '') ? 5 : 60);
  const save = sp.dc?.dc_type?.index;
  const damageType = sp.damage?.damage_type?.index || 'force';
  return {
    name: sp.name, style: 'spell', spell: true, level: sp.level, rangeFt, damage: dice, damageType, slotKey: s.key, slotLevel: s.level,
    bonusAction: isBonus(sp.casting_time),
    ...(save ? { bonus: null, save: { ability: save, dc: 8 + pb + m, half: sp.dc?.dc_success === 'half' } } : { bonus: pb + m }),
    ...(AUTO_HIT.has(sp.index) ? { autoHit: true } : {}),
  };
}

/** How many weapon attacks one Attack action makes at this level. */
function attacksPerAction(sheet) {
  const lv = clamp(sheet.level, 1, 20);
  for (const [at, n] of EXTRA_ATTACK[sheet.classIndex] || []) if (lv >= at) return n;
  return 1;
}

/**
 * The attack a hero makes, from what the client asked for: `ref` is
 * 'w:<weapon name>' or 's:<spell index>' (older clients send only a name).
 * Returns a resolveAttack() input plus range facts, or { error }.
 */
function heroAttack(sheet, want = {}) {
  const ref = String(want.ref || '');
  const name = String(want.name || '').toLowerCase();
  if (ref.startsWith('s:') || (!ref && want.style === 'spell')) {
    let index = ref.slice(2);
    if (!index) {
      const sc = sheet.spellcasting || {};
      index = [...(sc.cantrips || []), ...(sc.prepared || []), ...(sc.known || [])].find((i) => srd.byIndex.spells.get(i)?.name.toLowerCase() === name) || '';
    }
    return spellAttack(sheet, index, want.slot);
  }
  const all = weaponAttacks(sheet);
  const pickName = ref.startsWith('w:') ? ref.slice(2).toLowerCase() : name;
  const w = all.find((a) => a.name.toLowerCase() === pickName);
  if (!w) return { error: 'That weapon isn\'t in hand' };
  const style = w.range && !w.thrown ? 'ranged' : 'melee';
  // Raging: melee attacks with Strength hit harder.
  const rage = sheet.raging && style === 'melee' && w.ability === 'str' ? classRow(sheet).rage_damage_bonus || 2 : 0;
  return { name: w.name, style, bonus: w.bonus, damage: rage ? `${w.damage}+${rage}` : w.damage, damageType: w.damageType, range: w.range, reach: w.reach, thrown: !!w.thrown, ...(rage ? { rage } : {}) };
}

/* ---------------- spell slots ---------------- */

// The slots of each level this hero has, from the class table in the SRD
// (warlocks: their pact slots). Heroes who cast through a subclass (Eldritch
// Knight, Arcane Trickster...) use the third-caster table.
const THIRD_SLOTS = {
  3: [2], 4: [3], 5: [3], 6: [3], 7: [4, 2], 8: [4, 2], 9: [4, 2], 10: [4, 3], 11: [4, 3], 12: [4, 3],
  13: [4, 3, 2], 14: [4, 3, 2], 15: [4, 3, 2], 16: [4, 3, 3], 17: [4, 3, 3], 18: [4, 3, 3], 19: [4, 3, 3, 1], 20: [4, 3, 3, 1],
};
function maxSlots(sheet) {
  const level = clamp(sheet.level, 1, 20);
  const row = srd.byIndex.levels.get(`${sheet.classIndex}-${level}`)?.spellcasting;
  const out = {};
  if (row) {
    const slots = {};
    for (let lv = 1; lv <= 9; lv++) if (row[`spell_slots_level_${lv}`]) slots[lv] = row[`spell_slots_level_${lv}`];
    if (sheet.classIndex === 'warlock') {
      const lv = Math.max(0, ...Object.keys(slots).map(Number));
      return lv ? { pact: { level: lv, slots: slots[lv] } } : {};
    }
    return slots;
  }
  if (sheet.spellcasting) (THIRD_SLOTS[level] || []).forEach((n, i) => { out[i + 1] = n; });
  return out;
}

/**
 * The slot a levelled spell would use: { key, level } or { error }. `want` is
 * the slot level asked for (upcasting); pact magic always casts at its level.
 */
function pickSlot(sheet, spellLevel, want) {
  if (!spellLevel) return { key: null, level: 0 };
  if (sheet.derived?.spell?.innate) return { key: null, level: spellLevel };
  const max = maxSlots(sheet), used = sheet.spellcasting?.slotsUsed || {};
  if (max.pact) {
    if (max.pact.level < spellLevel) return { error: `Your pact slots are level ${max.pact.level}` };
    if ((used.pact || 0) >= max.pact.slots) return { error: 'No pact slots left - take a short or long rest' };
    return { key: 'pact', level: max.pact.level };
  }
  const lv = clamp(want || spellLevel, spellLevel, 9);
  if ((used[lv] || 0) < (max[lv] || 0)) return { key: String(lv), level: lv };
  return { error: lv === spellLevel ? `No level ${lv} slots left - take a long rest` : `No level ${lv} slots left` };
}

function spendSlot(sheet, key) {
  if (!key || !sheet.spellcasting) return;
  const used = { ...(sheet.spellcasting.slotsUsed || {}) };
  used[key] = (used[key] || 0) + 1;
  sheet.spellcasting = { ...sheet.spellcasting, slotsUsed: used };
}

/* ---------------- healing spells and class features ---------------- */

// Single-target healing spells the board can cast at a friend.
const HEALS = new Set(['cure-wounds', 'healing-word', 'heal']);

function knowsSpell(sheet, index) {
  const sc = sheet.spellcasting || {};
  return [...(sc.cantrips || []), ...(sc.prepared || []), ...(sc.known || [])].includes(index);
}

const rangeOf = (sp) => (/self|touch/i.test(sp.range || '') ? 5 : parseInt(sp.range, 10) || 60);
const isBonus = (castingTime) => /bonus action/i.test(String(castingTime || ''));

/** A healing spell cast at a creature: dice, range, slot, or { error }. */
function healingSpell(sheet, index, slot) {
  const ability = castingAbility(sheet);
  if (!ability) return { error: 'This hero casts no spells' };
  if (!HEALS.has(index) || !knowsSpell(sheet, index)) return { error: 'That spell isn\'t ready' };
  const sp = srd.byIndex.spells.get(index);
  const s = pickSlot(sheet, sp.level, slot);
  if (s.error) return s;
  const table = sp.heal_at_slot_level || {};
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const at = keys.filter((k) => k <= Math.max(sp.level, s.level)).pop() ?? keys[0];
  const m = mod(sheet.abilities?.[ability]);
  // Life Domain (Disciple of Life): +2 + the slot's level on every healing spell
  const k = m + (sheet.subclass === 'life' && sp.level ? 2 + Math.max(sp.level, s.level) : 0);
  const dice = String(table[at] || '1d4').replace(/\s+/g, '').replace(/\+MOD/i, k ? (k > 0 ? `+${k}` : `${k}`) : '');
  return {
    kind: 'heal', name: sp.name, spell: true, index, rangeFt: rangeOf(sp), dice,
    bonusAction: isBonus(sp.casting_time), slotKey: s.key, slotLevel: s.level, friendly: true,
  };
}

const classRow = (sheet) => srd.byIndex.levels.get(`${sheet.classIndex}-${clamp(sheet.level, 1, 20)}`)?.class_specific || {};

// Class features the board plays: who has them, how often, and on whom.
// uses(sheet) is how many a rest gives back (Lay on Hands: a pool of HP).
const FEATURES = {
  rage: {
    name: 'Rage', cls: 'barbarian', bonusAction: true, self: true, rest: 'long',
    uses: (sh) => (classRow(sh).rage_count >= 9999 ? Infinity : classRow(sh).rage_count || 2),
  },
  'second-wind': {
    name: 'Second Wind', cls: 'fighter', bonusAction: true, self: true, rest: 'short',
    uses: () => 1,
  },
  'lay-on-hands': {
    name: 'Lay on Hands', cls: 'paladin', bonusAction: false, rangeFt: 5, friendly: true, rest: 'long', pool: true,
    uses: (sh) => 5 * clamp(sh.level, 1, 20),
  },
  'bardic-inspiration': {
    name: 'Bardic Inspiration', cls: 'bard', bonusAction: true, rangeFt: 60, friendly: true, notSelf: true,
    rest: (sh) => (clamp(sh.level, 1, 20) >= 5 ? 'short' : 'long'),
    uses: (sh) => Math.max(1, mod(sh.abilities?.cha)),
  },
};

/** What's left of a feature: uses (or HP in a pool) and the most there are. */
function featureLeft(sheet, key) {
  const f = FEATURES[key];
  const max = f.uses(sheet);
  return { max, left: max === Infinity ? Infinity : Math.max(0, max - clamp(sheet.uses?.[key] || 0, 0, 1000)) };
}

/** A class feature this hero can use now, or { error }. */
function heroFeature(sheet, key) {
  const f = FEATURES[key];
  if (!f || sheet.classIndex !== f.cls) return { error: 'Your hero doesn\'t have that' };
  const { left, max } = featureLeft(sheet, key);
  if (left <= 0) {
    const rest = typeof f.rest === 'function' ? f.rest(sheet) : f.rest;
    return { error: `No ${f.name} left - it comes back on a ${rest} rest` };
  }
  if (key === 'rage' && sheet.raging) return { error: 'You are already raging' };
  const level = clamp(sheet.level, 1, 20);
  const row = classRow(sheet);
  return {
    kind: key, name: f.name, feature: key, bonusAction: f.bonusAction, self: !!f.self, friendly: !!f.friendly, notSelf: !!f.notSelf,
    rangeFt: f.rangeFt || 5, left, max,
    ...(key === 'second-wind' ? { dice: `1d10+${level}` } : {}),
    ...(key === 'rage' ? { rageBonus: row.rage_damage_bonus || 2 } : {}),
    ...(key === 'bardic-inspiration' ? { die: row.bardic_inspiration_die || 6 } : {}),
  };
}

module.exports = { heroAttack, weaponAttacks, attacksPerAction, spellDice, maxSlots, pickSlot, spendSlot, healingSpell, heroFeature, featureLeft, FEATURES, HEALS };
