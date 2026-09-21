import React, { useState } from 'react';
import { auth } from '../api';
import { DragonLogo, D20Icon } from './Icons';

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const fn = isRegister ? auth.register : auth.login;
    const res = await fn(username.trim(), password);
    setBusy(false);
    if (res && res.user) onLogin(res.user);
    else setError((res && res.error) || 'Something went wrong');
  };

  return (
    <div className="login-screen">
      <div className="login-card panel">
        <div className="login-brand">
          <DragonLogo size={64} />
          <h1 className="login-title">dnd.ojee.net</h1>
          <p className="login-sub">A virtual tabletop for Dungeons & Dragons</p>
          <p className="login-sub-tiny muted">Compatible with fifth edition · play with friends in your browser</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label className="field-label">Adventurer name</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Mila"
            maxLength={24}
            autoComplete="username"
          />
          <label className="field-label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'At least 4 characters' : 'Your password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="primary-btn big-btn login-submit" disabled={busy || !username.trim() || !password}>
            <D20Icon size={16} /> {isRegister ? 'Create account' : 'Enter the hold'}
          </button>
        </form>
        <p className="login-flip">
          {isRegister ? 'Already have an account?' : 'First time here?'}{' '}
          <button type="button" className="link-btn" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
      <p className="login-footnote muted">
        New to D&D? Perfect - there's a guided first adventure that teaches you everything.
      </p>
    </div>
  );
}
