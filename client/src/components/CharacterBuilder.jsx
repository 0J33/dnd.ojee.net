import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { characters as charsApi, srd } from '../api';
import { useDialog } from '../utils';
import {
  ABILITIES, ABILITY_NAMES, ABILITY_BLURBS, SKILLS, SKILL_BY_INDEX,
  CLASS_META, STANDARD_ARRAY, POINT_BUY_TOTAL, POINT_BUY_COST,
  STARTING_EQUIPMENT, RECOMMENDED_SPELLS, mod, fmtMod, level1Hp, preparedCount, deriveSheet,
  subclassLevel, SUBCLASS_LABEL, hpPerLevelBonus,
} from '../rules/engine';
import { resolveRace, needsSubrace, choicePool, racialBonuses as sumRacialBonuses, choicesComplete } from '../rules/race';
import { PREGENS } from '../data/pregens';
import { ChevronLeft, ChevronRight, D20Icon, SparkleIcon, XIcon } from './Icons';
import { Avatar, BODIES, lookOptions } from './Portrait';
import PortraitEditor, { PORTRAIT_COLORS, FigureStage } from './PortraitEditor';
import { useSources, SourceChip, SourceHead, SubclassPicker, useSubclass, subclassFeaturesBetween, pressable, groupBySource } from './ContentChoices';
import { FeatureItem, InfoTip, MoreText, SpellPickRow, PropertyChips } from './Explain';
import { ABILITY_DETAILS, SKILL_BRIEFS, ARMOR_CATEGORIES, VITALS } from '../rules/glossary';

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const FIGHTING_STYLES = [
  { id: 'defense', name: 'Defense', desc: '+1 AC while wearing armor. Simple and always useful.', acBonus: 1 },
  { id: 'dueling', name: 'Dueling', desc: '+2 damage with a one-handed weapon (and nothing in the other hand, shield ok).' },
  { id: 'archery', name: 'Archery', desc: '+2 to attack rolls with ranged weapons.' },
  { id: 'great-weapon', name: 'Great Weapon Fighting', desc: 'Reroll 1s and 2s on damage with two-handed weapons.' },
  { id: 'protection', name: 'Protection', desc: 'With a shield, use your reaction to give a foe disadvantage on an attack against an ally next to you.' },
  { id: 'two-weapon', name: 'Two-Weapon Fighting', desc: 'When you fight with a light weapon in each hand, the off-hand attack adds your ability modifier to its damage too.' },
];

/** A skill or ability button that says what it's for, under its name. */
function PickBrief({ name, brief, sub }) {
  return (
    <>
      <span>{name}{sub && <span className="muted"> ({sub})</span>}</span>
      {brief && <span className="skill-pick-brief">{brief}</span>}
    </>
  );
}

const STEPS = ['Start', 'Race', 'Class', 'Abilities', 'Background', 'Spells', 'Details', 'Review'];

const BUILDER_DRAFT = 'dnd.builderDraft';
function readBuilderDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(BUILDER_DRAFT) || 'null');
    if (!d || !(d.t > Date.now() - 14 * 24 * 3600 * 1000)) return null;
    return d.step || d.name || d.race || d.classIndex ? d.choices || null : null;
  } catch { return null; }
}
function writeBuilderDraft(c) {
  if (!c.step && !c.name && !c.race && !c.classIndex) return;
  try { localStorage.setItem(BUILDER_DRAFT, JSON.stringify({ t: Date.now(), step: c.step, name: c.name, race: c.race, classIndex: c.classIndex, choices: c })); } catch {}
}

export default function CharacterBuilder(props) {
  // "Start over" mounts a fresh builder (every choice back to its default).
  const [run, setRun] = useState(0);
  return <Builder key={run} {...props} onRestart={() => setRun((n) => n + 1)} />;
}

function Builder({ onClose, onSaved, embedded = false, onPickPregen = null, onRestart = null }) {
  const dialog = useDialog();
  const [draft] = useState(readBuilderDraft); // a hero half made before (below)
  const d = draft || {};
  const [step, setStep] = useState(d.step || 0);
  const [races, setRaces] = useState([]);
  const [raceDetail, setRaceDetail] = useState(null);
  const [backgrounds, setBackgrounds] = useState([]);
  const [spellList, setSpellList] = useState({ cantrips: [], level1: [] });
  const [saving, setSaving] = useState(false);

  // A hero half made survives a reload or a closed builder: every choice is
  // kept in localStorage (BUILDER_DRAFT) as it's made, and the builder opens
  // where you left it, with "Start over" beside the title. Saving the hero
  // (or taking a ready-made one) clears it.
  // The effects below reset later picks when an earlier one changes; on the
  // first run after restoring, the picks are the draft's and stay.
  const restoring = useRef(draft ? new Set(['race', 'picks', 'subclass', 'class']) : new Set());
  const firstRun = (k) => restoring.current.delete(k);

  // choices
  const [race, setRace] = useState(d.race ?? null);
  const [subrace, setSubrace] = useState(d.subrace ?? null);
  const [abilityPicks, setAbilityPicks] = useState(d.abilityPicks ?? []); // one array per race ability-choice group
  const [raceSkillPicks, setRaceSkillPicks] = useState(d.raceSkillPicks ?? []); // one array per race skill-choice group
  const [swapSkills, setSwapSkills] = useState(d.swapSkills ?? []); // replacements when race and background overlap
  const [classIndex, setClassIndex] = useState(d.classIndex ?? null);
  const [subclass, setSubclass] = useState(d.subclass ?? null); // summary; only for classes that choose at level 1
  const [method, setMethod] = useState(d.method ?? 'array');
  const [assign, setAssign] = useState(d.assign ?? {}); // ability -> base score
  const [rolled, setRolled] = useState(d.rolled ?? null);
  const [pb, setPb] = useState(d.pb ?? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  const [background, setBackground] = useState(d.background ?? null);
  const [classSkills, setClassSkills] = useState(d.classSkills ?? []);
  const [expertisePicks, setExpertisePicks] = useState(d.expertisePicks ?? []);
  const [fightingStyle, setFightingStyle] = useState(d.fightingStyle ?? 'defense');
  const [cantrips, setCantrips] = useState(d.cantrips ?? []);
  const [spells, setSpells] = useState(d.spells ?? []);
  const [name, setName] = useState(d.name ?? '');
  const [alignment, setAlignment] = useState(d.alignment ?? 'Neutral Good');
  const [personality, setPersonality] = useState(d.personality ?? { traits: '', ideals: '', bonds: '', flaws: '' });
  // A seed of its own from the start, so the look (gearforged plating
  // included) stays put when the hero is named.
  const [portrait, setPortrait] = useState(() => d.portrait ?? { color: PORTRAIT_COLORS[0], look: { seed: Math.random().toString(36).slice(2, 10) } });

  const choices = { step, race, subrace, abilityPicks, raceSkillPicks, swapSkills, classIndex, subclass, method, assign, rolled, pb, background, classSkills, expertisePicks, fightingStyle, cantrips, spells, name, alignment, personality, portrait };
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const draftOff = useRef(false); // saved or taken: nothing more to keep
  useEffect(() => {
    if (draftOff.current) return undefined;
    const t = setTimeout(() => writeBuilderDraft(choices), 300);
    return () => clearTimeout(t);
  }); // after every change
  useEffect(() => () => { if (!draftOff.current) writeBuilderDraft(choicesRef.current); }, []);
  const dropDraft = () => {
    draftOff.current = true;
    try { localStorage.removeItem(BUILDER_DRAFT); } catch {}
  };

  useEffect(() => {
    srd.races().then((r) => Array.isArray(r) && setRaces(r));
    srd.backgrounds().then((b) => Array.isArray(b) && setBackgrounds(b));
  }, []);

  useEffect(() => {
    if (!firstRun('race')) setSubrace(null);
    if (!race) return setRaceDetail(null);
    // Switching races quickly: only the race still picked may land (an
    // earlier answer arriving last used to overwrite it, leaving Next off).
    let live = true;
    srd.race(race).then((d) => {
      if (!live || !d || d.error) return;
      setRaceDetail(d);
      // a race with exactly one subrace (Hill Dwarf, High Elf…) just has it
      if (d.subrace_required && d.subraces.length === 1) setSubrace(d.subraces[0].index);
    });
    return () => { live = false; };
  }, [race]);

  // picks belong to one race + subrace combination
  useEffect(() => {
    if (firstRun('picks')) return;
    setAbilityPicks([]);
    setRaceSkillPicks([]);
  }, [race, subrace]);

  const sources = useSources();
  const resolved = useMemo(
    () => (raceDetail && raceDetail.index === race ? resolveRace(raceDetail, subrace) : null),
    [raceDetail, race, subrace],
  );
  const racialSkills = useMemo(
    () => (resolved ? uniq([...resolved.skills, ...raceSkillPicks.flat()]) : []),
    [resolved, raceSkillPicks],
  );

  const meta = classIndex ? CLASS_META[classIndex] : null;
  const choosesSubclassNow = !!classIndex && subclassLevel(classIndex) === 1;
  const subclassDetail = useSubclass(choosesSubclassNow ? subclass?.index : null);

  // Level-1 subclass classes start on the SRD option, which the builder used to
  // hand out automatically; anything else is one click away.
  useEffect(() => {
    if (!firstRun('subclass')) setSubclass(null);
    if (!choosesSubclassNow) return;
    let live = true;
    srd.subclasses(classIndex).then((list) => {
      const srdPick = Array.isArray(list) && list.find((x) => x.source === 'srd51');
      if (live && srdPick) setSubclass((prev) => prev || srdPick);
    });
    return () => { live = false; };
  }, [classIndex, choosesSubclassNow]);

  // load spell options when reaching the spells step
  useEffect(() => {
    if (!meta || !meta.caster || !classIndex) return;
    let live = true;
    Promise.all([
      srd.spells(`?class=${classIndex}&level=0`),
      srd.spells(`?class=${classIndex}&level=1`),
    ]).then(([c, s]) => {
      if (!live) return;
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
    return () => { live = false; };
  }, [classIndex, meta]);

  // preselect recommended spells when class changes
  useEffect(() => {
    if (firstRun('class') || !classIndex) return;
    const rec = RECOMMENDED_SPELLS[classIndex] || { cantrips: [], spells: [] };
    setCantrips(rec.cantrips.slice(0, meta?.l1?.cantrips ?? 0));
    setSpells(rec.spells.slice(0, spellPickCount(classIndex)));
    setClassSkills([]);
    setExpertisePicks([]);
  }, [classIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ability score helpers ----
  const racialBonuses = useMemo(() => sumRacialBonuses(resolved, abilityPicks), [resolved, abilityPicks]);

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
  const skillOptions = meta ? meta.skillChoices.from.filter((s) => !bgSkills.includes(s) && !racialSkills.includes(s)) : [];
  // 5e: a skill granted twice lets you take any other skill instead
  const overlapSkills = bgSkills.filter((s) => racialSkills.includes(s));
  const swapOptions = SKILLS.map((s) => s.index).filter((s) => !bgSkills.includes(s) && !racialSkills.includes(s) && !classSkills.includes(s));

  // a racial pick made after the class skills can't leave a duplicate behind
  useEffect(() => {
    setClassSkills((prev) => prev.filter((s) => !racialSkills.includes(s)));
    setSwapSkills([]);
  }, [racialSkills.join(','), background]); // eslint-disable-line react-hooks/exhaustive-deps
  const spellsNeeded = classIndex ? spellPickCount(classIndex) : 0;
  const cantripsNeeded = meta?.l1?.cantrips ?? 0;
  const isCaster = !!(meta && meta.caster && (cantripsNeeded > 0 || spellsNeeded > 0));

  const canNext = () => {
    switch (STEPS[step]) {
      case 'Start': return true;
      case 'Race':
        return !!resolved && !needsSubrace(raceDetail, subrace)
          && choicesComplete(resolved.ability_choices, abilityPicks)
          && choicesComplete(resolved.skill_choices, raceSkillPicks);
      case 'Class': return !!classIndex && (!choosesSubclassNow || !!subclassDetail) && (classIndex !== 'fighter' || !!fightingStyle);
      case 'Abilities': return !!finalScores && (method !== 'pointbuy' || pointsSpent <= POINT_BUY_TOTAL);
      case 'Background': {
        if (!background) return false;
        if (classSkills.length !== (meta?.skillChoices.n || 0)) return false;
        if (meta?.expertiseAtCreate && expertisePicks.length !== meta.expertiseAtCreate) return false;
        return swapSkills.length === overlapSkills.length;
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
    const features = resolved.traits.map((t) => ({ name: t.name, source: t.source, desc: t.desc }));
    for (const f of CLASS_L1_FEATURES[classIndex] || []) features.push(f);
    if (classIndex === 'fighter') {
      const style = FIGHTING_STYLES.find((s) => s.id === fightingStyle);
      features.push({ name: `Fighting Style: ${style.name}`, source: 'Fighter 1', desc: style.desc });
    }
    if (choosesSubclassNow && subclassDetail) {
      features.push({ name: `${SUBCLASS_LABEL[classIndex]}: ${subclassDetail.name}`, source: `${meta.name} 1`, desc: subclassDetail.desc });
      features.push(...subclassFeaturesBetween(subclassDetail, 1, 1));
    }
    features.push({ name: bgData.feature.name, source: bgData.name, desc: bgData.feature.desc });

    const equipment = (STARTING_EQUIPMENT[classIndex] || []).map((e) => ({ ...e }));
    for (const item of bgData.equipment || []) equipment.push({ name: item.name, qty: item.qty, kind: 'gear' });

    const languages = resolved.languages.length ? [...resolved.languages] : ['Common'];
    for (const note of resolved.language_notes) languages.push(`(${note})`);
    const subclassFields = {
      subclass: choosesSubclassNow && subclassDetail ? subclassDetail.index : null,
      subclassName: choosesSubclassNow && subclassDetail ? subclassDetail.name : null,
    };
    const perLevel = hpPerLevelBonus({ race, hpPerLevel: resolved.hp_per_level, classIndex, ...subclassFields });

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
      race, raceName: resolved.name, raceSource: resolved.race.source,
      subrace: resolved.sub?.index || null, subraceName: resolved.sub?.name || null,
      classIndex, className: meta.name,
      ...subclassFields,
      background, alignment,
      level: 1, xp: 0, abilityMethod: method,
      abilities: finalScores,
      speed: resolved.speed || 30,
      size: resolved.size || 'Medium',
      darkvision: resolved.darkvision || 0,
      hpPerLevel: resolved.hp_per_level,
      naturalAttacks: resolved.natural_attacks.map((a) => ({ ...a })),
      maxHp: level1Hp(classIndex, finalScores, perLevel),
      currentHp: level1Hp(classIndex, finalScores, perLevel),
      tempHp: 0,
      hitDiceRemaining: 1,
      deathSaves: { s: 0, f: 0 },
      inspiration: false,
      conditions: [],
      exhaustion: 0,
      profSaves: meta.saves,
      profSkills: uniq([...bgSkills, ...racialSkills, ...classSkills, ...swapSkills]),
      expertiseSkills: expertisePicks,
      languages,
      armorProfs: uniq([...meta.armor.map((a) => a[0].toUpperCase() + a.slice(1)), ...resolved.armor_profs]),
      weaponProfs: uniq([typeof meta.weapons === 'string' ? meta.weapons : 'Simple weapons', ...resolved.weapon_profs]),
      toolProfs: uniq([...(bgData.tool_proficiencies || []), ...resolved.tool_profs]),
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
      portrait: { ...portrait, icon: classIndex },
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
    if (res && res.id) { dropDraft(); onSaved(res); }
    else dialog.alert((res && res.error) || 'Could not save character');
  };

  const pickPregen = async (pregen) => {
    if (onPickPregen) { dropDraft(); return onPickPregen(pregen); }
    if (saving) return;
    setSaving(true);
    const res = await charsApi.create(pregen.sheet.name, pregen.sheet);
    setSaving(false);
    if (res && res.id) { dropDraft(); onSaved(res); }
    else dialog.alert((res && res.error) || 'Could not save character');
  };

  // Each step opens at its top, not wherever the last step was scrolled to.
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  // Keyboard focus starts inside the builder, not on the page behind it.
  const rootRef = useRef(null);
  useEffect(() => {
    if (embedded || !rootRef.current) return undefined;
    const before = document.activeElement;
    if (!rootRef.current.contains(document.activeElement)) rootRef.current.focus({ preventScroll: true });
    return () => {
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [embedded]);

  const lookSheet = { name: name || 'Hero', race, subrace, classIndex, raceName: resolved && resolved.name, className: meta && meta.name, portrait };
  const body = (
    <div ref={rootRef} tabIndex={-1} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label="Create a hero" className={`builder ${embedded ? 'builder-embedded' : ''}`}>
      <div className="builder-head">
        <h2><D20Icon size={18} /> Create a hero</h2>
        {draft && !draftOff.current && (
          <button className="link-btn small builder-restart" title="Forget these choices and begin again" onClick={() => { dropDraft(); onRestart ? onRestart() : null; }}>
            Start over
          </button>
        )}
        <div className="builder-steps">
          {STEPS.map((s, i) => (
            <span key={s} className={`builder-step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''} ${s === 'Spells' && !isCaster && classIndex ? 'skipped' : ''}`}>
              {s}
            </span>
          ))}
        </div>
        {!embedded && <button className="close-btn" onClick={onClose} aria-label="Close the hero builder"><XIcon size={16} /></button>}
      </div>

      <div className="builder-mid">
      <div className="builder-body" ref={bodyRef}>
        {STEPS[step] === 'Start' && (
          <div>
            <p className="builder-intro">
              Every adventurer is defined by a <strong>race</strong> (ancestry), a <strong>class</strong> (profession),
              a <strong>background</strong> (past life), and six <strong>ability scores</strong>. The builder walks you
              through each choice – nothing to memorize. Or grab a ready-made hero and start playing now.
            </p>
            <h4 className="mt">Quick start – pick a ready-made hero</h4>
            <div className="pregen-grid">
              {PREGENS.map((p) => (
                <div key={p.id} className="pregen-card" {...pressable(() => pickPregen(p))}>
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
            {/* Body first: it sets the hero's build, face and hair defaults
                from the very first preview (and stays editable under Details). */}
            {(!race || lookOptions(lookSheet).bodies) && (
              <div className="builder-body-pick" role="group" aria-label="Body">
                <span className="pe-label">Body</span>
                {Object.entries(BODIES).map(([k, label]) => (
                  <button
                    key={k} type="button"
                    className={`pe-chip ${portrait.look?.body === k ? 'on' : ''}`}
                    aria-pressed={portrait.look?.body === k}
                    onClick={() => setPortrait({ ...portrait, look: { ...(portrait.look || {}), body: k } })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <p className="builder-intro">
              Your race shapes what you are: size, speed, senses, and natural talents. There is no wrong pick. The core
              races come first; the rest are from open-licensed expansion books.
            </p>
            {groupBySource(races.map((r) => ({ ...r, source: r.source === 'srd52' ? 'srd51' : r.source, bookSource: r.source })), sources).map(([group, items]) => (
              <section key={group} className="source-group">
                {group === 'srd51'
                  ? <div className="source-group-head"><span>Core races</span><span className="muted small">System Reference Document</span></div>
                  : <SourceHead source={group} sources={sources} />}
                <div className="choice-grid">
                  {items.map((r) => (
                    <RaceCard key={r.index} r={r} sources={sources} selected={race === r.index} onPick={() => setRace(race === r.index ? null : r.index)} />
                  ))}
                </div>
                {resolved && items.some((r) => r.index === race) && (
                  <RaceOptions
                    raceDetail={raceDetail} resolved={resolved} sources={sources}
                    subrace={subrace} setSubrace={setSubrace}
                    abilityPicks={abilityPicks} setAbilityPicks={setAbilityPicks}
                    raceSkillPicks={raceSkillPicks} setRaceSkillPicks={setRaceSkillPicks}
                  />
                )}
              </section>
            ))}
          </div>
        )}

        {STEPS[step] === 'Class' && (
          <div>
            <p className="builder-intro">Your class is your job in the party: how you fight, what you're good at, and whether you sling spells.</p>
            <div className="choice-grid">
              {Object.entries(CLASS_META).map(([idx, c]) => (
                <div key={idx} className={`choice-card ${classIndex === idx ? 'selected' : ''}`} aria-pressed={classIndex === idx} {...pressable(() => setClassIndex(classIndex === idx ? null : idx))}>
                  <h4>{c.name} {c.caster && <span className="chip magic">magic</span>}</h4>
                  <p>{c.blurb}</p>
                  <p className="choice-playstyle"><ChevronRight size={12} /> {c.playstyle}</p>
                  <div className="choice-tags">
                    <span className="chip">d{c.hitDie} hit die</span>
                    <span className="chip gold">{c.primary.map((a) => a.toUpperCase()).join(' & ')}</span>
                  </div>
                </div>
              ))}
            </div>
            {meta && <ClassPreview classIndex={classIndex} meta={meta} />}
            {classIndex === 'fighter' && (
              <div className="mt">
                <h4>Fighting style</h4>
                <p className="muted small">A fighting style is a permanent bonus for the way you like to fight. Pick the one that fits your weapon.</p>
                <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {FIGHTING_STYLES.map((s) => (
                    <div key={s.id} className={`choice-card slim ${fightingStyle === s.id ? 'selected' : ''}`} aria-pressed={fightingStyle === s.id} {...pressable(() => setFightingStyle(fightingStyle === s.id ? null : s.id))}>
                      <h4>{s.name}</h4>
                      <p>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {choosesSubclassNow && (
              <div className="mt">
                <h4>{SUBCLASS_LABEL[classIndex]} - {meta.name}s choose theirs at level 1</h4>
                <p className="muted small">Your {SUBCLASS_LABEL[classIndex].toLowerCase()} is your speciality within the class. The first option is the classic SRD pick.</p>
                <SubclassPicker classIndex={classIndex} value={subclass?.index} onChange={setSubclass} />
                {subclassDetail && <SubclassPreview detail={subclassDetail} level={1} />}
              </div>
            )}
            {classIndex && !choosesSubclassNow && (
              <p className="muted small mt">
                You'll choose your {SUBCLASS_LABEL[classIndex].toLowerCase()} when you reach level {subclassLevel(classIndex)}.
              </p>
            )}
          </div>
        )}

        {STEPS[step] === 'Abilities' && (
          <div>
            <p className="builder-intro">
              Six numbers define your raw talent, from 8 (weak) to 15+ (heroic). Each gives a <strong>modifier</strong> -
              the number you actually add to dice rolls. {meta && <>For a {meta.name}, <strong>{meta.primary.map((a) => ABILITY_NAMES[a]).join(' and ')}</strong> {meta.primary.length > 1 ? 'matter' : 'matters'} most.</>}
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
                    <div className="ability-slot-blurb">
                      {ABILITY_BLURBS[a]}{' '}
                      <InfoTip label={ABILITY_NAMES[a]} size={13}>
                        <p>{ABILITY_DETAILS[a].uses}</p>
                        <p className="muted small">Your modifier is (score - 10) / 2, rounded down: 10 gives +0, 14 gives +2, 8 gives -1.</p>
                      </InfoTip>
                    </div>
                    <div className="ability-slot-controls">
                      {method === 'pointbuy' ? (
                        <div className="ability-stepper">
                          <button className="small-btn" aria-label={`Lower ${ABILITY_NAMES[a]}`} disabled={pb[a] <= 8} onClick={() => setPb({ ...pb, [a]: pb[a] - 1 })}>−</button>
                          <strong className="ability-slot-score">{pb[a]}</strong>
                          <button className="small-btn" aria-label={`Raise ${ABILITY_NAMES[a]}`} disabled={pb[a] >= 15 || pointsSpent >= POINT_BUY_TOTAL} onClick={() => setPb({ ...pb, [a]: pb[a] + 1 })}>+</button>
                        </div>
                      ) : (
                        <select
                          aria-label={`${ABILITY_NAMES[a]} score`}
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
            <p className="builder-intro">Your background is who you were before adventuring – it grants two skills and a story hook.</p>
            <div className="choice-grid">
              {backgrounds.map((b) => (
                <div key={b.index} className={`choice-card ${background === b.index ? 'selected' : ''}`} aria-pressed={background === b.index} {...pressable(() => {
                  if (background === b.index) { setBackground(null); return; }
                  setBackground(b.index);
                  setPersonality({
                    traits: b.suggested_personality.traits[0],
                    ideals: b.suggested_personality.ideals[0],
                    bonds: b.suggested_personality.bonds[0],
                    flaws: b.suggested_personality.flaws[0],
                  });
                  setClassSkills((prev) => prev.filter((s) => !b.skill_proficiencies.includes(s)));
                })}>
                  <h4>{b.name}</h4>
                  <p>{b.blurb}</p>
                  {b.feature && (
                    <div className="bg-feature">
                      <strong>Feature: {b.feature.name}.</strong> <MoreText text={b.feature.desc} max={110} />
                    </div>
                  )}
                  <div className="choice-tags">
                    {b.skill_proficiencies.map((s) => <span className="chip gold" key={s} title={SKILL_BRIEFS[s]}>{SKILL_BY_INDEX[s].name}</span>)}
                    {(b.tool_proficiencies || []).map((t) => <span className="chip" key={t}>{t}</span>)}
                    {b.gold ? <span className="chip">{b.gold} gp</span> : null}
                  </div>
                </div>
              ))}
            </div>

            {background && (
              <div className="mt">
                <h4>Class skills – pick {meta.skillChoices.n} ({classSkills.length}/{meta.skillChoices.n})</h4>
                <p className="muted small">
                  You're already proficient in {bgSkills.map((s) => SKILL_BY_INDEX[s].name).join(' and ')} from your background
                  {racialSkills.length > 0 && <> and {racialSkills.map((s) => SKILL_BY_INDEX[s].name).join(', ')} from your race</>}.
                </p>
                <p className="muted small">A skill you are trained in adds your proficiency bonus (+2 at level 1) whenever you roll it.</p>
                <div className="skill-pick-grid with-briefs">
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
                        <PickBrief name={SKILL_BY_INDEX[s].name} sub={SKILL_BY_INDEX[s].ability.toUpperCase()} brief={SKILL_BRIEFS[s]} />
                      </button>
                    );
                  })}
                </div>
                {overlapSkills.length > 0 && (
                  <div className="mt">
                    <h4>Replacement skill{overlapSkills.length > 1 ? 's' : ''} ({swapSkills.length}/{overlapSkills.length})</h4>
                    <p className="muted small">
                      Your race and background both give you {overlapSkills.map((s) => SKILL_BY_INDEX[s].name).join(' and ')}, so you pick
                      {overlapSkills.length > 1 ? ` ${overlapSkills.length} other skills` : ' another skill'} instead.
                    </p>
                    <div className="skill-pick-grid with-briefs">
                      {swapOptions.concat(swapSkills.filter((s) => !swapOptions.includes(s))).map((s) => {
                        const on = swapSkills.includes(s);
                        return (
                          <button key={s} className={`skill-pick ${on ? 'on' : ''}`} onClick={() => {
                            if (on) setSwapSkills(swapSkills.filter((x) => x !== s));
                            else if (swapSkills.length < overlapSkills.length) setSwapSkills([...swapSkills, s]);
                          }}>
                            <PickBrief name={SKILL_BY_INDEX[s].name} sub={SKILL_BY_INDEX[s].ability.toUpperCase()} brief={SKILL_BRIEFS[s]} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {meta.expertiseAtCreate && (
                  <div className="mt">
                    <h4>Expertise – double your bonus in {meta.expertiseAtCreate} skills ({expertisePicks.length}/{meta.expertiseAtCreate})</h4>
                    <p className="muted small">Expertise doubles your proficiency bonus for that skill: pick the ones you want to be the best at.</p>
                    <div className="skill-pick-grid with-briefs">
                      {uniq([...bgSkills, ...racialSkills, ...classSkills, ...swapSkills]).map((s) => {
                        const on = expertisePicks.includes(s);
                        return (
                          <button key={s} className={`skill-pick ${on ? 'on' : ''}`} onClick={() => {
                            if (on) setExpertisePicks(expertisePicks.filter((x) => x !== s));
                            else if (expertisePicks.length < meta.expertiseAtCreate) setExpertisePicks([...expertisePicks, s]);
                          }}>
                            <PickBrief name={SKILL_BY_INDEX[s].name} brief={SKILL_BRIEFS[s]} />
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
              up spell slots (you get them back on a long rest). We pre-picked a solid beginner set – change anything you like.
              Each spell says what it does; tap <strong>(i)</strong> for the whole entry.
            </p>
            <h4>Cantrips – pick {cantripsNeeded} ({cantrips.length}/{cantripsNeeded})</h4>
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
            <label className="field-label" htmlFor="hero-name">Character name</label>
            <input id="hero-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kaelen Brightspear" maxLength={40} style={{ width: '100%' }} />
            <label className="field-label">
              Portrait <span className="field-hint">it follows you onto the battle map, so the table always knows which token is you</span>
            </label>
            <PortraitEditor
              sheet={{ name: name || 'Hero', race, subrace, classIndex, raceName: resolved && resolved.name, className: meta && meta.name }}
              portrait={portrait}
              onChange={setPortrait}
              showFigure={false}
            />
            <label className="field-label" htmlFor="hero-alignment">
              Alignment <span className="field-hint">your moral compass, just a roleplay guide</span>
            </label>
            <select id="hero-alignment" value={alignment} onChange={(e) => setAlignment(e.target.value)} style={{ width: '100%' }}>
              {['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'].map((a) => <option key={a}>{a}</option>)}
            </select>
            {bgData && (
              <>
                <label className="field-label">
                  Personality <span className="field-hint">prefilled from your background, change anything</span>
                </label>
                {['traits', 'ideals', 'bonds', 'flaws'].map((k) => (
                  <div key={k} className="row mb" style={{ alignItems: 'flex-start' }}>
                    <span className="chip" style={{ width: 64, justifyContent: 'center', textTransform: 'capitalize' }}>{k}</span>
                    <select
                      className="grow"
                      aria-label={`Personality ${k}`}
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

        {STEPS[step] === 'Review' && finalScores && resolved && meta && bgData && (
          <ReviewPane
            name={name} meta={meta} bgData={bgData}
            sheet={buildSheet()}
          />
        )}
      </div>
      {step > 0 && race && (
        // The hero as they'll look, beside every step: it changes as you
        // pick race, class and looks.
        <aside className="builder-figure" aria-label="Your hero so far">
          <Avatar sheet={lookSheet} name={name || 'Hero'} color={portrait.color} size={88} />
          <Suspense fallback={<div className="figure-stage builder-figure-stage" />}>
            <FigureStage sheet={lookSheet} height="100%" className="builder-figure-stage" />
          </Suspense>
          <p className="builder-figure-cap">
            <strong>{name || 'Your hero'}</strong>
            <span>{[resolved && resolved.name, meta && meta.name].filter(Boolean).join(' ') || 'Choose a race'}</span>
          </p>
        </aside>
      )}
      </div>

      <div className="builder-foot">
        <button onClick={step === 0 ? onClose : back}>
          <ChevronLeft size={13} /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="grow" />
        {STEPS[step] === 'Review' ? (
          <button className="primary-btn big-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Forge this hero'}
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

function RaceCard({ r, sources, selected, onPick }) {
  const speed = r.speeds && r.speeds.length > 1 ? `${r.speeds[0]}-${r.speeds[r.speeds.length - 1]} ft` : `${r.speed} ft`;
  const size = r.sizes && r.sizes.length > 1 ? 'Small or Medium' : r.size;
  return (
    <div className={`choice-card ${selected ? 'selected' : ''}`} aria-pressed={selected} {...pressable(onPick)}>
      <h4>{r.name} <SourceChip source={r.bookSource} sources={sources} /></h4>
      <p>{r.blurb}</p>
      <div className="choice-tags">
        <span className="chip gold">{r.asi_summary}</span>
        <span className="chip">Speed {speed}</span>
        {size !== 'Medium' && <span className="chip">{size}</span>}
        {r.darkvision > 0 && <span className="chip">Darkvision {r.darkvision} ft</span>}
      </div>
    </div>
  );
}

// Everything left to decide once a race is picked: subrace, floating ability
// increases, skill picks – plus the full trait list, so nothing is a surprise.
function RaceOptions({ raceDetail, resolved, subrace, setSubrace, abilityPicks, setAbilityPicks, raceSkillPicks, setRaceSkillPicks }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [raceDetail.index]);

  const subs = raceDetail.subraces || [];
  const pickSub = subs.length > 1 || (raceDetail.subrace_optional && subs.length > 0);
  const label = (raceDetail.subrace_label || 'Subrace').toLowerCase();

  // functional so two quick clicks can't overwrite each other's pick
  const toggleIn = (setter, i, value, limit) => setter((prev) => {
    const cur = prev[i] || [];
    const next = [...prev];
    if (cur.includes(value)) next[i] = cur.filter((x) => x !== value);
    else if (cur.length < limit) next[i] = [...cur, value];
    else return prev;
    return next;
  });

  return (
    <div className="race-options" ref={ref}>
      <h3>{resolved.name}</h3>
      {raceDetail.desc && <p className="muted small">{raceDetail.desc}</p>}

      {!pickSub && subs.length === 1 && (
        <p className="muted small">Includes the {subs[0].name} {label} - its bonuses are applied automatically.</p>
      )}
      {pickSub && (
        <>
          <h4 className="mt">Choose your {label}</h4>
          <div className="choice-grid subrace-grid">
            {raceDetail.subrace_optional && (
              <div className={`choice-card slim ${!subrace ? 'selected' : ''}`} aria-pressed={!subrace} {...pressable(() => setSubrace(null))}>
                <h4>{raceDetail.subrace_none || `No ${label}`}</h4>
                <p>The {raceDetail.name.toLowerCase()} as described above.</p>
                <div className="choice-tags"><span className="chip gold">{raceDetail.asi_summary}</span></div>
              </div>
            )}
            {subs.map((sr) => (
              <div key={sr.index} className={`choice-card slim ${subrace === sr.index ? 'selected' : ''}`} aria-pressed={subrace === sr.index} {...pressable(() => setSubrace(subrace === sr.index ? null : sr.index))}>
                <h4>{sr.name}</h4>
                <p>{sr.blurb}</p>
                <div className="choice-tags">
                  {sr.asi_summary && <span className="chip gold">{sr.replaces_ability ? `${sr.asi_summary} instead` : sr.asi_summary}</span>}
                  {sr.size && sr.size !== raceDetail.size && <span className="chip">{sr.size}</span>}
                  {sr.speed && sr.speed !== raceDetail.speed && <span className="chip">Speed {sr.speed} ft</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {resolved.ability_choices.map((c, i) => {
        const mine = abilityPicks[i] || [];
        // picks are distinct across groups, except a stackable group (a shade's
        // living-origin +1), which may land on an already-raised score
        const taken = c.stackable ? [] : abilityPicks.filter((_, j) => j !== i && !resolved.ability_choices[j]?.stackable).flat();
        const pool = choicePool(c);
        return (
          <div key={`a${i}`} className="mt">
            <h4>+{c.bonus} to {c.choose === 1 ? 'one score' : `${['', 'one', 'two', 'three'][c.choose] || c.choose} different scores`}{c.label ? ` ${c.label}` : ''} ({mine.length}/{c.choose})</h4>
            <div className="skill-pick-grid with-briefs">
              {ABILITIES.map((a) => {
                const on = mine.includes(a);
                const blocked = !pool.includes(a) || taken.includes(a) || (!on && mine.length >= c.choose);
                return (
                  <button key={a} className={`skill-pick ${on ? 'on' : ''}`} disabled={blocked && !on}
                    onClick={() => toggleIn(setAbilityPicks, i, a, c.choose)}>
                    <PickBrief name={ABILITY_NAMES[a]} brief={ABILITY_DETAILS[a].brief} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {resolved.skill_choices.map((c, i) => {
        const mine = raceSkillPicks[i] || [];
        const taken = [...resolved.skills, ...raceSkillPicks.filter((_, j) => j !== i).flat()];
        const pool = (c.from || SKILLS.map((x) => x.index)).filter((x) => !taken.includes(x));
        return (
          <div key={`s${i}`} className="mt">
            <h4>Pick {c.choose} skill{c.choose > 1 ? 's' : ''} ({mine.length}/{c.choose})</h4>
            <div className="skill-pick-grid with-briefs">
              {pool.map((sk) => {
                const on = mine.includes(sk);
                return (
                  <button key={sk} className={`skill-pick ${on ? 'on' : ''}`} disabled={!on && mine.length >= c.choose}
                    onClick={() => toggleIn(setRaceSkillPicks, i, sk, c.choose)}>
                    <PickBrief name={SKILL_BY_INDEX[sk].name} sub={SKILL_BY_INDEX[sk].ability.toUpperCase()} brief={SKILL_BRIEFS[sk]} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <h4 className="mt">What you get</h4>
      <p className="muted small">
        Speed is how far you move each turn (5 ft per square).{resolved.darkvision > 0 ? ' Darkvision lets you see in the dark, in shades of grey.' : ''} Each trait below
        says what it does; tap more for the full rule.
      </p>
      <div className="choice-tags mb">
        <span className="chip">{resolved.size}</span>
        <span className="chip">Speed {resolved.speed} ft</span>
        {resolved.darkvision > 0 && <span className="chip" title="You see in darkness as if it were dim light, in shades of grey">Darkvision {resolved.darkvision} ft</span>}
        {resolved.skills.map((sk) => <span key={sk} className="chip gold" title={SKILL_BRIEFS[sk]}>{SKILL_BY_INDEX[sk].name}</span>)}
        {resolved.natural_attacks.map((n) => <span key={n.name} className="chip ember">{n.name} {n.damage} {n.damageType}</span>)}
        {resolved.languages.length > 0 && <span className="chip">{resolved.languages.join(', ')}{resolved.language_notes.length ? ' +' : ''}</span>}
      </div>
      <div className="feature-list">
        {resolved.traits.map((t) => (
          <FeatureItem key={`${t.source}-${t.name}`} name={t.name} source={t.source} desc={t.desc} />
        ))}
      </div>
    </div>
  );
}

const ARMOR_WORDS = { light: 'light', medium: 'medium', heavy: 'heavy', shields: 'shields' };

// What a level-1 hero of the picked class gets, before Next.
function ClassPreview({ classIndex, meta }) {
  const feats = CLASS_L1_FEATURES[classIndex] || [];
  const armor = meta.armor.length ? meta.armor.map((a) => ARMOR_WORDS[a] || a).join(', ') : 'none';
  return (
    <div className="race-options class-preview">
      <h3>A level 1 {meta.name}</h3>
      <dl className="class-facts">
        <dt>Hit points</dt>
        <dd>{meta.hitDie} + your CON modifier, and about {AVG_DIE[meta.hitDie]} more each level (a d{meta.hitDie} hit die). Higher is tougher.</dd>
        <dt>Saving throws</dt>
        <dd>
          Trained in {meta.saves.map((a) => ABILITY_NAMES[a]).join(' and ')} saves.{' '}
          <InfoTip label="Saving throws" size={13}>{VITALS.save}</InfoTip>
        </dd>
        <dt>Armor</dt>
        <dd>
          {armor}{' '}
          {meta.armor.length > 0 && (
            <InfoTip label="Armor" size={13}>
              {meta.armor.map((a) => <p key={a}>{ARMOR_CATEGORIES[a === 'shields' ? 'shield' : a]}</p>)}
              <p className="muted small">Wearing armor you aren't trained in ruins your attacks and spells.</p>
            </InfoTip>
          )}
        </dd>
        <dt>Weapons</dt>
        <dd>{meta.weapons === 'martial' ? 'all weapons (simple and martial)' : meta.weapons === 'simple' ? 'simple weapons (clubs, daggers, maces, spears, light crossbows...)' : meta.weapons}</dd>
        {meta.caster && <><dt>Magic</dt><dd>Casts spells using {ABILITY_NAMES[meta.castingAbility]}. You pick them in the Spells step.</dd></>}
      </dl>
      {feats.length > 0 && (
        <div className="feature-list">
          {feats.map((f) => <FeatureItem key={f.name} name={f.name} source={f.source} desc={f.desc} />)}
        </div>
      )}
    </div>
  );
}
const AVG_DIE = { 6: 4, 8: 5, 10: 6, 12: 7 };

function SubclassPreview({ detail, level }) {
  const feats = (detail.levels || {})[level] || [];
  const later = Object.keys(detail.levels || {}).map(Number).filter((l) => l > level);
  return (
    <div className="race-options">
      <h3>{detail.name}</h3>
      <MoreText className="muted small" text={detail.desc} max={220} />
      <div className="feature-list mt">
        {feats.map((f) => (
          <FeatureItem key={f.name} name={f.name} source={`level ${level}`} desc={f.desc} />
        ))}
      </div>
      {later.length > 0 && <p className="muted small mt">More features at levels {later.join(', ')}.</p>}
    </div>
  );
}

function ReviewPane({ name, meta, bgData, sheet }) {
  const derived = deriveSheet(sheet);
  return (
    <div>
      <div className="row" style={{ gap: 14, marginBottom: 10 }}>
        <Avatar sheet={sheet} name={name || 'Hero'} color={sheet.portrait?.color || 'var(--gold)'} size={72} />
        <div>
          <h3 style={{ color: 'var(--gold-bright)' }}>{name || 'Unnamed hero'}</h3>
          <p className="muted">Level 1 {sheet.raceName} {meta.name}{sheet.subclassName ? ` (${sheet.subclassName})` : ''} · {bgData.name}</p>
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
      <p className="muted small">To attack, roll d20 + the bonus; if it meets the target's AC you hit and roll the damage.</p>
      {derived.attacks.length ? (
        <ul className="review-attacks">
          {derived.attacks.map((a) => (
            <li key={a.name}>
              <strong>{a.name}</strong> {fmtMod(a.bonus)} to hit, {a.damage}{a.damageMod ? fmtMod(a.damageMod) : ''} {a.damageType}{' '}
              <PropertyChips properties={a.properties} range={a.range} />
            </li>
          ))}
        </ul>
      ) : <p>None</p>}
      <h4 className="mt">Proficient skills</h4>
      <p>{sheet.profSkills.map((s) => SKILL_BY_INDEX[s].name).join(', ')}</p>
      <h4 className="mt">What your hero can do</h4>
      <div className="feature-list">
        {sheet.features.map((f) => <FeatureItem key={`${f.source}-${f.name}`} name={f.name} source={f.source} desc={f.desc} max={140} />)}
      </div>
      {sheet.spellcasting && (
        <>
          <h4 className="mt">Magic</h4>
          <p>
            Spell save DC <strong>{derived.spell.dc}</strong> <InfoTip label="Spell save DC" size={13}>{VITALS.saveDc}</InfoTip>
            {' '}· spell attack <strong>{fmtMod(derived.spell.attackBonus)}</strong> <InfoTip label="Spell attack" size={13}>{VITALS.spellAttack}</InfoTip> ·{' '}
            {Object.entries(derived.spell.maxSlots).map(([lvl, n]) => (lvl === 'pact' ? `${n.slots} pact slots (lvl ${n.level})` : `${n} level-${lvl} slots`)).join(', ')}
            {' '}<InfoTip label="Spell slots" size={13}>{VITALS.slots}</InfoTip>
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

// Level-1 class features (hand-condensed from the SRD for readable sheets).
// Subclass features (Divine Domain, Sorcerous Origin, Otherworldly Patron) come
// from the chosen subclass instead.
const SPELLCASTING = (cls, ability, how) => ({
  name: 'Spellcasting', source: `${cls} 1`,
  desc: `You cast spells using ${ability}. Cantrips are free and unlimited; spells of level 1 and up each use a spell slot, and your slots come back after a long rest. ${how}`,
});
const CLASS_L1_FEATURES = {
  barbarian: [
    { name: 'Rage (2/long rest)', source: 'Barbarian 1', desc: 'Bonus action: for 1 minute you have advantage on STR checks and saves, +2 damage with melee weapon attacks, and take half damage from bludgeoning, piercing and slashing. No spells while raging, and it ends early if you stop attacking or taking damage.' },
    { name: 'Unarmored Defense', source: 'Barbarian 1', desc: 'AC = 10 + DEX + CON while not wearing armor (a shield is fine).' },
  ],
  bard: [
    SPELLCASTING('Bard', 'Charisma', 'You know a fixed set of spells and can swap one each time you level.'),
    { name: 'Bardic Inspiration (d6)', source: 'Bard 1', desc: 'Bonus action: give a creature a d6 they can add to one attack, check, or save within 10 minutes. Uses = CHA modifier per long rest.' },
    { name: 'Ritual Casting', source: 'Bard 1', desc: 'Cast known ritual spells without a slot (+10 minutes).' },
  ],
  cleric: [
    SPELLCASTING('Cleric', 'Wisdom', 'After a long rest you choose which cleric spells to have ready (prepared).'),
    { name: 'Ritual Casting', source: 'Cleric 1', desc: 'Cast prepared ritual spells without a slot (+10 minutes).' },
  ],
  druid: [
    SPELLCASTING('Druid', 'Wisdom', 'After a long rest you choose which druid spells to have ready (prepared).'),
    { name: 'Druidic', source: 'Druid 1', desc: 'You know Druidic, the secret language of druids, and can leave hidden messages in it that only druids notice.' },
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
    { name: 'Expertise', source: 'Rogue 1', desc: 'Two skills of your choice get double your proficiency bonus.' },
    { name: "Thieves' Cant", source: 'Rogue 1', desc: "The secret slang and signs of the criminal underworld: hide a message in ordinary talk, or read the marks thieves leave for each other." },
  ],
  sorcerer: [
    SPELLCASTING('Sorcerer', 'Charisma', 'Magic is in your blood: you know a few spells and can swap one each time you level.'),
  ],
  warlock: [
    { name: 'Pact Magic', source: 'Warlock 1', desc: 'You cast spells using Charisma. You have only one or two spell slots, but they always cast at your highest slot level and come back after a SHORT rest (an hour), not just a long one. Cantrips are free.' },
  ],
  wizard: [
    SPELLCASTING('Wizard', 'Intelligence', 'Your spells live in your spellbook; after a long rest you prepare INT modifier + level of them.'),
    { name: 'Arcane Recovery', source: 'Wizard 1', desc: 'Once per day after a short rest, recover spell slots totaling half your wizard level (rounded up).' },
  ],
};
