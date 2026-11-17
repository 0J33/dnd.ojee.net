import * as THREE from 'three';
import { PAL, shade, tint, mixc } from '../palette';
import { FRAMES } from '../../look/catalog';
import { equip } from './gear';

// ================= Heroes and people =================
//
// One builder for every two-legged person: heroes from their sheet, people
// in the world from their role, goblins and orcs and giants from their
// archetype. Proportions are a painted miniature's: a big head (about a
// third of the height) so faces read from across the table, a chunky torso,
// short sturdy legs and mitten hands. Everything is chamfered blocks and
// low-sided rounds, layered like clothes: body, outfit, armour, cloak, hat.
//
// The figure faces +z. Parts and their pivots:
//   legL/legR at the hips, torso at the hips, head at the neck,
//   armL/armR at the shoulders (handL/handR groups at the palms),
//   cloak at the shoulders (lifts as they walk), tail at the rump.

export const HERO = { LEG: 0.33, TORSO: 0.3, R: 0.132 };
const { LEG, TORSO, R } = HERO;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** Rotation (Kit options) that turns a part's +y along a direction. */
export function aim(dx, dy, dz) {
  _v.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(UP, _v);
  _e.setFromQuaternion(_q, 'XYZ');
  return { rx: _e.x, ry: _e.y, rz: _e.z };
}

/* ======================= the body ======================= */

// How the outfit dresses each part of the body.
//   sleeve  full | short | bare | wide | rolled
//   skirt   none | tunic | coat | robe | dress | kilt | apron
const DRESS = {
  tunic: { sleeve: 'full', skirt: 'tunic' },
  doublet: { sleeve: 'puff', skirt: 'short' },
  coat: { sleeve: 'full', skirt: 'coat', collar: true },
  leathers: { sleeve: 'full', skirt: 'short', vest: true },
  robe: { sleeve: 'wide', skirt: 'robe' },
  vestments: { sleeve: 'wide', skirt: 'robe', tabard: true, stole: true },
  dress: { sleeve: 'puff', skirt: 'dress', bodice: true },
  wraps: { sleeve: 'short', skirt: 'sash', wrap: true, loose: true },
  furs: { sleeve: 'bare', skirt: 'kilt', bare: true },
  apron: { sleeve: 'rolled', skirt: 'apron' },
};

/** The numbers every part of the body is measured from. */
function measure(look) {
  const race = look.race || {};
  const F = FRAMES[look.frame] || FRAMES.average;
  const build = clamp(race.build || 1, 0.84, 1.24);
  const w = clamp(F.w * build, 0.78, 1.4);
  const fem = look.body === 'feminine', masc = look.body === 'masculine';
  const shK = fem ? 0.9 : masc ? 1.04 : 0.96, hipK = fem ? 1.1 : masc ? 0.95 : 1;
  return {
    w, d: F.d * (0.9 + build * 0.1), limb: clamp(F.limb * Math.sqrt(build), 0.82, 1.32), belly: F.belly || 1, chest: F.chest || 1,
    SH: 0.142 * w * shK, HP: 0.11 * w * hipK, DZ: 0.083 * F.d * (0.92 + build * 0.08), fem, masc,
  };
}

export function buildHero(fig, look) {
  const M = measure(look);
  fig.look = look;
  if (look.bones) return buildSkeleton(fig, look, M);
  if (look.robot || look.race?.robot) buildChassis(fig, look, M);
  else buildPerson(fig, look, M);
  buildHead(fig, look, M);
  buildCloak(fig, look, M);
  equip(fig, look, M);
  if (look.race?.tail || look.tail) buildTail(fig, look, M);
  if (look.wings) buildWings(fig, look, M);
  return fig;
}

function buildPerson(fig, look, M) {
  const { SH, HP, DZ, limb, belly } = M;
  const dress = DRESS[look.outfit] || DRESS.tunic;
  const arm = look.armour || 'none';
  const metal = look.metalPaint || PAL.steel;
  const leather = look.leather || PAL.leather;
  const garb = look.garb, trim = look.trim, skin = look.skin;
  const shirt = dress.bare ? skin : look.outfit === 'apron' ? PAL.linen : garb;
  const pants = dress.loose ? tint(garb, 0.12) : dress.bare ? leather : mixc(garb, '#241c18', 0.55);
  const boots = dress.loose ? PAL.linen : look.outfit === 'furs' ? PAL.fur : shade(leather, 0.2);
  const long = ['robe', 'dress'].includes(dress.skirt);
  const plate = arm === 'plate', half = arm === 'half' || plate;

  /* ---- legs ---- */
  for (const side of [-1, 1]) {
    const leg = fig.part(side < 0 ? 'legL' : 'legR', ({ s, m }) => {
      const lw = limb;
      s.bevel(0.1 * lw, 0.17, 0.104 * lw, pants, { y: -0.08, taper: 0.1, vary: 0.03 });
      s.bevel(0.088 * lw, 0.1, 0.094 * lw, pants, { y: -0.195 });
      if (dress.loose) s.bevel(0.104 * lw, 0.05, 0.106 * lw, PAL.linen, { y: -0.235 }); // wrapped ankles
      // a boot: shaft, a turned-down cuff, a rounded toe and a sole
      s.bevel(0.098 * lw, 0.1, 0.112 * lw, boots, { y: -0.27, z: 0.004 });
      s.bevel(0.094 * lw, 0.058, 0.08 * lw, boots, { y: -0.3, z: 0.062, b: 0.02 });
      s.bevel(0.104 * lw, 0.018, 0.17 * lw, shade(boots, 0.45), { y: -0.321, z: 0.026, b: 0.006 });
      if (!dress.loose) s.bevel(0.106 * lw, 0.026, 0.12 * lw, look.outfit === 'furs' ? PAL.furD : tint(boots, 0.14), { y: -0.218 });
      if (plate || arm === 'half') {
        // greaves and a knee cop (half plate keeps the boots, adds the cops)
        if (plate) m.bevel(0.098 * lw, 0.1, 0.106 * lw, metal, { y: -0.205, taper: -0.08 });
        m.sphere(0.04 * lw, metal, { y: -0.14, z: 0.035, sz: 0.7, seg: 8 });
        if (plate) m.bevel(0.1 * lw, 0.05, 0.1 * lw, shade(metal, 0.1), { y: -0.3, z: 0.065, b: 0.018 });
      }
      if (arm === 'mail' || arm === 'scale') s.bevel(0.104 * lw, 0.05, 0.108 * lw, shade(metal, 0.25), { y: -0.02 });
    });
    leg.position.set(side * HP * 0.52, LEG, 0);
  }

  /* ---- torso ---- */
  const torso = fig.part('torso', ({ s, m, g }) => {
    // the body: hips, waist, chest, a shoulder yoke, the neck
    s.bevel(2 * HP, 0.1, 2 * DZ, pants, { y: 0.02, vary: 0.02 });
    s.bevel(2 * HP * 0.94 * belly, 0.12, 2 * DZ * 0.98 * belly, shirt, { y: 0.115, vary: 0.02 });
    s.bevel(2 * SH * 0.86, 0.15, 2 * DZ * 1.04 * M.chest, shirt, { y: 0.21, taper: -0.14, vary: 0.02 });
    s.bevel(2 * SH * 1.02, 0.06, 2 * DZ * 0.94, shirt, { y: 0.272, b: 0.024 });
    if (M.fem && !half && !dress.bare) s.bevel(2 * SH * 0.6, 0.07, 0.04, shirt, { y: 0.205, z: DZ * 0.98, b: 0.018 });
    s.cyl(0.04, 0.047, 0.05, look.skin, { y: 0.305, seg: 8 });
    const front = DZ * 1.04 + 0.004;

    /* clothes */
    if (dress.bare) {
      // bare-chested under a harness: two crossed straps and a buckle
      for (const sd of [-1, 1]) s.bevel(0.03, 0.26, 0.012, leather, { x: 0, y: 0.17, z: front + 0.004, rz: sd * 0.62 });
      s.bevel(0.04, 0.04, 0.016, metal, { y: 0.17, z: front + 0.01 });
      s.sphere(0.03, shade(skin, 0.15), { x: -SH * 0.42, y: 0.235, z: front - 0.008, sy: 0.6, sz: 0.4, seg: 6 }); // chest
      s.sphere(0.03, shade(skin, 0.15), { x: SH * 0.42, y: 0.235, z: front - 0.008, sy: 0.6, sz: 0.4, seg: 6 });
    }
    if (dress.wrap) {
      // a crossed wrap: two panels overlapping over the chest, skin in the V
      s.bevel(0.05, 0.12, 0.01, skin, { y: 0.245, z: front - 0.002, taper: -0.6 });
      for (const sd of [-1, 1]) s.bevel(0.035, 0.2, 0.012, tint(garb, 0.1), { x: sd * 0.035, y: 0.2, z: front + 0.003, rz: -sd * 0.42 });
    }
    if (dress.bodice) {
      s.bevel(2 * SH * 0.82, 0.12, 2 * DZ * 1.06, shade(garb, 0.12), { y: 0.15, taper: -0.18 });
      for (let i = 0; i < 4; i++) s.bevel(0.04, 0.006, 0.006, trim, { y: 0.11 + i * 0.03, z: DZ * 1.08, rz: i % 2 ? 0.5 : -0.5 }); // lacing
    }
    if (dress.vest && arm === 'none') s.bevel(2 * SH * 0.9, 0.2, 2 * DZ * 1.08, leather, { y: 0.17, taper: -0.1 });
    if (!dress.bare && !dress.wrap && !half) {
      // a placket down the front and a trimmed collar
      s.bevel(0.016, 0.16, 0.008, shade(shirt, 0.22), { y: 0.19, z: front + 0.002 });
      s.torus(0.052, 0.012, trim, { y: 0.298, rx: Math.PI / 2 + 0.2, tseg: 12, rseg: 4 });
    }
    if (look.outfit === 'doublet') {
      for (let i = 0; i < 4; i++) m.ball(0.009, PAL.gold, { y: 0.13 + i * 0.045, z: front + 0.006, detail: 0 });
      s.torus(0.06, 0.016, PAL.cream, { y: 0.3, rx: Math.PI / 2, tseg: 12, rseg: 5 }); // a little ruff
    }
    if (dress.collar && arm !== 'plate') {
      // a standing collar and lapels
      for (const sd of [-1, 1]) {
        s.bevel(0.07, 0.07, 0.012, trim, { x: sd * 0.045, y: 0.325, z: -0.03, ry: sd * 0.7, rz: -sd * 0.15 });
        s.bevel(0.03, 0.12, 0.01, trim, { x: sd * 0.04, y: 0.23, z: front + 0.004, rz: sd * 0.3 });
      }
    }

    /* below the belt */
    const skirtTop = 0.07;
    if (dress.skirt === 'tunic' || dress.skirt === 'short') {
      const h = dress.skirt === 'tunic' ? 0.12 : 0.07;
      s.bevel(2 * HP * 1.12, h, 2 * DZ * 1.16, shirt === skin ? garb : shirt, { y: skirtTop - h / 2, taper: 0.16, vary: 0.03 });
      s.bevel(2 * HP * 1.2, 0.018, 2 * DZ * 1.24, trim, { y: skirtTop - h + 0.008 });
    } else if (dress.skirt === 'coat') {
      // a coat to the knee, open down the front
      for (const sd of [-1, 1]) s.bevel(HP * 1.1, 0.24, 2 * DZ * 1.22, garb, { x: sd * HP * 0.58, y: skirtTop - 0.12, taper: 0.06, vary: 0.03 });
      s.bevel(2 * HP * 1.18, 0.018, 2 * DZ * 1.3, trim, { y: skirtTop - 0.235 });
      s.bevel(2 * SH * 0.92, 0.2, 2 * DZ * 1.1, garb, { y: 0.17, taper: -0.12 });
      s.bevel(0.03, 0.2, 0.01, shirt === garb ? PAL.linen : shirt, { y: 0.17, z: DZ * 1.12 }); // the shirt in the opening
    } else if (long) {
      // a robe or gown to the ankle, flaring; the legs walk inside it
      const flare = dress.skirt === 'dress' ? 0.5 : 0.36;
      s.bevel(2 * HP * (1.25 + flare), 0.33, 2 * DZ * (1.3 + flare * 0.8), garb, { y: skirtTop - 0.165, taper: flare * 0.55, vary: 0.03 });
      s.bevel(2 * HP * (1.3 + flare), 0.024, 2 * DZ * (1.36 + flare * 0.8), trim, { y: skirtTop - 0.315 });
      if (dress.skirt === 'robe') s.bevel(2 * SH * 0.9, 0.16, 2 * DZ * 1.08, garb, { y: 0.2, taper: -0.12 });
    } else if (dress.skirt === 'kilt') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        s.bevel(0.07, 0.11, 0.02, i % 2 ? PAL.fur : PAL.furD, { x: Math.sin(a) * HP * 0.98, z: Math.cos(a) * DZ * 1.15, y: -0.02, ry: a, rx: 0.12, vary: 0.05 });
      }
    } else if (dress.skirt === 'apron') {
      s.bevel(2 * HP * 1.08, 0.08, 2 * DZ * 1.1, pants, { y: 0.02 });
    } else if (dress.skirt === 'sash') {
      // a sash knotted at the hip, the tails hanging
      s.bevel(0.035, 0.12, 0.014, trim, { x: HP * 0.6, y: 0.0, z: DZ * 1.1, rz: 0.15 });
      s.bevel(0.03, 0.1, 0.014, trim, { x: HP * 0.75, y: 0.01, z: DZ * 1.08, rz: -0.2 });
    }
    if (look.outfit === 'apron') {
      const ac = look.leatherApron ? leather : shade(PAL.linen, 0.04);
      s.bevel(2 * SH * 0.62, 0.12, 0.016, ac, { y: 0.2, z: front + 0.004 });
      s.bevel(2 * HP * 1.05, 0.26, 0.018, ac, { y: -0.06, z: DZ * 1.18, taper: -0.1 });
      for (const sd of [-1, 1]) s.bevel(0.012, 0.09, 0.01, shade(ac, 0.2), { x: sd * 0.05, y: 0.29, z: DZ * 0.8, rz: sd * 0.3 });
    }
    if (dress.tabard) {
      s.bevel(2 * SH * 0.62, 0.48, 0.016, trim === garb ? shade(garb, 0.2) : tint(garb, 0.08), { y: 0.05, z: front + 0.008 });
      s.bevel(2 * SH * 0.66, 0.02, 0.02, trim, { y: -0.185, z: front + 0.008 });
    }
    if (dress.stole) for (const sd of [-1, 1]) s.bevel(0.026, 0.42, 0.012, trim, { x: sd * 0.05, y: 0.09, z: front + 0.016 });

    /* armour */
    if (arm === 'leather') {
      s.bevel(2 * SH * 0.92, 0.19, 2 * DZ * 1.12, leather, { y: 0.19, taper: -0.12 });
      for (const y of [0.13, 0.19, 0.25]) s.bevel(2 * SH * 0.7, 0.006, 0.006, tint(leather, 0.2), { y, z: DZ * 1.15 }); // stitched seams
      s.bevel(0.03, 0.3, 0.012, shade(leather, 0.2), { y: 0.17, z: DZ * 1.16, rz: 0.75 }); // a strap across
    } else if (arm === 'mail' || arm === 'scale') {
      const mc = arm === 'scale' ? metal : shade(metal, 0.18);
      m.bevel(2 * SH * 0.9, 0.2, 2 * DZ * 1.1, mc, { y: 0.19, taper: -0.12 });
      m.bevel(2 * HP * 1.16, 0.12, 2 * DZ * 1.2, mc, { y: -0.01, taper: 0.12 });
      // rows of rings (or scales) catching the light
      for (let i = 0; i < 6; i++) m.bevel(2 * HP * (1.0 + i * 0.03) + (i > 2 ? 0.05 : 0), 0.008, 0.006, tint(mc, 0.18), { y: -0.05 + i * 0.05, z: DZ * (1.16 + (i > 2 ? 0.02 : 0)) });
    }
    if (half) {
      // a breastplate with a centre ridge, a gorget, and (full plate) tassets
      m.bevel(2 * SH * 0.92, 0.19, 2 * DZ * 1.18, metal, { y: 0.195, taper: -0.1, b: 0.03 });
      m.bevel(0.016, 0.16, 0.02, tint(metal, 0.2), { y: 0.2, z: DZ * 1.2 });
      m.cyl(0.065, 0.075, 0.04, shade(metal, 0.08), { y: 0.3, seg: 10 });
      if (plate) for (const sd of [-1, 0, 1]) m.bevel(0.07, 0.09, 0.02, shade(metal, 0.1), { x: sd * 0.07, y: -0.01, z: DZ * 1.12, rx: 0.12, b: 0.01 });
      if (!plate) s.bevel(2 * HP * 1.14, 0.08, 2 * DZ * 1.18, shirt === skin ? garb : shirt, { y: 0.0, taper: 0.12 });
    }

    /* the belt: a band, a buckle, and a pouch on the hip */
    if (dress.skirt !== 'sash') {
      const bw = 2 * HP * (long ? 1.0 : 1.06), bd = 2 * DZ * (long ? 1.04 : 1.1);
      s.bevel(bw, 0.032, bd, look.outfit === 'robe' || look.outfit === 'vestments' ? trim : leather, { y: 0.072, b: 0.008 });
      m.bevel(0.034, 0.028, 0.012, PAL.brass, { y: 0.072, z: bd / 2 + 0.004, b: 0.005 });
      s.bevel(0.016, 0.014, 0.014, shade(leather, 0.4), { y: 0.072, z: bd / 2 + 0.008 });
    }
    if (look.spark || look.extras?.includes('pendant')) {
      // a pendant on a cord: a plain gem in a setting
      m.torus(0.05, 0.004, PAL.goldD, { y: 0.27, z: 0.012, rx: Math.PI / 2 - 0.5, tseg: 10, rseg: 3 });
      m.bevel(0.03, 0.036, 0.012, PAL.gold, { y: 0.225, z: front + 0.01, b: 0.006 });
      g.ball(0.011, look.trim || PAL.arcane, { y: 0.225, z: front + 0.018, detail: 0 });
    }
    if (look.markings) s.bevel(0.05, 0.012, 0.01, shade(skin, 0.35), { x: -SH * 0.4, y: 0.2, z: front });
  });
  torso.position.y = LEG;

  /* ---- arms ---- */
  for (const side of [-1, 1]) {
    const L = side < 0;
    const armPart = fig.part(L ? 'armL' : 'armR', ({ s, m }) => {
      const l = limb;
      const sleeve = dress.sleeve;
      const top = sleeve === 'bare' ? skin : shirt;
      const fore = sleeve === 'full' || sleeve === 'wide' ? shirt : skin;
      s.sphere(0.052 * l, top, { seg: 8, sy: 0.92 });
      s.bevel(0.072 * l, 0.13, 0.074 * l, sleeve === 'short' || sleeve === 'puff' || sleeve === 'rolled' ? shirt : top, { y: -0.075, taper: 0.1 });
      if (sleeve === 'puff') s.sphere(0.06 * l, shirt, { y: -0.04, seg: 8, sy: 0.85 });
      s.bevel(0.066 * l, 0.11, 0.068 * l, fore, { y: -0.18, taper: 0.06 });
      if (sleeve === 'wide') s.bevel(0.1 * l, 0.07, 0.1 * l, shirt, { y: -0.21, taper: -0.3 });
      if (sleeve === 'rolled') s.bevel(0.08 * l, 0.03, 0.08 * l, shirt, { y: -0.135 });
      if (sleeve === 'short') s.bevel(0.08 * l, 0.03, 0.08 * l, trim, { y: -0.13 });
      const cuffC = sleeve === 'wide' ? trim : sleeve === 'full' ? trim : null;
      if (cuffC) s.bevel(sleeve === 'wide' ? 0.106 * l : 0.074 * l, 0.022, sleeve === 'wide' ? 0.106 * l : 0.076 * l, cuffC, { y: sleeve === 'wide' ? -0.245 : -0.228 });
      // the hand: a mitten with knuckles and a thumb
      s.bevel(0.056, 0.058, 0.05, skin, { y: -0.262, b: 0.016 });
      s.bevel(0.054, 0.022, 0.046, shade(skin, 0.06), { y: -0.292, z: 0.004, b: 0.008 });
      s.bevel(0.018, 0.034, 0.02, skin, { x: -side * 0.03, y: -0.258, z: 0.016, rz: side * 0.45, b: 0.006 });
      // armour on the arm
      if (plate || arm === 'half') {
        m.sphere(0.072 * l, metal, { y: 0.008, sy: 0.78, seg: 9 });
        m.bevel(0.13 * l, 0.02, 0.1 * l, shade(metal, 0.12), { y: -0.04, x: side * 0.012, rz: side * 0.25 });
      }
      if (plate) {
        m.bevel(0.074 * l, 0.09, 0.076 * l, metal, { y: -0.185, taper: -0.1 });
        m.bevel(0.064, 0.064, 0.058, shade(metal, 0.1), { y: -0.264, b: 0.016 }); // gauntlet
      } else if (arm === 'mail' || arm === 'scale') {
        m.bevel(0.076 * l, 0.11, 0.078 * l, shade(metal, 0.18), { y: -0.07, taper: 0.1 });
      }
      if (look.extras?.includes('bracers') || arm === 'leather') {
        s.bevel(0.074 * l, 0.06, 0.076 * l, shade(leather, 0.1), { y: -0.2, taper: 0.05 });
        s.bevel(0.076 * l, 0.008, 0.078 * l, tint(leather, 0.25), { y: -0.2 });
      }
      if (look.outfit === 'wraps') s.bevel(0.062, 0.04, 0.056, PAL.linen, { y: -0.245 }); // hand wraps
      if (look.outfit === 'furs' && side < 0 && !half) {
        s.sphere(0.07 * l, PAL.fur, { y: 0.01, sy: 0.7, seg: 8, vary: 0.05 }); // a fur pauldron
      }
      if (look.extras?.includes('pauldron') && side < 0 && !half) {
        m.sphere(0.07 * l, metal, { y: 0.008, sy: 0.75, seg: 8 });
        s.bevel(0.012, 0.13, 0.012, leather, { x: 0.02, y: -0.01, z: 0.02, rz: -0.9 });
      }
    }, fig.parts.torso);
    armPart.position.set(side * M.SH, 0.262, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.272, 0.006);
    armPart.add(hand);
    fig.parts[L ? 'handL' : 'handR'] = hand;
  }
}

/* ======================= gearforged ======================= */

function buildChassis(fig, look, M) {
  const { SH, HP, DZ, limb } = M;
  const plate = look.skin, joint = shade(plate, 0.5), seam = look.trim || PAL.frost, glow = look.eyes || PAL.frost;
  for (const side of [-1, 1]) {
    const leg = fig.part(side < 0 ? 'legL' : 'legR', ({ m, g }) => {
      const l = limb;
      m.bevel(0.1 * l, 0.15, 0.1 * l, plate, { y: -0.085, taper: 0.12 });
      m.sphere(0.04 * l, joint, { y: -0.17, seg: 8 });
      m.bevel(0.088 * l, 0.11, 0.092 * l, plate, { y: -0.235, taper: -0.1 });
      m.bevel(0.014, 0.08, 0.01, seam, { y: -0.235, z: 0.05 * l });
      m.bevel(0.104 * l, 0.045, 0.16 * l, shade(plate, 0.25), { y: -0.305, z: 0.025, b: 0.012 });
      g.bevel(0.06 * l, 0.008, 0.006, glow, { y: -0.29, z: 0.105 * l });
    });
    leg.position.set(side * HP * 0.55, LEG, 0);
  }
  const torso = fig.part('torso', ({ s, m, g }) => {
    m.bevel(2 * HP, 0.09, 2 * DZ, shade(plate, 0.2), { y: 0.03 });
    for (let i = 0; i < 3; i++) m.cyl(0.082 * M.w, 0.082 * M.w, 0.02, joint, { y: 0.09 + i * 0.028, seg: 10 });
    m.bevel(2 * SH * 0.9, 0.17, 2 * DZ * 1.12, plate, { y: 0.2, taper: -0.16, b: 0.03 });
    m.bevel(2 * SH * 1.04, 0.05, 2 * DZ, shade(plate, 0.12), { y: 0.282, b: 0.02 });
    m.cyl(0.035, 0.04, 0.05, joint, { y: 0.31, seg: 8 });
    const front = DZ * 1.12;
    // the core: a glowing lens in a ringed housing, rivets either side
    m.cyl(0.042, 0.042, 0.02, shade(plate, 0.3), { y: 0.2, z: front, rx: Math.PI / 2, seg: 12 });
    g.cyl(0.03, 0.03, 0.012, glow, { y: 0.2, z: front + 0.008, rx: Math.PI / 2, seg: 12 });
    m.torus(0.04, 0.007, seam, { y: 0.2, z: front + 0.01, tseg: 14, rseg: 4 });
    for (const sd of [-1, 1]) {
      m.bevel(0.012, 0.13, 0.01, seam, { x: sd * 0.075 * M.w, y: 0.2, z: front - 0.004 });
      for (const dy of [-0.05, 0.05]) m.ball(0.008, tint(plate, 0.3), { x: sd * 0.105 * M.w, y: 0.2 + dy, z: front - 0.008, detail: 0 });
    }
    // a cloth tabard and a belt in the hero's own colours
    s.bevel(0.11, 0.2, 0.012, look.garb, { y: -0.03, z: DZ * 1.04, taper: -0.15 });
    s.bevel(0.12, 0.016, 0.014, seam, { y: -0.125, z: DZ * 1.04 });
    s.bevel(2 * HP * 1.04, 0.03, 2 * DZ * 1.06, look.leather || PAL.leatherD, { y: 0.07 });
    m.bevel(0.03, 0.026, 0.01, PAL.brass, { y: 0.07, z: DZ * 1.06 + 0.004 });
  });
  torso.position.y = LEG;
  for (const side of [-1, 1]) {
    const L = side < 0;
    const armPart = fig.part(L ? 'armL' : 'armR', ({ m }) => {
      const l = limb;
      m.sphere(0.058 * l, shade(plate, 0.1), { seg: 8, sy: 0.85 });
      m.bevel(0.07 * l, 0.11, 0.072 * l, plate, { y: -0.08, taper: 0.1 });
      m.sphere(0.034 * l, joint, { y: -0.145, seg: 7 });
      m.bevel(0.068 * l, 0.1, 0.07 * l, plate, { y: -0.2, taper: -0.12 });
      m.bevel(0.072 * l, 0.014, 0.074 * l, seam, { y: -0.22 });
      m.bevel(0.054, 0.04, 0.042, shade(plate, 0.2), { y: -0.262, b: 0.01 });
      for (const fx of [-0.016, 0, 0.016]) m.bevel(0.012, 0.03, 0.014, shade(plate, 0.35), { x: fx, y: -0.292, b: 0.004 });
      m.bevel(0.012, 0.024, 0.014, shade(plate, 0.35), { x: -side * 0.03, y: -0.262, z: 0.014, rz: side * 0.5, b: 0.004 });
    }, fig.parts.torso);
    armPart.position.set(side * M.SH, 0.262, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.272, 0.006);
    armPart.add(hand);
    fig.parts[L ? 'handL' : 'handR'] = hand;
  }
}

/* ======================= skeletons ======================= */

function buildSkeleton(fig, look) {
  const bone = PAL.bone, dark = PAL.boneD;
  for (const side of [-1, 1]) {
    const leg = fig.part(side < 0 ? 'legL' : 'legR', ({ s }) => {
      s.bevel(0.03, 0.16, 0.03, bone, { y: -0.08 });
      s.sphere(0.025, dark, { y: -0.165, seg: 6 });
      s.bevel(0.026, 0.13, 0.026, bone, { y: -0.24 });
      s.bevel(0.05, 0.022, 0.09, bone, { y: -0.318, z: 0.025, b: 0.008 });
    });
    leg.position.set(side * 0.055, LEG, 0);
  }
  const torso = fig.part('torso', ({ s }) => {
    s.bevel(0.16, 0.06, 0.08, bone, { y: 0.02, taper: -0.2 }); // pelvis
    s.cyl(0.016, 0.016, 0.24, dark, { y: 0.15, seg: 5 });   // spine
    for (let i = 0; i < 4; i++) s.torus(0.07 - i * 0.004, 0.011, bone, { y: 0.14 + i * 0.038, rx: Math.PI / 2, sx: 1.2, tseg: 10, rseg: 3 });
    s.bevel(0.24, 0.03, 0.06, bone, { y: 0.27, b: 0.01 }); // collarbones
    s.cyl(0.018, 0.02, 0.05, dark, { y: 0.3, seg: 5 });
  });
  torso.position.y = LEG;
  for (const side of [-1, 1]) {
    const L = side < 0;
    const a = fig.part(L ? 'armL' : 'armR', ({ s }) => {
      s.sphere(0.03, bone, { seg: 6 });
      s.bevel(0.026, 0.12, 0.026, bone, { y: -0.075 });
      s.sphere(0.02, dark, { y: -0.14, seg: 5 });
      s.bevel(0.022, 0.1, 0.022, bone, { y: -0.2 });
      s.bevel(0.04, 0.045, 0.026, bone, { y: -0.262, b: 0.008 });
    }, fig.parts.torso);
    a.position.set(side * 0.125, 0.262, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.272, 0.006);
    a.add(hand);
    fig.parts[L ? 'handL' : 'handR'] = hand;
  }
  // the skull: a cranium, a narrow jaw, dark sockets with a coal in each
  const head = fig.part('head', ({ s, g }) => {
    s.sphere(R * 0.95, bone, { y: R, seg: 12 });
    s.bevel(R * 1.1, R * 0.5, R * 1.1, bone, { y: R * 0.35, z: R * 0.18, taper: 0.2 });
    for (const sd of [-1, 1]) {
      s.sphere(R * 0.26, PAL.ink, { x: sd * R * 0.38, y: R * 0.92, z: R * 0.78, sz: 0.5, seg: 8 });
      g.ball(R * 0.1, look.eyes || PAL.ember2, { x: sd * R * 0.38, y: R * 0.92, z: R * 0.86, detail: 0 });
    }
    s.bevel(R * 0.14, R * 0.18, 0.02, PAL.ink, { y: R * 0.62, z: R * 0.94, taper: -0.4 });
    for (let i = -2; i <= 2; i++) s.bevel(R * 0.1, R * 0.12, 0.014, PAL.cream, { x: i * R * 0.12, y: R * 0.3, z: R * 0.74 });
  }, fig.parts.torso);
  head.position.y = 0.32;
  equip(fig, look);
  return fig;
}

/* ======================= the head ======================= */

const FACE_SHAPE = {
  oval: { fx: 1, fy: 1.03, fz: 1, jaw: 0.86 },
  round: { fx: 1.07, fy: 0.98, fz: 1.02, jaw: 0.96 },
  square: { fx: 1.04, fy: 1, fz: 1, jaw: 1.04 },
  long: { fx: 0.94, fy: 1.1, fz: 0.98, jaw: 0.8 },
  heart: { fx: 1.03, fy: 1.02, fz: 1, jaw: 0.72 },
};

// Headwear that sits over the top of the head (and hides what grows there).
const COVERS = new Set(['hood', 'helm', 'greathelm', 'horned', 'wizard', 'widebrim', 'cap', 'bandana', 'headwrap']);

function buildHead(fig, look, M) {
  const race = look.race || {};
  const robot = look.robot || race.robot;
  const sh = FACE_SHAPE[look.face] || FACE_SHAPE.oval;
  const jawW = clamp((race.jaw ?? 0.5) * 2 * sh.jaw * (M.fem ? 0.88 : M.masc ? 1.06 : 1), 0.6, 1.25);
  const H = { R, fx: sh.fx, fy: sh.fy, fz: sh.fz, C: R * 1.02, jawW };
  H.rx = R * H.fx; H.ry = R * H.fy; H.rz = R * H.fz;
  // A point on the face: the front of the cranium or the jaw, whichever
  // stands further out.
  H.z = (x, y, out = 0) => {
    const a = 1 - (x / H.rx) ** 2 - ((y - H.C) / H.ry) ** 2;
    const jx = R * 0.8 * jawW, jy = R * 0.6, jz = R * 0.84, jc = H.C - R * 0.4;
    const b = 1 - (x / jx) ** 2 - ((y - jc) / jy) ** 2;
    return Math.max(a > 0 ? H.rz * Math.sqrt(a) : 0, b > 0 ? jz * Math.sqrt(b) + R * 0.05 : 0) + out;
  };
  H.turn = (x) => Math.asin(clamp(x / H.rx, -0.9, 0.9)) * 0.85;

  const head = fig.part('head', (k) => {
    if (robot) robotHead(k, look, H);
    else {
      face(k, look, H, M);
      hairAndBeard(k, look, H, M);
      raceFeatures(k, look, H);
    }
    hat(k, look, H, M);
  }, fig.parts.torso);
  head.position.y = 0.318;
}

function face({ s, k, g }, look, H, M) {
  const race = look.race || {};
  const skin = look.skin, C = H.C;
  // skull and jaw in one smooth skin
  k.sphere(R, skin, { y: C, sx: H.fx, sy: H.fy, sz: H.fz, seg: 16 });
  k.sphere(R * 0.8, skin, { y: C - R * 0.4, z: R * 0.05, sx: H.jawW, sy: 0.75, sz: 1.05, seg: 14 });
  // cheeks with a touch of colour, as a painter would
  const blush = mixc(skin, '#c8546a', 0.18);
  if (!race.snout && !race.bull && !race.cat) for (const sd of [-1, 1]) {
    const x = sd * R * 0.52, y = C - R * 0.32;
    k.sphere(R * 0.17, blush, { x, y, z: H.z(x, y, -R * 0.08), sz: 0.5, ry: H.turn(x), seg: 8 });
  }

  /* eyes: whites, a coloured iris, a pupil and a glint, under a brow */
  const shape = look.eyeShape || 'round';
  const ex = R * (shape === 'wide' ? 0.47 : 0.41), ey = C - R * 0.06;
  const eh = shape === 'narrow' ? 0.62 : shape === 'almond' ? 0.8 : 1.08, ew = shape === 'almond' ? 1.15 : 1;
  const glow = race.glowEyes;
  for (const sd of [-1, 1]) {
    const x = sd * ex, ry = H.turn(x), z = H.z(x, ey);
    const tilt = shape === 'almond' ? sd * 0.18 : 0;
    s.sphere(R * 0.2, PAL.eyeWhite, { x, y: ey, z: z - R * 0.02, sx: ew, sy: eh, sz: 0.5, ry, rz: tilt, seg: 10 });
    (glow ? g : s).sphere(R * 0.135, look.eyes, { x: x - sd * R * 0.01, y: ey - R * 0.01, z: z + R * 0.055, sx: ew, sy: Math.min(1.1, eh * 1.1), sz: 0.4, ry, seg: 8 });
    if (race.slit) s.bevel(R * 0.04, R * 0.2 * eh, R * 0.03, PAL.pupil, { x: x - sd * R * 0.01, y: ey - R * 0.01, z: z + R * 0.1, ry });
    else if (!glow) s.sphere(R * 0.07, PAL.pupil, { x: x - sd * R * 0.01, y: ey - R * 0.01, z: z + R * 0.09, sz: 0.4, ry, seg: 6 });
    g.ball(R * 0.035, '#ffffff', { x: x + R * 0.04, y: ey + R * 0.05, z: z + R * 0.12, detail: 0 });
    if (M.fem) s.bevel(R * 0.36 * ew, R * 0.045, R * 0.05, PAL.ink, { x: x + sd * R * 0.03, y: ey + R * 0.17 * eh, z: z + R * 0.02, ry, rz: -sd * 0.18 + tilt, b: R * 0.012 });
  }

  /* brows: their style, and the mood tilts them */
  const browC = race.hairless || look.hairStyle === 'bald' ? shade(skin, 0.4) : shade(look.hair, 0.05);
  const bs = look.brows || 'soft';
  if (bs !== 'none' && !race.snout) for (const sd of [-1, 1]) {
    const x = sd * ex, y = ey + R * (0.3 + (shape === 'narrow' ? -0.04 : 0));
    const mood = look.mood;
    let rz = sd * (mood === 'stern' ? 0.32 : mood === 'smirk' && sd > 0 ? -0.25 : bs === 'arched' ? -0.18 : -0.05);
    if (mood === 'calm' || mood === 'smile') rz *= 0.5;
    const th = bs === 'heavy' ? 0.1 : bs === 'soft' ? 0.05 : 0.065;
    s.bevel(R * 0.36, R * th, R * 0.08, browC, { x, y, z: H.z(x, y, R * 0.01), ry: H.turn(x), rz, b: R * 0.02 });
  }

  /* nose and mouth (snouts and muzzles bring their own) */
  if (!race.snout && !race.bull && !race.cat) {
    const ny = C - R * 0.3, nz = H.z(0, ny);
    const nose = race.bigNose && look.nose === 'straight' ? 'broad' : look.nose || 'straight';
    const nc = shade(skin, 0.08);
    if (nose === 'button') k.sphere(R * 0.12, nc, { y: ny, z: nz, sz: 0.8, seg: 8 });
    else if (nose === 'broad') k.sphere(R * 0.15, nc, { y: ny - R * 0.02, z: nz, sx: 1.3, sz: 0.85, seg: 8 });
    else if (nose === 'hooked') s.bevel(R * 0.15, R * 0.34, R * 0.24, nc, { y: ny + R * 0.04, z: nz + R * 0.02, rx: -0.35, taper: 0.4, b: R * 0.04 });
    else s.bevel(R * 0.15, R * 0.3, R * 0.2, nc, { y: ny + R * 0.03, z: nz, rx: -0.25, taper: 0.45, b: R * 0.04 });
    mouth({ s }, look, H, C - R * 0.62);
  }

  /* marks */
  const mark = look.mark;
  const scar = mixc(skin, '#f0d8d0', 0.45);
  if (mark === 'freckles') {
    for (let i = 0; i < 10; i++) {
      const sd = i % 2 ? 1 : -1, x = sd * R * (0.32 + ((i * 37) % 5) * 0.06), y = C - R * (0.18 + ((i * 53) % 4) * 0.06);
      s.ball(R * 0.025, shade(skin, 0.35), { x, y, z: H.z(x, y, R * 0.005), detail: 0 });
    }
  } else if (mark === 'scar') {
    const x = R * 0.5, y = C - R * 0.25;
    s.bevel(R * 0.06, R * 0.36, R * 0.03, scar, { x, y, z: H.z(x, y, -R * 0.005), ry: H.turn(x), rz: 0.5 });
  } else if (mark === 'eyescar') {
    const x = -ex, y = ey;
    s.bevel(R * 0.05, R * 0.62, R * 0.03, scar, { x: x - R * 0.04, y, z: H.z(x, y, R * 0.07), ry: H.turn(x), rz: 0.2 });
  } else if (mark === 'warpaint') {
    const c = look.trim && look.trim !== look.skin ? look.trim : PAL.crimson;
    for (const sd of [-1, 1]) {
      const x = sd * R * 0.62, y = ey - R * 0.05;
      s.bevel(R * 0.34, R * 0.08, R * 0.04, c, { x, y, z: H.z(x, y, -R * 0.01), ry: H.turn(x), rz: sd * 0.12 });
      s.bevel(R * 0.3, R * 0.06, R * 0.04, c, { x: x * 0.95, y: y - R * 0.16, z: H.z(x * 0.95, y - R * 0.16, -R * 0.01), ry: H.turn(x), rz: sd * 0.12 });
    }
  } else if (mark === 'tattoo') {
    const c = shade(look.trim || PAL.navy, 0.3);
    for (let i = 0; i < 3; i++) {
      const x = R * (0.6 + i * 0.08), y = C + R * (0.25 - i * 0.22);
      s.bevel(R * 0.05, R * 0.22, R * 0.03, c, { x, y, z: H.z(x, y, -R * 0.01), ry: H.turn(x), rz: 0.4 - i * 0.4 });
    }
  } else if (mark === 'eyepatch') {
    const x = R * 0.41;
    s.sphere(R * 0.24, PAL.ink, { x, y: ey, z: H.z(x, ey, R * 0.0), sz: 0.4, ry: H.turn(x), seg: 8 });
    s.torus(R * 1.01, R * 0.03, PAL.ink, { y: ey + R * 0.08, sx: H.fx, sy: H.fz, rx: Math.PI / 2 + 0.22, tseg: 20, rseg: 3 });
  } else if (mark === 'mask') {
    // a cloth mask over the nose and mouth, knotted behind
    const mc = shade(look.garb || PAL.charcoal, 0.25);
    s.sphere(R * 0.86, mc, { y: C - R * 0.4, z: R * 0.1, sx: H.jawW * 1.04, sy: 0.72, sz: 1.08, theta: 1.5, rx: Math.PI, seg: 12 });
    s.bevel(R * 0.2, R * 0.3, R * 0.1, shade(mc, 0.2), { y: C - R * 0.25, z: -R * 0.98, rx: 0.4 });
  }
  if (race.markings) for (const sd of [-1, 1]) {
    const x = sd * R * 0.6, y = C + R * 0.35;
    s.bevel(R * 0.08, R * 0.3, R * 0.03, shade(skin, 0.4), { x, y, z: H.z(x, y, -R * 0.01), ry: H.turn(x), rz: sd * 0.3 });
  }

  /* ears */
  const ears = race.ears || 'round';
  for (const sd of [-1, 1]) {
    const x = sd * H.rx * 0.95, y = C - R * 0.08;
    if (ears === 'round') {
      k.sphere(R * 0.18, skin, { x, y, z: -R * 0.02, sx: 0.55, sy: 1, sz: 0.8, seg: 8 });
      s.sphere(R * 0.09, shade(skin, 0.2), { x: x + sd * R * 0.04, y, z: -R * 0.01, sx: 0.4, sz: 0.6, seg: 5 });
    } else if (ears === 'point' || ears === 'halfpoint') {
      const len = ears === 'point' ? R * 0.62 : R * 0.36;
      k.cone(R * 0.14, len, skin, { x: x + sd * len * 0.38, y: y + len * 0.22, z: -R * 0.05, rz: -sd * 1.15, sz: 0.45, seg: 6 });
      k.sphere(R * 0.15, skin, { x, y, z: -R * 0.02, sx: 0.55, sz: 0.8, seg: 7 });
    } else if (ears === 'frill') {
      for (let i = 0; i < 3; i++) s.cone(R * 0.08, R * (0.5 - i * 0.1), shade(skin, 0.1 + i * 0.05), { x: x + sd * R * 0.1, y: y + R * (0.15 - i * 0.15), z: -R * 0.3, rz: -sd * (1.2 + i * 0.2), rx: -0.6, sz: 0.4, seg: 4 });
    }
    // cat ears sit on top (raceFeatures)
  }
}

function mouth({ s }, look, H, y) {
  const lip = '#4a2018', z = H.z(0, y, -R * 0.005);
  const m = look.mood;
  if (m === 'grin') {
    s.bevel(R * 0.42, R * 0.17, R * 0.06, lip, { y: y - R * 0.02, z, taper: -0.25, b: R * 0.05 });
    s.bevel(R * 0.36, R * 0.06, R * 0.04, PAL.cream, { y: y + R * 0.03, z: z + R * 0.012 });
  } else if (m === 'smile') {
    s.bevel(R * 0.22, R * 0.05, R * 0.04, lip, { y: y - R * 0.02, z });
    for (const sd of [-1, 1]) s.bevel(R * 0.13, R * 0.05, R * 0.04, lip, { x: sd * R * 0.15, y: y + R * 0.0, z: z - R * 0.01, rz: sd * 0.55, ry: sd * 0.2 });
  } else if (m === 'stern') {
    s.bevel(R * 0.3, R * 0.05, R * 0.04, lip, { y, z });
    for (const sd of [-1, 1]) s.bevel(R * 0.08, R * 0.045, R * 0.04, lip, { x: sd * R * 0.17, y: y - R * 0.025, z: z - R * 0.01, rz: -sd * 0.6 });
  } else if (m === 'smirk') {
    s.bevel(R * 0.26, R * 0.05, R * 0.04, lip, { x: R * 0.03, y, z, rz: 0.22 });
  } else {
    s.bevel(R * 0.26, R * 0.05, R * 0.04, lip, { y, z });
  }
}

/* ---------------- hair ---------------- */

function hairAndBeard({ s }, look, H, M) {
  const race = look.race || {};
  const C = H.C, hc = look.hair, hcD = shade(hc, 0.2);
  const hatOn = COVERS.has(look.hat);
  const full = look.hat === 'greathelm';
  const st = race.hairless ? 'bald' : look.hairStyle || 'crop';
  const cap = (r = 1.07, theta = 1.45, tilt = -0.42, c = hc) => s.sphere(R * r, c, { y: C + R * 0.02, sx: H.fx, sy: H.fy, sz: H.fz, theta, rx: tilt, seg: 14, vary: 0.03 });
  const tuft = (x, y, z, w, h, d, o = {}) => s.bevel(R * w, R * h, R * d, o.c || hc, { x: R * x, y: C + R * y, z: R * z, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, taper: o.taper || 0, vary: 0.04 });
  const shaved = mixc(hc, look.skin, 0.55);

  if (!hatOn) {
    switch (st) {
      case 'shaved': cap(1.015, 1.5, -0.4, shaved); break;
      case 'crop': cap(1.06, 1.42); tuft(0.15, 0.68, 0.62, 0.9, 0.22, 0.4, { rx: 0.55, taper: 0.2 }); break;
      case 'swept':
        cap(1.06, 1.45);
        tuft(0.1, 0.84, 0.18, 1.6, 0.34, 1.3, { rz: 0.16, rx: -0.15, taper: 0.25 });
        tuft(-0.62, 0.55, 0.5, 0.5, 0.42, 0.38, { rz: 0.5, rx: 0.4 }); break;
      case 'quiff':
        cap(1.06, 1.45);
        tuft(0, 1.0, 0.45, 1.0, 0.46, 0.75, { rx: 0.5, taper: 0.25 }); break;
      case 'undercut':
        cap(1.02, 1.62, -0.4, shaved);
        s.sphere(R * 1.12, hc, { y: C + R * 0.06, z: -R * 0.04, sx: H.fx * 0.98, sy: H.fy * 1.04, sz: H.fz, theta: 0.98, rx: -0.3, seg: 12, vary: 0.03 });
        tuft(0.25, 0.86, 0.45, 0.9, 0.3, 0.6, { rx: 0.35, rz: -0.2, taper: 0.3 }); break;
      case 'mohawk':
        cap(1.015, 1.55, -0.4, shaved);
        for (let i = 0; i < 7; i++) {
          const a = -0.75 + i * 0.36; // from the brow over the crown to the nape
          const dy = Math.cos(a), dz = Math.sin(-a);
          s.bevel(R * 0.24, R * (0.7 - Math.abs(i - 2.5) * 0.08), R * 0.42, i % 2 ? hc : hcD, { y: C + dy * R * 1.0, z: dz * R * 1.0, rx: -a, taper: 0.55, b: R * 0.05 });
        }
        break;
      case 'bob':
        cap(1.08, 1.5);
        tuft(0, 0.5, 0.74, 1.5, 0.3, 0.3, { rx: 0.45 }); break;
      case 'long': case 'braids': case 'ponytail': case 'locs': cap(1.07, 1.48); tuft(0.2, 0.62, 0.66, 1.0, 0.24, 0.36, { rx: 0.5, rz: -0.15 }); break;
      case 'highpony': cap(1.05, 1.42, -0.35); break;
      case 'bun': cap(1.06, 1.45); break;
      case 'topknot': cap(1.03, 1.35, -0.4, M.masc ? shaved : hc); break;
      case 'wild':
        cap(1.1, 1.55);
        for (let i = 0; i < 11; i++) {
          const az = -2.3 + (i / 10) * 4.6, el = 0.35 + ((i * 7) % 3) * 0.28;
          const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el) - 0.35;
          s.cone(R * 0.22, R * 0.62, i % 3 ? hc : hcD, { x: dx * R * H.fx, y: C + dy * R + R * 0.05, z: dz * R, ...aim(dx, dy + 0.2, dz), seg: 4 });
        }
        break;
      case 'curls':
        cap(1.07, 1.5);
        for (let i = 0; i < 18; i++) {
          const az = (i / 18) * TAU, el = 0.3 + (i % 3) * 0.38;
          const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
          if (dz > 0.45 && dy < 0.6) continue; // not over the face
          s.sphere(R * 0.24, i % 2 ? hc : hcD, { x: dx * R * 1.06 * H.fx, y: C + dy * R * 1.06, z: dz * R * 1.06, seg: 6 });
        }
        break;
      case 'afro':
        cap(1.08, 1.5);
        s.sphere(R * 1.38, hc, { y: C + R * 0.3, z: -R * 0.42, sx: 1.06, seg: 12, vary: 0.03 });
        break;
      default: break;
    }
  }
  // what falls below a hat (or past the shoulders) stays even under one
  if (!full || ['long', 'braids', 'ponytail', 'locs'].includes(st)) {
    switch (st) {
      case 'long':
        // a curtain round the sides and back, falling past the shoulders
        s.cyl(R * 1.09 * H.fx, R * 1.28 * H.fx, R * 1.75, hc, { y: C - R * 0.62, z: -R * 0.06, arc: Math.PI * 1.36, ry: Math.PI * 0.32, seg: 16, open: true, vary: 0.03 });
        break;
      case 'bob':
        // a curtain round the sides and back, open at the face
        s.cyl(R * 1.09 * H.fx, R * 1.17 * H.fx, R * 0.95, hc, { y: C - R * 0.3, z: -R * 0.04, arc: Math.PI * 1.3, ry: Math.PI * 0.35, seg: 16, open: true, vary: 0.03 });
        break;
      case 'braids':
        for (const sd of [-1, 1]) {
          for (let i = 0; i < 6; i++) s.sphere(R * (0.2 - i * 0.012), i % 2 ? hc : hcD, { x: sd * R * (0.92 + i * 0.02), y: C - R * (0.25 + i * 0.3), z: R * (-0.15 + i * 0.07), seg: 6 });
          s.bevel(R * 0.2, R * 0.1, R * 0.2, look.trim || PAL.leather, { x: sd * R * 1.02, y: C - R * 1.85, z: R * 0.27 });
        }
        if (!hatOn) tuft(0, -0.2, -0.72, 1.6, 0.9, 0.4);
        break;
      case 'ponytail':
        s.torus(R * 0.16, R * 0.06, look.trim || PAL.leather, { y: C + R * 0.1, z: -R * 1.05, tseg: 8, rseg: 4 });
        s.chain([[0, C + R * 0.1, -R * 1.08], [0, C - R * 0.35, -R * 1.28], [0, C - R * 0.95, -R * 1.22], [0, C - R * 1.5, -R * 1.05]], R * 0.24, R * 0.1, hc, { seg: 6 });
        break;
      case 'highpony':
        if (!hatOn) {
          s.torus(R * 0.15, R * 0.06, look.trim || PAL.leather, { y: C + R * 0.98, z: -R * 0.5, rx: 0.7, tseg: 8, rseg: 4 });
          s.chain([[0, C + R * 1.0, -R * 0.55], [0, C + R * 1.12, -R * 1.0], [0, C + R * 0.6, -R * 1.42], [0, C - R * 0.3, -R * 1.42]], R * 0.24, R * 0.1, hc, { seg: 6 });
        }
        break;
      case 'locs':
        for (let i = 0; i < 13; i++) {
          const az = Math.PI * (0.42 + (i / 12) * 1.16);
          const x = Math.sin(az) * R * 1.0 * H.fx, z = Math.cos(az) * R * 1.0;
          s.cyl(R * 0.1, R * 0.08, R * 1.5, i % 2 ? hc : hcD, { x: x * 0.98, y: C - R * 0.5, z: z * 0.98, rz: -Math.sin(az) * 0.1, rx: Math.cos(az) * 0.1, seg: 5 });
        }
        break;
      case 'bun':
        if (!hatOn) { s.sphere(R * 0.42, hc, { y: C + R * 0.6, z: -R * 0.92, seg: 10 }); s.torus(R * 0.3, R * 0.06, look.trim || PAL.leather, { y: C + R * 0.48, z: -R * 0.78, rx: 0.9, tseg: 10, rseg: 4 }); }
        break;
      case 'topknot':
        if (!hatOn) { s.sphere(R * 0.32, hc, { y: C + R * 1.18, z: -R * 0.08, seg: 10 }); s.cyl(R * 0.2, R * 0.22, R * 0.14, look.trim || PAL.crimson, { y: C + R * 0.95, z: -R * 0.06, seg: 8 }); }
        break;
      default: break;
    }
  }

  /* facial hair */
  const b = look.beard || 'none';
  if (b === 'none' || race.snout || race.cat || race.bull) return;
  const mouthY = C - R * 0.62;
  const jaw = (r, c, o = {}) => s.sphere(R * r, c, { y: C - R * (0.42 + (o.down || 0)), z: R * (0.08 + (o.fwd || 0)), sx: H.jawW * (o.wide || 1), sy: o.sy || 0.78, sz: 1.06, theta: o.theta || 1.35, rx: Math.PI + (o.tilt || -0.35), seg: 12, vary: 0.03 });
  const stache = (curl = 0) => {
    for (const sd of [-1, 1]) {
      s.bevel(R * 0.3, R * 0.1, R * 0.12, hc, { x: sd * R * 0.14, y: mouthY + R * 0.1, z: H.z(sd * R * 0.14, mouthY + R * 0.1, R * 0.03), rz: -sd * 0.28, ry: sd * 0.25, b: R * 0.03 });
      if (curl) s.cone(R * 0.06, R * 0.24, hc, { x: sd * R * 0.36, y: mouthY + R * 0.18, z: H.z(sd * R * 0.36, mouthY, R * 0.0), rz: -sd * 0.4, seg: 4 });
    }
  };
  switch (b) {
    case 'stubble': jaw(0.84, mixc(hc, look.skin, 0.55), { theta: 1.3 }); break;
    case 'moustache': stache(); break;
    case 'handlebar': stache(1); break;
    case 'goatee': s.bevel(R * 0.28, R * 0.3, R * 0.2, hc, { y: C - R * 0.92, z: H.z(0, C - R * 0.92, -R * 0.03), rx: 0.2, taper: -0.2, b: R * 0.06 }); stache(); break;
    case 'chinstrap': jaw(0.86, hc, { theta: 1.15, tilt: -0.2 }); break;
    case 'mutton': for (const sd of [-1, 1]) s.bevel(R * 0.22, R * 0.55, R * 0.3, hc, { x: sd * R * 0.72 * H.fx, y: C - R * 0.36, z: R * 0.3, ry: sd * 0.5, taper: -0.3 }); stache(); break;
    case 'short': jaw(0.88, hc, { theta: 1.45 }); stache(); break;
    case 'full': jaw(0.92, hc, { theta: 1.6, wide: 1.06 }); s.bevel(R * 0.85 * H.jawW, R * 0.6, R * 0.42, hc, { y: C - R * 1.12, z: R * 0.5, taper: 0.45, b: R * 0.08, vary: 0.04 }); stache(); break;
    case 'braided':
      jaw(0.92, hc, { theta: 1.6, wide: 1.06 });
      for (let i = 0; i < 4; i++) s.sphere(R * (0.22 - i * 0.03), i % 2 ? hc : hcD, { y: C - R * (1.05 + i * 0.22), z: R * (0.62 - i * 0.04), seg: 6 });
      s.bevel(R * 0.18, R * 0.1, R * 0.18, PAL.gold, { y: C - R * 1.6, z: R * 0.5 });
      stache(); break;
    case 'forked':
      jaw(0.92, hc, { theta: 1.6, wide: 1.06 });
      for (const sd of [-1, 1]) s.cone(R * 0.2, R * 0.75, hc, { x: sd * R * 0.2, y: C - R * 1.25, z: R * 0.55, rx: Math.PI - 0.2, rz: sd * 0.25, seg: 5 });
      stache(); break;
    default: break;
  }
}

/* ---------------- what the ancestry adds ---------------- */

function raceFeatures({ s, k, m, g }, look, H) {
  const race = look.race || {};
  const C = H.C, skin = look.skin, ivory = '#ece0c4';
  if (race.tusks) for (const sd of [-1, 1]) s.cone(R * 0.075, R * 0.3, ivory, { x: sd * R * 0.3, y: C - R * 0.62, z: H.z(sd * R * 0.3, C - R * 0.7, R * 0.02), rz: -sd * 0.15, rx: 0.2, seg: 5 });
  if (race.fangs) for (const sd of [-1, 1]) s.cone(R * 0.04, R * 0.12, ivory, { x: sd * R * 0.1, y: C - R * 0.68, z: H.z(0, C - R * 0.68, R * 0.01), rx: Math.PI, seg: 4 });
  if (race.horns && look.hat !== 'greathelm') {
    const hc = '#2e2428';
    for (const sd of [-1, 1]) s.chain([[sd * R * 0.42, C + R * 0.62, R * 0.52], [sd * R * 0.6, C + R * 1.05, R * 0.32], [sd * R * 0.66, C + R * 1.32, -R * 0.08], [sd * R * 0.52, C + R * 1.28, -R * 0.5]], R * 0.17, R * 0.04, hc, { seg: 6 });
  }
  if (race.snout) {
    // a dragon's muzzle: a long blunt snout, nostrils, a mouth line, a crest
    const dk = shade(skin, 0.15);
    k.bevel(R * 1.05, R * 0.62, R * 0.95, skin, { y: C - R * 0.38, z: R * 0.72, taper: 0.18, b: R * 0.16 });
    for (const sd of [-1, 1]) s.sphere(R * 0.07, PAL.ink, { x: sd * R * 0.2, y: C - R * 0.2, z: R * 1.2, sz: 0.5, seg: 5 });
    s.bevel(R * 0.85, R * 0.05, R * 0.6, shade(skin, 0.45), { y: C - R * 0.56, z: R * 0.9 });
    for (let i = 0; i < 4; i++) s.cone(R * 0.13, R * 0.42, dk, { y: C + R * (0.75 - i * 0.32), z: -R * (0.55 + i * 0.22), rx: -1.0 - i * 0.25, seg: 4 });
    for (const sd of [-1, 1]) s.bevel(R * 0.1, R * 0.08, R * 0.5, dk, { x: sd * R * 0.45, y: C + R * 0.42, z: R * 0.3, ry: sd * 0.2 }); // brow ridges
  }
  if (race.cat) {
    const light = tint(skin, 0.45);
    for (const sd of [-1, 1]) {
      k.sphere(R * 0.24, light, { x: sd * R * 0.15, y: C - R * 0.45, z: H.z(sd * R * 0.15, C - R * 0.45, -R * 0.1), sz: 0.7, seg: 8 });
      for (let i = 0; i < 3; i++) s.bevel(R * 0.5, R * 0.012, R * 0.012, PAL.cream, { x: sd * R * 0.5, y: C - R * (0.38 + i * 0.07), z: H.z(sd * R * 0.3, C - R * 0.45, R * 0.02), rz: sd * (0.15 - i * 0.15) });
      // ears on top of the head, with a pale inside
      s.cone(R * 0.3, R * 0.55, skin, { x: sd * R * 0.55, y: C + R * 0.95, z: -R * 0.05, rz: -sd * 0.35, sz: 0.5, seg: 4, ry: Math.PI / 4 });
      s.cone(R * 0.17, R * 0.35, '#d8a0a0', { x: sd * R * 0.53, y: C + R * 0.92, z: R * 0.04, rz: -sd * 0.35, sz: 0.35, seg: 4, ry: Math.PI / 4 });
    }
    s.cone(R * 0.09, R * 0.1, '#c87878', { y: C - R * 0.3, z: H.z(0, C - R * 0.3, R * 0.02), rx: Math.PI, seg: 3 });
    s.bevel(R * 0.16, R * 0.04, R * 0.04, '#4a2018', { y: C - R * 0.62, z: H.z(0, C - R * 0.62) });
  }
  if (race.bull) {
    const light = tint(skin, 0.25);
    k.bevel(R * 0.95, R * 0.62, R * 0.7, light, { y: C - R * 0.42, z: R * 0.78, taper: -0.08, b: R * 0.18 });
    for (const sd of [-1, 1]) s.sphere(R * 0.08, PAL.ink, { x: sd * R * 0.2, y: C - R * 0.35, z: R * 1.13, sz: 0.5, seg: 5 });
    m.torus(R * 0.14, R * 0.03, PAL.gold, { y: C - R * 0.55, z: R * 1.14, tseg: 10, rseg: 4 });
    for (const sd of [-1, 1]) {
      s.chain([[sd * R * 0.75, C + R * 0.62, 0], [sd * R * 1.35, C + R * 0.78, R * 0.1], [sd * R * 1.75, C + R * 1.2, R * 0.28], [sd * R * 1.78, C + R * 1.6, R * 0.2]], R * 0.17, R * 0.04, '#e8dcc0', { seg: 6 });
      k.cone(R * 0.16, R * 0.42, skin, { x: sd * R * 1.05, y: C + R * 0.25, z: -R * 0.1, rz: -sd * 1.7, sz: 0.4, seg: 5 });
    }
  }
  if ((race.antlers && look.hat !== 'antlers')) antlers(s, H, 0.75);
  if (race.spines) for (let i = 0; i < 16; i++) {
    const az = Math.PI * (0.55 + (i / 15) * 0.9), el = 0.1 + (i % 4) * 0.32;
    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
    s.cone(R * 0.11, R * 0.6, i % 2 ? '#5a4030' : '#e8dcc0', { x: dx * R * 0.95, y: C + dy * R * 0.95, z: dz * R * 0.95, ...aim(dx, dy, dz - 0.4), seg: 4 });
  }
  if (race.cap) {
    // a mushroom cap: wide, flattened, spotted, with gills beneath
    const cc = race.cap;
    s.sphere(R * 1.9, cc, { y: C + R * 0.55, sy: race.capPits ? 0.95 : 0.55, theta: 1.4, seg: 14, vary: 0.04 });
    s.cyl(R * 1.86, R * 1.4, R * 0.08, shade(PAL.cream, 0.1), { y: C + R * 0.5, seg: 14 });
    for (let i = 0; i < 9; i++) {
      const az = i * 2.4, el = 0.55 + (i % 3) * 0.3;
      const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el) * (race.capPits ? 0.95 : 0.55), dz = Math.cos(az) * Math.cos(el);
      s.sphere(R * 0.2, race.capPits ? shade(cc, 0.4) : PAL.cream, { x: dx * R * 1.9, y: C + R * 0.55 + dy * R * 1.9, z: dz * R * 1.9, sy: 0.4, ...aim(dx, dy, dz), seg: 6 });
    }
  }
  if (race.crest && !race.snout) for (let i = 0; i < 3; i++) s.cone(R * 0.1, R * 0.35, shade(skin, 0.2), { y: C + R * (0.9 - i * 0.3), z: -R * (0.4 + i * 0.3), rx: -0.9 - i * 0.3, seg: 4 });
  void g;
}

function antlers(s, H, k = 1) {
  const C = H.C, bark = '#8a6a48';
  for (const sd of [-1, 1]) {
    const base = [sd * R * 0.5, C + R * 0.85, 0];
    const mid = [sd * R * 0.95 * k + sd * R * 0.2, C + R * (1.35 * k + 0.2), -R * 0.1];
    const tip = [sd * R * 1.35 * k + sd * R * 0.2, C + R * (2.0 * k + 0.1), -R * 0.25];
    s.chain([base, mid, tip], R * 0.09, R * 0.04, bark, { seg: 5 });
    s.limb(mid, [mid[0] - sd * R * 0.15, mid[1] + R * 0.5 * k, mid[2] + R * 0.2], R * 0.05, R * 0.025, bark, { seg: 4 });
    s.limb([(base[0] + mid[0]) / 2, (base[1] + mid[1]) / 2, -R * 0.05], [sd * R * 1.35 * k, C + R * 1.2, R * 0.2], R * 0.05, R * 0.025, bark, { seg: 4 });
  }
}

/* ---------------- gearforged heads ---------------- */

function robotHead({ m, g, s }, look, H) {
  const plate = look.skin, joint = shade(plate, 0.5), glow = look.eyes || PAL.frost, seam = look.trim || PAL.brass, C = H.C;
  const kind = look.robotHead || 'visor';
  if (kind === 'dome') {
    m.sphere(R * 1.02, plate, { y: C, seg: 16 });
    m.bevel(R * 1.4, R * 0.5, R * 1.6, shade(plate, 0.12), { y: C - R * 0.62, b: R * 0.14, taper: -0.1 });
    for (const sd of [-1, 1]) {
      m.cyl(R * 0.24, R * 0.24, R * 0.12, joint, { x: sd * R * 0.4, y: C, z: R * 0.9, rx: Math.PI / 2, seg: 12 });
      g.cyl(R * 0.17, R * 0.17, R * 0.06, glow, { x: sd * R * 0.4, y: C, z: R * 0.96, rx: Math.PI / 2, seg: 12 });
    }
    for (let i = -2; i <= 2; i++) m.bevel(R * 0.06, R * 0.24, R * 0.06, joint, { x: i * R * 0.13, y: C - R * 0.55, z: R * 0.8 });
  } else {
    m.bevel(R * 2.0 * H.fx, R * 1.95, R * 1.9, plate, { y: C, b: R * (kind === 'crest' ? 0.42 : 0.32) });
    if (kind === 'grille') {
      for (let i = -3; i <= 3; i++) m.bevel(R * 0.08, R * 0.6, R * 0.05, joint, { x: i * R * 0.18, y: C - R * 0.42, z: R * 0.95 });
      for (const sd of [-1, 1]) { m.cyl(R * 0.2, R * 0.2, R * 0.08, joint, { x: sd * R * 0.42, y: C + R * 0.22, z: R * 0.94, rx: Math.PI / 2, seg: 10 }); g.ball(R * 0.13, glow, { x: sd * R * 0.42, y: C + R * 0.22, z: R * 0.98, detail: 1 }); }
    } else {
      // a dark visor band with a lit bar of eyes
      m.bevel(R * 1.9 * H.fx, R * 0.42, R * 0.1, shade(plate, 0.6), { y: C + R * 0.1, z: R * 0.92 });
      g.bevel(R * 1.3, R * 0.12, R * 0.04, glow, { y: C + R * 0.1, z: R * 0.98 });
      for (let i = -1; i <= 1; i++) m.bevel(R * 0.3, R * 0.05, R * 0.05, joint, { x: i * R * 0.34, y: C - R * 0.45, z: R * 0.93 });
    }
    if (kind === 'crest') m.bevel(R * 0.22, R * 0.6, R * 1.9, seam, { y: C + R * 1.0, b: R * 0.06, taper: 0.3 });
    if (kind === 'visor') {
      m.cyl(R * 0.04, R * 0.04, R * 0.5, joint, { x: R * 0.6, y: C + R * 1.2, seg: 5 });
      g.ball(R * 0.09, glow, { x: R * 0.6, y: C + R * 1.48, detail: 0 });
    }
  }
  for (const sd of [-1, 1]) {
    m.cyl(R * 0.22, R * 0.22, R * 0.14, shade(plate, 0.2), { x: sd * R * 1.02 * H.fx, y: C, rz: Math.PI / 2, seg: 10 });
    m.cyl(R * 0.1, R * 0.1, R * 0.18, seam, { x: sd * R * 1.04 * H.fx, y: C, rz: Math.PI / 2, seg: 6 });
  }
  void s;
}

/* ---------------- headwear ---------------- */

function hat({ s, m, g }, look, H, M) {
  const C = H.C, kind = look.hat || 'none';
  if (kind === 'none') return;
  const metal = look.metalPaint || PAL.steel, trim = look.trim, garb = look.garb;
  const robot = look.robot || look.race?.robot;
  const sz = robot ? 1.12 : 1; // a box head is a little bigger
  const fx = H.fx * sz;
  switch (kind) {
    case 'hood': {
      const c = look.cloak && look.cloak !== 'none' && look.cloak !== 'mantle' ? look.cloakColor : shade(garb, 0.12);
      s.sphere(R * 1.2 * sz, c, { y: C + R * 0.04, z: -R * 0.03, sx: fx * 1.02, sy: H.fy, sz: H.fz * 1.04, theta: 1.98, rx: -0.68, seg: 14, vary: 0.03 });
      s.bevel(R * 0.4, R * 0.42, R * 0.36, shade(c, 0.1), { y: C + R * 0.62, z: -R * 1.02, rx: -0.6, taper: 0.6 });
      s.cyl(R * 0.95, R * 1.45, R * 0.45, c, { y: C - R * 1.05, seg: 12, vary: 0.03 }); // the drape on the shoulders
      s.torus(R * 1.16 * sz, R * 0.05, shade(c, 0.25), { y: C + R * 0.35, z: R * 0.52, rx: 0.25, sx: fx, tseg: 18, rseg: 3, arc: Math.PI, rz: Math.PI });
      break;
    }
    case 'helm': case 'horned': {
      m.sphere(R * 1.12 * sz, metal, { y: C + R * 0.02, sx: fx, sy: H.fy, sz: H.fz, theta: 1.5, rx: -0.18, seg: 14 });
      m.cyl(R * 1.13 * fx, R * 1.15 * fx, R * 0.18, shade(metal, 0.15), { y: C + R * 0.12, rx: -0.12, seg: 16, open: true });
      m.bevel(R * 0.14, R * 0.42, R * 0.08, shade(metal, 0.1), { y: C + R * 0.22, z: H.z(0, C + R * 0.3, R * 0.07), rx: -0.12 });
      m.bevel(R * 0.14, R * 0.18, R * 1.9, tint(metal, 0.12), { y: C + R * 1.08, b: R * 0.05 });
      for (const sd of [-1, 1]) m.bevel(R * 0.1, R * 0.62, R * 0.62, shade(metal, 0.08), { x: sd * R * 1.08 * fx, y: C - R * 0.25, z: -R * 0.05, b: R * 0.04 }); // cheek guards
      if (kind === 'horned') for (const sd of [-1, 1]) s.chain([[sd * R * 0.95 * fx, C + R * 0.45, 0], [sd * R * 1.5, C + R * 0.62, R * 0.05], [sd * R * 1.8, C + R * 1.05, R * 0.1], [sd * R * 1.78, C + R * 1.5, -R * 0.05]], R * 0.17, R * 0.04, PAL.bone, { seg: 6 });
      break;
    }
    case 'greathelm': {
      m.bevel(R * 2.3 * fx, R * 2.25, R * 2.3, metal, { y: C - R * 0.05, z: R * 0.04, b: R * 0.38, taper: 0.12 });
      m.bevel(R * 1.75 * fx, R * 0.13, R * 0.1, PAL.ink, { y: C + R * 0.08, z: R * 1.18 });
      m.bevel(R * 0.12, R * 1.6, R * 0.12, tint(metal, 0.15), { y: C - R * 0.05, z: R * 1.2 });
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) m.bevel(R * 0.06, R * 0.06, R * 0.05, PAL.ink, { x: sd * R * (0.35 + i * 0.16), y: C - R * 0.45, z: R * 1.15 });
      if (look.race?.glowEyes) for (const sd of [-1, 1]) g.ball(R * 0.06, look.eyes, { x: sd * R * 0.4, y: C + R * 0.08, z: R * 1.15, detail: 0 });
      s.bevel(R * 0.28, R * 0.75, R * 1.5, trim, { y: C + R * 1.3, z: -R * 0.15, taper: 0.4, rx: -0.2, vary: 0.05 }); // a plume crest
      break;
    }
    case 'wizard': {
      const c = shade(garb, 0.05);
      const base = C + R * 0.62;
      s.cyl(R * 2.0, R * 2.05, R * 0.06, c, { y: base, seg: 16 });
      s.cyl(R * 0.62, R * 1.08 * fx, R * 0.75, c, { y: base + R * 0.4, seg: 12, rx: -0.08 });
      s.cyl(R * 1.1 * fx, R * 1.1 * fx, R * 0.16, trim, { y: base + R * 0.1, seg: 12 });
      s.cone(R * 0.62, R * 1.0, c, { y: base + R * 1.2, z: -R * 0.22, rx: -0.55, seg: 10 });
      g.ball(R * 0.1, trim, { y: base + R * 1.55, z: -R * 0.65, detail: 0 });
      break;
    }
    case 'widebrim': {
      const c = look.leather || PAL.leather;
      const base = C + R * 0.55;
      s.cyl(R * 1.95, R * 2.0, R * 0.05, c, { y: base, seg: 16, rx: -0.06 });
      s.cyl(R * 0.92 * fx, R * 1.06 * fx, R * 0.55, c, { y: base + R * 0.3, seg: 12 });
      s.cyl(R * 1.08 * fx, R * 1.08 * fx, R * 0.14, trim, { y: base + R * 0.12, seg: 12 });
      break;
    }
    case 'cap': {
      s.sphere(R * 1.18 * sz, trim, { y: C + R * 0.62, sx: 1.1, sy: 0.5, theta: 1.4, rz: 0.22, seg: 12 });
      s.cyl(R * 1.08 * fx, R * 1.08 * fx, R * 0.14, shade(trim, 0.3), { y: C + R * 0.5, rz: 0.08, seg: 14 });
      s.chain([[R * 0.75, C + R * 0.8, -R * 0.15], [R * 1.05, C + R * 1.35, -R * 0.55], [R * 1.05, C + R * 1.7, -R * 1.05]], R * 0.1, R * 0.02, PAL.cream, { seg: 4 });
      break;
    }
    case 'circlet': {
      m.torus(R * 0.98, R * 0.045, PAL.gold, { y: C + R * 0.42, z: R * 0.02, sx: fx, sy: H.fz, rx: Math.PI / 2 + 0.2, tseg: 22, rseg: 4 });
      m.bevel(R * 0.18, R * 0.22, R * 0.06, PAL.gold, { y: C + R * 0.36, z: R * 0.98, b: R * 0.03 });
      g.ball(R * 0.07, look.trim || PAL.arcane, { y: C + R * 0.36, z: R * 1.02, detail: 0 });
      break;
    }
    case 'bandana': {
      s.sphere(R * 1.09 * sz, trim, { y: C + R * 0.02, sx: fx, sy: H.fy, sz: H.fz, theta: 1.32, rx: -0.38, seg: 14 });
      s.bevel(R * 0.3, R * 0.25, R * 0.2, shade(trim, 0.15), { y: C + R * 0.05, z: -R * 1.05 });
      for (const sd of [-1, 1]) s.bevel(R * 0.16, R * 0.62, R * 0.06, trim, { x: sd * R * 0.12, y: C - R * 0.35, z: -R * 1.08, rz: sd * 0.25 });
      break;
    }
    case 'headwrap': {
      s.sphere(R * 1.12 * sz, garb, { y: C + R * 0.06, sx: fx, sy: H.fy * 1.05, sz: H.fz, theta: 1.35, rx: -0.3, seg: 14 });
      for (let i = 0; i < 3; i++) s.torus(R * (1.04 - i * 0.12), R * 0.12, i % 2 ? trim : shade(garb, 0.1), { y: C + R * (0.38 + i * 0.25), sx: fx, rx: Math.PI / 2 + 0.25, tseg: 16, rseg: 5 });
      break;
    }
    case 'antlers': {
      m.torus(R * 0.98, R * 0.04, PAL.bronze, { y: C + R * 0.45, sx: fx, sy: H.fz, rx: Math.PI / 2 + 0.2, tseg: 20, rseg: 4 });
      antlers(s, H, 1);
      for (let i = 0; i < 4; i++) s.cone(R * 0.12, R * 0.3, PAL.leaf, { x: (i - 1.5) * R * 0.4, y: C + R * 0.62, z: R * 0.7, rx: 0.5, sz: 0.3, seg: 4 });
      break;
    }
    default: break;
  }
  void M;
}

/* ======================= cloak, tail, wings ======================= */

function buildCloak(fig, look, M) {
  const kind = look.cloak || 'none';
  if (kind === 'none') return;
  const { SH, DZ } = M;
  const c = look.cloakColor || shade(look.garb, 0.25);
  const len = kind === 'cape' ? 0.32 : kind === 'cloak' ? 0.56 : 0.2;
  const cloak = fig.part('cloak', ({ s, m }) => {
    if (kind === 'mantle') {
      // a fur mantle over the shoulders, ragged at the edge
      s.cyl(0.13 * M.w, SH * 1.25, 0.12, PAL.fur, { y: -0.04, z: 0.02, seg: 10, vary: 0.05 });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; s.cone(0.03, 0.07, i % 2 ? PAL.fur : PAL.furD, { x: Math.sin(a) * SH * 1.2, y: -0.12, z: Math.cos(a) * SH * 1.0 + 0.02, rx: Math.PI, seg: 4 }); }
      return;
    }
    // a cloth panel that hangs from the shoulders and widens as it falls,
    // with folds, a hem and a clasp at the collar
    const w0 = 2 * SH * 1.0, w1 = 2 * SH * (kind === 'cloak' ? 1.45 : 1.25);
    s.bevel(w1, len, 0.03, c, { y: -len / 2, z: -0.01, taper: 1 - w0 / w1, taperZ: 0, vary: 0.03 });
    for (const fx of [-0.33, 0, 0.33]) s.bevel(0.03, len * 0.85, 0.02, shade(c, 0.18), { x: fx * w1 * 0.8, y: -len * 0.55, z: -0.025, taper: 0.6 });
    s.bevel(w1 * 1.02, 0.025, 0.036, shade(c, 0.3), { y: -len + 0.012, z: -0.01 });
    s.bevel(w0 * 1.04, 0.05, 2 * DZ * 1.1, c, { y: -0.005, z: DZ * 0.95, b: 0.015 }); // over the shoulders
    for (const sd of [-1, 1]) m.ball(0.018, PAL.gold, { x: sd * SH * 0.55, y: -0.02, z: DZ * 2.0, detail: 0 });
  }, fig.parts.torso);
  cloak.position.set(0, 0.29, -M.DZ * 1.05);
  fig.parts.cloak = cloak;
}

function buildTail(fig, look, M) {
  const c = look.race?.cat ? look.skin : shade(look.skin, 0.1);
  const tail = fig.part('tail', ({ s }) => {
    const pts = [[0, 0, 0], [0, -0.05, -0.1], [0, -0.06, -0.2], [0, 0.0, -0.3], [0, 0.08, -0.35]];
    s.chain(pts, 0.03, 0.015, c, { seg: 6 });
    if (look.race?.horns) s.cone(0.03, 0.06, shade(c, 0.3), { y: 0.1, z: -0.36, rx: -0.6, seg: 4 }); // a spade tip
  }, fig.parts.torso);
  tail.position.set(0, 0.03, -M.DZ * 1.05);
}

function buildWings(fig, look) {
  const kind = look.wings;
  const c = kind === 'feather' ? '#f0e8d8' : kind === 'fey' ? look.trim || '#9ae0ff' : shade(look.skin, 0.25);
  fig.parts.wings = [-1, 1].map((sd) => {
    const w = fig.part(null, ({ s, g }) => {
      if (kind === 'fey') {
        g.membrane([[0, 0, 0], [sd * 0.2, 0.18, -0.05], [sd * 0.3, 0.05, -0.06], [sd * 0.22, -0.08, -0.04]], c);
        g.membrane([[0, -0.02, 0], [sd * 0.18, -0.16, -0.04], [sd * 0.08, -0.2, -0.03]], c);
      } else if (kind === 'feather') {
        for (let i = 0; i < 5; i++) s.bevel(0.06, 0.32 - i * 0.04, 0.012, i % 2 ? c : shade(c, 0.08), { x: sd * (0.06 + i * 0.05), y: 0.08 - i * 0.02, z: -0.02, rz: -sd * (0.5 + i * 0.12) });
      } else {
        s.chain([[0, 0, 0], [sd * 0.18, 0.16, -0.04], [sd * 0.34, 0.08, -0.06]], 0.015, 0.008, shade(c, 0.3), { seg: 4 });
        s.membrane([[0, 0, 0], [sd * 0.18, 0.16, -0.04], [sd * 0.34, 0.08, -0.06], [sd * 0.26, -0.1, -0.05], [sd * 0.12, -0.08, -0.03]], c);
      }
    }, fig.parts.torso);
    w.position.set(sd * 0.04, 0.24, -0.09);
    return w;
  });
}
