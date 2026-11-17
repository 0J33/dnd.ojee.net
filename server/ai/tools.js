const Campaign = require('../models/Campaign');
const srd = require('../srd/store');
const kit = require('./kit.cjs');
const proposals = require('./proposals');
const { activeRooms, migrateRoom, getActiveScene, findScene, findToken } = require('../socket/roomState');

// The one tool registry behind both AI routes: the MCP server (ai/mcp.js) and
// the DM's in-app assistant (ai/routes.js, the loop runs in the browser).
//
// A tool: { name, title, description, kind: 'read' | 'write', input_schema,
// run(ctx, input) }. ctx: { userId, source: 'mcp' | 'assistant', client,
// readOnly, campaigns (allowed codes, [] = all), autoApply }.
//
// Read tools answer straight away. Write tools never touch the table: they
// make a proposal (ai/proposals.js) the DM accepts, rejects or edits in the
// game, and answer with its id and "pending DM approval".
//
// Everything a write does is built from the socket actions the DM's own
// clicks send (handlers.js): addScene, paintScene, addBeat, addTokens,
// placeObject, dmNarrate... so it is checked, broadcast and saved the same.

const str = (v, n = 200) => String(v ?? '').slice(0, n);
const int = (v, lo, hi, d = lo) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const tileName = (ch) => kit.TILES[ch]?.name || null;

// ---------------- campaigns and access ----------------

const isTheirDm = (room, userId) => (room.mode === 'guided' ? room.hostId === userId : room.dmId === userId);

async function campaignsFor(ctx) {
  const docs = await Campaign.find({ memberIds: ctx.userId }).sort({ lastActivity: -1 }).limit(40).lean();
  return docs.map((d) => {
    const live = activeRooms.get(d.code);
    const st = live || d.state;
    return {
      code: d.code, name: st.name, mode: st.mode, youAreDm: isTheirDm(st, ctx.userId),
      allowed: isTheirDm(st, ctx.userId) && (!ctx.campaigns?.length || ctx.campaigns.includes(d.code)),
      players: (st.members || []).filter((m) => m.userId !== st.dmId).map((m) => m.username),
      online: live ? live.members.filter((m) => m.socketId).length : 0,
      scenes: (st.scenes || []).length, beats: st.story?.beats?.length || 0, lastActivity: d.lastActivity,
    };
  });
}

/** The room this tool may use, read-only: live if loaded, else the saved copy. Throws when not allowed. */
async function roomFor(ctx, code) {
  let c = String(code || '').toUpperCase().trim();
  if (!c) {
    const mine = (await campaignsFor(ctx)).filter((x) => x.allowed);
    if (mine.length === 1) c = mine[0].code;
    else throw new Error('Say which campaign: pass `campaign` (a code from list_campaigns).');
  }
  if (ctx.campaigns?.length && !ctx.campaigns.includes(c)) throw new Error(`This token is not allowed to use campaign ${c}.`);
  let room = activeRooms.get(c);
  if (!room) {
    const doc = await Campaign.findOne({ code: c }).lean();
    if (!doc) throw new Error(`No campaign ${c}.`);
    room = migrateRoom(JSON.parse(JSON.stringify(doc.state)));
  }
  if (!isTheirDm(room, ctx.userId)) throw new Error(`You are not the DM of ${c}; the AI tools work on campaigns you run.`);
  return room;
}

const sceneOr = (room, id) => (id ? findScene(room, id) : getActiveScene(room));
function needScene(room, id) {
  const s = sceneOr(room, id);
  if (!s) throw new Error(`No scene ${id} in this campaign (see get_campaign).`);
  return s;
}

// ---------------- summaries ----------------

function heroLine(sheet, id) {
  if (!sheet) return null;
  const d = sheet.derived || {};
  return {
    character_id: id, name: sheet.name, level: sheet.level || 1, race: sheet.raceName || sheet.race, class: sheet.className || sheet.classIndex,
    subclass: sheet.subclassName || sheet.subclass || null, hp: sheet.currentHp, max_hp: sheet.maxHp, temp_hp: sheet.tempHp || 0, ac: d.ac ?? null,
    passive_perception: d.passivePerception ?? null, conditions: sheet.conditions || [], xp: sheet.xp || 0,
  };
}

function tokenLine(t) {
  return {
    id: t.id, kind: t.kind, label: t.label, x: t.x, y: t.y, size: t.size || 1, hp: t.hp ?? null, max_hp: t.maxHp ?? null, ac: t.ac ?? null,
    hidden: !!t.hidden, dead: !!t.dead, monster: t.monsterIndex || null, conditions: t.conditions || [], note: t.note || '', dm_note: t.dmNote || '',
    ...(t.characterId ? { character_id: t.characterId } : {}), ...(t.shop ? { shop: t.shop } : {}), ...(t.patrol?.length ? { patrols: true } : {}),
  };
}

function sceneLine(room, s) {
  return {
    id: s.id, name: s.name, active: s.id === room.activeSceneId, size: `${s.grid.w}x${s.grid.h}`, floor: s.bg?.floor || 'stone', fog: !!s.fogEnabled,
    creatures: s.tokens.filter((t) => t.kind === 'monster' && !t.dead).length, npcs: s.tokens.filter((t) => t.kind === 'npc').length,
    objects: (s.objects || []).length, notes: (s.notes || '').slice(0, 160),
  };
}

function legendFor(cells) {
  const seen = new Map();
  for (const row of cells) for (const ch of row) if (!seen.has(ch)) seen.set(ch, tileName(ch) || '?');
  return Object.fromEntries(seen);
}

// ---------------- SRD helpers ----------------

const norm = (s) => String(s || '').toLowerCase();
function monsterToken(index, { label, hidden = true } = {}) {
  const m = srd.byIndex.monsters.get(index);
  if (!m) throw new Error(`No SRD monster "${index}" (search_srd kind=monster).`);
  const ac = Array.isArray(m.armor_class) && m.armor_class.length ? m.armor_class[0].value : 10;
  const act = (m.actions || []).find((a) => a.attack_bonus !== undefined && a.damage && a.damage.length);
  const dmg = act && (act.damage.find((d) => d.damage_dice) || act.damage[0]);
  const walk = parseInt(String(m.speed?.walk || '30'), 10) || 30;
  const size = { Large: 2, Huge: 3, Gargantuan: 4 }[m.size] || 1;
  return {
    kind: 'monster', label: label || m.name, monsterIndex: m.index, monsterType: m.type || null, art: null, color: '#8a3d3d',
    hp: m.hit_points, maxHp: m.hit_points, ac, size, speedCells: Math.max(1, Math.round(walk / 5)), xpValue: m.xp, hidden,
    attack: act ? { name: act.name, bonus: act.attack_bonus, damage: dmg?.damage_dice || '1d4', damageType: dmg?.damage_type ? dmg.damage_type.name.toLowerCase() : 'bludgeoning' } : null,
  };
}
function monsterGroupTokens(groups, hidden) {
  const out = [];
  for (const g of groups) {
    const n = int(g.count, 1, 12, 1);
    for (let i = 0; i < n; i++) {
      const base = monsterToken(g.index, { hidden });
      out.push({ ...base, label: n > 1 ? `${base.label} ${i + 1}`.slice(0, 40) : base.label });
    }
  }
  return out.slice(0, 24);
}
function statBlock(m) {
  const mod = (v) => { const n = Math.floor((v - 10) / 2); return n >= 0 ? `+${n}` : `${n}`; };
  return {
    index: m.index, name: m.name, size: m.size, type: m.type, alignment: m.alignment, cr: m.challenge_rating, xp: m.xp,
    ac: m.armor_class?.[0]?.value, hp: m.hit_points, hit_dice: m.hit_dice, speed: m.speed,
    abilities: Object.fromEntries(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((k) => [k.slice(0, 3), `${m[k]} (${mod(m[k])})`])),
    senses: m.senses, languages: m.languages, immunities: m.damage_immunities, resistances: m.damage_resistances, condition_immunities: (m.condition_immunities || []).map((c) => c.name),
    traits: (m.special_abilities || []).map((a) => `${a.name}: ${a.desc}`),
    actions: (m.actions || []).map((a) => `${a.name}: ${a.desc}`),
    legendary: (m.legendary_actions || []).map((a) => `${a.name}: ${a.desc}`),
  };
}

function partyFor(room, input = {}) {
  const sheets = Object.values(room.charSheets || {}).filter(Boolean);
  const p = kit.partyOf(sheets);
  return { level: int(input.level ?? p.level, 1, 20, 1), size: int(input.party_size ?? input.size ?? p.size, 1, 8, 4) };
}
function rateEncounter(groups, party) {
  const xp = groups.reduce((n, g) => n + (srd.byIndex.monsters.get(g.index)?.xp || 0) * int(g.count, 1, 30, 1), 0);
  const b = { low: kit.budgetFor(party.level, party.size, 'low'), moderate: kit.budgetFor(party.level, party.size, 'moderate'), high: kit.budgetFor(party.level, party.size, 'high') };
  const rating = xp > b.high * 1.5 ? 'deadly (well over the high budget)' : xp > b.high ? 'above high' : xp > b.moderate ? 'high' : xp > b.low ? 'moderate' : 'low';
  return { total_xp: xp, budgets: b, rating, party };
}

// ---------------- building proposal items ----------------

const SCENE_FIELDS = [{ path: 'steps.0.payload.name', label: 'Scene name', max: 60 }, { path: 'steps.0.payload.notes', label: 'DM notes', multiline: true, max: 4000 }];

/** A scene payload (for addScene) from template / builtin / generator / rows. */
function scenePayload(input, seed) {
  const src = input.source || input;
  let scene;
  if (src.template) {
    const t = kit.SCENE_TEMPLATES.find((x) => x.key === src.template);
    if (!t) throw new Error(`No template "${src.template}" (see map_kit).`);
    scene = kit.sceneFromTemplate(t, { seed, name: input.name });
  } else if (src.builtin) {
    const b = kit.sceneFromBuiltin(src.builtin);
    if (!b) throw new Error(`No built-in map "${src.builtin}" (see map_kit).`);
    scene = { ...b, tokens: [], notes: b.blurb };
    scene.entry = kit.entryOf(scene.cells);
  } else if (src.generator) {
    const g = typeof src.generator === 'string' ? { kind: src.generator } : src.generator;
    if (!kit.GENERATORS[g.kind]) throw new Error(`No generator "${g.kind}" (see map_kit).`);
    const w = int(g.w, 12, 60, 26), h = int(g.h, 10, 40, 18);
    const { cells, floor } = kit.generateMap(g.kind, w, h, seed);
    scene = { cells, floor, w, h, tokens: [], entry: kit.entryOf(cells) };
  } else if (Array.isArray(src.rows) && src.rows.length) {
    const rows = src.rows.slice(0, 60).map((r) => str(r, 80));
    const w = Math.max(8, ...rows.map((r) => r.length)), h = Math.max(8, rows.length);
    scene = { cells: rows, floor: input.floor || 'stone', w, h, tokens: [] };
    scene.entry = kit.entryOf(rows.map((r) => r.padEnd(w, '.')).concat(Array(Math.max(0, h - rows.length)).fill('.'.repeat(w))));
  } else {
    scene = { cells: null, floor: input.floor || 'stone', w: int(input.w, 8, 80, 26), h: int(input.h, 8, 60, 18), tokens: [] };
  }
  const tokens = (scene.tokens || []).slice();
  for (const n of input.npcs || []) tokens.push(npcToken(n, scene));
  return {
    name: str(input.name || scene.name || 'New scene', 60), floor: input.floor || scene.floor || 'stone', w: scene.w, h: scene.h, cells: scene.cells,
    fogEnabled: input.fog ?? scene.fogEnabled ?? false, notes: str(input.notes ?? scene.notes ?? '', 4000), entry: scene.entry || null, tokens,
    mood: { time: 'auto', weather: 'none', light: 1, music: 'auto', ...(scene.mood || {}), ...(input.mood || {}) },
  };
}

function npcToken(n, scene) {
  const preset = kit.NPC_PRESETS.find((p) => p.key === n.preset || p.key === n.role_preset);
  const statsFrom = n.stats_from || preset?.stats;
  const base = statsFrom && srd.byIndex.monsters.get(statsFrom) ? monsterToken(statsFrom, { hidden: !!n.hidden }) : {};
  const free = scene && scene.cells ? spotNear(scene, n.x, n.y) : { x: int(n.x, 0, 79, 2), y: int(n.y, 0, 59, 2) };
  return {
    ...base, kind: 'npc', label: str(n.name || (preset ? `The ${preset.role.toLowerCase()}` : 'Someone'), 40), art: 'humanoid', color: preset?.color || '#c98a4b',
    note: str(n.note ?? preset?.note ?? '', 400), body: ['feminine', 'masculine', 'neutral'].includes(n.body) ? n.body : null, hidden: !!n.hidden,
    x: free.x, y: free.y, ...(n.hp ? { hp: n.hp, maxHp: n.hp } : {}),
  };
}
function spotNear(scene, x, y) {
  const cells = scene.cells, h = cells.length, w = cells[0].length;
  const ok = (cx, cy) => cy >= 0 && cy < h && cx >= 0 && cx < w && !kit.TILES[cells[cy][cx]]?.blocked;
  const sx = Number.isInteger(x) ? x : Math.floor(w / 2), sy = Number.isInteger(y) ? y : Math.floor(h / 2);
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(sx + dx, sy + dy)) return { x: sx + dx, y: sy + dy };
  return { x: sx, y: sy };
}

let refN = 0;
const autoRef = (p) => `${p}${Date.now().toString(36)}${(refN++).toString(36)}`;

function sceneItem(payload, ref, kind = 'prep') {
  const { mood, ...add } = payload;
  const steps = [{ event: 'addScene', payload: add }];
  if (mood) steps.push({ event: 'updateScene', payload: { sceneId: `$ref:${ref}`, patch: { mood } } });
  const npcs = (add.tokens || []).filter((t) => t.kind === 'npc').map((t) => t.label);
  return {
    ref, kind, title: `Add the scene "${add.name}"`,
    summary: `${add.w}x${add.h} ${add.floor} map${add.fogEnabled ? ', fog on' : ''}${npcs.length ? `; people: ${npcs.join(', ')}` : ''}. Added to the scene list (the table stays where it is).`,
    steps, fields: SCENE_FIELDS,
    preview: add.cells ? { type: 'scene', cells: add.cells, floor: add.floor, w: add.w, h: add.h, tokens: (add.tokens || []).map((t) => ({ x: t.x, y: t.y, kind: t.kind, label: t.label })), legend: legendFor(add.cells) } : null,
  };
}

function beatItem(b, sceneRef) {
  const encounter = (b.encounter || []).map((e) => {
    const index = str(e.monster_index || e.index, 80);
    const m = srd.byIndex.monsters.get(index);
    if (!m) throw new Error(`No SRD monster "${index}" for the beat "${b.title}".`);
    return { monsterIndex: index, name: m.name, count: int(e.count, 1, 12, 1) };
  });
  const payload = { title: str(b.title || 'New beat', 80), sceneId: sceneRef || b.scene_id || null, readAloud: str(b.read_aloud || '', 2000), notes: str(b.notes || '', 4000), encounter };
  return {
    ref: b.ref || autoRef('b'), kind: 'prep', title: `Story beat: ${payload.title}`,
    summary: `${encounter.length ? `Encounter: ${kit.describeEncounter(encounter.map((e) => ({ name: e.name, count: e.count })))}. ` : ''}Read-aloud ${payload.readAloud ? `(${payload.readAloud.length} chars)` : 'none'}.`,
    steps: [{ event: 'addBeat', payload }],
    fields: [{ path: 'steps.0.payload.title', label: 'Title', max: 80 }, { path: 'steps.0.payload.readAloud', label: 'Read-aloud', multiline: true, max: 2000 }, { path: 'steps.0.payload.notes', label: 'DM notes', multiline: true, max: 4000 }],
    preview: payload.readAloud ? { type: 'text', text: payload.readAloud } : null,
  };
}

const OBJECT_KINDS = ['trap', 'secret', 'chest', 'lever', 'note', 'exit', 'zone'];
function objectPayload(o) {
  const kind = OBJECT_KINDS.includes(o.kind) ? o.kind : 'zone';
  const effects = [];
  if (Array.isArray(o.effects) && o.effects.length) effects.push(...o.effects);
  else if (kind === 'trap') effects.push({ type: 'damage', damage: o.damage || '2d6', damageType: o.damage_type || 'piercing', save: o.save || 'dex', saveDc: int(o.dc, 5, 30, 12), text: str(o.text || 'A trap springs!', 1200) });
  else if (kind === 'chest') effects.push({ type: 'loot', text: str(o.text || o.loot_text || 'Some coins.', 1200), items: (o.items || []).slice(0, 12) });
  else if (kind === 'exit') effects.push({ type: 'goto', toScene: o.to_scene || null, text: str(o.text || '', 1200) });
  else if (kind === 'lever') effects.push({ type: 'doors' });
  else effects.push({ type: 'text', text: str(o.text || '', 1200), private: kind === 'note' || !!o.private });
  return {
    kind, name: str(o.name || kind, 60), x: int(o.x, 0, 79, 1), y: int(o.y, 0, 59, 1), hidden: o.hidden ?? ['trap', 'secret', 'zone'].includes(kind), dc: int(o.dc ?? 12, 0, 30, 12),
    trigger: o.trigger, once: o.once, effects,
  };
}
function objectItem(o, sceneRef, kind = 'prep') {
  const payload = objectPayload(o);
  const text = payload.effects.map((e) => e.text).filter(Boolean).join(' ');
  return {
    ref: autoRef('o'), kind, title: `Place ${payload.hidden ? 'a hidden ' : 'a '}${payload.kind}: ${payload.name}`,
    summary: `At (${payload.x}, ${payload.y})${payload.kind === 'trap' || payload.kind === 'secret' ? `, DC ${payload.dc}` : ''}. ${text}`.slice(0, 400),
    steps: [{ event: 'placeObject', payload: { sceneId: sceneRef, object: payload } }],
    fields: [{ path: 'steps.0.payload.object.name', label: 'Name', max: 60 }, ...(payload.effects[0]?.text !== undefined ? [{ path: 'steps.0.payload.object.effects.0.text', label: 'Text', multiline: true, max: 1200 }] : [])],
  };
}

async function propose(ctx, room, { title, why, items }) {
  if (ctx.readOnly) throw new Error('This token is read-only.');
  const p = await proposals.createProposal({ userId: ctx.userId, code: room.code, source: ctx.source, client: ctx.client, title, why, items, autoApply: !!ctx.autoApply });
  const pub = proposals.publicProposal(p);
  const applied = pub.items.filter((i) => i.status === 'applied').length;
  return {
    proposal_id: pub.id,
    status: pub.status === 'applied' ? 'applied_pending_review' : 'pending_dm_approval',
    message: applied
      ? `${applied} of ${pub.items.length} change(s) were applied (auto-apply is on for preparation) and wait in the DM's review queue, where they can be kept or undone. The rest wait for the DM to accept them.`
      : `Sent to the DM's review queue: nothing has changed yet. The DM can accept, reject or edit each change in the game. Check later with proposal_status("${pub.id}").`,
    items: pub.items.map((i) => ({ id: i.id, ref: i.ref, title: i.title, status: i.status, error: i.error })),
  };
}

// ---------------- the tools ----------------

const CAMPAIGN = { type: 'string', description: 'Campaign code (6 characters) from list_campaigns. Optional when you run only one campaign.' };
const SCENE_ID = { type: 'string', description: 'Scene id from get_campaign. Omit for the scene the table is on now.' };
const MOOD = {
  type: 'object', description: 'Lighting, weather and music for the scene.',
  properties: {
    time: { type: 'string', enum: ['auto', 'day', 'dusk', 'night'] }, weather: { type: 'string', enum: ['none', 'rain', 'snow', 'fog', 'ash', 'embers'] },
    light: { type: 'number', description: '0.2 (dark) to 2 (bright), 1 normal' }, music: { type: 'string', enum: ['auto', 'explore', 'tavern', 'sneak', 'tension', 'combat', 'boss', 'rest', 'silence'] },
  },
};
const NPC = {
  type: 'object', required: ['name'],
  properties: {
    name: { type: 'string', description: 'Shown on the map, e.g. "Marta the innkeeper"' }, preset: { type: 'string', description: 'NPC preset key from map_kit (innkeeper, guard, merchant...)' },
    stats_from: { type: 'string', description: 'SRD monster index whose HP/AC/attack the NPC borrows (commoner, guard, noble, spy...)' }, note: { type: 'string', description: 'What players may know about them' },
    x: { type: 'integer' }, y: { type: 'integer' }, hidden: { type: 'boolean' }, body: { type: 'string', enum: ['feminine', 'masculine', 'neutral'] },
  },
};
const SCENE_SOURCE = {
  type: 'object', description: 'Exactly one of: template (a furnished generated scene with people), builtin (a hand-made map), generator (a random map of a kind), rows (your own grid of tile characters, see map_kit legend).',
  properties: {
    template: { type: 'string', description: 'tavern | crypt | clearing | cave | ambush | throne | corridor | dungeon | camp | ruins' },
    builtin: { type: 'string', description: 'A built-in map key from map_kit' },
    generator: { type: 'object', properties: { kind: { type: 'string' }, w: { type: 'integer' }, h: { type: 'integer' } }, required: ['kind'] },
    rows: { type: 'array', items: { type: 'string' }, description: 'One string per map row, one tile character per square (max 80x60)' },
  },
};
const MONSTERS = { type: 'array', items: { type: 'object', required: ['index'], properties: { index: { type: 'string', description: 'SRD monster index, e.g. goblin' }, count: { type: 'integer', minimum: 1, maximum: 12 } } } };
const TO = { description: '"all" (default), or a player userId / list of userIds from get_campaign for a private message', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] };

const TOOLS = [];
const tool = (t) => TOOLS.push(t);

tool({
  name: 'list_campaigns', title: 'List campaigns', kind: 'read',
  description: 'The campaigns you are in, which ones you run as DM (the AI tools work on those), who plays and whether a session is live.',
  input_schema: { type: 'object', properties: {} },
  run: async (ctx) => ({ campaigns: await campaignsFor(ctx) }),
});

tool({
  name: 'get_campaign', title: 'Campaign overview', kind: 'read',
  description: 'One campaign at a glance: players (userIds for private messages), the party (level, class, HP, AC), every scene (id, size, creatures), the story beats, combat, settings. Start here.',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const st = room.story || { beats: [] };
    return {
      code: room.code, name: room.name, mode: room.mode, leveling: room.settings?.leveling || 'xp', monsters_act_on_their_own: !!room.autoMonsters,
      live: room.members.some((m) => m.socketId),
      players: room.members.filter((m) => m.userId !== room.dmId).map((m) => ({ user_id: m.userId, name: m.username, character_id: m.characterId, online: !!m.socketId })),
      party: Object.entries(room.charSheets || {}).map(([id, s]) => heroLine(s, id)).filter(Boolean),
      party_for_encounters: partyFor(room),
      active_scene_id: room.activeSceneId,
      scenes: room.scenes.map((s) => sceneLine(room, s)),
      story: st.beats.map((b, i) => ({ n: i + 1, id: b.id, title: b.title, scene_id: b.sceneId, done: !!b.done, active: st.activeBeatId === b.id, encounter: b.encounter })),
      combat: room.combat?.active ? { round: room.combat.round, turn: room.combat.order[room.combat.turnIndex]?.name || null, order: room.combat.order.map((o) => `${o.name} (${o.initiative})`) } : null,
    };
  },
});

tool({
  name: 'get_scene', title: 'Scene detail', kind: 'read',
  description: 'A scene in full: its map grid (one tile character per square, with a legend), every creature/NPC (hidden ones too) with position and HP, objects (traps, secrets, chests, exits), DM notes and mood.',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN, scene_id: SCENE_ID, include_map: { type: 'boolean', description: 'Include the grid rows (default true)' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    return {
      ...sceneLine(room, s), notes: s.notes || '', mood: s.mood, entry: s.entry || null,
      ...(input.include_map === false ? {} : { map_rows: s.cells, legend: legendFor(s.cells) }),
      tokens: s.tokens.map(tokenLine),
      objects: (s.objects || []).map((o) => ({ id: o.id, kind: o.kind, name: o.name, x: o.x, y: o.y, hidden: !!o.hidden, dc: o.dc, used: !!o.used, effects: o.effects })),
      levels: (s.levels || []).map((l) => ({ id: l.id, name: l.name, hidden: !!l.hidden })),
    };
  },
});

tool({
  name: 'get_story', title: 'Story outline', kind: 'read',
  description: 'Every story beat in order with its scene, read-aloud text, DM notes and encounter.',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const names = Object.fromEntries(room.scenes.map((s) => [s.id, s.name]));
    return { active_beat_id: room.story?.activeBeatId || null, beats: (room.story?.beats || []).map((b, i) => ({ n: i + 1, ...b, scene_name: names[b.sceneId] || null })) };
  },
});

tool({
  name: 'get_party', title: 'Party sheets', kind: 'read',
  description: 'The heroes\' sheets (read-only): abilities, saves and skills they are proficient in, HP, AC, features, spells, gear, coins, conditions, plus the DM\'s private note on each.',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    return {
      heroes: Object.entries(room.charSheets || {}).map(([id, s]) => s && ({
        ...heroLine(s, id), abilities: s.abilities, saves: s.profSaves, skills: s.profSkills, expertise: s.expertiseSkills, speed: s.speed, background: s.background, alignment: s.alignment,
        features: (s.features || []).map((f) => f.name), spells: s.spellcasting ? { known: s.spellcasting.known, prepared: s.spellcasting.prepared, cantrips: s.spellcasting.cantrips, slots: s.spellcasting.slots } : null,
        equipment: (s.equipment || []).map((e) => `${e.qty > 1 ? `${e.qty} x ` : ''}${e.name}`), coins: s.coins, dm_note: room.dmNotes?.[id] || '',
      })).filter(Boolean),
    };
  },
});

tool({
  name: 'get_table_log', title: 'Recent table log', kind: 'read',
  description: 'What just happened at the table: the latest log lines (rolls, attacks, scene changes, narration) and chat. Use it to answer "what now?".',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN, limit: { type: 'integer', minimum: 1, maximum: 80 } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const n = int(input.limit, 1, 80, 30);
    const clean = kit.makeFilter({ level: 'standard' });
    return {
      log: (room.log || []).slice(-n).map((l) => ({ type: l.type, text: clean(l.text || '').text, ts: l.ts })),
      chat: (room.chat || []).filter((c) => !c.whisperTo).slice(-n).map((c) => ({ from: c.username, kind: c.kind, text: c.text ? clean(c.text).text : c.roll ? `${c.roll.label || 'roll'}: ${c.roll.total}` : '', ts: c.ts })),
    };
  },
});

tool({
  name: 'search_srd', title: 'Search the SRD', kind: 'read',
  description: 'Search the open 5e SRD the app ships: monsters (filter by CR/type), spells (level/class), equipment, magic items, conditions and rules sections. Only SRD/open content exists here.',
  input_schema: {
    type: 'object', required: ['kind'], properties: {
      kind: { type: 'string', enum: ['monster', 'spell', 'equipment', 'magic_item', 'condition', 'rule'] }, query: { type: 'string' },
      cr_min: { type: 'number' }, cr_max: { type: 'number' }, type: { type: 'string', description: 'monster type, e.g. undead' }, level: { type: 'integer' }, class: { type: 'string' }, limit: { type: 'integer', maximum: 60 },
    },
  },
  run: async (ctx, input) => {
    const q = norm(input.query), lim = int(input.limit, 1, 60, 20);
    const hit = (s) => !q || norm(s).includes(q);
    switch (input.kind) {
      case 'monster': return srd.monsterSummaries.filter((m) => hit(m.name) && (input.cr_min == null || m.cr >= input.cr_min) && (input.cr_max == null || m.cr <= input.cr_max) && (!input.type || norm(m.type) === norm(input.type))).slice(0, lim);
      case 'spell': return srd.spellSummaries.filter((s) => hit(s.name) && (input.level == null || s.level === input.level) && (!input.class || (s.classes || []).includes(norm(input.class)))).slice(0, lim);
      case 'equipment': return srd.equipmentSummaries.filter((e) => hit(e.name)).slice(0, lim);
      case 'magic_item': return srd.magicItemSummaries.filter((e) => hit(e.name)).slice(0, lim);
      case 'condition': return srd.raw.conditions.filter((c) => hit(c.name)).map((c) => ({ index: c.index, name: c.name, desc: c.desc }));
      case 'rule': return srd.raw.ruleSections.filter((r) => hit(r.name) || (q && norm(r.desc).includes(q))).slice(0, lim).map((r) => ({ index: r.index, name: r.name, excerpt: srd.briefOf(r.desc.replace(/^#+.*$/gm, ''), 240) }));
      default: throw new Error('kind must be monster, spell, equipment, magic_item, condition or rule');
    }
  },
});

tool({
  name: 'get_srd', title: 'SRD entry', kind: 'read',
  description: 'The full SRD entry by index: a monster\'s stat block, a spell, an item, a magic item, a condition or a rules section.',
  input_schema: { type: 'object', required: ['kind', 'index'], properties: { kind: { type: 'string', enum: ['monster', 'spell', 'equipment', 'magic_item', 'condition', 'rule'] }, index: { type: 'string' } } },
  run: async (ctx, input) => {
    const i = str(input.index, 100);
    const map = { monster: 'monsters', spell: 'spells', equipment: 'equipment', magic_item: 'magicItems', condition: 'conditions', rule: 'ruleSections' };
    const e = srd.byIndex[map[input.kind]]?.get(i);
    if (!e) throw new Error(`No ${input.kind} "${i}" (search_srd first).`);
    if (input.kind === 'monster') return statBlock(e);
    if (input.kind === 'rule') return { index: e.index, name: e.name, text: e.desc.slice(0, 6000) };
    const { url, ...rest } = e;
    return rest;
  },
});

tool({
  name: 'map_kit', title: 'Map and prep kit', kind: 'read',
  description: 'What scenes can be built from: scene templates, map generators, built-in maps, the tile legend (characters for map rows), floors, encounter themes, NPC presets, trap/loot presets and quick-campaign starters.',
  input_schema: { type: 'object', properties: {} },
  run: async () => ({
    templates: kit.SCENE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, size: `${t.w}x${t.h}`, theme: t.theme, blurb: t.blurb })),
    generators: Object.entries(kit.GENERATORS).map(([k, g]) => ({ key: k, name: g.name, floor: g.floor })),
    builtin_maps: kit.BUILTIN_SCENES.map((b) => ({ key: b.key, name: b.name, category: b.category, blurb: b.blurb, size: `${Math.max(...b.cells.map((r) => r.length))}x${b.cells.length}` })),
    tiles: Object.values(kit.TILES).map((t) => ({ ch: t.ch, name: t.name, group: t.group, blocks: !!t.blocked, difficult: !!t.difficult })),
    floors: kit.FLOOR_MATERIALS.map((f) => f.key),
    encounter_themes: kit.ENCOUNTER_THEMES.map((t) => ({ key: t.key, name: t.name, blurb: t.blurb, creatures: t.pool.map((p) => `${p.index} (CR ${p.cr}, ${p.role})`) })),
    npc_presets: kit.NPC_PRESETS.map((p) => ({ key: p.key, role: p.role, stats: p.stats, note: p.note })),
    object_kinds: { trap: 'hidden, fires when stepped on (damage + save)', secret: 'hidden, found by searching', chest: 'loot', lever: 'opens/closes doors', note: 'private text', exit: 'walk onto it to go to another scene', zone: 'hidden event square' },
    quick_campaigns: kit.QUICK_CAMPAIGNS.map((q) => ({ key: q.key, name: q.name, blurb: q.blurb })),
  }),
});

tool({
  name: 'plan_encounter', title: 'Plan a balanced encounter', kind: 'read',
  description: 'Balance a fight with the app\'s XP budget (SRD 5.2 per-character budgets): build a group from a theme at a difficulty, or rate a group you chose. Uses the campaign\'s party level and size unless given.',
  input_schema: {
    type: 'object', properties: {
      campaign: CAMPAIGN, theme: { type: 'string', description: 'Encounter theme key from map_kit' }, monsters: MONSTERS,
      difficulty: { type: 'string', enum: ['low', 'moderate', 'high'] }, level: { type: 'integer' }, party_size: { type: 'integer' }, seed: { type: 'integer' },
    },
  },
  run: async (ctx, input) => {
    let party = { level: int(input.level, 1, 20, 1), size: int(input.party_size, 1, 8, 4) };
    if (input.campaign || (!input.level && !input.party_size)) {
      try { party = partyFor(await roomFor(ctx, input.campaign), input); } catch (err) { if (input.campaign) throw err; }
    }
    if (input.monsters?.length) return { monsters: input.monsters, ...rateEncounter(input.monsters, party) };
    const enc = kit.buildEncounter(input.theme || 'goblins', { level: party.level, size: party.size, difficulty: input.difficulty || 'moderate', seed: input.seed ?? Date.now() });
    return { theme: enc.theme, monsters: enc.groups.map((g) => ({ index: g.index, name: g.name, count: g.count, cr: g.cr, xp: g.xp })), described: kit.describeEncounter(enc.groups), total_xp: enc.total, budget: enc.budget, party };
  },
});

tool({
  name: 'proposal_status', title: 'Check proposals', kind: 'read',
  description: 'Whether the DM accepted, rejected or edited your proposed changes. With proposal_id: that one; without: your open and recent ones for the campaign.',
  input_schema: { type: 'object', properties: { proposal_id: { type: 'string' }, campaign: CAMPAIGN } },
  run: async (ctx, input) => {
    if (input.proposal_id) {
      const p = await proposals.load(input.proposal_id, ctx.userId);
      if (!p) throw new Error('No such proposal.');
      const pub = proposals.publicProposal(p);
      return { id: pub.id, title: pub.title, status: pub.status, items: pub.items.map((i) => ({ id: i.id, ref: i.ref, title: i.title, status: i.status, created_id: i.createdId, error: i.error })) };
    }
    const code = input.campaign ? (await roomFor(ctx, input.campaign)).code : null;
    return (await proposals.list(ctx.userId, { code, limit: 15 })).map((p) => ({ id: p.id, title: p.title, status: p.status, created: p.createdAt, items: p.items.map((i) => `${i.status}: ${i.title}`) }));
  },
});

// ---------- writes: preparation ----------

tool({
  name: 'create_scene', title: 'Create a scene', kind: 'write',
  description: 'Propose a new scene (a battle map): from a template (furnished, with its people), a built-in map, a generator, or your own rows of tile characters. Optional NPCs, notes, fog and mood. It joins the scene list; the table does not move.',
  input_schema: {
    type: 'object', required: ['name'], properties: {
      campaign: CAMPAIGN, name: { type: 'string' }, source: SCENE_SOURCE, floor: { type: 'string' }, notes: { type: 'string', description: 'DM-only prep notes' },
      fog: { type: 'boolean' }, mood: MOOD, npcs: { type: 'array', items: NPC }, why: { type: 'string', description: 'One line for the DM on why' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const ref = autoRef('s');
    const item = sceneItem(scenePayload(input, Date.now()), ref);
    return propose(ctx, room, { title: item.title, why: input.why, items: [item] });
  },
});

tool({
  name: 'update_scene', title: 'Change a scene', kind: 'write',
  description: 'Propose renaming a scene, rewriting its DM notes, fog on/off, or its mood (time of day, weather, light, music). On the scene the table is on, players see mood changes at once.',
  input_schema: { type: 'object', properties: { campaign: CAMPAIGN, scene_id: SCENE_ID, name: { type: 'string' }, notes: { type: 'string' }, fog: { type: 'boolean' }, mood: MOOD, why: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    const patch = {};
    if (input.name != null) patch.name = str(input.name, 60);
    if (input.notes != null) patch.notes = str(input.notes, 4000);
    if (input.fog != null) patch.fogEnabled = !!input.fog;
    if (input.mood) patch.mood = { ...(s.mood || {}), ...input.mood };
    if (!Object.keys(patch).length) throw new Error('Nothing to change.');
    const live = s.id === room.activeSceneId && (patch.mood || patch.fogEnabled != null || patch.name);
    const fields = [];
    if (patch.name != null) fields.push({ path: 'steps.0.payload.patch.name', label: 'Name', max: 60 });
    if (patch.notes != null) fields.push({ path: 'steps.0.payload.patch.notes', label: 'DM notes', multiline: true, max: 4000 });
    return propose(ctx, room, {
      title: `Change scene "${s.name}"`, why: input.why,
      items: [{ kind: live ? 'live' : 'prep', title: `Change scene "${s.name}"`, summary: Object.entries(patch).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 120)}`).join('; '), steps: [{ event: 'updateScene', payload: { sceneId: s.id, patch } }], fields }],
    });
  },
});

tool({
  name: 'paint_scene', title: 'Paint a map', kind: 'write',
  description: 'Propose terrain changes on a scene map: individual squares ({x, y, ch} with a tile character from map_kit), whole new rows, or a freshly generated map. On the live scene players see it at once.',
  input_schema: {
    type: 'object', properties: {
      campaign: CAMPAIGN, scene_id: SCENE_ID, cells: { type: 'array', items: { type: 'object', required: ['x', 'y', 'ch'], properties: { x: { type: 'integer' }, y: { type: 'integer' }, ch: { type: 'string' } } } },
      rows: { type: 'array', items: { type: 'string' } }, generator: { type: 'object', properties: { kind: { type: 'string' }, w: { type: 'integer' }, h: { type: 'integer' } } }, floor: { type: 'string' }, why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    const kind = s.id === room.activeSceneId ? 'live' : 'prep';
    let step, summary, cells = s.cells.slice();
    if (input.rows?.length || input.generator) {
      const p = scenePayload({ source: input.rows?.length ? { rows: input.rows } : { generator: input.generator }, floor: input.floor || s.bg?.floor }, Date.now());
      step = { event: 'reshapeScene', payload: { sceneId: s.id, w: p.w, h: p.h, cells: p.cells, floor: p.floor, fresh: !!input.generator } };
      summary = `Replace the map with a ${p.w}x${p.h} ${input.generator ? `generated ${input.generator.kind}` : 'drawn'} map.`;
      cells = p.cells;
    } else if (input.cells?.length) {
      const list = input.cells.slice(0, 6000).filter((c) => kit.TILES[c.ch]).map((c) => ({ x: int(c.x, 0, s.grid.w - 1), y: int(c.y, 0, s.grid.h - 1), ch: c.ch }));
      if (!list.length) throw new Error('No valid tile characters (see map_kit tiles).');
      step = { event: 'paintScene', payload: { sceneId: s.id, cells: list } };
      const counts = {};
      for (const c of list) { counts[c.ch] = (counts[c.ch] || 0) + 1; const row = cells[c.y].split(''); row[c.x] = c.ch; cells[c.y] = row.join(''); }
      summary = `Paint ${list.length} square(s): ${Object.entries(counts).map(([ch, n]) => `${n} ${tileName(ch)}`).join(', ')}.`;
    } else throw new Error('Give cells, rows or a generator.');
    return propose(ctx, room, { title: `Paint "${s.name}"`, why: input.why, items: [{ kind, title: `Paint the map of "${s.name}"`, summary, steps: [step], preview: { type: 'scene', cells, floor: s.bg?.floor || 'stone', w: cells[0].length, h: cells.length, tokens: s.tokens.map((t) => ({ x: t.x, y: t.y, kind: t.kind, label: t.label })), legend: legendFor(cells) } }] });
  },
});

tool({
  name: 'add_story_beat', title: 'Add a story beat', kind: 'write',
  description: 'Propose a story beat: a planned moment with a title, the scene it opens on, read-aloud text for the players, DM notes (secrets, clues, what happens if...), and the creatures waiting there (placed when the beat is run).',
  input_schema: {
    type: 'object', required: ['title'], properties: {
      campaign: CAMPAIGN, title: { type: 'string' }, scene_id: SCENE_ID, read_aloud: { type: 'string', description: 'Boxed text read to the players (2-5 vivid sentences)' },
      notes: { type: 'string' }, encounter: { type: 'array', items: { type: 'object', required: ['monster_index'], properties: { monster_index: { type: 'string' }, count: { type: 'integer' } } } }, why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    if (input.scene_id) needScene(room, input.scene_id);
    const item = beatItem(input, null);
    return propose(ctx, room, { title: item.title, why: input.why, items: [item] });
  },
});

tool({
  name: 'update_story_beat', title: 'Change a story beat', kind: 'write',
  description: 'Propose changes to a beat: title, read-aloud, notes, scene, encounter, or mark it done.',
  input_schema: {
    type: 'object', required: ['beat_id'], properties: {
      campaign: CAMPAIGN, beat_id: { type: 'string' }, title: { type: 'string' }, read_aloud: { type: 'string' }, notes: { type: 'string' }, scene_id: { type: 'string' },
      encounter: { type: 'array', items: { type: 'object', properties: { monster_index: { type: 'string' }, count: { type: 'integer' } } } }, done: { type: 'boolean' }, why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const beat = (room.story?.beats || []).find((b) => b.id === input.beat_id);
    if (!beat) throw new Error('No such beat (see get_story).');
    const patch = {};
    if (input.title != null) patch.title = str(input.title, 80);
    if (input.read_aloud != null) patch.readAloud = str(input.read_aloud, 2000);
    if (input.notes != null) patch.notes = str(input.notes, 4000);
    if (input.scene_id != null) patch.sceneId = input.scene_id;
    if (input.done != null) patch.done = !!input.done;
    if (input.encounter) patch.encounter = beatItem({ title: beat.title, encounter: input.encounter }).steps[0].payload.encounter;
    const fields = [];
    if (patch.title != null) fields.push({ path: 'steps.0.payload.patch.title', label: 'Title', max: 80 });
    if (patch.readAloud != null) fields.push({ path: 'steps.0.payload.patch.readAloud', label: 'Read-aloud', multiline: true, max: 2000 });
    if (patch.notes != null) fields.push({ path: 'steps.0.payload.patch.notes', label: 'DM notes', multiline: true, max: 4000 });
    return propose(ctx, room, { title: `Change beat "${beat.title}"`, why: input.why, items: [{ kind: 'prep', title: `Change beat "${beat.title}"`, summary: Object.keys(patch).join(', '), steps: [{ event: 'updateBeat', payload: { beatId: beat.id, patch } }], fields, preview: patch.readAloud ? { type: 'text', text: patch.readAloud } : null }] });
  },
});

tool({
  name: 'add_npc', title: 'Add an NPC', kind: 'write',
  description: 'Propose an NPC on a scene: a name, a role preset or SRD stats, where they stand, what players may know (note), the DM\'s private notes (motives, secrets, voice), optional merchant wares.',
  input_schema: {
    type: 'object', required: ['name'], properties: {
      campaign: CAMPAIGN, scene_id: SCENE_ID, ...NPC.properties, dm_note: { type: 'string', description: 'Private: personality, voice, motive, secret' },
      shop: { type: 'array', description: 'Wares to sell', items: { type: 'object', required: ['name', 'price'], properties: { name: { type: 'string' }, price: { type: 'number' }, kind: { type: 'string' }, desc: { type: 'string' }, stock: { type: 'integer' } } } }, why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    const t = npcToken(input, s);
    const ref = autoRef('n');
    const steps = [{ event: 'addToken', payload: { sceneId: s.id, token: t } }];
    if (input.dm_note) steps.push({ event: 'setDmNote', payload: { tokenId: `$ref:${ref}`, text: str(input.dm_note, 2000) } });
    if (input.shop?.length) steps.push({ event: 'updateToken', payload: { tokenId: `$ref:${ref}`, patch: { shop: { open: true, items: input.shop.slice(0, 30).map((w) => ({ item: { name: str(w.name, 60), kind: w.kind || 'gear', desc: str(w.desc, 300), qty: 1 }, price: Math.max(0, Number(w.price) || 0), stock: w.stock ?? null })) } } } });
    const live = s.id === room.activeSceneId && !t.hidden;
    return propose(ctx, room, {
      title: `Add ${t.label}`, why: input.why,
      items: [{ ref, kind: live ? 'live' : 'prep', title: `Add NPC ${t.label} to "${s.name}"`, summary: `At (${t.x}, ${t.y})${t.hidden ? ', hidden' : ''}. ${t.note}${input.dm_note ? ` DM note: ${input.dm_note}` : ''}`.slice(0, 500), steps,
        fields: [{ path: 'steps.0.payload.token.label', label: 'Name', max: 40 }, { path: 'steps.0.payload.token.note', label: 'What players know', multiline: true, max: 400 }, ...(input.dm_note ? [{ path: 'steps.1.payload.text', label: 'DM note', multiline: true, max: 2000 }] : [])] }],
    });
  },
});

tool({
  name: 'place_monsters', title: 'Place creatures', kind: 'write',
  description: 'Propose putting SRD creatures on a scene (hidden from players by default until revealed), around a square. Check balance with plan_encounter first.',
  input_schema: { type: 'object', required: ['monsters'], properties: { campaign: CAMPAIGN, scene_id: SCENE_ID, monsters: MONSTERS, x: { type: 'integer' }, y: { type: 'integer' }, hidden: { type: 'boolean', description: 'Default true' }, why: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    const hidden = input.hidden !== false;
    const tokens = monsterGroupTokens(input.monsters, hidden);
    const at = Number.isInteger(input.x) && Number.isInteger(input.y) ? { x: input.x, y: input.y } : kit.farPoint(s.cells, s.entry || kit.entryOf(s.cells));
    const rate = rateEncounter(input.monsters, partyFor(room));
    const live = s.id === room.activeSceneId && !hidden;
    return propose(ctx, room, {
      title: `Place ${kit.describeEncounter(input.monsters.map((m) => ({ name: srd.byIndex.monsters.get(m.index)?.name || m.index, count: int(m.count, 1, 12, 1) })))}`, why: input.why,
      items: [{ kind: live ? 'live' : 'prep', title: `Place ${tokens.length} creature(s) on "${s.name}"${hidden ? ' (hidden)' : ''}`, summary: `${tokens.map((t) => t.label).join(', ')} around (${at.x}, ${at.y}). ${rate.total_xp} XP: ${rate.rating} for a level ${rate.party.level} party of ${rate.party.size}.`, steps: [{ event: 'addTokens', payload: { sceneId: s.id, tokens, at, hidden } }] }],
    });
  },
});

tool({
  name: 'place_object', title: 'Place a trap, secret, chest...', kind: 'write',
  description: 'Propose a map object: a trap (hidden, damage + save when stepped on), a secret (found by searching), a chest of loot, a lever, a private note, an exit to another scene, or a hidden event zone.',
  input_schema: {
    type: 'object', required: ['kind', 'x', 'y'], properties: {
      campaign: CAMPAIGN, scene_id: SCENE_ID, kind: { type: 'string', enum: OBJECT_KINDS }, name: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, hidden: { type: 'boolean' },
      dc: { type: 'integer', description: 'DC to find (trap/secret) and the trap\'s save DC' }, text: { type: 'string', description: 'What happens / what is found / loot description' },
      damage: { type: 'string', description: 'Trap damage dice, e.g. 2d6' }, damage_type: { type: 'string' }, save: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
      items: { type: 'array', description: 'Chest items given to whoever opens it', items: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['weapon', 'armor', 'potion', 'gear', 'treasure'] }, qty: { type: 'integer' }, desc: { type: 'string' }, magic: { type: 'boolean' } } } },
      to_scene: { type: 'string', description: 'Exit: the scene id it leads to' }, why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    const item = objectItem(input, s.id, s.id === room.activeSceneId && input.hidden === false ? 'live' : 'prep');
    return propose(ctx, room, { title: item.title, why: input.why, items: [item] });
  },
});

tool({
  name: 'set_dm_note', title: 'DM note', kind: 'write',
  description: 'Propose the DM\'s private note on a hero (character_id) or a creature/NPC (token_id). Players never see it.',
  input_schema: { type: 'object', required: ['text'], properties: { campaign: CAMPAIGN, character_id: { type: 'string' }, token_id: { type: 'string' }, text: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const who = input.character_id ? room.charSheets?.[input.character_id]?.name : findToken(room, input.token_id).token?.label;
    if (!who) throw new Error('No such hero or token.');
    const payload = input.character_id ? { characterId: input.character_id, text: str(input.text, 2000) } : { tokenId: input.token_id, text: str(input.text, 2000) };
    return propose(ctx, room, { title: `DM note on ${who}`, items: [{ kind: 'prep', title: `DM note on ${who}`, summary: payload.text.slice(0, 300), steps: [{ event: 'setDmNote', payload }], fields: [{ path: 'steps.0.payload.text', label: 'Note', multiline: true, max: 2000 }] }] });
  },
});

tool({
  name: 'build_campaign', title: 'Build a campaign from a pitch', kind: 'write',
  description: 'Propose a whole adventure in one reviewable set: for each part, a scene (template / built-in / generated / drawn), its people, a story beat with read-aloud and notes, the encounter waiting there (balanced from a theme or listed creatures), secrets/traps and loot. The DM reviews every piece before anything is created. Use get_campaign for the party first.',
  input_schema: {
    type: 'object', required: ['title', 'parts'], properties: {
      campaign: CAMPAIGN, title: { type: 'string' }, pitch: { type: 'string', description: 'One paragraph: the hook and the arc' }, level: { type: 'integer' }, party_size: { type: 'integer' },
      parts: {
        type: 'array', maxItems: 12, items: {
          type: 'object', required: ['scene_name', 'beat_title'], properties: {
            scene_name: { type: 'string' }, source: SCENE_SOURCE, floor: { type: 'string' }, scene_notes: { type: 'string' }, fog: { type: 'boolean' }, mood: MOOD, npcs: { type: 'array', items: { ...NPC, properties: { ...NPC.properties, dm_note: { type: 'string' } } } },
            beat_title: { type: 'string' }, read_aloud: { type: 'string' }, beat_notes: { type: 'string' },
            encounter: { type: 'object', properties: { theme: { type: 'string' }, difficulty: { type: 'string', enum: ['low', 'moderate', 'high'] }, monsters: MONSTERS } },
            objects: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: OBJECT_KINDS }, name: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, text: { type: 'string' }, dc: { type: 'integer' }, damage: { type: 'string' }, save: { type: 'string' }, items: { type: 'array', items: { type: 'object' } } } } },
            loot: { type: 'string', description: 'A chest at the far end with this loot text' },
          },
        },
      },
      why: { type: 'string' },
    },
  },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const party = partyFor(room, input);
    const items = [];
    const seed = Date.now();
    (input.parts || []).slice(0, 12).forEach((part, i) => {
      const ref = autoRef(`s${i}`);
      const payload = scenePayload({ name: part.scene_name, source: part.source || { template: 'dungeon' }, floor: part.floor, notes: part.scene_notes, fog: part.fog, mood: part.mood, npcs: (part.npcs || []).map((n) => ({ ...n })) }, seed + i * 101);
      items.push(sceneItem(payload, ref));
      // NPC private notes go on after the scene exists: tokens come in with it, so notes ride in the scene's notes instead
      const npcNotes = (part.npcs || []).filter((n) => n.dm_note).map((n) => `${n.name}: ${n.dm_note}`);
      if (npcNotes.length) items[items.length - 1].steps[0].payload.notes = [payload.notes, 'People:', ...npcNotes].filter(Boolean).join('\n').slice(0, 4000);
      let groups = [];
      let encNote = '';
      if (part.encounter?.monsters?.length) {
        groups = part.encounter.monsters.map((m) => ({ index: m.index, count: int(m.count, 1, 12, 1) }));
        const r = rateEncounter(groups, party);
        encNote = `Encounter ${r.total_xp} XP (${r.rating} for level ${party.level} x${party.size}).`;
      } else if (part.encounter?.theme) {
        const enc = kit.buildEncounter(part.encounter.theme, { level: party.level, size: party.size, difficulty: part.encounter.difficulty || 'moderate', seed: seed + i * 13 });
        groups = enc.groups.map((g) => ({ index: g.index, count: g.count }));
        encNote = `Waiting here: ${kit.describeEncounter(enc.groups)} (${enc.total} XP, ${part.encounter.difficulty || 'moderate'} for level ${party.level}).`;
      }
      items.push(beatItem({ title: part.beat_title, read_aloud: part.read_aloud, notes: [part.beat_notes, encNote].filter(Boolean).join('\n'), encounter: groups.map((g) => ({ monster_index: g.index, count: g.count })) }, `$ref:${ref}`));
      for (const o of part.objects || []) items.push(objectItem(o, `$ref:${ref}`));
      if (part.loot && payload.cells) {
        const far = kit.farPoint(payload.cells.map((r) => r.padEnd(payload.w, '.')), payload.entry || kit.entryOf(payload.cells));
        items.push(objectItem({ kind: 'chest', name: 'Chest', x: far.x, y: far.y, text: part.loot, hidden: false }, `$ref:${ref}`));
      }
    });
    if (!items.length) throw new Error('No parts.');
    return propose(ctx, room, { title: `Campaign: ${str(input.title, 80)}`, why: [input.pitch, input.why].filter(Boolean).join('\n'), items });
  },
});

tool({
  name: 'quick_campaign', title: 'Starter campaign', kind: 'write',
  description: 'Propose one of the app\'s ready-made four-scene starter campaigns (see map_kit quick_campaigns), balanced for the party.',
  input_schema: { type: 'object', required: ['key'], properties: { campaign: CAMPAIGN, key: { type: 'string' }, level: { type: 'integer' }, party_size: { type: 'integer' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const party = partyFor(room, input);
    const built = kit.buildQuickCampaign(input.key, { level: party.level, size: party.size, seed: Date.now() });
    const refs = built.scenes.map((s, i) => autoRef(`q${i}`));
    const items = [];
    built.scenes.forEach((s, i) => {
      items.push(sceneItem({ ...s }, refs[i]));
      for (const b of built.beats.filter((x) => x.scene === i)) items.push(beatItem({ title: b.title, read_aloud: b.readAloud, notes: b.notes, encounter: b.encounter.map((e) => ({ monster_index: e.monsterIndex, count: e.count })) }, `$ref:${refs[i]}`));
      for (const t of built.things.filter((x) => x.scene === i)) items.push(objectItem({ ...t.object, text: t.object.effects?.[0]?.text, items: t.object.effects?.[0]?.items }, `$ref:${refs[i]}`));
    });
    return propose(ctx, room, { title: `Starter campaign: ${built.name}`, items });
  },
});

tool({
  name: 'delete', title: 'Delete something', kind: 'write',
  description: 'Propose deleting a scene, a story beat, a creature/NPC token or an object. Never applied without the DM\'s say-so.',
  input_schema: { type: 'object', required: ['what', 'id'], properties: { campaign: CAMPAIGN, what: { type: 'string', enum: ['scene', 'beat', 'token', 'object'] }, id: { type: 'string' }, scene_id: SCENE_ID, why: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    let step, label;
    if (input.what === 'scene') { const s = needScene(room, input.id); label = `scene "${s.name}"`; step = { event: 'deleteScene', payload: { sceneId: s.id } }; }
    else if (input.what === 'beat') { const b = (room.story?.beats || []).find((x) => x.id === input.id); if (!b) throw new Error('No such beat.'); label = `beat "${b.title}"`; step = { event: 'deleteBeat', payload: { beatId: b.id } }; }
    else if (input.what === 'token') { const { token } = findToken(room, input.id); if (!token || token.kind === 'pc') throw new Error('No such creature (heroes cannot be removed).'); label = token.label; step = { event: 'removeToken', payload: { tokenId: token.id } }; }
    else { const s = needScene(room, input.scene_id); const o = (s.objects || []).find((x) => x.id === input.id); if (!o) throw new Error('No such object.'); label = `${o.kind} "${o.name}"`; step = { event: 'removeObject', payload: { sceneId: s.id, id: o.id } }; }
    return propose(ctx, room, { title: `Delete ${label}`, why: input.why, items: [{ kind: 'destructive', title: `Delete ${label}`, summary: 'This cannot be undone from here.', steps: [step] }] });
  },
});

// ---------- writes: live at the table (always need Accept) ----------

const liveText = (ctx, room, { title, summary, step, fields, preview }) => propose(ctx, room, { title, items: [{ kind: 'live', title, summary, steps: [step], fields, preview }] });

tool({
  name: 'narrate', title: 'Narrate to the table', kind: 'write',
  description: 'Propose narration shown across players\' screens and in chat (style "title" for a big scene title), or privately to some players.',
  input_schema: { type: 'object', required: ['text'], properties: { campaign: CAMPAIGN, text: { type: 'string' }, to: TO, style: { type: 'string', enum: ['narration', 'title'] } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const text = str(input.text, 600);
    return liveText(ctx, room, { title: input.to && input.to !== 'all' ? 'Narrate privately' : 'Narrate to the table', summary: text, step: { event: 'dmNarrate', payload: { text, to: input.to || 'all', style: input.style || 'narration' } }, fields: [{ path: 'steps.0.payload.text', label: 'Narration', multiline: true, max: 600 }], preview: { type: 'text', text } });
  },
});

tool({
  name: 'send_handout', title: 'Send a handout', kind: 'write',
  description: 'Propose a handout (a letter, a notice, a riddle) that pops up on players\' screens.',
  input_schema: { type: 'object', required: ['title', 'text'], properties: { campaign: CAMPAIGN, title: { type: 'string' }, text: { type: 'string' }, to: TO } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    return liveText(ctx, room, { title: `Handout: ${str(input.title, 80)}`, summary: str(input.text, 300), step: { event: 'sendHandout', payload: { title: str(input.title, 80), text: str(input.text, 4000), to: input.to || 'all' } }, fields: [{ path: 'steps.0.payload.title', label: 'Title', max: 80 }, { path: 'steps.0.payload.text', label: 'Text', multiline: true, max: 4000 }], preview: { type: 'text', text: str(input.text, 4000) } });
  },
});

tool({
  name: 'npc_say', title: 'An NPC speaks', kind: 'write',
  description: 'Propose a line spoken by an NPC or creature on the map: a speech bubble over its head and a line in chat.',
  input_schema: { type: 'object', required: ['token_id', 'text'], properties: { campaign: CAMPAIGN, token_id: { type: 'string' }, text: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const { token } = findToken(room, input.token_id);
    if (!token) throw new Error('No such token (see get_scene).');
    const text = str(input.text, 400);
    return liveText(ctx, room, { title: `${token.label} says...`, summary: text, step: { event: 'npcSay', payload: { tokenId: token.id, text } }, fields: [{ path: 'steps.0.payload.text', label: 'Line', multiline: true, max: 400 }], preview: { type: 'text', text } });
  },
});

tool({
  name: 'request_roll', title: 'Ask for a roll', kind: 'write',
  description: 'Propose asking players for a check or save (e.g. "Perception", "Dexterity save") with an optional DC; their screens show a roll button.',
  input_schema: { type: 'object', required: ['check'], properties: { campaign: CAMPAIGN, check: { type: 'string' }, dc: { type: 'integer' }, label: { type: 'string' }, to: TO } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    return liveText(ctx, room, { title: `Ask for a ${str(input.check, 40)} roll`, summary: `${input.dc ? `DC ${input.dc}. ` : ''}${str(input.label, 120)}`, step: { event: 'requestRoll', payload: { check: str(input.check, 40), dc: input.dc || null, label: str(input.label, 120), to: input.to || 'all' } }, fields: [{ path: 'steps.0.payload.label', label: 'Why', max: 120 }, { path: 'steps.0.payload.dc', label: 'DC', type: 'number' }] });
  },
});

tool({
  name: 'switch_scene', title: 'Move the table', kind: 'write',
  description: 'Propose taking the table to another scene (the party travels with it).',
  input_schema: { type: 'object', required: ['scene_id'], properties: { campaign: CAMPAIGN, scene_id: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const s = needScene(room, input.scene_id);
    return liveText(ctx, room, { title: `Go to "${s.name}"`, summary: 'Switches every screen to this scene; the heroes travel.', step: { event: 'switchScene', payload: { sceneId: s.id } } });
  },
});

tool({
  name: 'run_story_beat', title: 'Run a story beat', kind: 'write',
  description: 'Propose running a beat: switch to its scene, place its creatures (hidden until revealed) and read its read-aloud to the table.',
  input_schema: { type: 'object', required: ['beat_id'], properties: { campaign: CAMPAIGN, beat_id: { type: 'string' }, spawn: { type: 'boolean' }, narrate: { type: 'boolean' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const beat = (room.story?.beats || []).find((b) => b.id === input.beat_id);
    if (!beat) throw new Error('No such beat.');
    const scene = (beat.sceneId && findScene(room, beat.sceneId)) || getActiveScene(room);
    const monsters = monsterGroupTokens((beat.encounter || []).map((e) => ({ index: e.monsterIndex, count: e.count })), true);
    const far = scene?.cells ? kit.farPoint(scene.cells, scene.entry || kit.entryOf(scene.cells)) : null;
    for (const m of monsters) if (far) { m.x = far.x; m.y = far.y; }
    return liveText(ctx, room, {
      title: `Run beat "${beat.title}"`, summary: `${beat.sceneId ? `Go to "${scene?.name}". ` : ''}${monsters.length ? `Place ${monsters.length} hidden creature(s). ` : ''}${beat.readAloud && input.narrate !== false ? 'Read the read-aloud.' : ''}`,
      step: { event: 'runBeat', payload: { beatId: beat.id, spawn: input.spawn !== false, narrate: input.narrate !== false, monsters } }, preview: beat.readAloud ? { type: 'text', text: beat.readAloud } : null,
    });
  },
});

tool({
  name: 'combat', title: 'Combat controls', kind: 'write',
  description: 'Propose a combat step: start (roll initiative), roll_monsters (roll for creatures), begin (round 1, everyone who has not rolled rolls), next_turn, end.',
  input_schema: { type: 'object', required: ['action'], properties: { campaign: CAMPAIGN, action: { type: 'string', enum: ['start', 'roll_monsters', 'begin', 'next_turn', 'end'] } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const ev = { start: 'startCombat', roll_monsters: 'rollMonsterInitiative', begin: 'beginCombatOrder', next_turn: 'nextTurn', end: 'endCombat' }[input.action];
    if (!ev) throw new Error('Unknown action.');
    return liveText(ctx, room, { title: `Combat: ${input.action.replace('_', ' ')}`, summary: '', step: { event: ev, payload: {} } });
  },
});

tool({
  name: 'update_creature', title: 'Change a creature', kind: 'write',
  description: 'Propose changing a creature or NPC: HP, AC, hidden/revealed, conditions, name, or what players know about it (note).',
  input_schema: { type: 'object', required: ['token_id'], properties: { campaign: CAMPAIGN, token_id: { type: 'string' }, hp: { type: 'integer' }, ac: { type: 'integer' }, hidden: { type: 'boolean' }, conditions: { type: 'array', items: { type: 'string' } }, label: { type: 'string' }, note: { type: 'string' } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const { scene, token } = findToken(room, input.token_id);
    if (!token || token.kind === 'pc') throw new Error('No such creature (heroes are changed from their sheets).');
    const patch = {};
    for (const k of ['hp', 'ac', 'hidden', 'conditions', 'label', 'note']) if (input[k] !== undefined) patch[k] = input[k];
    const live = scene.id === room.activeSceneId && !(token.hidden && patch.hidden !== false);
    return propose(ctx, room, { title: `Change ${token.label}`, items: [{ kind: live ? 'live' : 'prep', title: `Change ${token.label}`, summary: Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('; '), steps: [{ event: 'updateToken', payload: { tokenId: token.id, patch } }] }] });
  },
});

tool({
  name: 'give_item', title: 'Give an item', kind: 'write',
  description: 'Propose giving items to a hero (they land in their gear).',
  input_schema: { type: 'object', required: ['character_id', 'items'], properties: { campaign: CAMPAIGN, character_id: { type: 'string' }, items: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['weapon', 'armor', 'potion', 'gear', 'treasure'] }, qty: { type: 'integer' }, desc: { type: 'string' }, magic: { type: 'boolean' } } } } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    const sheet = room.charSheets?.[input.character_id];
    if (!sheet) throw new Error('No such hero (see get_campaign party).');
    return liveText(ctx, room, { title: `Give ${sheet.name} ${input.items.map((i) => i.name).join(', ')}`, summary: input.items.map((i) => `${i.qty > 1 ? `${i.qty} x ` : ''}${i.name}${i.desc ? `: ${i.desc}` : ''}`).join('; '), step: { event: 'giveItem', payload: { characterId: input.character_id, items: input.items } } });
  },
});

tool({
  name: 'award_xp', title: 'Award XP', kind: 'write',
  description: 'Propose awarding XP, split across the party.',
  input_schema: { type: 'object', required: ['amount'], properties: { campaign: CAMPAIGN, amount: { type: 'integer', minimum: 1 } } },
  run: async (ctx, input) => {
    const room = await roomFor(ctx, input.campaign);
    return liveText(ctx, room, { title: `Award ${int(input.amount, 1, 100000)} XP`, summary: 'Split among the party.', step: { event: 'awardXp', payload: { amount: int(input.amount, 1, 100000) } }, fields: [{ path: 'steps.0.payload.amount', label: 'XP', type: 'number' }] });
  },
});

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** The tool list for a caller (read-only callers see only the read tools). */
function listTools({ readOnly = false } = {}) {
  return TOOLS.filter((t) => !readOnly || t.kind === 'read');
}

const filterInput = kit.makeFilter({ level: 'standard' });

/** Run a tool. Strings in the input pass the profanity filter first (defence in depth). */
async function callTool(ctx, name, input = {}) {
  const t = byName.get(name);
  if (!t) throw new Error(`Unknown tool ${name}`);
  if (t.kind === 'write' && ctx.readOnly) throw new Error('This token is read-only.');
  const clean = kit.cleanDeep(input && typeof input === 'object' ? input : {}, filterInput);
  if (ctx.defaultCampaign && !clean.campaign && t.input_schema.properties?.campaign) clean.campaign = ctx.defaultCampaign;
  return t.run(ctx, clean);
}

const SERVER_INSTRUCTIONS = `You are helping a Dungeon Master run a D&D 5e campaign on dnd.ojee.net, a virtual tabletop.
- Start with list_campaigns and get_campaign. Campaign codes are 6 characters.
- Read tools answer at once. Every write tool sends a proposal to the DM's review queue in the app: nothing changes until the DM accepts it (they can also edit or reject it). Tell the DM what you proposed; use proposal_status to see what they decided. Ids created by accepted items appear there as created_id.
- Balance fights with plan_encounter (the app's XP budget) before place_monsters or a beat's encounter.
- Use only open SRD 5e content (search_srd / get_srd); no material from other books. No religious symbols in descriptions.
- For a whole adventure use build_campaign with several parts; for maps prefer templates and generators (map_kit) over drawing rows by hand.
- Read-aloud text: 2-5 vivid sentences, second person, no decisions made for the players.`;

module.exports = { TOOLS, listTools, callTool, campaignsFor, roomFor, SERVER_INSTRUCTIONS };
