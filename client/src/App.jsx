import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from './api';
import { socket } from './socket';
import Login from './components/Login';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import { DragonLogo } from './components/Icons';
import { useDialog } from './utils';

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

  // ---- auth bootstrap ----
  useEffect(() => {
    auth.me().then((res) => {
      if (res && res.user) setUser(res.user);
      setLoading(false);
    });
  }, []);

  const enterGame = useCallback(({ code, state }) => {
    setGame({ code, state });
    setChat(state.chat || []);
    setLog(state.log || []);
    try {
      localStorage.setItem('dnd_lastCampaign', code);
    } catch {}
  }, []);

  const leaveGame = useCallback(() => {
    socket.emit('leaveCampaign');
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
        socket.emit('joinCampaign', { code, userId: user.id, username: user.username }, (res) => {
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
    const onGameState = (state) => {
      setGame((prev) => (prev ? { ...prev, state } : prev));
    };
    const onChat = (msg) => setChat((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-300)));
    const onLog = (entry) => setLog((prev) => (prev.some((l) => l.id === entry.id) ? prev : [...prev, entry].slice(-400)));
    const onKicked = () => {
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

    // staleness watchdog: if in a game and no state for 12s after an action, re-request
    const watchdog = setInterval(() => {
      if (gameRef.current && socket.connected) {
        socket.emit('requestState', (res) => {
          if (res && res.state) {
            setGame((prev) => (prev ? { ...prev, state: res.state } : prev));
            setChat(res.state.chat || []);
            setLog(res.state.log || []);
          }
        });
      }
    }, 15000);

    return () => {
      clearInterval(watchdog);
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
      <GameBoard
        user={user}
        code={game.code}
        state={game.state}
        chat={chat}
        log={log}
        connected={connected}
        onLeave={leaveGame}
      />
    );
  }

  return <Lobby user={user} connected={connected} onEnterGame={enterGame} onLogout={logout} />;
}
