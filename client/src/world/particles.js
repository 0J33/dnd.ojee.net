import * as THREE from 'three';

// Every particle in the world — flames, embers, dust, spores, snow, hit
// sparks, healing motes — lives in ONE additive point cloud: one draw call,
// fed to the bloom. Spawning is cheap; dead particles are recycled.

const VERT = /* glsl */`
attribute float size;
attribute vec4 tint;
varying vec4 vTint;
uniform float scale;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec4 vTint;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vTint.rgb * a * vTint.a, 1.0);
}`;

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export default class Particles {
  constructor(max = 6000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.tint = new Float32Array(max * 4);
    this.from = new Float32Array(max * 3);
    this.to = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { scale: { value: 600 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.emitters = [];
  }

  setViewportHeight(h) { this.material.uniforms.scale.value = h * 0.9; }

  // p: { x y z, vx vy vz, life, size, from, to (colours), alpha, drag, grav }
  spawn(p) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx || 0, p.vy || 0, p.vz || 0], i * 3);
    this.life[i] = p.life || 1;
    this.age[i] = 0;
    this.size0[i] = p.size || 0.2;
    this.drag[i] = p.drag ?? 0.5;
    this.grav[i] = p.grav ?? 0;
    this.alpha[i] = p.alpha ?? 1;
    _c.set(p.from || '#ffffff'); _c2.set(p.to || p.from || '#ffffff');
    this.from.set([_c.r, _c.g, _c.b], i * 3);
    this.to.set([_c2.r, _c2.g, _c2.b], i * 3);
  }

  // A burst: n particles from a point, random directions.
  burst(x, y, z, n, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.6;
      const sp = (o.speed || 2) * (0.4 + Math.random() * 0.8);
      this.spawn({
        x, y, z,
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + (o.up || 0), vz: Math.sin(a) * Math.cos(e) * sp,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.8), size: (o.size || 0.15) * (0.6 + Math.random() * 0.8),
        from: o.from, to: o.to, drag: o.drag ?? 2.5, grav: o.grav ?? -4, alpha: o.alpha,
      });
    }
  }

  addEmitter(e) { e.acc = Math.random(); this.emitters.push(e); return e; }
  clearEmitters() { this.emitters = []; }

  update(dt, t) {
    for (const e of this.emitters) {
      if (e.paused) continue;
      e.acc += dt * (EMIT[e.kind]?.rate || 0) * (e.size || 1);
      while (e.acc >= 1) { e.acc -= 1; EMIT[e.kind]?.spawn(this, e, t); }
    }
    const { pos, vel, life, age, drag, grav, size, size0, tint, from, to, alpha } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / life[i];
      if (k >= 1) { life[i] = 0; size[i] = 0; tint[i * 4 + 3] = 0; this.free.push(i); continue; }
      const d = Math.exp(-drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d + grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // Grow in, shrink out; fade in quickly, out slowly.
      size[i] = size0[i] * Math.min(1, k * 6) * (1 - k * 0.6);
      const a = Math.min(1, k * 8) * (1 - k) * alpha[i];
      tint[i * 4] = from[i * 3] + (to[i * 3] - from[i * 3]) * k;
      tint[i * 4 + 1] = from[i * 3 + 1] + (to[i * 3 + 1] - from[i * 3 + 1]) * k;
      tint[i * 4 + 2] = from[i * 3 + 2] + (to[i * 3 + 2] - from[i * 3 + 2]) * k;
      tint[i * 4 + 3] = a;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
  }

  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}

const rnd = (a, b) => a + Math.random() * (b - a);

// What each kind of emitter spawns, and how often (per second, × size).
const EMIT = {
  fire: {
    rate: 46,
    spawn(P, e) {
      const s = e.size || 1;
      const r = 0.13 * s;
      P.spawn({ x: e.x + rnd(-r, r), y: e.y + rnd(0, 0.05), z: e.z + rnd(-r, r), vx: rnd(-0.1, 0.1), vy: rnd(0.7, 1.2) * s, vz: rnd(-0.1, 0.1), life: rnd(0.35, 0.7), size: rnd(0.32, 0.5) * s, from: '#ffe08a', to: '#ff3a10', drag: 1.2, grav: 0.3 });
      if (Math.random() < 0.12) P.spawn({ x: e.x, y: e.y + 0.2 * s, z: e.z, vx: rnd(-0.3, 0.3), vy: rnd(1, 1.8), vz: rnd(-0.3, 0.3), life: rnd(1, 1.8), size: 0.06, from: '#ffb050', to: '#ff4a10', drag: 0.4, grav: -0.2 });
    },
  },
  ember: { rate: 10, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.25, 0.25), y: e.y, z: e.z + rnd(-0.2, 0.2), vx: rnd(-0.15, 0.15), vy: rnd(0.3, 0.8), vz: rnd(-0.15, 0.15), life: rnd(0.8, 1.6), size: rnd(0.05, 0.1), from: '#ffc060', to: '#ff3a10', drag: 0.6, grav: 0 }); } },
  candle: { rate: 14, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.005, 0.005), y: e.y, z: e.z + rnd(-0.005, 0.005), vy: rnd(0.12, 0.2), life: rnd(0.25, 0.4), size: rnd(0.07, 0.1), from: '#fff0b0', to: '#ff8a30', drag: 1 }); } },
  sparkle: { rate: 3, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.3, 0.3), y: e.y + rnd(-0.1, 0.1), z: e.z + rnd(-0.3, 0.3), vy: 0.05, life: rnd(0.4, 0.8), size: rnd(0.06, 0.12), from: e.color || '#fff0a0', to: '#ffffff', drag: 1 }); } },
  bubbles: { rate: 6, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.2, 0.2), y: e.y, z: e.z + rnd(-0.2, 0.2), vy: rnd(0.2, 0.5), life: rnd(0.5, 1.1), size: rnd(0.06, 0.12), from: e.color, to: '#2a6a2a', drag: 1 }); } },
  spores: { rate: 2.5, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.4, 0.4), y: e.y + rnd(0, 0.3), z: e.z + rnd(-0.4, 0.4), vx: rnd(-0.05, 0.05), vy: rnd(0.04, 0.14), vz: rnd(-0.05, 0.05), life: rnd(2, 4), size: rnd(0.05, 0.09), from: e.color, to: '#ffffff', drag: 0.2, alpha: 0.8 }); } },
  crystal: { rate: 2, spawn(P, e) { P.spawn({ x: e.x + rnd(-0.3, 0.3), y: e.y + rnd(0, 0.5), z: e.z + rnd(-0.3, 0.3), vy: 0.08, life: rnd(0.6, 1.2), size: rnd(0.07, 0.12), from: e.color, to: '#ffffff', drag: 0.5 }); } },
  circle: { rate: 5, spawn(P, e) { const a = Math.random() * Math.PI * 2; P.spawn({ x: e.x + Math.cos(a) * 0.42, y: e.y, z: e.z + Math.sin(a) * 0.42, vy: rnd(0.3, 0.6), life: rnd(1, 1.8), size: rnd(0.06, 0.1), from: e.color, to: '#ffffff', drag: 0.3 }); } },
  fountain: { rate: 26, spawn(P, e) { const a = Math.random() * Math.PI * 2; P.spawn({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * rnd(0.2, 0.45), vy: rnd(0.9, 1.3), vz: Math.sin(a) * rnd(0.2, 0.45), life: rnd(0.6, 0.9), size: rnd(0.05, 0.09), from: '#cfeaff', to: '#6aa8d8', drag: 0.2, grav: -3.2, alpha: 0.7 }); } },
  // Ambient fields: e has a box { x0 z0 x1 z1 y0 y1 }.
  dust: { rate: 6, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(e.y0, e.y1), z: rnd(e.z0, e.z1), vx: rnd(-0.03, 0.03), vy: rnd(-0.01, 0.03), vz: rnd(-0.03, 0.03), life: rnd(5, 9), size: rnd(0.03, 0.06), from: '#ffe0b0', to: '#ffd090', drag: 0, alpha: 0.35 }); } },
  fireflies: { rate: 3, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(0.3, 1.6), z: rnd(e.z0, e.z1), vx: rnd(-0.15, 0.15), vy: rnd(-0.05, 0.08), vz: rnd(-0.15, 0.15), life: rnd(3, 6), size: rnd(0.06, 0.1), from: '#d8ff7a', to: '#9aff4a', drag: 0, alpha: 0.9 }); } },
  rain: { rate: 120, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(4, 6), z: rnd(e.z0, e.z1), vx: 0.3, vy: -9, vz: 0.1, life: 0.6, size: rnd(0.03, 0.05), from: '#a8c0d8', to: '#8aa0b8', drag: 0, alpha: 0.55 }); } },
  ashfall: { rate: 30, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(4, 6), z: rnd(e.z0, e.z1), vx: rnd(-0.15, 0.15), vy: rnd(-0.4, -0.6), vz: rnd(-0.15, 0.15), life: 10, size: rnd(0.04, 0.07), from: '#8a8580', to: '#5a5550', drag: 0, alpha: 0.7 }); } },
  mist: { rate: 6, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(0.05, 0.5), z: rnd(e.z0, e.z1), vx: rnd(0.05, 0.15), vy: 0.01, vz: rnd(-0.05, 0.05), life: rnd(5, 9), size: rnd(0.9, 1.6), from: '#c8ccd2', to: '#a8acb2', drag: 0, alpha: 0.12 }); } },
  snow: { rate: 40, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(4, 7), z: rnd(e.z0, e.z1), vx: rnd(-0.2, 0.2), vy: rnd(-0.6, -0.9), vz: rnd(-0.2, 0.2), life: 9, size: rnd(0.05, 0.09), from: '#ffffff', to: '#dfe8f0', drag: 0, alpha: 0.6 }); } },
  ash: { rate: 14, spawn(P, e) { P.spawn({ x: rnd(e.x0, e.x1), y: rnd(0, 0.4), z: rnd(e.z0, e.z1), vx: rnd(-0.1, 0.1), vy: rnd(0.4, 0.9), vz: rnd(-0.1, 0.1), life: rnd(2, 4), size: rnd(0.04, 0.08), from: '#ff8a30', to: '#ff2a00', drag: 0.2 }); } },
};
