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
import { DragonLogo, D20Icon, MapIcon, UsersIcon, BookIcon, PlusIcon, SparkleIcon, SwordIcon, CrownIcon, ShieldIcon, HeartIcon, XIcon, TrashIcon, ScrollIcon } from './Icons';
import { VERSION } from '../version';

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
    const ok = await dialog.confirm(`Delete "${c.name}" forever? Everyone loses access.`, 'Delete campaign');
    if (!ok) return;
    await campaignsApi.remove(c.code);
    refreshCampaigns();
  };

  const deleteChar = async (c) => {
    const ok = await dialog.confirm(`Retire ${c.name} forever?`, 'Delete character');
    if (!ok) return;
    await charsApi.remove(c.id);
    refreshChars();
  };

  const startLearning = () => createCampaign('Learn to Play', 'guided', 'blank');

  return (
    <div className="lobby">
      <header className="topbar">
        <div className="topbar-brand">
          <DragonLogo size={30} />
          <span className="topbar-title">dnd.ojee.net</span>
          <span className="topbar-sub">D&D virtual tabletop</span>
        </div>
        <div className="grow" />
        <span className={`conn-dot ${connected ? 'on' : ''}`} title={connected ? 'Connected' : 'Connecting...'} />
        <span className="topbar-user">{user.username}</span>
        <button className="small-btn ghost-btn" onClick={() => setShowGuide(true)}>
          <BookIcon size={13} /> Guide
        </button>
        <button className="small-btn ghost-btn" onClick={onLogout}>Sign out</button>
      </header>

      <main className="lobby-main">
        <section className="hero-banner">
          <div className="hero-copy">
            <h2><SparkleIcon size={18} /> New to D&D? Start here.</h2>
            <p>
              Dungeons & Dragons is a game of shared storytelling - one part improv, one part tactics, all dice.
              Nobody at your table needs to know the rules: the <strong>guided adventure</strong> teaches everyone
              by playing through a real (short) quest, step by step, with the app as your narrator.
            </p>
          </div>
          <div className="hero-actions">
            <button className="primary-btn big-btn" onClick={startLearning} disabled={!connected || busy}>
              <D20Icon size={16} /> Learn to Play
            </button>
            <button className="ghost-btn" onClick={() => setShowGuide(true)}>
              <BookIcon size={15} /> Read the player's guide
            </button>
          </div>
        </section>

        <div className="lobby-columns">
          <section className="panel lobby-section">
            <div className="panel-header">
              <h3><MapIcon size={14} /> Campaigns</h3>
              <button className="small-btn primary-btn" onClick={() => setShowCreate(true)} disabled={!connected}>
                <PlusIcon size={12} /> New campaign
              </button>
            </div>
            <div className="lobby-section-body">
              <div className="join-row">
                <input
                  placeholder="ENTER CODE"
                  value={joinCode}
                  maxLength={6}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && joinCampaign(joinCode)}
                />
                <button onClick={() => joinCampaign(joinCode)} disabled={joinCode.length < 4 || !connected}>Join</button>
              </div>
              {campaignList === null ? (
                <div className="empty-note">Loading...</div>
              ) : campaignList.length === 0 ? (
                <div className="empty-note">
                  No campaigns yet. Create one and share the invite link with your friends -
                  or hit <strong>Learn to Play</strong> above for the guided adventure.
                </div>
              ) : (
                campaignList.map((c) => (
                  <div className="campaign-card" key={c.code}>
                    <div>
                      <div className="card-title">
                        {c.name} {c.mode === 'guided' && <span className="chip magic">guided</span>}
                      </div>
                      <div className="card-sub">
                        Code <strong>{c.code}</strong> · {c.members.slice(0, 4).join(', ')}{c.members.length > 4 ? '…' : ''}
                        {c.online > 0 && <span className="gold-text"> · {c.online} online</span>}
                        {' · '}{timeAgo(c.lastActivity)}
                      </div>
                    </div>
                    <div className="card-actions">
                      {c.isHost && (
                        <button className="small-btn danger-btn" onClick={() => deleteCampaign(c)} title={`Delete ${c.name}`} aria-label={`Delete ${c.name}`}>
                          <TrashIcon size={12} />
                        </button>
                      )}
                      <button className="small-btn primary-btn" onClick={() => joinCampaign(c.code)} disabled={!connected}>Resume</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel lobby-section">
            <div className="panel-header">
              <h3><UsersIcon size={14} /> Your heroes</h3>
              <button className="small-btn primary-btn" onClick={() => setShowBuilder(true)}>
                <PlusIcon size={12} /> New character
              </button>
            </div>
            <div className="lobby-section-body">
              {charList === null ? (
                <div className="empty-note">Loading...</div>
              ) : charList.length === 0 ? (
                <div className="empty-note">
                  No heroes yet. The builder walks you through every choice - or grab a ready-made hero in one click.
                </div>
              ) : (
                charList.map((c) => {
                  const sheet = c.sheet || {};
                  const meta = CLASS_META[sheet.classIndex] || {};
                  const derived = deriveSheet(sheet);
                  return (
                    <div className="character-card" key={c.id}>
                      <Avatar sheet={sheet} name={c.name} color={sheet.portrait?.color || 'var(--gold)'} size={54} />
                      <div className="char-card-info">
                        <div className="card-title">{c.name}</div>
                        <div className="card-sub">
                          Level {sheet.level || 1} {sheet.raceName || ''} {meta.name || ''}
                          {sheet.background ? ` · ${sheet.background[0].toUpperCase()}${sheet.background.slice(1)}` : ''}
                        </div>
                        <div className="char-stats">
                          <span className="char-stat" title="Hit points">
                            <HeartIcon size={12} /> {sheet.currentHp ?? sheet.maxHp ?? derived.maxHp}/{sheet.maxHp ?? derived.maxHp}
                          </span>
                          <span className="char-stat" title="Armour class">
                            <ShieldIcon size={12} /> {derived.ac}
                          </span>
                          <span className="char-stat" title="Passive Perception">
                            <SparkleIcon size={12} /> {derived.passivePerception}
                          </span>
                        </div>
                      </div>
                      <div className="card-actions">
                        <button className="small-btn danger-btn" onClick={() => deleteChar(c)} title={`Retire ${c.name}`} aria-label={`Retire ${c.name}`}>
                          <TrashIcon size={12} />
                        </button>
                        <button className="small-btn" onClick={() => setEditChar(c)}>
                          <ScrollIcon size={12} /> Sheet
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="lobby-footer">
        <div>
          dnd.ojee.net v{VERSION} · an unofficial fan-made tabletop, compatible with fifth edition ·{' '}
          <button className="link-btn" onClick={() => setShowCredits(true)}>licenses & credits</button>
        </div>
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

          <label className="field-label mt">Who runs the game</label>
          <div className="mode-pick">
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
              <label className="field-label mt">
                Starting scenes{' '}
                <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  - a set of maps ready to go. You can add, edit and build more at any time.
                </span>
              </label>
              <div className="pack-pick">
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
