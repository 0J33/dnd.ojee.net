const { v4: uuidv4 } = require('uuid');
const Campaign = require('../models/Campaign');

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
const SAVE_INTERVAL = 30000;
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
    settings: { leveling: 'milestone', playersCanMoveAny: false },
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
  room.log.push(item);
  if (room.log.length > LOG_LIMIT) room.log = room.log.slice(-LOG_LIMIT);
  return item;
}

function addChat(room, entry) {
  const item = { id: uuidv4(), ts: Date.now(), ...entry };
  room.chat.push(item);
  if (room.chat.length > CHAT_LIMIT) room.chat = room.chat.slice(-CHAT_LIMIT);
  return item;
}

// Per-viewer sanitized view: players don't receive DM-hidden tokens, scene
// prep notes or the story outline (which spoils what is coming).
function viewForUser(room, userId) {
  const dm = room.mode === 'dm' && room.dmId === userId;
  const seesPrep = dm || room.mode === 'guided';
  const strip = (obj) => {
    const { chat, log, ...rest } = obj;
    return rest;
  };
  const base = strip(room);
  const scenes = room.scenes.map((scene) => ({
    ...scene,
    notes: seesPrep ? scene.notes || '' : '',
    tokens: scene.tokens.filter((t) => seesPrep || !t.hidden),
  }));
  const story = seesPrep ? room.story || { beats: [], activeBeatId: null } : { beats: [], activeBeatId: null };
  return { ...base, scenes, story, viewerIsDM: seesPrep };
}

// Bring a room loaded from an older save up to the current shape.
function migrateRoom(room) {
  if (!room) return room;
  if (!room.story || !Array.isArray(room.story.beats)) room.story = { beats: [], activeBeatId: null };
  if (!room.settings) room.settings = { leveling: 'milestone', playersCanMoveAny: false };
  for (const scene of room.scenes || []) {
    if (typeof scene.notes !== 'string') scene.notes = '';
    if (!scene.grid) scene.grid = { w: 26, h: 18 };
    scene.cells = normaliseCells(scene.cells, scene.grid, scene.bg && scene.bg.floor);
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
  return { ...view, chat: visibleChat, log: room.log };
}

function isDMStrict(room, userId) {
  return room.mode === 'guided' ? true : room.dmId === userId;
}

async function saveRoom(room) {
  try {
    room.lastActivity = Date.now();
    await Campaign.findOneAndUpdate(
      { code: room.code },
      { code: room.code, state: room, memberIds: room.members.map((m) => m.userId), lastActivity: new Date() },
      { upsert: true }
    );
  } catch (err) {
    console.error(`autosave failed for ${room.code}:`, err.message);
  }
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
  startAutoSave,
  stopAutoSave,
  loadRoomFromDb,
  generateRoomCode,
  uuidv4,
};
