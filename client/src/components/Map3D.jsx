import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorldView, { reach, isBulky } from '../world/WorldView';
import { CUTAWAY } from '../world/kit';
import { socket } from '../socket';
import { srd } from '../api';
import { spellDice } from './CharacterSheet';
import { summarize } from './Explain';
import { WEAPON_PROPERTIES } from '../rules/glossary';
import { CONDITIONS, deriveSheet } from '../rules/engine';
import { heroFeatures, HEAL_SPELLS, rageBonus } from '../rules/abilities';
import { InfoIcon, iconMarkup } from './Icons';
import { TILES } from '../data/tiles';
import { restoreUi, useUiContext } from '../uiContext';
import { ContextMenu } from '../utils';
import { matches, isTyping, heldActions, firstKey, keyLabel, useKeybinds } from '../keybinds';
import {
  useSelection, getSelection, selectOnly, addToSelection, toggleToken, toggleObject, clearSelection, openBulkMenu, stopPlacing, groupMoves, DRAG_MIME,
  clickPick, withPlaceHidden,
} from '../mapSelection';
import MapControls, { placeTokenAt, dropMonsterAt, isMonsterDrag } from './MapControls';

// The battle map in 3D. Same props as MapCanvas, so the board can switch
// between them; the difference is how it plays:
//   click a square       → your hero walks there (the reachable squares glow)
//   click a foe          → an attack menu with your attacks and spells, with
//                          your odds; out of reach, you walk up first
//   click a door         → open / close it (when you're next to it)
//   click a creature     → select it; double-click → its sheet / stat block
//   right-click anything → its menu (creatures, secrets, doors, squares)
//   Ctrl+click           → add to / take from the selection (DM)
//   double-click ground  → ping
//   drag the felt        → move the camera; right-drag turns; wheel zooms;
//                          middle-drag box-selects (Pointer tool, DM)
// The DM selects any creature first, then does the same on its behalf.

const CELLPX = 56; // 2d map units (strokes are stored in these)
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const DOORS = new Set(['D', 'd']);

export default function Map3D({
  scene, isDM, tool, fogMode, drawColor, build, charSheets, combat, userId, canMoveToken, pings,
  onMoveToken, onTokenContext, onCellContext, onTokenClick, onRevealCells, onPing, onDrawStroke, onEraseStrokes, onPaint,
  myTokenId, members = [],
  onBuildChange, objKind, selectedObjectId, onSelectObject, pickingDoors, onPickDoor, patrolDraft, onPatrolPoint, onTool,
}) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const overlayRef = useRef(null);
  const [hover, setHover] = useState(null);       // { token, x, y }
  const hoverEv = useRef(null), hoverRaf = useRef(0), hoverPos = useRef({ x: 0, y: 0 }), cardRef = useRef(null);
  useEffect(() => () => cancelAnimationFrame(hoverRaf.current), []);
  const [menu, setMenu] = useState(null);         // attack menu
  const [why, setWhy] = useState(null);           // the attack menu item whose explanation is open
  const [measure, setMeasure] = useState(null);   // { a, b }
  const [toast, setToast] = useState(null);
  const [follow, setFollow] = useState(true);
  const camWas = useRef(restoreUi('camera'));
  useUiContext('camera', () => {
    const v = viewRef.current;
    if (!v?.scene) return undefined;
    const g = v.rig.goal;
    return { scene: v.scene.id, tx: g.tx, tz: g.tz, yaw: g.yaw, pitch: g.pitch, dist: g.dist, follow: !!v.follow };
  });
  const [selected, setSelected] = useState(null);
  const [objMenu, setObjMenu] = useState(null);   // right-click on a secret / chest / lever: { x, y, items }
  const [box, setBox] = useState(null);           // middle-drag selection box (screen px)
  const sel = useSelection();
  useKeybinds();
  const platesRef = useRef(new Map());
  const badgesRef = useRef(new Map());   // the DM's "hidden" badges over objects
  const seenRef = useRef({});
  // Walls on the camera's side drop so you see into the room; off keeps them standing.
  const [cutaway, setCutaway] = useState(() => { try { return localStorage.getItem('dnd.cutaway') !== '0'; } catch { return true; } });
  useEffect(() => {
    CUTAWAY.on.value = cutaway ? 1 : 0;
    try { localStorage.setItem('dnd.cutaway', cutaway ? '1' : '0'); } catch { /* private window */ }
    viewRef.current?.engine.poke();
  }, [cutaway]);
  const floatersRef = useRef([]);
  const propsRef = useRef({});
  propsRef.current = { onTool, onBuildChange, objKind, selectedObjectId, onSelectObject, pickingDoors, onPickDoor, patrolDraft, onPatrolPoint, scene, isDM, tool, fogMode, drawColor, build, charSheets, combat, userId, canMoveToken, myTokenId, onMoveToken, onTokenContext, onCellContext, onTokenClick, onRevealCells, onPing, onDrawStroke, onEraseStrokes, onPaint };

  const turnTokenId = combat?.active && combat.round > 0 ? combat.order?.[combat.turnIndex]?.tokenId : null;

  // ─── mount ─────────────────────────────────────────────
  useEffect(() => {
    const view = new WorldView(host.current, {
      callbacks: {
        onFrame: () => placeOverlays(),
        onSelect: (id) => setSelected(id),
        onSceneChange: () => setMenu(null),
        onPointerDown: (e, g) => pointerDown(e, g),
        onDragMove: (e, g) => dragMove(e, g),
        onPointerUp: (e, g) => pointerUp(e, g),
        onHoverMove: (e) => hoverMove(e),
        onDoubleClick: (e) => {
          const P = propsRef.current;
          // a creature: its sheet or stat block; a secret (DM): its editor
          const t = view.tokenAt(e.clientX, e.clientY);
          if (t) { setMenu(null); P.onTokenClick?.(t); return; }
          const o = P.isDM && P.tool !== 'build' && view.objectAt(e.clientX, e.clientY);
          if (o) { P.onTool?.('secrets'); P.onSelectObject?.(o.id); return; }
          const c = view.cellAt(e.clientX, e.clientY);
          if (c) P.onPing?.(c.x, c.y);
        },
      },
    });
    viewRef.current = view;
    window.__world = view;
    // The story panel stands over the left of the board on wide screens:
    // keep what you're looking at in the part of the board you can see.
    const inset = setInterval(() => {
      const el = document.querySelector('.tut-panel'), vw = window.innerWidth;
      const r = el?.getBoundingClientRect();
      view.engine.setInsetLeft(r && vw > 900 && r.height > 160 && r.left < vw * 0.2 && r.right < vw * 0.5 ? r.right : 0);
      view.engine.dim = !!document.querySelector('.modal-overlay');
    }, 400);
    return () => { clearInterval(inset); view.dispose(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── state → world ─────────────────────────────────────
  useEffect(() => {
    const v = viewRef.current;
    if (!v || !scene) return;
    v.setScene(scene, { dmView: isDM });
    v.setFog(scene, isDM);
    v.setStrokes(scene.strokes || []);
    v.setObjects(scene.objects || [], isDM);
    v.setMood(scene.mood);
    v.setTokens(scene.tokens || [], { charSheets, userId, isDM, myTokenId, combat, members, turnTokenId });
    // Back from an update's reload: the camera where it was, not a fresh framing.
    const c = camWas.current;
    if (c && c.scene === scene.id) {
      camWas.current = null;
      v._framed = true;
      v.rig.flyTo(c, { instant: true });
      if (!c.follow) setFollow(false);
    }
  }, [scene, isDM, charSheets, userId, myTokenId, combat, members, turnTokenId]);

  useEffect(() => { if (viewRef.current) viewRef.current.follow = follow; }, [follow]);
  useEffect(() => { viewRef.current?.setMarked(sel.tokens, sel.objects); }, [sel.tokens, sel.objects]);
  useEffect(() => { viewRef.current?.setPatrols(scene?.tokens, isDM, patrolDraft); }, [scene?.tokens, isDM, patrolDraft]);

  // NPCs speaking (a bubble over their head) and the DM pointing everyone's camera.
  const [bubbles, setBubbles] = useState([]);
  useEffect(() => {
    const onSay = ({ tokenId, text }) => {
      const id = Math.random();
      setBubbles((b) => [...b.filter((x) => x.tokenId !== tokenId), { id, tokenId, text }]);
      setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), Math.min(12000, 3500 + text.length * 60));
    };
    const onLook = ({ x, y, dist }) => { setFollow(false); viewRef.current?.focusCell(x, y, dist ? { dist } : {}); };
    socket.on('npcSay', onSay); socket.on('lookHere', onLook);
    return () => { socket.off('npcSay', onSay); socket.off('lookHere', onLook); };
  }, []);

  // Arriving somewhere new: a beat of black with the place's name, then the
  // world fades in around the party.
  const [arrive, setArrive] = useState(null); // { name, phase: 'show' | 'out' }
  const lastScene = useRef(null);
  useEffect(() => {
    if (!scene?.id || lastScene.current === scene.id) return;
    const first = lastScene.current === null;
    lastScene.current = scene.id;
    const id = scene.id;
    setArrive({ id, name: scene.name, phase: 'show', first });
    // Not cancelled on cleanup: each timer only touches its own arrival.
    setTimeout(() => setArrive((x) => (x && x.id === id ? { ...x, phase: 'out' } : x)), first ? 500 : 1100);
    setTimeout(() => setArrive((x) => (x && x.id === id ? null : x)), first ? 1300 : 2000);
  }, [scene?.id, scene?.name]);

  // A hero going up a level: a column of light and a banner over them.
  const levels = useRef({});
  useEffect(() => {
    const v = viewRef.current;
    for (const [id, sh] of Object.entries(charSheets || {})) {
      const lv = sh?.level || 1, was = levels.current[id];
      levels.current[id] = lv;
      if (was && lv > was && v) {
        const t = scene?.tokens?.find((x) => x.characterId === id);
        if (t) { v.celebrate(t.id); floatText(t.id, `LEVEL ${lv}!`, 'level'); }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charSheets]);

  // My hero is always "selected" for a player: click = move / attack. The
  // reachable squares follow where the hero is and the movement left this
  // turn (none while it's someone else's turn), worked out again only when
  // one of those changes.
  const reachKey = useRef('');
  useEffect(() => {
    const v = viewRef.current;
    if (!v || isDM || !myTokenId) return;
    const me = scene?.tokens?.find((t) => t.id === myTokenId);
    const budget = myBudget();
    const key = `${myTokenId}|${me?.x},${me?.y}|${budget}|${scene?.id}|${combat?.active}|${combat?.round > 0}`;
    if (v.selected === myTokenId && key === reachKey.current && v.scene?.cells === scene?.cells) return;
    reachKey.current = key;
    v.select(myTokenId, { budget });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTokenId, isDM, scene?.tokens, scene?.cells, combat]);

  // The camera glides to whoever's turn it is.
  useEffect(() => {
    const v = viewRef.current;
    if (!v || !turnTokenId) return;
    const t = scene?.tokens?.find((x) => x.id === turnTokenId);
    if (t && (!t.hidden || isDM)) v.focusCell(t.x, t.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnTokenId]);

  // Pings from anyone.
  const seenPings = useRef(new Set());
  useEffect(() => {
    for (const p of pings || []) {
      if (seenPings.current.has(p.id)) continue;
      seenPings.current.add(p.id);
      viewRef.current?.ping(p.x, p.y, p.color, p.radius);
    }
  }, [pings]);

  // ─── combat, played out ────────────────────────────────
  useEffect(() => {
    const pendingDmg = {};
    const queue = [];
    let busy = false;
    const run = () => {
      if (busy || !queue.length) return;
      const ev = queue.shift();
      busy = true;
      const v = viewRef.current;
      const a = v?.figureOf(ev.attackerTokenId);
      const born = performance.now();
      let landed = false;
      const impact = () => {
        if (landed) return;
        landed = true;
        const dmg = ev.damage ?? pendingDmg[ev.targetTokenId];
        delete pendingDmg[ev.targetTokenId];
        if (ev.hit) floatText(ev.targetTokenId, ev.crit ? `CRIT ${dmg ?? ''}` : `-${dmg ?? ''}`, ev.crit ? 'crit' : 'dmg');
        else floatText(ev.targetTokenId, ev.save?.saved ? 'Saved' : 'Miss', 'miss');
        setTimeout(() => { busy = false; run(); }, 260);
      };
      // The result is already decided (and on everyone's state); this only
      // plays it. Let a creature finish walking before it swings, but never
      // wait long, and don't animate for a tab nobody is looking at.
      const go = () => {
        if (a && a.path.length && !document.hidden && performance.now() - born < 3000) { setTimeout(go, 80); return; }
        if (!viewRef.current || document.hidden) { impact(); return; }
        viewRef.current.playAttack(ev, { onImpact: impact });
        setTimeout(impact, 4000); // a frame-starved screen still moves on
      };
      setTimeout(go, ev.kind === 'monsterAttackRoll' ? 220 : 0);
    };
    const onCombat = (ev) => {
      if (ev.kind === 'attack') queue.push(ev);
      // never let a pile of swings build up behind a slow or hidden screen
      if (queue.length > 6) queue.splice(0, queue.length - 6);
      else if (ev.kind === 'monsterAttackRoll') queue.push({ ...ev, attackerTokenId: ev.tokenId, style: 'melee', damageType: 'slashing' });
      else if (ev.kind === 'pcDamaged') pendingDmg[ev.tokenId] = ev.amount;
      else if (ev.kind === 'ability' && ev.targetTokenId) floatText(ev.targetTokenId, ev.die ? `${ev.name} d${ev.die}` : `${ev.name}!`, 'level'); // a rage, an inspiration
      else if (ev.kind === 'hp') {
        const v = viewRef.current;
        const t = ev.tokenId || propsRef.current.scene?.tokens?.find((x) => x.characterId === ev.characterId)?.id;
        if (!t || !v) return;
        if (ev.delta > 0) { v.heal(t); floatText(t, `+${ev.delta}`, 'heal'); }
        else { v.figureOf(t)?.play('hurt'); floatText(t, `${ev.delta}`, 'dmg'); }
      }
      run();
    };
    socket.on('combatEvent', onCombat);
    return () => socket.off('combatEvent', onCombat);
  }, []);

  // ─── helpers ───────────────────────────────────────────
  function sheetOf(t) { return t?.characterId ? propsRef.current.charSheets?.[t.characterId] : null; }
  // A sheet's full numbers (the table's copy may carry only the few the
  // server needs): worked out here, with what the table says on top.
  const derivedCache = useRef(new WeakMap());
  function derivedOf(sheet) {
    if (!sheet) return null;
    let d = derivedCache.current.get(sheet);
    if (!d) { d = { ...deriveSheet(sheet), ...(sheet.derived || {}) }; derivedCache.current.set(sheet, d); }
    return d;
  }
  // Squares my hero can still walk: free exploring, the rest of its speed on
  // its turn in a fight (the server checks the same), nothing on anyone else's.
  function myBudget() {
    const P = propsRef.current;
    const me = P.scene?.tokens?.find((t) => t.id === P.myTokenId);
    if (!me) return null;
    const c = P.combat;
    if (!c?.active || !(c.round > 0) || !c.order?.some((o) => o.tokenId === me.id)) return 40;
    if (c.order[c.turnIndex]?.tokenId !== me.id) return 0;
    const sh = sheetOf(me);
    const ft = sh?.derived?.speed || parseInt(sh?.speed, 10) || 30;
    return Math.max(0, Math.floor(ft / 5) - (c.spent?.[me.id]?.move || 0));
  }
  // The walking budget for whoever is acting: mine, or a DM's free hand.
  function budgetFor(t) {
    const P = propsRef.current;
    return t.id === P.myTokenId && !(P.isDM && !P.myTokenId) ? myBudget() ?? 60 : 60;
  }
  // Who a click acts for: a creature the DM has picked, else your own hero.
  // (In guided games everyone is DM and still plays their hero.)
  function actor() {
    const P = propsRef.current, v = viewRef.current;
    const id = (P.isDM && v?.selected) || P.myTokenId;
    return P.scene?.tokens?.find((t) => t.id === id) || null;
  }
  function say(text) { setToast(text); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2600); }

  function floatText(tokenId, text, kind) {
    floatersRef.current.push({ id: Math.random(), tokenId, text, kind, born: performance.now() });
  }

  // ─── pointer intents ───────────────────────────────────
  const drag = useRef(null);
  const movingObj = useRef(null); // "Move it...": the next click puts it there
  // A DM moves a secret, lever, chest... to another square (not into a wall).
  function moveObjectTo(o, c) {
    const v = viewRef.current, P = propsRef.current;
    if (!c || (c.x === o.x && c.y === o.y)) { v.dropObject(o.id); return; }
    if (TILES[(P.scene.cells?.[c.y] || '')[c.x]]?.blocked && !'DdLS'.includes((P.scene.cells?.[c.y] || '')[c.x])) { v.dropObject(o.id); say("Can't put it in a wall"); return; }
    if ((P.scene.objects || []).some((x) => x.id !== o.id && x.x === c.x && x.y === c.y)) { v.dropObject(o.id); say('Something is already there'); return; }
    socket.emit('updateObject', { sceneId: P.scene.id, id: o.id, patch: { x: c.x, y: c.y } });
  }
  function pointerDown(e, g) {
    const v = viewRef.current, P = propsRef.current;
    setMenu(null);
    drag.current = null;
    // Pointer tool: a middle-drag draws a box to select (DM).
    if (e.button === 1 && P.tool === 'select' && P.isDM) { drag.current = { kind: 'box', x0: e.clientX, y0: e.clientY, add: e.ctrlKey || e.metaKey || e.shiftKey }; return; }
    if (e.button !== 0) return;
    if (getSelection().placing) return; // a click places; a drag pans
    const t = v.tokenAt(e.clientX, e.clientY);
    const c = v.cellAt(e.clientX, e.clientY);
    const multi = e.ctrlKey || e.metaKey;
    const ob = !t && !multi && P.isDM && (P.tool === 'select' || P.tool === 'secrets') && !P.pickingDoors && v.objectAt(e.clientX, e.clientY);
    if (P.tool === 'select' && t && P.canMoveToken(t) && !multi) drag.current = { kind: 'token', token: t };
    else if (ob) drag.current = { kind: 'object', obj: ob };
    else if (P.tool === 'measure' && c) drag.current = { kind: 'measure', a: c };
    else if (P.tool === 'fog' && P.isDM && c) drag.current = { kind: 'fog', cells: new Set([`${c.x},${c.y}`]) };
    else if (P.tool === 'build' && P.isDM && P.build && c) {
      const shape = P.build.shape || 'brush';
      if (shape === 'rect' || shape === 'room' || shape === 'copy') { drag.current = { kind: 'rect', shape, a: c, b: c }; v.previewCells(rectOf(c, c, shape === 'room'), shape === 'copy' ? '#ffe08a' : undefined); }
      else if (shape === 'fill') { drag.current = null; const cells = floodFrom(c); if (cells.length) P.onPaint?.(cells); }
      else if (shape === 'stamp') { drag.current = null; const cells = stampAt(c); if (cells.length) P.onPaint?.(cells); }
      else { drag.current = { kind: 'paint', cells: new Map() }; paintAt(c); v.previewCells([...drag.current.cells.values()]); }
    }
    else if (P.tool === 'draw' && c) drag.current = { kind: 'draw', points: [[Math.round(c.px * CELLPX), Math.round(c.pz * CELLPX)]] };
    else if (P.tool === 'erase' && c) { drag.current = { kind: 'erase', last: c, ids: new Set(v.strokesNear(c.px, c.pz, 0.35)) }; v.highlightStrokes(drag.current.ids); }
    else drag.current = null;
  }

  function paintAt(c) {
    const P = propsRef.current;
    const size = P.build.size || 1;
    const half = Math.floor(size / 2);
    for (let dy = -half; dy < size - half; dy++) for (let dx = -half; dx < size - half; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x >= 0 && y >= 0 && x < P.scene.grid.w && y < P.scene.grid.h) drag.current.cells.set(`${x},${y}`, { x, y, ch: P.build.ch });
    }
  }

  function rectOf(a, b, outline) {
    const P = propsRef.current, out = [];
    const x0 = Math.max(0, Math.min(a.x, b.x)), x1 = Math.min(P.scene.grid.w - 1, Math.max(a.x, b.x));
    const y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(P.scene.grid.h - 1, Math.max(a.y, b.y));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!outline || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
    return out;
  }
  function finishRect(d) {
    const v = viewRef.current, P = propsRef.current;
    v.previewCells(null);
    const cells = rectOf(d.a, d.b, d.shape === 'room');
    if (d.shape === 'copy') {
      const x0 = Math.min(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y);
      const w = Math.abs(d.a.x - d.b.x) + 1, h = Math.abs(d.a.y - d.b.y) + 1;
      const rows = Array.from({ length: h }, (_, y) => (P.scene.cells[y0 + y] || '').slice(x0, x0 + w));
      P.onBuildChange?.({ ...P.build, shape: 'stamp', stamp: { key: 'custom', custom: true, name: 'Your copy', rows } });
      say('Copied: click to paste it');
      return;
    }
    // A room: walls round the edge, the brush's floor inside stays as it is.
    P.onPaint?.(cells.map((c) => ({ ...c, ch: P.build.ch })));
  }
  function floodFrom(start) {
    const P = propsRef.current, sc = P.scene;
    const at = (x, y) => (sc.cells[y] || '')[x];
    const target = at(start.x, start.y);
    if (target === P.build.ch) return [];
    const seen = new Set(), out = [], q = [start];
    while (q.length && out.length < 4000) {
      const c = q.pop(), k = `${c.x},${c.y}`;
      if (seen.has(k) || c.x < 0 || c.y < 0 || c.x >= sc.grid.w || c.y >= sc.grid.h || at(c.x, c.y) !== target) continue;
      seen.add(k); out.push({ x: c.x, y: c.y, ch: P.build.ch });
      q.push({ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 });
    }
    return out;
  }
  function stampAt(c) {
    const P = propsRef.current, rows = P.build.stamp?.rows;
    if (!rows) return [];
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const x0 = c.x - Math.floor(w / 2), y0 = c.y - Math.floor(h / 2), out = [];
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const X = x0 + x, Y = y0 + y;
      if (ch !== ' ' && X >= 0 && Y >= 0 && X < P.scene.grid.w && Y < P.scene.grid.h) out.push({ x: X, y: Y, ch });
    }));
    return out;
  }

  function dragMove(e) {
    const v = viewRef.current, d = drag.current;
    if (!d) return false;
    if (d.kind === 'box') { setBox({ x0: d.x0, y0: d.y0, x1: e.clientX, y1: e.clientY }); return true; }
    const c = v.cellAt(e.clientX, e.clientY);
    if (d.kind === 'token') {
      if (!d.lifted) { d.lifted = v.liftToken(d.token.id); v.engine.renderer.domElement.style.cursor = 'grabbing'; setHover(null); }
      if (c) {
        v.dragToken(d.token.id, c.px, c.pz);
        if (!d.to || d.to.x !== c.x || d.to.y !== c.y) {
          d.to = c;
          // Show the way there (or just the square, if there's no way through).
          const occ = new Set();
          for (const t of propsRef.current.scene.tokens) if (t.id !== d.token.id && !t.dead) occ.add(t.y * propsRef.current.scene.grid.w + t.x);
          const route = reach(propsRef.current.scene, d.token, 80, occ).pathTo(c.x, c.y);
          v.showPath(route && route.length ? route : [c]);
        }
      }
      return true;
    }
    if (d.kind === 'object') {
      if (c) { d.to = c; v.dragObject(d.obj.id, c.px, c.pz); v.previewCells([c], '#ffe08a'); }
      return true;
    }
    if (d.kind === 'measure') { if (c) setMeasure({ a: d.a, b: c }); return true; }
    if (d.kind === 'fog') { if (c) d.cells.add(`${c.x},${c.y}`); return true; }
    if (d.kind === 'paint') { if (c) { paintAt(c); v.previewCells([...d.cells.values()]); } return true; }
    if (d.kind === 'rect') { if (c) { d.b = c; v.previewCells(rectOf(d.a, c, d.shape === 'room'), d.shape === 'copy' ? '#ffe08a' : undefined); } return true; }
    if (d.kind === 'draw') {
      if (c) {
        const p = [Math.round(c.px * CELLPX), Math.round(c.pz * CELLPX)], last = d.points[d.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 4) { d.points.push(p); v.previewStroke(d.points, propsRef.current.drawColor); }
      }
      return true;
    }
    if (d.kind === 'erase') {
      if (c) {
        // check every few centimetres between this and the last pointer position
        const last = d.last || c;
        const n = Math.max(1, Math.ceil(Math.hypot(c.px - last.px, c.pz - last.pz) / 0.15));
        for (let i = 1; i <= n; i++) for (const id of v.strokesNear(last.px + (c.px - last.px) * i / n, last.pz + (c.pz - last.pz) * i / n, 0.35)) d.ids.add(id);
        d.last = c;
        v.highlightStrokes(d.ids);
      }
      return true;
    }
    return false;
  }

  function pointerUp(e, g) {
    const v = viewRef.current, P = propsRef.current, d = drag.current;
    drag.current = null;
    if (d?.kind === 'box') { setBox(null); if (g.moved) boxSelect(d, e); return; }
    if (g.moved && d) {
      if (d.kind === 'token') {
        let to = d.to;
        // Dropped on a wall, a rock, a table or a chair: set it down on the
        // nearest free floor beside it.
        if (to && (isBulky(P.scene, to.x, to.y) || TILES[(P.scene.cells?.[to.y] || '')[to.x]]?.blocked)) {
          const free = (x, y) => x >= 0 && y >= 0 && x < P.scene.grid.w && y < P.scene.grid.h && !TILES[(P.scene.cells?.[y] || '')[x]]?.blocked && !isBulky(P.scene, x, y)
            && !P.scene.tokens.some((t) => t.id !== d.token.id && !t.dead && t.x === x && t.y === y);
          let best = null;
          for (let r2 = 1; r2 <= 2 && !best; r2++) for (let dy = -r2; dy <= r2; dy++) for (let dx = -r2; dx <= r2; dx++) {
            if (!best && free(to.x + dx, to.y + dy)) best = { x: to.x + dx, y: to.y + dy };
          }
          to = best;
        }
        const blocked = d.to && !to; // nowhere free near where it was dropped
        const mates = P.isDM ? getSelection().tokens : []; // a groupmate there moves on too
        const taken = to && P.scene.tokens.some((t) => t.id !== d.token.id && !t.dead && t.x === to.x && t.y === to.y && !(mates.includes(d.token.id) && mates.includes(t.id)));
        if (to && !blocked && !taken && (to.x !== d.token.x || to.y !== d.token.y)) {
          v.dropToken(d.token.id, to);
          if (!moveGroup(d.token, to)) P.onMoveToken(d.token.id, to.x, to.y);
        } else {
          v.dropToken(d.token.id, null);
          if (blocked) say("Can't stand there");
          else if (taken) say('Someone is already there');
        }
      }
      if (d.kind === 'object') { v.previewCells(null); moveObjectTo(d.obj, d.to); }
      if (d.kind === 'measure') setTimeout(() => setMeasure(null), 1600);
      if (d.kind === 'fog') P.onRevealCells?.([...d.cells], P.fogMode);
      if (d.kind === 'paint') { P.onPaint?.([...d.cells.values()]); v.previewCells(null); }
      if (d.kind === 'rect') finishRect(d);
      if (d.kind === 'draw') { if (d.points.length > 1) { P.onDrawStroke?.({ points: d.points, color: P.drawColor, width: 3 }); setTimeout(() => v.previewStroke(null), 1500); } else v.previewStroke(null); } // the saved stroke replaces the preview when it arrives
      if (d.kind === 'erase') { if (d.ids.size) P.onEraseStrokes?.([...d.ids]); v.highlightStrokes(null); }
      return;
    }
    if (g.moved) return;
    if (d?.kind === 'paint') { P.onPaint?.([...d.cells.values()]); v.previewCells(null); return; }
    if (d?.kind === 'rect') { finishRect(d); return; }
    if (d?.kind === 'erase') { if (d.ids.size) P.onEraseStrokes?.([...d.ids]); v.highlightStrokes(null); return; }
    if (d?.kind === 'draw') { v.previewStroke(null); return; }
    // A click.
    if (e.button === 1) return;
    const t = v.tokenAt(e.clientX, e.clientY);
    const c = v.cellAt(e.clientX, e.clientY);
    const placing = getSelection().placing;
    if (placing) {
      if (e.button === 2) stopPlacing();
      else if (c) placeTokenAt(P.scene, placing.token, c);
      return;
    }
    if (movingObj.current) {
      const o = movingObj.current;
      movingObj.current = null;
      if (e.button !== 2 && c) moveObjectTo(o, c); else say('Left where it was');
      return;
    }
    if (e.button === 2) { rightClick(t, c, e); return; }
    // Ctrl / Cmd + click: add to or take from the selection (DM).
    if ((e.ctrlKey || e.metaKey) && P.isDM && P.tool !== 'build') {
      const o = !t && v.objectAt(e.clientX, e.clientY);
      if (t) toggleToken(t.id);
      else if (o) toggleObject(o.id);
      return;
    }
    if (P.patrolDraft && c) { P.onPatrolPoint?.(c); return; }
    if (P.tool === 'secrets' && P.isDM && c) {
      const ch = (P.scene.cells?.[c.y] || '')[c.x];
      if (P.pickingDoors) { if ('DdLS'.includes(ch)) P.onPickDoor?.(c); else say('Click doors to link them'); return; }
      const o = v.objectAt(e.clientX, e.clientY);
      if (o) { P.onSelectObject?.(o.id); return; }
      socket.emit('placeObject', { sceneId: P.scene.id, object: withPlaceHidden({ kind: P.objKind || 'trap', x: c.x, y: c.y }) }, (r) => { if (r?.error) say(r.error); else if (r?.id) P.onSelectObject?.(r.id); });
      return;
    }
    if (P.tool !== 'select') return;
    clickSelect(t, c, e);
  }

  function clickSelect(t, c, e) {
    const v = viewRef.current, P = propsRef.current;
    const me = actor();
    if (t) {
      // 1. your own creature: selected (double-click opens its sheet)
      //    (a DM driving it: clicking it again lets it go)
      if (me && t.id === me.id) {
        if (P.isDM && v.selected === t.id) { if (clickPick('token', t.id)) { v.select(null); clearSelection(); } return; }
        selectOnly([t.id]); return;
      }
      // 2. a hero clicking a living monster: attack it
      if (me && me.kind === 'pc' && t.kind === 'monster' && !t.dead) { openAttackMenu(me, t, e); return; }
      // 3. a DM picks whom to drive (a DM who also plays a hero, as in
      //    guided games, holds Shift to do it)
      if (P.isDM && (!P.myTokenId || e.shiftKey)) { v.select(t.id, { budget: P.combat?.active ? 6 : 40 }); selectOnly([t.id]); return; }
      // 4. anyone else: selected (again: let go); double-click for the sheet, right-click to help
      clickPick('token', t.id);
      return;
    }
    if (!c) return;
    // A DM with several creatures picked: they all go, keeping their places.
    const group = P.isDM ? getSelection().tokens : [];
    if (group.length > 1) {
      const lead = P.scene.tokens.find((x) => x.id === (v.selected && group.includes(v.selected) ? v.selected : group[0]));
      if (lead) { moveGroup(lead, c); return; }
    }
    // A DM clicking a secret: it's selected.
    const ob = P.isDM && v.objectAt(e.clientX, e.clientY);
    if (ob && !me) { v.select(null); clickPick('object', ob.id); return; }
    if (!me) { if (P.isDM) { v.select(null); clearSelection(); } return; }
    clearSelection();
    // Something to use (a chest, a lever, a note): walk up to it, then use it.
    const obj = (P.scene.objects || []).find((o) => o.x === c.x && o.y === c.y && !o.hidden && o.trigger === 'touch');
    if (obj && me.kind === 'pc') { useObj(me, obj); return; }
    const ch = (P.scene.cells?.[c.y] || '')[c.x];
    if (DOORS.has(ch) && cheb(me, c) <= 1) {
      socket.emit('toggleDoor', { sceneId: P.scene.id, x: c.x, y: c.y }, (r) => r?.error && say(r.error));
      return;
    }
    walkTo(me, c.x, c.y);
  }

  // Walk up to a chest / lever / note, then use it.
  function useObj(me, obj) {
    const P = propsRef.current;
    const c = { x: obj.x, y: obj.y };
    const use = () => socket.emit('useObject', { id: obj.id }, (r) => r?.error && say(r.error));
    if (cheb(me, c) <= 1) { use(); return; }
    // stop beside it, not on it
    const occ = new Set();
    for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
    occ.add(c.y * P.scene.grid.w + c.x);
    const r = reach(P.scene, me, budgetFor(me), occ);
    let best = null;
    for (const c2 of r.cells) if (cheb(c2, c) === 1 && !occ.has(c2.y * P.scene.grid.w + c2.x) && (!best || c2.c < best.c)) best = c2;
    if (!best) { say("Can't get to it"); return; }
    walkTo(me, best.x, best.y, use);
  }

  // A selected group moves together, keeping its shape (DM). False if
  // `lead` isn't part of a group, so the caller moves it alone.
  function moveGroup(lead, to) {
    const P = propsRef.current;
    const ids = getSelection().tokens;
    if (!P.isDM || ids.length < 2 || !ids.includes(lead.id)) return false;
    for (const m of groupMoves(P.scene, ids, lead, to, P.canMoveToken)) P.onMoveToken(m.id, m.x, m.y);
    return true;
  }

  // Middle-drag box: every creature (and, for the DM, thing) inside it.
  function boxSelect(d, e) {
    const v = viewRef.current, P = propsRef.current;
    const x0 = Math.min(d.x0, e.clientX), x1 = Math.max(d.x0, e.clientX), y0 = Math.min(d.y0, e.clientY), y1 = Math.max(d.y0, e.clientY);
    const rect = v.engine.renderer.domElement.getBoundingClientRect();
    const inside = (p) => p && p.visible !== false && p.x + rect.left >= x0 && p.x + rect.left <= x1 && p.y + rect.top >= y0 && p.y + rect.top <= y1;
    const toks = (P.scene.tokens || []).filter((t) => inside(v.projectToken(t.id, 0.4))).map((t) => t.id);
    const objs = (P.scene.objects || []).filter((o) => inside(v.project(o.x + 0.5, 0.1, o.y + 0.5))).map((o) => o.id);
    if (d.add) addToSelection(toks, objs); else selectOnly(toks, objs);
    if (!d.add && toks.length === 1) v.select(toks[0], { budget: P.combat?.active ? 6 : 40 });
  }

  // Right-click: a menu for what's under the pointer.
  function rightClick(t, c, e) {
    const v = viewRef.current, P = propsRef.current;
    const me = actor();
    const at = { clientX: e.clientX, clientY: e.clientY };
    const s = getSelection();
    if (t) {
      // part of a bigger selection: the bulk menu
      if (P.isDM && s.tokens.includes(t.id) && s.tokens.length + s.objects.length > 1) { openBulkMenu(e.clientX, e.clientY); return; }
      const extra = [];
      if (me && me.kind === 'pc' && t.id !== me.id) {
        if (t.kind === 'monster' && !t.dead) extra.push({ label: `Attack ${t.label}...`, onClick: () => openAttackMenu(me, t, at) });
        if (t.kind === 'pc' || t.kind === 'npc') extra.push({ label: `Help ${t.label} (heal, inspire)...`, onClick: () => openHelpMenu(me, t, at).then((ok) => ok || say('Nothing you can do for them right now')) });
      }
      if (P.isDM && (!P.myTokenId || t.id !== P.myTokenId)) {
        extra.push({ label: 'Select it (drive it)', onClick: () => { v.select(t.id, { budget: P.combat?.active ? 6 : 40 }); selectOnly([t.id]); } });
        extra.push({ label: s.tokens.includes(t.id) ? 'Take out of the selection' : 'Add to the selection', onClick: () => toggleToken(t.id) });
      }
      if (extra.length) extra.push({ divider: true });
      P.onTokenContext?.(t, e.clientX, e.clientY, extra);
      return;
    }
    const o = v.objectAt(e.clientX, e.clientY);
    if (o && (P.isDM || !o.hidden)) {
      if (P.isDM && s.objects.includes(o.id) && s.tokens.length + s.objects.length > 1) { openBulkMenu(e.clientX, e.clientY); return; }
      setObjMenu({ x: e.clientX, y: e.clientY, items: objectItems(o, me) });
      return;
    }
    if (!c) return;
    const extra = [];
    const ch = (P.scene.cells?.[c.y] || '')[c.x];
    if (DOORS.has(ch)) extra.push({ label: ch === 'D' ? 'Open the door' : 'Close the door', onClick: () => socket.emit('toggleDoor', { sceneId: P.scene.id, x: c.x, y: c.y }, (r) => r?.error && say(r.error)) });
    if (P.isDM && s.tokens.length) {
      extra.push({ label: s.tokens.length > 1 ? `Move the ${s.tokens.length} selected here` : 'Move the selected one here', onClick: () => {
        const lead = P.scene.tokens.find((x) => x.id === s.tokens[0]);
        if (lead && !moveGroup(lead, c)) P.onMoveToken(lead.id, c.x, c.y);
      } });
    }
    if (extra.length) extra.push({ divider: true });
    P.onCellContext?.(c, e.clientX, e.clientY, extra);
  }

  // What a right-click on a secret / chest / lever / note offers.
  function objectItems(o, me) {
    const P = propsRef.current;
    const items = [{ header: o.name || o.kind }];
    if (P.isDM) {
      items.push({ label: `Edit the ${String(o.name || o.kind).toLowerCase()}...`, onClick: () => { P.onTool?.('secrets'); P.onSelectObject?.(o.id); } });
      items.push({ label: o.hidden ? 'Show it to the players' : 'Hide it from the players', onClick: () => socket.emit('updateObject', { sceneId: P.scene.id, id: o.id, patch: { hidden: !o.hidden } }) });
      items.push({ label: 'Move it... (or drag it)', onClick: () => { movingObj.current = o; say(`Click the square to move the ${String(o.name || o.kind).toLowerCase()} to`); } });
      items.push({ label: 'Set it off now', onClick: () => socket.emit('triggerObject', { id: o.id }) });
      if (o.used) items.push({ label: 'Reset it', onClick: () => socket.emit('triggerObject', { id: o.id, reset: true }) });
      items.push({ label: getSelection().objects.includes(o.id) ? 'Take out of the selection' : 'Add to the selection', onClick: () => toggleObject(o.id) });
      items.push({ divider: true });
      items.push({ label: 'Remove', danger: true, onClick: () => socket.emit('removeObject', { sceneId: P.scene.id, id: o.id }) });
    }
    if (me && me.kind === 'pc' && !o.hidden && o.trigger === 'touch' && !(o.once && o.used)) {
      items.push({ label: o.kind === 'lever' ? 'Pull it' : o.kind === 'chest' ? 'Open it' : o.kind === 'note' ? 'Read it' : 'Use it', onClick: () => useObj(me, o) });
    }
    if (!P.isDM) items.push({ label: 'Look at it', onClick: () => say(`${o.name}${o.used ? ' (used)' : ''}${o.trigger === 'touch' && !o.used ? ': walk up and use it' : ''}`) });
    return items;
  }

  function walkTo(me, x, y, then) {
    const v = viewRef.current, P = propsRef.current;
    const budget = budgetFor(me);
    if (budget === 0) { say('Wait for your turn'); return false; }
    const occ = new Set();
    for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
    // Out of a fight, a second click mid-walk routes from where the hero is
    // now, not from the square the server last heard about.
    const from = (!P.combat?.active && v.squareOf(me.id)) || me;
    const r = reach(P.scene, from, budget, occ);
    if (!r.has(x, y)) {
      // Clicked a table, a chair, someone's square: walk up next to it instead.
      let best = null;
      for (const c2 of r.cells) if (cheb(c2, { x, y }) === 1 && (!best || c2.c < best.c)) best = c2;
      if (!best || cheb(from, { x, y }) <= 1) { if (cheb(from, { x, y }) > 1) say(P.combat?.active ? 'Too far for one turn' : "Can't get there"); return false; }
      x = best.x; y = best.y;
    }
    let path = r.pathTo(x, y);
    if (!path.length) path = [{ x, y }]; // the square it's crossing: just settle there
    v.walkLocal(me.id, path, from);
    P.onMoveToken(me.id, x, y, r.cells.find((c2) => c2.x === x && c2.y === y)?.c || 0);
    // What comes after the walk (a swing, opening a chest) goes now: the
    // server has the move first, and the figure catches up on screen.
    if (then) then();
    return true;
  }

  // Pointer moves come far faster than frames: handle only the latest one,
  // once per frame. The hover card re-renders only when what's under the
  // pointer changes; following the pointer is a style write on the card.
  function hoverMove(e) {
    hoverEv.current = { clientX: e.clientX, clientY: e.clientY };
    if (hoverRaf.current) return;
    hoverRaf.current = requestAnimationFrame(() => { hoverRaf.current = 0; if (viewRef.current && hoverEv.current) hoverNow(hoverEv.current); });
  }
  function hoverNow(e) {
    const v = viewRef.current, P = propsRef.current;
    const t = v.tokenAt(e.clientX, e.clientY);
    const ob = !t && v.objectAt(e.clientX, e.clientY);
    const target = t || (ob && (!ob.hidden || P.isDM) ? ob : null);
    hoverPos.current = { x: e.clientX, y: e.clientY };
    if (cardRef.current) { cardRef.current.style.left = `${e.clientX + 16}px`; cardRef.current.style.top = `${e.clientY + 12}px`; }
    setHover((h) => {
      const cur = h && (h.token || h.object);
      if (cur === target || (cur && target && cur.id === target.id && (h.token ? h.token === t : h.object === ob))) return h;
      return !target ? null : t ? { token: t, x: e.clientX, y: e.clientY } : { object: ob, x: e.clientX, y: e.clientY };
    });
    const el = v.engine.renderer.domElement;
    const me = actor();
    if (t && me && t.kind === 'monster' && !t.dead && me.kind === 'pc') el.style.cursor = 'crosshair';
    else if (t && P.tool === 'select' && P.canMoveToken(t)) el.style.cursor = 'grab'; // left-drag picks it up
    else if (t) el.style.cursor = 'pointer';
    else if (ob && P.isDM && (P.tool === 'select' || P.tool === 'secrets')) el.style.cursor = 'grab'; // left-drag moves it
    else el.style.cursor = P.tool === 'select' ? '' : 'cell';
    if (movingObj.current) el.style.cursor = 'copy';
    if (getSelection().placing) { const c0 = v.cellAt(e.clientX, e.clientY); v.previewCells(c0 ? [c0] : null, '#7fe08a'); el.style.cursor = 'copy'; }
    else if (P.tool === 'build' && P.isDM && P.build?.shape === 'stamp') { const c0 = v.cellAt(e.clientX, e.clientY); v.previewCells(c0 ? stampAt(c0) : null, '#ffe08a'); }
    else if (P.tool !== 'build' && !drag.current) v.previewCells(null);
    // Path preview to the hovered square.
    if (P.tool === 'select' && me && !t && v.reachInfo) {
      const c = v.cellAt(e.clientX, e.clientY);
      v.showPath(c && v.reachInfo.has(c.x, c.y) ? v.reachInfo.pathTo(c.x, c.y) : null);
    } else v.showPath(null);
  }

  // ─── attacking ─────────────────────────────────────────
  async function openAttackMenu(me, target, e) {
    const sheet = sheetOf(me);
    const d = derivedOf(sheet);
    if (!d) { say('Pick a character first'); return; }
    const ac = target.ac ?? null;
    const odds = (bonus) => (ac == null ? null : Math.round(Math.max(0.05, Math.min(0.95, (21 - (ac - bonus)) / 20)) * 100));
    const items = [];
    for (const a of d.attacks || []) {
      const rangeFt = a.range ? parseInt(a.range.normal ?? a.range, 10) || 30 : 5;
      items.push({
        key: `w-${a.name}`, name: a.name, kind: a.range ? 'ranged' : 'melee', rangeFt,
        detail: `${a.damage}${a.damageMod ? (a.damageMod > 0 ? `+${a.damageMod}` : a.damageMod) : ''}${sheet.raging && !a.range && (a.ability || 'str') === 'str' ? ` +${rageBonus(sheet.level || 1)} rage` : ''} ${a.damageType}`,
        odds: odds(a.bonus),
        info: [
          `Roll d20 ${a.bonus >= 0 ? '+' : ''}${a.bonus} (${(a.ability || 'str').toUpperCase()} + proficiency)${ac != null ? ` against AC ${ac}` : ''}; meet it and you hit for ${a.damage}${a.damageMod ? (a.damageMod > 0 ? `+${a.damageMod}` : a.damageMod) : ''} ${a.damageType}. A natural 20 doubles the dice.`,
          a.range ? `Reach: ${parseInt(a.range.normal ?? a.range, 10) || 30} ft; beyond that you roll with disadvantage.` : 'Melee: the foe must be next to you; your hero walks up first.',
          ...(a.properties || []).filter((p) => WEAPON_PROPERTIES[p]).map((p) => `${p[0].toUpperCase()}${p.slice(1)}: ${WEAPON_PROPERTIES[p]}`),
        ],
        // the server works the numbers out from the sheet; `ref` says which
        attack: { ref: `w:${a.name}`, name: a.name, style: a.range ? 'ranged' : 'melee' },
      });
    }
    // Your own bonus actions and features (Rage, Second Wind, a heal on yourself).
    const own = supportItems(me, me, sheet, []);
    items.push(...own);
    setMenu({ x: e.clientX, y: e.clientY, me, target, items, loading: !!sheet.spellcasting, walkable: canWalkUp(me, target) });
    // Damaging spells (cantrips always; levelled ones while a slot is free).
    const sc = sheet.spellcasting;
    if (sc && d.spell) {
      const known = await knownSpells(sheet);
      items.splice(items.length - own.length, own.length); // they go back at the end, with the healing spells
      const spells = known.filter((s) => s.damage?.damage_type); // typed damage only (Sleep's dice are a pool, not harm)
      const level = sheet.level || 1;
      const slotFree = slotFreeFor(sheet);
      for (const sp of spells) {
        if (sp.level > 0 && !slotFree(sp.level)) continue; // no slot of that level left
        const dice = spellDice(sp, Math.max(1, sp.level), level);
        if (!dice) continue;
        const rangeFt = /self/i.test(sp.range || '') ? 5 : parseInt(sp.range, 10) || (/touch/i.test(sp.range || '') ? 5 : 60);
        const save = sp.dc?.dc_type?.index;
        const type = sp.damage?.damage_type?.index || 'force';
        items.push({
          key: `s-${sp.index}`, name: sp.name, kind: 'spell', rangeFt, level: sp.level,
          detail: `${dice} ${type}${save ? ` · ${save.toUpperCase()} save` : ''}${sp.level ? ` · uses a level ${sp.level} slot` : ''}`,
          odds: save ? null : sp.index === 'magic-missile' ? 100 : odds(d.spell.attackBonus),
          info: [
            summarize((sp.desc || []).join(' '), 170),
            save
              ? `${target.label} rolls a ${save.toUpperCase()} save against your DC ${d.spell.dc}: ${sp.dc?.dc_success === 'half' ? 'half damage if it succeeds' : 'no damage if it succeeds'}.`
              : sp.index === 'magic-missile' ? 'No attack roll: the darts always hit.'
                : `Spell attack: d20 +${d.spell.attackBonus}${ac != null ? ` against AC ${ac}` : ''}.`,
            `${sp.casting_time}, range ${sp.range}. ${sp.level ? `Uses a level ${sp.level} spell slot.` : 'A cantrip: free, as often as you like.'}`,
          ],
          attack: { ref: `s:${sp.index}`, slot: Math.max(1, sp.level), name: sp.name, style: 'spell' },
        });
      }
      items.push(...supportItems(me, me, sheet, known));
    }
    setMenu((m) => (m && m.target.id === target.id ? { ...m, items: [...items], loading: false } : m));
  }

  // The spells a hero has ready, looked up once each.
  async function knownSpells(sheet) {
    const sc = sheet.spellcasting;
    if (!sc) return [];
    const idx = [...new Set([...(sc.cantrips || []), ...(sc.prepared || []), ...(sc.known || [])])];
    return (await Promise.all(idx.map((i) => srd.spell(i).catch(() => null)))).filter((s) => s && !s.error);
  }
  function slotFreeFor(sheet) {
    const d = derivedOf(sheet), sc = sheet.spellcasting || {};
    const max = d?.spell?.maxSlots || {}, used = sc.slotsUsed || {};
    return (lv) => (d?.spell?.innate ? true : max.pact ? max.pact.level >= lv && (used.pact || 0) < max.pact.slots : (max[lv] || 0) > (used[lv] || 0));
  }
  // Can my hero still walk up next to `target` this turn?
  function canWalkUp(me, target) {
    const P = propsRef.current;
    if (cheb(me, target) <= 1) return true;
    const occ = new Set();
    for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
    return reach(P.scene, me, budgetFor(me), occ).cells.some((c) => cheb(c, target) === 1);
  }

  // Healing and class features a hero can use on `target` (itself or a friend),
  // resolved by the server's heroAction like an attack.
  function supportItems(me, target, sheet, spells) {
    const self = target.id === me.id;
    const tSheet = sheetOf(target);
    const out = [];
    const hurt = tSheet ? (tSheet.currentHp ?? 0) < (tSheet.maxHp ?? 0) : target.hp != null && target.hp < (target.maxHp ?? target.hp);
    for (const f of heroFeatures(sheet)) {
      if (f.self && !self) continue;
      if (f.notSelf && self) continue;
      if (f.heroOnly && target.kind !== 'pc') continue;
      if (f.key === 'rage' && sheet.raging) continue;
      if (f.key === 'bardic-inspiration' && tSheet?.bardicDie) continue;
      if ((f.key === 'second-wind' || f.key === 'lay-on-hands') && !hurt) continue;
      const left = f.left === Infinity ? 'unlimited' : f.pool ? `${f.left} HP left` : `${f.left}/${f.max} left`;
      out.push({
        key: `f-${f.key}`, name: f.name, kind: 'ability', rangeFt: f.rangeFt || 5, self: !!f.self, walk: !f.self && (f.rangeFt || 5) <= 5,
        disabled: f.left <= 0 ? `None left: it comes back on a ${f.rest(sheet)} rest` : null,
        detail: `${f.detail(sheet, f.left)}${self && !f.self ? ' · on yourself' : ''} · ${left}`,
        info: f.info(sheet),
        action: { ref: `f:${f.key}` },
      });
    }
    if (hurt) {
      const slotFree = slotFreeFor(sheet);
      for (const sp of spells) {
        if (!HEAL_SPELLS.has(sp.index) || !slotFree(sp.level)) continue;
        const rangeFt = /touch|self/i.test(sp.range || '') ? 5 : parseInt(sp.range, 10) || 60;
        const dice = String(sp.heal_at_slot_level?.[sp.level] || '').replace(/\s*\+\s*MOD/i, ` + ${(sheet.spellcasting?.ability || 'spell').toUpperCase()}`);
        out.push({
          key: `h-${sp.index}`, name: sp.name, kind: 'spell', rangeFt, level: sp.level, walk: rangeFt <= 5,
          detail: `heals ${dice}${self ? ' · on yourself' : ''}${/bonus/i.test(sp.casting_time) ? ' · bonus action' : ''} · uses a level ${sp.level} slot`,
          info: [summarize((sp.desc || []).join(' '), 170), `${sp.casting_time}, range ${sp.range}. Uses a level ${sp.level} spell slot.`],
          action: { ref: `s:${sp.index}`, slot: sp.level },
        });
      }
    }
    return out;
  }

  // A friend clicked: heal or inspire them (or open their sheet).
  async function openHelpMenu(me, target, e) {
    const sheet = sheetOf(me);
    if (!sheet) return false;
    const items = supportItems(me, target, sheet, sheet.spellcasting ? await knownSpells(sheet) : []);
    if (!items.length) return false;
    setMenu({ x: e.clientX, y: e.clientY, me, target, items, help: true, walkable: canWalkUp(me, target) });
    return true;
  }

  function doAttack(item) {
    const P = propsRef.current;
    const { me } = menu;
    const target = item.self ? me : menu.target;
    setMenu(null);
    if (item.disabled) { say(item.disabled); return; }
    // the server spends any slot or use; the sheet shows it from the next patch
    const send = () => (item.action
      ? socket.emit('heroAction', { actorTokenId: me.id, targetTokenId: target.id, action: item.action }, (r) => r?.error && say(r.error))
      : socket.emit('attackToken', { attackerTokenId: me.id, targetTokenId: target.id, attack: item.attack }, (r) => r?.error && say(r.error)));
    const reachCells = Math.max(1, Math.floor(item.rangeFt / 5));
    if (item.self || cheb(me, target) <= reachCells) { send(); return; }
    if (item.kind === 'melee' || item.walk) {
      // Walk to the nearest free square next to the target, then swing.
      const occ = new Set();
      for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
      const r = reach(P.scene, me, budgetFor(me), occ);
      let best = null;
      for (const c of r.cells) if (cheb(c, target) === 1 && (!best || c.c < best.c)) best = c;
      if (!best) { say(`${target.label} is out of reach`); return; }
      walkTo(me, best.x, best.y, send);
      return;
    }
    say(`${target.label} is out of range (${item.rangeFt} ft)`);
  }

  // ─── overlays that follow the world ────────────────────
  const placeOverlays = useCallback(() => {
    const v = viewRef.current, root = overlayRef.current;
    if (!v || !root) return;
    const P = propsRef.current;
    const tokens = P.scene?.tokens || [];
    // Runs every frame, so it only touches the page where something changed
    // (rewriting every plate's text and classes each frame kept the browser
    // restyling the board and made the buttons around it feel sticky).
    const plates = platesRef.current;
    const want = new Set();
    const turnId = P.combat?.active && P.combat.round > 0 ? P.combat.order?.[P.combat.turnIndex]?.tokenId : null;
    const set = (rec, key, val, apply) => { if (rec[key] !== val) { rec[key] = val; apply(val); } };
    // what the players have seen (fog on): a creature outside it is dark to them
    const sc = P.scene;
    if (seenRef.current.src !== sc?.revealed || seenRef.current.on !== !!sc?.fogEnabled) seenRef.current = { src: sc?.revealed, on: !!sc?.fogEnabled, set: sc?.fogEnabled ? new Set(sc.revealed || []) : null };
    const seen = seenRef.current.set;
    for (const t of tokens) {
      const show = (t.kind === 'pc') || (t.kind === 'monster' && (P.combat?.active || P.isDM)) || t.kind === 'npc';
      if (!show || t.dead) continue;
      const p = v.projectToken(t.id, 1.32);
      if (!p || !p.visible) continue;
      want.add(t.id);
      let rec = plates.get(t.id);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'w3-plate';
        el.dataset.t = t.id;
        el.innerHTML = `<span class="w3-hid" hidden>${iconMarkup('visibility_off', 11)}<b></b></span><span class="w3-name"></span><span class="w3-hp"><i></i></span>`;
        root.appendChild(el);
        rec = { el, hid: el.children[0], name: el.children[1], bar: el.children[2] };
        plates.set(t.id, rec);
      }
      const sheet = t.characterId ? P.charSheets?.[t.characterId] : null;
      const hp = sheet ? sheet.currentHp : t.hp;
      const max = sheet ? sheet.maxHp : t.maxHp;
      set(rec, 'text', sheet?.name || t.label, (x) => { rec.name.textContent = x; });
      const k = hp != null && max ? Math.max(0, Math.min(1, hp / max)) : null;
      set(rec, 'shown', k != null, (x) => { rec.bar.style.display = x ? '' : 'none'; });
      if (k != null) {
        set(rec, 'w', k, (x) => { rec.bar.firstChild.style.width = `${x * 100}%`; });
        set(rec, 'cls', `w3-hp ${k <= 0.25 ? 'low' : k <= 0.5 ? 'mid' : ''} ${t.kind === 'monster' ? 'foe' : ''}`, (x) => { rec.bar.className = x; });
      }
      set(rec, 'tf', `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`, (x) => { rec.el.style.transform = x; });
      set(rec, 'turn', t.id === turnId, (x) => rec.el.classList.toggle('turn', x));
      // The DM sees at a glance what the players can't: hidden, or out in the dark.
      const unseen = !P.isDM || t.kind === 'pc' ? '' : t.hidden ? 'Hidden' : seen && !seen.has(`${t.x},${t.y}`) ? 'In the dark' : '';
      set(rec, 'unseen', unseen, (x) => { rec.hid.hidden = !x; rec.hid.lastChild.textContent = x; rec.hid.className = `w3-hid ${x === 'Hidden' ? '' : 'dark'}`; rec.el.classList.toggle('unseen', !!x); });
    }
    for (const [id, rec] of plates) if (!want.has(id)) { rec.el.remove(); plates.delete(id); }
    // Hidden things (traps, secrets, a chest placed hidden): a badge over each, for the DM.
    const badges = badgesRef.current;
    const wantB = new Set();
    if (P.isDM) for (const o of P.scene?.objects || []) {
      if (!o.hidden) continue;
      const p = v.project(o.x + 0.5, 0.75, o.y + 0.5);
      if (!p || !p.visible) continue;
      wantB.add(o.id);
      let b = badges.get(o.id);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'w3-objhid';
        el.innerHTML = `${iconMarkup('visibility_off', 11)}<b></b>`;
        root.appendChild(el);
        b = { el };
        badges.set(o.id, b);
      }
      set(b, 'text', `${o.name || o.kind} · hidden`, (x) => { b.el.lastChild.textContent = x; });
      set(b, 'tf', `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`, (x) => { b.el.style.transform = x; });
    }
    for (const [id, b] of badges) if (!wantB.has(id)) { b.el.remove(); badges.delete(id); }
    // Floating numbers.
    const now = performance.now();
    floatersRef.current = floatersRef.current.filter((f) => now - f.born < (f.kind === 'level' ? 2600 : 1500));
    const fl = new Set(floatersRef.current.map((f) => String(f.id)));
    for (const f of floatersRef.current) {
      let el = root.querySelector(`[data-f="${f.id}"]`);
      if (!el) { el = document.createElement('div'); el.className = `w3-float ${f.kind}`; el.dataset.f = f.id; el.textContent = f.text; root.appendChild(el); }
      const p = v.projectToken(f.tokenId, 1.5);
      if (!p) continue;
      const k = (now - f.born) / (f.kind === 'level' ? 2600 : 1500);
      el.style.transform = `translate(${p.x}px, ${p.y - k * 60}px) translate(-50%, -100%) scale(${1 + (1 - k) * 0.3})`;
      el.style.opacity = String(1 - k * k);
    }
    for (const el of [...root.querySelectorAll('.w3-float')]) if (!fl.has(el.dataset.f)) el.remove();
  }, []);

  // ─── keys ──────────────────────────────────────────────
  useEffect(() => {
    // Keys come from keybinds.js (Controls & keys in the ⋯ menu).
    const down = (e) => {
      const v = viewRef.current;
      if (!v || isTyping()) return;
      if (!(e.ctrlKey || e.metaKey || e.altKey)) {
        const held = heldActions(e);
        if (held.length) { held.forEach((a) => v.keys.add(a)); if (e.key.startsWith('Arrow')) e.preventDefault(); return; }
      }
      if (e.repeat) return;
      if (matches(e, 'cam.center')) { e.preventDefault(); v.frame(); setFollow(true); }
      if (matches(e, 'cam.overview')) v.overview();
      if (matches(e, 'sel.cancel')) { setMenu(null); setObjMenu(null); movingObj.current = null; if (propsRef.current.isDM) v.select(null); }
    };
    const up = (e) => { const v = viewRef.current; if (v) heldActions(e).forEach((a) => v.keys.delete(a)); };
    const blur = () => viewRef.current?.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  const hoverCard = useMemo(() => {
    if (!hover || !hover.token) return null;
    const t = hover.token;
    const sheet = sheetOf(t);
    const hp = sheet ? sheet.currentHp : t.hp, max = sheet ? sheet.maxHp : t.maxHp;
    let state = null;
    if (hp != null && max) {
      if (isDM || t.kind === 'pc') state = `${hp} / ${max} HP`;
      else state = hp <= 0 ? 'Down' : hp / max <= 0.25 ? 'Nearly dead' : hp / max <= 0.5 ? 'Bloodied' : hp < max ? 'Hurt' : 'Unhurt';
    }
    return { t, sheet, state };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, isDM]);

  const me = scene?.tokens?.find((t) => t.id === myTokenId);

  return (
    <div
      className={`w3-root ${sel.placing ? 'placing' : ''}`}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
      onDragOver={(e) => { if (isDM && isMonsterDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={(e) => {
        if (!isDM || !isMonsterDrag(e)) return;
        e.preventDefault();
        const c = viewRef.current?.cellAt(e.clientX, e.clientY);
        if (c) dropMonsterAt(scene, e.dataTransfer.getData(DRAG_MIME), c);
      }}
    >
      <div className="w3-stage" ref={host} />
      <div className="w3-overlay" ref={overlayRef} />
      {arrive && (
        <div className={`w3-arrive ${arrive.phase}`} aria-live="polite">
          {!arrive.first && <span className="w3-arrive-name">{arrive.name}</span>}
        </div>
      )}
      {measure && (() => {
        const v = viewRef.current;
        const a = v?.project(measure.a.x + 0.5, 0.1, measure.a.y + 0.5), b = v?.project(measure.b.x + 0.5, 0.1, measure.b.y + 0.5);
        if (!a || !b) return null;
        const ft = cheb(measure.a, measure.b) * 5;
        return (
          <svg className="w3-measure"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>{ft} ft</text></svg>
        );
      })()}
      {hover?.object && !menu && (
        <div className="w3-card" ref={cardRef} style={{ left: hoverPos.current.x + 16, top: hoverPos.current.y + 12 }}>
          <b>{hover.object.name}</b>
          {isDM && <span className="w3-card-cond">{hover.object.hidden ? 'Hidden from players' : 'Players can see it'}{hover.object.used ? ' · used' : ''}</span>}
          {hover.object.trigger === 'touch' && !hover.object.used && !isDM && <span className="w3-card-hint">Click to use</span>}
          {isDM && <span className="w3-card-hint">Right-click to edit</span>}
          {hover.object.kind === 'exit' && <span className="w3-card-hint">Walk onto it to go on</span>}
        </div>
      )}
      {bubbles.map((b) => <Bubble key={b.id} view={viewRef} tokenId={b.tokenId} text={b.text} />)}
      {hoverCard && !menu && (
        <div className="w3-card" ref={cardRef} style={{ left: hoverPos.current.x + 16, top: hoverPos.current.y + 12 }}>
          <b>{hoverCard.sheet?.name || hoverCard.t.label}</b>
          {hoverCard.sheet && <span>Level {hoverCard.sheet.level || 1} {hoverCard.sheet.raceName || ''} {hoverCard.sheet.className || ''}</span>}
          {hoverCard.state && <span className="w3-card-hp">{hoverCard.state}</span>}
          {(hoverCard.t.conditions || []).length > 0 && <span className="w3-card-cond">{hoverCard.t.conditions.join(', ')}</span>}
          {hoverCard.t.kind === 'monster' && me && !hoverCard.t.dead && <span className="w3-card-hint">Click to attack</span>}
          {hoverCard.t.shop && hoverCard.t.shop.open !== false && !hoverCard.t.dead && <span className="w3-card-hint">Merchant: double-click to shop</span>}
          {(hoverCard.sheet || (hoverCard.t.kind === 'monster' && hoverCard.t.monsterIndex && (isDM || !hoverCard.t.hidden))) && <span className="w3-card-hint">Double-click: {hoverCard.sheet ? 'sheet' : 'stat block'} · right-click: menu</span>}
        </div>
      )}
      {menu && (
        <div className="w3-menu" style={{ left: Math.min(menu.x + 8, window.innerWidth - 300), top: Math.max(8, Math.min(menu.y + 8, window.innerHeight - 60 - menu.items.length * 54)) }}>
          <div className="w3-menu-head">{menu.help ? 'Help' : 'Attack'} {menu.target.label}{!menu.help && menu.target.ac != null && <span title="Armor class: your attack roll must reach this to hit">AC {menu.target.ac}</span>}</div>
          {(menu.target.conditions || []).map((c) => {
            const cond = CONDITIONS.find((x) => x.index === c);
            return cond ? <div key={c} className="w3-menu-cond"><b>{cond.name}:</b> {cond.brief}</div> : null;
          })}
          {menu.items.map((it) => (
            <div key={it.key} className="w3-menu-row">
              <button className="w3-menu-item" onClick={() => doAttack(it)}>
                <span className="w3-menu-name">{it.name}{it.kind === 'spell' && <em> spell</em>}{it.kind === 'ability' && <em> {it.self ? 'yourself' : 'feature'}</em>}</span>
                <span className="w3-menu-detail">{it.detail}{!it.self && cheb(menu.me, menu.target) > Math.floor(it.rangeFt / 5) ? (it.kind === 'melee' || it.walk ? (menu.walkable ? ' · walks up first' : ' · too far to walk this turn') : ' · out of range') : ''}{it.disabled ? ' · none left' : ''}</span>
                {it.odds != null && <span className="w3-menu-odds" title="Your chance to hit">{it.odds}%</span>}
              </button>
              {it.info && (
                <button className={`w3-menu-why ${why === it.key ? 'on' : ''}`} aria-expanded={why === it.key} aria-label={`What does ${it.name} do?`} title={`What does ${it.name} do?`} onClick={() => setWhy((k) => (k === it.key ? null : it.key))}>
                  <InfoIcon size={15} />
                </button>
              )}
              {why === it.key && <div className="w3-menu-info">{it.info.filter(Boolean).map((l) => <p key={l}>{l}</p>)}</div>}
            </div>
          ))}
          {menu.loading && <div className="w3-menu-note">Looking up your spells…</div>}
          {!menu.loading && !menu.items.length && <div className="w3-menu-note">No attacks on this sheet. Equip a weapon on the Gear tab.</div>}
          {menu.help && <button className="w3-menu-cancel" onClick={() => { const t = menu.target; setMenu(null); propsRef.current.onTokenClick?.(t); }}>{menu.target.kind === 'pc' ? 'Open their sheet' : 'Details'}</button>}
          <button className="w3-menu-cancel" onClick={() => setMenu(null)}>Cancel</button>
        </div>
      )}
      <div className="w3-view">
        <button onClick={() => { viewRef.current?.frame(); setFollow(true); }} title={`Back to your hero (${firstKey('cam.center')})`}>Center</button>
        <button onClick={() => viewRef.current?.overview()} title={`See the whole place (${firstKey('cam.overview')})`}>Overview</button>
        <button className={follow ? 'on' : ''} onClick={() => setFollow((f) => !f)} title="Camera follows your hero as they walk">Follow</button>
        <button className={cutaway ? 'on' : ''} aria-pressed={cutaway} onClick={() => setCutaway((c) => !c)} title={cutaway ? 'Walls on the camera side drop so you can see in. Click to keep every wall standing' : 'Every wall stands. Click to drop the walls on the camera side so you can see in'}>{cutaway ? 'Walls: cut' : 'Walls: up'}</button>
      </div>
      {toast && <div className="w3-toast">{toast}</div>}
      {isDM && sel.tokens.length > 1 ? (
        <div className="w3-hint">{sel.tokens.length} selected — drag one or click a square to move them together · right-click for more · {keyLabel('sel.cancel')} to let go</div>
      ) : selected && isDM && <div className="w3-hint">Selected: {scene?.tokens?.find((t) => t.id === selected)?.label} — click a square to move it, a foe to attack · {keyLabel('sel.cancel')} to let go</div>}
      {box && <div className="mc-box" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
      {objMenu && <ContextMenu x={objMenu.x} y={objMenu.y} items={objMenu.items} onClose={() => setObjMenu(null)} />}
      <MapControls scene={scene} isDM={isDM} />
    </div>
  );
}

// A speech bubble that follows a creature's head.
function Bubble({ view, tokenId, text }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const loop = () => {
      const p = view.current?.projectToken(tokenId, 1.55);
      if (ref.current && p) { ref.current.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`; ref.current.style.opacity = p.visible ? 1 : 0; }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [view, tokenId]);
  return <div ref={ref} className="w3-bubble">{text}</div>;
}
