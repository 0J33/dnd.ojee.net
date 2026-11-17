import * as THREE from 'three';

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

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
