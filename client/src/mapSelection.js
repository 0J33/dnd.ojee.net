import { useSyncExternalStore } from 'react';

// What is selected on the map (shared by the 2D and 3D maps and the bulk
// action bar), and the "place again" mode for dropping creatures.
//   tokens / objects  ids picked with click, Ctrl+click or a middle-drag box
//   placing           { token, name } while each click drops another copy

//   at                when the current selection was made (a second click on
//                     the same thing a moment later is a double-click, not "let go")
//   placeHidden       the DM's switch: new creatures and things start hidden

const readHidden = () => { try { return localStorage.getItem('dnd.placeHidden') === '1'; } catch { return false; } };
let state = { tokens: [], objects: [], placing: null, menu: null, at: 0, placeHidden: readHidden() };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
const set = (patch) => { state = { ...state, ...patch }; emit(); };

export const getSelection = () => state;
export function useSelection() {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => state);
}

export function selectOnly(tokens = [], objects = []) { set({ tokens: [...new Set(tokens)], objects: [...new Set(objects)], at: Date.now() }); }
/**
 * A plain click on one thing: picks it, or lets it go when it was already the
 * one picked (not when that pick was the first half of a double-click).
 * True when it was let go.
 */
export function clickPick(kind, id) {
  const mine = kind === 'object' ? state.objects : state.tokens;
  const other = kind === 'object' ? state.tokens : state.objects;
  if (mine.length === 1 && mine[0] === id && !other.length && Date.now() - state.at > 450) { set({ tokens: [], objects: [], menu: null }); return true; }
  if (kind === 'object') selectOnly([], [id]); else selectOnly([id]);
  return false;
}

/** The DM's "place hidden" switch, remembered on this device. */
export const getPlaceHidden = () => state.placeHidden;
export function setPlaceHidden(on) {
  try { localStorage.setItem('dnd.placeHidden', on ? '1' : '0'); } catch { /* private window */ }
  set({ placeHidden: !!on });
}
/** A creature or thing about to be placed, hidden when the switch is on. */
export const withPlaceHidden = (x) => (state.placeHidden ? { ...x, hidden: true } : x);
export function addToSelection(tokens = [], objects = []) {
  set({ tokens: [...new Set([...state.tokens, ...tokens])], objects: [...new Set([...state.objects, ...objects])] });
}
export function toggleToken(id) {
  set({ tokens: state.tokens.includes(id) ? state.tokens.filter((x) => x !== id) : [...state.tokens, id] });
}
export function toggleObject(id) {
  set({ objects: state.objects.includes(id) ? state.objects.filter((x) => x !== id) : [...state.objects, id] });
}
export function clearSelection() { if (state.tokens.length || state.objects.length || state.menu) set({ tokens: [], objects: [], menu: null }); }
export const selectionSize = () => state.tokens.length + state.objects.length;
export const isSelected = (id) => state.tokens.includes(id) || state.objects.includes(id);

/** Open the bulk-action menu at a screen point. */
export const openBulkMenu = (x, y) => set({ menu: { x, y } });
export const closeBulkMenu = () => state.menu && set({ menu: null });

/** Click-to-place: every click on the map drops another `token` until stopped. */
export const startPlacing = (token, name) => set({ placing: { token, name: name || token.label } });
export const stopPlacing = () => state.placing && set({ placing: null });

/** "Goblin" -> "Goblin 3" when two goblins are already on the scene. */
export function nextLabel(scene, label) {
  const base = String(label || 'Creature').replace(/\s+\d+$/, '');
  const n = (scene?.tokens || []).filter((t) => String(t.label || '').replace(/\s+\d+$/, '') === base).length;
  return n ? `${base} ${n + 1}`.slice(0, 40) : base;
}

/**
 * Moves for a selected group following `lead` to `to`, each keeping its
 * place in the group. The ones furthest along the way go first, so nobody
 * is sent onto a square a groupmate hasn't left yet.
 */
export function groupMoves(scene, ids, lead, to, canMove = () => true) {
  const dx = to.x - lead.x, dy = to.y - lead.y;
  const out = [];
  for (const id of ids) {
    const t = (scene?.tokens || []).find((x) => x.id === id);
    if (!t || (t.id !== lead.id && !canMove(t))) continue;
    const x = Math.max(0, Math.min(scene.grid.w - 1, t.x + dx)), y = Math.max(0, Math.min(scene.grid.h - 1, t.y + dy));
    if (x !== t.x || y !== t.y) out.push({ id, x, y, k: t.x * dx + t.y * dy });
  }
  return out.sort((a, b) => b.k - a.k);
}

// The drag payload when a monster is dragged from a list onto the map.
export const DRAG_MIME = 'application/x-dnd-monster';
