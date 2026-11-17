import { withPlaceHidden, getPlaceHidden } from '../mapSelection';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket';
import { srd } from '../api';
import { CONDITIONS } from '../rules/engine';
import { tokenFromMonster, numberedLabel } from '../rules/tokens';
import { ENCOUNTER_THEMES, DIFFICULTIES, buildEncounter, describeEncounter, partyOf } from '../data/encounters';
import { NPC_PRESETS, THING_PRESETS, SCENE_TEMPLATES, npcName, ambushObject, sceneFromTemplate } from '../data/presets';
import { STAMPS } from '../data/mapKit';
import { useOutsideClick, useEscapeKey } from '../utils';
import { useAutoSave } from '../autosave';
import { SceneThumb } from './ScenePrep';
import { Avatar, artForToken } from './Portrait';
import {
  XIcon, SwordIcon, SkullIcon, PersonIcon, PlusIcon, MinusIcon, EyeIcon, EyeOffIcon, TrashIcon, LockIcon, MapIcon, SparkleIcon,
  DuplicateIcon, FogIcon, CoinsIcon, LayersIcon, ConditionIcon, HeartIcon, ShieldIcon, RestartIcon, CheckIcon, ScrollIcon,
} from './Icons';
import '../styles/dmquick.css';

// The DM's fast lane, for prep and for the middle of a session:
//   QuickDmPanel     drop a balanced fight, a person, loot or a trap where
//                    you're looking; stamp a room; a new scene from a
//                    template; save / reset / duplicate / clear the scene
//   CreaturesPanel   everything on the scene with HP, conditions and hiding
//                    one click away (an overlay: it never pushes the map)
//   TokenQuickEdit   HP, conditions, hidden, size for one creature, from its
//                    right-click menu
//   DmNote           the DM's private note on a hero or a creature
// Everything goes out as one message per action (addTokens, placeObject,
// clearLayer...) and comes back in the normal state broadcast.

/** The square in the middle of what the DM is looking at (3D), else the map's middle. */
export function viewCell(scene) {
  const g = typeof window !== 'undefined' && window.__world?.rig?.goal;
  const w = scene.grid.w, h = scene.grid.h;
  if (g && Number.isFinite(g.tx)) return { x: Math.max(0, Math.min(w - 1, Math.round(g.tx - 0.5))), y: Math.max(0, Math.min(h - 1, Math.round(g.tz - 0.5))) };
  return { x: Math.floor(w / 2), y: Math.floor(h / 2) };
}

/** Map tokens for an encounter's groups, numbered on from what's already there. */
export async function encounterTokens(groups, scene, { hidden = false } = {}) {
  const blocks = await Promise.all(groups.map((g) => srd.monster(g.index)));
  const out = [];
  groups.forEach((g, i) => {
    const m = blocks[i];
    if (!m || m.error) return;
    const before = scene.tokens.filter((t) => t.monsterIndex === g.index).length;
    const total = before + g.count;
    for (let n = 0; n < g.count; n++) out.push(tokenFromMonster(m, { label: numberedLabel(m.name, before + n, total), hidden }));
  });
  return out;
}

/** A person from a preset, with an SRD creature's numbers if it has some. */
export async function npcToken(preset) {
  const who = npcName(preset);
  const base = { kind: 'npc', label: who.label, body: who.body, color: preset.color, note: preset.note, art: 'humanoid' };
  if (!preset.stats) return { ...base, hp: preset.hp ?? null, maxHp: preset.hp ?? null, ac: 10 };
  const m = await srd.monster(preset.stats);
  if (!m || m.error) return base;
  const t = tokenFromMonster(m, { label: who.label });
  return { ...t, ...base, monsterIndex: m.index, xpValue: null };
}

/** Make a scene from a template (and take the table there). */
export function addSceneFromTemplate(tpl, { seed, go = true, name } = {}) {
  const sc = sceneFromTemplate(tpl, { seed, name });
  const { mood, ...payload } = sc;
  return new Promise((resolve) => {
    socket.emit('addScene', payload, (res) => {
      if (res?.sceneId) {
        socket.emit('updateScene', { sceneId: res.sceneId, patch: { mood } });
        if (go) socket.emit('switchScene', { sceneId: res.sceneId });
      }
      resolve(res);
    });
  });
}

const TABS = [
  { key: 'fight', name: 'Fight', Icon: SwordIcon },
  { key: 'people', name: 'People', Icon: PersonIcon },
  { key: 'things', name: 'Loot & traps', Icon: CoinsIcon },
  { key: 'scene', name: 'Scene', Icon: MapIcon },
];

/* ================= the quick panel ================= */

export function QuickDmPanel({ state, scene, charSheets, tab: tabIn, at, dialog, onTab, onClose, onSelectObject, onPickStamp, onCustomPlace, say }) {
  const [tab, setTab] = useState(tabIn || 'fight');
  useEffect(() => { if (tabIn) setTab(tabIn); }, [tabIn]);
  const ref = useRef(null);
  useEscapeKey(onClose);
  const go = (t) => { setTab(t); onTab?.(t); };
  const heroes = useMemo(() => state.members.filter((m) => m.characterId && charSheets[m.characterId]).map((m) => charSheets[m.characterId]), [state.members, charSheets]);
  const target = () => at || viewCell(scene);
  const where = at ? 'on the marked square' : 'where you are looking';

  return (
    <div ref={ref} className="qdm panel" role="dialog" aria-label="Quick DM tools">
      <div className="qdm-head">
        <div className="qdm-tabs" role="tablist">
          {TABS.map(({ key, name, Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => go(key)}>
              <Icon size={14} /> <span>{name}</span>
            </button>
          ))}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      <div className="qdm-body">
        {tab === 'fight' && <FightTab scene={scene} heroes={heroes} target={target} where={where} say={say} onDone={onClose} />}
        {tab === 'people' && <PeopleTab scene={scene} target={target} where={where} say={say} onCustomPlace={onCustomPlace} />}
        {tab === 'things' && <ThingsTab scene={scene} heroes={heroes} target={target} where={where} say={say} onSelectObject={onSelectObject} />}
        {tab === 'scene' && <SceneTab state={state} scene={scene} heroes={heroes} dialog={dialog} say={say} onPickStamp={onPickStamp} onClose={onClose} />}
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <span className="qdm-step" role="group" aria-label={label}>
      <span className="qdm-step-label">{label}</span>
      <button className="icon-btn ghost-btn" aria-label={`${label} down`} disabled={value <= min} onClick={() => onChange(value - 1)}><MinusIcon size={13} /></button>
      <b>{value}</b>
      <button className="icon-btn ghost-btn" aria-label={`${label} up`} disabled={value >= max} onClick={() => onChange(value + 1)}><PlusIcon size={13} /></button>
    </span>
  );
}

/* ---------------- a fight ---------------- */

function FightTab({ scene, heroes, target, where, say, onDone }) {
  const auto = partyOf(heroes);
  const [theme, setTheme] = useState('goblins');
  const [level, setLevel] = useState(auto.level);
  const [size, setSize] = useState(auto.size);
  const [difficulty, setDifficulty] = useState('moderate');
  const [seed, setSeed] = useState(() => Date.now());
  const [hidden, setHidden] = useState(getPlaceHidden);
  const [fight, setFight] = useState(false);
  const [busy, setBusy] = useState(false);
  const enc = useMemo(() => buildEncounter(theme, { level, size, difficulty, seed }), [theme, level, size, difficulty, seed]);

  const place = async () => {
    setBusy(true);
    const tokens = await encounterTokens(enc.groups, scene, { hidden });
    socket.emit('addTokens', { sceneId: scene.id, tokens, at: target(), hidden }, (res) => {
      setBusy(false);
      if (res?.error) return say(res.error);
      const who = describeEncounter(enc.groups);
      const one = enc.groups.length === 1 && enc.groups[0].count === 1; // "a wolf appears", "3 wolves appear"
      say(`${who.charAt(0).toUpperCase()}${who.slice(1)} ${hidden ? (one ? 'waits, hidden,' : 'wait, hidden,') : (one ? 'appears' : 'appear')} ${where}.`);
      if (fight) socket.emit('startCombat');
      onDone?.();
    });
  };

  return (
    <>
      <div className="qdm-grid themes">
        {ENCOUNTER_THEMES.map((t) => (
          <button key={t.key} className={`qdm-card ${theme === t.key ? 'on' : ''}`} aria-pressed={theme === t.key} title={t.blurb} onClick={() => setTheme(t.key)}>
            <strong>{t.name}</strong>
          </button>
        ))}
      </div>
      <div className="qdm-row">
        <Stepper label="Level" value={level} min={1} max={20} onChange={setLevel} />
        <Stepper label="Heroes" value={size} min={1} max={8} onChange={setSize} />
      </div>
      <div className="seg qdm-seg" role="group" aria-label="How hard">
        {DIFFICULTIES.map((d) => (
          <button key={d.key} className={difficulty === d.key ? 'on' : ''} aria-pressed={difficulty === d.key} title={d.hint} onClick={() => setDifficulty(d.key)}>{d.name}</button>
        ))}
      </div>
      <div className="qdm-result">
        <div className="qdm-result-text">
          <strong>{describeEncounter(enc.groups)}</strong>
          <span className="muted small">{enc.total} XP of a {enc.budget} XP budget</span>
        </div>
        <button className="small-btn ghost-btn" onClick={() => setSeed((s) => s + 1)} title="A different group for the same budget"><SparkleIcon size={12} /> Reroll</button>
      </div>
      <label className="row small"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden until I reveal them</label>
      <label className="row small"><input type="checkbox" checked={fight} onChange={(e) => setFight(e.target.checked)} /> Start the fight (roll initiative)</label>
      <button className="primary-btn qdm-go" disabled={busy} onClick={place}><SkullIcon size={14} /> {busy ? 'Placing…' : `Place them ${where}`}</button>
    </>
  );
}

/* ---------------- people ---------------- */

function PeopleTab({ scene, target, where, say, onCustomPlace }) {
  const [busy, setBusy] = useState(null);
  const place = async (p) => {
    setBusy(p.key);
    const token = await npcToken(p);
    socket.emit('addTokens', { sceneId: scene.id, tokens: [withPlaceHidden(token)], at: target() }, (res) => {
      setBusy(null);
      say(res?.error || `${token.label} is ${where}${getPlaceHidden() ? ', hidden from the players' : ''}.`);
    });
  };
  return (
    <>
      <p className="qdm-hint">One click puts someone {where}, with a name, a manner and (where it fits) SRD stats.</p>
      <div className="qdm-grid people">
        {NPC_PRESETS.map((p) => (
          <button key={p.key} className="qdm-card person" disabled={busy === p.key} title={p.note} onClick={() => place(p)}>
            <Avatar art="humanoid" name={p.role} color={p.color} size={30} ring={false} />
            <strong>{p.role}</strong>
          </button>
        ))}
      </div>
      <div className="qdm-row">
        <button className="small-btn" onClick={() => onCustomPlace('npc')}><PersonIcon size={12} /> Someone else…</button>
        <button className="small-btn" onClick={() => onCustomPlace('marker')}><PlusIcon size={12} /> Marker…</button>
      </div>
    </>
  );
}

/* ---------------- loot, traps, secrets ---------------- */

function ThingsTab({ scene, heroes, target, where, say, onSelectObject }) {
  const party = partyOf(heroes);
  const [ambushTheme, setAmbushTheme] = useState('bandits');
  const place = (object, label) => {
    const c = target();
    socket.emit('placeObject', { sceneId: scene.id, object: withPlaceHidden({ ...object, x: c.x, y: c.y }) }, (res) => {
      if (res?.error) return say(res.error);
      say(`${label} placed ${where}. Edit it with Secrets (T).`);
      if (res?.id) onSelectObject?.(res.id);
    });
  };
  return (
    <>
      <p className="qdm-hint">Placed {where} for a level {party.level} party. Each opens in the editor so you can change it.</p>
      <div className="qdm-grid things">
        {THING_PRESETS.map((t) => (
          <button key={t.key} className="qdm-card" onClick={() => place(t.make(party.level, Math.random), t.name)}>
            <strong>{t.name}</strong>
            <span>{t.hint}</span>
          </button>
        ))}
      </div>
      <div className="qdm-row qdm-ambush">
        <span className="qdm-step-label">Ambush of</span>
        <select value={ambushTheme} onChange={(e) => setAmbushTheme(e.target.value)} aria-label="Who springs the ambush">
          {ENCOUNTER_THEMES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <button className="small-btn" title="A hidden square: when a hero steps on it, the group appears" onClick={() => place(ambushObject(ambushTheme, party, Date.now()), 'Ambush')}>
          <LockIcon size={12} /> Place
        </button>
      </div>
    </>
  );
}

/* ---------------- the scene ---------------- */

const ROOM_STAMPS = ['room-small', 'room-large', 'corridor', 'storeroom', 'guard-post', 'bedroom', 'kitchen', 'prison-cell', 'tavern-corner', 'dais', 'camp', 'tents', 'ambush-cover', 'treasure'];
const CLEAR = [
  { key: 'dead', name: 'The fallen' },
  { key: 'monsters', name: 'All creatures', confirm: true },
  { key: 'npcs', name: 'NPCs & markers', confirm: true },
  { key: 'objects', name: 'Secrets & loot', confirm: true },
  { key: 'drawings', name: 'Drawings' },
];

function SceneTab({ state, scene, heroes, dialog, say, onPickStamp, onClose }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [goThere, setGoThere] = useState(true);
  const previews = useMemo(() => SCENE_TEMPLATES.map((t) => {
    const sc = sceneFromTemplate(t, { seed });
    return { t, preview: { grid: { w: sc.w, h: sc.h }, cells: sc.cells, bg: { floor: sc.floor }, tokens: [] } };
  }), [seed]);
  const prepAt = scene.prepAt ? new Date(scene.prepAt) : null;

  const clear = async (c) => {
    if (c.confirm && !(await dialog.confirm(`Remove ${c.name.toLowerCase()} from ${scene.name}? (Ctrl+Z brings them back.)`, 'Clear', 'Clear'))) return;
    socket.emit('clearLayer', { sceneId: scene.id, layer: c.key }, (res) => say(res?.error || `Cleared: ${c.name.toLowerCase()} (${res?.removed ?? 0}).`));
  };
  const reset = async () => {
    const ok = await dialog.confirm(
      `Put ${scene.name} back as it was ${prepAt ? `at ${prepAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}: creatures' HP and places, doors, fog, chests and traps. Heroes stay where they are, anything you built stays built, and a fight here ends.`,
      'Reset scene', 'Reset',
    );
    if (ok) socket.emit('resetScene', { sceneId: scene.id }, (res) => say(res?.error || `${scene.name} is reset.`));
  };
  const revealParty = () => {
    const cells = [];
    for (const t of scene.tokens.filter((x) => x.kind === 'pc')) {
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = t.x + dx, y = t.y + dy;
        if (x >= 0 && y >= 0 && x < scene.grid.w && y < scene.grid.h && dx * dx + dy * dy <= 36) cells.push(`${x},${y}`);
      }
    }
    if (!cells.length) return say('No heroes on this scene.');
    socket.emit('revealFog', { sceneId: scene.id, cells, mode: 'reveal' });
  };

  return (
    <>
      <h5 className="qdm-h">This scene</h5>
      <div className="qdm-row wrap">
        <button className="small-btn" onClick={() => socket.emit('duplicateScene', { sceneId: scene.id, withTokens: true }, () => say(`Copied ${scene.name}.`))}><DuplicateIcon size={12} /> Duplicate</button>
        <button className="small-btn" title="Remember the scene as it is now, to reset to later" onClick={() => socket.emit('saveScenePrep', { sceneId: scene.id }, () => say('Saved as the prepared state.'))}><CheckIcon size={12} /> Save as prepared</button>
        <button className="small-btn danger-btn" disabled={!prepAt} title={prepAt ? 'Back to the prepared state' : 'Save a prepared state first (it is also saved when the party first arrives or a fight starts)'} onClick={reset}><RestartIcon size={12} /> Reset</button>
      </div>
      <p className="qdm-hint">{prepAt ? `Prepared state saved ${prepAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'No prepared state yet: it is saved when the party first arrives, when a fight starts, or with the button.'}</p>

      <h5 className="qdm-h">Clear</h5>
      <div className="qdm-row wrap">
        {CLEAR.map((c) => <button key={c.key} className="small-btn ghost-btn" onClick={() => clear(c)}>{c.name}</button>)}
      </div>

      <h5 className="qdm-h">Fog</h5>
      <div className="qdm-row wrap">
        <button className="small-btn ghost-btn" onClick={() => socket.emit('updateScene', { sceneId: scene.id, patch: { fogEnabled: !scene.fogEnabled } })}><FogIcon size={12} /> Fog {scene.fogEnabled ? 'on' : 'off'}</button>
        <button className="small-btn ghost-btn" onClick={() => socket.emit('resetFog', { sceneId: scene.id, covered: true })}><EyeOffIcon size={12} /> Hide all</button>
        <button className="small-btn ghost-btn" onClick={() => socket.emit('resetFog', { sceneId: scene.id, covered: false })}><EyeIcon size={12} /> Reveal all</button>
        <button className="small-btn ghost-btn" onClick={revealParty}>Around the party</button>
      </div>

      <h5 className="qdm-h">Add a room here <span className="qdm-hint-inline">pick one, then click the map</span></h5>
      <div className="qdm-grid stamps">
        {ROOM_STAMPS.map((k) => STAMPS.find((s) => s.key === k)).filter(Boolean).map((st) => (
          <button key={st.key} className="qdm-card" onClick={() => { onPickStamp(st); onClose(); }}>
            <strong>{st.name}</strong>
          </button>
        ))}
      </div>

      <h5 className="qdm-h">
        New scene from a template
        <button className="small-btn ghost-btn" onClick={() => setSeed((s) => s + 17)} title="Different layouts"><SparkleIcon size={11} /> Shuffle</button>
      </h5>
      <label className="row small"><input type="checkbox" checked={goThere} onChange={(e) => setGoThere(e.target.checked)} /> Take the table there now</label>
      <div className="qdm-grid templates">
        {previews.map(({ t, preview }) => (
          <button
            key={t.key}
            className="qdm-card tpl"
            title={t.blurb}
            disabled={state.scenes.length >= 60}
            onClick={async () => { await addSceneFromTemplate(t, { seed, go: goThere }); say(`${t.name} added${goThere ? ': the table moves there' : ''}.`); setSeed((s) => s + 17); }}
          >
            <SceneThumb scene={preview} w={132} h={80} />
            <strong>{t.name}</strong>
          </button>
        ))}
      </div>
      {heroes.length === 0 && <p className="qdm-hint">Tip: fights and loot scale to the heroes at the table; with nobody seated they assume four level 1 heroes.</p>}
    </>
  );
}

/* ================= the creatures on this scene ================= */

export function CreaturesPanel({ scene, onClose, onStatBlock, onQuickEdit, onAddFight, onAddMonster, say }) {
  // the quick editor opens beside the panel, level with the row
  const beside = (e) => {
    const panel = e.currentTarget.closest('.qdm-creatures').getBoundingClientRect();
    return { right: panel.right, top: e.currentTarget.getBoundingClientRect().top };
  };
  const monsters = scene.tokens.filter((t) => t.kind === 'monster');
  const extras = scene.tokens.filter((t) => t.kind === 'npc' || t.kind === 'marker');
  const fallen = monsters.filter((t) => t.dead).length;
  const hp = (t, v) => socket.emit('updateToken', { tokenId: t.id, patch: { hp: Math.max(0, Math.min(9999, v)) } });
  const xp = monsters.filter((t) => !t.dead).reduce((n, t) => n + (t.xpValue || 0), 0);

  const row = (t) => (
    <div key={t.id} className={`qdm-creature ${t.dead ? 'down' : ''} ${t.hidden ? 'is-hidden' : ''}`}>
      <button className="qdm-creature-face" title="HP, conditions and more" onClick={(e) => onQuickEdit(t, beside(e))}>
        <Avatar art={artForToken(t)} name={t.label} color={t.color} size={28} shape="square" ring={false} />
      </button>
      <div className="qdm-creature-mid">
        <span className="qdm-creature-line">
          <button className="link-btn qdm-creature-name" title={t.monsterIndex ? 'Stat block' : 'HP, conditions and more'} onClick={(e) => (t.monsterIndex && t.kind === 'monster' ? onStatBlock(t) : onQuickEdit(t, beside(e)))}>{t.label}</button>
          {t.dmNote && <button className="qdm-note-mark" title={`Your note: ${t.dmNote}`} aria-label={`Your note on ${t.label}`} onClick={(e) => onQuickEdit(t, beside(e))}><ScrollIcon size={11} /></button>}
        </span>
        {(t.conditions || []).length > 0 && (
          <span className="qdm-conds">{t.conditions.map((c) => <span key={c} title={c}><ConditionIcon index={c} size={12} /></span>)}</span>
        )}
      </div>
      {t.hp != null && (
        <span className="qdm-hp">
          <button className="icon-btn ghost-btn" aria-label={`Hurt ${t.label}`} onClick={() => socket.emit('applyHp', { tokenId: t.id, delta: -1 })}><MinusIcon size={12} /></button>
          <input aria-label={`${t.label} hit points`} value={t.hp ?? ''} onChange={(e) => hp(t, parseInt(e.target.value, 10) || 0)} />
          <span className="muted small">/{t.maxHp}</span>
          <button className="icon-btn ghost-btn" aria-label={`Heal ${t.label}`} onClick={() => socket.emit('applyHp', { tokenId: t.id, delta: 1 })}><PlusIcon size={12} /></button>
        </span>
      )}
      <button className="icon-btn ghost-btn" aria-label={t.hidden ? `Reveal ${t.label}` : `Hide ${t.label}`} title={t.hidden ? 'Hidden from players: click to reveal' : 'Hide from players'} onClick={() => socket.emit('updateToken', { tokenId: t.id, patch: { hidden: !t.hidden } })}>
        {t.hidden ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
      </button>
      {t.kind === 'monster' && !t.dead && (
        <button className="icon-btn ghost-btn" aria-label={`Run ${t.label}'s turn`} title="Run its turn automatically" onClick={() => socket.emit('autoMonsterTurn', { tokenId: t.id })}><SwordIcon size={12} /></button>
      )}
    </div>
  );

  return (
    <aside className="qdm-creatures panel" aria-label="Creatures on this scene">
      <div className="qdm-head">
        <h4 className="qdm-title">Creatures <span className="chip">{monsters.filter((t) => !t.dead).length}</span>{xp > 0 && <span className="muted small">{xp} XP</span>}</h4>
        <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      <div className="qdm-creatures-body">
        {monsters.length === 0 && <p className="qdm-hint">Nothing here yet.</p>}
        {monsters.map(row)}
        {extras.length > 0 && <h5 className="qdm-h">People and markers</h5>}
        {extras.map(row)}
      </div>
      <div className="qdm-creatures-foot">
        <button className="small-btn primary-btn" onClick={onAddFight}><PlusIcon size={12} /> Add a fight</button>
        {onAddMonster && <button className="small-btn" onClick={onAddMonster} title="Pick any monster from the library; it lands near the party"><SkullIcon size={12} /> Add a monster</button>}
        {fallen > 0 && <button className="small-btn ghost-btn" onClick={() => socket.emit('clearLayer', { sceneId: scene.id, layer: 'dead' }, (r) => say(`Cleared ${r?.removed ?? 0} fallen.`))}><TrashIcon size={12} /> Clear the fallen</button>}
      </div>
    </aside>
  );
}

/* ================= one creature, fast ================= */

const QUICK_CONDITIONS = CONDITIONS.filter((c) => c.index !== 'concentrating');

export function TokenQuickEdit({ token, anchor, onClose, onDuplicate, notes = false }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, ready: false });
  const [amount, setAmount] = useState('5');
  useOutsideClick(ref, onClose);
  useEscapeKey(onClose);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(8, Math.min(anchor.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(anchor.y, window.innerHeight - r.height - 8)), ready: true });
  }, [anchor.x, anchor.y]);
  const patch = (p) => socket.emit('updateToken', { tokenId: token.id, patch: p });
  const n = Math.max(0, parseInt(amount, 10) || 0);
  const has = (c) => (token.conditions || []).includes(c);
  const hasHp = token.hp != null;

  return (
    <div ref={ref} className="qdm-quick panel" role="dialog" aria-label={`${token.label}: quick edit`} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}>
      <div className="qdm-head">
        <h4 className="qdm-title">{token.label}</h4>
        <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      {hasHp && (
        <>
          <div className="qdm-quick-hp">
            <HeartIcon size={14} /> <b>{token.hp}</b><span className="muted">/ {token.maxHp}</span>
            {token.ac != null && <span className="qdm-quick-ac"><ShieldIcon size={13} /> {token.ac}</span>}
          </div>
          <div className="qdm-row">
            <input className="qdm-amount" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
            <button className="small-btn danger-btn" onClick={() => socket.emit('applyHp', { tokenId: token.id, delta: -n })}>Damage</button>
            <button className="small-btn" onClick={() => socket.emit('applyHp', { tokenId: token.id, delta: n })}>Heal</button>
            <button className="small-btn ghost-btn" onClick={() => socket.emit('applyHp', { tokenId: token.id, setTo: token.maxHp })}>Full</button>
          </div>
        </>
      )}
      <div className="qdm-conds-pick" role="group" aria-label="Conditions">
        {QUICK_CONDITIONS.map((c) => (
          <button key={c.index} className={`chip ${has(c.index) ? 'gold' : ''}`} aria-pressed={has(c.index)} title={c.brief}
            onClick={() => patch({ conditions: has(c.index) ? token.conditions.filter((x) => x !== c.index) : [...(token.conditions || []), c.index] })}>
            <ConditionIcon index={c.index} size={12} /> {c.name}
          </button>
        ))}
      </div>
      <div className="qdm-row wrap">
        <button className="small-btn ghost-btn" onClick={() => patch({ hidden: !token.hidden })}>{token.hidden ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />} {token.hidden ? 'Reveal' : 'Hide'}</button>
        <button className="small-btn ghost-btn" onClick={() => patch({ size: token.size >= 4 ? 1 : (token.size || 1) + 1 })}><LayersIcon size={12} /> Size {token.size || 1}</button>
        {token.kind === 'monster' && <button className="small-btn ghost-btn" onClick={() => patch({ dead: !token.dead, hp: token.dead ? Math.max(1, token.hp || 1) : 0 })}><SkullIcon size={12} /> {token.dead ? 'Revive' : 'Down'}</button>}
        <button className="small-btn ghost-btn" onClick={onDuplicate}><DuplicateIcon size={12} /> Another</button>
      </div>
      {notes && <DmNote tokenId={token.id} value={token.dmNote} />}
    </div>
  );
}

/* ================= the DM's private notes ================= */

/**
 * A note only the DM sees, on a hero (characterId) or a creature (tokenId).
 * It saves itself as you type (autosave.jsx); the server never sends it to
 * players (roomState.viewForUser).
 */
export function DmNote({ characterId = null, tokenId = null, value, rows = 3 }) {
  const [draft, setDraft, flush] = useAutoSave({
    key: characterId ? `dmnote:c:${characterId}` : `dmnote:t:${tokenId}`,
    value: value || '',
    save: (text) => socket.emit('setDmNote', { characterId, tokenId, text }),
  });
  return (
    <label className="dm-note-field">
      <span className="dm-note-head"><ScrollIcon size={12} /> DM notes <em>only you see these</em></span>
      <textarea
        rows={rows}
        maxLength={2000}
        value={draft}
        placeholder={characterId ? 'Secrets, goals, debts, what they promised…' : 'Motive, what it knows, tactics…'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={flush}
      />
    </label>
  );
}
