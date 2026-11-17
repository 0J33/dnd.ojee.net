import { useEffect, useSyncExternalStore } from 'react';

// Every keyboard shortcut on the board, in one place. Each action has default
// keys; a player can rebind any of them (Controls & keys in the ⋯ menu) and
// the choice is kept per user in localStorage.
//
// A combo is a lowercase string: modifiers first, then the key, e.g. "v",
// "ctrl+z", "ctrl+shift+z", "space", "arrowup", "escape". Cmd counts as Ctrl.

export const ACTIONS = [
  { id: 'tool.select', group: 'Tools', name: 'Pointer (select, pan, turn)', keys: ['v'] },
  { id: 'tool.measure', group: 'Tools', name: 'Measure', keys: ['m'] },
  { id: 'tool.draw', group: 'Tools', name: 'Draw', keys: ['p'] },
  { id: 'tool.fog', group: 'Tools', name: 'Fog (DM)', keys: ['f'] },
  { id: 'tool.secrets', group: 'Tools', name: 'Secrets (DM)', keys: ['t'] },
  { id: 'tool.build', group: 'Tools', name: 'Build (DM)', keys: ['b'] },
  { id: 'cam.forward', group: 'Camera', name: 'Move forward / up', keys: ['w', 'arrowup'], held: true },
  { id: 'cam.back', group: 'Camera', name: 'Move back / down', keys: ['s', 'arrowdown'], held: true },
  { id: 'cam.left', group: 'Camera', name: 'Move left', keys: ['a', 'arrowleft'], held: true },
  { id: 'cam.right', group: 'Camera', name: 'Move right', keys: ['d', 'arrowright'], held: true },
  { id: 'cam.turnLeft', group: 'Camera', name: 'Turn left (3D)', keys: ['q'], held: true },
  { id: 'cam.turnRight', group: 'Camera', name: 'Turn right (3D)', keys: ['e'], held: true },
  { id: 'cam.center', group: 'Camera', name: 'Back to your hero', keys: ['space'] },
  { id: 'cam.overview', group: 'Camera', name: 'See the whole place', keys: ['o'] },
  { id: 'sel.cancel', group: 'Selection', name: 'Let go / stop placing / close menu', keys: ['escape'] },
  { id: 'sel.delete', group: 'Selection', name: 'Remove selected (DM)', keys: ['delete'] },
  { id: 'sel.hide', group: 'Selection', name: 'Hide / show selected (DM)', keys: ['h'] },
  { id: 'turn.end', group: 'Table', name: 'End your turn', keys: ['enter'] },
  { id: 'edit.undo', group: 'Table', name: 'Undo (DM)', keys: ['ctrl+z'] },
  { id: 'edit.redo', group: 'Table', name: 'Redo (DM)', keys: ['ctrl+shift+z', 'ctrl+y'] },
];

// Mouse controls are fixed; listed so the settings and help can show them.
export const MOUSE_HELP = [
  ['Left click', 'Select a creature or thing; walk, attack or use'],
  ['Double-click', "Open a character's sheet or a creature's stat block (on the ground: ping)"],
  ['Ctrl + click', 'Add to or take from the selection (DM)'],
  ['Right click', 'Menu for whatever is under the pointer'],
  ['Left drag', 'Pointer tool: pan the map, or move a creature you can move'],
  ['Right drag', 'Turn the camera (3D)'],
  ['Middle drag', 'Pointer tool: box-select (DM)'],
  ['Wheel', 'Zoom'],
];

const BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
const DEFAULTS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.keys]));

let userId = null;
let custom = {}; // id -> combos, only what differs from the defaults
let bindings = { ...DEFAULTS };
let version = 0;
const listeners = new Set();

const storeKey = () => `dnd.keybinds.${userId || 'guest'}`;
function load() {
  try { custom = JSON.parse(localStorage.getItem(storeKey()) || '{}') || {}; } catch { custom = {}; }
  bindings = { ...DEFAULTS };
  for (const [id, keys] of Object.entries(custom)) if (BY_ID[id] && Array.isArray(keys)) bindings[id] = keys.filter((k) => typeof k === 'string');
  version++;
  listeners.forEach((f) => f());
}
function save() {
  try { localStorage.setItem(storeKey(), JSON.stringify(custom)); } catch { /* private mode */ }
  load();
}
load();

/** Whose bindings to use (call with the signed-in user's id). */
export function setKeybindUser(id) {
  if ((id || null) === userId) return;
  userId = id || null;
  load();
}
export function useKeybindUser(id) { useEffect(() => setKeybindUser(id), [id]); }

export const getBindings = () => bindings;
export const defaultKeys = (id) => DEFAULTS[id] || [];
export function setKeys(id, keys) {
  const same = JSON.stringify(keys) === JSON.stringify(DEFAULTS[id]);
  if (same) delete custom[id]; else custom[id] = keys;
  save();
}
export function resetKeys(id) { delete custom[id]; save(); }
export function resetAll() { custom = {}; save(); }

/** Re-render when bindings change. */
export function useKeybinds() {
  useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => version);
  return bindings;
}

const KEY_NAMES = { ' ': 'space', spacebar: 'space', esc: 'escape', del: 'delete', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };
/** The key part of an event, normalised (no modifiers). */
export function keyOf(e) {
  let k = (e.key || '').toLowerCase();
  if (e.shiftKey && /^Digit\d$/.test(e.code || '')) k = e.code.slice(5);
  return KEY_NAMES[k] || k;
}
/** The full combo string for a key event, or null for a lone modifier. */
export function comboOf(e) {
  const k = keyOf(e);
  if (!k || ['control', 'shift', 'alt', 'meta', 'os', 'dead', 'unidentified'].includes(k)) return null;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  return [...mods, k].join('+');
}
/** Does this key event trigger the action? Modifiers must match exactly. */
export function matches(e, id) {
  const c = comboOf(e);
  return !!c && (bindings[id] || []).includes(c);
}
/** For held keys (camera): the key, ignoring modifiers. */
export function matchesKey(e, id) {
  const k = keyOf(e);
  return (bindings[id] || []).some((c) => c.split('+').pop() === k);
}
/** Which of these held actions use this key (for keyup). */
export const heldActions = (e) => ACTIONS.filter((a) => a.held && matchesKey(e, a.id)).map((a) => a.id);

const PRETTY = { space: 'Space', escape: 'Esc', enter: 'Enter', delete: 'Del', backspace: 'Backspace', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', tab: 'Tab', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt' };
export const comboLabel = (c) => c.split('+').map((p) => PRETTY[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join('+');
/** "W / ↑" for an action, or "unbound". */
export function keyLabel(id, sep = ' / ') {
  const ks = bindings[id] || [];
  return ks.length ? ks.map(comboLabel).join(sep) : 'unbound';
}
/** The first key only, for short tooltips. */
export const firstKey = (id) => (bindings[id]?.[0] ? comboLabel(bindings[id][0]) : '');

/** Other actions that share a combo with this one. */
export function conflictsOf(id) {
  const mine = bindings[id] || [];
  return ACTIONS.filter((a) => a.id !== id && (bindings[a.id] || []).some((c) => mine.includes(c)));
}

/** Focus is in a text field: keys belong to it. */
export function isTyping() {
  const el = document.activeElement;
  return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);
}

/** No browser right-click menu anywhere in the game, except in text fields. */
export function useNoBrowserMenu() {
  useEffect(() => {
    const block = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);
}
