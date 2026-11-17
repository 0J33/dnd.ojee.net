// Map layers. Mirrors server/socket/layers.js (keep the two in step).
//
//   scene.cells   what stands on each square: a floor, or a wall / door /
//                 piece of furniture
//   scene.ground  optional: the floor under a wall or piece of furniture
//                 (' ' = not known: the floor around it)
//   scene.levels  optional: extra layers on top [{ id, name, cells, hidden,
//                 players }], ' ' = nothing there
//
// Painting a floor changes only the ground under a wall or furniture;
// painting a wall or furniture keeps the floor it covers; erasing (' ')
// takes the wall or furniture away and shows that floor again.

export const FLOOR = new Set('.=,:skopniez~qmlx^'.split(''));
const SOLID_FLOOR = new Set('.=,:skpniez^'.split(''));
export const ERASE = ' ';
export const MAX_LEVELS = 6;
export const LEVEL_LIFT = 0.25; // 3D height of each level above the one below
export const isFloor = (ch) => FLOOR.has(ch);
const validChar = (ch) => typeof ch === 'string' && ch.length === 1 && ch >= ' ' && ch <= '~';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

const PAD = { grass: ',', sand: 's', snow: 'n', marble: 'p' };
export const padCharFor = (floor) => PAD[floor] || '.';

function guessUnder(top, gnd, x, y, pad) {
  const g = gnd(x, y);
  if (g && g !== ' ') return g;
  const votes = {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    let ch = top(x + dx, y + dy);
    if (ch && !FLOOR.has(ch)) ch = gnd(x + dx, y + dy);
    if (ch && SOLID_FLOOR.has(ch)) votes[ch] = (votes[ch] || 0) + 1;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : pad;
}

/** The known floor under (x, y), or null (then the renderer picks one). */
export const groundAt = (scene, x, y) => {
  const g = scene?.ground?.[y]?.[x];
  return g && g !== ' ' ? g : null;
};

/** Paint squares onto a scene: a new scene back (the same one if nothing changed). */
export function paint(scene, list, { level = null, replace = false } = {}) {
  const { w, h } = scene.grid;
  let changed = 0;
  if (level) {
    const i = (scene.levels || []).findIndex((l) => l.id === level);
    if (i < 0) return scene;
    const rows = scene.levels[i].cells.map((r) => r.split(''));
    for (const c of list || []) {
      const x = clamp(c.x, 0, w - 1), y = clamp(c.y, 0, h - 1);
      if (!validChar(c.ch) || !rows[y] || rows[y][x] === c.ch) continue;
      rows[y][x] = c.ch;
      changed++;
    }
    if (!changed) return scene;
    return { ...scene, levels: scene.levels.map((l, j) => (j === i ? { ...l, cells: rows.map((r) => r.join('')) } : l)) };
  }
  const pad = padCharFor(scene.bg?.floor);
  const rows = scene.cells.map((r) => r.split(''));
  let ground = scene.ground ? scene.ground.map((r) => r.split('')) : null;
  const setGround = (x, y, ch) => {
    if (!ground) ground = Array.from({ length: h }, () => Array(w).fill(' '));
    ground[y][x] = ch;
  };
  for (const c of list || []) {
    const x = clamp(c.x, 0, w - 1), y = clamp(c.y, 0, h - 1);
    const ch = c.ch;
    if (!validChar(ch) || !rows[y]) continue;
    const top = rows[y][x];
    if (ch === ERASE) {
      if (isFloor(top)) continue;
      rows[y][x] = guessUnder((a, b) => rows[b]?.[a], (a, b) => ground?.[b]?.[a], x, y, pad);
    } else if (isFloor(ch)) {
      if (isFloor(top) || replace) {
        if (top === ch) continue;
        rows[y][x] = ch;
        if (ground && ground[y][x] !== ' ') ground[y][x] = ch;
      } else {
        if (ground && ground[y][x] === ch) continue;
        setGround(x, y, ch);
      }
    } else {
      if (top === ch) continue;
      if (isFloor(top)) setGround(x, y, top);
      rows[y][x] = ch;
    }
    changed++;
  }
  if (!changed) return scene;
  const out = { ...scene, cells: rows.map((r) => r.join('')) };
  if (ground) out.ground = ground.map((r) => r.join(''));
  return out;
}

const sharedLevel = (l) => !l.hidden && l.players !== false;

// What creatures walk on: the topmost level everyone can see, else the base.
const walkCache = new WeakMap();
export function walkRows(scene) {
  const levels = (scene?.levels || []).filter(sharedLevel);
  if (!levels.length) return scene?.cells || [];
  const hit = walkCache.get(scene);
  if (hit && hit.cells === scene.cells && hit.levels === scene.levels) return hit.rows;
  const rows = (scene.cells || []).map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      for (const l of levels) { const c = l.cells[y]?.[x]; if (c && c !== ' ') ch = c; }
      out += ch;
    }
    return out;
  });
  walkCache.set(scene, { cells: scene.cells, levels: scene.levels, rows });
  return rows;
}
export const walkCharAt = (scene, x, y) => (walkRows(scene)[y] || '')[x];

/** The levels drawn on this screen, bottom first, each with its 3D height. */
export function drawnLevels(scene) {
  return (scene?.levels || []).filter((l) => !l.hidden).map((l, i) => ({ level: l, lift: LEVEL_LIFT * (i + 1), dmOnly: l.players === false }));
}

/** How high the topmost drawn level at (x, y) stands, or 0. */
export function levelLift(scene, x, y) {
  let lift = 0;
  for (const d of drawnLevels(scene)) { const c = d.level.cells[y]?.[x]; if (c && c !== ' ') lift = d.lift; }
  return lift;
}

export const newLevelId = () => `lv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
