import React, { useEffect, useState } from 'react';
import { settleAll } from './autosave';
import { flushOutbox } from './sync';
import { stashUi } from './uiContext';

// A tab left open across a deploy keeps running the old bundle against the new
// API, which is how a deploy that changes an API shape looks "broken" until a
// reload. (Cached copies of index.html did the same until nginx started sending
// no-cache for it - see nginx-dnd.conf.) So the bundle compares its own build
// id with the live one: at startup it reloads once, and later in a session it
// offers a reload rather than yanking someone out of a game.
//
// That reload never loses work: it first sends every field still waiting
// (autosave.jsx) and waits a few seconds for the server to write what's in
// flight; anything still unsaved after that stays in the outbox in
// localStorage and goes again after the reload (sync.js). Then it notes where
// you were (uiContext.js), so the page comes back on the same campaign, panel,
// editor, scroll and camera. The banner itself never reloads anything.

const RELOADED_FOR = 'dnd_reloadedFor';

async function liveBuild() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).build || null;
  } catch {
    return null; // offline, or a dev server without version.json
  }
}

const isStale = (live) => !!live && live !== __BUILD_ID__;

/** At startup: if this page is an old build, reload it once (a reload revalidates index.html). */
export async function reloadIfStale() {
  if (import.meta.env.DEV) return;
  const live = await liveBuild();
  if (!isStale(live)) return;
  let done = null;
  try { done = sessionStorage.getItem(RELOADED_FOR); } catch {}
  if (done === live) return; // already tried for this build; never loop
  try { sessionStorage.setItem(RELOADED_FOR, live); } catch {}
  flushOutbox();
  stashUi();
  window.location.reload();
}

/** Reload without losing anything: send what's waiting, remember where we are, then reload. */
export async function safeReload() {
  await settleAll(4000);
  flushOutbox();
  stashUi();
  window.location.reload();
}

/** Mid-session: a slim bar offering the reload when a newer build goes live. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    const check = () => liveBuild().then((live) => isStale(live) && setStale(true));
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('dnd:newer', check); // the server speaks a newer sync than this page (sync.js)
    const timer = setInterval(check, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('dnd:newer', check);
      clearInterval(timer);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>dnd.ojee.net has been updated. Your edits are saved; reload when it suits you.</span>
      <button className="small-btn primary-btn" disabled={busy} onClick={() => { setBusy(true); safeReload(); }}>{busy ? 'Saving…' : 'Reload'}</button>
    </div>
  );
}
