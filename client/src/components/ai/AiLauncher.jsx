import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../../socket';
import { aiApi } from './aiApi';
import { XIcon } from '../Icons';
import { BrainIcon, MicIcon } from './aiIcons';
import { stopListening, subscribe } from './liveSession';

// The DM's way into the AI tools from the game's top bar: a button with a
// count of changes waiting for review, a toast when a new set arrives (from
// the in-app assistant or an MCP client such as Claude Desktop), and the
// dock itself, loaded only when opened (AiDock.jsx).
//
// Only rendered for the DM of a DM-run table (GameBoard.jsx).

const AiDock = React.lazy(() => import('./AiDock'));

export default function AiLauncher({ code, state, user }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [listening, setListening] = useState(false);
  useEffect(() => subscribe((st) => setListening(st.status === 'listening')), []);

  const refresh = useCallback(async () => {
    const list = await aiApi.proposals(code, null);
    if (Array.isArray(list)) setProposals(list);
  }, [code]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const upsert = (p) => setProposals((xs) => [p, ...xs.filter((x) => x.id !== p.id)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    const onNew = (p) => {
      if (p.code !== code) return;
      upsert(p);
      setToast(p);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 7000);
    };
    const onUpd = (p) => { if (p.code === code) upsert(p); };
    const onOpen = (e) => { setTab(e.detail?.tab || null); setOpen(true); };
    socket.on('aiProposal', onNew);
    socket.on('aiProposalUpdate', onUpd);
    socket.on('connect', refresh); // missed some while away
    window.addEventListener('dnd:ai', onOpen);
    return () => {
      socket.off('aiProposal', onNew); socket.off('aiProposalUpdate', onUpd); socket.off('connect', refresh);
      window.removeEventListener('dnd:ai', onOpen);
      clearTimeout(toastTimer.current);
    };
  }, [code, refresh]);

  const waiting = proposals.reduce((n, p) => n + p.items.filter((i) => i.status === 'pending' || i.status === 'applied').length, 0);

  return (
    <>
      <button
        type="button"
        className={`small-btn ai-launch ${open ? 'active' : ''}`}
        aria-expanded={open}
        aria-label={`AI assistant${waiting ? `, ${waiting} change${waiting === 1 ? '' : 's'} to review` : ''}`}
        title="AI assistant: prep, live suggestions, review AI changes"
        onClick={() => { setTab(waiting ? 'review' : null); setOpen((v) => !v); }}
      >
        <BrainIcon size={13} /> <span className="hide-sm">Assistant</span>
        {waiting > 0 && <span className="ai-badge" aria-hidden="true">{waiting > 99 ? '99+' : waiting}</span>}
      </button>
      {listening && (
        <button type="button" className="small-btn ai-listening" onClick={stopListening} title="The AI assistant is transcribing the table. Click to stop.">
          <span className="ai-rec-dot" aria-hidden="true" /><MicIcon size={13} /> <span className="hide-sm">Listening</span><span className="sr-only">: stop listening</span>
        </button>
      )}
      <div className="ai-toast-slot" aria-live="polite">
        {toast && !open && (
          <div className="ai-toast" role="status">
            <BrainIcon size={16} />
            <span>
              <b>{toast.source === 'mcp' ? toast.client || 'An AI client' : 'The assistant'}</b> proposes: {toast.title || `${toast.items.length} change(s)`}
            </span>
            <button type="button" className="small-btn primary-btn" onClick={() => { setToast(null); setTab('review'); setOpen(true); }}>Review</button>
            <button type="button" className="icon-btn ghost-btn" aria-label="Dismiss" onClick={() => setToast(null)}><XIcon size={13} /></button>
          </div>
        )}
      </div>
      {open && (
        <React.Suspense fallback={null}>
          <AiDock
            code={code}
            state={state}
            user={user}
            proposals={proposals}
            refresh={refresh}
            setProposals={setProposals}
            initialTab={tab}
            onClose={() => setOpen(false)}
          />
        </React.Suspense>
      )}
    </>
  );
}
