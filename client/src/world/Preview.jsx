import React, { useEffect, useRef } from 'react';
import Engine from './engine';
import CameraRig from './cameraRig';
import Particles from './particles';
import { CUTAWAY } from './kit';
import { buildWorld, applyEnvironment } from './world';
import { sceneFromBuiltin } from '../data/scenes';
import { heroFigure, creatureFigure } from './figures';
import { resolveLook } from '../components/Portrait';
import { PREGENS } from '../data/pregens';

// Dev-only: ?world3d=<builtin scene key> renders that place with a free camera.
export default function Preview({ sceneKey }) {
  const host = useRef(null);
  useEffect(() => {
    const b = sceneFromBuiltin(sceneKey) || sceneFromBuiltin('taproom');
    const scene = { grid: { w: b.w, h: b.h }, cells: b.cells, bg: { kind: 'builtin', floor: b.floor }, tokens: [] };
    const engine = new Engine(host.current);
    const rig = new CameraRig(engine.camera);
    const particles = new Particles();
    engine.scene.add(particles.points);
    const world = buildWorld(scene, { maxAniso: engine.renderer.capabilities.getMaxAnisotropy() });
    engine.scene.add(world.group);
    for (const e of world.emitters) particles.addEmitter(e);
    applyEnvironment(engine, world.env, world.bounds, particles);
    rig.setLimits({ box: { x0: 0, x1: b.w, z0: 0, z1: b.h }, maxDist: Math.max(b.w, b.h) * 2.2 });
    rig.flyTo({ tx: b.w / 2, tz: b.h / 2, yaw: 0, pitch: 0.95, dist: Math.max(b.w, b.h) * 1.15 }, { instant: true });
    // ?figs=1: the six pregens, an NPC and every monster archetype, in rows.
    const figs = [];
    if (new URLSearchParams(window.location.search).get('figs')) {
      const sheets = PREGENS.map((p) => p.sheet || p);
      sheets.forEach((sh, i) => {
        const look = resolveLook(sh);
        const f = heroFigure(look, { seed: sh.name, size: /halfling|gnome/i.test(sh.raceIndex || sh.race || '') ? 'small' : 'medium' });
        f.place(4 + i * 1.4, 4.5); f.yawGoal = f.yaw = 0.3;
        figs.push(f);
      });
      const marla = creatureFigure('humanoid', { seed: 'Marla', label: 'Marla', body: 'feminine', resolveLook });
      marla.place(13.5, 4.5); figs.push(marla);
      const arts = ['rat', 'wolf', 'bear', 'boar', 'spider', 'snake', 'bat', 'bird', 'insect', 'goblinoid', 'orc', 'skeleton', 'zombie', 'ghost', 'dragon', 'ooze', 'elemental', 'golem', 'giant', 'fiend', 'celestial', 'fey', 'plant', 'aberration', 'construct', 'monstrosity', 'swarm'];
      arts.forEach((a, i) => {
        const f = creatureFigure(a, { seed: a + i, label: a === 'goblinoid' && i % 2 ? 'Skarn the Bugbear' : a, resolveLook });
        f.place(2.5 + (i % 9) * 2, 7 + Math.floor(i / 9) * 2); figs.push(f);
      });
      for (const f of figs) engine.scene.add(f.root);
      window.__figs = figs;
    }
    engine.addTicker((dt, t) => {
      for (const f of figs) f.update(dt, t);
      rig.update(dt);
      const c = rig.cur;
      CUTAWAY.center.value.set(c.tx, 0, c.tz);
      CUTAWAY.dir.value.set(Math.sin(c.yaw), Math.cos(c.yaw));
      world.update(t); particles.setViewportHeight(engine.size.h); particles.update(dt, t); });
    const el = engine.renderer.domElement;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.b === 2) rig.orbit(-dx * 0.005, dy * 0.004); else rig.pan(dx, dy, engine.size.h);
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { e.preventDefault(); rig.zoomAt(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    window.__w3 = { engine, rig, world, scene, shot: (tx, tz, yaw, pitch, dist) => { rig.flyTo({ tx, tz, yaw, pitch, dist }, { instant: true }); rig.update(0.016); } };
    return () => { world.dispose(); particles.dispose(); engine.dispose(); };
  }, [sceneKey]);
  return <div ref={host} style={{ position: 'fixed', inset: 0, background: '#000' }} />;
}
