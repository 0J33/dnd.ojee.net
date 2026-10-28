import { TILES } from '../data/tiles';

// One 3D model per prop tile. Every model is built from kit shapes into the
// cell (x..x+1, z..z+1), with the floor at y = 0. Things that glow or burn
// register an emitter (light + particles) instead of being drawn here.
// Painted-miniature style: faceted, flat-shaded, but each piece carries its
// trims, bands, rivets and wear so it reads as made rather than blocked out.

export const WALL_H = 1.3;

const WOOD = '#6b4a2e', WOOD_D = '#4f3520', WOOD_L = '#8a6440', WOOD_DD = '#3a2616';
const STONE = '#7a7670', STONE_D = '#5c5853', STONE_L = '#9a958c';
const IRON = '#4b4f55', IRON_L = '#6a6f77', GOLD = '#d4a94f', BRASS = '#b08a3e', CLOTH_R = '#7a2f2f';
const WAX = '#ece4d0', ROPE = '#8a7552', LEAF = '#3f6b35', MOSS = '#4f6a35';
const MORTAR = '#2c2925';
const TAU = Math.PI * 2;

export const isWallChar = (ch) => TILES[ch]?.cat === 'wall';
const isDoorChar = (ch) => ch === 'D' || ch === 'd' || ch === 'L' || ch === 'S';
// For lining doors up: walls and other doors both make the wall line.
const inWallLine = (ch) => isWallChar(ch) || isDoorChar(ch);

// A local frame turned by ry about (ox, oz): lx runs across the thing, lz
// toward its front. Returns world x/z for a local point.
const L = (ox, oz, ry) => (lx, lz = 0) => ({ x: ox + Math.cos(ry) * lx + Math.sin(ry) * lz, z: oz - Math.sin(ry) * lx + Math.cos(ry) * lz });

// Which way a wall-mounted thing faces: toward open floor (local +z is the front).
function facingFromWalls(c) {
  const dirs = [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]];
  for (const [dx, dy, ry] of dirs) if (isWallChar(c.at(dx, dy))) return { ry: ry + Math.PI, dx, dy };
  return null;
}

// A door spans the gap: walls left/right → spans x, walls up/down → spans z.
function doorAxis(c) {
  const wx = inWallLine(c.at(-1, 0)) || inWallLine(c.at(1, 0));
  const wz = inWallLine(c.at(0, -1)) || inWallLine(c.at(0, 1));
  return wz && !wx ? 'z' : 'x';
}

// The opening is cut through the wall: dressed stone quoins and a stone
// lintel fill the wall's whole depth, and a wooden frame holds the door in
// the middle of it. (Everything anchored inside the cell for the cutaway;
// the jambs and their mortar backing straddle the cut so the stub is capped.)
// Doors side by side along the wall make one wide opening: no jamb between them.
function doorRun(c, axis) {
  const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1];
  const open = (ch) => ch === 'D' || ch === 'd' || ch === 'L'; // a secret door looks like wall
  return { lo: open(c.at(-dx, -dy)), hi: open(c.at(dx, dy)) };
}
function doorFrame(c, k, axis, color = WOOD_D) {
  const { cx, cz } = c;
  const run = doorRun(c, axis);
  const along = (v) => (axis === 'x' ? { x: cx + v, z: cz } : { x: cx, z: cz + v });
  const dims = (w, h, d) => (axis === 'x' ? [w, h, d] : [d, h, w]);
  const lo = run.lo ? -0.499 : -0.4, hi = run.hi ? 0.499 : 0.4; // the opening
  const JH = WALL_H - 0.22, QN = 4, QH = JH / QN;
  for (const [has, u] of [[!run.lo, -0.449], [!run.hi, 0.449]]) {
    if (!has) continue;
    k.box(...dims(0.09, JH, 0.95), MORTAR, { ...along(u), y: JH / 2 });
    // quoins: long and short stones in turn, the long ones flush with the brick face
    for (let i = 0; i < QN; i++) {
      const big = (i + (u > 0 ? 1 : 0)) % 2 === 0;
      k.box(...dims(0.1, QH - 0.014, big ? 1.068 : 1.02), big ? STONE : STONE_D, { ...along(u), y: i * QH + QH / 2, vary: 0.1 });
    }
  }
  // lintel across the whole cell, with a proud keystone
  k.box(...dims(0.998, 0.22, 1.05), STONE_D, { ...along(0), y: WALL_H - 0.11, vary: 0.05 });
  if (!run.lo && !run.hi) k.box(...dims(0.16, 0.25, 1.09), STONE_L, { ...along(0), y: WALL_H - 0.12, vary: 0.05 });
  k.box(...dims(hi - lo, 0.04, 1.0), STONE, { ...along((lo + hi) / 2), y: 0.02, vary: 0.05 }); // threshold
  k.box(...dims(hi - lo - 0.1, 0.006, 0.5), '#8a857d', { ...along((lo + hi) / 2), y: 0.043 }); // worn track
  k.box(0.998, 0.04, 0.998, '#3e3a36', { x: cx, y: WALL_H + 0.02, z: cz });
  // wooden frame around the door leaf: posts, head, and iron hinge pins on the hinge post
  if (!run.lo) k.box(...dims(0.07, JH, 0.18), color, { ...along(-0.37), y: JH / 2, vary: 0.05 });
  if (!run.hi) k.box(...dims(0.07, JH, 0.18), color, { ...along(0.37), y: JH / 2, vary: 0.05 });
  k.box(...dims(hi - lo, 0.08, 0.18), color, { ...along((lo + hi) / 2), y: WALL_H - 0.26 });
  if (!run.lo) for (const yy of [0.25, 0.8]) k.box(...dims(0.03, 0.08, 0.2), IRON, { ...along(-0.34), y: yy });
  return { lo: run.lo ? -0.5 : -0.35, hi: run.hi ? 0.5 : 0.35 };
}
const DOOR_W = 0.7, DOOR_H = WALL_H - 0.29;

// A door leaf, centred at (x, z), turned by ry (width along local x).
// Wooden: boards over a dark backing, iron straps with hinge ends and rivets,
// a ring pull. Iron: a plated slab with raised panels, rivets and a barred
// grille. `faces` says which faces carry detail (a door flush on a wall
// only shows one). Everything anchors with `anc` for the cutaway.
function doorLeaf(k, { x, z, ry, w, h = DOOR_H, t = 0.08, anc = {}, iron = false, faces = [-1, 1], handle = 'auto', rnd = Math.random }) {
  const at = L(x, z, ry);
  const P = (lx, lz, y, o) => ({ ...at(lx, lz), y, ry, ...anc, ...o });
  const hx = handle === 'auto' ? w / 2 - 0.12 : handle;
  if (iron) {
    k.box(w, h, t, '#474b52', P(0, 0, h / 2, { vary: 0.04 }));
    for (const f of faces) {
      const n = f * (t / 2 + 0.006);
      // raised panels, two across and two high, below the grille
      for (const px of [-1, 1]) for (const py of [0, 1]) k.box(w / 2 - 0.09, h * 0.3 - 0.06, 0.012, '#5d626a', P(px * w / 4, n, 0.06 + py * h * 0.3 + h * 0.15, { vary: 0.05 }));
      // rivet rows top and bottom
      for (let i = 0; i < 5; i++) for (const yy of [0.035, h - 0.035]) k.box(0.022, 0.022, 0.02, IRON_L, P(-w / 2 + 0.06 + i * (w - 0.12) / 4, f * (t / 2 + 0.01), yy));
      // a bar handle
      if (hx !== null) k.box(0.025, 0.14, 0.025, IRON_L, P(hx, f * (t / 2 + 0.03), 0.52));
    }
    // barred grille at eye level, through the slab
    k.box(0.26, 0.14, t + 0.004, '#0b0a09', P(0, 0, h * 0.8));
    for (const b of [-0.08, 0, 0.08]) k.box(0.018, 0.14, 0.018, IRON_L, P(b, 0, h * 0.8));
    return;
  }
  k.box(w, h, t * 0.55, WOOD_DD, P(0, 0, h / 2));
  const n = Math.max(2, Math.round(w / 0.17)), pw = w / n;
  for (let i = 0; i < n; i++) {
    const ph = h - (rnd() < 0.3 ? 0.015 : 0);
    k.box(pw - 0.014, ph, t, i % 2 ? WOOD : '#74512f', P(-w / 2 + pw * (i + 0.5), 0, ph / 2, { vary: 0.09 }));
  }
  for (const f of faces) {
    const n0 = f * (t / 2 + 0.007);
    for (const yy of [0.2, h - 0.22]) {
      k.box(w - 0.05, 0.055, 0.014, IRON, P(0, n0, yy));
      k.box(0.09, 0.08, 0.016, IRON, P(-w / 2 + 0.06, n0, yy)); // hinge end
      for (let i = 0; i < 3; i++) k.box(0.02, 0.02, 0.02, IRON_L, P(-w / 2 + 0.16 + i * (w - 0.24) / 2, f * (t / 2 + 0.016), yy));
    }
    if (hx !== null) {
      k.box(0.06, 0.08, 0.01, IRON, P(hx, f * (t / 2 + 0.005), 0.55));
      k.torus(0.035, 0.008, IRON_L, { ...P(hx, f * (t / 2 + 0.016), 0.5), rseg: 3, tseg: 8 });
    }
  }
}

// Which side of the doorway an open door swings to: the side that is open
// floor inside the map (never into the void beyond the edge).
function swingSide(c, axis) {
  const [dx, dy] = axis === 'x' ? [0, 1] : [1, 0];
  const ok = (s) => { const ch = c.at(dx * s, dy * s); return ch !== '#' && !isWallChar(ch) && !TILES[ch]?.blocked; };
  return ok(1) || !ok(-1) ? 1 : -1;
}

const P = {};

/* ---------------- doors & ways ---------------- */
// A door that isn't set between two walls (painted on the floor in front of
// one) is drawn as a door in that wall's face, flush against it.
function wallDoor(c, k, open) {
  const between = (inWallLine(c.at(-1, 0)) && inWallLine(c.at(1, 0))) || (inWallLine(c.at(0, -1)) && inWallLine(c.at(0, 1)));
  if (between) return false;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const d = dirs.find(([dx, dy]) => isWallChar(c.at(dx, dy))) || [0, 1];
  const axis = d[1] ? 'x' : 'z';
  const off = 0.5 - 0.05;
  // anchored to the wall it hangs on, so the cutaway takes it down with the wall
  const anc = { ax: c.cx + d[0], az: c.cz + d[1] };
  const at = (u, n = 0) => ({ ...(axis === 'x' ? { x: c.cx + u, z: c.cz + d[1] * (off - n) } : { x: c.cx + d[0] * (off - n), z: c.cz + u }), ...anc });
  const dims = (w, h, t) => (axis === 'x' ? [w, h, t] : [t, h, w]);
  // a stone surround: quoined posts and a lintel with a keystone
  for (const u of [-0.42, 0.42]) {
    for (let i = 0; i < 4; i++) {
      const qh = (DOOR_H + 0.1) / 4, big = (i + (u > 0 ? 1 : 0)) % 2 === 0;
      k.box(...dims(big ? 0.13 : 0.1, qh - 0.012, 0.1), big ? STONE : STONE_D, { ...at(u + (big ? 0 : Math.sign(u) * -0.015)), y: i * qh + qh / 2, vary: 0.1 });
    }
  }
  k.box(...dims(0.98, 0.12, 0.11), STONE_D, { ...at(0), y: DOOR_H + 0.16, vary: 0.05 });
  k.box(...dims(0.14, 0.16, 0.13), STONE_L, { ...at(0), y: DOOR_H + 0.16 });
  k.box(...dims(0.74, 0.06, 0.08), WOOD_D, { ...at(0, 0.01), y: DOOR_H + 0.03 }); // timber head
  k.box(...dims(0.74, 0.03, 0.14), STONE, { ...at(0, -0.02), y: 0.015 }); // step
  const ry = axis === 'x' ? 0 : Math.PI / 2;
  const front = axis === 'x' ? -d[1] : -d[0]; // the face toward the room, in leaf-local z
  if (open) {
    k.box(...dims(0.7, DOOR_H, 0.04), '#0d0a08', { ...at(0, 0.02), y: DOOR_H / 2 });
    const sx = axis === 'x' ? { x: c.cx - 0.33, z: c.cz + d[1] * (off - 0.37) } : { x: c.cx + d[0] * (off - 0.37), z: c.cz - 0.33 };
    doorLeaf(k, { ...sx, ry: ry + Math.PI / 2, w: 0.7, t: 0.06, anc, rnd: c.rnd });
  } else {
    const p = at(0, 0.02);
    doorLeaf(k, { x: p.x, z: p.z, ry, w: 0.7, t: 0.04, anc, faces: [front], handle: 0.22, rnd: c.rnd });
  }
  return true;
}

P.D = (c, k) => {
  if (wallDoor(c, k, false)) return;
  const axis = doorAxis(c);
  const span = doorFrame(c, k, axis);
  const ry = axis === 'x' ? 0 : Math.PI / 2;
  const w = span.hi - span.lo - 0.01, mid = (span.lo + span.hi) / 2;
  const at = axis === 'x' ? { x: c.cx + mid, z: c.cz } : { x: c.cx, z: c.cz + mid };
  // the ring pull sits by the meeting edge of a pair, or the lock side of a single door
  const sgn = axis === 'x' ? 1 : -1;
  const handle = span.lo > -0.5 && span.hi < 0.5 ? w / 2 - 0.12 : span.hi === 0.5 && span.lo > -0.5 ? sgn * (w / 2 - 0.1) : span.lo === -0.5 && span.hi < 0.5 ? -sgn * (w / 2 - 0.1) : null;
  doorLeaf(k, { ...at, ry, w, handle, rnd: c.rnd });
};
P.d = (c, k) => {
  if (wallDoor(c, k, true)) return;
  const axis = doorAxis(c);
  doorFrame(c, k, axis);
  // Hinged on the -side jamb, swung 90 degrees into the room.
  const s = swingSide(c, axis);
  const hinge = -0.35, len = DOOR_W;
  const anc = { ax: c.cx, az: c.cz };
  if (axis === 'x') doorLeaf(k, { x: c.cx + hinge + 0.04, z: c.cz + s * len / 2, ry: Math.PI / 2, w: len, anc, rnd: c.rnd });
  else doorLeaf(k, { x: c.cx + s * len / 2, z: c.cz + hinge + 0.04, ry: 0, w: len, anc, rnd: c.rnd });
};
P.L = (c, k) => {
  // Iron door: all of it in the wall mesh, so it drops with the wall.
  const axis = doorAxis(c);
  doorFrame(c, k, axis, '#3a3d42');
  doorLeaf(k, { x: c.cx, z: c.cz, ry: axis === 'x' ? 0 : Math.PI / 2, w: DOOR_W, t: 0.1, iron: true, handle: 0.24 });
};
P.S = (c, k, m, g) => {
  // Players see wall; the DM sees the same wall with a faint seam of light.
  wallStone(c, k);
  if (c.dmView) {
    const axis = doorAxis(c);
    g.box(axis === 'x' ? 0.7 : 0.03, 0.9, axis === 'x' ? 0.03 : 0.7, '#5a8fd0', { x: c.cx, y: 0.6, z: c.cz + (axis === 'x' ? 0.52 : 0) });
  }
};
P['<'] = (c, k) => {
  // A flight of dressed steps rising toward the wall behind it, between low cheek walls.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  const N = 5;
  for (let i = 0; i < N; i++) {
    const top = 0.13 + i * 0.12, lz = 0.4 - i * 0.2;
    k.box(0.84, top - 0.03, 0.2, i % 2 ? STONE : STONE_D, { ...at(0, lz), y: (top - 0.03) / 2, ry, vary: 0.06 });
    k.box(0.86, 0.035, 0.22, STONE_L, { ...at(0, lz + 0.01), y: top - 0.0175, ry, vary: 0.06 }); // nosing
    for (const s of [-1, 1]) k.box(0.06, top + 0.1, 0.2, STONE_D, { ...at(s * 0.46, lz), y: (top + 0.1) / 2, ry, vary: 0.08 });
  }
  for (const s of [-1, 1]) { // a sloped coping along each cheek
    const a = at(s * 0.46, 0.5), b = at(s * 0.46, -0.5);
    k.limb([a.x, 0.25, a.z], [b.x, 0.73, b.z], 0.04, 0.04, STONE, { seg: 4, joint: false });
  }
};
P['>'] = (c, k) => {
  // Steps going down into the dark (the floor is cut open over this square).
  // They run down toward a wall if there is one, entered from the open side.
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const d = dirs.find(([dx, dy]) => isWallChar(c.at(dx, dy)) && !isWallChar(c.at(-dx, -dy))) || dirs.find(([dx, dy]) => !isWallChar(c.at(-dx, -dy))) || [0, 1];
  const ry = Math.atan2(-d[0], -d[1]); // local +z: toward the way in
  const at = L(c.cx, c.cz, ry);
  const B = -0.245;
  k.box(0.998, 0.01, 0.998, '#050403', { x: c.cx, y: B + 0.005, z: c.cz });
  for (const s of [-1, 1]) k.box(0.07, -B, 0.998, '#1c1814', { ...at(s * 0.464, 0), y: B / 2, ry }); // side walls
  k.box(0.86, -B, 0.06, '#120f0c', { ...at(0, -0.47), y: B / 2, ry });
  for (let i = 0; i < 4; i++) {
    const top = -0.05 - i * 0.045, lz = 0.36 - i * 0.2;
    k.box(0.86, top - B, 0.2, i % 2 ? STONE_D : '#4a4642', { ...at(0, lz), y: (top + B) / 2, ry, vary: 0.06 });
    k.box(0.86, 0.02, 0.03, STONE, { ...at(0, lz + 0.09), y: top - 0.01, ry });
  }
  // a kerb of stone round three sides of the opening
  for (const s of [-1, 1]) k.box(0.08, 0.05, 1.0, STONE, { ...at(s * 0.46, 0), y: 0.025, ry, vary: 0.06 });
  k.box(1.0, 0.05, 0.08, STONE, { ...at(0, -0.46), y: 0.025, ry, vary: 0.06 });
};
P.H = (c, k) => {
  // A ladder of round poles, leaning on the wall if there is one.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  const z0 = f ? -0.12 : 0, z1 = f ? -0.42 : 0, top = 1.5;
  const pt = (lx, t) => { const p = at(lx, z0 + (z1 - z0) * t); return [p.x, t * top, p.z]; };
  for (const s of [-0.21, 0.21]) k.limb(pt(s, 0), pt(s, 1.04), 0.03, 0.026, WOOD_L, { seg: 5, joint: false, vary: 0.05 });
  for (let i = 0; i < 6; i++) {
    const t = (0.12 + i * 0.16);
    k.limb(pt(-0.23, t), pt(0.23, t), 0.018, 0.018, WOOD, { seg: 5, joint: false });
    for (const s of [-0.21, 0.21]) { const p = pt(s, t); k.box(0.07, 0.035, 0.07, ROPE, { x: p[0], y: p[1], z: p[2], ry }); } // lashing
  }
};
// A bridge: decks of neighbouring bridge squares join into one span. Planks
// run across the way you walk, a stringer runs under each edge, rails stand
// only on sides that face water (or a drop), with posts at their ends.
const isBridge = (ch) => ch === '/';
const isWet = (ch) => ch === '~' || ch === 'q' || ch === 'l' || TILES[ch]?.void;
P['/'] = (c, k) => {
  // The way across: along x if water lies to the north/south, else along z.
  const wetNS = isWet(c.at(0, -1)) || isWet(c.at(0, 1));
  const wetEW = isWet(c.at(-1, 0)) || isWet(c.at(1, 0));
  const along = wetEW && !wetNS ? 'z' : wetNS && !wetEW ? 'x' : (isBridge(c.at(0, -1)) || isBridge(c.at(0, 1)) ? 'z' : 'x');
  const deckY = 0.1;
  // planks across the walking direction, slightly irregular, nailed at each end
  for (let i = 0; i < 6; i++) {
    const u = -0.5 + (i + 0.5) / 6;
    const len = 1.0 - c.rnd() * 0.04, wid = 1 / 6 - 0.014;
    const sag = (c.rnd() - 0.5) * 0.012, th = 0.045 + c.rnd() * 0.015;
    const col = [WOOD, WOOD_L, '#7a5636'][i % 3];
    if (along === 'z') k.box(len, th, wid, col, { x: c.cx, y: deckY + sag, z: c.cz + u, ry: (c.rnd() - 0.5) * 0.03, vary: 0.1 });
    else k.box(wid, th, len, col, { x: c.cx + u, y: deckY + sag, z: c.cz, ry: (c.rnd() - 0.5) * 0.03, vary: 0.1 });
    for (const e of [-0.42, 0.42]) {
      const nx = along === 'z' ? c.cx + e : c.cx + u, nz = along === 'z' ? c.cz + u : c.cz + e;
      k.box(0.018, 0.012, 0.018, '#2a2420', { x: nx, y: deckY + sag + th / 2 + 0.002, z: nz });
    }
  }
  // stringers under the deck at the two edges of the span, and posts into the water
  const sides = along === 'z' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
  for (const [dx, dy] of sides) {
    const edge = !isBridge(c.at(dx, dy));
    const ox = dx * 0.42, oz = dy * 0.42;
    k.box(along === 'z' ? 0.1 : 1, 0.1, along === 'z' ? 1 : 0.1, WOOD_D, { x: c.cx + ox, y: deckY - 0.07, z: c.cz + oz });
    if (!edge) continue;
    if (isWet(c.at(dx, dy))) {
      // a rail on the water side: posts at the square's ends, a top rail and a mid rail
      for (const t of [-0.45, 0.45]) {
        const px = c.cx + ox * 1.05 + (along === 'x' ? t : 0), pz = c.cz + oz * 1.05 + (along === 'z' ? t : 0);
        k.box(0.07, 0.55, 0.07, WOOD_D, { x: px, y: deckY + 0.25, z: pz, vary: 0.06 });
        k.cone(0.06, 0.06, WOOD_D, { x: px, y: deckY + 0.555, z: pz, seg: 4, ry: Math.PI / 4 }); // post cap
        k.box(0.08, 0.5, 0.08, WOOD_D, { x: px, y: -0.2, z: pz }); // piling into the water
        k.box(0.09, 0.04, 0.09, ROPE, { x: px, y: deckY + 0.42, z: pz }); // lashing
      }
      for (const yy of [0.5, 0.3]) k.box(along === 'z' ? 0.05 : 1, 0.05, along === 'z' ? 1 : 0.05, yy > 0.4 ? WOOD_L : WOOD, { x: c.cx + ox * 1.05, y: deckY + yy, z: c.cz + oz * 1.05, vary: 0.06 });
    }
  }
};

// Bones on an old floor: real little bones (a shaft with knobbly ends), not
// paint. Sparse, and now and then a skull, so it reads as an old crypt.
export function floorBones(c, k) {
  if (c.rnd() > 0.45) return;
  const BONE = '#d8d0b8';
  const n = 1 + Math.floor(c.rnd() * 2);
  for (let i = 0; i < n; i++) {
    const x = c.x0 + 0.2 + c.rnd() * 0.6, z = c.z0 + 0.2 + c.rnd() * 0.6, a = c.rnd() * Math.PI, len = 0.16 + c.rnd() * 0.1;
    const dx = Math.cos(a) * len / 2, dz = Math.sin(a) * len / 2;
    k.limb([x - dx, 0.018, z - dz], [x + dx, 0.018, z + dz], 0.012, 0.012, BONE, { seg: 5, joint: false });
    for (const sd of [-1, 1]) for (const o of [-1, 1]) k.ball(0.014, BONE, { x: x + sd * dx + o * Math.sin(a) * 0.01, y: 0.02, z: z + sd * dz - o * Math.cos(a) * 0.01, detail: 0 });
  }
  if (c.rnd() < 0.18) {
    const x = c.x0 + 0.3 + c.rnd() * 0.4, z = c.z0 + 0.3 + c.rnd() * 0.4, ry = c.rnd() * Math.PI * 2;
    k.sphere(0.05, BONE, { x, y: 0.045, z, sy: 0.9, seg: 8 });
    k.box(0.05, 0.03, 0.04, BONE, { x: x + Math.sin(ry) * 0.035, y: 0.02, z: z + Math.cos(ry) * 0.035, ry });
    for (const sd of [-1, 1]) k.ball(0.012, '#2a2420', { x: x + Math.sin(ry) * 0.045 + Math.cos(ry) * sd * 0.018, y: 0.055, z: z + Math.cos(ry) * 0.045 - Math.sin(ry) * sd * 0.018, detail: 0 });
  }
}

/* ---------------- small table dressing ---------------- */
const tankard = (k, m, x, y, z, ry) => {
  k.cyl(0.042, 0.048, 0.1, '#8a6a3a', { x, y: y + 0.05, z, seg: 7, vary: 0.08 });
  m.cyl(0.05, 0.05, 0.014, IRON, { x, y: y + 0.02, z, seg: 7, open: true });
  m.cyl(0.046, 0.046, 0.014, IRON, { x, y: y + 0.088, z, seg: 7, open: true });
  k.torus(0.03, 0.009, '#6a4e2a', { x: x + Math.cos(ry) * 0.055, y: y + 0.055, z: z - Math.sin(ry) * 0.055, ry, arc: Math.PI, rz: -Math.PI / 2, rseg: 3, tseg: 5 });
};
const plate = (k, x, y, z, rnd) => {
  k.cyl(0.11, 0.09, 0.015, '#c8c0b0', { x, y: y + 0.008, z, seg: 10 });
  const r = rnd();
  if (r < 0.35) k.sphere(0.07, '#b8854a', { x, y: y + 0.03, z, sx: 1.3, sy: 0.55, seg: 7, vary: 0.08 }); // a loaf
  else if (r < 0.6) { k.ball(0.035, '#a8342a', { x: x - 0.03, y: y + 0.045, z, detail: 0 }); k.ball(0.033, '#7a9a3a', { x: x + 0.035, y: y + 0.043, z: z + 0.02, detail: 0 }); }
  else if (r < 0.75) k.box(0.1, 0.04, 0.06, '#e0c070', { x, y: y + 0.035, z, ry: rnd(), vary: 0.06 }); // cheese
};
const candle = (c, k, m, x, y, z, h = 0.1) => {
  m.cyl(0.05, 0.055, 0.015, BRASS, { x, y: y + 0.008, z, seg: 8 });
  k.cyl(0.022, 0.025, h, WAX, { x, y: y + 0.015 + h / 2, z, seg: 6 });
  k.box(0.012, 0.03, 0.012, '#f4eedd', { x: x + 0.02, y: y + h - 0.01, z }); // a drip
  c.emit({ kind: 'candle', x, y: y + h + 0.08, z });
};

/* ---------------- furniture ---------------- */
P.t = (c, k, m) => {
  const { cx, cz } = c;
  k.cyl(0.4, 0.38, 0.06, WOOD_L, { x: cx, y: 0.52, z: cz, seg: 12, vary: 0.05 });
  k.cyl(0.33, 0.33, 0.06, WOOD_D, { x: cx, y: 0.465, z: cz, seg: 12, open: true }); // apron
  for (const s of [-0.13, 0.13]) k.box(0.012, 0.004, 0.72, WOOD_D, { x: cx + s, y: 0.551, z: cz }); // board seams
  // pedestal: a turned column on four splayed feet
  k.cyl(0.05, 0.07, 0.4, WOOD_D, { x: cx, y: 0.25, z: cz, seg: 7 });
  k.cyl(0.085, 0.085, 0.06, WOOD, { x: cx, y: 0.16, z: cz, seg: 7 });
  k.cyl(0.075, 0.075, 0.04, WOOD, { x: cx, y: 0.42, z: cz, seg: 7 });
  const a0 = c.rnd() * Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * Math.PI / 2;
    k.box(0.3, 0.06, 0.06, WOOD_D, { x: cx + Math.cos(a) * 0.14, y: 0.04, z: cz - Math.sin(a) * 0.14, ry: a });
    k.box(0.07, 0.03, 0.08, WOOD_DD, { x: cx + Math.cos(a) * 0.27, y: 0.015, z: cz - Math.sin(a) * 0.27, ry: a });
  }
  // A mug, a plate now and then, and sometimes a candle.
  tankard(k, m, cx + 0.14, 0.55, cz - 0.08, c.rnd() * TAU);
  if (c.rnd() < 0.45) plate(k, cx - 0.04, 0.55, cz - 0.17, c.rnd);
  if (c.rnd() < 0.5) candle(c, k, m, cx - 0.12, 0.55, cz + 0.12);
};
P['2'] = (c, k, m) => {
  const ax = c.at(1, 0) === '2' || c.at(-1, 0) === '2' ? 'x' : 'z';
  const ry = ax === 'x' ? 0 : Math.PI / 2;
  const at = L(c.cx, c.cz, ry);
  const nb = (s) => c.at(Math.round(Math.cos(ry) * s), Math.round(-Math.sin(ry) * s)) === '2';
  const prev = nb(-1), next = nb(1);
  // three boards along the run, a breadboard at an open end
  for (const [i, lz] of [[0, -0.235], [1, 0], [2, 0.235]]) k.box(1.02, 0.06, 0.225, i === 1 ? WOOD_L : '#83603d', { ...at(0, lz), y: 0.5, ry, vary: 0.06 });
  for (const [has, s] of [[!prev, -1], [!next, 1]]) if (has) k.box(0.07, 0.065, 0.72, WOOD, { ...at(s * 0.475, 0), y: 0.5, ry });
  // aprons under the top, and a low stretcher down the middle
  for (const s of [-1, 1]) k.box(1.0, 0.08, 0.03, WOOD_D, { ...at(0, s * 0.29), y: 0.43, ry });
  k.box(1.0, 0.05, 0.05, WOOD_D, { ...at(0, 0), y: 0.12, ry });
  // legs at the ends of the run, and a pair under every other middle square
  let idx = 0; for (let i = 1; i < 30 && c.at(Math.round(Math.cos(ry) * -i), Math.round(-Math.sin(ry) * -i)) === '2'; i++) idx = i;
  const legsAt = [];
  if (!prev) legsAt.push(-0.42);
  if (!next) legsAt.push(0.42);
  if (prev && next && idx % 2 === 1) legsAt.push(0);
  for (const lx of legsAt) {
    for (const s of [-1, 1]) {
      const p = at(lx, s * 0.27);
      k.cyl(0.028, 0.04, 0.44, WOOD_D, { ...p, y: 0.22, seg: 6 });
      k.box(0.075, 0.08, 0.075, WOOD, { ...p, y: 0.36, ry });
      k.box(0.07, 0.04, 0.07, WOOD_DD, { ...p, y: 0.02, ry });
    }
    k.box(0.05, 0.05, 0.54, WOOD_D, { ...at(lx, 0), y: 0.12, ry }); // cross stretcher
    if (lx) k.box(0.03, 0.08, 0.6, WOOD_D, { ...at(lx, 0), y: 0.43, ry }); // end apron
  }
  // dressing: a plate, a tankard, now and then a candle
  { const p = at(-0.15 + c.rnd() * 0.3, -0.12); plate(k, p.x, 0.53, p.z, c.rnd); }
  if (c.rnd() < 0.5) { const p = at(0.25, 0.14); tankard(k, m, p.x, 0.53, p.z, c.rnd() * TAU); }
  if (c.rnd() < 0.25) { const p = at(-0.3, 0.16); candle(c, k, m, p.x, 0.53, p.z, 0.12); }
};
P['1'] = (c, k) => {
  // Faces the nearest table.
  let ry = c.rnd() * Math.PI * 2;
  for (const [dx, dy, a] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]]) {
    const n = c.at(dx, dy);
    if (n === 't' || n === '2' || n === '3') { ry = a; break; }
  }
  const at = L(c.cx, c.cz, ry);
  const SY = 0.3;
  k.box(0.38, 0.045, 0.36, WOOD, { ...at(0, 0.01), y: SY, ry, vary: 0.06 });
  k.box(0.36, 0.05, 0.02, WOOD_D, { ...at(0, 0.19), y: SY - 0.04, ry }); // front rail
  // front legs, and back legs that run on up into the back posts
  for (const s of [-1, 1]) {
    k.box(0.045, SY, 0.045, WOOD_D, { ...at(s * 0.155, 0.16), y: SY / 2, ry });
    k.box(0.05, 0.84, 0.05, WOOD_D, { ...at(s * 0.155, -0.16), y: 0.42, ry });
    k.ball(0.032, WOOD, { ...at(s * 0.155, -0.175), y: 0.86, detail: 0 }); // finial
    k.box(0.03, 0.03, 0.3, WOOD_D, { ...at(s * 0.155, 0), y: 0.1, ry }); // side stretcher
  }
  k.box(0.32, 0.08, 0.035, WOOD, { ...at(0, -0.168), y: 0.76, ry, vary: 0.05 }); // top rail
  k.box(0.32, 0.04, 0.03, WOOD, { ...at(0, -0.164), y: 0.5, ry });
  for (const s of [-0.075, 0, 0.075]) k.box(0.045, 0.22, 0.02, WOOD_L, { ...at(s, -0.165), y: 0.63, ry, vary: 0.06 }); // slats
  if (c.rnd() < 0.3) k.box(0.3, 0.035, 0.28, ['#6a2f3a', '#2f4a6a', '#5a4a2a'][Math.floor(c.rnd() * 3)], { ...at(0, 0.02), y: SY + 0.04, ry, vary: 0.06 }); // cushion
};
P['3'] = (c, k, m) => {
  // A panelled bar counter: plinth, panelled front, an overhanging top with a
  // brass foot rail, and bottles and tankards on it.
  const ax = c.at(0, 1) === '3' || c.at(0, -1) === '3' ? 'z' : 'x';
  const ry = ax === 'x' ? (isWallChar(c.at(0, 1)) ? Math.PI : 0) : (isWallChar(c.at(1, 0)) ? -Math.PI / 2 : Math.PI / 2);
  const at = L(c.cx, c.cz, ry);
  const nb = (s) => c.at(Math.round(Math.cos(ry) * s), Math.round(-Math.sin(ry) * s)) === '3';
  k.box(1.01, 0.08, 0.5, WOOD_DD, { ...at(0, -0.02), y: 0.04, ry });
  k.box(1.01, 0.56, 0.54, WOOD_D, { ...at(0, 0), y: 0.36, ry, vary: 0.04 });
  for (const f of [1, -1]) {
    for (const lx of [-0.25, 0.25]) k.box(0.38, 0.36, 0.02, WOOD, { ...at(lx, f * 0.275), y: 0.36, ry, vary: 0.06 });
    for (const lx of [-0.48, 0, 0.48]) k.box(0.05, 0.5, 0.03, WOOD_DD, { ...at(lx, f * 0.28), y: 0.36, ry });
  }
  for (const [has, s] of [[!nb(-1), -1], [!nb(1), 1]]) if (has) k.box(0.02, 0.36, 0.4, WOOD, { ...at(s * 0.51, 0), y: 0.36, ry });
  k.box(1.04, 0.06, 0.72, WOOD_L, { ...at(0, 0.03), y: 0.67, ry, vary: 0.04 });
  k.box(1.04, 0.035, 0.04, WOOD, { ...at(0, 0.38), y: 0.645, ry }); // bevelled lip
  // brass foot rail on brackets along the front
  const r0 = at(-0.5, 0.36), r1 = at(0.5, 0.36);
  m.limb([r0.x, 0.13, r0.z], [r1.x, 0.13, r1.z], 0.017, 0.017, BRASS, { seg: 6, joint: false });
  m.box(0.03, 0.05, 0.1, BRASS, { ...at(0, 0.31), y: 0.12, ry });
  // Bottles of a few shapes, and a tankard.
  const n = 1 + Math.floor(c.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const col = ['#3f6b3f', '#6b2f2f', '#8a6a2a', '#4a4a7a', '#2f4a3a'][Math.floor(c.rnd() * 5)];
    const p = at(-0.38 + (i + c.rnd() * 0.6) * (0.76 / n), -0.12 + c.rnd() * 0.18);
    const squat = c.rnd() < 0.35, bh = squat ? 0.09 : 0.15;
    k.cyl(squat ? 0.055 : 0.038, squat ? 0.06 : 0.042, bh, col, { ...p, y: 0.7 + bh / 2, seg: 6, vary: 0.1 });
    k.cyl(0.014, squat ? 0.03 : 0.022, 0.07, col, { ...p, y: 0.7 + bh + 0.035, seg: 5 });
    k.cyl(0.016, 0.016, 0.02, '#b89a6a', { ...p, y: 0.7 + bh + 0.08, seg: 5 }); // cork
  }
  if (c.rnd() < 0.5) { const p = at(0.3, 0.2); tankard(k, m, p.x, 0.7, p.z, c.rnd() * TAU); }
  if (c.rnd() < 0.3) k.box(0.14, 0.012, 0.09, '#cfc6b0', { ...at(-0.2, 0.22), y: 0.706, ry: ry + c.rnd(), vary: 0.05 }); // a rag
};
P.E = (c, k) => {
  // A wooden bed: posts, head- and footboard, mattress, a turned-down blanket and a pillow.
  const ax = c.at(0, 1) === 'E' || c.at(0, -1) === 'E' ? 'z' : 'x';
  let ry = ax === 'x' ? 0 : -Math.PI / 2; // head at local -x
  const headDir = ax === 'x' ? [-1, 0] : [0, -1];
  if (!isWallChar(c.at(...headDir)) && isWallChar(c.at(-headDir[0], -headDir[1]))) ry += Math.PI;
  const at = L(c.cx, c.cz, ry);
  const blanket = ['#6a2f3a', '#2f4a6a', '#4a5a2f', '#6a5a2f'][Math.floor(c.rnd() * 4)];
  for (const [lx, hh] of [[-0.44, 0.62], [0.44, 0.44]]) {
    for (const s of [-1, 1]) {
      k.box(0.065, hh, 0.065, WOOD_D, { ...at(lx, s * 0.32), y: hh / 2, ry });
    }
    k.box(0.04, hh - 0.2, 0.6, WOOD, { ...at(lx, 0), y: 0.18 + (hh - 0.24) / 2, ry, vary: 0.05 }); // board
  }
  for (const s of [-1, 1]) k.box(0.84, 0.1, 0.04, WOOD_D, { ...at(0, s * 0.32), y: 0.2, ry }); // side rails
  k.box(0.84, 0.12, 0.6, '#d8cfb8', { ...at(0, 0), y: 0.3, ry, vary: 0.04 });
  k.box(0.56, 0.05, 0.64, blanket, { ...at(0.13, 0), y: 0.375, ry, vary: 0.06 });
  for (const s of [-1, 1]) k.box(0.56, 0.12, 0.02, blanket, { ...at(0.13, s * 0.325), y: 0.32, ry, vary: 0.06 }); // hanging over the sides
  k.box(0.09, 0.06, 0.645, '#ece4d0', { ...at(-0.17, 0), y: 0.38, ry, vary: 0.03 }); // turned-down sheet
  k.sphere(0.2, '#ece4d0', { ...at(-0.31, 0), y: 0.39, sx: 0.4, sy: 0.22, sz: 1.2, ry, seg: 6, vary: 0.04 }); // pillow
};
P.F = (c, k) => {
  // A bookcase against the wall: back, sides, shelves, crown and plinth, and
  // rows of books of all heights, a few leaning, some laid flat in stacks.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const push = f ? 0.25 : 0;
  const at = L(c.cx + (f ? f.dx * push : 0), c.cz + (f ? f.dy * push : 0), ry);
  const H = 1.5, D = 0.4;
  k.box(0.92, H - 0.1, 0.03, WOOD_DD, { ...at(0, -D / 2 + 0.02), y: H / 2, ry });
  for (const s of [-1, 1]) k.box(0.05, H, D, WOOD_D, { ...at(s * 0.46, 0), y: H / 2, ry, vary: 0.05 });
  k.box(1.0, 0.06, D + 0.05, WOOD, { ...at(0, 0.02), y: H + 0.03, ry });
  k.box(0.96, 0.035, D + 0.02, WOOD_D, { ...at(0, 0.01), y: H - 0.02, ry });
  k.box(0.96, 0.1, D, WOOD_DD, { ...at(0, 0.005), y: 0.05, ry });
  const BOOK = ['#6b2f2f', '#2f4a6b', '#3f6b3f', '#8a6a2a', '#5a3a6b', '#7a5a3a', '#2a2a2a'];
  const rows = [0.1, 0.46, 0.82, 1.18];
  rows.forEach((sy, ri) => {
    if (ri) k.box(0.87, 0.03, D - 0.04, WOOD_D, { ...at(0, 0), y: sy - 0.015, ry });
    let x = -0.42;
    while (x < 0.4) {
      const r = c.rnd();
      if (r < 0.07) { x += 0.05 + c.rnd() * 0.05; continue; } // a gap
      if (r < 0.13 && x < 0.2) { // a stack lying flat
        const nn = 2 + Math.floor(c.rnd() * 2);
        for (let i = 0; i < nn; i++) k.box(0.17 - i * 0.015, 0.035, 0.22 - i * 0.01, BOOK[Math.floor(c.rnd() * BOOK.length)], { ...at(x + 0.09, 0.02), y: sy + 0.018 + i * 0.036, ry: ry + (c.rnd() - 0.5) * 0.3, vary: 0.1 });
        x += 0.2; continue;
      }
      const w = 0.035 + c.rnd() * 0.04, h = 0.19 + c.rnd() * 0.11;
      if (x + w > 0.42) break;
      const lean = c.rnd() < 0.08 ? 0.25 : 0;
      k.box(w, h, 0.22 + c.rnd() * 0.04, BOOK[Math.floor(c.rnd() * BOOK.length)], { ...at(x + w / 2 + lean * 0.08, 0.02), y: sy + h / 2, ry, rz: -lean, vary: 0.12 });
      if (c.rnd() < 0.2) k.box(w + 0.004, 0.012, 0.006, GOLD, { ...at(x + w / 2, 0.15), y: sy + h * 0.75, ry }); // gilt band
      x += w + 0.004 + lean * 0.12;
    }
  });
};
P.R = (c, k, m) => {
  // A weapon rack: footed posts, rails, and a mix of swords, spears and axes.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx + (f ? f.dx * 0.2 : 0), c.cz + (f ? f.dy * 0.2 : 0), ry);
  for (const s of [-0.42, 0.42]) {
    k.box(0.07, 1.05, 0.07, WOOD, { ...at(s, 0), y: 0.525, ry, vary: 0.05 });
    k.box(0.09, 0.06, 0.36, WOOD_D, { ...at(s, 0), y: 0.03, ry });
    k.cone(0.05, 0.06, WOOD_D, { ...at(s, 0), y: 1.08, seg: 4, ry: ry + Math.PI / 4 });
  }
  k.box(0.9, 0.07, 0.08, WOOD_D, { ...at(0, 0), y: 0.98, ry });
  k.box(0.9, 0.06, 0.16, WOOD_D, { ...at(0, 0), y: 0.16, ry });
  k.box(0.9, 0.04, 0.05, WOOD, { ...at(0, 0.03), y: 0.62, ry });
  for (let i = 0; i < 4; i++) {
    const lx = -0.27 + i * 0.18, p = at(lx, (c.rnd() - 0.5) * 0.03), kind = c.rnd();
    if (kind < 0.45) { // a sword, point down
      m.box(0.045, 0.62, 0.012, '#a8aeb5', { ...p, y: 0.5, ry, vary: 0.06 });
      m.box(0.16, 0.025, 0.035, BRASS, { ...p, y: 0.83, ry });
      k.box(0.03, 0.13, 0.03, '#3a2618', { ...p, y: 0.91, ry });
      m.ball(0.026, BRASS, { ...p, y: 0.99, detail: 0 });
    } else if (kind < 0.75) { // a spear
      k.cyl(0.015, 0.017, 1.15, WOOD_L, { ...p, y: 0.6, seg: 5 });
      m.cone(0.035, 0.17, '#a8aeb5', { ...p, y: 1.26, seg: 4, ry });
      m.cyl(0.02, 0.02, 0.04, IRON, { ...p, y: 1.17, seg: 5 });
    } else { // an axe, head up
      k.cyl(0.018, 0.02, 0.85, WOOD_L, { ...p, y: 0.47, seg: 5 });
      const h = at(lx + 0.06, 0);
      m.box(0.12, 0.13, 0.016, '#9aa0a8', { ...h, y: 0.82, ry });
      m.box(0.03, 0.17, 0.018, '#c0c6cc', { ...at(lx + 0.12, 0), y: 0.82, ry }); // bright edge
    }
  }
};
P.J = (c, k, m) => {
  // A throne facing the room: a stepped back (plain), padded seat and back,
  // arms with gilt caps and scrolled fronts, on a low stone step.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : Math.PI;
  const at = L(c.cx + (f ? f.dx * 0.06 : 0), c.cz + (f ? f.dy * 0.06 : 0), ry);
  const RED = '#6a2828', PAD = '#8a2a30';
  k.box(0.9, 0.08, 0.84, STONE_D, { ...at(0, 0), y: 0.04, ry, vary: 0.04 });
  k.box(0.7, 0.34, 0.58, '#5a2a2a', { ...at(0, 0.03), y: 0.25, ry });
  m.box(0.72, 0.03, 0.02, GOLD, { ...at(0, 0.33), y: 0.41, ry });
  k.box(0.56, 0.08, 0.5, PAD, { ...at(0, 0.05), y: 0.46, ry, vary: 0.05 });
  k.box(0.7, 1.15, 0.12, RED, { ...at(0, -0.26), y: 0.96, ry });
  k.box(0.5, 0.78, 0.04, PAD, { ...at(0, -0.185), y: 0.92, ry, vary: 0.04 });
  k.box(0.52, 0.12, 0.13, RED, { ...at(0, -0.26), y: 1.6, ry });
  k.box(0.3, 0.1, 0.13, RED, { ...at(0, -0.26), y: 1.71, ry });
  m.box(0.72, 0.03, 0.14, GOLD, { ...at(0, -0.26), y: 1.54, ry });
  m.box(0.32, 0.025, 0.15, GOLD, { ...at(0, -0.26), y: 1.77, ry });
  for (const s of [-1, 1]) {
    m.ball(0.05, GOLD, { ...at(s * 0.33, -0.26), y: 1.59, detail: 0 });
    k.box(0.09, 0.24, 0.56, RED, { ...at(s * 0.36, 0.02), y: 0.54, ry });
    m.box(0.11, 0.03, 0.58, GOLD, { ...at(s * 0.36, 0.02), y: 0.67, ry });
    m.cyl(0.055, 0.055, 0.11, GOLD, { ...at(s * 0.36, 0.3), y: 0.6, rz: Math.PI / 2, ry, seg: 8 });
    for (const lz of [-0.24, 0.28]) m.ball(0.045, GOLD, { ...at(s * 0.31, lz), y: 0.11, detail: 0 }); // feet
  }
};
P[')'] = (c, k, m) => {
  // A two-axle cart: plank bed with sides and stakes, spoked wheels, shafts out front, and a load.
  const { cx, cz } = c;
  k.box(0.85, 0.06, 0.6, WOOD, { x: cx, y: 0.4, z: cz, vary: 0.05 });
  for (const s of [-1, 1]) {
    k.box(0.86, 0.16, 0.035, WOOD_L, { x: cx, y: 0.51, z: cz + s * 0.3, vary: 0.06 });
    k.box(0.035, 0.16, 0.6, WOOD_L, { x: cx + s * 0.425, y: 0.51, z: cz, vary: 0.06 });
    for (const t of [-1, 1]) k.box(0.045, 0.26, 0.045, WOOD_D, { x: cx + t * 0.41, y: 0.5, z: cz + s * 0.29 });
  }
  for (const wx of [-0.25, 0.25]) {
    k.box(0.05, 0.05, 0.76, WOOD_D, { x: cx + wx, y: 0.22, z: cz });
    for (const s of [-1, 1]) {
      const z = cz + s * 0.35;
      k.torus(0.19, 0.03, WOOD_D, { x: cx + wx, y: 0.22, z, rseg: 4, tseg: 12 });
      m.torus(0.215, 0.01, IRON, { x: cx + wx, y: 0.22, z, rseg: 3, tseg: 12 });
      k.cyl(0.05, 0.05, 0.09, WOOD, { x: cx + wx, y: 0.22, z, rx: Math.PI / 2, seg: 6 });
      for (let i = 0; i < 3; i++) k.box(0.022, 0.36, 0.02, WOOD, { x: cx + wx, y: 0.22, z, rz: i * Math.PI / 3 });
    }
  }
  for (const s of [-1, 1]) k.limb([cx + 0.42, 0.36, cz + s * 0.2], [cx + 0.95, 0.12, cz + s * 0.12], 0.025, 0.02, WOOD_D, { seg: 5, joint: false });
  k.box(0.04, 0.04, 0.26, WOOD_D, { x: cx + 0.9, y: 0.14, z: cz });
  const load = c.rnd();
  if (load < 0.35) for (let i = 0; i < 2; i++) sack(k, cx - 0.18 + i * 0.3, 0.43, cz + (c.rnd() - 0.5) * 0.15, 0.8, c.rnd);
  else if (load < 0.65) crate(k, cx - 0.1, 0.43, cz, 0.36, c.rnd() * 0.4);
  else if (load < 0.85) k.rock(0.3, '#c8b060', { x: cx, y: 0.52, z: cz, sx: 1.2, sz: 0.85, flat: 0.45, vary: 0.08 }); // hay
};

/* ---------------- objects ---------------- */
// A crate: boards, top and bottom bands, corner posts and a diagonal brace on two sides.
function crate(k, x, y, z, s, ry) {
  const at = L(x, z, ry);
  k.box(s * 0.96, s * 0.96, s * 0.96, '#8a6440', { x, y: y + s / 2, z, ry, vary: 0.08 });
  for (const yy of [0.1, 0.9]) k.box(s * 1.01, s * 0.12, s * 1.01, WOOD_D, { x, y: y + s * yy, z, ry, vary: 0.05 });
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(s * 0.12, s, s * 0.12, WOOD_D, { ...at(a * s * 0.45, b * s * 0.45), y: y + s / 2, ry });
  for (const f of [0, 2]) {
    const fr = ry + f * Math.PI / 2, p = L(x, z, fr)(0, s * 0.49);
    k.box(s * 1.0, s * 0.1, s * 0.03, WOOD_D, { ...p, y: y + s / 2, ry: fr, rz: Math.PI / 4 * (f ? 1 : -1) });
  }
}
function sack(k, x, y, z, s, rnd) {
  const col = ['#b8a07a', '#a89070', '#c0aa84'][Math.floor(rnd() * 3)];
  const lean = (rnd() - 0.5) * 0.3;
  k.sphere(0.25 * s, col, { x, y: y + 0.17 * s, z, sy: 0.7, sx: 1.08 + (rnd() - 0.5) * 0.15, sz: 0.92, ry: rnd() * 3, seg: 8, vary: 0.06 });
  k.sphere(0.2 * s, col, { x: x + lean * 0.1 * s, y: y + 0.27 * s, z, sy: 0.65, seg: 7, vary: 0.06 }); // the slumped top
  k.cyl(0.04 * s, 0.07 * s, 0.07 * s, col, { x: x + lean * 0.2 * s, y: y + 0.44 * s, z, rz: lean, seg: 6 });
  k.cyl(0.046 * s, 0.046 * s, 0.025 * s, ROPE, { x: x + lean * 0.22 * s, y: y + 0.46 * s, z, rz: lean, seg: 6 });
  k.cone(0.06 * s, 0.05 * s, col, { x: x + lean * 0.25 * s, y: y + 0.5 * s, z, rz: lean + Math.PI, seg: 5 }); // the tuft
}
P.B = (c, k) => crate(k, c.cx, 0, c.cz, 0.56, c.rnd() * 0.6);
P['['] = (c, k) => {
  crate(k, c.cx - 0.18, 0, c.cz - 0.12, 0.5, 0.1);
  crate(k, c.cx + 0.2, 0, c.cz + 0.15, 0.46, 0.5);
  crate(k, c.cx, 0.5, c.cz, 0.42, 0.3);
};
P.b = (c, k, m) => {
  const n = c.rnd() < 0.3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = c.cx + (n > 1 ? (i ? 0.2 : -0.18) : 0), z = c.cz + (n > 1 ? (i ? 0.16 : -0.14) : 0);
    const col = ['#7a5432', '#6e4a2c', '#83603a'][Math.floor(c.rnd() * 3)];
    // a bellied barrel: narrow ends, wide middle
    k.cyl(0.255, 0.225, 0.2, col, { x, y: 0.1, z, seg: 10, vary: 0.05 });
    k.cyl(0.27, 0.27, 0.22, col, { x, y: 0.31, z, seg: 10, vary: 0.05, open: true });
    k.cyl(0.225, 0.255, 0.2, col, { x, y: 0.52, z, seg: 10, vary: 0.05 });
    k.cyl(0.2, 0.2, 0.012, '#5a3e24', { x, y: 0.626, z, seg: 10 }); // lid
    k.box(0.38, 0.006, 0.012, '#3e2a18', { x, y: 0.633, z, ry: c.rnd() }); // board seam
    for (const [yy, r] of [[0.06, 0.235], [0.2, 0.262], [0.42, 0.262], [0.56, 0.235]]) m.cyl(r + 0.008, r + 0.008, 0.035, IRON, { x, y: yy, z, seg: 10, open: true });
    if (c.rnd() < 0.4) { const a = c.rnd() * TAU; k.cyl(0.03, 0.03, 0.06, WOOD_D, { x: x + Math.cos(a) * 0.28, y: 0.25, z: z + Math.sin(a) * 0.28, rz: Math.PI / 2, ry: -a, seg: 5 }); } // a tap
  }
};
P.C = (c, k, m) => {
  // A chest with a rounded lid, iron straps over it, corner brackets, a lock
  // plate and side handles; turned a little, and toward the room by a wall.
  const f = facingFromWalls(c);
  const ry = (f ? f.ry : 0) + (c.rnd() - 0.5) * 0.3;
  const at = L(c.cx, c.cz, ry);
  k.box(0.62, 0.36, 0.42, '#6b4228', { x: c.cx, y: 0.18, z: c.cz, ry, vary: 0.06 });
  k.cyl(0.21, 0.21, 0.62, '#7a4c2e', { x: c.cx, y: 0.36, z: c.cz, rz: Math.PI / 2, ry, seg: 8, arc: Math.PI, vary: 0.05 });
  m.box(0.65, 0.04, 0.45, GOLD, { x: c.cx, y: 0.355, z: c.cz, ry });
  m.box(0.65, 0.04, 0.45, IRON, { x: c.cx, y: 0.02, z: c.cz, ry });
  for (const s of [-0.2, 0.2]) {
    m.box(0.05, 0.36, 0.44, IRON, { ...at(s, 0), y: 0.18, ry });
    m.cyl(0.218, 0.218, 0.05, IRON, { ...at(s, 0), y: 0.36, rz: Math.PI / 2, ry, seg: 8, arc: Math.PI, open: true });
  }
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.box(0.05, 0.08, 0.05, GOLD, { ...at(a * 0.3, b * 0.2), y: 0.3, ry });
  m.box(0.1, 0.13, 0.03, GOLD, { ...at(0, 0.215), y: 0.34, ry });
  k.box(0.02, 0.04, 0.035, '#120e0a', { ...at(0, 0.22), y: 0.32, ry }); // keyhole
  for (const s of [-1, 1]) m.torus(0.04, 0.008, IRON, { ...at(s * 0.32, 0), y: 0.24, ry: ry + Math.PI / 2, rseg: 3, tseg: 8 });
};
P.$ = (c, k, m) => {
  // A hoard: a heap of coin, coins spilled round it, stacks, a bar or two, gems and a goblet.
  for (let i = 0; i < 14; i++) {
    const a = c.rnd() * Math.PI * 2, r = 0.15 + c.rnd() * 0.25;
    m.cyl(0.05, 0.05, 0.015, GOLD, { x: c.cx + Math.cos(a) * r, y: 0.01 + c.rnd() * 0.04, z: c.cz + Math.sin(a) * r, rx: (c.rnd() - 0.5) * 0.5, rz: (c.rnd() - 0.5) * 0.5, seg: 7, vary: 0.1 });
  }
  m.cone(0.24, 0.2, '#c89a3a', { x: c.cx, y: 0.1, z: c.cz, seg: 9 });
  m.rock(0.16, GOLD, { x: c.cx - 0.04, y: 0.13, z: c.cz + 0.03, flat: 0.7, vary: 0.1 });
  for (let i = 0; i < 2; i++) { // coin stacks
    const x = c.cx - 0.25 + i * 0.45, z = c.cz + 0.22 - i * 0.4, n = 3 + Math.floor(c.rnd() * 4);
    for (let j = 0; j < n; j++) m.cyl(0.045, 0.045, 0.018, GOLD, { x: x + (c.rnd() - 0.5) * 0.01, y: 0.01 + j * 0.02, z, seg: 7, vary: 0.08 });
  }
  if (c.rnd() < 0.6) m.box(0.16, 0.05, 0.07, '#e0b84a', { x: c.cx + 0.22, y: 0.025, z: c.cz + 0.12, ry: c.rnd() }); // a bar
  const gems = ['#c83a5a', '#3a8ac8', '#3ac87a', '#a03ac8'];
  for (let i = 0; i < 3; i++) k.ball(0.04 + c.rnd() * 0.025, gems[Math.floor(c.rnd() * 4)], { x: c.cx + (c.rnd() - 0.5) * 0.4, y: 0.08 + c.rnd() * 0.12, z: c.cz + (c.rnd() - 0.5) * 0.3, detail: 0 });
  if (c.rnd() < 0.5) { // a goblet, set down beside the heap
    const x = c.cx - 0.24, z = c.cz - 0.16;
    m.cyl(0.04, 0.045, 0.012, GOLD, { x, y: 0.006, z, seg: 7 });
    m.cyl(0.012, 0.012, 0.08, GOLD, { x, y: 0.05, z, seg: 5 });
    m.cyl(0.05, 0.02, 0.07, GOLD, { x, y: 0.12, z, seg: 7 });
  }
  c.emit({ kind: 'sparkle', x: c.cx, y: 0.25, z: c.cz, color: '#ffe08a' });
};
P['!'] = (c, k) => {
  sack(k, c.cx, 0, c.cz, 1, c.rnd);
  if (c.rnd() < 0.4) sack(k, c.cx + 0.22, 0, c.cz + 0.2, 0.7, c.rnd);
};
P.r = (c, k) => {
  for (let i = 0; i < 6; i++) k.rock(0.08 + c.rnd() * 0.12, i % 2 ? STONE : STONE_D, { x: c.x0 + 0.15 + c.rnd() * 0.7, y: 0.05, z: c.z0 + 0.15 + c.rnd() * 0.7, flat: 0.6, vary: 0.08 });
  // broken dressed blocks among the stones, and grit
  for (let i = 0; i < 2; i++) k.box(0.18 + c.rnd() * 0.1, 0.12, 0.14, STONE_L, { x: c.x0 + 0.2 + c.rnd() * 0.6, y: 0.05, z: c.z0 + 0.2 + c.rnd() * 0.6, ry: c.rnd() * Math.PI, rx: (c.rnd() - 0.5) * 0.5, rz: (c.rnd() - 0.5) * 0.4, vary: 0.08 });
  for (let i = 0; i < 5; i++) k.rock(0.025 + c.rnd() * 0.02, STONE_D, { x: c.x0 + 0.1 + c.rnd() * 0.8, y: 0.01, z: c.z0 + 0.1 + c.rnd() * 0.8, flat: 0.6 });
};

/* ---------------- light ---------------- */
P.c = (c, k, m, g) => {
  // A ring of stones, an ash bed, crossed logs and a little teepee of sticks over glowing coals.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + c.rnd() * 0.2;
    k.rock(0.085 + c.rnd() * 0.03, i % 2 ? STONE : STONE_D, { x: c.cx + Math.cos(a) * 0.32, y: 0.06, z: c.cz + Math.sin(a) * 0.32, flat: 0.7, vary: 0.08 });
  }
  k.cyl(0.26, 0.28, 0.02, '#2a2622', { x: c.cx, y: 0.01, z: c.cz, seg: 9 });
  for (let i = 0; i < 3; i++) k.cyl(0.04, 0.05, 0.5, WOOD_D, { x: c.cx, y: 0.06, z: c.cz, rz: Math.PI / 2, ry: (i / 3) * Math.PI, seg: 6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    k.limb([c.cx + Math.cos(a) * 0.2, 0.04, c.cz + Math.sin(a) * 0.2], [c.cx + Math.cos(a) * 0.03, 0.3, c.cz + Math.sin(a) * 0.03], 0.022, 0.012, '#3a2a1c', { seg: 4, joint: false });
  }
  for (let i = 0; i < 5; i++) g.box(0.05, 0.03, 0.05, i % 2 ? '#ff6a20' : '#ffa040', { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.03, z: c.cz + (c.rnd() - 0.5) * 0.3, ry: c.rnd() });
  c.emit({ kind: 'fire', x: c.cx, y: 0.12, z: c.cz, size: 1, light: { color: '#ff9a40', intensity: 9, distance: 8 } });
};
P.G = (c, k, m, g) => {
  // An iron brazier: three legs with clawed feet, a bowl with a rolled rim, coals.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    m.limb([c.cx + Math.cos(a) * 0.14, 0.68, c.cz + Math.sin(a) * 0.14], [c.cx + Math.cos(a) * 0.26, 0.03, c.cz + Math.sin(a) * 0.26], 0.026, 0.02, IRON, { seg: 5, joint: false });
    m.box(0.08, 0.04, 0.06, IRON, { x: c.cx + Math.cos(a) * 0.29, y: 0.02, z: c.cz + Math.sin(a) * 0.29, ry: -a });
  }
  m.torus(0.17, 0.02, IRON, { x: c.cx, y: 0.36, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 12 }); // stiffening ring
  m.cyl(0.28, 0.14, 0.18, '#3a3a3f', { x: c.cx, y: 0.74, z: c.cz, seg: 10 });
  m.torus(0.28, 0.025, '#4a4a50', { x: c.cx, y: 0.83, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 14 });
  g.cyl(0.25, 0.25, 0.02, '#ff7a2a', { x: c.cx, y: 0.815, z: c.cz, seg: 10 });
  for (let i = 0; i < 5; i++) k.rock(0.05, '#1e1a18', { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.83, z: c.cz + (c.rnd() - 0.5) * 0.3, flat: 0.6 });
  c.emit({ kind: 'fire', x: c.cx, y: 0.82, z: c.cz, size: 0.8, light: { color: '#ffa04a', intensity: 7, distance: 7 } });
};
P.I = (c, k, m) => {
  const f = facingFromWalls(c);
  if (!f) {
    // No wall to hang on: a torch on an iron stand.
    m.cyl(0.025, 0.03, 1.15, IRON, { x: c.cx, y: 0.575, z: c.cz, seg: 6 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; m.limb([c.cx, 0.14, c.cz], [c.cx + Math.cos(a) * 0.2, 0.01, c.cz + Math.sin(a) * 0.2], 0.018, 0.014, IRON, { seg: 4 }); }
    m.cyl(0.04, 0.04, 0.03, IRON, { x: c.cx, y: 0.6, z: c.cz, seg: 6 });
    m.cyl(0.065, 0.035, 0.1, IRON, { x: c.cx, y: 1.18, z: c.cz, seg: 8 });
    m.torus(0.065, 0.01, IRON, { x: c.cx, y: 1.23, z: c.cz, rx: Math.PI / 2, rseg: 3, tseg: 8 });
    k.cyl(0.05, 0.04, 0.06, '#4a3a2a', { x: c.cx, y: 1.25, z: c.cz, seg: 6 });
    c.emit({ kind: 'fire', x: c.cx, y: 1.3, z: c.cz, size: 0.45, light: { color: '#ffa04a', intensity: 4.5, distance: 6 } });
    return;
  }
  const dx = f.dx, dy = f.dy;
  const x = c.cx + dx * 0.42, z = c.cz + dy * 0.42;
  const ry = dx ? Math.PI / 2 : 0;
  // a plate on the wall, an arm out of it, a ring holding the torch
  m.box(dx ? 0.02 : 0.1, 0.18, dx ? 0.1 : 0.02, IRON, { x: x + dx * 0.05, y: 0.95, z: z + dy * 0.05 });
  for (const yy of [0.88, 1.02]) m.box(dx ? 0.03 : 0.02, 0.02, dx ? 0.02 : 0.03, IRON_L, { x: x + dx * 0.04, y: yy, z: z + dy * 0.04 });
  m.box(0.04, 0.04, 0.22, IRON, { x: x - dx * 0.06, y: 0.95, z: z - dy * 0.06, ry });
  m.torus(0.04, 0.01, IRON, { x: x - dx * 0.16, y: 1.0, z: z - dy * 0.16, rx: Math.PI / 2, rseg: 3, tseg: 8 });
  k.cyl(0.035, 0.025, 0.34, WOOD_D, { x: x - dx * 0.16, y: 1.05, z: z - dy * 0.16, rx: -dy * 0.35, rz: dx * 0.35, seg: 6 });
  k.cyl(0.045, 0.04, 0.08, '#4a3a2a', { x: x - dx * 0.2, y: 1.19, z: z - dy * 0.2, rx: -dy * 0.35, rz: dx * 0.35, seg: 6 }); // pitch-soaked wrap
  c.emit({ kind: 'fire', x: x - dx * 0.22, y: 1.25, z: z - dy * 0.22, size: 0.45, light: { color: '#ffa04a', intensity: 4.5, distance: 6 } });
};
P['4'] = (c, k, m, g) => {
  // A forge: a hearth of laid stone with a raised rim round a bed of coals,
  // and a tapering chimney hood.
  const { cx, cz } = c;
  for (let i = 0; i < 3; i++) k.box(0.95 - (i === 2 ? 0 : 0.02), 0.19, 0.85 - (i === 2 ? 0 : 0.02), i % 2 ? STONE_D : '#545049', { x: cx, y: 0.1 + i * 0.19, z: cz, vary: 0.06 });
  for (const s of [-1, 1]) {
    k.box(0.97, 0.08, 0.1, STONE, { x: cx, y: 0.62, z: cz + s * 0.38, vary: 0.06 });
    k.box(0.1, 0.08, 0.66, STONE, { x: cx + s * 0.43, y: 0.62, z: cz, vary: 0.06 });
  }
  k.box(0.7, 0.03, 0.6, '#2a1a12', { x: cx, y: 0.6, z: cz });
  g.box(0.6, 0.03, 0.46, '#ff6a20', { x: cx, y: 0.615, z: cz });
  for (let i = 0; i < 6; i++) k.rock(0.06, '#1e1a18', { x: cx + (c.rnd() - 0.5) * 0.5, y: 0.64, z: cz + (c.rnd() - 0.5) * 0.36, flat: 0.5 });
  k.box(0.8, 0.1, 0.06, '#2a1a12', { x: cx, y: 0.3, z: cz - 0.42 }); // ash door
  // chimney hood: a stone frustum and a stack
  k.cyl(0.18, 0.32, 0.4, STONE, { x: cx, y: 0.86, z: cz + 0.25, seg: 4, ry: Math.PI / 4, vary: 0.05 });
  k.box(0.28, 0.8, 0.28, STONE, { x: cx, y: 1.45, z: cz + 0.25, vary: 0.05 });
  k.box(0.34, 0.06, 0.34, STONE_D, { x: cx, y: 1.86, z: cz + 0.25 });
  c.emit({ kind: 'ember', x: c.cx, y: 0.7, z: c.cz, light: { color: '#ff6a2a', intensity: 7, distance: 7 } });
};
P.K = (c, k, m, g) => {
  // A cauldron on three legs over a little fire: pot, rolled rim, lugs, a bubbling brew.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.rock(0.07, STONE_D, { x: c.cx + Math.cos(a) * 0.32, y: 0.05, z: c.cz + Math.sin(a) * 0.32, vary: 0.08 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    m.limb([c.cx + Math.cos(a) * 0.2, 0.3, c.cz + Math.sin(a) * 0.2], [c.cx + Math.cos(a) * 0.25, 0.0, c.cz + Math.sin(a) * 0.25], 0.025, 0.02, '#2a2a2e', { seg: 4, joint: false });
    k.cyl(0.025, 0.03, 0.34, WOOD_D, { x: c.cx, y: 0.04, z: c.cz, rz: Math.PI / 2, ry: a, seg: 5 });
  }
  m.sphere(0.3, '#2a2a2e', { x: c.cx, y: 0.36, z: c.cz, sy: 0.85, seg: 12 });
  m.torus(0.25, 0.03, '#34343a', { x: c.cx, y: 0.585, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 14 });
  for (const s of [-1, 1]) m.torus(0.05, 0.012, '#34343a', { x: c.cx + s * 0.3, y: 0.52, z: c.cz, ry: Math.PI / 2, rseg: 3, tseg: 8 });
  g.cyl(0.24, 0.24, 0.02, '#7ad84a', { x: c.cx, y: 0.56, z: c.cz, seg: 12 });
  for (let i = 0; i < 3; i++) g.sphere(0.03 + c.rnd() * 0.02, '#aaff7a', { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.57, z: c.cz + (c.rnd() - 0.5) * 0.3, theta: Math.PI / 2, seg: 6 });
  c.emit({ kind: 'bubbles', x: c.cx, y: 0.58, z: c.cz, color: '#9aff6a', light: { color: '#7ad84a', intensity: 2.5, distance: 4 } });
};

/* ---------------- nature ---------------- */
// Trees, bushes and boulders don't sit one-per-square like a grid: each is
// nudged, sized and turned a little on its own, and where two stand side by
// side their crowns (or stones) grow into each other, so a row of them
// reads as a grove or a rockfall rather than a line of copies.
const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const jitter = (c, amt) => ({ x: c.cx + (c.rnd() - 0.5) * amt, z: c.cz + (c.rnd() - 0.5) * amt });
const shade = (hex, d) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + d)))); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`; };
P.T = (c, k) => {
  const { x, z } = jitter(c, 0.4);
  const size = 0.8 + c.rnd() * 0.5;
  const h = (1.1 + c.rnd() * 0.8) * size;
  const lean = (c.rnd() - 0.5) * 0.12;
  const BARK = '#5a3e26';
  const top = { x: x - Math.sin(lean) * h * 0.5, z };
  // trunk in two lengths with a kink, a flared foot, roots and a branch or two
  const mid = [x + (c.rnd() - 0.5) * 0.06 - Math.sin(lean) * h * 0.25, h * 0.5, z + (c.rnd() - 0.5) * 0.06];
  k.chain([[x, 0, z], mid, [top.x, h * 0.95, top.z]], 0.15 * size, 0.07 * size, BARK, { seg: 7, vary: 0.08 });
  k.cone(0.22 * size, 0.3 * size, '#4e3520', { x, y: 0.15 * size, z, seg: 7 });
  for (let i = 0; i < 3; i++) { const a = c.rnd() * Math.PI * 2; k.limb([x, 0.04, z], [x + Math.cos(a) * 0.3, -0.02, z + Math.sin(a) * 0.3], 0.06 * size, 0.02, '#4e3520', { seg: 5, joint: false }); }
  for (let i = 0; i < 2; i++) {
    const a = c.rnd() * TAU, y0 = h * (0.55 + i * 0.15);
    k.limb([mid[0], y0, mid[2]], [mid[0] + Math.cos(a) * 0.35 * size, y0 + 0.3 * size, mid[2] + Math.sin(a) * 0.35 * size], 0.04 * size, 0.018, BARK, { seg: 4, joint: false });
  }
  const leaf = ['#3f6b35', '#4a7a3a', '#35602f', '#5a7a35'][Math.floor(c.rnd() * 4)];
  if (c.rnd() < 0.22) {
    // now and then a fir: stacked tiers, darker underneath
    const fir = shade(leaf, -0.15);
    for (let i = 0; i < 4; i++) {
      const r = (0.62 - i * 0.12) * size, hh = 0.55 * size;
      k.cone(r, hh, i % 2 ? fir : shade(fir, 0.1), { x: top.x, y: h * 0.45 + i * 0.32 * size + hh / 2, z: top.z, seg: 7, ry: c.rnd(), vary: 0.1 });
    }
    return;
  }
  // the crown: a darker underside of big lumps, lighter smaller lumps on top
  const n = 4 + Math.floor(c.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + c.rnd();
    const rr = (0.2 + c.rnd() * 0.22) * size;
    k.ball((0.32 + c.rnd() * 0.18) * size, shade(leaf, -0.14), { x: top.x + Math.cos(a) * rr, y: h - 0.08 * size + (c.rnd() - 0.5) * 0.2 * size, z: top.z + Math.sin(a) * rr, sy: 0.8, detail: 1, vary: 0.12 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + c.rnd();
    k.ball((0.24 + c.rnd() * 0.12) * size, shade(leaf, 0.12), { x: top.x + Math.cos(a) * 0.15 * size, y: h + 0.3 * size + c.rnd() * 0.12 * size, z: top.z + Math.sin(a) * 0.15 * size, sy: 0.85, detail: 1, vary: 0.12 });
  }
  // reach toward neighbouring trees so the canopy closes over the gap
  for (const [dx, dy] of NEIGH) {
    if (c.at(dx, dy) !== 'T' || c.rnd() < 0.25) continue;
    k.ball((0.34 + c.rnd() * 0.12) * size, leaf, { x: c.cx + dx * 0.5 + (c.rnd() - 0.5) * 0.2, y: h * (0.85 + c.rnd() * 0.2), z: c.cz + dy * 0.5 + (c.rnd() - 0.5) * 0.2, sy: 0.8, detail: 1, vary: 0.14 });
  }
};
P.Y = (c, k) => {
  const { x, z } = jitter(c, 0.35);
  const greens = ['#3f6b35', '#4f7a3f', '#456f37'];
  const n = 4 + Math.floor(c.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const hi = i >= n - 2;
    k.ball(hi ? 0.14 + c.rnd() * 0.08 : 0.17 + c.rnd() * 0.12, hi ? shade(greens[i % 3], 0.14) : greens[i % 3], { x: x + (c.rnd() - 0.5) * (hi ? 0.3 : 0.55), y: hi ? 0.28 + c.rnd() * 0.08 : 0.13 + c.rnd() * 0.1, z: z + (c.rnd() - 0.5) * (hi ? 0.3 : 0.55), sy: 0.8, detail: 1, vary: 0.12 });
  }
  if (c.rnd() < 0.45) { // berries or blossom
    const col = ['#b02a3a', '#e0e0f0', '#5a3a9a'][Math.floor(c.rnd() * 3)];
    for (let i = 0; i < 6; i++) { const a = c.rnd() * TAU, r = 0.15 + c.rnd() * 0.12; k.ball(0.025, col, { x: x + Math.cos(a) * r, y: 0.2 + c.rnd() * 0.15, z: z + Math.sin(a) * r, detail: 0 }); }
  }
  for (const [dx, dy] of NEIGH) if (c.at(dx, dy) === 'Y' || c.at(dx, dy) === 'T') k.ball(0.18 + c.rnd() * 0.08, greens[1], { x: c.cx + dx * 0.48, y: 0.14, z: c.cz + dy * 0.48, sy: 0.75, detail: 1, vary: 0.12 });
};
P.O = (c, k) => {
  const { x, z } = jitter(c, 0.3);
  const size = 0.8 + c.rnd() * 0.45;
  const fl = 0.7 + c.rnd() * 0.15;
  k.rock(0.45 * size, STONE, { x, y: 0.26 * size, z, flat: fl, ry: c.rnd() * Math.PI, vary: 0.08, detail: 1 });
  if (c.rnd() < 0.45) k.rock(0.26 * size, MOSS, { x: x + (c.rnd() - 0.5) * 0.1, y: 0.26 * size + 0.3 * size * fl, z: z + (c.rnd() - 0.5) * 0.1, flat: 0.25, vary: 0.1 }); // moss on the crown
  k.rock(0.2 * size, STONE_D, { x: x + (c.rnd() - 0.5) * 0.6, y: 0.08, z: z + (c.rnd() - 0.5) * 0.6, vary: 0.08 });
  for (let i = 0; i < 3; i++) k.rock(0.04 + c.rnd() * 0.03, STONE_D, { x: c.x0 + 0.1 + c.rnd() * 0.8, y: 0.015, z: c.z0 + 0.1 + c.rnd() * 0.8, flat: 0.6 });
  // rubble between neighbouring boulders, so they read as one rockfall
  for (const [dx, dy] of NEIGH) {
    if (c.at(dx, dy) !== 'O') continue;
    for (let i = 0; i < 2; i++) k.rock(0.14 + c.rnd() * 0.1, i ? STONE_D : STONE, { x: c.cx + dx * (0.42 + c.rnd() * 0.1) + (c.rnd() - 0.5) * 0.3, y: 0.08, z: c.cz + dy * (0.42 + c.rnd() * 0.1) + (c.rnd() - 0.5) * 0.3, flat: 0.7, vary: 0.08 });
  }
};
P['6'] = (c, k) => {
  // Dripstone: a tall cone ringed with flowstone bands, a shorter sister, a rock skirt.
  const { x, z } = jitter(c, 0.3);
  const hh = 1.0 + c.rnd() * 0.6, r0 = 0.22 + c.rnd() * 0.06, tilt = (c.rnd() - 0.5) * 0.1;
  k.cone(r0, hh, '#6a6258', { x, y: hh / 2, z, rz: tilt, seg: 7, vary: 0.08 });
  for (let i = 1; i < 4; i++) {
    const t = i / 4.5, r = r0 * (1 - t) + 0.025;
    k.cyl(r * 0.92, r * 1.12, 0.07, i % 2 ? '#7a7266' : '#5e574e', { x: x - Math.sin(tilt) * hh * (t - 0.5), y: hh * t, z, seg: 7, rz: tilt });
  }
  const a = c.rnd() * Math.PI * 2, h2 = 0.4 + c.rnd() * 0.3;
  k.cone(0.12, h2, '#5a5248', { x: x + Math.cos(a) * 0.25, y: h2 / 2, z: z + Math.sin(a) * 0.25, seg: 6, vary: 0.06 });
  k.cone(0.06, 0.2, '#5a5248', { x: x + Math.cos(a + 2) * 0.28, y: 0.1, z: z + Math.sin(a + 2) * 0.28, seg: 5 });
  k.rock(0.2, '#5a5248', { x, y: 0.05, z, flat: 0.5 }); // a skirt of rock where it meets the floor
};
P['('] = (c, k) => {
  // A fallen log: bark, pale cut ends with rings, broken branch stubs, moss and a few fungi.
  const ry = c.rnd() * Math.PI;
  const at = L(c.cx, c.cz, ry);
  k.cyl(0.16, 0.18, 1.1, '#5a3e26', { x: c.cx, y: 0.16, z: c.cz, rz: Math.PI / 2, ry, seg: 8, vary: 0.06 });
  for (const s of [-1, 1]) {
    const p = at(s * 0.551);
    k.cyl(s > 0 ? 0.15 : 0.17, s > 0 ? 0.15 : 0.17, 0.01, '#a8865a', { ...p, y: 0.16, rz: Math.PI / 2, ry, seg: 8 });
    k.cyl(0.08, 0.08, 0.014, '#8a6a44', { ...p, y: 0.16, rz: Math.PI / 2, ry, seg: 8 });
  }
  for (let i = 0; i < 2; i++) {
    const p = at(-0.3 + i * 0.5, 0), a = ry + (i ? 0.6 : -0.8);
    k.limb([p.x, 0.25, p.z], [p.x + Math.sin(a) * 0.18, 0.4, p.z + Math.cos(a) * 0.18], 0.04, 0.025, '#4e3520', { seg: 5, joint: false });
  }
  for (let i = 0; i < 2; i++) k.rock(0.11, MOSS, { ...at(-0.25 + i * 0.4 + c.rnd() * 0.1, 0), y: 0.3, flat: 0.25, vary: 0.1 });
  if (c.rnd() < 0.6) for (let i = 0; i < 3; i++) {
    const p = at(-0.35 + c.rnd() * 0.7, 0.17);
    k.sphere(0.035, '#c8a070', { ...p, y: 0.14 + i * 0.04, theta: Math.PI / 2, sy: 0.4, seg: 6 }); // shelf fungi
  }
};
P['5'] = (c, k, m, g) => {
  for (let i = 0; i < 5; i++) {
    const x = c.x0 + 0.2 + c.rnd() * 0.6, z = c.z0 + 0.2 + c.rnd() * 0.6, h = 0.08 + c.rnd() * 0.18;
    const bx = (c.rnd() - 0.5) * 0.05, bz = (c.rnd() - 0.5) * 0.05, r = 0.07 + c.rnd() * 0.05;
    k.limb([x, 0, z], [x + bx, h, z + bz], 0.032, 0.022, '#d8ccb4', { seg: 5, joint: false });
    k.cone(r * 0.9, 0.03, '#a89878', { x: x + bx, y: h - 0.005, z: z + bz, rx: Math.PI, seg: 8 }); // gills
    g.sphere(r, ['#7ae0d0', '#b07ae0', '#e0d07a'][i % 3], { x: x + bx, y: h, z: z + bz, sy: 0.55, seg: 8, theta: Math.PI / 2 });
  }
  for (let i = 0; i < 4; i++) { // buttons coming up
    const x = c.x0 + 0.15 + c.rnd() * 0.7, z = c.z0 + 0.15 + c.rnd() * 0.7;
    g.sphere(0.025, '#9af0e0', { x, y: 0.015, z, seg: 6, theta: Math.PI / 2 });
  }
  c.emit({ kind: 'spores', x: c.cx, y: 0.2, z: c.cz, color: '#9af0e0', light: { color: '#6ad0c8', intensity: 1.2, distance: 3 } });
};
P['&'] = (c, k) => {
  const PETAL = ['#e06a8a', '#e0d06a', '#a06ae0', '#ffffff', '#e0884a'];
  for (let i = 0; i < 9; i++) {
    const x = c.x0 + 0.1 + c.rnd() * 0.8, z = c.z0 + 0.1 + c.rnd() * 0.8, h = 0.1 + c.rnd() * 0.08;
    k.cyl(0.008, 0.008, h, '#4a7a3a', { x, y: h / 2, z, seg: 4 });
    k.box(0.07, 0.008, 0.025, '#4f8a3f', { x: x + 0.025, y: h * 0.4, z, ry: c.rnd() * TAU, rz: 0.4 }); // a leaf
    const col = PETAL[Math.floor(c.rnd() * PETAL.length)], a = c.rnd();
    for (let p = 0; p < 2; p++) k.box(0.075, 0.012, 0.03, col, { x, y: h, z, ry: a + p * Math.PI / 2, vary: 0.06 });
    k.ball(0.016, '#f0c040', { x, y: h + 0.01, z, detail: 0 });
  }
  for (let i = 0; i < 4; i++) k.cone(0.03, 0.09, '#5a8a40', { x: c.x0 + 0.1 + c.rnd() * 0.8, y: 0.045, z: c.z0 + 0.1 + c.rnd() * 0.8, seg: 3, rz: (c.rnd() - 0.5) * 0.4 }); // grass tufts
};
P['7'] = (c, k) => {
  // A web strung across the square: threads from a hub out to anchor points,
  // and rings of silk between them. Faces the nearest wall if there is one.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : c.rnd() * Math.PI;
  const silk = '#e4e0d6', r = 0.46, cy = 0.62, N = 8;
  const pt = (a, rr) => {
    const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr;
    return [c.cx + Math.cos(ry) * lx, cy + ly, c.cz - Math.sin(ry) * lx];
  };
  const spokes = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2, rr = r * (0.8 + c.rnd() * 0.25);
    spokes.push([a, rr]);
    k.limb(pt(0, 0), pt(a, Math.min(rr, a > Math.PI ? cy - 0.02 : rr)), 0.006, 0.004, silk, { seg: 3, joint: false });
  }
  for (const ring of [0.22, 0.4, 0.58, 0.8]) {
    for (let i = 0; i < N; i++) {
      const [a0, r0] = spokes[i], [a1, r1] = spokes[(i + 1) % N];
      k.limb(pt(a0, Math.min(r0 * ring, a0 > Math.PI ? cy - 0.02 : r0 * ring)), pt(a1, Math.min(r1 * ring, a1 > Math.PI ? cy - 0.02 : r1 * ring)), 0.004, 0.004, silk, { seg: 3, joint: false });
    }
  }
  if (c.rnd() < 0.35) { // the spinner, sat off the hub
    const [px, py, pz] = pt(0.9, 0.2);
    k.ball(0.03, '#1e1a18', { x: px, y: py, z: pz, detail: 0 });
    k.ball(0.02, '#1e1a18', { x: px, y: py + 0.035, z: pz, detail: 0 });
  }
};

/* ---------------- shrine ---------------- */
// (Plain on purpose: no symbols of any faith on altars, statues or banners.)
P.A = (c, k, m) => {
  k.box(0.98, 0.08, 0.68, STONE, { x: c.cx, y: 0.04, z: c.cz, vary: 0.04 }); // plinth
  k.box(0.9, 0.54, 0.6, STONE_L, { x: c.cx, y: 0.35, z: c.cz, vary: 0.04 });
  for (const s of [-1, 1]) for (const lx of [-0.22, 0.22]) k.box(0.32, 0.34, 0.015, '#8a857c', { x: c.cx + lx, y: 0.35, z: c.cz + s * 0.303 }); // sunk panels
  k.box(0.98, 0.08, 0.68, STONE, { x: c.cx, y: 0.66, z: c.cz, vary: 0.04 });
  k.box(0.5, 0.02, 0.7, CLOTH_R, { x: c.cx, y: 0.71, z: c.cz });
  for (const s of [-1, 1]) {
    k.box(0.5, 0.18, 0.015, CLOTH_R, { x: c.cx, y: 0.62, z: c.cz + s * 0.35 }); // the runner hangs down
    m.box(0.5, 0.015, 0.018, GOLD, { x: c.cx, y: 0.535, z: c.cz + s * 0.35 }); // its fringe
  }
  m.cyl(0.09, 0.05, 0.05, BRASS, { x: c.cx, y: 0.745, z: c.cz, seg: 9 }); // a plain bowl
  for (const s of [-0.3, 0.3]) {
    m.cyl(0.05, 0.06, 0.02, BRASS, { x: c.cx + s, y: 0.72, z: c.cz, seg: 8 });
    k.cyl(0.03, 0.032, 0.18, WAX, { x: c.cx + s, y: 0.82, z: c.cz, seg: 6 });
    k.box(0.015, 0.05, 0.015, '#f4eedd', { x: c.cx + s + 0.028, y: 0.86, z: c.cz });
    c.emit({ kind: 'candle', x: c.cx + s, y: 0.92, z: c.cz });
  }
  k.cyl(0.02, 0.022, 0.1, WAX, { x: c.cx + 0.18, y: 0.76, z: c.cz + 0.12, seg: 6 }); // a burnt-down stub
};
P.U = (c, k) => {
  // A robed stone figure with a staff on a stepped plinth, facing the room.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : Math.floor(c.rnd() * 4) * Math.PI / 2;
  const at = L(c.cx, c.cz, ry);
  const S = STONE_L;
  k.box(0.66, 0.14, 0.66, STONE_D, { x: c.cx, y: 0.07, z: c.cz, ry, vary: 0.04 });
  k.box(0.56, 0.16, 0.56, STONE, { x: c.cx, y: 0.22, z: c.cz, ry, vary: 0.04 });
  k.cyl(0.16, 0.25, 0.72, S, { x: c.cx, y: 0.66, z: c.cz, seg: 9, ry });
  for (let i = 0; i < 3; i++) k.box(0.025, 0.6, 0.02, '#8a857c', { ...at(-0.08 + i * 0.08, 0.2), y: 0.6, ry, rx: -0.12 }); // robe folds
  k.sphere(0.2, S, { x: c.cx, y: 1.02, z: c.cz, sx: 1.15, sy: 0.5, seg: 9 }); // shoulders
  k.ball(0.12, S, { x: c.cx, y: 1.2, z: c.cz, detail: 1 });
  k.sphere(0.15, STONE, { ...at(0, -0.02), y: 1.2, sy: 1.1, seg: 9, theta: Math.PI * 0.62 }); // hood
  for (const s of [-1, 1]) k.limb([at(s * 0.2, 0).x, 1.0, at(s * 0.2, 0).z], [at(s * 0.17, 0.12).x, 0.78, at(s * 0.17, 0.12).z], 0.06, 0.05, S, { seg: 6 });
  const hand = at(0.17, 0.14);
  k.limb([hand.x, 0.3, hand.z], [hand.x, 1.4, hand.z], 0.025, 0.022, STONE, { seg: 5, joint: false }); // staff
  k.ball(0.05, STONE, { x: hand.x, y: 1.43, z: hand.z, detail: 0 });
};
P.P = (c, k) => {
  // A column: square plinth, moulded base, a shaft with a slight swell, a flared capital and abacus.
  const h = WALL_H + 0.25;
  k.box(0.62, 0.12, 0.62, STONE_D, { x: c.cx, y: 0.06, z: c.cz, vary: 0.04 });
  k.cyl(0.27, 0.29, 0.07, STONE, { x: c.cx, y: 0.155, z: c.cz, seg: 12 });
  k.cyl(0.24, 0.27, 0.05, STONE_L, { x: c.cx, y: 0.215, z: c.cz, seg: 12 });
  const s0 = 0.24, s1 = h - 0.26;
  k.cyl(0.23, 0.22, (s1 - s0) * 0.5, STONE_L, { x: c.cx, y: s0 + (s1 - s0) * 0.25, z: c.cz, seg: 12, vary: 0.03 });
  k.cyl(0.2, 0.23, (s1 - s0) * 0.5, STONE_L, { x: c.cx, y: s0 + (s1 - s0) * 0.75, z: c.cz, seg: 12, vary: 0.03 });
  k.cyl(0.235, 0.235, 0.04, STONE, { x: c.cx, y: s1 + 0.0, z: c.cz, seg: 12 }); // necking
  k.cyl(0.3, 0.21, 0.12, STONE_L, { x: c.cx, y: s1 + 0.08, z: c.cz, seg: 12 });
  k.box(0.6, 0.1, 0.6, STONE_D, { x: c.cx, y: h - 0.05, z: c.cz, vary: 0.04 });
};
P.Z = (c, k, m, g) => {
  c.emit({ kind: 'circle', x: c.cx, y: 0.03, z: c.cz, color: '#a87aff', light: { color: '#9a6aff', intensity: 3, distance: 5 } });
};
P.Q = (c, k, m, g) => {
  // Crystal clusters: six-sided prisms with pointed tips, out of a rocky bed.
  const col = ['#7ae0ff', '#c07aff', '#7affb8'][Math.floor(c.rnd() * 3)];
  for (let i = 0; i < 3; i++) k.rock(0.13 + c.rnd() * 0.06, '#4a4650', { x: c.cx + (c.rnd() - 0.5) * 0.4, y: 0.04, z: c.cz + (c.rnd() - 0.5) * 0.4, flat: 0.5, vary: 0.08 });
  for (let i = 0; i < 6; i++) {
    const h = (i < 2 ? 0.45 : 0.18) + c.rnd() * 0.4, r = (i < 2 ? 0.08 : 0.05) + c.rnd() * 0.04;
    const rx = (c.rnd() - 0.5) * 0.6, rz = (c.rnd() - 0.5) * 0.6;
    const x = c.cx + (c.rnd() - 0.5) * 0.45, z = c.cz + (c.rnd() - 0.5) * 0.45;
    // the tilt carries the tip along with the prism
    const tx = -Math.sin(rz), ty = Math.cos(rz) * Math.cos(rx), tz = Math.cos(rz) * Math.sin(rx);
    g.cyl(r, r * 1.1, h, col, { x: x + tx * h / 2, y: ty * h / 2, z: z + tz * h / 2, rx, rz, seg: 6 });
    g.cone(r, r * 2.2, shade(col, 0.15), { x: x + tx * (h + r * 1.1), y: ty * (h + r * 1.1), z: z + tz * (h + r * 1.1), rx, rz, seg: 6 });
  }
  c.emit({ kind: 'crystal', x: c.cx, y: 0.4, z: c.cz, color: col, light: { color: col, intensity: 1.1, distance: 4.5 } });
};
P.M = (c, k) => {
  // A headstone (plain round-topped slab) on a footing, carved lines, a turf mound before it.
  const tilt = (c.rnd() - 0.5) * 0.15;
  k.box(0.56, 0.08, 0.2, STONE_D, { x: c.cx, y: 0.04, z: c.cz, vary: 0.05 });
  k.box(0.45, 0.6, 0.12, STONE, { x: c.cx, y: 0.36, z: c.cz, rz: tilt, vary: 0.06 });
  k.cyl(0.225, 0.225, 0.12, STONE, { x: c.cx - Math.sin(tilt) * 0.3, y: 0.66, z: c.cz, rx: Math.PI / 2, rz: tilt, seg: 10, arc: Math.PI });
  for (let i = 0; i < 3; i++) k.box(0.26 - i * 0.04, 0.018, 0.01, '#4a4642', { x: c.cx - Math.sin(tilt) * (0.2 - i * 0.08), y: 0.56 - i * 0.08, z: c.cz + 0.062, rz: tilt });
  if (c.rnd() < 0.5) k.rock(0.09, MOSS, { x: c.cx + 0.16, y: 0.08, z: c.cz + 0.06, flat: 0.35 });
  k.rock(0.32, '#4a3a28', { x: c.cx, y: 0.0, z: c.cz + 0.28, sx: 0.85, sz: 1.3, flat: 0.25, vary: 0.06 }); // the mound
};
P.W = (c, k, m) => {
  // A well: a ring of laid stone with a cap course, posts, a windlass with a
  // crank, rope down to a bucket, and a shingled roof.
  const { cx, cz } = c;
  for (let i = 0; i < 3; i++) k.cyl(0.43, 0.45, 0.16, i % 2 ? STONE_D : STONE, { x: cx, y: 0.08 + i * 0.16, z: cz, seg: 12, vary: 0.06, ry: i * 0.26 });
  k.cyl(0.47, 0.47, 0.06, STONE_L, { x: cx, y: 0.51, z: cz, seg: 12, ry: 0.13, open: true }); // cap course
  k.cyl(0.36, 0.36, 0.01, '#0e1a22', { x: cx, y: 0.49, z: cz, seg: 12 }); // the dark shaft
  k.cyl(0.36, 0.36, 0.06, '#3a3632', { x: cx, y: 0.51, z: cz, seg: 12, open: true }); // its inner lip
  for (const s of [-0.38, 0.38]) k.box(0.07, 1.15, 0.07, WOOD, { x: cx + s, y: 0.73, z: cz, vary: 0.05 });
  k.cyl(0.045, 0.045, 0.82, WOOD_D, { x: cx, y: 1.0, z: cz, rz: Math.PI / 2, seg: 6 });
  k.cyl(0.06, 0.06, 0.14, ROPE, { x: cx - 0.05, y: 1.0, z: cz, rz: Math.PI / 2, seg: 6 }); // rope wound on
  k.box(0.03, 0.16, 0.03, WOOD_D, { x: cx + 0.44, y: 0.93, z: cz }); // crank
  k.box(0.1, 0.03, 0.03, WOOD_D, { x: cx + 0.48, y: 0.86, z: cz });
  k.cyl(0.008, 0.008, 0.28, ROPE, { x: cx - 0.05, y: 0.84, z: cz, seg: 3 });
  k.cyl(0.07, 0.06, 0.1, WOOD, { x: cx - 0.05, y: 0.66, z: cz, seg: 7 });
  m.cyl(0.072, 0.072, 0.015, IRON, { x: cx - 0.05, y: 0.69, z: cz, seg: 7, open: true });
  // roof: two pitched slopes of shingle rows with a ridge beam and gable boards
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      const zz = cz + s * (0.1 + r * 0.17), yy = 1.55 - r * 0.11;
      k.box(1.02, 0.04, 0.22, r % 2 ? '#7a3a2a' : '#6a3224', { x: cx, y: yy, z: zz, rx: s * 0.58, vary: 0.08 });
    }
  }
  k.box(1.06, 0.06, 0.06, WOOD_D, { x: cx, y: 1.62, z: cz });
  for (const s of [-0.38, 0.38]) k.box(0.04, 0.1, 0.6, WOOD_D, { x: cx + s, y: 1.35, z: cz });
};
P.N = (c, k, m, g) => {
  k.cyl(0.46, 0.48, 0.3, STONE_L, { x: c.cx, y: 0.15, z: c.cz, seg: 14, vary: 0.04 });
  k.cyl(0.49, 0.49, 0.05, STONE, { x: c.cx, y: 0.3, z: c.cz, seg: 14, open: true }); // rim
  k.cyl(0.5, 0.52, 0.06, STONE_D, { x: c.cx, y: 0.03, z: c.cz, seg: 14 }); // footing
  k.cyl(0.08, 0.12, 0.5, STONE_L, { x: c.cx, y: 0.45, z: c.cz, seg: 8 });
  k.cyl(0.16, 0.08, 0.06, STONE, { x: c.cx, y: 0.5, z: c.cz, seg: 10 }); // a lower dish
  k.cyl(0.06, 0.08, 0.1, STONE_L, { x: c.cx, y: 0.66, z: c.cz, seg: 8 });
  k.cyl(0.18, 0.12, 0.1, STONE_L, { x: c.cx, y: 0.76, z: c.cz, seg: 10 });
  k.cyl(0.04, 0.05, 0.08, STONE, { x: c.cx, y: 0.84, z: c.cz, seg: 6 }); // spout
  c.emit({ kind: 'water', x: c.cx, y: 0.27, z: c.cz, r: 0.42 });
  c.emit({ kind: 'fountain', x: c.cx, y: 0.8, z: c.cz });
};
P.X = (c, k, m) => {
  if (!c.dmView) return; // a trap looks like floor to players
  m.box(0.8, 0.03, 0.8, '#3a3a3f', { x: c.cx, y: 0.015, z: c.cz });
  for (const s of [-1, 1]) m.box(0.82, 0.035, 0.04, IRON, { x: c.cx, y: 0.02, z: c.cz + s * 0.4 });
  for (let i = 0; i < 9; i++) m.cone(0.05, 0.22, '#9aa0a8', { x: c.x0 + 0.2 + (i % 3) * 0.3, y: 0.11, z: c.z0 + 0.2 + Math.floor(i / 3) * 0.3, seg: 5 });
};
P['?'] = (c, k) => {
  // A signpost: a post with a capped top and arrow boards, with painted lettering.
  k.box(0.08, 1.15, 0.08, WOOD_D, { x: c.cx, y: 0.575, z: c.cz, vary: 0.05 });
  k.cone(0.07, 0.08, WOOD_D, { x: c.cx, y: 1.19, z: c.cz, seg: 4, ry: Math.PI / 4 });
  k.rock(0.12, STONE_D, { x: c.cx, y: 0.03, z: c.cz, flat: 0.5 });
  for (const [lx, y, ry, rz, len] of [[0.2, 0.95, 0, 0.04, 0.48], [-0.16, 0.72, 0.6, -0.05, 0.42]]) {
    const at = L(c.cx, c.cz, ry), dir = Math.sign(lx);
    k.box(len, 0.15, 0.035, WOOD_L, { ...at(lx, 0), y, ry, rz, vary: 0.08 });
    k.box(0.11, 0.11, 0.034, WOOD_L, { ...at(lx + dir * len / 2, 0), y: y + dir * Math.sin(rz) * len / 2, ry, rz: Math.PI / 4 + rz, vary: 0.08 }); // the point
    for (const ln of [-0.03, 0.03]) k.box(len * 0.6, 0.012, 0.04, '#3a2a1c', { ...at(lx - dir * 0.03, 0), y: y + ln + Math.sin(rz) * -0.03 * dir, ry, rz });
  }
};
P['}'] = (c, k, m) => {
  // A standard: a pole on a footed base with a plain finial, crossbar, a
  // swallow-tailed cloth with gilt edging and a plain disc device.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  m.box(0.05, 1.6, 0.05, '#3a3a3f', { x: c.cx, y: 0.8, z: c.cz });
  m.ball(0.045, GOLD, { x: c.cx, y: 1.63, z: c.cz, detail: 0 });
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; m.limb([c.cx, 0.16, c.cz], [c.cx + Math.cos(a) * 0.18, 0.01, c.cz + Math.sin(a) * 0.18], 0.02, 0.015, '#3a3a3f', { seg: 4 }); }
  m.box(0.5, 0.04, 0.04, '#3a3a3f', { ...at(0.2, 0), y: 1.55, ry });
  const cx = 0.22, top = 1.52, bot = 0.82, wdt = 0.42;
  k.box(wdt, top - bot - 0.1, 0.02, CLOTH_R, { ...at(cx, 0), y: (top + bot + 0.1) / 2, ry, vary: 0.04 });
  // the swallowtail: two pointed flaps below the square
  const p = (lx, y) => { const q = at(lx, 0); return [q.x, y, q.z]; };
  k.membrane([p(cx - wdt / 2, bot + 0.1), p(cx, bot + 0.1), p(cx - wdt / 4, bot - 0.08)], CLOTH_R);
  k.membrane([p(cx, bot + 0.1), p(cx + wdt / 2, bot + 0.1), p(cx + wdt / 4, bot - 0.08)], CLOTH_R);
  for (const s of [-1, 1]) m.box(0.02, top - bot - 0.1, 0.025, GOLD, { ...at(cx + s * (wdt / 2 - 0.01), 0), y: (top + bot + 0.1) / 2, ry });
  m.box(wdt, 0.025, 0.025, GOLD, { ...at(cx, 0), y: top - 0.01, ry });
  m.cyl(0.08, 0.08, 0.03, GOLD, { ...at(cx, 0), y: 1.2, rx: Math.PI / 2, ry, seg: 10 });
};

/* ---------------- walls ---------------- */
// Masonry is laid along each exposed face in world space, so courses run on
// unbroken across cells and turn corners; a mortar-dark core fills the cell
// so neighbouring walls meet with no seam. A dark plinth runs along the foot
// and a coping course along the top; stones sit a little proud or sunk and
// vary in tone, and each course is set off differently (ashlar, not a grid).
const MASONRY = new Set(['#', 'S']);
const BRICK_L = 0.42, BRICK_T = 0.035, COURSES = 5, PLINTH = 0.11, COPING = 0.07;
const FACES = [
  { dx: 0, dy: -1, run: 'x' }, { dx: 0, dy: 1, run: 'x' },
  { dx: -1, dy: 0, run: 'z' }, { dx: 1, dy: 0, run: 'z' },
];
const isMasonry = (ch) => MASONRY.has(ch);
function wallStone(c, k, color = STONE_D) {
  // Inset a hair so the brick backs don't z-fight with it. This core straddles
  // the cut, so a dropped wall always has its dark cap.
  k.box(0.985, WALL_H - 0.01, 0.985, MORTAR, { x: c.cx, y: WALL_H / 2 - 0.005, z: c.cz });
  const h = (WALL_H - PLINTH - COPING) / COURSES;
  const tones = [color, color, color, '#6a655f', '#4f4b46'];
  const EXT = BRICK_T + 0.012; // how far a course wraps round an outer corner
  for (const f of FACES) {
    if (isWallChar(c.at(f.dx, f.dy))) continue; // buried face
    // Along the run: the cells before/after this one, and whether they carry the same face.
    const ux = f.run === 'x' ? 1 : 0, uy = 1 - ux;
    const sameFace = (s) => isMasonry(c.at(s * ux, s * uy)) && !isWallChar(c.at(s * ux + f.dx, s * uy + f.dy));
    const prevSame = sameFace(-1), nextSame = sameFace(1);
    // At an outer corner the face runs on over the neighbouring face's facing.
    const prevOuter = !isWallChar(c.at(-ux, -uy)), nextOuter = !isWallChar(c.at(ux, uy));
    const u0 = f.run === 'x' ? c.x0 : c.z0;
    const lo = u0 - (prevOuter ? EXT : 0), hi = u0 + 1 + (nextOuter ? EXT : 0);
    const along = f.run === 'x';
    // Each piece anchors inside this cell, so the per-cell cutaway takes it with this wall.
    const put = (mid, n) => {
      const a = Math.min(u0 + 0.99, Math.max(u0 + 0.01, mid));
      return along ? { x: mid, z: c.cz + f.dy * n, ax: a, az: c.cz } : { x: c.cx + f.dx * n, z: mid, ax: c.cx, az: a };
    };
    const strip = (t, ext, y, hh, col) => {
      const a = prevSame ? u0 : u0 - (prevOuter ? ext : 0), e = nextSame ? u0 + 1 : u0 + 1 + (nextOuter ? ext : 0);
      k.box(along ? e - a : t, hh, along ? t : e - a, col, { ...put((a + e) / 2, 0.5 + t / 2), y, vary: 0.04 });
    };
    strip(0.06, 0.06, PLINTH / 2, PLINTH, '#45413c');
    strip(0.05, 0.05, WALL_H - COPING / 2, COPING, '#5f5a53');
    for (let i = 0; i < COURSES; i++) {
      const off = ((i * 0.37) % 1) * BRICK_L;
      const y = PLINTH + i * h + h / 2;
      for (let s = Math.floor((u0 - off) / BRICK_L) * BRICK_L + off; s < u0 + 1; s += BRICK_L) {
        let a = s, e = s + BRICK_L;
        // Bricks are cut at the cell edge (each cell owns its own pieces, so
        // the per-cell cutaway never leaves one hanging over the next cell);
        // at an outer corner the course wraps on round the corner.
        if (a < u0) a = prevSame ? u0 + 0.0125 : lo;
        if (e > u0 + 1) e = nextSame ? u0 + 1 - 0.0125 + 0.025 : hi;
        if (e - a < 0.04) continue;
        const len = e - a - 0.025, mid = (a + e) / 2;
        const t = BRICK_T + c.rnd() * 0.012; // proud or sunk a little
        const chip = c.rnd() < 0.07; // a worn stone, short of its course
        const hh = (h - 0.025) * (chip ? 0.78 : 1);
        k.box(along ? len : t, hh, along ? t : len, tones[Math.floor(c.rnd() * tones.length)], { ...put(mid, 0.5 + t / 2), y: y - (h - 0.025 - hh) / 2, vary: 0.12 });
      }
    }
  }
  k.box(0.998, 0.04, 0.998, '#3e3a36', { x: c.cx, y: WALL_H + 0.02, z: c.cz });
}

export const WALLS = {
  '#': (c, k) => wallStone(c, k),
  'S': (c, k) => wallStone(c, k),
  '%': (c, k) => {
    // A ruined wall: a core of fill, faced with blocks whose courses give out
    // raggedly toward the top, a few stones loose on top and fallen at the foot.
    const h = WALL_H * (0.25 + c.rnd() * 0.6);
    k.box(0.94, h, 0.94, '#3a3632', { x: c.cx, y: h / 2, z: c.cz });
    const bh = 0.2;
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy))) continue;
      const along = f.run === 'x';
      for (let i = 0; i * bh < h; i++) {
        for (let j = 0; j < 3; j++) {
          const u = -0.5 + (j + 0.5) / 3 + ((i % 2) ? 0.06 : -0.06);
          const top = h + 0.12 - c.rnd() * 0.3; // ragged: stones stop short near the top
          if (i * bh + bh * 0.5 > top) continue;
          const t = 0.06 + c.rnd() * 0.02, n = 0.47 + t / 2 - 0.03;
          const p = along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u };
          k.box(along ? 0.3 : t, bh - 0.02, along ? t : 0.3, c.rnd() < 0.5 ? STONE : STONE_D, { ...p, y: i * bh + bh / 2, ry: (c.rnd() - 0.5) * 0.08, vary: 0.14, ax: c.cx, az: c.cz });
        }
      }
      if (c.rnd() < 0.6) { // a fallen block at the foot
        const u = (c.rnd() - 0.5) * 0.6, n = 0.5 + 0.08;
        const p = along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u };
        k.box(0.22, 0.14, 0.16, STONE, { ...p, y: 0.06, ry: c.rnd() * Math.PI, rz: (c.rnd() - 0.5) * 0.4, vary: 0.1, ax: c.cx, az: c.cz });
      }
    }
    for (let i = 0; i < 3; i++) k.rock(0.1 + c.rnd() * 0.1, STONE, { x: c.x0 + 0.15 + c.rnd() * 0.7, y: h + 0.02, z: c.z0 + 0.15 + c.rnd() * 0.7, flat: 0.6, vary: 0.08 });
    if (c.rnd() < 0.35) k.rock(0.22, MOSS, { x: c.cx + (c.rnd() - 0.5) * 0.3, y: h, z: c.cz + (c.rnd() - 0.5) * 0.3, flat: 0.2, vary: 0.1 });
  },
  w: (c, k) => {
    // A timber palisade: a dark core faced on every open side with upright
    // logs, each sharpened to a point, bound by two rope lashings.
    k.box(0.9, WALL_H, 0.9, '#3e2a18', { x: c.cx, y: WALL_H / 2, z: c.cz });
    const anc = { ax: c.cx, az: c.cz };
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy))) continue;
      const along = f.run === 'x';
      const at = (u, n) => (along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u });
      for (const u of [-0.375, -0.125, 0.125, 0.375]) {
        const r = 0.115 + c.rnd() * 0.015, hh = WALL_H - 0.05 + (c.rnd() - 0.4) * 0.16;
        k.cyl(r * 0.95, r, hh, ['#6b4f33', '#5e442b', '#735536'][Math.floor(c.rnd() * 3)], { ...at(u, 0.5 - 0.07), y: hh / 2, seg: 6, ry: c.rnd(), vary: 0.08, ...anc });
        k.cone(r * 0.95, 0.22, '#8a6a46', { ...at(u, 0.5 - 0.07), y: hh + 0.11, seg: 6, ry: c.rnd(), ...anc });
      }
      for (const yy of [0.32, WALL_H - 0.28]) k.box(along ? 1.0 : 0.03, 0.05, along ? 0.03 : 1.0, '#3a2c1c', { ...at(0, 0.555), y: yy + (c.rnd() - 0.5) * 0.03, ...anc });
    }
    k.box(0.9, 0.04, 0.9, '#2e2014', { x: c.cx, y: WALL_H + 0.02, z: c.cz });
  },
  v: (c, k) => {
    // Cave rock: a great lumpy mass, a second stone on its shoulder, and
    // fallen chunks heaped at the foot of each open side.
    const h = WALL_H * (0.9 + c.rnd() * 0.5);
    k.rock(0.62, '#6e665e', { x: c.cx, y: h * 0.45, z: c.cz, sy: h * 1.1, detail: 1, vary: 0.1 });
    k.rock(0.4, '#5a534c', { x: c.cx + (c.rnd() - 0.5) * 0.4, y: h * 0.9, z: c.cz + (c.rnd() - 0.5) * 0.4, detail: 0, vary: 0.08 });
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy)) || c.rnd() < 0.4) continue;
      const u = (c.rnd() - 0.5) * 0.6;
      k.rock(0.13 + c.rnd() * 0.08, '#5f5850', { x: c.cx + (f.run === 'x' ? u : f.dx * 0.45), y: 0.07, z: c.cz + (f.run === 'x' ? f.dy * 0.45 : u), flat: 0.6, vary: 0.1, ax: c.cx, az: c.cz });
    }
  },
  h: (c, k) => {
    // A clipped hedge: a squared green core with lumpy growth over it.
    k.box(0.92, 0.95, 0.92, '#2f5528', { x: c.cx, y: 0.475, z: c.cz, vary: 0.06 });
    for (let i = 0; i < 4; i++) k.ball(0.3, i % 2 ? '#3f6b35' : '#355f2e', { x: c.cx + (c.rnd() - 0.5) * 0.4, y: 0.75 + c.rnd() * 0.25, z: c.cz + (c.rnd() - 0.5) * 0.4, detail: 0, vary: 0.1 });
  },
  _: () => {},
};

export const PROPS = P;
