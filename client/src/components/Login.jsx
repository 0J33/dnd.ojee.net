import React, { useState } from 'react';
import { auth } from '../api';
import { DragonLogo } from './Icons';

// The guild register's front page. The account is shared with mtg.ojee.net:
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
    <main className="lg-screen lg-signin">
      <section className="lg-page lg-front" aria-labelledby="lg-front-title">
        <DragonLogo size={58} className="lg-front-logo" />
        <h1 id="lg-front-title">dnd.ojee.net</h1>
        <p className="lg-front-sub">A virtual tabletop for Dungeons &amp; Dragons</p>
        <div className="lg-front-rule" />
        <p className="lg-front-sign">{isRegister ? 'Add your name to the register' : 'Sign the register'}</p>
        <form onSubmit={submit}>
          <label className="lg-field">
            <span>Your name</span>
            <input
              className="lg-input"
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
          <label className="lg-field">
            <span>Password</span>
            <input
              className="lg-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {isRegister && <p className="lg-front-hint">Names are 2 to 24 characters; passwords at least 4.</p>}
          {error && <p className="lg-error" role="alert">{error}</p>}
          <button type="submit" className="lg-primary" disabled={busy || !username.trim() || !password}>
            {busy ? (isRegister ? 'Writing you in…' : 'Opening the register…') : isRegister ? 'Join the guild' : 'Sign in'}
          </button>
        </form>
        <p className="lg-front-shared">One account for dnd.ojee.net and mtg.ojee.net: sign in on either and you're in on both.</p>
        <p className="lg-front-flip">
          {isRegister ? 'Already in the register? ' : 'New here? '}
          <button type="button" className="lg-link" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign in' : 'Add your name'}
          </button>
        </p>
      </section>
      <p className="lg-signin-foot">Never played? Nobody at your table needs to know the rules: the guided first adventure teaches everyone as you play.</p>
    </main>
  );
}
