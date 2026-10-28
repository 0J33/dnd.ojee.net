const {
  activeRooms,
  createRoom,
  createScene,
  normaliseCells,
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
  uuidv4,
} = require('./roomState');
const { executeRoll } = require('./dice');
const { revealForHeroes, resolveAttack, toggleDoor, saveBonus, applyDamage } = require('./world');
const tools = require('./dmTools');
const { runMonsterTurn } = require('./autoDm');
const Character = require('../models/Character');

const BROADCAST_DEBOUNCE_MS = 80;
const EVICT_CHECK_MS = 10 * 60 * 1000;
const EVICT_AFTER_MS = 30 * 60 * 1000;

function registerSocketHandlers(io) {
  const pendingBroadcasts = new Map(); // code -> timeout

  function emitToMember(room, member, event, payload) {
    if (!member.socketId) return;
    const sock = io.sockets.sockets.get(member.socketId);
    if (sock) sock.emit(event, payload);
  }

  function broadcastRoomImmediate(code) {
    const room = activeRooms.get(code);
    if (!room) return;
    // Fogged scenes fill in from what the heroes can see, wherever they moved.
    revealForHeroes(room, getActiveScene(room));
    for (const member of room.members) {
      emitToMember(room, member, 'gameState', viewForUser(room, member.userId));
    }
  }

  function broadcastRoom(code) {
    if (pendingBroadcasts.has(code)) return;
    pendingBroadcasts.set(
      code,
      setTimeout(() => {
        pendingBroadcasts.delete(code);
        broadcastRoomImmediate(code);
      }, BROADCAST_DEBOUNCE_MS)
    );
  }

  function broadcastEvent(code, event, payload, filter = null) {
    const room = activeRooms.get(code);
    if (!room) return;
    for (const member of room.members) {
      if (filter && !filter(member)) continue;
      emitToMember(room, member, event, payload);
    }
  }

  function logAndBroadcast(room, entry) {
    const item = addLog(room, entry);
    broadcastEvent(room.code, 'logEntry', item);
    return item;
  }

  // ---------- turns ----------

  // Move to the next living creature in the order. Returns the new entry.
  function advanceTurn(r) {
    let guard = 0;
    do {
      r.combat.turnIndex += 1;
      if (r.combat.turnIndex >= r.combat.order.length) {
        r.combat.turnIndex = 0;
        r.combat.round += 1;
        logAndBroadcast(r, { type: 'combat', text: `Round ${r.combat.round} begins.` });
      }
      guard++;
    } while (guard < 50 && isEntryDead(r, r.combat.order[r.combat.turnIndex]));
    const next = r.combat.order[r.combat.turnIndex];
    logAndBroadcast(r, { type: 'combat', text: `It's ${next.name}'s turn.` });
    return next;
  }

  // Monsters take their own turns when nobody is running them: always in a
  // guided game, and in any game whose DM leaves "monsters act on their own"
  // on. A beat to let the camera arrive, the turn (walk + attack, animated on
  // every screen), a beat to watch it land, then the next creature.
  const MONSTER_LEAD_MS = 1100, MONSTER_WATCH_MS = 2600;
  const monsterTurnAt = new Map(); // room code -> 'round:turn' already scheduled
  function autoMonstersOn(r) { return r.mode === 'guided' || !!r.autoMonsters; }
  function scheduleMonsterTurn(code) {
    const r = activeRooms.get(code);
    if (!r || !r.combat?.active || r.combat.round === 0 || !autoMonstersOn(r)) return;
    const entry = r.combat.order[r.combat.turnIndex];
    const tok = entry && findToken(r, entry.tokenId).token;
    if (!tok || tok.kind !== 'monster' || tok.dead) return;
    const at = `${r.combat.round}:${r.combat.turnIndex}`;
    if (monsterTurnAt.get(code) === at) return; // already scheduled
    monsterTurnAt.set(code, at);
    setTimeout(() => {
      const r2 = activeRooms.get(code);
      if (!r2 || !r2.combat?.active || `${r2.combat.round}:${r2.combat.turnIndex}` !== at) return;
      const scene = getActiveScene(r2);
      const result = runMonsterTurn(r2, scene, tok.id);
      for (const ev of result.events) broadcastEvent(code, 'combatEvent', ev);
      for (const entry2 of r2.log.slice(-3)) broadcastEvent(code, 'logEntry', entry2);
      broadcastRoom(code);
      setTimeout(() => {
        const r3 = activeRooms.get(code);
        if (!r3 || !r3.combat?.active || `${r3.combat.round}:${r3.combat.turnIndex}` !== at) return;
        // Everyone down: stop here and let the table see it.
        const scene3 = getActiveScene(r3);
        const heroesUp = (scene3?.tokens || []).some((t) => t.kind === 'pc' && !t.dead && !(t.characterId && r3.charSheets[t.characterId]?.currentHp === 0));
        if (!heroesUp) return;
        advanceTurn(r3);
        broadcastRoom(code);
        scheduleMonsterTurn(code);
      }, MONSTER_WATCH_MS);
    }, MONSTER_LEAD_MS);
  }

  // ---------- the DM's map tools: objects, patrols ----------

  // What objects can do to the table, for dmTools.fire().
  function toolsApi(r) {
    return {
      say(text, { kind = 'narration' } = {}) {
        if (kind === 'narration') {
          const item = addChat(r, { userId: null, username: 'Narration', kind: 'narration', text });
          broadcastEvent(r.code, 'chatMessage', item);
          broadcastEvent(r.code, 'dmBanner', { text, style: 'narration' });
        }
        logAndBroadcast(r, { type: kind === 'narration' ? 'story' : kind, text });
      },
      privateTo(userId, payload) {
        const m = r.members.find((x) => x.userId === userId);
        if (m) emitToMember(r, m, 'handout', { id: uuidv4(), ...payload });
      },
      hp(ev) { broadcastEvent(r.code, 'combatEvent', { kind: 'hp', ...ev }); },
      saveBonus: (t, ab) => saveBonus(r, t, ab),
      applyDamage: (t, n) => applyDamage(r, t, n),
      heal(t, n) {
        if (t.characterId && r.charSheets[t.characterId]) {
          const sh = r.charSheets[t.characterId];
          sh.currentHp = Math.min(sh.maxHp || 0, (sh.currentHp || 0) + n);
          return { hp: sh.currentHp };
        }
        if (t.hp != null) { t.hp = Math.min(t.maxHp || t.hp + n, t.hp + n); return { hp: t.hp }; }
        return null;
      },
      doors(scene) { broadcastEvent(r.code, 'scenePainted', { sceneId: scene.id, cells: [] }); },
      goto(sceneId, text) {
        const to = sceneId && findScene(r, sceneId);
        if (!to) return;
        const from = getActiveScene(r);
        // the party walks through together: heroes leave the old scene
        if (from && from !== to) from.tokens = from.tokens.filter((t) => t.kind !== 'pc');
        r.activeSceneId = to.id;
        ensurePartyTokens(r, to);
        logAndBroadcast(r, { type: 'scene', text: text || `The party moves on: ${to.name}` });
      },
      fired(o) { broadcastEvent(r.code, 'objectFired', o); },
      alarm(scene, obj) { broadcastEvent(r.code, 'ping', { id: uuidv4(), x: obj.x, y: obj.y, color: '#ff5a4a' }); },
    };
  }

  setInterval(() => {
    for (const [code, r] of activeRooms) {
      if (!r.members.some((m) => m.socketId)) continue;
      const scene = getActiveScene(r);
      if (!scene || !scene.tokens.some((t) => t.patrol?.length)) continue;
      const { moved, spotted } = tools.tickPatrols(r, scene);
      for (const { token, hero } of spotted) {
        logAndBroadcast(r, { type: 'combat', text: `${token.label} spots ${hero.label}!` });
        broadcastEvent(code, 'ping', { id: uuidv4(), x: token.x, y: token.y, color: '#ff5a4a' });
        broadcastEvent(code, 'dmBanner', { text: `${token.label} spots ${hero.label}!`, style: 'alert' });
        // With nobody running monsters, a spotted party is a fight.
        if ((r.mode === 'guided' || r.autoMonsters) && !r.combat?.active) {
          r.combat = { active: true, order: [], turnIndex: 0, round: 0 };
          logAndBroadcast(r, { type: 'combat', text: 'Combat begins - roll initiative!' });
        }
      }
      if (moved || spotted.length) broadcastRoom(code);
    }
  }, 900);

  // Evict rooms with no connected members from memory (they stay in Mongo).
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of activeRooms) {
      const anyConnected = room.members.some((m) => m.socketId);
      if (anyConnected) {
        room._emptySince = null;
        continue;
      }
      if (!room._emptySince) room._emptySince = now;
      if (now - room._emptySince > EVICT_AFTER_MS) {
        stopAutoSave(code);
        saveRoom(room).then(() => activeRooms.delete(code));
      }
    }
  }, EVICT_CHECK_MS);

  io.on('connection', (socket) => {
    let currentRoom = null; // room code
    let currentUserId = null;

    const room = () => (currentRoom ? activeRooms.get(currentRoom) : null);
    const me = () => {
      const r = room();
      return r ? r.members.find((m) => m.userId === currentUserId) : null;
    };
    const touch = () => {
      const r = room();
      if (r) r.lastActivity = Date.now();
    };

    // ---------- Room lifecycle ----------

    socket.on('createCampaign', async ({ name, mode, userId, username, adventureKey }, cb) => {
      if (!userId || !username) return cb && cb({ error: 'Not logged in' });
      const newRoom = createRoom({ name, mode, hostId: userId, hostName: username });
      if (/^[a-z0-9-]{1,40}$/.test(adventureKey || '')) newRoom.adventureKey = adventureKey; // which premade a guided table plays
      const member = newRoom.members[0];
      member.socketId = socket.id;
      currentRoom = newRoom.code;
      currentUserId = userId;
      socket.join(newRoom.code);
      startAutoSave(newRoom.code);
      addLog(newRoom, { type: 'info', text: `${username} founded the campaign "${newRoom.name}".` });
      await saveRoom(newRoom);
      cb && cb({ code: newRoom.code, state: fullStateForUser(newRoom, userId) });
    });

    socket.on('joinCampaign', async ({ code, userId, username }, cb) => {
      if (!userId || !username) return cb && cb({ error: 'Not logged in' });
      code = (code || '').toUpperCase().trim();
      let r = activeRooms.get(code);
      if (!r) r = await loadRoomFromDb(code);
      if (!r) return cb && cb({ error: 'Campaign not found' });

      const existing = r.members.find((m) => m.userId === userId);
      const member = addMember(r, { userId, username });
      member.socketId = socket.id;
      currentRoom = code;
      currentUserId = userId;
      socket.join(code);
      startAutoSave(code);
      touch();
      if (!existing) logAndBroadcast(r, { type: 'info', text: `${username} joined the party!` });
      broadcastRoom(code);
      cb && cb({ code, state: fullStateForUser(r, userId) });
    });

    socket.on('requestState', (cb) => {
      const r = room();
      if (!r) return cb && cb({ error: 'Not in a campaign' });
      const state = fullStateForUser(r, currentUserId);
      if (cb) cb({ state });
      else socket.emit('gameState', state);
    });

    socket.on('leaveCampaign', () => {
      const r = room();
      if (!r) return;
      const member = me();
      if (member) member.socketId = null;
      socket.leave(r.code);
      currentRoom = null;
      broadcastRoom(r.code);
    });

    socket.on('kickPlayer', ({ userId }) => {
      const r = room();
      if (!r || r.hostId !== currentUserId || userId === r.hostId) return;
      const member = r.members.find((m) => m.userId === userId);
      if (member && member.socketId) {
        const sock = io.sockets.sockets.get(member.socketId);
        if (sock) {
          sock.emit('kicked');
          sock.leave(r.code);
        }
      }
      r.members = r.members.filter((m) => m.userId !== userId);
      for (const scene of r.scenes) scene.tokens = scene.tokens.filter((t) => t.ownerId !== userId);
      logAndBroadcast(r, { type: 'info', text: `${member ? member.username : 'A player'} was removed from the campaign.` });
      broadcastRoom(r.code);
    });

    socket.on('transferDM', ({ userId }) => {
      const r = room();
      if (!r || r.mode !== 'dm' || r.dmId !== currentUserId) return;
      const target = r.members.find((m) => m.userId === userId);
      if (!target) return;
      r.dmId = userId;
      logAndBroadcast(r, { type: 'info', text: `${target.username} is now the Dungeon Master.` });
      broadcastRoom(r.code);
    });

    socket.on('renameCampaign', ({ name }) => {
      const r = room();
      if (!r || r.hostId !== currentUserId || !name) return;
      r.name = name.slice(0, 60);
      broadcastRoom(r.code);
    });

    socket.on('updateSettings', (patch) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      r.settings = { ...r.settings, ...patch };
      broadcastRoom(r.code);
    });

    // ---------- Characters at the table ----------

    socket.on('selectCharacter', ({ characterId, name, sheet }) => {
      const r = room();
      const member = me();
      if (!r || !member || !characterId || !sheet) return;
      member.characterId = characterId;
      r.charSheets[characterId] = { ...sheet, ownerId: currentUserId, name };
      touch();

      // Spawn a PC token on the active scene if none exists anywhere.
      const hasToken = r.scenes.some((s) => s.tokens.some((t) => t.characterId === characterId));
      if (!hasToken) {
        const scene = getActiveScene(r);
        const spawn = findSpawn(scene);
        scene.tokens.push({
          id: uuidv4(),
          kind: 'pc',
          label: name,
          letter: (name || '?')[0].toUpperCase(),
          color: member.color,
          x: spawn.x,
          y: spawn.y,
          size: 1,
          characterId,
          ownerId: currentUserId,
          conditions: [],
          hidden: false,
          dead: false,
        });
      }
      logAndBroadcast(r, { type: 'info', text: `${member.username} is playing ${name}.` });
      broadcastRoom(r.code);
    });

    socket.on('updateSheet', async ({ characterId, sheet }) => {
      const r = room();
      if (!r || !characterId || !sheet) return;
      const snapshot = r.charSheets[characterId];
      const isOwner = snapshot && snapshot.ownerId === currentUserId;
      if (!isOwner && !isDMStrict(r, currentUserId)) return;
      r.charSheets[characterId] = { ...sheet, ownerId: snapshot ? snapshot.ownerId : currentUserId, name: sheet.name || (snapshot && snapshot.name) };
      touch();
      broadcastRoom(r.code);
      // Persist to the owner's character document.
      try {
        await Character.updateOne({ _id: characterId }, { $set: { sheet, updatedAt: new Date() } });
      } catch (err) {
        /* character may be a pregen-only instance; ignore */
      }
    });

    // ---------- Scenes ----------

    const buildScene = ({ name, floor, w, h, bgUrl, cells, fogEnabled, notes, entry, tokens }) => {
      const scene = createScene({
        name: (name || 'New Scene').slice(0, 60),
        bg: bgUrl ? { kind: 'url', url: bgUrl, floor: floor || 'stone' } : { kind: cells ? 'builtin' : 'blank', floor: floor || 'stone' },
        grid: { w: clampInt(w || 26, 8, 80), h: clampInt(h || 18, 8, 60) },
        cells: cells || null,
        fogEnabled: !!fogEnabled,
        notes: (notes || '').slice(0, 4000),
      });
      if (entry && Number.isInteger(entry.x) && Number.isInteger(entry.y)) scene.entry = { x: entry.x, y: entry.y };
      // Premade scenes come with their people already in place (NPCs, markers).
      if (Array.isArray(tokens)) {
        for (const t of tokens.slice(0, 30)) {
          if (t.kind === 'pc') continue;
          scene.tokens.push({
            id: uuidv4(), kind: t.kind === 'monster' ? 'monster' : t.kind === 'marker' ? 'marker' : 'npc',
            label: String(t.label || 'Someone').slice(0, 40), letter: String(t.label || '?')[0].toUpperCase(),
            color: t.color || '#c98a4b', x: clampInt(t.x, 0, scene.grid.w - 1), y: clampInt(t.y, 0, scene.grid.h - 1), size: 1,
            monsterIndex: t.monsterIndex || null, art: t.art || null, characterId: null, ownerId: null,
            hp: t.hp ?? null, maxHp: t.maxHp ?? t.hp ?? null, ac: t.ac ?? null, conditions: [], hidden: !!t.hidden, dead: false, note: String(t.note || '').slice(0, 400),
            body: ['feminine', 'masculine', 'neutral'].includes(t.body) ? t.body : null,
          });
        }
      }
      for (const t of scene.tokens) if (t.kind !== 'marker') Object.assign(t, placeFree(scene, t.x, t.y, t.id));
      return scene;
    };

    socket.on('addScene', (payload, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !payload) return;
      if (r.scenes.length >= 60) return cb && cb({ error: 'This campaign already has 60 scenes.' });
      const scene = buildScene(payload);
      r.scenes.push(scene);
      touch();
      broadcastRoom(r.code);
      cb && cb({ sceneId: scene.id });
    });

    // Prep several scenes in one go - used by campaign starter packs and by
    // "add the whole pack" in the scene library.
    socket.on('addScenes', ({ scenes } = {}, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !Array.isArray(scenes)) return;
      const room_ = r;
      const added = [];
      for (const payload of scenes.slice(0, 12)) {
        if (room_.scenes.length >= 60) break;
        const scene = buildScene(payload || {});
        room_.scenes.push(scene);
        added.push(scene.id);
      }
      touch();
      broadcastRoom(r.code);
      cb && cb({ sceneIds: added });
    });

    socket.on('updateScene', ({ sceneId, patch }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !patch) return;
      const scene = findScene(r, sceneId);
      if (!scene) return;
      if (patch.name !== undefined) scene.name = String(patch.name).slice(0, 60) || scene.name;
      if (patch.notes !== undefined) scene.notes = String(patch.notes).slice(0, 4000);
      if (patch.fogEnabled !== undefined) scene.fogEnabled = !!patch.fogEnabled;
      if (patch.bg !== undefined) scene.bg = { ...scene.bg, ...patch.bg };
      if (patch.mood !== undefined) {
        const m = patch.mood || {};
        scene.mood = {
          time: ['auto', 'day', 'dusk', 'night'].includes(m.time) ? m.time : 'auto',
          weather: ['none', 'rain', 'snow', 'fog', 'ash', 'embers'].includes(m.weather) ? m.weather : 'none',
          light: Math.max(0.2, Math.min(2, Number(m.light) || 1)),
          music: ['auto', 'explore', 'tavern', 'sneak', 'tension', 'combat', 'boss', 'rest', 'silence'].includes(m.music) ? m.music : 'auto',
        };
      }
      touch();
      broadcastRoom(r.code);
    });

    // ---------- Map building ----------
    // The DM paints terrain and objects straight onto the live map. Edits
    // arrive as a sparse list of {x, y, ch} so a brush stroke is one message.

    socket.on('paintScene', ({ sceneId, cells }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !Array.isArray(cells)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      if (!scene) return;
      const rows = scene.cells.map((row) => row.split(''));
      let changed = 0;
      for (const c of cells.slice(0, 6000)) {
        const x = clampInt(c.x, 0, scene.grid.w - 1);
        const y = clampInt(c.y, 0, scene.grid.h - 1);
        const ch = typeof c.ch === 'string' && c.ch.length === 1 ? c.ch : null;
        if (!ch || !rows[y] || rows[y][x] === ch) continue;
        rows[y][x] = ch;
        changed++;
      }
      if (!changed) return cb && cb({ changed: 0 });
      scene.cells = rows.map((row) => row.join(''));
      touch();
      // Painting is high-frequency: push the delta straight to everyone and let
      // the debounced full state follow.
      broadcastEvent(r.code, 'scenePainted', { sceneId: scene.id, cells });
      broadcastRoom(r.code);
      cb && cb({ changed });
    });

    // Replace the whole grid - resize, fill, or swap in a different built-in map.
    socket.on('reshapeScene', ({ sceneId, w, h, cells, floor }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      if (!scene) return;
      const grid = { w: clampInt(w || scene.grid.w, 8, 80), h: clampInt(h || scene.grid.h, 8, 60) };
      if (floor) scene.bg = { ...scene.bg, floor };
      scene.grid = grid;
      scene.cells = normaliseCells(cells || scene.cells, grid, scene.bg && scene.bg.floor);
      // keep every token inside the new bounds, and out of any new rock or furniture
      for (const t of scene.tokens) {
        t.x = clampInt(t.x, 0, grid.w - 1);
        t.y = clampInt(t.y, 0, grid.h - 1);
        const ch = (scene.cells[t.y] || '')[t.x];
        if (t.kind !== 'marker' && (BLOCKING.has(ch) || BULKY.has(ch))) Object.assign(t, placeFree(scene, t.x, t.y, t.id));
      }
      for (const o of scene.objects || []) { o.x = clampInt(o.x, 0, grid.w - 1); o.y = clampInt(o.y, 0, grid.h - 1); }
      scene.revealed = scene.revealed.filter((k) => {
        const [x, y] = k.split(',').map(Number);
        return x < grid.w && y < grid.h;
      });
      touch();
      broadcastRoom(r.code);
      cb && cb({ ok: true });
    });

    socket.on('duplicateScene', ({ sceneId, withTokens }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = findScene(r, sceneId);
      if (!scene || r.scenes.length >= 60) return;
      const copy = {
        ...JSON.parse(JSON.stringify(scene)),
        id: uuidv4(),
        name: `${scene.name} (copy)`.slice(0, 60),
        tokens: withTokens
          ? scene.tokens.filter((t) => t.kind !== 'pc').map((t) => ({ ...t, id: uuidv4(), characterId: null, ownerId: null }))
          : [],
      };
      const at = r.scenes.findIndex((s) => s.id === sceneId);
      r.scenes.splice(at + 1, 0, copy);
      touch();
      broadcastRoom(r.code);
      cb && cb({ sceneId: copy.id });
    });

    socket.on('reorderScenes', ({ order }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !Array.isArray(order)) return;
      const byId = new Map(r.scenes.map((s) => [s.id, s]));
      const next = order.map((id) => byId.get(id)).filter(Boolean);
      for (const s of r.scenes) if (!next.includes(s)) next.push(s);
      r.scenes = next;
      touch();
      broadcastRoom(r.code);
    });

    socket.on('switchScene', ({ sceneId }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      if (!findScene(r, sceneId)) return;
      r.activeSceneId = sceneId;
      const scene = findScene(r, sceneId);
      ensurePartyTokens(r, scene); // PCs travel with the party to the new scene
      logAndBroadcast(r, { type: 'scene', text: `Scene: ${scene.name}` });
      broadcastRoom(r.code);
    });

    socket.on('deleteScene', ({ sceneId }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || r.scenes.length <= 1) return;
      r.scenes = r.scenes.filter((s) => s.id !== sceneId);
      if (r.activeSceneId === sceneId) r.activeSceneId = r.scenes[0].id;
      for (const beat of story(r).beats) if (beat.sceneId === sceneId) beat.sceneId = null;
      touch();
      broadcastRoom(r.code);
    });

    // ---------- Story outline (campaign prep) ----------
    // A beat is one planned moment: a scene to open on, creatures to place and
    // something to read aloud. Running a beat does all three in one click.

    // A room restored from an older save may predate the story outline.
    const story = (r) => {
      if (!r.story || !Array.isArray(r.story.beats)) r.story = { beats: [], activeBeatId: null };
      return r.story;
    };

    const cleanBeat = (b = {}) => ({
      title: String(b.title || 'New beat').slice(0, 80),
      sceneId: b.sceneId || null,
      readAloud: String(b.readAloud || '').slice(0, 2000),
      notes: String(b.notes || '').slice(0, 4000),
      encounter: Array.isArray(b.encounter)
        ? b.encounter.slice(0, 20).map((e) => ({
            monsterIndex: String(e.monsterIndex || '').slice(0, 80),
            name: String(e.name || '').slice(0, 60),
            count: clampInt(e.count || 1, 1, 12),
          }))
        : [],
      done: !!b.done,
    });

    socket.on('addBeat', (payload, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const st = story(r);
      if (st.beats.length >= 80) return cb && cb({ error: 'That is a lot of beats already.' });
      const beat = { id: uuidv4(), ...cleanBeat(payload) };
      st.beats.push(beat);
      touch();
      broadcastRoom(r.code);
      cb && cb({ beatId: beat.id });
    });

    socket.on('updateBeat', ({ beatId, patch }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !patch) return;
      const beat = story(r).beats.find((b) => b.id === beatId);
      if (!beat) return;
      Object.assign(beat, cleanBeat({ ...beat, ...patch }));
      touch();
      broadcastRoom(r.code);
    });

    socket.on('deleteBeat', ({ beatId }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const st = story(r);
      st.beats = st.beats.filter((b) => b.id !== beatId);
      if (st.activeBeatId === beatId) st.activeBeatId = null;
      touch();
      broadcastRoom(r.code);
    });

    socket.on('reorderBeats', ({ order }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !Array.isArray(order)) return;
      const st = story(r);
      const byId = new Map(st.beats.map((b) => [b.id, b]));
      const next = order.map((id) => byId.get(id)).filter(Boolean);
      for (const b of st.beats) if (!next.includes(b)) next.push(b);
      st.beats = next;
      touch();
      broadcastRoom(r.code);
    });

    // Switch to the beat's scene, drop in its creatures and (optionally) read
    // its narration to the table.
    socket.on('runBeat', ({ beatId, spawn = true, narrate = true, monsters = [] }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const st = story(r);
      const beat = st.beats.find((b) => b.id === beatId);
      if (!beat) return;
      st.activeBeatId = beatId;

      if (beat.sceneId && findScene(r, beat.sceneId)) {
        r.activeSceneId = beat.sceneId;
        const scene = findScene(r, beat.sceneId);
        ensurePartyTokens(r, scene);
        logAndBroadcast(r, { type: 'scene', text: `Scene: ${scene.name}` });
      }

      const scene = getActiveScene(r);
      let placed = 0;
      if (spawn && Array.isArray(monsters)) {
        // The client resolves stat blocks from the SRD and hands us ready tokens.
        for (const token of monsters.slice(0, 24)) {
          const at = findSpawn(scene);
          scene.tokens.push({
            id: uuidv4(),
            kind: 'monster',
            label: String(token.label || 'Creature').slice(0, 40),
            letter: (token.label || 'C')[0].toUpperCase(),
            color: token.color || '#8a3d3d',
            x: at.x,
            y: at.y,
            size: clampInt(token.size || 1, 1, 4),
            monsterIndex: token.monsterIndex || null,
            monsterType: token.monsterType || null,
            art: token.art || null,
            note: '',
            characterId: null,
            ownerId: null,
            hp: token.hp ?? null,
            maxHp: token.maxHp ?? token.hp ?? null,
            ac: token.ac ?? null,
            attack: token.attack || null,
            speedCells: token.speedCells || null,
            conditions: [],
            hidden: !!token.hidden,
            dead: false,
            xpValue: token.xpValue || null,
            body: ['feminine', 'masculine', 'neutral'].includes(token.body) ? token.body : null,
          });
          placed++;
        }
      }

      if (narrate && beat.readAloud.trim()) {
        // Read-aloud text goes to chat (where players are looking) and to the
        // log (so it stays in the session record).
        const text = beat.readAloud.trim();
        const item = addChat(r, { userId: null, username: 'Narration', kind: 'narration', text });
        broadcastEvent(r.code, 'chatMessage', item);
        logAndBroadcast(r, { type: 'story', text });
      }
      touch();
      broadcastRoom(r.code);
      cb && cb({ ok: true, placed });
    });

    // ---------- Tokens ----------

    socket.on('addToken', ({ sceneId, token }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !token) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      const newToken = {
        id: uuidv4(),
        kind: token.kind || 'monster',
        label: (token.label || 'Creature').slice(0, 40),
        letter: token.letter || (token.label || 'C')[0].toUpperCase(),
        color: token.color || '#8a3d3d',
        x: clampInt(token.x, 0, scene.grid.w - 1),
        y: clampInt(token.y, 0, scene.grid.h - 1),
        size: clampInt(token.size || 1, 1, 4),
        monsterIndex: token.monsterIndex || null,
        monsterType: token.monsterType || null,
        art: token.art || null, // silhouette key - see client Portrait.jsx
        note: (token.note || '').slice(0, 300),
        characterId: null,
        ownerId: null,
        hp: token.hp ?? null,
        maxHp: token.maxHp ?? token.hp ?? null,
        ac: token.ac ?? null,
        attack: token.attack || null,
        speedCells: token.speedCells || null,
        conditions: [],
        hidden: !!token.hidden,
        dead: false,
        xpValue: token.xpValue || null,
            body: ['feminine', 'masculine', 'neutral'].includes(token.body) ? token.body : null,
      };
      // Markers may sit anywhere; creatures land on free floor, not in a table.
      if (newToken.kind !== 'marker') Object.assign(newToken, placeFree(scene, newToken.x, newToken.y));
      scene.tokens.push(newToken);
      touch();
      broadcastRoom(r.code);
      cb && cb({ tokenId: newToken.id });
    });

    socket.on('moveToken', ({ tokenId, x, y }) => {
      const r = room();
      if (!r) return;
      const { scene, token } = findToken(r, tokenId);
      if (!token) return;
      const mine = token.ownerId === currentUserId;
      if (!mine && !isDM(r, currentUserId) && !r.settings.playersCanMoveAny) return;
      const from = { x: token.x, y: token.y };
      token.x = clampInt(x, 0, scene.grid.w - 1);
      token.y = clampInt(y, 0, scene.grid.h - 1);
      // Never left standing inside a wall, a rock, a table or a chair (2D drags included).
      const ch = (scene.cells?.[token.y] || '')[token.x];
      if (token.kind !== 'marker' && (BLOCKING.has(ch) || BULKY.has(ch))) Object.assign(token, placeFree(scene, token.x, token.y, token.id));
      if (token.kind === 'pc' && scene.objects?.length) tools.onHeroMoved(r, scene, token, from, toolsApi(r));
      touch();
      broadcastEvent(r.code, 'tokenMoved', { tokenId, x: token.x, y: token.y });
      broadcastRoom(r.code);
    });

    // A hero's attack or damaging spell, resolved here so the dice are fair.
    socket.on('attackToken', ({ attackerTokenId, targetTokenId, attack }, cb) => {
      const r = room();
      if (!r || !attack) return cb && cb({ error: 'Not at a table' });
      const { scene, token: attacker } = findToken(r, attackerTokenId);
      const target = scene && scene.tokens.find((t) => t.id === targetTokenId);
      if (!attacker || !target) return cb && cb({ error: 'No such creature' });
      if (attacker.ownerId !== currentUserId && !isDM(r, currentUserId)) return cb && cb({ error: 'That isn\'t yours' });
      if (target.dead) return cb && cb({ error: `${target.label} is already down` });
      const { ev, text } = resolveAttack(r, attacker, target, attack);
      touch();
      broadcastEvent(r.code, 'combatEvent', ev);
      logAndBroadcast(r, { type: 'combat', text, roll: ev.roll || ev.damageRoll || null });
      broadcastRoom(r.code);
      cb && cb({ ok: true, event: ev });
    });

    // Open or close a door. Heroes can work a door next to them; the DM any.
    socket.on('toggleDoor', ({ sceneId, x, y }, cb) => {
      const r = room();
      if (!r) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      const near = scene.tokens.some((t) => t.ownerId === currentUserId && Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= 1);
      if (!near && !isDM(r, currentUserId)) return cb && cb({ error: 'Walk up to the door first' });
      const to = toggleDoor(scene, clampInt(x, 0, scene.grid.w - 1), clampInt(y, 0, scene.grid.h - 1));
      if (!to) return cb && cb({ error: 'Not a door' });
      touch();
      broadcastEvent(r.code, 'scenePainted', { sceneId: scene.id, cells: scene.cells });
      broadcastRoom(r.code);
      cb && cb({ ok: true, open: to === 'd' });
    });

    socket.on('updateToken', ({ tokenId, patch }) => {
      const r = room();
      if (!r || !patch) return;
      const { token } = findToken(r, tokenId);
      if (!token) return;
      const mine = token.ownerId === currentUserId;
      if (!mine && !isDM(r, currentUserId)) return;
      const allowed = ['label', 'color', 'size', 'hp', 'maxHp', 'ac', 'conditions', 'hidden', 'dead', 'letter', 'art', 'note'];
      for (const key of allowed) if (patch[key] !== undefined) token[key] = patch[key];
      if (token.hp !== null && token.hp <= 0 && token.kind === 'monster') token.dead = true;
      if (token.hp !== null && token.hp > 0) token.dead = false;
      touch();
      broadcastRoom(r.code);
    });

    socket.on('removeToken', ({ tokenId }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      for (const scene of r.scenes) scene.tokens = scene.tokens.filter((t) => t.id !== tokenId);
      r.combat.order = r.combat.order.filter((o) => o.tokenId !== tokenId);
      broadcastRoom(r.code);
    });

    // ---------- Fog / drawing / pings ----------

    socket.on('revealFog', ({ sceneId, cells, mode }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !Array.isArray(cells)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      const set = new Set(scene.revealed);
      for (const cell of cells.slice(0, 4000)) {
        if (mode === 'hide') set.delete(cell);
        else set.add(cell);
      }
      scene.revealed = [...set];
      broadcastRoom(r.code);
    });

    socket.on('resetFog', ({ sceneId, covered }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      if (covered) {
        scene.revealed = [];
      } else {
        const all = [];
        for (let y = 0; y < scene.grid.h; y++) for (let x = 0; x < scene.grid.w; x++) all.push(`${x},${y}`);
        scene.revealed = all;
      }
      broadcastRoom(r.code);
    });

    socket.on('ping', ({ x, y }) => {
      const r = room();
      const member = me();
      if (!r || !member) return;
      broadcastEvent(r.code, 'ping', { x, y, color: member.color, username: member.username, id: uuidv4() });
    });

    socket.on('drawStroke', ({ sceneId, stroke }) => {
      const r = room();
      if (!r || !stroke) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      const item = { id: uuidv4(), userId: currentUserId, ...stroke };
      scene.strokes.push(item);
      if (scene.strokes.length > 500) scene.strokes = scene.strokes.slice(-500);
      broadcastEvent(r.code, 'strokeAdded', { sceneId: scene.id, stroke: item });
      touch();
    });

    socket.on('eraseStrokes', ({ sceneId, ids }) => {
      const r = room();
      if (!r || !Array.isArray(ids)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      // Players erase their own lines; the DM erases anyone's.
      const mayErase = (st) => isDM(r, currentUserId) || st.userId === currentUserId;
      const gone = scene.strokes.filter((st) => ids.includes(st.id) && mayErase(st)).map((st) => st.id);
      scene.strokes = scene.strokes.filter((st) => !gone.includes(st.id));
      broadcastEvent(r.code, 'strokesErased', { sceneId: scene.id, ids: gone });
      touch();
      broadcastRoom(r.code);
    });

    // The DM clears everything; a player clears only their own drawings.
    socket.on('clearDrawings', ({ sceneId }) => {
      const r = room();
      if (!r) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      if (isDM(r, currentUserId)) {
        scene.strokes = [];
        broadcastEvent(r.code, 'drawingsCleared', { sceneId: scene.id });
      } else {
        const ids = scene.strokes.filter((st) => st.userId === currentUserId).map((st) => st.id);
        scene.strokes = scene.strokes.filter((st) => st.userId !== currentUserId);
        broadcastEvent(r.code, 'drawingsCleared', { sceneId: scene.id, ids });
      }
      touch();
      broadcastRoom(r.code);
    });

    // ---------- Combat ----------

    socket.on('startCombat', () => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      r.combat = { active: true, order: [], turnIndex: 0, round: 0 };
      logAndBroadcast(r, { type: 'combat', text: 'Combat begins - roll initiative!' });
      broadcastRoom(r.code);
    });

    socket.on('setInitiative', ({ tokenId, value, name }) => {
      const r = room();
      if (!r || !r.combat.active) return;
      const { token } = findToken(r, tokenId);
      if (!token) return;
      const mine = token.ownerId === currentUserId;
      if (!mine && !isDM(r, currentUserId)) return;
      r.combat.order = r.combat.order.filter((o) => o.tokenId !== tokenId);
      r.combat.order.push({ tokenId, initiative: value, name: name || token.label });
      r.combat.order.sort((a, b) => b.initiative - a.initiative);
      broadcastRoom(r.code);
    });

    socket.on('rollMonsterInitiative', () => {
      const r = room();
      if (!r || !r.combat.active || !isDM(r, currentUserId)) return;
      rollMissingInitiative(r, { heroes: false });
      broadcastEvent(r.code, 'logEntry', r.log[r.log.length - 1]);
      broadcastRoom(r.code);
    });

    socket.on('beginCombatOrder', () => {
      const r = room();
      if (!r || !r.combat.active || !isDM(r, currentUserId)) return;
      // Nobody waits on a straggler: whoever hasn't rolled rolls now.
      rollMissingInitiative(r, { heroes: true });
      if (!r.combat.order.length) return;
      r.combat.round = 1;
      r.combat.turnIndex = 0;
      const first = r.combat.order[0];
      logAndBroadcast(r, { type: 'combat', text: `Round 1 - ${first.name} goes first!` });
      broadcastRoom(r.code);
      scheduleMonsterTurn(r.code);
    });

    // The rules engine lives in the client; the hero's owner (or the DM)
    // reports the numbers the server needs to resolve attacks fairly.
    socket.on('sheetDerived', ({ characterId, ac, initiative, saves, perception, passivePerception }) => {
      const r = room();
      if (!r || !characterId || !r.charSheets[characterId]) return;
      const member = r.members.find((m) => m.userId === currentUserId);
      if (member?.characterId !== characterId && !isDM(r, currentUserId)) return;
      const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : undefined);
      const sv = {};
      for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) if (saves && saves[k] !== undefined) sv[k] = num(saves[k], -10, 30);
      r.charSheets[characterId].derived = { ac: num(ac, 1, 40), initiative: num(initiative, -10, 30), saves: sv, perception: num(perception, -10, 30), passivePerception: num(passivePerception, 0, 40) };
    });

    // DM switch: monsters take their own turns (guided games always do).
    socket.on('setAutoMonsters', ({ on }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      r.autoMonsters = !!on;
      touch();
      broadcastRoom(r.code);
      scheduleMonsterTurn(r.code);
    });

    socket.on('nextTurn', () => {
      const r = room();
      if (!r || !r.combat.active || !r.combat.order.length || r.combat.round === 0) return;
      const current = r.combat.order[r.combat.turnIndex];
      const currentToken = current ? findToken(r, current.tokenId).token : null;
      const isCurrentPlayer = currentToken && currentToken.ownerId === currentUserId;
      if (!isCurrentPlayer && !isDM(r, currentUserId)) return;

      advanceTurn(r);
      broadcastRoom(r.code);
      scheduleMonsterTurn(r.code);
    });

    socket.on('endCombat', () => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
      logAndBroadcast(r, { type: 'combat', text: 'Combat ends.' });
      broadcastRoom(r.code);
    });

    socket.on('autoMonsterTurn', ({ tokenId }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = getActiveScene(r);
      const result = runMonsterTurn(r, scene, tokenId);
      for (const ev of result.events) broadcastEvent(r.code, 'combatEvent', ev);
      for (const entry of r.log.slice(-3)) broadcastEvent(r.code, 'logEntry', entry);
      broadcastRoom(r.code);
    });

    // ---------- HP / dice / chat ----------

    socket.on('applyHp', ({ tokenId, characterId, delta, setTo, temp }) => {
      const r = room();
      if (!r) return;
      if (characterId) {
        const sheet = r.charSheets[characterId];
        if (!sheet) return;
        const isOwner = sheet.ownerId === currentUserId;
        if (!isOwner && !isDMStrict(r, currentUserId)) return;
        const before = sheet.currentHp || 0;
        if (temp !== undefined) sheet.tempHp = Math.max(0, temp);
        else if (setTo !== undefined) sheet.currentHp = clampInt(setTo, 0, sheet.maxHp || 999);
        else if (delta !== undefined) sheet.currentHp = clampInt((sheet.currentHp || 0) + delta, 0, sheet.maxHp || 999);
        if (sheet.currentHp !== before) broadcastEvent(r.code, 'combatEvent', { kind: 'hp', characterId, delta: sheet.currentHp - before, hp: sheet.currentHp });
        broadcastRoom(r.code);
      } else if (tokenId) {
        const { token } = findToken(r, tokenId);
        if (!token || !isDM(r, currentUserId)) return;
        const before = token.hp || 0;
        if (setTo !== undefined) token.hp = clampInt(setTo, 0, token.maxHp || 999);
        else if (delta !== undefined) token.hp = clampInt((token.hp || 0) + delta, 0, token.maxHp || 999);
        token.dead = token.hp <= 0;
        if (token.hp !== before) broadcastEvent(r.code, 'combatEvent', { kind: 'hp', tokenId, delta: token.hp - before, hp: token.hp });
        broadcastRoom(r.code);
      }
    });

    socket.on('rollDice', ({ formula, mode, label, secret, characterName }, cb) => {
      const r = room();
      const member = me();
      if (!r || !member) return cb && cb({ error: 'Not at a table' });
      const roll = executeRoll(formula, mode || 'normal');
      if (!roll) return cb && cb({ error: 'Bad dice formula' });
      const result = {
        id: uuidv4(),
        userId: currentUserId,
        username: member.username,
        characterName: characterName || null,
        label: (label || '').slice(0, 80),
        secret: !!secret,
        ts: Date.now(),
        ...roll,
      };
      touch();
      const chatItem = addChat(r, { kind: 'roll', userId: currentUserId, username: member.username, roll: result, whisperTo: secret ? 'dm' : null });
      if (secret) {
        broadcastEvent(r.code, 'rollResult', { ...result, chatId: chatItem.id }, (m) => m.userId === currentUserId || isDMStrict(r, m.userId));
      } else {
        broadcastEvent(r.code, 'rollResult', { ...result, chatId: chatItem.id });
      }
      cb && cb({ roll: result });
    });

    socket.on('sendChatMessage', ({ text, whisperTo }) => {
      const r = room();
      const member = me();
      if (!r || !member || !text || !text.trim()) return;
      const item = addChat(r, {
        kind: 'chat',
        userId: currentUserId,
        username: member.username,
        text: text.trim().slice(0, 1000),
        whisperTo: whisperTo || null,
      });
      touch();
      if (whisperTo) {
        broadcastEvent(r.code, 'chatMessage', item, (m) => m.userId === currentUserId || m.userId === whisperTo || (whisperTo === 'dm' && isDMStrict(r, m.userId)));
      } else {
        broadcastEvent(r.code, 'chatMessage', item);
      }
    });

    // ---------- XP / rests ----------

    socket.on('awardXp', ({ amount }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !amount) return;
      const xp = clampInt(amount, 1, 100000);
      for (const member of r.members) {
        if (!member.characterId) continue;
        const sheet = r.charSheets[member.characterId];
        if (sheet) sheet.xp = (sheet.xp || 0) + xp;
      }
      logAndBroadcast(r, { type: 'reward', text: `The party gains ${xp} XP each!` });
      broadcastRoom(r.code);
    });

    socket.on('announce', ({ text, type }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !text) return;
      logAndBroadcast(r, { type: type || 'story', text: text.slice(0, 2000) });
    });

    socket.on('restLog', ({ kind, characterName }) => {
      const r = room();
      const member = me();
      if (!r || !member) return;
      logAndBroadcast(r, {
        type: 'info',
        text: `${characterName || member.username} takes a ${kind === 'long' ? 'long rest' : 'short rest'}.`,
      });
    });

    // ---------- DM tools: objects on the map ----------

    socket.on('placeObject', ({ sceneId, object }, cb) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !object) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      if (!Array.isArray(scene.objects)) scene.objects = [];
      if (scene.objects.length >= 200) return cb && cb({ error: 'That scene has 200 objects already.' });
      const o = tools.cleanObject(object, scene);
      scene.objects.push(o);
      touch(); broadcastRoom(r.code);
      cb && cb({ id: o.id });
    });
    socket.on('updateObject', ({ sceneId, id, patch }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !patch) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      const i = (scene.objects || []).findIndex((o) => o.id === id);
      if (i < 0) return;
      scene.objects[i] = tools.cleanObject({ ...scene.objects[i], ...patch, id }, scene);
      touch(); broadcastRoom(r.code);
    });
    socket.on('removeObject', ({ sceneId, id }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = findScene(r, sceneId) || getActiveScene(r);
      scene.objects = (scene.objects || []).filter((o) => o.id !== id);
      touch(); broadcastRoom(r.code);
    });
    // The DM sets one off by hand, or resets it.
    socket.on('triggerObject', ({ id, reset }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const scene = getActiveScene(r);
      const o = (scene.objects || []).find((x) => x.id === id);
      if (!o) return;
      if (reset) { o.used = false; o.hidden = tools.KINDS[o.kind].hidden; } else tools.fire(r, scene, { ...o, once: false }, null, toolsApi(r)) && (o.used = true);
      touch(); broadcastRoom(r.code);
    });
    // A hero uses something next to them (a chest, a lever, a note, an exit).
    socket.on('useObject', ({ id }, cb) => {
      const r = room();
      if (!r) return;
      const scene = getActiveScene(r);
      const o = (scene.objects || []).find((x) => x.id === id);
      const me = scene.tokens.find((t) => t.kind === 'pc' && t.ownerId === currentUserId);
      if (!o || o.hidden) return cb && cb({ error: 'Nothing there.' });
      if (!me) return cb && cb({ error: 'Pick a hero first.' });
      if (tools.cheb(me, o) > 1) return cb && cb({ error: 'Walk up to it first.' });
      if (o.once && o.used) return cb && cb({ error: `The ${o.name.toLowerCase()} has been used.` });
      tools.fire(r, scene, o, me, toolsApi(r));
      touch(); broadcastRoom(r.code);
      cb && cb({ ok: true });
    });
    socket.on('searchArea', (_, cb) => {
      const r = room();
      if (!r) return;
      const scene = getActiveScene(r);
      const me = scene.tokens.find((t) => t.kind === 'pc' && t.ownerId === currentUserId);
      if (!me) return cb && cb({ error: 'Pick a hero first.' });
      const res = tools.search(r, scene, me, toolsApi(r));
      // Show it happening: a ring sweeping the squares searched, the Perception
      // roll like any other roll, and what came of it across the searcher's screen.
      const member = r.members.find((m) => m.userId === currentUserId);
      broadcastEvent(r.code, 'ping', { id: uuidv4(), x: me.x, y: me.y, color: '#9ad8ff', radius: 3.5 });
      const result = { id: uuidv4(), userId: currentUserId, username: member?.username || '', characterName: me.label, label: 'Search (Perception)', secret: false, ts: Date.now(), ...res.roll };
      const chatItem = addChat(r, { kind: 'roll', userId: currentUserId, username: result.username, roll: result });
      broadcastEvent(r.code, 'rollResult', { ...result, chatId: chatItem.id });
      const text = res.found.length ? `You found ${res.found.join(', ')}!` : 'Nothing hidden here.';
      if (res.found.length) broadcastEvent(r.code, 'dmBanner', { text: `${me.label} found ${res.found.join(', ')}!`, style: 'narration' });
      else if (member) emitToMember(r, member, 'dmBanner', { text: `${me.label} searches every corner within three squares… nothing hidden here.`, style: 'whisper' });
      touch(); broadcastRoom(r.code);
      cb && cb({ total: res.total, found: res.found, text });
    });
    // A creature's patrol route (squares it walks between, in order).
    socket.on('setPatrol', ({ tokenId, route }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const { scene, token } = findToken(r, tokenId);
      if (!token) return;
      token.patrol = (Array.isArray(route) ? route : []).slice(0, 20).map((p) => ({ x: clampInt(p.x, 0, scene.grid.w - 1), y: clampInt(p.y, 0, scene.grid.h - 1) }));
      if (token.patrol.length) token.patrol.unshift({ x: token.x, y: token.y });
      token.patrolIndex = 1; token.alerted = false;
      touch(); broadcastRoom(r.code);
    });

    // ---------- DM tools: talking to the table ----------

    const toWhom = (r, to) => (to === 'all' || !to ? r.members : r.members.filter((m) => (Array.isArray(to) ? to : [to]).includes(m.userId)));
    // A big line across everyone's screen, or a private line to some players.
    socket.on('dmNarrate', ({ text, to, style }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !text) return;
      const t = String(text).slice(0, 600);
      const all = to === 'all' || !to;
      for (const m of toWhom(r, to)) emitToMember(r, m, 'dmBanner', { text: t, style: all ? (style === 'title' ? 'title' : 'narration') : 'whisper' });
      const item = addChat(r, { userId: null, username: all ? 'Narration' : 'Narration (private)', kind: 'narration', text: t, whisperTo: all ? undefined : (Array.isArray(to) ? to[0] : to) });
      if (all) broadcastEvent(r.code, 'chatMessage', item);
      else for (const m of toWhom(r, to)) emitToMember(r, m, 'chatMessage', item);
    });
    // A handout: a letter, a picture, a map - to everyone or to someone.
    socket.on('sendHandout', ({ to, title, text, image }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      const img = typeof image === 'string' && image.length < 1500000 && /^data:image\/(png|jpeg|webp);base64,/.test(image) ? image : null;
      const payload = { id: uuidv4(), title: String(title || 'Handout').slice(0, 80), text: String(text || '').slice(0, 4000), image: img };
      for (const m of toWhom(r, to)) emitToMember(r, m, 'handout', payload);
      logAndBroadcast(r, { type: 'info', text: `The DM shares a handout: ${payload.title}` });
    });
    // An NPC (or monster) speaks: a bubble over its head and a line in chat.
    socket.on('npcSay', ({ tokenId, text }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !text) return;
      const { token } = findToken(r, tokenId);
      if (!token) return;
      const t = String(text).slice(0, 400);
      broadcastEvent(r.code, 'npcSay', { tokenId, text: t });
      const item = addChat(r, { userId: null, username: token.label, kind: 'npc', text: t });
      broadcastEvent(r.code, 'chatMessage', item);
    });
    // Ask players for a roll; their screens show what to roll and a button.
    socket.on('requestRoll', ({ to, check, dc, label }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId) || !check) return;
      const payload = { id: uuidv4(), check: String(check).slice(0, 40), dc: dc ? clampInt(dc, 1, 30) : null, label: String(label || '').slice(0, 120) };
      for (const m of toWhom(r, to)) if (m.characterId) emitToMember(r, m, 'rollRequest', payload);
    });
    // Point everyone's camera at something.
    socket.on('dmLookHere', ({ x, y, dist }) => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      broadcastEvent(r.code, 'lookHere', { x: Number(x) || 0, y: Number(y) || 0, dist: Number(dist) || null });
    });

    // ---------- Tutorial (guided mode) ----------

    socket.on('tutorialStart', ({ scenes, step, adventure }) => {
      const r = room();
      if (!r || r.mode !== 'guided' || !Array.isArray(scenes) || !scenes.length) return;
      // Replace scenes with the scripted adventure's scenes.
      r.scenes = scenes.map((s) => ({
        ...createScene({ name: s.name, bg: s.bg, grid: s.grid, cells: s.cells, fogEnabled: s.fogEnabled }),
        id: s.id || uuidv4(),
        entry: s.entry && Number.isInteger(s.entry.x) && Number.isInteger(s.entry.y) ? { x: s.entry.x, y: s.entry.y } : null,
        revealed: s.revealed || [],
        tokens: (s.tokens || []).map((t) => ({
          id: t.id || uuidv4(),
          kind: t.kind || 'monster',
          label: t.label,
          letter: t.letter || (t.label || '?')[0].toUpperCase(),
          color: t.color || '#8a3d3d',
          x: t.x,
          y: t.y,
          size: t.size || 1,
          monsterIndex: t.monsterIndex || null,
          characterId: null,
          ownerId: null,
          hp: t.hp ?? null,
          maxHp: t.maxHp ?? t.hp ?? null,
          ac: t.ac ?? null,
          attack: t.attack || null,
          conditions: [],
          hidden: !!t.hidden,
          dead: false,
          xpValue: t.xpValue || null,
            body: ['feminine', 'masculine', 'neutral'].includes(t.body) ? t.body : null,
        })),
      }));
      for (const sc of r.scenes) for (const t of sc.tokens) if (t.kind !== 'marker') Object.assign(t, placeFree(sc, t.x, t.y, t.id));
      r.activeSceneId = r.scenes[0].id;
      r.tutorial = { active: true, step: step || 0, flags: {}, applied: -1, adventure: /^[a-z0-9-]{1,40}$/.test(adventure || '') ? adventure : 'flagon' };
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
      ensurePartyTokens(r, r.scenes[0]); // place PC tokens on the opening scene
      logAndBroadcast(r, { type: 'story', text: 'The adventure begins...' });
      broadcastRoomImmediate(r.code);
    });

    socket.on('tutorialAdvance', ({ step, flags }) => {
      const r = room();
      if (!r || !r.tutorial.active) return;
      r.tutorial.step = step;
      if (flags) r.tutorial.flags = { ...r.tutorial.flags, ...flags };
      touch();
      broadcastRoom(r.code);
    });

    // A breather between fights in a guided adventure: every hero back to
    // full HP, conditions cleared, the fallen back on their feet.
    socket.on('restoreHeroes', () => {
      const r = room();
      if (!r || !isDM(r, currentUserId)) return;
      for (const m of r.members) {
        const sheet = m.characterId && r.charSheets[m.characterId];
        if (!sheet) continue;
        const before = sheet.currentHp ?? 0;
        sheet.currentHp = sheet.maxHp ?? before;
        sheet.deathSaves = { s: 0, f: 0 };
        if (sheet.currentHp > before) broadcastEvent(r.code, 'combatEvent', { kind: 'hp', characterId: m.characterId, delta: sheet.currentHp - before, hp: sheet.currentHp });
      }
      for (const sc of r.scenes) for (const t of sc.tokens) if (t.kind === 'pc') { t.dead = false; t.conditions = []; }
      logAndBroadcast(r, { type: 'reward', text: 'The party catches its breath. Everyone is back to full health.' });
      touch();
      broadcastRoom(r.code);
    });

    // A step's on-enter effects (spawns, scene switch, combat) run once per
    // step for the whole table: the first client to claim the step applies
    // them, and a reload or a second player never replays them.
    socket.on('tutorialClaimStep', ({ step }, cb) => {
      const r = room();
      if (!r || !r.tutorial?.active || step !== r.tutorial.step) return cb && cb({ ok: false });
      // Rooms from before this existed already applied their current step.
      if (r.tutorial.applied === undefined) { r.tutorial.applied = step; return cb && cb({ ok: false }); }
      if (r.tutorial.applied === step) return cb && cb({ ok: false });
      r.tutorial.applied = step;
      touch();
      cb && cb({ ok: true });
    });

    socket.on('tutorialEnd', () => {
      const r = room();
      if (!r) return;
      r.tutorial.active = false;
      broadcastRoom(r.code);
    });

    // ---------- Disconnect ----------

    socket.on('disconnect', () => {
      const r = room();
      if (!r) return;
      const member = me();
      if (member) member.socketId = null;
      const anyConnected = r.members.some((m) => m.socketId);
      if (!anyConnected) {
        saveRoom(r);
      }
      broadcastRoom(r.code);
    });
  });
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v) || 0);
  return Math.max(min, Math.min(max, n));
}

// Roll initiative for every creature on the scene not yet in the order:
// monsters (and NPCs) by their DEX, heroes (when asked) by their sheet.
function rollMissingInitiative(r, { heroes }) {
  const scene = getActiveScene(r);
  const srdStore = require('../srd/store');
  for (const token of scene?.tokens || []) {
    if (token.dead || token.kind === 'marker') continue;
    if (token.kind === 'pc' && !heroes) continue;
    if (token.kind !== 'pc' && token.hidden) continue;
    if (r.combat.order.some((o) => o.tokenId === token.id)) continue;
    let mod = 1;
    if (token.kind === 'pc') {
      mod = (token.characterId && r.charSheets[token.characterId]?.derived?.initiative) ?? 0;
    } else if (token.monsterIndex) {
      const monster = srdStore.byIndex.monsters.get(token.monsterIndex);
      if (monster) mod = Math.floor((monster.dexterity - 10) / 2);
    }
    const roll = executeRoll(`1d20${mod >= 0 ? '+' : ''}${mod}`, 'normal');
    r.combat.order.push({ tokenId: token.id, initiative: roll.total, name: token.label });
    addLog(r, { type: 'combat', text: `${token.label} rolls initiative: ${roll.total}` });
  }
  r.combat.order.sort((a, b) => b.initiative - a.initiative);
}

function isEntryDead(room, entry) {
  if (!entry) return false;
  const { token } = findToken(room, entry.tokenId);
  if (!token) return true;
  if (token.dead) return true;
  return false;
}

// First open floor cell near the middle-bottom of a scene.
// Tiles nothing can stand on (walls, deep water, lava, chasms, big props) -
// mirrors the blocked tiles in client/src/data/tiles.js.
const BLOCKING = new Set('346lx#%wvh_LF[TOAUPQWSqo'.split(''));
// Furniture nobody should be placed standing in (mirrors BULKY in
// client/src/world/WorldView.js).
const BULKY = new Set('t21ERJ)BbC!cGKMN?}$'.split(''));

// The nearest square to (x, y) a creature can stand on: in bounds, not a
// wall, not furniture, nobody else there. (x, y) itself if it's fine.
function placeFree(scene, x, y, ignoreId = null) {
  const ok = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= scene.grid.w || cy >= scene.grid.h) return false;
    const ch = (scene.cells?.[cy] || '')[cx] || '.';
    if (BLOCKING.has(ch) || BULKY.has(ch)) return false;
    return !scene.tokens.some((t) => t.id !== ignoreId && !t.dead && t.x === cx && t.y === cy);
  };
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return { x, y };
}

// A free square for someone arriving: near the scene's entry point if it has
// one (premade adventures set it), else near the bottom middle.
function findSpawn(scene) {
  const cx = scene.entry ? scene.entry.x : Math.floor(scene.grid.w / 2);
  const cy = scene.entry ? scene.entry.y : Math.floor(scene.grid.h - 3);
  const free = (x, y) => {
    if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) return false;
    if (scene.cells && (BLOCKING.has((scene.cells[y] || '')[x] || '.') || BULKY.has((scene.cells[y] || '')[x]))) return false;
    return !scene.tokens.some((t) => !t.dead && t.x === x && t.y === y);
  };
  for (let radius = 0; radius < 14; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (free(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return { x: 1, y: 1 };
}

// Ensure every party member's PC token exists on the given scene (so the party
// "travels" when the DM/adventure switches scenes). Spawns missing tokens near
// the entrance; leaves existing ones where they are.
function ensurePartyTokens(room, scene) {
  if (!scene) return;
  for (const member of room.members) {
    if (!member.characterId) continue;
    if (scene.tokens.some((t) => t.characterId === member.characterId)) continue;
    const sheet = room.charSheets[member.characterId];
    const spawn = findSpawn(scene);
    scene.tokens.push({
      id: uuidv4(),
      kind: 'pc',
      label: (sheet && sheet.name) || member.username,
      letter: ((sheet && sheet.name) || member.username)[0].toUpperCase(),
      color: member.color,
      x: spawn.x,
      y: spawn.y,
      size: 1,
      characterId: member.characterId,
      ownerId: member.userId,
      conditions: [],
      hidden: false,
      dead: false,
    });
  }
}

module.exports = { registerSocketHandlers };
