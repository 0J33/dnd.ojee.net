import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Quality tiers, best first. The engine watches how long frames take and
// steps down when the machine can't keep up (and back up, carefully, when
// it can), each step trading what shows least for what costs most: pixels
// on high-density screens first, then bloom resolution and shadow detail,
// then render scale. lod: how much sooner figures switch to their simple
// meshes (they only do when a few dozen pixels tall anyway); lights: how
// many of a place's point lights stay on (the brightest; every lit pixel
// pays for each one).
export const TIERS = [
  { name: 'high', maxDpr: 1.75, scale: 1, shadow: 2048, bloom: 0.5, particles: 1, lod: 1, lights: 14 },
  { name: 'good', maxDpr: 1.25, scale: 1, shadow: 2048, bloom: 0.5, particles: 1, lod: 1.4, lights: 14 },
  { name: 'fair', maxDpr: 1, scale: 1, shadow: 1024, bloom: 0.35, particles: 0.8, lod: 2, lights: 12 },
  { name: 'low', maxDpr: 1, scale: 0.8, shadow: 1024, bloom: 0, particles: 0.6, lod: 3, lights: 8 },
  { name: 'lowest', maxDpr: 1, scale: 0.7, shadow: 0, bloom: 0, particles: 0.45, lod: 4, lights: 5 },
];
const TIER_KEY = 'dnd.w3.tier';
const loadTier = () => { try { const n = Number(localStorage.getItem(TIER_KEY)); return Number.isInteger(n) && n >= 0 && n < TIERS.length ? n : 0; } catch { return 0; } };
const saveTier = (n) => { try { localStorage.setItem(TIER_KEY, String(n)); } catch { /* private mode */ } };

// Renderer, post-processing and the frame loop. Fire flickers and dust
// drifts, so the world animates every frame while the tab is visible; the
// loop stops when it isn't.
export default class Engine {
  constructor(container, { quality = 'high', adaptive = true } = {}) {
    this.container = container;
    this.quality = quality;
    // No canvas MSAA: the scene is drawn into the composer's own targets, so
    // multisampling the canvas would only smooth the final full-screen copy.
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'w3-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
    this.bloom.enabled = quality !== 'low';
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.tickers = new Set();
    this.afterRender = new Set();
    this.clock = { t: 0, last: performance.now() };
    this.size = { w: 1, h: 1 };
    this.stats = { fps: 0, frames: 0, at: performance.now() };
    this._loop = this._loop.bind(this);
    this.adaptive = adaptive && quality !== 'low';
    this.tier = this.adaptive ? loadTier() : quality === 'low' ? TIERS.length - 1 : 0;
    this.q = TIERS[this.tier];
    this.onTier = new Set(); // (tierSettings) => void, e.g. particles and figure detail
    this._win = { n: 0, sum: 0, busy: 0, at: 0 };
    this._good = 0; this._upNeed = 4; this._upAt = 0;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this._applyTier(true);
    this._raf = requestAnimationFrame(this._loop);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    // Bloom at half resolution (or less on slower tiers): it's a glow, it
    // doesn't need detail.
    const b = this.q.bloom || 0.5;
    this.bloom.resolution.set(Math.round(w * b), Math.round(h * b));
    this.camera.aspect = w / h;
    this._applyInset();
    this.settle();
  }

  // Ignore frame times for a moment (a scene being built, shaders compiling,
  // a resize): those frames say nothing about the machine.
  settle(ms = 1500) { this._ignoreUntil = Math.max(this._ignoreUntil || 0, performance.now() + ms); this._win.n = 0; this._win.sum = 0; this._win.busy = 0; }

  _applyTier(first = false) {
    const q = this.q, r = this.renderer;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? q.maxDpr : Math.min(q.maxDpr, 1.25)) * q.scale;
    r.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.bloom.enabled = this.quality !== 'low' && q.bloom > 0;
    const shadows = this.quality !== 'low' && q.shadow > 0;
    if (shadows !== r.shadowMap.enabled) {
      r.shadowMap.enabled = shadows;
      // lit materials compile with or without shadow lookups
      this.scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    }
    this.fitShadows();
    this.resize();
    if (!first) for (const fn of this.onTier) fn(q);
  }

  // Shadow-casting lights use the tier's map size (applyEnvironment calls
  // this after making its key light).
  fitShadows() {
    const n = this.q.shadow || 1024;
    this.scene.traverse((o) => {
      if (!o.isLight || !o.castShadow || !o.shadow) return;
      if (o.shadow.mapSize.x === n) return;
      o.shadow.mapSize.set(n, n);
      o.shadow.map?.dispose();
      o.shadow.map = null;
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  setTier(n, why = '') {
    n = Math.max(0, Math.min(TIERS.length - 1, n));
    if (n === this.tier) return;
    this.tier = n;
    this.q = TIERS[n];
    saveTier(n);
    this._applyTier();
    if (why && import.meta.env?.DEV) console.info(`[world] quality ${this.q.name} (${why})`);
  }

  // Frame-time watcher. Each rendered frame's interval is compared with
  // what the loop asked for (60 a second while busy, 30 idle); over a two
  // second window, running ~45% over budget steps down (two steps when it's
  // far over). Stepping up needs several windows at full speed while busy,
  // and a step up that doesn't hold makes the next try wait twice as long.
  _adapt(now, interval, budget, busy) {
    if (!this.adaptive || now < (this._ignoreUntil || 0) || interval > 3000) return; // a pause, not a frame
    const w = this._win;
    if (!w.n) w.at = now;
    w.n++; w.sum += Math.min(8, interval / budget); if (busy) w.busy++;
    if (now - w.at < 2000 || w.n < 3) return;
    const ratio = w.sum / w.n, busyWin = w.busy > w.n * 0.6;
    w.n = 0; w.sum = 0; w.busy = 0;
    if (ratio > 1.45 && this.tier < TIERS.length - 1) {
      if (now - this._upAt < 8000) this._upNeed = Math.min(64, this._upNeed * 2);
      this._good = 0;
      this.setTier(this.tier + (ratio > 3 ? 2 : 1), `frames at ${ratio.toFixed(2)}x budget`);
    } else if (busyWin && ratio < 1.1 && this.tier > 0) {
      if (++this._good >= this._upNeed) { this._good = 0; this._upAt = now; this.setTier(this.tier - 1, 'room to spare'); }
    } else if (ratio > 1.15) this._good = 0;
  }

  // A panel standing over the left of the canvas: shift the picture so the
  // middle of the view sits in the middle of what's still visible.
  setInsetLeft(px) {
    px = Math.round(px);
    if (px === (this.insetLeft || 0)) return;
    this.insetLeft = px;
    this._applyInset();
  }
  _applyInset() {
    const { w, h } = this.size;
    if (this.insetLeft) this.camera.setViewOffset(w, h, -this.insetLeft / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  addTicker(fn) { this.tickers.add(fn); return () => this.tickers.delete(fn); }

  // Something is moving (camera, a walk, an attack, the pointer): render
  // smoothly for a moment. Otherwise the table only flickers and breathes,
  // which 30 frames a second carries fine.
  poke(ms = 1200) { this.busyUntil = Math.max(this.busyUntil || 0, performance.now() + ms); }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden) { this.clock.last = now; return; }
    // Never faster than 60 a second (a 144 Hz screen would otherwise get every
    // frame, and the page's own buttons and menus would wait behind them).
    const busy = now < (this.busyUntil || 0);
    // dim: a dialog's scrim covers the board, so the flicker behind it can
    // run at a dozen frames a second and leave the machine to the dialog
    const budget = 1000 / (busy ? 60 : this.dim ? 12 : 30);
    const since = now - (this._lastFrame || 0);
    if (since < budget - 4) return;
    this._lastFrame = now;
    this._adapt(now, since, budget, busy && this._wasBusy);
    this._wasBusy = busy;
    const dt = Math.min(0.05, (now - this.clock.last) / 1000);
    this.clock.last = now;
    this.clock.t += dt;
    for (const t of this.tickers) t(dt, this.clock.t);
    // Shadows only redraw while things move (and a few times a second
    // otherwise): the room itself doesn't.
    const sm = this.renderer.shadowMap;
    // While busy, 30 shadow updates a second are as smooth as 60 to the eye.
    if (sm.enabled) {
      sm.autoUpdate = false;
      if (now - (this._shadowAt || 0) > (busy ? 30 : 250)) { sm.needsUpdate = true; this._shadowAt = now; }
    }
    // Without bloom the composer would only copy the picture across (tone
    // mapping on the way): drawing straight to the canvas does that in one pass.
    if (this.bloom.enabled) this.composer.render(dt);
    else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
    for (const fn of this.afterRender) fn();
    const s = this.stats;
    s.frames++;
    if (now - s.at > 1000) { s.fps = Math.round((s.frames * 1000) / (now - s.at)); s.frames = 0; s.at = now; }
  }

  ndc(clientX, clientY, out = new THREE.Vector2()) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return out.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  project(v, out = {}) {
    const p = _v.copy(v).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.size.w;
    out.y = (-p.y * 0.5 + 0.5) * this.size.h;
    out.visible = p.z < 1 && p.z > -1;
    return out;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); });
    });
    this.composer.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const _v = new THREE.Vector3();
