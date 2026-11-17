import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACTIONS, TURN_PARTS } from '../rules/glossary';
import { FeatureItem, PropertyChips } from './Explain';
import { BookIcon, XIcon } from './Icons';

// "What can I do?" from the hero bar: the parts of a turn, your attacks in
// plain words, the actions anyone can take, and your own features. A note
// opened by tap, so it works the same with a mouse or a thumb.
export default function TurnHelp({ sheet, onSheet }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const pop = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!btn.current?.contains(e.target) && !pop.current?.contains(e.target) && !e.target.closest?.('.info-pop')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  const attacks = sheet.derived?.attacks || [];
  const features = sheet.features || [];
  return (
    <>
      <button ref={btn} className={`hud-hero-btn ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} title="What can I do on my turn?">
        <BookIcon size={15} /> <span>Help</span>
      </button>
      {open && createPortal(
        <div ref={pop} className="paper turn-help" role="dialog" aria-label="What can I do?">
          <div className="turn-help-head">
            <h4>Your turn</h4>
            <button className="close-btn" onClick={() => setOpen(false)} aria-label="Close"><XIcon size={14} /></button>
          </div>
          {TURN_PARTS.map((t) => <p key={t.name}><strong>{t.name}.</strong> {t.desc}</p>)}
          <h4>Your attacks</h4>
          <p className="muted">Tap a foe on the map to pick one. Each tells you its chance to hit; tap its (i) for what it does.</p>
          {attacks.length ? attacks.map((a) => (
            <p key={a.name}>
              <strong>{a.name}</strong>: d20 {a.bonus >= 0 ? '+' : ''}{a.bonus} to hit, {a.damage}{a.damageMod ? (a.damageMod > 0 ? `+${a.damageMod}` : a.damageMod) : ''} {a.damageType}.{' '}
              <PropertyChips properties={a.properties} range={a.range} />
            </p>
          )) : <p className="muted">No weapon equipped: tick one on your sheet's Gear tab.</p>}
          {sheet.spellcasting && <p className="muted">Spells: open your sheet's Spells tab, tap a spell to read it and cast it.</p>}
          <h4>Actions anyone can take</h4>
          {ACTIONS.map((a) => <p key={a.name}><strong>{a.name}.</strong> {a.desc}</p>)}
          {features.length > 0 && (
            <>
              <h4>What {sheet.name} can do</h4>
              <div className="feature-list">
                {features.map((f, i) => <FeatureItem key={i} name={f.name} source={f.source} desc={f.desc} max={120} />)}
              </div>
            </>
          )}
          {onSheet && <p className="mt"><button className="small-btn" onClick={() => { setOpen(false); onSheet(); }}><BookIcon size={12} /> Open my sheet</button></p>}
        </div>,
        document.body,
      )}
    </>
  );
}
