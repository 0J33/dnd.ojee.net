import * as THREE from 'three';

// One named palette for everything in the 3D world: heroes, people,
// monsters and the furniture of every room draw from the same few dozen
// paints, so a chair, a goblin and a paladin look like they came out of the
// same box of miniatures. Warm, slightly desaturated, candle-lit.
//
// Pick by name (PAL.wood), never by a fresh hex in a model: a new colour
// goes here first. Shades are mixed from these with shade() / tint().

export const PAL = {
  // wood, from fresh-cut to old and oiled
  woodL: '#9a7148', wood: '#7a5434', woodD: '#5a3c24', woodDD: '#3c2716', plank: '#86603c',
  // stone and earth
  stoneL: '#a49c90', stone: '#857e74', stoneD: '#635d56', stoneDD: '#433f3a', mortar: '#2e2a26',
  slate: '#55585e', clay: '#a8643c', sand: '#c8b088', dirt: '#5e4630',
  // metals (the metal material shades them; these are their base paints)
  iron: '#5a5f66', ironD: '#3c4046', steel: '#9ea6ae', steelL: '#c4cad0', bronze: '#a8743a',
  brass: '#b8923e', gold: '#d8ae4c', goldD: '#a8822e', silver: '#c8ccd2', blackened: '#34363a',
  // leather and rope
  leatherL: '#93683e', leather: '#6e4a2a', leatherD: '#4a301c', rope: '#a08a5e', fur: '#8a6a48', furD: '#5e4630',
  // cloth: the dye shelf (heroes pick from it, rooms use it for rugs and banners)
  linen: '#e2d6bc', wool: '#b8ac94', cream: '#ece2c8', ash: '#6d6a63', charcoal: '#2c2c30', ink: '#1c1a1e',
  crimson: '#8c2e32', rust: '#a8482a', ember: '#d06a30', ochre: '#c8962e', mustard: '#b8a040',
  moss: '#5a6a34', forest: '#2f5032', teal: '#235a5a', sky: '#5f87a8', navy: '#2a3a64',
  plum: '#5c3466', violet: '#6a4a9a', rose: '#b8566e', umber: '#6b4a28', sage: '#8a9a72',
  // living things
  leaf: '#4a7a3a', leafD: '#2f5428', leafL: '#7aa04a', bark: '#5a4030', moss2: '#4f6a35',
  flesh: '#e0b090', bone: '#e8dfc8', boneD: '#bdb39a', blood: '#7a1e1e',
  // light and magic (glow material: these are what bloom)
  flame: '#ffb34a', flameHot: '#fff0b0', ember2: '#ff6a2a', arcane: '#9a7aff', frost: '#9ae0ff',
  fel: '#8aff6a', holy: '#ffe8a0', void: '#c060ff', water: '#3a7a9a', waterL: '#6ab0c8', lava: '#ff7a2a',
  // eyes
  eyeWhite: '#f4eee2', pupil: '#1a1412',
};

const _a = new THREE.Color(), _b = new THREE.Color();
const DARK = '#140c08', LIGHT = '#fff3dc';
const hex = (c) => '#' + c.getHexString();

/** Darker (k = 0..1), toward a warm near-black rather than grey. */
export const shade = (c, k = 0.25) => hex(_a.set(c).lerp(_b.set(DARK), k));
/** Lighter, toward candle-light rather than white. */
export const tint = (c, k = 0.2) => hex(_a.set(c).lerp(_b.set(LIGHT), k));
/** Between two colours. */
export const mixc = (c1, c2, k = 0.5) => hex(_a.set(c1).lerp(_b.set(c2), k));
/** Perceived lightness 0..1. */
export const lum = (c) => { _a.set(c); return 0.299 * _a.r + 0.587 * _a.g + 0.114 * _a.b; };
