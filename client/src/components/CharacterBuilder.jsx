import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { characters as charsApi, srd } from '../api';
import { useDialog } from '../utils';
import {
  ABILITIES, ABILITY_NAMES, ABILITY_BLURBS, SKILLS, SKILL_BY_INDEX,
  CLASS_META, STANDARD_ARRAY, POINT_BUY_TOTAL, POINT_BUY_COST,
  STARTING_EQUIPMENT, RECOMMENDED_SPELLS, mod, fmtMod, level1Hp, preparedCount, deriveSheet,
} from '../rules/engine';
import { PREGENS } from '../data/pregens';
import { ChevronLeft, ChevronRight, D20Icon, SparkleIcon } from './Icons';
import { Avatar } from './Portrait';

const RACE_BLURBS = {
  dwarf: 'Stout mountain folk. Tough (+2 CON), poison-resistant, see in the dark. Slow but unshakeable.',
  elf: 'Graceful and long-lived. Nimble (+2 DEX), keen senses, see in the dark, immune to magical sleep.',
  halfling: 'Small, cheerful and absurdly lucky (+2 DEX). Reroll natural 1s. Brave beyond their size.',
  human: 'Adaptable and ambitious: +1 to every ability score. Good at absolutely everything.',
  dragonborn: 'Dragon-blooded warriors (+2 STR, +1 CHA) with a literal breath weapon.',
  gnome: 'Small, brilliant tinkerers (+2 INT) with advantage on mental saves vs magic.',
  'half-elf': 'Charismatic wanderers between worlds: +2 CHA, +1 to two others, two free skills.',
  'half-orc': 'Fierce and unstoppable (+2 STR, +1 CON): survive lethal blows, crit harder.',
  tiefling: 'Marked by infernal heritage (+2 CHA, +1 INT): fire-resistant, innate magic.',
};

const PORTRAIT_COLORS = ['#d4a94f', '#c2542e', '#7fb069', '#5f87a8', '#8f7fd4', '#c94f6d', '#5fb0a5', '#b8b8b8', '#e0c060', '#b06ab0'];

const FIGHTING_STYLES = [
  { id: 'defense', name: 'Defense', desc: '+1 AC while wearing armor. Simple and always useful.', acBonus: 1 },
  { id: 'dueling', name: 'Dueling', desc: '+2 damage with a one-handed weapon (and nothing in the other hand, shield ok).' },
  { id: 'archery', name: 'Archery', desc: '+2 to attack rolls with ranged weapons.' },
  { id: 'great-weapon', name: 'Great Weapon Fighting', desc: 'Reroll 1s and 2s on damage with two-handed weapons.' },
];

const STEPS = ['Start', 'Race', 'Class', 'Abilities', 'Background', 'Spells', 'Details', 'Review'];

export default function CharacterBuilder({ onClose, onSaved, embedded = false, onPickPregen = null }) {
  const dialog = useDialog();
  const [step, setStep] = useState(0);
  const [races, setRaces] = useState([]);
  const [raceDetail, setRaceDetail] = useState(null);
  const [backgrounds, setBackgrounds] = useState([]);
  const [spellList, setSpellList] = useState({ cantrips: [], level1: [] });
  const [saving, setSaving] = useState(false);

  // choices
  const [race, setRace] = useState(null);
  const [classIndex, setClassIndex] = useState(null);
  const [method, setMethod] = useState('array');
  const [assign, setAssign] = useState({}); // ability -> base score
  const [rolled, setRolled] = useState(null);
  const [pb, setPb] = useState({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  const [background, setBackground] = useState(null);
  const [classSkills, setClassSkills] = useState([]);
  const [expertisePicks, setExpertisePicks] = useState([]);
  const [fightingStyle, setFightingStyle] = useState('defense');
  const [cantrips, setCantrips] = useState([]);
  const [spells, setSpells] = useState([]);
  const [name, setName] = useState('');
  const [alignment, setAlignment] = useState('Neutral Good');
  const [personality, setPersonality] = useState({ traits: '', ideals: '', bonds: '', flaws: '' });
  const [color, setColor] = useState(PORTRAIT_COLORS[0]);

  useEffect(() => {
    srd.races().then((r) => Array.isArray(r) && setRaces(r));
    srd.backgrounds().then((b) => Array.isArray(b) && setBackgrounds(b));
  }, []);

  useEffect(() => {
    if (race) srd.race(race).then((d) => d && !d.error && setRaceDetail(d));
    else setRaceDetail(null);
  }, [race]);

  const meta = classIndex ? CLASS_META[classIndex] : null;

  // load spell options when reaching the spells step
  useEffect(() => {
    if (!meta || !meta.caster || !classIndex) return;
    Promise.all([
      srd.spells(`?class=${classIndex}&level=0`),
      srd.spells(`?class=${classIndex}&level=1`),
    ]).then(([c, s]) => {
      const cList = Array.isArray(c) ? c : [];
      const sList = Array.isArray(s) ? s : [];
      setSpellList({ cantrips: cList, level1: sList });
      // Drop any preselected spell that isn't actually pickable for this class,
      // so an invalid recommendation can never silently occupy a slot.
      const cValid = new Set(cList.map((x) => x.index));
      const sValid = new Set(sList.map((x) => x.index));
      setCantrips((prev) => prev.filter((i) => cValid.has(i)));
      setSpells((prev) => prev.filter((i) => sValid.has(i)));
    });
  }, [classIndex, meta]);

  // preselect recommended spells when class changes
  useEffect(() => {
    if (!classIndex) return;
    const rec = RECOMMENDED_SPELLS[classIndex] || { cantrips: [], spells: [] };
    setCantrips(rec.cantrips.slice(0, meta?.l1?.cantrips ?? 0));
    setSpells(rec.spells.slice(0, spellPickCount(classIndex)));
    setClassSkills([]);
    setExpertisePicks([]);
  }, [classIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ability score helpers ----
  const racialBonuses = useMemo(() => {
    const bonuses = {};
    if (!raceDetail) return bonuses;
    for (const b of raceDetail.ability_bonuses || []) bonuses[b.ability_score.index] = (bonuses[b.ability_score.index] || 0) + b.bonus;
    for (const sub of raceDetail.subraces || []) {
      for (const b of sub.ability_bonuses || []) bonuses[b.ability_score.index] = (bonuses[b.ability_score.index] || 0) + b.bonus;
    }
    return bonuses;
  }, [raceDetail]);

  const baseScores = useMemo(() => {
    if (method === 'pointbuy') return pb;
    const src = method === 'roll' ? rolled : STANDARD_ARRAY;
    if (!src) return null;
    const scores = {};
    for (const a of ABILITIES) {
      if (assign[a] === undefined) return null;
      scores[a] = src[assign[a]];
    }
    return scores;
  }, [method, assign, pb, rolled]);

  const finalScores = useMemo(() => {
    if (!baseScores) return null;
    const final = {};
    for (const a of ABILITIES) final[a] = baseScores[a] + (racialBonuses[a] || 0);
    return final;
  }, [baseScores, racialBonuses]);

  const pointsSpent = ABILITIES.reduce((sum, a) => sum + (POINT_BUY_COST[pb[a]] || 0), 0);

  const rollScores = () => {
    const roll4d6 = () => {
      const dice = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
      dice.sort((a, b) => a - b);
      return dice[1] + dice[2] + dice[3];
    };
    setRolled(Array.from({ length: 6 }, roll4d6).sort((a, b) => b - a));
    setAssign({});
  };

  // ---- step gating ----
  const bgData = backgrounds.find((b) => b.index === background);
  const bgSkills = bgData ? bgData.skill_proficiencies : [];
  const skillOptions = meta ? meta.skillChoices.from.filter((s) => !bgSkills.includes(s)) : [];
  const spellsNeeded = classIndex ? spellPickCount(classIndex) : 0;
  const cantripsNeeded = meta?.l1?.cantrips ?? 0;
  const isCaster = !!(meta && meta.caster && (cantripsNeeded > 0 || spellsNeeded > 0));

  const canNext = () => {
    switch (STEPS[step]) {
      case 'Start': return true;
      case 'Race': return !!race;
      case 'Class': return !!classIndex;
      case 'Abilities': return !!finalScores && (method !== 'pointbuy' || pointsSpent <= POINT_BUY_TOTAL);
      case 'Background': {
        if (!background) return false;
        if (classSkills.length !== (meta?.skillChoices.n || 0)) return false;
        if (meta?.expertiseAtCreate && expertisePicks.length !== meta.expertiseAtCreate) return false;
        return true;
      }
      case 'Spells': return !isCaster || (cantrips.length === cantripsNeeded && spells.length === spellsNeeded);
      case 'Details': return name.trim().length > 0;
      default: return true;
    }
  };

  const next = () => {
    let target = step + 1;
    if (STEPS[target] === 'Spells' && !isCaster) target += 1;
    setStep(Math.min(target, STEPS.length - 1));
  };
  const back = () => {
    let target = step - 1;
    if (STEPS[target] === 'Spells' && !isCaster) target -= 1;
    setStep(Math.max(target, 0));
  };

  // ---- assemble the final sheet ----
  const buildSheet = () => {
    const raceName = raceDetail.subraces && raceDetail.subraces.length ? raceDetail.subraces[0].name : raceDetail.name;
    const features = [];
    for (const t of raceDetail.traits || []) features.push({ name: t.name, source: raceDetail.name, desc: (t.desc || []).join(' ') });
    for (const sub of raceDetail.subraces || []) {
      for (const t of sub.racial_traits || []) features.push({ name: t.name, source: sub.name, desc: (t.desc || []).join(' ') });
    }
    const l1Features = CLASS_L1_FEATURES[classIndex] || [];
    for (const f of l1Features) features.push(f);
    if (classIndex === 'fighter') {
      const style = FIGHTING_STYLES.find((s) => s.id === fightingStyle);
      features.push({ name: `Fighting Style: ${style.name}`, source: 'Fighter 1', desc: style.desc });
    }
    features.push({ name: bgData.feature.name, source: bgData.name, desc: bgData.feature.desc });

    const equipment = (STARTING_EQUIPMENT[classIndex] || []).map((e) => ({ ...e }));
    for (const item of bgData.equipment || []) equipment.push({ name: item.name, qty: item.qty, kind: 'gear' });

    const languages = ['Common'];
    if (raceDetail.languages) for (const l of raceDetail.languages) if (l.name !== 'Common') languages.push(l.name);

    const spellcasting = meta.caster
      ? {
          ability: meta.castingAbility,
          cantrips,
          known: meta.preparedKind === 'known' || meta.preparedKind === 'spellbook' ? spells : [],
          prepared: meta.preparedKind === 'prepared' ? spells : meta.preparedKind === 'spellbook' ? spells.slice(0, Math.max(1, preparedCount(classIndex, 1, finalScores) || 1)) : [],
          slotsUsed: {},
        }
      : null;

    const style = FIGHTING_STYLES.find((s) => s.id === fightingStyle);
    const sheet = {
      name: name.trim(),
      race, raceName, subrace: raceDetail.subraces?.[0]?.index || null,
      classIndex, className: meta.name,
      background, alignment,
      level: 1, xp: 0, abilityMethod: method,
      abilities: finalScores,
      speed: raceDetail.speed || 30,
      maxHp: level1Hp(classIndex, finalScores, race),
      currentHp: level1Hp(classIndex, finalScores, race),
      tempHp: 0,
      hitDiceRemaining: 1,
      deathSaves: { s: 0, f: 0 },
      inspiration: false,
      conditions: [],
      exhaustion: 0,
      profSaves: meta.saves,
      profSkills: [...bgSkills, ...classSkills],
      expertiseSkills: expertisePicks,
      languages,
      armorProfs: meta.armor.length ? meta.armor.map((a) => a[0].toUpperCase() + a.slice(1)) : [],
      weaponProfs: [typeof meta.weapons === 'string' ? meta.weapons : 'Simple weapons'],
      toolProfs: bgData.tool_proficiencies || [],
      equipment,
      coins: { cp: 0, sp: 0, ep: 0, gp: bgData.gold || 10, pp: 0 },
      spellcasting,
      features,
      choices: classIndex === 'fighter' ? { fightingStyle } : {},
      attacksCustom: [],
      acBonus: classIndex === 'fighter' && style.acBonus ? style.acBonus : 0,
      acOverride: null,
      personality,
      backstory: '',
      portrait: { color, icon: classIndex },
      notes: '',
    };
    return sheet;
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const sheet = buildSheet();
    const res = await charsApi.create(sheet.name, sheet);
    setSaving(false);
    if (res && res.id) onSaved(res);
    else dialog.alert((res && res.error) || 'Could not save character');
  };

  const pickPregen = async (pregen) => {
    if (onPickPregen) return onPickPregen(pregen);
    if (saving) return;
    setSaving(true);
    const res = await charsApi.create(pregen.sheet.name, pregen.sheet);
    setSaving(false);
    if (res && res.id) onSaved(res);
    else dialog.alert((res && res.error) || 'Could not save character');
  };

  const body = (
    <div className={`builder ${embedded ? 'builder-embedded' : ''}`}>
      <div className="builder-head">
        <h2><D20Icon size={18} /> Create a hero</h2>
        <div className="builder-steps">
          {STEPS.map((s, i) => (
            <span key={s} className={`builder-step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''} ${s === 'Spells' && !isCaster && classIndex ? 'skipped' : ''}`}>
              {s}
            </span>
          ))}
        </div>
        {!embedded && <button className="close-btn" onClick={onClose}>×</button>}
      </div>

      <div className="builder-body">
        {STEPS[step] === 'Start' && (
          <div>
            <p className="builder-intro">
              Every adventurer is defined by a <strong>race</strong> (ancestry), a <strong>class</strong> (profession),
              a <strong>background</strong> (past life), and six <strong>ability scores</strong>. The builder walks you
              through each choice - nothing to memorize. Or grab a ready-made hero and start playing now.
            </p>
            <h4 className="mt">Quick start - pick a ready-made hero</h4>
            <div className="pregen-grid">
              {PREGENS.map((p) => (
                <div key={p.id} className="pregen-card" onClick={() => pickPregen(p)}>
                  <Avatar sheet={p.sheet} name={p.sheet.name} color={p.sheet.portrait.color} size={54} />
                  <div className="pregen-info">
                    <div className="card-title">{p.sheet.name}</div>
                    <div className="card-sub">{p.sheet.raceName} {p.sheet.className}</div>
                    <p className="pregen-blurb">{p.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="center mt">
              <button className="primary-btn big-btn" onClick={next}><SparkleIcon size={15} /> Build my own from scratch</button>
            </div>
          </div>
        )}

        {STEPS[step] === 'Race' && (
          <div>
            <p className="builder-intro">Your race shapes what you are: size, speed, senses, and natural talents. There is no wrong pick.</p>
            <div className="choice-grid">
              {races.map((r) => (
                <div key={r.index} className={`choice-card ${race === r.index ? 'selected' : ''}`} onClick={() => setRace(r.index)}>
                  <h4>{r.name}</h4>
                  <p>{RACE_BLURBS[r.index] || ''}</p>
                  <div className="choice-tags">
                    <span className="chip">Speed {r.speed} ft</span>
                    {(r.ability_bonuses || []).slice(0, 3).map((b) => (
                      <span className="chip gold" key={b.ability_score.index}>+{b.bonus} {b.ability_score.name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {raceDetail && raceDetail.subraces?.length > 0 && (
              <p className="muted small mt">Includes the {raceDetail.subraces[0].name} heritage (the SRD variant) - its bonuses are applied automatically.</p>
            )}
          </div>
        )}

        {STEPS[step] === 'Class' && (
          <div>
            <p className="builder-intro">Your class is your job in the party: how you fight, what you're good at, and whether you sling spells.</p>
            <div className="choice-grid">
              {Object.entries(CLASS_META).map(([idx, c]) => (
                <div key={idx} className={`choice-card ${classIndex === idx ? 'selected' : ''}`} onClick={() => setClassIndex(idx)}>
                  <h4>{c.name} {c.caster && <span className="chip magic">magic</span>}</h4>
                  <p>{c.blurb}</p>
                  <p className="choice-playstyle">▸ {c.playstyle}</p>
                  <div className="choice-tags">
                    <span className="chip">d{c.hitDie} hit die</span>
                    <span className="chip gold">{c.primary.map((a) => a.toUpperCase()).join(' & ')}</span>
                  </div>
                </div>
              ))}
            </div>
            {classIndex === 'fighter' && (
              <div className="mt">
                <h4>Fighting style</h4>
                <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {FIGHTING_STYLES.map((s) => (
                    <div key={s.id} className={`choice-card slim ${fightingStyle === s.id ? 'selected' : ''}`} onClick={() => setFightingStyle(s.id)}>
                      <h4>{s.name}</h4>
                      <p>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {STEPS[step] === 'Abilities' && (
          <div>
            <p className="builder-intro">
              Six numbers define your raw talent, from 8 (weak) to 15+ (heroic). Each gives a <strong>modifier</strong> -
              the number you actually add to dice rolls. {meta && <>For a {meta.name}, <strong>{meta.primary.map((a) => ABILITY_NAMES[a]).join(' and ')}</strong> matter most.</>}
            </p>
            <div className="tab-row mb">
              <button className={method === 'array' ? 'active' : ''} onClick={() => { setMethod('array'); setAssign({}); }}>Standard array (recommended)</button>
              <button className={method === 'pointbuy' ? 'active' : ''} onClick={() => setMethod('pointbuy')}>Point buy</button>
              <button className={method === 'roll' ? 'active' : ''} onClick={() => { setMethod('roll'); if (!rolled) rollScores(); }}>Roll the dice</button>
            </div>

            {method === 'roll' && (
              <div className="row mb">
                <span className="muted">Your rolls (4d6, drop lowest):</span>
                <strong>{rolled ? rolled.join(' · ') : '—'}</strong>
                <button className="small-btn" onClick={rollScores}>Reroll all</button>
              </div>
            )}
            {method === 'pointbuy' && (
              <p className={`mb ${pointsSpent > POINT_BUY_TOTAL ? 'login-error' : 'muted'}`}>
                Points spent: <strong>{pointsSpent} / {POINT_BUY_TOTAL}</strong> (8 costs 0 ... 15 costs 9)
              </p>
            )}

            <div className="ability-assign">
              {ABILITIES.map((a) => {
                const source = method === 'roll' ? rolled : STANDARD_ARRAY;
                const baseVal = method === 'pointbuy' ? pb[a] : assign[a] !== undefined && source ? source[assign[a]] : null;
                const finalVal = baseVal !== null && baseVal !== undefined ? baseVal + (racialBonuses[a] || 0) : null;
                return (
                  <div key={a} className={`ability-slot ${meta && meta.primary.includes(a) ? 'primary' : ''}`}>
                    <div className="ability-slot-top">
                      <span className="ability-slot-name">{ABILITY_NAMES[a]}</span>
                      {meta && meta.primary.includes(a) && <span className="chip gold">key</span>}
                    </div>
                    <div className="ability-slot-blurb">{ABILITY_BLURBS[a]}</div>
                    <div className="ability-slot-controls">
                      {method === 'pointbuy' ? (
                        <div className="ability-stepper">
                          <button className="small-btn" disabled={pb[a] <= 8} onClick={() => setPb({ ...pb, [a]: pb[a] - 1 })}>−</button>
                          <strong className="ability-slot-score">{pb[a]}</strong>
                          <button className="small-btn" disabled={pb[a] >= 15 || pointsSpent >= POINT_BUY_TOTAL} onClick={() => setPb({ ...pb, [a]: pb[a] + 1 })}>+</button>
                        </div>
                      ) : (
                        <select
                          value={assign[a] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                            const nextAssign = { ...assign };
                            if (v === undefined) delete nextAssign[a];
                            else {
                              for (const k of Object.keys(nextAssign)) if (nextAssign[k] === v) delete nextAssign[k];
                              nextAssign[a] = v;
                            }
                            setAssign(nextAssign);
                          }}
                        >
                          <option value="">—</option>
                          {(source || []).map((val, i) => (
                            <option key={i} value={i} disabled={Object.entries(assign).some(([k, idx]) => idx === i && k !== a)}>
                              {val}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="ability-slot-final">
                        {finalVal !== null ? (
                          <>
                            {racialBonuses[a] ? <span className="chip gold">+{racialBonuses[a]}</span> : null}
                            <strong>{finalVal}</strong> <span className="gold-text">({fmtMod(mod(finalVal))})</span>
                          </>
                        ) : (
                          <span className="muted">pick</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {STEPS[step] === 'Background' && meta && (
          <div>
            <p className="builder-intro">Your background is who you were before adventuring - it grants two skills and a story hook.</p>
            <div className="choice-grid">
              {backgrounds.map((b) => (
                <div key={b.index} className={`choice-card ${background === b.index ? 'selected' : ''}`} onClick={() => {
                  setBackground(b.index);
                  setPersonality({
                    traits: b.suggested_personality.traits[0],
                    ideals: b.suggested_personality.ideals[0],
                    bonds: b.suggested_personality.bonds[0],
                    flaws: b.suggested_personality.flaws[0],
                  });
                  setClassSkills((prev) => prev.filter((s) => !b.skill_proficiencies.includes(s)));
                }}>
                  <h4>{b.name}</h4>
                  <p>{b.blurb}</p>
                  <div className="choice-tags">
                    {b.skill_proficiencies.map((s) => <span className="chip gold" key={s}>{SKILL_BY_INDEX[s].name}</span>)}
                  </div>
                </div>
              ))}
            </div>

            {background && (
              <div className="mt">
                <h4>Class skills - pick {meta.skillChoices.n} ({classSkills.length}/{meta.skillChoices.n})</h4>
                <p className="muted small">You're already proficient in {bgSkills.map((s) => SKILL_BY_INDEX[s].name).join(' and ')} from your background.</p>
                <div className="skill-pick-grid">
                  {skillOptions.map((s) => {
                    const on = classSkills.includes(s);
                    return (
                      <button
                        key={s}
                        className={`skill-pick ${on ? 'on' : ''}`}
                        onClick={() => {
                          if (on) setClassSkills(classSkills.filter((x) => x !== s));
                          else if (classSkills.length < meta.skillChoices.n) setClassSkills([...classSkills, s]);
                        }}
                      >
                        {SKILL_BY_INDEX[s].name} <span className="muted">({SKILL_BY_INDEX[s].ability.toUpperCase()})</span>
                      </button>
                    );
                  })}
                </div>
                {meta.expertiseAtCreate && (
                  <div className="mt">
                    <h4>Expertise - double your bonus in {meta.expertiseAtCreate} skills ({expertisePicks.length}/{meta.expertiseAtCreate})</h4>
                    <div className="skill-pick-grid">
                      {[...bgSkills, ...classSkills].map((s) => {
                        const on = expertisePicks.includes(s);
                        return (
                          <button key={s} className={`skill-pick ${on ? 'on' : ''}`} onClick={() => {
                            if (on) setExpertisePicks(expertisePicks.filter((x) => x !== s));
                            else if (expertisePicks.length < meta.expertiseAtCreate) setExpertisePicks([...expertisePicks, s]);
                          }}>
                            {SKILL_BY_INDEX[s].name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {STEPS[step] === 'Spells' && meta?.caster && (
          <div>
            <p className="builder-intro">
              <strong>Cantrips</strong> are minor spells you can cast forever, at will. <strong>Leveled spells</strong> use
              up spell slots (you get them back on a long rest). We pre-picked a solid beginner set - change anything you like.
            </p>
            <h4>Cantrips - pick {cantripsNeeded} ({cantrips.length}/{cantripsNeeded})</h4>
            <div className="spell-pick-list">
              {spellList.cantrips.map((s) => (
                <SpellPickRow key={s.index} spell={s} on={cantrips.includes(s.index)} toggle={() => {
                  if (cantrips.includes(s.index)) setCantrips(cantrips.filter((x) => x !== s.index));
                  else if (cantrips.length < cantripsNeeded) setCantrips([...cantrips, s.index]);
                }} />
              ))}
            </div>
            <h4 className="mt">
              {meta.preparedKind === 'spellbook' ? 'Spellbook' : meta.preparedKind === 'prepared' ? 'Prepared spells' : 'Spells known'} - pick {spellsNeeded} ({spells.length}/{spellsNeeded})
            </h4>
            <div className="spell-pick-list">
              {spellList.level1.map((s) => (
                <SpellPickRow key={s.index} spell={s} on={spells.includes(s.index)} toggle={() => {
                  if (spells.includes(s.index)) setSpells(spells.filter((x) => x !== s.index));
                  else if (spells.length < spellsNeeded) setSpells([...spells, s.index]);
                }} />
              ))}
            </div>
          </div>
        )}

        {STEPS[step] === 'Details' && (
          <div>
            <div className="portrait-preview">
              <Avatar
                sheet={{ name: name || 'Hero', raceIndex: race, classIndex, raceName: raceDetail && raceDetail.name, className: meta && meta.name }}
                name={name || 'Hero'}
                color={color}
                size={84}
              />
              <p className="muted small">
                Your portrait is drawn from your race, class and name. It follows you onto the battle map, so the table
                always knows which token is you.
              </p>
            </div>
            <label className="field-label">Character name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kaelen Brightspear" maxLength={40} style={{ width: '100%' }} />
            <label className="field-label">Alignment (your moral compass - just a roleplay guide)</label>
            <select value={alignment} onChange={(e) => setAlignment(e.target.value)} style={{ width: '100%' }}>
              {['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'].map((a) => <option key={a}>{a}</option>)}
            </select>
            <label className="field-label">Portrait & token colour</label>
            <div className="row wrap">
              {PORTRAIT_COLORS.map((c) => (
                <button key={c} className="color-swatch" style={{ background: c, outline: color === c ? '2px solid var(--gold-bright)' : 'none' }} onClick={() => setColor(c)} />
              ))}
            </div>
            {bgData && (
              <>
                <label className="field-label">Personality (prefilled from your background - edit freely)</label>
                {['traits', 'ideals', 'bonds', 'flaws'].map((k) => (
                  <div key={k} className="row mb" style={{ alignItems: 'flex-start' }}>
                    <span className="chip" style={{ width: 64, justifyContent: 'center', textTransform: 'capitalize' }}>{k}</span>
                    <select
                      className="grow"
                      value={personality[k]}
                      onChange={(e) => setPersonality({ ...personality, [k]: e.target.value })}
                    >
                      {bgData.suggested_personality[k].map((option) => <option key={option}>{option}</option>)}
                      {!bgData.suggested_personality[k].includes(personality[k]) && <option>{personality[k]}</option>}
                    </select>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {STEPS[step] === 'Review' && finalScores && raceDetail && meta && bgData && (
          <ReviewPane
            name={name} raceDetail={raceDetail} meta={meta} bgData={bgData}
            sheet={buildSheet()}
          />
        )}
      </div>

      <div className="builder-foot">
        <button onClick={step === 0 ? onClose : back}>
          <ChevronLeft size={13} /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="grow" />
        {STEPS[step] === 'Review' ? (
          <button className="primary-btn big-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Forge this hero'}
          </button>
        ) : step > 0 ? (
          <button className="primary-btn" onClick={next} disabled={!canNext()}>
            Next <ChevronRight size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (embedded) return body;
  return createPortal(<div className="builder-overlay">{body}</div>, document.body);
}

function SpellPickRow({ spell, on, toggle }) {
  return (
    <button className={`spell-pick ${on ? 'on' : ''}`} onClick={toggle} title={spell.casting_time}>
      <span className="spell-pick-name">{spell.name}</span>
      <span className="muted small">{spell.school}{spell.concentration ? ' · conc.' : ''}{spell.ritual ? ' · ritual' : ''}{spell.damage_type ? ` · ${spell.damage_type}` : ''}</span>
    </button>
  );
}

function ReviewPane({ name, raceDetail, meta, bgData, sheet }) {
  const derived = deriveSheet(sheet);
  return (
    <div>
      <div className="row" style={{ gap: 14, marginBottom: 10 }}>
        <Avatar sheet={sheet} name={name || 'Hero'} color={sheet.portrait?.color || 'var(--gold)'} size={72} />
        <div>
          <h3 style={{ color: 'var(--gold-bright)' }}>{name || 'Unnamed hero'}</h3>
          <p className="muted">Level 1 {sheet.raceName} {meta.name} · {bgData.name}</p>
        </div>
      </div>
      <div className="review-stats">
        <div className="review-stat"><span>HP</span><strong>{sheet.maxHp}</strong></div>
        <div className="review-stat"><span>AC</span><strong>{derived.ac}</strong></div>
        <div className="review-stat"><span>Initiative</span><strong>{fmtMod(derived.initiative)}</strong></div>
        <div className="review-stat"><span>Speed</span><strong>{sheet.speed} ft</strong></div>
        {ABILITIES.map((a) => (
          <div className="review-stat" key={a}><span>{a.toUpperCase()}</span><strong>{sheet.abilities[a]} <em className="gold-text">({fmtMod(derived.mods[a])})</em></strong></div>
        ))}
      </div>
      <h4 className="mt">Attacks</h4>
      <p>{derived.attacks.map((a) => `${a.name} ${fmtMod(a.bonus)} (${a.damage}${a.damageMod ? fmtMod(a.damageMod) : ''} ${a.damageType})`).join(' · ') || 'None'}</p>
      <h4 className="mt">Proficient skills</h4>
      <p>{sheet.profSkills.map((s) => SKILL_BY_INDEX[s].name).join(', ')}</p>
      {sheet.spellcasting && (
        <>
          <h4 className="mt">Magic</h4>
          <p>
            Spell save DC <strong>{derived.spell.dc}</strong> · spell attack <strong>{fmtMod(derived.spell.attackBonus)}</strong> ·{' '}
            {Object.entries(derived.spell.maxSlots).map(([lvl, n]) => (lvl === 'pact' ? `${n.slots} pact slots (lvl ${n.level})` : `${n} level-${lvl} slots`)).join(', ')}
          </p>
        </>
      )}
      <p className="muted small mt">Everything stays editable on your character sheet. Time to roll some dice.</p>
    </div>
  );
}

function spellPickCount(classIndex) {
  const meta = CLASS_META[classIndex];
  if (!meta || !meta.caster) return 0;
  if (meta.preparedKind === 'spellbook') return meta.l1.spellbook || 6;
  if (meta.preparedKind === 'known') return meta.l1.known || 0;
  // prepared casters pick their prepared list; assume +3 mod at creation for a friendly default
  return 4;
}

// Level-1 class features (hand-condensed from the SRD for readable sheets)
const CLASS_L1_FEATURES = {
  barbarian: [
    { name: 'Rage (2/long rest)', source: 'Barbarian 1', desc: 'Bonus action: advantage on STR checks/saves, +2 melee damage, resistance to bludgeoning/piercing/slashing damage. Lasts 1 minute.' },
    { name: 'Unarmored Defense', source: 'Barbarian 1', desc: 'AC = 10 + DEX + CON while not wearing armor.' },
  ],
  bard: [
    { name: 'Bardic Inspiration (d6)', source: 'Bard 1', desc: 'Bonus action: give a creature a d6 they can add to one attack, check, or save within 10 minutes. Uses = CHA modifier per long rest.' },
    { name: 'Ritual Casting', source: 'Bard 1', desc: 'Cast known ritual spells without a slot (+10 minutes).' },
  ],
  cleric: [
    { name: 'Divine Domain', source: 'Cleric 1', desc: 'Your calling within your faith (SRD: Life Domain) - grants bonus spells and features.' },
    { name: 'Ritual Casting', source: 'Cleric 1', desc: 'Cast prepared ritual spells without a slot (+10 minutes).' },
  ],
  druid: [
    { name: 'Druidic', source: 'Druid 1', desc: 'You know the secret language of druids.' },
    { name: 'Ritual Casting', source: 'Druid 1', desc: 'Cast prepared ritual spells without a slot (+10 minutes).' },
  ],
  fighter: [
    { name: 'Second Wind', source: 'Fighter 1', desc: 'Bonus action: regain 1d10 + fighter level HP. Once per short or long rest.' },
  ],
  monk: [
    { name: 'Unarmored Defense', source: 'Monk 1', desc: 'AC = 10 + DEX + WIS while wearing no armor and no shield.' },
    { name: 'Martial Arts (d4)', source: 'Monk 1', desc: 'Use DEX for unarmed/monk weapons; unarmed strikes deal 1d4; bonus-action unarmed strike after attacking.' },
  ],
  paladin: [
    { name: 'Divine Sense', source: 'Paladin 1', desc: 'Action: sense celestials, fiends, and undead within 60 ft. 1 + CHA mod uses per long rest.' },
    { name: 'Lay on Hands', source: 'Paladin 1', desc: 'Healing pool = 5 × paladin level per long rest; touch to restore HP.' },
  ],
  ranger: [
    { name: 'Favored Enemy', source: 'Ranger 1', desc: 'Advantage on Survival checks to track your favored enemies and INT checks to recall info about them.' },
    { name: 'Natural Explorer', source: 'Ranger 1', desc: 'Expert navigator in your favored terrain: travel faster, forage more, track better.' },
  ],
  rogue: [
    { name: 'Sneak Attack (1d6)', source: 'Rogue 1', desc: 'Once per turn: +1d6 damage with a finesse/ranged weapon if you have advantage or an ally is within 5 ft of the target.' },
    { name: "Thieves' Cant", source: 'Rogue 1', desc: 'Secret dialect of the criminal underworld.' },
  ],
  sorcerer: [
    { name: 'Draconic Resilience', source: 'Sorcerer 1', desc: '+1 HP per level; AC 13 + DEX when unarmored (SRD: Draconic Bloodline).' },
  ],
  warlock: [
    { name: 'Otherworldly Patron', source: 'Warlock 1', desc: 'Your pact (SRD: The Fiend) grants bonus spells and Dark One\'s Blessing: temp HP when you drop a foe.' },
    { name: 'Pact Magic', source: 'Warlock 1', desc: 'Your slots are few but recharge on a SHORT rest.' },
  ],
  wizard: [
    { name: 'Arcane Recovery', source: 'Wizard 1', desc: 'Once per day after a short rest, recover spell slots totaling half your wizard level (rounded up).' },
    { name: 'Spellbook', source: 'Wizard 1', desc: 'You prepare INT mod + level spells from your book after each long rest.' },
  ],
};
