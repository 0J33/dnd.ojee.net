const srd = require('../srd/store');
const { executeRoll } = require('./dice');

// Things the 3D world asks of the server: a hero's attack resolved fairly
// (to-hit vs AC or a saving throw, damage, crits), what heroes can see (fog
// fills in by itself from line of sight), and doors that open.

const SIGHT = 8; // squares of vision for automatic fog
// Tiles that stop sight: walls, closed doors, dense hedges.
const OPAQUE = new Set(['#', '%', 'w', 'v', 'h', '_', 'D', 'L', 'S']);

const charAt = (scene, x, y) => {
  if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) return '#';
  return (scene.cells?.[y] || '')[x] || '.';
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

function applyDamage(room, token, amount) {
  if (token.kind === 'pc' && token.characterId) {
    const sheet = room.charSheets[token.characterId];
    if (!sheet) return null;
    let rem = amount;
    if (sheet.tempHp > 0) { const a = Math.min(sheet.tempHp, rem); sheet.tempHp -= a; rem -= a; }
    sheet.currentHp = Math.max(0, (sheet.currentHp ?? 0) - rem);
    return { hp: sheet.currentHp, max: sheet.maxHp, down: sheet.currentHp === 0 };
  }
  if (token.hp == null) return null;
  token.hp = Math.max(0, token.hp - amount);
  if (token.hp === 0) token.dead = true;
  return { hp: token.hp, max: token.maxHp, down: token.dead };
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
    text = `${attacker.label} casts ${name} on ${target.label}: ${ability.toUpperCase()} save ${save.total} vs DC ${dc} - ${saved ? (dealt ? `half damage, ${dealt}` : 'saved!') : `failed, ${dealt} ${damageType} damage`}.`;
  } else {
    const bonus = Math.max(-5, Math.min(30, parseInt(a.bonus, 10) || 0));
    const mode = ['advantage', 'disadvantage'].includes(a.mode) ? a.mode : 'normal';
    const roll = executeRoll(`1d20${bonus >= 0 ? `+${bonus}` : bonus}`, mode);
    const ac = targetAc(room, target);
    const crit = roll.natural === 20;
    const hit = crit || (roll.natural !== 1 && roll.total >= ac);
    Object.assign(ev, { roll, ac, hit, crit });
    if (hit) {
      const dmg = executeRoll(crit ? critFormula(formula) : formula, 'normal');
      dealt = Math.max(1, dmg.total);
      ev.damageRoll = dmg;
    }
    ev.damage = dealt;
    text = hit
      ? `${attacker.label} ${crit ? 'CRITS' : 'hits'} ${target.label} with ${name} (${roll.total} vs AC ${ac}): ${dealt} ${damageType} damage.`
      : `${attacker.label} attacks ${target.label} with ${name}: ${roll.total} vs AC ${ac} - miss.`;
  }
  if (dealt > 0) {
    const after = applyDamage(room, target, dealt);
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
  const ch = charAt(scene, x, y);
  const to = DOOR_TOGGLE[ch];
  if (!to) return null;
  const row = scene.cells[y];
  scene.cells[y] = row.slice(0, x) + to + row.slice(x + 1);
  return to;
}

module.exports = { visibleFrom, revealForHeroes, resolveAttack, toggleDoor, targetAc, saveBonus, applyDamage };
