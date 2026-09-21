import React, { useEffect, useState } from 'react';

// After a deploy a browser can still hold the previous index.html: nginx sends
// no cache header for it and Cloudflare keeps scripts for four hours. That page
// runs the old bundle against the new API, which is how a deploy that changes
// an API shape looks "broken" until a hard refresh. So the bundle compares its
// own build id with the live one: at startup it reloads once, and later in a
// session it offers a reload rather than yanking someone out of a game.

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
  window.location.reload();
}

/** Mid-session: a slim bar offering the reload when a newer build goes live. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    const check = () => liveBuild().then((live) => isStale(live) && setStale(true));
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>dnd.ojee.net has been updated.</span>
      <button className="small-btn primary-btn" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
