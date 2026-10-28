import * as THREE from 'three';
import Kit, { MATS, seeded } from './kit';

// Painted miniatures for heroes, NPCs and monsters, built from parts so they
// can move: a biped rig (heroes, NPCs, goblins, skeletons, giants…), a
// quadruped rig (wolves, bears, rats, dragons…), a many-legged rig (spiders,
// insects), and floaters/blobs (ghosts, oozes, bats, elementals, swarms).
//
// Heroes are built from resolveLook(sheet) — the same traits the portrait
// draws — so changing a hero's look in the portrait editor changes the
// figure too. The figure faces +z; its root sits on the floor at y = 0.

const darken = (c, k = 0.25) => '#' + new THREE.Color(c).lerp(new THREE.Color('#140c08'), k).getHexString();
const lighten = (c, k = 0.2) => '#' + new THREE.Color(c).lerp(new THREE.Color('#fff3dc'), k).getHexString();

// A movable body part: up to three meshes (painted, metal, glowing) sharing
// one pivot. Materials are per figure so it can flash when hit and fade
// when it dies.
class Part extends THREE.Group {
  constructor(fig, build) {
    super();
    const k = { s: new Kit(fig.rand), m: new Kit(fig.rand), g: new Kit(fig.rand) };
    build(k);
    for (const [kit, mat] of [[k.s, fig.mats.solid], [k.m, fig.mats.metal], [k.g, fig.mats.glow]]) {
      const geo = kit.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mat !== fig.mats.glow;
      mesh.receiveShadow = false;
      this.add(mesh);
    }
  }
}

/* ======================= the figure ======================= */

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
    this.mats = {
      solid: MATS.solid.clone(),
      metal: MATS.metal.clone(),
      glow: MATS.glow.clone(),
    };
    if (ghostly) for (const m of Object.values(this.mats)) { m.transparent = true; m.opacity = 0.55; m.depthWrite = false; }
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
    this.parts[name] = p;
    return p;
  }

  // Put on a cell instantly.
  place(x, z) { this.root.position.set(x, 0, z); this.path = []; }

  // Walk through a list of {x, z} points.
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
      if (a < 1) { m.transparent = true; m.opacity = a; } else if (!this.ghostly) { m.transparent = false; m.opacity = 1; }
    }
  }

  update(dt, t) {
    const a = this.anim;
    a.t += dt;
    // Walking along the path.
    let moving = false;
    if (this.path.length) {
      const goal = this.path[0];
      const p = this.root.position;
      const dx = goal.x - p.x, dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        p.x = goal.x; p.z = goal.z; this.path.shift();
        if (!this.path.length) { const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else {
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        this.yawGoal = Math.atan2(dx, dz);
      }
      moving = true;
    }
    // Turn smoothly.
    let dy = this.yawGoal - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;

    // Death: topple, then sink a little and dim.
    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.55);
      this.body.rotation.x = -Math.PI / 2 * easeOutBounce(k) * (this.kind === 'float' ? 0 : 0.95);
      this.body.position.y = this.kind === 'float' ? -0.3 * k : 0.06 * k;
      if (this.kind === 'float') this.setOpacity(Math.max(0, 1 - k));
      this.pose({ walk: 0, t, dt, still: true });
      return;
    }

    // Hit flash.
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.3);
      this.mats.solid.emissive.setRGB(f * 0.9, f * 0.1, f * 0.05);
    } else if (this.mats.solid.emissive.r) this.mats.solid.emissive.setRGB(0, 0, 0);

    const walkK = moving ? 1 : 0;
    this.walkBlend = (this.walkBlend || 0) + (walkK - (this.walkBlend || 0)) * Math.min(1, dt * 10);
    this.stride = (this.stride || 0) + dt * (moving ? 11 : 0);
    this.pose({ walk: this.walkBlend, t, dt });

    // Actions on top of the pose.
    const act = this.action;
    if (act) {
      act.t += dt;
      const k = act.t / act.dur;
      if (!act.fired && k >= act.at) { act.fired = true; act.onImpact?.(); }
      this.act(act.name, Math.min(1, k));
      if (k >= 1) { this.action = null; this.body.position.z = 0; act.onDone?.(); }
    }
  }

  // Rig-specific posing (overridden per kind).
  pose() {}
  act() {}
}

function easeOutBounce(k) { return k < 0.8 ? (k / 0.8) * (k / 0.8) : 1 - Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.06; }
function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ======================= biped ======================= */

const LEG = 0.42, TORSO = 0.34, SHOULDER = 0.165;
const ORB_Y = LEG + TORSO + 0.17; // a caster's spark floats at head height
const BOW_REST = 0.35; // a resting bow leans its top limb a little forward, clear of the arm

class Biped extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts;
    const s = Math.sin(this.stride || 0) * walk;
    const breathe = still ? 0 : Math.sin(t * 2.1 + this.anim.phase) * 0.012;
    if (P.legL) { P.legL.rotation.x = s * 0.6; P.legR.rotation.x = -s * 0.6; }
    if (P.armL) {
      P.armL.rotation.x = -s * 0.5 + breathe * 2; P.armR.rotation.x = s * 0.5 - breathe * 2;
      P.armL.rotation.z = 0.12 + breathe; P.armR.rotation.z = -0.12 - breathe;
      if (this.zombie) { P.armL.rotation.x = -1.35 + s * 0.15; P.armR.rotation.x = -1.4 - s * 0.15; }
    }
    if (P.torso) P.torso.scale.y = 1 + breathe;
    if (P.orb) { P.orb.rotation.y = t * 1.9; P.orb.position.y = ORB_Y + Math.sin(t * 1.7 + this.anim.phase) * 0.025; P.orb.position.x = 0.22 + Math.sin(t * 0.9 + this.anim.phase) * 0.02; }
    if (P.head) { P.head.rotation.y = Math.sin(t * 0.37 + this.anim.phase) * 0.25 * (1 - walk); }
    this.body.position.y = Math.abs(Math.sin(this.stride || 0)) * 0.035 * walk + (this.hover || 0);
  }

  act(name, k) {
    const P = this.parts;
    if (name === 'melee') {
      // Wind up, swing through, recover; the body lunges with the blow.
      if (k < 0.35) {
        const w = k / 0.35;
        P.armR.rotation.x = -2.6 * w; P.armL.rotation.x = -0.5 * w;
        this.body.position.z = -0.06 * w; P.torso.rotation.y = 0.4 * w;
      } else if (k < 0.6) {
        const sw = (k - 0.35) / 0.25;
        P.armR.rotation.x = -2.6 + 3.2 * sw; P.armL.rotation.x = -0.5 + 0.5 * sw;
        this.body.position.z = 0.28 * sw; P.torso.rotation.y = 0.4 - 0.8 * sw;
      } else {
        const b = (k - 0.6) / 0.4;
        P.armR.rotation.x = 0.6 * (1 - b);
        this.body.position.z = 0.28 * (1 - b); P.torso.rotation.y = -0.4 * (1 - b);
      }
    } else if (name === 'shoot') {
      const draw = Math.min(1, k / 0.45), rel = k > 0.5 ? (k - 0.5) / 0.5 : 0;
      P.armL.rotation.x = -1.5 * Math.min(1, draw * 1.5) * (1 - rel * 0.8);
      P.armR.rotation.x = -1.5 * draw * (1 - rel);
      P.armR.rotation.z = -0.12 + 0.6 * draw * (1 - rel);
      P.torso.rotation.y = 0.5 * draw * (1 - rel);
      if (P.bow) P.bow.rotation.x = BOW_REST + (0.1 - BOW_REST) * Math.min(1, draw * 1.5) * (1 - rel) - P.armL.rotation.x; // upright to aim
    } else if (name === 'cast') {
      const up = Math.min(1, k / 0.5), rel = k > 0.55 ? (k - 0.55) / 0.45 : 0;
      P.armL.rotation.x = -2.3 * up * (1 - rel) - 1.2 * rel * (1 - rel) * 4;
      P.armR.rotation.x = -2.3 * up * (1 - rel) - 1.4 * rel * (1 - rel) * 4;
      P.armL.rotation.z = 0.5 * up * (1 - rel); P.armR.rotation.z = -0.5 * up * (1 - rel);
      this.hover = 0.08 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    } else if (name === 'hurt') {
      const r = Math.sin(k * Math.PI);
      P.torso.rotation.x = -0.35 * r;
      this.body.position.z = -0.12 * r;
    } else if (name === 'cheer') {
      const j = Math.abs(Math.sin(k * Math.PI * 2));
      this.body.position.y = j * 0.3;
      P.armL.rotation.x = -2.8; P.armR.rotation.x = -2.8;
    }
    if (k >= 1) { P.torso.rotation.set(0, 0, 0); this.hover = 0; if (P.bow) P.bow.rotation.x = BOW_REST; }
  }
}

// Shared body for every biped. o: { skin, garb, trim, pants, boots, build,
// robot, bones, robe, plate, fur, belly }
function bipedBody(fig, o) {
  const w = o.build || 1;
  const pants = o.pants || darken(o.garb, 0.35), boots = o.boots || '#2e2218';
  for (const side of [-1, 1]) {
    const leg = fig.part(side < 0 ? 'legL' : 'legR', ({ s, m }) => {
      if (o.bones) {
        s.cyl(0.025, 0.025, LEG - 0.04, '#e8e0cc', { y: -LEG / 2 });
        s.ball(0.04, '#e8e0cc', { y: -LEG + 0.03, sy: 0.6 });
      } else if (o.robot) {
        // plated thigh and shin on a dark knee joint, a trim stripe, a two-part foot
        const joint = darken(o.skin, 0.45);
        m.cyl(0.055, 0.046, 0.18, o.skin, { y: -0.09, seg: 8 });
        m.ball(0.04, joint, { y: -0.2 });
        m.cyl(0.05, 0.042, 0.16, o.skin, { y: -0.29, seg: 8 });
        m.box(0.012, 0.12, 0.012, o.trim || o.glow, { y: -0.29, z: 0.048 });
        m.ball(0.032, joint, { y: -0.37 });
        m.box(0.09, 0.05, 0.1, darken(o.skin), { y: -LEG + 0.025, z: 0.0 });
        m.box(0.085, 0.035, 0.06, darken(o.skin, 0.1), { y: -LEG + 0.018, z: 0.075, rx: 0.15 });
      } else {
        // thigh, knee, shin; a boot with a turned-down cuff, a foot and a sole
        s.chain([[0, 0.01, 0], [0, -0.2, 0.008], [0, -0.3, 0]], 0.06 * w, 0.046 * w, pants, { seg: 9, vary: 0.03 });
        s.cyl(0.054 * w, 0.05 * w, 0.12, boots, { y: -0.335, seg: 9 });
        s.cyl(0.061 * w, 0.057 * w, 0.03, lighten(boots, 0.12), { y: -0.28, seg: 9 }); // the cuff
        s.sphere(0.056 * w, boots, { y: -LEG + 0.045, z: 0.035, sx: 0.95, sy: 0.62, sz: 1.45, seg: 9 }); // the foot, toe rounded
        s.box(0.1 * w, 0.018, 0.17, darken(boots, 0.35), { y: -LEG + 0.009, z: 0.03 }); // sole
      }
    });
    leg.position.set(side * 0.075 * w, LEG, 0);
  }
  const torso = fig.part('torso', ({ s, m, g }) => {
    if (o.bones) {
      s.cyl(0.02, 0.02, TORSO, '#e8e0cc', { y: TORSO / 2 });
      for (let i = 0; i < 4; i++) s.torus(0.085 - i * 0.008, 0.012, '#e8e0cc', { y: 0.12 + i * 0.055, rx: Math.PI / 2, tseg: 10 });
      s.box(0.18, 0.05, 0.08, '#d8d0bc', { y: 0.02 });
      return;
    }
    if (o.robot) {
      // a plated chest over a jointed waist, a shoulder yoke with rivets,
      // trim-coloured seams, and a glowing core; a cloth tabard and belt in
      // the hero's clothing colours if they wear any
      const joint = darken(o.skin, 0.45), seam = o.trim || o.glow || '#5ef0e0';
      m.cyl(0.1 * w, 0.11 * w, 0.08, darken(o.skin, 0.15), { y: 0.04, seg: 10 });            // pelvis
      for (let i = 0; i < 3; i++) m.cyl(0.095 * w, 0.095 * w, 0.022, joint, { y: 0.1 + i * 0.03, seg: 10 }); // waist rings
      m.cyl(0.145 * w, 0.115 * w, 0.17, o.skin, { y: TORSO - 0.1, seg: 10 });               // chest
      m.box(0.2 * w, 0.12, 0.03, lighten(o.skin, 0.08), { y: TORSO - 0.1, z: 0.12 * w });   // chest plate
      m.box(0.36 * w, 0.06, 0.17, darken(o.skin), { y: TORSO - 0.03 });                    // shoulder yoke
      for (const sd of [-1, 1]) {
        m.box(0.012, 0.15, 0.012, seam, { x: sd * 0.07 * w, y: TORSO - 0.1, z: 0.137 * w });
        for (const dy of [-0.05, 0.05]) m.ball(0.008, lighten(o.skin, 0.3), { x: sd * 0.09 * w, y: TORSO - 0.1 + dy, z: 0.137 * w, detail: 0 });
        m.ball(0.01, lighten(o.skin, 0.3), { x: sd * 0.15 * w, y: TORSO - 0.01, z: 0.07, detail: 0 });
      }
      g.ball(0.04, o.glow || '#5ef0e0', { y: TORSO * 0.6, z: 0.135 });
      m.torus(0.048, 0.008, seam, { y: TORSO * 0.6, z: 0.13, tseg: 16 });
      // the metal as it has aged: rust blooms on a rusted frame
      if (o.finish === 'rusted') for (const [x, y, z] of [[0.06, TORSO - 0.06, 0.13], [-0.09, 0.16, 0.09], [0.1, 0.07, -0.08], [-0.05, TORSO - 0.14, -0.12]]) s.sphere(0.03, '#7a3e1e', { x: x * w, y, z: z * w, sz: 0.35, seg: 6, vary: 0.15 });
      return;
    }
    // The body under the clothes: hips, a waist, a rounded chest and
    // shoulders (narrower shoulders and waist, fuller hips for a feminine
    // build), then a neck.
    const fem = o.body === 'feminine';
    const sh = fem ? 0.9 : 1, hip = fem ? 1.1 : 1, belly = o.belly || 1;
    s.cyl(0.118 * w * hip, 0.122 * w * hip, 0.09, o.garb, { y: 0.045, seg: 12, vary: 0.03 });                     // hips
    s.cyl(0.13 * w * sh * belly, 0.112 * w * (fem ? 0.92 : 1) * belly, 0.16, o.garb, { y: 0.16, seg: 12, vary: 0.03 }); // waist up to the ribs
    s.sphere(0.145 * w * sh, o.garb, { y: TORSO * 0.74, sx: 1.02, sy: 0.72, sz: 0.74, seg: 14, vary: 0.03 });       // chest and shoulders
    for (const sd of [-1, 1]) s.sphere(0.056 * w, o.garb, { x: sd * SHOULDER * w * sh, y: TORSO - 0.045, seg: 9 }); // shoulder caps
    s.cyl(0.042, 0.048, 0.05, o.skin, { y: TORSO - 0.005, seg: 9 });                                                   // neck
    // Clothing: a collar, a placket down the front, a hem that flares over
    // the hips, and a belt with a buckle and a pouch.
    if (!o.collar && !o.fur) s.torus(0.058, 0.011, o.trim, { y: TORSO - 0.012, rx: Math.PI / 2 + 0.25, tseg: 14 });
    if (!o.plate) s.box(0.014, TORSO * 0.42, 0.008, darken(o.garb, 0.2), { y: TORSO * 0.5, z: 0.118 * w * sh });
    if (!o.robe) s.cyl(0.124 * w * hip, 0.15 * w * hip, 0.085, o.garb, { y: -0.03, seg: 12, open: true, vary: 0.03 }); // tunic hem over the hips
    if (!o.robe) s.cyl(0.151 * w * hip, 0.153 * w * hip, 0.014, darken(o.trim, 0.1), { y: -0.07, seg: 12, open: true });
    s.cyl(0.123 * w * hip, 0.123 * w * hip, 0.038, o.trim, { y: 0.035, seg: 12 }); // belt
    s.box(0.034, 0.03, 0.012, '#c8a050', { y: 0.035, z: 0.124 * w * hip });
    s.box(0.018, 0.016, 0.014, darken(o.trim, 0.3), { y: 0.035, z: 0.128 * w * hip });
    if (!o.apron && !o.robe) {
      s.box(0.05, 0.055, 0.03, '#5a3a22', { x: -0.1 * w * hip, y: 0.005, z: 0.07 * w, ry: 0.6 }); // pouch
      s.box(0.052, 0.018, 0.032, '#4a2e1a', { x: -0.1 * w * hip, y: 0.03, z: 0.07 * w, ry: 0.6 });
    }
    if (o.robe) s.cyl(0.12 * w, 0.2 * w, 0.42, o.garb, { y: -0.18, seg: 9, vary: 0.04 });
    if (o.robe) s.cyl(0.2 * w, 0.205 * w, 0.03, o.trim, { y: -0.38, seg: 9 });
    if (o.plate) {
      // a breastplate with a centre ridge, over a mail skirt
      m.sphere(0.152 * w * sh, '#9aa0a8', { y: TORSO * 0.62, sx: 1, sy: 0.85, sz: 0.8, seg: 14 });
      m.cyl(0.128 * w, 0.124 * w, 0.1, '#8a9098', { y: 0.13, seg: 12 });
      m.box(0.012, TORSO * 0.4, 0.02, '#b4bac2', { y: TORSO * 0.62, z: 0.118 * w });
      m.cyl(0.128 * w * hip, 0.156 * w * hip, 0.1, '#6e747c', { y: -0.025, seg: 14, open: true }); // mail
    }
    if (o.fur) s.torus(0.12 * w, 0.045, '#8a6a44', { y: TORSO - 0.02, rx: Math.PI / 2, tseg: 10 });
    if (o.collar) s.cyl(0.1, 0.15, 0.08, o.trim, { y: TORSO + 0.01, seg: 8 });
    if (o.symbol) m.ball(0.022, o.trim || '#d4a94f', { y: TORSO * 0.78, z: 0.13 * w, sz: 0.5 }); // a plain brooch at the collar
    if (o.cloak) {
      // a cloak wrapped round the back from the shoulders, widening as it falls,
      // with a clasp at each shoulder
      const arc = Math.PI * 0.95, cl = TORSO + 0.3;
      s.cyl(0.15 * w * sh, 0.2 * w, cl, o.cloak, { y: TORSO - cl / 2 + 0.01, arc, ry: Math.PI - arc / 2, open: true, seg: 14, vary: 0.04 });
      s.cyl(0.152 * w * sh, 0.152 * w * sh, 0.03, darken(o.cloak, 0.25), { y: TORSO - 0.005, arc, ry: Math.PI - arc / 2, open: true, seg: 14 });
      for (const sd of [-1, 1]) s.ball(0.016, '#c8a050', { x: sd * 0.1 * w * sh, y: TORSO - 0.02, z: 0.07 * w });
    }
    if (o.quiver) {
      // Slung across the back over the cloak, leaning to the left shoulder,
      // with arrow shafts and flat fletching standing out of the mouth.
      const lean = 0.35, ux = -Math.sin(lean), uy = Math.cos(lean), zq = -0.13 * w - 0.065;
      const base = TORSO * 0.55, at = (d, lat = 0) => ({ x: ux * d + Math.cos(lean) * lat, y: base + uy * d + Math.sin(lean) * lat });
      s.cyl(0.045, 0.038, 0.32, '#5a3a22', { ...at(0), z: zq, rz: lean, seg: 8 });
      s.cyl(0.048, 0.048, 0.03, '#3a2416', { ...at(0.15), z: zq, rz: lean, seg: 8 }); // leather rim
      for (const [lat, dz, len] of [[-0.018, 0.01, 0.1], [0.016, -0.012, 0.12], [0, 0.016, 0.09]]) {
        s.cyl(0.005, 0.005, len, '#8a6a44', { ...at(0.16 + len / 2, lat), z: zq + dz, rz: lean, seg: 4 });
        for (const ry of [0, Math.PI / 2]) s.box(0.004, 0.05, 0.022, '#d8cfb4', { ...at(0.16 + len - 0.03, lat), z: zq + dz, rz: lean, ry });
      }
    }
    if (o.lute) {
      s.sphere(0.09, '#a8743a', { y: 0.12, z: -0.15, sz: 0.4, seg: 8 });
      s.box(0.03, 0.26, 0.02, '#5a3a22', { x: 0.08, y: 0.3, z: -0.15, rz: -0.5 });
    }
  });
  torso.position.y = LEG;
  for (const side of [-1, 1]) {
    const arm = fig.part(side < 0 ? 'armL' : 'armR', ({ s, m }) => {
      if (o.bones) {
        s.cyl(0.02, 0.02, 0.3, '#e8e0cc', { y: -0.15 });
        s.ball(0.035, '#e8e0cc', { y: -0.32 });
        return;
      }
      if (o.robot) {
        // ball shoulder, plated upper arm, elbow joint, forearm with a trim
        // band, a hand with three fingers and a thumb
        const joint = darken(o.skin, 0.45);
        m.ball(0.05, darken(o.skin), { y: 0 });
        m.cyl(0.04, 0.036, 0.12, o.skin, { y: -0.08, seg: 8 });
        m.ball(0.032, joint, { y: -0.15 });
        m.cyl(0.037, 0.032, 0.11, o.skin, { y: -0.215, seg: 8 });
        m.cyl(0.039, 0.039, 0.015, o.trim || o.glow, { y: -0.24, seg: 8 });
        m.box(0.05, 0.04, 0.035, darken(o.skin), { y: -0.29 });
        for (const fx of [-0.016, 0, 0.016]) m.box(0.011, 0.035, 0.012, darken(o.skin, 0.2), { x: fx, y: -0.325 });
        m.box(0.01, 0.025, 0.012, darken(o.skin, 0.2), { x: -side * 0.03, y: -0.295, z: 0.012, rz: side * 0.5 });
        return;
      }
      // upper arm, elbow, forearm in the sleeve, a cuff, then a hand with a thumb
      const sl = o.sleeve || o.garb;
      s.chain([[0, 0, 0], [0, -0.15, -0.006], [0, -0.265, 0.01]], 0.046 * w, 0.037 * w, sl, { seg: 8, vary: 0.03 });
      s.cyl(0.041 * w, 0.041 * w, 0.022, o.trim, { y: -0.262, z: 0.01, seg: 8 });
      s.sphere(0.036, o.skin, { y: -0.305, z: 0.008, sx: 0.85, sy: 1.15, sz: 1, seg: 9 });
      s.sphere(0.014, o.skin, { x: -side * 0.022, y: -0.293, z: 0.024, sy: 1.4, seg: 6 }); // thumb
      if (o.plate) {
        m.sphere(0.068, '#9aa0a8', { y: -0.015, sy: 0.85, seg: 10 }); // pauldron
        m.torus(0.062, 0.008, '#7a8088', { y: -0.04, rx: Math.PI / 2, tseg: 14 });
        m.cyl(0.044, 0.04, 0.09, '#8a9098', { y: -0.22, z: 0.01, seg: 8 }); // vambrace
      }
    }, torso);
    arm.position.set(side * SHOULDER * w, TORSO - 0.04, 0);
  }
  return torso;
}

/* ---------------- heads ---------------- */

function bipedHead(fig, torso, look) {
  const r = 0.105;
  const race = look.race || {};
  const head = fig.part('head', ({ s, m, g }) => {
    const skin = look.skin;
    const y = r + 0.02;
    if (race.robot) {
      // a helm-like head: a bevelled box with a visor slit, a jaw grille,
      // a crest in the trim colour, ear bolts and an antenna
      const seam = look.cls?.trim || look.eyes;
      if (look.robotHead === 'dome') {
        m.sphere(0.115, skin, { y: y + 0.01, sy: 0.95, seg: 14 });
        m.cyl(0.1, 0.105, 0.06, darken(skin, 0.08), { y: y - 0.06, seg: 14 });
      } else {
        m.box(0.2, 0.2, 0.2, skin, { y });
        m.box(0.21, 0.18, 0.18, darken(skin, 0.08), { y });
      }
      if (look.robotHead === 'crest') m.box(0.03, 0.09, 0.22, seam, { y: y + 0.13, z: -0.01 });
      if (look.finish === 'rusted') for (const [x, yy] of [[-0.06, 0.05], [0.07, -0.04]]) s.sphere(0.025, '#7a3e1e', { x, y: y + yy, z: 0.1, sz: 0.3, seg: 6 });
      s.box(0.17, 0.055, 0.02, '#141414', { y: y + 0.015, z: 0.1 });
      for (const sd of [-1, 1]) g.ball(0.022, look.eyes, { x: sd * 0.045, y: y + 0.015, z: 0.11 });
      for (let i = 0; i < 4; i++) s.box(0.1, 0.007, 0.01, '#141414', { y: y - 0.045 - i * 0.014, z: 0.101 });
      m.box(0.022, 0.016, 0.2, seam, { y: y + 0.105 });
      for (const sd of [-1, 1]) m.cyl(0.028, 0.028, 0.025, darken(skin, 0.3), { x: sd * 0.108, y, rz: Math.PI / 2, seg: 8 });
      m.cyl(0.012, 0.015, 0.12, darken(skin), { y: y + 0.16, x: 0.05 });
      g.ball(0.02, look.eyes, { y: y + 0.225, x: 0.05 });
      return;
    }
    if (look.skull) {
      s.sphere(r, '#ece4d0', { y, seg: 10 });
      for (const sd of [-1, 1]) g.ball(0.022, '#ff6a3a', { x: sd * 0.04, y: y + 0.01, z: 0.09 });
      s.box(0.1, 0.04, 0.06, '#d8d0bc', { y: y - 0.07, z: 0.04 });
      return;
    }
    const long = race.longFace ? 1.12 : 1, round = race.roundFace ? 1.08 : 1;
    s.sphere(r, skin, { y, sy: long, sx: round, sz: round, seg: 16 });
    // jaw and chin: the lower face fuller and further forward than the skull
    s.sphere(r * 0.6, skin, { y: y - r * 0.5 * long, z: r * 0.3, sx: round * 1.15, sy: 0.62, sz: 0.8, seg: 14 });
    // Jaw / snout.
    if (race.snout) s.box(0.12, 0.08, 0.14, skin, { y: y - 0.03, z: 0.1, vary: 0.04 });
    else if (race.bull) s.box(0.12, 0.09, 0.1, lighten(skin, 0.1), { y: y - 0.04, z: 0.09 });
    else if (race.cat) s.sphere(0.05, lighten(skin, 0.25), { y: y - 0.035, z: 0.08, sy: 0.7, seg: 8 });
    else {
      // a nose: a ridge from the brow to a rounded tip, with nostril wings
      const big = race.bigNose ? 1.3 : 1;
      s.cone(0.019 * big, 0.055 * big, darken(skin, 0.06), { y: y + 0.002, z: r * 0.93, rx: 0.32, sz: 0.8, seg: 5 });
      s.sphere(0.017 * big, darken(skin, 0.1), { y: y - 0.022, z: r * 1.0 + 0.004, sy: 0.85, seg: 8 });
      for (const sd of [-1, 1]) s.sphere(0.009 * big, darken(skin, 0.12), { x: sd * 0.014 * big, y: y - 0.026, z: r * 0.97, seg: 6 });
    }
    // Eyes.
    const eyeGlow = race.glowEyes || race.robot;
    for (const sd of [-1, 1]) {
      const ex = sd * 0.04, ey = y + 0.02, ez = r * 0.88;
      if (eyeGlow) g.ball(0.018, look.eyes, { x: ex, y: ey, z: ez });
      else {
        // Painted-on eyes: whites and irises sit nearly flush with the face.
        s.sphere(0.0135, '#efe8da', { x: ex, y: ey, z: ez + 0.002, sy: 0.8, sz: 0.4, seg: 8 });
        s.sphere(0.0085, darken(look.eyes, 0.5), { x: ex, y: ey - 0.001, z: ez + 0.0065, sz: 0.4, seg: 6 });
        s.box(0.036, 0.009, 0.012, darken(look.hair || skin, 0.35), { x: ex, y: ey + 0.03, z: ez - 0.002, rz: sd * 0.12 }); // brow
      }
    }
    // A small mouth line (not on snouts and beaks).
    if (!race.snout && !race.bull && !race.cat && !look.beard?.match(/full|braided/)) {
      s.box(0.034, 0.006, 0.006, darken(skin, 0.4), { y: y - 0.05, z: r * 0.97 });
      s.sphere(0.016, darken(skin, 0.16), { y: y - 0.057, z: r * 0.93, sx: 1.3, sy: 0.42, sz: 0.6, seg: 8 }); // lower lip
    }
    // Ears.
    const ears = race.ears;
    for (const sd of [-1, 1]) {
      if (ears === 'point') s.cone(0.03, 0.1, skin, { x: sd * r * 1.02, y: y + 0.02, rz: -sd * 1.1, seg: 5 });
      else if (ears === 'halfpoint') s.cone(0.03, 0.07, skin, { x: sd * r, y: y + 0.01, rz: -sd * 1.2, seg: 5 });
      else if (ears === 'cat') s.cone(0.04, 0.08, skin, { x: sd * 0.06, y: y + r * 0.95, rz: -sd * 0.3, seg: 4 });
      else if (ears === 'frill') s.cone(0.04, 0.09, darken(skin, 0.15), { x: sd * r, y: y + 0.04, z: -0.03, rz: -sd * 1.3, rx: -0.4, seg: 4 });
      else if (ears === 'bolt') s.cyl(0.02, 0.02, 0.04, darken(skin), { x: sd * r, y, rz: Math.PI / 2 });
      else if (ears !== 'none') s.sphere(0.028, skin, { x: sd * r * 0.98, y, sx: 0.6, seg: 6 });
    }
    if (race.tusks) {
      // An underbite: the lower jaw juts a little, and two tusks rise out of
      // it at the corners of the mouth, curving up and slightly out.
      s.sphere(0.06, skin, { y: y - 0.058, z: r * 0.5, sx: 1.05, sy: 0.6, sz: 0.85, seg: 10 });
      for (const sd of [-1, 1]) s.chain([[sd * 0.036, y - 0.062, r * 0.92], [sd * 0.041, y - 0.044, r * 0.99], [sd * 0.048, y - 0.03, r * 0.98]], 0.009, 0.003, '#efe6cc', { seg: 6 });
    }
    if (race.fangs) for (const sd of [-1, 1]) s.cone(0.008, 0.03, '#f0e8d0', { x: sd * 0.02, y: y - 0.05, z: r * 0.9, rx: Math.PI });
    if (race.horns || race.bull) {
      for (const sd of [-1, 1]) s.cone(0.03, race.bull ? 0.16 : 0.12, race.bull ? '#e8dcc0' : '#3a2a2a', { x: sd * 0.07, y: y + 0.08, z: -0.01, rz: -sd * (race.bull ? 1.1 : 0.45), rx: -0.3, seg: 6 });
    }
    if (race.crest) for (let i = 0; i < 3; i++) s.cone(0.025, 0.08, darken(skin, 0.2), { y: y + r * 0.9 - i * 0.03, z: -0.03 - i * 0.04, rx: -0.6, seg: 4 });
    if (race.antlers) {
      for (const sd of [-1, 1]) {
        s.cyl(0.012, 0.016, 0.16, '#d8c8a0', { x: sd * 0.07, y: y + 0.15, rz: -sd * 0.4 });
        s.cyl(0.01, 0.012, 0.08, '#d8c8a0', { x: sd * 0.11, y: y + 0.19, rz: -sd * 1.1 });
      }
    }
    if (race.cap) {
      s.sphere(0.17, race.cap, { y: y + 0.07, sy: 0.55, seg: 12 });
      for (let i = 0; i < 6; i++) { const a = i; s.ball(0.022, '#f4ecdc', { x: Math.cos(a) * 0.09, y: y + 0.13, z: Math.sin(a) * 0.09 }); }
    }
    if (race.spines) for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI - Math.PI / 2; s.cone(0.015, 0.09, '#5a4028', { x: Math.sin(a) * 0.08, y: y + 0.03 + Math.cos(a) * 0.06, z: -0.07, rx: -1.1, rz: Math.sin(a) * 0.6 }); }
    if (race.markings) s.box(0.02, 0.08, 0.01, darken(skin, 0.35), { x: 0.03, y: y + 0.02, z: r * 0.95, rz: 0.4 });
    if (look.mark === 'warpaint') s.box(0.15, 0.025, 0.01, '#a8302a', { y: y + 0.02, z: r * 0.97 });

    hair(s, look, y, r);
    beard(s, look, y, r);
    headwear(s, m, g, look, y, r);
  });
  head.position.y = TORSO - 0.012; // sits down on the neck
  torso.add(head);
  return head;
}

// Hair, built on the head (centre y, radius r; the face looks along +z).
// Under a helmet or hood only what hangs below it shows: long hair, braids,
// a ponytail, a low bun.
function hair(s, look, y, r) {
  const st = look.hairStyle, c = look.hair;
  if (!st || st === 'bald' || look.race?.hairless) return;
  const covered = look.headwear && ['helm', 'greathelm', 'hood', 'wizhat'].includes(look.cls?.head);
  const d = darken(c, 0.12);
  // A scalp: a dome pulled a little back, over the top of the head.
  // The scalp: a dome a little bigger than the skull (never squashed, or the
  // skull pokes through on top), tipped back so the hairline sits above the
  // brows at the front and drops toward the nape behind.
  const lf = look.race?.longFace ? 1.12 : 1, rf = look.race?.roundFace ? 1.08 : 1; // the same proportions as the skull
  const scalp = (k = 1.07) => s.sphere(r * (k + (lf > 1 ? 0.04 : 0)), c, { y, z: -r * 0.03, sx: rf, sy: lf, sz: rf, theta: Math.PI * 0.47, rx: -0.45, seg: 14, vary: 0.04 });
  const fringe = (k = 1) => s.sphere(r * 0.92, c, { y: y + r * 0.42, z: r * 0.3, sx: 1.05, sy: 0.32 * k, sz: 0.62, seg: 10 });
  // Hair falling down the back from the crown to below the shoulders.
  const fall = (len) => {
    s.chain([[0, y + r * 0.2, -r * 0.62], [0, y - r * 0.5, -r * 0.82], [0, y - r * 0.5 - len, -r * 0.7]], r * 0.92, r * 0.6, c, { seg: 8 });
    for (const sd of [-1, 1]) s.chain([[sd * r * 0.8, y + r * 0.1, -r * 0.3], [sd * r * 0.92, y - r * 0.55, -r * 0.22], [sd * r * 0.75, y - r * 0.55 - len * 0.55, -r * 0.28]], r * 0.3, r * 0.2, d, { seg: 6 }); // locks framing the face
  };
  if (covered) {
    if (st === 'long' || st === 'curls') fall(r * 1.4);
    if (st === 'braids') for (const sd of [-1, 1]) s.chain([[sd * r * 0.7, y - r * 0.3, -r * 0.3], [sd * r * 0.75, y - r * 1.2, -r * 0.15], [sd * r * 0.7, y - r * 2.2, -r * 0.05]], r * 0.2, r * 0.12, c, { seg: 6 });
    if (st === 'ponytail' || st === 'bun') s.chain([[0, y - r * 0.25, -r * 0.92], [0, y - r * 0.95, -r * 1.02], [0, y - r * 1.65, -r * 0.92]], r * 0.3, r * 0.14, c, { seg: 6 });
    return;
  }
  switch (st) {
    case 'crop': scalp(1.045); break;
    case 'swept': scalp(); s.sphere(r * 0.95, c, { y: y + r * 0.78, z: r * 0.02, sx: 1.08, sy: 0.4, sz: 0.95, rx: -0.25, seg: 10 }); break; // a quiff above the hairline
    case 'long': scalp(); fringe(); fall(r * 1.6); break;
    case 'wild': scalp(1.09); for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; s.cone(r * 0.32, r * 0.9, c, { x: Math.cos(a) * r * 0.75, y: y + r * 0.55, z: Math.sin(a) * r * 0.75 - r * 0.15, rz: -Math.cos(a) * 1.0, rx: Math.sin(a) * 1.0, seg: 5 }); } break;
    case 'curls': for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, ring = i % 2; s.ball(r * 0.36, c, { x: Math.cos(a) * r * (0.82 - ring * 0.25), y: y + r * (0.45 + ring * 0.35), z: Math.sin(a) * r * (0.82 - ring * 0.25) - r * 0.18 }); } fall(r * 0.5); break;
    case 'braids': scalp(); fringe(0.7); for (const sd of [-1, 1]) s.chain([[sd * r * 0.75, y - r * 0.1, -r * 0.35], [sd * r * 0.8, y - r * 1.0, -r * 0.2], [sd * r * 0.72, y - r * 2.1, -r * 0.05]], r * 0.22, r * 0.12, c, { seg: 6 }); break;
    case 'ponytail': scalp(); fringe(0.6); s.ball(r * 0.22, d, { y: y + r * 0.1, z: -r * 1.02 }); s.chain([[0, y + r * 0.1, -r * 1.05], [0, y - r * 0.6, -r * 1.35], [0, y - r * 1.6, -r * 1.25]], r * 0.3, r * 0.1, c, { seg: 6 }); break;
    case 'bun': scalp(); fringe(0.5); s.sphere(r * 0.42, c, { y: y + r * 0.55, z: -r * 0.85, seg: 9 }); break;
    case 'topknot': scalp(1.045); s.sphere(r * 0.34, c, { y: y + r * 1.12, z: -r * 0.1, seg: 9 }); break;
    case 'mohawk': for (let i = 0; i < 6; i++) s.cone(r * 0.2, r * 0.75, c, { y: y + r * 0.95, z: r * 0.55 - i * r * 0.3, rx: -0.3 - i * 0.12, seg: 4 }); break;
    default: scalp();
  }
}

function beard(s, look, y, r) {
  const b = look.beard, c = look.hair;
  if (!b || b === 'none') return;
  const by = y - 0.06, bz = r * 0.72;
  if (b === 'stubble') s.sphere(r * 0.9, darken(look.skin, 0.25), { y: y - 0.04, z: 0.01, sy: 0.6, seg: 8 });
  if (b === 'moustache' || b === 'goatee' || b === 'full' || b === 'braided' || b === 'short') for (const sd of [-1, 1]) s.sphere(0.022, c, { x: sd * 0.018, y: y - 0.032, z: r * 0.9, sx: 1.3, sy: 0.55, sz: 0.7, rz: sd * 0.25, seg: 8 });
  if (b === 'goatee') s.cone(0.03, 0.07, c, { y: by - 0.02, z: bz + 0.02, rx: Math.PI });
  if (b === 'short') s.sphere(0.07, c, { y: by, z: bz - 0.02, sy: 0.8, seg: 8 });
  if (b === 'full') s.cone(0.085, 0.17, c, { y: by - 0.04, z: bz - 0.02, rx: Math.PI, seg: 7 });
  if (b === 'braided') { s.cone(0.08, 0.12, c, { y: by - 0.02, z: bz - 0.02, rx: Math.PI, seg: 7 }); for (const sd of [-1, 1]) s.cyl(0.015, 0.012, 0.12, c, { x: sd * 0.03, y: by - 0.13, z: bz }); }
}

function headwear(s, m, g, look, y, r) {
  if (!look.headwear) return;
  const trim = look.cls?.trim || '#d4a94f', garb = look.cls?.garb || '#555';
  switch (look.cls?.head) {
    case 'helm': // a steel cap with a rim above the brows and a thin nasal guard
      m.sphere(r * 1.16, '#9aa0a8', { y, z: -r * 0.04, theta: Math.PI * 0.5, rx: -0.42, seg: 12 });
      m.torus(r * 1.1, 0.012, '#7a8088', { y: y + r * 0.28, z: -r * 0.02, rx: Math.PI / 2 - 0.42, tseg: 16 });
      m.box(0.018, 0.07, 0.016, '#8a9098', { y: y + r * 0.12, z: r * 1.06, rx: -0.15 });
      break;
    case 'greathelm': m.cyl(r * 1.1, r * 1.1, 0.26, '#a8aeb5', { y: y + 0.01, seg: 10 }); s.box(0.16, 0.02, 0.03, '#141414', { y: y + 0.02, z: r * 1.1 }); m.cone(r * 1.12, 0.06, '#a8aeb5', { y: y + 0.17, seg: 10 }); g.box(0.02, 0.06, 0.02, '#ffe08a', { y: y - 0.03, z: r * 1.12 }); break;
    case 'hood': // cloth over the crown, back and cheeks; the face stays open
      s.sphere(r * 1.24, garb, { y: y + 0.005, z: -r * 0.14, theta: Math.PI * 0.64, rx: -1.0, seg: 12, vary: 0.04 });
      s.cone(r * 1.15, r * 1.3, garb, { y: y - r * 1.05, z: -r * 0.3, seg: 10 }); // drape over the shoulders
      s.cone(r * 0.35, r * 0.9, garb, { y: y + r * 0.6, z: -r * 1.05, rx: -2.2, seg: 6 }); // the point, hanging back
      break;
    case 'cap': s.cyl(r * 1.05, r * 1.15, 0.06, garb, { y: y + 0.08, seg: 10 }); s.cone(0.02, 0.24, '#e8e0cc', { x: 0.06, y: y + 0.16, z: -0.05, rz: -0.8, rx: -0.5 }); break;
    case 'wizhat': s.cyl(r * 2.1, r * 2.1, 0.02, garb, { y: y + 0.07, seg: 14 }); s.cone(r * 1.05, 0.38, garb, { y: y + 0.26, rx: -0.15, seg: 9 }); s.cyl(r * 1.08, r * 1.08, 0.03, trim, { y: y + 0.09, seg: 10 }); break;
    case 'antlers':
      for (const sd of [-1, 1]) { s.cyl(0.012, 0.016, 0.18, '#d8c8a0', { x: sd * 0.07, y: y + 0.16, rz: -sd * 0.4 }); s.cyl(0.01, 0.012, 0.08, '#d8c8a0', { x: sd * 0.12, y: y + 0.2, rz: -sd * 1.1 }); }
      s.torus(r * 0.95, 0.012, '#4a7a3a', { y: y + 0.07, rx: Math.PI / 2, tseg: 12 });
      break;
    case 'circlet': m.torus(r * 1.02, 0.012, '#d4a94f', { y: y + 0.05, rx: Math.PI / 2, tseg: 14 }); g.ball(0.018, trim, { y: y + 0.06, z: r }); break;
    default:
  }
}

/* ---------------- weapons by class ---------------- */

function weaponFor(fig, cls, handR, handL, look) {
  // Held in the hand at the end of the arm; the part's +y is along the blade/haft.
  const W = (parent, build, o = {}) => { const p = new Part(fig, build); p.position.set(0, -0.32, 0); p.rotation.x = o.rx ?? 0.7; parent.add(p); return p; }; // + rx tips the weapon forward
  switch (cls) {
    case 'fighter':
    case 'paladin':
      // a longsword: a tapering blade with a darker fuller and a point, a
      // crossguard with flared ends, a wrapped grip and a round pommel
      W(handR, ({ s, m, g }) => {
        const steel = '#c8ccd2', guard = cls === 'paladin' ? '#d4a94f' : '#6a6f75';
        m.box(0.032, 0.44, 0.01, steel, { y: 0.28 });
        m.box(0.008, 0.38, 0.012, '#9aa0a8', { y: 0.27 });
        m.cone(0.0226, 0.07, steel, { y: 0.535, sz: 0.32, seg: 4, ry: Math.PI / 4 });
        m.box(0.12, 0.02, 0.026, guard, { y: 0.05 });
        for (const sd of [-1, 1]) m.ball(0.016, guard, { x: sd * 0.062, y: 0.05, detail: 0 });
        s.cyl(0.014, 0.016, 0.09, '#4a3020', { y: -0.005, seg: 6 });
        for (let i = 0; i < 3; i++) s.torus(0.016, 0.004, '#2e1e14', { y: -0.035 + i * 0.03, rx: Math.PI / 2, tseg: 8 });
        m.ball(0.022, guard, { y: -0.06 });
        if (cls === 'paladin') g.box(0.012, 0.3, 0.014, '#ffe8a0', { y: 0.3 });
      });
      // a round shield: planks, an iron rim, a boss in the middle
      W(handL, ({ s, m, g }) => {
        const face = cls === 'paladin' ? '#d8d2c0' : '#7a4a2a';
        s.cyl(0.14, 0.14, 0.03, face, { rx: Math.PI / 2, seg: 16, z: 0.05 });
        for (const x of [-0.07, 0, 0.07]) s.box(0.004, 0.25, 0.006, darken(face, 0.3), { x, z: 0.066 });
        m.torus(0.14, 0.015, '#8a9098', { z: 0.065, tseg: 20 });
        m.sphere(0.04, '#9aa0a8', { z: 0.065, sz: 0.7, theta: Math.PI / 2, rx: Math.PI / 2, seg: 10 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.ball(0.008, '#b4bac2', { x: Math.cos(a) * 0.115, y: Math.sin(a) * 0.115, z: 0.068, detail: 0 }); }
        if (cls === 'paladin') g.box(0.012, 0.12, 0.01, '#ffe08a', { z: 0.09 });
      }, { rx: 0.1 });
      break;
    case 'barbarian':
      // A greataxe: a long haft, and a head whose flat faces look sideways
      // with the cutting edge forward (+z), a flared bit and a short poll behind.
      W(handR, ({ s, m }) => {
        s.cyl(0.018, 0.02, 0.72, '#5a3a22', { y: 0.24 });
        s.cyl(0.022, 0.022, 0.06, '#2e2016', { y: -0.04 }); // leather wrap at the grip
        const hy = 0.5, steel = '#a8aeb5';
        m.box(0.045, 0.1, 0.06, darken(steel, 0.25), { y: hy, z: 0.02 });   // the eye round the haft
        m.box(0.022, 0.12, 0.12, steel, { y: hy, z: 0.1 });                  // cheek
        m.box(0.016, 0.24, 0.05, '#cfd4da', { y: hy, z: 0.17 });             // the flared edge
        m.box(0.03, 0.05, 0.05, darken(steel, 0.25), { y: hy, z: -0.045 });  // poll
      }, { rx: 0.35 });
      break;
    case 'ranger':
      // A longbow gripped at the middle: a shallow D bowed forward (+z), the
      // string a straight line from nock to nock behind the grip. At rest it
      // hangs just outside the hand, top limb tipped forward clear of the arm.
      fig.parts.bow = W(handL, ({ s }) => {
        const L = 0.34, bend = 0.1, pts = [];
        for (let i = 0; i <= 8; i++) { const y = -L + (2 * L * i) / 8; pts.push([-0.04, y, bend * (1 - (y / L) ** 2) - bend * 0.6]); }
        s.chain(pts, 0.016, 0.01, '#8a5a32');
        s.cyl(0.021, 0.021, 0.08, '#3a2416', { x: -0.04, z: bend * 0.4, seg: 6 }); // leather grip
        s.limb(pts[0], pts[8], 0.005, 0.005, '#efe6cf', { seg: 4, joint: false });
      }, { rx: BOW_REST });
      break;
    case 'rogue':
      // Two daggers held ready, points forward and a little down: a leaf blade
      // (a flattened four-sided cone), a crossguard, a wrapped grip and a pommel.
      for (const h of [handR, handL]) W(h, ({ s, m }) => {
        m.cone(0.024, 0.2, '#d0d4da', { y: 0.13, sx: 1, sz: 0.3, seg: 4, ry: Math.PI / 4 });
        m.box(0.075, 0.014, 0.024, '#6a6f75', { y: 0.025 });
        s.cyl(0.011, 0.011, 0.06, '#3a2416', { y: -0.01, seg: 6 });
        m.ball(0.015, '#6a6f75', { y: -0.045, detail: 0 });
      }, { rx: 2.0 });
      break;
    case 'cleric':
      // a flanged mace
      W(handR, ({ s, m }) => {
        s.cyl(0.015, 0.017, 0.34, '#5a3a22', { y: 0.12, seg: 6 });
        m.cyl(0.03, 0.03, 0.08, '#8a9098', { y: 0.31, seg: 8 });
        for (let i = 0; i < 6; i++) m.box(0.01, 0.075, 0.05, '#9aa0a8', { y: 0.31, ry: (i / 6) * Math.PI });
        m.cone(0.02, 0.03, '#9aa0a8', { y: 0.365, seg: 6 });
        m.ball(0.018, '#8a9098', { y: -0.06, detail: 0 });
      });
      W(handL, ({ s, m }) => { s.cyl(0.12, 0.12, 0.03, '#d8d2c0', { rx: Math.PI / 2, seg: 10, z: 0.05 }); m.torus(0.12, 0.012, '#d4a94f', { z: 0.07, tseg: 14 }); m.ball(0.03, '#d4a94f', { z: 0.075 }); }, { rx: 0.1 });
      break;
    case 'wizard':
    case 'druid':
      W(handR, ({ s, g }) => {
        // a knotted staff; a wizard's ends in a forked head holding a crystal,
        // a druid's in a burl with leaves and a glowing bud
        const wood = cls === 'druid' ? '#5a4028' : '#3a2a1a';
        s.chain([[0, -0.2, 0], [0.008, 0.2, 0.004], [-0.006, 0.55, 0], [0, 0.82, 0.004]], 0.02, 0.016, wood, { seg: 6 });
        for (const y of [0.05, 0.42]) s.ball(0.024, darken(wood, 0.15), { y, detail: 0 });
        if (cls === 'wizard') {
          for (const sd of [-1, 1]) s.chain([[0, 0.8, 0], [sd * 0.04, 0.88, 0], [sd * 0.025, 0.96, 0]], 0.014, 0.008, wood, { seg: 5 });
          g.cone(0.035, 0.1, '#9ad8ff', { y: 0.9, seg: 5 });
          g.cone(0.035, 0.05, '#9ad8ff', { y: 0.825, rx: Math.PI, seg: 5 });
        } else {
          s.ball(0.06, darken(wood, 0.1), { y: 0.86, detail: 0 });
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; s.cone(0.022, 0.07, i % 2 ? '#4a7a3a' : '#5f8a44', { x: Math.cos(a) * 0.05, y: 0.9, z: Math.sin(a) * 0.05, rz: -Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9, sz: 0.3, seg: 4 }); }
          g.ball(0.025, '#c8ff8a', { y: 0.93 });
        }
      }, { rx: 0.15 });
      break;
    case 'sorcerer':
    case 'warlock':
      // A spark of their magic floating beside the head, where the portrait
      // draws it, in the same colour (the trim): a bright core, a ring of
      // light tipped across it and three sparks circling (see pose()).
      fig.parts.orb = new Part(fig, ({ g }) => {
        const col = look?.cls?.trim || (cls === 'warlock' ? '#b07aff' : '#ff8a4a');
        g.ball(0.022, lighten(col, 0.55), { detail: 1 });
        g.ball(0.034, col, { detail: 1 });
        g.torus(0.052, 0.004, col, { rx: 1.2, rz: 0.4, tseg: 20 });
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.ball(0.007, lighten(col, 0.4), { x: Math.cos(a) * 0.066, y: Math.sin(a * 2) * 0.018, z: Math.sin(a) * 0.066, detail: 0 }); }
      });
      fig.parts.orb.position.set(0.22, ORB_Y, 0.04);
      fig.body.add(fig.parts.orb);
      break;
    case 'bard':
      W(handR, ({ m, s }) => { m.box(0.015, 0.4, 0.008, '#c8ccd2', { y: 0.22 }); s.torus(0.04, 0.008, '#d4a94f', { y: 0.03, tseg: 8 }); });
      break;
    case 'monk':
      W(handR, ({ s }) => { s.cyl(0.016, 0.016, 1.0, '#7a5432', { y: 0.05, rz: Math.PI / 2 - 0.2 }); }, { rx: 0.4 });
      break;
    default:
  }
}

const OUTFIT = { plate: { plate: true }, robe: { robe: true }, fur: { fur: true }, collar: { collar: true }, quiver: { quiver: true, cloak: '#2f4a2a' }, strap: { cloak: '#22242a' }, ruff: { lute: true }, stole: {}, leaf: { cloak: '#3f5a2a' }, wrap: {} };

/** A hero (or NPC) from a resolved portrait look. */
export function heroFigure(look, { seed, size = 'medium' } = {}) {
  const race = look.race || {};
  const fig = new Biped({ kind: 'biped', seed: seed || look.seed, scale: (size === 'small' ? 0.74 : 1) * (race.build > 1.1 ? 1.06 : 1), ghostly: race.ghostly });
  fig.ghostly = !!race.ghostly;
  const cls = look.cls || {};
  const garb = cls.garb || '#5a5348', trim = cls.trim || '#8d8a95';
  const outfit = OUTFIT[cls.outfit] || {};
  const torso = bipedBody(fig, {
    skin: look.skin, garb, trim, build: (race.build || 1) * (look.body === 'feminine' ? 0.92 : look.body === 'masculine' ? 1.04 : 1) * (look.frame === 'heavy' ? 1.14 : look.frame === 'slim' ? 0.88 : 1), robot: race.robot, finish: look.finish, body: look.body, glow: look.eyes, bones: look.bones,
    symbol: cls.chest === 'symbol', ...outfit, apron: look.apron,
  });
  if (look.apron) {
    // An apron: a bib over the chest and a skirt wrapped round the front of
    // the hips to the knee (a slice of a cylinder centred on +z, so it
    // follows the body), gathered under a waistband that hugs the belt.
    fig.parts.torso.add(new Part(fig, ({ s }) => {
      const cloth = '#e8dcc0', arc = Math.PI * 0.8, wrap = { arc, ry: -arc / 2, open: true, seg: 14 };
      s.cyl(0.118, 0.132, 0.14, cloth, { y: TORSO * 0.52, arc: Math.PI * 0.42, ry: -Math.PI * 0.21, open: true, seg: 8 }); // bib, curved to the chest
      s.cyl(0.14, 0.185, 0.3, cloth, { ...wrap, y: -0.11 });
      s.cyl(0.134, 0.134, 0.04, darken(cloth, 0.2), { ...wrap, y: 0.04 });
      for (const sd of [-1, 1]) s.box(0.012, 0.11, 0.008, darken(cloth, 0.15), { x: sd * 0.05, y: TORSO * 0.8, z: 0.118, rz: sd * 0.35 });
    }));
  }
  bipedHead(fig, torso, look);
  weaponFor(fig, look.classKey, fig.parts.armR, fig.parts.armL, look);
  if (race.robot) Object.assign(fig.mats.metal, { polished: { roughness: 0.22, metalness: 0.8 }, worn: { roughness: 0.48, metalness: 0.55 }, rusted: { roughness: 0.85, metalness: 0.25 } }[look.finish] || {});
  return fig;
}

/* ======================= monsters ======================= */

class Quad extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts;
    const s = Math.sin(this.stride || 0) * walk;
    if (P.legs) {
      P.legs[0].rotation.x = s * 0.6; P.legs[3].rotation.x = s * 0.6;
      P.legs[1].rotation.x = -s * 0.6; P.legs[2].rotation.x = -s * 0.6;
    }
    if (P.tail) P.tail.rotation.y = Math.sin(t * (walk ? 9 : 2.5) + this.anim.phase) * 0.35;
    if (P.head && !still) P.head.rotation.y = Math.sin(t * 0.5 + this.anim.phase) * 0.2 * (1 - walk);
    if (P.wings) { const f = Math.sin(t * 3 + this.anim.phase) * 0.12; P.wings[0].rotation.z = 0.3 + f; P.wings[1].rotation.z = -0.3 - f; }
    if (P.torso && !still) P.torso.scale.y = 1 + Math.sin(t * 2 + this.anim.phase) * 0.02;
    this.body.position.y = Math.abs(Math.sin(this.stride || 0)) * 0.03 * walk;
  }
  act(name, k) {
    const P = this.parts;
    if (name === 'melee' || name === 'shoot' || name === 'cast') {
      const lunge = k < 0.35 ? -0.1 * (k / 0.35) : k < 0.55 ? -0.1 + 0.5 * ((k - 0.35) / 0.2) : 0.4 * (1 - (k - 0.55) / 0.45);
      this.body.position.z = lunge;
      if (P.head) P.head.rotation.x = k > 0.3 && k < 0.6 ? 0.5 : 0;
      if (P.wings) { P.wings[0].rotation.z = 0.3 + Math.sin(k * Math.PI) * 0.9; P.wings[1].rotation.z = -0.3 - Math.sin(k * Math.PI) * 0.9; }
    } else if (name === 'hurt') {
      this.body.position.z = -0.1 * Math.sin(k * Math.PI);
    }
  }
}

// A four-legged animal. Everything is built to join: legs start inside the
// body and run hip → knee → paw, the head sits on a neck that starts inside
// the chest, the tail is a curved chain from the rump, wings are bone and
// membrane. o: color, legH (floor to belly), len, w, h (body), headR, snout
// (muzzle length, in head radii), thick (leg girth), ears ('point'|'round'),
// tusks, horns, spikes, mane, neck (length), tail, tailW, tailUp, wings, eyeGlow.
function quadruped(fig, o) {
  const legH = o.legH || 0.3, bl = o.len || 0.6, bw = o.w || 0.26, bh = o.h || 0.26;
  const col = o.color, dark = darken(col, 0.18), belly = lighten(col, 0.12);
  const bodyY = legH + bh * 0.5;
  const torso = fig.part('torso', ({ s }) => {
    s.sphere(0.5, col, { y: bodyY + bh * 0.04, z: bl * 0.2, sx: bw * 1.02, sy: bh * 1.04, sz: bl * 0.62, seg: 16, vary: 0.04 }); // chest
    s.sphere(0.5, col, { y: bodyY, z: -bl * 0.2, sx: bw * 0.94, sy: bh * 0.94, sz: bl * 0.6, seg: 16, vary: 0.04 }); // haunches
    s.sphere(0.5, belly, { y: bodyY - bh * 0.18, sx: bw * 0.8, sy: bh * 0.6, sz: bl * 0.8, seg: 12 });
    // shoulder blades and hip bones under the hide, and a darker stripe of
    // coat (lying tufts) down the spine
    for (const sd of [-1, 1]) {
      s.sphere(0.5, col, { x: sd * bw * 0.24, y: bodyY + bh * 0.14, z: bl * 0.3, sx: bw * 0.36, sy: bh * 0.42, sz: bl * 0.34, seg: 9, vary: 0.04 });
      s.sphere(0.5, col, { x: sd * bw * 0.23, y: bodyY + bh * 0.06, z: -bl * 0.3, sx: bw * 0.34, sy: bh * 0.4, sz: bl * 0.32, seg: 9, vary: 0.04 });
    }
    if (!o.spikes) for (let i = 0; i < 7; i++) {
      const z = bl * 0.4 - i * bl * 0.13;
      s.cone(bw * 0.09, bl * 0.16, dark, { y: bodyY + bh * 0.47 - Math.abs(z) * 0.18, z, rx: -1.25, sx: 1.4, sz: 0.4, seg: 4, vary: 0.08 });
    }
    if (o.mane) s.sphere(0.5, o.mane, { y: bodyY + bh * 0.12, z: bl * 0.36, sx: bw * 1.25, sy: bh * 1.2, sz: bl * 0.36, seg: 10 });
    if (o.spikes) for (let i = 0; i < 6; i++) {
      const z = bl * 0.36 - i * bl * 0.15;
      s.cone(0.035 + 0.01 * Math.sin(i), 0.13, o.spikes, { y: bodyY + bh * 0.48 - Math.abs(z) * 0.12, z, rx: -0.35, seg: 4 });
    }
  });
  // Legs: pivot at the hip, inside the body.
  fig.parts.legs = [];
  const hipY = bodyY - bh * 0.05;
  const lx = bw * 0.3, lz = bl * 0.3;
  const r0 = bw * 0.2 * (o.thick || 1), r1 = bw * 0.11 * (o.thick || 1), r2 = bw * 0.085 * (o.thick || 1);
  [[-lx, lz, 1], [lx, lz, 1], [-lx, -lz, 0], [lx, -lz, 0]].forEach(([x, z, front], i) => {
    const Y = hipY;
    const pts = front
      ? [[0, 0, 0], [0, -Y * 0.5, -0.015], [0, -Y + r2, 0.02]]
      : [[0, 0, 0], [0, -Y * 0.42, bl * 0.08], [0, -Y * 0.78, -bl * 0.04], [0, -Y + r2, 0]];
    const leg = new Part(fig, ({ s }) => {
      s.chain(pts, r0, r2, col, { vary: 0.03, seg: 8 });
      s.sphere(r2 * 1.5, dark, { y: -Y + r2 * 0.7, z: 0.03, sy: 0.55, sz: 1.3, seg: 9 }); // paw
      // toes, each with a claw
      for (const tx of [-1, 0, 1]) {
        s.sphere(r2 * 0.55, dark, { x: tx * r2 * 0.75, y: -Y + r2 * 0.5, z: 0.03 + r2 * 1.55 - Math.abs(tx) * r2 * 0.2, seg: 6 });
        s.cone(r2 * 0.22, r2 * 0.7, '#e2d6bc', { x: tx * r2 * 0.75, y: -Y + r2 * 0.32, z: 0.03 + r2 * 2.0 - Math.abs(tx) * r2 * 0.2, rx: 1.9, seg: 4 });
      }
    });
    leg.position.set(x, hipY, z);
    fig.body.add(leg);
    fig.parts.legs.push(leg);
  });
  // Head on a neck.
  const hr = o.headR || 0.12;
  const neckBase = [0, bodyY + bh * 0.15, bl * 0.38];
  const nl = o.neck || hr * 0.9;
  const headAt = [0, neckBase[1] + nl * 0.75, neckBase[2] + nl * 0.6];
  fig.part('neck', ({ s }) => {
    s.limb(neckBase, headAt, Math.min(bw, bh) * 0.32, hr * 0.62, col, { seg: 8 });
    if (o.neck && o.spikes) for (let i = 1; i < 4; i++) {
      const k = i / 4;
      s.cone(0.03, 0.09, o.spikes, { x: 0, y: neckBase[1] + (headAt[1] - neckBase[1]) * k + hr * 0.5, z: neckBase[2] + (headAt[2] - neckBase[2]) * k - 0.02, rx: -0.5, seg: 4 });
    }
  });
  const head = new Part(fig, ({ s, g }) => {
    s.sphere(hr, col, { seg: 14, vary: 0.04 });
    const sn = o.snout ?? 1.2;
    const tip = [0, -hr * 0.28, hr * (0.55 + sn * 0.75)];
    s.limb([0, -hr * 0.1, hr * 0.25], tip, hr * 0.62, hr * 0.32, lighten(col, 0.04), { seg: 10, joint: false });
    s.sphere(hr * 0.2, '#1a1210', { x: 0, y: tip[1] + hr * 0.08, z: tip[2] + hr * 0.1, sx: 1.3, sy: 0.8, seg: 8 }); // nose
    for (const sd of [-1, 1]) s.ball(hr * 0.06, '#050302', { x: sd * hr * 0.09, y: tip[1] + hr * 0.06, z: tip[2] + hr * 0.25, detail: 0 }); // nostrils
    if (o.jaw !== false) s.limb([0, -hr * 0.45, hr * 0.2], [0, -hr * 0.5, tip[2] * 0.85], hr * 0.32, hr * 0.2, darken(col, 0.1), { seg: 8, joint: false });
    // fangs from the upper jaw (boars have their tusks instead)
    if (!o.tusks) for (const sd of [-1, 1]) s.cone(hr * 0.07, hr * 0.26, '#efe6cc', { x: sd * hr * 0.17, y: tip[1] - hr * 0.3, z: tip[2] * 0.82, rx: Math.PI, seg: 4 });
    for (const sd of [-1, 1]) {
      // eyes under a heavy brow; painted eyes get a glint
      s.sphere(hr * 0.22, darken(col, 0.12), { x: sd * hr * 0.48, y: hr * 0.4, z: hr * 0.55, sy: 0.45, sz: 0.8, rz: sd * 0.3, seg: 7 });
      (o.eyeGlow ? g : s).ball(hr * 0.14, o.eyeGlow || '#140e0a', { x: sd * hr * 0.52, y: hr * 0.22, z: hr * 0.62 });
      if (!o.eyeGlow) s.ball(hr * 0.045, '#f4ecdc', { x: sd * hr * 0.5, y: hr * 0.27, z: hr * 0.75, detail: 0 });
      if (o.ears === 'round') {
        s.sphere(hr * 0.34, col, { x: sd * hr * 0.62, y: hr * 0.78, z: -hr * 0.15, sz: 0.45, seg: 10 });
        s.sphere(hr * 0.2, darken(col, 0.3), { x: sd * hr * 0.62, y: hr * 0.78, z: -hr * 0.08, sz: 0.3, seg: 8 });
      } else if (o.ears) {
        s.cone(hr * 0.3, hr * 0.7, col, { x: sd * hr * 0.55, y: hr * 0.9, z: -hr * 0.15, rz: -sd * 0.25, rx: -0.15, seg: 4 });
        s.cone(hr * 0.17, hr * 0.45, darken(col, 0.3), { x: sd * hr * 0.55, y: hr * 0.85, z: -hr * 0.09, rz: -sd * 0.25, rx: -0.15, sz: 0.5, seg: 4 });
      }
      if (o.tusks) s.chain([[sd * hr * 0.3, -hr * 0.45, tip[2] * 0.8], [sd * hr * 0.42, -hr * 0.2, tip[2] * 0.92], [sd * hr * 0.4, hr * 0.12, tip[2] * 0.9]], hr * 0.09, hr * 0.02, '#efe6cc', { seg: 5 });
      if (o.horns) s.chain([[sd * hr * 0.35, hr * 0.6, -hr * 0.1], [sd * hr * 0.55, hr * 1.1, -hr * 0.6], [sd * hr * 0.6, hr * 1.25, -hr * 1.3]], hr * 0.16, hr * 0.03, o.horns, { seg: 6 });
    }
  });
  head.position.set(...headAt);
  fig.body.add(head);
  fig.parts.head = head;
  // Tail: a curved chain from the rump.
  if (o.tail) {
    const tl = o.tail, tw = o.tailW || 0.03, up = o.tailUp ?? 0.1;
    const tail = new Part(fig, ({ s }) => {
      const pts = [];
      for (let i = 0; i <= 5; i++) { const k = i / 5; pts.push([Math.sin(k * 2.2) * tl * 0.12, (up - k * 0.5) * tl * k, -k * tl]); }
      s.chain(pts, tw, Math.max(0.006, tw * 0.25), o.tailColor || col, { seg: 6 });
    });
    tail.position.set(0, bodyY + bh * 0.15, -bl * 0.45);
    fig.body.add(tail);
    fig.parts.tail = tail;
  }
  // Wings: an arm bone, three fingers, membrane between them.
  if (o.wings) {
    const W = o.wings, mem = o.wingColor || darken(col, 0.28), bone = darken(col, 0.05);
    fig.parts.wings = [-1, 1].map((sd) => {
      const wing = new Part(fig, ({ s }) => {
        const root = [0, 0, 0], elbow = [sd * W * 0.38, W * 0.22, -W * 0.05], wrist = [sd * W * 0.7, W * 0.3, W * 0.05];
        const tips = [[sd * W * 1.05, W * 0.1, -W * 0.25], [sd * W * 0.85, -W * 0.05, -W * 0.55], [sd * W * 0.5, -W * 0.08, -W * 0.7]];
        s.chain([root, elbow, wrist], 0.035, 0.022, bone, { seg: 6 });
        for (const t of tips) s.limb(wrist, t, 0.016, 0.006, bone, { seg: 5 });
        s.membrane([wrist, tips[0], tips[1]], mem);
        s.membrane([wrist, tips[1], tips[2]], mem);
        s.membrane([wrist, tips[2], [0, -W * 0.02, -W * 0.5], root, elbow], mem);
      });
      wing.position.set(sd * bw * 0.32, bodyY + bh * 0.38, bl * 0.18);
      fig.body.add(wing);
      return wing;
    });
  }
  return torso;
}

class Many extends Figure {
  pose({ walk, t }) {
    const legs = this.parts.legs || [];
    legs.forEach((l, i) => { l.rotation.x = Math.sin((this.stride || 0) * 1.4 + i * 1.3) * 0.5 * walk; l.rotation.z = l.userData.z0 + Math.sin(t * 1.5 + i) * 0.04; });
    this.body.position.y = Math.abs(Math.sin((this.stride || 0) * 2)) * 0.02 * walk;
  }
  act(name, k) {
    if (name === 'hurt') { this.body.position.z = -0.1 * Math.sin(k * Math.PI); return; }
    this.body.position.z = k < 0.4 ? -0.08 * (k / 0.4) : 0.35 * Math.sin(((k - 0.4) / 0.6) * Math.PI);
    if (this.parts.head) this.parts.head.rotation.x = Math.sin(k * Math.PI) * 0.4;
  }
}

class Float extends Figure {
  constructor(o) { super(o); this.kind = 'float'; }
  pose({ walk, t, still }) {
    const P = this.parts;
    const f = Math.sin(t * 2 + this.anim.phase);
    this.body.position.y = (this.baseY || 0) + f * 0.06;
    if (P.wings) { const flap = Math.sin(t * (this.flap || 14) + this.anim.phase) * 0.7; P.wings[0].rotation.z = flap; P.wings[1].rotation.z = -flap; }
    if (P.torso && this.squish) { P.torso.scale.y = 1 + f * 0.08; P.torso.scale.x = P.torso.scale.z = 1 - f * 0.05; }
    if (P.swirl) P.swirl.rotation.y = t * 1.6;
    if (P.swarm) P.swarm.children.forEach((c, i) => {
      const a = t * (0.9 + (i % 4) * 0.25) + i * 2.1, r = 0.12 + (i % 3) * 0.1;
      c.position.set(Math.cos(a) * r, this.groundSwarm ? 0 : 0.1 + Math.abs(Math.sin(t * 3.1 + i)) * 0.25, Math.sin(a) * r);
      c.rotation.y = -a; // face the way it runs
    });
  }
  act(name, k) {
    if (name === 'hurt') { this.body.position.z = -0.12 * Math.sin(k * Math.PI); return; }
    this.body.position.z = Math.sin(k * Math.PI) * 0.4;
  }
}

// One builder per archetype. c = the token's colour (used as the creature's
// main colour where it makes sense).
const MONSTERS = {
  rat: (c) => { const f = new Quad({ seed: c.seed, scale: 0.8 }); quadruped(f, { color: '#6f5a4a', legH: 0.07, len: 0.42, w: 0.2, h: 0.17, headR: 0.075, snout: 1.5, ears: 'round', tail: 0.5, tailW: 0.016, tailColor: '#b08a7a', tailUp: -0.05, eyeGlow: '#ff3a2a', neck: 0.04 }); return f; },
  wolf: (c) => { const f = new Quad({ seed: c.seed }); quadruped(f, { color: '#6a6a70', legH: 0.3, len: 0.66, w: 0.24, h: 0.26, headR: 0.11, snout: 1.4, ears: 'point', tail: 0.4, tailW: 0.05, tailUp: 0.25, mane: '#5a5a62', eyeGlow: '#ffd04a', neck: 0.14 }); return f; },
  bear: (c) => { const f = new Quad({ seed: c.seed, scale: 1.25 }); quadruped(f, { color: '#5a4030', legH: 0.2, len: 0.78, w: 0.42, h: 0.42, headR: 0.15, snout: 0.8, ears: 'round', thick: 1.25, tail: 0.08, tailW: 0.04, mane: '#4f382a', neck: 0.1 }); return f; },
  boar: (c) => { const f = new Quad({ seed: c.seed }); quadruped(f, { color: '#4a3a30', legH: 0.16, len: 0.62, w: 0.32, h: 0.34, headR: 0.13, snout: 1.0, ears: 'point', tusks: true, spikes: '#2a2018', tail: 0.14, tailW: 0.02, neck: 0.06 }); return f; },
  monstrosity: (c) => { const f = new Quad({ seed: c.seed, scale: 1.15 }); quadruped(f, { color: c.color || '#6a4a5a', legH: 0.28, len: 0.8, w: 0.36, h: 0.36, headR: 0.15, snout: 0.9, thick: 1.2, ears: 'point', horns: '#d8c8a0', spikes: '#3a2a2a', eyeGlow: '#ff6a2a', tail: 0.55, tailW: 0.06, mane: darken(c.color || '#6a4a5a', 0.2), neck: 0.12 }); return f; },
  dragon: (c) => { const col = c.color && c.color !== '#8a3d3d' ? c.color : '#7a2a24'; const f = new Quad({ seed: c.seed, scale: 1.2 }); quadruped(f, { color: col, legH: 0.24, len: 0.9, w: 0.36, h: 0.34, headR: 0.13, snout: 1.5, thick: 1.15, horns: '#e8dcc0', spikes: darken(col, 0.4), neck: 0.42, tail: 0.95, tailW: 0.08, tailUp: 0.05, wings: 0.72, eyeGlow: '#ffd04a' }); return f; },
  spider: (c) => {
    const f = new Many({ seed: c.seed, scale: 0.9 });
    const body = '#2a2420', hair = '#3a302a';
    f.part('torso', ({ s, g }) => {
      s.sphere(0.2, body, { y: 0.26, z: -0.2, sx: 1, sy: 0.85, sz: 1.2, seg: 12 });   // abdomen
      s.sphere(0.12, hair, { y: 0.22, z: 0.04, sz: 1.15, seg: 10 });                   // head-chest
      for (const dz of [-0.06, 0.05]) s.sphere(0.05, '#8a2a20', { y: 0.41, z: -0.2 + dz, sy: 0.4, sx: 0.9 - Math.abs(dz) * 2, seg: 8 }); // the red mark, an hourglass sunk into the back
      for (let i = 0; i < 4; i++) g.ball(0.016, '#ff3a2a', { x: (i - 1.5) * 0.028, y: 0.27, z: 0.15 - Math.abs(i - 1.5) * 0.01 });
      for (const sd of [-1, 1]) s.chain([[sd * 0.03, 0.18, 0.14], [sd * 0.035, 0.12, 0.19], [sd * 0.02, 0.08, 0.18]], 0.02, 0.006, '#1a1410', { seg: 5 }); // fangs
    });
    f.parts.legs = [];
    for (let i = 0; i < 8; i++) {
      const sd = i < 4 ? -1 : 1, j = i % 4;
      const fz = [0.55, 0.18, -0.18, -0.55][j];
      const leg = new Part(f, ({ s }) => s.chain([[0, 0, 0], [sd * 0.17, 0.17, fz * 0.18], [sd * 0.38, -0.21, fz * 0.42]], 0.018, 0.008, j % 2 ? body : hair, { seg: 5 }));
      leg.position.set(sd * 0.07, 0.22, 0.05 - j * 0.03);
      leg.userData.z0 = 0;
      f.body.add(leg); f.parts.legs.push(leg);
    }
    return f;
  },
  insect: (c) => {
    const f = new Many({ seed: c.seed });
    const shell = '#3e4a24', dark = '#23281a';
    f.part('torso', ({ s }) => {
      s.sphere(0.09, shell, { y: 0.17, z: 0.2, seg: 10 });                         // head
      s.sphere(0.1, darken(shell, 0.1), { y: 0.18, z: 0.05, sz: 1.1, seg: 10 });   // thorax
      s.sphere(0.15, shell, { y: 0.2, z: -0.18, sx: 0.95, sy: 0.8, sz: 1.35, seg: 12 }); // abdomen
      for (const sd of [-1, 1]) {
        s.chain([[sd * 0.04, 0.23, 0.25], [sd * 0.1, 0.36, 0.33], [sd * 0.16, 0.4, 0.45]], 0.008, 0.004, dark, { seg: 4 }); // antenna
        s.chain([[sd * 0.04, 0.13, 0.27], [sd * 0.06, 0.12, 0.33], [sd * 0.015, 0.11, 0.36]], 0.016, 0.005, dark, { seg: 4 }); // mandible
        s.ball(0.02, '#140e0a', { x: sd * 0.06, y: 0.2, z: 0.26 });
      }
    });
    f.parts.legs = [];
    for (let i = 0; i < 6; i++) {
      const sd = i < 3 ? -1 : 1, j = i % 3;
      const fz = [0.5, 0, -0.5][j];
      const leg = new Part(f, ({ s }) => s.chain([[0, 0, 0], [sd * 0.13, 0.08, fz * 0.12], [sd * 0.26, -0.15, fz * 0.3]], 0.015, 0.007, dark, { seg: 5 }));
      leg.position.set(sd * 0.06, 0.15, 0.06 - j * 0.04);
      leg.userData.z0 = 0;
      f.body.add(leg); f.parts.legs.push(leg);
    }
    return f;
  },
  snake: (c) => {
    const f = new Many({ seed: c.seed });
    const scale = '#4f6e2c', light = '#8a9a52';
    f.part('torso', ({ s }) => {
      // Coiled on the floor from the tail tip inward, then up into the neck.
      const pts = [];
      for (let i = 0; i <= 16; i++) { const k = i / 16, a = k * Math.PI * 2.4; const r = 0.26 - k * 0.15; pts.push([Math.cos(a) * r, 0.045 + k * 0.01, Math.sin(a) * r - 0.04]); }
      pts.push([0.06, 0.12, 0.02], [0.03, 0.24, 0.06]);
      s.chain(pts, 0.012, 0.055, scale, { seg: 7, vary: 0.04 });
      s.chain(pts.slice(10).map(([x, y, z]) => [x, y - 0.02, z + 0.004]), 0.035, 0.045, light, { seg: 6 });
    });
    const head = new Part(f, ({ s, g }) => {
      s.sphere(0.06, scale, { sz: 1.35, sy: 0.75, seg: 10 });
      s.limb([0, -0.005, 0.03], [0, -0.012, 0.11], 0.045, 0.026, scale, { seg: 7, joint: false });
      for (const sd of [-1, 1]) g.ball(0.012, '#ffd04a', { x: sd * 0.042, y: 0.022, z: 0.05 });
      g.limb([0, -0.02, 0.11], [0, -0.025, 0.16], 0.004, 0.003, '#ff3a3a', { joint: false });
      for (const sd of [-1, 1]) g.limb([0, -0.025, 0.16], [sd * 0.012, -0.028, 0.18], 0.003, 0.002, '#ff3a3a', { joint: false });
    });
    head.position.set(0.02, 0.28, 0.1);
    f.body.add(head); f.parts.head = head;
    return f;
  },
  bat: (c) => {
    const f = new Float({ seed: c.seed, scale: 0.8 }); f.baseY = 0.7; f.flap = 18;
    const fur = '#3a2e2a', skin = '#2a201c';
    f.part('torso', ({ s, g }) => {
      s.sphere(0.08, fur, { sy: 1.25, seg: 10 });
      s.sphere(0.06, fur, { y: 0.09, z: 0.02, seg: 8 });
      for (const sd of [-1, 1]) { s.cone(0.03, 0.08, fur, { x: sd * 0.035, y: 0.16, z: 0.01, rz: -sd * 0.3, seg: 4 }); g.ball(0.012, '#ff3a2a', { x: sd * 0.025, y: 0.1, z: 0.06 }); }
    });
    f.parts.wings = [-1, 1].map((sd) => {
      const w = new Part(f, ({ s }) => {
        const wrist = [sd * 0.18, 0.06, 0.02], t1 = [sd * 0.36, 0.02, -0.04], t2 = [sd * 0.3, -0.08, -0.06], t3 = [sd * 0.16, -0.1, -0.03];
        s.limb([0, 0.03, 0], wrist, 0.012, 0.008, skin, { seg: 4 });
        for (const t of [t1, t2, t3]) s.limb(wrist, t, 0.006, 0.003, skin, { seg: 4, joint: false });
        s.membrane([wrist, t1, t2], skin); s.membrane([wrist, t2, t3], skin); s.membrane([wrist, t3, [0, -0.08, 0], [0, 0.03, 0]], skin);
      });
      f.body.add(w); return w;
    });
    return f;
  },
  bird: (c) => {
    const f = new Float({ seed: c.seed, scale: 0.9 }); f.baseY = 0.8; f.flap = 9;
    const feather = '#6a5a44', dark = '#4a3c2c';
    f.part('torso', ({ s }) => {
      s.sphere(0.1, feather, { sz: 1.45, sy: 0.95, seg: 10 });
      s.sphere(0.065, dark, { y: 0.07, z: 0.13, seg: 8 });
      s.cone(0.022, 0.08, '#d8a03a', { y: 0.06, z: 0.22, rx: Math.PI / 2, seg: 5 });
      s.membrane([[0, 0.01, -0.12], [-0.07, 0.02, -0.28], [0.07, 0.02, -0.28]], dark); // tail fan
      for (const sd of [-1, 1]) s.ball(0.012, '#140e0a', { x: sd * 0.045, y: 0.09, z: 0.16 });
    });
    f.parts.wings = [-1, 1].map((sd) => {
      const w = new Part(f, ({ s }) => {
        s.membrane([[0, 0.03, 0.06], [sd * 0.2, 0.04, 0.05], [sd * 0.4, 0.02, -0.06], [sd * 0.3, 0.01, -0.12], [sd * 0.12, 0.01, -0.1], [0, 0.02, -0.06]], feather);
        s.membrane([[sd * 0.2, 0.035, 0.0], [sd * 0.42, 0.015, -0.09], [sd * 0.3, 0.012, -0.15]], dark);
      });
      f.body.add(w); return w;
    });
    return f;
  },
  fey: (c) => {
    const f = new Float({ seed: c.seed, scale: 0.55 }); f.baseY = 0.6; f.flap = 22;
    f.part('torso', ({ s, g }) => { s.cyl(0.05, 0.08, 0.22, '#7ab07a', { y: 0.05 }); s.sphere(0.07, '#e8d0b8', { y: 0.24 }); g.ball(0.05, '#c8ff9a', { y: 0.05 }); });
    f.parts.wings = [-1, 1].map((sd) => { const w = new Part(f, ({ g }) => g.box(0.3, 0.005, 0.18, '#9ae8ff', { x: sd * 0.16, y: 0.14 })); f.body.add(w); return w; });
    return f;
  },
  ghost: (c) => {
    const f = new Float({ seed: c.seed, ghostly: true }); f.baseY = 0.2; f.ghostly = true;
    f.part('torso', ({ s, g }) => { s.cone(0.24, 0.8, '#c8d8e8', { y: 0.35, rx: Math.PI, seg: 10 }); s.sphere(0.15, '#d8e4f0', { y: 0.75 }); for (const sd of [-1, 1]) g.ball(0.025, '#9ae8ff', { x: sd * 0.05, y: 0.77, z: 0.13 }); });
    return f;
  },
  ooze: (c) => {
    const f = new Float({ seed: c.seed, ghostly: true }); f.squish = true; f.baseY = 0; f.ghostly = true;
    f.part('torso', ({ s, g }) => { s.sphere(0.36, c.color && c.color !== '#8a3d3d' ? c.color : '#5a8a3a', { y: 0.18, sy: 0.55, seg: 14 }); s.sphere(0.06, '#e8dcc0', { x: -0.08, y: 0.14, z: 0.04, sy: 0.85, seg: 8 }); s.limb([0.02, 0.1, -0.08], [0.16, 0.13, 0.04], 0.012, 0.012, '#e8dcc0', { seg: 5 }); }); // a skull and a bone, half digested
    return f;
  },
  elemental: (c) => {
    const col = c.color && c.color !== '#8a3d3d' ? c.color : '#ff7a3a';
    const f = new Float({ seed: c.seed, scale: 1.2 }); f.baseY = 0.05;
    // A living column: a twisting tail of flame that swells into a chest,
    // shoulders, arms and a head, with stones caught in its swirl.
    f.part('torso', ({ g, s }) => {
      const body = darken(col, 0.15), hot = lighten(col, 0.45);
      // Lit body (it has form), with the fire showing through: a glowing
      // core, hands and a crown of flame (those feed the bloom).
      s.chain([[0, 0.02, 0], [0.04, 0.2, -0.02], [-0.03, 0.4, 0.01], [0, 0.55, 0]], 0.05, 0.17, body, { seg: 8 });
      s.sphere(0.2, body, { y: 0.66, sy: 1.1, seg: 10, vary: 0.06 });
      g.sphere(0.1, hot, { y: 0.68, z: 0.12, sz: 0.6, seg: 8 });
      s.sphere(0.11, body, { y: 0.95, seg: 10 });
      g.sphere(0.07, hot, { y: 0.94, z: 0.06, sz: 0.7, seg: 8 }); // the face glows
      for (const sd of [-1, 1]) {
        s.chain([[sd * 0.16, 0.76, 0], [sd * 0.3, 0.62, 0.06], [sd * 0.34, 0.45, 0.14]], 0.07, 0.04, body, { seg: 6 });
        g.sphere(0.055, hot, { x: sd * 0.34, y: 0.42, z: 0.15, seg: 8 });
        s.ball(0.02, '#1a0e08', { x: sd * 0.035, y: 0.97, z: 0.115 });
        g.cone(0.05, 0.16, lighten(col, 0.3), { x: sd * 0.17, y: 0.86, rz: -sd * 0.3, seg: 5 });
      }
      for (let i = 0; i < 3; i++) g.cone(0.05 - i * 0.008, 0.2 - i * 0.03, lighten(col, 0.15 + i * 0.12), { x: (i - 1) * 0.045, y: 1.1 - Math.abs(i - 1) * 0.03, z: -0.02, rz: (1 - i) * 0.25, seg: 5 });
      for (let i = 0; i < 4; i++) g.cone(0.03, 0.12, col, { x: Math.sin(i * 1.7) * 0.06, y: 0.12 + i * 0.1, z: Math.cos(i * 1.7) * 0.06, rz: Math.sin(i) * 0.4, seg: 4 }); // licks of flame up the tail
    });
    f.parts.swirl = new Part(f, ({ s }) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s.rock(0.06 + (i % 3) * 0.015, '#5a4a40', { x: Math.cos(a) * 0.36, y: 0.2 + (i % 3) * 0.22, z: Math.sin(a) * 0.36 }); } });
    f.body.add(f.parts.swirl);
    f.glowColor = col;
    return f;
  },
  swarm: (c) => {
    // A scurrying mass of small things on the floor (rats, beetles), not a cloud.
    const f = new Float({ seed: c.seed }); f.baseY = 0;
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) g.add(new Part(f, ({ s }) => {
      const col = i % 3 ? '#4a3c32' : '#5a4a3c';
      s.sphere(0.045, col, { y: 0.035, sz: 1.5, sy: 0.7, seg: 7 });
      s.ball(0.022, col, { y: 0.04, z: 0.06, detail: 0 });
      s.limb([0, 0.03, -0.06], [0.02, 0.015, -0.13], 0.006, 0.003, '#8a6a5a', { seg: 3, joint: false });
    }));
    f.body.add(g); f.parts.swarm = g; f.groundSwarm = true;
    return f;
  },
  aberration: (c) => {
    const f = new Float({ seed: c.seed, scale: 1.1 }); f.baseY = 0.4;
    f.part('torso', ({ s, g }) => {
      s.sphere(0.3, '#6a4a7a', { y: 0.3, seg: 14 });
      s.sphere(0.12, '#f0e8e0', { y: 0.32, z: 0.24, seg: 10 });
      g.ball(0.06, '#ffd04a', { y: 0.32, z: 0.33 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s.cyl(0.02, 0.012, 0.45, '#5a3a6a', { x: Math.cos(a) * 0.15, y: -0.05, z: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }); }
    });
    return f;
  },
  plant: (c) => {
    const f = new Many({ seed: c.seed, scale: 1.1 });
    f.part('torso', ({ s, g }) => {
      s.cyl(0.12, 0.2, 0.7, '#3f5a2a', { y: 0.35, seg: 8 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s.cone(0.06, 0.35, '#4a7a3a', { x: Math.cos(a) * 0.12, y: 0.55 + (i % 2) * 0.15, z: Math.sin(a) * 0.12, rz: Math.cos(a) * 0.8, rx: Math.sin(a) * 0.8, seg: 4 }); }
      s.sphere(0.16, '#a83a5a', { y: 0.8, seg: 8 });
      g.ball(0.04, '#ffd04a', { y: 0.86, z: 0.12 });
    });
    return f;
  },
  marker: (c) => {
    const f = new Many({ seed: c.seed });
    f.part('torso', ({ s, m }) => { m.cyl(0.015, 0.015, 0.9, '#3a3a3f', { y: 0.45 }); s.box(0.3, 0.2, 0.01, c.color || '#d4a94f', { x: 0.15, y: 0.78 }); });
    return f;
  },
  chest: (c) => {
    const f = new Many({ seed: c.seed });
    f.part('torso', ({ s, m }) => { s.box(0.55, 0.32, 0.38, '#6b4228', { y: 0.16 }); m.box(0.58, 0.04, 0.4, '#d4a94f', { y: 0.32 }); });
    return f;
  },
};

// Humanoid monsters share the hero rig with their own looks.
const HUMANOID_MONSTERS = {
  goblinoid: (c) => ({ race: { ears: 'point', build: 0.9, tusks: false, bigNose: true }, skin: '#7a9a4a', eyes: '#ffd04a', hair: '#1a1512', hairStyle: 'bald', beard: 'none', cls: { garb: '#5a4430', trim: '#8a6a3a', head: 'none' }, classKey: 'rogue', size: 'small' }),
  orc: () => ({ race: { ears: 'point', build: 1.15, tusks: true }, skin: '#6f8a5a', eyes: '#ff5a2a', hair: '#1a1512', hairStyle: 'mohawk', beard: 'none', cls: { garb: '#4a3a2a', trim: '#8a3a2a', head: 'none', outfit: 'fur' }, classKey: 'barbarian' }),
  skeleton: () => ({ skull: true, race: { hairless: true }, skin: '#ece4d0', eyes: '#ff6a3a', cls: { garb: '#ece4d0', trim: '#ece4d0', head: 'none' }, classKey: 'fighter', bones: true }),
  zombie: () => ({ race: { ears: 'round', build: 1 }, skin: '#7a8a6a', eyes: '#d8d0a0', hair: '#3a3a30', hairStyle: 'wild', beard: 'none', cls: { garb: '#4a4a3a', trim: '#3a3a2a', head: 'none' }, classKey: 'npc', zombie: true }),
  giant: () => ({ race: { ears: 'round', build: 1.2 }, skin: '#a87c52', eyes: '#5a3620', hair: '#6b4a28', hairStyle: 'wild', beard: 'full', cls: { garb: '#6b4a28', trim: '#8a6a44', head: 'none', outfit: 'fur' }, classKey: 'barbarian', scale: 1.9 }),
  fiend: () => ({ race: { ears: 'point', horns: true, glowEyes: true, build: 1.05 }, skin: '#a83a2a', eyes: '#ffd04a', hair: '#1a1512', hairStyle: 'bald', beard: 'none', cls: { garb: '#2a1a1a', trim: '#8a2a2a', head: 'none', outfit: 'collar' }, classKey: 'warlock' }),
  celestial: () => ({ race: { ears: 'round', glowEyes: true, build: 1.05 }, skin: '#f0dcc0', eyes: '#ffe08a', hair: '#f0e0a0', hairStyle: 'long', beard: 'none', cls: { garb: '#ece4d0', trim: '#d4a94f', head: 'none', chest: 'symbol' }, classKey: 'paladin', halo: true }),
  golem: () => ({ race: { robot: true, build: 1.25 }, skin: '#7a7670', eyes: '#ffb347', cls: { garb: '#7a7670', trim: '#5a5650', head: 'none' }, classKey: 'npc', scale: 1.3 }),
  construct: () => ({ race: { robot: true, build: 1.1 }, skin: '#8e98a3', eyes: '#7fd0ff', cls: { garb: '#8e98a3', trim: '#5a6068', head: 'none' }, classKey: 'npc' }),
  humanoid: (c) => ({ npcSeed: c.seed }),
};

/** A monster or NPC figure for a token. art = archetype key. */
export function creatureFigure(art, { seed = 'm', color, label = '', body, resolveLook } = {}) {
  const c = { seed, color, body };
  if (HUMANOID_MONSTERS[art]) {
    let look = HUMANOID_MONSTERS[art](c);
    if (look.npcSeed !== undefined || art === 'humanoid') {
      // A person: a commoner look from their name (innkeepers get an apron).
      look = resolveLook({ name: label || seed, classIndex: npcClassFor(label), body: c.body });
      if (/innkeep|marla|barkeep|cook/i.test(label)) look.apron = true;
    } else {
      look = { seed, mood: 'stern', mark: 'none', ...look };
    }
    if (/bugbear|skarn/i.test(label)) { look = { ...look, skin: '#a8743a', hairStyle: 'wild', hair: '#5a3a22', beard: 'full', race: { ...look.race, build: 1.25, ears: 'round' } }; }
    const fig = heroFigure(look, { seed, size: look.size });
    if (look.zombie) fig.zombie = true;
    if (look.scale) fig.body.scale.multiplyScalar(look.scale);
    if (/bugbear|skarn/i.test(label)) fig.body.scale.multiplyScalar(1.22);
    if (look.halo) fig.parts.head.add(new Part(fig, ({ g }) => g.torus(0.108, 0.01, '#ffe08a', { y: 0.17, rx: Math.PI / 2, tseg: 16 }))); // a plain glowing circlet
    return fig;
  }
  return (MONSTERS[art] || MONSTERS.monstrosity)(c);
}

function npcClassFor(label) {
  if (/guard|soldier|knight|veteran/i.test(label)) return 'fighter';
  if (/priest|acolyte/i.test(label)) return 'cleric';
  if (/mage|wizard/i.test(label)) return 'wizard';
  if (/bandit|thug|spy|thief/i.test(label)) return 'rogue';
  return 'npc';
}
