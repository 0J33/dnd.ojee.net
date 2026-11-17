const { v4: uuidv4 } = require('uuid');
const Campaign = require('../models/Campaign');
const layers = require('./layers');

// index -> SRD creature type, built once from the vendored monster data. Tokens
// saved before the artwork existed only stored `monsterIndex`, so this is what
// lets an old campaign's creatures still be drawn as the right kind of thing.
let monsterTypes = null;
function typeForMonster(index) {
  if (!index) return null;
  if (!monsterTypes) {
    monsterTypes = new Map();
    try {
      for (const m of require('../data/Monsters.json')) monsterTypes.set(m.index, m.type);
    } catch (err) {
      console.error('could not load monster types:', err.message);
    }
  }
  return monsterTypes.get(index) || null;
}

// In-memory authoritative campaign rooms (mirrors mtg.ojee.net gameState.js).
const activeRooms = new Map(); // code -> room
const saveTimers = new Map(); // code -> interval

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SAVE_INTERVAL = 30000; // a backstop; changes are saved SAVE_SOON after they happen
const SAVE_SOON = 1500;
const CHAT_LIMIT = 300;
const LOG_LIMIT = 400;

const MEMBER_COLORS = [
  '#d4a94f', '#7fb069', '#5a7f9f', '#b06ab0', '#c2542e',
  '#5fb0a5', '#c94f6d', '#8f7fd4', '#a5b05f', '#d47f4f',
];

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (activeRooms.has(code));
  return code;
}

const PAD_CHAR = { grass: ',', sand: 's', snow: 'n', marble: 'p' };
const padCharFor = (floor) => PAD_CHAR[floor] || '.';

// Every scene carries a real cells grid so the DM can paint terrain on any of
// them - blank grids included. Image-backed scenes keep cells for blocking.
function normaliseCells(cells, { w, h }, floor) {
  const pad = padCharFor(floor);
  const rows = Array.isArray(cells) ? cells : [];
  return Array.from({ length: h }, (_, y) => String(rows[y] || '').padEnd(w, pad).slice(0, w));
}

function createScene({
  name = 'New Scene',
  bg = { kind: 'blank', floor: 'stone' },
  grid = { w: 26, h: 18 },
  cells = null,
  fogEnabled = false,
  notes = '',
}) {
  return {
    id: uuidv4(),
    name,
    bg,
    grid,
    cells: normaliseCells(cells, grid, bg.floor),
    fogEnabled,
    notes, // DM-only prep notes, never sent to players
    revealed: [], // ['x,y']
    strokes: [],
    tokens: [],
    objects: [], // traps, secrets, chests, levers, notes, exits (server/socket/dmTools.js)
    mood: { time: 'auto', weather: 'none', light: 1 },
  };
}

function createRoom({ name, mode, hostId, hostName }) {
  const code = generateRoomCode();
  const scene = createScene({ name: 'The Table', bg: { kind: 'blank', floor: 'stone' } });
  const room = {
    code,
    name: name || 'New Campaign',
    mode: mode === 'guided' ? 'guided' : 'dm',
    hostId,
    dmId: mode === 'guided' ? null : hostId,
    members: [],
    scenes: [scene],
    activeSceneId: scene.id,
    combat: { active: false, order: [], turnIndex: 0, round: 0 },
    chat: [],
    log: [],
    charSheets: {}, // characterId -> sheet snapshot
    tutorial: { active: false, step: 0, flags: {} },
    // Prep the DM does before (or between) sessions: an ordered outline of
    // beats, each optionally bound to a scene and a set of creatures.
    story: { beats: [], activeBeatId: null },
    settings: { leveling: 'xp', playersCanMoveAny: false }, // 'xp' (SRD thresholds) or 'milestone' (the DM grants levels)
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  addMember(room, { userId: hostId, username: hostName });
  activeRooms.set(code, room);
  return room;
}

function addMember(room, { userId, username }) {
  let member = room.members.find((m) => m.userId === userId);
  if (!member) {
    const color = MEMBER_COLORS[room.members.length % MEMBER_COLORS.length];
    member = { userId, username, color, characterId: null, socketId: null, joinedAt: Date.now() };
    room.members.push(member);
  }
  member.username = username || member.username;
  return member;
}

function getActiveScene(room) {
  return room.scenes.find((s) => s.id === room.activeSceneId) || room.scenes[0];
}

function findScene(room, sceneId) {
  return room.scenes.find((s) => s.id === sceneId);
}

function findToken(room, tokenId) {
  for (const scene of room.scenes) {
    const token = scene.tokens.find((t) => t.id === tokenId);
    if (token) return { scene, token };
  }
  return { scene: null, token: null };
}

function isDM(room, userId) {
  if (room.mode === 'guided') return true; // guided mode: everyone can drive shared controls
  return room.dmId === userId;
}

function addLog(room, entry) {
  const item = { id: uuidv4(), ts: Date.now(), ...entry };
  markDirty(room);
  room.log.push(item);
  if (room.log.length > LOG_LIMIT) room.log = room.log.slice(-LOG_LIMIT);
  return item;
}

function addChat(room, entry) {
  const item = { id: uuidv4(), ts: Date.now(), ...entry };
  markDirty(room);
  room.chat.push(item);
  if (room.chat.length > CHAT_LIMIT) room.chat = room.chat.slice(-CHAT_LIMIT);
  return item;
}

// Per-viewer sanitized view: players don't receive DM-hidden tokens, scene
// prep notes, the DM's private notes on heroes and creatures (dmNotes,
// token.dmNote) or the story outline (which spoils what is coming), nor the
// creatures standing in fog they haven't seen. Server-only bookkeeping (any
// `_` field, socket ids, timestamps that change on every touch) stays here.
const SERVER_ONLY = new Set(['chat', 'log', 'lastActivity', 'createdAt', 'practiceSnap', 'syncSeen']); // practiceSnap: sheets before a practice round (training.js); syncSeen: below
function viewForUser(room, userId) {
  const dm = room.mode === 'dm' && room.dmId === userId;
  const seesPrep = dm || room.mode === 'guided';
  const base = {};
  for (const k of Object.keys(room)) if (k[0] !== '_' && !SERVER_ONLY.has(k)) base[k] = room[k];
  base.members = room.members.map(({ socketId, ...m }) => ({ ...m, online: !!socketId }));
  if (!dm) delete base.dmNotes;
  // The prepared state (sceneTools.js) stays on the server: the DM only
  // needs to know there is one, and players must not see its hidden creatures.
  const scenes = room.scenes.map(({ prep, ...scene }) => {
    const fog = !seesPrep && scene.fogEnabled ? new Set(scene.revealed || []) : null;
    return {
      ...scene,
      prepAt: seesPrep && prep ? prep.at : null,
      notes: seesPrep ? scene.notes || '' : '',
      tokens: scene.tokens
        .filter((t) => seesPrep || (!t.hidden && (!fog || t.kind === 'pc' || fog.has(`${t.x},${t.y}`))))
        .map((t) => {
          if (dm || (t.dmNote == null && (seesPrep || !t.patrol))) return t;
          const { dmNote, ...pub } = t;
          if (!seesPrep) delete pub.patrol;
          return pub;
        }),
      objects: seesPrep ? scene.objects || [] : require('./dmTools').publicObjects(scene),
      // levels hidden from players never leave the server
      ...(scene.levels && !seesPrep ? { levels: layers.levelsForPlayers(scene) } : {}),
    };
  });
  const story = seesPrep ? room.story || { beats: [], activeBeatId: null } : { beats: [], activeBeatId: null };
  if (!seesPrep && room.combat?.order?.length) base.combat = combatForPlayers(room);
  return { ...base, scenes, story, viewerIsDM: seesPrep };
}

// The initiative order as players see it: a hidden creature isn't in it (its
// name and its turn would give it away). While it acts, the turn marker
// stays on whoever went before it.
function combatForPlayers(room) {
  const c = room.combat;
  const hidden = new Set();
  for (const sc of room.scenes) for (const t of sc.tokens) if (t.hidden && t.kind !== 'pc') hidden.add(t.id);
  if (!c.order.some((o) => hidden.has(o.tokenId))) return c;
  const order = [];
  let turnIndex = -1;
  c.order.forEach((o, i) => {
    if (hidden.has(o.tokenId)) return;
    order.push(o);
    if (i <= c.turnIndex) turnIndex = order.length - 1;
  });
  if (turnIndex < 0) turnIndex = Math.max(0, order.length - 1);
  return { ...c, order, turnIndex };
}

// Bring a room loaded from an older save up to the current shape.
function migrateRoom(room) {
  if (!room) return room;
  if (!room.story || !Array.isArray(room.story.beats)) room.story = { beats: [], activeBeatId: null };
  if (!room.settings) room.settings = { leveling: 'xp', playersCanMoveAny: false };
  // 'milestone' was a default nobody could change: XP unless a DM picked it.
  if (room.settings.leveling !== 'xp' && !room.settings.levelingChosen) room.settings.leveling = 'xp';
  for (const scene of room.scenes || []) {
    if (typeof scene.notes !== 'string') scene.notes = '';
    if (!scene.grid) scene.grid = { w: 26, h: 18 };
    scene.cells = normaliseCells(scene.cells, scene.grid, scene.bg && scene.bg.floor);
    layers.fitLayers(scene);
    if (!Array.isArray(scene.objects)) scene.objects = [];
    for (const token of scene.tokens || []) {
      if (token.art === undefined) token.art = null;
      if (token.note === undefined) token.note = '';
      // Backfill the creature type so legacy tokens get the right silhouette.
      if (!token.monsterType && token.monsterIndex) token.monsterType = typeForMonster(token.monsterIndex);
    }
  }
  return room;
}

function fullStateForUser(room, userId) {
  const view = viewForUser(room, userId);
  const visibleChat = room.chat.filter((c) => {
    if (!c.whisperTo) return true;
    return c.userId === userId || c.whisperTo === userId || (c.whisperTo === 'dm' && isDMStrict(room, userId));
  });
  // lines about hidden creatures (their own turns) are the DM's alone
  const log = isDMStrict(room, userId) ? room.log : room.log.filter((l) => !l.dmOnly);
  return { ...view, chat: visibleChat, log };
}

function isDMStrict(room, userId) {
  return room.mode === 'guided' ? true : room.dmId === userId;
}

// Which of each tab's edits the room already contains: `syncSeen[cid]` is the
// highest action number (`_seq`) applied from the tab `cid` (its socket
// handshake). It is saved with the room, in the same write as the edits
// themselves, so after a restart a tab that sends again what the old process
// had applied but not saved gets exactly those edits applied once, and what
// was saved is recognised and skipped (handlers.js).
const SEEN_KEEP = 64;
function seenSeq(room, cid) {
  return (cid && room.syncSeen && room.syncSeen[cid] && room.syncSeen[cid].s) || 0;
}
function markSeen(room, cid, seq) {
  if (!room.syncSeen || typeof room.syncSeen !== 'object') room.syncSeen = {};
  room.syncSeen[cid] = { s: seq, t: Date.now() };
  const ids = Object.keys(room.syncSeen);
  if (ids.length > SEEN_KEEP) {
    ids.sort((a, b) => room.syncSeen[a].t - room.syncSeen[b].t);
    for (const id of ids.slice(0, ids.length - SEEN_KEEP)) delete room.syncSeen[id];
  }
  markDirty(room);
}

// Something in the room changed: it is written SAVE_SOON later (one write
// for everything in between), so a crash or a deploy's kill loses seconds,
// not the 30 of the backstop timer.
const soon = new Map(); // code -> timeout
function markDirty(room) {
  room._dirty = true;
  if (!room.code || soon.has(room.code)) return;
  soon.set(room.code, setTimeout(() => {
    soon.delete(room.code);
    if (activeRooms.get(room.code) === room) saveRoom(room);
  }, SAVE_SOON));
}

// Told after each successful write: (room, syncSeen as written).
const hooks = { onSaved: null };

// Written only when something changed since the last save (`_dirty` is set
// by every state broadcast, chat and log line), without the server-only
// bookkeeping fields. One write per room at a time, in order, so an older
// copy can never land after a newer one.
async function saveRoom(room, { force = false } = {}) {
  while (room._saving) await room._saving;
  if (!force && !room._dirty) return;
  room._dirty = false;
  room._saving = writeRoom(room).finally(() => { room._saving = null; });
  return room._saving;
}

async function writeRoom(room) {
  try {
    room.lastActivity = Date.now();
    const state = {};
    for (const k of Object.keys(room)) if (k[0] !== '_') state[k] = room[k];
    const seen = room.syncSeen ? JSON.parse(JSON.stringify(room.syncSeen)) : null;
    await Campaign.updateOne(
      { code: room.code },
      { $set: { code: room.code, state, memberIds: room.members.map((m) => m.userId), lastActivity: new Date() } },
      { upsert: true }
    );
    if (hooks.onSaved && seen) hooks.onSaved(room, seen);
    return true;
  } catch (err) {
    room._dirty = true; // try again next time
    console.error(`autosave failed for ${room.code}:`, err.message);
    return false;
  }
}

/** Every room in memory, written now (shutting down, or asked to). Resolves to { rooms, failed }. */
async function saveAll() {
  for (const t of soon.values()) clearTimeout(t);
  soon.clear();
  const rooms = [...activeRooms.values()];
  let failed = 0;
  await Promise.all(rooms.map(async (room) => {
    await saveRoom(room, { force: true });
    if (room._dirty) failed++;
  }));
  return { rooms: rooms.length, failed };
}

function startAutoSave(code) {
  if (saveTimers.has(code)) return;
  const timer = setInterval(() => {
    const room = activeRooms.get(code);
    if (!room) return stopAutoSave(code);
    saveRoom(room);
  }, SAVE_INTERVAL);
  saveTimers.set(code, timer);
}

function stopAutoSave(code) {
  const timer = saveTimers.get(code);
  if (timer) clearInterval(timer);
  saveTimers.delete(code);
}

async function loadRoomFromDb(code) {
  const doc = await Campaign.findOne({ code });
  if (!doc || !doc.state) return null;
  const room = migrateRoom(doc.state);
  room.members.forEach((m) => (m.socketId = null));
  activeRooms.set(code, room);
  return room;
}

module.exports = {
  activeRooms,
  createRoom,
  createScene,
  migrateRoom,
  normaliseCells,
  padCharFor,
  addMember,
  getActiveScene,
  findScene,
  findToken,
  isDM,
  isDMStrict,
  addLog,
  addChat,
  viewForUser,
  fullStateForUser,
  saveRoom,
  saveAll,
  markDirty,
  seenSeq,
  markSeen,
  hooks,
  startAutoSave,
  stopAutoSave,
  loadRoomFromDb,
  generateRoomCode,
  uuidv4,
};
