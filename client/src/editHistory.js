import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';

// Undo and redo for everything a DM changes on a scene: painting, erasing,
// stamps, fills, generated maps, resizing, levels, creatures and NPCs
// (placing, moving, HP, hiding, removing), secrets and objects, doors, fog,
// drawings, mood.
//
// It listens to what this client sends (socket.onAnyOutgoing), so no tool has
// to know about it: just before an edit leaves, the parts of the scene that
// edit can touch are remembered. Undo puts those parts back in one
// restoreScene message and remembers what was there for redo. Heroes are
// never touched (the server keeps them as they are), so undoing a monster's
// move can't yank a player's token around.
//
// Each message is one step: a brush stroke, a stamp, a fill or a drawing is
// sent as one message, so it is undone as one. Only edits that arrive as a
// stream of small messages (typing an HP, a name, sliding the light) are
// merged, while they keep coming.
//
// Drawings are shared with the players, so they are undone one by one (by
// id): undoing yours never takes away a line a player drew meanwhile.
//
// History is kept per scene: Ctrl+Z works on the scene you are looking at.

const TERRAIN = 'terrain'; // cells, the floor under things, levels, size, material
const PARTS = {
  paintScene: [TERRAIN],
  toggleDoor: [TERRAIN],
  addLevel: [TERRAIN],
  updateLevel: [TERRAIN],
  removeLevel: [TERRAIN],
  reshapeScene: [TERRAIN, 'tokens', 'objects', 'revealed'],
  addToken: ['tokens'],
  addTokens: ['tokens'],
  removeToken: ['tokens'],
  updateToken: ['tokens'],
  moveToken: ['tokens'],
  applyHp: ['tokens'],
  setPatrol: ['tokens'],
  revealFog: ['revealed'],
  resetFog: ['revealed'],
  placeObject: ['objects'],
  updateObject: ['objects'],
  removeObject: ['objects'],
  drawStroke: ['strokes'],
  eraseStrokes: ['strokes'],
  clearDrawings: ['strokes'],
  resetScene: [TERRAIN, 'tokens', 'objects', 'revealed', 'strokes'],
};

const LABELS = {
  paintScene: 'painting', toggleDoor: 'door', reshapeScene: 'map change', addToken: 'placing a creature', addTokens: 'placing a group',
  removeToken: 'removing a creature', updateToken: 'creature change', moveToken: 'move', applyHp: 'HP change', setPatrol: 'patrol',
  revealFog: 'fog', resetFog: 'fog', placeObject: 'placing an object', updateObject: 'object change', removeObject: 'removing an object',
  drawStroke: 'drawing', eraseStrokes: 'erasing a drawing', clearDrawings: 'clearing drawings', resetScene: 'scene reset',
  clearLayer: 'clearing a layer', fog: 'fog on/off', mood: 'mood', addLevel: 'adding a level', updateLevel: 'level change', removeLevel: 'removing a level',
};

// Edits that come as a stream of messages for one change.
const STREAMS = new Set(['updateToken', 'applyHp', 'updateObject', 'updateLevel', 'updateScene', 'revealFog']);
const LAYER_PARTS = { monsters: ['tokens'], dead: ['tokens'], npcs: ['tokens'], hidden: ['tokens'], objects: ['objects'], drawings: ['strokes'] };
const COALESCE_MS = 900;
const LIMIT = 100;

const copy = (v) => (v === undefined || v === null ? v ?? null : JSON.parse(JSON.stringify(v)));
const strokeIds = (scene) => (scene.strokes || []).map((s) => s.id);

/** Which parts of which scene an outgoing message can change, or null. */
function describe(event, args, findTokenScene, getScene, activeId) {
  const a = (args[0] && typeof args[0] === 'object' && args[0]) || {};
  let parts = PARTS[event];
  let label = LABELS[event];
  let key = event;
  let strokes = null; // the drawings this edit touches (ids)
  if (event === 'updateScene') {
    const p = a.patch || {};
    parts = [p.fogEnabled !== undefined && 'fogEnabled', p.mood !== undefined && 'mood'].filter(Boolean);
    label = p.mood !== undefined ? LABELS.mood : LABELS.fog;
    key = `${event}:${parts.join()}`;
  } else if (event === 'clearLayer') {
    parts = LAYER_PARTS[a.layer];
    label = LABELS.clearLayer;
  }
  if (!parts || !parts.length) return null;
  let sceneId = a.sceneId || null;
  if (a.tokenId) {
    const hit = findTokenScene(a.tokenId);
    if (!hit || hit.token.kind === 'pc') return null; // heroes are the players' own
    sceneId = hit.scene.id;
    key = `${event}:${a.tokenId}`;
  }
  if (event === 'applyHp' && a.characterId) return null;
  if (event === 'updateObject' && a.id) key = `${event}:${a.id}`;
  if (event === 'updateLevel') key = `${event}:${a.levelId}:${Object.keys(a.patch || {}).join()}`;
  if (parts.includes('strokes')) {
    const scene = getScene(sceneId || activeId());
    if (event === 'drawStroke') strokes = a.stroke?.id ? [a.stroke.id] : null;
    else if (event === 'eraseStrokes') strokes = Array.isArray(a.ids) ? a.ids.slice() : null;
    else strokes = scene ? strokeIds(scene) : null; // clearing: everything there now
    if (!strokes) return null;
  }
  return { sceneId, parts, label, key, strokes };
}

function take(scene, parts, strokes) {
  const out = {};
  for (const p of parts) {
    if (p === TERRAIN) {
      Object.assign(out, {
        cells: [...scene.cells], grid: { ...scene.grid }, floor: scene.bg?.floor || 'stone',
        ground: scene.ground ? [...scene.ground] : null, levels: copy(scene.levels || []),
      });
    } else if (p === 'tokens') out.tokens = copy(scene.tokens.filter((t) => t.kind !== 'pc'));
    else if (p === 'objects') out.objects = copy(scene.objects || []);
    else if (p === 'revealed') out.revealed = [...(scene.revealed || [])];
    else if (p === 'strokes') {
      const ids = new Set(strokes || []);
      out.strokes = copy((scene.strokes || []).filter((s) => ids.has(s.id)));
    } else if (p === 'fogEnabled') out.fogEnabled = !!scene.fogEnabled;
    else if (p === 'mood') out.mood = copy(scene.mood || { time: 'auto', weather: 'none', light: 1 });
  }
  return out;
}

/**
 * useEditHistory({ enabled, getScene, getActiveSceneId, findTokenScene })
 *   getScene(id)   the scene as this client shows it (edits sent a moment ago included)
 * returns { undo, redo, canUndo, canRedo, undoLabel, redoLabel }
 */
export function useEditHistory({ enabled, getScene, getActiveSceneId, findTokenScene }) {
  const stacks = useRef({}); // sceneId -> { undo: [], redo: [] }
  const muted = useRef(false);
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const fns = useRef({});
  fns.current = { getScene, getActiveSceneId, findTokenScene };

  const stackFor = (id) => (stacks.current[id] ||= { undo: [], redo: [] });

  useEffect(() => {
    if (!enabled) return undefined;
    const onOut = (event, ...args) => {
      if (muted.current) return;
      const f = fns.current;
      const d = describe(event, args, (id) => f.findTokenScene(id), (id) => f.getScene(id), () => f.getActiveSceneId());
      if (!d) return;
      const sceneId = d.sceneId || f.getActiveSceneId();
      const scene = sceneId && f.getScene(sceneId);
      if (!scene) return;
      const st = stackFor(sceneId);
      const last = st.undo[st.undo.length - 1];
      const now = Date.now();
      if (STREAMS.has(event) && last && last.key === d.key && now - last.t < COALESCE_MS && d.parts.every((p) => last.parts.includes(p))) {
        last.t = now;
      } else {
        st.undo.push({ key: d.key, label: d.label, parts: d.parts, strokes: d.strokes, before: take(scene, d.parts, d.strokes), t: now });
        if (st.undo.length > LIMIT) st.undo.shift();
      }
      st.redo = [];
      bump();
    };
    socket.onAnyOutgoing(onOut);
    return () => socket.offAnyOutgoing(onOut);
  }, [enabled]);

  // Put `parts` back on a scene. Returns false if the scene is gone.
  const apply = useCallback((sceneId, entry, parts) => {
    const scene = fns.current.getScene(sceneId);
    if (!scene) return false;
    muted.current = true;
    try {
      const rest = { ...parts };
      if (rest.strokes) {
        // only the drawings this step touched: back as they were
        const want = new Map(rest.strokes.map((s) => [s.id, s]));
        const have = new Set((scene.strokes || []).filter((s) => (entry.strokes || []).includes(s.id)).map((s) => s.id));
        delete rest.strokes;
        const add = [...want.values()].filter((s) => !have.has(s.id));
        const remove = [...have].filter((id) => !want.has(id));
        if (add.length) rest.strokesAdd = add;
        if (remove.length) rest.strokesRemove = remove;
      }
      if (rest.mood) {
        socket.emit('updateScene', { sceneId, patch: { mood: rest.mood } });
        delete rest.mood;
      }
      if (Object.keys(rest).length) socket.emit('restoreScene', { sceneId, parts: rest });
    } finally {
      muted.current = false;
    }
    return true;
  }, []);

  const step = useCallback((from, to) => {
    const sceneId = fns.current.getActiveSceneId();
    const st = sceneId && stacks.current[sceneId];
    const entry = st && st[from].pop();
    if (!entry) return null;
    const scene = fns.current.getScene(sceneId);
    if (!scene) return null;
    const now = take(scene, entry.parts, entry.strokes);
    if (apply(sceneId, entry, entry.before)) st[to].push({ ...entry, before: now, t: 0 });
    bump();
    return entry.label;
  }, [apply]);

  const undo = useCallback(() => step('undo', 'redo'), [step]);
  const redo = useCallback(() => step('redo', 'undo'), [step]);

  const activeId = getActiveSceneId();
  const st = (activeId && stacks.current[activeId]) || { undo: [], redo: [] };
  return {
    undo,
    redo,
    canUndo: st.undo.length > 0,
    canRedo: st.redo.length > 0,
    undoLabel: st.undo.length ? st.undo[st.undo.length - 1].label : null,
    redoLabel: st.redo.length ? st.redo[st.redo.length - 1].label : null,
  };
}
