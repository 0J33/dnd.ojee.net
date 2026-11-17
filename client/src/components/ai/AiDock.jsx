import React, { useEffect, useMemo, useRef, useState } from 'react';
import { aiApi, MCP_URL } from './aiApi';
import { ANTHROPIC_MODELS, PROVIDERS, providerOf, needsKey, loadKey, loadSettings, runAgent, saveKey, saveSettings, systemPrompt, listModels, isLocalUrl } from './llm';
import { configure, liveSession, requestSuggestions, startListening, stopListening, subscribe, update } from './liveSession';
import { recognitionSupported, speak, stopSpeaking, ttsSupported } from './speech';
import { FILTER_LEVELS, FILTER_STYLES } from '../../ai/profanity';
import { drawThumbnail } from '../../render/sceneRender';
import { CheckIcon, CopyIcon, InfoIcon, MapIcon, PencilIcon, PlayIcon, ScrollIcon, TrashIcon, UndoIcon, VolumeIcon, XIcon } from '../Icons';
import { BrainIcon, BulbIcon, KeyIcon, MicIcon, MicOffIcon, PlugIcon, ReviewIcon, SendIcon, StopIcon, WaveIcon } from './aiIcons';
import '../../styles/ai.css';

// The DM's AI dock (opened from AiLauncher in the game's top bar):
//   Review     what AI models proposed (from here or an MCP client): accept,
//              reject or quick-edit each change; auto-applied prep can be undone
//   Assistant  a chat with the DM's own model, using the table's tools
//   Listen     the microphone transcript (profanity filtered at capture),
//              live suggestions as editable drafts, read aloud
//   Build      a campaign from a pitch, and prep helpers for this one
//   Connect    API key and model; MCP tokens and how to connect clients

const TABS = [
  { key: 'review', name: 'Review', Icon: ReviewIcon },
  { key: 'assistant', name: 'Assistant', Icon: BrainIcon },
  { key: 'listen', name: 'Listen', Icon: MicIcon },
  { key: 'build', name: 'Build', Icon: MapIcon },
  { key: 'connect', name: 'Connect', Icon: PlugIcon },
];
const TAB_KEY = 'dnd.ai.tab';
const readTab = () => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } };

export default function AiDock({ code, state, proposals, refresh, setProposals, initialTab, onClose }) {
  const [tab, setTabState] = useState(initialTab || readTab() || 'assistant');
  const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* fine */ } };
  const [settings, setSettingsState] = useState(loadSettings);
  const [apiKey, setApiKeyState] = useState(loadKey);
  const setSettings = (patch) => setSettingsState((s) => { const n = { ...s, ...patch }; saveSettings(n); return n; });
  const setApiKey = (k, remember = settings.rememberKey) => { saveKey(k, remember); setApiKeyState(k); };
  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const sceneRef = scene ? { id: scene.id, name: scene.name } : null;

  useEffect(() => { configure({ settings, apiKey, code, scene: sceneRef }); }, [settings, apiKey, code, sceneRef?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialTab) setTabState(initialTab); }, [initialTab]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const waiting = proposals.reduce((n, p) => n + p.items.filter((i) => i.status === 'pending' || i.status === 'applied').length, 0);
  const ctx = { code, state, scene: sceneRef, settings, setSettings, apiKey, setApiKey, setTab, proposals, refresh, setProposals };

  return (
    <aside className="ai-dock panel" aria-label="AI assistant">
      <div className="modal-header ai-dock-head">
        <h3><BrainIcon size={15} /> AI assistant</h3>
        <button type="button" className="icon-btn ghost-btn" aria-label="Close the AI assistant" onClick={onClose}><XIcon size={15} /></button>
      </div>
      <div className="tab-row ai-tabs" role="tablist" aria-label="AI tools">
        {TABS.map(({ key, name, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <Icon size={13} /> {name}
            {key === 'review' && waiting > 0 && <span className="chip ai-count">{waiting}</span>}
          </button>
        ))}
      </div>
      <div className="ai-body" role="tabpanel">
        {tab === 'review' && <ReviewTab {...ctx} />}
        {tab === 'assistant' && <AssistantTab {...ctx} />}
        {tab === 'listen' && <ListenTab {...ctx} />}
        {tab === 'build' && <BuildTab {...ctx} />}
        {tab === 'connect' && <ConnectTab {...ctx} />}
      </div>
    </aside>
  );
}


function KeyHint({ setTab }) {
  return (
    <p className="ai-note">
      <KeyIcon size={14} /> Add your model's API key under <button type="button" className="link-btn" onClick={() => setTab('connect')}>Connect</button> to use the assistant. An AI app connected over MCP (Claude, ChatGPT, Gemini, Cursor...) needs no key here: it brings its own model.
    </p>
  );
}

/* ====================== Review ====================== */

const KIND_LABEL = { prep: 'Prep', live: 'Players will see this', destructive: 'Deletes' };
const STATUS_LABEL = { pending: 'Waiting', applied: 'Applied, not yet kept', accepted: 'Accepted', rejected: 'Rejected', reverted: 'Undone', failed: 'Failed' };
const ago = (t) => { const s = Math.round((Date.now() - new Date(t).getTime()) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };

function ReviewTab({ proposals, setProposals, refresh }) {
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { refresh(); }, [refresh]);
  const open = proposals.filter((p) => p.status === 'pending' || p.status === 'applied');
  const done = proposals.filter((p) => !open.includes(p));
  const put = (p) => p && p.id && setProposals((xs) => xs.map((x) => (x.id === p.id ? p : x)));
  return (
    <div className="ai-review">
      {!open.length && (
        <p className="muted ai-empty">
          Nothing waiting. Changes the assistant or a connected AI app (Claude, ChatGPT, Gemini, Cursor...) proposes land here first, and only reach the table when you accept them.
        </p>
      )}
      {open.map((p) => <ProposalCard key={p.id} p={p} onChange={put} />)}
      {done.length > 0 && (
        <button type="button" className="link-btn ai-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Hide' : 'Show'} {done.length} earlier set{done.length === 1 ? '' : 's'}
        </button>
      )}
      {showDone && done.map((p) => <ProposalCard key={p.id} p={p} onChange={put} compact />)}
    </div>
  );
}

function ProposalCard({ p, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [edits, setEdits] = useState({}); // itemId -> { path: value }
  const pending = p.items.filter((i) => i.status === 'pending');
  const applied = p.items.filter((i) => i.status === 'applied');
  const act = async (fn) => {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (res?.error) setErr(res.error); else onChange(res);
  };
  const acceptItems = (ids) => act(() => aiApi.accept(p.id, ids, Object.fromEntries(Object.entries(edits).filter(([k]) => !ids || ids.includes(k)))));
  const rejectItems = (ids) => act(() => aiApi.reject(p.id, ids));
  const liveCount = pending.filter((i) => i.kind !== 'prep').length;
  return (
    <section className={`ai-prop ${compact ? 'compact' : ''}`} aria-busy={busy}>
      <header className="ai-prop-head">
        <div>
          <h4>{p.title || 'Proposed changes'}</h4>
          <span className="muted small">{p.source === 'mcp' ? p.client || 'AI client' : 'Assistant'} · {ago(p.createdAt)} · {STATUS_LABEL[p.status] || p.status}</span>
        </div>
        {(pending.length > 1 || applied.length > 1) && !compact && (
          <div className="ai-prop-all">
            {pending.length > 0 && <button type="button" className="small-btn primary-btn" disabled={busy} onClick={() => acceptItems(null)} title={liveCount ? `${liveCount} of these reach the players` : ''}><CheckIcon size={13} /> Accept all</button>}
            {applied.length > 0 && !pending.length && <button type="button" className="small-btn primary-btn" disabled={busy} onClick={() => acceptItems(null)}><CheckIcon size={13} /> Keep all</button>}
            <button type="button" className="small-btn" disabled={busy} onClick={() => rejectItems(null)}><XIcon size={13} /> {applied.length ? 'Reject / undo all' : 'Reject all'}</button>
          </div>
        )}
      </header>
      {p.why && !compact && <p className="ai-why">{p.why}</p>}
      {err && <p className="ai-error" role="alert">{err}</p>}
      <ol className="ai-items">
        {p.items.map((it) => (
          <ProposalItem key={it.id} it={it} busy={busy} compact={compact}
            edit={edits[it.id]} onEdit={(path, v) => setEdits((e) => ({ ...e, [it.id]: { ...(e[it.id] || {}), [path]: v } }))}
            onAccept={() => acceptItems([it.id])} onReject={() => rejectItems([it.id])} />
        ))}
      </ol>
    </section>
  );
}

function ProposalItem({ it, busy, compact, edit, onEdit, onAccept, onReject }) {
  const [editing, setEditing] = useState(false);
  const open = it.status === 'pending' || it.status === 'applied' || it.status === 'failed';
  return (
    <li className={`ai-item kind-${it.kind} st-${it.status}`}>
      <div className="ai-item-top">
        <span className={`chip ai-kind ${it.kind}`}>{KIND_LABEL[it.kind] || it.kind}</span>
        <strong className="ai-item-title">{it.title}</strong>
        {!open && <span className="muted small ai-item-st">{STATUS_LABEL[it.status]}</span>}
      </div>
      {it.summary && <p className="ai-item-sum">{it.summary}</p>}
      {!compact && it.preview?.type === 'scene' && <ScenePreview preview={it.preview} />}
      {!compact && it.preview?.type === 'text' && !editing && <blockquote className="ai-readaloud paper">{it.preview.text}</blockquote>}
      {it.error && <p className="ai-error">{it.error}</p>}
      {editing && it.fields?.length > 0 && (
        <div className="ai-fields">
          {it.fields.map((f) => {
            const v = edit?.[f.path] ?? f.value ?? '';
            const id = `f-${it.id}-${f.path}`;
            return (
              <label key={f.path} className="ai-field" htmlFor={id}>
                <span className="field-label">{f.label}</span>
                {f.multiline
                  ? <textarea id={id} rows={Math.min(8, 2 + Math.round(String(v).length / 70))} value={v} maxLength={f.max || 4000} onChange={(e) => onEdit(f.path, e.target.value)} />
                  : <input id={id} type={f.type === 'number' ? 'number' : 'text'} value={v} maxLength={f.max || 400} onChange={(e) => onEdit(f.path, e.target.value)} />}
              </label>
            );
          })}
        </div>
      )}
      {open && !compact && (
        <div className="ai-item-actions">
          {it.status === 'pending' || it.status === 'failed' ? (
            <>
              <button type="button" className="small-btn primary-btn" disabled={busy} onClick={onAccept}><CheckIcon size={13} /> {it.status === 'failed' ? 'Try again' : editing ? 'Accept edited' : 'Accept'}</button>
              {it.fields?.length > 0 && it.status === 'pending' && <button type="button" className="small-btn" aria-pressed={editing} disabled={busy} onClick={() => setEditing((v) => !v)}><PencilIcon size={13} /> {editing ? 'Done editing' : 'Quick edit'}</button>}
              <button type="button" className={`small-btn ${it.kind === 'destructive' ? '' : 'ghost-btn'}`} disabled={busy} onClick={onReject}><XIcon size={13} /> Reject</button>
            </>
          ) : (
            <>
              <button type="button" className="small-btn primary-btn" disabled={busy} onClick={onAccept}><CheckIcon size={13} /> Keep</button>
              <button type="button" className="small-btn" disabled={busy} onClick={onReject}><UndoIcon size={13} /> Undo</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ScenePreview({ preview }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = { bg: { floor: preview.floor || 'stone' }, grid: { w: preview.w, h: preview.h }, cells: preview.cells, tokens: [] };
    const ratio = preview.h / preview.w;
    try { drawThumbnail(ref.current, scene, 300, Math.round(300 * ratio)); } catch { /* preview only */ }
  }, [preview]);
  const legend = Object.entries(preview.legend || {}).slice(0, 14);
  return (
    <figure className="ai-scene-prev">
      <canvas ref={ref} aria-label={`Map preview, ${preview.w} by ${preview.h} squares`} role="img" />
      {legend.length > 0 && <figcaption className="muted small">{legend.map(([, n]) => n).filter((n) => n !== '?').join(' · ')}{preview.tokens?.length ? ` · people: ${preview.tokens.map((t) => t.label).join(', ')}` : ''}</figcaption>}
    </figure>
  );
}

/* ====================== Assistant ====================== */

const QUICK = [
  { label: 'What now?', prompt: 'Look at the campaign, the scene we are on and the recent table log, then tell me in a few lines what could happen next and offer to set it up.' },
  { label: 'Balance a fight here', prompt: 'Plan a balanced encounter for the scene we are on (use plan_encounter for the party), explain the tactics in two lines, and propose placing it hidden.' },
  { label: 'People for this scene', prompt: 'Propose 2-3 NPCs for the scene we are on, each with a name, a one-line look, a voice and a secret in the DM note.' },
  { label: 'Read-aloud for the next beat', prompt: 'Find the next story beat that is not done and write it a better read-aloud (2-5 sentences); propose the change.' },
  { label: 'Rules question', prompt: 'Rules question: ', fill: true },
];

function useLive() {
  const [live, setLive] = useState(() => ({ ...liveSession() }));
  useEffect(() => subscribe(setLive), []);
  return live;
}

function AssistantTab({ code, state, scene, settings, apiKey, setTab, refresh }) {
  const live = useLive();
  const [input, setInput] = useState('');
  const [withTranscript, setWithTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const abort = useRef(null);
  const logRef = useRef(null);
  const chat = live.chat;
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [chat]);
  useEffect(() => {
    const onAsk = (e) => { if (e.detail?.prompt) send(e.detail.prompt); };
    window.addEventListener('dnd:ai-ask', onAsk);
    return () => window.removeEventListener('dnd:ai-ask', onAsk);
  });

  async function send(text) {
    const q = String(text || '').trim();
    if (!q || busy) return;
    if (needsKey(settings, apiKey)) return;
    const s = liveSession();
    const transcript = withTranscript ? s.transcript.window(2500) : '';
    const content = transcript ? `${q}\n\n<table_transcript>\n${transcript}\n</table_transcript>` : q;
    const msgs = s.messages;
    msgs.push({ role: 'user', content });
    const turn = { id: Date.now(), role: 'assistant', text: '', tools: [] };
    update({ chat: [...s.chat, { id: Date.now() - 1, role: 'user', text: q, withTranscript: !!transcript }, turn] });
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    const touch = () => update({ chat: [...liveSession().chat] });
    try {
      const final = await runAgent({
        settings, apiKey, campaign: code, messages: msgs, signal: abort.current.signal,
        system: systemPrompt({ campaign: code, campaignName: state.name, scene }),
        onText: (d) => { turn.text += d; touch(); },
        onTool: (t) => {
          const at = turn.tools.findIndex((x) => x.name === t.name && x.state === 'running' && JSON.stringify(x.input) === JSON.stringify(t.input));
          if (at >= 0) turn.tools[at] = t; else turn.tools.push(t);
          if (t.state !== 'running' && t.result?.proposal_id) refresh();
          touch();
        },
      });
      if (!turn.text) turn.text = final;
    } catch (err) {
      turn.error = abort.current?.signal.aborted ? 'Stopped.' : err.message;
    }
    setBusy(false);
    touch();
  }
  const newChat = () => { abort.current?.abort(); update({ chat: [], messages: [] }); };
  const proposed = (t) => t.result?.proposal_id;

  return (
    <div className="ai-assistant">
      {needsKey(settings, apiKey) && <KeyHint setTab={setTab} />}
      <div className="ai-chat" ref={logRef} aria-live="polite">
        {!chat.length && (
          <div className="muted ai-empty">
            <p>Ask for anything you'd prep or improvise: an encounter for this room, a rival's name and motive, a ruling, a whole adventure. The assistant reads the campaign through the table's tools; every change it suggests waits for you under Review.</p>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role}`}>
            {m.role === 'user' ? <p>{m.text}{m.withTranscript && <span className="chip small">+ transcript</span>}</p> : (
              <>
                {m.tools?.map((t, i) => (
                  <div key={i} className={`ai-toolchip ${t.state}`}>
                    <WaveIcon size={12} /> {t.name.replace(/_/g, ' ')}{t.state === 'running' ? '...' : t.state === 'error' ? `: ${t.result?.error || 'failed'}` : ''}
                    {proposed(t) && <button type="button" className="link-btn" onClick={() => setTab('review')}>{t.result.status === 'applied_pending_review' ? 'applied, review' : 'sent for review'}</button>}
                  </div>
                ))}
                {m.text && <div className="ai-text">{m.text}</div>}
                {m.error && <p className="ai-error">{m.error}</p>}
                {busy && m === chat[chat.length - 1] && !m.text && <p className="muted small">Thinking...</p>}
                {m.text && ttsSupported() && <button type="button" className="link-btn ai-say" onClick={() => speak(m.text, settings.tts)}><VolumeIcon size={12} /> Read aloud</button>}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="ai-quick" role="group" aria-label="Quick asks">
        {QUICK.map((q) => (
          <button key={q.label} type="button" className="small-btn" disabled={busy || needsKey(settings, apiKey)} onClick={() => (q.fill ? setInput(q.prompt) : send(q.prompt))}>{q.label}</button>
        ))}
      </div>
      <form className="ai-compose" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <label className="sr-only" htmlFor="ai-ask">Ask the assistant</label>
        <textarea id="ai-ask" rows={2} value={input} placeholder="Ask, or tell it what to prepare..." onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <div className="ai-compose-row">
          <label className="ai-check"><input type="checkbox" checked={withTranscript} onChange={(e) => setWithTranscript(e.target.checked)} /> Include what was said ({live.transcript.lines.length} lines)</label>
          <span className="ai-grow" />
          {chat.length > 0 && <button type="button" className="small-btn ghost-btn" onClick={newChat} disabled={busy}>New chat</button>}
          {busy
            ? <button type="button" className="small-btn" onClick={() => abort.current?.abort()}><StopIcon size={13} /> Stop</button>
            : <button type="submit" className="small-btn primary-btn" disabled={!input.trim() || needsKey(settings, apiKey)}><SendIcon size={13} /> Send</button>}
        </div>
      </form>
    </div>
  );
}

/* ====================== Listen ====================== */

const SUGGEST_KIND = { narration: 'Narration', read_aloud: 'Read-aloud', npc_line: 'NPC line', next_beat: 'Next beat', ruling: 'Ruling', tactics: 'Tactics', name: 'Names', loot: 'Loot', scene_change: 'Scene change', other: 'Idea' };

function ListenTab({ code, state, scene, settings, setSettings, apiKey, setTab }) {
  const live = useLive();
  const [typed, setTyped] = useState('');
  const [ask, setAsk] = useState('');
  const [saved, setSaved] = useState(null);
  const listening = live.status === 'listening';
  const supported = recognitionSupported();
  const lines = live.transcript.lines;
  const f = settings.filter;
  const setFilter = (patch) => setSettings({ filter: { ...f, ...patch } });
  const STATUS = { listening: 'Listening to the table', denied: 'Microphone blocked: allow it in the browser\'s site settings', nomic: 'No microphone found', unsupported: 'This browser can\'t transcribe speech (try Chrome or Edge); type lines below instead', error: `Speech error${live.error ? `: ${live.error}` : ''}`, off: 'Not listening' };

  const saveNote = async () => {
    const text = live.transcript.window(3000);
    if (!text) return;
    const res = await aiApi.saveNote(code, text, 'Table notes', scene?.id);
    setSaved(res.error ? { error: res.error } : { ok: `Saved to the notes of "${res.sceneName}".` });
  };

  return (
    <div className="ai-listen">
      <div className={`ai-mic ${listening ? 'on' : ''}`}>
        <button type="button" className={`ai-mic-btn ${listening ? 'on' : ''}`} aria-pressed={listening} disabled={!supported}
          onClick={() => (listening ? stopListening() : startListening())}>
          {listening ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
          <span>{listening ? 'Stop listening' : 'Listen'}</span>
        </button>
        <div>
          <p className="ai-mic-status" role="status">{listening && <span className="ai-rec-dot" aria-hidden="true" />}{STATUS[live.status] || STATUS.off}</p>
          <p className="muted small">Speech becomes text in this browser; strong language is replaced before anything is kept, shown or sent. Nothing is saved unless you save it. Tell your table you're listening.</p>
        </div>
      </div>

      <section className="ai-transcript" aria-label="Transcript">
        <div className="ai-sec-head">
          <h4>What was said</h4>
          <span className="muted small">{lines.length} lines, last ~{Math.round(live.transcript.window(99999).length / 6)} words kept</span>
          <span className="ai-grow" />
          <button type="button" className="small-btn ghost-btn" disabled={!lines.length} onClick={saveNote} title="Append to the current scene's DM notes"><ScrollIcon size={13} /> Save to notes</button>
          <button type="button" className="small-btn ghost-btn" disabled={!lines.length} onClick={() => live.transcript.clear()}><TrashIcon size={13} /> Clear</button>
        </div>
        {saved && <p className={saved.error ? 'ai-error' : 'ai-ok'} role="status">{saved.error || saved.ok}</p>}
        <ol className="ai-lines">
          {lines.slice(-30).map((l) => (
            <li key={l.id}>
              <span>{l.text}</span>{l.bleeps > 0 && <span className="chip small ai-bleep" title="Words filtered">{l.bleeps} bleeped</span>}
              <button type="button" className="icon-btn ghost-btn" aria-label="Remove this line" onClick={() => live.transcript.remove(l.id)}><XIcon size={11} /></button>
            </li>
          ))}
          {live.interim && <li className="ai-interim"><span>{live.interim}</span></li>}
          {!lines.length && <li className="muted">Nothing yet.</li>}
        </ol>
        <form className="ai-typed" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { live.transcript.ingest(typed, { source: 'typed' }); setTyped(''); } }}>
          <label className="sr-only" htmlFor="ai-typed">Add a line by hand</label>
          <input id="ai-typed" value={typed} placeholder={supported ? 'Or type a line (what a player said, a note)...' : 'Type what was said...'} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className="small-btn" disabled={!typed.trim()}>Add</button>
        </form>
      </section>

      <section className="ai-suggest" aria-label="Suggestions">
        <div className="ai-sec-head">
          <h4><BulbIcon size={14} /> Suggestions</h4>
          <span className="ai-grow" />
          <label className="ai-check"><input type="checkbox" checked={settings.autoSuggest} onChange={(e) => setSettings({ autoSuggest: e.target.checked })} /> Every
            <select aria-label="How often" value={settings.suggestEvery} onChange={(e) => setSettings({ suggestEvery: Number(e.target.value) })}>
              {[30, 60, 120, 300].map((n) => <option key={n} value={n}>{n < 60 ? `${n}s` : `${n / 60} min`}</option>)}
            </select>
          </label>
        </div>
        {needsKey(settings, apiKey) && <KeyHint setTab={setTab} />}
        <form className="ai-typed" onSubmit={(e) => { e.preventDefault(); requestSuggestions(ask); setAsk(''); }}>
          <label className="sr-only" htmlFor="ai-ask-now">Ask about this moment</label>
          <input id="ai-ask-now" value={ask} placeholder="Optional: what do you need? (a name, a ruling, what the ogre does...)" onChange={(e) => setAsk(e.target.value)} />
          <button type="submit" className="small-btn primary-btn" disabled={live.suggesting || needsKey(settings, apiKey)}><BulbIcon size={13} /> {live.suggesting ? 'Thinking...' : 'Suggest now'}</button>
        </form>
        {live.error && <p className="ai-error" role="alert">{live.error}</p>}
        <div className="ai-cards">
          {live.suggestions.map((s) => <SuggestionCard key={s.id} s={s} code={code} state={state} settings={settings} setTab={setTab} />)}
          {!live.suggestions.length && <p className="muted small">Suggestions appear here as drafts. Nothing is sent until you choose to.</p>}
        </div>
      </section>

      <details className="ai-filter">
        <summary>Language filter</summary>
        <div className="ai-filter-grid">
          <label className="ai-field"><span className="field-label">Strictness</span>
            <select value={f.level} onChange={(e) => setFilter({ level: e.target.value })}>{FILTER_LEVELS.map((x) => <option key={x.key} value={x.key}>{x.name}{x.hint ? ` - ${x.hint}` : ''}</option>)}</select>
          </label>
          <label className="ai-field"><span className="field-label">Shown as</span>
            <select value={f.style} onChange={(e) => setFilter({ style: e.target.value })}>{FILTER_STYLES.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
          </label>
          <label className="ai-field"><span className="field-label">Also filter (comma separated)</span><input value={f.custom} onChange={(e) => setFilter({ custom: e.target.value })} placeholder="words your table would rather not hear" /></label>
          <label className="ai-field"><span className="field-label">Never filter</span><input value={f.allow} onChange={(e) => setFilter({ allow: e.target.value })} placeholder="names that trip the filter" /></label>
          <label className="ai-check"><input type="checkbox" checked={f.tone} onChange={(e) => setFilter({ tone: e.target.checked })} /> Play a short bleep</label>
          <label className="ai-field"><span className="field-label">Speech language</span><input value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value })} placeholder="en-US" /></label>
        </div>
        <p className="muted small">Settings apply to new speech. The filter runs before text is kept anywhere; with strictness Off, nothing is replaced.</p>
      </details>
    </div>
  );
}

function SuggestionCard({ s, code, state, settings, setTab }) {
  const [text, setText] = useState(s.text);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const npc = s.token_id && state.scenes.flatMap((sc) => sc.tokens).find((t) => t.id === s.token_id);
  const toScene = s.scene_id && state.scenes.find((sc) => sc.id === s.scene_id);
  const beat = s.beat_id && state.story?.beats?.find((b) => b.id === s.beat_id);
  // The DM pressed the button: they reviewed it here, so the change goes in
  // through the same queue and is accepted at once (it stays in the history).
  const sendTool = async (name, input, label) => {
    setBusy(true); setMsg(null);
    const res = await aiApi.call(name, input, { campaign: code });
    let out = res.ok ? res.result : res;
    if (res.ok && out.proposal_id) out = await aiApi.accept(out.proposal_id, null, {});
    setBusy(false);
    setMsg(out?.error ? { error: out.error } : { ok: label });
  };
  const remove = () => update({ suggestions: liveSession().suggestions.filter((x) => x.id !== s.id) });
  return (
    <article className="ai-card paper">
      <header><span className="chip small">{SUGGEST_KIND[s.kind] || 'Idea'}</span> <strong>{s.title}</strong>
        <button type="button" className="icon-btn ghost-btn" aria-label="Dismiss suggestion" onClick={remove}><XIcon size={12} /></button>
      </header>
      <label className="sr-only" htmlFor={`sg-${s.id}`}>Edit the suggestion</label>
      <textarea id={`sg-${s.id}`} rows={Math.min(7, 2 + Math.round(text.length / 60))} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="ai-card-actions">
        {ttsSupported() && <button type="button" className="small-btn" onClick={() => speak(text, settings.tts)}><VolumeIcon size={13} /> Say it</button>}
        {ttsSupported() && <button type="button" className="icon-btn ghost-btn" aria-label="Stop reading" onClick={stopSpeaking}><StopIcon size={13} /></button>}
        {['narration', 'read_aloud', 'next_beat', 'other'].includes(s.kind) && !beat && <button type="button" className="small-btn primary-btn" disabled={busy || !text.trim()} onClick={() => sendTool('narrate', { text }, 'Narrated to the table.')}><SendIcon size={13} /> Narrate</button>}
        {s.kind === 'npc_line' && npc && <button type="button" className="small-btn primary-btn" disabled={busy || !text.trim()} onClick={() => sendTool('npc_say', { token_id: npc.id, text }, `${npc.label} says it.`)}><SendIcon size={13} /> {npc.label} says it</button>}
        {s.kind === 'npc_line' && !npc && <button type="button" className="small-btn primary-btn" disabled={busy || !text.trim()} onClick={() => sendTool('narrate', { text }, 'Narrated.')}><SendIcon size={13} /> Narrate</button>}
        {toScene && <button type="button" className="small-btn primary-btn" disabled={busy} onClick={() => sendTool('switch_scene', { scene_id: toScene.id }, `Moved to ${toScene.name}.`)}><MapIcon size={13} /> Go to {toScene.name}</button>}
        {beat && <button type="button" className="small-btn primary-btn" disabled={busy} onClick={() => sendTool('run_story_beat', { beat_id: beat.id }, `Ran "${beat.title}".`)}><PlayIcon size={13} /> Run "{beat.title}"</button>}
        <button type="button" className="small-btn ghost-btn" onClick={() => { try { navigator.clipboard.writeText(text); setMsg({ ok: 'Copied.' }); } catch { /* no clipboard */ } }}><CopyIcon size={13} /> Copy</button>
        <button type="button" className="small-btn ghost-btn" onClick={() => { setTab('assistant'); setTimeout(() => window.dispatchEvent(new CustomEvent('dnd:ai-ask', { detail: { prompt: `Set this up at the table (propose the changes): ${text}` } })), 50); }}><BrainIcon size={13} /> Set it up...</button>
      </div>
      {msg && <p className={msg.error ? 'ai-error' : 'ai-ok'} role="status">{msg.error || msg.ok}</p>}
    </article>
  );
}

/* ====================== Build ====================== */

function BuildTab({ state, settings, apiKey, setTab }) {
  const party = useMemo(() => {
    const sheets = Object.values(state.charSheets || {}).filter(Boolean);
    const lv = sheets.length ? Math.round(sheets.reduce((n, s) => n + (s.level || 1), 0) / sheets.length) : 1;
    return { level: lv, size: sheets.length || 4 };
  }, [state.charSheets]);
  const [pitch, setPitch] = useState('');
  const [parts, setParts] = useState(4);
  const [level, setLevel] = useState(party.level);
  const [size, setSize] = useState(party.size);
  const [tone, setTone] = useState('classic adventure');
  const [extras, setExtras] = useState({ npcs: true, traps: true, loot: true });
  const ask = (prompt) => { setTab('assistant'); setTimeout(() => window.dispatchEvent(new CustomEvent('dnd:ai-ask', { detail: { prompt } })), 60); };
  const build = (e) => {
    e.preventDefault();
    ask(`Build a campaign from this pitch, as ONE build_campaign call with ${parts} parts, for a level ${level} party of ${size}. Tone: ${tone}.
Pitch: ${pitch}
Each part: a scene (a fitting template or generator; built-in maps where they suit), a story beat with a 2-5 sentence read-aloud and DM notes (clues, what if the party...), an encounter balanced with a theme and difficulty that rises toward the end${extras.npcs ? ', 1-3 NPCs with a DM note (voice, motive, secret) where people belong' : ''}${extras.traps ? ', a trap or secret in at least two parts' : ''}${extras.loot ? ', loot in the last part' : ''}. Check map_kit for the template, theme and preset keys first. Then summarise the arc for me in a few lines.`);
  };
  const helpers = [
    { label: 'Fill the gaps in my story', prompt: 'Read the story outline and the scenes. Propose the missing pieces: beats without read-aloud get one, scenes without a beat get one, and suggest one beat that connects the story better. Use update_story_beat and add_story_beat.' },
    { label: 'People for empty scenes', prompt: 'For every scene that has no NPCs and should have people, propose 1-2 fitting NPCs (add_npc) with a DM note each.' },
    { label: 'Check every fight', prompt: 'Rate the encounter of every story beat with plan_encounter for this party. List them with their rating, and propose fixes (update_story_beat) for any that are deadly or trivial.' },
    { label: 'Traps and secrets', prompt: 'Propose a few traps, secrets and a hidden passage across the dungeon-like scenes (place_object), with sensible DCs for the party level, on walkable squares (check get_scene).' },
    { label: 'Plan the next session', prompt: 'Read the log, the story and the party. Tell me where we are, what is next, three likely player choices and how to handle each, and propose any prep that is missing.' },
  ];
  return (
    <div className="ai-build">
      {needsKey(settings, apiKey) && <KeyHint setTab={setTab} />}
      <form className="ai-wizard paper" onSubmit={build}>
        <h4>A campaign from a pitch</h4>
        <p className="muted small">The assistant drafts every scene, beat, person and fight as one set of changes. You review each piece under Review before anything is created.</p>
        <label className="ai-field" htmlFor="ai-pitch"><span className="field-label">Your pitch</span>
          <textarea id="ai-pitch" rows={4} required value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="A bell rings under the lake every night, and the fishermen who go to look don't come back..." />
        </label>
        <div className="ai-wizard-row">
          <label className="ai-field"><span className="field-label">Parts</span><input type="number" min={2} max={10} value={parts} onChange={(e) => setParts(Number(e.target.value) || 4)} /></label>
          <label className="ai-field"><span className="field-label">Level</span><input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value) || 1)} /></label>
          <label className="ai-field"><span className="field-label">Heroes</span><input type="number" min={1} max={8} value={size} onChange={(e) => setSize(Number(e.target.value) || 4)} /></label>
          <label className="ai-field"><span className="field-label">Tone</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)}>{['classic adventure', 'dark and eerie', 'lighthearted', 'intrigue and mystery', 'wilderness survival', 'heist'].map((t) => <option key={t}>{t}</option>)}</select>
          </label>
        </div>
        <div className="ai-wizard-row">
          {[['npcs', 'NPCs'], ['traps', 'Traps & secrets'], ['loot', 'Loot']].map(([k, n]) => (
            <label key={k} className="ai-check"><input type="checkbox" checked={extras[k]} onChange={(e) => setExtras((x) => ({ ...x, [k]: e.target.checked }))} /> {n}</label>
          ))}
        </div>
        <button type="submit" className="primary-btn" disabled={!pitch.trim() || needsKey(settings, apiKey)}><BrainIcon size={14} /> Draft the campaign</button>
      </form>
      <section className="ai-helpers">
        <h4>Prep helpers for this campaign</h4>
        <div className="ai-quick">
          {helpers.map((h) => <button key={h.label} type="button" className="small-btn" disabled={needsKey(settings, apiKey)} onClick={() => ask(h.prompt)}>{h.label}</button>)}
        </div>
      </section>
    </div>
  );
}

/* ====================== Connect ====================== */

function ConnectTab({ code, settings, setSettings, apiKey, setApiKey }) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [tokens, setTokens] = useState(null);
  const [made, setMade] = useState(null);
  const [form, setForm] = useState({ name: 'My AI app', readOnly: false, autoApply: false, thisOnly: true });
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const [modelCheck, setModelCheck] = useState(null);
  const load = async () => { const t = await aiApi.tokens(); if (Array.isArray(t)) setTokens(t); else setErr(t.error); };
  useEffect(() => { load(); }, []);
  const make = async (e) => {
    e.preventDefault();
    const t = await aiApi.makeToken({ name: form.name, readOnly: form.readOnly, autoApply: form.autoApply, campaigns: form.thisOnly ? [code] : [] });
    if (t.error) setErr(t.error); else { setMade(t); load(); }
  };
  const copy = (text, what) => { try { navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1600); } catch { /* none */ } };
  const secret = made?.token || 'dnd_YOUR_TOKEN';
  const desktopJson = JSON.stringify({ mcpServers: { dnd: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL, '--header', 'Authorization:${DND_TOKEN}'], env: { DND_TOKEN: `Bearer ${secret}` } } } }, null, 2);
  const geminiJson = JSON.stringify({ mcpServers: { dnd: { httpUrl: MCP_URL, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2);
  const genericJson = JSON.stringify({ mcpServers: { dnd: { url: MCP_URL, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2);
  const claudeCode = `claude mcp add --transport http dnd ${MCP_URL} --header "Authorization: Bearer ${secret}"`;
  const prov = providerOf(settings);
  const anthropic = settings.provider === 'anthropic';
  const local = prov.local || isLocalUrl(settings.oaBaseUrl);
  // Ask the server which models it has: a connection test and a picker in one.
  const findModels = async () => {
    setModelCheck({ busy: true });
    try {
      const ids = await listModels(settings, apiKey);
      setModelCheck({ ok: true, ids, text: ids.length ? `Connected: ${ids.length} model${ids.length === 1 ? '' : 's'} found.` : 'Connected, but no models are loaded yet.' });
      if (ids.length && !ids.includes(settings.oaModel)) setSettings({ oaModel: ids[0] });
    } catch (e) { setModelCheck({ ok: false, text: e.message }); }
  };
  return (
    <div className="ai-connect">
      <section>
        <h4><KeyIcon size={14} /> Your model (for the in-app assistant)</h4>
        <div className="ai-filter-grid">
          <label className="ai-field"><span className="field-label">Provider</span>
            <select value={prov.key} onChange={(e) => {
              const p = PROVIDERS.find((x) => x.key === e.target.value);
              setSettings({ preset: p.key, provider: p.kind, ...(p.kind === 'openai' ? { oaBaseUrl: p.base || settings.oaBaseUrl, oaModel: p.model ?? settings.oaModel } : {}) });
            }}>
              {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          {anthropic ? (
            <label className="ai-field"><span className="field-label">Model</span>
              <select value={settings.model} onChange={(e) => setSettings({ model: e.target.value })}>
                {ANTHROPIC_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.hint}</option>)}
                {!ANTHROPIC_MODELS.some((m) => m.id === settings.model) && <option value={settings.model}>{settings.model}</option>}
              </select>
            </label>
          ) : (
            <>
              <label className="ai-field"><span className="field-label">Base URL</span><input value={settings.oaBaseUrl} onChange={(e) => setSettings({ oaBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></label>
              <label className="ai-field"><span className="field-label">Model</span>
                {modelCheck?.ids?.length ? (
                  <select value={settings.oaModel} onChange={(e) => setSettings({ oaModel: e.target.value })}>
                    {modelCheck.ids.map((id) => <option key={id} value={id}>{id}</option>)}
                    {!modelCheck.ids.includes(settings.oaModel) && settings.oaModel && <option value={settings.oaModel}>{settings.oaModel}</option>}
                  </select>
                ) : <input value={settings.oaModel} onChange={(e) => setSettings({ oaModel: e.target.value })} placeholder="a model with tool calling" />}
              </label>
              <div className="ai-field ai-wide">
                <span className="ai-keyrow">
                  <button type="button" className="small-btn" onClick={findModels} disabled={modelCheck?.busy}>{modelCheck?.busy ? 'Checking…' : local ? 'Find my models' : 'Test and list models'}</button>
                  {modelCheck?.text && <span className={`small ${modelCheck.ok ? 'ai-ok' : 'ai-bad'}`} role="status">{modelCheck.text}</span>}
                </span>
              </div>
              <label className="ai-check"><input type="checkbox" checked={!!settings.noTools} onChange={(e) => setSettings({ noTools: e.target.checked })} /> This model can't call tools: use it for chat and suggestions only (it can't propose changes). Found out by itself if the model says so.</label>
            </>
          )}
          <label className="ai-field ai-wide" htmlFor="ai-key"><span className="field-label">API key{local ? ' (usually none for a local model)' : ''}</span>
            <span className="ai-keyrow">
              <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={anthropic ? 'sk-ant-...' : prov.keyHint || 'the provider\'s API key'} />
              <button type="button" className="small-btn primary-btn" disabled={keyDraft === apiKey} onClick={() => setApiKey(keyDraft.trim())}>Save</button>
              {apiKey && <button type="button" className="small-btn ghost-btn" onClick={() => { setApiKey(''); setKeyDraft(''); }}>Forget</button>}
            </span>
          </label>
          <label className="ai-check"><input type="checkbox" checked={settings.rememberKey} onChange={(e) => { setSettings({ rememberKey: e.target.checked }); setApiKey(apiKey, e.target.checked); }} /> Remember the key on this device (else only until the tab closes)</label>
          {anthropic && (
            <label className="ai-field"><span className="field-label">Effort</span>
              <select value={settings.effort} onChange={(e) => setSettings({ effort: e.target.value })}>{['low', 'medium', 'high', 'xhigh'].map((x) => <option key={x}>{x}</option>)}</select>
            </label>
          )}
          <label className="ai-check"><input type="checkbox" checked={settings.autoApply} onChange={(e) => setSettings({ autoApply: e.target.checked })} /> Apply the assistant's prep at once (scenes, beats, hidden things; still undoable in Review). Anything players would see always waits for you.</label>
        </div>
        <details>
          <summary>Advanced</summary>
          <div className="ai-filter-grid">
            {anthropic && <label className="ai-field ai-wide"><span className="field-label">API base URL (a proxy; empty for Anthropic)</span><input value={settings.baseUrl} onChange={(e) => setSettings({ baseUrl: e.target.value })} placeholder="https://api.anthropic.com" /></label>}
            <label className="ai-check"><input type="checkbox" checked={settings.relay} onChange={(e) => setSettings({ relay: e.target.checked })} /> Relay through dnd.ojee.net (for providers that block browser calls; the key then passes through the server for each request, never stored or logged)</label>
          </div>
        </details>
        <p className="muted small"><InfoIcon size={12} /> Any model that can call tools works: pick its provider, or "Other OpenAI-compatible API" for anything else. {local ? '' : <>The key stays in this browser and goes straight to {anthropic ? 'Anthropic' : prov.key === 'custom' ? 'that API' : prov.name}; usage is billed to your account.</>}{local ? ` A model on this computer needs no account and costs nothing: nothing leaves your machine but the table's tool calls to dnd.ojee.net. ${prov.fix || 'It must allow this site (CORS).'} Small models (under ~7B) often can't call tools; Qwen 3, Llama 3.1/3.3, Mistral Small and gpt-oss can.` : ''} If a provider refuses browser calls, turn on the relay under Advanced.</p>
      </section>

      <section>
        <h4><PlugIcon size={14} /> Connect any AI app (MCP)</h4>
        <p className="muted small">Any app that speaks the Model Context Protocol (Claude, ChatGPT, Gemini CLI, Cursor, VS Code, LM Studio and more) can connect with an access token, read your campaigns and propose changes. Everything it proposes waits under Review. Treat a token like a password; revoke it here any time.</p>
        <form className="ai-filter-grid" onSubmit={make}>
          <label className="ai-field"><span className="field-label">Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
          <label className="ai-check"><input type="checkbox" checked={form.thisOnly} onChange={(e) => setForm({ ...form, thisOnly: e.target.checked })} /> Only this campaign ({code})</label>
          <label className="ai-check"><input type="checkbox" checked={form.readOnly} onChange={(e) => setForm({ ...form, readOnly: e.target.checked })} /> Read only</label>
          <label className="ai-check"><input type="checkbox" checked={form.autoApply} onChange={(e) => setForm({ ...form, autoApply: e.target.checked })} /> Apply prep at once (undoable)</label>
          <button type="submit" className="small-btn primary-btn"><KeyIcon size={13} /> Make a token</button>
        </form>
        {err && <p className="ai-error">{err}</p>}
        {made && (
          <div className="ai-secret" role="status">
            <p><b>Copy it now:</b> this token is shown once.</p>
            <code>{made.token}</code>
            <button type="button" className="small-btn" onClick={() => copy(made.token, 'token')}><CopyIcon size={13} /> {copied === 'token' ? 'Copied' : 'Copy'}</button>
          </div>
        )}
        {tokens && tokens.length > 0 && (
          <ul className="ai-tokens">
            {tokens.map((t) => (
              <li key={t.id}>
                <span><b>{t.name}</b> <span className="muted small">{t.hint} · {t.readOnly ? 'read only' : 'can propose'}{t.autoApply ? ', auto-apply' : ''} · {t.campaigns.length ? t.campaigns.join(', ') : 'all your campaigns'} · {t.lastUsedAt ? `used ${ago(t.lastUsedAt)}${t.lastClient ? ` by ${t.lastClient}` : ''}` : 'never used'}</span></span>
                <button type="button" className="small-btn danger-btn" onClick={async () => { await aiApi.revokeToken(t.id); load(); }}><TrashIcon size={13} /> Revoke</button>
              </li>
            ))}
          </ul>
        )}
        <div className="ai-help paper">
          <h5>Server address</h5>
          <p><code>{MCP_URL}</code> <button type="button" className="link-btn" onClick={() => copy(MCP_URL, 'url')}>{copied === 'url' ? 'copied' : 'copy'}</button>. Streamable HTTP, sign in with the header <code>Authorization: Bearer &lt;token&gt;</code>.</p>
          <h5>Claude Desktop</h5>
          <p>Settings, Developer, Edit config, and add this to <code>claude_desktop_config.json</code> (needs Node.js), then restart Claude Desktop:</p>
          <pre>{desktopJson}</pre>
          <button type="button" className="small-btn" onClick={() => copy(desktopJson, 'desktop')}><CopyIcon size={13} /> {copied === 'desktop' ? 'Copied' : 'Copy config'}</button>
          <h5>Claude Code</h5>
          <pre>{claudeCode}</pre>
          <button type="button" className="small-btn" onClick={() => copy(claudeCode, 'cc')}><CopyIcon size={13} /> {copied === 'cc' ? 'Copied' : 'Copy command'}</button>
          <h5>ChatGPT</h5>
          <p>Settings, Apps &amp; Connectors, Advanced: turn on developer mode, then Create a connector with the URL <code>{MCP_URL}/&lt;token&gt;</code> and no authentication (ChatGPT can't send a custom header; see the note below).</p>
          <h5>Gemini CLI</h5>
          <pre>{geminiJson}</pre>
          <button type="button" className="small-btn" onClick={() => copy(geminiJson, 'gemini')}><CopyIcon size={13} /> {copied === 'gemini' ? 'Copied' : 'Copy'}</button>
          <p className="muted small">Into <code>~/.gemini/settings.json</code>.</p>
          <h5>Cursor, VS Code, Windsurf, LM Studio, Cline...</h5>
          <pre>{genericJson}</pre>
          <button type="button" className="small-btn" onClick={() => copy(genericJson, 'generic')}><CopyIcon size={13} /> {copied === 'generic' ? 'Copied' : 'Copy'}</button>
          <p className="muted small">The usual <code>mcpServers</code> entry (Cursor: <code>~/.cursor/mcp.json</code>; LM Studio: Program, Edit mcp.json; VS Code uses <code>"servers"</code> with <code>"type": "http"</code>). A client that only runs local commands can use the Claude Desktop form above, through <code>mcp-remote</code>.</p>
          <h5>Other clients</h5>
          <p>Any client that speaks MCP over Streamable HTTP: the address above plus the Authorization header. A client that only takes a URL can use <code>{MCP_URL}/&lt;token&gt;</code>, but URLs end up in logs and histories, so prefer the header and revoke such a token when done.</p>
          <p className="muted small">Then ask it things like "List my dnd campaigns", "Prep a crypt scene with a balanced undead fight for my party", or "What should the innkeeper say?". Its changes appear here under Review.</p>
        </div>
      </section>
    </div>
  );
}
