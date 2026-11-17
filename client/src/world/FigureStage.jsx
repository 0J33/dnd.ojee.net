import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { heroFigure, figureSize } from './figures';
import { resolveLook } from '../components/Portrait';

// A hero's 3D figure on a little round base, lit like the table: shown while
// building a character and on the sheet, so you see what will walk the map.
// Drag to turn it; left alone it turns slowly. It rebuilds whenever anything
// that shows changes (race, class, body, colours, hair...).

function lookKey(sheet) {
  const p = sheet?.portrait || {};
  return JSON.stringify([sheet?.name, sheet?.race, sheet?.raceIndex, sheet?.subrace, sheet?.classIndex, sheet?.className, p.look || null]);
}

function disposeFigure(fig) {
  fig.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  for (const m of Object.values(fig.mats)) m.dispose();
}

// One WebGL context for every stage (the builder shows two at once, the
// sheet one more over the 3D board): contexts are dear on weak GPUs, and
// each new one compiles every shader again. The shared renderer draws into
// an offscreen canvas, and each stage shows its frame in its own canvas
// (handed over without a copy where the browser can; drawn across where it
// can't). It's kept for a while after the last stage closes, since the next
// one (builder, then sheet) usually isn't far behind.
let shared = null;
function acquireRenderer() {
  if (shared) { clearTimeout(shared.bye); shared.users++; return shared; }
  let canvas = null, offscreen = false;
  try { if (typeof OffscreenCanvas !== 'undefined') { canvas = new OffscreenCanvas(1, 1); offscreen = true; } } catch { canvas = null; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas || undefined, antialias: true, alpha: true }); }
  catch { offscreen = false; renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  shared = { renderer, offscreen, users: 1, bye: 0 };
  return shared;
}
function releaseRenderer() {
  const r = shared;
  if (!r || --r.users > 0) return;
  r.bye = setTimeout(() => { if (shared === r && r.users <= 0) { r.renderer.dispose(); shared = null; } }, 60000);
}

export default function FigureStage({ sheet, height = 260, className = '' }) {
  const host = useRef(null);
  const stage = useRef(null);
  const key = lookKey(sheet);

  // the renderer, base, lights and loop: once
  useEffect(() => {
    const el = host.current;
    const R = acquireRenderer(), renderer = R.renderer;
    const view = document.createElement('canvas');
    view.className = 'figure-stage-canvas';
    el.appendChild(view);
    const out = R.offscreen ? view.getContext('bitmaprenderer') : view.getContext('2d');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    scene.add(new THREE.HemisphereLight('#ffe6c4', '#2a1a10', 1.25));
    const key = new THREE.DirectionalLight('#ffd7a0', 2.6);
    key.position.set(1.4, 2.6, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 1.4, bottom: -0.2, near: 0.5, far: 6 });
    scene.add(key);
    const rim = new THREE.DirectionalLight('#9ab8ff', 0.9);
    rim.position.set(-2, 1.6, -2);
    scene.add(rim);
    // a turned wooden base, like a painted miniature's
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.7, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 28), wood);
    base.position.y = -0.03;
    base.receiveShadow = true;
    scene.add(base);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.012, 6, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 0.6, roughness: 0.4 }));
    rimRing.position.y = 0.0;
    scene.add(rimRing);
    const turn = new THREE.Group();
    scene.add(turn);

    const s = { renderer, scene, camera, turn, fig: null, yaw: 0.5, spin: 0.35, drag: null, idleAt: 0, frameH: 1.1 };
    stage.current = s;

    const size = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      view.width = Math.round(w * pr); view.height = Math.round(h * pr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    const down = (e) => { s.drag = { x: e.clientX }; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!s.drag) return; s.yaw += (e.clientX - s.drag.x) * 0.012; s.drag.x = e.clientX; s.idleAt = performance.now(); };
    const up = () => { s.drag = null; s.idleAt = performance.now(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    let raf, last = performance.now(), t = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      // a slowly turning figure needs no more than 30 a second; one you're turning, 60
      if (!visible || document.hidden || now - last < 1000 / (s.drag ? 60 : 30) - 4) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (!s.drag && now - s.idleAt > 2500) s.yaw += s.spin * dt;
      turn.rotation.y = s.yaw;
      if (s.fig) s.fig.update(dt, t);
      const H = s.frameH;
      camera.position.set(0, H * 0.6, H * 2.15 + 0.2);
      camera.lookAt(0, H * 0.5, 0);
      const cw = view.width, ch = view.height, c = renderer.domElement;
      if (c.width !== cw || c.height !== ch) renderer.setSize(cw, ch, false);
      renderer.render(scene, camera);
      if (R.offscreen) out.transferFromImageBitmap(c.transferToImageBitmap());
      else { out.clearRect(0, 0, cw, ch); out.drawImage(c, 0, 0); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (s.fig) disposeFigure(s.fig);
      base.geometry.dispose(); wood.dispose(); rimRing.geometry.dispose(); rimRing.material.dispose();
      key.shadow.map?.dispose();
      view.remove();
      releaseRenderer();
      stage.current = null;
    };
  }, []);

  // the figure: rebuilt when its look changes - just after the next frame, so
  // the click that changed it shows at once, and a run of quick changes
  // (dragging through colours) builds only the last one
  useEffect(() => {
    if (!stage.current || !sheet) return;
    let timer = 0;
    const raf = requestAnimationFrame(() => { timer = setTimeout(build, 0); });
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
    function build() {
      const s = stage.current;
      if (!s) return;
      if (s.fig) { s.turn.remove(s.fig.root); disposeFigure(s.fig); s.fig = null; }
      const look = resolveLook(sheet);
      const fig = heroFigure(look, { seed: sheet.name || 'hero', size: figureSize(sheet) });
      fig.place(0, 0);
      fig.yaw = fig.yawGoal = 0;
      fig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      s.turn.add(fig.root);
      s.fig = fig;
      // frame the whole figure, weapon and hat included
      fig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fig.root);
      s.frameH = Math.max(0.6, box.max.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={host} className={`figure-stage ${className}`} style={{ height }} title="Drag to turn" />;
}
