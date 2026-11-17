import React, { useEffect, useState } from 'react';
import { ModalOverlay } from '../utils';
import { ACTIONS, MOUSE_HELP, comboOf, comboLabel, conflictsOf, defaultKeys, resetAll, resetKeys, setKeys, useKeybinds } from '../keybinds';
import { XIcon, PlusIcon, RestartIcon } from './Icons';
import '../styles/controls.css';

// Controls & keys: every shortcut, rebindable. Click "+" (or a key) and press
// the new key; × removes one. Saved for this account on this browser.

export default function KeybindSettings({ onClose }) {
  const binds = useKeybinds();
  const [listen, setListen] = useState(null); // { id, index } (index = -1 adds)

  useEffect(() => {
    if (!listen) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const c = comboOf(e);
      if (!c) return; // a lone Shift / Ctrl: wait for the real key
      const cur = [...(binds[listen.id] || [])];
      if (listen.index < 0) { if (!cur.includes(c)) cur.push(c); } else cur[listen.index] = c;
      setKeys(listen.id, [...new Set(cur)]);
      setListen(null);
    };
    // capture on window: runs before the dialog's own Escape handling
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listen, binds]);

  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  return (
    <ModalOverlay onClose={() => (listen ? setListen(null) : onClose())}>
      <div className="modal kb-modal" role="dialog" aria-label="Controls and keys" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Controls &amp; keys</h3>
          <button className="small-btn ghost-btn" onClick={() => { resetAll(); setListen(null); }} title="Put every key back to the default">
            <RestartIcon size={13} /> Reset all
          </button>
          <button className="close-btn" aria-label="Close" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="modal-body kb-body">
          {listen && <p className="kb-listen" role="status">Press the new key for <b>{ACTIONS.find((a) => a.id === listen.id)?.name}</b>… <button className="link-btn" onClick={() => setListen(null)}>cancel</button></p>}
          {groups.map((g) => (
            <section key={g} className="kb-group">
              <h4>{g}</h4>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const keys = binds[a.id] || [];
                const clash = conflictsOf(a.id);
                const changed = JSON.stringify(keys) !== JSON.stringify(defaultKeys(a.id));
                return (
                  <div key={a.id} className={`kb-row ${clash.length ? 'clash' : ''}`} data-action={a.id}>
                    <span className="kb-name">{a.name}</span>
                    <span className="kb-keys">
                      {keys.map((k, i) => (
                        <span key={k} className={`kb-key ${listen?.id === a.id && listen.index === i ? 'on' : ''}`}>
                          <button className="kb-key-btn" title="Click, then press a new key" onClick={() => setListen({ id: a.id, index: i })}>{comboLabel(k)}</button>
                          <button className="kb-key-x" aria-label={`Remove ${comboLabel(k)}`} title="Remove this key" onClick={() => setKeys(a.id, keys.filter((x) => x !== k))}>×</button>
                        </span>
                      ))}
                      {!keys.length && <span className="kb-none">unbound</span>}
                      <button className={`kb-add ${listen?.id === a.id && listen.index < 0 ? 'on' : ''}`} aria-label={`Add a key for ${a.name}`} title="Add a key" onClick={() => setListen({ id: a.id, index: -1 })}><PlusIcon size={11} /></button>
                      {changed && <button className="kb-reset" title={`Back to ${defaultKeys(a.id).map(comboLabel).join(' / ') || 'none'}`} onClick={() => resetKeys(a.id)}>reset</button>}
                    </span>
                    {clash.length > 0 && <span className="kb-clash" role="alert">Same key as: {clash.map((c) => c.name).join(', ')}</span>}
                  </div>
                );
              })}
            </section>
          ))}
          <section className="kb-group">
            <h4>Mouse</h4>
            {MOUSE_HELP.map(([k, v]) => (
              <div key={k} className="kb-row"><span className="kb-name">{v}</span><span className="kb-keys"><span className="kb-key fixed">{k}</span></span></div>
            ))}
          </section>
          <p className="muted small">Saved for your account on this browser.</p>
        </div>
      </div>
    </ModalOverlay>
  );
}
