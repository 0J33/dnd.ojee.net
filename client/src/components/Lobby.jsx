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
import { DragonLogo, D20Icon, MapIcon, UsersIcon, BookIcon, PlusIcon, SparkleIcon, SwordIcon, CrownIcon, ShieldIcon, HeartIcon, XIcon, TrashIcon, ScrollIcon, EyeIcon, PlayIcon, LogoutIcon, PenIcon } from './Icons';
import { VERSION } from '../version';
import { ADVENTURES, adventureBeats } from '../data/adventures';

// The first quest's seal: poured wax with an uneven rim and a d20 pressed
// into it. Drawn, not a gradient disc, so it reads as wax and not a button.
const SEAL_RIM = 'M59.9 27.1 Q60.8 32.0 59.1 36.6 Q57.4 41.2 55.5 45.7 Q53.6 50.1 49.4 52.5 Q45.2 54.8 41.1 57.5 Q37.0 60.2 32.1 59.6 Q27.2 59.1 22.9 57.1 Q18.7 55.1 14.2 52.9 Q9.8 50.6 7.8 46.1 Q5.9 41.5 5.8 36.8 Q5.8 32.0 5.5 27.1 Q5.3 22.3 8.2 18.4 Q11.2 14.5 14.6 11.1 Q18.0 7.8 22.7 6.8 Q27.4 5.9 32.2 5.0 Q36.9 4.1 41.4 6.1 Q45.8 8.0 49.2 11.4 Q52.6 14.7 55.8 18.4 Q59.0 22.2 59.9 27.1Z';
function WaxSeal() {
  return (
    <svg className="th-seal" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
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

// A candle in a brass dish and a felt-lined dice tray, on the table beside the heroes.
// The candle is the light the whole table is lit by.
function TableProps() {
  return (
    <div className="th-props" aria-hidden="true">
      <svg className="th-candle" viewBox="0 0 90 170">
        <defs>
          <linearGradient id="th-wax-body" x1="0" x2="1">
            <stop offset="0" stopColor="#b9a47c" /><stop offset="0.45" stopColor="#f1e4c2" /><stop offset="1" stopColor="#a8916a" />
          </linearGradient>
          <linearGradient id="th-brass" x1="0" x2="1">
            <stop offset="0" stopColor="#6e4f22" /><stop offset="0.4" stopColor="#e3c27c" /><stop offset="0.7" stopColor="#b48641" /><stop offset="1" stopColor="#5e421c" />
          </linearGradient>
          <radialGradient id="th-flame" cx="0.5" cy="0.75" r="0.7">
            <stop offset="0" stopColor="#fff8dc" /><stop offset="0.35" stopColor="#ffd77a" /><stop offset="0.75" stopColor="#f08a2c" /><stop offset="1" stopColor="#c2401a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="th-halo"><stop offset="0" stopColor="#ffc56e" stopOpacity="0.5" /><stop offset="1" stopColor="#ffc56e" stopOpacity="0" /></radialGradient>
        </defs>
        <circle className="th-halo" cx="45" cy="34" r="34" fill="url(#th-halo)" />
        <ellipse cx="45" cy="158" rx="40" ry="9" fill="#1a0f07" opacity="0.6" />
        <ellipse cx="45" cy="152" rx="38" ry="10" fill="url(#th-brass)" />
        <ellipse cx="45" cy="149" rx="30" ry="6.5" fill="#8a6430" />
        <rect x="31" y="62" width="28" height="88" rx="3" fill="url(#th-wax-body)" />
        <ellipse cx="45" cy="62" rx="14" ry="4" fill="#f6ead0" />
        <path d="M33 63 q-1 10 1 14 q2 4 2 -2 q0 -6 2 -11Z M52 63 q2 16 0 22 q-2 5 -2 -3 q0 -10 -1 -18Z" fill="#efe0bd" />
        <path d="M45 61 v-7" stroke="#2a1a0c" strokeWidth="1.6" strokeLinecap="round" />
        <path className="th-flame" d="M45 56 C36 46 39 34 45 18 C51 34 54 46 45 56Z" fill="url(#th-flame)" />
        <path className="th-flame-core" d="M45 55 C41 50 42 44 45 37 C48 44 49 50 45 55Z" fill="#fffbe8" opacity="0.85" />
      </svg>
      <svg className="th-tray" viewBox="0 0 200 120">
        <defs>
          <linearGradient id="th-tray-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a4429" /><stop offset="1" stopColor="#2e1b0e" />
          </linearGradient>
          <radialGradient id="th-felt" cx="0.45" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#7a2a1e" /><stop offset="1" stopColor="#3e110b" />
          </radialGradient>
          <filter id="th-felt-grain"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
        </defs>
        <rect x="4" y="10" width="192" height="104" rx="14" fill="#140a05" opacity="0.55" />
        <rect x="2" y="4" width="196" height="104" rx="14" fill="url(#th-tray-rim)" />
        <rect x="2.5" y="4.5" width="195" height="103" rx="13.5" fill="none" stroke="#8a5e3a" strokeOpacity="0.5" />
        <rect x="13" y="15" width="174" height="82" rx="8" fill="url(#th-felt)" />
        <rect x="13" y="15" width="174" height="82" rx="8" fill="#000" filter="url(#th-felt-grain)" />
        <rect x="13" y="15" width="174" height="10" rx="5" fill="#000" opacity="0.28" />
        <g transform="translate(112 32) rotate(14 25 25)" filter="drop-shadow(-3px 4px 3px rgba(0,0,0,0.55))">
          <polygon points="25,2 45,13 45,37 25,48 5,37 5,13" fill="#eadcbc" stroke="#7a2a14" strokeWidth="1.8" strokeLinejoin="round" />
          <g fill="none" stroke="#7a2a14" strokeWidth="1.3" strokeLinejoin="round">
            <polygon points="25,12 35,30 15,30" />
            <path d="M25 2 L25 12 M45 13 L35 30 M5 13 L15 30 M25 48 L35 30 M25 48 L15 30 M5 13 L25 12 L45 13 M5 37 L15 30 M45 37 L35 30" />
          </g>
          <text x="25" y="27" textAnchor="middle" fontSize="8.5" fontFamily="'IM Fell English SC', serif" fill="#7a2a14">20</text>
        </g>
        <g transform="translate(40 44) rotate(-20 17 17)" filter="drop-shadow(-3px 4px 3px rgba(0,0,0,0.55))">
          <rect x="1" y="1" width="34" height="34" rx="6" fill="#eadcbc" stroke="#7a2a14" strokeWidth="1.8" />
          {[[10, 10], [26, 10], [18, 18], [10, 26], [26, 26]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#7a2a14" />)}
        </g>
        <g transform="translate(78 58) rotate(32 13 13)" filter="drop-shadow(-3px 4px 3px rgba(0,0,0,0.55))">
          <polygon points="13,1 25,13 13,25 1,13" fill="#eadcbc" stroke="#7a2a14" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M1 13 H25 M13 1 V25" stroke="#7a2a14" strokeWidth="1" opacity="0.6" />
        </g>
      </svg>
    </div>
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

  // mode 'dm' | 'guided'; packKey = a set of starter maps; adventureKey = a
  // premade (guided: the app runs it; dm: its scenes + story beats are set up).
  const createCampaign = (name, mode, packKey, adventureKey = null) => {
    if (busy) return;
    setBusy(true);
    socket.emit('createCampaign', { name, mode, userId: user.id, username: user.username, adventureKey }, (res) => {
      setBusy(false);
      if (!res || !res.state) {
        dialog.alert((res && res.error) || 'Could not create campaign');
        return;
      }
      onEnterGame({ code: res.code, state: res.state });
      const blankSceneId = res.state.scenes[0] && res.state.scenes[0].id;

      // A premade, run by a DM: its places, people and story beats, ready in Prep.
      const adv = mode === 'dm' && adventureKey && ADVENTURES.find((a) => a.key === adventureKey);
      if (adv) {
        const built = adv.buildScenes();
        const scenes = built.map((sc) => ({ name: sc.name, floor: sc.bg.floor, cells: sc.cells, w: sc.grid.w, h: sc.grid.h, entry: sc.entry, tokens: sc.tokens, fogEnabled: true }));
        socket.emit('addScenes', { scenes }, (added) => {
          const ids = added?.sceneIds || [];
          if (!ids.length) return;
          const idFor = (localId) => ids[built.findIndex((sc) => sc.id === localId)] || null;
          for (const beat of adventureBeats(adv, idFor)) socket.emit('addBeat', beat);
          socket.emit('switchScene', { sceneId: ids[0] });
          if (blankSceneId) socket.emit('deleteScene', { sceneId: blankSceneId });
        });
        return;
      }

      // Seed the campaign with its starter scenes so the first session opens on
      // a real place instead of an empty grid.
      const pack = STARTER_PACKS.find((p) => p.key === packKey);
      if (!pack || !pack.scenes.length) return;
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

  // Your latest game of each premade (to continue it); everything else is
  // listed under Your campaigns.
  const runOf = (adv) => (campaignList || [])
    .filter((c) => c.mode === 'guided' && (c.adventureKey || 'flagon') === adv.key)
    .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0))[0];
  const runs = new Set(ADVENTURES.map(runOf).filter(Boolean));
  const others = (campaignList || []).filter((c) => !runs.has(c));
  const playAdventure = async (adv, fresh) => {
    if (fresh) {
      const ok = await dialog.confirm(
        `Start ${adv.name} again from the first scene? Your current game stays in Your campaigns, so you can go back to it.`,
        'Start fresh', 'Start fresh'
      );
      if (!ok) return;
    }
    createCampaign(adv.name, 'guided', 'blank', adv.key);
  };
  const runAdventure = (adv) => createCampaign(adv.name, 'dm', 'blank', adv.key);
  // Give up on a premade: every game of it you host goes, older restarts too,
  // so the quest is back to its "Begin" state.
  const abandonAdventure = async (adv) => {
    const mine = (campaignList || []).filter((c) => c.mode === 'guided' && (c.adventureKey || 'flagon') === adv.key && c.isHost);
    if (!mine.length) return;
    const ok = await dialog.confirm(
      `Abandon ${adv.name}? ${mine.length > 1 ? `Your ${mine.length} games of it are` : 'Your game is'} deleted, and the quest starts over the next time you begin it.`,
      'Abandon quest', 'Abandon'
    );
    if (!ok) return;
    await Promise.all(mine.map((c) => campaignsApi.remove(c.code)));
    refreshCampaigns();
  };

  // On a phone one part of the table owns the screen at a time.
  const [zone, setZone] = useState('quests');
  const heroes = charList || [];

  return (
    <div className="th-room" data-zone={zone}>
      <header className="th-sign">
        <div className="th-brand">
          <DragonLogo size={30} />
          <span className="th-brand-name">dnd.ojee.net</span>
        </div>
        <div className="th-sign-gap" />
        <button className="th-peg" onClick={() => setShowGuide(true)}><BookIcon size={15} /> <span>Guide</span></button>
        <span className="th-me">
          <span className={`th-conn ${connected ? 'is-on' : ''}`} title={connected ? 'Connected' : 'Connecting…'} />
          <span className="th-me-name">{user.username}</span>
        </span>
        <button className="th-peg is-icon" onClick={onLogout} title="Sign out (of mtg.ojee.net too)" aria-label="Sign out">
          <LogoutIcon size={17} />
        </button>
      </header>

      <main className="th-table">
        <div className="th-candlelight" aria-hidden="true" />

        <section className="th-party" aria-labelledby="th-party-title">
          <h2 id="th-party-title" className="th-carved">Your heroes</h2>
          <ul className="th-sheets" style={{ '--n': heroes.length + 1 }}>
            {charList === null && <li className="th-sheet is-loading" aria-hidden="true" />}
            {heroes.map((c, i) => {
              const sheet = c.sheet || {};
              const meta = CLASS_META[sheet.classIndex] || {};
              const derived = deriveSheet(sheet);
              return (
                <li className="th-sheet" key={c.id} style={{ '--tilt': `${[-4, 2.6, -1.8, 3.4, -2.8, 1.6][i % 6]}deg`, '--z': heroes.length + 1 - i }}>
                  <button className="th-sheet-open" onClick={() => setEditChar(c)} title={`Open ${c.name}'s sheet`}>
                    <Avatar sheet={sheet} name={c.name} color={sheet.portrait?.color || 'var(--gold)'} size={92} />
                    <span className="th-sheet-name">{c.name}</span>
                    <span className="th-sheet-sub">Level {sheet.level || 1} {sheet.raceName || ''} {meta.name || ''}</span>
                    <span className="th-sheet-stats">
                      <span title="Hit points"><HeartIcon size={14} /> {sheet.currentHp ?? sheet.maxHp ?? derived.maxHp}/{sheet.maxHp ?? derived.maxHp}</span>
                      <span title="Armour class"><ShieldIcon size={14} /> {derived.ac}</span>
                      <span title="Passive Perception"><EyeIcon size={14} /> {derived.passivePerception}</span>
                    </span>
                  </button>
                  <button className="th-wax" onClick={() => deleteChar(c)} title={`Retire ${c.name}`} aria-label={`Retire ${c.name}`}>
                    <TrashIcon size={14} />
                  </button>
                </li>
              );
            })}
            <li className="th-sheet is-blank" style={{ '--tilt': '3deg' }}>
              <button className="th-sheet-open" onClick={() => setShowBuilder(true)}>
                <span className="th-quill"><PenIcon size={30} /></span>
                <span className="th-sheet-name">New hero</span>
                <span className="th-sheet-sub">{heroes.length ? 'Write up another' : 'The builder walks you through every choice'}</span>
              </button>
            </li>
          </ul>
          <TableProps />
          {charList !== null && heroes.length === 0 && (
            <p className="th-note">No heroes yet. Starting a quest offers six ready-made ones, so you can play right away.</p>
          )}
        </section>

        <section className="th-board" aria-labelledby="th-board-title">
          <h2 id="th-board-title" className="th-carved">Quest board</h2>
          <div className="th-notices">
            {ADVENTURES.map((adv, i) => {
              const run = runOf(adv);
              return (
                <article key={adv.key} className={`th-notice ${adv.tutorial ? 'is-first' : ''} ${run ? 'is-started' : ''}`} style={{ '--tilt': `${[-0.6, 1.3, -1.1][i % 3]}deg` }} aria-labelledby={`th-adv-${adv.key}`}>
                  <span className="th-tack" aria-hidden="true" />
                  {adv.tutorial && <WaxSeal />}
                  <h3 id={`th-adv-${adv.key}`}>{adv.name}</h3>
                  <p className="th-notice-line">{adv.tutorial ? 'Your first quest. The app tells the story, runs the monsters and teaches the rules as you go.' : adv.tagline}</p>
                  <p className="th-notice-meta">{adv.levels} · {adv.length}{adv.tutorial ? ' · ready-made heroes' : ''}</p>
                  <div className="th-notice-actions">
                    {run ? (
                      <>
                        <button className="primary-btn" onClick={() => joinCampaign(run.code)} disabled={!connected || busy}><PlayIcon size={14} /> Continue</button>
                        <button className="link-btn" onClick={() => playAdventure(adv, true)} disabled={!connected || busy}>Start fresh</button>
                        {run.isHost && <button className="link-btn is-danger" onClick={() => abandonAdventure(adv)} disabled={busy}>Abandon</button>}
                      </>
                    ) : (
                      <button className="primary-btn" onClick={() => playAdventure(adv, false)} disabled={!connected || busy} title="The app narrates and runs the monsters">
                        <D20Icon size={14} /> {adv.tutorial ? 'Begin the first quest' : 'Play, no DM needed'}
                      </button>
                    )}
                    {adv.tutorial
                      ? (!run && <button className="link-btn" onClick={() => setShowGuide(true)}>Player's guide</button>)
                      : <button className="link-btn" onClick={() => runAdventure(adv)} disabled={!connected || busy} title="You narrate: maps, read-aloud text and encounters are set up in Prep"><CrownIcon size={13} /> Run it as DM</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="th-edge" aria-labelledby="th-edge-title">
          <h2 id="th-edge-title" className="th-carved">Your tables</h2>
          <div className="th-plaques">
            {campaignList === null ? (
              <span className="th-note">Pulling up chairs…</span>
            ) : others.map((c) => (
              <div className={`th-plaque ${c.online > 0 ? 'is-live' : ''}`} key={c.code}>
                <span className="th-plaque-name">{c.name}</span>
                <span className="th-plaque-sub">
                  <span className="th-chalk-code" title="Campaign code">{c.code}</span>
                  {c.mode === 'guided' ? 'Guided' : c.isHost ? 'You run it' : 'DM game'}
                </span>
                <span className="th-plaque-who">
                  {c.online > 0 ? <span className="th-live">{c.online} at the table</span> : timeAgo(c.lastActivity)}
                  {' · '}{c.members.slice(0, 3).join(', ')}{c.members.length > 3 ? '…' : ''}
                </span>
                <span className="th-plaque-actions">
                  <button className="primary-btn small-btn" onClick={() => joinCampaign(c.code)} disabled={!connected || busy}>Resume</button>
                  {c.isHost && (
                    <button className="th-wax is-inline" onClick={() => deleteCampaign(c)} title={`Delete ${c.name}`} aria-label={`Delete ${c.name}`}>
                      <TrashIcon size={14} />
                    </button>
                  )}
                </span>
              </div>
            ))}
            <button className="th-plaque is-new" onClick={() => setShowCreate(true)} disabled={!connected}>
              <PlusIcon size={18} />
              <span className="th-plaque-name">New campaign</span>
              <span className="th-plaque-who">{others.length ? 'Run your own or a guided one' : 'Be the DM, or let the app run it'}</span>
            </button>
          </div>
          <form className="th-slate" onSubmit={(e) => { e.preventDefault(); joinCampaign(joinCode); }}>
            <label htmlFor="th-code">A friend's game</label>
            <div className="th-slate-row">
              <input
                id="th-code"
                placeholder="code"
                value={joinCode}
                maxLength={6}
                autoComplete="off"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" disabled={joinCode.length < 4 || !connected}>Join</button>
            </div>
          </form>
        </section>
      </main>

      <nav className="th-zones" aria-label="Parts of the table">
        {[['quests', 'Quests', ScrollIcon], ['party', 'Heroes', UsersIcon], ['tables', 'Tables', MapIcon]].map(([k, label, Icon]) => (
          <button key={k} className={zone === k ? 'is-on' : ''} aria-pressed={zone === k} onClick={() => setZone(k)}><Icon size={18} /> {label}</button>
        ))}
      </nav>

      <footer className="th-foot">
        v{VERSION} · unofficial fan-made tabletop, compatible with fifth edition ·{' '}
        <button className="link-btn" onClick={() => setShowCredits(true)}>licenses &amp; credits</button>
      </footer>

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, mode, pack, adv) => {
            setShowCreate(false);
            createCampaign(name, mode, pack, adv);
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
  const [advKey, setAdvKey] = useState('flagon');

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
              <p>The app narrates a ready-made adventure and runs the monsters. Perfect when nobody wants to be the DM.</p>
            </button>
          </div>

          {mode === 'guided' && (
            <>
              <label className="field-label mt" id="campaign-adv-label">Adventure</label>
              <div className="pack-pick" role="group" aria-labelledby="campaign-adv-label">
                {ADVENTURES.map((a) => (
                  <button type="button" key={a.key} className={`pack-card ${advKey === a.key ? 'selected' : ''}`} aria-pressed={advKey === a.key} onClick={() => setAdvKey(a.key)}>
                    <strong>{a.name}</strong>
                    <span className="muted small">{a.levels} · {a.length}. {a.tutorial ? 'Teaches the rules as you play.' : a.tagline}</span>
                  </button>
                ))}
              </div>
            </>
          )}

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
          <button className="primary-btn" onClick={() => onCreate(name.trim() || (mode === 'guided' ? ADVENTURES.find((a) => a.key === advKey).name : 'New Campaign'), mode, mode === 'dm' ? pack : 'blank', mode === 'guided' ? advKey : null)}>
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
