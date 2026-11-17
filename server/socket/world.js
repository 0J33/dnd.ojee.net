const srd = require('../srd/store');
const { executeRoll } = require('./dice');
const { walkRows } = require('./layers');

// Things the 3D world asks of the server: a hero's attack resolved fairly
// (to-hit vs AC or a saving throw, damage, crits), what heroes can see (fog
// fills in by itself from line of sight), and doors that open.

const SIGHT = 8; // squares of vision for automatic fog
// Tiles that stop sight: walls, closed doors, dense hedges.
const OPAQUE = new Set(['#', '%', 'w', 'v', 'h', '_', 'D', 'L', 'S']);

const charAt = (scene, x, y) => {
  if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) return '#';
  return (walkRows(scene)[y] || '')[x] || '.'; // the top level everyone sees, else the base
};

// Cells a creature at (x, y) can see: every cell in range whose straight
// line from the viewer isn't blocked before it. The blocking cell itself is
// seen (you see the wall, not what's behind it).
function visibleFrom(scene, x0, y0, range = SIGHT) {
  const seen = new Set();
  for (let y = y0 - range; y <= y0 + range; y++) {
    for (let x = x0 - range; x <= x0 + range; x++) {
      if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) continue;
      if ((x - x0) ** 2 + (y - y0) ** 2 > range * range + range) continue;
      if (lineClear(scene, x0, y0, x, y)) seen.add(`${x},${y}`);
    }
  }
  return seen;
}

function lineClear(scene, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    if ((x !== x0 || y !== y0) && OPAQUE.has(charAt(scene, x, y))) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return true;
}

/** Reveal what the heroes on a fogged scene can see. Returns true if anything changed. */
function revealForHeroes(room, scene) {
  if (!scene || !scene.fogEnabled) return false;
  const set = new Set(scene.revealed || []);
  const before = set.size;
  for (const t of scene.tokens || []) {
    if (t.kind !== 'pc' || t.dead) continue;
    for (const c of visibleFrom(scene, t.x, t.y)) set.add(c);
  }
  if (set.size === before) return false;
  scene.revealed = [...set];
  return true;
}

/* ---------------- movement ---------------- */

// What a step costs, as the client's reach() in client/src/world/WorldView.js
// works it out (keep the two in step): 8-way, each square 5 ft, difficult
// ground double, no cutting a wall corner; creatures can be passed through.
const WALK_BLOCKED = new Set('346A#%[_~FhlLoOPqQTUvwWx'.split(''));
const DIFFICULT = new Set('7(imrY'.split(''));
const blockedAt = (scene, x, y) => x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h || WALK_BLOCKED.has((walkRows(scene)[y] || '')[x]);

/** The cheapest walk from `from` to `to` in squares, or null if it is more than `budget`. */
function moveCost(scene, from, to, budget) {
  if (from.x === to.x && from.y === to.y) return 0;
  if (blockedAt(scene, to.x, to.y)) return null;
  const W = scene.grid.w;
  const best = new Map([[from.y * W + from.x, 0]]);
  const buckets = [[from.y * W + from.x]];
  for (let c = 0; c <= budget; c++) {
    for (const k of buckets[c] || []) {
      if (best.get(k) !== c) continue;
      const x = k % W, y = (k - x) / W;
      if (x === to.x && y === to.y) return c;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (blockedAt(scene, nx, ny)) continue;
        if (dx && dy && (blockedAt(scene, x + dx, y) || blockedAt(scene, x, y + dy))) continue;
        const nc = c + (DIFFICULT.has((walkRows(scene)[ny] || '')[nx]) ? 2 : 1);
        const nk = ny * W + nx;
        if (nc > budget || (best.has(nk) && best.get(nk) <= nc)) continue;
        best.set(nk, nc);
        (buckets[nc] ||= []).push(nk);
      }
    }
  }
  return null;
}

/* ---------------- attacks ---------------- */

const abilityMod = (score) => Math.floor(((score || 10) - 10) / 2);

function targetAc(room, token) {
  if (token.kind === 'pc' && token.characterId) {
    const sheet = room.charSheets[token.characterId];
    return sheet?.derived?.ac ?? 10;
  }
  if (token.ac != null) return token.ac;
  const m = token.monsterIndex && srd.byIndex.monsters.get(token.monsterIndex);
  const ac = m && (Array.isArray(m.armor_class) ? m.armor_class[0]?.value : m.armor_class);
  return ac || 10;
}

function saveBonus(room, token, ability) {
  if (token.kind === 'pc' && token.characterId) {
    const d = room.charSheets[token.characterId]?.derived;
    return d?.saves?.[ability] ?? d?.mods?.[ability] ?? 0;
  }
  const m = token.monsterIndex && srd.byIndex.monsters.get(token.monsterIndex);
  if (!m) return 0;
  const names = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
  const prof = (m.proficiencies || []).find((p) => p.proficiency?.index === `saving-throw-${ability}`);
  return prof ? prof.value : abilityMod(m[names[ability]]);
}

// Double the dice of a damage formula for a critical hit: "1d8+3" → "2d8+3".
function critFormula(f) {
  return String(f).replace(/(\d*)d(\d+)/g, (_, n, d) => `${(parseInt(n || '1', 10) || 1) * 2}d${d}`);
}

// A raging barbarian shrugs off half of any blow, stab or cut.
const RAGE_RESISTS = new Set(['bludgeoning', 'piercing', 'slashing']);
const resisted = (sheet, amount, damageType) => (sheet?.raging && RAGE_RESISTS.has(String(damageType || '').toLowerCase()) ? Math.floor(amount / 2) : amount);

function applyDamage(room, token, amount, damageType = null) {
  if (token.kind === 'pc' && token.characterId) {
    const sheet = room.charSheets[token.characterId];
    if (!sheet) return null;
    let rem = resisted(sheet, amount, damageType);
    if (sheet.tempHp > 0) { const a = Math.min(sheet.tempHp, rem); sheet.tempHp -= a; rem -= a; }
    sheet.currentHp = Math.max(0, (sheet.currentHp ?? 0) - rem);
    return { hp: sheet.currentHp, max: sheet.maxHp, down: sheet.currentHp === 0 };
  }
  if (token.hp == null) return null;
  token.hp = Math.max(0, token.hp - amount);
  if (token.hp === 0) token.dead = true;
  return { hp: token.hp, max: token.maxHp, down: token.dead };
}

/** Hit points back, never past the maximum; a hero at 0 is back on their feet. */
function applyHealing(room, token, amount) {
  if (token.kind === 'pc' && token.characterId) {
    const sheet = room.charSheets[token.characterId];
    if (!sheet) return null;
    const before = sheet.currentHp ?? 0;
    sheet.currentHp = Math.min(sheet.maxHp ?? before + amount, before + amount);
    if (sheet.currentHp > 0) { sheet.deathSaves = { s: 0, f: 0 }; token.dead = false; }
    return { hp: sheet.currentHp, max: sheet.maxHp, healed: sheet.currentHp - before };
  }
  if (token.hp == null) return null;
  const before = token.hp;
  token.hp = Math.min(token.maxHp ?? before + amount, before + amount);
  if (token.hp > 0) token.dead = false;
  return { hp: token.hp, max: token.maxHp, healed: token.hp - before };
}

/**
 * Resolve an attack or damaging spell.
 * a: { name, style ('melee'|'ranged'|'spell'), bonus (to-hit, or null for a
 *      save), save: { ability, dc, half }, damage, damageType, mode }
 */
function resolveAttack(room, attacker, target, a) {
  const style = ['melee', 'ranged', 'spell'].includes(a.style) ? a.style : 'melee';
  const name = String(a.name || 'Attack').slice(0, 60);
  const damageType = String(a.damageType || '').slice(0, 20).toLowerCase();
  const formula = /^[0-9d+\- ]{1,40}$/i.test(String(a.damage || '')) ? String(a.damage).replace(/\s+/g, '') : '1d4';
  const ev = { kind: 'attack', attackerTokenId: attacker.id, targetTokenId: target.id, name, style, damageType };
  let dealt = 0;
  let text;
  if (a.save && a.save.ability) {
    const ability = String(a.save.ability).slice(0, 3).toLowerCase();
    const dc = Math.max(1, Math.min(30, parseInt(a.save.dc, 10) || 10));
    const save = executeRoll(`1d20${(b => (b >= 0 ? `+${b}` : `${b}`))(saveBonus(room, target, ability))}`, 'normal');
    const saved = save.total >= dc;
    const dmg = executeRoll(formula, 'normal');
    dealt = saved ? (a.save.half ? Math.floor(dmg.total / 2) : 0) : dmg.total;
    Object.assign(ev, { save: { ability, dc, total: save.total, natural: save.natural, saved }, hit: dealt > 0, damage: dealt, damageRoll: dmg });
    text = `${attacker.label} casts ${name} on ${target.label}: ${ability.toUpperCase()} save ${save.total} vs DC ${dc} - ${saved ? (dealt ? `half damage, ${dealt}` : 'saved') : `failed, ${dealt} ${damageType} damage`}.`;
  } else if (a.autoHit) {
    // magic missile: the darts always strike
    const dmg = executeRoll(formula, 'normal');
    dealt = Math.max(1, dmg.total);
    Object.assign(ev, { hit: true, damage: dealt, damageRoll: dmg });
    text = `${attacker.label} casts ${name} at ${target.label}: it never misses, ${dealt} ${damageType} damage.`;
  } else {
    const bonus = Math.max(-5, Math.min(30, parseInt(a.bonus, 10) || 0));
    const mode = ['advantage', 'disadvantage'].includes(a.mode) ? a.mode : 'normal';
    const roll = executeRoll(`1d20${bonus >= 0 ? `+${bonus}` : bonus}`, mode);
    const ac = targetAc(room, target);
    const crit = roll.natural === 20;
    let hit = crit || (roll.natural !== 1 && roll.total >= ac);
    // A Bardic Inspiration die goes on the first attack it would turn into a hit.
    const mySheet = attacker.kind === 'pc' && attacker.characterId ? room.charSheets[attacker.characterId] : null;
    let inspired = '';
    if (!hit && roll.natural !== 1 && mySheet?.bardicDie && roll.total + mySheet.bardicDie >= ac) {
      const die = executeRoll(`1d${mySheet.bardicDie}`, 'normal');
      inspired = ` (${roll.total} +${die.total} inspiration)`;
      ev.inspiration = die.total;
      roll.total += die.total;
      mySheet.bardicDie = null;
      hit = roll.total >= ac;
    }
    Object.assign(ev, { roll, ac, hit, crit });
    if (hit) {
      const dmg = executeRoll(crit ? critFormula(formula) : formula, 'normal');
      dealt = Math.max(1, dmg.total);
      ev.damageRoll = dmg;
    }
    ev.damage = dealt;
    text = hit
      ? `${attacker.label} ${crit ? 'CRITS' : 'hits'} ${target.label} with ${name} (${roll.total}${inspired} vs AC ${ac}): ${dealt} ${damageType} damage.`
      : `${attacker.label} attacks ${target.label} with ${name}: ${roll.total}${inspired} vs AC ${ac} - miss.`;
  }
  if (dealt > 0) {
    const after = applyDamage(room, target, dealt, damageType);
    if (after) {
      Object.assign(ev, { targetHp: after.hp, targetMaxHp: after.max, down: after.down });
      if (after.down) text += target.kind === 'pc' ? ` ${target.label} falls unconscious!` : ` ${target.label} is defeated!`;
    }
  }
  return { ev, text };
}

/* ---------------- doors ---------------- */

const DOOR_TOGGLE = { D: 'd', d: 'D' };

function toggleDoor(scene, x, y) {
  const ch = (scene.cells[y] || '')[x]; // doors live on the base map
  const to = DOOR_TOGGLE[ch];
  if (!to) return null;
  const row = scene.cells[y];
  scene.cells[y] = row.slice(0, x) + to + row.slice(x + 1);
  return to;
}

module.exports = { moveCost, lineClear, visibleFrom, revealForHeroes, resolveAttack, toggleDoor, targetAc, saveBonus, applyDamage, applyHealing, resisted };
