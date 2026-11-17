import { useEffect, useRef } from 'react';

// Where you were, carried over a reload (the update banner's, freshness.jsx):
// open panels, the tab and editor you had up, the scene and beat you were
// on, scroll and camera. Components say what to remember with useUiContext
// and read it back once with restoreUi when they mount. It lives in
// sessionStorage for a few minutes, so only that reload of that tab sees it.

const KEY = 'dnd.ui';
const providers = new Map();
let stash = null;
try {
  const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  if (s && s.t > Date.now() - 5 * 60 * 1000) stash = s.data || null;
} catch {}
const taken = new Map();

/** What `key` was before the reload, once per page (the same answer every time it's asked). */
export function restoreUi(key) {
  if (taken.has(key)) return taken.get(key);
  const v = stash ? stash[key] : undefined;
  taken.set(key, v);
  if (stash && key in stash) {
    delete stash[key];
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data: stash })); } catch {}
  }
  return v;
}

/** Remember `get()` for `key` whenever a reload is about to happen. */
export function useUiContext(key, get) {
  const ref = useRef(get);
  ref.current = get;
  useEffect(() => {
    const fn = () => ref.current();
    providers.set(key, fn);
    return () => { if (providers.get(key) === fn) providers.delete(key); };
  }, [key]);
}

/** Write down where everything is (just before a reload). */
export function stashUi() {
  const data = { ...(stash || {}) };
  for (const [k, fn] of providers) {
    try { const v = fn(); if (v !== undefined) data[k] = v; } catch { /* one panel can't say: the rest still can */ }
  }
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data })); } catch {}
}
