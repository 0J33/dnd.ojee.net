// One renderer, three surfaces: the live battle map, the scene-manager
// thumbnails and the build-palette swatches all draw through here, so a map
// always previews exactly as it will play.

import { TILES, FLOOR_THEMES, cellRandom, tileAt } from '../data/tiles';
import { groundAt, walkCharAt, drawnLevels } from '../data/layers';

export const themeFor = (scene) => FLOOR_THEMES[scene?.bg?.floor || 'stone'] || FLOOR_THEMES.stone;

export const charAt = (scene, x, y) => {
  if (!scene?.cells) return scene?.bg?.floor === 'grass' ? ',' : '.';
  const row = scene.cells[y] || '';
  return row[x] || (scene.bg?.floor === 'grass' ? ',' : '.');
};

// What creatures walk on: the top level everyone sees, else the base (data/layers.js).
const walkAt = (scene, x, y) => (scene?.levels ? walkCharAt(scene, x, y) || charAt(scene, x, y) : charAt(scene, x, y));

export const sceneBlocked = (scene, x, y) => {
  const t = TILES[walkAt(scene, x, y)];
  return !!(t && t.blocked);
};

export const sceneDifficult = (scene, x, y) => {
  const t = TILES[walkAt(scene, x, y)];
  return !!(t && t.difficult);
};

/**
 * Paint a scene's terrain into a 2d context.
 *
 * @param ctx      destination context, already sized to w*cell by h*cell
 * @param scene    { grid:{w,h}, cells, bg:{floor} }
 * @param cell     pixel size of one square
 * @param opts     { grid:true, dmView:false } - dmView reveals DM-only tiles
 */
export function drawTerrain(ctx, scene, cell, opts = {}) {
  const { grid = true, dmView = true, propsOnly = false } = opts;
  const theme = themeFor(scene);
  const W = scene.grid.w * cell;
  const H = scene.grid.h * cell;
  const baseChar = scene.bg?.floor === 'grass' ? ',' : '.';

  if (!propsOnly) ctx.clearRect(0, 0, W, H);

  for (let y = 0; y < scene.grid.h; y++) {
    for (let x = 0; x < scene.grid.w; x++) {
      const ch = charAt(scene, x, y);
      const tile = tileAt(ch);
      const rnd = cellRandom(x, y);
      const px = x * cell;
      const py = y * cell;

      // On an image-backed map only the built objects are drawn, so the DM can
      // still place doors and furniture on top of their own battle map.
      if (propsOnly) {
        if (tile.cat === 'floor' || ch === baseChar) continue;
        if (tile.dmOnly && !dmView) continue;
        tile.draw(ctx, px, py, cell, rnd, theme);
        continue;
      }

      // Props sit on the floor under them (the scene's default ground when
      // that isn't known), then a soft contact shadow so furniture reads
      // against any material.
      const under = tile.cat === 'floor' ? ch : groundAt(scene, x, y) || baseChar;
      if (tile.cat === 'prop') {
        tileAt(under).draw(ctx, px, py, cell, rnd, theme);
        if (cell >= 10) {
          const g = ctx.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.12, px + cell / 2, py + cell / 2, cell * 0.52);
          g.addColorStop(0, 'rgba(0,0,0,0.34)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(px, py, cell, cell);
        }
      }
      // A secret door or trap looks like plain wall/floor to players.
      if (tile.dmOnly && !dmView) {
        tileAt(ch === 'S' ? '#' : under).draw(ctx, px, py, cell, rnd, theme);
      } else {
        // a known floor under a prop shows through (props paint their own plain ground otherwise)
        tile.draw(ctx, px, py, cell, rnd, tile.cat === 'prop' && groundAt(scene, x, y) ? clearTheme(theme) : theme);
      }
    }
  }

  drawLevels(ctx, scene, cell, { dmView, theme });

  if (grid && cell >= 8) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= scene.grid.w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y <= scene.grid.h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(W, y * cell + 0.5);
      ctx.stroke();
    }
  }
}

// The theme with a see-through ground colour (props draw ground() first).
const clearThemes = new WeakMap();
function clearTheme(theme) {
  let t = clearThemes.get(theme);
  if (!t) clearThemes.set(theme, (t = { ...theme, base: 'rgba(0,0,0,0)', dark: 'rgba(0,0,0,0)' }));
  return t;
}

// Levels painted over the base (data/layers.js): a drop shadow and a lit
// rim make them read as standing higher. A level the players can't see is
// drawn faded on the DM's screen.
function drawLevels(ctx, scene, cell, { dmView, theme }) {
  const list = drawnLevels(scene);
  if (!list.length) return;
  const { w, h } = scene.grid;
  const off = Math.max(1, cell * 0.12);
  for (const { level, dmOnly } of list) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? ' ' : level.cells[y]?.[x] || ' ');
    ctx.save();
    if (dmOnly) ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) !== ' ') ctx.fillRect(x * cell + off, y * cell + off, cell, cell);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      if (ch === ' ') continue;
      const tile = tileAt(ch);
      const rnd = cellRandom(x + 31, y + 17);
      if (tile.dmOnly && !dmView) { tileAt(ch === 'S' ? '#' : '.').draw(ctx, x * cell, y * cell, cell, rnd, theme); continue; }
      tile.draw(ctx, x * cell, y * cell, cell, rnd, tile.cat === 'prop' ? clearTheme(theme) : theme); // props stand on what is below
    }
    // a light rim along each edge that drops to something lower
    ctx.strokeStyle = dmOnly ? 'rgba(140,200,255,0.9)' : 'rgba(255,240,210,0.55)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    if (dmOnly) ctx.setLineDash([cell * 0.18, cell * 0.12]);
    ctx.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) === ' ') continue;
      const x0 = x * cell, y0 = y * cell;
      if (at(x, y - 1) === ' ') { ctx.moveTo(x0, y0); ctx.lineTo(x0 + cell, y0); }
      if (at(x, y + 1) === ' ') { ctx.moveTo(x0, y0 + cell); ctx.lineTo(x0 + cell, y0 + cell); }
      if (at(x - 1, y) === ' ') { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + cell); }
      if (at(x + 1, y) === ' ') { ctx.moveTo(x0 + cell, y0); ctx.lineTo(x0 + cell, y0 + cell); }
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw a single tile into a small square - used by palette swatches. */
export function drawTileSwatch(ctx, ch, size, floor = 'stone') {
  const theme = FLOOR_THEMES[floor] || FLOOR_THEMES.stone;
  const tile = tileAt(ch);
  const rnd = cellRandom(3, 7);
  ctx.clearRect(0, 0, size, size);
  if (tile.cat === 'prop') tileAt('.').draw(ctx, 0, 0, size, rnd, theme);
  tile.draw(ctx, 0, 0, size, rnd, theme);
}

// Thumbnails' terrain, kept by what it shows: lists of scenes redraw their
// thumbnails whenever the table changes (a token moved), and painting every
// tile again each time was most of the cost of opening those lists.
const thumbCache = new Map();
function thumbTerrain(scene, cell, dpr) {
  const key = `${cell}@${dpr}|${scene.grid.w}x${scene.grid.h}|${scene.bg?.kind || ''}|${scene.bg?.floor || ''}|${(scene.cells || []).join('/')}|${(scene.ground || []).join('/')}|${(scene.levels || []).map((l) => `${l.hidden}${l.players}${l.cells.join('/')}`).join('#')}`;
  let c = thumbCache.get(key);
  if (c) { thumbCache.delete(key); thumbCache.set(key, c); return c; }
  c = document.createElement('canvas');
  c.width = Math.ceil(scene.grid.w * cell * dpr);
  c.height = Math.ceil(scene.grid.h * cell * dpr);
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTerrain(x, scene, cell, { grid: cell >= 6 });
  thumbCache.set(key, c);
  if (thumbCache.size > 120) thumbCache.delete(thumbCache.keys().next().value);
  return c;
}

/**
 * Render a scene into a thumbnail canvas, fitting the whole map inside
 * (w x h) px. Returns the cell size actually used.
 */
export function drawThumbnail(canvas, scene, w, h) {
  if (!canvas || !scene?.grid) return 0;
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cell = Math.max(2, Math.min(w / scene.grid.w, h / scene.grid.h));
  const offX = (w - cell * scene.grid.w) / 2;
  const offY = (h - cell * scene.grid.h) / 2;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.drawImage(thumbTerrain(scene, cell, dpr), 0, 0, scene.grid.w * cell, scene.grid.h * cell);

  // token dots, so a prepped encounter reads at a glance
  for (const t of scene.tokens || []) {
    ctx.beginPath();
    ctx.arc((t.x + 0.5) * cell, (t.y + 0.5) * cell, cell * 0.36 * (t.size || 1), 0, Math.PI * 2);
    ctx.fillStyle = t.color || '#d4a94f';
    ctx.globalAlpha = t.hidden ? 0.45 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  return cell;
}
