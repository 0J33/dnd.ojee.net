const { cleanShop } = require('../rules/items');
const { uuidv4, findScene, getActiveScene, isDM, normaliseCells, addLog } = require('./roomState');
const tools = require('./dmTools');
const layers = require('./layers');

// The DM's whole-scene editing helpers, registered per socket from
// handlers.js:
//   restoreScene    put back parts of a scene (undo / redo send the parts
//                   they remembered: cells, creatures, objects, fog, drawings)
//   saveScenePrep   remember the scene as prepared, to reset to later
//   resetScene      back to that prepared state (creatures' HP and places,
//                   doors, fog, chests and traps), heroes left where they are
//   clearLayer      sweep one layer: creatures, the fallen, NPCs, secrets,
//                   drawings
//   addTokens       a group of creatures at once, around one square
//   addLevel, updateLevel, removeLevel   extra floor levels (layers.js)
// Each change is one message in and one (debounced) state broadcast out.

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const str = (v, n) => String(v ?? '').slice(0, n);
const BODIES = ['feminine', 'masculine', 'neutral'];
const KINDS = ['monster', 'npc', 'marker'];
const DOORS = new Set(['D', 'd', 'S', 'L']); // closed, open, secret, iron

/** A creature, NPC or marker token from the client, trimmed to known fields. */
function cleanToken(t = {}, scene) {
  const label = str(t.label || 'Creature', 40) || 'Creature';
  const attack = t.attack && typeof t.attack === 'object'
    ? { name: str(t.attack.name, 60), bonus: clampInt(t.attack.bonus, -5, 30), damage: str(t.attack.damage || '1d4', 24), damageType: str(t.attack.damageType || 'bludgeoning', 20) }
    : null;
  const num = (v) => (v === null || v === undefined || v === '' ? null : clampInt(v, -999, 9999));
  return {
    id: typeof t.id === 'string' && /^[\w-]{6,64}$/.test(t.id) ? t.id : uuidv4(),
    kind: KINDS.includes(t.kind) ? t.kind : 'monster',
    label,
    letter: str(t.letter || label[0], 2).toUpperCase(),
    color: /^#[0-9a-f]{3,8}$/i.test(t.color || '') ? t.color : '#8a3d3d',
    x: clampInt(t.x, 0, scene.grid.w - 1),
    y: clampInt(t.y, 0, scene.grid.h - 1),
    size: clampInt(t.size || 1, 1, 4),
    monsterIndex: t.monsterIndex ? str(t.monsterIndex, 80) : null,
    monsterType: t.monsterType ? str(t.monsterType, 60) : null,
    art: t.art ? str(t.art, 40) : null,
    note: str(t.note, 400),
    characterId: null,
    ownerId: null,
    hp: num(t.hp),
    maxHp: num(t.maxHp ?? t.hp),
    ac: num(t.ac),
    attack,
    speedCells: t.speedCells ? clampInt(t.speedCells, 1, 30) : null,
    conditions: Array.isArray(t.conditions) ? t.conditions.slice(0, 16).map((c) => str(c, 30)) : [],
    hidden: !!t.hidden,
    dead: !!t.dead,
    xpValue: t.xpValue ? clampInt(t.xpValue, 0, 200000) : null,
    body: BODIES.includes(t.body) ? t.body : null,
    ...(t.shop ? { shop: cleanShop(t.shop) } : {}),
    ...(Array.isArray(t.patrol) && t.patrol.length
      ? { patrol: t.patrol.slice(0, 40).map((p) => ({ x: clampInt(p.x, 0, scene.grid.w - 1), y: clampInt(p.y, 0, scene.grid.h - 1) })), patrolIndex: clampInt(t.patrolIndex, 0, 40) }
      : {}),
  };
}

/** A drawing from the client, trimmed to known fields, or null. */
function cleanStroke(st) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.points)) return null;
  const points = st.points.slice(0, 2000)
    .filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map((p) => [Math.round(Number(p[0])), Math.round(Number(p[1]))]);
  if (!points.length) return null;
  return {
    id: typeof st.id === 'string' && /^[\w-]{6,64}$/.test(st.id) ? st.id : uuidv4(),
    userId: st.userId ? str(st.userId, 64) : null,
    points,
    color: /^#[0-9a-f]{3,8}$/i.test(st.color || '') ? st.color : '#d4a94f',
    width: clampInt(st.width || 3, 1, 20),
  };
}

/** Everything about a scene the DM edits, as plain data (heroes left out). */
function snapshot(scene) {
  return JSON.parse(JSON.stringify({
    grid: scene.grid,
    floor: scene.bg?.floor || 'stone',
    cells: scene.cells,
    ground: scene.ground || null,
    levels: scene.levels || null,
    tokens: scene.tokens.filter((t) => t.kind !== 'pc'),
    objects: scene.objects || [],
    revealed: scene.revealed || [],
    fogEnabled: !!scene.fogEnabled,
  }));
}

/** Take a scene's prepared state (what Reset goes back to). */
function capturePrep(scene) {
  scene.prep = { ...snapshot(scene), at: Date.now() };
}

// Combat may name creatures that are no longer there: drop them, keeping
// whoever's turn it is.
function pruneCombat(r) {
  if (!r.combat?.order?.length) return;
  const alive = new Set(r.scenes.flatMap((s) => s.tokens.map((t) => t.id)));
  const current = r.combat.order[r.combat.turnIndex];
  r.combat.order = r.combat.order.filter((o) => alive.has(o.tokenId));
  const at = current ? r.combat.order.indexOf(current) : -1;
  r.combat.turnIndex = at >= 0 ? at : Math.min(r.combat.turnIndex, Math.max(0, r.combat.order.length - 1));
}

/** Put back the given parts of a scene. Heroes always stay as they are. */
function restoreParts(r, scene, parts) {
  if (Array.isArray(parts.cells)) {
    if (parts.grid) scene.grid = { w: clampInt(parts.grid.w, 8, 80), h: clampInt(parts.grid.h, 8, 60) };
    if (parts.floor) scene.bg = { ...scene.bg, floor: str(parts.floor, 20) };
    scene.cells = normaliseCells(parts.cells.map((row) => str(row, 80)), scene.grid, scene.bg?.floor);
  }
  // the floor under things and the levels (null / [] = none)
  if (parts.ground !== undefined) scene.ground = parts.ground;
  if (parts.levels !== undefined) scene.levels = parts.levels;
  if (Array.isArray(parts.cells) || parts.ground !== undefined || parts.levels !== undefined) layers.fitLayers(scene);
  if (Array.isArray(parts.tokens)) {
    const heroes = scene.tokens.filter((t) => t.kind === 'pc');
    const others = parts.tokens.filter((t) => t && t.kind !== 'pc').slice(0, 200).map((t) => cleanToken(t, scene));
    const ids = new Set(heroes.map((t) => t.id));
    scene.tokens = [...heroes, ...others.filter((t) => !ids.has(t.id))];
    pruneCombat(r);
  }
  if (Array.isArray(parts.objects)) scene.objects = parts.objects.slice(0, 200).map((o) => tools.cleanObject(o, scene));
  if (Array.isArray(parts.revealed)) {
    scene.revealed = [...new Set(parts.revealed.filter((k) => typeof k === 'string' && /^\d{1,2},\d{1,2}$/.test(k)))].slice(0, scene.grid.w * scene.grid.h);
  }
  if (parts.fogEnabled !== undefined) scene.fogEnabled = !!parts.fogEnabled;
  if (Array.isArray(parts.strokes) && JSON.stringify(parts.strokes).length < 400000) scene.strokes = parts.strokes.slice(-500).map(cleanStroke).filter(Boolean);
  // undo / redo of single drawings: take these away, put these back (as they were)
  if (Array.isArray(parts.strokesRemove)) {
    const gone = new Set(parts.strokesRemove);
    scene.strokes = scene.strokes.filter((st) => !gone.has(st.id));
  }
  if (Array.isArray(parts.strokesAdd)) {
    const have = new Set(scene.strokes.map((st) => st.id));
    for (const st of parts.strokesAdd.slice(0, 500)) {
      const c = cleanStroke(st);
      if (c && !have.has(c.id)) { scene.strokes.push(c); have.add(c.id); }
    }
    if (scene.strokes.length > 500) scene.strokes = scene.strokes.slice(-500);
  }
  // keep everything inside the (possibly smaller) grid
  for (const t of scene.tokens) { t.x = clampInt(t.x, 0, scene.grid.w - 1); t.y = clampInt(t.y, 0, scene.grid.h - 1); }
}

const LAYERS = {
  monsters: (t) => t.kind === 'monster',
  dead: (t) => t.kind === 'monster' && t.dead,
  npcs: (t) => t.kind === 'npc' || t.kind === 'marker',
  hidden: (t) => t.kind !== 'pc' && t.hidden,
};

function register(socket, ctx) {
  const { room, uid, touch, broadcastRoom, broadcastEvent, placeFree } = ctx;
  const dmRoom = () => {
    const r = room();
    return r && isDM(r, uid()) ? r : null;
  };

  socket.on('restoreScene', ({ sceneId, parts } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene || !parts || typeof parts !== 'object') return cb && cb({ error: 'Nothing to restore' });
    restoreParts(r, scene, parts);
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true });
  });

  socket.on('saveScenePrep', ({ sceneId } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene) return cb && cb({ error: 'No such scene' });
    capturePrep(scene);
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true, at: scene.prep.at });
  });

  socket.on('resetScene', ({ sceneId } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene) return cb && cb({ error: 'No such scene' });
    if (!scene.prep) return cb && cb({ error: 'This scene has no prepared state yet. Save one first.' });
    // Doors go back to how they were; anything built since stays built.
    const { cells: prepCells, grid, floor, ground, levels, ...rest } = scene.prep;
    if (grid && grid.w === scene.grid.w && grid.h === scene.grid.h) {
      scene.cells = scene.cells.map((row, y) => row.split('').map((ch, x) => {
        const was = (prepCells[y] || '')[x];
        return DOORS.has(ch) && DOORS.has(was) ? was : ch;
      }).join(''));
    }
    restoreParts(r, scene, { ...rest, strokes: [] });
    // A reset fight starts over: nobody keeps a place in the old order.
    if (r.combat?.active && getActiveScene(r) === scene) {
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
    }
    const item = addLog(r, { type: 'scene', text: `${scene.name} is reset.` });
    broadcastEvent(r.code, 'logEntry', item);
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true });
  });

  socket.on('clearLayer', ({ sceneId, layer } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene) return cb && cb({ error: 'No such scene' });
    let n = 0;
    if (LAYERS[layer]) {
      const before = scene.tokens.length;
      scene.tokens = scene.tokens.filter((t) => !LAYERS[layer](t));
      n = before - scene.tokens.length;
      pruneCombat(r);
    } else if (layer === 'objects') {
      n = (scene.objects || []).length;
      scene.objects = [];
    } else if (layer === 'drawings') {
      n = scene.strokes.length;
      scene.strokes = [];
      broadcastEvent(r.code, 'drawingsCleared', { sceneId: scene.id });
    } else return cb && cb({ error: 'Unknown layer' });
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true, removed: n });
  });

  // Extra floor levels: a platform, a balcony, an upper floor (layers.js).
  socket.on('addLevel', ({ sceneId, id, name } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene) return cb && cb({ error: 'No such scene' });
    const list = scene.levels || [];
    if (list.length >= layers.MAX_LEVELS) return cb && cb({ error: `A scene can have ${layers.MAX_LEVELS} levels.` });
    if (id && list.some((l) => l.id === id)) return cb && cb({ error: 'That level is already there' });
    const level = layers.normaliseLevel({ id, name: name || `Level ${list.length + 1}` }, scene.grid);
    scene.levels = [...list, level];
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true, levelId: level.id });
  });

  socket.on('updateLevel', ({ sceneId, levelId, patch } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    const i = scene ? (scene.levels || []).findIndex((l) => l.id === levelId) : -1;
    if (i < 0 || !patch || typeof patch !== 'object') return cb && cb({ error: 'No such level' });
    const l = { ...scene.levels[i] };
    if (patch.name !== undefined) l.name = str(patch.name, 40) || l.name;
    if (patch.hidden !== undefined) l.hidden = !!patch.hidden;
    if (patch.players !== undefined) l.players = !!patch.players;
    scene.levels = scene.levels.map((x, j) => (j === i ? l : x));
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true });
  });

  socket.on('removeLevel', ({ sceneId, levelId } = {}, cb) => {
    const r = dmRoom();
    const scene = r && findScene(r, sceneId);
    if (!scene || !(scene.levels || []).some((l) => l.id === levelId)) return cb && cb({ error: 'No such level' });
    scene.levels = scene.levels.filter((l) => l.id !== levelId);
    layers.fitLayers(scene);
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true });
  });

  // Several creatures at once (an encounter, a group of NPCs), each on the
  // nearest free square around `at`.
  socket.on('addTokens', ({ sceneId, tokens, at, hidden } = {}, cb) => {
    const r = dmRoom();
    const scene = r && (findScene(r, sceneId) || getActiveScene(r));
    if (!scene || !Array.isArray(tokens)) return cb && cb({ error: 'Nothing to place' });
    const room = 200 - scene.tokens.length;
    if (room <= 0) return cb && cb({ error: 'That scene is full.' });
    const cx = clampInt(at?.x ?? scene.grid.w / 2, 0, scene.grid.w - 1);
    const cy = clampInt(at?.y ?? scene.grid.h / 2, 0, scene.grid.h - 1);
    const ids = [];
    for (const raw of tokens.slice(0, Math.min(24, room))) {
      const t = cleanToken({ ...raw, id: undefined, dead: false, hidden: hidden ?? raw.hidden, x: cx, y: cy }, scene);
      if (t.kind !== 'marker') Object.assign(t, placeFree(scene, cx, cy));
      scene.tokens.push(t);
      ids.push(t.id);
    }
    touch();
    broadcastRoom(r.code);
    cb && cb({ ok: true, tokenIds: ids });
  });
}

module.exports = { register, capturePrep, snapshot, cleanToken, cleanStroke, restoreParts };
