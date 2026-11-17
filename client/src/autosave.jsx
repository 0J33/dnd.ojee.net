import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as sync from './sync';

// Campaign editing saves itself. A field edited with useAutoSave keeps your
// text on screen and sends it a moment after you stop typing (and at once on
// blur, on close, and before an update's reload); sync.js keeps each edit
// until the server has written it. Until it is sent, the text also sits in
// localStorage as a draft: a page that died mid-sentence offers it back the
// next time the field opens, as long as nobody changed that field on the
// server meanwhile (the draft remembers what it was written against).
//
// <SaveStatus /> is the small "Saving… / Saved / Reconnecting…" line the
// editors show; it reads the fields waiting here, REST saves in flight
// (trackSave) and sync.status().

const DRAFT = 'dnd.draft.';
const DRAFT_TTL = 7 * 24 * 3600 * 1000;
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function readDraft(key) {
  if (!key) return null;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT + key) || 'null');
    return d && d.t > Date.now() - DRAFT_TTL ? d : null;
  } catch { return null; }
}
function writeDraft(key, d) {
  if (!key) return;
  try { localStorage.setItem(DRAFT + key, JSON.stringify(d)); } catch { /* full or off: the outbox still has it once sent */ }
}
function dropDraft(key) {
  if (!key) return;
  try { localStorage.removeItem(DRAFT + key); } catch {}
}

/* ---------------- what is still waiting ---------------- */

const flushers = new Set();
let waiting = 0; // fields with a change not sent yet, plus REST saves in flight
const watchers = new Set();
const bump = (n) => { waiting = Math.max(0, waiting + n); for (const fn of watchers) fn(); };

/** Send every field's waiting change now (closing, reloading). */
export function flushEdits() {
  for (const fn of [...flushers]) fn();
}

// The page going (a plain reload, a closed tab): what's typed goes into the
// outbox, which is then written to localStorage, to be sent by the next page.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushEdits(); sync.flushOutbox(); });
}

/** Run something else that should send before a reload (a debounced REST save); returns an unregister. */
export function registerFlush(fn) {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

/** Count a save that isn't a table edit (the lobby's hero sheet) while it runs. */
export function trackSave(promise) {
  bump(1);
  return Promise.resolve(promise).finally(() => bump(-1));
}

/** Resolves true once nothing is waiting anywhere, false after `ms`. */
export async function settleAll(ms = 4000) {
  flushEdits();
  const until = Date.now() + ms;
  while (waiting && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  return (await sync.settle(Math.max(0, until - Date.now()))) && !waiting;
}

/**
 * One edited value that saves itself.
 *   key    where its draft lives in localStorage (null: no draft), e.g. `${code}:beat:${id}:notes`
 *   value  the value on the table (the server's, with your sent edits predicted)
 *   save   (value) => sends it
 * Returns [draft, setDraft, flush]: show `draft`, call `setDraft` on change, `flush` on blur.
 */
export function useAutoSave({ key = null, value, save, delay = 800 }) {
  const st = useRef(null);
  if (!st.current) {
    const d = readDraft(key);
    let start = value, dirty = false, base = value;
    if (d && !same(d.v, value)) {
      if (same(d.base, value)) { start = d.v; dirty = true; base = d.base; } // the page went before it was sent
      else dropDraft(key); // changed on the table since: the table's copy wins
    } else if (d) dropDraft(key);
    st.current = { key, draft: start, dirty, base, server: value, timer: null, save, counted: false };
  }
  const [draft, setDraftState] = useState(st.current.draft);
  st.current.save = save;
  st.current.key = key;

  const flush = useCallback(() => {
    const c = st.current;
    clearTimeout(c.timer);
    c.timer = null;
    if (c.counted) { c.counted = false; bump(-1); }
    if (!c.dirty) return;
    c.dirty = false;
    c.save(c.draft);
    // the sent value is in the outbox now (sync.js); the draft stays until the table shows it
  }, []);

  const setDraft = useCallback((v) => {
    const c = st.current;
    const next = typeof v === 'function' ? v(c.draft) : v;
    if (!c.dirty) c.base = c.server;
    c.draft = next;
    c.dirty = true;
    setDraftState(next);
    writeDraft(c.key, { v: next, base: c.base, t: Date.now() });
    if (!c.counted) { c.counted = true; bump(1); }
    clearTimeout(c.timer);
    c.timer = setTimeout(flush, delay);
  }, [delay, flush]);

  // A draft brought back from a page that went: send it.
  useEffect(() => {
    const c = st.current;
    if (c.dirty && !c.timer) { c.counted = true; bump(1); c.timer = setTimeout(flush, delay); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The table's value moved: it's ours arriving (drop the draft) or someone
  // else's edit (take it, unless you are mid-change).
  useEffect(() => {
    const c = st.current;
    c.server = value;
    if (same(value, c.draft)) {
      if (!c.dirty) dropDraft(c.key);
      return;
    }
    if (c.dirty) return;
    c.draft = value;
    setDraftState(value);
    dropDraft(c.key);
  }, [value]);

  useEffect(() => {
    flushers.add(flush);
    return () => { flush(); flushers.delete(flush); };
  }, [flush]);

  return [draft, setDraft, flush];
}

/** 'offline' | 'saving' | 'saved' for this table's edits. */
export function useSaveStatus() {
  const read = () => {
    const s = sync.status();
    if (s.room && !s.live) return 'offline';
    return waiting || s.unsaved ? 'saving' : 'saved';
  };
  const [st, setSt] = useState(read);
  useEffect(() => {
    const up = () => setSt(read());
    watchers.add(up);
    const off = sync.onStatus(up);
    up();
    return () => { watchers.delete(up); off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

/** The small line beside an editor's title saying whether your edits are safe. */
export function SaveStatus({ className = '' }) {
  const st = useSaveStatus();
  const text = st === 'offline' ? 'Offline: your changes are kept' : st === 'saving' ? 'Saving…' : 'Saved';
  return <span className={`save-status ${st} ${className}`} role="status" aria-live="polite">{text}</span>;
}
