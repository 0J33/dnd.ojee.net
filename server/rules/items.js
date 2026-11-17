// Items a DM makes on the spot, gives, hides in a chest or sells in a shop.
// One shape everywhere (a hero's sheet.equipment, a chest's loot, a shop):
//   { name, qty, kind, equipped, desc, value, magic, stats }
//   kind   weapon | armor | shield | potion | relic | gear
//   stats  weapon: damage, damageType, properties[], range, bonus (+1..+3)
//          armor:  acBase, category, maxDex, bonus
//          shield: bonus
//          potion: heal (dice) — drinking it heals; otherwise its desc is read out
//          relic:  ac, saves (+ to every save), worn with `equipped`
// Whatever arrives from a client is cut back to this, within what a magic
// item can do.

const KINDS = ['weapon', 'armor', 'shield', 'potion', 'relic', 'gear'];
const DICE = /^([1-9]|1\d|20)d(4|6|8|10|12|20|100)([+-]\d{1,2})?$/i; // up to 20 dice of a real die
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const str = (v, n) => String(v ?? '').slice(0, n);
const dice = (v, dflt) => (DICE.test(String(v || '').replace(/\s/g, '')) ? String(v).replace(/\s/g, '') : dflt);

function cleanItem(it = {}) {
  const kind = KINDS.includes(it.kind) ? it.kind : 'gear';
  const s = it.stats || {};
  const out = {
    name: str(it.name || 'Item', 60).trim() || 'Item',
    qty: clampInt(it.qty ?? 1, 1, 99),
    kind,
    desc: str(it.desc, 800),
    value: clampInt(it.value, 0, 1000000),
    magic: !!it.magic,
  };
  if (kind === 'weapon') {
    out.stats = {
      damage: dice(s.damage, '1d6'),
      damageType: str(s.damageType || 'slashing', 20),
      properties: (Array.isArray(s.properties) ? s.properties : []).slice(0, 8).map((p) => str(p, 24)),
      range: s.range ? str(s.range, 12) : null,
      bonus: clampInt(s.bonus, 0, 3),
    };
    out.equipped = it.equipped !== false;
  } else if (kind === 'armor') {
    out.stats = {
      acBase: clampInt(s.acBase || 11, 10, 18),
      category: ['light', 'medium', 'heavy'].includes(s.category) ? s.category : 'light',
      maxDex: s.maxDex == null ? null : clampInt(s.maxDex, 0, 5),
      bonus: clampInt(s.bonus, 0, 3),
    };
    out.equipped = !!it.equipped;
  } else if (kind === 'shield') {
    out.stats = { bonus: clampInt(s.bonus, 0, 3) };
    out.equipped = !!it.equipped;
  } else if (kind === 'potion') {
    out.stats = s.heal ? { heal: dice(s.heal, '2d4+2') } : {};
  } else if (kind === 'relic') {
    out.stats = { ac: clampInt(s.ac, 0, 3), saves: clampInt(s.saves, 0, 3) };
    out.equipped = it.equipped !== false;
  }
  return out;
}

/** Put items into a sheet's gear: the same plain potion or gear stacks. */
function addToSheet(sheet, items) {
  const equipment = Array.isArray(sheet.equipment) ? [...sheet.equipment] : [];
  for (const raw of items) {
    const it = cleanItem(raw);
    const same = (it.kind === 'potion' || it.kind === 'gear') && equipment.find((e) => e && e.kind === it.kind && e.name === it.name && JSON.stringify(e.stats || {}) === JSON.stringify(it.stats || {}));
    if (same) same.qty = clampInt((same.qty || 1) + it.qty, 1, 99);
    else {
      // only one suit of armor or shield worn at a time
      if (it.equipped && (it.kind === 'armor' || it.kind === 'shield') && equipment.some((e) => e?.kind === it.kind && e.equipped)) it.equipped = false;
      equipment.push(it);
    }
  }
  sheet.equipment = equipment.slice(0, 200);
  return sheet;
}

const COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const purseCp = (coins = {}) => Object.entries(COIN_CP).reduce((n, [c, v]) => n + (Math.max(0, Number(coins[c]) || 0) * v), 0);
/** Pay `gp` from a purse, making change. Null when it can't be afforded. */
function pay(coins = {}, gp) {
  const left = purseCp(coins) - Math.round(gp * 100);
  if (left < 0) return null;
  // keep the platinum that isn't needed, give the rest back as gold, silver, copper
  const pp = Math.min(Math.max(0, Number(coins.pp) || 0), Math.floor(left / 1000));
  let rem = left - pp * 1000;
  const g = Math.floor(rem / 100); rem -= g * 100;
  const sp = Math.floor(rem / 10); rem -= sp * 10;
  return { cp: rem, sp, ep: 0, gp: g, pp };
}

function cleanShop(shop) {
  if (!shop || !Array.isArray(shop.items)) return null;
  return {
    open: shop.open !== false,
    items: shop.items.slice(0, 40).map((s) => ({ item: cleanItem(s.item), price: clampInt(s.price, 0, 100000), stock: s.stock == null || s.stock === '' ? null : clampInt(s.stock, 0, 99) })),
  };
}

module.exports = { cleanItem, addToSheet, pay, purseCp, cleanShop, KINDS };
