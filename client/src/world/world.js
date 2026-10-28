import * as THREE from 'three';
import { TILES, FLOOR_THEMES, cellRandom, tileAt } from '../data/tiles';
import Kit, { MATS, meshOf, seeded } from './kit';
import { floorBones, PROPS, WALLS, WALL_H, isWallChar } from './props';

// Builds a scene's place: floor, walls, props, water, lava, lights and the
// environment around it, all from the scene's tile grid. 1 unit = 5 ft:
// cell (x, y) spans x..x+1, z = y..y+1.

const FLOOR_PX = 96;
const MAX_LIGHTS = 14;

const charAt = (scene, x, y) => {
  const row = scene.cells?.[y] || '';
  return row[x] || (scene.bg?.floor === 'grass' ? ',' : '.');
};

// What kind of place this is — it decides sky, light and air.
export function environmentOf(scene) {
  const { w, h } = scene.grid;
  const counts = {};
  let walls = 0, border = 0, borderWalls = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = charAt(scene, x, y);
      counts[ch] = (counts[ch] || 0) + 1;
      if (isWallChar(ch)) walls++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border++; if (isWallChar(ch) || ch === 'T' || ch === 'h') borderWalls++; }
    }
  }
  const floor = scene.bg?.floor || 'stone';
  const enclosed = borderWalls / Math.max(1, border) > 0.55;
  const cave = (counts.v || 0) > walls * 0.4 && (counts.v || 0) > 4;
  const lava = (counts.l || 0) > 2;
  const outdoorFloor = ['grass', 'dirt', 'sand', 'snow'].includes(floor);
  const outdoor = !cave && (outdoorFloor ? !enclosed : walls / (w * h) < 0.08 && !enclosed);
  let kind = outdoor ? 'outdoor' : cave ? 'cave' : 'indoor';
  if (lava) kind = 'volcanic';
  return { kind, floor, snow: floor === 'snow' || (counts.n || 0) > w * h * 0.3, warm: (counts.c || 0) + (counts.G || 0) + (counts.I || 0) > 0 };
}

// The floor: the same tile drawings as the 2d map, painted into a texture.
// Cobbles laid across the whole street in running rows (not one block of
// them per square): rounded setts of mixed size and tone.
function cobbles(g, scene, paint, cell, near) {
  const { w, h } = scene.grid;
  g.fillStyle = '#46433e';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(x, y)) g.fillRect(x * cell, y * cell, cell, cell);
  const rnd = seeded(0.4321);
  const rowH = cell * 0.3, stoneW = cell * 0.34;
  for (let ry = 0; ry * rowH < h * cell; ry++) {
    const off = (ry % 2) * stoneW * 0.5 + (rnd() - 0.5) * stoneW * 0.3;
    for (let sx = -stoneW + off; sx < w * cell; sx += stoneW * (0.9 + rnd() * 0.25)) {
      const cx = sx + stoneW / 2, cy = ry * rowH + rowH / 2;
      const gx = Math.floor(cx / cell), gy = Math.floor(cy / cell);
      if (gx < 0 || gy < 0 || gx >= w || gy >= h || !near(gx, gy)) continue;
      const tone = 0x56 + Math.floor(rnd() * 24);
      g.fillStyle = `rgb(${tone + 6},${tone + 2},${tone - 4})`;
      g.beginPath();
      g.ellipse(cx, cy, stoneW * (0.4 + rnd() * 0.06), rowH * (0.38 + rnd() * 0.06), (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function floorTexture(scene, maxAniso, dmView) {
  const { w, h } = scene.grid;
  const cell = Math.max(24, Math.min(FLOOR_PX, Math.floor(4096 / Math.max(w, h))));
  const cv = document.createElement('canvas');
  cv.width = w * cell; cv.height = h * cell;
  const ctx = cv.getContext('2d');
  const theme = FLOOR_THEMES[scene.bg?.floor] || FLOOR_THEMES.stone;
  const base = scene.bg?.floor === 'grass' ? ',' : '.';
  const wet = (ch) => ch === 'l' || ch === '~' || ch === 'q';

  // What ground each square shows. Floors are themselves; the ground under
  // furniture, walls and hidden traps is whatever floor surrounds it (so a
  // table on a carpet stands on carpet); bones are 3D objects on plain ground.
  const own = (ch) => {
    const t = tileAt(ch);
    if (ch === 'z') return '.';
    if (t.cat === 'floor' && !wet(ch)) return ch;
    if (t.cat === 'wall' && ch === 'v') return ':';
    return null;
  };
  const paint = [];
  for (let y = 0; y < h; y++) { paint.push([]); for (let x = 0; x < w; x++) paint[y].push(own(charAt(scene, x, y))); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (paint[y][x]) continue;
    const votes = {};
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const p = paint[y + dy]?.[x + dx];
      if (p && own(charAt(scene, x + dx, y + dy))) votes[p] = (votes[p] || 0) + 1;
    }
    const best = Object.entries(votes).sort((a2, b2) => b2[1] - a2[1])[0];
    paint[y][x] = best ? best[0] : base;
  }

  // 1. The commonest ground everywhere, then each other kind as a whole
  //    layer, let in through a blurred, wobbly mask of where it lies, so
  //    kinds of ground run into each other instead of meeting at square
  //    edges. (Largest first, so small patches sit on top.)
  const count = {};
  for (const row of paint) for (const p of row) count[p] = (count[p] || 0) + 1;
  const kinds = Object.keys(count).sort((a2, b2) => count[b2] - count[a2]);
  const layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height;
  const lx = layer.getContext('2d');
  const msk = document.createElement('canvas'); msk.width = cv.width; msk.height = cv.height;
  const mkx = msk.getContext('2d');
  const sharpC = document.createElement('canvas'); sharpC.width = cv.width; sharpC.height = cv.height;
  const sharp = sharpC.getContext('2d');
  const paintKind = (g, kind, near) => {
    if (kind === 'k') { cobbles(g, scene, paint, cell, near); return; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(x, y)) tileAt(kind).draw(g, x * cell, y * cell, cell, cellRandom(x, y), theme);
  };
  paintKind(ctx, kinds[0], () => true);
  const sr = seeded(((w * 7 + h * 3 + kinds.length) % 983) / 983 + 0.001);
  for (const kind of kinds.slice(1)) {
    const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (paint[y + dy]?.[x + dx] === kind) return true; return false; };
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, cv.width, cv.height);
    paintKind(lx, kind, near);
    // the mask: its squares, lumps pushed in and out along the edges, blurred
    mkx.globalCompositeOperation = 'source-over';
    mkx.clearRect(0, 0, cv.width, cv.height);
    mkx.fillStyle = '#fff';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint[y][x] === kind) mkx.fillRect(x * cell, y * cell, cell, cell);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (paint[y][x] !== kind) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (paint[y + dy]?.[x + dx] === kind || paint[y + dy]?.[x + dx] === undefined) continue;
        for (let i = 0; i < 3; i++) {
          const t = (i + 0.5) / 3 + (sr() - 0.5) * 0.25;
          const ex = (x + (dx === 0 ? t : dx > 0 ? 1 : 0)) * cell, ey = (y + (dy === 0 ? t : dy > 0 ? 1 : 0)) * cell;
          mkx.globalCompositeOperation = sr() < 0.5 ? 'destination-out' : 'source-over';
          mkx.beginPath(); mkx.arc(ex, ey, cell * (0.1 + sr() * 0.16), 0, Math.PI * 2); mkx.fill();
        }
      }
    }
    mkx.globalCompositeOperation = 'source-over';
    // blur the finished shape once (blurring square by square leaks at the seams)
    sharp.clearRect(0, 0, cv.width, cv.height);
    sharp.filter = `blur(${cell * 0.16}px)`;
    sharp.drawImage(msk, 0, 0);
    sharp.filter = 'none';
    lx.globalCompositeOperation = 'destination-in';
    lx.drawImage(sharpC, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }

  // 2. damp ground along water, scorched along lava: a soft blurred shadow of
  //    the liquid's shape.
  for (const [test, col] of [[(ch) => ch === '~' || ch === 'q', 'rgba(8,14,12,0.55)'], [(ch) => ch === 'l', 'rgba(40,10,0,0.7)']]) {
    let any = false;
    mkx.clearRect(0, 0, cv.width, cv.height);
    mkx.fillStyle = col;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(charAt(scene, x, y))) { any = true; mkx.fillRect(x * cell - cell * 0.15, y * cell - cell * 0.15, cell * 1.3, cell * 1.3); }
    if (!any) continue;
    sharp.clearRect(0, 0, cv.width, cv.height);
    sharp.filter = `blur(${cell * 0.3}px)`;
    sharp.drawImage(msk, 0, 0);
    sharp.filter = 'none';
    ctx.drawImage(sharpC, 0, 0);
  }

  // 4. large, soft variations of light and shade across the whole floor, so
  //    repeated squares don't read as a pattern
  const vr = seeded(((w * 31 + h * 17) % 997) / 997 + 0.001);
  for (let i = 0; i < Math.round(w * h / 6); i++) {
    const px = vr() * cv.width, py = vr() * cv.height, rad = cell * (1.2 + vr() * 2.8);
    const dark = vr() < 0.6;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.1)' : 'rgba(255,240,210,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  // A faint grid, so squares still read as squares in 3D without looking like tiles.
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = Math.max(1, cell / 64);
  for (let x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, h * cell); ctx.stroke(); }
  for (let y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(w * cell, y * cell); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

/* ---------------- moving surfaces ---------------- */
const liquidVert = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*n2(p); p*=2.03; a*=0.5; } return v; }`;
const waterFrag = /* glsl */`
uniform float t; uniform vec3 deep; uniform vec3 shallow; varying vec3 vW;
${NOISE}
void main(){
  vec2 p = vW.xz * 1.6;
  float n = fbm(p + vec2(t*0.25, t*0.18)) * 0.6 + fbm(p*2.2 - vec2(t*0.3, -t*0.2)) * 0.4;
  vec3 c = mix(deep, shallow, n);
  float glint = smoothstep(0.72, 0.9, fbm(p*3.0 + t*0.4));
  gl_FragColor = vec4(c + glint * 0.35, 0.82);
  #include <colorspace_fragment>
}`;
const lavaFrag = /* glsl */`
uniform float t; varying vec3 vW;
${NOISE}
void main(){
  vec2 p = vW.xz * 1.2;
  float n = fbm(p + vec2(t*0.08, -t*0.05)) ;
  // Mostly a dark cooling crust; glowing cracks between the plates, and a
  // slow pulse of heat across the pool.
  float f = fbm(p*2.0 - t*0.06);
  float crack = 1.0 - smoothstep(0.01, 0.06, abs(f - 0.5));
  float pool = smoothstep(0.55, 0.8, n);
  // (linear colour: the output pass brightens these on the way to the screen)
  vec3 crust = mix(vec3(0.012, 0.003, 0.002), vec3(0.05, 0.012, 0.004), n);
  vec3 hot = mix(vec3(0.75, 0.09, 0.0), vec3(1.0, 0.3, 0.03), n);
  gl_FragColor = vec4(mix(crust, hot, max(crack, pool * 0.7)), 1.0);
}`;

// Liquid cells plus the ring of squares around them (the shore's hole can
// reach a little way into a neighbouring square).
function ringed(cells, skip = () => false) {
  const seen = new Set(), out = [];
  for (const [x, y] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const k = `${x + dx},${y + dy}`;
    if ((dx || dy) && skip(x + dx, y + dy)) continue;
    if (!seen.has(k)) { seen.add(k); out.push([x + dx, y + dy]); }
  }
  return out;
}

function cellQuads(cells, y) {
  const pos = [];
  for (const [x, z] of cells) {
    pos.push(x, y, z, x, y, z + 1, x + 1, y, z, x + 1, y, z, x, y, z + 1, x + 1, y, z + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// The rune ring of a magic circle.
let runeTex = null;
function runeTexture() {
  if (runeTex) return runeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  x.strokeStyle = '#ffffff'; x.fillStyle = '#ffffff';
  x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 118, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 92, 0, Math.PI * 2); x.stroke();
  // Inside: plain geometry, no sigils — a ring of small orbits round a core, and ticks.
  x.lineWidth = 2.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath(); x.arc(Math.cos(a) * 58, Math.sin(a) * 58, 22, 0, Math.PI * 2); x.stroke();
  }
  x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(0, 0, 10, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    x.beginPath(); x.moveTo(Math.cos(a) * 84, Math.sin(a) * 84); x.lineTo(Math.cos(a) * 92, Math.sin(a) * 92); x.stroke();
  }
  x.font = 'bold 18px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    x.save(); x.rotate(a); x.fillText(glyphs[i], 0, -105); x.restore();
  }
  runeTex = new THREE.CanvasTexture(c);
  return runeTex;
}

export function buildWorld(scene, { dmView = false, maxAniso = 8 } = {}) {
  const { w, h } = scene.grid;
  const group = new THREE.Group();
  const env = environmentOf(scene);
  const emitters = [];
  const animated = []; // (t) => void
  const solid = new Kit(seeded(0.37)), metal = new Kit(seeded(0.71)), glow = new Kit(seeded(0.19)), walls = new Kit(seeded(0.53));

  // Floor
  let floorMat;
  if (scene.bg?.kind === 'image' && scene.bg.url) {
    floorMat = new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.95 });
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(scene.bg.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; floorMat.map = tex; floorMat.color.set('#fff'); floorMat.needsUpdate = true;
    });
  } else {
    // Pale floors (snow, ice, marble, sand) are painted bright for the flat map; in a lit
    // 3D room they'd glare, so they are toned down a little.
    floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(scene, maxAniso, dmView), roughness: 0.93, metalness: 0, color: ['snow', 'marble', 'sand'].includes(env.floor) || (scene.cells || []).join('').split('i').length > 20 ? '#c8c8c8' : '#ffffff' });
  }
  // Water and lava lie a little below the floor: cut the floor open over them.
  const liquid = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ('~qlo'.includes(charAt(scene, x, y))) liquid.push([x, y]);
  // Stairs down open a clean square hole of their own (the steps are built below the floor).
  const stairs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (charAt(scene, x, y) === '>') stairs.push([x, y]);
  if (liquid.length || stairs.length) {
    // The hole's outline wanders: liquid squares, blurred, with lumps pushed
    // in and out along every shore, cut at the half-way grey (alphaTest).
    const P = 24;
    const mc = document.createElement('canvas');
    mc.width = w * P; mc.height = h * P;
    const mx = mc.getContext('2d');
    mx.fillStyle = '#fff'; mx.fillRect(0, 0, mc.width, mc.height);
    mx.filter = `blur(${P * 0.22}px)`;
    mx.fillStyle = '#000';
    for (const [x, y] of liquid) mx.fillRect(x * P, y * P, P, P);
    const sr = seeded(((w * 13 + h * 7 + liquid.length) % 991) / 991 + 0.001);
    const isLiq = (x, y) => '~qlo'.includes(charAt(scene, x, y));
    for (const [x, y] of liquid) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isLiq(x + dx, y + dy) || x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h) continue;
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3 + (sr() - 0.5) * 0.2;
        const ex = (x + (dx === 0 ? t : dx > 0 ? 1 : 0)) * P, ey = (y + (dy === 0 ? t : dy > 0 ? 1 : 0)) * P;
        mx.fillStyle = sr() < 0.5 ? '#000' : '#fff';
        mx.beginPath(); mx.arc(ex, ey, P * (0.12 + sr() * 0.16), 0, Math.PI * 2); mx.fill();
      }
    }
    mx.filter = 'none';
    mx.fillStyle = '#000';
    for (const [x, y] of stairs) mx.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
    const mask = new THREE.CanvasTexture(mc);
    mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearFilter;
    floorMat.alphaMap = mask;
    floorMat.alphaTest = 0.5;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // The board's edge: a slab under the map, like a built diorama.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.6, h + 0.3), new THREE.MeshStandardMaterial({ color: env.kind === 'outdoor' ? '#6a5238' : '#2a2018', roughness: 1 }));
  slab.position.set(w / 2, -0.55, h / 2); // top below the water and lava beds
  slab.receiveShadow = true;
  group.add(slab);
  // ...and a rim from the slab up to the floor, so the board's edge is solid.
  const rimMat = slab.material;
  for (const [rw, rd, rx, rz] of [[w + 0.3, 0.15, w / 2, -0.075], [w + 0.3, 0.15, w / 2, h + 0.075], [0.15, h, -0.075, h / 2], [0.15, h, w + 0.075, h / 2]]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.27, rd), rimMat);
    rim.position.set(rx, -0.125, rz);
    group.add(rim);
  }

  const water = [], lava = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = charAt(scene, x, y);
      const tile = TILES[ch];
      if (!tile) continue;
      const rnd = seeded(cellRandom(x, y)(0) * 0.999 + 0.0005);
      const c = {
        x0: x, z0: y, x, y, cx: x + 0.5, cz: y + 0.5, rnd, dmView,
        at: (dx, dy) => charAt(scene, x + dx, y + dy),
        emit: (e) => emitters.push(e),
      };
      if (ch === '~' || ch === 'q') { water.push([x, y, ch]); continue; }
      if (ch === 'l') { lava.push([x, y]); continue; }
      if (tile.cat === 'wall') { (WALLS[ch] || WALLS['#'])(c, walls, metal, glow); continue; }
      // Doors stand in walls, so they drop with them in the cutaway.
      if (ch === 'S' || ch === 'D' || ch === 'd' || ch === 'L') { PROPS[ch](c, walls, metal, glow); continue; }
      // Furniture standing among dais squares stands on the dais too.
      const onDais = ch !== '^' && tile.cat === 'prop' && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => charAt(scene, x + dx, y + dy) === '^').length >= 2;
      if (onDais) {
        solid.box(0.998, 0.22, 0.998, '#8a8378', { x: c.cx, y: 0.11, z: c.cz, vary: 0.05 });
        solid.liftY = metal.liftY = glow.liftY = 0.22;
        const emit = c.emit; c.emit = (e) => emit({ ...e, y: (e.y || 0) + 0.22 });
        PROPS[ch]?.(c, solid, metal, glow);
        c.emit = emit;
        solid.liftY = metal.liftY = glow.liftY = 0;
      } else if (tile.cat === 'prop') { PROPS[ch]?.(c, solid, metal, glow); }
      if (ch === 'z') floorBones(c, solid);
      if (ch === '^') {
        // a raised step of dressed stone; edges only where it meets lower floor
        solid.box(0.998, 0.22, 0.998, '#8a8378', { x: c.cx, y: 0.11, z: c.cz, vary: 0.05 });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (charAt(scene, x + dx, y + dy) !== '^') solid.box(dx ? 0.05 : 1, 0.03, dy ? 0.05 : 1, '#a8a095', { x: c.cx + dx * 0.48, y: 0.225, z: c.cz + dy * 0.48 });
      }
      if (ch === 'o') {
        // a pit: dark walls dropping into nothing, a lip of stone round the top
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (charAt(scene, x + dx, y + dy) !== 'o') solid.box(dx ? 0.04 : 1, 0.25, dy ? 0.04 : 1, '#1a1612', { x: c.cx + dx * 0.48, y: -0.125, z: c.cz + dy * 0.48 });
        solid.box(1, 0.02, 1, '#020201', { x: c.cx, y: -0.235, z: c.cz }); // (the board is only so deep: a black floor reads as a drop)
      }
    }
  }

  for (const [kit, mat] of [[walls, MATS.wall], [solid, MATS.solid], [metal, MATS.metal], [glow, MATS.glow]]) {
    const m = meshOf(kit, mat);
    if (m) group.add(m);
  }

  if (water.length) {
    const deep = water.filter((c) => c[2] === 'q');
    const mat = new THREE.ShaderMaterial({ vertexShader: liquidVert, fragmentShader: waterFrag, transparent: true, depthWrite: false, uniforms: { t: { value: 0 }, deep: { value: new THREE.Color('#123448') }, shallow: { value: new THREE.Color('#3f7f9a') } } });
    const m = new THREE.Mesh(cellQuads(ringed(water, (x, y) => charAt(scene, x, y) === 'l'), -0.06), mat);
    group.add(m);
    // Underneath: a darker bed so the water has depth.
    const bed = new THREE.Mesh(cellQuads(ringed(water, (x, y) => charAt(scene, x, y) === 'l'), -0.22), new THREE.MeshStandardMaterial({ color: deep.length ? '#0e1f2a' : '#2a3a34', roughness: 1 }));
    group.add(bed);
    animated.push((t) => { mat.uniforms.t.value = t; });
  }
  if (lava.length) {
    const mat = new THREE.ShaderMaterial({ vertexShader: liquidVert, fragmentShader: lavaFrag, uniforms: { t: { value: 0 } }, toneMapped: false });
    group.add(new THREE.Mesh(cellQuads(ringed(lava, (x, y) => '~q'.includes(charAt(scene, x, y))), -0.04), mat));
    animated.push((t) => { mat.uniforms.t.value = t; });
    // A few of the lava cells cast light and breathe embers.
    lava.forEach(([x, y], i) => {
      if (i % 4 === 0) emitters.push({ kind: 'ember', x: x + 0.5, y: 0.05, z: y + 0.5, light: { color: '#ff5a1a', intensity: 6, distance: 6 } });
    });
  }

  // Magic circles and fountain basins are meshes of their own.
  for (const e of emitters) {
    if (e.kind === 'circle') {
      const mat = new THREE.MeshBasicMaterial({ map: runeTexture(), color: e.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), mat);
      ring.position.set(e.x, 0.03, e.z);
      group.add(ring);
      animated.push((t) => { ring.rotation.y = t * 0.25; mat.opacity = 0.75 + Math.sin(t * 2.2) * 0.2; });
    }
    if (e.kind === 'water') {
      const mat = new THREE.ShaderMaterial({ vertexShader: liquidVert, fragmentShader: waterFrag, transparent: true, depthWrite: false, uniforms: { t: { value: 0 }, deep: { value: new THREE.Color('#1f4a62') }, shallow: { value: new THREE.Color('#5fa0c0') } } });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(e.r, 20).rotateX(-Math.PI / 2), mat);
      disc.position.set(e.x, e.y, e.z);
      group.add(disc);
      animated.push((t) => { mat.uniforms.t.value = t; });
    }
  }

  // Lights: the strongest emitters get real point lights (flickering); the
  // rest glow without lighting the room, to keep the frame cheap.
  // Indoors, any stretch of room no fire reaches gets a soft warm fill, so
  // corners are dim rather than black.
  if (env.kind !== 'outdoor') {
    const step = 7;
    for (let gz = step / 2; gz < h; gz += step) {
      for (let gx = step / 2; gx < w; gx += step) {
        const near = emitters.some((e) => e.light && Math.hypot(e.x - gx, e.z - gz) < 4.5);
        if (!near) emitters.push({ kind: 'fill', x: gx, y: 2.2, z: gz, light: { color: env.kind === 'cave' ? '#6a7fa8' : '#d89a60', intensity: 2.2, distance: 9 } });
      }
    }
  }
  const lit = emitters.filter((e) => e.light).sort((a, b) => b.light.intensity - a.light.intensity).slice(0, MAX_LIGHTS);
  const lights = lit.map((e) => {
    const l = new THREE.PointLight(e.light.color, e.light.intensity * (e.kind === 'fill' ? 1 : 2.6), e.light.distance * 1.3, 1.5);
    l.position.set(e.x, e.y + 0.35, e.z);
    l.userData.base = l.intensity;
    l.userData.phase = Math.random() * 10;
    l.userData.fire = e.kind === 'fire' || e.kind === 'ember';
    l.userData.still = e.kind === 'fill';
    group.add(l);
    return l;
  });
  animated.push((t) => {
    for (const l of lights) {
      const mul = l.userData.mul ?? 1;
      if (l.userData.still) { l.intensity = l.userData.base * mul; continue; }
      const p = l.userData.phase;
      l.intensity = l.userData.base * mul * (l.userData.fire
        ? 0.82 + Math.sin(t * 13 + p) * 0.07 + Math.sin(t * 7.3 + p * 2) * 0.08 + Math.sin(t * 23 + p) * 0.03
        : 0.9 + Math.sin(t * 1.6 + p) * 0.1);
    }
  });

  return {
    group, env, emitters, lights, bounds: { w, h },
    update(t) { for (const a of animated) a(t); },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (m && !Object.values(MATS).includes(m)) { if (m.map && m.map !== runeTex) m.map.dispose(); m.dispose(); }
      });
    },
  };
}

// The air and light around a place.
export function applyEnvironment(engine, env, bounds, particles, mood = {}) {
  const { scene } = engine;
  const { w, h } = bounds;
  const cx = w / 2, cz = h / 2, R = Math.max(w, h);
  for (const o of [...(engine.envObjects || [])]) { scene.remove(o); o.geometry?.dispose(); o.material?.dispose?.(); }
  const objs = [];
  const add = (o) => { scene.add(o); objs.push(o); return o; };

  const key = new THREE.DirectionalLight('#ffffff', 1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.left = -R * 0.75; sc.right = R * 0.75; sc.top = R * 0.75; sc.bottom = -R * 0.75; sc.near = 1; sc.far = R * 4;
  key.target.position.set(cx, 0, cz);
  add(key); add(key.target);

  particles.emitters = particles.emitters.filter((e) => !e.ambient);
  const box = { x0: 0, x1: w, z0: 0, z1: h, y0: 0.3, y1: 2.2 };

  if (env.kind === 'outdoor') {
    const snowy = env.snow;
    scene.background = new THREE.Color(snowy ? '#9fb2c4' : '#8fb0d0');
    scene.fog = new THREE.Fog(snowy ? '#c8d4de' : '#a8bcc8', R * 0.9, R * 2.6);
    add(new THREE.HemisphereLight(snowy ? '#e8f0ff' : '#cfe4ff', '#5a4a30', 1.1));
    key.color.set('#fff0d8'); key.intensity = 2.6;
    key.position.set(cx - R * 0.6, R * 1.1, cz - R * 0.4);
    // Sky dome with a sun glow.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(R * 3, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(snowy ? '#7f9ab8' : '#4f86c0') }, bottom: { value: new THREE.Color(snowy ? '#dfe8f0' : '#cfe0ea') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float k = smoothstep(-0.05, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }',
    }));
    sky.position.set(cx, 0, cz);
    add(sky);
    // Ground beyond the map, so the edge isn't a cliff into nothing.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R * 3, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: snowy ? '#d8e0e8' : env.floor === 'sand' ? '#a89068' : '#3f5a32', roughness: 1 }));
    ground.position.set(cx, -0.62, cz);
    ground.receiveShadow = true;
    add(ground);
    particles.addEmitter({ kind: snowy ? 'snow' : 'fireflies', ambient: true, ...box, size: snowy ? Math.max(1, (w * h) / 300) : Math.max(1, (w * h) / 500) });
  } else {
    const cave = env.kind === 'cave', volc = env.kind === 'volcanic';
    const bg = volc ? '#1a0806' : cave ? '#05070a' : '#070504';
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, R * 1.2, R * 3);
    add(new THREE.HemisphereLight(cave ? '#6a7aa0' : volc ? '#c05a32' : '#c09068', '#2a1e14', cave ? 2.4 : volc ? 2.0 : 2.6));
    // A low "moon" key so everything still has a grounding shadow.
    key.color.set(cave ? '#8aa0c8' : volc ? '#ff8a5a' : '#ffd8b0');
    key.intensity = cave ? 1.4 : volc ? 1.4 : 1.7;
    key.position.set(cx + R * 0.3, R * 1.2, cz + R * 0.5);
    particles.addEmitter({ kind: volc ? 'ash' : 'dust', ambient: true, ...box, size: Math.max(1, (w * h) / 260) });
  }
  // The DM's mood: time of day (outdoors), brightness, weather.
  const light = Math.max(0.2, Math.min(2, mood.light ?? 1));
  const hemi = objs.find((o) => o.isHemisphereLight);
  if (env.kind === 'outdoor' && (mood.time === 'dusk' || mood.time === 'night')) {
    const night = mood.time === 'night';
    scene.background = new THREE.Color(night ? '#0c1222' : '#5a3a4a');
    scene.fog = new THREE.Fog(night ? '#0c1222' : '#6a4a52', R * 0.8, R * 2.6);
    if (hemi) { hemi.color.set(night ? '#5a6a9a' : '#ffb08a'); hemi.groundColor.set(night ? '#101018' : '#3a2a22'); hemi.intensity = night ? 0.55 : 0.9; }
    key.color.set(night ? '#8aa0d8' : '#ff9a5a'); key.intensity = night ? 0.6 : 1.6;
    key.position.set(cx + R * 0.9, R * (night ? 1.2 : 0.45), cz - R * 0.2);
    const sky = objs.find((o) => o.material?.uniforms?.top);
    if (sky) { sky.material.uniforms.top.value.set(night ? '#060a18' : '#3a2a5a'); sky.material.uniforms.bottom.value.set(night ? '#1a2440' : '#ff8a5a'); }
    if (night) particles.addEmitter({ kind: 'fireflies', ambient: true, ...box, size: Math.max(1, (w * h) / 300) });
  }
  if (hemi) hemi.intensity *= light;
  key.intensity *= light;
  const weather = mood.weather || 'none';
  if (weather === 'rain') {
    particles.addEmitter({ kind: 'rain', ambient: true, ...box, size: Math.max(1, (w * h) / 120) });
    if (hemi) hemi.intensity *= 0.8;
    key.intensity *= 0.6;
  }
  if (weather === 'snow') particles.addEmitter({ kind: 'snow', ambient: true, ...box, size: Math.max(1, (w * h) / 200) });
  if (weather === 'ash') particles.addEmitter({ kind: 'ashfall', ambient: true, ...box, size: Math.max(1, (w * h) / 200) });
  if (weather === 'embers') particles.addEmitter({ kind: 'ash', ambient: true, ...box, size: Math.max(1, (w * h) / 160) });
  if (weather === 'fog') {
    const c = scene.background?.isColor ? scene.background.clone().lerp(new THREE.Color('#8a8f96'), 0.5) : new THREE.Color('#6a6e74');
    scene.fog = new THREE.Fog(c, 2, R * 0.9);
    if (env.kind === 'outdoor') scene.background = c;
    particles.addEmitter({ kind: 'mist', ambient: true, ...box, size: Math.max(1, (w * h) / 150) });
  }
  engine.envObjects = objs;
  return { key };
}
