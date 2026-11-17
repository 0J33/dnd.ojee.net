import React, { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket';
import { srd } from '../api';
import { ModalOverlay } from '../utils';
import { BUILTIN_SCENES, sceneCategories, sceneFromBuiltin, previewScene, STARTER_PACKS } from '../data/scenes';
import { FLOOR_MATERIALS } from '../data/tiles';
import { drawThumbnail } from '../render/sceneRender';
import { tokenFromMonster, numberedLabel } from '../rules/tokens';
import { artKeyForMonster } from './Portrait';
import { SCENE_TEMPLATES, sceneFromTemplate, entryOf, farPoint } from '../data/presets';
import { ENCOUNTER_THEMES, DIFFICULTIES, buildEncounter, partyOf } from '../data/encounters';
import { QuickCampaignPicker, applyQuickCampaign, buildQuickCampaign } from './QuickCampaign';
import { useAutoSave, SaveStatus } from '../autosave';
import { restoreUi, useUiContext } from '../uiContext';
import {
  MapIcon, PlusIcon, XIcon, PencilIcon, TrashIcon, DuplicateIcon, PlayIcon, SearchIcon,
  ScrollIcon, SkullIcon, ChevronUp, ChevronDown, CheckIcon, InfoIcon, RestartIcon, WandIcon, SparkleIcon,
} from './Icons';

// ================= Campaign prep =================
// Everything a DM sets up before (or between) sessions lives here: the scene
// library with real previews, and a story outline whose beats open a scene,
// place the creatures and read the narration in one click.
//
// Nothing here has a Save button: scene names and notes and every part of a
// beat save themselves as you type (autosave.jsx), and the modal remembers
// its tab, the scene or beat you had open and how far you'd scrolled across
// an update's reload (uiContext.js).

/* ---------------- shared thumbnail ---------------- */

export function SceneThumb({ scene, w = 168, h = 104, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && scene) drawThumbnail(ref.current, scene, w, h);
  }, [scene, w, h]);
  return <canvas ref={ref} className={`scene-thumb ${className}`} aria-hidden="true" />;
}

/* ---------------- the modal ---------------- */

export default function ScenePrep({ state, dialog, onClose, initialTab = 'scenes' }) {
  const [was] = useState(() => restoreUi('prep') || {});
  const [tab, setTab] = useState(was.tab || initialTab);
  const [editScene, setEditScene] = useState(was.scene || null); // sceneId
  const [editBeat, setEditBeat] = useState(was.beat || null); // beatId
  const bodyRef = useRef(null);
  useUiContext('prep', () => ({ tab, scene: editScene, beat: editBeat, scroll: bodyRef.current?.scrollTop || 0 }));
  useEffect(() => {
    if (!was.scroll) return;
    requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = was.scroll; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ModalOverlay onClose={onClose} className="prep-overlay">
      <div className="modal prep-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Campaign prep</h3>
          <div className="tab-row prep-tabs">
            <button className={tab === 'scenes' ? 'active' : ''} onClick={() => setTab('scenes')}>
              <MapIcon size={13} /> Scenes <span className="chip">{state.scenes.length}</span>
            </button>
            <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>
              <ScrollIcon size={13} /> Story <span className="chip">{state.story?.beats?.length || 0}</span>
            </button>
          </div>
          <SaveStatus className="prep-save" />
          <button className="close-btn" aria-label="Close prep" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="modal-body prep-body" ref={bodyRef}>
          {tab === 'scenes'
            ? <ScenesTab state={state} dialog={dialog} onClose={onClose} editing={editScene} setEditing={setEditScene} />
            : <StoryTab state={state} dialog={dialog} editing={editBeat} setEditing={setEditBeat} />}
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ================= Scenes ================= */

function ScenesTab({ state, dialog, onClose, editing, setEditing }) {
  const [adding, setAdding] = useState(false); // false | a source for AddScene
  const [quick, setQuick] = useState(null); // { key, level } while picking a quick campaign

  const move = (id, dir) => {
    const order = state.scenes.map((s) => s.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    socket.emit('reorderScenes', { order });
  };

  if (adding) return <AddScene state={state} initialSource={adding === true ? 'library' : adding} onDone={() => setAdding(false)} onClose={onClose} />;
  if (quick) {
    const party = partyOf(Object.values(state.charSheets || {}));
    return (
      <>
        <div className="prep-toolbar">
          <button className="small-btn ghost-btn" onClick={() => setQuick(null)}>Back to my scenes</button>
        </div>
        <p className="muted small">Adds four scenes and their story beats after the ones you have. Fights are balanced for {party.size} hero{party.size === 1 ? '' : 'es'}.</p>
        <QuickCampaignPicker value={quick.key} level={quick.level} onPick={(key) => setQuick({ ...quick, key })} onLevel={(level) => setQuick({ ...quick, level })} />
        <div className="add-footer">
          <span className="grow" />
          <button className="ghost-btn" onClick={() => setQuick(null)}>Cancel</button>
          <button className="primary-btn" disabled={state.scenes.length > 56} onClick={() => {
            applyQuickCampaign(buildQuickCampaign(quick.key, { level: quick.level, size: party.size }), { go: false });
            setQuick(null);
          }}><WandIcon size={13} /> Add the campaign</button>
        </div>
      </>
    );
  }

  const editScene = editing ? state.scenes.find((s) => s.id === editing) : null;
  if (editScene) return <EditScene scene={editScene} code={state.code} onDone={() => setEditing(null)} />;

  return (
    <>
      <div className="prep-toolbar">
        <p className="muted small grow">
          Build your scenes ahead of time - switch the table to any of them instantly during play.
        </p>
        <button className="small-btn" onClick={() => setQuick({ key: 'goblin-trouble', level: partyOf(Object.values(state.charSheets || {})).level })} title="Four scenes with beats and fights, from a theme">
          <WandIcon size={12} /> Quick campaign
        </button>
        <button className="small-btn" onClick={() => setAdding('template')} title="A generated tavern, crypt, cave, camp...">
          <SparkleIcon size={12} /> From a template
        </button>
        <button className="primary-btn small-btn" onClick={() => setAdding(true)}>
          <PlusIcon size={12} /> Add scene
        </button>
      </div>

      <div className="scene-grid">
        {state.scenes.map((s, i) => {
          const active = s.id === state.activeSceneId;
          return (
            <article key={s.id} className={`scene-card ${active ? 'active' : ''}`}>
              <button
                className="scene-card-preview"
                title={active ? 'Already the live scene' : `Switch the table to ${s.name}`}
                aria-label={active ? `${s.name}, currently live` : `Switch the table to ${s.name}`}
                onClick={() => !active && socket.emit('switchScene', { sceneId: s.id })}
              >
                <SceneThumb scene={s} />
                {active && <span className="scene-live">Live</span>}
                {!active && <span className="scene-go">Go to scene</span>}
              </button>
              <div className="scene-card-body">
                <h4 className="scene-card-name" title={s.name}>{s.name}</h4>
                <p className="card-sub">
                  {s.grid.w}×{s.grid.h} · {s.tokens.length} token{s.tokens.length === 1 ? '' : 's'}
                  {s.fogEnabled ? ' · fog on' : ''}
                </p>
                {s.notes && <p className="scene-note muted small">{s.notes}</p>}
              </div>
              <div className="scene-card-actions">
                <button className="icon-btn ghost-btn" title="Rename & notes" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s.id)}>
                  <PencilIcon size={14} />
                </button>
                <button
                  className="icon-btn ghost-btn"
                  title="Duplicate this scene"
                  aria-label={`Duplicate ${s.name}`}
                  onClick={() => socket.emit('duplicateScene', { sceneId: s.id, withTokens: true })}
                >
                  <DuplicateIcon size={14} />
                </button>
                {s.prepAt && (
                  <button
                    className="icon-btn ghost-btn"
                    title="Reset to its prepared state (creatures, doors, fog, chests)"
                    aria-label={`Reset ${s.name}`}
                    onClick={async () => {
                      const ok = await dialog.confirm(`Reset "${s.name}" to how it was prepared? Creatures, doors, fog and chests go back; heroes and anything built stay.`, 'Reset scene', 'Reset');
                      if (ok) socket.emit('resetScene', { sceneId: s.id });
                    }}
                  >
                    <RestartIcon size={14} />
                  </button>
                )}
                <button className="icon-btn ghost-btn" title="Move earlier" aria-label="Move earlier" disabled={i === 0} onClick={() => move(s.id, -1)}>
                  <ChevronUp size={14} />
                </button>
                <button
                  className="icon-btn ghost-btn"
                  title="Move later"
                  aria-label="Move later"
                  disabled={i === state.scenes.length - 1}
                  onClick={() => move(s.id, 1)}
                >
                  <ChevronDown size={14} />
                </button>
                <span className="grow" />
                <button
                  className="icon-btn ghost-btn danger-item"
                  title="Delete scene"
                  aria-label={`Delete ${s.name}`}
                  disabled={state.scenes.length <= 1}
                  onClick={async () => {
                    const ok = await dialog.confirm(`Delete "${s.name}" and everything on it?`, 'Delete scene', 'Delete');
                    if (ok) socket.emit('deleteScene', { sceneId: s.id });
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- add a scene ---------------- */

function AddScene({ state, onDone, onClose, initialSource = 'library' }) {
  const [source, setSource] = useState(initialSource); // library | template | blank | image
  const [tpl, setTpl] = useState(null); // template key
  const [seed, setSeed] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null); // builtin key
  const [name, setName] = useState('');
  const [fog, setFog] = useState(false);
  const [goThere, setGoThere] = useState(true);
  const [floor, setFloor] = useState('stone');
  const [w, setW] = useState(26);
  const [h, setH] = useState(18);
  const [url, setUrl] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sceneCategories()
      .map((g) => ({ ...g, maps: q ? g.maps.filter((m) => m.name.toLowerCase().includes(q) || m.blurb.toLowerCase().includes(q)) : g.maps }))
      .filter((g) => g.maps.length);
  }, [query]);

  const create = () => {
    let payload = { name: name.trim(), fogEnabled: fog };
    let mood = null;
    if (source === 'template') {
      if (!tpl) return;
      const { mood: m, ...sc } = sceneFromTemplate(tpl, { seed });
      mood = m;
      payload = { ...sc, name: payload.name || sc.name, fogEnabled: fog || sc.fogEnabled };
    } else if (source === 'library') {
      if (!picked) return;
      const b = sceneFromBuiltin(picked);
      payload = { ...payload, name: payload.name || b.name, floor: b.floor, cells: b.cells, w: b.w, h: b.h };
    } else if (source === 'blank') {
      payload = { ...payload, name: payload.name || 'New Scene', floor, w: Number(w) || 26, h: Number(h) || 18 };
    } else {
      payload = { ...payload, name: payload.name || 'Battle map', bgUrl: url.trim(), w: Number(w) || 26, h: Number(h) || 18 };
    }
    socket.emit('addScene', payload, (res) => {
      if (res && res.sceneId && mood) socket.emit('updateScene', { sceneId: res.sceneId, patch: { mood } });
      if (res && res.sceneId && goThere) socket.emit('switchScene', { sceneId: res.sceneId });
    });
    onDone();
  };

  const addPack = (pack) => {
    const scenes = pack.scenes.map((key) => {
      const b = sceneFromBuiltin(key);
      return { name: b.name, floor: b.floor, cells: b.cells, w: b.w, h: b.h };
    });
    if (!scenes.length) return;
    socket.emit('addScenes', { scenes });
    onDone();
  };

  const preview = source === 'library' && picked ? previewScene(picked) : null;
  const canCreate = source === 'library' ? !!picked : source === 'template' ? !!tpl : source === 'image' ? !!url.trim() : true;
  const tplPreviews = useMemo(() => SCENE_TEMPLATES.map((t) => {
    const sc = sceneFromTemplate(t, { seed });
    return { t, preview: { grid: { w: sc.w, h: sc.h }, cells: sc.cells, bg: { floor: sc.floor }, tokens: sc.tokens } };
  }), [seed]);

  return (
    <>
      <div className="prep-toolbar">
        <button className="small-btn ghost-btn" onClick={onDone}>Back to my scenes</button>
        <span className="grow" />
        <div className="seg" role="group" aria-label="Scene source">
          {[
            ['library', 'Map library'],
            ['template', 'Template'],
            ['blank', 'Blank grid'],
            ['image', 'Image URL'],
          ].map(([k, label]) => (
            <button key={k} className={source === k ? 'on' : ''} aria-pressed={source === k} onClick={() => setSource(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {source === 'library' && (
        <>
          <div className="build-search mb">
            <SearchIcon size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search maps..." aria-label="Search maps" />
          </div>

          {!query && (
            <div className="pack-row">
              <span className="muted small">Add a whole set:</span>
              {STARTER_PACKS.filter((p) => p.scenes.length).map((p) => (
                <button key={p.key} className="small-btn" title={p.blurb} onClick={() => addPack(p)}>
                  <PlusIcon size={11} /> {p.name}
                </button>
              ))}
            </div>
          )}

          {groups.map((g) => (
            <section key={g.name} className="map-group">
              <h4>{g.name}</h4>
              <div className="map-grid">
                {g.maps.map((m) => (
                  <button
                    key={m.key}
                    className={`map-option ${picked === m.key ? 'on' : ''}`}
                    aria-pressed={picked === m.key}
                    onClick={() => setPicked(picked === m.key ? null : m.key)}
                  >
                    <SceneThumb scene={previewScene(m.key)} w={150} h={92} />
                    <span className="map-option-name">{m.name}</span>
                    <span className="map-option-blurb">{m.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!groups.length && <p className="muted center" style={{ padding: 24 }}>No maps match that search.</p>}
        </>
      )}

      {source === 'template' && (
        <>
          <div className="pack-row">
            <span className="muted small grow">A new layout every time, with its people, mood and a note on what fits there.</span>
            <button className="small-btn ghost-btn" onClick={() => setSeed((n) => n + 17)}><SparkleIcon size={11} /> Shuffle</button>
          </div>
          <div className="map-grid">
            {tplPreviews.map(({ t, preview: pv }) => (
              <button key={t.key} className={`map-option ${tpl === t.key ? 'on' : ''}`} aria-pressed={tpl === t.key} onClick={() => setTpl(tpl === t.key ? null : t.key)}>
                <SceneThumb scene={pv} w={150} h={92} />
                <span className="map-option-name">{t.name}</span>
                <span className="map-option-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {source === 'blank' && (
        <div className="add-form">
          <p className="muted small">
            Start from empty ground and paint the room yourself with the <strong>Build</strong> tool on the board.
          </p>
          <label className="field-label" htmlFor="blank-floor">Material</label>
          <select id="blank-floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
            {FLOOR_MATERIALS.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </select>
          <SizeFields w={w} h={h} setW={setW} setH={setH} />
          <SceneThumb scene={{ grid: { w: Number(w) || 26, h: Number(h) || 18 }, cells: null, bg: { floor }, tokens: [] }} w={220} h={140} />
        </div>
      )}

      {source === 'image' && (
        <div className="add-form">
          <label className="field-label" htmlFor="map-url">Battle map image URL</label>
          <input id="map-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          <p className="muted small">
            The grid sits on top of your image. Match the squares to the map's own grid for clean movement.
          </p>
          <SizeFields w={w} h={h} setW={setW} setH={setH} />
        </div>
      )}

      <div className="add-footer">
        <div className="grow">
          <label className="field-label" htmlFor="scene-name">Scene name</label>
          <input
            id="scene-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={preview ? BUILTIN_SCENES.find((b) => b.key === picked)?.name : source === 'template' && tpl ? SCENE_TEMPLATES.find((t) => t.key === tpl)?.name : 'e.g. The Bridge'}
            maxLength={60}
          />
        </div>
        <div className="col add-toggles">
          <label className="row small">
            <input type="checkbox" checked={fog} onChange={(e) => setFog(e.target.checked)} /> Start hidden under fog
          </label>
          <label className="row small">
            <input type="checkbox" checked={goThere} onChange={(e) => setGoThere(e.target.checked)} /> Take the table there now
          </label>
        </div>
        <button className="primary-btn" disabled={!canCreate} onClick={create}>
          <PlusIcon size={13} /> Add scene
        </button>
      </div>
    </>
  );
}

function SizeFields({ w, h, setW, setH }) {
  return (
    <>
      <label className="field-label" htmlFor="grid-w">Grid size (squares)</label>
      <div className="row">
        <input id="grid-w" type="number" min="8" max="80" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 74 }} />
        <span className="muted">×</span>
        <input aria-label="Grid height" type="number" min="8" max="60" value={h} onChange={(e) => setH(e.target.value)} style={{ width: 74 }} />
        <span className="muted small">= {(Number(w) || 0) * 5} × {(Number(h) || 0) * 5} ft</span>
      </div>
    </>
  );
}

/* ---------------- edit an existing scene ---------------- */

function EditScene({ scene, code, onDone }) {
  const send = (patch) => socket.emit('updateScene', { sceneId: scene.id, patch });
  // An emptied name isn't sent (the scene keeps its old one until you type another).
  const [name, setName, flushName] = useAutoSave({ key: `${code}:scene:${scene.id}:name`, value: scene.name, save: (v) => v.trim() && send({ name: v }) });
  const [notes, setNotes, flushNotes] = useAutoSave({ key: `${code}:scene:${scene.id}:notes`, value: scene.notes || '', save: (v) => send({ notes: v }) });

  return (
    <div className="edit-scene">
      <div className="prep-toolbar">
        <button className="small-btn ghost-btn" onClick={onDone}>Back to my scenes</button>
      </div>
      <div className="edit-scene-body">
        <SceneThumb scene={scene} w={240} h={150} />
        <div className="grow col">
          <div>
            <label className="field-label" htmlFor="edit-name">Scene name</label>
            <input id="edit-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={flushName} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label" htmlFor="edit-notes">
              DM notes <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>- only you can see these</span>
            </label>
            <textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={flushNotes}
              maxLength={4000}
              rows={7}
              placeholder="What happens here, who the players meet, what they find..."
              style={{ width: '100%' }}
            />
          </div>
          <label className="row small">
            <input
              type="checkbox"
              checked={!!scene.fogEnabled}
              onChange={(e) => socket.emit('updateScene', { sceneId: scene.id, patch: { fogEnabled: e.target.checked } })}
            />
            Fog of war on this scene
          </label>
        </div>
      </div>
      <div className="add-footer">
        <span className="grow" />
        <button className="primary-btn" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/* ================= Story ================= */

function StoryTab({ state, dialog, editing, setEditing }) {
  const beats = state.story?.beats || [];
  const [running, setRunning] = useState(null);

  const move = (id, dir) => {
    const order = beats.map((b) => b.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    socket.emit('reorderBeats', { order });
  };

  const beat = editing ? beats.find((b) => b.id === editing) : null;
  if (beat) return <BeatEditor beat={beat} state={state} onDone={() => setEditing(null)} />;

  return (
    <>
      <div className="prep-toolbar">
        <p className="muted small grow">
          Plan the session as a list of beats. Running one opens its scene, places its creatures and reads its narration.
        </p>
        <button
          className="primary-btn small-btn"
          onClick={() => socket.emit('addBeat', { title: `Beat ${beats.length + 1}` }, (res) => res?.beatId && setEditing(res.beatId))}
        >
          <PlusIcon size={12} /> Add beat
        </button>
      </div>

      {!beats.length && (
        <div className="empty-note">
          Nothing planned yet. A beat is one moment of the session - "The party arrives at the bridge", "Goblin ambush",
          "The boss reveals herself". Add a few and you can run the whole night from this list.
        </div>
      )}

      <ol className="beat-list">
        {beats.map((b, i) => {
          const scene = state.scenes.find((s) => s.id === b.sceneId);
          const isActive = state.story?.activeBeatId === b.id;
          const creatures = b.encounter.reduce((n, e) => n + e.count, 0);
          return (
            <li key={b.id} className={`beat-card ${isActive ? 'active' : ''} ${b.done ? 'done' : ''}`}>
              <span className="beat-index">{i + 1}</span>
              <div className="beat-main">
                <div className="row" style={{ gap: 8 }}>
                  <h4 className="beat-title">{b.title}</h4>
                  {isActive && <span className="chip gold">now</span>}
                  {b.done && <span className="chip">done</span>}
                </div>
                <p className="card-sub">
                  {scene ? scene.name : 'No scene set'}
                  {creatures > 0 && ` · ${creatures} creature${creatures === 1 ? '' : 's'}`}
                </p>
                {b.readAloud && <p className="beat-read muted small">{b.readAloud}</p>}
              </div>
              {scene && <SceneThumb scene={scene} w={104} h={64} className="beat-thumb" />}
              <div className="beat-actions">
                <button className="small-btn primary-btn" title="Open this beat at the table" onClick={() => setRunning(b)}>
                  <PlayIcon size={11} /> Run
                </button>
                <div className="row" style={{ gap: 2 }}>
                  <button className="icon-btn ghost-btn" title="Edit beat" aria-label={`Edit ${b.title}`} onClick={() => setEditing(b.id)}>
                    <PencilIcon size={13} />
                  </button>
                  <button
                    className="icon-btn ghost-btn"
                    title={b.done ? 'Mark not done' : 'Mark done'}
                    aria-label={b.done ? 'Mark not done' : 'Mark done'}
                    onClick={() => socket.emit('updateBeat', { beatId: b.id, patch: { done: !b.done } })}
                  >
                    <CheckIcon size={13} />
                  </button>
                  <button className="icon-btn ghost-btn" title="Move earlier" aria-label="Move earlier" disabled={i === 0} onClick={() => move(b.id, -1)}>
                    <ChevronUp size={13} />
                  </button>
                  <button className="icon-btn ghost-btn" title="Move later" aria-label="Move later" disabled={i === beats.length - 1} onClick={() => move(b.id, 1)}>
                    <ChevronDown size={13} />
                  </button>
                  <button
                    className="icon-btn ghost-btn danger-item"
                    title="Delete beat"
                    aria-label={`Delete ${b.title}`}
                    onClick={async () => {
                      const ok = await dialog.confirm(`Delete the beat "${b.title}"?`, 'Delete beat', 'Delete');
                      if (ok) socket.emit('deleteBeat', { beatId: b.id });
                    }}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {running && <RunBeat beat={running} state={state} onClose={() => setRunning(null)} />}
    </>
  );
}

/* ---------------- beat editor ---------------- */

function BeatEditor({ beat, state, onDone }) {
  // Every field saves itself: text a moment after you stop typing, choices at once.
  const at = `${state.code}:beat:${beat.id}`;
  const send = (patch) => socket.emit('updateBeat', { beatId: beat.id, patch });
  const [title, setTitle, flushTitle] = useAutoSave({ key: `${at}:title`, value: beat.title, save: (v) => v.trim() && send({ title: v }) });
  const [readAloud, setReadAloud, flushRead] = useAutoSave({ key: `${at}:readAloud`, value: beat.readAloud || '', save: (v) => send({ readAloud: v }) });
  const [notes, setNotes, flushNotes] = useAutoSave({ key: `${at}:notes`, value: beat.notes || '', save: (v) => send({ notes: v }) });
  const [sceneId, setSceneDraft, flushScene] = useAutoSave({ value: beat.sceneId || '', save: (v) => send({ sceneId: v || null }) });
  const [encounter, setEncounterDraft, flushEncounter] = useAutoSave({ key: `${at}:encounter`, value: beat.encounter || [], save: (v) => send({ encounter: v }) });
  const setSceneId = (v) => { setSceneDraft(v); flushScene(); };
  const setEncounter = (v) => { setEncounterDraft(v); flushEncounter(); };
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [fightTheme, setFightTheme] = useState('goblins');
  const [fightDiff, setFightDiff] = useState('moderate');
  const party = partyOf(Object.values(state.charSheets || {}));
  const suggest = () => {
    const enc = buildEncounter(fightTheme, { ...party, difficulty: fightDiff, seed: Date.now() });
    setEncounter(enc.groups.map((g) => ({ monsterIndex: g.index, name: g.name, count: g.count })));
  };

  useEffect(() => {
    if (!search.trim()) return setResults([]);
    let live = true;
    srd.monsters(`?search=${encodeURIComponent(search.trim())}`).then((res) => {
      if (live && Array.isArray(res)) setResults(res.slice(0, 20));
    });
    return () => {
      live = false;
    };
  }, [search]);

  const addMonster = (m) => {
    setEncounter((prev) => {
      const hit = prev.find((e) => e.monsterIndex === m.index);
      if (hit) return prev.map((e) => (e.monsterIndex === m.index ? { ...e, count: Math.min(12, e.count + 1) } : e));
      return [...prev, { monsterIndex: m.index, name: m.name, count: 1 }];
    });
    setSearch('');
  };

  const scene = state.scenes.find((s) => s.id === sceneId);

  return (
    <div className="beat-editor">
      <div className="prep-toolbar">
        <button className="small-btn ghost-btn" onClick={onDone}>Back to the outline</button>
      </div>

      <div className="beat-editor-grid">
        <div className="col">
          <div>
            <label className="field-label" htmlFor="beat-title">What happens</label>
            <input id="beat-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onBlur={flushTitle} placeholder="e.g. Ambush at the bridge" style={{ width: '100%' }} />
          </div>

          <div>
            <label className="field-label" htmlFor="beat-scene">Scene</label>
            <select id="beat-scene" value={sceneId} onChange={(e) => setSceneId(e.target.value)} style={{ width: '100%' }}>
              <option value="">No scene - stay where we are</option>
              {state.scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {scene && <SceneThumb scene={scene} w={220} h={136} className="mt" />}
          </div>

          <div>
            <label className="field-label" htmlFor="beat-read">
              Read aloud <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>- posted to the table when you run this beat</span>
            </label>
            <textarea
              id="beat-read"
              value={readAloud}
              onChange={(e) => setReadAloud(e.target.value)}
              onBlur={flushRead}
              maxLength={2000}
              rows={4}
              placeholder="The planks groan under your boots. Somewhere below, something moves against the current..."
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="beat-notes">Your notes <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>- private</span></label>
            <textarea id="beat-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={flushNotes} maxLength={4000} rows={4} placeholder="DC 13 Perception spots the tripwire. If they retreat, the goblins follow." style={{ width: '100%' }} />
          </div>
        </div>

        <div className="col">
          <div>
            <label className="field-label">Creatures waiting here</label>
            {!encounter.length && <p className="muted small">None yet - search below to plan the fight.</p>}
            <div className="col" style={{ gap: 6 }}>
              {encounter.map((e) => (
                <div key={e.monsterIndex} className="encounter-row">
                  <SkullIcon size={13} />
                  <span className="grow">{e.name}</span>
                  <button
                    className="icon-btn ghost-btn"
                    aria-label={`One fewer ${e.name}`}
                    onClick={() => setEncounter((prev) => prev.map((x) => (x.monsterIndex === e.monsterIndex ? { ...x, count: Math.max(1, x.count - 1) } : x)))}
                  >
                    −
                  </button>
                  <strong className="encounter-count">{e.count}</strong>
                  <button
                    className="icon-btn ghost-btn"
                    aria-label={`One more ${e.name}`}
                    onClick={() => setEncounter((prev) => prev.map((x) => (x.monsterIndex === e.monsterIndex ? { ...x, count: Math.min(12, x.count + 1) } : x)))}
                  >
                    +
                  </button>
                  <button
                    className="icon-btn ghost-btn danger-item"
                    aria-label={`Remove ${e.name}`}
                    onClick={() => setEncounter((prev) => prev.filter((x) => x.monsterIndex !== e.monsterIndex))}
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="beat-fight-theme">A ready-made fight <span className="field-hint">balanced for {party.size} level {party.level} hero{party.size === 1 ? '' : 'es'}</span></label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <select id="beat-fight-theme" value={fightTheme} onChange={(e) => setFightTheme(e.target.value)}>
                {ENCOUNTER_THEMES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
              <div className="seg" role="group" aria-label="How hard">
                {DIFFICULTIES.map((d) => (
                  <button key={d.key} className={fightDiff === d.key ? 'on' : ''} aria-pressed={fightDiff === d.key} title={d.hint} onClick={() => setFightDiff(d.key)}>{d.name}</button>
                ))}
              </div>
              <button className="small-btn" onClick={suggest} title="Replace the creatures above with a balanced group (press again for another)"><SparkleIcon size={12} /> {encounter.length ? 'Another' : 'Fill'}</button>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="beat-monster-search">Add a creature</label>
            <div className="build-search">
              <SearchIcon size={14} />
              <input id="beat-monster-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the monster library..." />
            </div>
            {results.length > 0 && (
              <div className="beat-results">
                {results.map((m) => (
                  <button key={m.index} className="monster-row" onClick={() => addMonster(m)}>
                    <span className="grow">{m.name}</span>
                    <span className="muted small">{m.hp} hp</span>
                    <PlusIcon size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="add-footer">
        <span className="grow" />
        <button className="primary-btn" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/* ---------------- run a beat ---------------- */

function RunBeat({ beat, state, onClose }) {
  const [spawn, setSpawn] = useState(true);
  const [narrate, setNarrate] = useState(!!beat.readAloud.trim());
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const scene = state.scenes.find((s) => s.id === beat.sceneId);
  const total = beat.encounter.reduce((n, e) => n + e.count, 0);

  const run = async () => {
    setBusy(true);
    let monsters = [];
    // They wait on the far side of the scene from where the party comes in.
    const where = scene || state.scenes.find((s) => s.id === state.activeSceneId);
    const lair = where?.cells ? farPoint(where.cells, where.entry || entryOf(where.cells)) : null;
    if (spawn && beat.encounter.length) {
      // Resolve every stat block first so the server gets ready-made tokens.
      const blocks = await Promise.all(beat.encounter.map((e) => srd.monster(e.monsterIndex)));
      beat.encounter.forEach((e, i) => {
        const m = blocks[i];
        if (!m || m.error) return;
        for (let n = 0; n < e.count; n++) {
          // a named foe (e.g. a boss on an SRD stat block) keeps its own name
          const base = e.name && e.name.length > 0 && !e.name.toLowerCase().startsWith(m.name.toLowerCase()) ? e.name : m.name;
          monsters.push({ ...tokenFromMonster(m, { label: numberedLabel(base, n, e.count), hidden }), ...(lair || {}) });
        }
      });
    }
    socket.emit('runBeat', { beatId: beat.id, spawn, narrate, monsters }, () => {
      setBusy(false);
      onClose();
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Run: {beat.title}</h3>
          <button className="close-btn" aria-label="Cancel" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="modal-body">
          <ul className="run-summary">
            <li>
              <MapIcon size={14} /> {scene ? <>Take the table to <strong>{scene.name}</strong></> : <span className="muted">Stay on the current scene</span>}
            </li>
            <li>
              <SkullIcon size={14} />{' '}
              {total ? (
                <>Place <strong>{total}</strong> creature{total === 1 ? '' : 's'}: {beat.encounter.map((e) => `${e.count}× ${e.name}`).join(', ')}</>
              ) : (
                <span className="muted">No creatures planned</span>
              )}
            </li>
            <li>
              <ScrollIcon size={14} />{' '}
              {beat.readAloud.trim() ? <>Read the narration to everyone</> : <span className="muted">Nothing to read aloud</span>}
            </li>
          </ul>
          <hr className="ornament-line" />
          {total > 0 && (
            <>
              <label className="row small">
                <input type="checkbox" checked={spawn} onChange={(e) => setSpawn(e.target.checked)} /> Place the creatures now
              </label>
              <label className="row small mt">
                <input type="checkbox" checked={hidden} disabled={!spawn} onChange={(e) => setHidden(e.target.checked)} /> Keep them hidden from players until revealed
              </label>
            </>
          )}
          {beat.readAloud.trim() && (
            <label className="row small mt">
              <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} /> Post the narration
            </label>
          )}
          {beat.notes && (
            <div className="beat-private mt">
              <InfoIcon size={13} /> <span>{beat.notes}</span>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={busy} onClick={run}>
            <PlayIcon size={13} /> {busy ? 'Starting...' : 'Run beat'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
