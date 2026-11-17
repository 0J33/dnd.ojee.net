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
  { key: 'guard-post', name: 'Guard post', rows: ['#####', '#R.R#', '#.t.#', '#.1.#', '##D##'] },
  { key: 'bedroom', name: 'Bedroom', rows: ['wwwwww', 'wE=!=w', 'w====w', 'wC=t1w', 'ww=Dww'] },
  { key: 'library-nook', name: 'Reading nook', rows: ['FFFFF', '=1t1=', '=====', 'FF=FF'] },
  { key: 'storeroom', name: 'Storeroom', rows: ['#######', '#[[B!b#', '#B....#', '#b..[[#', '###D###'] },
  { key: 'kitchen', name: 'Kitchen', rows: ['wwwwwww', 'w4K=bbw', 'w=====w', 'w22=1=w', 'www=www'] },
  { key: 'ambush-cover', name: 'Ambush cover', rows: ['YTY ', ' (Y', 'O  Y'] },
  { key: 'tents', name: 'Tents and fire', rows: ['[ ( [', '  c  ', '[ ( K'] },
  { key: 'treasure', name: 'Treasure pile', rows: [' $ ', '$C$', ' $ '] },
  { key: 'cage', name: 'Iron cage', rows: ['###', '#!#', '#L#'] },
  { key: 'pillars', name: 'Pillared aisle', rows: ['P...P', '.....', 'P...P', '.....', 'P...P'] },
  { key: 'webbed', name: 'Webbed corner', rows: ['777 ', '77z ', '7z  '] },
  { key: 'ruin', name: 'Broken wall', rows: ['%%.%%', '%r..r', '.r...'] },
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

/* ---- rooms and places, each different every time ---- */

const set = (g, x, y, ch) => { if (g[y] && g[y][x] !== undefined) g[y][x] = ch; };
const box = (g, x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch); };
const walls = (g, w, h, ch) => { for (let x = 0; x < w; x++) { g[0][x] = ch; g[h - 1][x] = ch; } for (let y = 0; y < h; y++) { g[y][0] = ch; g[y][w - 1] = ch; } };
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/** An inn's common room: a bar along one wall, tables and chairs, a hearth, doors. */
function tavern(w, h, r) {
  const g = fill(w, h, '=');
  walls(g, w, h, '#');
  const barLen = between(r, 5, Math.max(6, Math.floor(w / 3)));
  const left = r() < 0.5;
  const bx = left ? 1 : w - 1 - barLen;
  for (let x = bx; x < bx + barLen; x++) { g[1][x] = r() < 0.3 ? 'b' : '='; g[2][x] = '3'; g[3][x] = '1'; }
  set(g, left ? bx + barLen : bx - 1, 1, 'b');
  // torches stand against the walls, inside the room
  for (let i = 0; i < 3; i++) { const x = between(r, 2, w - 3); if (g[1][x] === '=') g[1][x] = 'I'; }
  for (let i = 0; i < 2; i++) { const y = between(r, 4, h - 3); if (g[y][w - 2] === '=') g[y][w - 2] = 'I'; }
  // the hearth: a fire in the far wall's corner, a rug before it
  const hx = left ? w - 4 : 3;
  set(g, hx, 1, 'c'); set(g, hx, 2, 'e'); set(g, hx - 1, 2, 'e'); set(g, hx + 1, 2, 'e');
  for (let y = 5; y < h - 2; y += 3) for (let x = 2 + (y % 2); x < w - 3; x += between(r, 4, 5)) {
    if (r() < 0.82) { g[y][x] = 't'; g[y][x + 1] = '1'; if (r() < 0.6) set(g, x - 1, y, '1'); if (r() < 0.4) set(g, x, y + 1, '1'); }
  }
  set(g, Math.floor(w / 2), h - 1, 'D');
  set(g, 0, between(r, 4, h - 3), 'D');
  set(g, w - 2, h - 2, '['); set(g, w - 3, h - 2, 'b');
  if (r() < 0.5) set(g, 1, h - 2, 'H');
  return g;
}

/** A crypt: grave alcoves down both sides, bones, statues, a sealed door at the far end. */
function crypt(w, h, r) {
  const g = fill(w, h, '.');
  walls(g, w, h, '#');
  const mid = Math.floor(h / 2);
  for (let x = 2; x < w - 2; x += 3) {
    if (r() < 0.85) { set(g, x, 1, 'M'); set(g, x + 1, 1, 'M'); }
    if (r() < 0.85) { set(g, x, h - 2, 'M'); set(g, x + 1, h - 2, 'M'); }
  }
  for (let x = 4; x < w - 4; x += between(r, 5, 7)) { set(g, x, mid - 2, 'U'); set(g, x, mid + 2, 'U'); }
  for (let i = 0; i < Math.floor((w * h) / 9); i++) { const x = between(r, 1, w - 2), y = between(r, 1, h - 2); if (g[y][x] === '.') g[y][x] = 'z'; }
  for (let i = 0; i < 4; i++) { const x = r() < 0.5 ? 1 : w - 2, y = between(r, 1, h - 2); if (g[y][x] === '.' || g[y][x] === 'z') g[y][x] = '7'; }
  set(g, 0, mid, 'D');
  set(g, w - 1, mid, 'L');
  set(g, w - 3, mid - 1, 'G'); set(g, w - 3, mid + 1, 'G');
  set(g, w - 2, mid, 'C');
  return g;
}

/** A throne room: carpet from the doors to a raised throne, pillars, braziers, banners. */
function throne(w, h, r) {
  const g = fill(w, h, 'p');
  walls(g, w, h, '#');
  const cx = Math.floor(w / 2);
  box(g, cx - 1, 1, cx + 1, h - 2, 'e');
  box(g, cx - 3, 1, cx + 3, 3, '^');
  set(g, cx, 1, 'J');
  set(g, cx - 3, 3, 'G'); set(g, cx + 3, 3, 'G');
  for (let y = 5; y < h - 2; y += 3) { set(g, cx - 4, y, 'P'); set(g, cx + 4, y, 'P'); if (w > 20) { set(g, 3, y, 'P'); set(g, w - 4, y, 'P'); } }
  for (let x = 2; x < w - 2; x += between(r, 3, 4)) if (Math.abs(x - cx) > 4 && g[1][x] === 'p') set(g, x, 1, '}');
  set(g, cx, h - 1, 'D'); set(g, cx - 1, h - 1, 'D');
  if (r() < 0.6) { set(g, 1, 1, 'U'); set(g, w - 2, 1, 'U'); }
  if (r() < 0.5) { set(g, 1, Math.floor(h / 2), 'R'); set(g, w - 2, Math.floor(h / 2), 'R'); }
  return g;
}

/** A dungeon corridor: one long passage with cells and side rooms off it. */
function corridor(w, h, r) {
  const g = fill(w, h, '#');
  const y0 = Math.floor(h / 2) - 1;
  box(g, 1, y0, w - 2, y0 + 1, '.');
  set(g, 0, y0, 'D'); set(g, w - 1, y0 + 1, r() < 0.5 ? 'D' : '>');
  for (let x = 3; x < w - 6; x += between(r, 5, 7)) {
    for (const up of [true, false]) {
      if (r() < 0.3) continue;
      const rw = between(r, 3, 4), rh = between(r, 2, Math.max(2, y0 - 2));
      const ry0 = up ? y0 - 1 - rh : y0 + 3, ry1 = up ? y0 - 2 : y0 + 2 + rh;
      if (ry0 < 1 || ry1 > h - 2) continue;
      box(g, x, ry0, x + rw - 1, ry1, '.');
      const dx = x + Math.floor(rw / 2);
      set(g, dx, up ? y0 - 1 : y0 + 2, r() < 0.25 ? 'L' : 'D');
      const stuff = ['B', 'b', '!', 'E', 'r', 'C', 'z', '7'];
      set(g, x, up ? ry0 : ry1, stuff[Math.floor(r() * stuff.length)]);
    }
  }
  for (let x = 2; x < w - 2; x += between(r, 4, 6)) if (g[y0 - 1][x] === '#') g[y0 - 1][x] = 'I';
  for (let i = 0; i < 3; i++) { const x = between(r, 2, w - 3); if (g[y0 + 1][x] === '.') g[y0 + 1][x] = r() < 0.5 ? 'r' : '7'; }
  return g;
}

/** A road through woodland, with cover close to it: perfect for an ambush. */
function road(w, h, r) {
  const g = fill(w, h, ',');
  let y = between(r, Math.floor(h / 3), Math.floor((2 * h) / 3));
  const path = [];
  for (let x = 0; x < w; x++) {
    g[y][x] = ':'; set(g, x, y + 1, ':'); path.push(y);
    if (r() < 0.25) y = Math.max(2, Math.min(h - 4, y + (r() < 0.5 ? -1 : 1)));
  }
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) {
    if (g[yy][x] !== ',') continue;
    const d = Math.abs(yy - path[x]);
    const v = r();
    if (d >= 3 && v < (d > 5 ? 0.5 : 0.26)) g[yy][x] = 'T';
    else if (d >= 2 && v < 0.36) g[yy][x] = 'Y';
    else if (v < 0.03) g[yy][x] = 'O';
    else if (v < 0.05) g[yy][x] = '&';
  }
  // the ambush: a cart lost a wheel on the road, a log across it
  const ax = between(r, Math.floor(w / 3), Math.floor((2 * w) / 3));
  set(g, ax, path[ax], ')'); set(g, ax + 1, path[ax], '!'); set(g, ax - 2, path[ax - 2] + 1, '(');
  set(g, ax + 3, path[ax + 3] - 2, 'O'); set(g, ax - 3, path[ax - 3] + 3, 'O');
  return g;
}

/** A camp in a clearing: a palisade with a gap, fires, crates and plunder. */
function camp(w, h, r) {
  const g = fill(w, h, ':');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge < 2) g[y][x] = r() < 0.6 ? 'T' : ',';
  }
  box(g, 3, 3, w - 4, 3, 'w'); box(g, 3, h - 4, w - 4, h - 4, 'w'); box(g, 3, 3, 3, h - 4, 'w'); box(g, w - 4, 3, w - 4, h - 4, 'w');
  const gate = Math.floor(w / 2);
  set(g, gate, h - 4, ':'); set(g, gate + 1, h - 4, ':');
  const fires = between(r, 1, 2);
  for (let i = 0; i < fires; i++) {
    const fx = between(r, 6, w - 7), fy = between(r, 6, h - 7);
    set(g, fx, fy, 'c'); set(g, fx - 1, fy + 1, '('); set(g, fx + 1, fy - 1, '(');
  }
  for (let i = 0; i < 6; i++) { const x = between(r, 4, w - 5), y = between(r, 4, h - 5); if (g[y][x] === ':') g[y][x] = ['[', 'B', 'b', '!', 'K', '$'][i % 6]; }
  set(g, 5, 5, 'E'); set(g, w - 6, 5, 'E');
  return g;
}

/** Ruins: broken walls in long grass, rubble, a few columns still standing. */
function ruins(w, h, r) {
  const g = fill(w, h, ',');
  const rooms = between(r, 4, 6);
  for (let i = 0; i < rooms; i++) {
    const rw = between(r, 6, 11), rh = between(r, 5, 8);
    const x0 = between(r, 1, w - rw - 2), y0 = between(r, 1, h - rh - 2);
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) {
      const edge = x === x0 || y === y0 || x === x0 + rw - 1 || y === y0 + rh - 1;
      g[y][x] = edge ? (r() < 0.6 ? '%' : r() < 0.5 ? 'r' : ':') : r() < 0.5 ? '.' : ':';
    }
  }
  for (let i = 0; i < Math.floor((w * h) / 22); i++) { const x = between(r, 1, w - 2), y = between(r, 1, h - 2); if (g[y][x] === ',') g[y][x] = ['P', 'r', 'Y', 'T', 'r', 'O', '&', 'Y'][Math.floor(r() * 8)]; }
  return g;
}

export const GENERATORS = {
  dungeon: { name: 'Dungeon', floor: 'stone', make: dungeon },
  cave: { name: 'Cave', floor: 'stone', make: cave },
  forest: { name: 'Forest', floor: 'grass', make: forest },
  tavern: { name: 'Tavern', floor: 'wood', make: tavern },
  crypt: { name: 'Crypt', floor: 'stone', make: crypt },
  throne: { name: 'Throne room', floor: 'marble', make: throne },
  corridor: { name: 'Corridor', floor: 'stone', make: corridor },
  road: { name: 'Road', floor: 'grass', make: road },
  camp: { name: 'Camp', floor: 'dirt', make: camp },
  ruins: { name: 'Ruins', floor: 'grass', make: ruins },
};

/** The squares of the room (or open area) around (x, y): floor up to the walls and doors, plus those walls. */
export function roomAround(scene, seeds, isWall, isDoor, limit = 3000) {
  const { w, h } = scene.grid;
  const at = (x, y) => (scene.cells?.[y] || '')[x] || '.';
  const seen = new Set(), out = [];
  const q = seeds.map((s) => [s.x, s.y]);
  while (q.length && out.length < limit) {
    const [x, y] = q.pop();
    const k = `${x},${y}`;
    if (x < 0 || y < 0 || x >= w || y >= h || seen.has(k)) continue;
    seen.add(k); out.push(k);
    const ch = at(x, y);
    if ((isWall(ch) || isDoor(ch)) && !seeds.some((s) => s.x === x && s.y === y)) continue; // the edge: shown, not crossed
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    // corner walls touch the room only diagonally: show them too
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, nk = `${nx},${ny}`;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen.has(nk) && isWall(at(nx, ny))) { seen.add(nk); out.push(nk); }
    }
  }
  return out;
}

export function generateMap(kind, w, h, seed = Date.now()) {
  const gen = GENERATORS[kind] || GENERATORS.dungeon;
  return { cells: gen.make(w, h, rng(seed)).map((row) => row.join('')), floor: gen.floor };
}
