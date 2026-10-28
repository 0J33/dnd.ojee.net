import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorldView, { reach, isBulky } from '../world/WorldView';
import { socket } from '../socket';
import { srd } from '../api';
import { spellDice } from './CharacterSheet';
import { TILES } from '../data/tiles';

// The battle map in 3D. Same props as MapCanvas, so the board can switch
// between them; the difference is how it plays:
//   click a square       → your hero walks there (the reachable squares glow)
//   click a foe          → an attack menu with your attacks and spells, with
//                          your odds; out of reach, you walk up first
//   click a door         → open / close it (when you're next to it)
//   double-click         → ping
//   drag the felt        → move the camera; right-drag turns; wheel zooms
// The DM selects any creature first, then does the same on its behalf.

const CELLPX = 56; // 2d map units (strokes are stored in these)
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const DOORS = new Set(['D', 'd']);

export default function Map3D({
  scene, isDM, tool, fogMode, drawColor, build, charSheets, combat, userId, canMoveToken, pings,
  onMoveToken, onTokenContext, onCellContext, onTokenClick, onRevealCells, onPing, onDrawStroke, onEraseStrokes, onPaint,
  myTokenId, members = [],
  onBuildChange, objKind, selectedObjectId, onSelectObject, pickingDoors, onPickDoor, patrolDraft, onPatrolPoint,
}) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const overlayRef = useRef(null);
  const [hover, setHover] = useState(null);       // { token, x, y }
  const hoverEv = useRef(null), hoverRaf = useRef(0), hoverPos = useRef({ x: 0, y: 0 }), cardRef = useRef(null);
  useEffect(() => () => cancelAnimationFrame(hoverRaf.current), []);
  const [menu, setMenu] = useState(null);         // attack menu
  const [measure, setMeasure] = useState(null);   // { a, b }
  const [toast, setToast] = useState(null);
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState(null);
  const platesRef = useRef(new Map());
  const floatersRef = useRef([]);
  const propsRef = useRef({});
  propsRef.current = { onBuildChange, objKind, selectedObjectId, onSelectObject, pickingDoors, onPickDoor, patrolDraft, onPatrolPoint, scene, isDM, tool, fogMode, drawColor, build, charSheets, combat, userId, canMoveToken, myTokenId, onMoveToken, onTokenContext, onCellContext, onTokenClick, onRevealCells, onPing, onDrawStroke, onEraseStrokes, onPaint };

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
          const c = view.cellAt(e.clientX, e.clientY);
          if (c) propsRef.current.onPing?.(c.x, c.y);
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
  }, [scene, isDM, charSheets, userId, myTokenId, combat, members, turnTokenId]);

  useEffect(() => { if (viewRef.current) viewRef.current.follow = follow; }, [follow]);
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

  // My hero is always "selected" for a player: click = move / attack.
  useEffect(() => {
    const v = viewRef.current;
    if (!v || isDM) return;
    if (myTokenId && v.selected !== myTokenId) v.select(myTokenId, { budget: myBudget() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTokenId, isDM, scene?.tokens, combat?.turnIndex, combat?.active]);

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
      // Let a creature finish walking before it swings.
      const go = () => {
        if (a && a.path.length) { setTimeout(go, 80); return; }
        v.playAttack(ev, {
          onImpact: () => {
            const dmg = ev.damage ?? pendingDmg[ev.targetTokenId];
            delete pendingDmg[ev.targetTokenId];
            if (ev.hit) floatText(ev.targetTokenId, ev.crit ? `CRIT ${dmg ?? ''}` : `-${dmg ?? ''}`, ev.crit ? 'crit' : 'dmg');
            else floatText(ev.targetTokenId, ev.save?.saved ? 'Saved' : 'Miss', 'miss');
            setTimeout(() => { busy = false; run(); }, 260);
          },
        });
      };
      setTimeout(go, ev.kind === 'monsterAttackRoll' ? 220 : 0);
    };
    const onCombat = (ev) => {
      if (ev.kind === 'attack') queue.push(ev);
      else if (ev.kind === 'monsterAttackRoll') queue.push({ ...ev, attackerTokenId: ev.tokenId, style: 'melee', damageType: 'slashing' });
      else if (ev.kind === 'pcDamaged') pendingDmg[ev.tokenId] = ev.amount;
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
  function myBudget() {
    const P = propsRef.current;
    const me = P.scene?.tokens?.find((t) => t.id === P.myTokenId);
    if (!me) return null;
    if (!P.combat?.active) return 40;
    const sh = sheetOf(me);
    const ft = sh?.derived?.speed || parseInt(sh?.speed, 10) || 30;
    return Math.max(1, Math.floor(ft / 5));
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
  function pointerDown(e, g) {
    const v = viewRef.current, P = propsRef.current;
    setMenu(null);
    if (e.button !== 0) return;
    const t = v.tokenAt(e.clientX, e.clientY);
    const c = v.cellAt(e.clientX, e.clientY);
    if (P.tool === 'select' && t && P.canMoveToken(t)) drag.current = { kind: 'token', token: t };
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
        const taken = to && P.scene.tokens.some((t) => t.id !== d.token.id && !t.dead && t.x === to.x && t.y === to.y);
        if (to && !blocked && !taken && (to.x !== d.token.x || to.y !== d.token.y)) {
          v.dropToken(d.token.id, to);
          P.onMoveToken(d.token.id, to.x, to.y);
        } else {
          v.dropToken(d.token.id, null);
          if (blocked) say("Can't stand there");
          else if (taken) say('Someone is already there');
        }
      }
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
    const t = v.tokenAt(e.clientX, e.clientY);
    const c = v.cellAt(e.clientX, e.clientY);
    if (e.button === 2) {
      if (t) P.onTokenContext?.(t, e.clientX, e.clientY);
      else if (c) P.onCellContext?.(c, e.clientX, e.clientY);
      return;
    }
    if (P.patrolDraft && c) { P.onPatrolPoint?.(c); return; }
    if (P.tool === 'secrets' && P.isDM && c) {
      const ch = (P.scene.cells?.[c.y] || '')[c.x];
      if (P.pickingDoors) { if ('DdLS'.includes(ch)) P.onPickDoor?.(c); else say('Click doors to link them'); return; }
      const o = v.objectAt(e.clientX, e.clientY);
      if (o) { P.onSelectObject?.(o.id); return; }
      socket.emit('placeObject', { sceneId: P.scene.id, object: { kind: P.objKind || 'trap', x: c.x, y: c.y } }, (r) => { if (r?.error) say(r.error); else if (r?.id) P.onSelectObject?.(r.id); });
      return;
    }
    if (P.tool !== 'select') return;
    clickSelect(t, c, e);
  }

  function clickSelect(t, c, e) {
    const v = viewRef.current, P = propsRef.current;
    const me = actor();
    if (t) {
      // 1. your own creature: its sheet
      if (me && t.id === me.id) { P.onTokenClick?.(t); return; }
      // 2. a hero clicking a living monster: attack it
      if (me && me.kind === 'pc' && t.kind === 'monster' && !t.dead) { openAttackMenu(me, t, e); return; }
      // 3. a DM picks whom to drive (a DM who also plays a hero, as in
      //    guided games, holds Shift to do it)
      if (P.isDM && (!P.myTokenId || e.shiftKey)) { v.select(t.id, { budget: P.combat?.active ? 6 : 40 }); return; }
      P.onTokenClick?.(t);
      return;
    }
    if (!c) return;
    if (!me) { if (P.isDM) v.select(null); return; }
    // Something to use (a chest, a lever, a note): walk up to it, then use it.
    const obj = (P.scene.objects || []).find((o) => o.x === c.x && o.y === c.y && !o.hidden && o.trigger === 'touch');
    if (obj && me.kind === 'pc') {
      const use = () => socket.emit('useObject', { id: obj.id }, (r) => r?.error && say(r.error));
      if (cheb(me, c) <= 1) { use(); return; }
      // stop beside it, not on it
      const occ = new Set();
      for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
      occ.add(c.y * P.scene.grid.w + c.x);
      const r = reach(P.scene, me, P.combat?.active ? myBudget() : 60, occ);
      let best = null;
      for (const c2 of r.cells) if (cheb(c2, c) === 1 && !occ.has(c2.y * P.scene.grid.w + c2.x) && (!best || c2.c < best.c)) best = c2;
      if (!best) { say("Can't get to it"); return; }
      walkTo(me, best.x, best.y, use);
      return;
    }
    const ch = (P.scene.cells?.[c.y] || '')[c.x];
    if (DOORS.has(ch) && cheb(me, c) <= 1) {
      socket.emit('toggleDoor', { sceneId: P.scene.id, x: c.x, y: c.y }, (r) => r?.error && say(r.error));
      return;
    }
    walkTo(me, c.x, c.y);
  }

  function walkTo(me, x, y, then) {
    const v = viewRef.current, P = propsRef.current;
    const budget = P.combat?.active && !P.isDM ? myBudget() : 60;
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
    P.onMoveToken(me.id, x, y);
    if (then) { const fig = v.figureOf(me.id); const wait = () => (fig && fig.path.length ? setTimeout(wait, 60) : then()); setTimeout(wait, 60); }
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
    else el.style.cursor = P.tool === 'select' ? '' : 'cell';
    if (P.tool === 'build' && P.isDM && P.build?.shape === 'stamp') { const c0 = v.cellAt(e.clientX, e.clientY); v.previewCells(c0 ? stampAt(c0) : null, '#ffe08a'); }
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
    const d = sheet?.derived;
    if (!d) { say('Pick a character first'); return; }
    const ac = target.ac ?? null;
    const odds = (bonus) => (ac == null ? null : Math.round(Math.max(0.05, Math.min(0.95, (21 - (ac - bonus)) / 20)) * 100));
    const items = [];
    for (const a of d.attacks || []) {
      const rangeFt = a.range ? parseInt(a.range.normal ?? a.range, 10) || 30 : 5;
      items.push({
        key: `w-${a.name}`, name: a.name, kind: a.range ? 'ranged' : 'melee', rangeFt,
        detail: `${a.damage}${a.damageMod ? (a.damageMod > 0 ? `+${a.damageMod}` : a.damageMod) : ''} ${a.damageType}`,
        odds: odds(a.bonus),
        attack: { name: a.name, style: a.range ? 'ranged' : 'melee', bonus: a.bonus, damage: `${a.damage}${a.damageMod ? (a.damageMod > 0 ? `+${a.damageMod}` : a.damageMod) : ''}`, damageType: a.damageType },
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, me, target, items, loading: !!sheet.spellcasting });
    // Damaging spells (cantrips always; levelled ones while a slot is free).
    const sc = sheet.spellcasting;
    if (sc && d.spell) {
      const idx = [...(sc.cantrips || []), ...(sc.prepared || []), ...(sc.known || [])];
      const spells = (await Promise.all([...new Set(idx)].map((i) => srd.spell(i).catch(() => null)))).filter((s) => s && !s.error && s.damage);
      const level = sheet.level || 1;
      for (const sp of spells) {
        const dice = spellDice(sp, Math.max(1, sp.level), level);
        if (!dice) continue;
        const rangeFt = /self/i.test(sp.range || '') ? 5 : parseInt(sp.range, 10) || (/touch/i.test(sp.range || '') ? 5 : 60);
        const save = sp.dc?.dc_type?.index;
        const type = sp.damage?.damage_type?.index || 'force';
        items.push({
          key: `s-${sp.index}`, name: sp.name, kind: 'spell', rangeFt, level: sp.level,
          detail: `${dice} ${type}${save ? ` · ${save.toUpperCase()} save` : ''}${sp.level ? ` · uses a level ${sp.level} slot` : ''}`,
          odds: save ? null : odds(d.spell.attackBonus),
          attack: save
            ? { name: sp.name, style: 'spell', bonus: null, save: { ability: save, dc: d.spell.saveDC, half: sp.dc?.dc_success === 'half' }, damage: dice, damageType: type }
            : { name: sp.name, style: 'spell', bonus: d.spell.attackBonus, damage: dice, damageType: type },
        });
      }
    }
    setMenu((m) => (m && m.target.id === target.id ? { ...m, items: [...items], loading: false } : m));
  }

  function doAttack(item) {
    const P = propsRef.current;
    const { me, target } = menu;
    setMenu(null);
    const send = () => socket.emit('attackToken', { attackerTokenId: me.id, targetTokenId: target.id, attack: item.attack }, (r) => r?.error && say(r.error));
    const reachCells = Math.max(1, Math.floor(item.rangeFt / 5));
    if (cheb(me, target) <= reachCells) { send(); return; }
    if (item.kind === 'melee') {
      // Walk to the nearest free square next to the target, then swing.
      const occ = new Set();
      for (const t of P.scene.tokens) if (t.id !== me.id && !t.dead) occ.add(t.y * P.scene.grid.w + t.x);
      const r = reach(P.scene, me, P.combat?.active ? myBudget() : 60, occ);
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
        el.innerHTML = '<span class="w3-name"></span><span class="w3-hp"><i></i></span>';
        root.appendChild(el);
        rec = { el, name: el.firstChild, bar: el.lastChild };
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
    }
    for (const [id, rec] of plates) if (!want.has(id)) { rec.el.remove(); plates.delete(id); }
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
    const typing = () => /input|textarea|select/i.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    const down = (e) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = viewRef.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if ('wasdqe'.includes(k) && k.length === 1 || k.startsWith('arrow')) { v.keys.add(k); return; }
      if (k === ' ' && !e.repeat) { e.preventDefault(); v.frame(); setFollow(true); }
      if (k === 'o') v.overview();
      if (k === 'escape') { setMenu(null); if (propsRef.current.isDM) v.select(null); }
    };
    const up = (e) => viewRef.current?.keys.delete(e.key.toLowerCase());
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
    <div className="w3-root">
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
          {hover.object.trigger === 'touch' && !hover.object.used && <span className="w3-card-hint">Click to use</span>}
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
        </div>
      )}
      {menu && (
        <div className="w3-menu" style={{ left: Math.min(menu.x + 8, window.innerWidth - 300), top: Math.min(menu.y + 8, window.innerHeight - 60 - menu.items.length * 54) }}>
          <div className="w3-menu-head">Attack {menu.target.label}{menu.target.ac != null && <span>AC {menu.target.ac}</span>}</div>
          {menu.items.map((it) => (
            <button key={it.key} className="w3-menu-item" onClick={() => doAttack(it)}>
              <span className="w3-menu-name">{it.name}{it.kind === 'spell' && <em> spell</em>}</span>
              <span className="w3-menu-detail">{it.detail}{cheb(menu.me, menu.target) > Math.floor(it.rangeFt / 5) ? (it.kind === 'melee' ? ' · walks up first' : ' · out of range') : ''}</span>
              {it.odds != null && <span className="w3-menu-odds">{it.odds}%</span>}
            </button>
          ))}
          {menu.loading && <div className="w3-menu-note">Looking up your spells…</div>}
          {!menu.loading && !menu.items.length && <div className="w3-menu-note">No attacks on this sheet. Equip a weapon on the Gear tab.</div>}
          <button className="w3-menu-cancel" onClick={() => setMenu(null)}>Cancel</button>
        </div>
      )}
      <div className="w3-view">
        <button onClick={() => { viewRef.current?.frame(); setFollow(true); }} title="Back to your hero (Space)">Center</button>
        <button onClick={() => viewRef.current?.overview()} title="See the whole place (O)">Overview</button>
        <button className={follow ? 'on' : ''} onClick={() => setFollow((f) => !f)} title="Camera follows your hero as they walk">Follow</button>
      </div>
      {toast && <div className="w3-toast">{toast}</div>}
      {selected && isDM && <div className="w3-hint">Selected: {scene?.tokens?.find((t) => t.id === selected)?.label} — click a square to move it, a foe to attack · Esc to let go</div>}
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
