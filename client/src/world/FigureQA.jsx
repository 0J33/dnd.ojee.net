import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { heroFigure, figureSize } from './figures';
import { resolveLook, randomLook, Avatar, ROBOT_HEADS, ROBOT_FRAMES, ROBOT_FINISHES, ROBOT_ACCENTS, HAIR_STYLES, BEARDS } from '../components/Portrait';

// Dev-only contact sheets for the hero figures: ?world3d=qa&figqa=<set>&page=N
// Every card is one look, drawn as the 2D portrait beside the 3D figure from
// the front, three-quarters, the side and the back, plus a close-up of the
// head. Sets: races (every race and look-changing subrace x body, classes in
// rotation), random (seeded random looks per race), gear (every gearforged
// head x frame x finish, accents, chassis), classes (each class with and
// without its headwear), hair (styles and beards under hats).

const PER_PAGE = 10;
const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'barbarian', 'bard', 'druid', 'monk', 'paladin', 'sorcerer', 'warlock'];
const BODIES = ['masculine', 'feminine', 'neutral'];
// [raceIndex, subrace]: every race, plus the subraces that change the look
const RACES = [
  ['human'], ['elf'], ['half-elf'], ['dwarf'], ['halfling'], ['gnome'], ['half-orc'], ['dragonborn'], ['tiefling'],
  ['goliath'], ['orc'], ['gearforged'], ['gearforged', 'dwarf-chassis'], ['gearforged', 'gnome-chassis'], ['gearforged', 'kobold-chassis'],
  ['alseid'], ['catfolk'], ['catfolk', 'malkin'], ['darakhul'], ['derro'], ['drow'], ['erina'], ['minotaur'],
  ['mushroomfolk'], ['mushroomfolk', 'acid-cap'], ['mushroomfolk', 'morel'], ['satarre'], ['shade'],
  ['shade', 'shade-dwarf'], ['shade', 'shade-half-orc'], ['shade', 'shade-tiefling'], ['shade', 'shade-dragonborn'],
];

function seededRandom(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (Math.imul(s ^ ch.charCodeAt(0), 2654435761) >>> 0);
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function withSeed(seed, fn) {
  const keep = Math.random;
  Math.random = seededRandom(seed);
  try { return fn(); } finally { Math.random = keep; }
}

const sheetOf = (race, sub, cls, look, name) => ({ name: name || `${race}${sub ? '-' + sub : ''}-${cls}`, raceIndex: race, race, subrace: sub, classIndex: cls, portrait: { look } });

function cards(set) {
  const out = [];
  if (set === 'races') {
    RACES.forEach(([r, sub], i) => BODIES.forEach((body, j) => {
      const cls = CLASSES[(i * 3 + j) % CLASSES.length];
      out.push({ label: `${sub || r} / ${body} / ${cls}`, sheet: sheetOf(r, sub, cls, { body }) });
    }));
  } else if (set === 'random') {
    RACES.forEach(([r, sub]) => {
      for (let k = 0; k < 3; k++) {
        const cls = CLASSES[(r.length * 7 + k * 5) % CLASSES.length];
        const base = sheetOf(r, sub, cls, {});
        const look = withSeed(`${r}${sub}${k}`, () => randomLook(base, { body: BODIES[k] }));
        out.push({ label: `${sub || r} / rnd${k} / ${cls}`, sheet: { ...base, portrait: { look } } });
      }
    });
  } else if (set === 'gear') {
    for (const head of Object.keys(ROBOT_HEADS)) for (const finish of Object.keys(ROBOT_FINISHES)) for (const frame of Object.keys(ROBOT_FRAMES)) {
      out.push({ label: `gear ${head} / ${finish} / ${frame}`, sheet: sheetOf('gearforged', null, 'fighter', { robotHead: head, finish, frame, skin: '#8e98a3', headwear: 'off' }) });
    }
    ROBOT_ACCENTS.forEach((trim, i) => out.push({ label: `gear accent ${trim}`, sheet: sheetOf('gearforged', null, CLASSES[i % 12], { trim, robotHead: Object.keys(ROBOT_HEADS)[i % 3], skin: ['#b8923f', '#8e98a3', '#a0703e', '#b8734e', '#6f757c', '#3f454c'][i % 6] }) }));
    for (const cls of CLASSES) out.push({ label: `gear ${cls} hat on`, sheet: sheetOf('gearforged', null, cls, { headwear: 'on', robotHead: 'dome' }) });
  } else if (set === 'classes') {
    CLASSES.forEach((cls, i) => ['on', 'off'].forEach((hw) => out.push({ label: `human ${cls} hat ${hw}`, sheet: sheetOf(i % 2 ? 'elf' : 'human', null, cls, { headwear: hw, body: BODIES[i % 3] }) })));
  } else if (set === 'hair') {
    Object.keys(HAIR_STYLES).forEach((st, i) => ['off', 'on'].forEach((hw) => out.push({ label: `hair ${st} hat ${hw}`, sheet: sheetOf(['human', 'elf', 'half-orc', 'tiefling'][i % 4], null, ['fighter', 'wizard', 'ranger', 'bard', 'cleric', 'druid'][i % 6], { hairStyle: st, headwear: hw, body: BODIES[i % 3] }) })));
    Object.keys(BEARDS).forEach((b, i) => out.push({ label: `beard ${b}`, sheet: sheetOf(['dwarf', 'human', 'gnome', 'half-orc'][i % 4], null, ['fighter', 'paladin', 'wizard'][i % 3], { beard: b, body: 'masculine', headwear: i % 2 ? 'on' : 'off' }) }));
  }
  return out;
}

const VIEWS = [['front', 0], ['3/4', 0.75], ['side', Math.PI / 2], ['back', Math.PI]];

function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2420');
  scene.add(new THREE.HemisphereLight('#ffe6c4', '#2a1a10', 1.25));
  const key = new THREE.DirectionalLight('#ffd7a0', 2.6);
  key.position.set(1.4, 2.6, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9ab8ff', 0.9);
  rim.position.set(-2, 1.6, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
  return { renderer, scene, camera };
}

function snap(R, fig, look, w, h, place) {
  R.renderer.setSize(w, h, false);
  R.camera.aspect = w / h;
  R.camera.updateProjectionMatrix();
  place(R.camera);
  R.renderer.render(R.scene, R.camera);
  return R.renderer.domElement.toDataURL('image/png');
}

function renderCard(R, sheet, faces) {
  const look = resolveLook(sheet);
  const fig = heroFigure(look, { seed: sheet.name, size: figureSize(sheet) });
  fig.anim.phase = 0;
  fig.place(0, 0);
  fig.update(0.016, 0);
  R.scene.add(fig.root);
  fig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fig.root);
  const H = Math.max(0.6, box.max.y);
  let verts = 0;
  fig.root.traverse((o) => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
  const shots = faces ? [] : VIEWS.map(([, yaw]) => snap(R, fig, look, 280, 380, (cam) => {
    const d = H * 2.3 + 0.2;
    cam.position.set(Math.sin(yaw) * d, H * 0.55, Math.cos(yaw) * d);
    cam.lookAt(0, H * 0.5, 0);
  }));
  const hp = new THREE.Vector3();
  fig.parts.head.getWorldPosition(hp);
  const sc = fig.body.scale.y;
  hp.y += 0.13 * sc;
  const hd = 0.85 * sc + 0.05;
  for (const yaw of faces ? [0, 0.7] : [0.4]) shots.push(snap(R, fig, look, 380, 380, (cam) => { cam.position.set(Math.sin(yaw) * hd, hp.y + 0.04, Math.cos(yaw) * hd); cam.lookAt(hp.x, hp.y, hp.z); }));
  R.scene.remove(fig.root);
  fig.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  for (const m of Object.values(fig.mats)) m.dispose();
  return { shots, verts };
}

export default function FigureQA({ set = 'races', page = 0, faces = false, big = false }) {
  const all = useMemo(() => cards(set), [set]);
  const per = faces ? (big ? 8 : 15) : PER_PAGE;
  const list = all.slice(page * per, (page + 1) * per);
  const [out, setOut] = useState([]);
  useEffect(() => {
    const R = setupRenderer();
    const res = list.map((c) => ({ ...c, ...renderCard(R, c.sheet, faces) }));
    setOut(res);
    R.renderer.dispose();
    window.__qa = { done: true, pages: Math.ceil(all.length / per), count: all.length, verts: res.map((c) => c.verts) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, page, faces]);
  if (faces) {
    return (
      <div style={{ background: '#17120f', color: '#e8dcc0', font: '12px sans-serif', padding: 8, display: 'grid', gridTemplateColumns: `repeat(${big ? 2 : 3}, 1fr)`, gap: 6, width: 1780 }}>
        {out.map((c, i) => (
          <div key={i} style={{ background: '#211a15', padding: 4 }}>
            <div style={{ marginBottom: 2 }}>{page * per + i}. {c.label}</div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <Avatar sheet={c.sheet} size={170} shape="square" />
              {c.shots.map((src, k) => <img key={k} src={src} width={big ? 300 : 190} height={big ? 300 : 190} alt="" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ background: '#17120f', color: '#e8dcc0', font: '12px sans-serif', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, width: 1780 }}>
      {out.map((c, i) => (
        <div key={i} style={{ background: '#211a15', padding: 4 }}>
          <div style={{ marginBottom: 2 }}>{page * per + i}. {c.label} <span style={{ opacity: 0.6 }}>({c.verts} v)</span></div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            <Avatar sheet={c.sheet} size={150} shape="square" />
            {c.shots.slice(0, 4).map((src, k) => <img key={k} src={src} width={140} height={190} alt="" />)}
            <img src={c.shots[4]} width={190} height={190} alt="" />
          </div>
        </div>
      ))}
    </div>
  );
}
