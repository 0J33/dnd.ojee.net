const crypto = require('crypto');
const AiProposal = require('../models/AiProposal');
const { activeRooms, loadRoomFromDb, startAutoSave, findScene, findToken } = require('../socket/roomState');

// The DM's review queue for AI changes.
//
// Nothing an AI model writes reaches the table directly. A write tool
// (server/ai/tools.js) turns into a proposal: a list of items, each one
// reviewable change ("Add the scene The Crooked Lantern", "Narrate: ...")
// made of steps, where a step is exactly a socket action a DM's own click
// sends ({ event, payload }). The DM accepts, rejects or quick-edits each
// item in the game (client/src/components/ai/). Accepting runs the steps
// through the same handlers as a socket (handlers.js api.dispatch), so
// players see the change, autosave writes it and every check still applies.
//
// Auto-apply (a token or assistant setting): prep items whose every step can
// be undone are applied as they arrive and wait in the queue as "applied";
// rejecting one runs its inverse steps (taken from the room just before it
// was applied). Anything players see or that destroys is never auto-applied.
//
// Items can depend on earlier ones: a payload string "$ref:<name>" is the id
// the item with that `ref` created (the scene a beat opens on).

let tables = null; // handlers.js api: dispatch, emitToUser
function setTables(t) { tables = t; }

const newId = () => crypto.randomBytes(6).toString('base64url');

// What a step created, for refs: the first id-looking thing in its answer.
const createdId = (res) => res && (res.sceneId || res.beatId || res.tokenId || res.id || (res.tokenIds && res.tokenIds[0]) || (res.sceneIds && res.sceneIds[0])) || null;

async function liveRoom(code) {
  let r = activeRooms.get(code);
  if (!r) { r = await loadRoomFromDb(code); if (r) startAutoSave(code); }
  return r;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * The steps that undo `step`, read from the room before it runs, or null
 * when it can't be undone. `res` is filled in after it ran (ids it created).
 */
function inversePlan(room, step) {
  const p = step.payload || {};
  const sceneOf = (id) => (id && findScene(room, id)) || room.scenes.find((s) => s.id === room.activeSceneId) || room.scenes[0];
  switch (step.event) {
    case 'addScene': return (res) => (res?.sceneId ? [{ event: 'deleteScene', payload: { sceneId: res.sceneId } }] : []);
    case 'addBeat': return (res) => (res?.beatId ? [{ event: 'deleteBeat', payload: { beatId: res.beatId } }] : []);
    case 'addToken': return (res) => (res?.tokenId ? [{ event: 'removeToken', payload: { tokenId: res.tokenId } }] : []);
    case 'addTokens': return (res) => (res?.tokenIds || []).map((tokenId) => ({ event: 'removeToken', payload: { tokenId } }));
    case 'placeObject': {
      const sceneId = sceneOf(p.sceneId)?.id;
      return (res) => (res?.id ? [{ event: 'removeObject', payload: { sceneId, id: res.id } }] : []);
    }
    case 'updateScene': {
      const sc = findScene(room, p.sceneId);
      if (!sc) return null;
      const old = {};
      for (const k of Object.keys(p.patch || {})) old[k] = clone(k === 'mood' ? sc.mood || {} : sc[k] ?? (k === 'notes' ? '' : null));
      return () => [{ event: 'updateScene', payload: { sceneId: sc.id, patch: old } }];
    }
    case 'paintScene':
    case 'reshapeScene': {
      const sc = sceneOf(p.sceneId);
      if (!sc) return null;
      const parts = clone({ cells: sc.cells, grid: sc.grid, floor: sc.bg?.floor || 'stone', ground: sc.ground ?? null, levels: sc.levels ?? null });
      return () => [{ event: 'restoreScene', payload: { sceneId: sc.id, parts } }];
    }
    case 'updateBeat': {
      const beat = (room.story?.beats || []).find((b) => b.id === p.beatId);
      if (!beat) return null;
      const old = clone(beat);
      delete old.id;
      return () => [{ event: 'updateBeat', payload: { beatId: beat.id, patch: old } }];
    }
    case 'setDmNote': {
      if (p.characterId) { const was = room.dmNotes?.[p.characterId] || ''; return () => [{ event: 'setDmNote', payload: { characterId: p.characterId, text: was } }]; }
      const { token } = findToken(room, p.tokenId);
      if (!token) return null;
      const was = token.dmNote || '';
      return () => [{ event: 'setDmNote', payload: { tokenId: token.id, text: was } }];
    }
    case 'updateToken': {
      const { token } = findToken(room, p.tokenId);
      if (!token) return null;
      const old = {};
      for (const k of Object.keys(p.patch || {})) old[k] = clone(token[k] ?? null);
      return () => [{ event: 'updateToken', payload: { tokenId: token.id, patch: old } }];
    }
    case 'updateObject': {
      const sc = sceneOf(p.sceneId);
      const o = (sc?.objects || []).find((x) => x.id === p.id);
      if (!o) return null;
      const was = clone(o);
      return () => [{ event: 'updateObject', payload: { sceneId: sc.id, id: o.id, patch: was } }];
    }
    default: return null;
  }
}
const UNDOABLE = new Set(['addScene', 'addBeat', 'addToken', 'addTokens', 'placeObject', 'updateScene', 'paintScene', 'reshapeScene', 'updateBeat', 'setDmNote', 'updateToken', 'updateObject']);
const canAutoApply = (item) => item.kind === 'prep' && item.steps.every((s) => UNDOABLE.has(s.event));

function resolveRefs(value, refs) {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    const id = refs[value.slice(5)];
    if (!id) throw new Error(`depends on "${value.slice(5)}", which was not added`);
    return id;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, refs));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, refs);
    return out;
  }
  return value;
}

function refsOf(proposal) {
  const refs = {};
  for (const it of proposal.items) if (it.ref && it.createdId) refs[it.ref] = it.createdId;
  return refs;
}

/** Run one item's steps. Sets status, createdId, inverse (or error). */
async function applyItem(proposal, item) {
  const room = await liveRoom(proposal.code);
  if (!room) { item.status = 'failed'; item.error = 'Campaign not found'; return item; }
  const refs = refsOf(proposal);
  const inverse = [];
  try {
    for (const raw of item.steps) {
      const step = { event: raw.event, payload: resolveRefs(raw.payload || {}, refs) };
      const plan = inversePlan(room, step);
      const res = await tables.dispatch(proposal.code, proposal.userId, step.event, step.payload);
      if (res && res.error) throw new Error(res.error);
      if (!item.createdId) item.createdId = createdId(res);
      if (item.ref && item.createdId) refs[item.ref] = item.createdId;
      if (plan) inverse.unshift(...plan(res));
    }
    item.inverse = inverse;
    item.error = null;
    return item;
  } catch (err) {
    // what did go in is taken back, so a half-done item never stays
    for (const st of inverse) await tables.dispatch(proposal.code, proposal.userId, st.event, st.payload).catch(() => {});
    item.status = 'failed';
    item.error = err.message;
    return item;
  }
}

function overall(items) {
  if (items.some((i) => i.status === 'pending')) return 'pending';
  if (items.some((i) => i.status === 'applied')) return 'applied';
  if (items.every((i) => i.status === 'rejected' || i.status === 'reverted')) return 'rejected';
  return 'done';
}

/** What the DM's screen and the model get to see of a proposal. */
function publicProposal(p) {
  return {
    id: p._id,
    code: p.code,
    source: p.source,
    client: p.client,
    title: p.title,
    why: p.why,
    status: p.status,
    createdAt: p.createdAt,
    resolvedAt: p.resolvedAt,
    items: p.items.map((it) => ({
      id: it.id, ref: it.ref || null, kind: it.kind, title: it.title, summary: it.summary, status: it.status, error: it.error || null,
      fields: (it.fields || []).map((f) => ({ ...f, value: getPath(it, f.path) })),
      preview: it.preview || null,
      createdId: it.createdId || null,
      steps: it.steps.map((s) => s.event),
    })),
  };
}

function notify(p, event = 'aiProposal') {
  if (!tables) return;
  const pub = publicProposal(p);
  tables.emitToUser(p.code, p.userId, event, pub);
}

/**
 * Make a proposal. items: [{ ref?, kind: prep|live|destructive, title,
 * summary, steps: [{ event, payload }], fields?: [{ path, label, multiline }],
 * preview? }]. With autoApply, the undoable prep items go in now.
 */
async function createProposal({ userId, code, source, client, title, why, items, autoApply = false }) {
  const doc = {
    _id: newId(), userId, code, source, client: String(client || '').slice(0, 60), title: String(title || '').slice(0, 120), why: String(why || '').slice(0, 1200),
    status: 'pending', createdAt: new Date(), resolvedAt: null,
    items: items.slice(0, 60).map((it) => ({ ...it, id: it.id || newId(), status: 'pending', kind: it.kind || 'prep', fields: it.fields || [] })),
  };
  if (autoApply) {
    for (const it of doc.items) {
      if (!canAutoApply(it)) continue;
      await applyItem(doc, it);
      if (it.status !== 'failed') it.status = 'applied';
    }
  }
  doc.status = overall(doc.items);
  await AiProposal.create(doc);
  notify(doc);
  return doc;
}

function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') return false; o = o[k]; }
  o[keys[keys.length - 1]] = value;
  return true;
}

async function load(id, userId) {
  const p = await AiProposal.findById(String(id)).lean();
  if (!p || p.userId !== userId) return null;
  return p;
}

async function save(p) {
  p.status = overall(p.items);
  if (p.status !== 'pending' && p.status !== 'applied' && !p.resolvedAt) p.resolvedAt = new Date();
  await AiProposal.updateOne({ _id: p._id }, { $set: { items: p.items, status: p.status, resolvedAt: p.resolvedAt } });
  notify(p, 'aiProposalUpdate');
  return p;
}

/**
 * Accept items (all pending/applied ones when `itemIds` is empty). `edits`:
 * { itemId: { path: value } } for the quick-edit fields the item declared.
 */
async function accept(id, userId, { itemIds = null, edits = {} } = {}) {
  const p = await load(id, userId);
  if (!p) return { error: 'No such proposal' };
  const want = itemIds && itemIds.length ? new Set(itemIds) : null;
  for (const it of p.items) {
    if (want && !want.has(it.id)) continue;
    if (it.status === 'applied') { it.status = 'accepted'; continue; } // already in: keep it
    if (it.status !== 'pending' && !(it.status === 'failed' && want)) continue; // a failed one can be tried again by name
    const e = edits[it.id];
    if (e && typeof e === 'object') {
      const allowed = new Set((it.fields || []).map((f) => f.path));
      for (const [path, value] of Object.entries(e)) {
        if (!allowed.has(path)) continue;
        const field = it.fields.find((f) => f.path === path);
        setPath(it, path, field.type === 'number' ? Number(value) || 0 : String(value).slice(0, field.max || 4000));
      }
      it.edited = true;
    }
    await applyItem(p, it);
    if (it.status !== 'failed') it.status = 'accepted';
  }
  return publicProposal(await save(p));
}

/** Reject items; ones already applied (auto-apply) are taken back. */
async function reject(id, userId, { itemIds = null } = {}) {
  const p = await load(id, userId);
  if (!p) return { error: 'No such proposal' };
  const want = itemIds && itemIds.length ? new Set(itemIds) : null;
  // newest first, so later items that built on earlier ones go first
  for (const it of [...p.items].reverse()) {
    if (want && !want.has(it.id)) continue;
    if (it.status === 'pending') { it.status = 'rejected'; continue; }
    if (it.status !== 'applied' && !(want && it.status === 'accepted' && it.inverse?.length)) continue;
    for (const st of it.inverse || []) {
      const res = await tables.dispatch(p.code, userId, st.event, st.payload).catch((err) => ({ error: err.message }));
      if (res && res.error) it.error = `Undo: ${res.error}`;
    }
    it.status = 'reverted';
  }
  return publicProposal(await save(p));
}

async function list(userId, { code = null, status = null, limit = 30 } = {}) {
  const q = { userId };
  if (code) q.code = code;
  if (status === 'open') q.status = { $in: ['pending', 'applied'] };
  else if (status) q.status = status;
  const docs = await AiProposal.find(q).sort({ createdAt: -1 }).limit(Math.min(100, limit)).lean();
  return docs.map(publicProposal);
}

module.exports = { setTables, createProposal, accept, reject, list, load, publicProposal, canAutoApply };
