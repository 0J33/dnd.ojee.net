import React, { useCallback, useEffect, useState } from 'react';
import { campaigns as campaignsApi, characters as charsApi, srd } from '../api';
import { socket } from '../socket';
import { useDialog, ModalOverlay, timeAgo } from '../utils';
import { CLASS_META, deriveSheet } from '../rules/engine';
import { STARTER_PACKS, sceneFromBuiltin, previewScene } from '../data/scenes';
import { Avatar } from './Portrait';
import { SceneThumb } from './ScenePrep';
import CharacterBuilder from './CharacterBuilder';
import CharacterSheet from './CharacterSheet';
import Guide from './Guide';
import { DragonLogo, D20Icon, MapIcon, UsersIcon, BookIcon, PlusIcon, SparkleIcon, SwordIcon, CrownIcon, ShieldIcon, HeartIcon, XIcon, TrashIcon, ScrollIcon, EyeIcon, PlayIcon, LogoutIcon } from './Icons';
import { VERSION } from '../version';

// The first quest's seal: poured wax with an uneven rim and a d20 pressed
// into it. Drawn, not a gradient disc, so it reads as wax and not a button.
const SEAL_RIM = 'M59.9 27.1 Q60.8 32.0 59.1 36.6 Q57.4 41.2 55.5 45.7 Q53.6 50.1 49.4 52.5 Q45.2 54.8 41.1 57.5 Q37.0 60.2 32.1 59.6 Q27.2 59.1 22.9 57.1 Q18.7 55.1 14.2 52.9 Q9.8 50.6 7.8 46.1 Q5.9 41.5 5.8 36.8 Q5.8 32.0 5.5 27.1 Q5.3 22.3 8.2 18.4 Q11.2 14.5 14.6 11.1 Q18.0 7.8 22.7 6.8 Q27.4 5.9 32.2 5.0 Q36.9 4.1 41.4 6.1 Q45.8 8.0 49.2 11.4 Q52.6 14.7 55.8 18.4 Q59.0 22.2 59.9 27.1Z';
function WaxSeal() {
  return (
    <svg className="lg-seal" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lg-wax" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#e27a48" />
          <stop offset="0.55" stopColor="#b8491f" />
          <stop offset="1" stopColor="#7a2a10" />
        </radialGradient>
        <radialGradient id="lg-wax-well" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#b24620" />
          <stop offset="1" stopColor="#8e3516" />
        </radialGradient>
      </defs>
      <path d={SEAL_RIM} fill="url(#lg-wax)" />
      {/* the pressed well: shadow on the upper-left edge, light on the lower-right */}
      <circle cx="32" cy="32" r="18.5" fill="url(#lg-wax-well)" />
      <path d="M18.6 26.4 A18.5 18.5 0 0 1 37.8 14.4" stroke="#5c1e0a" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M45.4 37.6 A18.5 18.5 0 0 1 26.2 49.6" stroke="#f1a07a" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.55" />
      {/* the d20, pressed in: dark lines with a thin lit edge below them */}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        <g stroke="#f09a6c" strokeWidth="1" opacity="0.45" transform="translate(0.6 0.7)">
          <polygon points="32 20 42 25.8 42 38.2 32 44 22 38.2 22 25.8" />
          <polygon points="32 25.5 38.2 36 25.8 36" />
        </g>
        <g stroke="#511a08" strokeWidth="1.5">
          <polygon points="32 20 42 25.8 42 38.2 32 44 22 38.2 22 25.8" />
          <polygon points="32 25.5 38.2 36 25.8 36" />
          <path d="M32 20v5.5M42 25.8l-3.8 10.2M22 25.8l3.8 10.2M32 44l6.2-8M32 44l-6.2-8" />
        </g>
      </g>
      {/* one soft highlight where the candle catches it */}
      <ellipse cx="22" cy="16.5" rx="7" ry="3.4" transform="rotate(-28 22 16.5)" fill="#ffe2cc" opacity="0.22" />
    </svg>
  );
}

export default function Lobby({ user, connected, onEnterGame, onLogout }) {
  const dialog = useDialog();
  const [campaignList, setCampaignList] = useState(null);
  const [charList, setCharList] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editChar, setEditChar] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshCampaigns = useCallback(() => {
    campaignsApi.list().then((res) => setCampaignList(Array.isArray(res) ? res : []));
  }, []);
  const refreshChars = useCallback(() => {
    charsApi.list().then((res) => setCharList(Array.isArray(res) ? res : []));
  }, []);

  useEffect(() => {
    refreshCampaigns();
    refreshChars();
  }, [refreshCampaigns, refreshChars]);

  const createCampaign = (name, mode, packKey) => {
    if (busy) return;
    setBusy(true);
    socket.emit('createCampaign', { name, mode, userId: user.id, username: user.username }, (res) => {
      setBusy(false);
      if (!res || !res.state) {
        dialog.alert((res && res.error) || 'Could not create campaign');
        return;
      }
      onEnterGame({ code: res.code, state: res.state });

      // Seed the campaign with its starter scenes so the first session opens on
      // a real place instead of an empty grid.
      const pack = STARTER_PACKS.find((p) => p.key === packKey);
      if (!pack || !pack.scenes.length) return;
      const blankSceneId = res.state.scenes[0] && res.state.scenes[0].id;
      const scenes = pack.scenes
        .map((key) => sceneFromBuiltin(key))
        .filter(Boolean)
        .map((b) => ({ name: b.name, floor: b.floor, cells: b.cells, w: b.w, h: b.h }));
      socket.emit('addScenes', { scenes }, (added) => {
        const first = added && added.sceneIds && added.sceneIds[0];
        if (!first) return;
        socket.emit('switchScene', { sceneId: first });
        if (blankSceneId) socket.emit('deleteScene', { sceneId: blankSceneId });
      });
    });
  };

  const joinCampaign = (code) => {
    if (!code || busy) return;
    setBusy(true);
    socket.emit('joinCampaign', { code: code.trim().toUpperCase(), userId: user.id, username: user.username }, (res) => {
      setBusy(false);
      if (res && res.state) {
        onEnterGame({ code: res.code, state: res.state });
      } else {
        dialog.alert((res && res.error) || 'Campaign not found');
      }
    });
  };

  const deleteCampaign = async (c) => {
    const ok = await dialog.confirm(`Delete "${c.name}" forever? Everyone loses access.`, 'Delete campaign', 'Delete');
    if (!ok) return;
    await campaignsApi.remove(c.code);
    refreshCampaigns();
  };

  const deleteChar = async (c) => {
    const ok = await dialog.confirm(`Retire ${c.name} forever?`, 'Retire hero', 'Retire');
    if (!ok) return;
    await charsApi.remove(c.id);
    refreshChars();
  };

  const startLearning = () => createCampaign('The Cellar of the Gilded Flagon', 'guided', 'blank');
  // Continue always means your latest run; older runs stay in the list below.
  const guided = (campaignList || [])
    .filter((c) => c.mode === 'guided')
    .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0))[0];
  const others = (campaignList || []).filter((c) => c !== guided);
  const startFresh = async () => {
    const ok = await dialog.confirm(
      'Start The Cellar of the Gilded Flagon again from the first scene? Your current run stays in Your campaigns, so you can go back to it.',
      'Start the quest fresh',
      'Start fresh'
    );
    if (ok) startLearning();
  };

  return (
    <div className="lg-screen lg-home">
      <header className="lg-bar">
        <div className="lg-brand">
          <DragonLogo size={30} />
          <span className="lg-brand-name">dnd.ojee.net</span>
        </div>
        <div className="lg-bar-gap" />
        <button className="lg-btn" onClick={() => setShowGuide(true)}><BookIcon size={14} /> Guide</button>
        <span className="lg-me">
          <span className={`lg-conn ${connected ? 'is-on' : ''}`} title={connected ? 'Connected' : 'Connecting…'} />
          {user.username}
        </span>
        <button className="lg-icon-btn" onClick={onLogout} title="Sign out (of mtg.ojee.net too)" aria-label="Sign out">
          <LogoutIcon size={17} />
        </button>
      </header>

      <main className="lg-spread">
        <section className="lg-page lg-party" aria-labelledby="lg-party-title">
          <div className="lg-page-head">
            <h2 id="lg-party-title">Your heroes</h2>
            {charList && charList.length > 0 && <span className="lg-page-note">{charList.length} in the register</span>}
          </div>
          {charList === null ? (
            <p className="lg-empty">Opening the register…</p>
          ) : charList.length === 0 ? (
            <p className="lg-empty">No heroes yet. The builder walks you through every choice, or you can take one of six ready-made heroes and play right away.</p>
          ) : (
            <ul className="lg-entries">
              {charList.map((c) => {
                const sheet = c.sheet || {};
                const meta = CLASS_META[sheet.classIndex] || {};
                const derived = deriveSheet(sheet);
                return (
                  <li className="lg-entry lg-hero" key={c.id}>
                    <Avatar sheet={sheet} name={c.name} color={sheet.portrait?.color || 'var(--gold)'} size={72} />
                    <button className="lg-hero-open" onClick={() => setEditChar(c)} title={`Open ${c.name}'s sheet`}>
                      <span className="lg-entry-name">{c.name}</span>
                      <span className="lg-entry-sub">
                        Level {sheet.level || 1} {sheet.raceName || ''} {meta.name || ''}{sheet.subclassName ? ` (${sheet.subclassName})` : ''}
                      </span>
                      <span className="lg-entry-stats">
                        <span title="Hit points"><HeartIcon size={13} /> {sheet.currentHp ?? sheet.maxHp ?? derived.maxHp}/{sheet.maxHp ?? derived.maxHp}</span>
                        <span title="Armour class"><ShieldIcon size={13} /> {derived.ac}</span>
                        <span title="Passive Perception"><EyeIcon size={13} /> {derived.passivePerception}</span>
                      </span>
                    </button>
                    <span className="lg-entry-actions">
                      <button className="lg-btn" onClick={() => setEditChar(c)}><ScrollIcon size={13} /> Sheet</button>
                      <button className="lg-icon-btn is-danger" onClick={() => deleteChar(c)} title={`Retire ${c.name}`} aria-label={`Retire ${c.name}`}>
                        <TrashIcon size={15} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="lg-blank-line">
            <span>Write in a new hero</span>
            <button className="lg-btn" onClick={() => setShowBuilder(true)}><PlusIcon size={13} /> New hero</button>
          </div>
        </section>

        <section className="lg-page lg-quests" aria-labelledby="lg-quests-title">
          <div className="lg-page-head">
            <h2 id="lg-quests-title">Quests</h2>
            {others.length > 0 && <span className="lg-page-note">{others.length} campaign{others.length === 1 ? '' : 's'}</span>}
          </div>

          <article className={`lg-first ${guided ? 'is-done' : ''}`} aria-labelledby="lg-first-title">
            <WaxSeal />
            <h3 id="lg-first-title">Your first quest: The Cellar of the Gilded Flagon</h3>
            <p>Nobody needs to know the rules. The app narrates and runs the monsters, and teaches one thing per scene: checks, combat, saves, healing, a boss, and levelling up.</p>
            <p className="lg-first-meta">About an hour. Everyone joins with the code; ready-made heroes are waiting.</p>
            <div className="lg-first-actions">
              {guided ? (
                <>
                  <button className="lg-primary" onClick={() => joinCampaign(guided.code)} disabled={!connected || busy}><PlayIcon size={15} /> Continue the quest</button>
                  <button className="lg-link" onClick={startFresh} disabled={!connected || busy}>Start it fresh</button>
                </>
              ) : (
                <button className="lg-primary" onClick={startLearning} disabled={!connected || busy}><D20Icon size={15} /> Begin the first quest</button>
              )}
              <button className="lg-link" onClick={() => setShowGuide(true)}>Read the player's guide</button>
            </div>
          </article>

          <h3 className="lg-subhead">Your campaigns</h3>
          {campaignList === null ? (
            <p className="lg-empty">Opening the register…</p>
          ) : others.length === 0 ? (
            <p className="lg-empty">None yet. Start one and share its code with your friends, or ask a friend for theirs.</p>
          ) : (
            <ul className="lg-entries">
              {others.map((c) => (
                <li className="lg-entry" key={c.code} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <span>
                    <span className="lg-entry-name">{c.name}</span>
                    <span className="lg-entry-sub" style={{ display: 'block' }}>
                      <span className="lg-campaign-code" title="Campaign code">{c.code}</span>
                      {' · '}<span className="lg-mode">{c.mode === 'guided' ? 'Guided' : c.isHost ? 'You run it' : 'DM game'}</span>
                      {' · '}{c.members.slice(0, 4).join(', ')}{c.members.length > 4 ? '…' : ''}
                      {c.online > 0 ? <span className="lg-online"> · {c.online} at the table</span> : <> · {timeAgo(c.lastActivity)}</>}
                    </span>
                  </span>
                  <span className="lg-entry-actions">
                    <button className="lg-primary" onClick={() => joinCampaign(c.code)} disabled={!connected || busy}>Resume</button>
                    {c.isHost && (
                      <button className="lg-icon-btn is-danger" onClick={() => deleteCampaign(c)} title={`Delete ${c.name}`} aria-label={`Delete ${c.name}`}>
                        <TrashIcon size={15} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="lg-blank-line">
            <span>Start a new campaign</span>
            <button className="lg-btn" onClick={() => setShowCreate(true)} disabled={!connected}><PlusIcon size={13} /> New campaign</button>
          </div>
          <form className="lg-code-line" onSubmit={(e) => { e.preventDefault(); joinCampaign(joinCode); }}>
            <label htmlFor="lg-code">Joining a friend's game?</label>
            <input
              id="lg-code"
              className="lg-input"
              placeholder="Code"
              value={joinCode}
              maxLength={6}
              autoComplete="off"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="submit" className="lg-btn" disabled={joinCode.length < 4 || !connected}>Join</button>
          </form>
        </section>
      </main>

      <footer className="lg-foot">
        dnd.ojee.net v{VERSION} · an unofficial fan-made tabletop, compatible with fifth edition ·{' '}
        <button className="lg-link" onClick={() => setShowCredits(true)}>licenses &amp; credits</button>
      </footer>

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, mode, pack) => {
            setShowCreate(false);
            createCampaign(name, mode, pack);
          }}
        />
      )}

      {showBuilder && (
        <CharacterBuilder
          onClose={() => setShowBuilder(false)}
          onSaved={() => {
            setShowBuilder(false);
            refreshChars();
          }}
        />
      )}

      {editChar && (
        <ModalOverlay onClose={() => setEditChar(null)} className="sheet-overlay">
          <CharacterSheet
            characterId={editChar.id}
            initialSheet={editChar.sheet}
            mode="lobby"
            onClose={() => {
              setEditChar(null);
              refreshChars();
            }}
          />
        </ModalOverlay>
      )}

      {showGuide && <Guide onClose={() => setShowGuide(false)} />}
      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    </div>
  );
}

function CreateCampaignModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('dm');
  const [pack, setPack] = useState('tavern');

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal create-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New campaign</h3>
          <button className="close-btn" aria-label="Close" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          <label className="field-label" htmlFor="campaign-name">Campaign name</label>
          <input
            id="campaign-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Ember Vale"
            maxLength={60}
            style={{ width: '100%' }}
          />

          <label className="field-label mt" id="campaign-mode-label">Who runs the game</label>
          <div className="mode-pick" role="group" aria-labelledby="campaign-mode-label">
            <button
              type="button"
              className={`mode-card ${mode === 'dm' ? 'selected' : ''}`}
              aria-pressed={mode === 'dm'}
              onClick={() => setMode('dm')}
            >
              <h4><CrownIcon size={15} /> I'll be the DM</h4>
              <p>You run the world: maps, monsters and story. Friends join as players.</p>
            </button>
            <button
              type="button"
              className={`mode-card ${mode === 'guided' ? 'selected' : ''}`}
              aria-pressed={mode === 'guided'}
              onClick={() => setMode('guided')}
            >
              <h4><SparkleIcon size={15} /> Guided (no DM)</h4>
              <p>The app narrates a beginner adventure and runs the monsters. Perfect when nobody has played before.</p>
            </button>
          </div>

          {mode === 'dm' && (
            <>
              <label className="field-label mt" id="campaign-pack-label">
                Starting scenes <span className="field-hint">a set of maps ready to go; you can add, edit and build more any time</span>
              </label>
              <div className="pack-pick" role="group" aria-labelledby="campaign-pack-label">
                {STARTER_PACKS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    className={`pack-card ${pack === p.key ? 'selected' : ''}`}
                    aria-pressed={pack === p.key}
                    onClick={() => setPack(p.key)}
                  >
                    <span className="pack-thumbs">
                      {p.scenes.length ? (
                        p.scenes.slice(0, 3).map((key) => <SceneThumb key={key} scene={previewScene(key)} w={54} h={34} />)
                      ) : (
                        <span className="pack-empty">Blank</span>
                      )}
                    </span>
                    <strong>{p.name}</strong>
                    <span className="muted small">{p.blurb}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={() => onCreate(name.trim() || 'New Campaign', mode, mode === 'dm' ? pack : 'blank')}>
            Create campaign
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function CreditsModal({ onClose }) {
  const [legal, setLegal] = useState(null);
  useEffect(() => {
    srd.sources().then((res) => res && Array.isArray(res.sources) && setLegal(res));
  }, []);
  const oglSources = legal ? legal.sources.filter((s) => s.license === 'OGL-1.0a') : [];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <h3>Licenses & credits</h3>
          <button className="close-btn" aria-label="Close" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="modal-body" style={{ fontSize: '0.9em', color: 'var(--text-mid)' }}>
          <p>
            dnd.ojee.net is an unofficial, fan-made virtual tabletop compatible with fifth edition. It is not
            affiliated with, endorsed, or sponsored by Wizards of the Coast.
          </p>
          <hr className="ornament-line" />
          <p>
            This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of
            the Coast LLC and available at{' '}
            <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noreferrer">
              dnd.wizards.com/resources/systems-reference-document
            </a>
            . The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
              creativecommons.org/licenses/by/4.0/legalcode
            </a>.
          </p>
          <p>
            This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the
            Coast LLC, available at{' '}
            <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">dndbeyond.com/srd</a>. The
            SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License.
          </p>
          <hr className="ornament-line" />
          <p>
            Races and subclasses labelled {oglSources.length ? oglSources.map((s) => s.short).join(', ').replace(/, ([^,]*)$/, ' or $1') : 'with another book'} in the
            character builder are Open Game Content, used under the Open Game License v1.0a and reproduced from:
          </p>
          <ul className="credits-list">
            {oglSources.map((s) => (
              <li key={s.key}>
                <a href={s.url} target="_blank" rel="noreferrer"><em>{s.name}</em></a> by {s.publisher}
              </li>
            ))}
          </ul>
          <p>
            The game-rules text of those races and subclasses is Open Game Content as designated by its publishers.
            No Product Identity is used beyond the titles the license requires. The Goliath and Orc come from SRD 5.2.1 (above);
            their ability increases are adapted to this table's 2014-style backgrounds. dnd.ojee.net's own interface text,
            artwork and code are not Open Game Content.
          </p>
          {legal && (
            <details className="credits-ogl">
              <summary>Open Game License v1.0a (full text)</summary>
              <p className="credits-license">{legal.ogl.text}</p>
              <p className="credits-license">
                <strong>15. COPYRIGHT NOTICE</strong>{'\n'}
                {legal.ogl.section15.join('\n')}
              </p>
            </details>
          )}
          <hr className="ornament-line" />
          <p>
            SRD data served from the open <a href="https://github.com/5e-bits/5e-database" target="_blank" rel="noreferrer">5e-bits/5e-database</a> project;
            expansion text through the <a href="https://open5e.com" target="_blank" rel="noreferrer">Open5e</a> API.
            Built with React and Socket.IO. All interface art is original.
          </p>
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
