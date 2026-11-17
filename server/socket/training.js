const { activeRooms, createScene, getActiveScene, findScene, findToken, isDM, saveRoom, uuidv4 } = require('./roomState');
const { moveCost, lineClear, resolveAttack } = require('./world');
const { heroAttack, weaponAttacks } = require('../rules/attacks');
const Character = require('../models/Character');

// Learning the table: the DM training ground and the group practice round.
//
// * `room.training` (a sandbox campaign of its own, made from the lobby):
//   { kind: 'dm', done: { key: ts } }. Two stand-in heroes sit at it as
//   members ('bot:1', 'bot:2'); on their turn in a fight they walk up and
//   swing on their own, unless the DM is playing one ("view as a player").
// * `room.practice` (any DM game, for the real group): { active, stage,
//   sceneId, done: { userId: { key: ts } } }. A practice scene is added and
//   the party taken there; ending it takes the scene away again and puts
//   every hero sheet back as it was, so nothing from practice sticks.
//
// What someone has done is noticed here, from the messages they send (one
// socket middleware, so no handler needs to know), and travels to screens
// in the room state like everything else. Only the sheet being opened and
// the DM's "view as a player" are reported by the client (`practiceMark`).
// A skipped step is stored as a negative time.

const SPELL = (a) => a && (String(a.ref || '').startsWith('s:') || a.style === 'spell');
const ROLLS_NOT_CHECKS = /attack|damage|initiative|^\s*\d*d\d/i;

/** The keys an incoming message ticks off, for the DM (training) or a player (practice). */
function marksFor(event, a = {}, r, uid) {
  switch (event) {
    // building
    case 'paintScene': return ['paint'];
    case 'reshapeScene': return ['generate'];
    case 'restoreScene': return ['undo'];
    case 'addScene': case 'addScenes': return ['newScene'];
    case 'switchScene': return ['switchScene'];
    case 'duplicateScene': case 'saveScenePrep': case 'resetScene': case 'clearLayer': return ['sceneTools'];
    // filling
    case 'addTokens': case 'addToken': {
      const kinds = new Set((Array.isArray(a.tokens) ? a.tokens : [a.token]).map((t) => t?.kind || 'monster'));
      return [kinds.has('npc') && 'npc', kinds.has('monster') && 'fight'].filter(Boolean);
    }
    case 'placeObject': return ['secret'];
    case 'revealFog': case 'resetFog': return ['fog'];
    case 'addBeat': case 'runBeat': return ['beat'];
    case 'setPatrol': return ['patrol'];
    // running
    case 'startCombat': return ['combat'];
    case 'beginCombatOrder': return ['initiative'];
    case 'setAutoMonsters': return a.on ? ['monsterTurn'] : [];
    case 'autoMonsterTurn': return ['monsterTurn'];
    case 'nextTurn': return ['nextTurn'];
    case 'applyHp': return a.tokenId ? ['hp'] : [];
    case 'updateToken': return a.patch && (a.patch.hp !== undefined || a.patch.conditions !== undefined) ? ['hp'] : [];
    case 'endCombat': return ['endCombat'];
    case 'awardXp': case 'grantLevel': return ['xp'];
    case 'dmNarrate': return ['narrate'];
    case 'requestRoll': return ['requestRoll'];
    case 'npcSay': return ['npcSay'];
    case 'sendHandout': return ['handout'];
    case 'updateScene': return a.patch?.mood ? ['mood'] : a.patch?.fogEnabled ? ['fogOn'] : [];
    // playing
    case 'moveToken': {
      const { token } = findToken(r, a.tokenId);
      return token && token.kind === 'pc' && token.ownerId === uid ? ['move'] : [];
    }
    case 'sendChatMessage': return ['chat'];
    // (on the flat map a weapon attack is rolled from the sheet)
    case 'rollDice': return /attack|to hit/i.test(String(a.label || '')) ? ['attack'] : ROLLS_NOT_CHECKS.test(String(a.label || a.formula || '')) ? [] : ['check'];
    case 'toggleDoor': return ['door'];
    case 'searchArea': return ['search'];
    case 'attackToken': return SPELL(a.attack) ? ['attack', 'ability'] : ['attack'];
    case 'heroAction': return ['ability'];
    case 'useObject': return ['loot'];
    case 'restLog': return ['rest'];
    default: return [];
  }
}

// What a client may report itself (the rest is seen from what it sends).
const CLIENT_MARKS = new Set(['sheet', 'viewAs', 'handbook']);
const SKIPPABLE = /^[a-zA-Z]{2,20}$/;

const BOT_COLORS = ['#7fb069', '#5fb0a5'];
const isBot = (id) => typeof id === 'string' && id.startsWith('bot:');

function create({ broadcastRoom, broadcastEvent, logAndBroadcast, advanceTurn, scheduleMonsterTurn, ensurePartyTokens, placeFree }) {
  // ---------- scenes sent by the client ----------
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const str = (v, n) => String(v ?? '').slice(0, n);
  function sceneFrom(s = {}) {
    const grid = { w: clampInt(s.w || 24, 8, 80), h: clampInt(s.h || 16, 8, 60) };
    const scene = createScene({
      name: str(s.name || 'Practice', 60),
      bg: { kind: Array.isArray(s.cells) ? 'builtin' : 'blank', floor: str(s.floor || 'stone', 20) },
      grid,
      cells: Array.isArray(s.cells) ? s.cells.map((row) => str(row, 80)) : null,
      fogEnabled: !!s.fogEnabled,
      notes: str(s.notes, 2000),
    });
    if (s.entry && Number.isInteger(s.entry.x) && Number.isInteger(s.entry.y)) scene.entry = { x: s.entry.x, y: s.entry.y };
    if (s.mood) scene.mood = { ...scene.mood, ...s.mood };
    for (const t of (Array.isArray(s.tokens) ? s.tokens : []).slice(0, 20)) {
      if (t.kind === 'pc') continue;
      const tok = {
        id: uuidv4(), kind: t.kind === 'monster' ? 'monster' : 'npc', label: str(t.label || 'Someone', 40), letter: str(t.label || '?', 1).toUpperCase(),
        color: str(t.color || '#c98a4b', 16), x: clampInt(t.x, 0, grid.w - 1), y: clampInt(t.y, 0, grid.h - 1), size: 1,
        monsterIndex: t.monsterIndex ? str(t.monsterIndex, 60) : null, art: t.art ? str(t.art, 30) : null, characterId: null, ownerId: null,
        hp: t.hp ?? null, maxHp: t.maxHp ?? t.hp ?? null, ac: t.ac ?? null, xpValue: t.xpValue || null, conditions: [], hidden: !!t.hidden, dead: false,
        note: str(t.note, 400), body: ['feminine', 'masculine', 'neutral'].includes(t.body) ? t.body : null,
      };
      Object.assign(tok, placeFree(scene, tok.x, tok.y, tok.id));
      scene.tokens.push(tok);
    }
    for (const o of (Array.isArray(s.objects) ? s.objects : []).slice(0, 20)) scene.objects.push(require('./dmTools').cleanObject(o, scene));
    return scene;
  }

  // ---------- noticing what people do ----------
  function mark(r, uid, key, value = Date.now()) {
    let book = null;
    if (r.practice?.active) {
      r.practice.done = r.practice.done || {};
      book = r.practice.done[uid] = r.practice.done[uid] || {};
    } else if (r.training && r.dmId === uid) {
      book = r.training.done = r.training.done || {};
    }
    if (!book) return false;
    // Doing it again after a replay counts again (the newest time wins).
    if (book[key] > 0 && value > 0 && value - book[key] < 1500) return false;
    book[key] = value;
    return true;
  }

  // ---------- the stand-in heroes ----------
  // Their turn in a fight: the nearest monster in sight, walk up (or shoot),
  // swing once, then the next creature. Paced like the monsters' turns.
  const BOT_LEAD_MS = 1100, BOT_WATCH_MS = 1800;
  const botTurnAt = new Map(); // room code -> 'round:turn' being played
  function botTurn(r) {
    const c = r.combat;
    if (!r.training || !c?.active || c.round === 0) return;
    const entry = c.order[c.turnIndex];
    const found = entry && findToken(r, entry.tokenId);
    const hero = found?.token;
    if (!hero || hero.kind !== 'pc' || !isBot(hero.ownerId) || r.training.driving === hero.ownerId) return;
    const at = `${c.round}:${c.turnIndex}`;
    if (botTurnAt.get(r.code) === at) return;
    botTurnAt.set(r.code, at);
    const code = r.code;
    const still = (r2) => r2 && r2.combat?.active && `${r2.combat.round}:${r2.combat.turnIndex}` === at;
    setTimeout(() => {
      const r2 = activeRooms.get(code);
      if (!still(r2)) return;
      const scene = getActiveScene(r2);
      const sheet = r2.charSheets[hero.characterId];
      if (sheet && !hero.dead && (sheet.currentHp ?? 1) > 0) playBot(r2, scene, hero, sheet);
      setTimeout(() => {
        const r3 = activeRooms.get(code);
        if (!still(r3)) return;
        advanceTurn(r3);
        broadcastRoom(code);
        scheduleMonsterTurn(code);
      }, BOT_WATCH_MS);
    }, BOT_LEAD_MS);
  }

  function playBot(r, scene, hero, sheet) {
    const foes = scene.tokens.filter((t) => t.kind === 'monster' && !t.dead && !t.hidden);
    if (!foes.length) { logAndBroadcast(r, { type: 'combat', text: `${hero.label} looks around: nothing left to fight.` }); return; }
    const d = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const target = foes.sort((a, b) => d(hero, a) - d(hero, b))[0];
    const weapons = weaponAttacks(sheet);
    const ranged = weapons.find((w) => w.range && !w.thrown);
    const melee = weapons.find((w) => !w.range || w.thrown) || weapons[0];
    let use = melee;
    if (ranged && d(hero, target) > 1 && d(hero, target) <= Math.floor(ranged.range.normal / 5) && lineClear(scene, hero.x, hero.y, target.x, target.y)) use = ranged;
    if (use === melee && d(hero, target) > 1) {
      // The free square beside the target that is cheapest to reach this turn.
      const speed = Math.max(1, Math.floor((sheet.speed || 30) / 5));
      let best = null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const to = { x: target.x + dx, y: target.y + dy };
        if ((!dx && !dy) || scene.tokens.some((t) => !t.dead && t.id !== hero.id && t.x === to.x && t.y === to.y)) continue;
        const cost = moveCost(scene, hero, to, 60);
        if (cost !== null && (!best || cost < best.cost)) best = { ...to, cost };
      }
      if (best) {
        if (best.cost <= speed) { hero.x = best.x; hero.y = best.y; } else {
          // Not this turn: as far along as the speed allows.
          let step = null;
          for (let y = hero.y - speed; y <= hero.y + speed; y++) for (let x = hero.x - speed; x <= hero.x + speed; x++) {
            if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h || scene.tokens.some((t) => !t.dead && t.id !== hero.id && t.x === x && t.y === y)) continue;
            const cost = moveCost(scene, hero, { x, y }, speed);
            if (cost === null) continue;
            const left = moveCost(scene, { x, y }, best, 60);
            if (left !== null && (!step || left < step.left)) step = { x, y, left };
          }
          if (step) { hero.x = step.x; hero.y = step.y; }
        }
      }
    }
    if (!use || (use === melee && d(hero, target) > (use.reach || 1))) {
      logAndBroadcast(r, { type: 'combat', text: `${hero.label} closes in on ${target.label}.` });
      broadcastRoom(r.code);
      return;
    }
    const a = heroAttack(sheet, { ref: `w:${use.name}` });
    if (a.error) return;
    const { ev, text } = resolveAttack(r, hero, target, a);
    broadcastEvent(r.code, 'combatEvent', ev);
    logAndBroadcast(r, { type: 'combat', text, roll: ev.roll || ev.damageRoll || null });
    broadcastRoom(r.code);
  }

  setInterval(() => {
    for (const r of activeRooms.values()) if (r.training && r.combat?.active && r.members.some((m) => m.socketId)) botTurn(r);
  }, 700);

  // ---------- the practice round: everyone's sheets, before and after ----------
  const SNAP_KEYS = ['currentHp', 'tempHp', 'xp', 'level', 'maxHp', 'deathSaves', 'conditions', 'spellcasting', 'featureUses', 'uses', 'raging', 'hitDiceRemaining', 'exhaustion', 'equipment', 'coins'];
  const snapshot = (sheet) => JSON.parse(JSON.stringify(Object.fromEntries(SNAP_KEYS.filter((k) => k in sheet).map((k) => [k, sheet[k]]))));

  function register(socket, { room, uid, touch }) {
    socket.use(([event, payload], next) => {
      const r = room();
      if (r && (r.practice?.active || r.training)) {
        let changed = false;
        // A scene from a template brings its own mood: that isn't the DM setting one.
        if (event === 'addScene' || event === 'addScenes') socket.data.sceneAddedAt = Date.now();
        const fromTemplate = event === 'updateScene' && Date.now() - (socket.data.sceneAddedAt || 0) < 3000;
        for (const key of fromTemplate ? [] : marksFor(event, payload || {}, r, uid())) changed = mark(r, uid(), key) || changed;
        if (changed) broadcastRoom(r.code);
      }
      next();
    });

    // Something only the client sees (the sheet opened), or a step skipped.
    socket.on('practiceMark', ({ key, skip } = {}) => {
      const r = room();
      if (!r || typeof key !== 'string' || !SKIPPABLE.test(key)) return;
      if (!skip && !CLIENT_MARKS.has(key)) return;
      if (mark(r, uid(), key, skip ? -Date.now() : Date.now())) broadcastRoom(r.code);
    });

    // ---------- the DM training ground ----------

    // Turn a fresh campaign into the sandbox: its scenes and two stand-in heroes.
    socket.on('trainingSetup', ({ scenes, bots } = {}, cb) => {
      const r = room();
      if (!r || r.mode !== 'dm' || r.dmId !== uid() || !Array.isArray(scenes) || !scenes.length) return cb && cb({ error: 'Not your table' });
      if (!r.training) r.training = { kind: 'dm', done: {}, driving: null, startedAt: Date.now() };
      r.name = r.name || 'DM training ground';
      r.scenes = scenes.slice(0, 6).map(sceneFrom);
      r.activeSceneId = r.scenes[0].id;
      r.story = { beats: [], activeBeatId: null };
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
      r.autoMonsters = false;
      (Array.isArray(bots) ? bots : []).slice(0, 2).forEach((b, i) => {
        if (!b || !b.sheet) return;
        const userId = `bot:${i + 1}`;
        const characterId = `practice-hero-${i + 1}`;
        const name = str(b.sheet.name || `Hero ${i + 1}`, 40);
        let m = r.members.find((x) => x.userId === userId);
        if (!m) { m = { userId, username: `${name.split(' ')[0]} (practice)`, color: BOT_COLORS[i], characterId, socketId: null, joinedAt: Date.now(), bot: true }; r.members.push(m); }
        r.charSheets[characterId] = { ...b.sheet, ownerId: userId, name };
        for (const sc of r.scenes) sc.tokens = sc.tokens.filter((t) => t.characterId !== characterId);
      });
      ensurePartyTokens(r, getActiveScene(r));
      logAndBroadcast(r, { type: 'info', text: 'The training ground is ready. Two practice heroes have pulled up a chair.' });
      touch();
      broadcastRoom(r.code);
      cb && cb({ ok: true });
    });

    // Start over: fresh scenes, the heroes healed; the checklist too if asked.
    socket.on('trainingReset', ({ scenes, bots, progress } = {}, cb) => {
      const r = room();
      if (!r || !r.training || r.dmId !== uid() || !Array.isArray(scenes) || !scenes.length) return cb && cb({ error: 'Not your table' });
      if (progress) r.training.done = {};
      r.training.driving = null;
      r.scenes = scenes.slice(0, 6).map(sceneFrom);
      r.activeSceneId = r.scenes[0].id;
      r.story = { beats: [], activeBeatId: null };
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
      r.autoMonsters = false;
      (Array.isArray(bots) ? bots : []).slice(0, 2).forEach((b, i) => {
        const id = `practice-hero-${i + 1}`;
        if (b?.sheet && r.charSheets[id]) r.charSheets[id] = { ...b.sheet, ownerId: `bot:${i + 1}`, name: r.charSheets[id].name };
      });
      ensurePartyTokens(r, getActiveScene(r));
      logAndBroadcast(r, { type: 'info', text: 'The training ground is swept clean.' });
      touch();
      broadcastRoom(r.code);
      cb && cb({ ok: true });
    });

    // The DM plays a practice hero themselves (it stops acting on its own).
    socket.on('trainingDrive', ({ botId } = {}) => {
      const r = room();
      if (!r || !r.training || r.dmId !== uid()) return;
      r.training.driving = isBot(botId) ? botId : null;
      broadcastRoom(r.code);
    });

    // ---------- the group practice round ----------

    socket.on('practiceStart', ({ scene } = {}, cb) => {
      const r = room();
      if (!r || !isDM(r, uid()) || r.mode !== 'dm' || !scene) return cb && cb({ error: 'Only the DM can start a practice round' });
      if (r.practice?.active) return cb && cb({ error: 'A practice round is already on' });
      if (r.combat?.active) return cb && cb({ error: 'Finish the fight first' });
      if (r.scenes.length >= 60) return cb && cb({ error: 'This campaign has 60 scenes already.' });
      const sc = sceneFrom(scene);
      r.scenes.push(sc);
      r.practiceSnap = Object.fromEntries(Object.entries(r.charSheets).map(([id, sh]) => [id, snapshot(sh)]));
      r.practice = { active: true, stage: 'explore', sceneId: sc.id, prevSceneId: r.activeSceneId, autoMonsters: !!r.autoMonsters, done: {}, startedAt: Date.now() };
      r.activeSceneId = sc.id;
      ensurePartyTokens(r, sc);
      logAndBroadcast(r, { type: 'story', text: 'Practice round! Nothing here counts: try everything.' });
      broadcastEvent(r.code, 'dmBanner', { text: 'Practice round: try everything, nothing here counts', style: 'title' });
      touch();
      broadcastRoom(r.code);
      saveRoom(r, { force: true }); // the sheets as they were must outlive a restart
      cb && cb({ ok: true });
    });

    // The sparring fight: a couple of weak creatures beside the party, the
    // monsters running themselves, initiative rolled for them.
    socket.on('practiceFight', ({ monsters } = {}, cb) => {
      const r = room();
      if (!r || !isDM(r, uid()) || !r.practice?.active) return;
      const sc = findScene(r, r.practice.sceneId);
      if (!sc || r.activeSceneId !== sc.id) return cb && cb({ error: 'Go back to the practice scene first' });
      const heroes = sc.tokens.filter((t) => t.kind === 'pc');
      const cx = heroes.length ? Math.round(heroes.reduce((s, t) => s + t.x, 0) / heroes.length) : Math.floor(sc.grid.w / 2);
      const cy = heroes.length ? Math.round(heroes.reduce((s, t) => s + t.y, 0) / heroes.length) : Math.floor(sc.grid.h / 2);
      for (const [i, m] of (Array.isArray(monsters) ? monsters : []).slice(0, 4).entries()) {
        const tok = sceneFrom({ w: sc.grid.w, h: sc.grid.h, tokens: [{ ...m, kind: 'monster', x: 0, y: 0 }] }).tokens[0];
        Object.assign(tok, placeFree(sc, clampInt(cx + (i % 2 ? 3 : -3), 1, sc.grid.w - 2), clampInt(cy - 2, 1, sc.grid.h - 2), tok.id));
        sc.tokens.push(tok);
      }
      r.practice.stage = 'fight';
      r.autoMonsters = true;
      r.combat = { active: true, order: [], turnIndex: 0, round: 0 };
      logAndBroadcast(r, { type: 'combat', text: 'A sparring fight! Roll initiative.' });
      touch();
      broadcastRoom(r.code);
      cb && cb({ ok: true });
    });

    socket.on('practiceStage', ({ stage } = {}) => {
      const r = room();
      if (!r || !isDM(r, uid()) || !r.practice?.active || !['explore', 'fight', 'after'].includes(stage)) return;
      // After the sparring fight whatever is left of it scurries off.
      const sc = stage === 'after' && findScene(r, r.practice.sceneId);
      if (sc && sc.tokens.some((t) => t.kind === 'monster')) {
        sc.tokens = sc.tokens.filter((t) => t.kind !== 'monster');
        logAndBroadcast(r, { type: 'story', text: 'The last rats scurry off into the dark. Fight over!' });
      }
      r.practice.stage = stage;
      broadcastRoom(r.code);
    });

    // Done: the practice scene goes, the table goes back where it was, and
    // every sheet is as it was before (saved to the hero too, in case a
    // player's own change during practice reached it).
    socket.on('practiceEnd', (_, cb) => {
      const r = room();
      if (!r || !isDM(r, uid()) || !r.practice?.active) return;
      const p = r.practice;
      const snap = r.practiceSnap || {};
      for (const [id, saved] of Object.entries(snap)) {
        const sh = r.charSheets[id];
        if (!sh) continue;
        const now = { ...sh, ...saved };
        for (const k of SNAP_KEYS) if (!(k in saved)) delete now[k];
        if (JSON.stringify(snapshot(sh)) === JSON.stringify(saved)) continue;
        r.charSheets[id] = now;
        if (/^[a-f0-9]{24}$/.test(id)) { const { ownerId, derived, ...sheet } = now; Character.updateOne({ _id: id }, { $set: { sheet, updatedAt: new Date() } }).catch(() => {}); }
      }
      delete r.practiceSnap;
      r.combat = { active: false, order: [], turnIndex: 0, round: 0 };
      r.autoMonsters = p.autoMonsters;
      const back = findScene(r, p.prevSceneId) || r.scenes.find((s) => s.id !== p.sceneId);
      r.scenes = r.scenes.filter((s) => s.id !== p.sceneId);
      if (back) { r.activeSceneId = back.id; ensurePartyTokens(r, back); }
      r.practice = { active: false, done: p.done, endedAt: Date.now(), startedAt: p.startedAt };
      logAndBroadcast(r, { type: 'reward', text: 'Practice round over. Everyone is ready to play!' });
      touch();
      broadcastRoom(r.code);
      saveRoom(r, { force: true });
      cb && cb({ ok: true });
    });
  }

  return { register };
}

module.exports = { create, marksFor };
