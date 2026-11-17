import { io } from 'socket.io-client';

// "/" means the API is on the page's own origin (the demo serves both).
const RAW = import.meta.env.VITE_SERVER_URL;
export const SERVER_URL = RAW === '/' ? window.location.origin : RAW || 'http://localhost:5005';

// This tab's id at the table: the server remembers which of its edits it has
// (sync.js), so one sent again after a lost connection, a restart or a reload
// is applied once. It lives through a reload (handed over in sessionStorage
// as the page goes) but not into a duplicated tab, which starts with a copy
// of sessionStorage taken while the key isn't there.
const TAB_KEY = 'dnd.tab';
function tabId() {
  let id = null;
  try { id = sessionStorage.getItem(TAB_KEY); sessionStorage.removeItem(TAB_KEY); } catch {}
  if (!id || !/^[\w-]{6,40}$/.test(id)) id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { try { sessionStorage.setItem(TAB_KEY, id); } catch {} });
    window.addEventListener('pageshow', (e) => { if (e.persisted) try { sessionStorage.removeItem(TAB_KEY); } catch {} });
  }
  return id;
}
export const TAB_ID = tabId();

export const socket = io(SERVER_URL, {
  autoConnect: false,
  withCredentials: true,
  auth: { cid: TAB_ID },
  // Straight to a websocket (one handshake) instead of long-polling first and
  // upgrading (several round trips on a slow line); polling only if that fails.
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
});

if (typeof window !== 'undefined') window.__socket = socket;
