import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { SKILLS, ABILITIES, ABILITY_NAMES } from '../rules/engine';
import { XIcon, ScrollIcon, SparkleIcon, D20Icon, EyeIcon, ImageIcon, TrashIcon, LightningIcon, CheckIcon } from './Icons';

// The DM's table tools, and what players see of them.
//   OBJECT_KINDS   the things a DM can place on a map (the Secrets tool)
//   ObjectEditor   edit one placed object
//   DmPanel        talk to the table (narrate, whisper, handouts, ask for a
//                  roll) and set the mood (time, weather, light, music)
//   TableMessages  what players get: banners, handouts, roll requests

export const OBJECT_KINDS = [
  { key: 'trap', name: 'Trap', hint: 'Hidden. Springs when someone walks over it.' },
  { key: 'secret', name: 'Hidden passage', hint: 'Hidden until someone searches (Perception) or walks close with a sharp eye.' },
  { key: 'chest', name: 'Chest', hint: 'Players click it (standing next to it) to open it and find loot.' },
  { key: 'lever', name: 'Lever', hint: 'Players pull it to open or close the doors you link it to.' },
  { key: 'note', name: 'Note', hint: 'Players click it to read a message only they see.' },
  { key: 'exit', name: 'Way on', hint: 'Walking onto it takes the party to another scene.' },
  { key: 'zone', name: 'Event', hint: 'Hidden. Walking in triggers narration, monsters, light...' },
];

const EFFECT_NAMES = { text: 'Narrate', damage: 'Damage', heal: 'Heal', loot: 'Loot', doors: 'Open / close doors', goto: 'Go to scene', spawn: 'Monsters appear', reveal: 'Reveal the area' };

const slug = (s) => s.trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function ObjectEditor({ object: o, scenes, sceneId, pickingDoors, onPickDoors, onClose }) {
  const [draft, setDraft] = useState(o);
  useEffect(() => setDraft(o), [o.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pickingDoors) setDraft((d) => ({ ...d, targets: o.targets })); }, [o.targets, pickingDoors]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    socket.emit('updateObject', { sceneId, id: o.id, patch });
  };
  const setEffect = (i, patch) => save({ effects: draft.effects.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const kind = OBJECT_KINDS.find((k) => k.key === draft.kind);
  return (
    <div className="dm-obj panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dm-obj-head">
        <input className="dm-obj-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => save({ name: draft.name })} aria-label="Name" />
        <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      <p className="dm-obj-hint">{kind?.hint}</p>
      <div className="dm-obj-row">
        <label><input type="checkbox" checked={draft.hidden} onChange={(e) => save({ hidden: e.target.checked })} /> Hidden from players</label>
        <label><input type="checkbox" checked={draft.once} onChange={(e) => save({ once: e.target.checked })} /> Only once</label>
      </div>
      <div className="dm-obj-row">
        <span>Happens when</span>
        <select value={draft.trigger} onChange={(e) => save({ trigger: e.target.value })}>
          <option value="step">someone walks onto it</option>
          <option value="touch">someone uses it (next to it)</option>
          <option value="search">it's found by searching</option>
          <option value="none">only when I set it off</option>
        </select>
      </div>
      {(draft.hidden || draft.trigger === 'search') && (
        <div className="dm-obj-row">
          <span>Spotted on Perception</span>
          <input type="number" min="0" max="30" value={draft.dc} onChange={(e) => save({ dc: +e.target.value })} style={{ width: 60 }} />
          <span className="muted small">(passive Perception notices it nearby)</span>
        </div>
      )}
      <h5>What happens</h5>
      {draft.effects.map((e, i) => (
        <div key={i} className="dm-eff">
          <div className="dm-obj-row">
            <select value={e.type} onChange={(ev) => setEffect(i, { type: ev.target.value })}>
              {Object.entries(EFFECT_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button className="icon-btn ghost-btn" onClick={() => save({ effects: draft.effects.filter((_, j) => j !== i) })} aria-label="Remove"><TrashIcon size={13} /></button>
          </div>
          {['text', 'damage', 'loot', 'doors', 'goto', 'spawn', 'reveal', 'heal'].includes(e.type) && (
            <textarea rows={2} placeholder={e.type === 'loot' ? 'What they find' : 'What the table hears (optional)'} value={e.text || ''} onChange={(ev) => setEffect(i, { text: ev.target.value })} />
          )}
          {e.type === 'text' && <label className="small"><input type="checkbox" checked={!!e.private} onChange={(ev) => setEffect(i, { private: ev.target.checked })} /> Only the hero who set it off sees it</label>}
          {e.type === 'damage' && (
            <div className="dm-obj-row">
              <input value={e.damage} onChange={(ev) => setEffect(i, { damage: ev.target.value })} style={{ width: 70 }} aria-label="Damage dice" />
              <input value={e.damageType} onChange={(ev) => setEffect(i, { damageType: ev.target.value })} style={{ width: 90 }} aria-label="Damage type" />
              <select value={e.save || ''} onChange={(ev) => setEffect(i, { save: ev.target.value || null })}>
                <option value="">no save</option>
                {ABILITIES.map((a) => <option key={a} value={a}>{a.toUpperCase()} save</option>)}
              </select>
              {e.save && <>DC <input type="number" value={e.saveDc} onChange={(ev) => setEffect(i, { saveDc: +ev.target.value })} style={{ width: 54 }} /></>}
            </div>
          )}
          {e.type === 'heal' && <input value={e.amount} onChange={(ev) => setEffect(i, { amount: ev.target.value })} style={{ width: 80 }} aria-label="Healing dice" />}
          {e.type === 'doors' && (
            <div className="dm-obj-row">
              <button className={`small-btn ${pickingDoors ? 'primary-btn' : ''}`} onClick={onPickDoors}>{pickingDoors ? 'Done picking' : 'Pick doors on the map'}</button>
              <span className="muted small">{(o.targets || []).length} linked</span>
            </div>
          )}
          {e.type === 'goto' && (
            <select value={e.toScene || ''} onChange={(ev) => setEffect(i, { toScene: ev.target.value })}>
              <option value="">Choose a scene…</option>
              {scenes.filter((s) => s.id !== sceneId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {e.type === 'spawn' && (
            <input
              placeholder="goblin, goblin, wolf"
              defaultValue={(e.monsters || []).flatMap((m) => Array(m.count).fill(m.index)).join(', ')}
              onBlur={(ev) => {
                const counts = {};
                for (const n of ev.target.value.split(',').map(slug).filter(Boolean)) counts[n] = (counts[n] || 0) + 1;
                setEffect(i, { monsters: Object.entries(counts).map(([index, count]) => ({ index, count })) });
              }}
              aria-label="Monsters (SRD names, comma separated)"
            />
          )}
          {e.type === 'reveal' && <div className="dm-obj-row">Radius <input type="number" min="1" max="15" value={e.radius} onChange={(ev) => setEffect(i, { radius: +ev.target.value })} style={{ width: 54 }} /> squares</div>}
        </div>
      ))}
      <button className="small-btn ghost-btn" onClick={() => save({ effects: [...draft.effects, { type: 'text', text: '' }] })}>+ Add something that happens</button>
      <div className="dm-obj-foot">
        <button className="small-btn" onClick={() => socket.emit('triggerObject', { id: o.id })}><LightningIcon size={13} /> Set it off now</button>
        {o.used && <button className="small-btn ghost-btn" onClick={() => socket.emit('triggerObject', { id: o.id, reset: true })}>Reset</button>}
        <span className="grow" />
        <button className="small-btn danger-btn" onClick={() => { socket.emit('removeObject', { sceneId, id: o.id }); onClose(); }}><TrashIcon size={13} /> Remove</button>
      </div>
    </div>
  );
}

/* ---------------- the DM's table panel ---------------- */

const CHECKS = [
  ...SKILLS.map((s) => ({ key: s.index, name: s.name })),
  ...ABILITIES.map((a) => ({ key: `save:${a}`, name: `${ABILITY_NAMES[a] || a} save` })),
];
export const MUSIC_MOODS = { auto: 'Automatic', explore: 'Exploring', tavern: 'Tavern', sneak: 'Sneaking', tension: 'Tension', combat: 'Battle', boss: 'Boss fight', rest: 'Resting', silence: 'Silence' };

export function DmPanel({ state, scene, onClose, onLookHere }) {
  const [tab, setTab] = useState('talk');
  const [to, setTo] = useState('all');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [image, setImage] = useState(null);
  const [check, setCheck] = useState('perception');
  const [dc, setDc] = useState(12);
  const fileRef = useRef(null);
  const players = state.members.filter((m) => m.characterId);
  const mood = scene?.mood || { time: 'auto', weather: 'none', light: 1 };
  const setMood = (patch) => socket.emit('updateScene', { sceneId: scene.id, patch: { mood: { ...mood, ...patch } } });
  const target = to === 'all' ? 'all' : [to];

  const pickImage = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1100 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setImage(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className="dm-panel panel" role="dialog" aria-label="Table tools">
      <div className="dm-panel-head">
        <div className="tab-row">
          <button className={tab === 'talk' ? 'active' : ''} onClick={() => setTab('talk')}>Talk</button>
          <button className={tab === 'mood' ? 'active' : ''} onClick={() => setTab('mood')}>Mood</button>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
      </div>
      {tab === 'talk' && (
        <div className="dm-panel-body">
          <label className="field-label">To</label>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="all">Everyone</option>
            {players.map((m) => <option key={m.userId} value={m.userId}>{state.charSheets?.[m.characterId]?.name || m.username} only</option>)}
          </select>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={to === 'all' ? 'The ground trembles. Somewhere below, something wakes.' : 'You alone hear a whisper behind you...'} />
          <div className="dm-panel-row">
            <button className="primary-btn small-btn" disabled={!text.trim()} onClick={() => { socket.emit('dmNarrate', { text, to: target }); setText(''); }}>
              <ScrollIcon size={13} /> {to === 'all' ? 'Narrate' : 'Whisper'}
            </button>
            {to === 'all' && <button className="small-btn" disabled={!text.trim()} onClick={() => { socket.emit('dmNarrate', { text, to: 'all', style: 'title' }); setText(''); }}><SparkleIcon size={13} /> Big title</button>}
          </div>
          <h5>Handout</h5>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A crumpled letter" />
          <div className="dm-panel-row">
            <button className="small-btn ghost-btn" onClick={() => fileRef.current?.click()}><ImageIcon size={13} /> {image ? 'Change picture' : 'Add a picture'}</button>
            {image && <img src={image} alt="" className="dm-handout-thumb" />}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
          </div>
          <button className="small-btn" disabled={!title.trim() && !image && !text.trim()} onClick={() => { socket.emit('sendHandout', { to: target, title: title || 'Handout', text, image }); setTitle(''); setImage(null); setText(''); }}>
            Send handout{text.trim() ? ' (with the text above)' : ''}
          </button>
          <h5>Ask for a roll</h5>
          <div className="dm-panel-row">
            <select value={check} onChange={(e) => setCheck(e.target.value)}>{CHECKS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
            DC <input type="number" min="1" max="30" value={dc} onChange={(e) => setDc(+e.target.value)} style={{ width: 54 }} />
          </div>
          <button className="small-btn" onClick={() => socket.emit('requestRoll', { to: target, check, dc, label: CHECKS.find((c) => c.key === check)?.name })}>
            <D20Icon size={13} /> Ask {to === 'all' ? 'everyone' : 'them'} to roll
          </button>
        </div>
      )}
      {tab === 'mood' && scene && (
        <div className="dm-panel-body">
          <label className="field-label">Time of day <span className="field-hint">(outdoors)</span></label>
          <div className="dm-chips">{['auto', 'day', 'dusk', 'night'].map((t) => <button key={t} className={`chip ${mood.time === t ? 'gold' : ''}`} onClick={() => setMood({ time: t })}>{t === 'auto' ? 'As built' : t}</button>)}</div>
          <label className="field-label">Weather</label>
          <div className="dm-chips">{['none', 'rain', 'snow', 'fog', 'ash', 'embers'].map((t) => <button key={t} className={`chip ${mood.weather === t ? 'gold' : ''}`} onClick={() => setMood({ weather: t })}>{t === 'none' ? 'Clear' : t}</button>)}</div>
          <label className="field-label">Light <span className="field-hint">{Math.round((mood.light ?? 1) * 100)}%</span></label>
          <input type="range" min="0.2" max="2" step="0.05" value={mood.light ?? 1} onChange={(e) => setMood({ light: +e.target.value })} />
          <label className="field-label">Music</label>
          <div className="dm-chips">{Object.entries(MUSIC_MOODS).map(([k, n]) => <button key={k} className={`chip ${(mood.music || 'auto') === k ? 'gold' : ''}`} onClick={() => setMood({ music: k })}>{n}</button>)}</div>
          <h5>Camera</h5>
          <button className="small-btn" onClick={onLookHere}><EyeIcon size={13} /> Show everyone what I'm looking at</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- what players receive ---------------- */

export function TableMessages({ mySheet, onRoll }) {
  const [banner, setBanner] = useState(null);
  const [handouts, setHandouts] = useState([]);
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    let t;
    const onBanner = (b) => { setBanner({ ...b, id: Math.random() }); clearTimeout(t); t = setTimeout(() => setBanner(null), b.style === 'title' ? 5200 : Math.min(9000, 2600 + b.text.length * 45)); };
    const onHandout = (h) => setHandouts((xs) => [...xs, h]);
    const onReq = (q) => setRequests((xs) => [...xs.filter((x) => x.check !== q.check), q]);
    socket.on('dmBanner', onBanner); socket.on('handout', onHandout); socket.on('rollRequest', onReq);
    return () => { socket.off('dmBanner', onBanner); socket.off('handout', onHandout); socket.off('rollRequest', onReq); clearTimeout(t); };
  }, []);
  const bonusFor = (check) => {
    const d = mySheet?.derived;
    if (!d) return 0;
    if (check.startsWith('save:')) return d.saves?.[check.slice(5)] ?? 0;
    return d.skills?.[check]?.bonus ?? d.mods?.[check] ?? 0;
  };
  const h = handouts[0];
  return (
    <>
      {banner && (
        <div key={banner.id} className={`dm-banner ${banner.style}`} onClick={() => setBanner(null)} role="status">
          {banner.style === 'whisper' && <span className="dm-banner-tag">Only you</span>}
          {banner.text}
        </div>
      )}
      {requests.length > 0 && (
        <div className="dm-requests">
          {requests.map((q) => {
            const b = bonusFor(q.check);
            return (
              <div key={q.id} className="dm-request panel">
                <span>The DM asks for <b>{q.label || q.check}</b>{q.dc ? ` (DC ${q.dc})` : ''}</span>
                <button className="primary-btn small-btn" onClick={() => { onRoll(`1d20${b >= 0 ? '+' : ''}${b}`, `${q.label || q.check}${q.dc ? ` vs DC ${q.dc}` : ''}`); setRequests((xs) => xs.filter((x) => x.id !== q.id)); }}>
                  <D20Icon size={13} /> Roll ({b >= 0 ? '+' : ''}{b})
                </button>
                <button className="icon-btn ghost-btn" onClick={() => setRequests((xs) => xs.filter((x) => x.id !== q.id))} aria-label="Dismiss"><XIcon size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
      {h && (
        <div className="modal-overlay" onClick={() => setHandouts((xs) => xs.slice(1))}>
          <div className="modal dm-handout" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{h.title}</h3><button className="close-btn" onClick={() => setHandouts((xs) => xs.slice(1))} aria-label="Close"><XIcon size={16} /></button></div>
            <div className="modal-body">
              {h.image && <img src={h.image} alt={h.title} className="dm-handout-img" />}
              {h.text && h.text.split('\n').map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="modal-actions"><button className="primary-btn" onClick={() => setHandouts((xs) => xs.slice(1))}><CheckIcon size={14} /> {handouts.length > 1 ? `Next (${handouts.length - 1} more)` : 'Got it'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
