import React, { useState } from 'react';
import { auth } from '../api';
import { DragonLogo } from './Icons';

// The tavern door: a notice pinned by the entrance. The account is shared with mtg.ojee.net:
// signing in here signs you in there too.
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
    const res = await (isRegister ? auth.register : auth.login)(username.trim(), password);
    setBusy(false);
    if (res && res.user) onLogin(res.user);
    else setError((res && res.error) || "Can't reach the server. Check your connection and try again.");
  };

  return (
    <main className="th-door">
      <div className="th-door-sign">
        <DragonLogo size={64} />
        <h1>dnd.ojee.net</h1>
        <p>A tavern table for Dungeons &amp; Dragons</p>
      </div>
      <section className="th-door-notice paper" aria-labelledby="th-door-title">
        <span className="th-tack" aria-hidden="true" />
        <h2 id="th-door-title">{isRegister ? 'Pull up a chair' : 'Come in'}</h2>
        <form onSubmit={submit}>
          <label className="th-field">
            <span>Your name</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </label>
          <label className="th-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {isRegister && <p className="th-door-hint">Names are 2 to 24 characters; passwords at least 4.</p>}
          {error && <p className="th-error" role="alert">{error}</p>}
          <button type="submit" className="primary-btn" disabled={busy || !username.trim() || !password}>
            {busy ? (isRegister ? 'Making room…' : 'Opening the door…') : isRegister ? 'Join the table' : 'Sign in'}
          </button>
        </form>
        <p className="th-door-flip">
          {isRegister ? 'Been here before? ' : 'New here? '}
          <button type="button" className="link-btn" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign in' : 'Make an account'}
          </button>
        </p>
        <p className="th-door-shared">One account for dnd.ojee.net and mtg.ojee.net: sign in on either and you're in on both.</p>
      </section>
      <p className="th-door-foot">Never played? Nobody at your table needs to know the rules: the first quest teaches everyone as you play.</p>
    </main>
  );
}
