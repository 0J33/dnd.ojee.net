import { PAL, shade, tint } from '../palette';
import { TWO_HANDED } from '../../look/catalog';

// ================= Gear =================
//
// Weapons, shields, foci and the things that hang on a back or a belt. Each
// item is built standing up along +y with its grip at the origin, then held
// in a hand group (fig.parts.handR / handL, at the palm) with a rotation
// that says how it is carried: one-handed blades held ready and pointing
// forward, staves and polearms upright, a bow at the side.
// Items are separate parts, so the arm's swing carries them.

const blade = PAL.steelL;

function hold(fig, parent, build, { rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0, name } = {}) {
  if (!parent) return null;
  const p = fig.part(name || null, build, parent);
  p.rotation.set(rx, ry, rz);
  p.position.set(x, y, z);
  return p;
}

/* ---------------- weapons, built along +y ---------------- */

const W = {
  sword: ({ s, m }, L) => {
    m.bevel(0.034, 0.36, 0.01, blade, { y: 0.24, taper: 0.35, b: 0.004 });
    m.bevel(0.008, 0.28, 0.012, shade(blade, 0.2), { y: 0.22 });                 // fuller
    m.bevel(0.12, 0.02, 0.026, L.metalPaint, { y: 0.055, b: 0.006 });           // crossguard
    s.bevel(0.022, 0.07, 0.022, L.leather, { y: 0.01, b: 0.005 });               // grip
    m.sphere(0.018, L.metalPaint, { y: -0.035, seg: 6 });                       // pommel
  },
  rapier: ({ s, m }, L) => {
    m.bevel(0.012, 0.44, 0.008, blade, { y: 0.28, taper: 0.5, b: 0.002 });
    m.sphere(0.04, L.metalPaint, { y: 0.05, sy: 0.6, theta: 1.6, rx: Math.PI, seg: 8 }); // cup guard
    m.bevel(0.1, 0.012, 0.012, L.metalPaint, { y: 0.06 });
    s.bevel(0.018, 0.07, 0.018, L.leather, { y: 0.01 });
    m.sphere(0.016, L.metalPaint, { y: -0.035, seg: 6 });
  },
  greatsword: ({ s, m }, L) => {
    m.bevel(0.05, 0.62, 0.012, blade, { y: 0.52, taper: 0.3, b: 0.005 });
    m.bevel(0.012, 0.5, 0.015, shade(blade, 0.2), { y: 0.48 });
    m.bevel(0.2, 0.026, 0.034, L.metalPaint, { y: 0.2, b: 0.008 });
    s.bevel(0.026, 0.2, 0.026, L.leather, { y: 0.09 });
    m.sphere(0.024, L.metalPaint, { y: -0.02, seg: 6 });
  },
  axe: ({ s, m }, L) => {
    s.bevel(0.026, 0.4, 0.026, PAL.wood, { y: 0.16, b: 0.006 });
    m.bevel(0.09, 0.06, 0.016, blade, { x: 0.05, y: 0.3, rz: -Math.PI / 2, taper: 0.5, b: 0.005 }); // the bit flares to its edge
    m.bevel(0.014, 0.1, 0.018, tint(blade, 0.15), { x: 0.09, y: 0.3, b: 0.004 });
    m.bevel(0.04, 0.05, 0.03, L.metalPaint, { y: 0.31 });
    s.bevel(0.03, 0.05, 0.03, L.leather, { y: 0.0 });
  },
  greataxe: ({ s, m }, L) => {
    s.bevel(0.03, 0.82, 0.03, PAL.woodD, { y: 0.28, b: 0.008 });
    // a double bit: each blade narrow at the haft, flaring to a curved edge
    for (const sd of [-1, 1]) {
      m.bevel(0.1, 0.07, 0.016, blade, { x: sd * 0.055, y: 0.62, rz: sd * Math.PI / 2, taper: 0.55, b: 0.005 });
      m.bevel(0.016, 0.15, 0.018, tint(blade, 0.15), { x: sd * 0.1, y: 0.62, b: 0.005 });
    }
    m.bevel(0.05, 0.08, 0.04, L.metalPaint, { y: 0.62 });
    m.cone(0.02, 0.08, L.metalPaint, { y: 0.72, seg: 4 });
    for (const y of [0.0, 0.08]) s.bevel(0.036, 0.02, 0.036, L.leather, { y });
  },
  mace: ({ s, m }, L) => {
    s.bevel(0.024, 0.32, 0.024, PAL.woodD, { y: 0.12 });
    m.sphere(0.045, L.metalPaint, { y: 0.31, seg: 8 });
    for (let i = 0; i < 6; i++) m.bevel(0.012, 0.09, 0.06, tint(L.metalPaint, 0.12), { y: 0.31, ry: (i / 6) * Math.PI });
    m.cone(0.02, 0.04, L.metalPaint, { y: 0.37, seg: 5 });
    s.bevel(0.03, 0.05, 0.03, L.leather, { y: 0.0 });
  },
  hammer: ({ s, m }, L) => {
    s.bevel(0.03, 0.76, 0.03, PAL.woodD, { y: 0.26 });
    m.bevel(0.2, 0.09, 0.09, L.metalPaint, { y: 0.6, b: 0.016 });
    m.bevel(0.06, 0.1, 0.1, shade(L.metalPaint, 0.15), { x: 0.12, y: 0.6, b: 0.02 });
    m.cone(0.03, 0.09, L.metalPaint, { x: -0.13, y: 0.6, rz: Math.PI / 2, seg: 4 });
    s.bevel(0.036, 0.1, 0.036, L.leather, { y: 0.02 });
  },
  spear: ({ s, m }, L) => {
    s.bevel(0.024, 1.0, 0.024, PAL.wood, { y: 0.3 });
    m.bevel(0.05, 0.16, 0.012, blade, { y: 0.88, taper: 0.9, b: 0.004 });
    m.bevel(0.03, 0.05, 0.03, L.metalPaint, { y: 0.8 });
    s.bevel(0.03, 0.06, 0.03, L.trim || L.leather, { y: 0.74 });
  },
  pitchfork: ({ s, m }) => {
    s.bevel(0.024, 0.95, 0.024, PAL.woodL, { y: 0.3 });
    m.bevel(0.1, 0.014, 0.014, PAL.iron, { y: 0.78 });
    for (const x of [-0.045, 0, 0.045]) m.cone(0.008, 0.14, PAL.iron, { x, y: 0.86, seg: 4 });
  },
  staff: ({ s, m, g }, L) => {
    const kind = L.staff || 'plain';
    if (kind === 'gnarled') {
      s.chain([[0, -0.3, 0], [0.01, 0.0, 0], [-0.012, 0.3, 0.01], [0.012, 0.6, 0], [0.05, 0.74, 0.02], [0.0, 0.82, 0]], 0.022, 0.018, PAL.bark, { seg: 6 });
      for (let i = 0; i < 4; i++) s.cone(0.03, 0.07, PAL.leafL, { x: Math.sin(i * 1.7) * 0.04, y: 0.72 + i * 0.03, z: Math.cos(i * 1.7) * 0.04, rx: 0.6, rz: i, sz: 0.3, seg: 4 });
      g.ball(0.03, PAL.fel, { x: 0.02, y: 0.78, z: 0.0, detail: 1 });
    } else if (kind === 'crystal') {
      s.bevel(0.024, 1.0, 0.024, PAL.woodD, { y: 0.24 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; m.bevel(0.012, 0.1, 0.012, L.metalPaint, { x: Math.sin(a) * 0.03, y: 0.78, z: Math.cos(a) * 0.03, rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3 }); }
      g.bevel(0.04, 0.1, 0.04, L.trim && L.trim !== L.garb ? L.trim : PAL.frost, { y: 0.84, taper: 0.7, ry: 0.6 });
      g.bevel(0.04, 0.05, 0.04, L.trim && L.trim !== L.garb ? L.trim : PAL.frost, { y: 0.78, taper: -0.7, ry: 0.6, rx: Math.PI });
      m.bevel(0.034, 0.03, 0.034, L.metalPaint, { y: 0.74 });
    } else {
      s.bevel(0.026, 1.0, 0.026, PAL.wood, { y: 0.24, b: 0.008 });
      for (const y of [-0.24, 0.72]) s.bevel(0.034, 0.04, 0.034, L.metalPaint, { y });
      s.bevel(0.032, 0.08, 0.032, L.leather, { y: 0.06 });
    }
  },
  wand: ({ s, m, g }, L) => {
    s.bevel(0.014, 0.2, 0.014, PAL.woodDD, { y: 0.08, taper: 0.3 });
    m.bevel(0.02, 0.025, 0.02, L.metalPaint, { y: -0.01 });
    g.ball(0.016, L.trim && L.trim !== L.garb ? L.trim : PAL.arcane, { y: 0.19, detail: 0 });
  },
  dagger: ({ s, m }, L) => {
    m.bevel(0.03, 0.16, 0.008, blade, { y: 0.12, taper: 0.6, b: 0.003 });
    m.bevel(0.07, 0.014, 0.02, L.metalPaint, { y: 0.035 });
    s.bevel(0.018, 0.05, 0.018, L.leather, { y: 0.0 });
    m.sphere(0.013, L.metalPaint, { y: -0.03, seg: 5 });
  },
  crossbow: ({ s, m }, L) => {
    s.bevel(0.03, 0.34, 0.036, PAL.wood, { y: 0.1 });
    s.bevel(0.32, 0.026, 0.026, PAL.woodD, { y: 0.24, taper: 0 });
    m.bevel(0.3, 0.004, 0.004, PAL.cream, { y: 0.21 });
    m.bevel(0.01, 0.18, 0.01, blade, { y: 0.24, z: 0.02 });
    s.bevel(0.03, 0.06, 0.05, L.leather, { y: -0.04, z: -0.01 });
  },
  mug: ({ s, m }) => {
    s.cyl(0.035, 0.038, 0.08, PAL.woodL, { y: 0.03, seg: 8 });
    for (const y of [0.0, 0.055]) m.cyl(0.04, 0.04, 0.008, PAL.iron, { y, seg: 8 });
    s.cyl(0.034, 0.034, 0.012, PAL.cream, { y: 0.075, seg: 8 }); // foam
    s.torus(0.022, 0.006, PAL.woodD, { x: 0.044, y: 0.03, ry: Math.PI / 2, tseg: 8, rseg: 3 });
  },
};

// The bow is held in the left hand, a shallow curve forward with a string.
function bow(fig, L) {
  return hold(fig, fig.parts.handL, ({ s }) => {
    const len = 0.4, bend = 0.1, pts = [];
    for (let i = 0; i <= 6; i++) { const y = -len + (2 * len * i) / 6; pts.push([0, y, bend * (1 - (y / len) ** 2) - bend * 0.6]); }
    s.chain(pts, 0.02, 0.012, PAL.woodL, { seg: 5 });
    s.bevel(0.024, 0.07, 0.03, L.leather, { z: bend * 0.4 });
    s.limb(pts[0], pts[6], 0.004, 0.004, PAL.cream, { seg: 3, joint: false });
  }, { rx: 0.3, name: 'bow' });
}

/* ---------------- off hand ---------------- */

const OFF = {
  shield: ({ s, m }, L) => {
    // a round shield of planks, painted in the hero's colours, iron-rimmed
    s.cyl(0.15, 0.15, 0.025, PAL.woodL, { rx: Math.PI / 2, seg: 14, vary: 0.04 });
    for (const x of [-0.075, 0.075]) s.bevel(0.004, 0.26, 0.028, PAL.woodD, { x });
    s.bevel(0.07, 0.29, 0.03, L.garb, {});
    s.bevel(0.29, 0.07, 0.03, L.garb, {});
    m.torus(0.15, 0.014, L.metalPaint, { tseg: 16, rseg: 4 });
    m.sphere(0.04, L.metalPaint, { z: 0.018, sz: 0.6, seg: 8 });
  },
  kite: ({ s, m }, L) => {
    s.bevel(0.23, 0.22, 0.03, L.garb, { y: 0.04, b: 0.01 });
    s.bevel(0.23, 0.16, 0.03, L.garb, { y: -0.15, taper: -0.85, rx: Math.PI, b: 0.01 });
    m.bevel(0.25, 0.012, 0.034, L.metalPaint, { y: -0.07 });
    s.bevel(0.04, 0.3, 0.034, L.trim, { y: -0.02 });
    s.bevel(0.2, 0.04, 0.034, L.trim, { y: 0.06 });
    m.bevel(0.22, 0.02, 0.036, L.metalPaint, { y: 0.15 });
  },
  buckler: ({ m }, L) => {
    m.cyl(0.07, 0.07, 0.02, L.metalPaint, { rx: Math.PI / 2, seg: 12 });
    m.sphere(0.025, tint(L.metalPaint, 0.15), { z: 0.012, sz: 0.6, seg: 6 });
  },
  torch: ({ s, g }, L) => {
    s.bevel(0.022, 0.24, 0.022, PAL.woodD, { y: 0.06, taper: -0.2 });
    s.bevel(0.034, 0.05, 0.034, PAL.linen, { y: 0.18 });
    g.cone(0.035, 0.1, PAL.flame, { y: 0.26, seg: 5 });
    g.cone(0.02, 0.07, PAL.flameHot, { y: 0.25, seg: 5 });
    void L;
  },
  lantern: ({ s, m, g }) => {
    m.torus(0.02, 0.004, PAL.iron, { y: 0.0, rx: Math.PI / 2, tseg: 8, rseg: 3 });
    m.bevel(0.07, 0.016, 0.07, PAL.iron, { y: -0.04 });
    g.bevel(0.05, 0.07, 0.05, PAL.flame, { y: -0.085 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.bevel(0.008, 0.08, 0.008, PAL.iron, { x: x * 0.03, y: -0.085, z: z * 0.03 });
    m.bevel(0.07, 0.016, 0.07, PAL.iron, { y: -0.13 });
    void s;
  },
  book: ({ s, m }, L) => {
    s.bevel(0.11, 0.14, 0.035, L.trim && L.trim !== L.garb ? shade(L.trim, 0.3) : PAL.crimson, { b: 0.006 });
    s.bevel(0.1, 0.13, 0.03, PAL.cream, { x: 0.006, b: 0.003 });
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.bevel(0.02, 0.02, 0.04, PAL.gold, { x: x * 0.045, y: y * 0.06, b: 0.004 });
  },
};

/* ---------------- dressing a figure ---------------- */

export function equip(fig, L) {
  const P = fig.parts;
  const main = L.main || 'none', off = TWO_HANDED.has(main) ? 'none' : L.off || 'none';

  // main hand
  if (main === 'bow') bow(fig, L);
  else if (main === 'lute' || (L.extras || []).includes('lute')) lute(fig, L, main === 'lute');
  if (W[main]) {
    const upright = ['staff', 'spear', 'pitchfork', 'greatsword', 'greataxe', 'hammer'].includes(main);
    const grip = { staff: -0.02, spear: -0.04, pitchfork: -0.04, greatsword: -0.06, greataxe: -0.02, hammer: -0.02 }[main] || 0;
    hold(fig, P.handR, (k) => W[main](k, L), upright
      ? { rx: 0.18, y: grip, z: 0.0 }
      : main === 'mug' ? { rx: 0.0, z: 0.02 }
        : main === 'crossbow' ? { rx: 1.45, z: 0.02 }
          : main === 'dagger' ? { rx: 0.9, z: 0.01 }
            : main === 'wand' ? { rx: 0.7, z: 0.01 }
              : { rx: 0.5, rz: -0.12, z: 0.01 }); // blades held ready, tipped forward
  }

  // off hand
  if (off === 'shield' || off === 'kite') {
    // strapped to the forearm, turned out to the side and a little forward
    hold(fig, P.armL, (k) => OFF[off](k, L), { x: -0.045, y: -0.17, z: 0.07, ry: -0.55, rz: 0.06 });
  } else if (off === 'buckler') hold(fig, P.handL, (k) => OFF.buckler(k, L), { x: -0.02, y: 0.0, z: 0.02, ry: -1.2 });
  else if (off === 'dagger') hold(fig, P.handL, (k) => W.dagger(k, L), { rx: 1.55, z: 0.01 });
  else if (off === 'torch') hold(fig, P.handL, (k) => OFF.torch(k, L), { rx: 0.45, z: 0.01 });
  else if (off === 'lantern') hold(fig, P.handL, (k) => OFF.lantern(k, L), { y: -0.01 });
  else if (off === 'book') hold(fig, P.handL, (k) => OFF.book(k, L), { rx: 1.2, ry: 0.5, z: 0.04, y: 0.01 });
  else if (off === 'orb') {
    // a glowing focus that floats beside the off hand
    fig.orbY = 0.5;
    const orb = fig.part('orb', ({ m, g }) => {
      g.ball(0.04, L.trim && L.trim !== L.garb ? L.trim : PAL.arcane, { detail: 1 });
      m.torus(0.055, 0.006, PAL.gold, { rx: 1.1, tseg: 14, rseg: 3 });
    });
    orb.position.set(-0.26, fig.orbY, 0.1);
  }

  // what is carried on the body
  const ex = L.extras || [];
  const T = P.torso;
  if (!T) return;
  const back = -0.1;
  if (ex.includes('quiver') || main === 'bow') hold(fig, T, ({ s }) => {
    s.bevel(0.07, 0.28, 0.07, L.leather, { b: 0.012 });
    s.bevel(0.08, 0.03, 0.08, shade(L.leather, 0.3), { y: 0.13 });
    for (const [x, z] of [[-0.016, 0.01], [0.016, -0.01], [0, 0.016]]) {
      s.bevel(0.006, 0.09, 0.006, PAL.woodL, { x, y: 0.18, z });
      s.bevel(0.004, 0.035, 0.022, PAL.cream, { x, y: 0.22, z });
    }
  }, { x: 0.05, y: 0.18, z: back, rz: -0.4 });
  if (ex.includes('bedroll')) hold(fig, T, ({ s }) => {
    s.cyl(0.04, 0.04, 0.2, PAL.wool, { rz: Math.PI / 2, seg: 8 });
    for (const x of [-0.06, 0.06]) s.cyl(0.043, 0.043, 0.012, L.leather, { x, rz: Math.PI / 2, seg: 8 });
  }, { y: 0.04, z: back - 0.02 });
  if (ex.includes('satchel')) hold(fig, T, ({ s, m }) => {
    s.bevel(0.1, 0.08, 0.04, L.leather, { b: 0.012 });
    s.bevel(0.1, 0.04, 0.044, shade(L.leather, 0.15), { y: 0.03, z: 0.002 });
    m.bevel(0.016, 0.016, 0.01, PAL.brass, { y: 0.02, z: 0.024 });
  }, { x: 0.12, y: 0.0, z: 0.07, ry: 0.9 });
  if (ex.includes('satchel')) hold(fig, T, ({ s }) => s.bevel(0.022, 0.36, 0.01, shade(L.leather, 0.2), {}), { y: 0.18, z: 0.098, rz: 0.75 });
  if (ex.includes('pouch')) hold(fig, T, ({ s }) => {
    s.bevel(0.05, 0.055, 0.03, L.leather, { b: 0.01 });
    s.bevel(0.054, 0.02, 0.034, shade(L.leather, 0.25), { y: 0.022 });
  }, { x: -0.1, y: 0.03, z: 0.06, ry: -0.8 });
  if (ex.includes('scarf')) hold(fig, T, ({ s }) => {
    s.torus(0.06, 0.022, L.trim, { rx: Math.PI / 2, tseg: 12, rseg: 4 });
    s.bevel(0.04, 0.12, 0.014, L.trim, { x: 0.03, y: -0.07, z: 0.06, rz: 0.15 });
  }, { y: 0.29, z: 0.005 });
}

function lute(fig, L, inHands) {
  hold(fig, fig.parts.torso, ({ s }) => {
    s.sphere(0.075, PAL.woodL, { sz: 0.45, seg: 10 });
    s.cyl(0.018, 0.018, 0.01, PAL.woodDD, { z: 0.035, rx: Math.PI / 2, seg: 8 });
    s.bevel(0.03, 0.2, 0.016, PAL.woodD, { y: 0.15 });
    s.bevel(0.036, 0.05, 0.02, PAL.woodDD, { y: 0.27, rx: -0.4 });
  }, inHands ? { y: 0.14, z: 0.13, rz: -0.9 } : { x: 0.02, y: 0.16, z: -0.12, rz: 0.6 });
}
