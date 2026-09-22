import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------- Hooks ----------

export function useEscapeKey(handler) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handler();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler]);
}

export function useOutsideClick(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, handler, enabled]);
}

export function useIsTouchDevice() {
  const [touch] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  return touch;
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key]
  );
  return [value, set];
}

// ---------- Modal overlay ----------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open overlays, oldest first. Escape closes only the top one, so dismissing a
// spell's details doesn't also throw away the character sheet under it.
const openOverlays = [];

export function ModalOverlay({ children, onClose, className = '' }) {
  const id = useRef(null);
  const ref = useRef(null);
  if (!id.current) id.current = Symbol('overlay');
  useEffect(() => {
    const me = id.current;
    openOverlays.push(me);
    // Keyboard focus moves into the dialog (unless a field already took it
    // with autoFocus) and goes back where it was when the dialog closes.
    const before = document.activeElement;
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    return () => {
      const i = openOverlays.indexOf(me);
      if (i >= 0) openOverlays.splice(i, 1);
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, []);
  useEscapeKey(() => {
    if (onClose && openOverlays[openOverlays.length - 1] === id.current) onClose();
  });
  // Tab and Shift+Tab wrap inside the top dialog instead of wandering onto
  // the page behind it.
  const trapTab = (e) => {
    if (e.key !== 'Tab' || openOverlays[openOverlays.length - 1] !== id.current || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      className={`modal-overlay ${className}`}
      onKeyDown={trapTab}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}

// ---------- Dialog (alert / confirm / prompt) ----------

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const inputRef = useRef(null);

  const open = useCallback((config) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setDialog(config);
    });
  }, []);

  const close = useCallback((result) => {
    if (resolver.current) resolver.current(result);
    resolver.current = null;
    setDialog(null);
  }, []);

  const api = {
    alert: (message, title = 'Notice') => open({ kind: 'alert', message, title }),
    confirm: (message, title = 'Are you sure?') => open({ kind: 'confirm', message, title }),
    prompt: (message, defaultValue = '', title = 'Input') => open({ kind: 'prompt', message, defaultValue, title }),
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <ModalOverlay onClose={() => close(dialog.kind === 'prompt' ? null : dialog.kind !== 'confirm')} className="dialog-overlay">
          <div className="modal dialog-modal">
            <div className="modal-header">
              <h3>{dialog.title}</h3>
            </div>
            <div className="dialog-body">
              <p>{dialog.message}</p>
              {dialog.kind === 'prompt' && (
                <input
                  ref={inputRef}
                  autoFocus
                  defaultValue={dialog.defaultValue}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') close(e.target.value);
                  }}
                />
              )}
            </div>
            <div className="modal-actions">
              {dialog.kind !== 'alert' && (
                <button onClick={() => close(dialog.kind === 'prompt' ? null : false)}>Cancel</button>
              )}
              <button
                className="primary-btn"
                autoFocus={dialog.kind !== 'prompt'}
                onClick={() => close(dialog.kind === 'prompt' ? (inputRef.current ? inputRef.current.value : '') : true)}
              >
                OK
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </DialogContext.Provider>
  );
}

export const useDialog = () => useContext(DialogContext);

// ---------- Context menu ----------

export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y, ready: false });
  useOutsideClick(ref, onClose);
  useEscapeKey(onClose);

  // The menu takes focus on its first usable item, arrow keys move through
  // it, and focus goes back where it was when it closes.
  useEffect(() => {
    const before = document.activeElement;
    return () => {
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, []);
  // Only once it is placed: a menu still hidden while it measures can't
  // take focus.
  useEffect(() => {
    if (!pos.ready || !ref.current || ref.current.contains(document.activeElement)) return;
    const first = ref.current.querySelector('.ctx-item:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }, [pos.ready]);
  const onKeyDown = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !ref.current) return;
    e.preventDefault();
    const list = [...ref.current.querySelectorAll('.ctx-item:not(:disabled)')];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next].focus();
  };

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8;
    if (ny + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny), ready: true });
  }, [x, y]);

  return createPortal(
    <div ref={ref} role="menu" className="context-menu" onKeyDown={onKeyDown} style={{ left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}>
      {items.map((item, i) => {
        if (!item) return null;
        if (item.divider) return <div key={i} className="ctx-divider" />;
        if (item.header) return <div key={i} className="ctx-header">{item.header}</div>;
        return (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item ${item.danger ? 'danger-item' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick && item.onClick();
            }}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

// ---------- Misc ----------

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
