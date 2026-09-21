// One renderer, three surfaces: the live battle map, the scene-manager
// thumbnails and the build-palette swatches all draw through here, so a map
// always previews exactly as it will play.

import { TILES, FLOOR_THEMES, cellRandom, tileAt } from '../data/tiles';

export const themeFor = (scene) => FLOOR_THEMES[scene?.bg?.floor || 'stone'] || FLOOR_THEMES.stone;

export const charAt = (scene, x, y) => {
  if (!scene?.cells) return scene?.bg?.floor === 'grass' ? ',' : '.';
  const row = scene.cells[y] || '';
  return row[x] || (scene.bg?.floor === 'grass' ? ',' : '.');
};

export const sceneBlocked = (scene, x, y) => {
  const t = TILES[charAt(scene, x, y)];
  return !!(t && t.blocked);
};

export const sceneDifficult = (scene, x, y) => {
  const t = TILES[charAt(scene, x, y)];
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

      // Props sit on top of the scene's default ground, so paint that first,
      // then a soft contact shadow so furniture reads against any material.
      if (tile.cat === 'prop') {
        tileAt(baseChar).draw(ctx, px, py, cell, rnd, theme);
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
        tileAt(ch === 'S' ? '#' : baseChar).draw(ctx, px, py, cell, rnd, theme);
      } else {
        tile.draw(ctx, px, py, cell, rnd, theme);
      }
    }
  }

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

/** Draw a single tile into a small square - used by palette swatches. */
export function drawTileSwatch(ctx, ch, size, floor = 'stone') {
  const theme = FLOOR_THEMES[floor] || FLOOR_THEMES.stone;
  const tile = tileAt(ch);
  const rnd = cellRandom(3, 7);
  ctx.clearRect(0, 0, size, size);
  if (tile.cat === 'prop') tileAt('.').draw(ctx, 0, 0, size, rnd, theme);
  tile.draw(ctx, 0, 0, size, rnd, theme);
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
  drawTerrain(ctx, scene, cell, { grid: cell >= 6 });

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
