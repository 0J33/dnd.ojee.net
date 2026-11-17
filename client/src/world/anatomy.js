import * as THREE from 'three';
import { seg } from './kit';

// One parametric head for every hero, NPC and gearforged. A head is a single
// surface (skull, cheeks, jaw and chin together) described by a handful of
// numbers kept inside sane ranges, and every feature is placed on that
// surface by angle: az turns from the nose (+) toward the figure's left
// (+x), el lifts from the eyeline toward the crown. So eyes, ears, horns,
// tusks, hair, beards and hats sit on the face whatever its proportions —
// they can't float off it or sink into it — and they scale with the head.
//
// Hair, beards, hoods, helms, masks and visors are "shells": patches of the
// same surface lifted off it by a set distance, so a hairline or a helm's rim
// follows the skull exactly instead of being a sphere jammed onto it.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * The head's numbers from a resolved look. build is the body's width factor:
 * the head grows with the body, but only half as fast (as the portrait does).
 */
export function headTemplate(look, build = 1) {
  const race = look.race || {};
  const r = 0.105 * clamp(1 + (build - 1) * 0.5, 0.95, 1.08);
  let sx = 1, sy = 1.04, sz = 1, square = 1;
  const bodyJaw = look.body === 'feminine' ? 0.85 : look.body === 'masculine' ? 1.06 : 1;
  let jaw = clamp((race.jaw ?? 0.5) * bodyJaw, 0.34, 0.68);
  if (race.longFace) { sx = 0.94; sy = 1.12; }
  if (race.roundFace) { sx = 1.06; sy = 0.99; sz = 1.03; }
  if (race.robot) {
    // a gearforged head: a rounded box (visor), a little rounder (crested) or a
    // sphere (dome); the jaw barely narrows
    const kind = look.robotHead;
    square = kind === 'dome' ? 1 : kind === 'crest' ? 0.62 : 0.5;
    jaw = kind === 'dome' ? 0.62 : 0.86;
    sy = kind === 'dome' ? 1.02 : 0.98;
    sz = 0.98;
  }
  const H = { r, rx: r * sx, ry: r * sy, rz: r * sz * 0.98, jaw, square, robot: !!race.robot };
  H.cy = H.ry + 0.016; // the chin rests just above the neck's top
  return H;
}

// A unit-sphere direction to a point on the head.
function deform(H, nx, ny, nz) {
  let x = nx, y = ny, z = nz;
  if (H.square < 1) {
    const p = H.square;
    x = Math.sign(x) * Math.abs(x) ** p; y = Math.sign(y) * Math.abs(y) ** p; z = Math.sign(z) * Math.abs(z) ** p;
  }
  if (y < 0) {
    // the lower face narrows to the chin (jaw 0.34 fine .. 0.68 heavy), and
    // the chin comes forward a touch
    const t = (-y) ** 1.6;
    x *= 1 - t * (1 - (0.4 + H.jaw * 0.62));
    if (z > 0) z *= 1 + (-y) * 0.1;
  }
  return [x * H.rx, H.cy + y * H.ry, z * H.rz];
}

const dir = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// The surface normal at (az, el), from the surface itself (so it is right on
// boxy gearforged heads too).
function normalAt(H, az, el) {
  const e = 0.01;
  const elc = clamp(el, -1.55, 1.55);
  const p0 = deform(H, ...dir(az - e, elc)), p1 = deform(H, ...dir(az + e, elc));
  const q0 = deform(H, ...dir(az, elc - e)), q1 = deform(H, ...dir(az, elc + e));
  let n = norm(cross(sub(p1, p0), sub(q1, q0)));
  if (Math.abs(el) > 1.54 || !Number.isFinite(n[0])) n = [0, Math.sign(el) || 1, 0];
  const p = deform(H, ...dir(az, el));
  if (n[0] * p[0] + n[1] * (p[1] - H.cy) + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

/**
 * A point on the head at (az, el), lifted `out` off the surface along its
 * normal, as Kit placement options: x y z, plus a rotation that turns a
 * part's +z out of the face (its +x runs across, its +y up the surface).
 */
export function P(H, az, el, out = 0) {
  const p = deform(H, ...dir(az, el));
  const n = normalAt(H, az, el);
  return { x: p[0] + n[0] * out, y: p[1] + n[1] * out, z: p[2] + n[2] * out, rx: -Math.asin(clamp(n[1], -1, 1)), ry: Math.atan2(n[0], n[2]), order: 'YXZ', n };
}
export const at = (p) => [p.x, p.y, p.z];
// Placement that turns a part's +y (a cylinder's or cone's axis) out of the face.
export const along = (p) => ({ x: p.x, y: p.y, z: p.z, rx: p.rx + Math.PI / 2, ry: p.ry, order: 'YXZ' });

/**
 * A patch of the head's surface lifted `off` off it: azimuth a0..a1, and from
 * polar angle top(a) down to bot(a) (0 = crown, PI = under the chin; numbers
 * or functions of the azimuth). taper (0..1) brings the lower edge down onto
 * the skin, so hair and beards grow out of the face rather than sitting on
 * it like a cap. post(v, a, th) may move each vertex.
 */
export function shell(H, off, { a0 = -Math.PI, a1 = Math.PI, top = 0, bot = Math.PI, cols = 20, rows = 8, taper = 0, post } = {}) {
  cols = seg(cols, 6); rows = seg(rows, 3); // fewer on a figure's simple build
  const T = typeof top === 'function' ? top : () => top;
  const B = typeof bot === 'function' ? bot : () => bot;
  const grid = [];
  for (let i = 0; i <= cols; i++) {
    const a = a0 + ((a1 - a0) * i) / cols, t0 = T(a), t1 = B(a);
    const col = [];
    for (let j = 0; j <= rows; j++) {
      const th = t0 + ((t1 - t0) * j) / rows, el = Math.PI / 2 - th;
      const p = P(H, a, el, off * (1 - taper * smooth((j / rows - 0.55) / 0.45)));
      const v = [p.x, p.y, p.z];
      if (post) post(v, a, th, p.n);
      v.n = p.n;
      col.push(v);
    }
    grid.push(col);
  }
  // Normals: the surface's own (so smooth-shaded skin is smooth across the
  // whole head); where post() has moved the vertices, from the moved grid.
  if (post) {
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
      const L = grid[Math.max(0, i - 1)][j], R = grid[Math.min(cols, i + 1)][j];
      const U = grid[i][Math.max(0, j - 1)], D = grid[i][Math.min(rows, j + 1)];
      let n = norm(cross(sub(R, L), sub(D, U)));
      const v = grid[i][j];
      if (!Number.isFinite(n[0]) || (n[0] === 0 && n[1] === 0 && n[2] === 0)) n = v.n;
      if (n[0] * v.n[0] + n[1] * v.n[1] + n[2] * v.n[2] < 0) n = [-n[0], -n[1], -n[2]];
      v.n = n;
    }
  }
  const pos = [], nrm = [];
  const tri = (A, B2, C) => {
    // wind every face to look outward from the head's centre
    const n = cross(sub(B2, A), sub(C, A));
    const c = [(A[0] + B2[0] + C[0]) / 3, (A[1] + B2[1] + C[1]) / 3 - H.cy, (A[2] + B2[2] + C[2]) / 3];
    const vs = n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0 ? [A, C, B2] : [A, B2, C];
    for (const v of vs) { pos.push(v[0], v[1], v[2]); nrm.push(...v.n); }
  };
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const v00 = grid[i][j], v10 = grid[i + 1][j], v01 = grid[i][j + 1], v11 = grid[i + 1][j + 1];
    if (j > 0 || T(a0) > 0.001) tri(v00, v10, v11); // no slivers at the crown's pole
    tri(v00, v11, v01);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** The whole head. */
export const headGeo = (H, seg = 18) => shell(H, 0, { cols: seg, rows: Math.round(seg * 0.6) });

/**
 * A hairline (or helm rim, hood edge) round the head: polar angle at the
 * front, at the ears and at the nape, eased between.
 */
export function hairline(front, side, back) {
  return (a) => {
    const t = Math.abs(a) / Math.PI;
    return t < 0.5 ? front + (side - front) * smooth(t * 2) : side + (back - side) * smooth((t - 0.5) * 2);
  };
}

/** A band round the head between two elevations (circlets, hat bands, brow rings). */
export const ring = (H, off, el0, el1, cols = 24) => shell(H, off, { top: Math.PI / 2 - el1, bot: Math.PI / 2 - el0, rows: 1, cols });

/** The widest the head gets at an elevation (for barrels round it). */
export function girth(H, el) {
  let m = 0;
  for (let i = 0; i < 16; i++) { const p = P(H, (i / 16) * Math.PI * 2, el); m = Math.max(m, Math.hypot(p.x, p.z)); }
  return m;
}

/* ---------------- metal: something to reflect, and how it has aged ---------------- */

// Metal with nothing to reflect renders near black (there is no environment
// map in the scene), so every figure's metal reflects one small shared
// painted sky: warm light above, a lit horizon, dark floor. It is a 64x32
// texture built once.
let ENV = null;
export function metalEnv() {
  if (ENV) return ENV;
  const w = 64, h = 32, d = new Uint8Array(w * h * 4);
  const top = new THREE.Color('#f2eee8'), hor = new THREE.Color('#8c8680'), low = new THREE.Color('#1e1c1a'), c = new THREE.Color();
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1); // 0 = straight down, 1 = straight up
    for (let i = 0; i < w; i++) {
      if (v > 0.5) c.copy(hor).lerp(top, smooth((v - 0.5) * 2.2)); else c.copy(low).lerp(hor, smooth(v * 2) ** 2);
      // a warm window high to one side gives polished metal its glint
      const u = i / w, win = Math.exp(-(((u - 0.62) / 0.06) ** 2) - (((v - 0.74) / 0.08) ** 2));
      c.lerp(new THREE.Color('#fff8e8'), win * 0.8);
      const k = (j * w + i) * 4;
      d[k] = c.r * 255; d[k + 1] = c.g * 255; d[k + 2] = c.b * 255; d[k + 3] = 255;
    }
  }
  ENV = new THREE.DataTexture(d, w, h);
  ENV.mapping = THREE.EquirectangularReflectionMapping;
  ENV.colorSpace = THREE.SRGBColorSpace;
  ENV.magFilter = THREE.LinearFilter;
  ENV.needsUpdate = true;
  return ENV;
}

// Rust and wear are painted by the material, not modelled: a noise pattern in
// the part's own space blooms rust (rough, matte, orange-brown with darker
// pits) over the plating, or for worn metal dulls it in patches. No blobs.
const NOISE = `
float finH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float finN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(finH(i), finH(i + vec3(1, 0, 0)), f.x), mix(finH(i + vec3(0, 1, 0)), finH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(finH(i + vec3(0, 0, 1)), finH(i + vec3(1, 0, 1)), f.x), mix(finH(i + vec3(0, 1, 1)), finH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float finF(vec3 p) { return finN(p) * 0.55 + finN(p * 2.03 + 7.1) * 0.3 + finN(p * 4.07 + 3.3) * 0.15; }
`;

const FINISH = {
  polished: { roughness: 0.24, metalness: 0.62, envMapIntensity: 1.2 },
  worn: { roughness: 0.48, metalness: 0.45, envMapIntensity: 0.9 },
  rusted: { roughness: 0.55, metalness: 0.4, envMapIntensity: 0.75 },
};

/** Give a figure's metal material its finish (null: plain armour and blades). */
export function applyFinish(mat, finish) {
  mat.envMap = metalEnv();
  mat.envMapIntensity = 0.9;
  if (!FINISH[finish]) return;
  Object.assign(mat, FINISH[finish]);
  if (finish === 'polished') return;
  const rust = finish === 'rusted';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFinP;\n${NOISE}`)
      .replace('#include <color_fragment>', rust ? `#include <color_fragment>
  float finA = smoothstep(0.53, 0.64, finF(vFinP * 22.0));
  float finPit = smoothstep(0.66, 0.82, finN(vFinP * 150.0)) * 0.6;
  vec3 finC = mix(vec3(0.2, 0.07, 0.03), vec3(0.42, 0.17, 0.06), finN(vFinP * 55.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, finC, max(finA * 0.9, finPit * 0.45));
  diffuseColor.rgb *= 1.0 - finPit * finA * 0.35;` : `#include <color_fragment>
  float finA = smoothstep(0.5, 0.75, finF(vFinP * 20.0)) * 0.55;
  diffuseColor.rgb *= 1.0 - finA * 0.35;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, finA);')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, ${rust ? '0.08' : '0.4'}, finA);`);
  };
  mat.customProgramCacheKey = () => `finish-${finish}`;
}
