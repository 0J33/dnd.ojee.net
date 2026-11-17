import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { characters as charsApi, srd } from '../api';
import { useDialog, ModalOverlay } from '../utils';
import {
  ABILITIES, ABILITY_NAMES, SKILLS, CONDITIONS, mod, fmtMod, proficiencyBonus,
  deriveSheet, CLASS_META, AVG_HIT_DIE, XP_THRESHOLDS, xpToLevel, maxSpellSlots, preparedCount, describeRoll,
  subclassOf, subclassLevel, SUBCLASS_LABEL, levelUpHp, castingFor, newSubclassSpellcasting, subclassSpellLimits,
} from '../rules/engine';
import { SubclassPicker, useSubclass, subclassFeaturesBetween } from './ContentChoices';
import { Avatar, resolveLook } from './Portrait';
import { HEAL_SPELLS, heroFeatures, usesAfterRest } from '../rules/abilities';
import PortraitEditor, { FigureStage } from './PortraitEditor';
import { HeartIcon, ShieldIcon, D20Icon, CampfireIcon, SparkleIcon, SkullIcon, PlusIcon, BookIcon, ChevronUp, XIcon, ConditionIcon, InfoIcon, PotionIcon } from './Icons';
import { ItemMaker } from './Items';
import { itemSummary } from '../rules/items';
import { socket } from '../socket';
import { FeatureItem, InfoTip, SpellFacts, SpellPickRow, PropertyChips, useSpellIndex, useExplainMode, spellLine, summarize } from './Explain';
import { ABILITY_DETAILS, SKILL_BRIEFS, VITALS, ACTIONS, TURN_PARTS, ARMOR_CATEGORIES } from '../rules/glossary';
import { SaveStatus, registerFlush, trackSave } from '../autosave';
import { restoreUi, useUiContext } from '../uiContext';

// The interactive 5e character sheet.
// mode "lobby": standalone editor, saves via REST, rolls locally.
// mode "game": controlled by GameBoard - onSheetChange + onRoll go through the socket.
// Every change saves itself, either way. In the lobby a change is written a
// moment after the last one (and at once on close or before an update's
// reload); until the server has it, the sheet is also kept in localStorage
// (dnd.heroDraft.<id>) with the server copy it was made against (`updatedAt`),
// and opening the hero again brings it back if the server copy is still that one.
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
  castTargets = null, // in a game: creatures a damaging spell can be cast at ({ id, label })
  onCastAt = null, // ({ spellIndex, slot, targetId, heal }) -> the same targeted cast as the map's attack menu
  leveling = 'xp', // the table's rule: 'xp' (SRD thresholds) or 'milestone' (the DM grants a level); the DM may always
  canAlwaysLevel = false,
  updatedAt = null, // lobby: when the server last wrote this hero
  dmNote = null, // in a game, for the DM: their private note on this hero (QuickDm DmNote)
}) {
  const dialog = useDialog();
  const heroKey = mode === 'lobby' && characterId && !readOnly ? `dnd.heroDraft.${characterId}` : null;
  const savedAt = useRef(updatedAt);
  const unsent = useRef(null); // lobby: the sheet waiting to be written
  const [localSheet, setLocalSheet] = useState(() => {
    try {
      const d = heroKey && JSON.parse(localStorage.getItem(heroKey) || 'null');
      if (d && d.sheet && d.base === (updatedAt || null)) { unsent.current = d.sheet; return d.sheet; } // the page went before it was written
      if (d) localStorage.removeItem(heroKey);
    } catch {}
    return initialSheet;
  });
  const [tab, setTab] = useState(() => restoreUi('sheet')?.[characterId] || 'main');
  useUiContext('sheet', () => ({ [characterId]: tab }));
  const [spellDetail, setSpellDetail] = useState(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showPrepare, setShowPrepare] = useState(false);
  const [showSubclass, setShowSubclass] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [showPortrait, setShowPortrait] = useState(false);
  const [localRoll, setLocalRoll] = useState(null);
  const [explain, setExplain] = useExplainMode();
  const saveTimer = useRef(null);
  // The lobby's write: the newest sheet, once; the draft goes when nothing newer is waiting.
  const flushLobby = useRef(null);
  const waiting = useRef(null); // ends the "Saving…" a change starts (autosave.jsx trackSave)
  flushLobby.current = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (waiting.current) { waiting.current(); waiting.current = null; }
    const next = unsent.current;
    if (!next) return;
    unsent.current = null;
    trackSave(charsApi.update(characterId, { name: next.name, sheet: next }).then((res) => {
      if (!res || res.error) {
        if (!unsent.current) unsent.current = next; // try again with the next change or on close
        return;
      }
      savedAt.current = res.updatedAt || savedAt.current;
      try {
        if (unsent.current) localStorage.setItem(heroKey, JSON.stringify({ sheet: unsent.current, base: savedAt.current, t: Date.now() }));
        else localStorage.removeItem(heroKey);
      } catch {}
    }));
  };
  useEffect(() => {
    if (!heroKey) return undefined;
    if (unsent.current) { // a draft brought back
      trackSave(new Promise((done) => { waiting.current = done; }));
      saveTimer.current = setTimeout(() => flushLobby.current(), 600);
    }
    const off = registerFlush(() => flushLobby.current());
    return () => { off(); flushLobby.current(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheet = mode === 'game' && liveSheet ? liveSheet : localSheet;
  const derived = useMemo(() => deriveSheet(sheet), [sheet]);
  const meta = CLASS_META[sheet.classIndex] || {};

  // ---- change plumbing ----
  const change = (patch) => {
    if (readOnly) return;
    const next = { ...sheet, ...patch };
    setLocalSheet(next);
    if (onSheetChange) onSheetChange(next);
    if (heroKey) {
      unsent.current = next;
      if (!waiting.current) trackSave(new Promise((done) => { waiting.current = done; }));
      try { localStorage.setItem(heroKey, JSON.stringify({ sheet: next, base: savedAt.current || null, t: Date.now() })); } catch {}
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushLobby.current(), 600);
    }
  };

  // Heroes who took a spellcasting subclass (Eldritch Trickster...) before the
  // sheet knew those cast: give them the spellcasting block they're owed.
  useEffect(() => {
    if (readOnly || sheet.spellcasting || !castingFor(sheet)) return;
    change({ spellcasting: newSubclassSpellcasting(subclassOf(sheet)) });
  }, [sheet.subclass, sheet.level]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {readOnly ? (
          <Avatar sheet={sheet} name={sheet.name} color={sheet.portrait?.color || 'var(--gold)'} size={56} />
        ) : (
          <button type="button" className="sheet-portrait-btn" onClick={() => setShowPortrait(true)} title="Change your look">
            <Avatar sheet={sheet} name={sheet.name} color={sheet.portrait?.color || 'var(--gold)'} size={56} title="Change your look" />
          </button>
        )}
        {/* the figure that walks the map, turnable */}
        <Suspense fallback={<div className="figure-stage sheet-figure" />}>
          <FigureStage sheet={sheet} height={84} className="sheet-figure" />
        </Suspense>
        <div className="sheet-title">
          <div className="row">
            <input
              className="sheet-name"
              value={sheet.name || ''}
              disabled={readOnly}
              onChange={(e) => {
                // the look was drawn from the old name: keep it when the name changes
                const look = sheet.portrait?.look || {};
                change(look.seed ? { name: e.target.value } : { name: e.target.value, portrait: { ...(sheet.portrait || {}), look: { ...look, seed: resolveLook(sheet).seed } } });
              }}
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
          {(sheet.raging || sheet.bardicDie || heroFeatures(sheet).length > 0) && (
            <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
              {sheet.raging && <span className="chip gold" title="Raging: extra melee damage, half damage from blows, stabs and cuts. Ends with the fight.">Raging</span>}
              {sheet.bardicDie && <span className="chip gold" title="Added to your next attack that would miss">Inspired: d{sheet.bardicDie}</span>}
              {heroFeatures(sheet).map((f) => (
                <span key={f.key} className="chip" title={f.info(sheet).join(' ')}>{f.name}: {f.left === Infinity ? 'unlimited' : f.pool ? `${f.left} HP` : `${f.left}/${f.max}`}</span>
              ))}
            </div>
          )}
        </div>
        <div className="sheet-head-actions">
          {/* heroes made before subclasses were selectable, now past the level they'd pick one */}
          {!readOnly && !subclassOf(sheet) && meta.name && sheet.level >= subclassLevel(sheet.classIndex) && (
            <button className="small-btn" onClick={() => setShowSubclass(true)} title={`You've reached level ${subclassLevel(sheet.classIndex)}: pick your ${SUBCLASS_LABEL[sheet.classIndex].toLowerCase()}`}>
              Choose {SUBCLASS_LABEL[sheet.classIndex]}
            </button>
          )}
          {!readOnly && sheet.level < 20 && (() => {
            // a level comes with its XP (in an XP game) or when the DM grants one
            const ready = canAlwaysLevel || (sheet.levelGrant || 0) > sheet.level || (leveling !== 'milestone' && xpToLevel(sheet.xp) > sheet.level);
            const why = leveling === 'milestone' ? 'Your DM decides when you level up' : `Level ${sheet.level + 1} at ${XP_THRESHOLDS[sheet.level + 1]} XP (you have ${sheet.xp ?? 0})`;
            return (
              <button className="small-btn primary-btn" disabled={!ready} onClick={() => setShowLevelUp(true)} title={ready ? 'Level up your hero' : why}>
                <ChevronUp size={12} /> Level {sheet.level + 1}
              </button>
            );
          })()}
          {!readOnly && <SaveStatus className="sheet-save" />}
          {onClose && <button className="close-btn" onClick={onClose} aria-label="Close the character sheet"><XIcon size={16} /></button>}
        </div>
      </div>

      {dmNote && <div className="sheet-dm-note">{dmNote}</div>}

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
          {explain && <span className="vital-note">How much harm you can take. At 0 you fall and roll death saves.</span>}
        </div>
        <VitalStat label="Armor class" icon={<ShieldIcon size={12} />} value={derived.ac} title={VITALS.ac} note={explain && 'Foes must roll this to hit you.'} />
        <VitalStat label="Initiative" value={fmtMod(derived.initiative)} onClick={() => rollWithMode(`1d20${modStr(derived.initiative)}`, `${sheet.name} rolls initiative`)} title={`Click to roll! ${VITALS.initiative}`} note={explain && 'Tap to roll for turn order.'} />
        <VitalStat label="Speed" value={`${derived.speed} ft`} title={`You can move ${derived.speed} feet (${derived.speed / 5} squares) each turn.`} note={explain && `${derived.speed / 5} squares a turn.`} />
        <VitalStat label="Prof. bonus" value={fmtMod(derived.pb)} title={VITALS.pb} note={explain && 'Added to what you are trained in.'} />
        <VitalStat label="Passive Perception" value={derived.passivePerception} title={VITALS.passive} note={explain && 'What you notice without trying.'} />
        <div className="vital">
          <span className="vital-label"><CampfireIcon size={12} /> Rest</span>
          <div className="row">
            <button className="small-btn" disabled={readOnly} title={`Spend hit dice (${sheet.hitDiceRemaining}/${sheet.level} d${derived.hitDie} left) to heal during a 1h break`} onClick={() => shortRest({ sheet, derived, change, dialog, onAnnounce })}>Short</button>
            <button className="small-btn" disabled={readOnly} title="8 hours of sleep: full HP, spell slots back, half your hit dice back" onClick={() => longRest({ sheet, change, dialog, onAnnounce })}>Long</button>
          </div>
          {explain && <span className="vital-note">Short (1h): heal with hit dice. Long (8h): back to full.</span>}
        </div>
      </div>

      {explain && (
        // phones: one note to open instead of a line under every number
        <details className="vitals-explain">
          <summary>What these numbers mean</summary>
          <dl>
            <dt>Hit points</dt><dd>{VITALS.hp}</dd>
            <dt>Armor class</dt><dd>{VITALS.ac}</dd>
            <dt>Initiative</dt><dd>{VITALS.initiative} Tap it to roll.</dd>
            <dt>Speed</dt><dd>{VITALS.speed}</dd>
            <dt>Prof. bonus</dt><dd>{VITALS.pb}</dd>
            <dt>Passive Perception</dt><dd>{VITALS.passive}</dd>
            <dt>Rest</dt><dd>Short rest (1 hour): spend hit dice to heal. Long rest (8 hours): full HP, spell slots and half your hit dice back.</dd>
          </dl>
        </details>
      )}

      {dying && !readOnly && (
        <DeathSaves sheet={sheet} change={change} roll={roll} />
      )}

      {/* ---------- tabs ---------- */}
      <div className="tab-row sheet-tabs">
        <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>Abilities</button>
        <button className={tab === 'combat' ? 'active' : ''} onClick={() => setTab('combat')}>Combat</button>
        {sheet.spellcasting && derived.spell && <button className={tab === 'spells' ? 'active' : ''} onClick={() => setTab('spells')}>Spells</button>}
        <button className={tab === 'gear' ? 'active' : ''} onClick={() => setTab('gear')}>Gear</button>
        <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Story</button>
        <button
          className={`explain-toggle ${explain ? 'on' : ''}`} aria-pressed={explain} onClick={() => setExplain(!explain)}
          title={explain ? 'Hide the explanations under each line' : 'Explain what each line means'}
        >
          <InfoIcon size={13} /> {explain ? 'Explaining' : 'Explain'}
        </button>
      </div>

      <div className="sheet-body">
        {tab === 'main' && (
          <div className="sheet-main-grid">
            <div>
              <h4>Ability scores <span className="muted small">(click to roll a check)</span></h4>
              <div className="ability-grid">
                {ABILITIES.map((a) => (
                  <button key={a} className="ability-tile" title={`${ABILITY_NAMES[a]}: ${ABILITY_DETAILS[a].uses}`} onClick={() => rollWithMode(`1d20${modStr(derived.mods[a])}`, `${sheet.name}: ${ABILITY_NAMES[a]} check`)}>
                    <span className="ability-tile-label">{a.toUpperCase()}</span>
                    <span className="ability-tile-mod">{fmtMod(derived.mods[a])}</span>
                    <span className="ability-tile-score">{derived.abilities[a]}</span>
                    {explain && <span className="row-brief">{ABILITY_DETAILS[a].brief.split('.')[0]}</span>}
                  </button>
                ))}
              </div>
              {explain && <p className="explain-note">The big number is the modifier you add to a d20; the small one is the score. Tap one to roll an ability check.</p>}
              <h4 className="mt">Saving throws <span className="muted small">(click to roll)</span></h4>
              {explain && <p className="explain-note">{VITALS.save}</p>}
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
              {explain && <p className="explain-note">{VITALS.skill}</p>}
              <div className="skills-list">
                {SKILLS.map((s) => {
                  const sk = derived.skills[s.index];
                  return (
                    <button key={s.index} className={`skill-row ${sk.prof ? 'prof' : ''} ${explain ? 'explained' : ''}`} title={SKILL_BRIEFS[s.index]} onClick={() => rollWithMode(`1d20${modStr(sk.bonus)}`, `${sheet.name}: ${s.name}`)}>
                      <span className={`prof-pip ${sk.prof ? 'on' : ''} ${sk.expertise ? 'exp' : ''}`} />
                      <span>{s.name}</span>
                      <span className="muted small">{s.ability.toUpperCase()}</span>
                      <span className="save-bonus">{fmtMod(sk.bonus)}</span>
                      {explain && <span className="row-brief">{SKILL_BRIEFS[s.index]}</span>}
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
            {explain && <p className="explain-note">On the map, tap a foe to attack it. Here you can roll by hand: the name rolls d20 + your bonus against the foe's AC, the red part rolls damage if you hit. A natural 20 is a critical hit: roll the damage dice twice.</p>}
            <div className="attack-list">
              {derived.attacks.map((a, i) => (
                <div key={i} className="attack-row">
                  <button className="attack-name" onClick={() => rollWithMode(`1d20${modStr(a.bonus)}`, `${sheet.name} attacks with ${a.name}`)}>
                    {a.name} <span className="save-bonus">{fmtMod(a.bonus)}</span>
                  </button>
                  <button className="attack-dmg" onClick={() => roll(`${a.damage}${modStr(a.damageMod)}`, `${a.name} damage (${a.damageType})`)}>
                    {a.damage}{a.damageMod ? modStr(a.damageMod) : ''} {a.damageType}
                  </button>
                  <PropertyChips properties={a.properties} range={a.range} />
                  {explain && (
                    <span className="attack-explain">
                      {a.range && !(a.properties || []).includes('thrown') ? 'Ranged' : 'Melee'}: d20 {fmtMod(a.bonus)} to hit ({ABILITY_NAMES[a.ability] || 'ability'} + proficiency), then {a.damage}{a.damageMod ? modStr(a.damageMod) : ''} {a.damageType} damage.
                    </span>
                  )}
                </div>
              ))}
              {!derived.attacks.length && <p className="muted">No weapons equipped - check the Gear tab.</p>}
            </div>

            <h4 className="mt">On your turn</h4>
            {TURN_PARTS.map((t) => <p key={t.name} className="small" style={{ margin: '3px 0' }}><strong>{t.name}.</strong> <span className="muted">{t.desc}</span></p>)}
            <details className="feature-item mt" open={explain}>
              <summary><strong>Actions anyone can take</strong> <span className="muted small">· Dash, Dodge, Disengage, Help, Hide...</span></summary>
              <div className="action-list">
                {ACTIONS.map((a) => <p key={a.name}><strong>{a.name}.</strong> {a.desc}</p>)}
              </div>
            </details>

            <h4 className="mt">Conditions <span className="muted small">(tap to mark one on you)</span></h4>
            {explain && <p className="explain-note">Effects that change what you can do. Each one says how.</p>}
            <div className={`cond-grid ${explain ? 'explained' : ''}`}>
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
                    {(explain || on) && <span className="row-brief">{c.brief}</span>}
                  </button>
                );
              })}
            </div>

            <h4 className="mt">Death saves <span className="muted small">(when you're at 0 HP)</span></h4>
            <DeathSaves sheet={sheet} change={change} roll={roll} compact readOnly={readOnly} />
          </div>
        )}

        {tab === 'spells' && sheet.spellcasting && derived.spell && (
          <SpellsTab
            sheet={sheet}
            derived={derived}
            meta={meta}
            readOnly={readOnly}
            change={change}
            roll={roll}
            onAnnounce={onAnnounce}
            explain={explain}
            openDetail={setSpellDetail}
            openPrepare={() => setShowPrepare(true)}
            openLearn={() => setShowLearn(true)}
          />
        )}

        {tab === 'gear' && (
          <GearTab sheet={sheet} readOnly={readOnly} change={change} dialog={dialog} characterId={characterId} inGame={mode === 'game'} />
        )}

        {tab === 'story' && (
          <div>
            <h4>Features & traits</h4>
            <div className="feature-list">
              {(sheet.features || []).map((f, i) => (
                <FeatureItem key={i} name={f.name} source={f.source} desc={f.desc} />
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

      {spellDetail && <SpellDetailModal index={spellDetail} onClose={() => setSpellDetail(null)} sheet={sheet} derived={derived} roll={roll} change={change} readOnly={readOnly} onAnnounce={onAnnounce} castTargets={castTargets} onCastAt={onCastAt} />}
      {showLevelUp && <LevelUpModal sheet={sheet} derived={derived} meta={meta} onClose={() => setShowLevelUp(false)} change={change} dialog={dialog} onAnnounce={onAnnounce} />}
      {showPrepare && <PrepareModal sheet={sheet} derived={derived} meta={meta} onClose={() => setShowPrepare(false)} change={change} />}
      {showLearn && <LearnSpellsModal sheet={sheet} derived={derived} onClose={() => setShowLearn(false)} change={change} />}
      {showPortrait && <PortraitModal sheet={sheet} onClose={() => setShowPortrait(false)} change={change} />}
      {showSubclass && <SubclassModal sheet={sheet} meta={meta} onClose={() => setShowSubclass(false)} change={change} onAnnounce={onAnnounce} />}
    </div>
  );
}

// ---------- pieces ----------

// The portrait editor over the sheet: each change is saved as it's made;
// Revert puts back the look the hero had when it opened.
function PortraitModal({ sheet, onClose, change }) {
  const [was] = useState(sheet.portrait || {});
  const [draft, setDraftState] = useState(sheet.portrait || {});
  const setDraft = (p) => { setDraftState(p); change({ portrait: p }); };
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal portrait-modal">
        <div className="modal-header">
          <h3>{sheet.name ? `${sheet.name}'s look` : 'Look'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          <PortraitEditor sheet={sheet} portrait={draft} onChange={setDraft} />
        </div>
        <div className="modal-actions">
          <SaveStatus />
          <span className="grow" />
          <button disabled={draft === was} onClick={() => setDraft(was)}>Revert</button>
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function VitalStat({ label, value, icon, onClick, title, note }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp className={`vital ${onClick ? 'clickable' : ''}`} onClick={onClick} title={title}>
      <span className="vital-label">{icon} {label}</span>
      <span className="vital-value">{value}</span>
      {note && <span className="vital-note">{note}</span>}
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
          <input className="hp-amt" inputMode="numeric" aria-label="Amount of damage or healing" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} placeholder="#" />
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

function SpellsTab({ sheet, derived, meta, readOnly, change, roll, onAnnounce, explain, openDetail, openPrepare, openLearn }) {
  const sc = sheet.spellcasting;
  const spellIndex = useSpellIndex();
  // a spell's name, what it does in numbers, and its first sentence
  const spellButton = (s, extra = null, cls = '') => {
    const info = spellIndex[s];
    return (
      <button key={s} className={`spell-row ${cls}`} onClick={() => openDetail(s)}>
        <span className="spell-row-main">
          <span>{info ? info.name : nameFromIndex(s)}{info && <span className="muted small"> · {info.casting_time}{info.concentration ? ' · concentration' : ''}</span>}</span>
          {info && spellLine(info) && <span className="spell-row-line">{spellLine(info)}</span>}
          {info?.brief && <span className="spell-row-brief">{summarize(info.brief, 110)}</span>}
        </span>
        {extra}
      </button>
    );
  };
  const slots = derived.spell?.maxSlots || {};
  const used = sc.slotsUsed || {};

  const toggleSlot = (lvl, i) => {
    if (readOnly) return;
    const u = used[lvl] || 0;
    const next = i < u ? i : i + 1;
    change({ spellcasting: { ...sc, slotsUsed: { ...used, [lvl]: next } } });
  };

  const kind = derived.spell.kind; // 'known' | 'prepared' | 'spellbook'
  const list = kind === 'prepared' ? sc.prepared : (sc.known || []).length ? sc.known : sc.prepared;
  const preparedSet = new Set(sc.prepared || []);

  return (
    <div>
      <div className="row wrap mb">
        <span className="chip gold prop-chip">Save DC {derived.spell.dc} <InfoTip label="Spell save DC" size={12}>{VITALS.saveDc}</InfoTip></span>
        <span className="chip gold prop-chip">Spell attack {fmtMod(derived.spell.attackBonus)} <InfoTip label="Spell attack" size={12}>{VITALS.spellAttack}</InfoTip></span>
        <span className="chip">{ABILITY_NAMES[sc.ability]} caster</span>
        {!readOnly && (
          <button className="small-btn" onClick={openLearn} title="New cantrips and spells as you level up">
            <SparkleIcon size={12} /> {kind === 'spellbook' ? 'Add to spellbook' : 'Learn spells'}
          </button>
        )}
        {kind !== 'known' && !readOnly && (
          <button className="small-btn" onClick={openPrepare}><BookIcon size={12} /> Change prepared</button>
        )}
      </div>

      {explain && <p className="explain-note">Tap a spell to read it and cast it. {VITALS.slots}</p>}
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
        {(sc.cantrips || []).map((s) => spellButton(s))}
      </div>

      <h4 className="mt">
        {kind === 'prepared' ? 'Prepared spells' : kind === 'spellbook' ? 'Spellbook' : 'Spells known'}
        {derived.spell.preparedMax && kind !== 'known' && <span className="muted small"> (prepare up to {derived.spell.preparedMax})</span>}
      </h4>
      <div className="spell-rows">
        {(list || []).map((s) => spellButton(
          s,
          kind === 'spellbook' && (preparedSet.has(s) ? <span className="chip gold">prepared</span> : <span className="chip">in book</span>),
          kind === 'spellbook' && !preparedSet.has(s) ? 'unprepared' : '',
        ))}
      </div>
    </div>
  );
}

function SpellDetailModal({ index, onClose, sheet, derived, roll, change, readOnly, onAnnounce, castTargets, onCastAt }) {
  const [spell, setSpell] = useState(null);
  const [targetId, setTargetId] = useState(null);
  useEffect(() => {
    srd.spell(index).then((s) => s && !s.error && setSpell(s));
  }, [index]);

  const sc = sheet.spellcasting;
  const spendSlot = (slotLvl) => {
    if (spell.level > 0 && slotLvl) {
      const used = sc.slotsUsed || {};
      const key = derived.spell.maxSlots.pact ? 'pact' : slotLvl;
      change({ spellcasting: { ...sc, slotsUsed: { ...used, [key]: (used[key] || 0) + 1 } } });
    }
  };
  const cast = (slotLvl) => {
    // At a table, a damaging spell goes at a creature: the server rolls the
    // hit or the save and the damage, and the map plays it, just like the
    // attack menu.
    const target = targeted && (targets.find((t) => t.id === targetId) || targets[0]);
    if (target) {
      // the server checks range and your action, and spends the slot
      onCastAt({ spellIndex: spell.index, slot: slotLvl || spell.level || 1, targetId: target.id, heal: healing });
      onClose();
      return;
    }
    spendSlot(slotLvl);
    if (onAnnounce) onAnnounce(`${sheet.name} casts ${spell.name}${slotLvl && spell.level > 0 ? ` (level ${slotLvl})` : ''}!`);
    // roll damage/healing if the spell defines dice
    const diceExpr = spellDice(spell, slotLvl || spell.level, sheet.level);
    if (diceExpr) roll(diceExpr, `${spell.name} ${spell.attack_type ? 'damage' : spell.heal_at_slot_level ? 'healing' : 'effect'}`);
    if (spell.attack_type) roll(`1d20${modStr(derived.spell.attackBonus)}`, `${spell.name} spell attack`);
    onClose();
  };

  // damage goes at a foe, a healing spell at a friend (or you)
  const healing = !!(spell && HEAL_SPELLS.has(spell.index));
  const targets = (castTargets || []).filter((t) => (healing ? t.friendly : !t.friendly));
  const targeted = !!(spell && (spell.damage?.damage_type || healing) && onCastAt && targets.length);
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
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        {spell && (
          <>
            <div className="modal-body">
              <p className="muted small">
                {spell.level === 0 ? 'Cantrip: free to cast, as often as you like' : `Level ${spell.level} spell: uses a level ${spell.level} (or higher) slot`} · {spell.school?.name}
              </p>
              <SpellFacts
                spell={{ ...spell, area: spell.area_of_effect ? `${spell.area_of_effect.size} ft ${spell.area_of_effect.type}` : null, dice: spellDice(spell, spell.level || 1, sheet.level) }}
                dc={derived.spell?.dc} attackBonus={derived.spell?.attackBonus}
              />
              {(spell.desc || []).map((d, i) => <p key={i} className="small">{boldMarks(d)}</p>)}
              {(spell.higher_level || []).map((d, i) => <p key={i} className="small muted"><em>At higher levels:</em> {d}</p>)}
            </div>
            {!readOnly && (
              <div className="modal-actions">
                {targeted && (
                  <label className="small">
                    At{' '}
                    <select value={targetId || targets[0].id} onChange={(e) => setTargetId(e.target.value)}>
                      {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                )}
                {spell.level === 0 && <button className="primary-btn" onClick={() => cast(null)}>Cast cantrip</button>}
                {availableSlots.slice(0, 4).map((lvl) => (
                  <button key={lvl} className="primary-btn" onClick={() => cast(lvl)}>Cast (slot lvl {lvl})</button>
                ))}
                {spell.level > 0 && derived.spell?.innate && <button className="primary-btn" onClick={() => cast(null)}>Cast (once per long rest)</button>}
                {spell.level > 0 && !derived.spell?.innate && !availableSlots.length && <span className="muted small">No slots left - take a long rest.</span>}
              </div>
            )}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function GearTab({ sheet, readOnly, change, dialog, characterId, inGame }) {
  const [making, setMaking] = useState(false);
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

  const addItem = () => setMaking(true);
  // A potion: drunk at the table (the server rolls the healing and tells
  // everyone); outside a game it heals here.
  const drink = async (i) => {
    const it = equipment[i];
    if (inGame) { socket.emit('useItem', { characterId, index: i }, (r) => r?.error && dialog.alert(r.error)); return; }
    const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(it.stats?.heal || '');
    let healed = 0;
    if (m) { for (let k = 0; k < +m[1]; k++) healed += 1 + Math.floor(Math.random() * +m[2]); healed += +(m[3] || 0); }
    const left = (it.qty || 1) > 1 ? equipment.map((e, idx) => (idx === i ? { ...e, qty: e.qty - 1 } : e)) : equipment.filter((_, idx) => idx !== i);
    change({ equipment: left, ...(healed ? { currentHp: Math.min(sheet.maxHp || 0, (sheet.currentHp || 0) + healed) } : {}) });
    if (healed) dialog.alert(`${it.name}: you heal ${healed} HP.`);
  };

  return (
    <div>
      <div className="row wrap mb">
        {Object.entries(coins).map(([c, v]) => (
          <label key={c} className="coin-box">
            <span>{c.toUpperCase()}</span>
            <input value={v} inputMode="numeric" disabled={readOnly} onChange={(e) => change({ coins: { ...coins, [c]: parseInt(e.target.value, 10) || 0 } })} />
          </label>
        ))}
      </div>
      <p className="explain-note">Tick a weapon or armor to wear it: equipped weapons appear as attacks, equipped armor sets your AC. Tap (i) beside a property for what it does.</p>
      <div className="gear-list">
        {equipment.map((e, i) => (
          <div key={i} className="gear-row">
            {(e.kind === 'weapon' || e.kind === 'armor' || e.kind === 'shield' || e.kind === 'relic') && (
              <input
                type="checkbox"
                checked={e.kind === 'relic' ? e.equipped !== false : e.equipped !== false && e.equipped !== undefined ? !!e.equipped : false}
                disabled={readOnly}
                title={e.kind === 'relic' ? 'Worn' : 'Equipped'}
                onChange={(ev) => setItem(i, { equipped: ev.target.checked })}
              />
            )}
            <span className="grow">
              <span className={e.magic ? 'gear-magic' : ''}>{e.name}</span> {e.qty > 1 && <span className="muted">×{e.qty}</span>}
              {(e.kind === 'potion' || e.kind === 'relic') && itemSummary(e) && <span className="muted small"> · {itemSummary(e)}</span>}
              {e.desc && <span className="gear-desc">{e.desc}</span>}
              {e.kind === 'weapon' && e.stats && <span className="muted small"> · {e.stats.damage}{e.stats.bonus ? `+${e.stats.bonus}` : ''} {e.stats.damageType}{e.stats.bonus ? `, +${e.stats.bonus} to hit` : ''} </span>}
              {e.kind === 'weapon' && e.stats && <PropertyChips properties={e.stats.properties || []} range={e.stats.range} />}
              {e.kind === 'armor' && e.stats && (
                <span className="muted small"> · AC {e.stats.acBase}{e.stats.bonus ? ` +${e.stats.bonus}` : ''} {e.stats.category}{' '}
                  {ARMOR_CATEGORIES[e.stats.category] && <InfoTip label={`${cap(e.stats.category)} armor`} size={12}>{ARMOR_CATEGORIES[e.stats.category]}</InfoTip>}
                </span>
              )}
              {e.kind === 'shield' && <span className="muted small"> · +{2 + (e.stats?.bonus || 0)} AC <InfoTip label="Shield" size={12}>{ARMOR_CATEGORIES.shield}</InfoTip></span>}
            </span>
            {!readOnly && e.kind === 'potion' && <button className="small-btn" onClick={() => drink(i)} title={e.stats?.heal ? `Drink it: heal ${e.stats.heal}` : 'Drink it'}><PotionIcon size={12} /> Drink</button>}
            {!readOnly && <button className="small-btn ghost-btn" onClick={() => change({ equipment: equipment.filter((_, idx) => idx !== i) })} aria-label={`Remove ${e.name || 'item'}`}><XIcon size={12} /></button>}
          </div>
        ))}
      </div>
      {!readOnly && <button className="small-btn mt" onClick={addItem}><PlusIcon size={12} /> Add item</button>}
      {making && <ItemMaker title="Add an item" doneLabel="Add it" onClose={() => setMaking(false)} onDone={(it) => { const { value, ...rest } = it; change({ equipment: [...equipment, rest] }); setMaking(false); }} />}
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
  // a subclass that grants spellcasting (Eldritch Trickster...) starts it here
  const nextSheet = { ...sheet, level: newLevel, ...(subDetail ? { subclass: subDetail.index } : {}) };
  const startsCasting = !sheet.spellcasting && !!subDetail && !!castingFor(nextSheet);

  // Like the builder, start on the SRD option - the tutorial's "take the
  // average, read your feature, done" still works for a wizard at level 2.
  useEffect(() => {
    if (!needsPick) return undefined;
    let live = true;
    srd.subclasses(sheet.classIndex).then((list) => {
      const srdPick = Array.isArray(list) && list.find((x) => x.source === 'srd51');
      if (live && srdPick) setPicked((prev) => prev || srdPick);
    });
    return () => { live = false; };
  }, [needsPick, sheet.classIndex]);

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
      : startsCasting ? newSubclassSpellcasting(subDetail.index) : null;
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
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
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
                    title={`${ABILITY_NAMES[a]}: ${ABILITY_DETAILS[a].brief}`}
                    onClick={() => setAsi((prev) => ({ ...prev, [a]: ((prev[a] || 0) + 1) % 3 }))}
                  >
                    {a.toUpperCase()} {asi[a] ? `+${asi[a]}` : ''}
                  </button>
                ))}
              </div>
              <p className="muted small">Click once for +1, twice for +2, three times to clear. Max score 20. An even score raises its modifier by 1: that is what makes your rolls better.</p>
              <p className="muted small">{ABILITIES.map((a) => `${a.toUpperCase()}: ${ABILITY_DETAILS[a].brief.split('.')[0]}`).join(' · ')}</p>
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
                <FeatureItem key={f.index} name={f.name} desc={(f.desc || []).join('\n')} options={f.options} />
              ))}
              {subFeatures.map((f) => (
                <FeatureItem key={`${f.source}-${f.name}`} name={f.name} source={f.source} desc={f.desc} />
              ))}
            </>
          ) : (
            <p className="muted">{needsPick && !subDetail ? 'Pick an option above to see its features.' : 'No new class features this level - but your numbers improve.'}</p>
          )}
          {sheet.spellcasting && <p className="muted small mt">Spell slots refresh and increase per your class table. New cantrips and spells: Spells tab, then Learn spells.</p>}
          {startsCasting && <p className="muted small mt">The {subDetail.name} casts spells: after confirming, open the Spells tab and use Learn spells to pick your cantrips and spells.</p>}
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
    const casts = !sheet.spellcasting && castingFor({ ...sheet, subclass: detail.index });
    change({
      subclass: detail.index,
      subclassName: detail.name,
      ...(casts ? { spellcasting: newSubclassSpellcasting(detail.index) } : {}),
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
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="muted small">{meta.name}s pick this at level {from}. You'll get every feature it grants up to level {sheet.level}.</p>
          <SubclassPicker classIndex={sheet.classIndex} value={picked?.index} onChange={setPicked} />
          {gained.length > 0 && (
            <>
              <h4 className="mt">You gain</h4>
              {gained.map((f) => (
                <FeatureItem key={`${f.source}-${f.name}`} name={f.name} source={f.source} desc={f.desc} />
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

// New cantrips and spells as a hero levels. Known casters (bard, sorcerer,
// warlock, ranger, and subclass casters like the Eldritch Trickster) pick their
// spells known, a wizard adds to the spellbook, and every caster tops up
// cantrips. Limits come from the SRD class table or the subclass's own table.
function LearnSpellsModal({ sheet, derived, onClose, change }) {
  const sc = sheet.spellcasting;
  const { kind, list } = derived.spell;
  const [limits, setLimits] = useState(null);
  const [available, setAvailable] = useState(null);
  const [cantrips, setCantripsState] = useState(sc.cantrips || []);
  const [known, setKnownState] = useState(sc.known || []);
  // Each pick is saved as it's made.
  const commit = (patch) => {
    const next = { ...sc, cantrips, known, ...patch };
    if (kind === 'spellbook') next.prepared = (sc.prepared || []).filter((i) => next.known.includes(i));
    change({ spellcasting: next });
  };
  const setCantrips = (v) => { setCantripsState(v); commit({ cantrips: v }); };
  const setKnown = (v) => { setKnownState(v); commit({ known: v }); };

  useEffect(() => {
    const slotLevels = Object.entries(derived.spell.maxSlots || {}).map(([k, v]) => (k === 'pact' ? v.level : Number(k)));
    const maxSlotLevel = Math.max(0, ...slotLevels);
    const sub = subclassSpellLimits(sheet);
    if (sub) setLimits(sub);
    else {
      srd.classLevels(sheet.classIndex).then((levels) => {
        const row = (Array.isArray(levels) ? levels.find((l) => l.level === sheet.level) : null)?.spellcasting || {};
        setLimits({
          cantrips: row.cantrips_known || 0,
          known: kind === 'known' ? row.spells_known || 0 : kind === 'spellbook' ? 6 + 2 * (sheet.level - 1) : 0,
          maxLevel: maxSlotLevel,
        });
      });
    }
    srd.spells(`?class=${list}`).then((all) => setAvailable(Array.isArray(all) ? [...all].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)) : []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = limits && available;
  const toggle = (arr, setArr, max) => (index) => {
    if (arr.includes(index)) setArr(arr.filter((x) => x !== index));
    else if (arr.length < max) setArr([...arr, index]);
  };
  // anything already on the sheet stays visible even if this list doesn't offer it
  const withCurrent = (options, current) => [...options, ...current.filter((i) => !options.some((o) => o.index === i)).map((i) => ({ index: i, name: nameFromIndex(i), level: '?' }))];

  const section = (title, hint, options, picked, setPicked, max) => (
    <>
      <h4 className="mt">{title} ({picked.length}/{max})</h4>
      {hint && <p className="muted small">{hint}</p>}
      <div className="spell-pick-list">
        {options.map((sp) => {
          const on = picked.includes(sp.index);
          return <SpellPickRow key={sp.index} spell={sp} on={on} showLevel disabled={!on && picked.length >= max} toggle={() => toggle(picked, setPicked, max)(sp.index)} />;
        })}
      </div>
    </>
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>{kind === 'spellbook' ? 'Your spellbook' : 'Learn spells'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          {!ready ? (
            <p className="muted">Loading...</p>
          ) : (
            <>
              {(limits.cantrips > 0 || limits.known > 0) && (
                <p className="muted small">
                  At level {sheet.level} you know up to{' '}
                  {[
                    limits.cantrips > 0 && `${limits.cantrips} cantrip${limits.cantrips === 1 ? '' : 's'}`,
                    limits.known > 0 && `${limits.known} spell${limits.known === 1 ? '' : 's'}${kind === 'spellbook' ? ' in your book' : ''} of up to level ${limits.maxLevel}`,
                  ].filter(Boolean).join(' and ')}
                  , from the {list} list. Swap freely - your DM may ask you to keep to one change per level.
                </p>
              )}
              {limits.cantrips > 0 && section('Cantrips', null, withCurrent(available.filter((sp) => sp.level === 0), cantrips), cantrips, setCantrips, limits.cantrips)}
              {limits.known > 0 && section(kind === 'spellbook' ? 'Spellbook' : 'Spells known', null, withCurrent(available.filter((sp) => sp.level > 0 && sp.level <= limits.maxLevel), known), known, setKnown, limits.known)}
              {!limits.cantrips && !limits.known && <p className="muted">Nothing to learn at this level - your spells are prepared from the full list after a long rest.</p>}
            </>
          )}
        </div>
        <div className="modal-actions">
          <SaveStatus />
          <span className="grow" />
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PrepareModal({ sheet, derived, meta, onClose, change }) {
  const [available, setAvailable] = useState([]);
  const sc = sheet.spellcasting;
  const maxPrepared = derived.spell.preparedMax || 1;
  const [picked, setPickedState] = useState(sc.prepared || []);
  const setPicked = (v) => { setPickedState(v); change({ spellcasting: { ...sc, prepared: v } }); }; // saved as you pick
  const spellIndex = useSpellIndex();

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
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          <p className="muted small">After a long rest you can change which spells you have ready. Pick up to {maxPrepared}.</p>
          <div className="spell-pick-list">
            {available.map((s) => {
              const on = picked.includes(s.index);
              return (
                <SpellPickRow key={s.index} spell={spellIndex[s.index] || s} on={on} showLevel toggle={() => {
                  if (on) setPicked(picked.filter((x) => x !== s.index));
                  else if (picked.length < maxPrepared) setPicked([...picked, s.index]);
                }} />
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <SaveStatus />
          <span className="grow" />
          <button className="primary-btn" onClick={onClose}>Done</button>
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
  const currentHp = Math.min(sheet.maxHp, sheet.currentHp + healed);
  change({ currentHp, hitDiceRemaining: available - n, uses: usesAfterRest(sheet, 'short') });
  // report what was restored, not the raw roll - you can't heal past your maximum
  const restored = currentHp - sheet.currentHp;
  if (onAnnounce) onAnnounce(`${sheet.name} takes a short rest: spends ${n} hit ${n === 1 ? 'die' : 'dice'}, heals ${restored} HP${restored < healed ? ` (rolled ${healed}, back to full)` : ''}.`);
}

async function longRest({ sheet, change, dialog, onAnnounce }) {
  const ok = await dialog.confirm('Take a long rest? (8 hours: full HP, spell slots restored, half your hit dice back, conditions cleared)', 'Long rest', 'Rest');
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
    uses: {},
    raging: false,
  });
  if (onAnnounce) onAnnounce(`${sheet.name} completes a long rest - fully refreshed.`);
}

// ---------- helpers ----------
// SRD text marks its sub-headings "***Create Water.***": show them bold.
const boldMarks = (text) => String(text).split(/\*{2,3}([^*]+)\*{2,3}/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part.replace(/\*+/g, '')));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const modStr = (m) => (m >= 0 ? `+${m}` : `${m}`);
const nameFromIndex = (i) => (i || '').split('-').map(cap).join(' ');

export function spellDice(spell, slotLvl, charLevel) {
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
