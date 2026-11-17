const { activeRooms, getActiveScene, viewForUser, fullStateForUser, markDirty } = require('./roomState');
const { revealForHeroes } = require('./world');

// Keeping every screen in step without sending the whole room each time.
//
// Each socket at a table has a baseline: the exact view (viewForUser) it was
// last sent, and a version number. A change anywhere marks the room; on the
// next turn of the event loop (so one action that touches several things is
// one message) every member's new view is diffed against their baseline and
// they get only what changed, as `statePatch { v, ops, ack }`:
//
//   { p: path, v: value }          set (or add) the value at path
//   { p: path, d: 1 }              delete the key at path
//   { p: path, a: [..] }           append to the array at path
//   { p: path, t: n }              cut the array at path to n items
//   { p: path, k: ids, n: {id:x} } rebuild an array of {id} objects in the
//                                  order `ids`, keeping the old items by id
//                                  and adding the new ones from `n`
//
// Views are filtered per viewer before diffing, so hidden creatures, notes,
// prep and the story never travel to players in a patch either. `v` goes up
// by one per patch with ops; a client that sees a gap (or reconnects) asks
// for the full state, which resets its baseline. `ack` is the highest client
// action number (`_seq` on the payload) this patch already includes, so the
// sender can drop its optimistic copy of that action exactly when the real
// one is on screen: no flicker back, no waiting.
//
// A full state also says which version of all this it is (`_p`, PROTO): a
// client that doesn't know that version takes full states instead of
// patches. 2 added tab ids (socket handshake `auth.cid`), resends of edits
// the server already has being skipped, and `saved { seq }` once a tab's
// edits are written to the database (handlers.js).
const PROTO = 2;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const keyed = (arr) => {
  const seen = new Set();
  for (const x of arr) {
    if (!isObj(x) || typeof x.id !== 'string' || seen.has(x.id)) return false;
    seen.add(x.id);
  }
  return true;
};

function diff(a, b, path, ops) {
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) return diffArray(a, b, path, ops);
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) ops.push({ p: [...path, k], d: 1 });
    for (const k of Object.keys(b)) {
      if (!(k in a)) ops.push({ p: [...path, k], v: b[k] });
      else diff(a[k], b[k], [...path, k], ops);
    }
    return;
  }
  ops.push({ p: path, v: b });
}

function diffArray(a, b, path, ops) {
  if (a.length && b.length && keyed(a) && keyed(b)) {
    const same = a.length === b.length && a.every((x, i) => x.id === b[i].id);
    if (same) {
      for (let i = 0; i < b.length; i++) diff(a[i], b[i], [...path, i], ops);
      return;
    }
    const old = new Map(a.map((x) => [x.id, x]));
    const n = {};
    for (const x of b) if (!old.has(x.id)) n[x.id] = x;
    ops.push({ p: path, k: b.map((x) => x.id), n });
    b.forEach((x, i) => { if (old.has(x.id)) diff(old.get(x.id), x, [...path, i], ops); });
    return;
  }
  const sub = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) diff(a[i], b[i], [...path, i], sub);
  // A reshuffle costs more as edits than as the list itself.
  if (sub.length > Math.max(8, b.length / 3)) { ops.push({ p: path, v: b }); return; }
  for (const op of sub) ops.push(op);
  if (b.length > a.length) ops.push({ p: path, a: b.slice(n) });
  else if (b.length < a.length) ops.push({ p: path, t: b.length });
}

const plain = (v) => JSON.parse(JSON.stringify(v));
// The only thing about a viewer that changes their view (roomState.viewForUser).
const seesPrep = (room, userId) => room.mode === 'guided' || (room.mode === 'dm' && room.dmId === userId);

function createSync(io) {
  const pending = new Set(); // room codes with a flush queued

  const socketOf = (member) => (member.socketId ? io.sockets.sockets.get(member.socketId) : null);

  // The full state for this socket, which becomes its new baseline.
  function fullState(sock, room, userId) {
    revealForHeroes(room, getActiveScene(room));
    const full = fullStateForUser(room, userId);
    const { chat, log, ...view } = full;
    const prev = sock.data.sync;
    const s = { code: room.code, view: plain(view), v: (prev?.v || 0) + 1, acked: sock.data.seq || 0 };
    sock.data.sync = s;
    return { ...full, _v: s.v, _ack: s.acked, _p: PROTO };
  }

  function flush(code) {
    pending.delete(code);
    const room = activeRooms.get(code);
    if (!room) return;
    // Fogged scenes fill in from what the heroes can see, wherever they moved.
    revealForHeroes(room, getActiveScene(room));
    // Everyone who sees the same thing (the DM, or the players) shares one
    // built view, and members whose baselines are that same object share
    // one diff: the cost grows with audiences, not with players.
    const views = new Map(); // audience -> view
    const diffs = new Map(); // baseline -> audience -> ops
    for (const member of room.members) {
      const sock = socketOf(member);
      const s = sock?.data.sync;
      if (!s || s.code !== code) continue;
      const aud = seesPrep(room, member.userId) ? 'prep' : 'players';
      if (!views.has(aud)) views.set(aud, plain(viewForUser(room, member.userId)));
      const next = views.get(aud);
      if (!diffs.has(s.view)) diffs.set(s.view, new Map());
      let ops = diffs.get(s.view).get(aud);
      if (!ops) { ops = []; diff(s.view, next, [], ops); diffs.get(s.view).set(aud, ops); }
      s.view = next; // equal in value either way; shared from now on
      const seq = sock.data.seq || 0;
      const ack = seq > s.acked ? seq : undefined;
      if (!ops.length && ack === undefined) continue;
      if (ops.length) s.v += 1;
      s.acked = seq;
      sock.emit('statePatch', ack === undefined ? { v: s.v, ops } : { v: s.v, ops, ack });
    }
  }

  // Something in the room changed: everyone hears about it on the next tick.
  function schedule(code) {
    const room = code && activeRooms.get(code);
    if (room) markDirty(room); // and saved a moment later (roomState.js)
    if (!code || pending.has(code)) return;
    pending.add(code);
    setImmediate(() => flush(code));
  }

  // Only an acknowledgement is owed (an action that changed nothing).
  function scheduleAck(code) {
    if (!code || pending.has(code)) return;
    pending.add(code);
    setImmediate(() => flush(code));
  }

  return { fullState, flush, schedule, scheduleAck };
}

module.exports = { createSync, diff, PROTO };
