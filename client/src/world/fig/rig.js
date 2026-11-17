import * as THREE from 'three';
import Kit, { MATS, seeded } from '../kit';
import { applyFinish } from './metal';

// The base of every figure: parts with pivots, walking along a path, turning,
// one-shot actions (melee, shoot, cast, hurt, cheer), hit flashes and death.
// Rigs (world/figures.js Biped, fig/beasts.js) pose the parts.

/* ---------------- parts ---------------- */

// A movable body part: up to five meshes sharing one pivot — painted
// (faceted), metal, glowing, skin (smooth) and polished (smooth metal).
// Materials are per figure so it can flash when hit and fade when it dies.
export class Part extends THREE.Group {
  constructor(fig, build) {
    super();
    const k = { s: new Kit(fig.rand), m: new Kit(fig.rand), g: new Kit(fig.rand), k: new Kit(fig.rand), n: new Kit(fig.rand) };
    build(k, this);
    for (const [kit, mat] of [[k.s, fig.mats.solid], [k.m, fig.mats.metal], [k.g, fig.mats.glow], [k.k, fig.mats.skin], [k.n, fig.mats.sheen]]) {
      const geo = kit.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mat !== fig.mats.glow;
      mesh.receiveShadow = false;
      this.add(mesh);
    }
  }
}

/* ---------------- the figure ---------------- */

export class Figure {
  constructor({ kind = 'biped', seed = 'x', scale = 1, ghostly = false } = {}) {
    this.kind = kind;
    this.rand = seeded((hash(seed) % 997) / 997 + 0.001);
    this.root = new THREE.Group();     // position + facing
    this.body = new THREE.Group();     // bob, lunge, fall
    this.root.add(this.body);
    this.parts = {};
    this.scale = scale;
    this.body.scale.setScalar(scale);
    this.ghostly = ghostly;
    this.mats = {
      solid: MATS.solid.clone(),
      metal: MATS.metal.clone(),
      glow: MATS.glow.clone(),
      // Skin is smooth-shaded with a little light of its own, so faces stay
      // friendly in a dark room; clothes and armour stay faceted.
      skin: smoothSkin(MATS.solid.clone()),
      sheen: Object.assign(MATS.metal.clone(), { flatShading: false }),
    };
    applyFinish(this.mats.metal, null);
    applyFinish(this.mats.sheen, null);
    if (ghostly) for (const m of Object.values(this.mats)) { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; }
    this.anim = { name: 'idle', t: 0, phase: Math.random() * 10 };
    this.path = [];
    this.speed = 3.4;
    this.yaw = 0; this.yawGoal = 0;
    this.flashT = 0;
    this.dead = false; this.deadT = 0;
    this.action = null;
    this.hover = 0;
  }

  part(name, build, parent = this.body) {
    const p = new Part(this, build);
    parent.add(p);
    if (name) this.parts[name] = p;
    return p;
  }

  place(x, z) { this.root.position.set(x, 0, z); this.path = []; }

  walk(points, { onDone } = {}) {
    if (!points.length) { onDone?.(); return; }
    this.path = points.slice();
    this.onArrive = onDone;
  }

  faceToward(x, z) {
    const dx = x - this.root.position.x, dz = z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) this.yawGoal = Math.atan2(dx, dz);
  }

  // One-shot actions: 'melee' | 'shoot' | 'cast' | 'hurt' | 'cheer'. `at`
  // fires the impact callback (the moment a blade lands or a bolt leaves).
  play(name, { at, onImpact, onDone } = {}) {
    const dur = { melee: 0.62, shoot: 0.8, cast: 0.9, hurt: 0.4, cheer: 1.1 }[name] || 0.6;
    this.action = { name, t: 0, dur, at: at ?? { melee: 0.36, shoot: 0.5, cast: 0.55, hurt: 0, cheer: 0 }[name] ?? 0.5, onImpact, onDone, fired: false };
    if (name === 'hurt') this.flashT = 0.3;
  }

  setDead(dead) {
    if (dead === this.dead) return;
    this.dead = dead;
    this.deadT = dead ? 0 : -1;
    if (!dead) { this.body.rotation.set(0, 0, 0); this.body.position.y = 0; this.setOpacity(1); }
  }

  setOpacity(a) {
    for (const m of Object.values(this.mats)) {
      if (a < 1) { m.transparent = true; m.opacity = this.ghostly ? Math.min(a, 0.62) : a; }
      else if (!this.ghostly) { m.transparent = false; m.opacity = 1; }
      else m.opacity = 0.62;
    }
  }

  update(dt, t) {
    this.anim.t += dt;
    let moving = false;
    if (this.path.length) {
      const goal = this.path[0], p = this.root.position;
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), step = this.speed * dt;
      if (d <= step) {
        p.x = goal.x; p.z = goal.z; this.path.shift();
        if (!this.path.length) { const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else {
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        this.yawGoal = Math.atan2(dx, dz);
      }
      moving = true;
    }
    let dy = this.yawGoal - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;

    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.55);
      const flies = this.kind === 'float';
      this.body.rotation.x = -Math.PI / 2 * easeOutBounce(k) * (flies ? 0 : 0.95);
      this.body.position.y = flies ? -0.3 * k : 0.06 * k;
      if (flies) this.setOpacity(Math.max(0, 1 - k));
      this.pose({ walk: 0, t, dt, still: true });
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.3);
      for (const m of [this.mats.solid, this.mats.skin]) m.emissive.setRGB(f * 0.9, f * 0.1, f * 0.05);
    } else if (this.mats.solid.emissive.r) for (const m of [this.mats.solid, this.mats.skin]) m.emissive.setRGB(0, 0, 0);

    this.walkBlend = (this.walkBlend || 0) + ((moving ? 1 : 0) - (this.walkBlend || 0)) * Math.min(1, dt * 10);
    this.stride = (this.stride || 0) + dt * (moving ? 11 : 0);
    this.pose({ walk: this.walkBlend, t, dt });

    const act = this.action;
    if (act) {
      act.t += dt;
      const k = act.t / act.dur;
      if (!act.fired && k >= act.at) { act.fired = true; act.onImpact?.(); }
      this.act(act.name, Math.min(1, k));
      if (k >= 1) { this.action = null; this.body.position.z = 0; act.onDone?.(); }
    }
  }

  pose() {}
  act() {}
}

function smoothSkin(mat) {
  mat.flatShading = false;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.14;');
  };
  mat.customProgramCacheKey = () => 'skin-fill';
  return mat;
}

function easeOutBounce(k) { return k < 0.8 ? (k / 0.8) * (k / 0.8) : 1 - Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.06; }
export function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

