import { io } from 'socket.io-client';

// "/" means the API is on the page's own origin (the demo serves both).
const RAW = import.meta.env.VITE_SERVER_URL;
export const SERVER_URL = RAW === '/' ? window.location.origin : RAW || 'http://localhost:5005';

export const socket = io(SERVER_URL, {
  autoConnect: false,
  withCredentials: true,
  // Straight to a websocket (one handshake) instead of long-polling first and
  // upgrading (several round trips on a slow line); polling only if that fails.
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
});

if (typeof window !== 'undefined') window.__socket = socket;
