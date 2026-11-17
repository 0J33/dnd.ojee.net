import { socket, TAB_ID } from './socket';
import { paint as paintLayers } from './data/layers';

// The table's state on this screen, kept in step with the server.
//
// The server sends the full state once (joining, or when we fall behind) and
// then small versioned patches (server/socket/sync.js). On top of the
// confirmed state sit this client's own actions that the server hasn't
// confirmed yet: each is replayed by a predictor below, so what you do shows
// at once, and a patch from someone else in the meantime can't drag your
// token back (the predictions are re-applied on whatever arrives). A patch's
// `ack` says which of our actions it already contains; those predictions are
// dropped at that moment, so the real result replaces the guess with nothing
// in between. If the server said no, dropping the guess is the correction.
//
// Every action sent with socket.emit for an event that has a predictor (or is
// an edit, DURABLE) gets a `_seq` number - no call site needs to know about
// any of this.
//
// Nothing you edit is lost to a dropped connection, a restarted server or a
// reload. Each edit waits in an outbox until the server says it is written to
// the database (`saved { seq }`), and the outbox is kept in localStorage. While
// the connection is down, or back but not yet at the table again, edits only
// go into the outbox (and show, predicted): sent then, the server would drop
// them as coming from nobody at a table. Once the rejoin's full state is in,
// whatever it doesn't include (`_ack`) is sent again, in order, and the server
// skips anything it already has (it remembers per tab, server/socket/
// roomState.js syncSeen), so each edit lands exactly once. Other table
// messages (chat, rolls) sent while away wait and go after the rejoin.

const PROTO = 2; // the sync version this code speaks (server/socket/sync.js)
let server = null; // confirmed state
let ver = 0;
let view = null; // server + pending predictions
let pending = []; // { seq, event, payload, t }
let resyncing = false;
let lastHeard = 0;
let live = false; // at the table on a working connection: a fresh full state since the last disconnect
let room = null; // its code
let durable = false; // the server reports saves (PROTO 2), so edits are kept until then
let patchable = true; // we understand the server's patches
let outbox = []; // { seq, code, event, payload, t, acked }
const extras = new Map(); // seq -> the rest of an edit's arguments (its callback), this page only
let held = []; // { code, args } other table messages sent while away
const listeners = new Set();
const statusListeners = new Set();

/* ---------------- the outbox, kept across reloads ---------------- */

const BOX_KEY = `dnd.outbox.${TAB_ID}`;
const BOX_TTL = 2 * 24 * 3600 * 1000;
// Numbers only go up for a tab id, reload or not (the server skips anything
// at or below what it has): start above anything an earlier page could have reached.
let seq = Math.floor((Date.now() - 1.7e12) * 1000);
(function restore() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('dnd.outbox.') || k === BOX_KEY) continue;
      const old = JSON.parse(localStorage.getItem(k) || 'null');
      if (!old || !(old.at > now - BOX_TTL)) localStorage.removeItem(k); // a tab long gone
    }
    const box = JSON.parse(localStorage.getItem(BOX_KEY) || 'null');
    if (!box) return;
    seq = Math.max(seq, box.seq || 0);
    outbox = (box.entries || []).filter((e) => e && e.t > now - BOX_TTL && e.code && e.event);
  } catch { /* storage off or corrupt: start empty */ }
})();

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const entries = outbox.map(({ seq: s, code, event, payload, t }) => ({ seq: s, code, event, payload, t }));
  for (const keep of [entries, entries.slice(-50), []]) {
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify({ seq, at: Date.now(), entries: keep }));
      return;
    } catch { /* over quota: keep less */ }
  }
}
const persistSoon = () => { if (!saveTimer) saveTimer = setTimeout(persist, 400); };
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
}

export const getView = () => view;
export const getVersion = () => ver;
export const lastPatchAt = () => lastHeard;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------- how safe your edits are ---------------- */

/** { live, room, unsaved }: unsaved = this table's edits the server hasn't written yet. */
export function status() {
  return { live, room, unsaved: room ? outbox.filter((e) => e.code === room).length : 0 };
}
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function changed() {
  persistSoon();
  const st = status();
  for (const fn of statusListeners) fn(st);
}

/** Resolves true once every edit at this table is saved (or acknowledged, by a server that doesn't report saves), false after `ms`. */
export function settle(ms = 3000) {
  return new Promise((done) => {
    if (!status().unsaved) return done(true);
    const off = onStatus((st) => { if (!st.unsaved) { off(); clearTimeout(t); done(true); } });
    const t = setTimeout(() => { off(); done(false); }, ms);
  });
}
export const flushOutbox = persist;

// For debugging, like window.__socket: __sync.check() compares this screen's
// confirmed state with a fresh full state from the server.
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
if (typeof window !== 'undefined') {
  window.__sync = {
    getView, getVersion, status, pending: () => pending.length, outbox: () => outbox.slice(),
    check: () => new Promise((done) => socket.emit('requestState', (res) => {
      const { chat, log, _v, _ack, _p, ...fresh } = res.state;
      const same = canon(fresh) === canon(server);
      loadFull(res.state);
      done(same ? 'in sync' : 'DESYNC');
    })),
  };
}

function publish() {
  let next = server;
  for (const p of pending) {
    const fn = PREDICT[p.event];
    try { next = (fn && fn(next, p.payload, p)) || next; } catch { /* a guess that doesn't fit: skip it */ }
  }
  view = next;
  for (const fn of listeners) fn(view);
}

// The server has applied our edits up to `ack`.
function acked(ack) {
  if (!ack) return;
  pending = pending.filter((p) => p.seq > ack);
  let gone = false;
  for (const e of outbox) {
    if (e.code !== room || e.seq > ack || e.acked) continue;
    e.acked = true;
    if (!durable) gone = true;
  }
  if (gone) outbox = outbox.filter((e) => !(e.acked && e.code === room));
  for (const s of extras.keys()) if (s <= ack) extras.delete(s);
  changed();
}

/** A full state from the server. `fresh`: we have just (re)joined, so whatever it lacks of ours is sent again. */
export function loadFull(state, { fresh = false } = {}) {
  const { chat, log, _v, _ack, _p, ...rest } = state;
  server = rest;
  ver = _v || 0;
  lastHeard = Date.now();
  resyncing = false;
  if (fresh) {
    room = rest.code || room;
    durable = (_p || 0) >= 2;
    patchable = !_p || _p <= PROTO;
    if (!patchable) window.dispatchEvent(new Event('dnd:newer')); // the server is ahead of this page (freshness.jsx)
    for (const e of outbox) e.acked = false; // a restarted server has only what it saved
    acked(_ack || 0);
    const again = outbox.filter((e) => e.code === room && e.seq > (_ack || 0));
    pending = again.filter((e) => PREDICT[e.event]).map((e) => ({ seq: e.seq, event: e.event, payload: e.payload, t: Date.now() }));
    live = socket.connected;
    if (live) {
      quietly(() => { for (const e of again) send(e); });
      const msgs = held.filter((h) => h.code === room);
      held = [];
      for (const h of msgs) rawEmit(...h.args);
    }
    changed();
  } else {
    acked(_ack || 0);
  }
  publish();
  return view;
}

export function clear() {
  server = null; view = null; pending = []; ver = 0; live = false; room = null; held = [];
  changed();
}

export function resync() {
  if (resyncing || !server || !socket.connected) return;
  resyncing = true;
  socket.emit('requestState', (res) => {
    resyncing = false;
    if (res && res.state) loadFull(res.state);
  });
}

/* ---------------- applying a patch (copy on write) ---------------- */

function applyOps(root, ops) {
  const fresh = new WeakSet(); // containers already copied in this patch
  const own = (c) => {
    if (fresh.has(c)) return c;
    const copy = Array.isArray(c) ? c.slice() : { ...c };
    fresh.add(copy);
    return copy;
  };
  let top = root;
  for (const op of ops) {
    const p = op.p;
    if (!p.length) { top = op.v; continue; }
    top = own(top);
    let cur = top;
    for (let i = 0; i < p.length - 1; i++) {
      cur[p[i]] = own(cur[p[i]]);
      cur = cur[p[i]];
    }
    const k = p[p.length - 1];
    if ('v' in op) cur[k] = op.v;
    else if (op.d) delete cur[k];
    else if (op.a) cur[k] = [...cur[k], ...op.a];
    else if (op.t !== undefined) cur[k] = cur[k].slice(0, op.t);
    else if (op.k) {
      const old = new Map((cur[k] || []).map((x) => [x.id, x]));
      const arr = op.k.map((id) => op.n[id] || old.get(id));
      fresh.add(arr);
      cur[k] = arr;
    }
  }
  return top;
}

socket.on('statePatch', ({ v, ops, ack }) => {
  if (!server || resyncing) return;
  lastHeard = Date.now();
  if (!patchable) { resync(); return; }
  if (ops.length ? v !== ver + 1 : v !== ver) { resync(); return; }
  if (ops.length) {
    try { server = applyOps(server, ops); } catch { resync(); return; }
    ver = v;
  }
  if (ack) acked(ack);
  publish();
});
// Written to the database: these no longer need keeping.
socket.on('saved', ({ seq: upTo } = {}) => {
  if (!upTo || !room) return;
  const before = outbox.length;
  outbox = outbox.filter((e) => e.code !== room || e.seq > upTo);
  if (outbox.length !== before) changed();
});
// Off the table until the rejoin's full state: predictions stay on screen,
// edits wait in the outbox.
socket.on('disconnect', () => { live = false; changed(); });

// An action nobody confirmed (a lost connection mid-flight): stop guessing
// and ask for the truth. (It is still in the outbox if it was an edit.)
setInterval(() => {
  if (!pending.length || !live) return;
  const old = Date.now() - 8000;
  if (pending.some((p) => p.t < old)) { pending = pending.filter((p) => p.t >= old); publish(); resync(); }
}, 2000);

/* ---------------- sending ---------------- */

// Edits without a predictor that are still worth keeping until saved.
const DURABLE = new Set([
  'addScene', 'addScenes', 'reshapeScene', 'duplicateScene', 'addBeat', 'reorderBeats',
  'placeObject', 'setPatrol', 'addTokens', 'saveScenePrep', 'clearDrawings',
]);
// Messages that aren't at a table: they go as they are.
const SESSION = new Set(['joinCampaign', 'createCampaign', 'leaveCampaign', 'requestState', 'syncCheck']);
// Pointing at something means nothing a few seconds later: not kept while away.
const MOMENTARY = new Set(['ping', 'dmLookHere']);
// An edit that only sets values replaces an older one of the same kind
// still in the outbox (typing in a field doesn't fill it with every keystroke).
const keysOf = (o) => Object.keys(o || {}).filter((k) => k !== '_seq').sort().join();
const SUPERSEDES = {
  updateScene: (p) => `${p.sceneId}|${keysOf(p.patch)}`,
  updateBeat: (p) => `${p.beatId}|${keysOf(p.patch)}`,
  updateSheet: (p) => p.characterId,
  updateSettings: (p) => keysOf(p),
  renameCampaign: () => '',
  updateObject: (p) => `${p.sceneId}|${p.id}|${keysOf(p.patch)}`,
  updateLevel: (p) => `${p.sceneId}|${p.levelId}|${keysOf(p.patch)}`,
  updateToken: (p) => `${p.tokenId}|${keysOf(p.patch)}`,
  setDmNote: (p) => (p.characterId ? `c:${p.characterId}` : `t:${p.tokenId}`),
};

const rawEmit = socket.emit.bind(socket);
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
function send(e) {
  rawEmit(e.event, { ...e.payload, _seq: e.seq }, ...(extras.get(e.seq) || []));
}
// Sending again what was already announced: the outgoing listeners (undo)
// heard it the first time.
function quietly(fn) {
  const ls = socket.listenersAnyOutgoing().slice();
  socket.offAnyOutgoing();
  try { fn(); } finally { for (const l of ls) socket.onAnyOutgoing(l); }
}

socket.emit = (event, ...args) => {
  if (!server || SESSION.has(event)) return rawEmit(event, ...args);
  const edit = PREDICT[event] || DURABLE.has(event);
  if (edit && (args[0] === undefined || typeof args[0] === 'function')) args.unshift({});
  let payload = args[0];
  // A drawing gets its id here, so its maker can erase or undo it before the server answers.
  if (event === 'drawStroke' && payload?.stroke && !payload.stroke.id) {
    payload = args[0] = { ...payload, stroke: { ...payload.stroke, id: `st-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` } };
  }
  if (!edit || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    if (live) return rawEmit(event, ...args);
    if (!MOMENTARY.has(event)) held.push({ code: room, args: [event, ...args] });
    return socket;
  }
  const s = ++seq;
  const entry = { seq: s, code: room, event, payload, t: Date.now() };
  const rest = args.slice(1).map((a) => (typeof a === 'function' ? once(a) : a));
  if (rest.length) extras.set(s, rest);
  const sup = SUPERSEDES[event];
  if (sup) {
    const key = sup(payload);
    outbox = outbox.filter((e) => !(e.event === event && e.code === room && sup(e.payload) === key));
  }
  outbox.push(entry);
  if (outbox.length > 2000) outbox = outbox.slice(-2000);
  // Sent (or announced) first: anything listening to outgoing messages (undo) sees the state before it.
  if (live) send(entry);
  else for (const l of socket.listenersAnyOutgoing()) l(event, { ...payload, _seq: s }, ...rest);
  if (PREDICT[event]) pending.push({ seq: s, event, payload, t: Date.now() });
  publish();
  changed();
  return socket;
};

/* ---------------- predictors ---------------- */
// Each mirrors its handler in server/socket/handlers.js (or sceneTools.js)
// closely enough that the confirmed result lands where the guess already is.
// They return a new state and never touch the one they are given.

const sceneIdOf = (st, id) => id || st.activeSceneId || st.scenes[0]?.id;
const mapScene = (st, id, fn) => ({ ...st, scenes: st.scenes.map((sc) => (sc.id === sceneIdOf(st, id) ? fn(sc) : sc)) });
const mapToken = (st, tokenId, fn) => ({
  ...st,
  scenes: st.scenes.map((sc) => (sc.tokens.some((t) => t.id === tokenId) ? { ...sc, tokens: sc.tokens.map((t) => (t.id === tokenId ? fn(t, sc) : t)) } : sc)),
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const setCell = (cells, x, y, ch) => cells.map((row, yy) => (yy === y ? row.slice(0, x) + ch + row.slice(x + 1) : row));
const TOKEN_KEYS = ['label', 'color', 'size', 'hp', 'maxHp', 'ac', 'conditions', 'hidden', 'dead', 'letter', 'art', 'note'];

function nextTurn(st) {
  const c = st.combat;
  if (!c?.active || !c.order.length || c.round === 0) return st;
  const alive = (e) => {
    for (const sc of st.scenes) { const t = sc.tokens.find((x) => x.id === e.tokenId); if (t) return !t.dead; }
    return true; // a creature this screen can't see: assume it's up
  };
  let i = c.turnIndex, round = c.round, guard = 0;
  do {
    i += 1;
    if (i >= c.order.length) { i = 0; round += 1; }
    guard++;
  } while (guard < 50 && !alive(c.order[i]));
  return { ...st, combat: { ...c, turnIndex: i, round, spent: {} } };
}

function restoreParts(sc, parts) {
  const out = { ...sc };
  if (Array.isArray(parts.cells)) {
    if (parts.grid) out.grid = { w: clamp(parts.grid.w, 8, 80), h: clamp(parts.grid.h, 8, 60) };
    if (parts.floor) out.bg = { ...out.bg, floor: parts.floor };
    out.cells = parts.cells.slice(0, out.grid.h).map((row) => String(row).slice(0, out.grid.w));
  }
  if (parts.ground !== undefined) { if (parts.ground) out.ground = parts.ground; else delete out.ground; }
  if (parts.levels !== undefined) { if (parts.levels?.length) out.levels = parts.levels; else delete out.levels; }
  if (Array.isArray(parts.tokens)) {
    const heroes = sc.tokens.filter((t) => t.kind === 'pc');
    const ids = new Set(heroes.map((t) => t.id));
    out.tokens = [...heroes, ...parts.tokens.filter((t) => t && t.kind !== 'pc' && !ids.has(t.id))];
  }
  if (Array.isArray(parts.objects)) out.objects = parts.objects;
  if (Array.isArray(parts.revealed)) out.revealed = [...new Set(parts.revealed)];
  if (parts.fogEnabled !== undefined) out.fogEnabled = !!parts.fogEnabled;
  if (Array.isArray(parts.strokes)) out.strokes = parts.strokes;
  if (Array.isArray(parts.strokesRemove)) out.strokes = (out.strokes || []).filter((st) => !parts.strokesRemove.includes(st.id));
  if (Array.isArray(parts.strokesAdd)) {
    const have = new Set((out.strokes || []).map((st) => st.id));
    out.strokes = [...(out.strokes || []), ...parts.strokesAdd.filter((st) => st && !have.has(st.id))];
  }
  return out;
}

const LAYERS = {
  monsters: (t) => t.kind === 'monster',
  dead: (t) => t.kind === 'monster' && t.dead,
  npcs: (t) => t.kind === 'npc' || t.kind === 'marker',
  hidden: (t) => t.kind !== 'pc' && t.hidden,
};

const PREDICT = {
  moveToken: (st, { tokenId, x, y, cost }) => {
    let next = mapToken(st, tokenId, (t, sc) => ({ ...t, x: clamp(x, 0, sc.grid.w - 1), y: clamp(y, 0, sc.grid.h - 1) }));
    const c = next.combat;
    if (cost > 0 && c?.active && c.round > 0 && c.order[c.turnIndex]?.tokenId === tokenId) {
      const used = c.spent?.[tokenId] || {};
      next = { ...next, combat: { ...c, spent: { ...c.spent, [tokenId]: { ...used, move: (used.move || 0) + cost } } } };
    }
    return next;
  },
  toggleDoor: (st, { sceneId, x, y }) => mapScene(st, sceneId, (sc) => {
    const ch = (sc.cells[y] || '')[x];
    const to = { D: 'd', d: 'D' }[ch];
    return to ? { ...sc, cells: setCell(sc.cells, x, y, to) } : sc;
  }),
  paintScene: (st, { sceneId, cells, level, replace }) => mapScene(st, sceneId, (sc) => paintLayers(sc, cells, { level, replace })),
  addLevel: (st, { sceneId, id, name }) => mapScene(st, sceneId, (sc) => {
    const list = sc.levels || [];
    if (!id || list.length >= 6 || list.some((l) => l.id === id)) return sc;
    const cells = Array.from({ length: sc.grid.h }, () => ' '.repeat(sc.grid.w));
    return { ...sc, levels: [...list, { id, name: String(name || `Level ${list.length + 1}`).slice(0, 40), cells, hidden: false, players: true }] };
  }),
  updateLevel: (st, { sceneId, levelId, patch }) => mapScene(st, sceneId, (sc) => ({
    ...sc,
    levels: (sc.levels || []).map((l) => (l.id !== levelId ? l : {
      ...l,
      ...(patch?.name !== undefined ? { name: String(patch.name).slice(0, 40) || l.name } : {}),
      ...(patch?.hidden !== undefined ? { hidden: !!patch.hidden } : {}),
      ...(patch?.players !== undefined ? { players: !!patch.players } : {}),
    })),
  })),
  removeLevel: (st, { sceneId, levelId }) => mapScene(st, sceneId, (sc) => {
    const levels = (sc.levels || []).filter((l) => l.id !== levelId);
    const { levels: _, ...rest } = sc;
    return levels.length ? { ...sc, levels } : rest;
  }),
  setDmNote: (st, { characterId, tokenId, text }) => {
    const note = String(text || '');
    if (!characterId) return mapToken(st, tokenId, (t) => ({ ...t, dmNote: note || undefined }));
    const dmNotes = { ...(st.dmNotes || {}) };
    if (note) dmNotes[characterId] = note; else delete dmNotes[characterId];
    return { ...st, dmNotes };
  },
  updateToken: (st, { tokenId, patch }) => mapToken(st, tokenId, (t) => {
    const n = { ...t };
    for (const k of TOKEN_KEYS) if (patch?.[k] !== undefined) n[k] = patch[k];
    if (n.hp !== null && n.hp !== undefined && n.hp <= 0 && n.kind === 'monster') n.dead = true;
    if (n.hp !== null && n.hp !== undefined && n.hp > 0) n.dead = false;
    return n;
  }),
  removeToken: (st, { tokenId }) => ({
    ...st,
    scenes: st.scenes.map((sc) => (sc.tokens.some((t) => t.id === tokenId) ? { ...sc, tokens: sc.tokens.filter((t) => t.id !== tokenId) } : sc)),
    combat: { ...st.combat, order: st.combat.order.filter((o) => o.tokenId !== tokenId) },
  }),
  addToken: (st, { sceneId, token }, p) => mapScene(st, sceneId, (sc) => ({
    ...sc,
    tokens: [...sc.tokens, { kind: 'monster', conditions: [], hidden: false, dead: false, size: 1, ...token, id: `local-${p.seq}`, x: clamp(token?.x, 0, sc.grid.w - 1), y: clamp(token?.y, 0, sc.grid.h - 1) }],
  })),
  applyHp: (st, { tokenId, characterId, delta, setTo, temp }) => {
    if (characterId) {
      const sh = st.charSheets?.[characterId];
      if (!sh) return st;
      const n = { ...sh };
      if (temp !== undefined) n.tempHp = Math.max(0, temp);
      else if (setTo !== undefined) n.currentHp = clamp(setTo, 0, sh.maxHp || 999);
      else if (delta !== undefined) n.currentHp = clamp((sh.currentHp || 0) + delta, 0, sh.maxHp || 999);
      return { ...st, charSheets: { ...st.charSheets, [characterId]: n } };
    }
    return mapToken(st, tokenId, (t) => {
      const hp = setTo !== undefined ? clamp(setTo, 0, t.maxHp || 999) : clamp((t.hp || 0) + (delta || 0), 0, t.maxHp || 999);
      return { ...t, hp, dead: hp <= 0 };
    });
  },
  updateSheet: (st, { characterId, sheet }) => {
    const old = st.charSheets?.[characterId];
    if (!old || !sheet) return st;
    return { ...st, charSheets: { ...st.charSheets, [characterId]: { ...sheet, ownerId: old.ownerId, name: sheet.name || old.name } } };
  },
  updateScene: (st, { sceneId, patch }) => mapScene(st, sceneId, (sc) => {
    const n = { ...sc };
    if (patch?.name !== undefined) n.name = String(patch.name).slice(0, 60) || sc.name;
    if (patch?.notes !== undefined) n.notes = String(patch.notes);
    if (patch?.fogEnabled !== undefined) n.fogEnabled = !!patch.fogEnabled;
    if (patch?.bg !== undefined) n.bg = { ...sc.bg, ...patch.bg };
    if (patch?.mood !== undefined) n.mood = { ...sc.mood, ...patch.mood };
    return n;
  }),
  revealFog: (st, { sceneId, cells, mode }) => mapScene(st, sceneId, (sc) => {
    const set = new Set(sc.revealed);
    for (const c of cells || []) { if (mode === 'hide') set.delete(c); else set.add(c); }
    return { ...sc, revealed: [...set] };
  }),
  resetFog: (st, { sceneId, covered }) => mapScene(st, sceneId, (sc) => {
    if (covered) return { ...sc, revealed: [] };
    const all = [];
    for (let y = 0; y < sc.grid.h; y++) for (let x = 0; x < sc.grid.w; x++) all.push(`${x},${y}`);
    return { ...sc, revealed: all };
  }),
  restoreScene: (st, { sceneId, parts }) => (parts ? mapScene(st, sceneId, (sc) => restoreParts(sc, parts)) : st),
  clearLayer: (st, { sceneId, layer }) => mapScene(st, sceneId, (sc) => {
    if (LAYERS[layer]) return { ...sc, tokens: sc.tokens.filter((t) => !LAYERS[layer](t)) };
    if (layer === 'objects') return { ...sc, objects: [] };
    if (layer === 'drawings') return { ...sc, strokes: [] };
    return sc;
  }),
  updateObject: (st, { sceneId, id, patch }) => mapScene(st, sceneId, (sc) => ({ ...sc, objects: (sc.objects || []).map((o) => (o.id === id ? { ...o, ...patch, id } : o)) })),
  drawStroke: (st, { sceneId, stroke }, p) => (stroke ? mapScene(st, sceneId, (sc) => ({ ...sc, strokes: [...(sc.strokes || []), { ...stroke, id: stroke.id || `local-${p.seq}` }].slice(-500) })) : st),
  eraseStrokes: (st, { sceneId, ids }) => mapScene(st, sceneId, (sc) => ({ ...sc, strokes: (sc.strokes || []).filter((x) => !(ids || []).includes(x.id)) })),
  removeObject: (st, { sceneId, id }) => mapScene(st, sceneId, (sc) => ({ ...sc, objects: (sc.objects || []).filter((o) => o.id !== id) })),
  switchScene: (st, { sceneId }) => (st.scenes.some((s) => s.id === sceneId) ? { ...st, activeSceneId: sceneId } : st),
  deleteScene: (st, { sceneId }) => {
    if (st.scenes.length <= 1) return st;
    const scenes = st.scenes.filter((s) => s.id !== sceneId);
    return { ...st, scenes, activeSceneId: st.activeSceneId === sceneId ? scenes[0].id : st.activeSceneId };
  },
  reorderScenes: (st, { order }) => {
    const byId = new Map(st.scenes.map((s) => [s.id, s]));
    const next = (order || []).map((id) => byId.get(id)).filter(Boolean);
    for (const s of st.scenes) if (!next.includes(s)) next.push(s);
    return { ...st, scenes: next };
  },
  updateBeat: (st, { beatId, patch }) => ({ ...st, story: { ...st.story, beats: st.story.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)) } }),
  deleteBeat: (st, { beatId }) => ({ ...st, story: { ...st.story, beats: st.story.beats.filter((b) => b.id !== beatId), activeBeatId: st.story.activeBeatId === beatId ? null : st.story.activeBeatId } }),
  startCombat: (st) => (st.combat?.active && st.combat.round > 0 ? st : { ...st, combat: { active: true, order: [], turnIndex: 0, round: 0 } }), // mid-fight: newcomers join (server rolls)
  endCombat: (st) => ({ ...st, combat: { active: false, order: [], turnIndex: 0, round: 0 } }),
  nextTurn: (st) => nextTurn(st),
  setInitiative: (st, { tokenId, value, name }) => {
    if (!st.combat?.active) return st;
    const order = [...st.combat.order.filter((o) => o.tokenId !== tokenId), { tokenId, initiative: value, name }].sort((a, b) => b.initiative - a.initiative);
    return { ...st, combat: { ...st.combat, order } };
  },
  setAutoMonsters: (st, { on }) => ({ ...st, autoMonsters: !!on }),
  updateSettings: (st, patch) => {
    const { _seq, ...rest } = patch || {};
    return { ...st, settings: { ...st.settings, ...rest } };
  },
  renameCampaign: (st, { name }) => (name ? { ...st, name: String(name).slice(0, 60) } : st),
};
