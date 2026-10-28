// The table's sound: generated, adaptive music; effects (a few CC0
// recordings in /public/sounds, the rest synthesized); and ambience for
// the place. Three buses with their own volume and mute, remembered per
// browser. Nothing plays until the first click or tap (browsers require
// a gesture before audio can start).

const SETTINGS_KEY = 'dnd_audio';
const DEFAULTS = { music: { vol: 0.55, muted: false }, sfx: { vol: 0.8, muted: false }, ambience: { vol: 0.6, muted: false } };

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (s) return { ...DEFAULTS, ...s }; } catch { /* private mode */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

/* ---------------- notes and scales ---------------- */
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
};
// degree (0-based, can exceed 7) in a scale from a root midi note
const deg = (root, scale, d) => root + SCALES[scale][((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const triad = (root, scale, d) => [deg(root, scale, d), deg(root, scale, d + 2), deg(root, scale, d + 4)];

/* ---------------- the moods ---------------- */
// bpm, key, scale, chord progression (scale degrees, one per bar), and
// which instruments play. Each mood is its own little arrangement.
export const MOODS = {
  explore: { bpm: 72, root: NOTE.D + 48, scale: 'dorian', prog: [0, 6, 3, 0, 5, 6, 4, 0], parts: { pad: 0.5, harp: 0.55, bass: 0.2, bells: 0.3 }, cutoff: 1400 },
  tavern: { bpm: 104, root: NOTE.G + 48, scale: 'mixolydian', prog: [0, 3, 4, 0, 0, 3, 6, 4], parts: { lute: 0.55, oompah: 0.45, handdrum: 0.4, shaker: 0.2, pad: 0.18 }, cutoff: 2200 },
  sneak: { bpm: 66, root: NOTE.E + 40, scale: 'phrygian', prog: [0, 0, 1, 0, 0, 0, 6, 0], parts: { pulse: 0.55, pad: 0.35, harp: 0.22, tick: 0.25 }, cutoff: 520 },
  tension: { bpm: 84, root: NOTE.C + 40, scale: 'harmonic', prog: [0, 0, 5, 4, 0, 0, 5, 4], parts: { drone: 0.5, heartbeat: 0.55, tremolo: 0.22, pad: 0.3 }, cutoff: 800, rise: true },
  combat: { bpm: 128, root: NOTE.A + 36, scale: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4], parts: { taiko: 0.65, ostinato: 0.45, pad: 0.35, bass8: 0.45, snare: 0.25 }, cutoff: 1800 },
  boss: { bpm: 140, root: NOTE.D + 36, scale: 'harmonic', prog: [0, 1, 0, 5, 0, 1, 6, 4], parts: { taiko: 0.75, boom: 0.6, ostinato: 0.5, brass: 0.45, choir: 0.4, bass8: 0.5 }, cutoff: 2000 },
  rest: { bpm: 56, root: NOTE.F + 48, scale: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4], parts: { pad: 0.5, bells: 0.35, harp: 0.25 }, cutoff: 1100 },
  silence: { bpm: 60, root: 48, scale: 'major', prog: [0], parts: {}, cutoff: 1000 },
};

class Audio {
  constructor() {
    this.settings = loadSettings();
    this.ctx = null;
    this.mood = null;
    this.layers = new Map(); // mood -> { gain, step, nextTime, motif }
    this.ambient = null;
    this.samples = {};
    this.listeners = new Set();
  }

  /* ---------- start / settings ---------- */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 4;
    this.master.connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'sfx', 'ambience']) { const g = ctx.createGain(); g.connect(this.master); this.bus[k] = g; }
    this.applySettings();
    // a room for everything: a generated hall reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.6;
    this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.bus.music);
    this.sfxVerb = ctx.createConvolver(); this.sfxVerb.buffer = this._impulse(1.4, 3);
    const sv = ctx.createGain(); sv.gain.value = 0.35; this.sfxVerb.connect(sv); sv.connect(this.bus.sfx);
    this.noiseBuf = this._noise(2);
    // the ambience's own echo (so muting ambience silences it all)
    this.ambVerb = ctx.createConvolver(); this.ambVerb.buffer = this._impulse(2.2, 2.5);
    const av = ctx.createGain(); av.gain.value = 0.5; this.ambVerb.connect(av); av.connect(this.bus.ambience);
    for (const n of ['whoosh-1', 'whoosh-2', 'impact', 'growl-1', 'growl-2', 'ring', 'forest']) this._load(n);
    this._timer = setInterval(() => this._schedule(), 50);
    if (this.mood) { const m = this.mood; this.mood = null; this.setMood(m); }
    if (this.ambientWant) this.setAmbience(this.ambientWant);
  }

  get(k) { return this.settings[k]; }
  set(k, patch) {
    this.settings = { ...this.settings, [k]: { ...this.settings[k], ...patch } };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    this.applySettings();
    this.listeners.forEach((f) => f(this.settings));
  }
  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  applySettings() {
    if (!this.ctx) return;
    for (const k of ['music', 'sfx', 'ambience']) {
      const s = this.settings[k];
      this.bus[k].gain.setTargetAtTime(s.muted ? 0 : s.vol * s.vol, this.ctx.currentTime, 0.08); // squared: a natural-feeling slider
    }
  }

  /* ---------- building blocks ---------- */
  _impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay; }
    return buf;
  }
  _noise(seconds) {
    const ctx = this.ctx, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  async _load(name) {
    try {
      const res = await fetch(`/sounds/${name}.mp3`);
      this.samples[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      if (name === 'forest' && this.ambientWant) this.setAmbience(this.ambientWant, true);
    } catch { /* missing sample: the synth stands in */ }
  }
  _env(g, t, a, peak, d, sustain = 0, r = 0.1, len = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || peak * 0.0005), t + a + d);
    if (len) { g.gain.setValueAtTime(Math.max(0.0001, sustain || 0.0001), t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + r); }
  }
  _osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end + 0.05); return o;
  }
  _noiseSrc(t, dur, dest) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05); return s;
  }
  _filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  /* ---------- instruments (music) ---------- */
  // each writes into `out` (the mood layer), with a send to the reverb
  _voice(out, wet = 0.4) { const g = this._gain(1); g.connect(out); const s = this._gain(wet); g.connect(s); s.connect(this._verb || this.reverb); return g; } // effects echo on their own bus
  pad(out, notes, t, len, vol, cutoff) {
    const v = this._voice(out, 0.6), f = this._filter('lowpass', cutoff, 0.5), g = this._gain(0);
    f.connect(g); g.connect(v);
    for (const n of notes) for (const det of [-7, 6]) this._osc('sawtooth', hz(n), t, t + len + 2.5, f, det);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 0.05, t + Math.min(1.6, len * 0.4));
    g.gain.setValueAtTime(vol * 0.05, t + len); g.gain.linearRampToValueAtTime(0, t + len + 2.4);
  }
  pluck(out, n, t, vol, decay = 1.4, bright = 3000) {
    const v = this._voice(out, 0.45), f = this._filter('lowpass', bright), g = this._gain(0);
    f.connect(g); g.connect(v);
    this._osc('triangle', hz(n), t, t + decay, f); this._osc('sine', hz(n + 12), t, t + decay * 0.5, f);
    this._env(g, t, 0.004, vol * 0.22, decay);
  }
  bell(out, n, t, vol) {
    const v = this._voice(out, 0.7), g = this._gain(0); g.connect(v);
    this._osc('sine', hz(n), t, t + 3, g); this._osc('sine', hz(n) * 2.76, t, t + 1.4, g);
    this._env(g, t, 0.003, vol * 0.12, 3);
  }
  bass(out, n, t, len, vol) {
    const v = this._voice(out, 0.1), f = this._filter('lowpass', 500), g = this._gain(0);
    f.connect(g); g.connect(v);
    this._osc('triangle', hz(n), t, t + len, f); this._osc('sine', hz(n - 12), t, t + len, f);
    this._env(g, t, 0.01, vol * 0.3, len, vol * 0.18, 0.08, len * 0.85);
  }
  drum(out, t, vol, f0 = 90, f1 = 42, dur = 0.5, noise = 0.3) {
    const v = this._voice(out, 0.25), g = this._gain(0); g.connect(v);
    const o = this._osc('sine', f0, t, t + dur, g);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    this._env(g, t, 0.003, vol * 0.9, dur);
    if (noise) { const nf = this._filter('lowpass', 900), ng = this._gain(0); nf.connect(ng); ng.connect(v); this._noiseSrc(t, 0.12, nf); this._env(ng, t, 0.002, vol * noise, 0.1); }
  }
  hiss(out, t, vol, dur = 0.05, f = 7000) {
    const v = this._voice(out, 0.2), hp = this._filter('highpass', f), g = this._gain(0);
    hp.connect(g); g.connect(v); this._noiseSrc(t, dur, hp); this._env(g, t, 0.002, vol, dur);
  }
  bow(out, n, t, len, vol, cutoff = 2400) {
    const v = this._voice(out, 0.35), f = this._filter('lowpass', cutoff, 1), g = this._gain(0);
    f.connect(g); g.connect(v);
    this._osc('sawtooth', hz(n), t, t + len, f, -4); this._osc('sawtooth', hz(n), t, t + len, f, 5);
    this._env(g, t, 0.01, vol * 0.1, len * 0.9);
  }
  brass(out, notes, t, len, vol) {
    const v = this._voice(out, 0.5), f = this._filter('lowpass', 300, 2), g = this._gain(0);
    f.connect(g); g.connect(v);
    f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1800, t + 0.12); f.frequency.exponentialRampToValueAtTime(600, t + len);
    for (const n of notes) { this._osc('sawtooth', hz(n), t, t + len, f, -6); this._osc('sawtooth', hz(n), t, t + len, f, 6); }
    this._env(g, t, 0.04, vol * 0.08, len, vol * 0.03, 0.3, len);
  }
  choir(out, notes, t, len, vol) {
    const v = this._voice(out, 0.8), g = this._gain(0); g.connect(v);
    const formants = [700, 1150, 2600].map((fr, i) => { const b = this._filter('bandpass', fr, 6); const bg = this._gain([1, 0.6, 0.25][i]); b.connect(bg); bg.connect(g); return b; });
    for (const n of notes) for (const det of [-9, 0, 8]) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; formants.forEach((b) => o.connect(b)); o.start(t); o.stop(t + len + 1.6); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 0.12, t + 0.8); g.gain.setValueAtTime(vol * 0.12, t + len); g.gain.linearRampToValueAtTime(0, t + len + 1.5);
  }

  /* ---------- the music scheduler ---------- */
  setMood(name) {
    const m = MOODS[name] ? name : 'explore';
    if (m === this.mood) return;
    const prev = this.mood;
    this.mood = m;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (prev && this.layers.has(prev)) {
      const L = this.layers.get(prev);
      L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(L.gain.gain.value, now); L.gain.gain.linearRampToValueAtTime(0, now + 2.5);
      L.ending = now + 2.6;
    }
    if (m === 'silence') return;
    const gain = this._gain(0); gain.connect(this.bus.music);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 2.5);
    // start on the next bar line of a fresh clock
    this.layers.set(m, { gain, step: 0, nextTime: now + 0.15, ending: null, motif: this._motif(), seed: Math.random() });
  }
  _motif() { const out = []; for (let i = 0; i < 8; i++) out.push(Math.random() < 0.55 ? Math.floor(Math.random() * 6) : null); return out; }
  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.25;
    for (const [name, L] of this.layers) {
      if (L.ending && this.ctx.currentTime > L.ending) { L.gain.disconnect(); this.layers.delete(name); continue; }
      const M = MOODS[name], s16 = 60 / M.bpm / 4;
      while (L.nextTime < ahead) { this._step(M, L, L.step, L.nextTime, s16); L.step++; L.nextTime += s16; }
    }
  }
  _step(M, L, step, t, s16) {
    const out = L.gain, p = M.parts, bar = Math.floor(step / 16), i = step % 16, R = M.root, S = M.scale;
    const chordDeg = M.prog[bar % M.prog.length], chord = triad(R + 12, S, chordDeg), barLen = s16 * 16;
    const rnd = Math.random;
    const cutoff = M.rise ? M.cutoff * (1 + ((bar % 8) + i / 16) / 3) : M.cutoff;
    if (bar % 8 === 0 && i === 0) L.motif = rnd() < 0.5 ? this._motif() : L.motif; // vary the tune every 8 bars
    // pads and drones: a chord every bar (or two)
    if (p.pad && i === 0 && bar % (M.bpm > 100 ? 1 : 2) === 0) this.pad(out, chord, t, barLen * (M.bpm > 100 ? 1 : 2), p.pad, cutoff);
    if (p.drone && i === 0 && bar % 4 === 0) this.pad(out, [R, R + 7, R + 12], t, barLen * 4, p.drone * 1.2, cutoff);
    if (p.choir && i === 0 && bar % 2 === 0) this.choir(out, [chord[0], chord[2]], t, barLen * 2, p.choir);
    // melody instruments
    if (p.harp && i % 2 === 0) { const d = L.motif[(i / 2) % 8]; if (d !== null && rnd() < 0.55) this.pluck(out, deg(R + 24, S, chordDeg + d), t, p.harp, 1.8, 2600); }
    if (p.lute && i % 2 === 0) { const arp = [0, 2, 1, 2, 0, 2, 1, 2][(i / 2) % 8]; this.pluck(out, chord[arp] + 12, t, p.lute, 0.7, 3600); }
    if (p.bells && i === 0 && rnd() < 0.45) this.bell(out, deg(R + 36, S, chordDeg + [0, 2, 4][Math.floor(rnd() * 3)]), t + s16 * 8 * rnd(), p.bells);
    // bass lines
    if (p.bass && i === 0) this.bass(out, deg(R - 12, S, chordDeg), t, barLen * 0.9, p.bass);
    if (p.oompah && i % 4 === 0) this.bass(out, i % 8 === 0 ? deg(R - 12, S, chordDeg) : deg(R - 12, S, chordDeg + 4), t, s16 * 3, p.oompah);
    if (p.bass8 && i % 2 === 0) this.bass(out, deg(R - 12, S, chordDeg) + (i % 8 === 6 ? 7 : 0), t, s16 * 1.6, p.bass8);
    if (p.pulse && i % 4 === 0) this.bass(out, deg(R, S, chordDeg), t, s16 * 1.2, p.pulse);
    // strings
    if (p.ostinato) { const pat = [0, 0, 7, 0, 12, 0, 7, 0, 0, 0, 7, 0, 12, 7, 3, 7][i]; this.bow(out, deg(R, S, chordDeg) + 12 + pat, t, s16 * 0.9, p.ostinato, 2600); }
    if (p.tremolo && i % 1 === 0) this.bow(out, chord[(Math.floor(step / 32)) % 3] + 12, t, s16 * 0.8, p.tremolo * 0.6, 1600 + ((bar % 8) * 300));
    if (p.brass && (i === 0 || (i === 10 && bar % 2 === 1))) this.brass(out, [chord[0] - 12, chord[0], chord[2]], t, s16 * (i === 0 ? 6 : 3), p.brass);
    // percussion
    if (p.taiko && [0, 3, 6, 8, 10, 12, 14].includes(i) && (i !== 14 || bar % 2)) this.drum(out, t, p.taiko * ([0, 8].includes(i) ? 1 : 0.6), i % 8 === 0 ? 95 : 140, i % 8 === 0 ? 45 : 70, 0.45, 0.35);
    if (p.boom && i === 0 && bar % 2 === 0) this.drum(out, t, p.boom, 60, 30, 1.2, 0.5);
    if (p.snare && (i === 4 || i === 12)) this.hiss(out, t, p.snare * 0.4, 0.12, 1800);
    if (p.handdrum && [0, 6, 8, 11, 14].includes(i)) this.drum(out, t, p.handdrum * (i % 8 === 0 ? 0.8 : 0.45), i % 8 === 0 ? 180 : 260, i % 8 === 0 ? 110 : 170, 0.2, 0.15);
    if (p.shaker && i % 2 === 1) this.hiss(out, t, p.shaker * (i % 4 === 3 ? 0.35 : 0.2), 0.05, 6000);
    if (p.heartbeat && (i === 0 || i === 3)) this.drum(out, t, p.heartbeat * (i ? 0.6 : 1), 70, 40, 0.35, 0.05);
    if (p.tick && i % 4 === 2 && rnd() < 0.5) this.hiss(out, t, p.tick * 0.25, 0.02, 5000);
  }

  /* ---------- stings (one-off music moments) ---------- */
  sting(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05, out = this.bus.music;
    const dest = this._voice(out, 0.6);
    if (kind === 'victory') {
      const r = NOTE.C + 60;
      [0, 4, 7, 12].forEach((n, i) => this.brass(dest, [r + n - 12, r + n], t + i * 0.14, 0.5 + (i === 3 ? 1 : 0), 0.9));
      this.bell(dest, r + 24, t + 0.45, 0.9); this.drum(dest, t, 0.6, 90, 45, 0.6, 0.3);
    } else if (kind === 'defeat') {
      const r = NOTE.A + 48;
      [7, 3, 0, -5].forEach((n, i) => this.brass(dest, [r + n], t + i * 0.35, 0.6, 0.7));
      this.drum(dest, t + 1.1, 0.8, 60, 30, 1.4, 0.4);
    } else if (kind === 'levelup') {
      const r = NOTE.D + 60;
      [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.pluck(dest, r + n, t + i * 0.07, 0.9, 1.5, 5000));
      this.bell(dest, r + 24, t + 0.6, 1); this.choir(dest, [r, r + 7], t + 0.5, 1.2, 0.6);
    } else if (kind === 'alert') {
      this.brass(dest, [NOTE.D + 36, NOTE.D + 43, NOTE.D + 49], t, 0.6, 1); this.drum(dest, t, 0.9, 80, 35, 0.8, 0.5);
    } else if (kind === 'reveal') {
      [0, 7, 12, 19].forEach((n, i) => this.bell(dest, NOTE.E + 72 + n, t + i * 0.09, 0.6));
    }
  }

  /* ---------- sound effects ---------- */
  _sample(name, { vol = 1, rate = 1, at = 0, verb = true } = {}) {
    const b = this.samples[name];
    if (!this.ctx || !b) return false;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this._gain(vol); s.connect(g); g.connect(this.bus.sfx); if (verb) g.connect(this.sfxVerb);
    s.start(this.ctx.currentTime + at); return true;
  }
  _sfxOut(verb = 0.3) { const g = this._gain(1); g.connect(this.bus.sfx); if (verb) { const s = this._gain(verb); g.connect(s); s.connect(this.sfxVerb); } return g; }
  sfx(kind, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01, out = this._sfxOut(), r = Math.random;
    this._verb = this.sfxVerb;
    try { this._sfx(kind, o, t, out, r); } finally { this._verb = null; }
  }
  _sfx(kind, o, t, out, r) {
    switch (kind) {
      case 'swing': this._sample(r() < 0.5 ? 'whoosh-1' : 'whoosh-2', { vol: 0.8, rate: 0.9 + r() * 0.25 }); break;
      case 'hit':
        if (!this._sample('impact', { vol: 0.75, rate: 0.95 + r() * 0.15 })) this.drum(out, t, 0.8, 200, 60, 0.18, 0.8);
        this.drum(out, t, 0.5, 120, 50, 0.2, 0.6);
        break;
      case 'crit': this._sfx('hit', o, t, out, r); this._sample('ring', { vol: 0.7, rate: 1.2 }); this.drum(out, t, 0.9, 70, 30, 0.7, 0.5); break;
      case 'miss': this._sample('whoosh-2', { vol: 0.6, rate: 1.25 }); break;
      case 'bow': { // a string twang and the arrow away
        const g = this._gain(0); g.connect(out); const o = this._osc('triangle', 180, t, t + 0.25, g); o.frequency.exponentialRampToValueAtTime(120, t + 0.2); this._env(g, t, 0.002, 0.35, 0.22);
        this._sample('whoosh-1', { vol: 0.5, rate: 1.6, at: 0.03 });
        break;
      }
      case 'spell': { // a rising shimmer coloured by the element
        const el = o.element || 'force';
        const base = { fire: 220, cold: 660, lightning: 440, radiant: 520, necrotic: 140, acid: 300, poison: 260, thunder: 110, psychic: 380 }[el] || 330;
        for (let k = 0; k < 6; k++) { const g = this._gain(0); g.connect(out); const ob = this._osc(el === 'lightning' ? 'square' : 'sine', base * (1 + k * 0.5), t + k * 0.04, t + 0.9, g); ob.frequency.exponentialRampToValueAtTime(base * (2 + k * 0.6), t + 0.6); this._env(g, t + k * 0.04, 0.05, 0.05, 0.7); }
        const nf = this._filter(el === 'fire' ? 'lowpass' : 'bandpass', el === 'fire' ? 1200 : 3000, 1.5), ng = this._gain(0); nf.connect(ng); ng.connect(out); this._noiseSrc(t, 0.7, nf); this._env(ng, t, 0.15, 0.25, 0.5);
        break;
      }
      case 'growl': this._sample(r() < 0.5 ? 'growl-1' : 'growl-2', { vol: 0.8, rate: (o.big ? 0.65 : o.small ? 1.4 : 1) * (0.9 + r() * 0.2) }); break;
      case 'death': this.drum(out, t, 0.7, 90, 35, 0.6, 0.6); this._sample('growl-1', { vol: 0.5, rate: 0.55 }); break;
      case 'heal': [0, 4, 7, 12].forEach((n, i) => this.bell(out, 72 + n, t + i * 0.08, 0.7)); break;
      case 'door': { // a wooden thunk with a creak
        this.drum(out, t + 0.15, 0.7, 140, 70, 0.25, 0.5);
        const g = this._gain(0), f = this._filter('bandpass', 900, 8); f.connect(g); g.connect(out);
        const ob = this._osc('sawtooth', 60, t, t + 0.4, f); ob.frequency.linearRampToValueAtTime(95, t + 0.35); this._env(g, t, 0.05, 0.25, 0.35);
        break;
      }
      case 'trap': this.hiss(out, t, 0.6, 0.03, 4000); this.drum(out, t + 0.06, 0.6, 400, 120, 0.12, 0.4); this._sample('whoosh-2', { vol: 0.5, rate: 1.8, at: 0.08 }); break;
      case 'coins': for (let k = 0; k < 7; k++) { const g = this._gain(0); g.connect(out); this._osc('sine', 2400 + r() * 1800, t + k * 0.05 + r() * 0.03, t + k * 0.05 + 0.3, g); this._env(g, t + k * 0.05, 0.002, 0.08, 0.25); } break;
      case 'secret': [0, 7, 12, 19].forEach((n, i) => this.bell(out, NOTE.E + 72 + n, t + i * 0.09, 0.6)); break;
      case 'dice': for (let k = 0; k < 5; k++) { const tt = t + k * 0.07 + r() * 0.03; this.drum(out, tt, 0.25 - k * 0.03, 900 + r() * 500, 500, 0.04, 0.4); } break;
      case 'paper': { const f = this._filter('bandpass', 2500, 0.8), g = this._gain(0); f.connect(g); g.connect(out); this._noiseSrc(t, 0.35, f); this._env(g, t, 0.05, 0.25, 0.3); break; }
      case 'step': this.drum(out, t, 0.12, 110, 70, 0.07, 0.6); break;
      case 'ui': { const g = this._gain(0); g.connect(out); this._osc('sine', 880, t, t + 0.1, g); this._env(g, t, 0.002, 0.06, 0.08); break; }
      default:
    }
  }

  /* ---------- ambience ---------- */
  // kind: forest | night | cave | dungeon | tavern | volcanic | none, plus rain/wind/fire flags
  setAmbience(want, force = false) {
    this.ambientWant = want;
    if (!this.ctx) return;
    const key = JSON.stringify(want);
    if (!force && key === this._ambKey) return;
    this._ambKey = key;
    const now = this.ctx.currentTime;
    if (this.ambient) { const A = this.ambient; A.out.gain.setTargetAtTime(0, now, 0.8); clearInterval(A.timer); setTimeout(() => { A.stops.forEach((s) => { try { s.stop(); } catch { /* done */ } }); A.out.disconnect(); }, 4000); }
    const out = this._gain(0); out.connect(this.bus.ambience); out.gain.setTargetAtTime(1, now, 1.2);
    const stops = [];
    const loopNoise = (filterType, freq, q, vol, lfo = 0) => {
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = this._filter(filterType, freq, q), g = this._gain(vol); s.connect(f); f.connect(g); g.connect(out); s.start(); stops.push(s);
      if (lfo) { const l = this.ctx.createOscillator(); l.frequency.value = lfo; const lg = this._gain(vol * 0.6); l.connect(lg); lg.connect(g.gain); l.start(); stops.push(l); }
    };
    const k = want.kind;
    if (k === 'forest' && this.samples.forest) { const s = this.ctx.createBufferSource(); s.buffer = this.samples.forest; s.loop = true; const g = this._gain(0.9); s.connect(g); g.connect(out); s.start(); stops.push(s); }
    if (k === 'forest' && !this.samples.forest) loopNoise('lowpass', 500, 0.5, 0.08, 0.07);
    if (k === 'night') loopNoise('lowpass', 400, 0.5, 0.05, 0.05);
    if (k === 'cave' || k === 'dungeon') loopNoise('lowpass', k === 'cave' ? 220 : 160, 0.8, 0.12, 0.04);
    if (k === 'volcanic') { loopNoise('lowpass', 90, 1, 0.3, 0.1); loopNoise('bandpass', 1800, 0.5, 0.03, 0.3); }
    if (k === 'tavern') loopNoise('bandpass', 420, 1.2, 0.05, 0.6); // the room's murmur
    if (want.rain) { loopNoise('highpass', 1800, 0.3, 0.12); loopNoise('lowpass', 600, 0.5, 0.08); }
    if (want.wind) loopNoise('bandpass', 500, 2, 0.08, 0.08);
    // little sounds now and then: drips, crickets, crackles, distant birds
    const timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + Math.random() * 0.5, r = Math.random;
      if ((k === 'cave' || k === 'dungeon') && r() < 0.35) { const g = this._gain(0), d = this._gain(0.4); g.connect(out); g.connect(d); d.connect(this.ambVerb); const o = this._osc('sine', 1400 + r() * 1400, t, t + 0.15, g); o.frequency.exponentialRampToValueAtTime(600, t + 0.12); this._env(g, t, 0.002, 0.08, 0.12); }
      if (k === 'night') for (let c = 0; c < 3 && r() < 0.8; c++) { const g = this._gain(0); g.connect(out); const tt = t + c * 0.09; this._osc('sine', 4200 + r() * 300, tt, tt + 0.05, g); this._env(g, tt, 0.004, 0.025, 0.04); }
      if (want.fire && r() < 0.9) for (let c = 0; c < 3; c++) { const tt = t + r() * 0.4, f = this._filter('highpass', 1500 + r() * 2500), g = this._gain(0); f.connect(g); g.connect(out); this._noiseSrc(tt, 0.02, f); this._env(g, tt, 0.001, 0.05 + r() * 0.08, 0.02); }
      if (k === 'tavern' && r() < 0.2) { const g = this._gain(0); g.connect(out); this._osc('triangle', 300 + r() * 200, t, t + 0.3, g); this._env(g, t, 0.05, 0.015, 0.25); } // a far-off voice
    }, 500);
    this.ambient = { out, stops, timer };
  }
}

export const audio = new Audio();
if (typeof window !== 'undefined') {
  const go = () => audio.unlock();
  window.addEventListener('pointerdown', go, { capture: true });
  window.addEventListener('keydown', go, { capture: true });
  window.__audio = audio;
}
