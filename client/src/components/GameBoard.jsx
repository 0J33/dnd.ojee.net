import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket';
import { characters as charsApi } from '../api';
import { useDialog, ModalOverlay, ContextMenu, useLocalStorage } from '../utils';
import { deriveSheet } from '../rules/engine';
import { PREGENS } from '../data/pregens';
import { blankCells } from '../data/scenes';
import { charAt } from '../render/sceneRender';
import MapCanvas from './MapCanvas';
import { PartyPanel, InitiativeBar, ChatPanel, DiceTray, RollToasts } from './BoardPanels';
import { MonsterBrowser, StatBlock } from './MonsterBrowser';
import ReferencePanel from './ReferencePanel';
import CharacterSheet from './CharacterSheet';
import CharacterBuilder from './CharacterBuilder';
import Guide from './Guide';
import TutorialOverlay from './TutorialOverlay';
import SceneEditor from './SceneEditor';
import ScenePrep, { SceneThumb } from './ScenePrep';
import { Avatar, NPC_ART_KEYS } from './Portrait';
import {
  DragonLogo, BookIcon, MapIcon, GearIcon, RulerIcon, PenIcon, FogIcon, TargetIcon, ScrollIcon,
  EyeIcon, SwordIcon, SkullIcon, LightningIcon, BurstIcon, XIcon, PersonIcon, FlagIcon, CopyIcon,
  SparkleIcon, TrophyIcon, ChevronLeft, ChevronRight, ExpandIcon, BrushIcon, EraserIcon, PlusIcon,
  MenuIcon, UsersIcon, ChatIcon, D20Icon, PencilIcon, CheckIcon,
} from './Icons';

const DRAW_COLORS = ['#e8c476', '#e07040', '#7fb069', '#5f87a8', '#c94f6d', '#ffffff'];
const NPC_COLORS = ['#5f87a8', '#7fb069', '#b06ab0', '#c2542e', '#5fb0a5', '#d4a94f'];
const MOBILE_MAX = 820;

/** Tools available in the left dock. `dm` tools only appear for the DM. */
const TOOLS = [
  { key: 'select', name: 'Select', hint: 'Move tokens. Drag empty space to pan, double-click to ping.', Icon: TargetIcon, shortcut: 'V' },
  { key: 'measure', name: 'Measure', hint: 'Drag to measure - one square is 5 ft.', Icon: RulerIcon, shortcut: 'M' },
  { key: 'draw', name: 'Draw', hint: 'Sketch on the map for everyone.', Icon: PenIcon, shortcut: 'D' },
  { key: 'fog', name: 'Fog', hint: 'Reveal or re-hide parts of the map.', Icon: FogIcon, shortcut: 'F', dm: true },
  { key: 'build', name: 'Build', hint: 'Paint walls, floors, doors and furniture straight onto the map.', Icon: BrushIcon, shortcut: 'B', dm: true },
];

export default function GameBoard({ user, code, state, chat, log, connected, onLeave }) {
  const dialog = useDialog();
  const isDM = !!state.viewerIsDM;
  const me = state.members.find((m) => m.userId === user.id);
  const myCharacterId = me?.characterId || null;
  const activeScene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];

  const [tool, setTool] = useState('select');
  const [fogMode, setFogMode] = useState('reveal');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [build, setBuild] = useLocalStorage('dnd_build', { ch: '#', shape: 'brush', size: 1 });
  const [toasts, setToasts] = useState([]);
  const [pings, setPings] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX);
  const [mobilePane, setMobilePane] = useState('map'); // map | party | chat | more
  const [chatOpen, setChatOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > MOBILE_MAX);
  const [sceneStripOpen, setSceneStripOpen] = useLocalStorage('dnd_sceneStrip', true);
  const [sheetChar, setSheetChar] = useState(null);
  const [showMonsters, setShowMonsters] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [showPrep, setShowPrep] = useState(false);
  const [prepTab, setPrepTab] = useState('scenes');
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [statblockToken, setStatblockToken] = useState(null);
  const [ctx, setCtx] = useState(null); // {x, y, items}
  const [posOverlay, setPosOverlay] = useState({});
  const [strokeOverlay, setStrokeOverlay] = useState({});
  const [cellOverlay, setCellOverlay] = useState({}); // sceneId -> {'x,y': ch}
  const [placeToken, setPlaceToken] = useState(null); // { kind } while placing from a menu
  const pendingSpawn = useRef(null);
  const diceModeRef = useRef('normal');

  // needs a character? (players always; DM optional)
  const needsCharacter = !myCharacterId && (state.mode === 'guided' || state.dmId !== user.id);
  useEffect(() => {
    if (needsCharacter) setShowPicker(true);
  }, [needsCharacter]);

  // ---------- responsive ----------
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= MOBILE_MAX;
      setIsMobile(mobile);
      if (!mobile) setMobilePane('map');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const hit = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase() && (!t.dm || isDM));
      if (hit) {
        e.preventDefault();
        setTool(hit.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDM]);

  // a player who stops being the DM must not keep a DM-only tool selected
  useEffect(() => {
    const t = TOOLS.find((x) => x.key === tool);
    if (t && t.dm && !isDM) setTool('select');
  }, [isDM, tool]);

  // ---------- socket listeners ----------
  useEffect(() => {
    const onRoll = (r) => {
      setToasts((prev) => [...prev.slice(-2), r]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== r.id)), 7000);
    };
    const onPingEv = (p) => {
      setPings((prev) => [...prev, p]);
      setTimeout(() => setPings((prev) => prev.filter((x) => x.id !== p.id)), 2600);
    };
    const onTokenMoved = ({ tokenId, x, y }) => {
      setPosOverlay((prev) => ({ ...prev, [tokenId]: { x, y, ts: Date.now() } }));
    };
    const onStroke = ({ sceneId, stroke }) => {
      setStrokeOverlay((prev) => ({ ...prev, [sceneId]: [...(prev[sceneId] || []), stroke] }));
    };
    const onErased = ({ sceneId, ids }) => {
      setStrokeOverlay((prev) => ({ ...prev, [sceneId]: (prev[sceneId] || []).filter((s) => !ids.includes(s.id)) }));
    };
    const onCleared = ({ sceneId }) => setStrokeOverlay((prev) => ({ ...prev, [sceneId]: [] }));
    const onPainted = ({ sceneId, cells }) => {
      setCellOverlay((prev) => {
        const next = { ...(prev[sceneId] || {}) };
        for (const c of cells) next[`${c.x},${c.y}`] = c.ch;
        return { ...prev, [sceneId]: next };
      });
    };
    const onCombatEvent = (ev) => {
      if (ev.kind === 'monsterAttackRoll' && ev.roll) {
        onRoll({
          ...ev.roll,
          id: `${ev.tokenId}-${Date.now()}`,
          username: ev.attackName,
          characterName: null,
          label: `${ev.hit ? 'HIT' : 'MISS'} vs AC ${ev.targetAc}`,
          secret: false,
          parts: ev.roll.parts,
          mode: ev.roll.mode,
        });
      }
    };
    socket.on('rollResult', onRoll);
    socket.on('ping', onPingEv);
    socket.on('tokenMoved', onTokenMoved);
    socket.on('strokeAdded', onStroke);
    socket.on('strokesErased', onErased);
    socket.on('drawingsCleared', onCleared);
    socket.on('scenePainted', onPainted);
    socket.on('combatEvent', onCombatEvent);
    return () => {
      socket.off('rollResult', onRoll);
      socket.off('ping', onPingEv);
      socket.off('tokenMoved', onTokenMoved);
      socket.off('strokeAdded', onStroke);
      socket.off('strokesErased', onErased);
      socket.off('drawingsCleared', onCleared);
      socket.off('scenePainted', onPainted);
      socket.off('combatEvent', onCombatEvent);
    };
  }, []);

  // clear stale overlays once the authoritative state catches up
  useEffect(() => {
    setPosOverlay((prev) => {
      const now = Date.now();
      const next = {};
      for (const [id, p] of Object.entries(prev)) if (now - p.ts < 1200) next[id] = p;
      return next;
    });
    setStrokeOverlay((prev) => {
      const next = {};
      for (const [sceneId, strokes] of Object.entries(prev)) {
        const scene = state.scenes.find((s) => s.id === sceneId);
        if (!scene) continue;
        const known = new Set((scene.strokes || []).map((s) => s.id));
        const pending = strokes.filter((s) => !known.has(s.id));
        if (pending.length) next[sceneId] = pending;
      }
      return next;
    });
    setCellOverlay((prev) => {
      const next = {};
      for (const [sceneId, cells] of Object.entries(prev)) {
        const scene = state.scenes.find((s) => s.id === sceneId);
        if (!scene) continue;
        const pending = {};
        for (const [key, ch] of Object.entries(cells)) {
          const [x, y] = key.split(',').map(Number);
          if (charAt(scene, x, y) !== ch) pending[key] = ch;
        }
        if (Object.keys(pending).length) next[sceneId] = pending;
      }
      return next;
    });
  }, [state]);

  // merge optimistic overlays into the scene we actually render
  const renderScene = useMemo(() => {
    if (!activeScene) return null;
    const tokens = activeScene.tokens.map((t) => (posOverlay[t.id] ? { ...t, x: posOverlay[t.id].x, y: posOverlay[t.id].y } : t));
    const strokes = [...(activeScene.strokes || []), ...(strokeOverlay[activeScene.id] || [])];
    let cells = activeScene.cells;
    const pending = cellOverlay[activeScene.id];
    if (pending && Object.keys(pending).length && cells) {
      const rows = cells.map((r) => r.split(''));
      for (const [key, ch] of Object.entries(pending)) {
        const [x, y] = key.split(',').map(Number);
        if (rows[y] && rows[y][x] !== undefined) rows[y][x] = ch;
      }
      cells = rows.map((r) => r.join(''));
    }
    return { ...activeScene, tokens, strokes, cells };
  }, [activeScene, posOverlay, strokeOverlay, cellOverlay]);

  const charSheets = useMemo(() => {
    const out = {};
    for (const [id, sheet] of Object.entries(state.charSheets || {})) {
      out[id] = { ...sheet, derived: deriveSheet(sheet) };
    }
    return out;
  }, [state.charSheets]);

  const mySheet = myCharacterId ? charSheets[myCharacterId] : null;
  // A DM with no hero has no token: without the guard, undefined === undefined
  // matched the first monster and offered the DM its initiative roll.
  const myToken = renderScene && myCharacterId ? renderScene.tokens.find((t) => t.characterId === myCharacterId) : null;

  // ---------- actions ----------
  const doRoll = useCallback(
    ({ formula, label, mode, secret, characterName }) => {
      socket.emit(
        'rollDice',
        {
          formula,
          mode: mode || 'normal',
          label,
          secret: !!secret,
          characterName: characterName !== undefined ? characterName : mySheet ? mySheet.name : null,
        },
        (res) => {
          if (res && res.error) dialog.alert(res.error);
        }
      );
    },
    [mySheet, dialog]
  );

  const sheetRoll = useCallback(({ formula, label, mode }) => doRoll({ formula, label, mode: mode || diceModeRef.current }), [doRoll]);
  // The sheet arrives with the `derived` it was opened with; recompute it so the
  // server (the auto-DM reads derived.ac) never sees values one edit stale.
  const updateSheet = useCallback((characterId) => (sheet) => socket.emit('updateSheet', { characterId, sheet: { ...sheet, derived: deriveSheet(sheet) } }), []);
  const announce = useCallback((text) => socket.emit('sendChatMessage', { text }), []);

  const paintCells = useCallback(
    (cells) => {
      if (!activeScene) return;
      setCellOverlay((prev) => {
        const next = { ...(prev[activeScene.id] || {}) };
        for (const c of cells) next[`${c.x},${c.y}`] = c.ch;
        return { ...prev, [activeScene.id]: next };
      });
      socket.emit('paintScene', { sceneId: activeScene.id, cells });
    },
    [activeScene]
  );

  const selectCharacter = async (charLike) => {
    let id = charLike.id;
    let sheet = charLike.sheet;
    if (charLike.pregen) {
      const created = await charsApi.create(charLike.sheet.name, charLike.sheet);
      if (!created || !created.id) return dialog.alert('Could not create character');
      id = created.id;
      sheet = created.sheet;
    }
    socket.emit('selectCharacter', { characterId: id, name: sheet.name, sheet: { ...sheet, derived: deriveSheet(sheet) } });
    setShowPicker(false);
  };

  const rollInitiative = () => {
    if (!myToken || !mySheet) return;
    const init = mySheet.derived.initiative;
    socket.emit(
      'rollDice',
      { formula: `1d20${init >= 0 ? '+' : ''}${init}`, mode: 'normal', label: 'Initiative!', characterName: mySheet.name },
      (res) => {
        if (res && res.roll) socket.emit('setInitiative', { tokenId: myToken.id, value: res.roll.total, name: mySheet.name });
      }
    );
  };

  // ---------- context menus ----------
  const tokenContext = (token, x, y) => {
    const items = [];
    const isMine = token.ownerId === user.id;
    if (token.kind === 'pc' && token.characterId) {
      items.push({ label: 'Open sheet', icon: <ScrollIcon size={15} />, onClick: () => setSheetChar(token.characterId) });
    }
    if (token.kind === 'monster' && token.monsterIndex) {
      items.push({ label: 'Stat block', icon: <BookIcon size={15} />, onClick: () => setStatblockToken(token) });
    }
    if ((isDM || isMine) && state.combat.active) {
      items.push({
        label: 'Set initiative...',
        icon: <LightningIcon size={15} />,
        onClick: async () => {
          const v = await dialog.prompt(`Initiative for ${token.label}?`, '10');
          if (v !== null && v !== '') socket.emit('setInitiative', { tokenId: token.id, value: parseInt(v, 10) || 0, name: token.label });
        },
      });
    }
    if (isDM) {
      if (token.kind === 'monster') {
        items.push({ label: 'Run its turn (auto)', icon: <SwordIcon size={15} />, onClick: () => socket.emit('autoMonsterTurn', { tokenId: token.id }) });
        items.push({
          label: 'Damage...',
          icon: <BurstIcon size={15} />,
          onClick: async () => {
            const v = await dialog.prompt(`Damage to ${token.label}?`, '5');
            if (v) socket.emit('applyHp', { tokenId: token.id, delta: -(parseInt(v, 10) || 0) });
          },
        });
        items.push({
          label: token.dead ? 'Revive' : 'Mark dead',
          icon: <SkullIcon size={15} />,
          onClick: () => socket.emit('updateToken', { tokenId: token.id, patch: { dead: !token.dead, hp: token.dead ? 1 : 0 } }),
        });
      }
      items.push({ divider: true });
      items.push({
        label: 'Rename...',
        icon: <PencilIcon size={15} />,
        onClick: async () => {
          const v = await dialog.prompt('Name for this token?', token.label, 'Rename token');
          if (v && v.trim()) socket.emit('updateToken', { tokenId: token.id, patch: { label: v.trim() } });
        },
      });
      items.push({
        label: token.hidden ? 'Reveal token' : 'Hide from players',
        icon: <EyeIcon size={15} />,
        onClick: () => socket.emit('updateToken', { tokenId: token.id, patch: { hidden: !token.hidden } }),
      });
      items.push({
        label: 'Bigger / smaller',
        icon: <ExpandIcon size={15} />,
        onClick: () => socket.emit('updateToken', { tokenId: token.id, patch: { size: token.size >= 3 ? 1 : token.size + 1 } }),
      });
      items.push({ label: 'Remove', icon: <XIcon size={15} />, danger: true, onClick: () => socket.emit('removeToken', { tokenId: token.id }) });
    }
    if (items.length) setCtx({ x, y, items });
  };

  const cellContext = (cell, x, y) => {
    const items = [];
    if (myToken) {
      items.push({
        label: 'Move my token here',
        icon: <PersonIcon size={15} />,
        onClick: () => socket.emit('moveToken', { tokenId: myToken.id, x: cell.x, y: cell.y }),
      });
    }
    items.push({ label: 'Ping this square', icon: <TargetIcon size={15} />, onClick: () => socket.emit('ping', { x: cell.x, y: cell.y }) });
    if (isDM) {
      items.push({ divider: true });
      items.push({ header: 'Place here' });
      items.push({
        label: 'Monster...',
        icon: <SkullIcon size={15} />,
        onClick: () => {
          pendingSpawn.current = cell;
          setShowMonsters(true);
        },
      });
      items.push({
        label: 'NPC...',
        icon: <PersonIcon size={15} />,
        onClick: () => {
          pendingSpawn.current = cell;
          setPlaceToken({ kind: 'npc' });
        },
      });
      items.push({
        label: 'Marker...',
        icon: <FlagIcon size={15} />,
        onClick: () => {
          pendingSpawn.current = cell;
          setPlaceToken({ kind: 'marker' });
        },
      });
    }
    setCtx({ x, y, items });
  };

  const canMoveToken = useCallback(
    (token) => {
      if (token.kind === 'marker') return isDM;
      return isDM || token.ownerId === user.id || state.settings?.playersCanMoveAny;
    },
    [isDM, user.id, state.settings]
  );

  const copyInvite = () => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard?.writeText(url);
    announce(`Invite link: ${url}`);
  };

  if (!renderScene) return null;

  const party = state.members.filter((m) => m.characterId).map((m) => charSheets[m.characterId]).filter(Boolean);
  const visibleTools = TOOLS.filter((t) => !t.dm || isDM);
  const openPrep = (tab) => {
    setPrepTab(tab);
    setShowPrep(true);
    setMobilePane('map');
  };

  return (
    <div className={`game-board ${isMobile ? 'is-mobile' : ''} pane-${mobilePane}`}>
      {/* ---------- topbar ---------- */}
      <header className="topbar board-topbar">
        <button className="small-btn ghost-btn" onClick={onLeave} title="Back to the lobby">
          <ChevronLeft size={13} /> <span className="hide-sm">Lobby</span>
        </button>
        <div className="topbar-brand">
          <DragonLogo size={22} />
          <span className="topbar-title-sm" title={state.name}>{state.name}</span>
          <button className="chip code-chip" onClick={copyInvite} title="Copy the invite link for this campaign">
            {code} <CopyIcon size={11} />
          </button>
        </div>

        <div className="grow" />

        <div className="topbar-actions">
          {isDM && !state.combat.active && (
            <button className="small-btn primary-btn" onClick={() => socket.emit('startCombat')} title="Start combat - everyone rolls initiative">
              <SwordIcon size={13} /> <span className="hide-sm">Combat</span>
            </button>
          )}
          {isDM && (
            <button className="small-btn" onClick={() => setShowMonsters(true)} title="Monster library">
              <SkullIcon size={13} /> <span className="hide-sm">Monsters</span>
            </button>
          )}
          {isDM && (
            <button className="small-btn" onClick={() => openPrep('scenes')} title="Scenes and story prep">
              <MapIcon size={13} /> <span className="hide-sm">Prep</span>
            </button>
          )}
          {mySheet && (
            <button className="small-btn" onClick={() => setSheetChar(myCharacterId)} title="My character sheet">
              <ScrollIcon size={13} /> <span className="hide-sm">Sheet</span>
            </button>
          )}
          <button className="small-btn ghost-btn hide-sm" onClick={() => setShowReference(true)} title="Rules quick reference">
            <BookIcon size={13} /> Rules
          </button>
          <button className="small-btn ghost-btn hide-sm" onClick={() => setShowGuide(true)} title="Player's guide" aria-label="Player's guide">
            <BookIcon size={13} />
          </button>
          {(isDM || state.hostId === user.id) && (
            <button className="small-btn ghost-btn hide-sm" onClick={() => setShowSettings(true)} title="Campaign settings" aria-label="Campaign settings">
              <GearIcon size={13} />
            </button>
          )}
          <span className={`conn-dot ${connected ? 'on' : ''}`} title={connected ? 'Connected' : 'Reconnecting...'} />
        </div>
      </header>

      {/* ---------- main area ---------- */}
      <div className="board-main">
        <PartyPanel
          state={{ ...state, charSheets }}
          isDM={isDM}
          userId={user.id}
          onOpenSheet={setSheetChar}
          onMonsterHp={(t, hp) => socket.emit('updateToken', { tokenId: t.id, patch: { hp } })}
          onMonsterAct={(t) => socket.emit('autoMonsterTurn', { tokenId: t.id })}
          onTokenSelect={(t) => setStatblockToken(t)}
          onAddMonster={isDM ? () => setShowMonsters(true) : null}
        />

        <div className="map-area">
          {isDM && state.scenes.length > 0 && (
            <SceneStrip
              scenes={state.scenes}
              activeId={state.activeSceneId}
              open={sceneStripOpen}
              onToggle={() => setSceneStripOpen(!sceneStripOpen)}
              onGo={(id) => socket.emit('switchScene', { sceneId: id })}
              onManage={() => openPrep('scenes')}
            />
          )}

          <InitiativeBar
            state={state}
            isDM={isDM}
            userId={user.id}
            myToken={myToken}
            myInitMod={mySheet ? mySheet.derived.initiative : 0}
            onRollInitiative={rollInitiative}
            onRollMonsters={() => socket.emit('rollMonsterInitiative')}
            onBegin={() => socket.emit('beginCombatOrder')}
            onNext={() => socket.emit('nextTurn')}
            onEnd={() => socket.emit('endCombat')}
          />

          <ToolDock
            tools={visibleTools}
            tool={tool}
            onTool={setTool}
            drawColor={drawColor}
            onDrawColor={setDrawColor}
            fogMode={fogMode}
            onFogMode={setFogMode}
            scene={activeScene}
            onFogToggle={() => socket.emit('updateScene', { sceneId: activeScene.id, patch: { fogEnabled: !activeScene.fogEnabled } })}
            onFogCoverAll={() => socket.emit('resetFog', { sceneId: activeScene.id, covered: true })}
            onClearDrawings={() => socket.emit('clearDrawings', { sceneId: activeScene.id })}
          />

          <MapCanvas
            scene={renderScene}
            isDM={isDM}
            tool={tool}
            fogMode={fogMode}
            drawColor={drawColor}
            build={build}
            charSheets={charSheets}
            combat={state.combat}
            userId={user.id}
            canMoveToken={canMoveToken}
            pings={pings}
            onMoveToken={(tokenId, x, y) => socket.emit('moveToken', { tokenId, x, y })}
            onTokenContext={tokenContext}
            onCellContext={cellContext}
            onTokenClick={(t) => {
              if (t.kind === 'pc' && t.characterId) setSheetChar(t.characterId);
              else if (t.kind === 'monster' && (isDM || !t.hidden) && t.monsterIndex) setStatblockToken(t);
            }}
            onRevealCells={(cells, mode2) => socket.emit('revealFog', { sceneId: activeScene.id, cells, mode: mode2 })}
            onPing={(x, y) => socket.emit('ping', { x, y })}
            onDrawStroke={(stroke) => socket.emit('drawStroke', { sceneId: activeScene.id, stroke })}
            onEraseStrokes={(ids) => socket.emit('eraseStrokes', { sceneId: activeScene.id, ids })}
            onPaint={paintCells}
            bottomInset={isMobile && tool === 'build' ? Math.round(window.innerHeight * 0.46) : 0}
          />

          <SceneCaption
            scene={activeScene}
            isDM={isDM}
            story={state.story}
            onOpenStory={() => openPrep('story')}
            onEditScene={() => openPrep('scenes')}
          />

          <DiceTray
            characterName={mySheet ? mySheet.name : null}
            onRoll={({ formula, mode, secret, label }) => {
              diceModeRef.current = mode;
              doRoll({ formula, mode, secret, label });
            }}
          />
          <RollToasts toasts={toasts} />
        </div>

        {tool === 'build' && isDM && (
          <SceneEditor
            scene={activeScene}
            build={build}
            dialog={dialog}
            onBuildChange={setBuild}
            onClose={() => setTool('select')}
            onSceneUpdate={(patch) => socket.emit('updateScene', { sceneId: activeScene.id, patch })}
            onReshape={({ w, h, floor }) => {
              const cells = resizeCells(activeScene, w, h, floor);
              socket.emit('reshapeScene', { sceneId: activeScene.id, w, h, floor, cells });
            }}
          />
        )}

        <ChatPanel
          chat={chat}
          log={log}
          members={state.members}
          userId={user.id}
          isDM={isDM}
          collapsed={!chatOpen && !isMobile}
          onToggle={() => setChatOpen(!chatOpen)}
          onSend={(text, whisperTo) => socket.emit('sendChatMessage', { text, whisperTo })}
          onRollFormula={(formula, secret) => doRoll({ formula, label: formula, secret })}
        />
      </div>

      {/* ---------- mobile bottom navigation ---------- */}
      {isMobile && (
        <nav className="board-tabbar" aria-label="Board sections">
          {[
            { key: 'map', label: 'Map', Icon: MapIcon },
            { key: 'party', label: 'Party', Icon: UsersIcon },
            { key: 'chat', label: 'Chat', Icon: ChatIcon },
            { key: 'more', label: 'More', Icon: MenuIcon },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              className={mobilePane === key ? 'on' : ''}
              aria-current={mobilePane === key ? 'page' : undefined}
              onClick={() => setMobilePane(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {isMobile && mobilePane === 'more' && (
        <MoreSheet
          isDM={isDM}
          isHost={state.hostId === user.id}
          hasSheet={!!mySheet}
          onClose={() => setMobilePane('map')}
          onSheet={() => {
            setSheetChar(myCharacterId);
            setMobilePane('map');
          }}
          onMonsters={() => {
            setShowMonsters(true);
            setMobilePane('map');
          }}
          onPrep={() => openPrep('scenes')}
          onStory={() => openPrep('story')}
          onRules={() => {
            setShowReference(true);
            setMobilePane('map');
          }}
          onGuide={() => {
            setShowGuide(true);
            setMobilePane('map');
          }}
          onSettings={() => {
            setShowSettings(true);
            setMobilePane('map');
          }}
        />
      )}

      {/* ---------- tutorial overlay ---------- */}
      {state.mode === 'guided' && (
        <TutorialOverlay state={state} me={me} mySheet={mySheet} charSheets={charSheets} onRoll={doRoll} needsCharacter={needsCharacter} />
      )}

      {/* ---------- modals ---------- */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}

      {sheetChar && charSheets[sheetChar] && (
        <ModalOverlay onClose={() => setSheetChar(null)} className="sheet-overlay">
          <CharacterSheet
            characterId={sheetChar}
            initialSheet={charSheets[sheetChar]}
            liveSheet={charSheets[sheetChar]}
            mode="game"
            readOnly={!(charSheets[sheetChar].ownerId === user.id || (state.mode === 'dm' && state.dmId === user.id))}
            onClose={() => setSheetChar(null)}
            onSheetChange={updateSheet(sheetChar)}
            onRoll={({ formula, label, mode }) => sheetRoll({ formula, label, mode })}
            onAnnounce={announce}
          />
        </ModalOverlay>
      )}

      {showMonsters && isDM && (
        <MonsterBrowser
          onClose={() => {
            setShowMonsters(false);
            pendingSpawn.current = null;
          }}
          party={party}
          sceneMonsters={renderScene.tokens.filter((t) => t.kind === 'monster' && !t.dead)}
          onRoll={({ formula, label }) => doRoll({ formula, label, characterName: null })}
          onAddToken={(token) => {
            const spawn = pendingSpawn.current || findFreeCell(renderScene);
            pendingSpawn.current = null;
            socket.emit('addToken', { sceneId: activeScene.id, token: { ...token, x: spawn.x, y: spawn.y } });
          }}
        />
      )}

      {placeToken && (
        <PlaceTokenModal
          kind={placeToken.kind}
          onClose={() => {
            setPlaceToken(null);
            pendingSpawn.current = null;
          }}
          onPlace={(token) => {
            const spawn = pendingSpawn.current || findFreeCell(renderScene);
            pendingSpawn.current = null;
            socket.emit('addToken', { sceneId: activeScene.id, token: { ...token, x: spawn.x, y: spawn.y } });
            setPlaceToken(null);
          }}
        />
      )}

      {statblockToken && (
        <ModalOverlay onClose={() => setStatblockToken(null)}>
          <div className="modal" style={{ maxWidth: 620 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{statblockToken.label}</h3>
              <button className="close-btn" aria-label="Close" onClick={() => setStatblockToken(null)}>
                <XIcon size={16} />
              </button>
            </div>
            <div className="modal-body">
              {statblockToken.monsterIndex ? (
                <StatBlock index={statblockToken.monsterIndex} onRoll={isDM ? ({ formula, label }) => doRoll({ formula, label, characterName: null }) : null} />
              ) : (
                <p className="muted">No stat block for this token.</p>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {showPrep && isDM && <ScenePrep state={state} dialog={dialog} initialTab={prepTab} onClose={() => setShowPrep(false)} />}

      {showSettings && <SettingsModal state={state} user={user} isDM={isDM} dialog={dialog} onClose={() => setShowSettings(false)} />}

      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
      {showGuide && <Guide onClose={() => setShowGuide(false)} />}

      {showPicker && (
        <CharacterPicker
          onPick={selectCharacter}
          onBuild={() => {
            setShowPicker(false);
            setShowBuilder(true);
          }}
          canClose={!needsCharacter}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showBuilder && (
        <CharacterBuilder
          onClose={() => {
            setShowBuilder(false);
            if (needsCharacter) setShowPicker(true);
          }}
          onSaved={(created) => {
            setShowBuilder(false);
            selectCharacter({ id: created.id, sheet: created.sheet });
          }}
        />
      )}
    </div>
  );
}

/* ---------------- scene caption ---------------- */
// What the table is looking at, plus the two things a DM needs mid-session:
// the notes they wrote for this scene and the next beat they planned.

function SceneCaption({ scene, isDM, story, onOpenStory, onEditScene }) {
  const [showNotes, setShowNotes] = useState(false);
  const beats = story?.beats || [];
  const activeIndex = beats.findIndex((b) => b.id === story?.activeBeatId);
  const nextBeat = beats.find((b, i) => !b.done && i > activeIndex) || beats.find((b) => !b.done);
  const hasNotes = isDM && !!(scene.notes || '').trim();

  return (
    <div className="scene-caption-bar">
      <div className="scene-caption" aria-live="polite">
        <MapIcon size={12} /> <span>{scene.name}</span>
      </div>

      {hasNotes && (
        <button
          className={`caption-btn ${showNotes ? 'on' : ''}`}
          aria-expanded={showNotes}
          title="Your notes for this scene (only you can see them)"
          onClick={() => setShowNotes((v) => !v)}
        >
          <ScrollIcon size={12} /> Notes
        </button>
      )}

      {isDM && nextBeat && (
        <button className="caption-btn" title={`Next planned beat: ${nextBeat.title}`} onClick={onOpenStory}>
          <ChevronRight size={12} /> Next: {nextBeat.title}
        </button>
      )}

      {showNotes && (
        <div className="scene-notes-pop" role="note">
          <div className="row spread">
            <strong className="small">Scene notes</strong>
            <button className="link-btn small" onClick={onEditScene}>Edit</button>
          </div>
          <p>{scene.notes}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- tool dock ---------------- */

function ToolDock({
  tools, tool, onTool, drawColor, onDrawColor, fogMode, onFogMode, scene, onFogToggle, onFogCoverAll, onClearDrawings,
}) {
  const active = tools.find((t) => t.key === tool);
  return (
    <div className="tool-dock">
      <div className="tool-dock-main" role="toolbar" aria-label="Map tools">
        {tools.map(({ key, name, hint, Icon, shortcut }) => (
          <button
            key={key}
            className={`tool-btn ${tool === key ? 'on' : ''}`}
            title={`${name} (${shortcut}) - ${hint}`}
            aria-label={name}
            aria-pressed={tool === key}
            onClick={() => onTool(key)}
          >
            <Icon size={19} />
            <span className="tool-btn-label">{name}</span>
          </button>
        ))}
      </div>

      {tool === 'draw' && (
        <div className="tool-options" role="group" aria-label="Drawing options">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot ${drawColor === c ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={`Draw in ${c}`}
              aria-pressed={drawColor === c}
              onClick={() => onDrawColor(c)}
            />
          ))}
          <button className="small-btn ghost-btn" onClick={() => onTool('erase')} title="Erase drawings">
            <EraserIcon size={13} /> Erase
          </button>
        </div>
      )}

      {tool === 'erase' && (
        <div className="tool-options">
          <button className="small-btn ghost-btn" onClick={() => onTool('draw')}>
            <PenIcon size={13} /> Back to drawing
          </button>
          <button className="small-btn danger-btn" onClick={onClearDrawings}>Clear all</button>
        </div>
      )}

      {tool === 'fog' && (
        <div className="tool-options" role="group" aria-label="Fog options">
          <button className={`small-btn ${fogMode === 'reveal' ? 'primary-btn' : 'ghost-btn'}`} aria-pressed={fogMode === 'reveal'} onClick={() => onFogMode('reveal')}>
            Reveal
          </button>
          <button className={`small-btn ${fogMode === 'hide' ? 'primary-btn' : 'ghost-btn'}`} aria-pressed={fogMode === 'hide'} onClick={() => onFogMode('hide')}>
            Re-hide
          </button>
          <button className="small-btn ghost-btn" onClick={onFogToggle} title="Turn fog of war on or off for this scene">
            Fog: {scene.fogEnabled ? 'on' : 'off'}
          </button>
          <button className="small-btn ghost-btn" onClick={onFogCoverAll}>Cover all</button>
        </div>
      )}

      {active && <p className="tool-hint">{active.hint}</p>}
    </div>
  );
}

/* ---------------- scene strip ---------------- */

function SceneStrip({ scenes, activeId, open, onToggle, onGo, onManage }) {
  return (
    <div className={`scene-strip ${open ? '' : 'closed'}`}>
      <button className="scene-strip-toggle" onClick={onToggle} aria-expanded={open} title={open ? 'Hide the scene bar' : 'Show the scene bar'}>
        <MapIcon size={13} />
        {open ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="scene-strip-list" role="tablist" aria-label="Scenes">
          {scenes.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === activeId}
              className={`scene-chip ${s.id === activeId ? 'on' : ''}`}
              title={s.id === activeId ? `${s.name} (live)` : `Take the table to ${s.name}`}
              onClick={() => s.id !== activeId && onGo(s.id)}
            >
              <SceneThumb scene={s} w={78} h={48} />
              <span>{s.name}</span>
            </button>
          ))}
          <button className="scene-chip add" onClick={onManage} title="Scenes and story prep">
            <span className="scene-chip-add-box">
              <PlusIcon size={16} />
            </span>
            <span>Prep</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- place an NPC or marker ---------------- */

function PlaceTokenModal({ kind, onClose, onPlace }) {
  const isNpc = kind === 'npc';
  const [label, setLabel] = useState(isNpc ? 'Villager' : 'Objective');
  const [art, setArt] = useState(isNpc ? 'humanoid' : 'marker');
  const [color, setColor] = useState(isNpc ? NPC_COLORS[0] : '#8a7448');
  const [hidden, setHidden] = useState(false);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isNpc ? 'Place an NPC' : 'Place a marker'}</h3>
          <button className="close-btn" aria-label="Cancel" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="place-preview">
            <Avatar art={art} name={label} color={color} size={64} shape={isNpc ? 'round' : 'square'} />
            <div>
              <label className="field-label" htmlFor="token-label">Name</label>
              <input id="token-label" value={label} maxLength={40} autoFocus onChange={(e) => setLabel(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          {isNpc && (
            <>
              <label className="field-label">Look</label>
              <div className="art-grid">
                {NPC_ART_KEYS.map((k) => (
                  <button key={k} className={`art-option ${art === k ? 'on' : ''}`} aria-pressed={art === k} aria-label={k} onClick={() => setArt(k)}>
                    <Avatar art={k} name={k} color={color} size={38} ring={false} />
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field-label">Colour</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {NPC_COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot ${color === c ? 'on' : ''}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <label className="row small mt">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden from players for now
          </label>
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button
            className="primary-btn"
            onClick={() => onPlace({ kind, label: label.trim() || (isNpc ? 'NPC' : 'Marker'), art, color, hidden })}
          >
            <PlusIcon size={13} /> Place
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ---------------- mobile "more" sheet ---------------- */

function MoreSheet({ isDM, isHost, hasSheet, onClose, onSheet, onMonsters, onPrep, onStory, onRules, onGuide, onSettings }) {
  const items = [
    hasSheet && { label: 'My character sheet', Icon: ScrollIcon, onClick: onSheet },
    isDM && { label: 'Monster library', Icon: SkullIcon, onClick: onMonsters },
    isDM && { label: 'Scenes', Icon: MapIcon, onClick: onPrep },
    isDM && { label: 'Story outline', Icon: ScrollIcon, onClick: onStory },
    { label: 'Rules reference', Icon: BookIcon, onClick: onRules },
    { label: "Player's guide", Icon: BookIcon, onClick: onGuide },
    (isDM || isHost) && { label: 'Campaign settings', Icon: GearIcon, onClick: onSettings },
  ].filter(Boolean);

  return (
    <div className="more-sheet" role="dialog" aria-label="More options">
      {items.map(({ label, Icon, onClick }) => (
        <button key={label} className="more-item" onClick={onClick}>
          <Icon size={17} /> {label}
        </button>
      ))}
      <button className="more-item ghost" onClick={onClose}>Close</button>
    </div>
  );
}

/* ---------------- character picker ---------------- */

function CharacterPicker({ onPick, onBuild, canClose, onClose }) {
  const [mine, setMine] = useState(null);
  useEffect(() => {
    charsApi.list().then((res) => setMine(Array.isArray(res) ? res : []));
  }, []);

  return (
    <ModalOverlay onClose={canClose ? onClose : () => {}} className="picker-overlay">
      <div className="modal" style={{ maxWidth: 800 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Choose your hero</h3>
          {canClose && (
            <button className="close-btn" aria-label="Close" onClick={onClose}>
              <XIcon size={16} />
            </button>
          )}
        </div>
        <div className="modal-body">
          {mine && mine.length > 0 && (
            <>
              <h4>Your characters</h4>
              <div className="pregen-grid mb">
                {mine.map((c) => (
                  <button key={c.id} className="pregen-card" onClick={() => onPick({ id: c.id, sheet: c.sheet })}>
                    <Avatar sheet={c.sheet} name={c.name} color={c.sheet.portrait?.color || 'var(--gold)'} size={54} />
                    <div className="pregen-info">
                      <div className="card-title">{c.name}</div>
                      <div className="card-sub">
                        Level {c.sheet.level} {c.sheet.raceName} {c.sheet.className}{c.sheet.subclassName ? ` (${c.sheet.subclassName})` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          <h4>Ready-made heroes {mine && mine.length ? '' : '(recommended - instant)'}</h4>
          <div className="pregen-grid">
            {PREGENS.map((p) => (
              <button key={p.id} className="pregen-card" onClick={() => onPick({ pregen: true, sheet: p.sheet })}>
                <Avatar sheet={p.sheet} name={p.sheet.name} color={p.sheet.portrait.color} size={54} />
                <div className="pregen-info">
                  <div className="card-title">{p.sheet.name}</div>
                  <div className="card-sub">
                    {p.sheet.raceName} {p.sheet.className}{p.sheet.subclassName ? ` (${p.sheet.subclassName})` : ''}
                  </div>
                  <p className="pregen-blurb">{p.tip}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onBuild}>Build a custom hero instead</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ---------------- settings ---------------- */

function SettingsModal({ state, user, isDM, dialog, onClose }) {
  const isHost = state.hostId === user.id;
  const [name, setName] = useState(state.name);
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Campaign settings</h3>
          <button className="close-btn" aria-label="Close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="modal-body">
          {isHost && (
            <>
              <label className="field-label" htmlFor="campaign-rename">Campaign name</label>
              <div className="row">
                <input id="campaign-rename" value={name} onChange={(e) => setName(e.target.value)} className="grow" maxLength={60} />
                <button className="small-btn" disabled={!name.trim() || name === state.name} onClick={() => socket.emit('renameCampaign', { name: name.trim() })}>
                  <CheckIcon size={12} /> Save
                </button>
              </div>
            </>
          )}
          {isDM && (
            <>
              <label className="row mt small">
                <input
                  type="checkbox"
                  checked={!!state.settings?.playersCanMoveAny}
                  onChange={(e) => socket.emit('updateSettings', { playersCanMoveAny: e.target.checked })}
                />
                Players can move any token
              </label>
              <div className="row mt wrap">
                <button
                  className="small-btn"
                  onClick={async () => {
                    const v = await dialog.prompt('Award how much XP to each character?', '50', 'Award XP');
                    const n = parseInt(v, 10);
                    if (n > 0) socket.emit('awardXp', { amount: n });
                  }}
                >
                  <SparkleIcon size={12} /> Award XP...
                </button>
                <button
                  className="small-btn"
                  onClick={() => socket.emit('announce', { text: 'The DM says: level up! Open your sheet and press the Level button.', type: 'reward' })}
                >
                  <TrophyIcon size={12} /> Announce level-up
                </button>
              </div>
            </>
          )}
          <h4 className="mt">Players</h4>
          <div className="col" style={{ gap: 6 }}>
            {state.members.map((m) => {
              const sheet = m.characterId ? state.charSheets[m.characterId] : null;
              return (
                <div key={m.userId} className="campaign-card">
                  <Avatar sheet={sheet} name={sheet?.name || m.username} color={m.color} size={34} />
                  <span className="grow">
                    {m.username}
                    {sheet && <span className="muted small"> · {sheet.name}</span>}
                    {state.dmId === m.userId && <span className="chip gold" style={{ marginLeft: 6 }}>DM</span>}
                    {state.hostId === m.userId && <span className="chip" style={{ marginLeft: 6 }}>host</span>}
                  </span>
                  {state.mode === 'dm' && state.dmId === user.id && m.userId !== user.id && (
                    <button className="small-btn" onClick={() => socket.emit('transferDM', { userId: m.userId })}>Make DM</button>
                  )}
                  {isHost && m.userId !== user.id && (
                    <button
                      className="small-btn danger-btn"
                      onClick={async () => {
                        const ok = await dialog.confirm(`Remove ${m.username} from the campaign?`, 'Remove player');
                        if (ok) socket.emit('kickPlayer', { userId: m.userId });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ---------------- helpers ---------------- */

/** Grow or trim a scene's cells to a new size, padding with its base material. */
function resizeCells(scene, w, h, floor) {
  const pad = blankCells(1, 1, floor)[0];
  const rows = scene.cells || [];
  return Array.from({ length: h }, (_, y) => String(rows[y] || '').padEnd(w, pad).slice(0, w));
}

function findFreeCell(scene) {
  const cx = Math.floor(scene.grid.w / 2);
  const cy = Math.floor(scene.grid.h / 2);
  const taken = new Set(scene.tokens.map((t) => `${t.x},${t.y}`));
  for (let r = 0; r < 15; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) continue;
        if (taken.has(`${x},${y}`)) continue;
        const ch = charAt(scene, x, y);
        if (ch === '#' || ch === '_' || ch === 'v' || ch === '%' || ch === 'w') continue;
        return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
}
