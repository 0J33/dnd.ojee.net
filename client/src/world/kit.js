import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A tiny modelling kit. Shapes are added with a colour and a placement, and
// the whole lot merges into ONE geometry with per-vertex colours — so a
// room full of furniture, or a whole figure's torso, is a single draw call.
// Faceted on purpose: painted-miniature low poly.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export default class Kit {
  constructor(rand = Math.random) {
    this.parts = [];
    this.rand = rand;
  }

  // opts: x y z (position), rx ry rz (rotation), s or sx sy sz (scale),
  // vary (0..1 colour jitter so repeated parts don't look stamped),
  // ax az (anchor for the wall cutaway, when the part's centre isn't in its cell).
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    _p.set(o.x || 0, (o.y || 0) + (this.liftY || 0), o.z || 0); // liftY: build on a raised floor
    _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    if (o.parent) g.applyMatrix4(o.parent);
    _c.set(color);
    if (o.vary) _c.offsetHSL(0, 0, (this.rand() - 0.5) * o.vary);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // Where this part stands: the wall cutaway drops whole parts by it, so a
    // brick never shears across a cell edge.
    const anc = new Float32Array(n * 2);
    const ax = o.ax ?? _p.x, az = o.az ?? _p.z;
    for (let i = 0; i < n; i++) { anc[i * 2] = ax; anc[i * 2 + 1] = az; }
    g.setAttribute('anchor', new THREE.BufferAttribute(anc, 2));
    // ...and how low it reaches: a part wholly above the cut is taken away,
    // not pressed flat (a lintel flattened to the stub would roof the doorway).
    g.computeBoundingBox();
    g.setAttribute('ybot', new THREE.BufferAttribute(new Float32Array(n).fill(g.boundingBox.min.y), 1));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'anchor', 'ybot'].includes(k)) g.deleteAttribute(k);
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, color, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 8, 1, o.open || false, 0, o.arc || Math.PI * 2), color, o); }
  cone(r, h, color, o = {}) { return this.add(new THREE.ConeGeometry(r, h, o.seg || 8), color, o); }
  ball(r, color, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail ?? 1), color, o); }
  // theta: how far down from the top the sphere reaches (PI = whole, PI/2 = a dome).
  sphere(r, color, o = {}) { return this.add(new THREE.SphereGeometry(r, o.seg || 10, Math.max(4, Math.round((o.seg || 10) * 0.6)), 0, Math.PI * 2, 0, o.theta || Math.PI), color, o); }
  rock(r, color, o = {}) {
    // A lumpy stone: an icosahedron with its corners pushed about. Shared
    // corners move together (keyed by position), so the faces stay joined.
    const g = new THREE.IcosahedronGeometry(r, o.detail ?? 0);
    const p = g.attributes.position;
    const seed = this.rand() * 1000;
    const bump = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      let k = bump.get(key);
      if (k === undefined) {
        const h = Math.sin(p.getX(i) * 127.1 + p.getY(i) * 311.7 + p.getZ(i) * 74.7 + seed) * 43758.5453;
        k = 0.78 + (h - Math.floor(h)) * 0.44;
        bump.set(key, k);
      }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (o.flat ?? 1), p.getZ(i) * k);
    }
    return this.add(g, color, o);
  }
  // A tapered limb from point a to point b (arrays [x, y, z]), radius r0 at a
  // and r1 at b, with a ball at the joint so chains of limbs read as one.
  limb(a, b, r0, r1, color, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len < 1e-4) return this;
    const g = new THREE.CylinderGeometry(r1, r0, len, o.seg || 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    this.add(g, color, { vary: o.vary });
    if (o.joint !== false) this.add(new THREE.IcosahedronGeometry(r0 * 1.02, 0), color, { x: A.x, y: A.y, z: A.z });
    return this;
  }
  // A chain of limbs through points, tapering from r0 to r1.
  chain(points, r0, r1, color, o = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      const ka = i / (points.length - 1), kb = (i + 1) / (points.length - 1);
      this.limb(points[i], points[i + 1], r0 + (r1 - r0) * ka, r0 + (r1 - r0) * kb, color, { ...o, joint: i > 0 || o.joint });
    }
    return this;
  }
  // A flat skin (wing membrane, fin) through a fan of points, both sides.
  membrane(points, color, o = {}) {
    const v = [];
    for (let i = 1; i < points.length - 1; i++) v.push(...points[0], ...points[i], ...points[i + 1], ...points[0], ...points[i + 1], ...points[i]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.add(g, color, o);
  }
  torus(r, t, color, o = {}) { return this.add(new THREE.TorusGeometry(r, t, o.rseg || 6, o.tseg || 14, o.arc || Math.PI * 2), color, o); }
  plane(w, h, color, o = {}) { return this.add(new THREE.PlaneGeometry(w, h), color, o); }

  get empty() { return this.parts.length === 0; }

  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere();
    return g;
  }
}

// Shared materials. Faceted, matte, painted.
export const MATS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.04 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.55 }),
  // Unlit and not tone-mapped: these feed the bloom (flames, runes, eyes).
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  wall: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.02 }),
};

// Dollhouse cutaway for walls: on the camera's side of what you're looking
// at, walls drop to a stub so you always see into the room. (They still
// cast shadows — the shadow pass doesn't cut — so the light stays right.)
export const CUTAWAY = {
  center: { value: new THREE.Vector3() },
  dir: { value: new THREE.Vector2(0, 1) },
  dist: { value: 0.6 }, // walls more than half a cell toward the camera from the focus drop
  height: { value: 0.34 },
  on: { value: 1 },
};
// The cut happens in the vertex shader: on the near side, everything in the
// wall mesh above cutH is pressed down to cutH, so a wall becomes a solid
// stub whose top is a flat cap (no hollow shells, no see-through bricks).
// The wall mesh sits at the world origin, so object space is world space.
MATS.wall.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { cutCenter: CUTAWAY.center, cutDir: CUTAWAY.dir, cutDist: CUTAWAY.dist, cutH: CUTAWAY.height, cutOn: CUTAWAY.on });
  const decl = 'uniform vec3 cutCenter; uniform vec2 cutDir; uniform float cutDist; uniform float cutH; uniform float cutOn;';
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec2 anchor;\nattribute float ybot;\nvarying float vCap; ${decl}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  vCap = 0.0;
  vec2 cutCell = floor(anchor) + 0.5; // decide per grid cell, by where the part stands
  if (cutOn > 0.5 && dot(cutCell - cutCenter.xz, cutDir) > cutDist) {
    if (ybot > cutH - 0.001) transformed = vec3(anchor.x, -2.0, anchor.y); // gone: every corner on one point
    else if (transformed.y > cutH) { transformed.y = cutH; vCap = 1.0; }
  }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCap;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n  if (vCap > 0.999) diffuseColor.rgb = vec3(0.045, 0.04, 0.035);');
};

// Shadows use the same cut, or a lowered wall would still darken the floor
// behind it as if it stood full height.
export const WALL_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
WALL_DEPTH.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { cutCenter: CUTAWAY.center, cutDir: CUTAWAY.dir, cutDist: CUTAWAY.dist, cutH: CUTAWAY.height, cutOn: CUTAWAY.on });
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 anchor;\nattribute float ybot;\nuniform vec3 cutCenter; uniform vec2 cutDir; uniform float cutDist; uniform float cutH; uniform float cutOn;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  if (cutOn > 0.5 && dot(floor(anchor) + 0.5 - cutCenter.xz, cutDir) > cutDist) {
    if (ybot > cutH - 0.001) transformed = vec3(anchor.x, -2.0, anchor.y);
    else if (transformed.y > cutH) transformed.y = cutH;
  }`);
};

export function meshOf(kit, material = MATS.solid, { shadows = true } = {}) {
  const g = kit.build();
  if (!g) return null;
  const m = new THREE.Mesh(g, material);
  if (material === MATS.wall) m.customDepthMaterial = WALL_DEPTH;
  m.castShadow = shadows && material !== MATS.glow;
  m.receiveShadow = material !== MATS.glow;
  return m;
}

// Deterministic randomness per cell / seed, so a scene rebuilds identically.
export function seeded(seed) {
  let s = (Math.floor(seed * 2147483646) || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
