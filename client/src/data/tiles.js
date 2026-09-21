// ================= Map tile registry =================
// Every map cell is one character. A tile describes what that character looks
// like, whether creatures can walk through it, and how it is drawn.
//
//   cat 'floor'  - ground you can stand on (paints the whole cell)
//   cat 'wall'   - solid structure (paints the whole cell, blocks movement)
//   cat 'prop'   - an object sitting on the scene's default floor
//
// draw(ctx, x0, y0, s, rnd, theme) paints one cell:
//   x0,y0 - top-left in canvas px   s - cell size in px
//   rnd(i) - deterministic 0..1 noise for this cell, stable across redraws
//   theme  - the scene's FLOOR_THEME (so '.', '#' follow the scene's material)
//
// The same draw() is used by the live map, the scene thumbnails and the
// build-palette swatches, so a tile only ever has to be described once.

/* ---------------- small drawing helpers ---------------- */

const rect = (ctx, x, y, w, h, fill) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
};

const circle = (ctx, cx, cy, r, fill, stroke, lw = 1) => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
};

const poly = (ctx, pts, fill, stroke, lw = 1) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
};

const line = (ctx, x1, y1, x2, y2, stroke, lw = 1) => {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

// Mottled ground: two tones plus a few dark specks. The backbone of every floor.
const ground = (ctx, x0, y0, s, rnd, light, dark, speckle = 'rgba(0,0,0,0.12)') => {
  rect(ctx, x0, y0, s, s, rnd(0) > 0.5 ? light : dark);
  ctx.fillStyle = speckle;
  const n = 1 + Math.floor(rnd(1) * 4);
  for (let i = 0; i < n; i++) {
    ctx.fillRect(x0 + rnd(i * 2 + 3) * s, y0 + rnd(i * 2 + 4) * s, Math.max(1, s * 0.035), Math.max(1, s * 0.035));
  }
};

// A solid block with a bevelled inner edge - reads as "built structure".
const block = (ctx, x0, y0, s, fill, edge) => {
  rect(ctx, x0, y0, s, s, fill);
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.strokeRect(x0 + s * 0.02, y0 + s * 0.02, s * 0.96, s * 0.96);
};

/* ---------------- floor themes ---------------- */
// '.' and '#' take their colours from the scene's material so one ASCII map can
// be re-skinned as stone, wood, grass, dirt or sand.

export const FLOOR_THEMES = {
  stone: { base: '#4a4a52', dark: '#3e3e46', wall: '#232328', wallEdge: '#15151a', grid: 'rgba(0,0,0,0.22)' },
  wood: { base: '#6b4f33', dark: '#5e452c', wall: '#2c2018', wallEdge: '#181008', grid: 'rgba(0,0,0,0.22)' },
  grass: { base: '#4d6b3a', dark: '#446033', wall: '#26361e', wallEdge: '#141f10', grid: 'rgba(0,0,0,0.18)' },
  dirt: { base: '#6b5a40', dark: '#5f5039', wall: '#2e2417', wallEdge: '#191208', grid: 'rgba(0,0,0,0.2)' },
  sand: { base: '#b09a6f', dark: '#9c8760', wall: '#6b5a3d', wallEdge: '#463a26', grid: 'rgba(0,0,0,0.16)' },
  water: { base: '#33566b', dark: '#2d4c60', wall: '#15252e', wallEdge: '#0b1418', grid: 'rgba(255,255,255,0.06)' },
  marble: { base: '#8d8a95', dark: '#7e7b87', wall: '#3a3844', wallEdge: '#22212a', grid: 'rgba(0,0,0,0.18)' },
  snow: { base: '#c9d2da', dark: '#b8c2cc', wall: '#5f6b76', wallEdge: '#3b444d', grid: 'rgba(0,0,0,0.14)' },
};

export const FLOOR_MATERIALS = [
  { key: 'stone', name: 'Stone' },
  { key: 'wood', name: 'Wood' },
  { key: 'grass', name: 'Grass' },
  { key: 'dirt', name: 'Dirt' },
  { key: 'sand', name: 'Sand' },
  { key: 'marble', name: 'Marble' },
  { key: 'snow', name: 'Snow' },
  { key: 'water', name: 'Water' },
];

/* ---------------- the tiles ---------------- */

const T = {};
const def = (ch, name, cat, opts, draw) => {
  T[ch] = { ch, name, cat, blocked: false, difficult: false, ...opts, draw };
};

/* --- ground you can walk on --- */

def('.', 'Floor', 'floor', { group: 'Ground' }, (c, x, y, s, r, th) =>
  ground(c, x, y, s, r, th.base, th.dark)
);
def('=', 'Wood planks', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#6b4f33', '#5e452c');
  line(c, x, y + s * 0.5, x + s, y + s * 0.5, 'rgba(0,0,0,0.28)', Math.max(1, s * 0.02));
  line(c, x + s * (0.2 + r(6) * 0.6), y, x + s * (0.2 + r(6) * 0.6), y + s * 0.5, 'rgba(0,0,0,0.2)', 1);
});
def(',', 'Grass', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#4d6b3a', '#446033', 'rgba(0,0,0,0.1)');
  c.strokeStyle = 'rgba(120,160,90,0.45)';
  c.lineWidth = Math.max(1, s * 0.025);
  for (let i = 0; i < 3; i++) {
    const gx = x + r(i * 3 + 7) * s;
    const gy = y + r(i * 3 + 8) * s;
    line(c, gx, gy, gx + s * 0.04, gy - s * 0.11, 'rgba(120,160,90,0.45)', Math.max(1, s * 0.025));
  }
});
def(':', 'Dirt', 'floor', { group: 'Ground' }, (c, x, y, s, r) => ground(c, x, y, s, r, '#6b5a40', '#5f5039'));
def('s', 'Sand', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#b09a6f', '#a48e64', 'rgba(120,95,55,0.2)');
  c.strokeStyle = 'rgba(150,128,88,0.5)';
  c.lineWidth = Math.max(1, s * 0.02);
  c.beginPath();
  c.moveTo(x, y + s * (0.3 + r(9) * 0.4));
  c.quadraticCurveTo(x + s * 0.5, y + s * (0.2 + r(10) * 0.5), x + s, y + s * (0.3 + r(11) * 0.4));
  c.stroke();
});
def('k', 'Cobblestone', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, '#4e4b46');
  for (let i = 0; i < 4; i++) {
    const cx = x + (i % 2) * s * 0.5 + s * 0.06;
    const cy = y + Math.floor(i / 2) * s * 0.5 + s * 0.06;
    rect(c, cx, cy, s * 0.38, s * 0.38, r(i + 12) > 0.5 ? '#615d57' : '#57534e');
  }
});
def('p', 'Polished tile', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, r(13) > 0.5 ? '#8d8a95' : '#7e7b87');
  line(c, x, y, x + s, y + s, 'rgba(255,255,255,0.07)', Math.max(1, s * 0.03));
  c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
});
def('n', 'Snow', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#ccd5dd', '#bcc6d0', 'rgba(255,255,255,0.5)');
});
def('i', 'Ice', 'floor', { group: 'Ground', difficult: true }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#8fb4c4', '#7ea6b8', 'rgba(255,255,255,0.35)');
  line(c, x + s * 0.15, y + s * 0.8, x + s * 0.7, y + s * 0.2, 'rgba(255,255,255,0.4)', Math.max(1, s * 0.03));
});
// Painted edge-to-edge so neighbouring squares read as one rug, not a grid of
// little mats.
def('e', 'Carpet', 'floor', { group: 'Ground' }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, r(40) > 0.5 ? '#77363b' : '#6d3035');
  c.strokeStyle = 'rgba(201,160,90,0.28)';
  c.lineWidth = Math.max(1, s * 0.025);
  c.beginPath();
  c.moveTo(x, y + s * 0.5);
  c.lineTo(x + s, y + s * 0.5);
  c.moveTo(x + s * 0.5, y);
  c.lineTo(x + s * 0.5, y + s);
  c.stroke();
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.13, null, 'rgba(201,160,90,0.35)', Math.max(1, s * 0.025));
});
def('z', 'Bone-strewn floor', 'floor', { group: 'Ground' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  c.strokeStyle = '#cfc7b0';
  c.lineWidth = Math.max(1, s * 0.045);
  c.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const bx = x + s * (0.2 + r(i + 14) * 0.5);
    const by = y + s * (0.25 + r(i + 15) * 0.5);
    line(c, bx, by, bx + s * 0.22, by + s * 0.08, '#cfc7b0', Math.max(1, s * 0.045));
  }
  c.lineCap = 'butt';
});

/* --- liquids and hazards --- */

def('~', 'Shallow water', 'floor', { group: 'Water', difficult: true }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#3d6579', '#33566b', 'rgba(255,255,255,0.05)');
  c.strokeStyle = 'rgba(190,225,240,0.3)';
  c.lineWidth = Math.max(1, s * 0.03);
  c.beginPath();
  c.moveTo(x + s * 0.1, y + s * (0.35 + r(16) * 0.3));
  c.quadraticCurveTo(x + s * 0.5, y + s * (0.2 + r(17) * 0.3), x + s * 0.9, y + s * (0.35 + r(18) * 0.3));
  c.stroke();
});
def('q', 'Deep water', 'floor', { group: 'Water', difficult: true }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#1e3a4d', '#183043', 'rgba(255,255,255,0.04)');
  c.strokeStyle = 'rgba(150,195,215,0.18)';
  c.lineWidth = Math.max(1, s * 0.03);
  c.beginPath();
  c.moveTo(x + s * 0.15, y + s * 0.6);
  c.quadraticCurveTo(x + s * 0.5, y + s * 0.45, x + s * 0.85, y + s * 0.6);
  c.stroke();
});
def('m', 'Mud', 'floor', { group: 'Water', difficult: true }, (c, x, y, s, r) => {
  ground(c, x, y, s, r, '#514431', '#463a29', 'rgba(0,0,0,0.25)');
  circle(c, x + s * (0.3 + r(19) * 0.4), y + s * (0.3 + r(20) * 0.4), s * 0.13, 'rgba(30,24,16,0.6)');
});
def('l', 'Lava', 'floor', { group: 'Water', blocked: true }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, '#3a1508');
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.44, '#c2401a');
  circle(c, x + s * (0.35 + r(21) * 0.3), y + s * (0.35 + r(22) * 0.3), s * 0.2, '#f08c2e');
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.09, '#ffe08a');
});
def('x', 'Chasm', 'floor', { group: 'Water', blocked: true }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, '#0a0a0c');
  rect(c, x, y, s, s * 0.14, 'rgba(70,70,80,0.5)');
  rect(c, x, y + s * 0.86, s, s * 0.14, 'rgba(50,50,58,0.45)');
});

/* --- walls and solid structure --- */

def('#', 'Wall', 'wall', { group: 'Walls', blocked: true }, (c, x, y, s, r, th) => {
  block(c, x, y, s, th.wall, th.wallEdge);
  rect(c, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.12, 'rgba(255,255,255,0.05)');
});
def('%', 'Ruined wall', 'wall', { group: 'Walls', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  poly(
    c,
    [
      [x + s * 0.05, y + s],
      [x + s * 0.05, y + s * (0.3 + r(23) * 0.25)],
      [x + s * 0.4, y + s * (0.15 + r(24) * 0.2)],
      [x + s * 0.62, y + s * (0.4 + r(25) * 0.25)],
      [x + s * 0.95, y + s * (0.25 + r(26) * 0.3)],
      [x + s * 0.95, y + s],
    ],
    th.wall,
    th.wallEdge,
    Math.max(1, s * 0.035)
  );
});
def('w', 'Timber wall', 'wall', { group: 'Walls', blocked: true }, (c, x, y, s) => {
  block(c, x, y, s, '#4a3520', '#241a10');
  for (let i = 0; i < 3; i++) line(c, x + s * (0.25 + i * 0.25), y, x + s * (0.25 + i * 0.25), y + s, 'rgba(0,0,0,0.3)', Math.max(1, s * 0.03));
});
def('v', 'Cave wall', 'wall', { group: 'Walls', blocked: true }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, '#2b2822');
  circle(c, x + s * (0.3 + r(27) * 0.4), y + s * (0.3 + r(28) * 0.4), s * 0.34, '#38342c');
  circle(c, x + s * 0.3, y + s * 0.3, s * 0.16, '#433e34');
});
def('h', 'Hedge', 'wall', { group: 'Walls', blocked: true }, (c, x, y, s, r) => {
  rect(c, x, y, s, s, '#243a1c');
  for (let i = 0; i < 6; i++) {
    circle(c, x + s * (0.15 + r(i + 29) * 0.7), y + s * (0.15 + r(i + 30) * 0.7), s * 0.19, i % 2 ? '#2f4c23' : '#385a2a');
  }
});
def('_', 'Void', 'wall', { group: 'Walls', blocked: true, void: true }, (c, x, y, s) => {
  rect(c, x, y, s, s, '#08080a');
});

/* --- doors and passage --- */

def('D', 'Wooden door', 'prop', { group: 'Doors' }, (c, x, y, s) => {
  rect(c, x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86, '#8a6a3a');
  c.strokeStyle = '#4a3620';
  c.lineWidth = Math.max(1, s * 0.045);
  c.strokeRect(x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86);
  line(c, x + s * 0.07, y + s * 0.3, x + s * 0.93, y + s * 0.3, '#5c4526', Math.max(1, s * 0.035));
  line(c, x + s * 0.07, y + s * 0.7, x + s * 0.93, y + s * 0.7, '#5c4526', Math.max(1, s * 0.035));
  circle(c, x + s * 0.78, y + s * 0.5, s * 0.06, '#2a1e10');
});
def('d', 'Open doorway', 'prop', { group: 'Doors' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x, y, s * 0.14, s, th.wall);
  rect(c, x + s * 0.86, y, s * 0.14, s, th.wall);
  rect(c, x + s * 0.14, y, s * 0.72, s * 0.1, 'rgba(0,0,0,0.35)');
});
def('L', 'Iron door', 'prop', { group: 'Doors', blocked: true }, (c, x, y, s) => {
  rect(c, x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86, '#4b5058');
  c.strokeStyle = '#24272c';
  c.lineWidth = Math.max(1, s * 0.05);
  c.strokeRect(x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86);
  for (let i = 0; i < 4; i++) {
    circle(c, x + s * (0.2 + (i % 2) * 0.6), y + s * (0.2 + Math.floor(i / 2) * 0.6), s * 0.055, '#8b929b');
  }
  rect(c, x + s * 0.42, y + s * 0.44, s * 0.16, s * 0.2, '#22252a');
});
def('S', 'Secret door', 'prop', { group: 'Doors', dmOnly: true }, (c, x, y, s, r, th) => {
  block(c, x, y, s, th.wall, th.wallEdge);
  c.setLineDash([s * 0.1, s * 0.08]);
  c.strokeStyle = '#d4a94f';
  c.lineWidth = Math.max(1, s * 0.05);
  c.strokeRect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64);
  c.setLineDash([]);
});
def('<', 'Stairs up', 'prop', { group: 'Doors' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 4; i++) {
    rect(c, x + s * 0.1, y + s * (0.12 + i * 0.2), s * (0.8 - i * 0.14), s * 0.15, i % 2 ? '#6d6a63' : '#807d74');
  }
  poly(c, [[x + s * 0.5, y + s * 0.06], [x + s * 0.6, y + s * 0.2], [x + s * 0.4, y + s * 0.2]], '#e8c476');
});
def('>', 'Stairs down', 'prop', { group: 'Doors' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 4; i++) {
    rect(c, x + s * (0.1 + i * 0.07), y + s * (0.12 + i * 0.2), s * (0.8 - i * 0.14), s * 0.15, i % 2 ? '#4a473f' : '#3a3830');
  }
  poly(c, [[x + s * 0.5, y + s * 0.94], [x + s * 0.6, y + s * 0.8], [x + s * 0.4, y + s * 0.8]], '#e8c476');
});
def('H', 'Ladder', 'prop', { group: 'Doors' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.26, y + s * 0.08, s * 0.09, s * 0.84, '#8a6a3a');
  rect(c, x + s * 0.65, y + s * 0.08, s * 0.09, s * 0.84, '#8a6a3a');
  for (let i = 0; i < 4; i++) rect(c, x + s * 0.26, y + s * (0.18 + i * 0.2), s * 0.48, s * 0.07, '#a8834a');
});
def('/', 'Bridge', 'prop', { group: 'Doors' }, (c, x, y, s) => {
  rect(c, x, y + s * 0.08, s, s * 0.84, '#6b4f33');
  for (let i = 0; i < 5; i++) line(c, x + s * (0.1 + i * 0.2), y + s * 0.08, x + s * (0.1 + i * 0.2), y + s * 0.92, 'rgba(0,0,0,0.3)', Math.max(1, s * 0.03));
  rect(c, x, y + s * 0.06, s, s * 0.05, '#4a3620');
  rect(c, x, y + s * 0.89, s, s * 0.05, '#4a3620');
});

/* --- furniture --- */

def('t', 'Round table', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.52, s * 0.34, '#5e452c', '#3a2a18', Math.max(1, s * 0.04));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.26, '#6f5334');
});
def('2', 'Long table', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.04, y + s * 0.22, s * 0.92, s * 0.56, '#5e452c');
  c.strokeStyle = '#3a2a18';
  c.lineWidth = Math.max(1, s * 0.04);
  c.strokeRect(x + s * 0.04, y + s * 0.22, s * 0.92, s * 0.56);
  line(c, x + s * 0.04, y + s * 0.5, x + s * 0.96, y + s * 0.5, 'rgba(0,0,0,0.22)', Math.max(1, s * 0.03));
});
def('1', 'Chair', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.3, y + s * 0.36, s * 0.4, s * 0.4, '#6f5334', '#3a2a18');
  rect(c, x + s * 0.3, y + s * 0.24, s * 0.4, s * 0.12, '#5e452c');
});
def('3', 'Bar counter', 'prop', { group: 'Furniture', blocked: true }, (c, x, y, s) => {
  rect(c, x, y + s * 0.12, s, s * 0.76, '#4a3620');
  rect(c, x, y + s * 0.12, s, s * 0.2, '#7a5c38');
  line(c, x, y + s * 0.62, x + s, y + s * 0.62, 'rgba(0,0,0,0.3)', Math.max(1, s * 0.03));
});
def('E', 'Bed', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.14, y + s * 0.08, s * 0.72, s * 0.84, '#5e452c');
  rect(c, x + s * 0.18, y + s * 0.3, s * 0.64, s * 0.58, '#8a5f5f');
  rect(c, x + s * 0.22, y + s * 0.13, s * 0.56, s * 0.16, '#d8d2c2');
});
def('F', 'Bookshelf', 'prop', { group: 'Furniture', blocked: true }, (c, x, y, s, r) => {
  rect(c, x, y + s * 0.06, s, s * 0.88, '#4a3620');
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const bx = x + s * (0.08 + i * 0.17);
      rect(c, bx, y + s * (0.12 + row * 0.28), s * 0.13, s * 0.22, ['#8a4a3a', '#3a5a7a', '#6a6a3a', '#5a3a6a', '#3a6a5a'][(i + row + Math.floor(r(31) * 5)) % 5]);
    }
    line(c, x, y + s * (0.35 + row * 0.28), x + s, y + s * (0.35 + row * 0.28), '#2e2214', Math.max(1, s * 0.04));
  }
});
def('R', 'Weapon rack', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.08, y + s * 0.7, s * 0.84, s * 0.14, '#4a3620');
  for (let i = 0; i < 3; i++) {
    const wx = x + s * (0.24 + i * 0.26);
    line(c, wx, y + s * 0.7, wx, y + s * 0.16, '#9aa0a8', Math.max(1, s * 0.05));
    line(c, wx - s * 0.07, y + s * 0.3, wx + s * 0.07, y + s * 0.3, '#6a4a2a', Math.max(1, s * 0.045));
  }
});
def('J', 'Throne', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.22, y + s * 0.1, s * 0.56, s * 0.8, '#54524d');
  rect(c, x + s * 0.28, y + s * 0.44, s * 0.44, s * 0.42, '#7d3a3f');
  poly(c, [[x + s * 0.5, y + s * 0.04], [x + s * 0.62, y + s * 0.2], [x + s * 0.38, y + s * 0.2]], '#d4a94f');
});
def(')', 'Cart', 'prop', { group: 'Furniture' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.12, y + s * 0.2, s * 0.76, s * 0.44, '#6b4f33', '#3a2a18');
  circle(c, x + s * 0.3, y + s * 0.74, s * 0.16, '#4a3620', '#241a10', Math.max(1, s * 0.04));
  circle(c, x + s * 0.7, y + s * 0.74, s * 0.16, '#4a3620', '#241a10', Math.max(1, s * 0.04));
});

/* --- containers and loot --- */

def('B', 'Crate', 'prop', { group: 'Objects' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.16, y + s * 0.16, s * 0.68, s * 0.68, '#7a5a34');
  c.strokeStyle = '#4a3620';
  c.lineWidth = Math.max(1, s * 0.045);
  c.strokeRect(x + s * 0.16, y + s * 0.16, s * 0.68, s * 0.68);
  line(c, x + s * 0.16, y + s * 0.16, x + s * 0.84, y + s * 0.84, '#4a3620', Math.max(1, s * 0.035));
  line(c, x + s * 0.84, y + s * 0.16, x + s * 0.16, y + s * 0.84, '#4a3620', Math.max(1, s * 0.035));
});
def('b', 'Barrel', 'prop', { group: 'Objects' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.33, '#7a5a34', '#4a3620', Math.max(1, s * 0.05));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.22, '#8f6c40');
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.09, '#5c4526');
});
def('[', 'Crate stack', 'prop', { group: 'Objects', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.08, y + s * 0.42, s * 0.5, s * 0.5, '#6b4f2e', '#3a2a18');
  rect(c, x + s * 0.44, y + s * 0.26, s * 0.46, s * 0.46, '#7a5a34');
  c.strokeStyle = '#4a3620';
  c.lineWidth = Math.max(1, s * 0.04);
  c.strokeRect(x + s * 0.08, y + s * 0.42, s * 0.5, s * 0.5);
  c.strokeRect(x + s * 0.44, y + s * 0.26, s * 0.46, s * 0.46);
});
def('C', 'Chest', 'prop', { group: 'Objects' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.14, y + s * 0.36, s * 0.72, s * 0.44, '#7a5a34', '#3a2a18');
  c.strokeStyle = '#3a2a18';
  c.lineWidth = Math.max(1, s * 0.045);
  c.strokeRect(x + s * 0.14, y + s * 0.36, s * 0.72, s * 0.44);
  c.beginPath();
  c.moveTo(x + s * 0.14, y + s * 0.38);
  c.quadraticCurveTo(x + s * 0.5, y + s * 0.1, x + s * 0.86, y + s * 0.38);
  c.fillStyle = '#8f6c40';
  c.fill();
  c.stroke();
  rect(c, x + s * 0.44, y + s * 0.32, s * 0.12, s * 0.24, '#d4a94f');
});
def('$', 'Treasure', 'prop', { group: 'Objects' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 7; i++) {
    circle(c, x + s * (0.25 + r(i + 32) * 0.5), y + s * (0.35 + r(i + 33) * 0.4), s * 0.1, i % 2 ? '#e8c476' : '#d4a94f', '#8a7448', 1);
  }
});
def('!', 'Sack', 'prop', { group: 'Objects' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  c.beginPath();
  c.moveTo(x + s * 0.36, y + s * 0.3);
  c.quadraticCurveTo(x + s * 0.12, y + s * 0.86, x + s * 0.5, y + s * 0.88);
  c.quadraticCurveTo(x + s * 0.88, y + s * 0.86, x + s * 0.64, y + s * 0.3);
  c.closePath();
  c.fillStyle = '#8d7a54';
  c.fill();
  c.strokeStyle = '#544931';
  c.lineWidth = Math.max(1, s * 0.04);
  c.stroke();
  line(c, x + s * 0.36, y + s * 0.3, x + s * 0.64, y + s * 0.3, '#544931', Math.max(1, s * 0.06));
});
def('r', 'Rubble', 'prop', { group: 'Objects', difficult: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 5; i++) {
    circle(c, x + s * (0.15 + r(i + 34) * 0.7), y + s * (0.15 + r(i + 35) * 0.7), s * (0.07 + r(i + 36) * 0.07), '#5a5a60', '#3c3c42', 1);
  }
});

/* --- light and fire --- */

def('c', 'Campfire', 'prop', { group: 'Light' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.34, '#3a3a40', '#26262b', Math.max(1, s * 0.04));
  line(c, x + s * 0.28, y + s * 0.66, x + s * 0.72, y + s * 0.4, '#5c4526', Math.max(1, s * 0.06));
  line(c, x + s * 0.72, y + s * 0.66, x + s * 0.28, y + s * 0.4, '#5c4526', Math.max(1, s * 0.06));
  circle(c, x + s * 0.5, y + s * 0.48, s * 0.17, '#e07040');
  circle(c, x + s * 0.5, y + s * 0.45, s * 0.09, '#f2c14e');
});
def('G', 'Brazier', 'prop', { group: 'Light' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  poly(c, [[x + s * 0.3, y + s * 0.86], [x + s * 0.7, y + s * 0.86], [x + s * 0.6, y + s * 0.5], [x + s * 0.4, y + s * 0.5]], '#4b5058', '#24272c', Math.max(1, s * 0.04));
  circle(c, x + s * 0.5, y + s * 0.46, s * 0.22, '#8a929b');
  circle(c, x + s * 0.5, y + s * 0.42, s * 0.16, '#e07040');
  circle(c, x + s * 0.5, y + s * 0.38, s * 0.08, '#ffe08a');
});
def('I', 'Wall torch', 'prop', { group: 'Light' }, (c, x, y, s, r, th) => {
  block(c, x, y, s, th.wall, th.wallEdge);
  rect(c, x + s * 0.45, y + s * 0.4, s * 0.1, s * 0.42, '#5c4526');
  circle(c, x + s * 0.5, y + s * 0.34, s * 0.15, '#e07040');
  circle(c, x + s * 0.5, y + s * 0.3, s * 0.08, '#ffe08a');
});
def('4', 'Forge', 'prop', { group: 'Light', blocked: true }, (c, x, y, s) => {
  rect(c, x + s * 0.08, y + s * 0.2, s * 0.84, s * 0.72, '#3d3a35', '#22201c');
  c.strokeStyle = '#22201c';
  c.lineWidth = Math.max(1, s * 0.05);
  c.strokeRect(x + s * 0.08, y + s * 0.2, s * 0.84, s * 0.72);
  rect(c, x + s * 0.26, y + s * 0.42, s * 0.48, s * 0.34, '#c2401a');
  rect(c, x + s * 0.34, y + s * 0.5, s * 0.32, s * 0.2, '#f2a03e');
});
def('K', 'Cauldron', 'prop', { group: 'Light' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.56, s * 0.3, '#2e2e34', '#18181c', Math.max(1, s * 0.045));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.22, '#4a7a4a');
  circle(c, x + s * 0.42, y + s * 0.46, s * 0.06, '#8fc98f');
});

/* --- nature --- */

def('T', 'Tree', 'prop', { group: 'Nature', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.44, y + s * 0.6, s * 0.12, s * 0.3, '#4a3620');
  circle(c, x + s * 0.5, y + s * 0.46, s * 0.36, '#2f4a24');
  circle(c, x + s * 0.4, y + s * 0.38, s * 0.22, '#3b5c2d');
  circle(c, x + s * 0.62, y + s * 0.5, s * 0.17, '#365224');
});
def('Y', 'Bush', 'prop', { group: 'Nature', difficult: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.38, y + s * 0.56, s * 0.2, '#375a28');
  circle(c, x + s * 0.62, y + s * 0.58, s * 0.19, '#2f4d22');
  circle(c, x + s * 0.5, y + s * 0.42, s * 0.21, '#40682e');
});
def('O', 'Boulder', 'prop', { group: 'Nature', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  poly(
    c,
    [
      [x + s * 0.2, y + s * 0.8],
      [x + s * 0.12, y + s * 0.46],
      [x + s * 0.36, y + s * 0.18],
      [x + s * 0.7, y + s * 0.2],
      [x + s * 0.88, y + s * 0.52],
      [x + s * 0.76, y + s * 0.82],
    ],
    '#6a6862',
    '#3f3e3a',
    Math.max(1, s * 0.04)
  );
  poly(c, [[x + s * 0.34, y + s * 0.36], [x + s * 0.56, y + s * 0.28], [x + s * 0.5, y + s * 0.5]], '#807d76');
});
def('6', 'Stalagmite', 'prop', { group: 'Nature', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  poly(c, [[x + s * 0.5, y + s * 0.1], [x + s * 0.76, y + s * 0.9], [x + s * 0.24, y + s * 0.9]], '#5c5850', '#35322c', Math.max(1, s * 0.04));
  poly(c, [[x + s * 0.5, y + s * 0.16], [x + s * 0.6, y + s * 0.88], [x + s * 0.46, y + s * 0.88]], '#726d63');
});
def('(', 'Fallen log', 'prop', { group: 'Nature', difficult: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.04, y + s * 0.36, s * 0.92, s * 0.3, '#5c4526');
  c.strokeStyle = '#3a2a18';
  c.lineWidth = Math.max(1, s * 0.04);
  c.strokeRect(x + s * 0.04, y + s * 0.36, s * 0.92, s * 0.3);
  circle(c, x + s * 0.1, y + s * 0.51, s * 0.13, '#7a5c38', '#3a2a18', 1);
});
def('5', 'Mushrooms', 'prop', { group: 'Nature' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 3; i++) {
    const mx = x + s * (0.28 + i * 0.22);
    const my = y + s * (0.5 + r(i + 37) * 0.24);
    rect(c, mx - s * 0.03, my, s * 0.06, s * 0.18, '#d8d2c2');
    circle(c, mx, my, s * 0.11, i === 1 ? '#8f7fd4' : '#a8484a');
  }
});
def('&', 'Flowers', 'prop', { group: 'Nature' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  for (let i = 0; i < 4; i++) {
    circle(c, x + s * (0.2 + r(i + 38) * 0.6), y + s * (0.2 + r(i + 39) * 0.6), s * 0.07, ['#e8c476', '#d47f9f', '#8f7fd4', '#e0e0d0'][i % 4]);
  }
});
def('7', 'Cobwebs', 'prop', { group: 'Nature', difficult: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  c.strokeStyle = 'rgba(220,220,210,0.5)';
  c.lineWidth = Math.max(1, s * 0.025);
  for (let i = 0; i < 4; i++) line(c, x, y, x + s * (0.3 + i * 0.25), y + s, 'rgba(220,220,210,0.45)', Math.max(1, s * 0.025));
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.arc(x, y, s * i * 0.3, 0, Math.PI / 2);
    c.stroke();
  }
});

/* --- shrine, magic, markers --- */

def('A', 'Altar', 'prop', { group: 'Shrine', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.12, y + s * 0.24, s * 0.76, s * 0.56, '#8d8a95', '#4a4854');
  c.strokeStyle = '#4a4854';
  c.lineWidth = Math.max(1, s * 0.045);
  c.strokeRect(x + s * 0.12, y + s * 0.24, s * 0.76, s * 0.56);
  rect(c, x + s * 0.06, y + s * 0.18, s * 0.88, s * 0.12, '#a5a2ad');
  rect(c, x + s * 0.46, y + s * 0.36, s * 0.08, s * 0.34, '#d4a94f');
  rect(c, x + s * 0.34, y + s * 0.44, s * 0.32, s * 0.08, '#d4a94f');
});
def('U', 'Statue', 'prop', { group: 'Shrine', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.78, s * 0.32, '#5f5d66', '#3a3944', Math.max(1, s * 0.04));
  poly(c, [[x + s * 0.38, y + s * 0.76], [x + s * 0.42, y + s * 0.34], [x + s * 0.58, y + s * 0.34], [x + s * 0.62, y + s * 0.76]], '#8d8a95');
  circle(c, x + s * 0.5, y + s * 0.28, s * 0.12, '#9e9ba6');
});
def('P', 'Pillar', 'prop', { group: 'Shrine', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.34, '#7e7b87', '#4a4854', Math.max(1, s * 0.05));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.22, '#8d8a95');
  circle(c, x + s * 0.44, y + s * 0.44, s * 0.1, '#a5a2ad');
});
def('Z', 'Magic circle', 'prop', { group: 'Shrine' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.4, null, '#8f7fd4', Math.max(1, s * 0.05));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.26, null, '#b0a3ec', Math.max(1, s * 0.04));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    circle(c, x + s * 0.5 + Math.cos(a) * s * 0.33, y + s * 0.5 + Math.sin(a) * s * 0.33, s * 0.045, '#b0a3ec');
  }
});
def('Q', 'Crystals', 'prop', { group: 'Shrine', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  poly(c, [[x + s * 0.34, y + s * 0.86], [x + s * 0.26, y + s * 0.46], [x + s * 0.4, y + s * 0.26], [x + s * 0.5, y + s * 0.86]], '#6fa8c4', '#3d6d85', 1);
  poly(c, [[x + s * 0.5, y + s * 0.86], [x + s * 0.56, y + s * 0.36], [x + s * 0.72, y + s * 0.5], [x + s * 0.72, y + s * 0.86]], '#8fc4dc', '#3d6d85', 1);
});
def('M', 'Gravestone', 'prop', { group: 'Shrine' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  c.beginPath();
  c.moveTo(x + s * 0.28, y + s * 0.86);
  c.lineTo(x + s * 0.28, y + s * 0.4);
  c.quadraticCurveTo(x + s * 0.5, y + s * 0.16, x + s * 0.72, y + s * 0.4);
  c.lineTo(x + s * 0.72, y + s * 0.86);
  c.closePath();
  c.fillStyle = '#6d6a73';
  c.fill();
  c.strokeStyle = '#3f3d45';
  c.lineWidth = Math.max(1, s * 0.04);
  c.stroke();
  rect(c, x + s * 0.46, y + s * 0.4, s * 0.08, s * 0.28, '#4d4b53');
  rect(c, x + s * 0.36, y + s * 0.48, s * 0.28, s * 0.08, '#4d4b53');
});
def('W', 'Well', 'prop', { group: 'Shrine', blocked: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.38, '#6d6a63', '#3f3d38', Math.max(1, s * 0.05));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.24, '#1e3a4d');
  circle(c, x + s * 0.44, y + s * 0.44, s * 0.07, '#3d6d85');
});
def('N', 'Fountain', 'prop', { group: 'Shrine' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.4, '#8d8a95', '#4a4854', Math.max(1, s * 0.05));
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.29, '#3d6d85');
  circle(c, x + s * 0.5, y + s * 0.5, s * 0.11, '#a5a2ad');
  circle(c, x + s * 0.5, y + s * 0.46, s * 0.05, '#8fc4dc');
});
def('X', 'Spike trap', 'prop', { group: 'Shrine', dmOnly: true }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76, '#241416');
  for (let i = 0; i < 3; i++) {
    poly(
      c,
      [
        [x + s * (0.22 + i * 0.24), y + s * 0.8],
        [x + s * (0.3 + i * 0.24), y + s * 0.24],
        [x + s * (0.38 + i * 0.24), y + s * 0.8],
      ],
      '#9aa0a8',
      '#5a5f66',
      1
    );
  }
});
def('?', 'Signpost', 'prop', { group: 'Shrine' }, (c, x, y, s, r, th) => {
  ground(c, x, y, s, r, th.base, th.dark);
  rect(c, x + s * 0.46, y + s * 0.3, s * 0.08, s * 0.6, '#5c4526');
  rect(c, x + s * 0.16, y + s * 0.26, s * 0.68, s * 0.22, '#8a6a3a', '#4a3620');
  line(c, x + s * 0.26, y + s * 0.34, x + s * 0.66, y + s * 0.34, '#4a3620', Math.max(1, s * 0.03));
  line(c, x + s * 0.26, y + s * 0.41, x + s * 0.56, y + s * 0.41, '#4a3620', Math.max(1, s * 0.03));
});
def('}', 'Banner', 'prop', { group: 'Shrine' }, (c, x, y, s, r, th) => {
  block(c, x, y, s, th.wall, th.wallEdge);
  poly(
    c,
    [
      [x + s * 0.28, y + s * 0.1],
      [x + s * 0.72, y + s * 0.1],
      [x + s * 0.72, y + s * 0.76],
      [x + s * 0.5, y + s * 0.62],
      [x + s * 0.28, y + s * 0.76],
    ],
    '#7d3a3f',
    '#4a2226',
    Math.max(1, s * 0.035)
  );
  circle(c, x + s * 0.5, y + s * 0.36, s * 0.12, '#d4a94f');
});

export const TILES = T;

// Palette groups in the order the build tools show them.
export const TILE_GROUPS = ['Ground', 'Water', 'Walls', 'Doors', 'Furniture', 'Objects', 'Light', 'Nature', 'Shrine'];

export const DEFAULT_FLOOR_CHAR = '.';

export const tileAt = (ch) => TILES[ch] || TILES['.'];
export const isBlockedChar = (ch) => !!(TILES[ch] && TILES[ch].blocked);
export const isDifficultChar = (ch) => !!(TILES[ch] && TILES[ch].difficult);

export const tilesInGroup = (group) => Object.values(TILES).filter((t) => t.group === group);

// Deterministic 0..1 noise keyed on a cell so terrain never shimmers on redraw.
export function cellRandom(x, y) {
  return (i) => {
    let h = (x * 374761393 + y * 668265263 + i * 1103515245) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
}
