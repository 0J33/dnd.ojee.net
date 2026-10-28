import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from './Portrait';
import { ChevronRight, HeartIcon, ShieldIcon, ScrollIcon, SkullIcon, MenuIcon, BookIcon, GearIcon, CopyIcon, MapIcon, EyeIcon } from './Icons';

// The table's heads-up display, after the mtg table: what you need every
// turn sits on the table itself; everything else is one tap away and out of
// sight until then.
//   PartyStrip  - everyone's hero along the top, HP at a glance, tap = sheet
//   HeroBar     - your hero along the bottom: HP, AC, whose turn, End turn
//   OverflowMenu- the "⋯" for things you need now and then (rules, settings…)

export function PartyStrip({ state, charSheets, userId, onOpenSheet, turnTokenId, tokens }) {
  const heroes = state.members.filter((m) => m.characterId && charSheets[m.characterId]);
  if (!heroes.length) return null;
  return (
    <div className="hud-party" role="list" aria-label="The party">
      {heroes.map((m) => {
        const sh = charSheets[m.characterId];
        const k = Math.max(0, Math.min(1, (sh.currentHp ?? 0) / Math.max(1, sh.maxHp || 1)));
        const tok = tokens.find((t) => t.characterId === m.characterId);
        const turn = tok && tok.id === turnTokenId;
        return (
          <button
            key={m.userId}
            role="listitem"
            className={`hud-party-chip ${m.userId === userId ? 'me' : ''} ${turn ? 'turn' : ''} ${sh.currentHp === 0 ? 'down' : ''} ${m.socketId ? '' : 'away'}`}
            onClick={() => onOpenSheet(m.characterId)}
            title={`${sh.name} (${m.username}) - ${sh.currentHp}/${sh.maxHp} HP, AC ${sh.derived?.ac ?? '?'}. Open sheet`}
          >
            <Avatar sheet={sh} name={sh.name} color={m.color} size={34} />
            <span className="hud-party-hp"><i style={{ width: `${k * 100}%` }} className={k <= 0.25 ? 'low' : k <= 0.5 ? 'mid' : ''} /></span>
            {sh.currentHp === 0 && <span className="hud-party-down"><SkullIcon size={12} /></span>}
          </button>
        );
      })}
    </div>
  );
}

export function HeroBar(props) {
  // The bar tells the page how tall it is, so the dice button can sit the
  // same distance above it as the dice tray sits above the button.
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, root = document.documentElement;
    if (!el) { root.style.setProperty('--hero-h', '0px'); return undefined; }
    const ro = new ResizeObserver(() => root.style.setProperty('--hero-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty('--hero-h', '0px'); };
  }, [!!props.sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  return props.sheet ? <HeroBarInner {...props} barRef={ref} /> : null;
}

function HeroBarInner({ sheet, color, combat, myTurn, monsterActing, isGuided, onSheet, onEndTurn, onSearch, barRef }) {
  const hp = sheet.currentHp ?? 0, max = sheet.maxHp || 1;
  const k = Math.max(0, Math.min(1, hp / max));
  const inFight = combat?.active && combat.round > 0;
  let hint;
  if (hp === 0) hint = 'You are down! Roll a death save on your sheet - any healing brings you back.';
  else if (inFight && myTurn) hint = 'Your turn: click a square to move, click a foe to attack.';
  else if (inFight && monsterActing) hint = 'The monsters are acting…';
  else if (inFight) hint = 'Waiting for your turn.';
  else hint = isGuided ? 'Click a square to walk there. The story panel says what to do next.' : 'Click a square to walk there, a door to open it, a creature to look at it.';
  return (
    <div ref={barRef} className={`hud-hero ${inFight && myTurn ? 'my-turn' : ''}`}>
      <button className="hud-hero-face" onClick={onSheet} title="Open your sheet (spells, gear, skills)">
        <Avatar sheet={sheet} name={sheet.name} color={color} size={44} />
      </button>
      <div className="hud-hero-mid">
        <div className="hud-hero-top">
          <span className="hud-hero-name">{sheet.name}</span>
          <span className="hud-hero-stat" title="Hit points"><HeartIcon size={12} /> {hp}/{max}{sheet.tempHp ? ` +${sheet.tempHp}` : ''}</span>
          <span className="hud-hero-stat" title="Armour class: what an enemy must roll to hit you"><ShieldIcon size={12} /> {sheet.derived?.ac ?? '?'}</span>
        </div>
        <span className="hud-hero-hp"><i style={{ width: `${k * 100}%` }} className={k <= 0.25 ? 'low' : k <= 0.5 ? 'mid' : ''} /></span>
        <span className="hud-hero-hint">{hint}</span>
      </div>
      {onSearch && <button className="hud-hero-btn" onClick={onSearch} title="Search around you for hidden things (Perception)"><EyeIcon size={15} /> <span>Search</span></button>}
      <button className="hud-hero-btn" onClick={onSheet} title="Your character sheet"><ScrollIcon size={15} /> <span>Sheet</span></button>
      {inFight && myTurn && (
        <button className="hud-hero-end primary-btn" onClick={onEndTurn} title="Finish your turn (Enter)">End turn <ChevronRight size={13} /></button>
      )}
    </div>
  );
}

export function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="hud-more" ref={ref}>
      <button className={`small-btn ghost-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="More">
        <MenuIcon size={15} />
      </button>
      {open && (
        <div className="hud-more-menu panel" role="menu">
          {items.filter(Boolean).map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon} <span>{it.label}</span>{it.hint && <em>{it.hint}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const MENU_ICONS = { BookIcon, GearIcon, CopyIcon, MapIcon };
