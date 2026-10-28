const { v4: uuidv4 } = require('uuid');
const srd = require('../srd/store');
const { executeRoll } = require('./dice');
const { visibleFrom } = require('./world');

// The DM's toolkit on the map: things placed on a scene that do something.
//
// An object: { id, x, y, kind, name, text, hidden, trigger, dc, effects[],
//   once, used, targets[{x,y}], toScene, patrol? }
//   kind     trap | secret | chest | lever | note | exit | zone
//   hidden   players don't see it (or know it's there) until it's found or fires
//   trigger  step (walk onto it) | touch (click it while next to it) | search
//            (found with Perception, then it's an ordinary visible object)
//   effects  [{ type: text | damage | loot | doors | goto | spawn | reveal | heal,
//              ... }]  run in order when it fires
//
// Players get objects with their secrets stripped (see publicObjects).

const KINDS = {
  trap: { name: 'Trap', hidden: true, trigger: 'step', dc: 12, effects: [{ type: 'damage', damage: '2d6', save: 'dex', saveDc: 12, text: 'Click! A trap springs.' }] },
  secret: { name: 'Hidden passage', hidden: true, trigger: 'search', dc: 13, effects: [{ type: 'text', text: 'You find a hidden way through.' }] },
  chest: { name: 'Chest', hidden: false, trigger: 'touch', dc: 0, effects: [{ type: 'loot', text: '25 gold pieces and a potion of healing.' }] },
  lever: { name: 'Lever', hidden: false, trigger: 'touch', dc: 0, once: false, effects: [{ type: 'doors' }] },
  note: { name: 'Note', hidden: false, trigger: 'touch', dc: 0, once: false, effects: [{ type: 'text', private: true, text: 'A scrawled note...' }] },
  exit: { name: 'Way on', hidden: false, trigger: 'step', dc: 0, once: false, effects: [{ type: 'goto' }] },
  zone: { name: 'Event', hidden: true, trigger: 'step', dc: 0, effects: [{ type: 'text', text: 'Something happens...' }] },
};

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const str = (v, n) => String(v ?? '').slice(0, n);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function cleanEffect(e = {}) {
  const type = ['text', 'damage', 'loot', 'doors', 'goto', 'spawn', 'reveal', 'heal'].includes(e.type) ? e.type : 'text';
  const out = { type, text: str(e.text, 1200) };
  if (type === 'text') out.private = !!e.private;
  if (type === 'damage') {
    out.damage = /^[0-9d+\- ]{1,20}$/i.test(String(e.damage || '')) ? String(e.damage).replace(/\s/g, '') : '1d6';
    out.save = ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(e.save) ? e.save : null;
    out.saveDc = clampInt(e.saveDc || 12, 1, 30);
    out.damageType = str(e.damageType || 'piercing', 20);
  }
  if (type === 'heal') out.amount = /^[0-9d+\- ]{1,20}$/i.test(String(e.amount || '')) ? String(e.amount).replace(/\s/g, '') : '2d4+2';
  if (type === 'goto') out.toScene = e.toScene ? str(e.toScene, 64) : null;
  if (type === 'spawn') out.monsters = (Array.isArray(e.monsters) ? e.monsters : []).slice(0, 8).map((m) => ({ index: str(m.index, 60), count: clampInt(m.count || 1, 1, 6) }));
  if (type === 'reveal') out.radius = clampInt(e.radius || 4, 1, 15);
  return out;
}

function cleanObject(o = {}, scene) {
  const kind = KINDS[o.kind] ? o.kind : 'zone';
  const d = KINDS[kind];
  return {
    id: o.id || uuidv4(),
    x: clampInt(o.x, 0, scene.grid.w - 1),
    y: clampInt(o.y, 0, scene.grid.h - 1),
    kind,
    name: str(o.name || d.name, 60),
    hidden: o.hidden === undefined ? d.hidden : !!o.hidden,
    trigger: ['step', 'touch', 'search', 'none'].includes(o.trigger) ? o.trigger : d.trigger,
    dc: clampInt(o.dc ?? d.dc, 0, 30),
    once: o.once === undefined ? d.once !== false : !!o.once,
    used: !!o.used,
    effects: (Array.isArray(o.effects) ? o.effects : d.effects).slice(0, 6).map(cleanEffect),
    targets: (Array.isArray(o.targets) ? o.targets : []).slice(0, 40).map((t) => ({ x: clampInt(t.x, 0, scene.grid.w - 1), y: clampInt(t.y, 0, scene.grid.h - 1) })),
    notes: str(o.notes, 600),
  };
}

/** What players may know about a scene's objects. */
function publicObjects(scene) {
  return (scene.objects || [])
    .filter((o) => !o.hidden)
    .map((o) => ({ id: o.id, x: o.x, y: o.y, kind: o.kind, name: o.name, used: o.used, trigger: o.trigger }));
}

/* ---------------- what happens ---------------- */

function heroesOn(room, scene) {
  return (scene.tokens || []).filter((t) => t.kind === 'pc' && !t.dead);
}

function freeNear(scene, x, y) {
  const BLOCK = new Set('346lx#%wvh_LF[TOAUPQWSqot21ERJ)BbC!cGKMN?}$'.split(''));
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const cx = x + dx, cy = y + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || cx < 0 || cy < 0 || cx >= scene.grid.w || cy >= scene.grid.h) continue;
    if (BLOCK.has((scene.cells?.[cy] || '')[cx])) continue;
    if (scene.tokens.some((t) => !t.dead && t.x === cx && t.y === cy)) continue;
    return { x: cx, y: cy };
  }
  return { x, y };
}

function monsterToken(scene, index, n, near) {
  const m = srd.byIndex.monsters.get(index);
  if (!m) return null;
  const at = freeNear(scene, near.x, near.y);
  const ac = Array.isArray(m.armor_class) ? m.armor_class[0]?.value : m.armor_class;
  return {
    id: uuidv4(), kind: 'monster', label: n > 1 ? `${m.name} ${n}` : m.name, letter: m.name[0], color: '#8a3d3d',
    x: at.x, y: at.y, size: 1, monsterIndex: index, monsterType: m.type || null, art: null, note: '',
    characterId: null, ownerId: null, hp: m.hit_points, maxHp: m.hit_points, ac: ac || 10, attack: null, speedCells: null,
    conditions: [], hidden: false, dead: false, xpValue: m.xp || null,
  };
}

/**
 * Fire an object. who = the hero token that set it off (or null for the DM).
 * api = { say(text, opts), privateTo(userId, payload), hp(ev), goto(sceneId),
 *         doors(scene), reveal(scene), saveBonus(token, ability), applyDamage(token, n) }
 * Returns true if anything happened.
 */
function fire(room, scene, obj, who, api) {
  if (obj.once && obj.used) return false;
  obj.used = true;
  obj.hidden = false; // once it fires, everyone knows it's there
  api.fired?.({ kind: obj.kind, x: obj.x, y: obj.y });
  const name = who ? who.label : 'Someone';
  for (const e of obj.effects) {
    if (e.type === 'text') {
      if (e.private && who?.ownerId) api.privateTo(who.ownerId, { title: obj.name, text: e.text });
      else if (e.text) api.say(e.text, { kind: 'narration' });
    } else if (e.type === 'loot') {
      api.say(`${name} finds: ${e.text || 'something'}`, { kind: 'reward' });
    } else if (e.type === 'damage') {
      const victims = who ? [who] : heroesOn(room, scene).filter((t) => cheb(t, obj) <= 1);
      if (e.text) api.say(e.text, { kind: 'narration' });
      for (const v of victims) {
        const dmg = executeRoll(e.damage, 'normal').total;
        let dealt = dmg, line = '';
        if (e.save) {
          const b = api.saveBonus(v, e.save);
          const roll = executeRoll(`1d20${b >= 0 ? '+' : ''}${b}`, 'normal');
          const ok = roll.total >= e.saveDc;
          dealt = ok ? Math.floor(dmg / 2) : dmg;
          line = ` (${e.save.toUpperCase()} save ${roll.total} vs DC ${e.saveDc}: ${ok ? 'half' : 'failed'})`;
        }
        const after = api.applyDamage(v, dealt);
        api.say(`${v.label} takes ${dealt} ${e.damageType} damage${line}.${after?.down ? ` ${v.label} falls!` : ''}`, { kind: 'combat' });
        api.hp({ tokenId: v.id, characterId: v.characterId, delta: -dealt, hp: after?.hp });
      }
    } else if (e.type === 'heal') {
      for (const v of who ? [who] : heroesOn(room, scene)) {
        const n = executeRoll(e.amount, 'normal').total;
        const after = api.heal(v, n);
        api.say(`${v.label} recovers ${n} HP.`, { kind: 'reward' });
        api.hp({ tokenId: v.id, characterId: v.characterId, delta: n, hp: after?.hp });
      }
    } else if (e.type === 'doors') {
      const OPEN = { D: 'd', d: 'D', S: 'd', L: 'd' };
      const rows = scene.cells.map((r) => r.split(''));
      for (const t of obj.targets) { const ch = rows[t.y]?.[t.x]; if (OPEN[ch]) rows[t.y][t.x] = OPEN[ch]; }
      scene.cells = rows.map((r) => r.join(''));
      api.doors(scene);
      api.say(e.text || `${name} works the ${obj.name.toLowerCase()}. Something grinds open.`, { kind: 'narration' });
    } else if (e.type === 'reveal') {
      const set = new Set(scene.revealed || []);
      for (const c of visibleFrom(scene, obj.x, obj.y, e.radius)) set.add(c);
      scene.revealed = [...set];
      if (e.text) api.say(e.text, { kind: 'narration' });
    } else if (e.type === 'spawn') {
      let n = 0;
      for (const m of e.monsters) for (let i = 1; i <= m.count; i++) {
        const t = monsterToken(scene, m.index, m.count > 1 ? i : 1, obj);
        if (t) { scene.tokens.push(t); n++; }
      }
      if (e.text) api.say(e.text, { kind: 'narration' });
      if (n) api.alarm(scene, obj);
    } else if (e.type === 'goto') {
      api.goto(e.toScene, e.text);
    }
  }
  return true;
}

/** Squares a hero passed through going from a to b (straight line, both ends). */
function passed(a, b) {
  const out = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y), sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 200; i++) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out.slice(1);
}

/** A hero moved: traps and zones underfoot, and hidden things noticed in passing. */
function onHeroMoved(room, scene, token, from, api) {
  let any = false;
  // Passive Perception notices hidden things within 2 squares.
  const pp = room.charSheets[token.characterId]?.derived?.passivePerception ?? 10;
  for (const o of scene.objects || []) {
    if (o.hidden && o.trigger === 'search' && cheb(o, token) <= 2 && pp >= o.dc) {
      o.hidden = false; any = true;
      api.fired?.({ kind: o.kind, x: o.x, y: o.y, found: true });
      api.say(`${token.label} notices something: ${o.name}.`, { kind: 'reward' });
    }
  }
  for (const sq of passed(from, token)) {
    for (const o of scene.objects || []) {
      if (o.trigger !== 'step' || o.x !== sq.x || o.y !== sq.y || (o.once && o.used)) continue;
      // A hidden trap can be spotted just before you step on it.
      if (o.kind === 'trap' && o.hidden && pp >= o.dc + 3) {
        o.hidden = false; any = true;
        api.say(`${token.label} spots a ${o.name.toLowerCase()} just in time!`, { kind: 'reward' });
        continue;
      }
      if (fire(room, scene, o, token, api)) any = true;
      if (o.kind === 'trap' || o.effects.some((e) => e.type === 'goto')) return true; // stop at the first big event
    }
  }
  return any;
}

/** A hero searches: a Perception check against every hidden thing within 3 squares. */
function search(room, scene, token, api) {
  const bonus = room.charSheets[token.characterId]?.derived?.perception ?? 0;
  const roll = executeRoll(`1d20${bonus >= 0 ? '+' : ''}${bonus}`, 'normal');
  const found = [];
  for (const o of scene.objects || []) {
    if (!o.hidden || cheb(o, token) > 3) continue;
    if (roll.total >= o.dc) { o.hidden = false; found.push(o); api.fired?.({ kind: o.kind, x: o.x, y: o.y, found: true }); }
  }
  api.say(`${token.label} searches (Perception ${roll.total})${found.length ? `: found ${found.map((o) => o.name).join(', ')}!` : ' and finds nothing.'}`, { kind: found.length ? 'reward' : 'info' });
  return { roll, total: roll.total, found: found.map((o) => o.name) };
}

/* ---------------- patrols ---------------- */

const BLOCKS = new Set('346lx#%wvh_LF[TOAUPQWSqo'.split(''));
function stepToward(scene, t, goal) {
  // one square along the cheapest route (8-way BFS)
  const W = scene.grid.w, key = (x, y) => y * W + x;
  const prev = new Map([[key(t.x, t.y), -1]]);
  const q = [[t.x, t.y]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === goal.x && y === goal.y) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= scene.grid.h || prev.has(key(nx, ny))) continue;
      if (BLOCKS.has((scene.cells?.[ny] || '')[nx])) continue;
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  let k = key(goal.x, goal.y);
  if (!prev.has(k)) return null;
  while (prev.get(k) !== key(t.x, t.y) && prev.get(k) !== -1) k = prev.get(k);
  return { x: k % W, y: Math.floor(k / W) };
}

/** Move every patrolling creature one square; returns tokens that spotted a hero. */
function tickPatrols(room, scene) {
  if (room.combat?.active) return { moved: false, spotted: [] };
  let moved = false;
  const spotted = [];
  const heroes = heroesOn(room, scene);
  for (const t of scene.tokens) {
    if (!t.patrol?.length || t.dead || t.alerted) continue;
    const sees = visibleFrom(scene, t.x, t.y, 6);
    const seen = heroes.find((h) => sees.has(`${h.x},${h.y}`) && cheb(h, t) <= 6);
    if (seen) { t.alerted = true; spotted.push({ token: t, hero: seen }); continue; }
    const i = (t.patrolIndex || 0) % t.patrol.length;
    const goal = t.patrol[i];
    if (t.x === goal.x && t.y === goal.y) { t.patrolIndex = (i + 1) % t.patrol.length; continue; }
    const step = stepToward(scene, t, goal);
    if (!step || scene.tokens.some((o) => o !== t && !o.dead && o.x === step.x && o.y === step.y)) continue;
    t.x = step.x; t.y = step.y; moved = true;
  }
  return { moved, spotted };
}

module.exports = { KINDS, cleanObject, publicObjects, fire, onHeroMoved, search, tickPatrols, cheb };
