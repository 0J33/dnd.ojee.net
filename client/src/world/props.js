import * as THREE from 'three';
import { TILES } from '../data/tiles';
import { PAL, shade, tint } from './palette';

// One 3D model per prop tile, built into its cell (x..x+1, z..z+1) with the
// floor at y = 0. Things that glow or burn register an emitter (light +
// particles) instead of being drawn here.
//
// House style: chunky painted miniatures from one box. Every piece is a
// little thicker than life, its edges chamfered (Kit.bevel) so candle-light
// catches them, and it carries a few readable details — iron bands with
// rivet heads, handles, lock plates, nail heads, trims — rather than many
// fiddly ones. Every colour comes from the shared palette (palette.js), so
// the furniture, the walls and the figures standing among them match.
//
// Builders take (c, k, m, g): the cell, and kits for painted (k), metal (m)
// and glowing (g) parts. Walls and doors are drawn into the wall kit, so the
// cutaway drops them; parts that stand outside their own cell carry ax/az
// (the cell they belong to).

export const WALL_H = 1.3;
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
const pick = (c, xs) => xs[Math.floor(c.rnd() * xs.length) % xs.length];

/* ---------------- shared pieces ---------------- */

// A dressed stone set in a wall: only its face shows, so it is a box with a
// chamfered front and no back (a third of a full bevel's triangles). Faces
// +z; turn it with ry.
const STONES = new Map();
function stoneGeo(w, h, d, b) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${b.toFixed(3)}`;
  let g = STONES.get(key);
  if (g) return g;
  const x = w / 2, y = h / 2, z = d / 2, xi = x - b, yi = y - b, zb = z - b;
  const pos = [];
  const quad = (A, B, C, D) => {
    for (const [p, q, r] of [[A, B, C], [A, C, D]]) {
      // wind outward from the stone's centre
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...q).sub(new THREE.Vector3(...p)), new THREE.Vector3(...r).sub(new THREE.Vector3(...p)));
      const m = new THREE.Vector3((p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3, (p[2] + q[2] + r[2]) / 3);
      pos.push(...(n.dot(m) < 0 ? [...p, ...r, ...q] : [...p, ...q, ...r]));
    }
  };
  quad([-xi, -yi, z], [xi, -yi, z], [xi, yi, z], [-xi, yi, z]);          // face
  quad([-xi, yi, z], [xi, yi, z], [x, y, zb], [-x, y, zb]);              // chamfers
  quad([-xi, -yi, z], [xi, -yi, z], [x, -y, zb], [-x, -y, zb]);
  quad([xi, -yi, z], [xi, yi, z], [x, y, zb], [x, -y, zb]);
  quad([-xi, -yi, z], [-xi, yi, z], [-x, y, zb], [-x, -y, zb]);
  quad([-x, y, zb], [x, y, zb], [x, y, -z], [-x, y, -z]);                // sides
  quad([-x, -y, zb], [x, -y, zb], [x, -y, -z], [-x, -y, -z]);
  quad([x, -y, zb], [x, y, zb], [x, y, -z], [x, -y, -z]);
  quad([-x, -y, zb], [-x, y, zb], [-x, y, -z], [-x, -y, -z]);
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (STONES.size > 3000) STONES.clear();
  STONES.set(key, g);
  return g;
}
const faceStone = (k, w, h, d, color, o) => k.add(stoneGeo(w, h, d, Math.min(0.03, h * 0.18, w * 0.18)), color, o);

/* ---------------- doors & ways ---------------- */

// A door set between walls: dressed stone quoins and a lintel with a proud
// keystone fill the wall's depth; a heavy timber frame holds the leaf.
// Doors side by side along the wall make one wide opening (no jamb between).
function doorRun(c, axis) {
  const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1];
  const open = (ch) => ch === 'D' || ch === 'd' || ch === 'L'; // a secret door looks like wall
  return { lo: open(c.at(-dx, -dy)), hi: open(c.at(dx, dy)) };
}
function doorFrame(c, k, axis, color = PAL.woodD) {
  const { cx, cz } = c;
  const run = doorRun(c, axis);
  const along = (v) => (axis === 'x' ? { x: cx + v, z: cz } : { x: cx, z: cz + v });
  const dims = (w, h, d) => (axis === 'x' ? [w, h, d] : [d, h, w]);
  const lo = run.lo ? -0.499 : -0.4, hi = run.hi ? 0.499 : 0.4;
  const JH = WALL_H - 0.24, QN = 4, QH = JH / QN;
  for (const [has, u] of [[!run.lo, -0.449], [!run.hi, 0.449]]) {
    if (!has) continue;
    k.box(...dims(0.09, JH, 0.95), PAL.mortar, { ...along(u), y: JH / 2 });
    // quoins: long and short stones in turn, the long ones standing proud
    for (let i = 0; i < QN; i++) {
      const big = (i + (u > 0 ? 1 : 0)) % 2 === 0;
      k.bevel(...dims(0.11, QH - 0.02, big ? 1.08 : 1.02), big ? PAL.stoneL : PAL.stone, { ...along(u), y: i * QH + QH / 2, b: 0.02, vary: 0.08 });
    }
  }
  // the lintel, and a keystone over a single door
  k.bevel(...dims(0.998, 0.24, 1.06), PAL.stone, { ...along(0), y: WALL_H - 0.12, b: 0.025, vary: 0.05 });
  if (!run.lo && !run.hi) k.bevel(...dims(0.18, 0.3, 1.12), PAL.stoneL, { ...along(0), y: WALL_H - 0.13, b: 0.025, taper: axis === 'x' ? 0.25 : 0, taperZ: axis === 'x' ? 0 : 0.25, rx: Math.PI });
  k.bevel(...dims(hi - lo, 0.05, 1.0), PAL.stoneD, { ...along((lo + hi) / 2), y: 0.025, b: 0.015 }); // threshold
  k.box(0.998, 0.04, 0.998, PAL.stoneDD, { x: cx, y: WALL_H + 0.02, z: cz });
  // the timber frame: posts, a head beam, and iron pins on the hinge post
  if (!run.lo) k.bevel(...dims(0.09, JH, 0.2), color, { ...along(-0.37), y: JH / 2, b: 0.02, vary: 0.05 });
  if (!run.hi) k.bevel(...dims(0.09, JH, 0.2), color, { ...along(0.37), y: JH / 2, b: 0.02, vary: 0.05 });
  k.bevel(...dims(hi - lo, 0.1, 0.2), color, { ...along((lo + hi) / 2), y: WALL_H - 0.28, b: 0.02 });
  if (!run.lo) for (const yy of [0.25, 0.78]) k.bevel(...dims(0.04, 0.09, 0.22), PAL.ironD, { ...along(-0.33), y: yy, b: 0.01 });
  return { lo: run.lo ? -0.5 : -0.33, hi: run.hi ? 0.5 : 0.33 };
}
const DOOR_W = 0.66, DOOR_H = WALL_H - 0.32;

// A door leaf, centred at (x, z), turned by ry (width along local x).
// Wooden: a few broad planks, two iron straps ending in hinge curls, rivet
// heads, a ring pull on a plate. Iron: a riveted slab with raised panels and
// a barred grille. `faces` says which faces carry detail.
function doorLeaf(k, { x, z, ry, w, h = DOOR_H, t = 0.09, anc = {}, iron = false, faces = [-1, 1], handle = 'auto', rnd = Math.random }) {
  const at = L(x, z, ry);
  const P = (lx, lz, y, o) => ({ ...at(lx, lz), y, ry, ...anc, ...o });
  const hx = handle === 'auto' ? w / 2 - 0.13 : handle;
  if (iron) {
    k.bevel(w, h, t, PAL.ironD, P(0, 0, h / 2, { b: 0.02, vary: 0.03 }));
    for (const f of faces) {
      const n = f * (t / 2 + 0.008);
      for (const px of [-1, 1]) for (const py of [0, 1]) k.bevel(w / 2 - 0.1, h * 0.28 - 0.06, 0.02, PAL.iron, P(px * w / 4, n, 0.08 + py * h * 0.3 + h * 0.14, { b: 0.008, vary: 0.04 }));
      for (let i = 0; i < 5; i++) for (const yy of [0.04, h - 0.04]) k.ball(0.016, PAL.steel, P(-w / 2 + 0.06 + i * (w - 0.12) / 4, f * (t / 2 + 0.008), yy, { detail: 0 }));
      if (hx !== null) k.bevel(0.03, 0.16, 0.03, PAL.steel, P(hx, f * (t / 2 + 0.035), 0.5, { b: 0.008 }));
    }
    k.box(0.28, 0.15, t + 0.004, '#0b0a09', P(0, 0, h * 0.8));
    for (const b of [-0.09, 0, 0.09]) k.box(0.022, 0.15, 0.022, PAL.steel, P(b, 0, h * 0.8));
    return;
  }
  k.box(w, h, t * 0.5, PAL.woodDD, P(0, 0, h / 2));
  const n = Math.max(2, Math.round(w / 0.2)), pw = w / n;
  for (let i = 0; i < n; i++) {
    const ph = h - (rnd() < 0.35 ? 0.02 : 0);
    k.bevel(pw - 0.012, ph, t, i % 2 ? PAL.wood : PAL.plank, P(-w / 2 + pw * (i + 0.5), 0, ph / 2, { b: 0.012, vary: 0.08 }));
  }
  for (const f of faces) {
    const n0 = f * (t / 2 + 0.008);
    for (const yy of [0.2, h - 0.22]) {
      k.bevel(w - 0.08, 0.06, 0.016, PAL.ironD, P(0, n0, yy, { b: 0.006 }));
      k.torus(0.04, 0.012, PAL.ironD, { ...P(-w / 2 + 0.08, n0, yy), rseg: 3, tseg: 7, arc: Math.PI * 1.4 }); // hinge curl
      for (let i = 0; i < 3; i++) k.ball(0.014, PAL.steel, P(-w / 2 + 0.17 + i * (w - 0.28) / 2, f * (t / 2 + 0.018), yy, { detail: 0 }));
    }
    if (hx !== null) {
      k.bevel(0.08, 0.1, 0.012, PAL.ironD, P(hx, f * (t / 2 + 0.006), 0.53, { b: 0.004 }));
      k.torus(0.04, 0.01, PAL.steel, { ...P(hx, f * (t / 2 + 0.02), 0.48), rseg: 3, tseg: 8 });
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

// A door that isn't set between two walls (painted on the floor in front of
// one) is drawn in that wall's face, flush against it.
function wallDoor(c, k, open) {
  const between = (inWallLine(c.at(-1, 0)) && inWallLine(c.at(1, 0))) || (inWallLine(c.at(0, -1)) && inWallLine(c.at(0, 1)));
  if (between) return false;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const d = dirs.find(([dx, dy]) => isWallChar(c.at(dx, dy))) || [0, 1];
  const axis = d[1] ? 'x' : 'z';
  const off = 0.5 - 0.05;
  const anc = { ax: c.cx + d[0], az: c.cz + d[1] }; // drops with the wall it hangs on
  const at = (u, n = 0) => ({ ...(axis === 'x' ? { x: c.cx + u, z: c.cz + d[1] * (off - n) } : { x: c.cx + d[0] * (off - n), z: c.cz + u }), ...anc });
  const dims = (w, h, t) => (axis === 'x' ? [w, h, t] : [t, h, w]);
  for (const u of [-0.42, 0.42]) {
    for (let i = 0; i < 4; i++) {
      const qh = (DOOR_H + 0.1) / 4, big = (i + (u > 0 ? 1 : 0)) % 2 === 0;
      k.bevel(...dims(big ? 0.14 : 0.11, qh - 0.015, 0.11), big ? PAL.stoneL : PAL.stone, { ...at(u + (big ? 0 : Math.sign(u) * -0.015)), y: i * qh + qh / 2, b: 0.018, vary: 0.08 });
    }
  }
  k.bevel(...dims(0.98, 0.14, 0.12), PAL.stone, { ...at(0), y: DOOR_H + 0.17, b: 0.02, vary: 0.05 });
  k.bevel(...dims(0.16, 0.2, 0.14), PAL.stoneL, { ...at(0), y: DOOR_H + 0.17, b: 0.02 });
  k.bevel(...dims(0.74, 0.07, 0.09), PAL.woodD, { ...at(0, 0.01), y: DOOR_H + 0.035, b: 0.012 });
  k.bevel(...dims(0.76, 0.04, 0.16), PAL.stoneD, { ...at(0, -0.02), y: 0.02, b: 0.012 }); // step
  const ry = axis === 'x' ? 0 : Math.PI / 2;
  const front = axis === 'x' ? -d[1] : -d[0];
  if (open) {
    k.box(...dims(0.7, DOOR_H, 0.04), '#0d0a08', { ...at(0, 0.02), y: DOOR_H / 2 });
    const sx = axis === 'x' ? { x: c.cx - 0.33, z: c.cz + d[1] * (off - 0.37) } : { x: c.cx + d[0] * (off - 0.37), z: c.cz - 0.33 };
    doorLeaf(k, { ...sx, ry: ry + Math.PI / 2, w: 0.7, t: 0.07, anc, rnd: c.rnd });
  } else {
    const p = at(0, 0.02);
    doorLeaf(k, { x: p.x, z: p.z, ry, w: 0.7, t: 0.05, anc, faces: [front], handle: 0.22, rnd: c.rnd });
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
  // hinged on the -side jamb, swung 90 degrees into the room
  const s = swingSide(c, axis);
  const hinge = -0.33, len = DOOR_W;
  const anc = { ax: c.cx, az: c.cz };
  if (axis === 'x') doorLeaf(k, { x: c.cx + hinge + 0.045, z: c.cz + s * len / 2, ry: Math.PI / 2, w: len, anc, rnd: c.rnd });
  else doorLeaf(k, { x: c.cx + s * len / 2, z: c.cz + hinge + 0.045, ry: 0, w: len, anc, rnd: c.rnd });
};
P.L = (c, k) => {
  // Iron door: all of it in the wall mesh, so it drops with the wall.
  const axis = doorAxis(c);
  doorFrame(c, k, axis, PAL.ironD);
  doorLeaf(k, { x: c.cx, z: c.cz, ry: axis === 'x' ? 0 : Math.PI / 2, w: DOOR_W, t: 0.11, iron: true, handle: 0.22 });
};
P.S = (c, k, m, g) => {
  // Players see wall; the DM sees the same wall with a faint seam of light.
  wallStone(c, k);
  if (c.dmView) {
    const axis = doorAxis(c);
    g.box(axis === 'x' ? 0.68 : 0.03, 0.92, axis === 'x' ? 0.03 : 0.68, PAL.sky, { x: c.cx, y: 0.6, z: c.cz + (axis === 'x' ? 0.52 : 0) });
  }
};

P['<'] = (c, k) => {
  // A flight of chunky dressed steps rising toward the wall behind, between
  // cheek walls with a sloped coping and a newel block at the foot.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  const N = 5;
  for (let i = 0; i < N; i++) {
    const top = 0.14 + i * 0.13, lz = 0.4 - i * 0.2;
    k.box(0.8, top - 0.04, 0.2, PAL.stoneD, { ...at(0, lz - 0.01), y: (top - 0.04) / 2, ry });
    k.bevel(0.82, 0.07, 0.23, i % 2 ? PAL.stone : PAL.stoneL, { ...at(0, lz + 0.01), y: top - 0.035, ry, b: 0.022, vary: 0.06 }); // the tread, nosed
    for (const s of [-1, 1]) k.bevel(0.08, top + 0.12, 0.2, PAL.stoneD, { ...at(s * 0.45, lz), y: (top + 0.12) / 2, ry, b: 0.015, vary: 0.06 });
  }
  for (const s of [-1, 1]) {
    const a = at(s * 0.45, 0.5), b = at(s * 0.45, -0.5);
    k.limb([a.x, 0.27, a.z], [b.x, 0.8, b.z], 0.05, 0.05, PAL.stone, { seg: 4, joint: false });
    k.bevel(0.12, 0.34, 0.12, PAL.stoneL, { ...at(s * 0.45, 0.46), y: 0.17, ry, b: 0.02 }); // newel
    k.bevel(0.15, 0.05, 0.15, PAL.stone, { ...at(s * 0.45, 0.46), y: 0.36, ry, b: 0.015 });
  }
};
P['>'] = (c, k) => {
  // Steps going down into the dark (the floor is cut open over this square).
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const d = dirs.find(([dx, dy]) => isWallChar(c.at(dx, dy)) && !isWallChar(c.at(-dx, -dy))) || dirs.find(([dx, dy]) => !isWallChar(c.at(-dx, -dy))) || [0, 1];
  const ry = Math.atan2(-d[0], -d[1]); // local +z: toward the way in
  const at = L(c.cx, c.cz, ry);
  const B = -0.245;
  k.box(0.998, 0.01, 0.998, '#050403', { x: c.cx, y: B + 0.005, z: c.cz });
  for (const s of [-1, 1]) k.box(0.07, -B, 0.998, shade(PAL.stoneDD, 0.4), { ...at(s * 0.464, 0), y: B / 2, ry });
  k.box(0.86, -B, 0.06, shade(PAL.stoneDD, 0.55), { ...at(0, -0.47), y: B / 2, ry });
  for (let i = 0; i < 4; i++) {
    const top = -0.05 - i * 0.045, lz = 0.36 - i * 0.2;
    k.box(0.86, top - B, 0.2, shade(PAL.stoneD, 0.15 + i * 0.12), { ...at(0, lz), y: (top + B) / 2, ry });
    k.box(0.86, 0.02, 0.035, shade(PAL.stone, i * 0.12), { ...at(0, lz + 0.085), y: top - 0.01, ry });
  }
  // a kerb of stone round three sides of the opening
  for (const s of [-1, 1]) k.bevel(0.1, 0.07, 1.0, PAL.stone, { ...at(s * 0.455, 0), y: 0.035, ry, b: 0.02, vary: 0.05 });
  k.bevel(0.82, 0.07, 0.1, PAL.stone, { ...at(0, -0.455), y: 0.035, ry, b: 0.02, vary: 0.05 });
};
P.H = (c, k) => {
  // A ladder of stout poles with lashed rungs, leaning on the wall if there is one.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  const z0 = f ? -0.1 : 0, z1 = f ? -0.42 : 0, top = 1.55;
  const pt = (lx, t) => { const p = at(lx, z0 + (z1 - z0) * t); return [p.x, t * top, p.z]; };
  for (const s of [-0.22, 0.22]) k.limb(pt(s, 0), pt(s, 1.04), 0.036, 0.03, PAL.woodL, { seg: 5, joint: false, vary: 0.05 });
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + i * 0.16;
    k.limb(pt(-0.25, t), pt(0.25, t), 0.022, 0.022, PAL.wood, { seg: 5, joint: false });
    for (const s of [-0.22, 0.22]) { const p = pt(s, t); k.cyl(0.045, 0.045, 0.05, PAL.rope, { x: p[0], y: p[1], z: p[2], seg: 5 }); }
  }
};

// A bridge: decks of neighbouring bridge squares join into one span. Thick
// planks run across the way you walk on two stringers; rails stand only on
// sides that face water (or a drop), on posts driven into the bed.
const isBridge = (ch) => ch === '/';
const isWet = (ch) => ch === '~' || ch === 'q' || ch === 'l' || TILES[ch]?.void;
P['/'] = (c, k) => {
  const wetNS = isWet(c.at(0, -1)) || isWet(c.at(0, 1));
  const wetEW = isWet(c.at(-1, 0)) || isWet(c.at(1, 0));
  const along = wetEW && !wetNS ? 'z' : wetNS && !wetEW ? 'x' : (isBridge(c.at(0, -1)) || isBridge(c.at(0, 1)) ? 'z' : 'x');
  const deckY = 0.1;
  for (let i = 0; i < 5; i++) {
    const u = -0.5 + (i + 0.5) / 5;
    const len = 1.0 - c.rnd() * 0.05, wid = 1 / 5 - 0.016;
    const sag = (c.rnd() - 0.5) * 0.014, th = 0.06;
    const col = [PAL.wood, PAL.plank, PAL.woodL][i % 3];
    const o = { y: deckY + sag, ry: (c.rnd() - 0.5) * 0.04, b: 0.014, vary: 0.08 };
    if (along === 'z') k.bevel(len, th, wid, col, { x: c.cx, z: c.cz + u, ...o });
    else k.bevel(wid, th, len, col, { x: c.cx + u, z: c.cz, ...o });
    for (const e of [-0.4, 0.4]) {
      const nx = along === 'z' ? c.cx + e : c.cx + u, nz = along === 'z' ? c.cz + u : c.cz + e;
      k.ball(0.014, PAL.ironD, { x: nx, y: deckY + sag + th / 2, z: nz, detail: 0 });
    }
  }
  const sides = along === 'z' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
  for (const [dx, dy] of sides) {
    const edge = !isBridge(c.at(dx, dy));
    const ox = dx * 0.4, oz = dy * 0.4;
    k.box(along === 'z' ? 0.12 : 1, 0.12, along === 'z' ? 1 : 0.12, PAL.woodDD, { x: c.cx + ox, y: deckY - 0.09, z: c.cz + oz });
    if (!edge || !isWet(c.at(dx, dy))) continue;
    for (const t of [-0.42, 0.42]) {
      const px = c.cx + ox * 1.1 + (along === 'x' ? t : 0), pz = c.cz + oz * 1.1 + (along === 'z' ? t : 0);
      k.bevel(0.09, 0.62, 0.09, PAL.woodD, { x: px, y: deckY + 0.24, z: pz, b: 0.016, vary: 0.05 });
      k.cone(0.07, 0.07, PAL.woodD, { x: px, y: deckY + 0.585, z: pz, seg: 4, ry: Math.PI / 4 });
      k.box(0.1, 0.5, 0.1, PAL.woodDD, { x: px, y: -0.2, z: pz });
      k.cyl(0.06, 0.06, 0.05, PAL.rope, { x: px, y: deckY + 0.43, z: pz, seg: 5 });
    }
    k.bevel(along === 'z' ? 0.07 : 1, 0.06, along === 'z' ? 1 : 0.07, PAL.woodL, { x: c.cx + ox * 1.1, y: deckY + 0.5, z: c.cz + oz * 1.1, b: 0.015, vary: 0.05 });
    k.limb([c.cx + ox * 1.1 - (along === 'x' ? 0.42 : 0), deckY + 0.44, c.cz + oz * 1.1 - (along === 'z' ? 0.42 : 0)], [c.cx + ox * 1.1 + (along === 'x' ? 0.42 : 0), deckY + 0.08, c.cz + oz * 1.1 + (along === 'z' ? 0.42 : 0)], 0.025, 0.025, PAL.wood, { seg: 4, joint: false }); // a diagonal brace
  }
};

// Bones on an old floor: chunky little bones (a shaft with knobbly ends),
// sparse, and now and then a skull, so it reads as an old crypt.
export function floorBones(c, k) {
  if (c.rnd() > 0.45) return;
  const n = 1 + Math.floor(c.rnd() * 2);
  for (let i = 0; i < n; i++) {
    const x = c.x0 + 0.2 + c.rnd() * 0.6, z = c.z0 + 0.2 + c.rnd() * 0.6, a = c.rnd() * Math.PI, len = 0.18 + c.rnd() * 0.1;
    const dx = Math.cos(a) * len / 2, dz = Math.sin(a) * len / 2;
    k.limb([x - dx, 0.02, z - dz], [x + dx, 0.02, z + dz], 0.015, 0.015, PAL.bone, { seg: 5, joint: false });
    for (const sd of [-1, 1]) for (const o of [-1, 1]) k.ball(0.018, PAL.bone, { x: x + sd * dx + o * Math.sin(a) * 0.012, y: 0.022, z: z + sd * dz - o * Math.cos(a) * 0.012, detail: 0 });
  }
  if (c.rnd() < 0.2) {
    const x = c.x0 + 0.3 + c.rnd() * 0.4, z = c.z0 + 0.3 + c.rnd() * 0.4, ry = c.rnd() * TAU;
    const at = L(x, z, ry);
    k.sphere(0.06, PAL.bone, { x, y: 0.055, z, sy: 0.9, seg: 8 });
    k.bevel(0.07, 0.04, 0.05, PAL.boneD, { ...at(0, 0.04), y: 0.025, ry, b: 0.01 }); // jaw
    for (const sd of [-1, 1]) k.ball(0.016, PAL.ink, { ...at(sd * 0.022, 0.05), y: 0.065, detail: 0 });
  }
}

/* ---------------- table dressing ---------------- */
const tankard = (k, m, x, y, z, ry) => {
  k.cyl(0.05, 0.056, 0.12, PAL.wood, { x, y: y + 0.06, z, seg: 8, vary: 0.08 });
  for (const yy of [0.025, 0.1]) m.cyl(0.058, 0.058, 0.018, PAL.ironD, { x, y: y + yy, z, seg: 8, open: true });
  k.cyl(0.044, 0.044, 0.01, PAL.cream, { x, y: y + 0.118, z, seg: 8 }); // a head of foam
  k.torus(0.036, 0.011, PAL.woodD, { x: x + Math.cos(ry) * 0.065, y: y + 0.065, z: z - Math.sin(ry) * 0.065, ry, arc: Math.PI, rz: -Math.PI / 2, rseg: 3, tseg: 5 });
};
const plate = (k, x, y, z, rnd) => {
  k.cyl(0.12, 0.1, 0.018, PAL.wool, { x, y: y + 0.009, z, seg: 10 });
  const r = rnd();
  if (r < 0.35) k.sphere(0.075, PAL.ochre, { x, y: y + 0.035, z, sx: 1.3, sy: 0.6, seg: 7, vary: 0.08 }); // a loaf
  else if (r < 0.6) { k.ball(0.04, PAL.crimson, { x: x - 0.035, y: y + 0.05, z, detail: 0 }); k.ball(0.036, PAL.leafL, { x: x + 0.04, y: y + 0.046, z: z + 0.02, detail: 0 }); }
  else if (r < 0.8) k.bevel(0.11, 0.05, 0.07, PAL.mustard, { x, y: y + 0.04, z, ry: rnd() * 3, b: 0.012, taper: 0.3 }); // a wedge of cheese
};
const candle = (c, k, m, x, y, z, h = 0.11) => {
  m.cyl(0.055, 0.06, 0.018, PAL.brass, { x, y: y + 0.009, z, seg: 8 });
  k.cyl(0.026, 0.028, h, PAL.cream, { x, y: y + 0.018 + h / 2, z, seg: 6 });
  k.box(0.014, 0.035, 0.014, PAL.linen, { x: x + 0.024, y: y + h - 0.01, z }); // a drip
  c.emit({ kind: 'candle', x, y: y + h + 0.08, z });
};
const bottle = (k, x, y, z, col, squat) => {
  const bh = squat ? 0.1 : 0.16;
  k.cyl(squat ? 0.06 : 0.042, squat ? 0.065 : 0.046, bh, col, { x, y: y + bh / 2, z, seg: 6, vary: 0.08 });
  k.cyl(0.018, squat ? 0.034 : 0.026, 0.07, col, { x, y: y + bh + 0.035, z, seg: 5 });
  k.cyl(0.02, 0.02, 0.025, PAL.sand, { x, y: y + bh + 0.08, z, seg: 5 }); // cork
};
const BOTTLES = [PAL.forest, PAL.crimson, PAL.ochre, PAL.navy, PAL.teal, PAL.plum];

/* ---------------- furniture ---------------- */
P.t = (c, k, m) => {
  // A round tavern table: a thick top with a darker rim, a fat turned
  // pedestal, four chunky feet.
  const { cx, cz } = c;
  k.cyl(0.41, 0.41, 0.07, PAL.woodL, { x: cx, y: 0.525, z: cz, seg: 12, vary: 0.04 });
  k.cyl(0.42, 0.4, 0.045, PAL.woodD, { x: cx, y: 0.47, z: cz, seg: 12 }); // rim
  for (const s of [-0.14, 0.14]) k.box(0.014, 0.004, 0.76, PAL.woodD, { x: cx + s, y: 0.561, z: cz }); // board seams
  k.cyl(0.07, 0.09, 0.36, PAL.woodD, { x: cx, y: 0.27, z: cz, seg: 7 });
  k.sphere(0.1, PAL.wood, { x: cx, y: 0.2, z: cz, sy: 0.7, seg: 7 }); // the turned knop
  k.cyl(0.11, 0.08, 0.05, PAL.wood, { x: cx, y: 0.43, z: cz, seg: 7 });
  const a0 = c.rnd() * Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * Math.PI / 2, at = L(cx, cz, a);
    k.bevel(0.34, 0.08, 0.09, PAL.woodD, { ...at(0.16, 0), y: 0.045, ry: a, b: 0.018, taper: 0.2, taperZ: 0 });
  }
  tankard(k, m, cx + 0.15, 0.56, cz - 0.08, c.rnd() * TAU);
  if (c.rnd() < 0.45) plate(k, cx - 0.06, 0.56, cz - 0.17, c.rnd);
  if (c.rnd() < 0.5) candle(c, k, m, cx - 0.12, 0.56, cz + 0.13);
};
P['2'] = (c, k, m) => {
  // A long trestle table: three thick boards along the run with breadboard
  // ends, on A-shaped trestles at the ends of the run (and every other middle
  // square), joined by a stretcher.
  const ax = c.at(1, 0) === '2' || c.at(-1, 0) === '2' ? 'x' : 'z';
  const ry = ax === 'x' ? 0 : Math.PI / 2;
  const at = L(c.cx, c.cz, ry);
  const nb = (s) => c.at(Math.round(Math.cos(ry) * s), Math.round(-Math.sin(ry) * s)) === '2';
  const prev = nb(-1), next = nb(1);
  for (const [i, lz] of [[0, -0.24], [1, 0], [2, 0.24]]) k.bevel(1.0, 0.07, 0.235, i === 1 ? PAL.woodL : PAL.plank, { ...at(0, lz), y: 0.5, ry, b: 0.016, vary: 0.05 });
  for (const [has, s] of [[!prev, -1], [!next, 1]]) if (has) k.bevel(0.08, 0.075, 0.74, PAL.wood, { ...at(s * 0.47, 0), y: 0.5, ry, b: 0.018 });
  k.box(1.0, 0.06, 0.07, PAL.woodD, { ...at(0, 0), y: 0.15, ry }); // stretcher
  let idx = 0; for (let i = 1; i < 30 && c.at(Math.round(Math.cos(ry) * -i), Math.round(-Math.sin(ry) * -i)) === '2'; i++) idx = i;
  const legsAt = [];
  if (!prev) legsAt.push(-0.38);
  if (!next) legsAt.push(0.38);
  if (prev && next && idx % 2 === 1) legsAt.push(0);
  for (const lx of legsAt) {
    for (const s of [-1, 1]) {
      const top = at(lx, s * 0.08), foot = at(lx, s * 0.3);
      k.limb([foot.x, 0.04, foot.z], [top.x, 0.45, top.z], 0.04, 0.035, PAL.woodD, { seg: 5, joint: false });
    }
    k.bevel(0.09, 0.08, 0.7, PAL.woodD, { ...at(lx, 0), y: 0.04, ry, b: 0.018 }); // foot
    k.bevel(0.09, 0.06, 0.58, PAL.wood, { ...at(lx, 0), y: 0.44, ry, b: 0.015 }); // cleat under the top
    k.ball(0.022, PAL.woodDD, { ...at(lx, 0), y: 0.15, detail: 0 }); // the wedge peg
  }
  { const p = at(-0.15 + c.rnd() * 0.3, -0.12); plate(k, p.x, 0.535, p.z, c.rnd); }
  if (c.rnd() < 0.5) { const p = at(0.25, 0.14); tankard(k, m, p.x, 0.535, p.z, c.rnd() * TAU); }
  if (c.rnd() < 0.25) { const p = at(-0.3, 0.16); candle(c, k, m, p.x, 0.535, p.z, 0.13); }
};
P['1'] = (c, k) => {
  // A sturdy chair facing the nearest table: thick seat, square legs, a back
  // of two broad rails, knobbed posts.
  let ry = c.rnd() * TAU;
  for (const [dx, dy, a] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]]) {
    const n = c.at(dx, dy);
    if (n === 't' || n === '2' || n === '3') { ry = a; break; }
  }
  const at = L(c.cx, c.cz, ry);
  const SY = 0.3;
  k.bevel(0.4, 0.06, 0.38, PAL.wood, { ...at(0, 0.01), y: SY, ry, b: 0.018, vary: 0.05 });
  for (const s of [-1, 1]) {
    k.box(0.055, SY, 0.055, PAL.woodD, { ...at(s * 0.155, 0.15), y: SY / 2, ry });
    k.box(0.06, 0.86, 0.06, PAL.woodD, { ...at(s * 0.155, -0.155), y: 0.43, ry });
    k.ball(0.04, PAL.woodL, { ...at(s * 0.155, -0.155), y: 0.89, detail: 0 }); // finial
    k.box(0.035, 0.035, 0.3, PAL.woodDD, { ...at(s * 0.155, 0), y: 0.1, ry }); // stretcher
  }
  k.bevel(0.34, 0.11, 0.045, PAL.woodL, { ...at(0, -0.16), y: 0.76, ry, b: 0.014, vary: 0.04 });
  k.bevel(0.32, 0.07, 0.04, PAL.wood, { ...at(0, -0.16), y: 0.56, ry, b: 0.012 });
  if (c.rnd() < 0.35) k.bevel(0.32, 0.045, 0.3, pick(c, [PAL.crimson, PAL.navy, PAL.moss, PAL.plum]), { ...at(0, 0.02), y: SY + 0.05, ry, b: 0.02, vary: 0.05 }); // cushion
};
P['3'] = (c, k, m) => {
  // A bar counter: plinth, a front of sunk panels between posts, an
  // overhanging top with a rounded lip, a brass foot rail, bottles.
  const ax = c.at(0, 1) === '3' || c.at(0, -1) === '3' ? 'z' : 'x';
  const ry = ax === 'x' ? (isWallChar(c.at(0, 1)) ? Math.PI : 0) : (isWallChar(c.at(1, 0)) ? -Math.PI / 2 : Math.PI / 2);
  const at = L(c.cx, c.cz, ry);
  const nb = (s) => c.at(Math.round(Math.cos(ry) * s), Math.round(-Math.sin(ry) * s)) === '3';
  k.box(1.01, 0.09, 0.52, PAL.woodDD, { ...at(0, -0.02), y: 0.045, ry });
  k.box(1.01, 0.56, 0.52, PAL.woodD, { ...at(0, 0), y: 0.37, ry });
  for (const f of [1, -1]) {
    for (const lx of [-0.25, 0.25]) k.bevel(0.36, 0.36, 0.03, PAL.wood, { ...at(lx, f * 0.265), y: 0.37, ry, b: 0.015, vary: 0.05 });
    for (const lx of [-0.49, 0, 0.49]) k.box(0.06, 0.52, 0.04, PAL.woodDD, { ...at(lx, f * 0.27), y: 0.37, ry });
  }
  for (const [has, s] of [[!nb(-1), -1], [!nb(1), 1]]) if (has) k.bevel(0.03, 0.4, 0.4, PAL.wood, { ...at(s * 0.51, 0), y: 0.37, ry, b: 0.012 });
  k.bevel(1.04, 0.075, 0.72, PAL.woodL, { ...at(0, 0.03), y: 0.685, ry, b: 0.022, vary: 0.04 });
  const r0 = at(-0.5, 0.36), r1 = at(0.5, 0.36);
  m.limb([r0.x, 0.13, r0.z], [r1.x, 0.13, r1.z], 0.02, 0.02, PAL.brass, { seg: 6, joint: false });
  m.bevel(0.035, 0.06, 0.12, PAL.brass, { ...at(0, 0.31), y: 0.12, ry, b: 0.008 });
  const n = 1 + Math.floor(c.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const p = at(-0.38 + (i + c.rnd() * 0.6) * (0.76 / n), -0.12 + c.rnd() * 0.18);
    bottle(k, p.x, 0.72, p.z, pick(c, BOTTLES), c.rnd() < 0.35);
  }
  if (c.rnd() < 0.5) { const p = at(0.3, 0.2); tankard(k, m, p.x, 0.72, p.z, c.rnd() * TAU); }
  if (c.rnd() < 0.3) k.bevel(0.15, 0.015, 0.1, PAL.linen, { ...at(-0.2, 0.22), y: 0.73, ry: ry + c.rnd(), b: 0.006 }); // a rag
};
P.E = (c, k) => {
  // A bed: chunky corner posts with knobs, a high headboard, a plump
  // mattress, a quilt with a stripe turned down over the sheet, a pillow.
  const ax = c.at(0, 1) === 'E' || c.at(0, -1) === 'E' ? 'z' : 'x';
  let ry = ax === 'x' ? 0 : -Math.PI / 2; // head at local -x
  const headDir = ax === 'x' ? [-1, 0] : [0, -1];
  if (!isWallChar(c.at(...headDir)) && isWallChar(c.at(-headDir[0], -headDir[1]))) ry += Math.PI;
  const at = L(c.cx, c.cz, ry);
  const quilt = pick(c, [PAL.crimson, PAL.navy, PAL.moss, PAL.ochre, PAL.plum]);
  for (const [lx, hh] of [[-0.44, 0.66], [0.44, 0.42]]) {
    for (const s of [-1, 1]) {
      k.bevel(0.08, hh, 0.08, PAL.woodD, { ...at(lx, s * 0.32), y: hh / 2, ry, b: 0.014 });
      k.ball(0.05, PAL.wood, { ...at(lx, s * 0.32), y: hh + 0.02, detail: 0 });
    }
    k.bevel(0.05, hh - 0.2, 0.58, PAL.wood, { ...at(lx, 0), y: 0.18 + (hh - 0.24) / 2, ry, b: 0.014, vary: 0.04 });
  }
  for (const s of [-1, 1]) k.bevel(0.84, 0.11, 0.05, PAL.woodD, { ...at(0, s * 0.32), y: 0.2, ry, b: 0.012 });
  k.bevel(0.84, 0.14, 0.6, PAL.linen, { ...at(0, 0), y: 0.31, ry, b: 0.04 });
  k.bevel(0.58, 0.07, 0.66, quilt, { ...at(0.12, 0), y: 0.38, ry, b: 0.03, vary: 0.05 });
  k.box(0.06, 0.072, 0.664, tint(quilt, 0.35), { ...at(-0.02, 0), y: 0.382, ry }); // the stripe
  k.bevel(0.1, 0.075, 0.64, PAL.cream, { ...at(-0.2, 0), y: 0.375, ry, b: 0.03 }); // turned-down sheet
  k.bevel(0.16, 0.08, 0.42, PAL.cream, { ...at(-0.33, 0), y: 0.41, ry, b: 0.035 }); // pillow
};
P.F = (c, k, m) => {
  // A bookcase against the wall: thick sides, shelves, a crown with a
  // cornice and a plinth; rows of books of a few heights, a stack lying
  // flat, now and then a candle or a skull-less curio (a jar).
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const push = f ? 0.25 : 0;
  const at = L(c.cx + (f ? f.dx * push : 0), c.cz + (f ? f.dy * push : 0), ry);
  const H = 1.5, D = 0.42;
  k.box(0.9, H - 0.1, 0.03, PAL.woodDD, { ...at(0, -D / 2 + 0.02), y: H / 2, ry });
  for (const s of [-1, 1]) k.bevel(0.07, H, D, PAL.woodD, { ...at(s * 0.46, 0), y: H / 2, ry, b: 0.015, vary: 0.04 });
  k.bevel(1.04, 0.08, D + 0.06, PAL.wood, { ...at(0, 0.02), y: H + 0.04, ry, b: 0.02 });
  k.bevel(0.98, 0.12, D, PAL.woodDD, { ...at(0, 0.005), y: 0.06, ry, b: 0.015 });
  const BOOK = [PAL.crimson, PAL.navy, PAL.forest, PAL.ochre, PAL.plum, PAL.umber, PAL.teal];
  const rows = [0.12, 0.48, 0.84, 1.2];
  rows.forEach((sy, ri) => {
    if (ri) k.bevel(0.88, 0.04, D - 0.03, PAL.woodD, { ...at(0, 0), y: sy - 0.02, ry, b: 0.01 });
    let x = -0.42;
    while (x < 0.4) {
      const r = c.rnd();
      if (r < 0.08) { x += 0.06 + c.rnd() * 0.05; continue; }
      if (r < 0.15 && x < 0.2) {
        const nn = 2 + Math.floor(c.rnd() * 2);
        for (let i = 0; i < nn; i++) k.box(0.18 - i * 0.02, 0.04, 0.22 - i * 0.01, pick(c, BOOK), { ...at(x + 0.1, 0.02), y: sy + 0.02 + i * 0.041, ry: ry + (c.rnd() - 0.5) * 0.3, vary: 0.1 });
        x += 0.22; continue;
      }
      if (r < 0.19 && x < 0.3) {
        k.cyl(0.05, 0.05, 0.12, pick(c, [PAL.waterL, PAL.leafL, PAL.ochre]), { ...at(x + 0.06, 0.02), y: sy + 0.06, seg: 6 });
        k.cyl(0.035, 0.035, 0.03, PAL.leather, { ...at(x + 0.06, 0.02), y: sy + 0.135, seg: 6 });
        x += 0.13; continue;
      }
      const w = 0.045 + c.rnd() * 0.035, h = 0.2 + c.rnd() * 0.1;
      if (x + w > 0.42) break;
      const lean = c.rnd() < 0.08 ? 0.25 : 0;
      const col = pick(c, BOOK);
      k.box(w, h, 0.24, col, { ...at(x + w / 2 + lean * 0.08, 0.02), y: sy + h / 2, ry, rz: -lean, vary: 0.1 });
      if (c.rnd() < 0.35) m.box(w + 0.004, 0.014, 0.006, PAL.gold, { ...at(x + w / 2 + lean * 0.08, 0.142), y: sy + h * 0.78, ry, rz: -lean }); // gilt band
      x += w + 0.005 + lean * 0.12;
    }
  });
};
P.R = (c, k, m) => {
  // A weapon rack: footed posts, a notched top rail, a drip tray, and a mix
  // of swords, spears and axes — each blade with a bright edge.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx + (f ? f.dx * 0.2 : 0), c.cz + (f ? f.dy * 0.2 : 0), ry);
  for (const s of [-0.42, 0.42]) {
    k.bevel(0.08, 1.06, 0.08, PAL.wood, { ...at(s, 0), y: 0.53, ry, b: 0.014, vary: 0.04 });
    k.bevel(0.1, 0.07, 0.38, PAL.woodD, { ...at(s, 0), y: 0.035, ry, b: 0.015 });
    k.cone(0.06, 0.07, PAL.woodD, { ...at(s, 0), y: 1.095, seg: 4, ry: ry + Math.PI / 4 });
  }
  k.bevel(0.92, 0.08, 0.1, PAL.woodD, { ...at(0, 0), y: 0.98, ry, b: 0.016 });
  k.bevel(0.92, 0.07, 0.18, PAL.woodD, { ...at(0, 0), y: 0.16, ry, b: 0.016 });
  for (let i = 0; i < 4; i++) {
    const lx = -0.27 + i * 0.18, p = at(lx, (c.rnd() - 0.5) * 0.03), kind = c.rnd();
    if (kind < 0.45) { // a sword, point down
      m.bevel(0.055, 0.62, 0.016, PAL.steel, { ...p, y: 0.5, ry, b: 0.006, vary: 0.05 });
      m.bevel(0.18, 0.03, 0.04, PAL.brass, { ...p, y: 0.83, ry, b: 0.008 });
      k.cyl(0.018, 0.018, 0.13, PAL.leatherD, { ...p, y: 0.91, seg: 5 });
      m.ball(0.03, PAL.brass, { ...p, y: 0.99, detail: 0 });
    } else if (kind < 0.75) { // a spear
      k.cyl(0.018, 0.02, 1.15, PAL.woodL, { ...p, y: 0.6, seg: 5 });
      m.cone(0.04, 0.19, PAL.steelL, { ...p, y: 1.27, seg: 4, ry });
      m.cyl(0.024, 0.024, 0.05, PAL.ironD, { ...p, y: 1.17, seg: 5 });
    } else { // an axe, head up
      k.cyl(0.02, 0.022, 0.85, PAL.woodL, { ...p, y: 0.47, seg: 5 });
      m.bevel(0.13, 0.15, 0.022, PAL.steel, { ...at(lx + 0.07, 0), y: 0.82, ry, b: 0.006, taper: -0.3, taperZ: 0 });
      m.box(0.025, 0.19, 0.024, PAL.steelL, { ...at(lx + 0.14, 0), y: 0.82, ry }); // bright edge
    }
  }
};
P.J = (c, k, m) => {
  // A throne facing the room: a stone step, a heavy carved frame with a
  // stepped crest, plush red seat and back, gilt trims and lion-paw feet.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : Math.PI;
  const at = L(c.cx + (f ? f.dx * 0.06 : 0), c.cz + (f ? f.dy * 0.06 : 0), ry);
  const FRAME = shade(PAL.crimson, 0.35), PAD = PAL.crimson;
  k.bevel(0.94, 0.1, 0.86, PAL.stoneD, { ...at(0, 0), y: 0.05, ry, b: 0.025, vary: 0.04 });
  k.bevel(0.72, 0.34, 0.6, FRAME, { ...at(0, 0.03), y: 0.27, ry, b: 0.03 });
  m.box(0.74, 0.035, 0.02, PAL.gold, { ...at(0, 0.335), y: 0.43, ry });
  k.bevel(0.58, 0.1, 0.52, PAD, { ...at(0, 0.05), y: 0.48, ry, b: 0.04, vary: 0.04 });
  k.bevel(0.74, 1.18, 0.14, FRAME, { ...at(0, -0.26), y: 0.99, ry, b: 0.03 });
  k.bevel(0.52, 0.8, 0.06, PAD, { ...at(0, -0.18), y: 0.95, ry, b: 0.03, vary: 0.04 });
  for (let i = 0; i < 4; i++) k.ball(0.02, PAL.gold, { ...at(0, -0.15), y: 0.68 + i * 0.18, detail: 0 }); // buttons
  k.bevel(0.56, 0.14, 0.15, FRAME, { ...at(0, -0.26), y: 1.64, ry, b: 0.03 });
  k.bevel(0.32, 0.12, 0.15, FRAME, { ...at(0, -0.26), y: 1.77, ry, b: 0.03 });
  m.bevel(0.76, 0.035, 0.16, PAL.gold, { ...at(0, -0.26), y: 1.57, ry, b: 0.01 });
  m.bevel(0.34, 0.03, 0.17, PAL.gold, { ...at(0, -0.26), y: 1.84, ry, b: 0.01 });
  m.ball(0.06, PAL.gold, { ...at(0, -0.26), y: 1.9, detail: 0 });
  for (const s of [-1, 1]) {
    m.ball(0.055, PAL.gold, { ...at(s * 0.35, -0.26), y: 1.62, detail: 0 });
    k.bevel(0.1, 0.26, 0.58, FRAME, { ...at(s * 0.37, 0.02), y: 0.56, ry, b: 0.025 });
    m.bevel(0.12, 0.035, 0.6, PAL.gold, { ...at(s * 0.37, 0.02), y: 0.7, ry, b: 0.01 });
    m.sphere(0.07, PAL.gold, { ...at(s * 0.37, 0.31), y: 0.63, seg: 7, sx: 0.8 }); // scrolled arm-ends
    for (const lz of [-0.24, 0.28]) m.sphere(0.055, PAL.gold, { ...at(s * 0.31, lz), y: 0.13, sy: 0.7, seg: 6 }); // paw feet
  }
};
P[')'] = (c, k, m) => {
  // A cart: a plank bed with boarded sides and stakes, two big spoked
  // wheels with iron tyres, shafts out front, and a load.
  const { cx, cz } = c;
  k.bevel(0.86, 0.07, 0.62, PAL.wood, { x: cx, y: 0.42, z: cz, b: 0.015, vary: 0.05 });
  for (const s of [-1, 1]) {
    k.bevel(0.88, 0.17, 0.045, PAL.woodL, { x: cx, y: 0.535, z: cz + s * 0.31, b: 0.012, vary: 0.05 });
    k.bevel(0.045, 0.17, 0.62, PAL.woodL, { x: cx + s * 0.43, y: 0.535, z: cz, b: 0.012, vary: 0.05 });
    for (const t of [-1, 0, 1]) k.bevel(0.05, 0.3, 0.05, PAL.woodD, { x: cx + t * 0.42, y: 0.52, z: cz + s * 0.3, b: 0.01 });
  }
  k.box(0.06, 0.06, 0.82, PAL.woodDD, { x: cx, y: 0.26, z: cz });
  for (const s of [-1, 1]) {
    const z = cz + s * 0.38;
    k.torus(0.24, 0.035, PAL.woodD, { x: cx, y: 0.26, z, rseg: 4, tseg: 12 });
    m.torus(0.27, 0.014, PAL.ironD, { x: cx, y: 0.26, z, rseg: 3, tseg: 12 });
    k.cyl(0.065, 0.065, 0.1, PAL.wood, { x: cx, y: 0.26, z, rx: Math.PI / 2, seg: 6 });
    for (let i = 0; i < 3; i++) k.box(0.03, 0.46, 0.025, PAL.wood, { x: cx, y: 0.26, z, rz: i * Math.PI / 3 });
  }
  for (const s of [-1, 1]) k.limb([cx + 0.42, 0.4, cz + s * 0.2], [cx + 0.95, 0.14, cz + s * 0.13], 0.03, 0.025, PAL.woodD, { seg: 5, joint: false });
  k.bevel(0.05, 0.05, 0.3, PAL.woodD, { x: cx + 0.9, y: 0.16, z: cz, b: 0.01 });
  const load = c.rnd();
  if (load < 0.35) for (let i = 0; i < 2; i++) sack(k, cx - 0.18 + i * 0.32, 0.455, cz + (c.rnd() - 0.5) * 0.15, 0.8, c.rnd);
  else if (load < 0.65) crate(k, m, cx - 0.1, 0.455, cz, 0.38, c.rnd() * 0.4);
  else if (load < 0.85) k.rock(0.3, PAL.mustard, { x: cx, y: 0.55, z: cz, sx: 1.2, sz: 0.85, flat: 0.45, vary: 0.08 }); // hay
};

/* ---------------- objects ---------------- */
// A crate: a bevelled box of boards inside a darker frame of corner posts
// and rims, an X brace on two faces, nail heads at the joints.
function crate(k, m, x, y, z, s, ry) {
  const at = L(x, z, ry);
  k.bevel(s * 0.94, s * 0.94, s * 0.94, PAL.plank, { x, y: y + s / 2, z, ry, b: s * 0.05, vary: 0.08 });
  for (const yy of [0.08, 0.92]) k.box(s * 1.0, s * 0.14, s * 1.0, PAL.woodD, { x, y: y + s * yy, z, ry, vary: 0.04 });
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(s * 0.13, s * 0.98, s * 0.13, PAL.woodD, { ...at(a * s * 0.44, b * s * 0.44), y: y + s / 2, ry });
  for (const f of [0, 2]) {
    const fr = ry + f * Math.PI / 2;
    for (const d of [-1, 1]) {
      const p = L(x, z, fr)(0, s * 0.485);
      k.box(s * 1.0, s * 0.11, s * 0.035, PAL.woodD, { ...p, y: y + s / 2, ry: fr, rz: (Math.PI / 4) * d });
    }
    for (const [lx, ly] of [[-0.4, 0.08], [0.4, 0.08], [-0.4, 0.92], [0.4, 0.92]]) m.box(s * 0.04, s * 0.04, s * 0.02, PAL.ironD, { ...L(x, z, fr)(lx * s, s * 0.505), y: y + s * ly, ry: fr });
  }
}
function sack(k, x, y, z, s, rnd) {
  // a fat grain sack slumped on its bottom, its neck gathered and tied off
  // with rope, the tied end flopped over to one side
  const col = [PAL.sand, PAL.wool, tint(PAL.sand, 0.15)][Math.floor(rnd() * 3)];
  const lean = (rnd() - 0.5) * 0.4, ry = rnd() * TAU;
  k.sphere(0.26 * s, col, { x, y: y + 0.16 * s, z, sy: 0.66, sx: 1.1 + (rnd() - 0.5) * 0.15, sz: 0.94, ry, seg: 8, vary: 0.06 });
  k.sphere(0.21 * s, col, { x: x + lean * 0.08 * s, y: y + 0.29 * s, z, sx: 1.05, sy: 0.72, ry, seg: 8, vary: 0.06 });
  k.cyl(0.05 * s, 0.09 * s, 0.07 * s, col, { x: x + lean * 0.15 * s, y: y + 0.43 * s, z, rz: lean, seg: 6 });
  k.cyl(0.058 * s, 0.058 * s, 0.03 * s, PAL.rope, { x: x + lean * 0.17 * s, y: y + 0.46 * s, z, rz: lean, seg: 6 });
  k.sphere(0.07 * s, shade(col, 0.08), { x: x + lean * 0.2 * s + 0.05 * s, y: y + 0.49 * s, z, sx: 1.4, sy: 0.6, rz: -0.5, seg: 6 }); // the flopped-over end
}
P.B = (c, k, m) => crate(k, m, c.cx, 0, c.cz, 0.58, c.rnd() * 0.6);
P['['] = (c, k, m) => {
  crate(k, m, c.cx - 0.18, 0, c.cz - 0.12, 0.5, 0.1);
  crate(k, m, c.cx + 0.2, 0, c.cz + 0.15, 0.46, 0.5);
  crate(k, m, c.cx, 0.5, c.cz, 0.42, 0.3);
};
P.b = (c, k, m) => {
  const n = c.rnd() < 0.3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = c.cx + (n > 1 ? (i ? 0.2 : -0.18) : 0), z = c.cz + (n > 1 ? (i ? 0.16 : -0.14) : 0);
    const col = pick(c, [PAL.wood, PAL.plank, PAL.woodL]);
    // a bellied barrel: narrow ends, wide middle, four black hoops
    k.cyl(0.26, 0.23, 0.21, col, { x, y: 0.105, z, seg: 10, vary: 0.05 });
    k.cyl(0.275, 0.275, 0.22, col, { x, y: 0.32, z, seg: 10, vary: 0.05, open: true });
    k.cyl(0.23, 0.26, 0.21, col, { x, y: 0.535, z, seg: 10, vary: 0.05 });
    k.cyl(0.205, 0.205, 0.014, PAL.woodD, { x, y: 0.643, z, seg: 10 }); // lid
    k.box(0.38, 0.006, 0.014, PAL.woodDD, { x, y: 0.651, z, ry: c.rnd() });
    for (const [yy, r] of [[0.05, 0.24], [0.2, 0.268], [0.44, 0.268], [0.59, 0.24]]) m.cyl(r + 0.012, r + 0.012, 0.045, PAL.ironD, { x, y: yy, z, seg: 10, open: true });
    if (c.rnd() < 0.4) { const a = c.rnd() * TAU; m.cyl(0.03, 0.03, 0.08, PAL.brass, { x: x + Math.cos(a) * 0.29, y: 0.22, z: z + Math.sin(a) * 0.29, rz: Math.PI / 2, ry: -a, seg: 5 }); } // a tap
  }
};
P.C = (c, k, m) => {
  // A treasure chest: a bevelled box with a rounded lid, broad iron bands
  // over both, gold corner caps, a big lock plate and side handles.
  const f = facingFromWalls(c);
  const ry = (f ? f.ry : 0) + (c.rnd() - 0.5) * 0.3;
  const at = L(c.cx, c.cz, ry);
  k.bevel(0.64, 0.36, 0.44, PAL.woodD, { x: c.cx, y: 0.18, z: c.cz, ry, b: 0.02, vary: 0.05 });
  k.cyl(0.22, 0.22, 0.64, PAL.wood, { x: c.cx, y: 0.36, z: c.cz, rz: Math.PI / 2, ry, seg: 8, arc: Math.PI, vary: 0.05 });
  for (const s of [-1, 1]) k.box(0.005, 0.18, 0.4, PAL.wood, { ...at(s * 0.32, 0), y: 0.42, ry }); // (cap the lid's ends)
  m.bevel(0.67, 0.045, 0.47, PAL.ironD, { x: c.cx, y: 0.36, z: c.cz, ry, b: 0.01 });
  m.bevel(0.67, 0.045, 0.47, PAL.ironD, { x: c.cx, y: 0.022, z: c.cz, ry, b: 0.01 });
  for (const s of [-0.2, 0.2]) {
    m.bevel(0.06, 0.37, 0.46, PAL.ironD, { ...at(s, 0), y: 0.18, ry, b: 0.008 });
    m.cyl(0.228, 0.228, 0.06, PAL.ironD, { ...at(s, 0), y: 0.36, rz: Math.PI / 2, ry, seg: 8, arc: Math.PI, open: true });
  }
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.bevel(0.06, 0.09, 0.06, PAL.gold, { ...at(a * 0.31, b * 0.21), y: 0.31, ry, b: 0.012 });
  m.bevel(0.13, 0.16, 0.035, PAL.gold, { ...at(0, 0.225), y: 0.34, ry, b: 0.012 });
  k.box(0.022, 0.05, 0.03, '#120e0a', { ...at(0, 0.24), y: 0.32, ry }); // keyhole
  for (const s of [-1, 1]) m.torus(0.045, 0.01, PAL.ironD, { ...at(s * 0.335, 0), y: 0.24, ry: ry + Math.PI / 2, rseg: 3, tseg: 8 });
};
P.$ = (c, k, m) => {
  // A hoard: a heap of coin, coins spilled round it, stacks, a bar, gems
  // and a goblet.
  for (let i = 0; i < 12; i++) {
    const a = c.rnd() * TAU, r = 0.16 + c.rnd() * 0.25;
    m.cyl(0.05, 0.05, 0.016, PAL.gold, { x: c.cx + Math.cos(a) * r, y: 0.012 + c.rnd() * 0.03, z: c.cz + Math.sin(a) * r, rx: (c.rnd() - 0.5) * 0.5, rz: (c.rnd() - 0.5) * 0.5, seg: 7, vary: 0.1 });
  }
  m.cone(0.26, 0.22, PAL.goldD, { x: c.cx, y: 0.11, z: c.cz, seg: 9 });
  m.rock(0.17, PAL.gold, { x: c.cx - 0.04, y: 0.14, z: c.cz + 0.03, flat: 0.7, vary: 0.1 });
  for (let i = 0; i < 2; i++) {
    const x = c.cx - 0.26 + i * 0.47, z = c.cz + 0.22 - i * 0.42, n = 3 + Math.floor(c.rnd() * 4);
    for (let j = 0; j < n; j++) m.cyl(0.048, 0.048, 0.02, PAL.gold, { x: x + (c.rnd() - 0.5) * 0.012, y: 0.012 + j * 0.022, z, seg: 7, vary: 0.08 });
  }
  if (c.rnd() < 0.7) m.bevel(0.17, 0.06, 0.08, tint(PAL.gold, 0.15), { x: c.cx + 0.22, y: 0.03, z: c.cz + 0.12, ry: c.rnd(), b: 0.012, taper: 0.2 });
  const gems = [PAL.crimson, PAL.sky, PAL.leafL, PAL.violet];
  for (let i = 0; i < 3; i++) k.ball(0.045 + c.rnd() * 0.025, pick(c, gems), { x: c.cx + (c.rnd() - 0.5) * 0.4, y: 0.09 + c.rnd() * 0.12, z: c.cz + (c.rnd() - 0.5) * 0.3, detail: 0 });
  if (c.rnd() < 0.5) {
    const x = c.cx - 0.24, z = c.cz - 0.17;
    m.cyl(0.045, 0.05, 0.014, PAL.gold, { x, y: 0.007, z, seg: 7 });
    m.cyl(0.014, 0.014, 0.09, PAL.gold, { x, y: 0.055, z, seg: 5 });
    m.cyl(0.055, 0.022, 0.08, PAL.gold, { x, y: 0.13, z, seg: 7 });
  }
  c.emit({ kind: 'sparkle', x: c.cx, y: 0.25, z: c.cz, color: '#ffe08a' });
};
P['!'] = (c, k) => {
  sack(k, c.cx, 0, c.cz, 1, c.rnd);
  if (c.rnd() < 0.4) sack(k, c.cx + 0.22, 0, c.cz + 0.2, 0.7, c.rnd);
};
P.r = (c, k) => {
  // Rubble: a few lumpy stones, broken dressed blocks among them, grit.
  for (let i = 0; i < 5; i++) k.rock(0.09 + c.rnd() * 0.12, i % 2 ? PAL.stone : PAL.stoneD, { x: c.x0 + 0.15 + c.rnd() * 0.7, y: 0.05, z: c.z0 + 0.15 + c.rnd() * 0.7, flat: 0.6, vary: 0.08 });
  for (let i = 0; i < 2; i++) k.bevel(0.2 + c.rnd() * 0.1, 0.13, 0.15, PAL.stoneL, { x: c.x0 + 0.2 + c.rnd() * 0.6, y: 0.055, z: c.z0 + 0.2 + c.rnd() * 0.6, ry: c.rnd() * Math.PI, rx: (c.rnd() - 0.5) * 0.5, rz: (c.rnd() - 0.5) * 0.4, b: 0.025, vary: 0.08 });
  for (let i = 0; i < 4; i++) k.rock(0.03 + c.rnd() * 0.02, PAL.stoneD, { x: c.x0 + 0.1 + c.rnd() * 0.8, y: 0.012, z: c.z0 + 0.1 + c.rnd() * 0.8, flat: 0.6 });
};

/* ---------------- light ---------------- */
P.c = (c, k, m, g) => {
  // A campfire: a ring of chunky stones, an ash bed, crossed logs with pale
  // cut ends, a teepee of sticks over glowing coals.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + c.rnd() * 0.2;
    k.rock(0.1 + c.rnd() * 0.03, i % 2 ? PAL.stone : PAL.stoneD, { x: c.cx + Math.cos(a) * 0.32, y: 0.06, z: c.cz + Math.sin(a) * 0.32, flat: 0.7, vary: 0.08 });
  }
  k.cyl(0.26, 0.28, 0.025, PAL.stoneDD, { x: c.cx, y: 0.012, z: c.cz, seg: 9 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    k.cyl(0.05, 0.055, 0.5, PAL.woodD, { x: c.cx, y: 0.07, z: c.cz, rz: Math.PI / 2, ry: a, seg: 6 });
    for (const s of [-1, 1]) k.cyl(0.045, 0.045, 0.005, PAL.woodL, { x: c.cx + Math.cos(a) * s * 0.252, y: 0.07, z: c.cz - Math.sin(a) * s * 0.252, rz: Math.PI / 2, ry: a, seg: 6 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    k.limb([c.cx + Math.cos(a) * 0.2, 0.05, c.cz + Math.sin(a) * 0.2], [c.cx + Math.cos(a) * 0.03, 0.32, c.cz + Math.sin(a) * 0.03], 0.026, 0.014, PAL.bark, { seg: 4, joint: false });
  }
  for (let i = 0; i < 5; i++) g.bevel(0.06, 0.035, 0.06, i % 2 ? PAL.ember2 : PAL.flame, { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.035, z: c.cz + (c.rnd() - 0.5) * 0.3, ry: c.rnd(), b: 0.01 });
  c.emit({ kind: 'fire', x: c.cx, y: 0.12, z: c.cz, size: 1, light: { color: '#ff9a40', intensity: 9, distance: 8 } });
};
P.G = (c, k, m, g) => {
  // An iron brazier: three splayed legs with clawed feet, a stiffening
  // ring, a deep bowl with a rolled, riveted rim, a bed of coals.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    m.limb([c.cx + Math.cos(a) * 0.15, 0.7, c.cz + Math.sin(a) * 0.15], [c.cx + Math.cos(a) * 0.28, 0.04, c.cz + Math.sin(a) * 0.28], 0.032, 0.024, PAL.ironD, { seg: 5, joint: false });
    m.bevel(0.1, 0.05, 0.08, PAL.ironD, { x: c.cx + Math.cos(a) * 0.3, y: 0.025, z: c.cz + Math.sin(a) * 0.3, ry: -a, b: 0.012 });
  }
  m.torus(0.19, 0.022, PAL.iron, { x: c.cx, y: 0.36, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 12 });
  m.cyl(0.3, 0.15, 0.2, PAL.blackened, { x: c.cx, y: 0.76, z: c.cz, seg: 10 });
  m.torus(0.3, 0.03, PAL.iron, { x: c.cx, y: 0.86, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 14 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; m.ball(0.018, PAL.steel, { x: c.cx + Math.cos(a) * 0.27, y: 0.8, z: c.cz + Math.sin(a) * 0.27, detail: 0 }); }
  g.cyl(0.27, 0.27, 0.02, PAL.ember2, { x: c.cx, y: 0.845, z: c.cz, seg: 10 });
  for (let i = 0; i < 5; i++) k.rock(0.055, PAL.ink, { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.86, z: c.cz + (c.rnd() - 0.5) * 0.3, flat: 0.6 });
  c.emit({ kind: 'fire', x: c.cx, y: 0.85, z: c.cz, size: 0.8, light: { color: '#ffa04a', intensity: 7, distance: 7 } });
};
P.I = (c, k, m) => {
  const f = facingFromWalls(c);
  if (!f) {
    // No wall to hang on: a torch on an iron stand.
    m.cyl(0.03, 0.035, 1.15, PAL.ironD, { x: c.cx, y: 0.575, z: c.cz, seg: 6 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; m.limb([c.cx, 0.16, c.cz], [c.cx + Math.cos(a) * 0.22, 0.01, c.cz + Math.sin(a) * 0.22], 0.022, 0.016, PAL.ironD, { seg: 4 }); }
    m.cyl(0.075, 0.04, 0.12, PAL.ironD, { x: c.cx, y: 1.18, z: c.cz, seg: 8 });
    m.torus(0.075, 0.012, PAL.iron, { x: c.cx, y: 1.24, z: c.cz, rx: Math.PI / 2, rseg: 3, tseg: 8 });
    k.cyl(0.055, 0.045, 0.07, PAL.leatherD, { x: c.cx, y: 1.26, z: c.cz, seg: 6 });
    c.emit({ kind: 'fire', x: c.cx, y: 1.32, z: c.cz, size: 0.45, light: { color: '#ffa04a', intensity: 4.5, distance: 6 } });
    return;
  }
  const dx = f.dx, dy = f.dy;
  const x = c.cx + dx * 0.42, z = c.cz + dy * 0.42;
  const ry = dx ? Math.PI / 2 : 0;
  // a riveted plate on the wall, an arm out of it, a cup holding the torch
  m.bevel(dx ? 0.025 : 0.12, 0.2, dx ? 0.12 : 0.025, PAL.ironD, { x: x + dx * 0.05, y: 0.95, z: z + dy * 0.05, b: 0.008 });
  for (const yy of [0.88, 1.02]) m.ball(0.014, PAL.steel, { x: x + dx * 0.035, y: yy, z: z + dy * 0.035, detail: 0 });
  m.box(0.045, 0.045, 0.22, PAL.ironD, { x: x - dx * 0.06, y: 0.95, z: z - dy * 0.06, ry });
  m.cyl(0.05, 0.035, 0.07, PAL.ironD, { x: x - dx * 0.16, y: 0.99, z: z - dy * 0.16, seg: 6 });
  k.cyl(0.04, 0.03, 0.34, PAL.woodD, { x: x - dx * 0.16, y: 1.06, z: z - dy * 0.16, rx: -dy * 0.35, rz: dx * 0.35, seg: 6 });
  k.cyl(0.052, 0.045, 0.09, PAL.leatherD, { x: x - dx * 0.2, y: 1.2, z: z - dy * 0.2, rx: -dy * 0.35, rz: dx * 0.35, seg: 6 }); // pitch-soaked wrap
  c.emit({ kind: 'fire', x: x - dx * 0.22, y: 1.26, z: z - dy * 0.22, size: 0.45, light: { color: '#ffa04a', intensity: 4.5, distance: 6 } });
};
P['4'] = (c, k, m, g) => {
  // A forge: a hearth of big laid blocks with a raised rim round glowing
  // coals, a tapering hood and chimney, a leather bellows and a little anvil
  // on its corner.
  const { cx, cz } = c;
  for (let i = 0; i < 3; i++) k.bevel(0.94, 0.2, 0.84, i % 2 ? PAL.stoneD : PAL.stone, { x: cx, y: 0.1 + i * 0.2, z: cz, b: 0.025, vary: 0.05 });
  for (const s of [-1, 1]) {
    k.bevel(0.96, 0.09, 0.12, PAL.stoneL, { x: cx, y: 0.64, z: cz + s * 0.37, b: 0.02, vary: 0.05 });
    k.bevel(0.12, 0.09, 0.62, PAL.stoneL, { x: cx + s * 0.42, y: 0.64, z: cz, b: 0.02, vary: 0.05 });
  }
  k.box(0.7, 0.03, 0.6, PAL.ink, { x: cx, y: 0.62, z: cz });
  g.box(0.6, 0.03, 0.46, PAL.ember2, { x: cx, y: 0.635, z: cz });
  for (let i = 0; i < 6; i++) k.rock(0.065, PAL.ink, { x: cx + (c.rnd() - 0.5) * 0.5, y: 0.66, z: cz + (c.rnd() - 0.5) * 0.36, flat: 0.5 });
  g.bevel(0.5, 0.12, 0.05, PAL.ember2, { x: cx, y: 0.28, z: cz - 0.42, b: 0.015 }); // the ash door glows
  m.bevel(0.56, 0.16, 0.04, PAL.ironD, { x: cx, y: 0.28, z: cz - 0.435, b: 0.01 });
  // hood and chimney
  k.cyl(0.18, 0.34, 0.42, PAL.stone, { x: cx, y: 0.9, z: cz + 0.24, seg: 4, ry: Math.PI / 4, vary: 0.05 });
  k.bevel(0.3, 0.82, 0.3, PAL.stone, { x: cx, y: 1.5, z: cz + 0.24, b: 0.03, vary: 0.05 });
  k.bevel(0.38, 0.07, 0.38, PAL.stoneD, { x: cx, y: 1.93, z: cz + 0.24, b: 0.015 });
  // bellows on the side
  k.bevel(0.12, 0.08, 0.3, PAL.leather, { x: cx + 0.52, y: 0.45, z: cz, b: 0.03, rz: -0.25 });
  k.bevel(0.13, 0.025, 0.32, PAL.woodD, { x: cx + 0.53, y: 0.5, z: cz, b: 0.008, rz: -0.25 });
  m.cyl(0.015, 0.02, 0.14, PAL.brass, { x: cx + 0.47, y: 0.42, z: cz - 0.18, rx: Math.PI / 2, seg: 5 });
  c.emit({ kind: 'ember', x: c.cx, y: 0.72, z: c.cz, light: { color: '#ff6a2a', intensity: 7, distance: 7 } });
};
P.K = (c, k, m, g) => {
  // A witch's cauldron on three legs over a little fire: fat pot, rolled
  // rim, ring lugs, a bubbling brew.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    k.rock(0.08, PAL.stoneD, { x: c.cx + Math.cos(a) * 0.33, y: 0.05, z: c.cz + Math.sin(a) * 0.33, vary: 0.08 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    m.limb([c.cx + Math.cos(a) * 0.2, 0.3, c.cz + Math.sin(a) * 0.2], [c.cx + Math.cos(a) * 0.26, 0.0, c.cz + Math.sin(a) * 0.26], 0.03, 0.024, PAL.blackened, { seg: 4, joint: false });
    k.cyl(0.03, 0.035, 0.34, PAL.woodD, { x: c.cx, y: 0.045, z: c.cz, rz: Math.PI / 2, ry: a, seg: 5 });
  }
  m.sphere(0.32, PAL.blackened, { x: c.cx, y: 0.37, z: c.cz, sy: 0.85, seg: 12 });
  m.torus(0.26, 0.04, PAL.iron, { x: c.cx, y: 0.6, z: c.cz, rx: Math.PI / 2, rseg: 4, tseg: 14 });
  for (const s of [-1, 1]) m.torus(0.06, 0.016, PAL.iron, { x: c.cx + s * 0.32, y: 0.52, z: c.cz, ry: Math.PI / 2, rseg: 3, tseg: 8 });
  g.cyl(0.25, 0.25, 0.02, PAL.fel, { x: c.cx, y: 0.58, z: c.cz, seg: 12 });
  for (let i = 0; i < 3; i++) g.sphere(0.035 + c.rnd() * 0.02, tint(PAL.fel, 0.3), { x: c.cx + (c.rnd() - 0.5) * 0.3, y: 0.59, z: c.cz + (c.rnd() - 0.5) * 0.3, theta: Math.PI / 2, seg: 6 });
  c.emit({ kind: 'bubbles', x: c.cx, y: 0.6, z: c.cz, color: '#9aff6a', light: { color: '#7ad84a', intensity: 2.5, distance: 4 } });
};

/* ---------------- nature ---------------- */
// Trees, bushes and boulders don't sit one-per-square like a grid: each is
// nudged, sized and turned on its own, and where two stand side by side their
// crowns (or stones) grow into each other, so a row reads as a grove.
const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const jitter = (c, amt) => ({ x: c.cx + (c.rnd() - 0.5) * amt, z: c.cz + (c.rnd() - 0.5) * amt });
P.T = (c, k) => {
  const { x, z } = jitter(c, 0.36);
  const size = 0.85 + c.rnd() * 0.45;
  const h = (1.0 + c.rnd() * 0.6) * size;
  const lean = (c.rnd() - 0.5) * 0.12;
  const top = { x: x - Math.sin(lean) * h * 0.5, z };
  const mid = [x + (c.rnd() - 0.5) * 0.06 - Math.sin(lean) * h * 0.25, h * 0.5, z + (c.rnd() - 0.5) * 0.06];
  k.chain([[x, 0, z], mid, [top.x, h * 0.95, top.z]], 0.17 * size, 0.08 * size, PAL.bark, { seg: 6, vary: 0.06 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + c.rnd(); k.limb([x, 0.12 * size, z], [x + Math.cos(a) * 0.3 * size, -0.01, z + Math.sin(a) * 0.3 * size], 0.07 * size, 0.025, shade(PAL.bark, 0.15), { seg: 4, joint: false }); }
  const branchA = c.rnd() * TAU;
  k.limb([mid[0], h * 0.62, mid[2]], [mid[0] + Math.cos(branchA) * 0.36 * size, h * 0.62 + 0.3 * size, mid[2] + Math.sin(branchA) * 0.36 * size], 0.045 * size, 0.02, PAL.bark, { seg: 4, joint: false });
  const leaf = pick(c, [PAL.leaf, PAL.leafD, tint(PAL.leaf, 0.08), PAL.moss]);
  if (c.rnd() < 0.25) {
    // a fir: stacked tiers, each a little lighter toward the top
    for (let i = 0; i < 4; i++) {
      const r = (0.66 - i * 0.13) * size, hh = 0.5 * size;
      k.cone(r, hh, tint(shade(PAL.leafD, 0.15), i * 0.05), { x: top.x, y: h * 0.35 + i * 0.3 * size + hh / 2, z: top.z, seg: 6, ry: c.rnd(), vary: 0.08 });
    }
    return;
  }
  // a crown of big faceted clumps: dark underneath, lighter crown on top,
  // a few small lumps standing proud for a broken silhouette
  const n = 4 + Math.floor(c.rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + c.rnd() * 0.5, rr = (0.24 + c.rnd() * 0.16) * size;
    k.ball((0.36 + c.rnd() * 0.14) * size, shade(leaf, 0.18), { x: top.x + Math.cos(a) * rr, y: h - 0.04 * size, z: top.z + Math.sin(a) * rr, sy: 0.78, detail: 0, ry: c.rnd() * 3, vary: 0.1 });
  }
  k.ball(0.42 * size, leaf, { x: top.x, y: h + 0.26 * size, z: top.z, sy: 0.85, detail: 0, ry: c.rnd() * 3, vary: 0.08 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + c.rnd();
    k.ball((0.2 + c.rnd() * 0.08) * size, tint(leaf, 0.14), { x: top.x + Math.cos(a) * 0.3 * size, y: h + 0.38 * size + c.rnd() * 0.1, z: top.z + Math.sin(a) * 0.3 * size, detail: 0, vary: 0.1 });
  }
  for (const [dx, dy] of NEIGH) {
    if (c.at(dx, dy) !== 'T' || c.rnd() < 0.3) continue;
    k.ball((0.34 + c.rnd() * 0.1) * size, leaf, { x: c.cx + dx * 0.5 + (c.rnd() - 0.5) * 0.2, y: h * (0.9 + c.rnd() * 0.15), z: c.cz + dy * 0.5 + (c.rnd() - 0.5) * 0.2, sy: 0.8, detail: 0, vary: 0.1 });
  }
};
P.Y = (c, k) => {
  const { x, z } = jitter(c, 0.32);
  const n = 4 + Math.floor(c.rnd() * 2);
  for (let i = 0; i < n; i++) {
    const hi = i >= n - 2, col = hi ? tint(PAL.leaf, 0.12) : pick(c, [PAL.leaf, PAL.leafD, PAL.moss]);
    k.ball(hi ? 0.15 + c.rnd() * 0.07 : 0.19 + c.rnd() * 0.1, col, { x: x + (c.rnd() - 0.5) * (hi ? 0.28 : 0.5), y: hi ? 0.3 + c.rnd() * 0.06 : 0.15 + c.rnd() * 0.08, z: z + (c.rnd() - 0.5) * (hi ? 0.28 : 0.5), sy: 0.82, detail: 0, ry: c.rnd() * 3, vary: 0.1 });
  }
  if (c.rnd() < 0.5) {
    const col = pick(c, [PAL.crimson, PAL.cream, PAL.violet]);
    for (let i = 0; i < 6; i++) { const a = c.rnd() * TAU, r = 0.17 + c.rnd() * 0.1; k.ball(0.03, tint(col, 0.15), { x: x + Math.cos(a) * r, y: 0.22 + c.rnd() * 0.15, z: z + Math.sin(a) * r, detail: 0 }); }
  }
  for (const [dx, dy] of NEIGH) if (c.at(dx, dy) === 'Y' || c.at(dx, dy) === 'T') k.ball(0.19 + c.rnd() * 0.06, PAL.leaf, { x: c.cx + dx * 0.48, y: 0.15, z: c.cz + dy * 0.48, sy: 0.75, detail: 0, vary: 0.1 });
};
P.O = (c, k) => {
  const { x, z } = jitter(c, 0.3);
  const size = 0.82 + c.rnd() * 0.42;
  const fl = 0.7 + c.rnd() * 0.15;
  k.rock(0.46 * size, PAL.stone, { x, y: 0.26 * size, z, flat: fl, ry: c.rnd() * Math.PI, vary: 0.08, detail: 0 });
  k.rock(0.3 * size, PAL.stoneL, { x: x + 0.08, y: 0.3 * size + 0.12 * size, z: z - 0.05, flat: 0.8, ry: c.rnd() * 3, vary: 0.06, detail: 0 }); // a lighter cap catches the light
  if (c.rnd() < 0.5) k.rock(0.24 * size, PAL.moss2, { x: x + (c.rnd() - 0.5) * 0.1, y: 0.3 * size + 0.3 * size * fl, z: z + (c.rnd() - 0.5) * 0.1, flat: 0.25, vary: 0.1 });
  k.rock(0.2 * size, PAL.stoneD, { x: x + (c.rnd() - 0.5) * 0.6, y: 0.08, z: z + (c.rnd() - 0.5) * 0.6, vary: 0.08 });
  for (const [dx, dy] of NEIGH) {
    if (c.at(dx, dy) !== 'O') continue;
    for (let i = 0; i < 2; i++) k.rock(0.14 + c.rnd() * 0.1, i ? PAL.stoneD : PAL.stone, { x: c.cx + dx * (0.42 + c.rnd() * 0.1) + (c.rnd() - 0.5) * 0.3, y: 0.08, z: c.cz + dy * (0.42 + c.rnd() * 0.1) + (c.rnd() - 0.5) * 0.3, flat: 0.7, vary: 0.08 });
  }
};
P['6'] = (c, k) => {
  // Dripstone: a tall faceted cone ringed with flowstone bands, a shorter sister, a rock skirt.
  const { x, z } = jitter(c, 0.3);
  const hh = 1.0 + c.rnd() * 0.6, r0 = 0.24 + c.rnd() * 0.06, tilt = (c.rnd() - 0.5) * 0.1;
  k.cone(r0, hh, PAL.stone, { x, y: hh / 2, z, rz: tilt, seg: 6, vary: 0.06 });
  for (let i = 1; i < 4; i++) {
    const t = i / 4.5, r = r0 * (1 - t) + 0.03;
    k.cyl(r * 0.9, r * 1.15, 0.08, i % 2 ? PAL.stoneL : PAL.stoneD, { x: x - Math.sin(tilt) * hh * (t - 0.5), y: hh * t, z, seg: 6, rz: tilt });
  }
  const a = c.rnd() * TAU, h2 = 0.4 + c.rnd() * 0.3;
  k.cone(0.13, h2, PAL.stoneD, { x: x + Math.cos(a) * 0.27, y: h2 / 2, z: z + Math.sin(a) * 0.27, seg: 5, vary: 0.06 });
  k.cone(0.07, 0.22, PAL.stoneD, { x: x + Math.cos(a + 2) * 0.3, y: 0.11, z: z + Math.sin(a + 2) * 0.3, seg: 5 });
  k.rock(0.22, PAL.stoneD, { x, y: 0.05, z, flat: 0.5 });
};
P['('] = (c, k) => {
  // A fallen log: bark, pale cut ends with a ring, a broken branch, moss, shelf fungi.
  const ry = c.rnd() * Math.PI;
  const at = L(c.cx, c.cz, ry);
  k.cyl(0.18, 0.2, 1.1, PAL.bark, { x: c.cx, y: 0.18, z: c.cz, rz: Math.PI / 2, ry, seg: 7, vary: 0.06 });
  for (const s of [-1, 1]) {
    const p = at(s * 0.552);
    k.cyl(s > 0 ? 0.165 : 0.185, s > 0 ? 0.165 : 0.185, 0.01, PAL.woodL, { ...p, y: 0.18, rz: Math.PI / 2, ry, seg: 7 });
    k.cyl(0.09, 0.09, 0.016, PAL.wood, { ...p, y: 0.18, rz: Math.PI / 2, ry, seg: 7 });
  }
  const p = at(0.1, 0), a = ry + 0.6;
  k.limb([p.x, 0.28, p.z], [p.x + Math.sin(a) * 0.2, 0.46, p.z + Math.cos(a) * 0.2], 0.05, 0.03, PAL.bark, { seg: 5, joint: false });
  for (let i = 0; i < 2; i++) k.rock(0.12, PAL.moss2, { ...at(-0.28 + i * 0.42 + c.rnd() * 0.1, 0), y: 0.33, flat: 0.25, vary: 0.1 });
  if (c.rnd() < 0.6) for (let i = 0; i < 3; i++) k.sphere(0.04, PAL.sand, { ...at(-0.35 + c.rnd() * 0.7, 0.19), y: 0.15 + i * 0.045, theta: Math.PI / 2, sy: 0.4, seg: 6 });
};
P['5'] = (c, k, m, g) => {
  // Glowing cave mushrooms: chunky pale stems, gilled caps that glow.
  for (let i = 0; i < 5; i++) {
    const x = c.x0 + 0.2 + c.rnd() * 0.6, z = c.z0 + 0.2 + c.rnd() * 0.6, h = 0.09 + c.rnd() * 0.2;
    const bx = (c.rnd() - 0.5) * 0.05, bz = (c.rnd() - 0.5) * 0.05, r = 0.08 + c.rnd() * 0.06;
    k.limb([x, 0, z], [x + bx, h, z + bz], 0.04, 0.028, PAL.linen, { seg: 5, joint: false });
    k.cone(r * 0.9, 0.03, PAL.wool, { x: x + bx, y: h - 0.005, z: z + bz, rx: Math.PI, seg: 7 });
    g.sphere(r, [PAL.frost, PAL.void, PAL.mustard][i % 3], { x: x + bx, y: h, z: z + bz, sy: 0.6, seg: 7, theta: Math.PI / 2 });
  }
  for (let i = 0; i < 4; i++) g.sphere(0.03, PAL.frost, { x: c.x0 + 0.15 + c.rnd() * 0.7, y: 0.015, z: c.z0 + 0.15 + c.rnd() * 0.7, seg: 6, theta: Math.PI / 2 });
  c.emit({ kind: 'spores', x: c.cx, y: 0.2, z: c.cz, color: '#9af0e0', light: { color: '#6ad0c8', intensity: 1.2, distance: 3 } });
};
P['&'] = (c, k) => {
  // A patch of flowers: chunky four-petal heads on stems, leaves, grass tufts.
  const PETAL = [PAL.rose, PAL.mustard, PAL.violet, PAL.cream, PAL.ember];
  for (let i = 0; i < 8; i++) {
    const x = c.x0 + 0.1 + c.rnd() * 0.8, z = c.z0 + 0.1 + c.rnd() * 0.8, h = 0.11 + c.rnd() * 0.08;
    k.cyl(0.01, 0.01, h, PAL.leafD, { x, y: h / 2, z, seg: 4 });
    k.box(0.08, 0.01, 0.035, PAL.leaf, { x: x + 0.03, y: h * 0.4, z, ry: c.rnd() * TAU, rz: 0.4 });
    const col = tint(pick(c, PETAL), 0.1), a = c.rnd();
    for (let p = 0; p < 2; p++) k.box(0.09, 0.016, 0.036, col, { x, y: h, z, ry: a + p * Math.PI / 2, vary: 0.06 });
    k.ball(0.02, PAL.ochre, { x, y: h + 0.012, z, detail: 0 });
  }
  for (let i = 0; i < 4; i++) k.cone(0.035, 0.1, PAL.leafL, { x: c.x0 + 0.1 + c.rnd() * 0.8, y: 0.05, z: c.z0 + 0.1 + c.rnd() * 0.8, seg: 3, rz: (c.rnd() - 0.5) * 0.4 });
};
P['7'] = (c, k) => {
  // A web strung across the square: threads from a hub to anchor points,
  // rings of silk between them, faces the nearest wall.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : c.rnd() * Math.PI;
  const silk = PAL.cream, r = 0.46, cy = 0.62, N = 8;
  const pt = (a, rr) => {
    const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr;
    return [c.cx + Math.cos(ry) * lx, cy + ly, c.cz - Math.sin(ry) * lx];
  };
  const spokes = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.2, rr = r * (0.8 + c.rnd() * 0.25);
    spokes.push([a, rr]);
    k.limb(pt(0, 0), pt(a, Math.min(rr, a > Math.PI ? cy - 0.02 : rr)), 0.007, 0.005, silk, { seg: 3, joint: false });
  }
  for (const ring of [0.25, 0.45, 0.65, 0.85]) {
    for (let i = 0; i < N; i++) {
      const [a0, r0] = spokes[i], [a1, r1] = spokes[(i + 1) % N];
      k.limb(pt(a0, Math.min(r0 * ring, a0 > Math.PI ? cy - 0.02 : r0 * ring)), pt(a1, Math.min(r1 * ring, a1 > Math.PI ? cy - 0.02 : r1 * ring)), 0.005, 0.005, silk, { seg: 3, joint: false });
    }
  }
  if (c.rnd() < 0.4) {
    const [px, py, pz] = pt(0.9, 0.2);
    k.ball(0.04, PAL.ink, { x: px, y: py, z: pz, detail: 0 });
    k.ball(0.026, PAL.ink, { x: px, y: py + 0.045, z: pz, detail: 0 });
    k.ball(0.008, PAL.crimson, { x: px, y: py + 0.06, z: pz + 0.02, detail: 0 });
  }
};

/* ---------------- shrine ---------------- */
// (Plain on purpose: no symbols of any faith on altars, statues or banners.)
P.A = (c, k, m) => {
  // An altar: a plinth, a block with sunk panels, a heavy top slab, a plain
  // cloth runner, an offering bowl with fruit, two tall candles.
  k.bevel(1.0, 0.1, 0.7, PAL.stoneD, { x: c.cx, y: 0.05, z: c.cz, b: 0.025, vary: 0.04 });
  k.bevel(0.88, 0.52, 0.58, PAL.stoneL, { x: c.cx, y: 0.36, z: c.cz, b: 0.025, vary: 0.04 });
  for (const s of [-1, 1]) for (const lx of [-0.22, 0.22]) k.bevel(0.3, 0.32, 0.02, PAL.stone, { x: c.cx + lx, y: 0.36, z: c.cz + s * 0.292, b: 0.008 });
  k.bevel(1.0, 0.1, 0.7, PAL.stone, { x: c.cx, y: 0.67, z: c.cz, b: 0.025, vary: 0.04 });
  k.box(0.46, 0.02, 0.72, PAL.crimson, { x: c.cx, y: 0.725, z: c.cz });
  for (const s of [-1, 1]) {
    k.box(0.46, 0.2, 0.016, PAL.crimson, { x: c.cx, y: 0.63, z: c.cz + s * 0.36 });
    m.box(0.46, 0.02, 0.02, PAL.gold, { x: c.cx, y: 0.535, z: c.cz + s * 0.36 });
  }
  m.cyl(0.11, 0.06, 0.06, PAL.brass, { x: c.cx, y: 0.76, z: c.cz, seg: 9 });
  k.ball(0.04, PAL.crimson, { x: c.cx - 0.03, y: 0.8, z: c.cz, detail: 0 });
  k.ball(0.036, PAL.ochre, { x: c.cx + 0.04, y: 0.8, z: c.cz + 0.02, detail: 0 });
  for (const s of [-0.32, 0.32]) {
    m.cyl(0.055, 0.065, 0.025, PAL.brass, { x: c.cx + s, y: 0.735, z: c.cz, seg: 8 });
    k.cyl(0.035, 0.037, 0.2, PAL.cream, { x: c.cx + s, y: 0.845, z: c.cz, seg: 6 });
    k.box(0.016, 0.05, 0.016, PAL.linen, { x: c.cx + s + 0.032, y: 0.9, z: c.cz });
    c.emit({ kind: 'candle', x: c.cx + s, y: 0.95, z: c.cz });
  }
};
P.U = (c, k) => {
  // A statue of a hooded warden resting both hands on a sword set point-down,
  // on a stepped plinth, facing the room. Stone throughout.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : Math.floor(c.rnd() * 4) * Math.PI / 2;
  const at = L(c.cx, c.cz, ry);
  const S = PAL.stoneL, SD = PAL.stone;
  k.bevel(0.7, 0.14, 0.7, PAL.stoneD, { x: c.cx, y: 0.07, z: c.cz, ry, b: 0.025 });
  k.bevel(0.58, 0.18, 0.58, SD, { x: c.cx, y: 0.23, z: c.cz, ry, b: 0.025 });
  k.cyl(0.17, 0.28, 0.66, S, { x: c.cx, y: 0.65, z: c.cz, seg: 8, ry }); // robe, flaring to the hem
  for (let i = 0; i < 4; i++) k.box(0.035, 0.56, 0.03, SD, { ...at(-0.12 + i * 0.08, 0.21 - Math.abs(i - 1.5) * 0.02), y: 0.6, ry, rx: -0.16 }); // folds
  k.sphere(0.22, S, { x: c.cx, y: 1.0, z: c.cz, sx: 1.15, sy: 0.55, sz: 0.85, seg: 8 }); // shoulders
  k.sphere(0.12, S, { ...at(0, 0.02), y: 1.2, seg: 8 }); // head
  k.sphere(0.165, SD, { ...at(0, -0.015), y: 1.2, sy: 1.15, seg: 8, theta: Math.PI * 0.62, rx: -0.35 }); // hood
  k.box(0.13, 0.12, 0.03, shade(SD, 0.4), { ...at(0, 0.12), y: 1.18, ry }); // the face in the hood's shadow
  for (const s of [-1, 1]) k.limb([at(s * 0.2, 0).x, 1.0, at(s * 0.2, 0).z], [at(s * 0.05, 0.22).x, 0.82, at(s * 0.05, 0.22).z], 0.065, 0.055, S, { seg: 6 });
  k.bevel(0.13, 0.08, 0.1, S, { ...at(0, 0.24), y: 0.82, ry, b: 0.03 }); // the hands together
  k.bevel(0.07, 0.6, 0.025, SD, { ...at(0, 0.27), y: 0.47, ry, b: 0.01, taper: -0.4, taperZ: 0 }); // blade down
  k.bevel(0.24, 0.045, 0.06, SD, { ...at(0, 0.26), y: 0.77, ry, b: 0.012 }); // crossguard
  k.ball(0.035, SD, { ...at(0, 0.25), y: 0.9, detail: 0 }); // pommel above the hands
};
P.P = (c, k) => {
  // A column: square plinth, a moulded base, a faceted shaft with a slight
  // swell, a flared capital under a square abacus.
  const h = WALL_H + 0.25;
  k.bevel(0.64, 0.14, 0.64, PAL.stoneD, { x: c.cx, y: 0.07, z: c.cz, b: 0.025, vary: 0.04 });
  k.cyl(0.28, 0.3, 0.08, PAL.stone, { x: c.cx, y: 0.18, z: c.cz, seg: 8 });
  const s0 = 0.22, s1 = h - 0.28;
  k.cyl(0.24, 0.23, (s1 - s0) * 0.5, PAL.stoneL, { x: c.cx, y: s0 + (s1 - s0) * 0.25, z: c.cz, seg: 8, vary: 0.03 });
  k.cyl(0.21, 0.24, (s1 - s0) * 0.5, PAL.stoneL, { x: c.cx, y: s0 + (s1 - s0) * 0.75, z: c.cz, seg: 8, vary: 0.03 });
  k.cyl(0.25, 0.25, 0.05, PAL.stone, { x: c.cx, y: s1, z: c.cz, seg: 8 });
  k.cyl(0.32, 0.22, 0.14, PAL.stoneL, { x: c.cx, y: s1 + 0.09, z: c.cz, seg: 8 });
  k.bevel(0.64, 0.12, 0.64, PAL.stoneD, { x: c.cx, y: h - 0.06, z: c.cz, b: 0.025, vary: 0.04 });
};
P.Z = (c, k) => {
  // A summoning circle (the glowing ring is its own mesh): four little
  // standing stones mark its quarters.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    k.bevel(0.07, 0.12, 0.06, PAL.stoneD, { x: c.cx + Math.cos(a) * 0.62, y: 0.06, z: c.cz + Math.sin(a) * 0.62, ry: -a, b: 0.015, taper: 0.25 });
  }
  c.emit({ kind: 'circle', x: c.cx, y: 0.03, z: c.cz, color: '#a87aff', light: { color: '#9a6aff', intensity: 3, distance: 5 } });
};
P.Q = (c, k, m, g) => {
  // Crystal clusters: chunky six-sided prisms with pointed tips, out of a rocky bed.
  const col = pick(c, [PAL.frost, PAL.arcane, tint(PAL.fel, 0.3)]);
  for (let i = 0; i < 3; i++) k.rock(0.14 + c.rnd() * 0.06, PAL.slate, { x: c.cx + (c.rnd() - 0.5) * 0.4, y: 0.04, z: c.cz + (c.rnd() - 0.5) * 0.4, flat: 0.5, vary: 0.08 });
  for (let i = 0; i < 5; i++) {
    const h = (i < 2 ? 0.48 : 0.2) + c.rnd() * 0.36, r = (i < 2 ? 0.09 : 0.055) + c.rnd() * 0.04;
    const rx = (c.rnd() - 0.5) * 0.6, rz = (c.rnd() - 0.5) * 0.6;
    const x = c.cx + (c.rnd() - 0.5) * 0.42, z = c.cz + (c.rnd() - 0.5) * 0.42;
    const tx = -Math.sin(rz), ty = Math.cos(rz) * Math.cos(rx), tz = Math.cos(rz) * Math.sin(rx);
    g.cyl(r, r * 1.1, h, col, { x: x + tx * h / 2, y: ty * h / 2, z: z + tz * h / 2, rx, rz, seg: 6 });
    g.cone(r, r * 2.2, tint(col, 0.25), { x: x + tx * (h + r * 1.1), y: ty * (h + r * 1.1), z: z + tz * (h + r * 1.1), rx, rz, seg: 6 });
  }
  c.emit({ kind: 'crystal', x: c.cx, y: 0.4, z: c.cz, color: col, light: { color: col, intensity: 1.1, distance: 4.5 } });
};
P.M = (c, k) => {
  // A headstone: a plain round-topped slab on a footing, three carved lines,
  // a turf mound before it.
  const tilt = (c.rnd() - 0.5) * 0.15;
  k.bevel(0.58, 0.09, 0.22, PAL.stoneD, { x: c.cx, y: 0.045, z: c.cz, b: 0.02, vary: 0.05 });
  k.bevel(0.46, 0.6, 0.14, PAL.stone, { x: c.cx, y: 0.36, z: c.cz, rz: tilt, b: 0.025, vary: 0.05 });
  k.cyl(0.23, 0.23, 0.14, PAL.stone, { x: c.cx - Math.sin(tilt) * 0.3, y: 0.66, z: c.cz, rx: Math.PI / 2, rz: tilt, seg: 8, arc: Math.PI });
  for (let i = 0; i < 3; i++) k.box(0.26 - i * 0.05, 0.02, 0.01, PAL.stoneDD, { x: c.cx - Math.sin(tilt) * (0.2 - i * 0.08), y: 0.56 - i * 0.08, z: c.cz + 0.071, rz: tilt });
  if (c.rnd() < 0.5) k.rock(0.1, PAL.moss2, { x: c.cx + 0.17, y: 0.09, z: c.cz + 0.07, flat: 0.35 });
  k.rock(0.33, shade(PAL.furD, 0.15), { x: c.cx, y: 0.0, z: c.cz + 0.29, sx: 0.85, sz: 1.3, flat: 0.25, vary: 0.06 });
};
P.W = (c, k, m) => {
  // A well: a ring of laid stone with a cap course, two posts, a windlass
  // with a crank, rope to a bucket, a pitched shingle roof.
  const { cx, cz } = c;
  for (let i = 0; i < 3; i++) k.cyl(0.44, 0.46, 0.17, i % 2 ? PAL.stoneD : PAL.stone, { x: cx, y: 0.085 + i * 0.17, z: cz, seg: 10, vary: 0.06, ry: i * 0.3 });
  k.cyl(0.48, 0.48, 0.07, PAL.stoneL, { x: cx, y: 0.54, z: cz, seg: 10, ry: 0.15, open: true });
  k.cyl(0.37, 0.37, 0.01, '#0e1a22', { x: cx, y: 0.5, z: cz, seg: 10 });
  k.cyl(0.37, 0.37, 0.07, PAL.stoneDD, { x: cx, y: 0.54, z: cz, seg: 10, open: true });
  for (const s of [-0.39, 0.39]) k.bevel(0.09, 1.18, 0.09, PAL.wood, { x: cx + s, y: 0.75, z: cz, b: 0.015, vary: 0.05 });
  k.cyl(0.05, 0.05, 0.84, PAL.woodD, { x: cx, y: 1.02, z: cz, rz: Math.PI / 2, seg: 6 });
  k.cyl(0.07, 0.07, 0.16, PAL.rope, { x: cx - 0.05, y: 1.02, z: cz, rz: Math.PI / 2, seg: 6 });
  k.box(0.035, 0.17, 0.035, PAL.woodD, { x: cx + 0.45, y: 0.95, z: cz });
  k.box(0.11, 0.035, 0.035, PAL.woodD, { x: cx + 0.49, y: 0.87, z: cz });
  k.cyl(0.01, 0.01, 0.28, PAL.rope, { x: cx - 0.05, y: 0.86, z: cz, seg: 3 });
  k.cyl(0.08, 0.065, 0.11, PAL.wood, { x: cx - 0.05, y: 0.67, z: cz, seg: 7 });
  m.cyl(0.082, 0.082, 0.018, PAL.ironD, { x: cx - 0.05, y: 0.7, z: cz, seg: 7, open: true });
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r++) k.bevel(1.04, 0.05, 0.22, r % 2 ? shade(PAL.clay, 0.22) : shade(PAL.clay, 0.36), { x: cx, y: 1.58 - r * 0.11, z: cz + s * (0.1 + r * 0.17), rx: s * 0.58, b: 0.012, vary: 0.08 });
  }
  k.bevel(1.08, 0.07, 0.07, PAL.woodD, { x: cx, y: 1.65, z: cz, b: 0.015 });
  for (const s of [-0.39, 0.39]) k.box(0.045, 0.1, 0.6, PAL.woodD, { x: cx + s, y: 1.37, z: cz });
};
P.N = (c, k) => {
  // A fountain: a wide basin with a rim, a stem with two dishes, a spout.
  k.cyl(0.47, 0.49, 0.3, PAL.stoneL, { x: c.cx, y: 0.15, z: c.cz, seg: 12, vary: 0.04 });
  k.cyl(0.5, 0.5, 0.06, PAL.stone, { x: c.cx, y: 0.3, z: c.cz, seg: 12, open: true });
  k.cyl(0.51, 0.53, 0.07, PAL.stoneD, { x: c.cx, y: 0.035, z: c.cz, seg: 12 });
  k.cyl(0.09, 0.13, 0.5, PAL.stoneL, { x: c.cx, y: 0.45, z: c.cz, seg: 8 });
  k.cyl(0.18, 0.09, 0.07, PAL.stone, { x: c.cx, y: 0.5, z: c.cz, seg: 10 });
  k.cyl(0.07, 0.09, 0.1, PAL.stoneL, { x: c.cx, y: 0.66, z: c.cz, seg: 8 });
  k.cyl(0.2, 0.13, 0.1, PAL.stoneL, { x: c.cx, y: 0.76, z: c.cz, seg: 10 });
  k.cyl(0.045, 0.055, 0.09, PAL.stone, { x: c.cx, y: 0.85, z: c.cz, seg: 6 });
  c.emit({ kind: 'water', x: c.cx, y: 0.27, z: c.cz, r: 0.43 });
  c.emit({ kind: 'fountain', x: c.cx, y: 0.8, z: c.cz });
};
P.X = (c, k, m) => {
  if (!c.dmView) return; // a trap looks like floor to players
  m.bevel(0.82, 0.035, 0.82, PAL.blackened, { x: c.cx, y: 0.018, z: c.cz, b: 0.01 });
  for (const s of [-1, 1]) m.box(0.84, 0.04, 0.05, PAL.ironD, { x: c.cx, y: 0.02, z: c.cz + s * 0.41 });
  for (let i = 0; i < 9; i++) m.cone(0.055, 0.24, PAL.steel, { x: c.x0 + 0.2 + (i % 3) * 0.3, y: 0.12, z: c.z0 + 0.2 + Math.floor(i / 3) * 0.3, seg: 4 });
};
P['?'] = (c, k) => {
  // A signpost: a stout post with a capped top and two arrow boards with painted lettering.
  k.bevel(0.1, 1.18, 0.1, PAL.woodD, { x: c.cx, y: 0.59, z: c.cz, b: 0.018, vary: 0.05 });
  k.cone(0.085, 0.09, PAL.woodD, { x: c.cx, y: 1.225, z: c.cz, seg: 4, ry: Math.PI / 4 });
  k.rock(0.14, PAL.stoneD, { x: c.cx, y: 0.03, z: c.cz, flat: 0.5 });
  for (const [lx, y, ry, rz, len] of [[0.21, 0.96, 0, 0.04, 0.48], [-0.17, 0.72, 0.6, -0.05, 0.42]]) {
    const at = L(c.cx, c.cz, ry), dir = Math.sign(lx);
    k.bevel(len, 0.16, 0.045, PAL.woodL, { ...at(lx, 0), y, ry, rz, b: 0.012, vary: 0.06 });
    k.bevel(0.12, 0.12, 0.044, PAL.woodL, { ...at(lx + dir * len / 2, 0), y: y + dir * Math.sin(rz) * len / 2, ry, rz: Math.PI / 4 + rz, b: 0.012, vary: 0.06 });
    for (const ln of [-0.03, 0.03]) k.box(len * 0.6, 0.014, 0.05, PAL.woodDD, { ...at(lx - dir * 0.03, 0), y: y + ln + Math.sin(rz) * -0.03 * dir, ry, rz });
  }
};
P['}'] = (c, k, m) => {
  // A standard: a pole on a footed base with a plain finial and crossbar, a
  // swallow-tailed cloth with gilt edging and a plain disc device.
  const f = facingFromWalls(c);
  const ry = f ? f.ry : 0;
  const at = L(c.cx, c.cz, ry);
  m.cyl(0.03, 0.03, 1.6, PAL.blackened, { x: c.cx, y: 0.8, z: c.cz, seg: 6 });
  m.ball(0.055, PAL.gold, { x: c.cx, y: 1.64, z: c.cz, detail: 0 });
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; m.limb([c.cx, 0.18, c.cz], [c.cx + Math.cos(a) * 0.2, 0.01, c.cz + Math.sin(a) * 0.2], 0.024, 0.018, PAL.blackened, { seg: 4 }); }
  m.bevel(0.5, 0.045, 0.045, PAL.blackened, { ...at(0.2, 0), y: 1.55, ry, b: 0.01 });
  const cx = 0.22, top = 1.52, bot = 0.82, wdt = 0.44;
  k.bevel(wdt, top - bot - 0.1, 0.025, PAL.crimson, { ...at(cx, 0), y: (top + bot + 0.1) / 2, ry, b: 0.008, vary: 0.04 });
  const p = (lx, y) => { const q = at(lx, 0); return [q.x, y, q.z]; };
  k.membrane([p(cx - wdt / 2, bot + 0.1), p(cx, bot + 0.1), p(cx - wdt / 4, bot - 0.1)], PAL.crimson);
  k.membrane([p(cx, bot + 0.1), p(cx + wdt / 2, bot + 0.1), p(cx + wdt / 4, bot - 0.1)], PAL.crimson);
  for (const s of [-1, 1]) m.box(0.025, top - bot - 0.1, 0.032, PAL.gold, { ...at(cx + s * (wdt / 2 - 0.012), 0), y: (top + bot + 0.1) / 2, ry });
  m.box(wdt, 0.03, 0.032, PAL.gold, { ...at(cx, 0), y: top - 0.012, ry });
  m.cyl(0.09, 0.09, 0.035, PAL.gold, { ...at(cx, 0), y: 1.2, rx: Math.PI / 2, ry, seg: 10 });
};

/* ---------------- walls ---------------- */
// Masonry is laid along each exposed face in world space, so courses run on
// unbroken across cells and turn corners; a mortar-dark core fills the cell
// so neighbouring walls meet with no seam. Big chamfered stones in four
// courses (each set off from the last), a plinth at the foot and a coping
// course on top. Every stone is a face-only bevel (stoneGeo), so the light
// picks out each block's edges without paying for faces nobody sees.
const MASONRY = new Set(['#', 'S']);
const BRICK_L = 0.5, BRICK_T = 0.05, COURSES = 4, PLINTH = 0.12, COPING = 0.09;
const FACES = [
  { dx: 0, dy: -1, run: 'x' }, { dx: 0, dy: 1, run: 'x' },
  { dx: -1, dy: 0, run: 'z' }, { dx: 1, dy: 0, run: 'z' },
];
const isMasonry = (ch) => MASONRY.has(ch);
const faceRy = (f) => (f.run === 'x' ? (f.dy > 0 ? 0 : Math.PI) : (f.dx > 0 ? Math.PI / 2 : -Math.PI / 2));
function wallStone(c, k, color = PAL.stone) {
  // The core straddles the cut, so a dropped wall always has its dark cap.
  k.box(0.985, WALL_H - 0.01, 0.985, PAL.mortar, { x: c.cx, y: WALL_H / 2 - 0.005, z: c.cz });
  const h = (WALL_H - PLINTH - COPING) / COURSES;
  const tones = [color, color, PAL.stoneL, PAL.stoneD, shade(color, 0.1)];
  const EXT = BRICK_T + 0.012;
  for (const f of FACES) {
    if (isWallChar(c.at(f.dx, f.dy))) continue;
    const ux = f.run === 'x' ? 1 : 0, uy = 1 - ux;
    const sameFace = (s) => isMasonry(c.at(s * ux, s * uy)) && !isWallChar(c.at(s * ux + f.dx, s * uy + f.dy));
    const prevSame = sameFace(-1), nextSame = sameFace(1);
    const prevOuter = !isWallChar(c.at(-ux, -uy)), nextOuter = !isWallChar(c.at(ux, uy));
    const u0 = f.run === 'x' ? c.x0 : c.z0;
    const lo = u0 - (prevOuter ? EXT : 0), hi = u0 + 1 + (nextOuter ? EXT : 0);
    const along = f.run === 'x';
    const ry = faceRy(f);
    const put = (mid, n) => {
      const a = Math.min(u0 + 0.99, Math.max(u0 + 0.01, mid));
      return along ? { x: mid, z: c.cz + f.dy * n, ax: a, az: c.cz } : { x: c.cx + f.dx * n, z: mid, ax: c.cx, az: a };
    };
    const strip = (t, ext, y, hh, col) => {
      const a = prevSame ? u0 : u0 - (prevOuter ? ext : 0), e = nextSame ? u0 + 1 : u0 + 1 + (nextOuter ? ext : 0);
      faceStone(k, e - a, hh, t, col, { ...put((a + e) / 2, 0.5 + t / 2 - 0.01), y, ry, vary: 0.03 });
    };
    strip(0.08, 0.08, PLINTH / 2, PLINTH, PAL.stoneDD);
    strip(0.07, 0.07, WALL_H - COPING / 2, COPING, PAL.stoneD);
    for (let i = 0; i < COURSES; i++) {
      const off = ((i * 0.43) % 1) * BRICK_L;
      const y = PLINTH + i * h + h / 2;
      for (let s = Math.floor((u0 - off) / BRICK_L) * BRICK_L + off; s < u0 + 1; s += BRICK_L) {
        let a = s, e = s + BRICK_L;
        if (a < u0) a = prevSame ? u0 + 0.0125 : lo;
        if (e > u0 + 1) e = nextSame ? u0 + 1 - 0.0125 + 0.025 : hi;
        if (e - a < 0.05) continue;
        const len = e - a - 0.025, mid = (a + e) / 2;
        const t = BRICK_T + c.rnd() * 0.018; // proud or sunk a little
        const chip = c.rnd() < 0.06;
        const hh = (h - 0.028) * (chip ? 0.8 : 1);
        faceStone(k, len, hh, t, tones[Math.floor(c.rnd() * tones.length)], { ...put(mid, 0.5 + t / 2 - 0.012), y: y - (h - 0.028 - hh) / 2, ry, vary: 0.1 });
      }
    }
  }
  k.box(0.998, 0.04, 0.998, PAL.stoneDD, { x: c.cx, y: WALL_H + 0.02, z: c.cz });
}

export const WALLS = {
  '#': (c, k) => wallStone(c, k),
  'S': (c, k) => wallStone(c, k),
  '%': (c, k) => {
    // A ruined wall: a core of fill faced with big blocks whose courses give
    // out raggedly toward the top, loose stones on top, fallen ones at the foot.
    const h = WALL_H * (0.28 + c.rnd() * 0.55);
    k.box(0.92, h, 0.92, PAL.stoneDD, { x: c.cx, y: h / 2, z: c.cz });
    const bh = 0.24;
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy))) continue;
      const along = f.run === 'x', ry = faceRy(f);
      for (let i = 0; i * bh < h; i++) {
        for (let j = 0; j < 2; j++) {
          const u = -0.25 + j * 0.5 + ((i % 2) ? 0.08 : -0.08);
          const top = h + 0.12 - c.rnd() * 0.3;
          if (i * bh + bh * 0.5 > top) continue;
          const t = 0.08 + c.rnd() * 0.03, n = 0.46 + t / 2 - 0.03;
          const p = along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u };
          faceStone(k, 0.46, bh - 0.025, t, c.rnd() < 0.5 ? PAL.stone : PAL.stoneD, { ...p, y: i * bh + bh / 2, ry: ry + (c.rnd() - 0.5) * 0.08, vary: 0.12, ax: c.cx, az: c.cz });
        }
      }
      if (c.rnd() < 0.6) {
        const u = (c.rnd() - 0.5) * 0.6, n = 0.58;
        const p = along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u };
        k.bevel(0.24, 0.15, 0.18, PAL.stone, { ...p, y: 0.065, ry: c.rnd() * Math.PI, rz: (c.rnd() - 0.5) * 0.4, b: 0.03, vary: 0.1, ax: c.cx, az: c.cz });
      }
    }
    for (let i = 0; i < 3; i++) k.rock(0.11 + c.rnd() * 0.1, PAL.stone, { x: c.x0 + 0.15 + c.rnd() * 0.7, y: h + 0.02, z: c.z0 + 0.15 + c.rnd() * 0.7, flat: 0.6, vary: 0.08 });
    if (c.rnd() < 0.4) k.rock(0.24, PAL.moss2, { x: c.cx + (c.rnd() - 0.5) * 0.3, y: h, z: c.cz + (c.rnd() - 0.5) * 0.3, flat: 0.2, vary: 0.1 });
  },
  w: (c, k) => {
    // A timber palisade: a dark core faced on every open side with upright
    // logs sharpened to points, bound by two rope lashings.
    k.box(0.9, WALL_H, 0.9, PAL.woodDD, { x: c.cx, y: WALL_H / 2, z: c.cz });
    const anc = { ax: c.cx, az: c.cz };
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy))) continue;
      const along = f.run === 'x';
      const at = (u, n) => (along ? { x: c.cx + u, z: c.cz + f.dy * n } : { x: c.cx + f.dx * n, z: c.cz + u });
      for (const u of [-0.375, -0.125, 0.125, 0.375]) {
        const r = 0.12 + c.rnd() * 0.015, hh = WALL_H - 0.06 + (c.rnd() - 0.4) * 0.18;
        k.cyl(r * 0.95, r, hh, pick(c, [PAL.wood, PAL.woodD, PAL.plank]), { ...at(u, 0.43), y: hh / 2, seg: 6, ry: c.rnd(), vary: 0.08, ...anc });
        k.cone(r * 0.95, 0.24, PAL.woodL, { ...at(u, 0.43), y: hh + 0.12, seg: 6, ry: c.rnd(), ...anc });
      }
      for (const yy of [0.32, WALL_H - 0.3]) k.box(along ? 1.0 : 0.04, 0.06, along ? 0.04 : 1.0, PAL.rope, { ...at(0, 0.56), y: yy + (c.rnd() - 0.5) * 0.03, ...anc });
    }
    k.box(0.9, 0.04, 0.9, PAL.woodDD, { x: c.cx, y: WALL_H + 0.02, z: c.cz });
  },
  v: (c, k) => {
    // Cave rock: a great faceted mass, a second stone on its shoulder, fallen
    // chunks at the foot of each open side.
    const h = WALL_H * (0.9 + c.rnd() * 0.5);
    k.rock(0.62, PAL.stoneD, { x: c.cx, y: h * 0.45, z: c.cz, sy: h * 1.1, detail: 1, vary: 0.1 });
    k.rock(0.42, PAL.stone, { x: c.cx + (c.rnd() - 0.5) * 0.4, y: h * 0.9, z: c.cz + (c.rnd() - 0.5) * 0.4, detail: 0, vary: 0.08 });
    for (const f of FACES) {
      if (isWallChar(c.at(f.dx, f.dy)) || c.rnd() < 0.4) continue;
      const u = (c.rnd() - 0.5) * 0.6;
      k.rock(0.14 + c.rnd() * 0.08, PAL.stoneD, { x: c.cx + (f.run === 'x' ? u : f.dx * 0.45), y: 0.07, z: c.cz + (f.run === 'x' ? f.dy * 0.45 : u), flat: 0.6, vary: 0.1, ax: c.cx, az: c.cz });
    }
  },
  h: (c, k) => {
    // A clipped hedge: a squared, bevelled green block with faceted growth over it.
    k.bevel(0.94, 0.96, 0.94, shade(PAL.leaf, 0.12), { x: c.cx, y: 0.48, z: c.cz, b: 0.08, vary: 0.05 });
    for (let i = 0; i < 4; i++) k.ball(0.28, i % 2 ? PAL.leaf : shade(PAL.leaf, 0.12), { x: c.cx + (c.rnd() - 0.5) * 0.44, y: 0.8 + c.rnd() * 0.2, z: c.cz + (c.rnd() - 0.5) * 0.44, detail: 0, vary: 0.08 });
  },
  _: () => {},
};

export const PROPS = P;
