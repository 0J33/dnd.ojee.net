import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { srd } from '../api';
import { useLocalStorage } from '../utils';
import { InfoIcon, XIcon } from './Icons';
import {
  castingTimeNote, CONCENTRATION_NOTE, RITUAL_NOTE, COMPONENT_NOTE, SAVE_SUCCESS, WEAPON_PROPERTIES, RANGE_NOTE,
} from '../rules/glossary';

// Everything a new player needs to know what a thing does, wherever it
// appears: a short summary with "more", a feature card, a tap-to-open info
// popover (hover is never the only way in), and the facts of a spell.

/** The opening sentences of a text, cut at a sentence end near `max` characters. */
export function summarize(text, max = 170) {
  const first = String(text || '').split(/\n+/).find((p) => p.trim()) || '';
  const clean = first.replace(/\*+/g, '').replace(/\s+/g, ' ').trim(); // SRD sub-headings come as ***Name.***
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [clean];
  let out = '';
  let i = 0;
  for (; i < sentences.length; i++) {
    if (out && (out + sentences[i]).length > max) break;
    out += sentences[i];
  }
  // one short sentence says too little ("You cast spells using Intelligence."):
  // run on into the next, cut at a word
  if (i < sentences.length && out.length < max * 0.55) out += sentences[i];
  out = out.trim();
  return out.length > max + 20 ? `${out.slice(0, max).replace(/[\s,;:]+\S*$/, '')}…` : out;
}

/** Long text as its summary, with "more" to read the rest. */
export function MoreText({ text, max = 170, className = '' }) {
  const [open, setOpen] = useState(false);
  const full = String(text || '').trim();
  if (!full) return null;
  const short = summarize(full, max);
  const long = short.replace(/…$/, '').length < full.length - 6;
  return (
    <p className={`more-text ${className}`}>
      {open || !long ? full : short}
      {long && (
        <>
          {' '}
          <button
            type="button" className="link-btn more-btn" aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {open ? 'less' : 'more'}
          </button>
        </>
      )}
    </p>
  );
}

/** A class, race or subclass feature: name, where it's from, what it does. */
export function FeatureItem({ name, source, desc, options, max }) {
  return (
    <div className="feature-item">
      <div className="feature-item-head"><strong>{name}</strong>{source && <span className="muted small"> · {source}</span>}</div>
      <MoreText text={desc || 'No description.'} max={max} />
      {options && options.length > 0 && (
        <details className="feature-options">
          <summary>{options.length} option{options.length === 1 ? '' : 's'} to choose from</summary>
          {options.map((o) => (
            <div key={o.name} className="feature-option">
              <strong>{o.name}</strong>
              <MoreText text={o.desc} max={140} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

let closeOpenTip = null;

/**
 * A small (i) button that opens an explanation on click or tap and closes on
 * a second tap, a tap elsewhere or Escape. `label` names what's explained.
 */
export function InfoTip({ label, children, size = 14, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);

  // Below the (i) if it fits, above if not, else wherever it stays on screen;
  // placed again when its text grows (a spell's entry arrives after opening).
  useLayoutEffect(() => {
    if (!open || !btn.current) return undefined;
    const place = () => {
      if (!btn.current) return;
      const r = btn.current.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(320, vw - 16);
      const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
      const h = pop.current ? pop.current.offsetHeight : 160;
      const below = r.bottom + 6;
      const top = below + h > vh - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : Math.max(8, Math.min(below, vh - h - 8));
      setPos((p) => (p && p.left === left && p.top === top && p.w === w ? p : { left, top, w }));
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' && pop.current ? new ResizeObserver(place) : null;
    if (ro) ro.observe(pop.current);
    return () => ro && ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (btn.current?.contains(e.target) || pop.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Escape closes the popover, not the dialog underneath it.
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const gone = () => setOpen(false);
    // it is placed once, so scrolling what's under it closes it (scrolling the note itself doesn't)
    const scrolled = (e) => { if (!pop.current?.contains(e.target)) setOpen(false); };
    // one note at a time
    if (closeOpenTip && closeOpenTip !== gone) closeOpenTip();
    closeOpenTip = gone;
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('resize', gone);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      if (closeOpenTip === gone) closeOpenTip = null;
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', gone);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn} type="button" className={`link-btn info-tip ${open ? 'on' : ''} ${className}`}
        aria-label={`What is ${label}?`} aria-expanded={open} title={`What is ${label}?`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <InfoIcon size={size} />
      </button>
      {open && createPortal(
        <div
          ref={pop} className="info-pop" role="dialog" aria-label={label}
          style={pos ? { left: pos.left, top: pos.top, width: pos.w } : { visibility: 'hidden', left: 0, top: 0 }}
          onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
        >
          <div className="info-pop-head">
            <strong>{label}</strong>
            <button type="button" className="info-pop-close" aria-label="Close" onClick={() => setOpen(false)}><XIcon size={13} /></button>
          </div>
          <div className="info-pop-body">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---- spells ----

let spellIndexCache = null;
let spellIndexLoad = null;
/** Every spell's summary (facts + a one-line brief), by index. Loaded once. */
export function useSpellIndex() {
  const [map, setMap] = useState(spellIndexCache);
  useEffect(() => {
    if (spellIndexCache) return undefined;
    let live = true;
    if (!spellIndexLoad) {
      spellIndexLoad = srd.spells('').then((list) => {
        if (Array.isArray(list)) spellIndexCache = Object.fromEntries(list.map((s) => [s.index, s]));
        else spellIndexLoad = null;
        return spellIndexCache;
      });
    }
    spellIndexLoad.then((m) => live && m && setMap(m));
    return () => { live = false; };
  }, []);
  return map || {};
}

const SAVE_NAMES = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const rangeShort = (r) => String(r || '').replace(/\s*feet\b/i, ' ft').replace(/\s*foot\b/i, ' ft');

/**
 * What a spell does in numbers, one short line: "1d10 fire · spell attack · 120 ft".
 * Works on a summary (string damage) or a full record (damage tables).
 */
export function spellLine(s) {
  if (!s) return '';
  const bits = [];
  const dmg = typeof s.damage === 'string' ? s.damage : null;
  const type = s.damage_type || s.damage?.damage_type?.name;
  if (dmg && type) bits.push(`${dmg} ${type.toLowerCase()}`);
  else if (dmg) bits.push(`rolls ${dmg}`);
  if (s.heal) bits.push(`heals ${s.heal}`);
  if (s.attack_type) bits.push(`${s.attack_type} spell attack`);
  const save = s.save?.ability || s.dc?.dc_type?.index;
  if (save) bits.push(`${SAVE_NAMES[save] || save.toUpperCase()} save`);
  if (s.area) bits.push(s.area);
  bits.push(rangeShort(s.range));
  return bits.filter(Boolean).join(' · ');
}

/** The facts of a spell, each with what it means for you. */
export function SpellFacts({ spell, dc = null, attackBonus = null }) {
  if (!spell) return null;
  const ct = castingTimeNote(spell.casting_time);
  const save = spell.save || (spell.dc ? { ability: spell.dc.dc_type.index, success: spell.dc.dc_success } : null);
  const comps = (spell.components || []).map((c) => COMPONENT_NOTE[c] || c);
  // dice: a summary carries them as text, a full record through `dice` from the caller
  const dice = typeof spell.damage === 'string' ? spell.damage : spell.dice;
  const dtype = (spell.damage_type || spell.damage?.damage_type?.name || '').toLowerCase();
  const heal = spell.heal || (spell.heal_at_slot_level && spell.dice ? `${spell.dice} + your spellcasting modifier` : null);
  const rows = [
    ['Casting time', `${spell.casting_time}${ct ? `: ${ct}` : ''}`],
    ['Range', spell.range === 'Self' ? 'Self: it starts from you' : spell.range === 'Touch' ? 'Touch: you must be next to the target' : spell.range],
    spell.area && ['Area', spell.area],
    ['Duration', spell.duration === 'Instantaneous' ? 'Instant: it happens and is over' : spell.duration],
    spell.attack_type && ['To hit', `Roll a ${spell.attack_type} spell attack${attackBonus != null ? ` (d20 ${attackBonus >= 0 ? '+' : ''}${attackBonus})` : ''} against the target's AC.`],
    save && ['Save', `The target rolls a ${SAVE_NAMES[save.ability] || save.ability} save${dc ? ` against your DC ${dc}` : ''}: ${SAVE_SUCCESS[save.success] || SAVE_SUCCESS.other}.`],
    dice && !heal && [dtype ? 'Damage' : 'Roll', `${dice}${dtype ? ` ${dtype}` : ''}`],
    heal && ['Healing', heal.replace(/\+ mod$/, '+ your spellcasting modifier')],
    comps.length > 0 && ['Components', comps.join(', ')],
  ].filter(Boolean);
  return (
    <div className="spell-facts">
      <dl>
        {rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
      </dl>
      {spell.concentration && <p className="spell-fact-note">{CONCENTRATION_NOTE}</p>}
      {spell.ritual && <p className="spell-fact-note">{RITUAL_NOTE}</p>}
    </div>
  );
}

/** A spell's whole entry, fetched when opened: facts, then the SRD text. */
export function SpellInfo({ index, summary }) {
  const [spell, setSpell] = useState(null);
  useEffect(() => {
    let live = true;
    srd.spell(index).then((s) => live && s && !s.error && setSpell(s));
    return () => { live = false; };
  }, [index]);
  const facts = spell ? { ...spell, area: summary?.area, dice: summary?.damage || summary?.heal, heal: summary?.heal } : summary;
  return (
    <>
      <p className="muted small">{summary ? (summary.level === 0 ? 'Cantrip' : `Level ${summary.level}`) : ''} {summary?.school}</p>
      <SpellFacts spell={facts} />
      {spell ? (
        <>
          {(spell.desc || []).map((d, i) => <p key={i} className="small">{d}</p>)}
          {(spell.higher_level || []).map((d, i) => <p key={`h${i}`} className="small muted"><em>At higher levels:</em> {d}</p>)}
        </>
      ) : <p className="muted small">{summary?.brief || 'Loading...'}</p>}
    </>
  );
}

/**
 * A spell you can pick (builder, Learn spells, Prepare): what it does in
 * numbers and in a sentence, and an (i) for the whole entry.
 */
export function SpellPickRow({ spell, on, toggle, disabled = false, showLevel = false }) {
  const s = spell;
  return (
    <div className={`spell-pick-wrap ${on ? 'on' : ''}`}>
      <button className={`spell-pick ${on ? 'on' : ''}`} onClick={toggle} disabled={disabled} aria-pressed={on}>
        <span className="spell-pick-name">{s.name}</span>
        <span className="muted small spell-pick-meta">
          {showLevel ? `${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} · ` : ''}{s.casting_time || ''}{s.concentration ? ' · concentration' : ''}{s.ritual ? ' · ritual' : ''}
        </span>
        {spellLine(s) && <span className="spell-pick-line">{spellLine(s)}</span>}
        {s.brief && <span className="spell-pick-brief">{summarize(s.brief, 120)}</span>}
      </button>
      {s.index && <InfoTip label={s.name} className="spell-pick-info"><SpellInfo index={s.index} summary={s} /></InfoTip>}
    </div>
  );
}

/** Weapon properties as chips, each one tappable for what it means. */
export function PropertyChips({ properties = [], range = null }) {
  if (!properties.length && !range) return null;
  return (
    <span className="prop-chips">
      {range && (
        <span className="chip prop-chip">{typeof range === 'object' ? `${range.normal}/${range.long || range.normal}` : range} ft
          <InfoTip label="Range" size={12}>{RANGE_NOTE}</InfoTip>
        </span>
      )}
      {properties.map((p) => (
        <span key={p} className="chip prop-chip">{p}
          {WEAPON_PROPERTIES[p] && <InfoTip label={cap(p)} size={12}>{WEAPON_PROPERTIES[p]}</InfoTip>}
        </span>
      ))}
    </span>
  );
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

/** The sheet's "explain everything" switch, on until a player turns it off. */
export function useExplainMode() {
  return useLocalStorage('dnd.explain', true);
}
