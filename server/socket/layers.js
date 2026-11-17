const { v4: uuidv4 } = require('uuid');

// Map layers. Mirrors client/src/data/layers.js (keep the two in step).
//
//   scene.cells   what stands on each square: a floor, or a wall / door /
//                 piece of furniture (one char per square, as always)
//   scene.ground  optional, one floor char per square: the floor under a
//                 wall or piece of furniture (' ' = not known: the floor
//                 around it). Under a floor square it means nothing.
//   scene.levels  optional, extra layers painted on top (a platform, a
//                 balcony, an upper floor): [{ id, name, cells, hidden,
//                 players }], ' ' = nothing there. `hidden` hides it from
//                 everyone; `players: false` keeps it to the DM.
//
// Painting a floor changes only the ground under a wall or furniture;
// painting a wall or furniture keeps the floor it covers; erasing (' ')
// takes the wall or furniture away and shows that floor again.

const FLOOR = new Set('.=,:skopniez~qmlx^'.split(''));
const SOLID_FLOOR = new Set('.=,:skpniez^'.split('')); // what an unknown floor is guessed from
const ERASE = ' ';
const MAX_LEVELS = 6;
const isFloor = (ch) => FLOOR.has(ch);

const str = (v, n) => String(v ?? '').slice(0, n);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const validChar = (ch) => typeof ch === 'string' && ch.length === 1 && ch >= ' ' && ch <= '~';

function blankRows({ w, h }) {
  return Array.from({ length: h }, () => ' '.repeat(w));
}

/** A ground grid trimmed to the scene's size, or null when there is none. */
function normaliseGround(ground, grid) {
  if (!Array.isArray(ground)) return null;
  return Array.from({ length: grid.h }, (_, y) => [...str(ground[y], grid.w).padEnd(grid.w, ' ')].map((ch) => (FLOOR.has(ch) ? ch : ' ')).join(''));
}

function normaliseLevel(l, grid) {
  if (!l || typeof l !== 'object') return null;
  return {
    id: typeof l.id === 'string' && /^[\w-]{4,64}$/.test(l.id) ? l.id : uuidv4(),
    name: str(l.name || 'Level', 40) || 'Level',
    cells: Array.from({ length: grid.h }, (_, y) => [...str(Array.isArray(l.cells) ? l.cells[y] : '', grid.w).padEnd(grid.w, ' ')].map((ch) => (validChar(ch) ? ch : ' ')).join('')),
    hidden: !!l.hidden,
    players: l.players !== false,
  };
}

/** Levels trimmed to the scene's size, or null when there are none. */
function normaliseLevels(levels, grid) {
  if (!Array.isArray(levels) || !levels.length) return null;
  const seen = new Set();
  const out = [];
  for (const l of levels.slice(0, MAX_LEVELS)) {
    const n = normaliseLevel(l, grid);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out.length ? out : null;
}

/** Bring a scene's layers to its grid (after a resize or a load). */
function fitLayers(scene) {
  const g = normaliseGround(scene.ground, scene.grid);
  if (g) scene.ground = g; else delete scene.ground;
  const l = normaliseLevels(scene.levels, scene.grid);
  if (l) scene.levels = l; else delete scene.levels;
}

// The floor under (x, y): the ground if known, else the commonest plain
// floor around it, else the scene's base. top(x, y) and gnd(x, y) read the
// squares (so a paint in progress can ask about its own rows).
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
const underAt = (scene, x, y, pad) => guessUnder((a, b) => (scene.cells[b] || '')[a], (a, b) => scene.ground?.[b]?.[a], x, y, pad);

/**
 * Paint {x, y, ch} squares onto a scene (ch ' ' erases). On a level when
 * `level` names one; `replace` sets the base square outright (stamps: a
 * floor there clears what stood on it). Returns how many squares changed.
 */
function paint(scene, list, { level = null, replace = false, pad = '.' } = {}) {
  const { w, h } = scene.grid;
  let changed = 0;
  if (level) {
    const i = (scene.levels || []).findIndex((l) => l.id === level);
    if (i < 0) return 0;
    const rows = scene.levels[i].cells.map((r) => r.split(''));
    for (const c of list) {
      const x = clampInt(c.x, 0, w - 1), y = clampInt(c.y, 0, h - 1);
      if (!validChar(c.ch) || rows[y][x] === c.ch) continue;
      rows[y][x] = c.ch;
      changed++;
    }
    if (changed) {
      scene.levels = scene.levels.map((l, j) => (j === i ? { ...l, cells: rows.map((r) => r.join('')) } : l));
    }
    return changed;
  }
  const rows = scene.cells.map((r) => r.split(''));
  let ground = scene.ground ? scene.ground.map((r) => r.split('')) : null;
  const setGround = (x, y, ch) => {
    if (!ground) ground = blankRows(scene.grid).map((r) => r.split(''));
    ground[y][x] = ch;
  };
  for (const c of list) {
    const x = clampInt(c.x, 0, w - 1), y = clampInt(c.y, 0, h - 1);
    const ch = c.ch;
    if (!validChar(ch)) continue;
    const top = rows[y][x];
    if (ch === ERASE) {
      if (isFloor(top)) continue;
      rows[y][x] = guessUnder((a, b) => rows[b]?.[a], (a, b) => ground?.[b]?.[a], x, y, pad);
      changed++;
    } else if (isFloor(ch)) {
      if (isFloor(top) || replace) {
        if (top === ch) continue;
        rows[y][x] = ch;
        if (ground && ground[y][x] !== ' ') ground[y][x] = ch;
      } else {
        if (ground && ground[y][x] === ch) continue;
        setGround(x, y, ch); // the wall or furniture stays; the floor under it changes
      }
      changed++;
    } else {
      if (top === ch) continue;
      if (isFloor(top)) setGround(x, y, top); // remember the floor it covers
      rows[y][x] = ch;
      changed++;
    }
  }
  if (!changed) return 0;
  scene.cells = rows.map((r) => r.join(''));
  if (ground) scene.ground = ground.map((r) => r.join(''));
  return changed;
}

const sharedLevel = (l) => !l.hidden && l.players !== false;

// What creatures walk on: the topmost level everyone can see, else the base.
const walkCache = new WeakMap();
function walkRows(scene) {
  const levels = (scene.levels || []).filter(sharedLevel);
  if (!levels.length) return scene.cells || [];
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

/** The levels players are sent: only the shown ones they may see. */
function levelsForPlayers(scene) {
  return (scene.levels || []).filter(sharedLevel);
}

module.exports = { FLOOR, ERASE, MAX_LEVELS, isFloor, normaliseGround, normaliseLevels, normaliseLevel, fitLayers, underAt, paint, walkRows, levelsForPlayers, blankRows };
