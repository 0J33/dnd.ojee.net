import { io } from 'socket.io-client';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5005';

export const socket = io(SERVER_URL, {
  autoConnect: false,
  withCredentials: true,
});

if (typeof window !== 'undefined') window.__socket = socket;
