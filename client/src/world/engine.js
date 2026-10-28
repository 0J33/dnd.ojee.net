import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Renderer, post-processing and the frame loop. Fire flickers and dust
// drifts, so the world animates every frame while the tab is visible; the
// loop stops when it isn't.
export default class Engine {
  constructor(container, { quality = 'high' } = {}) {
    this.container = container;
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.25));
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
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this._raf = requestAnimationFrame(this._loop);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    // Bloom at half resolution: it's a glow, it doesn't need detail.
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this._applyInset();
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
    if (now - (this._lastFrame || 0) < 1000 / (busy ? 60 : 30) - 4) return;
    this._lastFrame = now;
    const dt = Math.min(0.05, (now - this.clock.last) / 1000);
    this.clock.last = now;
    this.clock.t += dt;
    for (const t of this.tickers) t(dt, this.clock.t);
    // Shadows only redraw while things move (and a few times a second
    // otherwise): the room itself doesn't.
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      sm.autoUpdate = false;
      if (busy || now - (this._shadowAt || 0) > 250) { sm.needsUpdate = true; this._shadowAt = now; }
    }
    this.composer.render(dt);
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
