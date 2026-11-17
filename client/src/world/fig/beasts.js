import { Figure } from './rig';
import { PAL, shade, tint, mixc } from '../palette';
import { aim } from './hero';

// ================= Monsters =================
//
// The same miniature language as the heroes: chunky chamfered blocks, big
// readable eyes with whites and glints, a clear silhouette per archetype
// (you can tell a wolf from a boar from a bear across the table), painted
// from the shared palette with the token's colour where it has one.
//
// Rigs: four legs (Quad), many legs (Crawler), flying and floating things
// (Flyer), a coiled snake (Coil). Humanoid monsters (goblins, orcs,
// skeletons, giants…) are people, built by fig/hero.js from a look.

const TAU = Math.PI * 2;

/* ---------------- shared bits ---------------- */

// A miniature's eye: a white, a coloured iris, a pupil, a glint. glow: the
// whole eye lights up (and blooms).
function eye(k, x, y, z, r, iris, { glow = false, ry = 0, slit = false } = {}) {
  if (glow) { k.g.sphere(r, iris, { x, y, z, sz: 0.6, ry, seg: 8 }); k.g.ball(r * 0.3, '#ffffff', { x: x + r * 0.3, y: y + r * 0.35, z: z + r * 0.45, detail: 0 }); return; }
  k.s.sphere(r, PAL.eyeWhite, { x, y, z, sz: 0.55, ry, seg: 8 });
  k.s.sphere(r * 0.66, iris, { x, y: y - r * 0.05, z: z + r * 0.28, sz: 0.4, ry, seg: 7 });
  if (slit) k.s.bevel(r * 0.2, r * 1.0, r * 0.2, PAL.pupil, { x, y: y - r * 0.05, z: z + r * 0.5, ry });
  else k.s.sphere(r * 0.34, PAL.pupil, { x, y: y - r * 0.05, z: z + r * 0.46, sz: 0.4, ry, seg: 5 });
  k.g.ball(r * 0.2, '#ffffff', { x: x + r * 0.25, y: y + r * 0.3, z: z + r * 0.62, detail: 0 });
}

/* ======================= four legs ======================= */

class Quad extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts, ph = this.anim.phase;
    const s = Math.sin(this.stride || 0) * walk;
    if (P.legs) { P.legs[0].rotation.x = s * 0.6; P.legs[3].rotation.x = s * 0.6; P.legs[1].rotation.x = -s * 0.6; P.legs[2].rotation.x = -s * 0.6; }
    if (P.tail) { P.tail.rotation.y = Math.sin(t * (walk ? 9 : 2.5) + ph) * 0.35; P.tail.rotation.x = this.tailLift || 0; }
    if (P.head && !still) { P.head.rotation.y = Math.sin(t * 0.5 + ph) * 0.22 * (1 - walk); P.head.rotation.x = Math.sin(t * 0.33 + ph) * 0.06; }
    if (P.wings) { const f = Math.sin(t * 2.6 + ph) * 0.14; P.wings[0].rotation.z = 0.35 + f; P.wings[1].rotation.z = -0.35 - f; }
    if (P.torso && !still) P.torso.scale.y = 1 + Math.sin(t * 2 + ph) * 0.02;
    this.body.position.y = Math.abs(Math.sin(this.stride || 0)) * 0.03 * walk;
  }
  act(name, k) {
    const P = this.parts;
    if (name === 'melee' || name === 'shoot' || name === 'cast') {
      this.body.position.z = k < 0.35 ? -0.1 * (k / 0.35) : k < 0.55 ? -0.1 + 0.5 * ((k - 0.35) / 0.2) : 0.4 * (1 - (k - 0.55) / 0.45);
      if (P.head) P.head.rotation.x = k > 0.3 && k < 0.6 ? 0.5 : 0;
      if (P.jaw) P.jaw.rotation.x = k > 0.25 && k < 0.6 ? 0.5 : 0;
      if (P.wings) { P.wings[0].rotation.z = 0.35 + Math.sin(k * Math.PI) * 0.9; P.wings[1].rotation.z = -0.35 - Math.sin(k * Math.PI) * 0.9; }
    } else if (name === 'hurt') this.body.position.z = -0.1 * Math.sin(k * Math.PI);
    if (k >= 1 && P.jaw) P.jaw.rotation.x = 0;
  }
}

// o: color, belly, len, w, h, legH, thick, head (size), snout (length),
//    ears ('point'|'round'|'none'), earC, nose, tail {len, r, bushy, up},
//    tusks, horns, mane, spikes, wings, eyes, glow, teeth, whiskers, neck
function quadruped(fig, o) {
  const col = o.color, dark = shade(col, 0.22), belly = o.belly || tint(col, 0.22);
  const bl = o.len, bw = o.w, bh = o.h, legH = o.legH, by = legH + bh * 0.42;
  fig.part('torso', ({ s }) => {
    s.bevel(bw, bh, bl * 0.62, col, { y: by, z: bl * 0.17, b: bh * 0.3, vary: 0.03 });          // chest and shoulders
    s.bevel(bw * 0.92, bh * 0.9, bl * 0.56, col, { y: by - bh * 0.03, z: -bl * 0.2, b: bh * 0.3, vary: 0.03 }); // haunches
    s.bevel(bw * 0.7, bh * 0.25, bl * 0.7, belly, { y: by - bh * 0.4, b: bh * 0.1 });          // belly
    if (o.mane) s.bevel(bw * 1.2, bh * 1.15, bl * 0.32, o.mane, { y: by + bh * 0.08, z: bl * 0.34, b: bh * 0.35, vary: 0.05 });
    if (o.spikes) for (let i = 0; i < 6; i++) s.cone(bw * 0.12, bh * 0.55, o.spikes, { y: by + bh * 0.48, z: bl * 0.36 - i * bl * 0.14, rx: -0.4, seg: 4 });
    else for (let i = 0; i < 5; i++) s.bevel(bw * 0.3, bh * 0.12, bl * 0.12, dark, { y: by + bh * 0.48, z: bl * 0.3 - i * bl * 0.15, rx: -0.3, vary: 0.06 }); // a darker stripe of coat
  });
  // legs: pivot at the hip, inside the body
  fig.parts.legs = [];
  const hipY = by - bh * 0.1, th = o.thick || 1;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const leg = fig.part(null, ({ s }) => {
      const r = bw * 0.2 * th;
      s.bevel(r * 1.7, hipY * 0.6, r * 1.8, col, { y: -hipY * 0.28, taper: 0.25, b: r * 0.4 });
      s.bevel(r * 1.2, hipY * 0.5, r * 1.25, sz > 0 ? col : dark, { y: -hipY * 0.68, z: sz > 0 ? 0 : -r * 0.2, b: r * 0.3 });
      s.bevel(r * 1.6, r * 0.8, r * 2.0, dark, { y: -hipY + r * 0.4, z: r * 0.35, b: r * 0.3 }); // paw
      if (!o.hooves) for (const tx of [-1, 0, 1]) s.cone(r * 0.2, r * 0.6, PAL.bone, { x: tx * r * 0.5, y: -hipY + r * 0.3, z: r * 1.4, rx: 1.75, seg: 4 });
    });
    leg.position.set(sx * bw * 0.32, hipY, sz * bl * 0.3);
    fig.parts.legs.push(leg);
  });
  // head and neck
  const hr = o.head, hy = by + bh * (o.neck ? 0.6 : 0.25) + (o.neck || 0) * 0.9, hz = bl * 0.5 + hr * 0.4 + (o.neck || 0) * 0.55;
  const head = fig.part('head', (k) => {
    const { s } = k;
    if (o.neck) { s.bevel(hr * 1.0, hr * 1.0, o.neck * 1.9, col, { y: -o.neck * 0.62, z: -o.neck * 0.5, rx: 0.9, b: hr * 0.28 }); for (let i = 0; i < 3; i++) s.cone(hr * 0.16, hr * 0.5, o.spikes || dark, { y: -o.neck * (0.25 + i * 0.35) + hr * 0.45, z: -o.neck * (0.2 + i * 0.3), rx: -0.7, seg: 4 }); }
    s.bevel(hr * 1.9, hr * 1.6, hr * 1.6, col, { b: hr * 0.45 });                            // skull
    const sn = o.snout || 1;
    s.bevel(hr * 1.1, hr * 0.85, hr * sn, o.muzzle || tint(col, 0.1), { y: -hr * 0.3, z: hr * (0.7 + sn * 0.45), taper: 0.12, b: hr * 0.28 }); // muzzle
    s.bevel(hr * 0.5, hr * 0.32, hr * 0.3, o.nose || PAL.ink, { y: -hr * 0.1, z: hr * (0.7 + sn * 0.95), b: hr * 0.1 }); // nose
    for (const sd of [-1, 1]) eye(k, sd * hr * 0.5, hr * 0.25, hr * 0.78, hr * 0.3, o.eyes || '#e0a030', { glow: o.glow, ry: sd * 0.4, slit: o.slit });
    for (const sd of [-1, 1]) s.bevel(hr * 0.5, hr * 0.14, hr * 0.2, shade(col, 0.35), { x: sd * hr * 0.48, y: hr * 0.6, z: hr * 0.72, rz: sd * (o.glow ? 0.35 : 0.1) }); // brows
    if (o.ears === 'point') for (const sd of [-1, 1]) { s.cone(hr * 0.42, hr * 0.9, col, { x: sd * hr * 0.6, y: hr * 0.95, z: -hr * 0.1, rz: -sd * 0.25, sz: 0.5, seg: 4 }); s.cone(hr * 0.25, hr * 0.6, o.earC || shade(col, 0.4), { x: sd * hr * 0.6, y: hr * 0.9, z: -hr * 0.02, rz: -sd * 0.25, sz: 0.3, seg: 4 }); }
    if (o.ears === 'round') for (const sd of [-1, 1]) { s.sphere(hr * 0.38, col, { x: sd * hr * 0.75, y: hr * 0.8, z: -hr * 0.2, sz: 0.5, seg: 7 }); s.sphere(hr * 0.22, o.earC || shade(col, 0.35), { x: sd * hr * 0.75, y: hr * 0.8, z: -hr * 0.05, sz: 0.3, seg: 6 }); }
    if (o.tusks) for (const sd of [-1, 1]) s.cone(hr * 0.13, hr * 0.7, PAL.bone, { x: sd * hr * 0.45, y: -hr * 0.4, z: hr * (0.8 + sn * 0.6), rx: -0.25, rz: -sd * 0.35, seg: 5 });
    if (o.teeth) for (const sd of [-1, 1]) s.cone(hr * 0.08, hr * 0.28, PAL.bone, { x: sd * hr * 0.3, y: -hr * 0.68, z: hr * (0.7 + sn * 0.8), rx: Math.PI, seg: 4 });
    if (o.horns) for (const sd of [-1, 1]) s.chain([[sd * hr * 0.55, hr * 0.7, -hr * 0.1], [sd * hr * 0.85, hr * 1.2, -hr * 0.55], [sd * hr * 0.8, hr * 1.45, -hr * 1.1]], hr * 0.22, hr * 0.05, o.hornC || PAL.boneD, { seg: 5 });
    if (o.whiskers) for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) s.bevel(hr * 0.9, hr * 0.04, hr * 0.04, PAL.cream, { x: sd * hr * 0.6, y: -hr * (0.15 + i * 0.12), z: hr * (0.7 + sn * 0.7), rz: sd * (0.1 - i * 0.2) });
    if (o.frill) for (let i = 0; i < 5; i++) s.cone(hr * 0.12, hr * 0.8, o.spikes || dark, { y: hr * (0.7 - i * 0.18), z: -hr * (0.6 + i * 0.1), rx: -1.2 - i * 0.1, seg: 4 });
  });
  head.position.set(0, hy, hz);
  if (o.teeth || o.jaw) {
    const jaw = fig.part('jaw', ({ s }) => {
      s.bevel(hr * 1.0, hr * 0.28, hr * (o.snout || 1) * 1.1, shade(o.muzzle || col, 0.1), { z: hr * (o.snout || 1) * 0.55, b: hr * 0.1 });
      s.bevel(hr * 0.8, hr * 0.12, hr * (o.snout || 1) * 0.9, PAL.blood, { y: hr * 0.12, z: hr * (o.snout || 1) * 0.55 });
    }, head);
    jaw.position.set(0, -hr * 0.62, hr * 0.5);
  }
  // tail
  if (o.tail) {
    const T = o.tail;
    const tail = fig.part('tail', ({ s }) => {
      if (T.bushy) s.bevel(T.r * 2.2, T.r * 2.2, T.len, T.c || col, { z: -T.len * 0.5, y: -T.len * 0.12, rx: 0.35, taper: 0.4, b: T.r * 0.8, vary: 0.04 });
      else {
        const pts = [];
        for (let i = 0; i <= 5; i++) pts.push([0, Math.sin((i / 5) * 1.4) * T.len * (T.up || 0.1) - (i / 5) * T.len * 0.25, -(i / 5) * T.len]);
        s.chain(pts, T.r, T.r * 0.3, T.c || col, { seg: 6 });
        if (o.spikes) for (let i = 1; i < 5; i++) s.cone(T.r * 0.6, T.r * 1.6, o.spikes, { y: pts[i][1] + T.r * 0.7, z: pts[i][2], rx: -0.6, seg: 4 });
      }
    });
    tail.position.set(0, by + bh * 0.2, -bl * 0.48);
  }
  if (o.wings) {
    const wc = o.wingC || shade(col, 0.2);
    fig.parts.wings = [-1, 1].map((sd) => {
      const w = fig.part(null, ({ s }) => {
        const span = o.wings;
        s.chain([[0, 0, 0], [sd * span * 0.45, span * 0.35, -span * 0.1], [sd * span, span * 0.2, -span * 0.25]], bw * 0.07, bw * 0.03, dark, { seg: 5 });
        s.membrane([[0, 0, 0], [sd * span * 0.45, span * 0.35, -span * 0.1], [sd * span, span * 0.2, -span * 0.25], [sd * span * 0.8, -span * 0.05, -span * 0.45], [sd * span * 0.45, 0.0, -span * 0.4], [sd * span * 0.15, -span * 0.02, -span * 0.3]], wc);
      });
      w.position.set(sd * bw * 0.3, by + bh * 0.42, bl * 0.12);
      return w;
    });
  }
  return fig;
}

/* ======================= many legs ======================= */

class Crawler extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts, ph = this.anim.phase;
    if (P.legs) P.legs.forEach((leg, i) => {
      const a = Math.sin((this.stride || 0) * 1.4 + i * 1.7) * walk;
      leg.rotation.y = leg.userData.ry + a * 0.35;
      leg.rotation.z = leg.userData.rz + Math.max(0, a) * 0.3 * leg.userData.side;
    });
    if (P.torso && !still) P.torso.scale.y = 1 + Math.sin(t * 2.6 + ph) * 0.025;
    if (P.head && !still) P.head.rotation.y = Math.sin(t * 0.7 + ph) * 0.1;
    this.body.position.y = Math.abs(Math.sin((this.stride || 0) * 1.4)) * 0.015 * walk;
  }
  act(name, k) {
    if (name === 'hurt') { this.body.position.z = -0.08 * Math.sin(k * Math.PI); return; }
    this.body.position.z = k < 0.4 ? -0.06 * (k / 0.4) : k < 0.6 ? 0.3 * ((k - 0.4) / 0.2) : 0.3 * (1 - (k - 0.6) / 0.4);
    if (this.parts.head) this.parts.head.rotation.x = k > 0.35 && k < 0.65 ? 0.35 : 0;
  }
}

function crawler(fig, { color, legs = 8, insect = false }) {
  const col = color, dark = shade(col, 0.3);
  fig.part('torso', ({ s }) => {
    if (insect) {
      s.bevel(0.3, 0.2, 0.38, col, { y: 0.22, z: -0.22, b: 0.08 });                // abdomen
      s.bevel(0.32, 0.06, 0.36, tint(col, 0.15), { y: 0.33, z: -0.22, b: 0.025 }); // shell
      s.bevel(0.012, 0.07, 0.36, dark, { y: 0.35, z: -0.22 });                       // the split of the wing-cases
      s.bevel(0.2, 0.15, 0.18, dark, { y: 0.2, z: 0.05, b: 0.05 });                  // thorax
    } else {
      s.sphere(0.24, col, { y: 0.3, z: -0.24, sy: 0.85, sz: 1.1, seg: 12, vary: 0.04 }); // abdomen
      for (let i = 0; i < 3; i++) s.bevel(0.06, 0.03, 0.12, i % 2 ? PAL.crimson : shade(PAL.crimson, 0.2), { y: 0.5, z: -0.2 - i * 0.08, rx: -0.2 - i * 0.25 }); // a marking
      s.sphere(0.13, dark, { y: 0.2, z: 0.06, sy: 0.8, seg: 10 });                    // cephalothorax
    }
  });
  const head = fig.part('head', (k) => {
    k.s.bevel(0.16, 0.12, 0.12, dark, { b: 0.04 });
    if (insect) {
      for (const sd of [-1, 1]) {
        eye(k, sd * 0.06, 0.03, 0.05, 0.035, '#c83a30', { glow: true });
        k.s.cone(0.02, 0.1, PAL.boneD, { x: sd * 0.04, y: -0.04, z: 0.1, rx: 1.4, rz: sd * 0.5, seg: 4 }); // mandibles
        k.s.chain([[sd * 0.04, 0.05, 0.04], [sd * 0.1, 0.16, 0.12], [sd * 0.16, 0.2, 0.22]], 0.008, 0.004, dark, { seg: 3 });
      }
    } else {
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) k.g.ball(0.016 - (i > 1 ? 0.005 : 0), '#ff5a3a', { x: sd * (0.025 + i * 0.012), y: 0.04 + (i % 2) * 0.02, z: 0.06 - i * 0.008, detail: 0 });
      for (const sd of [-1, 1]) k.s.cone(0.018, 0.07, PAL.bone, { x: sd * 0.03, y: -0.05, z: 0.06, rx: Math.PI - 0.3, seg: 4 }); // fangs
    }
  });
  head.position.set(0, insect ? 0.22 : 0.2, insect ? 0.19 : 0.17);
  fig.parts.legs = [];
  const n = legs / 2;
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    const leg = fig.part(null, ({ s }) => {
      const L1 = insect ? 0.16 : 0.22, L2 = insect ? 0.2 : 0.3;
      s.chain([[0, 0, 0], [side * L1, 0.12, 0], [side * (L1 + L2 * 0.5), -0.05, 0], [side * (L1 + L2 * 0.7), -0.2, 0]], 0.022, 0.008, i % 2 ? col : dark, { seg: 5 });
    });
    const ry = (i - (n - 1) / 2) * (insect ? -0.5 : -0.38);
    leg.position.set(side * 0.08, 0.2, (insect ? 0.05 : 0.06) - i * 0.05);
    leg.userData = { ry: side * ry, rz: 0, side };
    leg.rotation.y = side * ry;
    fig.parts.legs.push(leg);
  }
  return fig;
}

/* ======================= fliers and floaters ======================= */

class Flyer extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts, ph = this.anim.phase, b = this.beat || 0;
    if (P.wings) { const f = Math.sin(t * (b || 3) + ph) * (b ? 0.7 : 0.18); P.wings[0].rotation.z = 0.15 + f; P.wings[1].rotation.z = -0.15 - f; }
    if (P.orbit) P.orbit.rotation.y = t * 1.3;
    if (P.tentacles) P.tentacles.forEach((p, i) => { p.rotation.x = Math.sin(t * 2 + i + ph) * 0.3; });
    if (P.torso && !still && this.wobble) { const w = Math.sin(t * 2.2 + ph) * this.wobble; P.torso.scale.set(1 + w, 1 - w, 1 + w); }
    this.body.position.y = (this.hoverY || 0) + (still ? 0 : Math.sin(t * 1.6 + ph) * (this.bob ?? 0.04)) + walk * 0.02;
  }
  act(name, k) {
    if (name === 'hurt') { this.body.position.z = -0.1 * Math.sin(k * Math.PI); return; }
    this.body.position.z = Math.sin(k * Math.PI) * 0.3;
    if (this.parts.wings) { const f = Math.sin(k * Math.PI * 4) * 0.8; this.parts.wings[0].rotation.z = 0.15 + f; this.parts.wings[1].rotation.z = -0.15 - f; }
  }
}

class Coil extends Figure {
  pose({ walk, t, still }) {
    const P = this.parts, ph = this.anim.phase;
    if (P.head && !still) { P.head.rotation.y = Math.sin(t * 0.8 + ph) * 0.35; P.head.position.y = this.headY + Math.sin(t * 1.4 + ph) * 0.02; }
    if (P.torso) P.torso.rotation.y = Math.sin((this.stride || 0) * 0.6) * 0.15 * walk;
  }
  act(name, k) {
    const P = this.parts;
    if (name === 'hurt') { this.body.position.z = -0.08 * Math.sin(k * Math.PI); return; }
    const lunge = k < 0.35 ? -0.05 : k < 0.55 ? 0.3 * ((k - 0.35) / 0.2) : 0.3 * (1 - (k - 0.55) / 0.45);
    if (P.head) P.head.position.z = this.headZ + lunge;
  }
}

/* ======================= the archetypes ======================= */

const tok = (c, fallback) => (c && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '#d4a94f' ? c : fallback);

const BEASTS = {
  rat: (c) => quadruped(new Quad({ kind: 'quad', seed: c.seed, scale: 0.55 }), {
    color: '#7a6a5e', len: 0.5, w: 0.26, h: 0.22, legH: 0.12, head: 0.1, snout: 1.6, ears: 'round', earC: '#d89a9a', nose: '#d07a7a',
    tail: { len: 0.5, r: 0.022, c: '#d8a0a0', up: 0.05 }, whiskers: true, eyes: PAL.ink, teeth: true,
  }),
  wolf: (c) => quadruped(new Quad({ kind: 'quad', seed: c.seed }), {
    color: tok(c.color, '#7d7a76'), belly: '#c8c0b4', len: 0.62, w: 0.24, h: 0.24, legH: 0.3, head: 0.11, snout: 1.5, ears: 'point', earC: '#4a4440',
    tail: { len: 0.32, r: 0.05, bushy: true, c: '#6a6662' }, mane: '#9a958e', eyes: '#e0b030', teeth: true,
  }),
  bear: (c) => quadruped(new Quad({ kind: 'quad', seed: c.seed, scale: 1.1 }), {
    color: tok(c.color, '#6b4a30'), belly: '#8a6448', len: 0.72, w: 0.42, h: 0.4, legH: 0.24, thick: 1.25, head: 0.15, snout: 1.0, ears: 'round', earC: '#3a2618', muzzle: '#a8845c',
    tail: { len: 0.06, r: 0.05, bushy: true }, eyes: PAL.ink, teeth: true,
  }),
  boar: (c) => quadruped(new Quad({ kind: 'quad', seed: c.seed }), {
    color: tok(c.color, '#5a4232'), len: 0.6, w: 0.32, h: 0.3, legH: 0.18, head: 0.13, snout: 1.2, ears: 'point', earC: '#3a2418', nose: '#c88a7a', muzzle: '#6a4e3c', hooves: true,
    tusks: true, spikes: '#2e2018', tail: { len: 0.12, r: 0.015, up: 0.5 }, eyes: '#c83a30',
  }),
  monstrosity: (c) => quadruped(new Quad({ kind: 'quad', seed: c.seed, scale: 1.05 }), {
    color: tok(c.color, '#6a5a7a'), len: 0.66, w: 0.36, h: 0.34, legH: 0.26, thick: 1.15, head: 0.14, snout: 0.9, ears: 'point', horns: true, hornC: '#d8c8a8',
    spikes: '#e0d0b0', tail: { len: 0.5, r: 0.04, up: 0.3 }, eyes: '#ffd04a', glow: true, teeth: true, frill: true,
  }),
  dragon: (c) => {
    const f = quadruped(new Quad({ kind: 'quad', seed: c.seed, scale: 1.15 }), {
      color: tok(c.color, '#a8322a'), belly: '#e0b070', len: 0.78, w: 0.36, h: 0.32, legH: 0.26, thick: 1.15, head: 0.13, snout: 1.6, neck: 0.22, ears: 'none',
      horns: true, hornC: '#e8dcc0', spikes: '#f0e0b8', tail: { len: 0.8, r: 0.07, up: 0.2 }, wings: 0.62, eyes: '#ffd04a', glow: true, slit: true, teeth: true, frill: true,
    });
    return f;
  },
  spider: (c) => crawler(new Crawler({ kind: 'many', seed: c.seed }), { color: tok(c.color, '#3a3430'), legs: 8 }),
  insect: (c) => crawler(new Crawler({ kind: 'many', seed: c.seed }), { color: tok(c.color, '#4a5a2a'), legs: 6, insect: true }),

  snake: (c) => {
    const f = new Coil({ kind: 'snake', seed: c.seed });
    const col = tok(c.color, '#5a7a3a'), belly = '#d8c890', band = shade(col, 0.3);
    f.part('torso', ({ s }) => {
      for (let i = 0; i < 14; i++) {
        const a = i * 0.75, r = 0.24 - i * 0.012;
        s.sphere(0.085 - i * 0.002, i % 3 ? col : band, { x: Math.sin(a) * r, y: 0.07 + i * 0.006, z: Math.cos(a) * r - 0.05, sx: 1.25, sy: 0.85, seg: 8 });
      }
    });
    f.headY = 0.42; f.headZ = 0.12;
    const head = f.part('head', (k) => {
      k.s.chain([[0, -0.32, -0.12], [0, -0.18, -0.06], [0, -0.06, -0.02], [0, 0, 0]], 0.07, 0.06, col, { seg: 8 });
      k.s.bevel(0.06, 0.18, 0.04, belly, { y: -0.12, z: 0.02, rx: -0.3 });
      k.s.bevel(0.16, 0.09, 0.2, col, { y: 0.02, z: 0.06, b: 0.035, taper: 0.1 });
      for (const sd of [-1, 1]) eye(k, sd * 0.06, 0.05, 0.1, 0.028, '#e0c030', { slit: true, ry: sd * 0.5 });
      k.s.bevel(0.01, 0.006, 0.09, '#c83a40', { y: -0.01, z: 0.2 });
      for (const sd of [-1, 1]) k.s.bevel(0.016, 0.006, 0.04, '#c83a40', { x: sd * 0.008, y: -0.01, z: 0.26, ry: sd * 0.4 });
    });
    head.position.set(0, f.headY, f.headZ);
    return f;
  },

  bat: (c) => {
    const f = new Flyer({ kind: 'float', seed: c.seed, scale: 0.8 });
    f.hoverY = 0.55; f.beat = 14; f.bob = 0.06;
    const col = tok(c.color, '#4a3a3a');
    f.part('torso', (k) => {
      k.s.sphere(0.09, col, { sy: 1.15, seg: 9 });
      k.s.bevel(0.13, 0.11, 0.11, col, { y: 0.11, b: 0.04 });
      for (const sd of [-1, 1]) {
        k.s.cone(0.04, 0.1, col, { x: sd * 0.045, y: 0.2, rz: -sd * 0.25, sz: 0.5, seg: 4 });
        eye(k, sd * 0.03, 0.12, 0.055, 0.018, '#c83a30', { glow: true });
      }
      k.s.cone(0.01, 0.025, PAL.bone, { x: 0.012, y: 0.07, z: 0.055, rx: Math.PI, seg: 3 });
    });
    f.parts.wings = [-1, 1].map((sd) => {
      const w = f.part(null, ({ s }) => {
        s.membrane([[0, 0.05, 0], [sd * 0.18, 0.14, 0], [sd * 0.34, 0.05, 0], [sd * 0.26, -0.04, 0], [sd * 0.17, 0.0, 0], [sd * 0.09, -0.05, 0]], shade(col, 0.15));
        s.chain([[0, 0.05, 0], [sd * 0.18, 0.14, 0], [sd * 0.34, 0.05, 0]], 0.008, 0.004, shade(col, 0.4), { seg: 3 });
      });
      w.position.set(sd * 0.05, 0.06, 0);
      return w;
    });
    return f;
  },
  bird: (c) => {
    const f = new Flyer({ kind: 'float', seed: c.seed, scale: 0.85 });
    f.hoverY = 0.5; f.beat = 9;
    const col = tok(c.color, '#6a5038');
    f.part('torso', (k) => {
      k.s.bevel(0.16, 0.16, 0.26, col, { b: 0.06 });
      k.s.bevel(0.12, 0.08, 0.2, PAL.cream, { y: -0.05, z: 0.02, b: 0.03 });
      k.s.bevel(0.14, 0.14, 0.13, col, { y: 0.1, z: 0.12, b: 0.05 });
      k.s.cone(0.03, 0.09, PAL.ochre, { y: 0.09, z: 0.23, rx: Math.PI / 2 + 0.3, seg: 4 });
      for (const sd of [-1, 1]) eye(k, sd * 0.06, 0.13, 0.15, 0.022, '#e0a020', { ry: sd * 0.7 });
      for (let i = 0; i < 3; i++) k.s.bevel(0.04, 0.012, 0.16, shade(col, 0.2 + i * 0.05), { x: (i - 1) * 0.035, y: 0.02, z: -0.2, rx: 0.2, ry: (i - 1) * 0.25 });
    });
    f.parts.wings = [-1, 1].map((sd) => {
      const w = f.part(null, ({ s }) => {
        for (let i = 0; i < 4; i++) s.bevel(0.1, 0.016, 0.15 - i * 0.02, i % 2 ? col : shade(col, 0.15), { x: sd * (0.05 + i * 0.07), z: -i * 0.02 });
      });
      w.position.set(sd * 0.07, 0.04, 0);
      return w;
    });
    return f;
  },
  ghost: (c) => {
    const f = new Flyer({ kind: 'float', seed: c.seed, ghostly: true });
    f.hoverY = 0.08; f.bob = 0.05;
    const col = tok(c.color, '#cfe0ea');
    f.part('torso', (k) => {
      // a shroud tapering to wisps, a hood, two lit eyes, reaching sleeves
      k.s.bevel(0.34, 0.5, 0.28, col, { y: 0.36, taper: 0.45, b: 0.06 });
      for (let i = 0; i < 5; i++) k.s.cone(0.06, 0.18, col, { x: (i - 2) * 0.06, y: 0.06, z: Math.sin(i) * 0.05, rx: Math.PI + (i - 2) * 0.1, seg: 4 });
      k.s.sphere(0.15, col, { y: 0.68, seg: 12 });
      k.s.sphere(0.165, shade(col, 0.15), { y: 0.69, theta: 1.9, rx: -0.65, seg: 12 });
      k.s.sphere(0.11, '#1a2230', { y: 0.67, z: 0.06, sz: 0.6, seg: 10 });
      for (const sd of [-1, 1]) k.g.sphere(0.022, '#9ae0ff', { x: sd * 0.045, y: 0.69, z: 0.12, sy: 1.4, seg: 6 });
      for (const sd of [-1, 1]) k.s.chain([[sd * 0.15, 0.52, 0], [sd * 0.25, 0.42, 0.08], [sd * 0.24, 0.32, 0.2]], 0.045, 0.02, col, { seg: 5 });
    });
    return f;
  },
  ooze: (c) => {
    const f = new Flyer({ kind: 'blob', seed: c.seed });
    f.wobble = 0.04; f.bob = 0;
    for (const m of [f.mats.solid, f.mats.skin]) { m.transparent = true; m.opacity = 0.78; }
    const col = tok(c.color, '#6ab04a');
    f.part('torso', (k) => {
      k.k.sphere(0.32, col, { y: 0.2, sy: 0.65, seg: 14 });
      k.k.sphere(0.18, tint(col, 0.15), { x: 0.12, y: 0.3, z: 0.05, seg: 10 });
      k.k.sphere(0.14, col, { x: -0.16, y: 0.26, z: -0.08, seg: 10 });
      k.s.sphere(0.03, PAL.bone, { x: -0.05, y: 0.14, z: -0.05, seg: 6 });
      k.s.bevel(0.12, 0.02, 0.02, PAL.bone, { x: 0.05, y: 0.1, z: 0.0, rz: 0.4 });
      for (const sd of [-1, 1]) eye(k, sd * 0.08, 0.32, 0.22, 0.04, '#2a3a10', { ry: sd * 0.3 });
      k.s.bevel(0.08, 0.02, 0.02, shade(col, 0.5), { y: 0.24, z: 0.27 });
    });
    return f;
  },
  elemental: (c) => {
    const f = new Flyer({ kind: 'float', seed: c.seed, scale: 1.05 });
    f.hoverY = 0.06; f.bob = 0.04;
    const col = tok(c.color, '#e07a30');
    const fire = /^#(e|f|d)/i.test(col) || /fire|flame|magma/i.test(c.label);
    const ice = /ice|frost|water/i.test(c.label);
    const core = ice ? PAL.frost : fire ? PAL.flame : col;
    f.part('torso', (k) => {
      // a lit core in a body of stone, with heavy fists
      k.g.sphere(0.13, core, { y: 0.5, seg: 10 });
      k.s.rock(0.2, fire ? PAL.stoneDD : ice ? PAL.waterL : shade(col, 0.4), { y: 0.62, detail: 1 });
      k.s.rock(0.17, fire ? PAL.stoneD : ice ? PAL.water : shade(col, 0.3), { y: 0.36, detail: 1 });
      k.s.rock(0.12, fire ? PAL.stoneDD : shade(col, 0.4), { y: 0.14, detail: 0 });
      for (const sd of [-1, 1]) { k.s.rock(0.11, fire ? PAL.stoneD : shade(col, 0.3), { x: sd * 0.3, y: 0.42, detail: 0 }); k.g.ball(0.04, core, { x: sd * 0.3, y: 0.42, z: 0.08, detail: 0 }); }
      for (const sd of [-1, 1]) k.g.bevel(0.06, 0.025, 0.02, core, { x: sd * 0.07, y: 0.68, z: 0.18, rz: sd * 0.3 });
      if (fire) for (let i = 0; i < 5; i++) k.g.cone(0.05, 0.18, i % 2 ? PAL.flame : PAL.flameHot, { x: Math.sin(i * 1.3) * 0.1, y: 0.82, z: Math.cos(i * 1.3) * 0.08, seg: 5 });
    });
    f.parts.orbit = f.part(null, ({ s }) => { for (let i = 0; i < 4; i++) s.rock(0.05, shade(col, 0.4), { x: Math.sin(i * TAU / 4) * 0.38, y: 0.3 + (i % 2) * 0.2, z: Math.cos(i * TAU / 4) * 0.38, detail: 0 }); });
    return f;
  },
  swarm: (c) => {
    const f = new Flyer({ kind: 'blob', seed: c.seed });
    f.bob = 0.02;
    const col = tok(c.color, '#3a3430');
    f.parts.orbit = f.part('torso', (k) => {
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4, r = 0.06 + (i % 5) * 0.06;
        const x = Math.sin(a) * r, z = Math.cos(a) * r, y = 0.04 + (i % 4) * 0.07;
        k.s.bevel(0.07, 0.05, 0.11, i % 2 ? col : shade(col, 0.2), { x, y, z, ry: a, b: 0.012 });
        k.g.ball(0.008, '#ff5a3a', { x: x + Math.sin(a) * 0.04, y: y + 0.01, z: z + Math.cos(a) * 0.04, detail: 0 });
      }
    });
    return f;
  },
  aberration: (c) => {
    const f = new Flyer({ kind: 'float', seed: c.seed });
    f.hoverY = 0.32; f.bob = 0.05;
    const col = tok(c.color, '#7a5a8a');
    f.part('torso', (k) => {
      k.k.sphere(0.24, col, { y: 0.3, seg: 14 });
      k.s.sphere(0.25, shade(col, 0.2), { y: 0.3, theta: 1.0, rx: -0.4, seg: 12 }); // a brow of hide
      eye(k, 0, 0.3, 0.2, 0.11, '#e0c030', { slit: true });
      k.s.bevel(0.16, 0.04, 0.05, PAL.ink, { y: 0.16, z: 0.2, taper: -0.3 });
      for (let i = 0; i < 5; i++) k.s.cone(0.012, 0.035, PAL.bone, { x: (i - 2) * 0.03, y: 0.17, z: 0.22, rx: Math.PI, seg: 3 });
    });
    f.parts.tentacles = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const t = f.part(null, ({ s }) => s.chain([[0, 0, 0], [Math.sin(a) * 0.08, -0.12, Math.cos(a) * 0.08], [Math.sin(a) * 0.1, -0.26, Math.cos(a) * 0.12]], 0.03, 0.01, shade(col, 0.1), { seg: 5 }));
      t.position.set(Math.sin(a) * 0.14, 0.14, Math.cos(a) * 0.14);
      f.parts.tentacles.push(t);
    }
    return f;
  },
  plant: (c) => {
    const f = new Flyer({ kind: 'plant', seed: c.seed, scale: 1.05 });
    f.bob = 0;
    const leaf = tok(c.color, PAL.leaf);
    f.part('torso', (k) => {
      // a walking stump: bark body, root feet, branch arms, a leafy crown
      k.s.bevel(0.3, 0.5, 0.26, PAL.bark, { y: 0.3, taper: 0.2, b: 0.06, vary: 0.04 });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.s.cone(0.05, 0.2, shade(PAL.bark, 0.2), { x: Math.sin(a) * 0.14, y: 0.05, z: Math.cos(a) * 0.12, ...aim(Math.sin(a), -0.5, Math.cos(a)), seg: 4 }); }
      for (const sd of [-1, 1]) k.s.chain([[sd * 0.14, 0.45, 0], [sd * 0.28, 0.4, 0.05], [sd * 0.34, 0.25, 0.12]], 0.035, 0.015, PAL.bark, { seg: 5 });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.s.sphere(0.12, i % 2 ? leaf : shade(leaf, 0.2), { x: Math.sin(a) * 0.14, y: 0.66 + (i % 3) * 0.05, z: Math.cos(a) * 0.12, seg: 6 }); }
      k.s.sphere(0.14, tint(leaf, 0.1), { y: 0.8, seg: 7 });
      for (const sd of [-1, 1]) k.g.ball(0.025, '#c8ff6a', { x: sd * 0.06, y: 0.42, z: 0.135, detail: 0 });
      k.s.bevel(0.08, 0.03, 0.02, PAL.ink, { y: 0.34, z: 0.135 });
    });
    return f;
  },
  marker: (c) => {
    const f = new Flyer({ kind: 'prop', seed: c.seed });
    f.bob = 0;
    f.part('torso', ({ s, m }) => {
      m.cyl(0.015, 0.015, 0.9, PAL.iron, { y: 0.45, seg: 6 });
      s.bevel(0.3, 0.2, 0.012, tok(c.color, PAL.ochre), { x: 0.15, y: 0.78, b: 0.004 });
      s.bevel(0.12, 0.05, 0.12, PAL.stoneD, { y: 0.025, b: 0.015 });
    });
    return f;
  },
  chest: (c) => {
    const f = new Flyer({ kind: 'prop', seed: c.seed });
    f.bob = 0;
    f.part('torso', ({ s, m }) => {
      s.bevel(0.5, 0.28, 0.34, PAL.wood, { y: 0.14, b: 0.03 });
      s.bevel(0.52, 0.12, 0.36, PAL.woodD, { y: 0.32, b: 0.05 });
      for (const x of [-0.17, 0.17]) m.bevel(0.04, 0.42, 0.37, PAL.iron, { x, y: 0.2 });
      m.bevel(0.07, 0.08, 0.02, PAL.gold, { y: 0.26, z: 0.18 });
    });
    return f;
  },
};

export function buildBeast(art, c) {
  return (BEASTS[art] || BEASTS.monstrosity)(c);
}

/* ======================= humanoid monsters ======================= */
// Looks (the same shape look/resolve.js gives a hero) for monsters that
// stand on two legs; fig/hero.js builds them.

const base = (o) => ({
  race: { ears: 'round', build: 1, ...(o.race || {}) }, body: o.body || null, frame: 'average', height: 'average', face: 'oval', eyeShape: 'round', brows: 'heavy',
  nose: 'broad', mood: 'stern', mark: 'none', hair: '#1a1512', hairStyle: 'bald', beard: 'none', outfit: 'tunic', armour: 'none', cloak: 'none',
  hat: 'none', extras: [], main: 'none', off: 'none', garb: '#5a4430', trim: '#8a6a3a', leather: PAL.leather, metalPaint: PAL.iron, eyes: '#ffd04a', ...o,
});

export const HUMANOID_MONSTERS = {
  goblinoid: (c) => (/bugbear|skarn/i.test(c.label)
    ? base({ race: { ears: 'point', build: 1.2, bigNose: true, tusks: false }, skin: '#a8743a', hair: '#5a3a22', hairStyle: 'wild', beard: 'full', outfit: 'furs', main: 'mace', frame: 'heavy', garb: '#5a4430', scale: 1.25, eyes: '#e0a020' })
    : /hobgoblin/i.test(c.label)
      ? base({ race: { ears: 'point', build: 1.05 }, skin: '#c0643a', hairStyle: 'topknot', outfit: 'tunic', armour: 'scale', main: 'sword', off: 'shield', garb: '#6a2a2a', trim: '#2a2a2a', metalPaint: PAL.bronze })
      : base({ race: { ears: 'point', build: 0.92, bigNose: true }, skin: '#7a9a4a', outfit: 'leathers', armour: 'leather', main: 'dagger', off: 'buckler', garb: '#5a4430', size: 'small', mood: 'grin', eyes: '#ffd04a', hat: /chief|boss|snagga/i.test(c.label) ? 'horned' : 'none' })),
  orc: () => base({ race: { ears: 'point', build: 1.15, tusks: true }, skin: '#6f8a5a', hairStyle: 'mohawk', outfit: 'furs', armour: 'none', cloak: 'mantle', main: 'greataxe', garb: '#4a3a2a', trim: '#8c2e32', mark: 'warpaint', frame: 'broad', eyes: '#ff5a2a' }),
  skeleton: () => base({ bones: true, skin: PAL.bone, main: 'sword', off: 'shield', garb: '#5a5348', trim: '#3a3430', metalPaint: PAL.iron, eyes: PAL.ember2 }),
  zombie: () => base({ race: { ears: 'round', build: 1 }, skin: '#7a8a6a', eyes: '#d8d0a0', hair: '#3a3a30', hairStyle: 'wild', outfit: 'tunic', garb: '#4a4a3a', trim: '#3a3a2a', mood: 'grin', armsForward: true, mark: 'scar' }),
  giant: () => base({ race: { ears: 'round', build: 1.22 }, skin: '#b88a60', eyes: '#5a3620', hair: '#6b4a28', hairStyle: 'wild', beard: 'full', outfit: 'furs', cloak: 'mantle', main: 'hammer', frame: 'heavy', garb: '#6b4a28', trim: '#8a6a44', scale: 1.9 }),
  fiend: () => base({ race: { ears: 'point', horns: true, glowEyes: true, build: 1.08, tail: true }, skin: '#a83a2a', eyes: '#ffd04a', outfit: 'coat', armour: 'half', main: 'greatsword', garb: '#2a1a1a', trim: '#8a2a2a', metalPaint: PAL.blackened, wings: 'bat', frame: 'athletic' }),
  celestial: () => base({ race: { ears: 'round', glowEyes: true, build: 1.05 }, skin: '#f0dcc0', eyes: '#ffe08a', hair: '#f0e0a0', hairStyle: 'long', outfit: 'robe', armour: 'half', main: 'spear', garb: '#ece4d0', trim: '#d8ae4c', metalPaint: PAL.gold, hat: 'circlet', wings: 'feather', mood: 'calm', brows: 'soft', nose: 'straight', float: true }),
  fey: (c) => base({ race: { ears: 'point', build: 0.88, glowEyes: true }, skin: '#cfe8c8', eyes: '#9aff8a', hair: tok(c.color, '#7ad0a0'), hairStyle: 'wild', outfit: 'dress', garb: '#4a7a3a', trim: '#9ae0ff', wings: 'fey', size: 'small', mood: 'smirk', brows: 'arched', nose: 'button', main: 'wand', float: true }),
  golem: () => base({ race: { robot: true, build: 1.25 }, robot: true, skin: '#8a8278', eyes: '#ffb347', trim: '#5a5650', garb: '#6a645c', robotHead: 'grille', finish: 'worn', frame: 'heavy', scale: 1.3 }),
  construct: () => base({ race: { robot: true, build: 1.1 }, robot: true, skin: '#8e98a3', eyes: '#7fd0ff', trim: '#c8a050', garb: '#5a6068', robotHead: 'visor', finish: 'polished', main: 'hammer' }),
};
void mixc;
