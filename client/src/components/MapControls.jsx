import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { srd } from '../api';
import { ContextMenu, useDialog } from '../utils';
import { CONDITIONS } from '../rules/engine';
import { tokenFromMonster } from '../rules/tokens';
import { matches, isTyping, keyLabel, useNoBrowserMenu, useKeybinds } from '../keybinds';
import {
  useSelection, clearSelection, closeBulkMenu, stopPlacing, nextLabel, selectOnly, DRAG_MIME, withPlaceHidden, setPlaceHidden,
} from '../mapSelection';
import KeybindSettings from './KeybindSettings';
import { BurstIcon, HeartIcon, EyeIcon, EyeOffIcon, XIcon, ConditionIcon } from './Icons';
import '../styles/controls.css';

// The map's shared controls, mounted by both MapCanvas and Map3D:
//   - the bulk bar for a multi-selection (DM), and its right-click menu
//   - the "placing" banner (click-to-place until Esc)
//   - Controls & keys (opened from the ⋯ menu with the dnd:keybinds event)
//   - no browser right-click menu anywhere in the game
//   - Delete / H / Esc for the selection

/** Drop a creature on a square: the "place again" copy, or a dragged monster. */
export function placeTokenAt(scene, token, cell) {
  if (!scene || !token || !cell) return;
  socket.emit('addToken', { sceneId: scene.id, token: withPlaceHidden({ ...token, label: nextLabel(scene, token.label), x: cell.x, y: cell.y }) });
}
/** A monster dragged in from a list: look it up, then place it. */
export async function dropMonsterAt(scene, index, cell) {
  try {
    const m = await srd.monster(index);
    if (m && !m.error) placeTokenAt(scene, tokenFromMonster(m), cell);
  } catch { /* offline: nothing placed */ }
}
/** The DM's switch in the top bar: what you add from now on starts hidden or visible. */
export function PlaceHiddenPill() {
  const sel = useSelection();
  const on = sel.placeHidden;
  return (
    <button
      type="button"
      className={`hud-pill mc-newhid ${on ? 'on' : ''}`}
      aria-pressed={on}
      onClick={() => setPlaceHidden(!on)}
      title={on
        ? 'Creatures, NPCs and things you add now start hidden: only you see them until you reveal them (right-click > show, or H). Click to add them visible'
        : 'Creatures, NPCs and things you add now are seen by the players at once. Click to add them hidden'}
    >
      {on ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />} <span>{on ? 'Adding hidden' : 'Adding visible'}</span>
    </button>
  );
}
export const isMonsterDrag = (e) => [...(e.dataTransfer?.types || [])].includes(DRAG_MIME);

export default function MapControls({ scene, isDM }) {
  const sel = useSelection();
  const dialog = useDialog();
  const [showKeys, setShowKeys] = useState(false);
  const [cond, setCond] = useState(null); // the condition picker: { x, y }
  useKeybinds();
  useNoBrowserMenu();

  // Selection belongs to a scene; a new scene starts empty.
  const sceneId = scene?.id;
  useEffect(() => { clearSelection(); stopPlacing(); }, [sceneId]);
  // Forget what's gone (removed, or hidden from a player).
  const tokens = (scene?.tokens || []).filter((t) => sel.tokens.includes(t.id));
  const objects = (scene?.objects || []).filter((o) => sel.objects.includes(o.id));
  useEffect(() => {
    if (tokens.length !== sel.tokens.length || objects.length !== sel.objects.length) selectOnly(tokens.map((t) => t.id), objects.map((o) => o.id));
  });

  useEffect(() => {
    const open = () => setShowKeys(true);
    window.addEventListener('dnd:keybinds', open);
    return () => window.removeEventListener('dnd:keybinds', open);
  }, []);

  const act = useRef({});
  act.current = { tokens, objects, isDM, scene, dialog };
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping() || document.querySelector('.modal-overlay, .context-menu')) return; // Esc closes those first
      if (matches(e, 'sel.cancel')) { stopPlacing(); clearSelection(); return; }
      const A = act.current;
      if (!A.isDM || !(A.tokens.length + A.objects.length)) return;
      if (matches(e, 'sel.delete')) { e.preventDefault(); bulk.remove(A); }
      else if (matches(e, 'sel.hide')) { e.preventDefault(); bulk.hide(A); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const n = tokens.length + objects.length;
  const A = { tokens, objects, isDM, scene, dialog };
  return (
    <>
      {sel.placing && (
        <div className="mc-placing" role="status">
          <span>Placing <b>{sel.placing.name}</b>: click squares to drop more · {keyLabel('sel.cancel')} or right-click to stop</span>
          <button className="small-btn" onClick={stopPlacing}>Done</button>
        </div>
      )}
      {isDM && n >= 2 && (
        <div className="mc-bulk panel" role="toolbar" aria-label="Selected">
          <span className="mc-bulk-n">{n} selected</span>
          {tokens.length > 0 && <button className="small-btn" onClick={() => bulk.damage(A, -1)} title="Damage every selected creature"><BurstIcon size={13} /> Damage</button>}
          {tokens.length > 0 && <button className="small-btn" onClick={() => bulk.damage(A, 1)} title="Heal every selected creature"><HeartIcon size={13} /> Heal</button>}
          {tokens.some((t) => t.kind !== 'pc') && <button className="small-btn" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCond({ x: r.left, y: r.bottom + 4 }); }} title="Add or take away a condition"><ConditionIcon index="poisoned" size={13} /> Condition</button>}
          <button className="small-btn" onClick={() => bulk.hide(A)} title={`Hide from players or show them (${keyLabel('sel.hide')})`}><EyeIcon size={13} /> Hide / show</button>
          <button className="small-btn danger-btn" onClick={() => bulk.remove(A)} title={`Remove them (${keyLabel('sel.delete')})`}><XIcon size={13} /> Remove</button>
          <button className="small-btn ghost-btn" onClick={clearSelection} title={`Let go (${keyLabel('sel.cancel')})`}>Clear</button>
        </div>
      )}
      {cond && <ContextMenu x={cond.x} y={cond.y} items={condItems(A)} onClose={() => setCond(null)} />}
      {sel.menu && isDM && n > 0 && <ContextMenu x={sel.menu.x} y={sel.menu.y} items={bulkItems(A, setCond, sel.menu)} onClose={closeBulkMenu} />}
      {showKeys && <KeybindSettings onClose={() => setShowKeys(false)} />}
    </>
  );
}

// The bulk actions, one message per item (the server's existing single-item
// ones). Undo steps back one item at a time.
const bulk = {
  async damage({ tokens, dialog }, sign) {
    const v = await dialog.prompt(`${sign < 0 ? 'Damage to' : 'Healing for'} each of the ${tokens.length} selected?`, '5', sign < 0 ? 'Damage' : 'Heal');
    const amt = parseInt(v, 10);
    if (!amt) return;
    for (const t of tokens) {
      if (t.kind === 'pc' && t.characterId) socket.emit('applyHp', { characterId: t.characterId, delta: sign * amt });
      else if (t.kind !== 'marker') socket.emit('applyHp', { tokenId: t.id, delta: sign * amt });
    }
  },
  hide({ tokens, objects, scene }) {
    const toks = tokens.filter((t) => t.kind !== 'pc');
    const hide = toks.some((t) => !t.hidden) || objects.some((o) => !o.hidden);
    for (const t of toks) if (!!t.hidden !== hide) socket.emit('updateToken', { tokenId: t.id, patch: { hidden: hide } });
    for (const o of objects) if (!!o.hidden !== hide) socket.emit('updateObject', { sceneId: scene.id, id: o.id, patch: { hidden: hide } });
  },
  async remove({ tokens, objects, scene, dialog }) {
    const toks = tokens.filter((t) => t.kind !== 'pc');
    if (!toks.length && !objects.length) return;
    const what = [toks.length && `${toks.length} creature${toks.length > 1 ? 's' : ''}`, objects.length && `${objects.length} thing${objects.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    if (!(await dialog.confirm(`Remove ${what} from the map? (Heroes stay.)`, 'Remove selected', 'Remove'))) return;
    for (const t of toks) socket.emit('removeToken', { tokenId: t.id });
    for (const o of objects) socket.emit('removeObject', { sceneId: scene.id, id: o.id });
    clearSelection();
  },
  condition({ tokens }, index) {
    const toks = tokens.filter((t) => t.kind !== 'pc');
    const all = toks.every((t) => (t.conditions || []).includes(index));
    for (const t of toks) {
      const cur = t.conditions || [];
      const next = all ? cur.filter((c) => c !== index) : cur.includes(index) ? cur : [...cur, index];
      if (next !== cur) socket.emit('updateToken', { tokenId: t.id, patch: { conditions: next } });
    }
  },
};

function condItems(A) {
  const toks = A.tokens.filter((t) => t.kind !== 'pc');
  return [
    { header: 'On every selected creature' },
    ...CONDITIONS.map((c) => {
      const all = toks.length && toks.every((t) => (t.conditions || []).includes(c.index));
      return { label: `${all ? '✓ ' : ''}${c.name}`, icon: <ConditionIcon index={c.index} size={14} />, onClick: () => bulk.condition(A, c.index) };
    }),
  ];
}

function bulkItems(A, setCond, at) {
  const n = A.tokens.length + A.objects.length;
  return [
    { header: `${n} selected` },
    A.tokens.length > 0 && { label: 'Damage each...', icon: <BurstIcon size={15} />, onClick: () => bulk.damage(A, -1) },
    A.tokens.length > 0 && { label: 'Heal each...', icon: <HeartIcon size={15} />, onClick: () => bulk.damage(A, 1) },
    A.tokens.some((t) => t.kind !== 'pc') && { label: 'Condition...', icon: <ConditionIcon index="poisoned" size={15} />, onClick: () => setCond({ x: at.x, y: at.y }) },
    { label: 'Hide / show', icon: <EyeIcon size={15} />, onClick: () => bulk.hide(A) },
    { divider: true },
    { label: 'Remove', icon: <XIcon size={15} />, danger: true, onClick: () => bulk.remove(A) },
    { label: 'Let go', onClick: clearSelection },
  ].filter(Boolean);
}
