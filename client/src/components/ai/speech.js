import { makeFilter } from '../../ai/profanity';

// Listening to the table, for the DM's AI suggestions.
//
// The browser's speech recognition (Chrome, Edge, Safari) turns what the
// microphone hears into text. Every piece of it, interim guesses included,
// goes through the profanity filter the moment it arrives: only the cleaned
// text is kept, shown, or sent to a model. Nothing is saved: the transcript
// lives in this tab's memory as a rolling window (the last WINDOW_CHARS
// characters), and is gone when the tab closes or the DM clears it. The DM
// can choose to save an excerpt into a scene's notes (that goes through the
// server's own filter too).
//
// Where there is no recognition (Firefox), the DM types or pastes lines into
// the same pipeline.

export const WINDOW_CHARS = 6000;

export function recognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** A short bleep in place of a filtered word (Web Audio, quiet). */
let audioCtx = null;
export function bleep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 1000;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch { /* no audio */ }
}

/** Read text aloud with the browser's own voices. */
export function speak(text, { rate = 1, voice = '' } = {}) {
  if (!ttsSupported() || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\[bleep\]/g, ''));
  u.rate = rate;
  if (voice) { const v = window.speechSynthesis.getVoices().find((x) => x.name === voice); if (v) u.voice = v; }
  window.speechSynthesis.speak(u);
}
export const stopSpeaking = () => { if (ttsSupported()) window.speechSynthesis.cancel(); };

/**
 * The transcript: filtered lines in memory, with a rolling window.
 *   const t = createTranscript({ filter: { level, style, custom, allow, tone } })
 *   t.ingest(text, { final, source })   any text in (speech, typed, injected)
 *   t.subscribe(fn)                     fn({ lines, interim, newSince })
 *   t.window()                          the text to give a model
 */
export function createTranscript(opts = {}) {
  let lines = []; // { id, ts, text, bleeps, source }
  let interim = '';
  let filter = buildFilter(opts.filter);
  let tone = opts.filter?.tone !== false;
  let changedAt = 0, usedAt = 0;
  const subs = new Set();
  const emit = () => { for (const fn of subs) fn({ lines, interim, newSince: changedAt > usedAt }); };

  function buildFilter(f = {}) {
    const words = (s) => String(s || '').split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    return makeFilter({ level: f.level || 'standard', style: f.style || 'stars', custom: words(f.custom), allow: words(f.allow) });
  }
  function trim() {
    let total = lines.reduce((n, l) => n + l.text.length + 1, 0);
    while (lines.length && total > WINDOW_CHARS) total -= lines.shift().text.length + 1;
  }
  return {
    setFilter(f) { filter = buildFilter(f); tone = f?.tone !== false; },
    ingest(raw, { final = true, source = 'speech' } = {}) {
      const r = filter(String(raw || '').trim()); // the raw text goes no further than this line
      if (!final) { interim = r.text; emit(); return r; }
      interim = '';
      if (r.text) {
        lines = [...lines, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), text: r.text, bleeps: r.count, source }];
        trim();
        changedAt = Date.now();
      }
      if (r.count && tone) bleep();
      emit();
      return r;
    },
    clear() { lines = []; interim = ''; changedAt = usedAt = 0; emit(); },
    remove(id) { lines = lines.filter((l) => l.id !== id); emit(); },
    subscribe(fn) { subs.add(fn); fn({ lines, interim, newSince: changedAt > usedAt }); return () => subs.delete(fn); },
    window(maxChars = 3500) {
      let out = '';
      for (let i = lines.length - 1; i >= 0 && out.length < maxChars; i--) out = `${lines[i].text}\n${out}`;
      return out.trim();
    },
    markUsed() { usedAt = Date.now(); emit(); },
    hasNew: () => changedAt > usedAt,
    get lines() { return lines; },
  };
}

/**
 * Continuous recognition that keeps itself running (Chrome ends a session
 * after a silence; it is restarted while the DM wants to listen).
 * onText(text, final) gets RAW text: hand it straight to transcript.ingest.
 */
export function createListener({ lang = 'en-US', onText, onState }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  let rec = null, want = false, restarts = 0;
  const state = (s, detail) => onState?.(s, detail);
  function start() {
    if (!SR) { state('unsupported'); return; }
    want = true;
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onstart = () => { restarts = 0; state('listening'); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        onText(res[0].transcript, res.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; state('denied'); }
      else if (e.error === 'audio-capture') { want = false; state('nomic'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') state('error', e.error);
    };
    rec.onend = () => {
      if (want && restarts++ < 50) { try { rec.start(); return; } catch { /* fall through */ } }
      want = false;
      state('stopped');
    };
    try { rec.start(); } catch { state('error', 'start'); }
  }
  function stop() { want = false; try { rec?.stop(); } catch { /* already */ } state('stopped'); }
  return { start, stop, get listening() { return want; } };
}
