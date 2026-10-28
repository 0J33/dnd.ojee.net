// Ready-made pieces to stamp onto a map, and whole maps generated from a
// seed. Every character is a tile from data/tiles.js. In a stamp a space is
// "leave what's there".

export const STAMPS = [
  { key: 'room-small', name: 'Small room', rows: ['#######', '#.....#', '#.....#', 'D.....#', '#.....#', '#######'] },
  { key: 'room-large', name: 'Large room', rows: ['###########', '#.........#', '#.........#', '#.........#', 'D.........D', '#.........#', '#.........#', '###########'] },
  { key: 'corridor', name: 'Corridor', rows: ['########', '........', '########'] },
  { key: 'tavern-corner', name: 'Tavern corner', rows: ['#######', '#=1t1=#', '#=====#', '#=1t1=#', '#=====#'] },
  { key: 'bar', name: 'Bar counter', rows: ['bbI==', '2222=', '=====', '1111='] },
  { key: 'camp', name: 'Campsite', rows: [' (   ', '[ c [', '  1  ', ' Y  Y'] },
  { key: 'crypt-row', name: 'Row of graves', rows: ['zMM.zMM.zMM', 'zzzzzzzzzzz'] },
  { key: 'prison-cell', name: 'Prison cell', rows: ['#####', '#zz.#', '#z..#', '##L##'] },
  { key: 'dais', name: 'Dais with a throne', rows: [' ^^^ ', '^^J^^', '^^^^^', 'G   G'] },
  { key: 'altar', name: 'Altar on a dais', rows: ['P^^^P', '^^A^^', '^^^^^', ' ^^^ '] },
  { key: 'pond', name: 'Pond', rows: [' ~~~ ', '~~~~~', '~~~~~', ' ~~~ '] },
  { key: 'pit-trap', name: 'Pit', rows: ['oo', 'oo'] },
  { key: 'copse', name: 'Copse of trees', rows: [' TT ', 'TTYT', ' YT ', '  Y '] },
  { key: 'rockfall', name: 'Rockfall', rows: ['rOr', 'OrO', ' r '] },
  { key: 'stairs', name: 'Stairs down', rows: ['###', '#>#', '#.#'] },
  { key: 'market', name: 'Market stalls', rows: [')..)', '[..[', '....', '!..B'] },
];

// A tiny seeded random, so the same seed always gives the same map.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const fill = (w, h, ch) => Array.from({ length: h }, () => Array(w).fill(ch));

/** A dungeon: rooms joined by corridors, doors where they meet, a few things inside. */
function dungeon(w, h, r) {
  const g = fill(w, h, '#');
  const rooms = [];
  for (let tries = 0; tries < 80 && rooms.length < Math.max(4, Math.floor((w * h) / 70)); tries++) {
    const rw = 4 + Math.floor(r() * 6), rh = 3 + Math.floor(r() * 5);
    const x = 1 + Math.floor(r() * (w - rw - 2)), y = 1 + Math.floor(r() * (h - rh - 2));
    if (rooms.some((o) => x < o.x + o.w + 1 && x + rw + 1 > o.x && y < o.y + o.h + 1 && y + rh + 1 > o.y)) continue;
    rooms.push({ x, y, w: rw, h: rh });
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) g[yy][xx] = '.';
  }
  rooms.sort((a, b) => a.x - b.x);
  const centre = (o) => ({ x: o.x + Math.floor(o.w / 2), y: o.y + Math.floor(o.h / 2) });
  for (let i = 1; i < rooms.length; i++) {
    const a = centre(rooms[i - 1]), b = centre(rooms[i]);
    const dig = (x, y) => { if (g[y][x] === '#') g[y][x] = ','; };
    if (r() < 0.5) { for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) dig(x, a.y); for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) dig(b.x, y); }
    else { for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) dig(a.x, y); for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) dig(x, b.y); }
  }
  // corridor squares that step into a room become doors; the rest is floor
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (g[y][x] !== ',') continue;
    const room = (xx, yy) => g[yy][xx] === '.';
    const wallsAcross = (g[y][x - 1] === '#' && g[y][x + 1] === '#') || (g[y - 1][x] === '#' && g[y + 1][x] === '#');
    g[y][x] = wallsAcross && (room(x - 1, y) || room(x + 1, y) || room(x, y - 1) || room(x, y + 1)) && r() < 0.7 ? 'D' : '.';
  }
  const props = ['B', 'b', 'r', 'C', 't', '!', 'G', 'X', '7'];
  for (const o of rooms) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = o.x + 1 + Math.floor(r() * Math.max(1, o.w - 2)), y = o.y + 1 + Math.floor(r() * Math.max(1, o.h - 2));
      if (g[y][x] === '.') g[y][x] = props[Math.floor(r() * props.length)];
    }
  }
  const s = centre(rooms[0]);
  if (rooms.length) g[s.y][s.x] = '<';
  const e = centre(rooms[rooms.length - 1]);
  if (rooms.length > 1) g[e.y][e.x] = '>';
  return g;
}

/** A cave: cellular automaton rock and open ground, a pool, some mushrooms. */
function cave(w, h, r) {
  let g = fill(w, h, 'v').map((row, y) => row.map((_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'v' : r() < 0.43 ? 'v' : ':')));
  for (let step = 0; step < 4; step++) {
    g = g.map((row, y) => row.map((ch, x) => {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 'v';
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g[y + dy][x + dx] === 'v') n++;
      return n >= 5 ? 'v' : n <= 2 ? ':' : ch;
    }));
  }
  for (let i = 0; i < Math.floor((w * h) / 40); i++) {
    const x = 1 + Math.floor(r() * (w - 2)), y = 1 + Math.floor(r() * (h - 2));
    if (g[y][x] === ':') g[y][x] = ['5', '6', 'r', 'Q', 'r'][Math.floor(r() * 5)];
  }
  const px = Math.floor(w * (0.3 + r() * 0.4)), py = Math.floor(h * (0.3 + r() * 0.4));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (g[py + dy]?.[px + dx] === ':' && Math.abs(dx) + Math.abs(dy) < 3) g[py + dy][px + dx] = '~';
  return g;
}

/** A forest clearing: trees thickening toward the edges, a path, a camp. */
function forest(w, h, r) {
  const g = fill(w, h, ',');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    const p = edge === 0 ? 0.75 : edge === 1 ? 0.4 : 0.06;
    const v = r();
    if (v < p) g[y][x] = 'T';
    else if (v < p + 0.05) g[y][x] = 'Y';
    else if (v < p + 0.07) g[y][x] = '&';
  }
  const py = Math.floor(h / 2);
  let y = py;
  for (let x = 0; x < w; x++) { g[y][x] = ':'; if (r() < 0.3) y = Math.max(2, Math.min(h - 3, y + (r() < 0.5 ? -1 : 1))); g[y][x] = ':'; }
  const cx = Math.floor(w * 0.6), cy = Math.max(2, py - 3);
  g[cy][cx] = 'c'; g[cy][cx - 2] = '('; g[cy + 1][cx + 2] = '[';
  return g;
}

export const GENERATORS = { dungeon: { name: 'Dungeon', floor: 'stone', make: dungeon }, cave: { name: 'Cave', floor: 'stone', make: cave }, forest: { name: 'Forest', floor: 'grass', make: forest } };

export function generateMap(kind, w, h, seed = Date.now()) {
  const gen = GENERATORS[kind] || GENERATORS.dungeon;
  return { cells: gen.make(w, h, rng(seed)).map((row) => row.join('')), floor: gen.floor };
}
