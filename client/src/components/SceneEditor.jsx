import React, { useEffect, useRef, useState } from 'react';
import { TILES, TILE_GROUPS, tilesInGroup, FLOOR_MATERIALS } from '../data/tiles';
import { drawTileSwatch } from '../render/sceneRender';
import { BrushIcon, SquareIcon, RoomIcon, BucketIcon, ChevronDown, XIcon, ResizeIcon, SearchIcon, CopyIcon, LayersIcon, SparkleIcon, UndoIcon, RedoIcon, TrashIcon, EraserIcon, EyeIcon, EyeOffIcon, UsersIcon, LockIcon, PlusIcon, PencilIcon } from './Icons';
import { STAMPS, GENERATORS, generateMap } from '../data/mapKit';
import { drawTerrain } from '../render/sceneRender';
import { ERASE, MAX_LEVELS, newLevelId } from '../data/layers';
import { socket } from '../socket';

// ================= Build palette =================
// The DM paints the map directly: pick a tile, pick a shape, drag on the board.
// Everything here writes straight to the live scene, so what you build is what
// the table sees.

const SHAPES = [
  { key: 'brush', name: 'Brush', hint: 'Drag to paint cells', Icon: BrushIcon },
  { key: 'rect', name: 'Fill area', hint: 'Drag a filled rectangle', Icon: SquareIcon },
  { key: 'room', name: 'Room', hint: 'Drag a hollow rectangle - walls only', Icon: RoomIcon },
  { key: 'fill', name: 'Flood', hint: 'Replace a whole connected area', Icon: BucketIcon },
  { key: 'copy', name: 'Copy', hint: 'Drag over part of the map to copy it, then click to paste it anywhere', Icon: CopyIcon },
  { key: 'stamp', name: 'Stamps', hint: 'Ready-made rooms and pieces: pick one, click to place', Icon: LayersIcon },
];

// A little picture of a stamp.
function StampThumb({ rows, floor }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length, cell = Math.floor(Math.min(64 / w, 40 / h));
    c.width = w * cell; c.height = h * cell;
    const cells = rows.map((r) => r.padEnd(w, ' ').replace(/ /g, '.'));
    drawTerrain(c.getContext('2d'), { grid: { w, h }, cells, bg: { kind: 'builtin', floor } }, cell, { grid: false });
  }, [rows, floor]);
  return <canvas ref={ref} className="stamp-thumb" />;
}

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

export default function SceneEditor({ scene, build, onBuildChange, onClose, onReshape, onSceneUpdate, onPaint, history, dialog }) {
  const [group, setGroup] = useState('Ground');
  const [query, setQuery] = useState('');
  const [showResize, setShowResize] = useState(false);
  const floor = scene?.bg?.floor || 'stone';

  const shown = query.trim()
    ? Object.values(TILES).filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : tilesInGroup(group);

  const set = (patch) => onBuildChange({ ...build, ...patch });
  const erasing = build.ch === ERASE;
  const current = erasing ? null : TILES[build.ch];
  const levels = scene?.levels || [];
  const onLevel = levels.find((l) => l.id === build.level) || null;

  return (
    <aside className="build-panel panel" aria-label="Map builder">
      <div className="build-head">
        <h4 className="side-title">Build</h4>
        <span className="grow" />
        {history && (
          <>
            <button className="icon-btn ghost-btn" disabled={!history.canUndo} title={history.canUndo ? `Undo ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} aria-label="Undo" onClick={history.onUndo}>
              <UndoIcon size={15} />
            </button>
            <button className="icon-btn ghost-btn" disabled={!history.canRedo} title={history.canRedo ? `Redo ${history.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} aria-label="Redo" onClick={history.onRedo}>
              <RedoIcon size={15} />
            </button>
          </>
        )}
        <button className={`icon-btn ghost-btn ${showResize ? 'tool-on' : ''}`} title="Map size, material, generate, clear" aria-label="Map size, material, generate and clear" aria-expanded={showResize} onClick={() => setShowResize((v) => !v)}>
          <ResizeIcon size={15} />
        </button>
        <button className="icon-btn ghost-btn" title="Close the builder" aria-label="Close the builder" onClick={onClose}>
          <XIcon size={15} />
        </button>
      </div>

      {showResize && (
        <ResizePanel scene={scene} onReshape={onReshape} onSceneUpdate={onSceneUpdate} onPaint={onPaint} dialog={dialog} onDone={() => setShowResize(false)} />
      )}

      {/* what you're painting with */}
      <div className="build-current">
        {erasing ? <span className="build-eraser-swatch"><EraserIcon size={22} /></span> : <TileSwatch ch={build.ch} floor={floor} size={40} />}
        <div className="build-current-info">
          <strong>{erasing ? 'Eraser' : current?.name || 'Tile'}</strong>
          <span className="muted small">
            {erasing
              ? onLevel ? `Clears ${onLevel.name}` : 'Shows the floor again'
              : current?.cat === 'floor' && !onLevel ? 'Goes under walls and things' : current?.blocked ? 'Blocks movement' : current?.difficult ? 'Difficult terrain' : 'Walkable'}
          </span>
        </div>
        <span className="grow" />
        <button
          className={`small-btn ${erasing ? 'primary-btn' : 'ghost-btn'}`}
          aria-pressed={erasing}
          title="Eraser: take walls, doors and furniture away (on a level: clear its squares)"
          onClick={() => (erasing ? set({ ch: build.lastCh && build.lastCh !== ERASE ? build.lastCh : '#' }) : set({ ch: ERASE, lastCh: build.ch, ...(build.shape === 'stamp' || build.shape === 'copy' ? { shape: 'brush' } : {}) }))}
        >
          <EraserIcon size={13} /> Erase
        </button>
      </div>

      <LevelPicker scene={scene} levels={levels} active={onLevel} onPick={(id) => set({ level: id })} dialog={dialog} />

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

      {build.shape === 'stamp' && (
        <div className="build-stamps">
          {build.stamp?.custom && (
            <button className="stamp-card on"><StampThumb rows={build.stamp.rows} floor={floor} /><span>Your copy</span></button>
          )}
          {STAMPS.map((st) => (
            <button key={st.key} className={`stamp-card ${build.stamp?.key === st.key ? 'on' : ''}`} onClick={() => set({ stamp: st })} title={st.name}>
              <StampThumb rows={st.rows} floor={floor} />
              <span>{st.name}</span>
            </button>
          ))}
        </div>
      )}
      {build.shape === 'copy' && <p className="muted small" style={{ padding: '4px 2px' }}>Drag a box over the map to copy it. It becomes a stamp you can click down anywhere (and on other scenes).</p>}

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

      <div className="build-tiles" style={build.shape === 'stamp' || build.shape === 'copy' ? { display: 'none' } : undefined}>
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
        Drag on the map to build. Ctrl+Z undoes, Ctrl+Shift+Z redoes. Right-click a square to drop a fight, a person or loot there.
      </p>
    </aside>
  );
}

/* ---------------- levels ---------------- */
// Where the brush paints: the ground, or one of the levels on top of it (a
// platform, a balcony, an upper floor: data/layers.js). Each level can be
// hidden, or kept from the players.

function LevelPicker({ scene, levels, active, onPick, dialog }) {
  const emit = (event, payload) => socket.emit(event, { sceneId: scene.id, ...payload });
  const add = () => {
    const id = newLevelId();
    emit('addLevel', { id, name: `Level ${levels.length + 1}` });
    onPick(id);
  };
  const rename = async (l) => {
    const name = await dialog.prompt('Name this level', l.name, 'Rename level');
    if (name && name.trim()) emit('updateLevel', { levelId: l.id, patch: { name: name.trim() } });
  };
  const remove = async (l) => {
    const ok = await dialog.confirm(`Remove ${l.name} and everything painted on it? (Ctrl+Z brings it back.)`, 'Remove level', 'Remove');
    if (!ok) return;
    emit('removeLevel', { levelId: l.id });
    if (active?.id === l.id) onPick(null);
  };
  return (
    <div className="build-levels" role="radiogroup" aria-label="Paint on">
      <div className="build-levels-head">
        <span className="muted small">Paint on</span>
        <span className="grow" />
        {levels.length < MAX_LEVELS && (
          <button className="small-btn ghost-btn" title="A new level on top: a platform, a balcony, an upper floor" onClick={add}>
            <PlusIcon size={12} /> Level
          </button>
        )}
      </div>
      <div className={`build-level ${!active ? 'on' : ''}`}>
        <button className="build-level-pick" role="radio" aria-checked={!active} onClick={() => onPick(null)}>Ground</button>
      </div>
      {levels.map((l) => (
        <div key={l.id} className={`build-level ${active?.id === l.id ? 'on' : ''} ${l.hidden ? 'is-hidden' : ''}`}>
          <button className="build-level-pick" role="radio" aria-checked={active?.id === l.id} onClick={() => onPick(l.id)} onDoubleClick={() => rename(l)} title="Paint on this level (double-click to rename)">
            {l.name}
          </button>
          <button className="icon-btn ghost-btn" title={l.hidden ? 'Hidden from everyone: show it' : 'Shown: hide it from everyone'} aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`} aria-pressed={!l.hidden}
            onClick={() => emit('updateLevel', { levelId: l.id, patch: { hidden: !l.hidden } })}>
            {l.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
          </button>
          <button className="icon-btn ghost-btn" title={l.players === false ? 'Only you see it: let the players see it' : 'Players see it: keep it to yourself'} aria-label={l.players === false ? `Let players see ${l.name}` : `Keep ${l.name} from players`} aria-pressed={l.players !== false}
            onClick={() => emit('updateLevel', { levelId: l.id, patch: { players: l.players === false } })}>
            {l.players === false ? <LockIcon size={14} /> : <UsersIcon size={14} />}
          </button>
          <button className="icon-btn ghost-btn" title="Rename" aria-label={`Rename ${l.name}`} onClick={() => rename(l)}><PencilIcon size={13} /></button>
          <button className="icon-btn ghost-btn" title="Remove this level" aria-label={`Remove ${l.name}`} onClick={() => remove(l)}><TrashIcon size={13} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- resize / re-material ---------------- */

// Clearing a layer of the terrain: everything goes through paint, so Ctrl+Z
// brings it back.
const PROP_GROUPS = new Set(['Furniture', 'Objects', 'Light', 'Nature', 'Shrine']);
const padFor = (floor) => (floor === 'grass' ? ',' : floor === 'sand' ? 's' : floor === 'snow' ? 'n' : floor === 'marble' ? 'p' : floor === 'wood' ? '=' : '.');
const TERRAIN_CLEAR = [
  { key: 'props', name: 'Furniture & things', keep: (t) => !PROP_GROUPS.has(t?.group) },
  { key: 'walls', name: 'Walls & doors', keep: (t) => t?.group !== 'Walls' && t?.group !== 'Doors' },
  { key: 'all', name: 'Everything', keep: () => false },
];

function ResizePanel({ scene, onReshape, onSceneUpdate, onPaint, dialog, onDone }) {
  const [w, setW] = useState(scene.grid.w);
  const [h, setH] = useState(scene.grid.h);
  const [floor, setFloor] = useState(scene.bg?.floor || 'stone');

  const apply = async () => {
    const nw = Math.max(8, Math.min(80, Number(w) || scene.grid.w));
    const nh = Math.max(8, Math.min(60, Number(h) || scene.grid.h));
    if (nw < scene.grid.w || nh < scene.grid.h) {
      const ok = await dialog.confirm('Shrinking the map trims anything outside the new edge. Continue?', 'Resize map', 'Resize');
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
      <label className="field-label mt">Or start from a generated map</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(GENERATORS).map(([k, g]) => (
          <button key={k} className="small-btn" onClick={async () => {
            const ok = await dialog.confirm(`Replace this whole map with a new ${g.name.toLowerCase()}? (Ctrl+Z brings the old one back.)`, 'Generate a map', 'Generate');
            if (!ok) return;
            const nw = Math.max(8, Math.min(80, Number(w) || scene.grid.w)), nh = Math.max(8, Math.min(60, Number(h) || scene.grid.h));
            const { cells, floor: f } = generateMap(k, nw, nh, Math.floor(Math.random() * 1e9));
            onReshape({ w: nw, h: nh, floor: f, cells });
            onDone();
          }}><SparkleIcon size={12} /> {g.name}</button>
        ))}
      </div>
      {onPaint && (
        <>
          <label className="field-label mt">Clear from the map</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {TERRAIN_CLEAR.map((c) => (
              <button key={c.key} className="small-btn ghost-btn" onClick={() => {
                // walls and things are erased (the floor under them shows);
                // Everything also lays the plain base floor everywhere
                const pad = padFor(scene.bg?.floor);
                const cells = [];
                scene.cells.forEach((row, y) => row.split('').forEach((ch, x) => {
                  if (c.key === 'all') { if (ch !== pad) cells.push({ x, y, ch: pad }); } else if (!c.keep(TILES[ch]) && TILES[ch]?.cat !== 'floor') cells.push({ x, y, ch: ERASE });
                }));
                if (cells.length) onPaint(cells, { level: null, replace: c.key === 'all' });
              }}><TrashIcon size={12} /> {c.name}</button>
            ))}
          </div>
        </>
      )}
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="small-btn ghost-btn" onClick={onDone}>Cancel</button>
        <button className="small-btn primary-btn" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
