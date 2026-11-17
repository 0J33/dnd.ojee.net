import { createTranscript, createListener, recognitionSupported } from './speech';
import { needsKey, suggest } from './llm';

// The DM's listening session for one tab: the transcript, the microphone and
// the suggestions. It outlives the AI dock, so closing the panel doesn't stop
// listening (the top-bar button shows a "Listening" light and stops it).
//
// Test hook (no microphone in a headless browser): dispatch
//   window.dispatchEvent(new CustomEvent('dnd:ai-transcript', { detail: { text, final } }))
// and it goes through exactly the path speech does.

const subs = new Set();
const s = {
  transcript: createTranscript({}),
  listener: null,
  status: 'off', // off | listening | denied | nomic | unsupported | error
  error: null,
  suggestions: [], // { id, kind, title, text, ... }
  suggesting: false,
  interim: '', // the words being heard right now (already filtered)
  lastSuggestAt: 0,
  cfg: null, // { settings, apiKey, code, scene }
  chat: [], // the assistant conversation (display) and its model messages
  messages: [],
};
let timer = null;
const emit = () => { for (const fn of subs) fn({ ...s }); };
s.transcript.subscribe((st) => { s.interim = st.interim; emit(); });

export function liveSession() { return s; }
export function subscribe(fn) { subs.add(fn); fn({ ...s }); return () => subs.delete(fn); }
export function update(patch) { Object.assign(s, patch); emit(); }

/** What the session needs to ask for suggestions; called by the dock as settings change. */
export function configure(cfg) {
  s.cfg = { ...(s.cfg || {}), ...cfg };
  if (cfg.settings) s.transcript.setFilter(cfg.settings.filter);
  schedule();
}

export function startListening() {
  if (!recognitionSupported()) { update({ status: 'unsupported' }); return; }
  if (s.listener?.listening) return;
  s.listener = createListener({
    lang: s.cfg?.settings?.lang || 'en-US',
    onText: (text, final) => s.transcript.ingest(text, { final, source: 'speech' }),
    onState: (st, detail) => update({ status: st === 'stopped' ? 'off' : st, error: detail || null }),
  });
  s.listener.start();
  schedule();
}
export function stopListening() {
  s.listener?.stop();
  update({ status: 'off' });
  schedule();
}

function schedule() {
  clearInterval(timer);
  timer = null;
  const st = s.cfg?.settings;
  if (!st?.autoSuggest || !(s.status === 'listening' || s.transcript.lines.length)) return;
  timer = setInterval(() => {
    const every = Math.max(20, Number(s.cfg?.settings?.suggestEvery) || 60) * 1000;
    if (s.status !== 'listening' || s.suggesting || !s.transcript.hasNew()) return;
    if (Date.now() - s.lastSuggestAt < every) return;
    requestSuggestions();
  }, 5000);
}

let abort = null;
/** Ask the model what fits now. Nothing is applied: the results are drafts. */
export async function requestSuggestions(ask = '') {
  const cfg = s.cfg;
  if (!cfg?.settings || needsKey(cfg.settings, cfg.apiKey)) { update({ error: 'Add an API key in Connect to get suggestions.' }); return; }
  abort?.abort();
  abort = new AbortController();
  update({ suggesting: true, error: null, lastSuggestAt: Date.now() });
  s.transcript.markUsed();
  try {
    const list = await suggest({ settings: cfg.settings, apiKey: cfg.apiKey, campaign: cfg.code, scene: cfg.scene, transcript: s.transcript.window(), ask, signal: abort.signal });
    const stamped = list.map((x, i) => ({ ...x, id: `${Date.now()}-${i}`, at: Date.now() }));
    update({ suggestions: [...stamped, ...s.suggestions].slice(0, 18), suggesting: false });
  } catch (err) {
    if (abort.signal.aborted) return;
    update({ suggesting: false, error: err.message || 'Suggestions failed' });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('dnd:ai-transcript', (e) => {
    const d = e.detail || {};
    s.transcript.ingest(String(d.text || ''), { final: d.final !== false, source: d.source || 'injected' });
  });
}
