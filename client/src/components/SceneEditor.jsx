import React, { useEffect, useRef, useState } from 'react';
import { TILES, TILE_GROUPS, tilesInGroup, FLOOR_MATERIALS } from '../data/tiles';
import { drawTileSwatch } from '../render/sceneRender';
import { BrushIcon, SquareIcon, RoomIcon, BucketIcon, ChevronDown, XIcon, ResizeIcon, SearchIcon } from './Icons';

// ================= Build palette =================
// The DM paints the map directly: pick a tile, pick a shape, drag on the board.
// Everything here writes straight to the live scene, so what you build is what
// the table sees.

const SHAPES = [
  { key: 'brush', name: 'Brush', hint: 'Drag to paint cells', Icon: BrushIcon },
  { key: 'rect', name: 'Fill area', hint: 'Drag a filled rectangle', Icon: SquareIcon },
  { key: 'room', name: 'Room', hint: 'Drag a hollow rectangle - walls only', Icon: RoomIcon },
  { key: 'fill', name: 'Flood', hint: 'Replace a whole connected area', Icon: BucketIcon },
];

const BRUSH_SIZES = [1, 2, 3, 5];

function TileSwatch({ ch, floor, size = 34 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTileSwatch(ctx, ch, size, floor);
  }, [ch, floor, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="tile-swatch-canvas" />;
}

export default function SceneEditor({ scene, build, onBuildChange, onClose, onReshape, onSceneUpdate, dialog }) {
  const [group, setGroup] = useState('Ground');
  const [query, setQuery] = useState('');
  const [showResize, setShowResize] = useState(false);
  const floor = scene?.bg?.floor || 'stone';

  const shown = query.trim()
    ? Object.values(TILES).filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : tilesInGroup(group);

  const set = (patch) => onBuildChange({ ...build, ...patch });
  const current = TILES[build.ch];

  return (
    <aside className="build-panel panel" aria-label="Map builder">
      <div className="build-head">
        <h4 className="side-title">Build</h4>
        <span className="grow" />
        <button className="icon-btn ghost-btn" title="Map size & material" aria-label="Map size and material" onClick={() => setShowResize((v) => !v)}>
          <ResizeIcon size={15} />
        </button>
        <button className="icon-btn ghost-btn" title="Close the builder" aria-label="Close the builder" onClick={onClose}>
          <XIcon size={15} />
        </button>
      </div>

      {showResize && (
        <ResizePanel scene={scene} onReshape={onReshape} onSceneUpdate={onSceneUpdate} dialog={dialog} onDone={() => setShowResize(false)} />
      )}

      {/* what you're painting with */}
      <div className="build-current">
        <TileSwatch ch={build.ch} floor={floor} size={40} />
        <div className="build-current-info">
          <strong>{current?.name || 'Tile'}</strong>
          <span className="muted small">
            {current?.blocked ? 'Blocks movement' : current?.difficult ? 'Difficult terrain' : 'Walkable'}
          </span>
        </div>
      </div>

      {/* how you're painting */}
      <div className="build-shapes" role="group" aria-label="Brush shape">
        {SHAPES.map(({ key, name, hint, Icon }) => (
          <button
            key={key}
            className={`build-shape ${build.shape === key ? 'on' : ''}`}
            title={`${name} - ${hint}`}
            aria-pressed={build.shape === key}
            onClick={() => set({ shape: key })}
          >
            <Icon size={16} />
            <span>{name}</span>
          </button>
        ))}
      </div>

      {build.shape === 'brush' && (
        <div className="build-sizes" role="group" aria-label="Brush size">
          <span className="muted small">Size</span>
          {BRUSH_SIZES.map((n) => (
            <button
              key={n}
              className={`small-btn ${build.size === n ? 'primary-btn' : 'ghost-btn'}`}
              aria-pressed={build.size === n}
              onClick={() => set({ size: n })}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      )}

      {/* the tile library */}
      <div className="build-search">
        <SearchIcon size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search objects..."
          aria-label="Search map objects"
        />
        {query && (
          <button className="icon-btn ghost-btn" aria-label="Clear search" onClick={() => setQuery('')}>
            <XIcon size={13} />
          </button>
        )}
      </div>

      {!query && (
        <div className="build-groups" role="tablist" aria-label="Object categories">
          {TILE_GROUPS.map((g) => (
            <button key={g} role="tab" aria-selected={group === g} className={`build-group ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="build-tiles">
        {shown.map((t) => (
          <button
            key={t.ch}
            className={`tile-swatch ${build.ch === t.ch ? 'on' : ''}`}
            title={`${t.name}${t.blocked ? ' (blocks movement)' : t.difficult ? ' (difficult terrain)' : ''}`}
            aria-label={t.name}
            aria-pressed={build.ch === t.ch}
            onClick={() => set({ ch: t.ch })}
          >
            <TileSwatch ch={t.ch} floor={floor} />
            <span className="tile-name">{t.name}</span>
          </button>
        ))}
        {!shown.length && <p className="muted small center" style={{ padding: 16 }}>Nothing matches that.</p>}
      </div>

      <p className="build-hint muted small">
        Drag on the map to build. Right-click a square to drop a creature, NPC or marker there.
      </p>
    </aside>
  );
}

/* ---------------- resize / re-material ---------------- */

function ResizePanel({ scene, onReshape, onSceneUpdate, dialog, onDone }) {
  const [w, setW] = useState(scene.grid.w);
  const [h, setH] = useState(scene.grid.h);
  const [floor, setFloor] = useState(scene.bg?.floor || 'stone');

  const apply = async () => {
    const nw = Math.max(8, Math.min(80, Number(w) || scene.grid.w));
    const nh = Math.max(8, Math.min(60, Number(h) || scene.grid.h));
    if (nw < scene.grid.w || nh < scene.grid.h) {
      const ok = await dialog.confirm('Shrinking the map trims anything outside the new edge. Continue?', 'Resize map');
      if (!ok) return;
    }
    onReshape({ w: nw, h: nh, floor });
    onDone();
  };

  return (
    <div className="build-resize">
      <label className="field-label" htmlFor="scene-w">Map size (squares)</label>
      <div className="row">
        <input id="scene-w" type="number" min="8" max="80" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 68 }} />
        <span className="muted">×</span>
        <input aria-label="Map height" type="number" min="8" max="60" value={h} onChange={(e) => setH(e.target.value)} style={{ width: 68 }} />
        <span className="muted small">{Math.round(w * 5)} × {Math.round(h * 5)} ft</span>
      </div>
      <label className="field-label" htmlFor="scene-floor">Base material</label>
      <select id="scene-floor" value={floor} onChange={(e) => setFloor(e.target.value)} style={{ width: '100%' }}>
        {FLOOR_MATERIALS.map((m) => (
          <option key={m.key} value={m.key}>{m.name}</option>
        ))}
      </select>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="small-btn ghost-btn" onClick={onDone}>Cancel</button>
        <button className="small-btn primary-btn" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
