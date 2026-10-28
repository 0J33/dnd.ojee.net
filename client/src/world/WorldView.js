import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import Engine from './engine';
import CameraRig from './cameraRig';
import Particles from './particles';
import Kit, { CUTAWAY, MATS, meshOf } from './kit';
import { buildWorld, applyEnvironment } from './world';
import { heroFigure, creatureFigure } from './figures';
import { TILES } from '../data/tiles';
import { resolveLook, artForToken } from '../components/Portrait';

// The 3D table for one campaign: keeps the place, the figures, the fog and
// the effects in step with the game state, turns pointer input into game
// intents (move here, attack that, open this door), and plays combat out.
// React (Map3D.jsx) owns the menus and labels; this owns the 3D.

const SMALL_RACES = /halfling|gnome|kobold|derro|erina/i;
const DAMAGE_COLORS = {
  fire: ['#ffd27a', '#ff4a10'], cold: ['#e0f6ff', '#5ab8ff'], lightning: ['#ffffff', '#8aa8ff'], thunder: ['#e8ecff', '#7a8aff'],
  radiant: ['#fff6c8', '#ffc84a'], necrotic: ['#d8a8ff', '#5a1a8a'], poison: ['#d8ff9a', '#3a8a2a'], acid: ['#efffa0', '#7ab82a'],
  force: ['#f0d8ff', '#9a5aff'], psychic: ['#ffd0f0', '#d84aa8'],
  slashing: ['#ffffff', '#ffc890'], piercing: ['#ffffff', '#ffd8a0'], bludgeoning: ['#fff0d8', '#d8a870'],
};
const colorsFor = (type, style) => DAMAGE_COLORS[type] || (style === 'spell' ? DAMAGE_COLORS.force : DAMAGE_COLORS.slashing);

const isBlocked = (scene, x, y) => {
  if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) return true;
  return !!TILES[(scene.cells?.[y] || '')[x]]?.blocked;
};
const isDifficult = (scene, x, y) => !!TILES[(scene.cells?.[y] || '')[x]]?.difficult;

// Reachable squares and shortest paths on the grid (8-way, 5 ft each,
// difficult terrain costs double, no cutting wall corners).
// Furniture and objects you can squeeze past but not stand in (a figure
// would stand inside the table). Mirrors BULKY in server/socket/handlers.js.
export const BULKY = new Set('t21ERJ)BbC!cGKMN?}$'.split(''));
export const isBulky = (scene, x, y) => BULKY.has((scene.cells?.[y] || '')[x]);

// The figure walks straight between corners of its route: skip any waypoint
// it can reach in a straight line without touching a blocked square.
function clearLine(scene, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t + 0.5, y = a.y + (b.y - a.y) * t + 0.5;
    for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { const cx = Math.floor(x + ox), cy = Math.floor(y + oy); if (isBlocked(scene, cx, cy) || isBulky(scene, cx, cy)) return false; }
  }
  return true;
}
export function smoothPath(scene, from, path) {
  if (!scene || path.length < 2) return path;
  const out = [];
  let at = from, i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !clearLine(scene, at, path[j])) j--;
    out.push(path[j]); at = path[j]; i = j + 1;
  }
  return out;
}

export function reach(scene, from, budget, occupied) {
  // Dijkstra over squares. Cost is 5e movement (every step, diagonal or not,
  // is one square; difficult ground two). Among equally short routes it
  // prefers the one closest to a straight line (true length), then the one
  // with fewest turns - so a clear run is a straight walk, not a zigzag.
  const key = (x, y) => y * scene.grid.w + x;
  const best = new Map([[key(from.x, from.y), { c: 0, len: 0, turns: 0, dir: null }]]);
  const prev = new Map();
  const better = (a2, b2) => a2.c !== b2.c ? a2.c < b2.c : Math.abs(a2.len - b2.len) > 1e-6 ? a2.len < b2.len : a2.turns < b2.turns;
  const q = [[from.x, from.y]];
  while (q.length) {
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (better(best.get(key(q[i][0], q[i][1])), best.get(key(q[bi][0], q[bi][1])))) bi = i;
    const [x, y] = q.splice(bi, 1)[0];
    const cur = best.get(key(x, y));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (isBlocked(scene, nx, ny)) continue;
        if (dx && dy && (isBlocked(scene, x + dx, y) || isBlocked(scene, x, y + dy))) continue;
        const nc = cur.c + (isDifficult(scene, nx, ny) ? 2 : 1);
        if (nc > budget) continue;
        const dir = dx * 3 + dy;
        // (furniture costs extra length, so routes go round it when there's room)
        const cand = { c: nc, len: cur.len + (dx && dy ? Math.SQRT2 : 1) + (isBulky(scene, nx, ny) ? 3 : 0), turns: cur.turns + (cur.dir !== null && cur.dir !== dir ? 1 : 0), dir };
        const k = key(nx, ny);
        const old = best.get(k);
        if (!old || better(cand, old)) {
          // You can pass through other creatures but not stop on them.
          if (!old) q.push([nx, ny]);
          best.set(k, cand); prev.set(k, key(x, y));
        }
      }
    }
  }
  const cost = new Map([...best].map(([k, v]) => [k, v.c]));
  const W = scene.grid.w;
  const cells = [];
  for (const [k, c] of cost) {
    const x = k % W, y = Math.floor(k / W);
    if ((x !== from.x || y !== from.y) && !occupied.has(k) && !isBulky(scene, x, y)) cells.push({ x, y, c });
  }
  const pathTo = (x, y) => {
    let k = key(x, y);
    if (!cost.has(k)) return null;
    const pts = [];
    while (k !== key(from.x, from.y)) { pts.unshift({ x: k % W, y: Math.floor(k / W) }); k = prev.get(k); if (k === undefined) return null; }
    return pts;
  };
  return { cells, pathTo, has: (x, y) => cost.has(key(x, y)) && !occupied.has(key(x, y)) && !isBulky(scene, x, y) };
}

export default class WorldView {
  constructor(container, { callbacks = {}, quality = 'high' } = {}) {
    this.cb = callbacks;
    this.engine = new Engine(container, { quality });
    this.rig = new CameraRig(this.engine.camera, { minDist: 2.5, minPitch: 0.22 });
    this.rig.enableTiltCurve();
    this.particles = new Particles();
    this.engine.scene.add(this.particles.points);
    this.figures = new Map();   // tokenId -> { fig, sig, token }
    this.fx = new THREE.Group();
    this.engine.scene.add(this.fx);
    this.overlay = new THREE.Group(); // selection rings, reach tiles, path
    this.engine.scene.add(this.overlay);
    this.routeGroup = new THREE.Group(); // where you're walking to (kept across overlay refreshes)
    this.engine.scene.add(this.routeGroup);
    this.flying = [];           // projectiles and transient meshes
    this.selected = null;
    this.follow = true;
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.engine.addTicker((dt, t) => this._tick(dt, t));
    this._bindInput();
  }

  /* ---------------- place ---------------- */

  setScene(scene, { dmView }) {
    const sig = `${scene.id}|${scene.bg?.kind}|${scene.bg?.floor}|${scene.bg?.url || ''}|${dmView}|${(scene.cells || []).join('')}`;
    const sameScene = this.scene && this.scene.id === scene.id;
    this.scene = scene; // always the latest (tokens, doors, fog), even when the layout is unchanged
    if (sig === this.sceneSig) return;
    this.sceneSig = sig;
    this.dmView = dmView;
    const old = this.world;
    this.world = buildWorld(scene, { dmView, maxAniso: this.engine.renderer.capabilities.getMaxAnisotropy() });
    if (old) { this.engine.scene.remove(old.group); old.dispose(); }
    this.engine.scene.add(this.world.group);
    this.particles.emitters = this.particles.emitters.filter((e) => e.ambient);
    for (const e of this.world.emitters) this.particles.addEmitter(e);
    applyEnvironment(this.engine, this.world.env, this.world.bounds, this.particles, this.mood);
    this._moodKey = null;
    const { w, h } = scene.grid;
    this.rig.setLimits({ box: { x0: -1, x1: w + 1, z0: -1, z1: h + 1 }, maxDist: Math.max(w, h) * 2.2 });
    if (!sameScene) {
      // A new place: clear the figures (they're rebuilt for its tokens) and frame it.
      for (const { fig } of this.figures.values()) this.engine.scene.remove(fig.root);
      this.figures.clear();
      this._framed = false;
      this.cb.onSceneChange?.();
    }
    this._fogKey = null;
    this._buildFog(true);
  }

  frame(instant = false) {
    const { w, h } = this.scene.grid;
    const party = [...this.figures.values()].filter((f) => f.token.kind === 'pc' && !f.token.dead);
    const mine = this.myTokenId && this.figures.get(this.myTokenId);
    let tx = w / 2, tz = h / 2, dist = Math.max(w, h) * 1.05;
    if (mine) {
      // You, and the people near you worth talking to (a quest-giver across the room).
      const near = [mine, ...[...this.figures.values()].filter((f) => f.token.kind === 'npc' && !f.token.hidden && Math.max(Math.abs(f.token.x - mine.token.x), Math.abs(f.token.y - mine.token.y)) <= 14)];
      const xs = near.map((f) => f.token.x), zs = near.map((f) => f.token.y);
      tx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5; tz = (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5;
      dist = Math.min(dist, Math.max(12, (Math.max(...xs) - Math.min(...xs) + Math.max(...zs) - Math.min(...zs)) * 0.9 + 6));
    }
    else if (party.length) {
      tx = party.reduce((a, f) => a + f.token.x, 0) / party.length + 0.5;
      tz = party.reduce((a, f) => a + f.token.y, 0) / party.length + 0.5;
      dist = Math.min(dist, 16);
    }
    this.rig.flyTo({ tx, tz, yaw: 0, pitch: this.rig.pitchFor(dist), dist }, { instant }); // facing north again, like the 2D map
  }

  overview() {
    const { w, h } = this.scene.grid;
    this.rig.flyTo({ tx: w / 2, tz: h / 2, yaw: 0, pitch: 1.15, dist: Math.max(w, h) * 1.15 });
  }

  focusCell(x, y, { dist } = {}) { this.rig.flyTo({ tx: x + 0.5, tz: y + 0.5, ...(dist ? { dist } : {}) }); }

  /* ---------------- creatures ---------------- */

  // ctx: { charSheets, userId, isDM, myTokenId, combat, members }
  setTokens(tokens, ctx) {
    this.ctx = ctx;
    this.myTokenId = ctx.myTokenId;
    const seen = new Set();
    for (const t of tokens) {
      seen.add(t.id);
      const sheet = t.characterId ? ctx.charSheets?.[t.characterId] : null;
      const sig = figureSig(t, sheet);
      let rec = this.figures.get(t.id);
      if (!rec || rec.sig !== sig) {
        if (rec) this.engine.scene.remove(rec.fig.root);
        const fig = makeFigure(t, sheet);
        if (rec) { fig.root.position.copy(rec.fig.root.position); fig.yaw = fig.yawGoal = rec.fig.yaw; fig.path = rec.fig.path; }
        else { fig.place(t.x + sizeOff(t), t.y + sizeOff(t)); fig.yaw = fig.yawGoal = this._facingIn(t); }
        this.engine.scene.add(fig.root);
        rec = rec ? { ...rec, fig, sig, token: t } : { fig, sig, token: t, x: t.x, y: t.y };
        this.figures.set(t.id, rec);
      }
      // Moved: walk there along the real path (or snap if it's far / blocked).
      // A walk this client started: the server's echo of an earlier click
      // (clicking again mid-walk) must not re-route the figure.
      let stale = false;
      const goals = rec.localGoals || [];
      const hit = goals.findIndex((g) => g.x === t.x && g.y === t.y);
      if (hit === goals.length - 1) rec.localGoals = null; // caught up with the last click
      else if (hit >= 0) { stale = true; rec.localGoals = goals.slice(hit + 1); } // an older click, already overtaken
      if (!stale && (rec.x !== t.x || rec.y !== t.y)) {
        // Route from the square the figure is actually on (it may be mid-walk).
        const from = this._squareOf(rec);
        const path = this.scene ? reach(this.scene, from, 60, new Set()).pathTo(t.x, t.y) : null;
        if (path && path.length < 40) rec.fig.walk(this._waypoints(rec, from, path));
        else rec.fig.place(t.x + sizeOff(t), t.y + sizeOff(t));
        rec.x = t.x; rec.y = t.y;
      }
      rec.token = t;
      rec.sheet = sheet;
      const pcDown = t.kind === 'pc' && sheet && (sheet.currentHp ?? 1) <= 0;
      rec.fig.setDead(!!t.dead || pcDown);
      const hiddenToPlayers = t.hidden && !ctx.isDM;
      const fogged = !ctx.isDM && this.scene?.fogEnabled && !this._revealed?.has(`${t.x},${t.y}`);
      rec.fig.root.visible = !hiddenToPlayers && !fogged;
      if (t.hidden && ctx.isDM) rec.fig.setOpacity(0.45);
    }
    for (const [id, rec] of this.figures) {
      if (!seen.has(id)) { this.engine.scene.remove(rec.fig.root); this.figures.delete(id); if (this.selected === id) this.select(null); }
    }
    if (!this._framed && this.scene) { this._framed = true; this.frame(true); }
    this._refreshOverlay();
  }

  _facingIn(t) {
    // Face the middle of the scene so newcomers look into the room.
    if (!this.scene) return 0;
    return Math.atan2(this.scene.grid.w / 2 - t.x, this.scene.grid.h / 2 - t.y);
  }

  figureOf(id) { return this.figures.get(id)?.fig || null; }

  /* ---------------- fog ---------------- */

  setFog(scene, isDM) {
    const key = `${scene.id}|${scene.fogEnabled}|${isDM}|${(scene.revealed || []).join(';')}`;
    if (key === this._fogKey && this.scene === scene) return;
    const changed = key !== this._fogKey;
    this._fogKey = key;
    this._revealed = new Set(scene.revealed || []);
    this._fogDM = isDM;
    if (changed) this._buildFog(false);
  }

  // Fog of war: one soft layer, not a field of boxes. A mask texture (white
  // where the party has seen) is blurred so the edge feathers; a smoky lid
  // sits just above the walls and a dark sheet lies on the floor, so the
  // unknown reads as black from any angle. New sight fades in instead of
  // popping. The DM sees through it, dimmed.
  _fogMask() {
    // Seen squares as one solid shape (no seams between cells), then that
    // whole shape blurred once, so the edge of sight feathers softly.
    const { w, h } = this.scene.grid, P = 16, pad = P;
    const sharp = document.createElement('canvas');
    sharp.width = w * P + pad * 2; sharp.height = h * P + pad * 2;
    const sx = sharp.getContext('2d');
    sx.fillStyle = '#fff';
    for (const k of this._revealed) { const [cx, cy] = k.split(',').map(Number); sx.fillRect(pad + cx * P, pad + cy * P, P, P); }
    const c = document.createElement('canvas');
    c.width = w * P; c.height = h * P;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.filter = `blur(${P * 0.45}px)`;
    x.drawImage(sharp, -pad, -pad);
    x.filter = 'none';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false; // the shader samples with y = z / h, top row first
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _buildFog(sceneChanged) {
    const scene = this.scene;
    const on = scene && scene.fogEnabled && this._revealed;
    if (!on || sceneChanged || (this.fog && this.fog.dm !== !!this._fogDM)) {
      if (this.fog) {
        for (const m of this.fog.meshes) { this.engine.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
        this.fog.u.prev.value?.dispose(); this.fog.u.next.value?.dispose();
        this.fog = null;
      }
      if (!on) return;
    }
    const tex = this._fogMask();
    if (this.fog) {
      // Fade from what was seen to what is seen now.
      const u = this.fog.u;
      u.prev.value.dispose();
      u.prev.value = u.next.value; u.next.value = tex; u.mixK.value = 0;
      return;
    }
    const { w, h } = scene.grid;
    const dm = !!this._fogDM;
    const u = { prev: { value: tex }, next: { value: tex }, mixK: { value: 1 }, t: { value: 0 }, alpha: { value: dm ? 0.42 : 1 }, size: { value: new THREE.Vector2(w, h) } };
    const vert = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    const common = `uniform sampler2D prev; uniform sampler2D next; uniform float mixK; uniform float t; uniform float alpha; uniform vec2 size; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fogAt(){ vec2 m = vec2(vW.x / size.x, vW.z / size.y);
        float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
        float seen = mix(texture2D(prev, m).r, texture2D(next, m).r, smoothstep(0.0, 1.0, mixK));
        return inside * (1.0 - seen); }`;
    // The lid: drifting smoke over the unknown.
    const lidMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: u, vertexShader: vert,
      fragmentShader: `${common}
        void main(){ float f = fogAt(); if (f < 0.01) discard;
          float c = n(vW.xz * 0.9 + vec2(t * 0.06, t * 0.03)) * 0.6 + n(vW.xz * 2.3 - vec2(t * 0.09, -t * 0.05)) * 0.4;
          vec3 col = mix(vec3(0.006, 0.006, 0.009), vec3(0.04, 0.04, 0.05), c * c);
          col += vec3(0.03, 0.026, 0.022) * (1.0 - f); // the feathered edge catches a little light
          gl_FragColor = vec4(col, min(1.0, f * 1.25) * alpha); }`,
    });
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), lidMat);
    lid.position.set(w / 2, 1.48, h / 2);
    lid.renderOrder = 5;
    // The floor sheet: so a low camera doesn't see lit floor under the lid.
    const floorMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: u, vertexShader: vert,
      fragmentShader: `${common} void main(){ float f = fogAt(); if (f < 0.01) discard; gl_FragColor = vec4(0.01, 0.01, 0.014, f * alpha * 0.97); }`,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), floorMat);
    sheet.position.set(w / 2, 0.04, h / 2);
    sheet.renderOrder = 4;
    this.engine.scene.add(lid, sheet);
    this.fog = { meshes: [lid, sheet], u, dm };
  }

  /* ---------------- drawings ---------------- */

  // Sketches on the map (stored in 2D-map pixels, 56 per square) as crisp
  // screen-width lines lying on the floor.
  setStrokes(strokes) {
    const key = (strokes || []).map((st) => st.id).join(',');
    if (key === this._strokeKey) return;
    this._strokeKey = key;
    this.previewStroke(null);
    if (this.strokeGroup) { this.engine.scene.remove(this.strokeGroup); this.strokeGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    this.strokeGroup = new THREE.Group();
    for (const st of strokes || []) { const l = this._line(st.points, st.color, st.width); if (l) { l.userData.id = st.id; this.strokeGroup.add(l); } }
    this.engine.scene.add(this.strokeGroup);
  }
  previewStroke(points, color) {
    if (this.previewLine) { this.engine.scene.remove(this.previewLine); this.previewLine.geometry.dispose(); this.previewLine.material.dispose(); this.previewLine = null; }
    if (points && points.length > 1) { this.previewLine = this._line(points, color, 3); this.engine.scene.add(this.previewLine); }
  }
  _line(points, color, width = 3) {
    if (!points || points.length < 2) return null;
    const pos = [];
    for (const [px, py] of points) pos.push(px / 56, 0.05, py / 56);
    const g = new LineGeometry();
    g.setPositions(pos);
    const m = new LineMaterial({ color: new THREE.Color(color || '#ffe08a'), linewidth: Math.max(2.5, width * 1.2), worldUnits: false, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false });
    m.resolution.set(this.engine.size.w, this.engine.size.h);
    const l = new Line2(g, m);
    l.renderOrder = 6;
    return l;
  }
  // While erasing: the lines about to go fade out.
  highlightStrokes(ids) {
    for (const l of this.strokeGroup?.children || []) l.material.opacity = ids && ids.has(l.userData.id) ? 0.25 : 0.95;
  }
  strokesNear(px, pz, r = 0.3) {
    const out = [];
    const segDist = (ax, az, bx, bz) => {
      const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz;
      const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L)) : 0;
      return Math.hypot(ax + vx * t - px, az + vz * t - pz);
    };
    for (const st of this.scene?.strokes || []) {
      const pts = st.points || [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[Math.min(i + 1, pts.length - 1)];
        if (segDist(ax / 56, ay / 56, bx / 56, by / 56) < r) { out.push(st.id); break; }
      }
    }
    return out;
  }

  /* ---------------- selection, reach, paths ---------------- */

  select(tokenId, { showReach = true, budget = null } = {}) {
    this.selected = tokenId;
    this.reachInfo = null;
    const rec = tokenId && this.figures.get(tokenId);
    if (rec && showReach && this.scene) {
      const occ = new Set();
      for (const r of this.figures.values()) if (r !== rec && !r.token.dead) occ.add(r.token.y * this.scene.grid.w + r.token.x);
      this.reachInfo = reach(this.scene, { x: rec.token.x, y: rec.token.y }, budget ?? 60, occ);
      this.reachBudget = budget;
    }
    this._refreshOverlay();
    this.cb.onSelect?.(tokenId);
  }

  _refreshOverlay() {
    for (const o of [...this.overlay.children]) { if (o === this.pathPreview) continue; this.overlay.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    // A ring under every creature: gold for yours, red for foes, soft for
    // others; the creature whose turn it is gets a brighter, pulsing one.
    const turnId = this.ctx?.turnTokenId;
    for (const [id, rec] of this.figures) {
      if (!rec.fig.root.visible || rec.token.dead) continue;
      const t = rec.token;
      const s = t.size || 1;
      const color = id === this.selected ? '#ffe08a' : t.kind === 'monster' ? '#e06050' : t.ownerId === this.ctx?.userId ? '#d4a94f' : t.kind === 'pc' ? '#7fb0d8' : '#b0a890';
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36 * s, 0.44 * s, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: id === this.selected || id === turnId ? 0.95 : 0.5, toneMapped: false, depthWrite: false }));
      ring.userData = { follow: id, pulse: id === turnId };
      ring.renderOrder = 3;
      this.overlay.add(ring);
    }
    // Reachable squares for the selected creature.
    // Reachable squares only matter in a fight (your movement for the turn);
    // exploring, the hover path is guide enough.
    if (this.reachInfo && this.reachBudget && this.ctx?.combat?.active && this.ctx.combat.round > 0) {
      const pos = [];
      for (const c of this.reachInfo.cells) {
        const x = c.x, z = c.y, y = 0.025, i = 0.06;
        pos.push(x + i, y, z + i, x + i, y, z + 1 - i, x + 1 - i, y, z + i, x + 1 - i, y, z + i, x + i, y, z + 1 - i, x + 1 - i, y, z + 1 - i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const tiles = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
      tiles.renderOrder = 2;
      this.overlay.add(tiles);
    }
  }

  showPath(cells) {
    // Called on every hover frame: only rebuild when the route changed, and
    // keep one material for it.
    const key = cells && cells.length ? cells.map((c) => `${c.x},${c.y}`).join(' ') : '';
    if (key === this._pathKey) return;
    this._pathKey = key;
    if (this.pathPreview) { this.overlay.remove(this.pathPreview); this.pathPreview.geometry.dispose(); this.pathPreview = null; }
    if (key) {
      const g = new THREE.BufferGeometry();
      const pts = [];
      for (const c of cells) pts.push(c.x + 0.5, 0.06, c.y + 0.5);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this._pathMat ||= new THREE.PointsMaterial({ color: '#ffe08a', size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, toneMapped: false });
      this.pathPreview = new THREE.Points(g, this._pathMat);
      this.overlay.add(this.pathPreview);
    }
  }

  _groundAt(p) {
    const ch = (this.scene?.cells?.[Math.floor(p.z)] || '')[Math.floor(p.x)];
    if (ch === '/') return 0.125;
    if (ch === '^') return 0.22;
    return 0;
  }

  // Squares about to be built on (the build tool's preview).
  previewCells(cells, color = '#7fd0ff') {
    if (this.buildPreview) { this.engine.scene.remove(this.buildPreview); this.buildPreview.geometry.dispose(); this.buildPreview.material.dispose(); this.buildPreview = null; }
    if (!cells || !cells.length) return;
    const pos = [];
    for (const { x, y } of cells) { const a = x + 0.04, b = x + 0.96, c = y + 0.04, d = y + 0.96, h = 0.07; pos.push(a, h, c, a, h, d, b, h, c, b, h, c, a, h, d, b, h, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.buildPreview = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.buildPreview.renderOrder = 7;
    this.engine.scene.add(this.buildPreview);
  }

  /* ---- picking a creature up with the left button ---- */

  // Lift it: it floats a little and follows the pointer smoothly.
  liftToken(tokenId) {
    const rec = this.figures.get(tokenId);
    if (!rec) return false;
    rec.lifted = { from: rec.fig.root.position.clone(), x: rec.x, y: rec.y };
    rec.fig.path = [];
    return true;
  }
  dragToken(tokenId, px, pz) {
    const rec = this.figures.get(tokenId);
    if (!rec?.lifted) return;
    const p = rec.fig.root.position;
    rec.dragGoal = { x: px, z: pz };
    if (!rec.dragging) { rec.dragging = true; p.y = 0.3; }
    rec.fig.faceToward(px, pz);
  }
  // Set it down on a square (bounce), or put it back where it was.
  dropToken(tokenId, cell) {
    const rec = this.figures.get(tokenId);
    if (!rec?.lifted) return;
    const off = sizeOff(rec.token);
    if (cell) {
      rec.fig.place(cell.x + off, cell.y + off);
      rec.x = cell.x; rec.y = cell.y; // the server's echo won't replay a walk
    } else rec.fig.root.position.copy(rec.lifted.from);
    rec.fig.root.position.y = 0;
    rec.dropBounce = 0.22;
    rec.lifted = null; rec.dragging = false; rec.dragGoal = null;
    this.showPath(null);
  }

  // Walk a figure right away (before the server confirms) so it feels instant.
  // Where you're headed: a glowing ring on the destination square and a trail
  // of dots along the way that the figure eats up as it walks.
  _showRoute(tokenId, path) {
    this._clearRoute();
    // dots every third of a square along the (smoothed) way
    const rec0 = this.figures.get(tokenId);
    const way = [{ x: rec0 ? rec0.fig.root.position.x - 0.5 : path[0].x, y: rec0 ? rec0.fig.root.position.z - 0.5 : path[0].y }, ...path];
    const pts = [];
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1], b = way[i], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 3));
      for (let k = 1; k <= n; k++) pts.push(a.x + 0.5 + (b.x - a.x) * k / n, 0.05, a.y + 0.5 + (b.y - a.y) * k / n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const dots = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffe08a', size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    const last = path[path.length - 1];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    ring.position.set(last.x + 0.5, 0.05, last.y + 0.5);
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.95, toneMapped: false }));
    pin.position.set(last.x + 0.5, 0.55, last.y + 0.5);
    this.routeGroup.add(dots, ring, pin);
    this.route = { tokenId, dots, ring, pin, n: pts.length / 3, t: 0, fade: null };
  }
  _clearRoute() {
    if (!this.route) return;
    for (const m of [this.route.dots, this.route.ring, this.route.pin]) { this.routeGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.route = null;
  }
  _tickRoute(dt) {
    const r = this.route;
    if (!r) return;
    r.t += dt;
    const fig = this.figures.get(r.tokenId)?.fig;
    const pulse = 1 + Math.sin(r.t * 6) * 0.08;
    r.ring.scale.set(pulse, 1, pulse);
    r.pin.position.y = 0.55 + Math.abs(Math.sin(r.t * 4)) * 0.1;
    r.pin.rotation.y += dt * 2;
    if (fig) {
      // hide the dots already walked over
      const left = fig.path.length;
      // hide dots behind the walker
      const p = fig.root.position, pos = r.dots.geometry.attributes.position;
      let first = 0;
      while (first < r.n - 1 && Math.hypot(pos.getX(first) - p.x, pos.getZ(first) - p.z) < 0.35) first++;
      if (r.first === undefined || first > r.first) r.first = first;
      r.dots.geometry.setDrawRange(r.first, r.n - r.first);
      if (!left && r.fade === null) r.fade = 0.5;
    } else if (r.fade === null) r.fade = 0.3;
    if (r.fade !== null) {
      r.fade -= dt;
      const k = Math.max(0, r.fade / 0.5);
      r.ring.material.opacity = 0.9 * k; r.pin.material.opacity = 0.95 * k;
      if (r.fade <= 0) this._clearRoute();
    }
  }

  walkLocal(tokenId, path, from) {
    const rec = this.figures.get(tokenId);
    if (!rec || !path?.length) return;
    // The route was planned from `from`; if the figure is somewhere else
    // (mid-walk, or the fight's square differs from where it's drawn),
    // first find the way from where it really stands to `from`.
    const cur = this._squareOf(rec);
    let full = path;
    if (from && (from.x !== cur.x || from.y !== cur.y)) full = [...(reach(this.scene, cur, 60, new Set()).pathTo(from.x, from.y) || []), ...path];
    this._showRoute(tokenId, smoothPath(this.scene, cur, full));
    rec.fig.walk(this._waypoints(rec, cur, full));
    const last = path[path.length - 1];
    rec.x = last.x; rec.y = last.y;
    rec.localGoals = [...(rec.localGoals || []), { x: last.x, y: last.y }].slice(-12);
  }

  // World points for a walk over `squares` starting on square `cur`. A figure
  // stopped mid-stride is off its square's centre, and a straight line from
  // there can clip a wall corner the route (planned centre to centre) clears;
  // so it steps to the centre of the square it's on first. That short step
  // stays inside the square, so it can't cross into anything.
  _waypoints(rec, cur, squares) {
    const off = sizeOff(rec.token), p = rec.fig.root.position;
    const pts = smoothPath(this.scene, cur, squares).map((q) => ({ x: q.x + off, z: q.y + off }));
    const c = { x: cur.x + off, z: cur.y + off };
    if (Math.hypot(p.x - c.x, p.z - c.z) > 0.05 && pts.length && (pts[0].x !== c.x || pts[0].z !== c.z)) pts.unshift(c);
    return pts;
  }

  // The square a figure is standing on right now (mid-walk, the one under
  // its feet), for starting a new route from where it really is.
  _squareOf(rec) {
    const off = sizeOff(rec.token), p = rec.fig.root.position;
    const sq = { x: Math.round(p.x - off), y: Math.round(p.z - off) };
    if (!this.scene || !isBlocked(this.scene, sq.x, sq.y)) return sq;
    // Rounded into a wall: the nearest open square touching where it stands.
    let best = null, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = sq.x + dx, y = sq.y + dy;
      if (isBlocked(this.scene, x, y)) continue;
      const d = Math.hypot(x + off - p.x, y + off - p.z);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best || { x: rec.x, y: rec.y };
  }

  /** Where a figure is standing right now, as a grid square. */
  squareOf(tokenId) { const rec = this.figures.get(tokenId); return rec ? this._squareOf(rec) : null; }

  /* ---------------- effects ---------------- */

  // radius: a wide ring that sweeps out that far (a search), instead of a ping.
  ping(x, y, color = '#ffe08a', radius = 0) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius ? 0.29 : 0.2, 0.32, radius ? 64 : 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, depthWrite: false }));
    ring.position.set(x + 0.5, 0.08, y + 0.5);
    this.fx.add(ring);
    const grow = radius ? radius / 0.32 - 1 : 4;
    this.flying.push({ mesh: ring, t: 0, dur: radius ? 1.8 : 1.4, update: (k) => { ring.scale.setScalar(1 + (radius ? 1 - (1 - k) ** 2 : k) * grow); ring.material.opacity = radius ? Math.min(1, (1 - k) * 2) : 1 - k; } });
    this.particles.burst(x + 0.5, 0.3, y + 0.5, 18, { from: color, to: '#ffffff', speed: 1.2, up: 1.5, grav: -1, life: 0.9, size: 0.12 });
  }

  // A full attack, played out: face, wind up, (projectile), impact, react.
  playAttack(ev, { onImpact } = {}) {
    const a = this.figures.get(ev.attackerTokenId), d = this.figures.get(ev.targetTokenId);
    if (!a || !d) { onImpact?.(); return; }
    const [c0, c1] = colorsFor(ev.damageType, ev.style);
    const tp = d.fig.root.position, ap = a.fig.root.position;
    a.fig.faceToward(tp.x, tp.z);
    if (ev.hit) d.fig.faceToward(ap.x, ap.z);
    const impact = () => {
      const hy = 0.55 * (d.fig.scale || 1);
      if (ev.hit) {
        d.fig.play('hurt');
        this.particles.burst(tp.x, hy, tp.z, ev.crit ? 46 : 24, { from: c0, to: c1, speed: ev.crit ? 3.4 : 2.4, up: 0.8, life: 0.55, size: ev.crit ? 0.2 : 0.15 });
        if (ev.style === 'melee') this._slash(tp, ap, c0);
        if (ev.crit) this.shake = 0.35;
      } else {
        this.particles.burst(tp.x, hy, tp.z, 8, { from: '#c8c8c8', to: '#808080', speed: 1, life: 0.4, size: 0.08 });
      }
      onImpact?.();
    };
    const style = ev.style === 'ranged' ? 'shoot' : ev.style === 'spell' ? 'cast' : 'melee';
    if (ev.style === 'melee' || a.fig.kind !== 'biped') {
      a.fig.play(style === 'shoot' || style === 'cast' ? style : 'melee', { onImpact: style === 'melee' ? impact : () => this._projectile(ap, tp, ev, c0, c1, impact) });
    } else {
      a.fig.play(style, { onImpact: () => this._projectile(ap, tp, ev, c0, c1, impact) });
    }
  }

  _projectile(from, to, ev, c0, c1, onHit) {
    const spell = ev.style === 'spell';
    const start = new THREE.Vector3(from.x, 0.7, from.z), end = new THREE.Vector3(to.x, 0.55, to.z);
    if (!ev.hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2));
    let mesh;
    if (spell) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: c0, toneMapped: false }));
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d8c8a0' }));
    }
    mesh.position.copy(start);
    mesh.lookAt(end);
    this.fx.add(mesh);
    const dist = start.distanceTo(end);
    const dur = Math.max(0.18, dist / (spell ? 9 : 16));
    const light = spell ? new THREE.PointLight(c1, 3, 4, 1.5) : null;
    if (light) mesh.add(light);
    this.flying.push({
      mesh, t: 0, dur,
      update: (k) => {
        mesh.position.lerpVectors(start, end, k);
        mesh.position.y += Math.sin(k * Math.PI) * (spell ? 0.2 : 0.35);
        if (spell) this.particles.spawn({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.2, vz: (Math.random() - 0.5) * 0.3, life: 0.35, size: 0.16, from: c0, to: c1, drag: 2 });
      },
      done: onHit,
    });
  }

  _slash(at, from, color) {
    const dir = Math.atan2(at.x - from.x, at.z - from.z);
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 24, 1, -1.1, 2.2), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    arc.position.set(at.x, 0.6, at.z);
    arc.rotation.set(-0.3, dir, 0.6);
    this.fx.add(arc);
    this.flying.push({ mesh: arc, t: 0, dur: 0.28, update: (k) => { arc.material.opacity = 1 - k; arc.scale.setScalar(1 + k * 0.5); } });
  }

  heal(tokenId) {
    const r = this.figures.get(tokenId);
    if (!r) return;
    const p = r.fig.root.position;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.2 + Math.random() * 0.25;
      this.particles.spawn({ x: p.x + Math.cos(a) * rr, y: 0.1 + Math.random() * 0.3, z: p.z + Math.sin(a) * rr, vy: 0.8 + Math.random() * 0.6, life: 0.9 + Math.random() * 0.5, size: 0.1, from: '#c8ffb0', to: '#4aff8a', drag: 0.8 });
    }
  }

  celebrate(tokenId) {
    const r = this.figures.get(tokenId);
    if (!r) return;
    r.fig.play('cheer');
    const p = r.fig.root.position;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    beam.position.set(p.x, 3, p.z);
    this.fx.add(beam);
    this.flying.push({ mesh: beam, t: 0, dur: 2.4, update: (k) => { beam.material.opacity = Math.sin(k * Math.PI) * 0.55; beam.rotation.y = k * 3; } });
    for (let i = 0; i < 60; i++) this.particles.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: Math.random() * 0.4, z: p.z + (Math.random() - 0.5) * 0.8, vy: 1.5 + Math.random() * 2.5, life: 1.2 + Math.random(), size: 0.12, from: '#fff6c8', to: '#ffc84a', drag: 0.5 });
  }

  /* ---------------- picking ---------------- */

  _ray(cx, cy) { this.raycaster.setFromCamera(this.engine.ndc(cx, cy), this.engine.camera); return this.raycaster.ray; }

  cellAt(cx, cy) {
    const hit = this._ray(cx, cy).intersectPlane(this._plane, new THREE.Vector3());
    if (!hit || !this.scene) return null;
    const x = Math.floor(hit.x), y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= this.scene.grid.w || y >= this.scene.grid.h) return null;
    return { x, y, px: hit.x, pz: hit.z };
  }

  // The creature under the pointer (a generous cylinder around each figure).
  tokenAt(cx, cy) {
    const ray = this._ray(cx, cy);
    let best = null, bestT = Infinity;
    const v = new THREE.Vector3();
    for (const [id, rec] of this.figures) {
      if (!rec.fig.root.visible) continue;
      const p = rec.fig.root.position;
      const s = (rec.token.size || 1) * 0.42;
      const hgt = (rec.token.size || 1) * 1.1 * (rec.fig.scale || 1);
      // Closest approach of the ray to the figure's vertical axis.
      for (let k = 0; k <= 4; k++) {
        v.set(p.x, (hgt * k) / 4, p.z);
        const d = ray.distanceToPoint(v);
        if (d < s) { const t = ray.origin.distanceTo(v); if (t < bestT) { bestT = t; best = id; } break; }
      }
    }
    return best ? this.figures.get(best).token : null;
  }

  /* ---------------- frame ---------------- */

  _tick(dt, t) {
    // Keyboard camera.
    const k = this.keys;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (f || s) { this.rig.nudge(f, s, dt); this.follow = false; }
    const turn = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0);
    if (turn) this.rig.orbit(turn * 1.6 * dt, 0);
    // Follow my hero while they walk.
    const mine = this.myTokenId && this.figures.get(this.myTokenId);
    if (this.follow && mine && mine.fig.path.length) {
      const p = mine.fig.root.position;
      this.rig.goal.tx += (p.x - this.rig.goal.tx) * Math.min(1, dt * 3);
      this.rig.goal.tz += (p.z - this.rig.goal.tz) * Math.min(1, dt * 3);
    }
    // Keep rendering smoothly while anything moves.
    const g = this.rig.goal, c0 = this.rig.cur;
    const moving = k.size || this.shake > 0 || (this.flying && this.flying.length)
      || Math.abs(g.tx - c0.tx) + Math.abs(g.tz - c0.tz) + Math.abs(g.yaw - c0.yaw) + Math.abs(g.pitch - c0.pitch) + Math.abs(g.dist - c0.dist) > 0.002
      || [...this.figures.values()].some((r) => r.fig.path.length || r.fig.action || r.lifted || (r.fig.dead && r.fig.deadT < 1.5));
    if (moving) this.engine.poke(400);
    this.rig.update(dt);
    if (this.shake > 0) {
      this.shake -= dt;
      const a = this.shake * 0.15;
      this.engine.camera.position.x += (Math.random() - 0.5) * a;
      this.engine.camera.position.y += (Math.random() - 0.5) * a;
    }
    const c = this.rig.cur;
    CUTAWAY.center.value.set(c.tx, 0, c.tz);
    CUTAWAY.dir.value.set(Math.sin(c.yaw), Math.cos(c.yaw));
    this.world?.update(t);
    this.particles.setViewportHeight(this.engine.size.h);
    this.particles.update(dt, t);
    for (const rec of this.figures.values()) rec.fig.update(dt, t);
    for (const ring of this.overlay.children) {
      const id = ring.userData?.follow;
      if (!id) continue;
      const rec = this.figures.get(id);
      if (rec) ring.position.set(rec.fig.root.position.x, 0.03, rec.fig.root.position.z);
      if (ring.userData.pulse) ring.material.opacity = 0.6 + Math.sin(t * 5) * 0.35;
    }
    this.flying = this.flying.filter((p) => {
      p.t += dt;
      const kk = Math.min(1, p.t / p.dur);
      p.update?.(kk);
      if (kk >= 1) { this.fx.remove(p.mesh); p.mesh.geometry?.dispose(); p.mesh.material?.dispose(); p.done?.(); return false; }
      return true;
    });
    if (this.fogMesh) this.fogMesh.material.uniforms.t.value = t;
    this._tickRoute(dt);
    if (this.objGroup) this.objGroup.traverse((m) => { if (m.userData.pulse) m.material.opacity = 0.25 + Math.abs(Math.sin(t * 2.5)) * 0.35; });
    if (this.fog) { this.fog.u.t.value = t; if (this.fog.u.mixK.value < 1) this.fog.u.mixK.value = Math.min(1, this.fog.u.mixK.value + dt * 2.2); }
    if (this.strokeGroup || this.previewLine) {
      const { w, h } = this.engine.size;
      this.strokeGroup?.children.forEach((l) => l.material.resolution.set(w, h));
      this.previewLine?.material.resolution.set(w, h);
    }
    for (const rec of this.figures.values()) {
      if (rec.dragGoal) {
        const p = rec.fig.root.position, k = 1 - Math.exp(-dt * 22);
        p.x += (rec.dragGoal.x - p.x) * k; p.z += (rec.dragGoal.z - p.z) * k;
        p.y = 0.3 + Math.sin(t * 6) * 0.03;
      } else if (rec.dropBounce > 0) {
        rec.dropBounce = Math.max(0, rec.dropBounce - dt);
        rec.fig.root.position.y = this._groundAt(rec.fig.root.position) + Math.abs(Math.sin((0.22 - rec.dropBounce) / 0.22 * Math.PI)) * 0.06;
      } else {
        // stand on what's underfoot (a bridge deck is a little above the floor)
        const p = rec.fig.root.position, gy = this._groundAt(p);
        p.y += (gy - p.y) * Math.min(1, dt * 12);
      }
    }
    this.cb.onFrame?.();
  }

  project(x, y, z) { return this.engine.project(new THREE.Vector3(x, y, z)); }
  projectToken(id, h = 1.25) {
    const rec = this.figures.get(id);
    if (!rec) return null;
    const p = rec.fig.root.position;
    const out = this.engine.project(new THREE.Vector3(p.x, h * (rec.token.size || 1) * (rec.fig.scale || 1), p.z));
    out.visible = out.visible && rec.fig.root.visible;
    return out;
  }

  /* ---------------- input (camera only; intents go to React) ---------------- */

  _bindInput() {
    const el = this.engine.renderer.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let g = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or stale id */ }
      // A mouse is one pointer: forget any whose release we never saw, or the
      // next click would read as a two-finger gesture.
      if (e.pointerType !== 'touch') pointers.clear();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [p1, p2] = [...pointers.values()]; g = { kind: 'two', d: Math.hypot(p1.x - p2.x, p1.y - p2.y), a: Math.atan2(p2.y - p1.y, p2.x - p1.x), m: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } }; return; }
      g = { kind: 'press', b: e.button, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType === 'touch' };
      this.cb.onPointerDown?.(e, g);
    });
    for (const ev of ['pointerdown', 'pointermove', 'wheel']) el.addEventListener(ev, () => this.engine.poke(), { passive: true });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (g?.kind === 'two' && pointers.size >= 2) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), a = Math.atan2(p2.y - p1.y, p2.x - p1.x), m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        this.rig.zoomAt(g.d / Math.max(1, d), null);
        let da = a - g.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        this.rig.orbit(da, (m.y - g.m.y) * 0.004);
        Object.assign(g, { d, a, m });
        this.follow = false;
        return;
      }
      if (!g || g.kind !== 'press') { this.cb.onHoverMove?.(e); return; }
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.x = e.clientX; g.y = e.clientY;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) g.moved = true;
      if (!g.moved) return;
      if (this.cb.onDragMove?.(e, g)) return; // React claimed the drag (token, measure, paint…)
      if (g.b === 2) this.rig.orbit(-dx * 0.005, dy * 0.004);
      else this.rig.pan(dx, dy, this.engine.size.h);
      this.follow = false;
    });
    const up = (e) => {
      if (e.pointerType !== 'touch') pointers.clear(); else pointers.delete(e.pointerId);
      if (g?.kind === 'two') { if (!pointers.size) g = null; return; }
      if (g && g.kind === 'press') this.cb.onPointerUp?.(e, g);
      g = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', (e) => this.cb.onDoubleClick?.(e));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const c = this.cellAt(e.clientX, e.clientY);
      this.rig.zoomAt(Math.exp(e.deltaY * 0.0012), c ? { x: c.px, z: c.pz } : null);
    }, { passive: false });
  }

  /* ---------------- the DM's objects ---------------- */

  // Traps, hidden passages, chests, levers, notes, exits and events. Players
  // only receive the ones they know about; the DM sees all, with the hidden
  // ones as faint outlines.
  setObjects(objects, isDM) {
    const key = JSON.stringify([isDM, (objects || []).map((o) => [o.id, o.x, o.y, o.kind, o.hidden, o.used, (o.targets || []).length])]);
    if (key === this._objKey) return;
    this._objKey = key;
    if (this.objGroup) { this.engine.scene.remove(this.objGroup); this.objGroup.traverse((m) => { m.geometry?.dispose(); if (m.material && m.material !== MATS.solid && m.material !== MATS.metal && m.material !== MATS.glow) m.material.dispose?.(); }); }
    this.objGroup = new THREE.Group();
    this.objects = objects || [];
    const COL = { trap: '#e0503a', secret: '#6aa8ff', chest: '#d4a94f', lever: '#c8ccd2', note: '#f0e6cc', exit: '#7be08a', zone: '#b07aff' };
    for (const o of this.objects) {
      const cx = o.x + 0.5, cz = o.y + 0.5;
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      const k = new Kit(Math.random), m = new Kit(Math.random), gl = new Kit(Math.random);
      if (o.kind === 'chest') {
        k.box(0.5, 0.28, 0.34, '#6b4228', { y: 0.14, vary: 0.05 });
        k.cyl(0.17, 0.17, 0.5, '#7a4a2e', { y: 0.28, rz: Math.PI / 2, arc: Math.PI, seg: 10, ry: 0, rx: 0 });
        m.box(0.52, 0.04, 0.36, '#d4a94f', { y: 0.27 });
        m.box(0.06, 0.08, 0.02, '#d4a94f', { y: 0.24, z: 0.18 });
        if (o.used) g.rotation.y = 0.3;
      } else if (o.kind === 'lever') {
        k.box(0.22, 0.08, 0.16, '#4b4f55', { y: 0.04 });
        m.limb([0, 0.06, 0], [0, 0.5, o.used ? 0.22 : -0.22], 0.02, 0.016, '#9aa0a8', { seg: 5 });
        k.ball(0.045, '#7a2f2f', { y: 0.52, z: o.used ? 0.23 : -0.23 });
      } else if (o.kind === 'note') {
        k.box(0.22, 0.006, 0.3, '#efe4c8', { y: 0.006, ry: 0.4 });
        k.box(0.14, 0.004, 0.01, '#5a4a3a', { y: 0.011, z: -0.05, ry: 0.4 });
        k.box(0.14, 0.004, 0.01, '#5a4a3a', { y: 0.011, z: 0.0, ry: 0.4 });
      } else if (o.kind === 'exit') {
        gl.torus(0.36, 0.025, COL.exit, { y: 0.03, rx: Math.PI / 2, tseg: 24 });
        gl.cone(0.08, 0.16, COL.exit, { y: 0.5, rx: Math.PI, seg: 4 });
      } else if (o.kind === 'trap' && !o.hidden) {
        m.box(0.62, 0.03, 0.62, '#5a5650', { y: 0.015 });
        for (let i = 0; i < 9; i++) m.cone(0.025, 0.1, '#c8ccd2', { x: ((i % 3) - 1) * 0.16, y: 0.07, z: (Math.floor(i / 3) - 1) * 0.16, seg: 4 });
      }
      for (const [kit, mat] of [[k, MATS.solid], [m, MATS.metal], [gl, MATS.glow]]) { const mesh = meshOf(kit, mat); if (mesh) g.add(mesh); }
      // The DM sees where every object is (and what it is): a coloured ring,
      // dashed when players can't see it yet.
      if (isDM) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL[o.kind], transparent: true, opacity: o.hidden ? 0.45 : 0.85, depthWrite: false, toneMapped: false }));
        ring.position.y = 0.04;
        g.add(ring);
        if (o.hidden) {
          const fill = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL[o.kind], transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
          fill.position.y = 0.035; g.add(fill);
        }
        // lines to the doors a lever works
        for (const t of o.targets || []) {
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(t.x + 0.5 - cx, 0.08, t.y + 0.5 - cz)]);
          g.add(new THREE.Line(geo, new THREE.LineDashedMaterial({ color: COL.lever, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.8 })).computeLineDistances());
        }
      } else if (!o.hidden && o.kind !== 'exit' && !o.used && o.trigger === 'touch') {
        // something you can use: a soft glint
        gl.parts.length = 0;
        const glint = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.38, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
        glint.position.y = 0.03; glint.userData.pulse = true; g.add(glint);
      }
      g.userData.obj = o;
      this.objGroup.add(g);
    }
    this.engine.scene.add(this.objGroup);
  }
  objectAt(cx, cy) {
    const c = this.cellAt(cx, cy);
    if (!c) return null;
    return (this.objects || []).find((o) => o.x === c.x && o.y === c.y) || null;
  }

  /* ---------------- patrol routes (DM) ---------------- */
  setPatrols(tokens, isDM, draft) {
    if (this.patrolGroup) { this.engine.scene.remove(this.patrolGroup); this.patrolGroup.traverse((m) => { m.geometry?.dispose(); m.material?.dispose?.(); }); this.patrolGroup = null; }
    if (!isDM) return;
    const routes = (tokens || []).filter((t) => t.patrol?.length > 1).map((t) => ({ pts: [...t.patrol, t.patrol[0]], col: t.alerted ? '#ff5a4a' : '#ff9a5a' }));
    if (draft?.pts?.length) routes.push({ pts: draft.pts, col: '#ffe08a' });
    if (!routes.length) return;
    this.patrolGroup = new THREE.Group();
    for (const r of routes) {
      const geo = new THREE.BufferGeometry().setFromPoints(r.pts.map((p) => new THREE.Vector3(p.x + 0.5, 0.07, p.y + 0.5)));
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: r.col, dashSize: 0.2, gapSize: 0.12, transparent: true, opacity: 0.85, toneMapped: false }));
      line.computeLineDistances();
      this.patrolGroup.add(line);
      for (const p of r.pts) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: r.col, toneMapped: false })); d.position.set(p.x + 0.5, 0.07, p.y + 0.5); this.patrolGroup.add(d); }
    }
    this.engine.scene.add(this.patrolGroup);
  }

  // A mood for the place, set by the DM: time of day, weather, brightness.
  setMood(mood) {
    const key = JSON.stringify(mood || {});
    if (key === this._moodKey || !this.world) return;
    this._moodKey = key;
    this.mood = mood || {};
    applyEnvironment(this.engine, this.world.env, this.world.bounds, this.particles, this.mood);
    const light = this.mood.light ?? 1;
    for (const l of this.world.lights || []) l.userData.mul = 0.6 + 0.4 * light;
  }

  dispose() {
    this.world?.dispose();
    this.particles.dispose();
    this.engine.dispose();
  }
}

const sizeOff = (t) => (t.size || 1) / 2;

function figureSig(t, sheet) {
  if (t.kind === 'pc' && sheet) {
    const look = resolveLook(sheet);
    return `pc|${look.body}|${look.skin}|${look.hair}|${look.hairStyle}|${look.beard}|${look.eyes}|${look.headwear}|${look.cls.garb}|${look.cls.trim}|${look.mark}|${look.classKey}|${sheet.raceIndex || sheet.race}|${sheet.subrace || ''}|${t.size || 1}`;
  }
  return `${t.kind}|${artForToken(t)}|${t.label}|${t.color}|${t.body || ''}|${t.size || 1}`;
}

function makeFigure(t, sheet) {
  let fig;
  if (t.kind === 'pc' && sheet) {
    const look = resolveLook(sheet);
    fig = heroFigure(look, { seed: sheet.name, size: SMALL_RACES.test(sheet.raceIndex || sheet.race || '') ? 'small' : 'medium' });
  } else {
    const art = t.kind === 'npc' ? 'humanoid' : artForToken(t) || 'humanoid';
    fig = creatureFigure(art, { seed: t.label || t.id, color: t.color, label: t.label || '', body: t.body, resolveLook });
  }
  if ((t.size || 1) > 1) fig.body.scale.multiplyScalar(t.size * 0.8);
  return fig;
}
