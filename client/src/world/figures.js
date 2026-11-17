import * as THREE from 'three';
import { applyFinish } from './fig/metal';
import { buildHero, HERO } from './fig/hero';
import { buildBeast, HUMANOID_MONSTERS } from './fig/beasts';
import { npcLook } from '../look/resolve';
import { HEIGHT_SCALE } from '../look/catalog';

// ================= Figures: the miniatures that move =================
//
// Heroes, people and monsters are chunky painted miniatures: big readable
// heads, bold silhouettes, small details you can still see from across the
// table (eyes, belts, buckles, trims, pouches), all painted from one palette
// (world/palette.js). Each is a few separately pivoted parts — legs, torso,
// head, arms, a cloak, a tail, wings — so it can walk, swing, cast, flinch
// and fall. The figure faces +z; its root stands on the floor at y = 0.
//
//   fig/hero.js    heroes and people, from a resolved look (look/resolve.js)
//   fig/gear.js    weapons, shields, foci and what hangs on a back or a belt
//   fig/beasts.js  monsters by archetype (rat … dragon), and humanoid monsters

import { Part, Figure, hash } from './fig/rig';

export { Part, Figure, hash };

/* ---------------- the two-legged rig ---------------- */

const BOW_REST = 0.3;

export class Biped extends Figure {
  pose({ walk, t, dt = 0.016, still }) {
    const P = this.parts;
    const s = Math.sin(this.stride || 0) * walk;
    const ph = this.anim.phase;
    const breathe = still ? 0 : Math.sin(t * 2.1 + ph) * 0.012;
    if (P.legL) { P.legL.rotation.x = s * 0.62; P.legR.rotation.x = -s * 0.62; }
    if (P.armL) {
      const sway = still ? 0 : Math.sin(t * 1.3 + ph) * 0.03;
      P.armL.rotation.x = -s * 0.55 + breathe * 2 + sway; P.armR.rotation.x = s * 0.55 - breathe * 2 - sway;
      P.armL.rotation.z = 0.1 + breathe; P.armR.rotation.z = -0.1 - breathe;
      if (this.armsForward) { P.armL.rotation.x = -1.35 + s * 0.15; P.armR.rotation.x = -1.4 - s * 0.15; }
      if (this.bound) { P.armL.rotation.set(0.35, 0, -0.32); P.armR.rotation.set(0.35, 0, 0.32); }
    }
    if (P.torso) { P.torso.scale.y = 1 + breathe; P.torso.rotation.y = s * 0.08; }
    if (P.head) {
      P.head.rotation.y = Math.sin(t * 0.37 + ph) * 0.28 * (1 - walk);
      P.head.rotation.x = Math.sin(t * 0.23 + ph * 1.7) * 0.05 * (1 - walk);
    }
    // a cloak lifts behind a walker and settles when they stop
    if (P.cloak) {
      const want = 0.08 + walk * 0.38 + Math.abs(s) * 0.08 + (still ? 0 : Math.sin(t * 1.7 + ph) * 0.02);
      P.cloak.rotation.x += (want - P.cloak.rotation.x) * Math.min(1, dt * 6);
    }
    if (P.tail) P.tail.rotation.y = Math.sin(t * (walk ? 7 : 1.8) + ph) * 0.4;
    if (P.wings) { const f = Math.sin(t * 2.4 + ph) * 0.15; P.wings[0].rotation.y = 0.35 + f; P.wings[1].rotation.y = -0.35 - f; }
    if (P.orb) { P.orb.rotation.y = t * 1.9; P.orb.position.y = this.orbY + Math.sin(t * 1.7 + ph) * 0.02; }
    this.body.position.y = Math.abs(Math.sin(this.stride || 0)) * 0.035 * walk + (this.hover || 0) + (this.float ? 0.12 + Math.sin(t * 1.5 + ph) * 0.03 : 0);
  }

  act(name, k) {
    const P = this.parts;
    if (name === 'melee') {
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
      P.armR.rotation.z = -0.1 + 0.6 * draw * (1 - rel);
      P.torso.rotation.y = 0.5 * draw * (1 - rel);
      if (P.bow) P.bow.rotation.x = BOW_REST + (0.1 - BOW_REST) * Math.min(1, draw * 1.5) * (1 - rel) - P.armL.rotation.x;
    } else if (name === 'cast') {
      const up = Math.min(1, k / 0.5), rel = k > 0.55 ? (k - 0.55) / 0.45 : 0;
      P.armL.rotation.x = -2.3 * up * (1 - rel) - 1.2 * rel * (1 - rel) * 4;
      P.armR.rotation.x = -2.3 * up * (1 - rel) - 1.4 * rel * (1 - rel) * 4;
      P.armL.rotation.z = 0.5 * up * (1 - rel); P.armR.rotation.z = -0.5 * up * (1 - rel);
      this.hover = 0.08 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    } else if (name === 'hurt') {
      const r = Math.sin(k * Math.PI);
      P.torso.rotation.x = -0.35 * r;
      if (P.head) P.head.rotation.x = -0.3 * r;
      this.body.position.z = -0.12 * r;
    } else if (name === 'cheer') {
      const j = Math.abs(Math.sin(k * Math.PI * 2));
      this.body.position.y = j * 0.3;
      P.armL.rotation.x = -2.8; P.armR.rotation.x = -2.8;
    }
    if (k >= 1) { P.torso.rotation.set(0, 0, 0); this.hover = 0; if (P.bow) P.bow.rotation.x = BOW_REST; }
  }
}

/* ---------------- entry points ---------------- */

// Small folk stand about three-quarters as tall; a chassis built for a gnome
// or a kobold is small too.
const SMALL_RACES = /halfling|gnome|kobold|derro|erina/i;
export function figureSize(sheet) {
  return SMALL_RACES.test(`${sheet?.raceIndex || sheet?.race || sheet?.raceName || ''} ${sheet?.subrace || ''}`) ? 'small' : 'medium';
}

/** A hero (or a person) from a resolved look (look/resolve.js). */
export function heroFigure(look, { seed, size = 'medium' } = {}) {
  const race = look.race || {};
  let scale = size === 'small' ? 0.74 : 1;
  if (size !== 'small' && race.short) scale *= 0.86;
  if (race.tall) scale *= 1.06;
  if (look.child) scale *= 0.66;
  scale *= HEIGHT_SCALE[look.height] || 1;
  const fig = new Biped({ kind: 'biped', seed: seed || look.seed, scale, ghostly: race.ghostly || look.ghostly });
  buildHero(fig, look);
  if (look.robot || race.robot) { applyFinish(fig.mats.metal, look.finish); applyFinish(fig.mats.sheen, look.finish); }
  if (look.bound) fig.bound = true;
  return fig;
}

/** A monster or a person for a token. art = archetype key (Portrait.jsx artForToken). */
export function creatureFigure(art, { seed = 'm', color, label = '', body } = {}) {
  if (art === 'humanoid') {
    const look = npcLook({ label: label || seed, seed: label || seed, body });
    return heroFigure(look, { seed, size: /halfling|gnome/.test(look.raceIndex || '') ? 'small' : 'medium' });
  }
  const hm = HUMANOID_MONSTERS[art];
  if (hm) {
    const look = hm({ seed, color, label });
    const fig = heroFigure(look, { seed, size: look.size });
    if (look.armsForward) fig.armsForward = true;
    if (look.float) fig.float = true;
    if (look.scale) { fig.scale *= look.scale; fig.body.scale.setScalar(fig.scale); }
    return fig;
  }
  return buildBeast(art, { seed, color, label });
}

export { HERO };
