import React, { useEffect, useMemo, useRef, useState } from 'react';
import { characters as charsApi, srd } from '../api';
import { useDialog, ModalOverlay } from '../utils';
import {
  ABILITIES, ABILITY_NAMES, SKILLS, CONDITIONS, mod, fmtMod, proficiencyBonus,
  deriveSheet, CLASS_META, AVG_HIT_DIE, XP_THRESHOLDS, xpToLevel, maxSpellSlots, preparedCount, describeRoll,
  subclassOf, subclassLevel, SUBCLASS_LABEL, levelUpHp,
} from '../rules/engine';
import { SubclassPicker, useSubclass, subclassFeaturesBetween } from './ContentChoices';
import { Avatar } from './Portrait';
import { HeartIcon, ShieldIcon, D20Icon, CampfireIcon, SparkleIcon, SkullIcon, PlusIcon, BookIcon, ChevronUp, XIcon, ConditionIcon } from './Icons';

// The interactive 5e character sheet.
// mode "lobby": standalone editor, saves via REST, rolls locally.
// mode "game": controlled by GameBoard - onSheetChange + onRoll go through the socket.
export default function CharacterSheet({
  characterId,
  initialSheet,
  mode = 'lobby',
  readOnly = false,
  onClose,
  onSheetChange = null,
  onRoll = null,
  onAnnounce = null,
  liveSheet = null,
}) {
  const dialog = useDialog();
  const [localSheet, setLocalSheet] = useState(initialSheet);
  const [tab, setTab] = useState('main');
  const [spellDetail, setSpellDetail] = useState(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showPrepare, setShowPrepare] = useState(false);
  const [showSubclass, setShowSubclass] = useState(false);
  const [localRoll, setLocalRoll] = useState(null);
  const saveTimer = useRef(null);

  const sheet = mode === 'game' && liveSheet ? liveSheet : localSheet;
  const derived = useMemo(() => deriveSheet(sheet), [sheet]);
  const meta = CLASS_META[sheet.classIndex] || {};

  // ---- change plumbing ----
  const change = (patch) => {
    if (readOnly) return;
    const next = { ...sheet, ...patch };
    setLocalSheet(next);
    if (onSheetChange) onSheetChange(next);
    if (mode === 'lobby') {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        charsApi.update(characterId, { name: next.name, sheet: next });
      }, 600);
    }
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ---- rolling ----
  const roll = (formula, label, opts = {}) => {
    if (onRoll) return onRoll({ formula, label, ...opts });
    // lobby: local roll
    const m = formula.match(/^1d20([+-]\d+)?$/);
    const bonus = m && m[1] ? parseInt(m[1], 10) : 0;
    const d1 = 1 + Math.floor(Math.random() * 20);
    const d2 = 1 + Math.floor(Math.random() * 20);
    const mode2 = opts.mode || 'normal';
    const nat = mode2 === 'adv' ? Math.max(d1, d2) : mode2 === 'dis' ? Math.min(d1, d2) : d1;
    setLocalRoll({ label, total: nat + bonus, nat, formula, mode: mode2, both: mode2 !== 'normal' ? [d1, d2] : null });
    setTimeout(() => setLocalRoll(null), 3500);
  };

  const rollWithMode = async (formula, label) => {
    roll(formula, label, { mode: window.__rollMode || 'normal' });
  };

  const dying = sheet.currentHp === 0;

  return (
    <div className="sheet panel" onMouseDown={(e) => e.stopPropagation()}>
      {/* ---------- header ---------- */}
      <div className="sheet-head">
        <Avatar sheet={sheet} name={sheet.name} color={sheet.portrait?.color || 'var(--gold)'} size={56} />
        <div className="sheet-title">
          <div className="row">
            <input
              className="sheet-name"
              value={sheet.name || ''}
              disabled={readOnly}
              onChange={(e) => change({ name: e.target.value })}
            />
            <button
              className={`icon-btn insp-btn ${sheet.inspiration ? 'on' : ''}`}
              title="Inspiration: the DM awards it for great roleplay. Spend it for advantage on one roll."
              disabled={readOnly}
              onClick={() => change({ inspiration: !sheet.inspiration })}
            >
              <SparkleIcon size={15} />
            </button>
          </div>
          <div className="card-sub">
            Level {sheet.level} {sheet.raceName} {meta.name || sheet.className}{sheet.subclassName ? ` (${sheet.subclassName})` : ''} · {cap(sheet.background)} · {sheet.alignment}
            {' · '}XP {sheet.xp ?? 0}{sheet.level < 20 ? ` / ${XP_THRESHOLDS[sheet.level + 1]}` : ''}
          </div>
        </div>
        <div className="sheet-head-actions">
          {/* heroes made before subclasses were selectable, now past the level they'd pick one */}
          {!readOnly && !subclassOf(sheet) && meta.name && sheet.level >= subclassLevel(sheet.classIndex) && (
            <button className="small-btn" onClick={() => setShowSubclass(true)} title={`You've reached level ${subclassLevel(sheet.classIndex)}: pick your ${SUBCLASS_LABEL[sheet.classIndex].toLowerCase()}`}>
              Choose {SUBCLASS_LABEL[sheet.classIndex]}
            </button>
          )}
          {!readOnly && (
            <button className="small-btn primary-btn" onClick={() => setShowLevelUp(true)} title="Level up your hero">
              <ChevronUp size={12} /> Level {sheet.level + 1}
            </button>
          )}
          {onClose && <button className="close-btn" onClick={onClose}>×</button>}
        </div>
      </div>

      {/* ---------- vitals ---------- */}
      <div className="sheet-vitals">
        <div className={`vital hp-vital ${dying ? 'dying' : ''}`}>
          <span className="vital-label"><HeartIcon size={12} /> Hit points</span>
          <div className="row">
            <HpEditor sheet={sheet} readOnly={readOnly} onChange={change} />
          </div>
          <div className="hp-bar">
            {sheet.tempHp > 0 && <div className="hp-bar-temp" style={{ left: `${Math.min(100, (sheet.currentHp / (sheet.maxHp + sheet.tempHp)) * 100)}%`, width: `${(sheet.tempHp / (sheet.maxHp + sheet.tempHp)) * 100}%` }} />}
            <div className="hp-bar-fill" style={{ width: `${Math.min(100, (sheet.currentHp / Math.max(1, sheet.maxHp)) * 100)}%` }} />
          </div>
        </div>
        <VitalStat label="Armor class" icon={<ShieldIcon size={12} />} value={derived.ac} title="10 + DEX (or your armor). Attacks must roll this or higher to hit you." />
        <VitalStat label="Initiative" value={fmtMod(derived.initiative)} onClick={() => rollWithMode(`1d20${modStr(derived.initiative)}`, `${sheet.name} rolls initiative`)} title="Click to roll! Determines turn order in combat." />
        <VitalStat label="Speed" value={`${derived.speed} ft`} title={`You can move ${derived.speed} feet (${derived.speed / 5} squares) each turn.`} />
        <VitalStat label="Prof. bonus" value={fmtMod(derived.pb)} title="Added to everything you're proficient in - it grows with your level." />
        <VitalStat label="Passive Perception" value={derived.passivePerception} title="What you notice without trying. The DM checks this secretly." />
        <div className="vital">
          <span className="vital-label"><CampfireIcon size={12} /> Rest</span>
          <div className="row">
            <button className="small-btn" disabled={readOnly} title={`Spend hit dice (${sheet.hitDiceRemaining}/${sheet.level} d${derived.hitDie} left) to heal during a 1h break`} onClick={() => shortRest({ sheet, derived, change, dialog, onAnnounce })}>Short</button>
            <button className="small-btn" disabled={readOnly} title="8 hours of sleep: full HP, spell slots back, half your hit dice back" onClick={() => longRest({ sheet, change, dialog, onAnnounce })}>Long</button>
          </div>
        </div>
      </div>

      {dying && !readOnly && (
        <DeathSaves sheet={sheet} change={change} roll={roll} />
      )}

      {/* ---------- tabs ---------- */}
      <div className="tab-row sheet-tabs">
        <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>Abilities</button>
        <button className={tab === 'combat' ? 'active' : ''} onClick={() => setTab('combat')}>Combat</button>
        {sheet.spellcasting && <button className={tab === 'spells' ? 'active' : ''} onClick={() => setTab('spells')}>Spells</button>}
        <button className={tab === 'gear' ? 'active' : ''} onClick={() => setTab('gear')}>Gear</button>
        <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Story</button>
      </div>

      <div className="sheet-body">
        {tab === 'main' && (
          <div className="sheet-main-grid">
            <div>
              <h4>Ability scores <span className="muted small">(click to roll a check)</span></h4>
              <div className="ability-grid">
                {ABILITIES.map((a) => (
                  <button key={a} className="ability-tile" onClick={() => rollWithMode(`1d20${modStr(derived.mods[a])}`, `${sheet.name}: ${ABILITY_NAMES[a]} check`)}>
                    <span className="ability-tile-label">{a.toUpperCase()}</span>
                    <span className="ability-tile-mod">{fmtMod(derived.mods[a])}</span>
                    <span className="ability-tile-score">{derived.abilities[a]}</span>
                  </button>
                ))}
              </div>
              <h4 className="mt">Saving throws <span className="muted small">(click to roll)</span></h4>
              <div className="saves-grid">
                {ABILITIES.map((a) => (
                  <button key={a} className={`save-row ${derived.profSaves.includes(a) ? 'prof' : ''}`} onClick={() => rollWithMode(`1d20${modStr(derived.saves[a])}`, `${sheet.name}: ${ABILITY_NAMES[a]} save`)}>
                    <span className={`prof-pip ${derived.profSaves.includes(a) ? 'on' : ''}`} />
                    {ABILITY_NAMES[a]}
                    <span className="save-bonus">{fmtMod(derived.saves[a])}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4>Skills <span className="muted small">(click to roll)</span></h4>
              <div className="skills-list">
                {SKILLS.map((s) => {
                  const sk = derived.skills[s.index];
                  return (
                    <button key={s.index} className={`skill-row ${sk.prof ? 'prof' : ''}`} onClick={() => rollWithMode(`1d20${modStr(sk.bonus)}`, `${sheet.name}: ${s.name}`)}>
                      <span className={`prof-pip ${sk.prof ? 'on' : ''} ${sk.expertise ? 'exp' : ''}`} />
                      <span>{s.name}</span>
                      <span className="muted small">{s.ability.toUpperCase()}</span>
                      <span className="save-bonus">{fmtMod(sk.bonus)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'combat' && (
          <div>
            <h4>Attacks <span className="muted small">(click name for attack roll, damage for damage)</span></h4>
            <div className="attack-list">
              {derived.attacks.map((a, i) => (
                <div key={i} className="attack-row">
                  <button className="attack-name" onClick={() => rollWithMode(`1d20${modStr(a.bonus)}`, `${sheet.name} attacks with ${a.name}`)}>
                    {a.name} <span className="save-bonus">{fmtMod(a.bonus)}</span>
                  </button>
                  <button className="attack-dmg" onClick={() => roll(`${a.damage}${modStr(a.damageMod)}`, `${a.name} damage (${a.damageType})`)}>
                    {a.damage}{a.damageMod ? modStr(a.damageMod) : ''} {a.damageType}
                  </button>
                  {a.range && <span className="chip">{a.range} ft</span>}
                </div>
              ))}
              {!derived.attacks.length && <p className="muted">No weapons equipped - check the Gear tab.</p>}
            </div>

            <h4 className="mt">Conditions</h4>
            <div className="cond-grid">
              {CONDITIONS.map((c) => {
                const on = (sheet.conditions || []).includes(c.index);
                return (
                  <button
                    key={c.index}
                    className={`cond-chip ${on ? 'on' : ''}`}
                    title={c.brief}
                    disabled={readOnly}
                    onClick={() => change({ conditions: on ? sheet.conditions.filter((x) => x !== c.index) : [...(sheet.conditions || []), c.index] })}
                  >
                    <ConditionIcon index={c.index} size={13} /> {c.name}
                  </button>
                );
              })}
            </div>

            <h4 className="mt">Death saves <span className="muted small">(when you're at 0 HP)</span></h4>
            <DeathSaves sheet={sheet} change={change} roll={roll} compact readOnly={readOnly} />
          </div>
        )}

        {tab === 'spells' && sheet.spellcasting && (
          <SpellsTab
            sheet={sheet}
            derived={derived}
            meta={meta}
            readOnly={readOnly}
            change={change}
            roll={roll}
            onAnnounce={onAnnounce}
            openDetail={setSpellDetail}
            openPrepare={() => setShowPrepare(true)}
          />
        )}

        {tab === 'gear' && (
          <GearTab sheet={sheet} readOnly={readOnly} change={change} dialog={dialog} />
        )}

        {tab === 'story' && (
          <div>
            <h4>Features & traits</h4>
            <div className="feature-list">
              {(sheet.features || []).map((f, i) => (
                <details key={i} className="feature-item">
                  <summary><strong>{f.name}</strong> <span className="muted small">· {f.source}</span></summary>
                  <p>{f.desc}</p>
                </details>
              ))}
            </div>
            <h4 className="mt">Personality</h4>
            {['traits', 'ideals', 'bonds', 'flaws'].map((k) => (
              <div key={k}>
                <label className="field-label">{k}</label>
                <textarea
                  value={sheet.personality?.[k] || ''}
                  disabled={readOnly}
                  rows={1}
                  onChange={(e) => change({ personality: { ...sheet.personality, [k]: e.target.value } })}
                  style={{ width: '100%', minHeight: 38 }}
                />
              </div>
            ))}
            <label className="field-label">Backstory & notes</label>
            <textarea
              value={sheet.backstory || ''}
              disabled={readOnly}
              onChange={(e) => change({ backstory: e.target.value })}
              style={{ width: '100%' }}
              rows={4}
              placeholder="Where do you come from? What do you want?"
            />
            {sheet.size && (
              <>
                <label className="field-label">Size & senses</label>
                <p>{sheet.size}{sheet.darkvision ? ` · Darkvision ${sheet.darkvision} ft` : ''}</p>
              </>
            )}
            <label className="field-label">Languages</label>
            <p>{(sheet.languages || []).join(', ') || '—'}</p>
            <label className="field-label">Proficiencies</label>
            <p className="small">
              <strong>Armor:</strong> {(sheet.armorProfs || []).join(', ') || 'None'} · <strong>Weapons:</strong> {(sheet.weaponProfs || []).join(', ') || 'None'}
              {sheet.toolProfs?.length ? <> · <strong>Tools:</strong> {sheet.toolProfs.join(', ')}</> : null}
            </p>
          </div>
        )}
      </div>

      {localRoll && (
        <div className="sheet-roll-toast">
          <D20Icon size={16} />
          <span>{localRoll.label}:</span>
          <strong className={localRoll.nat === 20 ? 'crit' : localRoll.nat === 1 ? 'fumble' : ''}>{localRoll.total}</strong>
          <span className="muted small">
            (d20: {localRoll.both ? localRoll.both.join('/') : localRoll.nat}{localRoll.mode !== 'normal' ? ` ${localRoll.mode}` : ''})
          </span>
        </div>
      )}

      {spellDetail && <SpellDetailModal index={spellDetail} onClose={() => setSpellDetail(null)} sheet={sheet} derived={derived} roll={roll} change={change} readOnly={readOnly} onAnnounce={onAnnounce} />}
      {showLevelUp && <LevelUpModal sheet={sheet} derived={derived} meta={meta} onClose={() => setShowLevelUp(false)} change={change} dialog={dialog} onAnnounce={onAnnounce} />}
      {showPrepare && <PrepareModal sheet={sheet} derived={derived} meta={meta} onClose={() => setShowPrepare(false)} change={change} />}
      {showSubclass && <SubclassModal sheet={sheet} meta={meta} onClose={() => setShowSubclass(false)} change={change} onAnnounce={onAnnounce} />}
    </div>
  );
}

// ---------- pieces ----------

function VitalStat({ label, value, icon, onClick, title }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp className={`vital ${onClick ? 'clickable' : ''}`} onClick={onClick} title={title}>
      <span className="vital-label">{icon} {label}</span>
      <span className="vital-value">{value}</span>
    </Comp>
  );
}

function HpEditor({ sheet, readOnly, onChange }) {
  const [amt, setAmt] = useState('');
  const apply = (sign) => {
    const n = parseInt(amt, 10);
    if (!n) return;
    let { currentHp, tempHp = 0 } = sheet;
    if (sign < 0) {
      let dmg = n;
      const absorbed = Math.min(tempHp, dmg);
      tempHp -= absorbed;
      dmg -= absorbed;
      currentHp = Math.max(0, currentHp - dmg);
    } else {
      currentHp = Math.min(sheet.maxHp, currentHp + n);
    }
    onChange({ currentHp, tempHp });
    setAmt('');
  };
  return (
    <div className="hp-editor">
      <span className="hp-numbers">
        <strong className="hp-current">{sheet.currentHp}</strong>
        <span className="muted">/{sheet.maxHp}</span>
        {sheet.tempHp > 0 && <span className="chip" style={{ borderColor: 'var(--temp-hp)', color: '#9dc3e6' }}>+{sheet.tempHp} temp</span>}
      </span>
      {!readOnly && (
        <span className="row" style={{ gap: 4 }}>
          <input className="hp-amt" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} placeholder="#" />
          <button className="small-btn danger-btn" onClick={() => apply(-1)} title="Take damage">Dmg</button>
          <button className="small-btn" onClick={() => apply(1)} title="Heal">Heal</button>
        </span>
      )}
    </div>
  );
}

function DeathSaves({ sheet, change, roll, compact = false, readOnly = false }) {
  const ds = sheet.deathSaves || { s: 0, f: 0 };
  const pip = (kind, i) => {
    const count = ds[kind];
    const on = i < count;
    return (
      <button
        key={`${kind}${i}`}
        className={`ds-pip ${kind} ${on ? 'on' : ''}`}
        disabled={readOnly}
        onClick={() => change({ deathSaves: { ...ds, [kind]: on ? i : i + 1 } })}
      />
    );
  };
  return (
    <div className={`death-saves ${compact ? 'compact' : ''}`}>
      {!compact && <p className="ds-title"><SkullIcon size={15} /> <strong>You are dying.</strong> At the start of each of your turns, roll a death save (plain d20): 10+ is a success. Three successes = stable. Three failures = death. A 20 wakes you with 1 HP!</p>}
      <div className="row wrap">
        <button className="small-btn" onClick={() => roll('1d20', `${sheet.name}: DEATH SAVE (10+ succeeds)`)}>
          <D20Icon size={13} /> Roll death save
        </button>
        <span className="row" style={{ gap: 4 }}>
          <span className="small muted">Successes</span>
          {[0, 1, 2].map((i) => pip('s', i))}
        </span>
        <span className="row" style={{ gap: 4 }}>
          <span className="small muted">Failures</span>
          {[0, 1, 2].map((i) => pip('f', i))}
        </span>
        {ds.s >= 3 && <span className="chip gold">Stable!</span>}
        {ds.f >= 3 && <span className="chip ember">Dead...</span>}
      </div>
    </div>
  );
}

function SpellsTab({ sheet, derived, meta, readOnly, change, roll, onAnnounce, openDetail, openPrepare }) {
  const sc = sheet.spellcasting;
  const slots = derived.spell?.maxSlots || {};
  const used = sc.slotsUsed || {};

  const toggleSlot = (lvl, i) => {
    if (readOnly) return;
    const u = used[lvl] || 0;
    const next = i < u ? i : i + 1;
    change({ spellcasting: { ...sc, slotsUsed: { ...used, [lvl]: next } } });
  };

  const list = meta.preparedKind === 'prepared' ? sc.prepared : sc.known.length ? sc.known : sc.prepared;
  const preparedSet = new Set(sc.prepared || []);

  return (
    <div>
      <div className="row wrap mb">
        <span className="chip gold">Save DC {derived.spell.dc}</span>
        <span className="chip gold">Spell attack {fmtMod(derived.spell.attackBonus)}</span>
        <span className="chip">{ABILITY_NAMES[sc.ability]} caster</span>
        {meta.preparedKind !== 'known' && !readOnly && (
          <button className="small-btn" onClick={openPrepare}><BookIcon size={12} /> Change prepared</button>
        )}
      </div>

      {Object.keys(slots).length > 0 && (
        <div className="slots-row">
          {Object.entries(slots).map(([lvl, n]) => {
            if (lvl === 'pact') {
              return (
                <div key="pact" className="slot-group">
                  <span className="vital-label">Pact slots (lvl {n.level})</span>
                  <div className="row" style={{ gap: 4 }}>
                    {Array.from({ length: n.slots }).map((_, i) => (
                      <button key={i} className={`slot-pip ${i < (used.pact || 0) ? 'used' : ''}`} onClick={() => toggleSlot('pact', i)} title="Click to spend/restore" />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={lvl} className="slot-group">
                <span className="vital-label">Level {lvl} slots</span>
                <div className="row" style={{ gap: 4 }}>
                  {Array.from({ length: n }).map((_, i) => (
                    <button key={i} className={`slot-pip ${i < (used[lvl] || 0) ? 'used' : ''}`} onClick={() => toggleSlot(lvl, i)} title="Click to spend/restore" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h4 className="mt">Cantrips <span className="muted small">(at will - never run out)</span></h4>
      <div className="spell-rows">
        {(sc.cantrips || []).map((s) => (
          <button key={s} className="spell-row" onClick={() => openDetail(s)}>{nameFromIndex(s)}</button>
        ))}
      </div>

      <h4 className="mt">
        {meta.preparedKind === 'prepared' ? 'Prepared spells' : meta.preparedKind === 'spellbook' ? 'Spellbook' : 'Spells known'}
        {derived.spell.preparedMax && meta.preparedKind !== 'known' && <span className="muted small"> (prepare up to {derived.spell.preparedMax})</span>}
      </h4>
      <div className="spell-rows">
        {(list || []).map((s) => (
          <button key={s} className={`spell-row ${meta.preparedKind === 'spellbook' && !preparedSet.has(s) ? 'unprepared' : ''}`} onClick={() => openDetail(s)}>
            {nameFromIndex(s)}
            {meta.preparedKind === 'spellbook' && (preparedSet.has(s) ? <span className="chip gold">prepared</span> : <span className="chip">in book</span>)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpellDetailModal({ index, onClose, sheet, derived, roll, change, readOnly, onAnnounce }) {
  const [spell, setSpell] = useState(null);
  useEffect(() => {
    srd.spell(index).then((s) => s && !s.error && setSpell(s));
  }, [index]);

  const sc = sheet.spellcasting;
  const cast = (slotLvl) => {
    if (spell.level > 0 && slotLvl) {
      const used = sc.slotsUsed || {};
      const key = derived.spell.maxSlots.pact ? 'pact' : slotLvl;
      change({ spellcasting: { ...sc, slotsUsed: { ...used, [key]: (used[key] || 0) + 1 } } });
    }
    if (onAnnounce) onAnnounce(`${sheet.name} casts ${spell.name}${slotLvl && spell.level > 0 ? ` (level ${slotLvl})` : ''}!`);
    // roll damage/healing if the spell defines dice
    const diceExpr = spellDice(spell, slotLvl || spell.level, sheet.level);
    if (diceExpr) roll(diceExpr, `${spell.name} ${spell.attack_type ? 'damage' : spell.heal_at_slot_level ? 'healing' : 'effect'}`);
    if (spell.attack_type) roll(`1d20${modStr(derived.spell.attackBonus)}`, `${spell.name} spell attack`);
    onClose();
  };

  const availableSlots = [];
  if (spell && spell.level > 0 && derived.spell) {
    const slots = derived.spell.maxSlots;
    const used = sc.slotsUsed || {};
    if (slots.pact) {
      if ((used.pact || 0) < slots.pact.slots && slots.pact.level >= spell.level) availableSlots.push(slots.pact.level);
    } else {
      for (const [lvl, n] of Object.entries(slots)) {
        if (parseInt(lvl, 10) >= spell.level && (used[lvl] || 0) < n) availableSlots.push(parseInt(lvl, 10));
      }
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <h3>{spell ? spell.name : '...'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {spell && (
          <>
            <div className="modal-body">
              <p className="muted small">
                {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} {spell.school?.name} · {spell.casting_time} · Range {spell.range}
                {spell.concentration ? ' · Concentration' : ''}{spell.ritual ? ' · Ritual' : ''} · Components {(spell.components || []).join(', ')}
              </p>
              {(spell.desc || []).map((d, i) => <p key={i} className="small">{d}</p>)}
              {(spell.higher_level || []).map((d, i) => <p key={i} className="small muted"><em>At higher levels:</em> {d}</p>)}
            </div>
            {!readOnly && (
              <div className="modal-actions">
                {spell.level === 0 && <button className="primary-btn" onClick={() => cast(null)}>Cast cantrip</button>}
                {availableSlots.slice(0, 4).map((lvl) => (
                  <button key={lvl} className="primary-btn" onClick={() => cast(lvl)}>Cast (slot lvl {lvl})</button>
                ))}
                {spell.level > 0 && !availableSlots.length && <span className="muted small">No slots left - take a long rest.</span>}
              </div>
            )}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function GearTab({ sheet, readOnly, change, dialog }) {
  const equipment = sheet.equipment || [];
  const coins = sheet.coins || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  const setItem = (i, patch) => {
    const next = equipment.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    // only one armor + one shield equipped at a time
    if (patch.equipped && (equipment[i].kind === 'armor' || equipment[i].kind === 'shield')) {
      for (let j = 0; j < next.length; j++) {
        if (j !== i && next[j].kind === equipment[i].kind) next[j] = { ...next[j], equipped: false };
      }
    }
    change({ equipment: next });
  };

  const addItem = async () => {
    const name = await dialog.prompt('Item name?', '', 'Add item');
    if (!name) return;
    change({ equipment: [...equipment, { name, qty: 1, kind: 'gear' }] });
  };

  return (
    <div>
      <div className="row wrap mb">
        {Object.entries(coins).map(([c, v]) => (
          <label key={c} className="coin-box">
            <span>{c.toUpperCase()}</span>
            <input value={v} disabled={readOnly} onChange={(e) => change({ coins: { ...coins, [c]: parseInt(e.target.value, 10) || 0 } })} />
          </label>
        ))}
      </div>
      <div className="gear-list">
        {equipment.map((e, i) => (
          <div key={i} className="gear-row">
            {(e.kind === 'weapon' || e.kind === 'armor' || e.kind === 'shield') && (
              <input
                type="checkbox"
                checked={e.equipped !== false && e.equipped !== undefined ? !!e.equipped : false}
                disabled={readOnly}
                title="Equipped"
                onChange={(ev) => setItem(i, { equipped: ev.target.checked })}
              />
            )}
            <span className="grow">
              {e.name} {e.qty > 1 && <span className="muted">×{e.qty}</span>}
              {e.kind === 'weapon' && e.stats && <span className="muted small"> · {e.stats.damage} {e.stats.damageType}</span>}
              {e.kind === 'armor' && e.stats && <span className="muted small"> · AC {e.stats.acBase} {e.stats.category}</span>}
              {e.kind === 'shield' && <span className="muted small"> · +2 AC</span>}
            </span>
            {!readOnly && <button className="small-btn ghost-btn" onClick={() => change({ equipment: equipment.filter((_, idx) => idx !== i) })} aria-label={`Remove ${e.name || 'item'}`}><XIcon size={12} /></button>}
          </div>
        ))}
      </div>
      {!readOnly && <button className="small-btn mt" onClick={addItem}><PlusIcon size={12} /> Add item</button>}
    </div>
  );
}

function LevelUpModal({ sheet, derived, meta, onClose, change, dialog, onAnnounce }) {
  const newLevel = sheet.level + 1;
  const [features, setFeatures] = useState(null);
  const [hpMode, setHpMode] = useState('fixed');
  const [hpRoll, setHpRoll] = useState(null);
  const [asi, setAsi] = useState({});
  const isAsiLevel = [4, 8, 12, 16, 19].includes(newLevel) || (sheet.classIndex === 'fighter' && [6, 14].includes(newLevel)) || (sheet.classIndex === 'rogue' && newLevel === 10);

  // subclass: picked here the first time the class reaches its subclass level
  const scLevel = subclassLevel(sheet.classIndex);
  const currentSub = subclassOf(sheet);
  const needsPick = !currentSub && newLevel >= scLevel;
  const [picked, setPicked] = useState(null);
  const subDetail = useSubclass(currentSub || picked?.index || null);
  // a late pick (hero made before subclasses were selectable) brings everything it would have granted
  const subFeatures = subclassFeaturesBetween(subDetail, currentSub ? newLevel : scLevel, newLevel);

  useEffect(() => {
    srd.classLevels(sheet.classIndex).then((levels) => {
      if (Array.isArray(levels)) {
        const entry = levels.find((l) => l.level === newLevel);
        setFeatures(entry ? entry.features : []);
      }
    });
  }, [sheet.classIndex, newLevel]);

  if (newLevel > 20) return null;
  const hpGain = levelUpHp(sheet, hpMode === 'roll' && hpRoll ? hpRoll : null, sheet.abilities.con + (asi.con || 0));
  const asiSpent = Object.values(asi).reduce((a, b) => a + b, 0);
  const subLoading = (currentSub || picked) && !subDetail;

  const apply = () => {
    const newAbilities = { ...sheet.abilities };
    for (const [a, v] of Object.entries(asi)) newAbilities[a] = Math.min(20, newAbilities[a] + v);
    const newFeatures = [...(sheet.features || [])];
    for (const f of features || []) {
      newFeatures.push({ name: f.name, source: `${meta.name} ${newLevel}`, desc: (f.desc || []).join(' ').slice(0, 1500) });
    }
    if (needsPick && subDetail) newFeatures.push({ name: `${SUBCLASS_LABEL[sheet.classIndex]}: ${subDetail.name}`, source: `${meta.name} ${newLevel}`, desc: subDetail.desc });
    newFeatures.push(...subFeatures);
    const sc = sheet.spellcasting
      ? { ...sheet.spellcasting, slotsUsed: {} }
      : null;
    change({
      level: newLevel,
      abilities: newAbilities,
      maxHp: sheet.maxHp + hpGain,
      currentHp: sheet.currentHp + hpGain,
      hitDiceRemaining: (sheet.hitDiceRemaining || 0) + 1,
      features: newFeatures,
      spellcasting: sc,
      ...(subDetail ? { subclass: subDetail.index, subclassName: subDetail.name } : {}),
    });
    if (onAnnounce) onAnnounce(needsPick && subDetail ? `${sheet.name} reaches level ${newLevel} and follows the ${subDetail.name}!` : `${sheet.name} reaches level ${newLevel}!`);
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={needsPick ? { maxWidth: 820 } : undefined}>
        <div className="modal-header">
          <h3>Level up! {sheet.level} to {newLevel}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <h4>Hit points</h4>
          <div className="row wrap">
            <button className={`small-btn ${hpMode === 'fixed' ? 'primary-btn' : ''}`} onClick={() => setHpMode('fixed')}>
              Take average ({AVG_HIT_DIE[meta.hitDie || 8]})
            </button>
            <button
              className={`small-btn ${hpMode === 'roll' ? 'primary-btn' : ''}`}
              onClick={() => {
                setHpMode('roll');
                setHpRoll(1 + Math.floor(Math.random() * (meta.hitDie || 8)));
              }}
            >
              Roll d{meta.hitDie} {hpMode === 'roll' && hpRoll ? `= ${hpRoll}` : ''}
            </button>
            <span className="chip gold">+{hpGain} HP total</span>
          </div>

          {isAsiLevel && (
            <>
              <h4 className="mt">Ability score improvement - spend 2 points ({asiSpent}/2)</h4>
              <div className="row wrap">
                {ABILITIES.map((a) => (
                  <button
                    key={a}
                    className={`small-btn ${asi[a] ? 'primary-btn' : ''}`}
                    disabled={(asiSpent >= 2 && !asi[a]) || sheet.abilities[a] + (asi[a] || 0) >= 20}
                    onClick={() => setAsi((prev) => ({ ...prev, [a]: ((prev[a] || 0) + 1) % 3 }))}
                  >
                    {a.toUpperCase()} {asi[a] ? `+${asi[a]}` : ''}
                  </button>
                ))}
              </div>
              <p className="muted small">Click once for +1, twice for +2, three times to clear. Max score 20.</p>
            </>
          )}

          {needsPick && (
            <>
              <h4 className="mt">Choose your {SUBCLASS_LABEL[sheet.classIndex].toLowerCase()}</h4>
              <p className="muted small">Your speciality within the class - it grants features now and at later levels.</p>
              <SubclassPicker classIndex={sheet.classIndex} value={picked?.index} onChange={setPicked} />
            </>
          )}

          <h4 className="mt">New at level {newLevel}</h4>
          {features === null ? (
            <p className="muted">Loading...</p>
          ) : features.length || subFeatures.length ? (
            <>
              {features.map((f) => (
                <details key={f.index} className="feature-item">
                  <summary><strong>{f.name}</strong></summary>
                  <p className="small">{(f.desc || []).join(' ')}</p>
                </details>
              ))}
              {subFeatures.map((f) => (
                <details key={`${f.source}-${f.name}`} className="feature-item">
                  <summary><strong>{f.name}</strong> <span className="muted small">· {f.source}</span></summary>
                  <p className="small">{f.desc}</p>
                </details>
              ))}
            </>
          ) : (
            <p className="muted">{needsPick && !subDetail ? 'Pick an option above to see its features.' : 'No new class features this level - but your numbers improve.'}</p>
          )}
          {sheet.spellcasting && <p className="muted small mt">Spell slots refresh and increase per your class table. Casters may also swap/learn spells - manage them on the Spells tab.</p>}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={apply} disabled={(isAsiLevel && asiSpent !== 2) || (needsPick && !subDetail) || subLoading}>Confirm level {newLevel}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// For a hero already past their subclass level without one (made before
// subclasses were selectable): pick now and receive everything up to today.
function SubclassModal({ sheet, meta, onClose, change, onAnnounce }) {
  const [picked, setPicked] = useState(null);
  const detail = useSubclass(picked?.index || null);
  const from = subclassLevel(sheet.classIndex);
  const gained = subclassFeaturesBetween(detail, from, sheet.level);

  const apply = () => {
    change({
      subclass: detail.index,
      subclassName: detail.name,
      features: [
        ...(sheet.features || []),
        { name: `${SUBCLASS_LABEL[sheet.classIndex]}: ${detail.name}`, source: `${meta.name} ${from}`, desc: detail.desc },
        ...gained,
      ],
    });
    if (onAnnounce) onAnnounce(`${sheet.name} follows the ${detail.name}.`);
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h3>Choose your {SUBCLASS_LABEL[sheet.classIndex].toLowerCase()}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="muted small">{meta.name}s pick this at level {from}. You'll get every feature it grants up to level {sheet.level}.</p>
          <SubclassPicker classIndex={sheet.classIndex} value={picked?.index} onChange={setPicked} />
          {gained.length > 0 && (
            <>
              <h4 className="mt">You gain</h4>
              {gained.map((f) => (
                <details key={`${f.source}-${f.name}`} className="feature-item">
                  <summary><strong>{f.name}</strong> <span className="muted small">· {f.source}</span></summary>
                  <p className="small">{f.desc}</p>
                </details>
              ))}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={apply} disabled={!detail}>Confirm</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PrepareModal({ sheet, derived, meta, onClose, change }) {
  const [available, setAvailable] = useState([]);
  const sc = sheet.spellcasting;
  const maxPrepared = derived.spell.preparedMax || 1;
  const [picked, setPicked] = useState(sc.prepared || []);

  useEffect(() => {
    const maxLvl = Math.max(1, ...Object.keys(derived.spell.maxSlots).filter((k) => k !== 'pact').map(Number));
    if (meta.preparedKind === 'spellbook') {
      Promise.all((sc.known || []).map((i) => srd.spell(i))).then((spells) => setAvailable(spells.filter((s) => s && !s.error)));
    } else {
      srd.spells(`?class=${sheet.classIndex}`).then((all) => {
        if (Array.isArray(all)) setAvailable(all.filter((s) => s.level > 0 && s.level <= maxLvl));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3>Prepare spells ({picked.length}/{maxPrepared})</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="muted small">After a long rest you can change which spells you have ready. Pick up to {maxPrepared}.</p>
          <div className="spell-pick-list">
            {available.map((s) => {
              const on = picked.includes(s.index);
              return (
                <button key={s.index} className={`spell-pick ${on ? 'on' : ''}`} onClick={() => {
                  if (on) setPicked(picked.filter((x) => x !== s.index));
                  else if (picked.length < maxPrepared) setPicked([...picked, s.index]);
                }}>
                  <span className="spell-pick-name">{s.name}</span>
                  <span className="muted small">Level {s.level}{s.concentration ? ' · conc.' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={() => { change({ spellcasting: { ...sc, prepared: picked } }); onClose(); }}>Save</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ---------- rest logic ----------

async function shortRest({ sheet, derived, change, dialog, onAnnounce }) {
  const available = sheet.hitDiceRemaining || 0;
  if (!available) {
    dialog.alert('No hit dice left - take a long rest to recover them.', 'Short rest');
    return;
  }
  const answer = await dialog.prompt(`Spend how many hit dice? (d${derived.hitDie} + ${fmtMod(mod(sheet.abilities.con))} each, ${available} available)`, '1', 'Short rest');
  const n = Math.min(available, Math.max(0, parseInt(answer, 10) || 0));
  if (!n) return;
  let healed = 0;
  for (let i = 0; i < n; i++) healed += Math.max(1, 1 + Math.floor(Math.random() * derived.hitDie) + mod(sheet.abilities.con));
  change({
    currentHp: Math.min(sheet.maxHp, sheet.currentHp + healed),
    hitDiceRemaining: available - n,
  });
  if (onAnnounce) onAnnounce(`⏳ ${sheet.name} takes a short rest: spends ${n} hit ${n === 1 ? 'die' : 'dice'}, heals ${healed} HP.`);
}

async function longRest({ sheet, change, dialog, onAnnounce }) {
  const ok = await dialog.confirm('Take a long rest? (8 hours: full HP, spell slots restored, half your hit dice back, conditions cleared)', 'Long rest');
  if (!ok) return;
  const regained = Math.max(1, Math.floor(sheet.level / 2));
  change({
    currentHp: sheet.maxHp,
    tempHp: 0,
    hitDiceRemaining: Math.min(sheet.level, (sheet.hitDiceRemaining || 0) + regained),
    deathSaves: { s: 0, f: 0 },
    conditions: [],
    exhaustion: Math.max(0, (sheet.exhaustion || 0) - 1),
    spellcasting: sheet.spellcasting ? { ...sheet.spellcasting, slotsUsed: {} } : null,
  });
  if (onAnnounce) onAnnounce(`${sheet.name} completes a long rest - fully refreshed.`);
}

// ---------- helpers ----------
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const modStr = (m) => (m >= 0 ? `+${m}` : `${m}`);
const nameFromIndex = (i) => (i || '').split('-').map(cap).join(' ');

function spellDice(spell, slotLvl, charLevel) {
  if (spell.damage) {
    if (spell.damage.damage_at_slot_level) {
      const keys = Object.keys(spell.damage.damage_at_slot_level).map(Number).sort((a, b) => a - b);
      let best = null;
      for (const k of keys) if (k <= slotLvl) best = k;
      if (best !== null) return spell.damage.damage_at_slot_level[best].replace(/\s/g, '');
    }
    if (spell.damage.damage_at_character_level) {
      const keys = Object.keys(spell.damage.damage_at_character_level).map(Number).sort((a, b) => a - b);
      let best = keys[0];
      for (const k of keys) if (k <= charLevel) best = k;
      return spell.damage.damage_at_character_level[best].replace(/\s/g, '');
    }
  }
  if (spell.heal_at_slot_level) {
    const keys = Object.keys(spell.heal_at_slot_level).map(Number).sort((a, b) => a - b);
    let best = null;
    for (const k of keys) if (k <= slotLvl) best = k;
    if (best !== null) return spell.heal_at_slot_level[best].replace(/\s/g, '').replace('+MOD', '');
  }
  return null;
}
