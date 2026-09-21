import React, { useEffect, useRef, useState } from 'react';
import { describeRoll } from '../rules/engine';
import { Avatar, artForToken } from './Portrait';
import { D20Icon, DieShape, SkullIcon, SwordIcon, ChatIcon, LockIcon, PlusIcon, ChevronRight, XIcon, HeartIcon, ChevronDown } from './Icons';

// ---------------- Party panel ----------------

export function PartyPanel({ state, isDM, userId, onOpenSheet, onMonsterHp, onMonsterAct, onTokenSelect, onAddMonster }) {
  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const tokens = scene?.tokens || [];
  const monsters = tokens.filter((t) => t.kind === 'monster');
  const extras = tokens.filter((t) => t.kind === 'npc' || t.kind === 'marker');
  return (
    <aside className="party-panel">
      <h4 className="side-title">Party</h4>
      <div className="party-list">
        {state.members.map((m) => {
          const sheet = m.characterId ? state.charSheets[m.characterId] : null;
          const online = !!m.socketId;
          const isDm = state.mode === 'dm' && state.dmId === m.userId;
          return (
            <button
              key={m.userId}
              className={`party-card ${sheet && sheet.currentHp === 0 ? 'down' : ''}`}
              onClick={() => sheet && onOpenSheet(m.characterId)}
              title={sheet ? `Open ${sheet.name}'s character sheet` : `${m.username} has not picked a hero yet`}
              disabled={!sheet}
            >
              <span className={`party-portrait ${online ? '' : 'offline'}`}>
                <Avatar sheet={sheet} name={sheet ? sheet.name : m.username} color={m.color} size={40} />
                <span className="party-dot" style={{ background: m.color, opacity: online ? 1 : 0.25 }} title={online ? 'Online' : 'Away'} />
              </span>
              <span className="party-info">
                <span className="party-name">
                  {sheet ? sheet.name : m.username} {isDm && <span className="chip gold">DM</span>}
                </span>
                {sheet ? (
                  <>
                    <span className="party-char">
                      {m.username} · L{sheet.level} {sheet.className} · AC {sheet.derived?.ac ?? '?'}
                    </span>
                    <span className="hp-bar" role="img" aria-label={`${sheet.currentHp} of ${sheet.maxHp} hit points`}>
                      <span className="hp-bar-fill" style={{ width: `${Math.min(100, (sheet.currentHp / Math.max(1, sheet.maxHp)) * 100)}%` }} />
                    </span>
                    <span className="party-hp">
                      {sheet.currentHp === 0 && <SkullIcon size={10} />} {sheet.currentHp}/{sheet.maxHp}{sheet.tempHp ? ` +${sheet.tempHp}` : ''} hp
                    </span>
                  </>
                ) : (
                  <span className="party-char muted">{isDm ? 'Running the game' : 'picking a hero...'}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {isDM && (
        <>
          <h4 className="side-title">
            Creatures
            {onAddMonster && (
              <button className="side-title-add" onClick={onAddMonster} title="Add a creature from the monster library" aria-label="Add a creature">
                <PlusIcon size={12} />
              </button>
            )}
          </h4>
          {monsters.length === 0 ? (
            <p className="muted small side-empty">Nothing on this scene yet.</p>
          ) : (
            <div className="party-list">
              {monsters.map((t) => (
                <div key={t.id} className={`monster-card ${t.dead ? 'down' : ''} ${t.hidden ? 'is-hidden' : ''}`}>
                  <Avatar art={artForToken(t)} name={t.label} color={t.color} size={30} shape="square" />
                  <button className="link-btn monster-name" onClick={() => onTokenSelect(t)} title={`Stat block for ${t.label}`}>
                    {t.label}
                  </button>
                  <span className="row" style={{ gap: 4 }}>
                    <input
                      className="monster-hp"
                      aria-label={`${t.label} hit points`}
                      value={t.hp ?? ''}
                      onChange={(e) => onMonsterHp(t, parseInt(e.target.value, 10) || 0)}
                    />
                    <span className="muted small">/{t.maxHp}</span>
                    <button className="small-btn" title={`Run ${t.label}'s turn automatically`} aria-label={`Run ${t.label}'s turn`} onClick={() => onMonsterAct(t)}>
                      <SwordIcon size={11} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {extras.length > 0 && (
            <>
              <h4 className="side-title">On the map</h4>
              <div className="party-list">
                {extras.map((t) => (
                  <div key={t.id} className={`monster-card ${t.hidden ? 'is-hidden' : ''}`}>
                    <Avatar art={artForToken(t)} name={t.label} color={t.color} size={26} shape="square" ring={false} />
                    <span className="grow monster-name">{t.label}</span>
                    <span className="chip">{t.kind === 'npc' ? 'NPC' : 'marker'}</span>
                    {t.hidden && (
                      <span className="chip" title="Players cannot see this token">hidden</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}

// ---------------- Initiative bar ----------------

export function InitiativeBar({ state, isDM, userId, myToken, myInitMod, onRollInitiative, onRollMonsters, onBegin, onNext, onEnd }) {
  const combat = state.combat;
  if (!combat.active) return null;
  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const tokenById = (id) => (scene?.tokens || []).find((t) => t.id === id);
  const inOrder = myToken && combat.order.some((o) => o.tokenId === myToken.id);
  const current = combat.round > 0 ? combat.order[combat.turnIndex] : null;
  const currentToken = current ? tokenById(current.tokenId) : null;
  const myTurn = currentToken && currentToken.ownerId === userId;

  return (
    <div className="initiative-bar panel">
      {combat.round === 0 ? (
        <>
          <span className="init-title"><SwordIcon size={14} /> Roll initiative!</span>
          {myToken && !inOrder && (
            <button className="primary-btn small-btn" onClick={onRollInitiative}>
              <D20Icon size={13} /> Roll ({myInitMod >= 0 ? '+' : ''}{myInitMod})
            </button>
          )}
          {combat.order.map((o) => (
            <span key={o.tokenId} className="init-chip" style={{ '--tk-color': tokenById(o.tokenId)?.color || '#888' }}>
              {o.name} <strong>{o.initiative}</strong>
            </span>
          ))}
          {isDM && (
            <>
              <button className="small-btn" onClick={onRollMonsters}>Roll monsters</button>
              <button className="small-btn primary-btn" disabled={!combat.order.length} onClick={onBegin}>Begin!</button>
              <button className="small-btn ghost-btn" onClick={onEnd}>Cancel</button>
            </>
          )}
        </>
      ) : (
        <>
          <span className="init-round">Round {combat.round}</span>
          <div className="init-order">
            {combat.order.map((o, i) => (
              <span
                key={o.tokenId}
                className={`init-chip ${i === combat.turnIndex ? 'current' : ''} ${tokenById(o.tokenId)?.dead ? 'dead' : ''}`}
                style={{ '--tk-color': tokenById(o.tokenId)?.color || '#888' }}
              >
                {o.name} <strong>{o.initiative}</strong>
              </span>
            ))}
          </div>
          {(isDM || myTurn) && (
            <button className="small-btn primary-btn" onClick={onNext}>
              {myTurn && !isDM ? 'End my turn' : 'Next turn'} <ChevronRight size={12} />
            </button>
          )}
          {isDM && <button className="small-btn ghost-btn" onClick={onEnd}>End combat</button>}
        </>
      )}
    </div>
  );
}

// ---------------- Chat / log panel ----------------

export function ChatPanel({ chat, log, members, userId, isDM, onSend, onRollFormula, collapsed, onToggle }) {
  const [tab, setTab] = useState('chat');
  const [text, setText] = useState('');
  const [whisper, setWhisper] = useState('');
  const listRef = useRef(null);
  const items = tab === 'chat' ? chat : log;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [items.length, tab, collapsed]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    const rollMatch = t.match(/^\/(r|roll|gr|gmroll)\s+(.+)$/i);
    if (rollMatch) {
      onRollFormula(rollMatch[2], /^g/i.test(rollMatch[1]));
      return;
    }
    onSend(t, whisper || null);
  };

  if (collapsed) {
    return (
      <button className="chat-collapsed" onClick={onToggle} title="Open chat & log">
        <ChatIcon size={18} />
      </button>
    );
  }

  return (
    <aside className="chat-panel panel">
      <div className="tab-row">
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>Log</button>
        <div className="grow" />
        <button className="close-btn" onClick={onToggle} title="Collapse the chat" aria-label="Collapse the chat"><ChevronRight size={16} /></button>
      </div>
      <div className="chat-list" ref={listRef}>
        {tab === 'chat'
          ? chat.map((m) => <ChatItem key={m.id} item={m} mine={m.userId === userId} />)
          : log.map((l) => (
              <div key={l.id} className={`log-item log-${l.type || 'info'}`}>
                {l.text}
              </div>
            ))}
        {items.length === 0 && <p className="muted small center" style={{ padding: 20 }}>Nothing here yet.</p>}
      </div>
      {tab === 'chat' && (
        <div className="chat-input-row">
          <select value={whisper} onChange={(e) => setWhisper(e.target.value)} title="Who sees your message">
            <option value="">All</option>
            <option value="dm">DM</option>
          </select>
          <input
            value={text}
            placeholder="Say something... (/r 2d6+3 rolls)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="small-btn" onClick={submit}>Send</button>
        </div>
      )}
    </aside>
  );
}

function ChatItem({ item, mine }) {
  if (item.kind === 'narration') {
    return (
      <div className="chat-item narration-item">
        <span className="chat-user narration-label">Narration</span>
        <p className="narration-text">{item.text}</p>
      </div>
    );
  }
  if (item.kind === 'roll' && item.roll) {
    const r = item.roll;
    return (
      <div className={`chat-item roll-item ${mine ? 'mine' : ''}`}>
        <span className="chat-user">{r.characterName || item.username}</span>
        <div className="roll-card">
          <span className="roll-label">{r.label || r.formula} {r.secret && <LockIcon size={10} />}</span>
          <span className="roll-detail">{describeRoll(r)}</span>
          <span className={`roll-total ${r.natural === 20 ? 'crit' : r.natural === 1 ? 'fumble' : ''}`}>{r.total}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`chat-item ${mine ? 'mine' : ''}`}>
      <span className="chat-user">
        {item.username}
        {item.whisperTo && <em className="muted"> to {item.whisperTo === 'dm' ? 'the DM' : 'you'}</em>}
      </span>
      <span className="chat-text">{item.text}</span>
    </div>
  );
}

// ---------------- Dice tray ----------------

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceTray({ onRoll, characterName }) {
  const [pool, setPool] = useState({});
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState('normal');
  const [secret, setSecret] = useState(false);
  const [formula, setFormula] = useState('');
  // On a phone the tray starts closed - the tool bar owns the bottom edge.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 820);

  const poolEntries = Object.entries(pool).filter(([, n]) => n > 0);
  const poolFormula = () => {
    const parts = poolEntries.map(([sides, n]) => `${n}d${sides}`);
    let f = parts.join('+');
    if (modifier) f += modifier > 0 ? `+${modifier}` : `${modifier}`;
    return f;
  };

  const rollNow = (f, label) => {
    onRoll({ formula: f, mode, secret, label });
  };

  const clickDie = (sides) => {
    if (poolEntries.length) {
      setPool((p) => ({ ...p, [sides]: (p[sides] || 0) + 1 }));
    } else {
      let f = `1d${sides}`;
      if (modifier) f += modifier > 0 ? `+${modifier}` : `${modifier}`;
      rollNow(f, `d${sides} roll`);
    }
  };

  if (!open) {
    return (
      <div className="dice-dock">
        <button
          className="dice-collapsed"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          title="Open dice tray"
        >
          <D20Icon size={20} /> <span className="dice-collapsed-label">Dice</span>
        </button>
      </div>
    );
  }

  return (
    <div className="dice-tray panel">
      <div className="dice-row">
        {DICE.map((d) => (
          <div key={d} className="die-wrap">
            <button className="die-btn" onClick={() => clickDie(d)} title={poolEntries.length ? `Add d${d} to pool` : `Roll 1d${d}`}>
              <DieShape sides={d} size={34} label={d === 100 ? '%' : d} />
            </button>
            <button className="die-add" title={`Add d${d} to the pool`} onClick={(e) => { e.stopPropagation(); setPool((p) => ({ ...p, [d]: (p[d] || 0) + 1 })); }}>+</button>
            {pool[d] > 0 && <span className="die-count">{pool[d]}</span>}
          </div>
        ))}

        <div className="dice-opts">
          <div className="adv-toggle">
            <button className={`small-btn ${mode === 'dis' ? 'danger-btn active-mode' : 'ghost-btn'}`} title="Disadvantage: roll 2d20, keep the LOWER" onClick={() => setMode(mode === 'dis' ? 'normal' : 'dis')}>DIS</button>
            <button className={`small-btn ${mode === 'normal' ? 'active-mode' : 'ghost-btn'}`} onClick={() => setMode('normal')}>—</button>
            <button className={`small-btn ${mode === 'adv' ? 'primary-btn active-mode' : 'ghost-btn'}`} title="Advantage: roll 2d20, keep the HIGHER" onClick={() => setMode(mode === 'adv' ? 'normal' : 'adv')}>ADV</button>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="small-btn" onClick={() => setModifier((m) => m - 1)}>−</button>
            <span className="dice-mod" title="Modifier added to the roll">{modifier >= 0 ? `+${modifier}` : modifier}</span>
            <button className="small-btn" onClick={() => setModifier((m) => m + 1)}>+</button>
            <label className="row small muted" style={{ gap: 4, marginLeft: 6 }} title="Only you and the DM see the result">
              <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> hidden
            </label>
          </div>
        </div>

        <input
          className="dice-formula"
          placeholder="or type: 2d6+3 ⏎"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && formula.trim()) {
              rollNow(formula.trim(), formula.trim());
              setFormula('');
            }
          }}
        />
        <button className="close-btn" onClick={() => setOpen(false)} title="Collapse the dice tray" aria-label="Collapse the dice tray">
          <ChevronDown />
        </button>
      </div>

      {poolEntries.length > 0 && (
        <div className="dice-pool-row">
          <span className="muted small">Pool:</span>
          {poolEntries.map(([sides, n]) => (
            <button key={sides} className="chip gold" onClick={() => setPool((p) => ({ ...p, [sides]: 0 }))} title="Remove">
              {n}d{sides} <XIcon size={10} />
            </button>
          ))}
          {modifier !== 0 && <span className="chip">{modifier > 0 ? `+${modifier}` : modifier}</span>}
          <button className="primary-btn small-btn" onClick={() => { rollNow(poolFormula(), 'Dice pool'); setPool({}); }}>
            Roll!
          </button>
          <button className="small-btn ghost-btn" onClick={() => setPool({})}>Clear</button>
        </div>
      )}
    </div>
  );
}

// ---------------- Roll toasts ----------------

export function RollToasts({ toasts }) {
  return (
    <div className="roll-toasts">
      {toasts.map((r) => (
        <div key={r.id} className={`roll-toast ${r.natural === 20 ? 'crit-border' : ''} ${r.natural === 1 ? 'fumble-border' : ''}`}>
          <div className="roll-toast-head">
            <D20Icon size={14} />
            <strong>{r.characterName || r.username}</strong>
            <span className="muted small">{r.label}</span>
            {r.secret && <span title="hidden roll"><LockIcon size={11} /></span>}
          </div>
          <div className="roll-toast-body">
            <div className="roll-toast-dice">
              {r.parts.map((p, pi) => (
                <span key={pi} className="roll-part">
                  {p.rolls.map((v, i) => (
                    <span key={i} className={`die-face ${!p.kept.includes(i) ? 'dropped' : ''} ${p.sides === 20 && v === 20 ? 'crit' : ''} ${p.sides === 20 && v === 1 ? 'fumble' : ''}`}>
                      {v}
                    </span>
                  ))}
                  <span className="muted small">d{p.sides}</span>
                </span>
              ))}
              {r.modifier !== 0 && <span className="roll-mod">{r.modifier > 0 ? `+${r.modifier}` : r.modifier}</span>}
            </div>
            <div className={`roll-toast-total ${r.natural === 20 ? 'crit' : ''} ${r.natural === 1 ? 'fumble' : ''}`}>{r.total}</div>
          </div>
          {r.mode !== 'normal' && <div className="roll-toast-mode">{r.mode === 'adv' ? 'with advantage (kept higher)' : 'with disadvantage (kept lower)'}</div>}
          {r.natural === 20 && <div className="roll-toast-crit">NATURAL 20!</div>}
          {r.natural === 1 && <div className="roll-toast-crit fumble">natural 1...</div>}
        </div>
      ))}
    </div>
  );
}
