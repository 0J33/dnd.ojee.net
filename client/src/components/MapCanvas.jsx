import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONDITIONS } from '../rules/engine';
import { drawTerrain, sceneBlocked, charAt } from '../render/sceneRender';
import { TILES } from '../data/tiles';
import { TokenFace } from './Portrait';
import { ConditionIcon } from './Icons';

export const CELL = 56;
const COND_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.index, c.name]));

export default function MapCanvas({
  scene,
  isDM,
  tool,
  fogMode,
  drawColor,
  build, // { ch, size, shape } while the build tool is active
  charSheets,
  combat,
  userId,
  canMoveToken,
  pings,
  onMoveToken,
  onTokenContext,
  onCellContext,
  onTokenClick,
  onRevealCells,
  onPing,
  onDrawStroke,
  onEraseStrokes,
  onPaint,
  bottomInset = 0, // extra space a panel is covering (mobile build sheet)
}) {
  const viewportRef = useRef(null);
  const terrainRef = useRef(null);
  const strokesRef = useRef(null);
  const fogRef = useRef(null);
  const [view, setView] = useState({ x: 40, y: 40, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const session = useRef(null); // active pointer interaction
  const [dragTok, setDragTok] = useState(null);
  const [measure, setMeasure] = useState(null);
  const [previewStroke, setPreviewStroke] = useState(null);
  const [fogPaint, setFogPaint] = useState(null);
  const [paintPreview, setPaintPreview] = useState(null); // Set of 'x,y'
  const [hoverCell, setHoverCell] = useState(null);

  const W = scene.grid.w * CELL;
  const H = scene.grid.h * CELL;
  const building = tool === 'build' && isDM && !!build;

  const isBlocked = useCallback((x, y) => sceneBlocked(scene, x, y), [scene]);

  // Space taken by the floating chrome, so "fit" never parks the map behind
  // the tool bar or the dice tray.
  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const narrow = typeof window !== 'undefined' && window.innerWidth <= 820;
    const top = narrow ? 60 : 70;
    const bottom = (narrow ? 108 : 96) + bottomInset;
    const availW = Math.max(80, rect.width - 40);
    const availH = Math.max(80, rect.height - top - bottom);
    const k = Math.min(1.4, Math.max(0.15, Math.min(availW / W, availH / H)));
    setView({ x: (rect.width - W * k) / 2, y: top + (availH - H * k) / 2, k });
  }, [W, H, bottomInset]);

  // ---------- fit on scene change or when a panel takes over the screen ----------
  useEffect(() => {
    fitView();
  }, [scene.id, fitView]);

  // ---------- terrain ----------
  useEffect(() => {
    const canvas = terrainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    if (scene.bg?.kind === 'url' && scene.bg.url) {
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, W, H);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        // built objects painted over an image map still show
        drawTerrain(ctx, { ...scene, bg: { ...scene.bg, kind: 'blank' } }, CELL, { grid: true, dmView: isDM, propsOnly: true });
      };
      img.onerror = () => drawTerrain(ctx, scene, CELL, { grid: true, dmView: isDM });
      img.src = scene.bg.url;
      return;
    }

    drawTerrain(ctx, scene, CELL, { grid: true, dmView: isDM });
  }, [scene, isDM, W, H]);

  // ---------- strokes ----------
  useEffect(() => {
    const canvas = strokesRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of scene.strokes || []) {
      ctx.strokeStyle = s.color || '#e8c476';
      ctx.lineWidth = s.width || 3;
      ctx.beginPath();
      (s.points || []).forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
  }, [scene.strokes, scene.id, W, H]);

  // ---------- fog ----------
  const revealedSet = useMemo(() => new Set(scene.revealed || []), [scene.revealed]);
  useEffect(() => {
    const canvas = fogRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    if (!scene.fogEnabled) return;
    ctx.fillStyle = isDM ? 'rgba(6,5,8,0.55)' : 'rgba(7,6,9,0.97)';
    for (let y = 0; y < scene.grid.h; y++) {
      for (let x = 0; x < scene.grid.w; x++) {
        const key = `${x},${y}`;
        const painted = fogPaint && fogPaint.cells.has(key);
        const revealed = fogPaint
          ? fogPaint.mode === 'reveal'
            ? revealedSet.has(key) || painted
            : revealedSet.has(key) && !painted
          : revealedSet.has(key);
        if (!revealed) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }, [scene.fogEnabled, revealedSet, fogPaint, isDM, W, H, scene.grid.h, scene.grid.w]);

  // ---------- coordinate helpers ----------
  const toWorld = useCallback((clientX, clientY) => {
    const rect = viewportRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  }, []);
  const toCell = useCallback(
    (clientX, clientY) => {
      const wpt = toWorld(clientX, clientY);
      return { x: Math.floor(wpt.x / CELL), y: Math.floor(wpt.y / CELL) };
    },
    [toWorld]
  );
  const inBounds = useCallback(
    (c) => c.x >= 0 && c.y >= 0 && c.x < scene.grid.w && c.y < scene.grid.h,
    [scene.grid.w, scene.grid.h]
  );

  // Cells covered by the build brush centred on a cell.
  const brushCells = useCallback(
    (cell) => {
      const n = Math.max(1, build?.size || 1);
      const half = Math.floor((n - 1) / 2);
      const out = [];
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) {
          const x = cell.x - half + dx;
          const y = cell.y - half + dy;
          if (x >= 0 && y >= 0 && x < scene.grid.w && y < scene.grid.h) out.push(`${x},${y}`);
        }
      }
      return out;
    },
    [build, scene.grid.w, scene.grid.h]
  );

  const rectCells = useCallback(
    (a, b, outlineOnly) => {
      const x0 = Math.max(0, Math.min(a.x, b.x));
      const x1 = Math.min(scene.grid.w - 1, Math.max(a.x, b.x));
      const y0 = Math.max(0, Math.min(a.y, b.y));
      const y1 = Math.min(scene.grid.h - 1, Math.max(a.y, b.y));
      const out = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (outlineOnly && x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
          out.push(`${x},${y}`);
        }
      }
      return out;
    },
    [scene.grid.w, scene.grid.h]
  );

  // Flood fill over every connected cell sharing the clicked character.
  const fillCells = useCallback(
    (start) => {
      const target = charAt(scene, start.x, start.y);
      if (target === build?.ch) return [];
      const seen = new Set();
      const out = [];
      const queue = [start];
      while (queue.length && out.length < 4000) {
        const c = queue.pop();
        const key = `${c.x},${c.y}`;
        if (seen.has(key)) continue;
        if (c.x < 0 || c.y < 0 || c.x >= scene.grid.w || c.y >= scene.grid.h) continue;
        if (charAt(scene, c.x, c.y) !== target) continue;
        seen.add(key);
        out.push(key);
        queue.push({ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 });
      }
      return out;
    },
    [scene, build]
  );

  const commitPaint = useCallback(
    (keys) => {
      if (!keys || !keys.length || !onPaint || !build) return;
      const cells = keys.map((k) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, ch: build.ch };
      });
      onPaint(cells);
    },
    [onPaint, build]
  );

  // ---------- wheel zoom (non-passive) ----------
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(2.6, Math.max(0.2, v.k * (e.deltaY > 0 ? 0.88 : 1.14)));
        const wx = (mx - v.x) / v.k;
        const wy = (my - v.y) / v.k;
        return { k, x: mx - wx * k, y: my - wy * k };
      });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- pointer interactions ----------
  const onPointerDown = (e) => {
    if (e.button === 2) return; // context menu handled separately
    const vp = viewportRef.current;
    vp.setPointerCapture(e.pointerId);
    const tokenEl = e.target.closest('[data-token-id]');
    const cell = toCell(e.clientX, e.clientY);

    if (tokenEl && tool === 'select') {
      const id = tokenEl.dataset.tokenId;
      const token = scene.tokens.find((t) => t.id === id);
      if (token && canMoveToken(token)) {
        const wpt = toWorld(e.clientX, e.clientY);
        session.current = {
          mode: 'token',
          id,
          startCell: { x: token.x, y: token.y },
          offX: wpt.x - token.x * CELL,
          offY: wpt.y - token.y * CELL,
          moved: false,
        };
        setDragTok({ id, wx: token.x * CELL, wy: token.y * CELL, dist: 0 });
        return;
      }
      if (token) {
        onTokenClick && onTokenClick(token);
        return;
      }
    }

    if (building && inBounds(cell)) {
      if (build.shape === 'fill') {
        commitPaint(fillCells(cell));
        return;
      }
      if (build.shape === 'rect' || build.shape === 'room') {
        session.current = { mode: 'buildRect', start: cell, outline: build.shape === 'room' };
        setPaintPreview(new Set(rectCells(cell, cell, build.shape === 'room')));
        return;
      }
      const keys = new Set(brushCells(cell));
      session.current = { mode: 'buildBrush', keys };
      setPaintPreview(new Set(keys));
      return;
    }

    if (tool === 'fog' && isDM && inBounds(cell)) {
      session.current = { mode: 'fog', cells: new Set([`${cell.x},${cell.y}`]) };
      setFogPaint({ mode: fogMode, cells: new Set([`${cell.x},${cell.y}`]) });
      return;
    }
    if (tool === 'draw') {
      const wpt = toWorld(e.clientX, e.clientY);
      session.current = { mode: 'draw', points: [[Math.round(wpt.x), Math.round(wpt.y)]] };
      setPreviewStroke({ points: [[wpt.x, wpt.y]], color: drawColor });
      return;
    }
    if (tool === 'erase') {
      session.current = { mode: 'erase', ids: new Set() };
      return;
    }
    if (tool === 'measure') {
      session.current = { mode: 'measure', start: cell };
      setMeasure({ start: cell, end: cell });
      return;
    }
    // default: pan
    session.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
  };

  const onPointerMove = (e) => {
    const s = session.current;
    if (!s) {
      if (building) {
        const cell = toCell(e.clientX, e.clientY);
        setHoverCell(inBounds(cell) ? cell : null);
      } else if (hoverCell) setHoverCell(null);
      return;
    }
    if (s.mode === 'pan') {
      setView((v) => ({ ...v, x: s.ox + (e.clientX - s.sx), y: s.oy + (e.clientY - s.sy) }));
    } else if (s.mode === 'token') {
      const wpt = toWorld(e.clientX, e.clientY);
      s.moved = true;
      const wx = wpt.x - s.offX;
      const wy = wpt.y - s.offY;
      const cx = Math.round(wx / CELL);
      const cy = Math.round(wy / CELL);
      const dist = Math.max(Math.abs(cx - s.startCell.x), Math.abs(cy - s.startCell.y)) * 5;
      setDragTok({ id: s.id, wx, wy, dist });
    } else if (s.mode === 'buildBrush') {
      const cell = toCell(e.clientX, e.clientY);
      if (inBounds(cell)) {
        brushCells(cell).forEach((k) => s.keys.add(k));
        setPaintPreview(new Set(s.keys));
      }
    } else if (s.mode === 'buildRect') {
      const cell = toCell(e.clientX, e.clientY);
      s.end = cell;
      setPaintPreview(new Set(rectCells(s.start, cell, s.outline)));
    } else if (s.mode === 'fog') {
      const cell = toCell(e.clientX, e.clientY);
      if (inBounds(cell)) {
        for (let dx = 0; dx < 2; dx++)
          for (let dy = 0; dy < 2; dy++) s.cells.add(`${cell.x + dx},${cell.y + dy}`);
        setFogPaint({ mode: fogMode, cells: new Set(s.cells) });
      }
    } else if (s.mode === 'draw') {
      const wpt = toWorld(e.clientX, e.clientY);
      const last = s.points[s.points.length - 1];
      if (Math.hypot(wpt.x - last[0], wpt.y - last[1]) > 4) {
        s.points.push([Math.round(wpt.x), Math.round(wpt.y)]);
        setPreviewStroke({ points: s.points.slice(), color: drawColor });
      }
    } else if (s.mode === 'erase') {
      const wpt = toWorld(e.clientX, e.clientY);
      for (const stroke of scene.strokes || []) {
        if (s.ids.has(stroke.id)) continue;
        if ((stroke.points || []).some(([px, py]) => Math.hypot(px - wpt.x, py - wpt.y) < 14)) s.ids.add(stroke.id);
      }
    } else if (s.mode === 'measure') {
      const cell = toCell(e.clientX, e.clientY);
      setMeasure({ start: s.start, end: cell });
    }
  };

  const onPointerUp = (e) => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    if (s.mode === 'token') {
      setDragTok(null);
      if (!s.moved) {
        const token = scene.tokens.find((t) => t.id === s.id);
        token && onTokenClick && onTokenClick(token);
        return;
      }
      const wpt = toWorld(e.clientX, e.clientY);
      const cx = Math.max(0, Math.min(scene.grid.w - 1, Math.round((wpt.x - s.offX) / CELL)));
      const cy = Math.max(0, Math.min(scene.grid.h - 1, Math.round((wpt.y - s.offY) / CELL)));
      if (!isBlocked(cx, cy) || isDM) onMoveToken(s.id, cx, cy);
    } else if (s.mode === 'buildBrush') {
      commitPaint([...s.keys]);
      setPaintPreview(null);
    } else if (s.mode === 'buildRect') {
      commitPaint(rectCells(s.start, s.end || s.start, s.outline));
      setPaintPreview(null);
    } else if (s.mode === 'fog') {
      setFogPaint(null);
      onRevealCells([...s.cells], fogMode);
    } else if (s.mode === 'draw') {
      setPreviewStroke(null);
      if (s.points.length > 1) onDrawStroke({ points: s.points, color: drawColor, width: 3 });
    } else if (s.mode === 'erase') {
      if (s.ids.size) onEraseStrokes([...s.ids]);
    } else if (s.mode === 'measure') {
      setMeasure(null);
    }
  };

  const onDoubleClick = (e) => {
    if (building) return;
    const cell = toCell(e.clientX, e.clientY);
    if (inBounds(cell)) onPing(cell.x, cell.y);
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const tokenEl = e.target.closest('[data-token-id]');
    if (tokenEl) {
      const token = scene.tokens.find((t) => t.id === tokenEl.dataset.tokenId);
      if (token) onTokenContext(token, e.clientX, e.clientY);
      return;
    }
    const cell = toCell(e.clientX, e.clientY);
    if (inBounds(cell)) onCellContext(cell, e.clientX, e.clientY);
  };

  // ---------- render ----------
  const currentTurnId =
    combat && combat.active && combat.order.length && combat.round > 0 ? combat.order[combat.turnIndex]?.tokenId : null;
  const previewKeys = paintPreview || (building && hoverCell ? new Set(brushCells(hoverCell)) : null);

  return (
    <div
      ref={viewportRef}
      className={`map-viewport tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHoverCell(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="map-world"
        style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <canvas ref={terrainRef} className="map-layer" />
        <canvas ref={strokesRef} className="map-layer" />

        {previewKeys && (
          <svg className="map-layer build-preview" width={W} height={H}>
            {[...previewKeys].map((k) => {
              const [x, y] = k.split(',').map(Number);
              return <rect key={k} x={x * CELL} y={y * CELL} width={CELL} height={CELL} />;
            })}
          </svg>
        )}

        {previewStroke && (
          <svg className="map-layer" width={W} height={H}>
            <polyline
              points={previewStroke.points.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={previewStroke.color}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </svg>
        )}

        {scene.tokens.map((t) => {
          const sheet = t.characterId ? charSheets[t.characterId] : null;
          const hp = sheet ? sheet.currentHp : t.hp;
          const maxHp = sheet ? sheet.maxHp : t.maxHp;
          const dragging = dragTok && dragTok.id === t.id;
          const px = dragging ? dragTok.wx : t.x * CELL;
          const py = dragging ? dragTok.wy : t.y * CELL;
          const conditions = sheet ? sheet.conditions || [] : t.conditions || [];
          const isDead = t.dead || (sheet && sheet.currentHp === 0);
          const face = CELL * t.size * 0.68;
          return (
            <div
              key={t.id}
              data-token-id={t.id}
              className={`token kind-${t.kind} ${currentTurnId === t.id ? 'current-turn' : ''} ${isDead ? 'dead' : ''} ${
                t.hidden ? 'hidden-token' : ''
              } ${dragging ? 'dragging' : ''} ${canMoveToken(t) ? 'movable' : ''}`}
              style={{ left: px, top: py, width: t.size * CELL, height: t.size * CELL, '--tk-color': t.color }}
              title={`${t.label}${t.note ? ` - ${t.note}` : ''}`}
            >
              <div className="token-disc">
                {isDead ? (
                  <span className="token-down" aria-label="down">
                    <svg viewBox="0 0 24 24" width={face * 0.6} height={face * 0.6} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M5 5l14 14M19 5 5 19" />
                    </svg>
                  </span>
                ) : (
                  <TokenFace token={t} sheet={sheet} size={face} />
                )}
              </div>
              {conditions.length > 0 && (
                <div className="token-conds">
                  {conditions.slice(0, 4).map((c) => (
                    <span key={c} title={COND_LABEL[c] || c} aria-label={COND_LABEL[c] || c}>
                      <ConditionIcon index={c} size={12} />
                    </span>
                  ))}
                </div>
              )}
              {maxHp != null && hp != null && !t.hidden && (
                <div className="token-hp">
                  <div
                    className="token-hp-fill"
                    style={{ width: `${Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100))}%` }}
                  />
                </div>
              )}
              <div className="token-label">{t.label}</div>
              {dragging && dragTok.dist > 0 && <div className="token-dist">{dragTok.dist} ft</div>}
            </div>
          );
        })}

        <canvas ref={fogRef} className="map-layer fog-layer" />

        {pings.map((p) => (
          <div
            key={p.id}
            className="map-ping"
            style={{ left: p.x * CELL + CELL / 2, top: p.y * CELL + CELL / 2, '--ping-color': p.color }}
          >
            <span className="ping-ring" />
            <span className="ping-name">{p.username}</span>
          </div>
        ))}

        {measure && (
          <svg className="map-layer" width={W} height={H}>
            <line
              x1={measure.start.x * CELL + CELL / 2}
              y1={measure.start.y * CELL + CELL / 2}
              x2={measure.end.x * CELL + CELL / 2}
              y2={measure.end.y * CELL + CELL / 2}
              stroke="var(--gold-bright)"
              strokeWidth={3}
              strokeDasharray="8 6"
            />
            <circle cx={measure.end.x * CELL + CELL / 2} cy={measure.end.y * CELL + CELL / 2} r={7} fill="var(--gold-bright)" />
            <text
              x={measure.end.x * CELL + CELL / 2 + 14}
              y={measure.end.y * CELL + CELL / 2 - 12}
              fill="var(--gold-bright)"
              fontSize={17}
              fontWeight={700}
              style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 4 }}
            >
              {Math.max(Math.abs(measure.end.x - measure.start.x), Math.abs(measure.end.y - measure.start.y)) * 5} ft
            </text>
          </svg>
        )}
      </div>

      <div className="map-zoom-controls">
        <button
          className="icon-btn"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setView((v) => ({ ...v, k: Math.min(2.6, v.k * 1.2) }))}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </button>
        <button
          className="icon-btn"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k * 0.84) }))}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 12h12" />
          </svg>
        </button>
        <button className="icon-btn" aria-label="Fit map to screen" title="Fit map to screen" onClick={fitView}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      {building && hoverCell && (
        <div className="build-readout">
          {TILES[build.ch]?.name || 'Tile'} · {hoverCell.x},{hoverCell.y}
        </div>
      )}
    </div>
  );
}
