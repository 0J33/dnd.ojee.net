import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from './api';
import { socket } from './socket';
import * as sync from './sync';
import Login from './components/Login';
import Lobby from './components/Lobby';
// The table (board, DM tools, sound) is its own download: signing in and the
// home screen don't wait for it, and it's fetched in the background once in.
const GameBoard = React.lazy(() => import('./components/GameBoard'));
import { TrainingTable } from './components/Training';
import { DragonLogo } from './components/Icons';
import { useDialog } from './utils';
import { useSaveStatus, flushEdits } from './autosave';

// Off the table for a moment (a dropped connection, a server restarting for an
// update): say so, and that nothing done meanwhile is lost (sync.js keeps it
// and sends it once we're back).
function ReconnectNote() {
  const st = useSaveStatus();
  if (st !== 'offline') return null;
  return (
    <div className="reconnect-note" role="status">
      <span className="spinner small" aria-hidden="true" /> Reconnecting… your changes are kept
    </div>
  );
}

// Consume /invite/CODE from the URL once, then clean it.
function consumeInviteCode() {
  const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9]{4,8})/);
  if (match) {
    window.history.replaceState({}, '', '/');
    return match[1].toUpperCase();
  }
  return null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null); // { code, state }
  const [chat, setChat] = useState([]);
  const [log, setLog] = useState([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const inviteRef = useRef(consumeInviteCode());
  const gameRef = useRef(null);
  const dialog = useDialog();
  gameRef.current = game;

  // Once you're in, fetch the table's 3D code and the hero preview in the
  // background, so opening a game or the builder doesn't wait on a download.
  useEffect(() => {
    if (!user) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => { import('./components/GameBoard'); import('./components/Map3D'); import('./world/FigureStage'); import('./components/CharacterBuilder'); import('./components/CharacterSheet'); });
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [user]);

  // ---- auth bootstrap ----
  useEffect(() => {
    auth.me().then((res) => {
      if (res && res.user) setUser(res.user);
      setLoading(false);
    });
  }, []);

  const enterGame = useCallback(({ code, state }) => {
    setGame({ code, state: sync.loadFull(state, { fresh: true }) });
    setChat(state.chat || []);
    setLog(state.log || []);
    try {
      localStorage.setItem('dnd_lastCampaign', code);
    } catch {}
  }, []);

  const leaveGame = useCallback(() => {
    flushEdits(); // a field still waiting goes before we leave the table
    socket.emit('leaveCampaign');
    sync.clear();
    setGame(null);
    setChat([]);
    setLog([]);
    try {
      localStorage.removeItem('dnd_lastCampaign');
    } catch {}
  }, []);

  const joinByCode = useCallback(
    (code, { silent = false } = {}) =>
      new Promise((resolve) => {
        // who we are comes from the login cookie, not from this message
        socket.emit('joinCampaign', { code }, (res) => {
          if (res && res.state) {
            enterGame({ code: res.code, state: res.state });
            resolve(true);
          } else {
            if (!silent && dialog) dialog.alert(res && res.error ? res.error : 'Could not join campaign');
            try {
              localStorage.removeItem('dnd_lastCampaign');
            } catch {}
            resolve(false);
          }
          setReconnecting(false);
        });
      }),
    [user, enterGame, dialog]
  );

  // ---- socket lifecycle ----
  useEffect(() => {
    if (!user) return;

    const onConnect = () => {
      setConnected(true);
      // Rejoin after reconnect, invite link, or page reload.
      const current = gameRef.current;
      if (current) {
        joinByCode(current.code, { silent: true });
        return;
      }
      const invite = inviteRef.current;
      const last = localStorage.getItem('dnd_lastCampaign');
      if (invite) {
        inviteRef.current = null;
        setReconnecting(true);
        joinByCode(invite);
      } else if (last) {
        setReconnecting(true);
        joinByCode(last, { silent: true });
      }
    };
    const onDisconnect = () => setConnected(false);
    // A full state pushed by the server; patches arrive through sync.js.
    const onGameState = (state) => {
      if (gameRef.current) sync.loadFull(state);
    };
    const offView = sync.subscribe((view) => setGame((prev) => (prev && view ? { ...prev, state: view } : prev)));
    // Your own line is shown the moment you send it (sendChat); the server's
    // copy replaces it, matched by `cid`.
    const onChat = (msg) => setChat((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const mine = msg.cid ? prev.findIndex((m) => m.cid === msg.cid) : -1;
      if (mine >= 0) return prev.map((m, i) => (i === mine ? msg : m));
      return [...prev, msg].slice(-300);
    });
    const onLog = (entry) => setLog((prev) => (prev.some((l) => l.id === entry.id) ? prev : [...prev, entry].slice(-400)));
    const onKicked = () => {
      sync.clear();
      setGame(null);
      try {
        localStorage.removeItem('dnd_lastCampaign');
      } catch {}
      dialog && dialog.alert('You were removed from the campaign.');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('gameState', onGameState);
    socket.on('chatMessage', onChat);
    socket.on('logEntry', onLog);
    socket.on('kicked', onKicked);
    socket.connect();

    // Staleness check: after 15 s without a word from the server, compare
    // version numbers (a few bytes); only a client that fell behind gets the
    // full state back.
    const watchdog = setInterval(() => {
      if (!gameRef.current || !socket.connected || Date.now() - sync.lastPatchAt() < 15000) return;
      socket.emit('syncCheck', { v: sync.getVersion() }, (res) => {
        if (!res || !res.state) return;
        sync.loadFull(res.state);
        setChat(res.state.chat || []);
        setLog(res.state.log || []);
      });
    }, 15000);

    return () => {
      clearInterval(watchdog);
      offView();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gameState', onGameState);
      socket.off('chatMessage', onChat);
      socket.off('logEntry', onLog);
      socket.off('kicked', onKicked);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Chat shows your line at once, greyed until the server's copy arrives.
  const sendChat = useCallback((text, whisperTo) => {
    if (!text || !text.trim()) return;
    const cid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    socket.emit('sendChatMessage', { text, whisperTo, cid });
    setChat((prev) => [...prev, { id: `local-${cid}`, cid, pending: true, kind: 'chat', userId: user.id, username: user.username, text: text.trim().slice(0, 1000), whisperTo: whisperTo || null, ts: Date.now() }].slice(-300));
  }, [user]);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
    setGame(null);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <DragonLogo size={54} />
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  if (reconnecting && !game) {
    return (
      <div className="loading-screen">
        <DragonLogo size={54} />
        <p className="muted">Returning to your table...</p>
        <div className="spinner" />
      </div>
    );
  }

  if (game && game.state) {
    return (
      <React.Suspense fallback={<div className="loading-screen"><DragonLogo size={54} /><div className="spinner" /></div>}>
        {/* the board, with the DM coach, practice round and handbook on top (Training.jsx) */}
        <TrainingTable
          user={user}
          state={game.state}
          code={game.code}
          render={(state, boardUser) => (
            <GameBoard
              user={boardUser}
              code={game.code}
              state={state}
              chat={chat}
              onSendChat={sendChat}
              log={log}
              connected={connected}
              onLeave={leaveGame}
            />
          )}
        />
        <ReconnectNote />
      </React.Suspense>
    );
  }

  return <Lobby user={user} connected={connected} onEnterGame={enterGame} onLogout={logout} />;
}
