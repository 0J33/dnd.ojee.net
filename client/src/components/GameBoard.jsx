import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket';
import { getView } from '../sync';
import { characters as charsApi } from '../api';
import { useDialog, ModalOverlay, ContextMenu, useLocalStorage } from '../utils';
import { deriveSheet } from '../rules/engine';
import { PREGENS } from '../data/pregens';
import { withPlaceHidden, getPlaceHidden } from '../mapSelection';
import { PlaceHiddenPill } from './MapControls';
import { GiveItemModal, ShopModal } from './Items';
import { blankCells } from '../data/scenes';
import { charAt } from '../render/sceneRender';
import MapCanvas from './MapCanvas';
import './Map3D.css';
import '../styles/hud.css';
const Map3D = React.lazy(() => import('./Map3D'));
const webglOk = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
import { PartyPanel, InitiativeBar, ChatPanel, DiceTray, RollToasts } from './BoardPanels';
import { PartyStrip, HeroBar, OverflowMenu } from './TableHud';
import { OBJECT_KINDS, ObjectEditor, DmPanel, TableMessages } from './DmTools';
import SoundSettings from './SoundSettings';
import { useGameAudio } from '../audio/useGameAudio';
import { MonsterBrowser, StatBlock } from './MonsterBrowser';
import ReferencePanel from './ReferencePanel';
import AiLauncher from './ai/AiLauncher'; // the DM's AI assistant, review queue and MCP connection
import CharacterSheet from './CharacterSheet';
import CharacterBuilder from './CharacterBuilder';
import Guide from './Guide';
import TutorialOverlay from './TutorialOverlay';
import SceneEditor from './SceneEditor';
import ScenePrep, { SceneThumb } from './ScenePrep';
import { QuickDmPanel, CreaturesPanel, TokenQuickEdit, DmNote, viewCell } from './QuickDm';
import { useViewAs, setViewAs } from './Training';
import { useEditHistory } from '../editHistory';
import { restoreUi, useUiContext } from '../uiContext';
import { useAutoSave, SaveStatus } from '../autosave';
import { roomAround } from '../data/mapKit';
import { TILES } from '../data/tiles';
import { Avatar, NPC_ART_KEYS } from './Portrait';
import {
  DragonLogo, BookIcon, MapIcon, GearIcon, RulerIcon, PenIcon, FogIcon, TargetIcon, ScrollIcon,
  EyeIcon, SwordIcon, SkullIcon, LightningIcon, BurstIcon, XIcon, PersonIcon, FlagIcon, CopyIcon,
  SparkleIcon, TrophyIcon, ChevronLeft, ChevronRight, ExpandIcon, BrushIcon, EraserIcon, PlusIcon,
  MenuIcon, UsersIcon, ChatIcon, D20Icon, PencilIcon, LockIcon, CrownIcon, VolumeIcon,
  UndoIcon, RedoIcon, WandIcon, HeartIcon, CoinsIcon, HandIcon, BackpackIcon,
} from './Icons';
import { matches, firstKey, isTyping, useKeybinds, useKeybindUser } from '../keybinds';

const TOOL_OPTS = new Set(['draw', 'erase', 'fog', 'secrets']); // tools with a flyout beside the rail
const DRAW_COLORS = ['#e8c476', '#e07040', '#7fb069', '#5f87a8', '#c94f6d', '#ffffff'];
const NPC_COLORS = ['#5f87a8', '#7fb069', '#b06ab0', '#c2542e', '#5fb0a5', '#d4a94f'];
const MOBILE_MAX = 820;

/** Tools available in the left dock. `dm` tools only appear for the DM. */
const TOOLS = [
  // keys come from keybinds.js ('tool.<key>'); `shortcut` is only the default
  { key: 'select', name: 'Pointer', hint: 'Click to select or use, double-click for a sheet, right-click for a menu. Left-drag pans (or moves a creature), right-drag turns, middle-drag box-selects, Ctrl+click adds to the selection.', Icon: HandIcon, shortcut: 'V' },
  { key: 'measure', name: 'Measure', hint: 'Drag to measure - one square is 5 ft.', Icon: RulerIcon, shortcut: 'M' },
  { key: 'draw', name: 'Draw', hint: 'Sketch on the map for everyone.', Icon: PenIcon, shortcut: 'P' }, // not D: WASD moves the 3D camera
  { key: 'fog', name: 'Fog', hint: 'Reveal or re-hide parts of the map.', Icon: FogIcon, shortcut: 'F', dm: true },
  { key: 'secrets', name: 'Secrets', hint: 'Traps, hidden passages, chests, levers, notes, exits and events. Click to place, click one to edit.', Icon: LockIcon, shortcut: 'T', dm: true },
  { key: 'build', name: 'Build', hint: 'Paint walls, floors, doors and furniture straight onto the map.', Icon: BrushIcon, shortcut: 'B', dm: true },
];

// Derived numbers per sheet object: a patch that leaves a sheet alone keeps
// the same object, so it isn't worked out again.
const derivedCache = new WeakMap();
const withDerived = (sheet) => {
  let out = derivedCache.get(sheet);
  if (!out) { out = { ...sheet, derived: deriveSheet(sheet) }; derivedCache.set(sheet, out); }
  return out;
};

export default function GameBoard({ user, code, state, chat, log, connected, onLeave, onSendChat }) {
  const dialog = useDialog();
  const isDM = !!state.viewerIsDM;
  const previewing = useViewAs(); // the DM looking as a player (Training.jsx)
  const me = state.members.find((m) => m.userId === user.id);
  const myCharacterId = me?.characterId || null;
  const activeScene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];

  // Which panels were open before an update's reload (uiContext.js).
  const [was] = useState(() => restoreUi('board') || {});
  const [tool, setTool] = useState(was.tool || 'select');
  const [view3d, setView3d] = useLocalStorage('dnd.view3d', typeof window !== 'undefined' && window.innerWidth > MOBILE_MAX && webglOk);
  const [fogMode, setFogMode] = useState('reveal');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [build, setBuild] = useLocalStorage('dnd_build', { ch: '#', shape: 'brush', size: 1 });
  const [toasts, setToasts] = useState([]);
  const [pings, setPings] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX);
  const [mobilePane, setMobilePane] = useState(was.mobilePane || 'map'); // map | party | chat | more
  const [chatOpen, setChatOpen] = useLocalStorage('dnd_chatOpen', false);
  const [scenesOpen, setScenesOpen] = useState(!!was.scenesOpen); // the scene list, dropped from its pill
  const [creaturesOpen, setCreaturesOpen] = useState(!!was.creaturesOpen);
  const [quick, setQuick] = useState(was.quick || null); // the quick DM panel: { tab, at }
  const [quickEdit, setQuickEdit] = useState(null); // one creature's HP / conditions: { tokenId, x, y }
  const [flash, setFlash] = useState(null); // a short note ("Undone: painting")
  const [dmTools, setDmTools] = useState(!!was.dmTools); // guided games: DM tools on request
  const [objKind, setObjKind] = useState('trap');
  const [selectedObjectId, setSelectedObjectId] = useState(was.selectedObjectId || null);
  const [pickingDoors, setPickingDoors] = useState(false);
  const [patrolDraft, setPatrolDraft] = useState(null); // { tokenId, label, pts }
  const [showDmPanel, setShowDmPanel] = useState(!!was.showDmPanel);
  const [showSound, setShowSound] = useState(!!was.showSound);
  const [sheetChar, setSheetChar] = useState(was.sheetChar || null);
  const [showMonsters, setShowMonsters] = useState(!!was.showMonsters);
  const [showReference, setShowReference] = useState(!!was.showReference);
  const [showPrep, setShowPrep] = useState(!!was.showPrep);
  const [prepTab, setPrepTab] = useState(was.prepTab || 'scenes');
  const [showSettings, setShowSettings] = useState(!!was.showSettings);
  const [showGuide, setShowGuide] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [statblockToken, setStatblockToken] = useState(null);
  const [giveTo, setGiveTo] = useState(null);   // the DM giving a hero an item: { characterId, name }
  const [shopId, setShopId] = useState(null);   // a merchant's shop window (token id)
  const [ctx, setCtx] = useState(null); // {x, y, items}
  // Moves, paint, doors and the rest show at once through sync.js; only
  // drawings (sent as events, not state) keep an overlay here.
  const [strokeOverlay, setStrokeOverlay] = useState({});
  const [strokeGone, setStrokeGone] = useState({}); // sceneId -> ids erased / cleared, until the room state agrees
  const [placeToken, setPlaceToken] = useState(null); // { kind } while placing from a menu
  useUiContext('board', () => ({
    code, tool, mobilePane, scenesOpen, creaturesOpen, quick, dmTools, selectedObjectId, showDmPanel, showSound,
    sheetChar, showMonsters, showReference, showPrep, prepTab, showSettings,
  }));
  const pendingSpawn = useRef(null);
  const diceModeRef = useRef('normal');
  const mapAreaRef = useRef(null);
  const topLeftRef = useRef(null);

  // The DM's flyouts open just below the party / pills row, however tall it is.
  useLayoutEffect(() => {
    const el = topLeftRef.current, area = mapAreaRef.current;
    if (!el || !area) return undefined;
    const ro = new ResizeObserver(() => {
      area.style.setProperty('--hud-tl-h', `${el.offsetHeight}px`);
      area.style.setProperty('--hud-tl-w', `${el.offsetLeft + el.offsetWidth}px`); // the initiative bar keeps clear of it
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

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

  // ---------- keyboard shortcuts (keybinds.js: rebindable, per user) ----------
  useKeybindUser(user.id);
  useKeybinds();
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping() || e.repeat) return;
      const hit = TOOLS.find((t) => matches(e, `tool.${t.key}`) && (!t.dm || isDM));
      if (hit) {
        e.preventDefault();
        setTool(hit.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDM]);

  // The table panel, the sound board and a secret's editor share the right edge: one at a time.
  useEffect(() => { if (selectedObjectId) { setShowDmPanel(false); setShowSound(false); } }, [selectedObjectId]);
  useEffect(() => { if (showDmPanel) setShowSound(false); }, [showDmPanel]);
  useEffect(() => { if (showSound) { setShowDmPanel(false); setSelectedObjectId(null); } }, [showSound]);

  // Scenes, Creatures, Quick and a tool's options share the space beside the
  // rail: one at a time, so nothing overlaps and nothing gets shoved aside.
  const quickOn = !!quick;
  useEffect(() => { if (quickOn) { setScenesOpen(false); setCreaturesOpen(false); } }, [quickOn]);
  useEffect(() => { if (TOOL_OPTS.has(tool)) { setScenesOpen(false); setCreaturesOpen(false); setQuick(null); } }, [tool]);

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
    // The server said no to something we did (moved too far, out of turn).
    const onRejected = ({ error }) => error && setFlash({ text: error, id: Math.random() });
    const onStroke = ({ sceneId, stroke }) => {
      setStrokeOverlay((prev) => ({ ...prev, [sceneId]: [...(prev[sceneId] || []), stroke] }));
    };
    const forget = (sceneId, ids) => setStrokeGone((prev) => ({ ...prev, [sceneId]: new Set([...(prev[sceneId] || []), ...ids]) }));
    const onErased = ({ sceneId, ids }) => {
      setStrokeOverlay((prev) => ({ ...prev, [sceneId]: (prev[sceneId] || []).filter((s) => !ids.includes(s.id)) }));
      forget(sceneId, ids);
    };
    const onCleared = ({ sceneId, ids }) => {
      setStrokeOverlay((prev) => ({ ...prev, [sceneId]: (prev[sceneId] || []).filter((s) => ids && !ids.includes(s.id)) }));
      if (ids) forget(sceneId, ids);
      else setStrokeGone((prev) => ({ ...prev, [sceneId]: 'all' }));
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
    socket.on('actionRejected', onRejected);
    socket.on('strokeAdded', onStroke);
    socket.on('strokesErased', onErased);
    socket.on('drawingsCleared', onCleared);
    socket.on('combatEvent', onCombatEvent);
    return () => {
      socket.off('rollResult', onRoll);
      socket.off('ping', onPingEv);
      socket.off('actionRejected', onRejected);
      socket.off('strokeAdded', onStroke);
      socket.off('strokesErased', onErased);
      socket.off('drawingsCleared', onCleared);
      socket.off('combatEvent', onCombatEvent);
    };
  }, []);

  // clear stale drawing overlays once the authoritative state catches up
  useEffect(() => {
    // (the same object back when there's nothing to clear: no extra render per patch)
    setStrokeGone((prev) => (Object.keys(prev).length ? {} : prev)); // the room state is the truth again
    setStrokeOverlay((prev) => {
      if (!Object.keys(prev).length) return prev;
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
  }, [state.scenes]);

  // merge drawings not yet in the room state into the scene we render
  const renderScene = useMemo(() => {
    if (!activeScene) return null;
    const pendingStrokes = strokeOverlay[activeScene.id];
    const gone = strokeGone[activeScene.id];
    if (!pendingStrokes?.length && !gone) return activeScene; // same object: nothing below redraws for nothing
    const seenIds = new Set();
    const strokes = [...(activeScene.strokes || []), ...(strokeOverlay[activeScene.id] || [])].filter((st) => {
      if (seenIds.has(st.id) || gone === 'all' || (gone && gone.has(st.id))) return false;
      seenIds.add(st.id);
      return true;
    });
    return { ...activeScene, strokes };
  }, [activeScene, strokeOverlay, strokeGone]);

  const charSheets = useMemo(() => {
    const out = {};
    for (const [id, sheet] of Object.entries(state.charSheets || {})) out[id] = withDerived(sheet);
    return out;
  }, [state.charSheets]);

  const mySheet = myCharacterId ? charSheets[myCharacterId] : null;

  // Tell the server my hero's AC / initiative / saves (it has no rules
  // engine), so attacks against me and auto-rolled initiative are right.
  const myDerivedKey = mySheet ? JSON.stringify([mySheet.derived?.ac, mySheet.derived?.initiative, mySheet.derived?.saves, mySheet.derived?.passivePerception]) : '';
  useEffect(() => {
    if (!mySheet?.derived) return;
    const d = mySheet.derived;
    socket.emit('sheetDerived', { characterId: myCharacterId, ac: d.ac, initiative: d.initiative, saves: d.saves, perception: d.skills?.perception?.bonus, passivePerception: d.passivePerception });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDerivedKey, myCharacterId]);
  // A DM with no hero has no token: without the guard, undefined === undefined
  // matched the first monster and offered the DM its initiative roll.
  const myToken = renderScene && myCharacterId ? renderScene.tokens.find((t) => t.characterId === myCharacterId) : null;
  const turnTokenId = state.combat?.active && state.combat.round > 0 ? state.combat.order[state.combat.turnIndex]?.tokenId : null;
  const turnToken = turnTokenId ? (renderScene?.tokens || []).find((t) => t.id === turnTokenId) : null;
  const myTurn = !!(turnToken && myToken && turnToken.id === myToken.id);
  const monsterActing = !!(turnToken && turnToken.kind === 'monster' && !turnToken.dead && (state.mode === 'guided' || state.autoMonsters));
  const creatureCount = (renderScene?.tokens || []).filter((t) => t.kind === 'monster' && !t.dead).length;

  // Music, ambience and the sounds of the game.
  useGameAudio({ state, scene: renderScene, log, charSheets });

  // Enter ends your turn (when it is yours), like the mtg table.
  useEffect(() => {
    if (!myTurn) return undefined;
    const onKey = (e) => {
      if (!matches(e, 'turn.end') || e.repeat || isTyping() || document.activeElement?.tagName === 'BUTTON') return;
      socket.emit('nextTurn');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn]);

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
  const announce = useCallback((text) => onSendChat(text), [onSendChat]);

  // Paint onto a scene: shown at once (sync.js predicts it), sent as one delta.
  // On the level picked in the builder (build.level), if the scene has it;
  // a stamp replaces what is there (data/layers.js). opts: { level, replace }.
  const paintOn = useCallback((sceneId, cells, opts = {}) => {
    socket.emit('paintScene', { sceneId, cells, ...(opts.level ? { level: opts.level } : {}), ...(opts.replace ? { replace: true } : {}) });
  }, []);
  const paintCells = useCallback((cells, opts = {}) => {
    if (!activeScene) return;
    const level = 'level' in opts ? opts.level : (activeScene.levels || []).some((l) => l.id === build?.level) ? build.level : null;
    paintOn(activeScene.id, cells, { level, replace: opts.replace ?? build?.shape === 'stamp' });
  }, [activeScene, paintOn, build]);

  const say = useCallback((text) => {
    setFlash({ text: text.charAt(0).toUpperCase() + text.slice(1), id: Math.random() });
  }, []);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 2800);
    return () => clearTimeout(t);
  }, [flash]);

  // Undo / redo for every edit the DM makes to a scene (editHistory.js). It
  // reads the scene straight from sync.js, which already includes every edit
  // sent a moment ago (even before a render), so quick repeated Ctrl+Z steps
  // back exactly one edit at a time.
  const live = useRef({});
  live.current = { state };
  const liveState = () => getView() || live.current.state;
  const history = useEditHistory({
    enabled: isDM,
    getScene: (id) => liveState().scenes.find((sc) => sc.id === id),
    getActiveSceneId: () => liveState().activeSceneId || liveState().scenes[0]?.id,
    findTokenScene: (tokenId) => {
      for (const sc of liveState().scenes) {
        const token = sc.tokens.find((t) => t.id === tokenId);
        if (token) return { scene: sc, token };
      }
      return null;
    },
    paint: paintOn,
  });
  const { undo: histUndo, redo: histRedo } = history;
  const doUndo = useCallback(() => { const l = histUndo(); say(l ? `Undone: ${l}` : 'Nothing to undo here'); }, [histUndo, say]);
  const doRedo = useCallback(() => { const l = histRedo(); say(l ? `Redone: ${l}` : 'Nothing to redo'); }, [histRedo, say]);
  useEffect(() => {
    if (!isDM) return undefined;
    const onKey = (e) => {
      if (isTyping()) return;
      if (matches(e, 'edit.undo')) { e.preventDefault(); doUndo(); }
      else if (matches(e, 'edit.redo')) { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDM, doUndo, doRedo]);

  // Fog by the room: a click reveals (or hides) the whole room or open area.
  const revealCells = useCallback((cells, mode) => {
    if (!activeScene) return;
    if (mode === 'room' || mode === 'roomHide') {
      const seeds = cells.map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
      const isWall = (ch) => TILES[ch]?.cat === 'wall';
      const isDoor = (ch) => TILES[ch]?.group === 'Doors' && ch !== '/';
      cells = roomAround(renderScene || activeScene, seeds, isWall, isDoor);
      mode = mode === 'room' ? 'reveal' : 'hide';
    }
    socket.emit('revealFog', { sceneId: activeScene.id, cells, mode });
  }, [activeScene, renderScene]);

  // Another one like this, next to it (a fresh copy: full HP, no conditions).
  const duplicateToken = useCallback((t) => {
    const { id, x, y, dead, conditions, patrol, patrolIndex, ...rest } = t;
    const base = (t.label || '').replace(/\s+\d+$/, '');
    const n = (renderScene?.tokens || []).filter((o) => (o.label || '').replace(/\s+\d+$/, '') === base).length + 1;
    socket.emit('addTokens', { sceneId: activeScene.id, tokens: [{ ...rest, label: `${base} ${n}`.slice(0, 40), hp: t.maxHp ?? t.hp, conditions: [] }], at: { x, y } });
  }, [renderScene, activeScene]);

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
  // `extra`: items the map adds first (attack, help, select, doors).
  const tokenContext = (token, x, y, extra = []) => {
    const items = [...extra];
    const isMine = token.ownerId === user.id;
    if (token.kind === 'pc' && token.characterId) {
      items.push({ label: 'Open sheet', icon: <ScrollIcon size={15} />, onClick: () => setSheetChar(token.characterId) });
      if (isDM) items.push({ label: 'Give an item...', icon: <BackpackIcon size={15} />, onClick: () => setGiveTo({ characterId: token.characterId, name: charSheets[token.characterId]?.name || token.label }) });
    }
    // a merchant: anyone can browse; the DM stocks it
    if (token.kind !== 'pc' && token.shop && !token.dead && (isDM || token.shop.open !== false)) {
      items.push({ label: isDM ? `${token.label}'s shop...` : `Shop with ${token.label}...`, icon: <CoinsIcon size={15} />, onClick: () => setShopId(token.id) });
    } else if (isDM && token.kind === 'npc' && !token.shop) {
      items.push({ label: 'Make them a merchant...', icon: <CoinsIcon size={15} />, onClick: () => { socket.emit('updateToken', { tokenId: token.id, patch: { shop: { open: true, items: [] } } }); setShopId(token.id); } });
    }
    if (isDM && token.kind !== 'pc') {
      items.push({ label: 'HP, conditions, hide...', icon: <HeartIcon size={15} />, onClick: () => setQuickEdit({ tokenId: token.id, x, y }) });
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
    if (isDM && state.combat.active && token.kind === 'npc' && !token.dead && !state.combat.order.some((o) => o.tokenId === token.id)) {
      // friendly folk sit fights out unless the DM brings them in
      items.push({ label: 'Add to the fight (roll initiative)', icon: <LightningIcon size={15} />, onClick: () => socket.emit('addToInitiative', { tokenId: token.id }, (r) => r?.error && say(r.error)) });
    }
    if (isDM) {
      if (token.kind !== 'pc') {
        items.push({
          label: `Speak as ${token.label}...`,
          icon: <ChatIcon size={15} />,
          onClick: async () => {
            const v = await dialog.prompt(`What does ${token.label} say?`, '');
            if (v) socket.emit('npcSay', { tokenId: token.id, text: v });
          },
        });
        items.push({ label: token.patrol?.length ? 'Change patrol route' : 'Give it a patrol route', icon: <FlagIcon size={15} />, onClick: () => setPatrolDraft({ tokenId: token.id, label: token.label, pts: [{ x: token.x, y: token.y }] }) });
        if (token.patrol?.length) items.push({ label: 'Stop patrolling', icon: <XIcon size={15} />, onClick: () => socket.emit('setPatrol', { tokenId: token.id, route: [] }) });
      }
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
      if (token.kind !== 'pc') items.push({ label: 'Another like this', icon: <CopyIcon size={15} />, onClick: () => duplicateToken(token) });
      items.push({ label: 'Remove', icon: <XIcon size={15} />, danger: true, onClick: () => socket.emit('removeToken', { tokenId: token.id }) });
    }
    if (items.length) setCtx({ x, y, items });
  };

  const cellContext = (cell, x, y, extra = []) => {
    const items = [...extra];
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
      items.push({ label: 'A fight...', icon: <SwordIcon size={15} />, onClick: () => setQuick({ tab: 'fight', at: cell }) });
      items.push({ label: 'Someone (one click)...', icon: <UsersIcon size={15} />, onClick: () => setQuick({ tab: 'people', at: cell }) });
      items.push({ label: 'Loot, a trap, a secret...', icon: <CoinsIcon size={15} />, onClick: () => setQuick({ tab: 'things', at: cell }) });
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
  // In a guided game everyone counts as DM, but the app is running the table:
  // keep the DM's tools (and buttons) out of the way, one menu away.
  const guided = state.mode === 'guided';
  const showDm = isDM && (!guided || dmTools);
  const visibleTools = TOOLS.filter((t) => !t.dm || showDm);
  // A tool's options hide while Scenes / Creatures / Quick has the space.
  const leftPanelOpen = showDm && !isMobile && (scenesOpen || creaturesOpen || !!quick);
  // Pressing the tool you're on: bring its options back if a panel hid them,
  // otherwise put it down and go back to Select.
  const pickTool = (key) => {
    const on = tool === key || (key === 'draw' && tool === 'erase');
    if (!on) return setTool(key);
    if (TOOL_OPTS.has(tool) && leftPanelOpen) { setScenesOpen(false); setCreaturesOpen(false); setQuick(null); return undefined; }
    if (key !== 'select') setTool('select');
    return undefined;
  };
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
          {showDm && !state.combat.active && (
            <button className="small-btn primary-btn" onClick={() => socket.emit('startCombat')} title="Start combat - everyone rolls initiative">
              <SwordIcon size={13} /> <span className="hide-sm">Combat</span>
            </button>
          )}
          {showDm && (
            <button className={`small-btn ${showDmPanel ? 'primary-btn' : ''}`} onClick={() => { setShowDmPanel((v) => !v); setSelectedObjectId(null); }} title="Talk to the table (narrate, whisper, handouts, ask for rolls) and set the mood">
              <CrownIcon size={13} /> <span className="hide-sm">Table</span>
            </button>
          )}
          {showDm && (
            <button className="small-btn" onClick={() => setShowMonsters(true)} title="Monster library">
              <SkullIcon size={13} /> <span className="hide-sm">Monsters</span>
            </button>
          )}
          {showDm && (
            <button className="small-btn" onClick={() => openPrep('scenes')} title="Scenes and story prep">
              <MapIcon size={13} /> <span className="hide-sm">Prep</span>
            </button>
          )}
          {isDM && !guided && !previewing && state.dmId === user.id && <AiLauncher code={code} state={state} user={user} />}
          {((isDM && !guided) || previewing) && (
            <button
              className={`small-btn trn-viewas ${previewing ? 'primary-btn' : ''}`}
              aria-pressed={previewing}
              onClick={() => setViewAs(!previewing, { training: !!state.training })}
              title={previewing ? 'Back to the DM view' : 'See the table as your players do: fog, no hidden creatures, no notes'}
            >
              <EyeIcon size={13} /> <span className="hide-sm">{previewing ? 'DM view' : 'Player view'}</span>
            </button>
          )}
          {!isMobile && <OverflowMenu
            items={[
              { label: 'Rules quick reference', icon: <BookIcon size={14} />, onClick: () => setShowReference(true) },
              { label: "Player's guide", icon: <BookIcon size={14} />, onClick: () => setShowGuide(true) },
              { label: isDM && !guided ? 'DM handbook & practice round' : 'DM handbook', icon: <BookIcon size={14} />, onClick: () => window.dispatchEvent(new Event('dnd:handbook')) }, // Training.jsx
              webglOk && !isMobile && { label: view3d ? 'Switch to the flat 2D map' : 'Switch to the 3D world', icon: <MapIcon size={14} />, onClick: () => setView3d(!view3d) },
              { label: 'Sound', icon: <VolumeIcon size={14} />, hint: 'music, effects', onClick: () => setShowSound(true) },
              { label: 'Controls & keys', icon: <HandIcon size={14} />, hint: 'rebind keys', onClick: () => window.dispatchEvent(new Event('dnd:keybinds')) }, // MapControls.jsx
              { label: 'Copy invite link', icon: <CopyIcon size={14} />, hint: code, onClick: copyInvite },
              (isDM || state.hostId === user.id) && { label: 'Campaign settings', icon: <GearIcon size={14} />, onClick: () => setShowSettings(true) },
              guided && isDM && { label: dmTools ? 'Hide the DM tools' : 'Show the DM tools', icon: <SkullIcon size={14} />, hint: 'monsters, maps, fog', onClick: () => setDmTools((v) => !v) },
            ]}
          />}
          <span className={`conn-dot ${connected ? 'on' : ''}`} title={connected ? 'Connected' : 'Reconnecting...'} />
        </div>
      </header>

      {/* ---------- main area ---------- */}
      <div className="board-main">
        {isMobile && <PartyPanel
          state={{ ...state, charSheets }}
          isDM={showDm}
          userId={user.id}
          onOpenSheet={setSheetChar}
          onMonsterHp={(t, hp) => socket.emit('updateToken', { tokenId: t.id, patch: { hp } })}
          onMonsterAct={(t) => socket.emit('autoMonsterTurn', { tokenId: t.id })}
          onTokenSelect={(t) => setStatblockToken(t)}
          onAddMonster={isDM ? () => setShowMonsters(true) : null}
        />}

        <div ref={mapAreaRef} className="map-area">
          {(!isMobile || mobilePane === 'map') && (
            <div className="hud-topleft" ref={topLeftRef}>
              <PartyStrip state={state} charSheets={charSheets} userId={user.id} onOpenSheet={setSheetChar} tokens={activeScene?.tokens || []} turnTokenId={turnTokenId} />
              {showDm && (
                <div className="hud-dm-pills" role="group" aria-label="DM">
                  <button className={`hud-pill ${scenesOpen ? 'on' : ''}`} aria-expanded={scenesOpen} onClick={() => { setScenesOpen((o) => !o); setQuick(null); setCreaturesOpen(false); }} title="Scenes: take the table somewhere else">
                    <MapIcon size={13} /> <span>Scenes</span>
                  </button>
                  {!isMobile && (
                    <button className={`hud-pill ${creaturesOpen ? 'on' : ''}`} aria-expanded={creaturesOpen} onClick={() => { setCreaturesOpen((o) => !o); setQuick(null); setScenesOpen(false); }} title="Creatures on this scene: HP, conditions, hide, run a turn">
                      <SkullIcon size={13} /> <span>Creatures</span> <b className="hud-pill-count">{creatureCount || ''}</b>
                    </button>
                  )}
                  <button className={`hud-pill ${quick ? 'on' : ''}`} aria-expanded={!!quick} onClick={() => { setQuick((q) => (q ? null : { tab: 'fight' })); setScenesOpen(false); }} title="Quick: drop a fight, a person, loot or a trap; new scenes from templates; reset or clear the scene">
                    <WandIcon size={13} /> <span>Quick</span>
                  </button>
                  <PlaceHiddenPill />
                </div>
              )}
            </div>
          )}
          {showDm && scenesOpen && (!isMobile || mobilePane === 'map') && (
            <SceneStrip
              scenes={state.scenes}
              activeId={state.activeSceneId}
              onClose={() => setScenesOpen(false)}
              onGo={(id) => { socket.emit('switchScene', { sceneId: id }); setScenesOpen(false); }}
              onManage={() => { setScenesOpen(false); openPrep('scenes'); }}
              onTemplate={() => { setScenesOpen(false); setQuick({ tab: 'scene' }); }}
            />
          )}
          {showDm && creaturesOpen && !isMobile && (
            <CreaturesPanel
              scene={renderScene}
              say={say}
              onClose={() => setCreaturesOpen(false)}
              onStatBlock={setStatblockToken}
              onQuickEdit={(t, r) => setQuickEdit({ tokenId: t.id, x: r.right + 8, y: r.top })}
              onAddFight={() => { setQuick({ tab: 'fight' }); setScenesOpen(false); }}
              onAddMonster={() => setShowMonsters(true)}
            />
          )}
          {showDm && quick && (!isMobile || mobilePane === 'map') && (
            <QuickDmPanel
              state={state}
              scene={renderScene}
              charSheets={charSheets}
              tab={quick.tab}
              at={quick.at || null}
              dialog={dialog}
              say={say}
              onTab={(tab) => setQuick((q) => ({ ...q, tab }))}
              onClose={() => setQuick(null)}
              onSelectObject={(id) => { setTool('secrets'); setSelectedObjectId(id); setQuick(null); }}
              onPickStamp={(st) => { setBuild({ ...build, shape: 'stamp', stamp: st }); setTool('build'); say(`${st.name}: click the map to place it.`); }}
              onCustomPlace={(kind) => { if (quick.at) pendingSpawn.current = quick.at; setPlaceToken({ kind }); setQuick(null); }}
            />
          )}
          {flash && <div key={flash.id} className="dm-flash" role="status">{flash.text}</div>}

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
            onAutoMonsters={(on) => socket.emit('setAutoMonsters', { on })}
          />

          <ToolDock
            history={showDm ? { ...history, onUndo: doUndo, onRedo: doRedo } : null}
            objKind={objKind}
            onObjKind={setObjKind}
            canClearAll={isDM}
            tools={visibleTools}
            tool={tool}
            onTool={pickTool}
            onSetTool={setTool}
            optionsHidden={leftPanelOpen}
            drawColor={drawColor}
            onDrawColor={setDrawColor}
            fogMode={fogMode}
            onFogMode={setFogMode}
            scene={activeScene}
            onFogToggle={() => socket.emit('updateScene', { sceneId: activeScene.id, patch: { fogEnabled: !activeScene.fogEnabled } })}
            onFogCoverAll={() => socket.emit('resetFog', { sceneId: activeScene.id, covered: true })}
            onFogRevealAll={() => socket.emit('resetFog', { sceneId: activeScene.id, covered: false })}
            onClearDrawings={() => socket.emit('clearDrawings', { sceneId: activeScene.id })}
          />

          {view3d && webglOk ? (
            <React.Suspense fallback={<div className="w3-loading">Building the world…</div>}>
              <Map3D
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
                onMoveToken={(tokenId, x, y, cost) => socket.emit('moveToken', { tokenId, x, y, cost })}
                onTokenContext={tokenContext}
                onCellContext={cellContext}
                onTokenClick={(t) => {
                  if (t.kind === 'pc' && t.characterId) setSheetChar(t.characterId);
                  else if (t.shop && !t.dead && (isDM || t.shop.open !== false)) setShopId(t.id); // a merchant: double-click to shop
                  else if (t.kind === 'monster' && (isDM || !t.hidden) && t.monsterIndex) setStatblockToken(t);
                }}
                onRevealCells={revealCells}
                onPing={(x, y) => socket.emit('ping', { x, y })}
                onDrawStroke={(stroke) => socket.emit('drawStroke', { sceneId: activeScene.id, stroke })}
                onEraseStrokes={(ids) => socket.emit('eraseStrokes', { sceneId: activeScene.id, ids })}
                onPaint={paintCells}
                bottomInset={isMobile && tool === 'build' ? Math.round(window.innerHeight * 0.46) : 0}
                myTokenId={myToken?.id || null}
                members={state.members}
                objKind={objKind}
                onBuildChange={setBuild}
                selectedObjectId={selectedObjectId}
                onSelectObject={setSelectedObjectId}
                pickingDoors={pickingDoors}
                onPickDoor={(c) => {
                  const o = (activeScene.objects || []).find((x) => x.id === selectedObjectId);
                  if (!o) return;
                  const has = (o.targets || []).some((t) => t.x === c.x && t.y === c.y);
                  const targets = has ? o.targets.filter((t) => t.x !== c.x || t.y !== c.y) : [...(o.targets || []), { x: c.x, y: c.y }];
                  socket.emit('updateObject', { sceneId: activeScene.id, id: o.id, patch: { targets } });
                }}
                patrolDraft={patrolDraft}
                onPatrolPoint={(c) => setPatrolDraft((d) => d && { ...d, pts: [...d.pts, { x: c.x, y: c.y }] })}
                onTool={setTool}
              />
            </React.Suspense>
          ) : (
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
              onMoveToken={(tokenId, x, y, cost) => socket.emit('moveToken', { tokenId, x, y, cost })}
              onTokenContext={tokenContext}
              onCellContext={cellContext}
              onTokenClick={(t) => {
                if (t.kind === 'pc' && t.characterId) setSheetChar(t.characterId);
                else if (t.shop && !t.dead && (isDM || t.shop.open !== false)) setShopId(t.id); // a merchant: double-click to shop
                else if (t.kind === 'monster' && (isDM || !t.hidden) && t.monsterIndex) setStatblockToken(t);
              }}
              onRevealCells={revealCells}
              onPing={(x, y) => socket.emit('ping', { x, y })}
              onDrawStroke={(stroke) => socket.emit('drawStroke', { sceneId: activeScene.id, stroke })}
              onEraseStrokes={(ids) => socket.emit('eraseStrokes', { sceneId: activeScene.id, ids })}
              onPaint={paintCells}
              onBuildChange={setBuild}
              bottomInset={isMobile && tool === 'build' ? Math.round(window.innerHeight * 0.46) : 0}
            />
          )}

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
          {showSound && <SoundSettings onClose={() => setShowSound(false)} />}
          <TableMessages mySheet={mySheet} onRoll={(formula, label) => doRoll({ formula, label })} />
          {showDm && showDmPanel && (
            <DmPanel
              state={{ ...state, charSheets }}
              scene={activeScene}
              onClose={() => setShowDmPanel(false)}
              onLookHere={() => { const g = window.__world?.rig?.goal; if (g) socket.emit('dmLookHere', { x: g.tx - 0.5, y: g.tz - 0.5, dist: g.dist }); }}
            />
          )}
          {showDm && tool === 'secrets' && selectedObjectId && (activeScene.objects || []).some((o) => o.id === selectedObjectId) && (
            <ObjectEditor
              key={selectedObjectId}
              object={(activeScene.objects || []).find((o) => o.id === selectedObjectId)}
              scenes={state.scenes}
              sceneId={activeScene.id}
              pickingDoors={pickingDoors}
              onPickDoors={() => setPickingDoors((v) => !v)}
              onClose={() => { setSelectedObjectId(null); setPickingDoors(false); }}
            />
          )}
          {patrolDraft && (
            <div className="dm-patrol-bar panel">
              <span>Patrol for <b>{patrolDraft.label}</b>: click squares in order ({patrolDraft.pts.length - 1} so far). It walks the loop until it spots a hero.</span>
              <button className="primary-btn small-btn" disabled={patrolDraft.pts.length < 2} onClick={() => { socket.emit('setPatrol', { tokenId: patrolDraft.tokenId, route: patrolDraft.pts.slice(1) }); setPatrolDraft(null); }}>Done</button>
              <button className="small-btn ghost-btn" onClick={() => setPatrolDraft(null)}>Cancel</button>
            </div>
          )}
          {showDm && tool === 'secrets' && !(view3d && webglOk) && <div className="dm-note panel">Secrets are placed in the 3D world: switch to 3D (⋯ menu) to add or edit them.</div>}
          {!isMobile && (
            <HeroBar
              sheet={mySheet}
              color={me?.color}
              combat={state.combat}
              myTurn={!!myTurn}
              monsterActing={monsterActing}
              isGuided={state.mode === 'guided'}
              onSheet={() => setSheetChar(myCharacterId)}
              onEndTurn={() => socket.emit('nextTurn')}
              onSearch={() => socket.emit('searchArea', {}, (r) => r?.error && dialog.alert(r.error))}
            />
          )}
        </div>

        {tool === 'build' && isDM && (
          <SceneEditor
            scene={activeScene}
            build={build}
            dialog={dialog}
            onBuildChange={setBuild}
            onClose={() => setTool('select')}
            onSceneUpdate={(patch) => socket.emit('updateScene', { sceneId: activeScene.id, patch })}
            onPaint={paintCells}
            history={{ ...history, onUndo: doUndo, onRedo: doRedo }}
            onReshape={({ w, h, floor, cells: given }) => {
              const cells = given || resizeCells(activeScene, w, h, floor);
              socket.emit('reshapeScene', { sceneId: activeScene.id, w, h, floor, cells, fresh: !!given });
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
          onSend={onSendChat}
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
          showDm={showDm}
          guided={guided}
          view3d={view3d && webglOk}
          onToggle3d={webglOk ? () => { setView3d(!view3d); setMobilePane('map'); } : null}
          onToggleDm={() => { setDmTools((v) => !v); setMobilePane('map'); }}
          onInvite={() => { copyInvite(); setMobilePane('map'); }}
          onSound={() => { setShowSound(true); setMobilePane('map'); }}
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
      {quickEdit && renderScene.tokens.some((t) => t.id === quickEdit.tokenId) && (
        <TokenQuickEdit
          token={renderScene.tokens.find((t) => t.id === quickEdit.tokenId)}
          anchor={quickEdit}
          onClose={() => setQuickEdit(null)}
          onDuplicate={() => duplicateToken(renderScene.tokens.find((t) => t.id === quickEdit.tokenId))}
          notes={isDM && state.mode === 'dm'}
        />
      )}

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
            leveling={state.mode === 'guided' ? 'xp' : state.settings?.leveling || 'xp'}
            canAlwaysLevel={state.mode === 'dm' && state.dmId === user.id}
            dmNote={isDM && state.mode === 'dm' ? <DmNote key={sheetChar} characterId={sheetChar} value={state.dmNotes?.[sheetChar]} /> : null}
            castTargets={sheetChar === myCharacterId && myToken ? renderScene.tokens.filter((t) => (t.kind === 'monster' ? !t.dead && (isDM || !t.hidden) : t.kind === 'pc' || t.kind === 'npc')).map((t) => ({ id: t.id, label: t.id === myToken.id ? `${t.label} (you)` : t.label, friendly: t.kind !== 'monster' })) : null}
            onCastAt={({ spellIndex, slot, targetId, heal }) => {
              setSheetChar(null);
              // the server checks range, your action and the slot, then spends it
              if (heal) socket.emit('heroAction', { actorTokenId: myToken.id, targetTokenId: targetId, action: { ref: `s:${spellIndex}`, slot } }, (r) => r?.error && say(r.error));
              else socket.emit('attackToken', { attackerTokenId: myToken.id, targetTokenId: targetId, attack: { ref: `s:${spellIndex}`, slot, style: 'spell' } }, (r) => r?.error && say(r.error));
            }}
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
            const spawn = pendingSpawn.current || findFreeCell(renderScene, nearParty(renderScene), 2);
            pendingSpawn.current = null;
            socket.emit('addToken', { sceneId: activeScene.id, token: withPlaceHidden({ ...token, x: spawn.x, y: spawn.y }) });
            say(`${token.label || 'A monster'} is on the map near the party: drag it where you want it.`);
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

      {giveTo && <GiveItemModal characterId={giveTo.characterId} heroName={giveTo.name} onClose={() => setGiveTo(null)} onDone={(it) => say(`${it.name} is in ${giveTo.name}'s gear.`)} />}
      {shopId && (() => {
        const t = renderScene?.tokens?.find((x) => x.id === shopId);
        return t ? <ShopModal token={t} isDM={isDM} mySheet={mySheet} onClose={() => setShopId(null)} /> : null;
      })()}

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
// A rail of tools down the left edge. A tool's options open beside it as a
// flyout lined up with its button, so nothing in the rail ever moves.

function ToolDock({
  objKind, onObjKind, canClearAll, tools, tool, onTool, drawColor, onDrawColor, fogMode, onFogMode, scene, onFogToggle, onFogCoverAll, onFogRevealAll, onClearDrawings, history, optionsHidden, onSetTool = onTool,
}) {
  useKeybinds(); // titles show the current keys
  const railRef = useRef(null);
  const [optTop, setOptTop] = useState(0);
  useLayoutEffect(() => {
    const on = railRef.current?.querySelector('.tool-btn.on');
    setOptTop(on ? on.offsetTop : 0); // offsetParent is the dock itself
  }, [tool, tools.length]);
  const fogBtn = (mode, label, title) => (
    <button className={`small-btn ${fogMode === mode ? 'primary-btn' : 'ghost-btn'}`} aria-pressed={fogMode === mode} title={title} onClick={() => onFogMode(mode)}>{label}</button>
  );
  return (
    <div className="tool-dock" style={{ '--opt-top': `${optTop}px` }}>
      <div className="tool-dock-main" role="toolbar" aria-label="Map tools" ref={railRef}>
        {tools.map(({ key, name, hint, Icon }) => (
          <button
            key={key}
            className={`tool-btn ${tool === key || (key === 'draw' && tool === 'erase') ? 'on' : ''}`}
            title={`${name}${firstKey(`tool.${key}`) ? ` (${firstKey(`tool.${key}`)})` : ''} - ${hint}`}
            aria-label={name}
            aria-pressed={tool === key}
            onClick={() => onTool(key)}
          >
            <Icon size={19} />
            <span className="tool-btn-label">{name}</span>
          </button>
        ))}
        {history && (
          <div className="tool-history" role="group" aria-label="Undo and redo">
            <button className="tool-btn" disabled={!history.canUndo} title={history.canUndo ? `Undo ${history.undoLabel} (${firstKey('edit.undo')})` : 'Nothing to undo on this scene'} aria-label="Undo" onClick={history.onUndo}>
              <UndoIcon size={18} /><span className="tool-btn-label">Undo</span>
            </button>
            <button className="tool-btn" disabled={!history.canRedo} title={history.canRedo ? `Redo ${history.redoLabel} (${firstKey('edit.redo')})` : 'Nothing to redo'} aria-label="Redo" onClick={history.onRedo}>
              <RedoIcon size={18} /><span className="tool-btn-label">Redo</span>
            </button>
          </div>
        )}
      </div>

      {!optionsHidden && tool === 'draw' && (
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
          <button className="small-btn ghost-btn" onClick={() => onSetTool('erase')} title="Erase drawings">
            <EraserIcon size={13} /> Erase
          </button>
        </div>
      )}

      {!optionsHidden && tool === 'erase' && (
        <div className="tool-options">
          <button className="small-btn ghost-btn" onClick={() => onSetTool('draw')}>
            <PenIcon size={13} /> Back to drawing
          </button>
          <button className="small-btn danger-btn" onClick={onClearDrawings}>{canClearAll ? 'Clear all' : 'Clear mine'}</button>
        </div>
      )}

      {!optionsHidden && tool === 'secrets' && (
        <div className="tool-options dm-kinds" role="group" aria-label="What to place">
          {OBJECT_KINDS.map((k) => (
            <button key={k.key} className={`small-btn ${objKind === k.key ? 'primary-btn' : 'ghost-btn'}`} title={k.hint} onClick={() => onObjKind(k.key)}>{k.name}</button>
          ))}
        </div>
      )}

      {!optionsHidden && tool === 'fog' && (
        <div className="tool-options fog-options" role="group" aria-label="Fog options">
          <span className="tool-options-label">Brush</span>
          {fogBtn('reveal', 'Reveal', 'Drag to reveal squares')}
          {fogBtn('hide', 'Re-hide', 'Drag to hide squares again')}
          <span className="tool-options-label">Room</span>
          {fogBtn('room', 'Reveal', 'Click a room to reveal all of it, up to its walls and doors')}
          {fogBtn('roomHide', 'Hide', 'Click a room to hide all of it again')}
          <span className="tool-options-label">Scene</span>
          <button className="small-btn ghost-btn" onClick={onFogToggle} title="Turn fog of war on or off for this scene">
            Fog: {scene.fogEnabled ? 'on' : 'off'}
          </button>
          <button className="small-btn ghost-btn" onClick={onFogCoverAll}>Hide all</button>
          <button className="small-btn ghost-btn" onClick={onFogRevealAll}>Reveal all</button>
        </div>
      )}

    </div>
  );
}

/* ---------------- scene list ---------------- */
// Dropped from the Scenes pill: every scene, one click to take the table there.

function SceneStrip({ scenes, activeId, onClose, onGo, onManage, onTemplate }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.hud-dm-pills')) onClose(); };
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div ref={ref} className="scene-flyout panel" role="dialog" aria-label="Scenes">
      <div className="scene-strip-list" role="tablist" aria-label="Scenes">
        {scenes.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === activeId}
            className={`scene-chip ${s.id === activeId ? 'on' : ''}`}
            title={s.id === activeId ? `${s.name} (live)` : `Take the table to ${s.name}`}
            onClick={() => (s.id !== activeId ? onGo(s.id) : onClose())}
          >
            <SceneThumb scene={s} w={78} h={48} />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="scene-flyout-foot">
        <button className="small-btn" onClick={onTemplate}><WandIcon size={12} /> New from a template</button>
        <button className="small-btn ghost-btn" onClick={onManage}><PlusIcon size={12} /> Prep: all scenes</button>
      </div>
    </div>
  );
}

/* ---------------- place an NPC or marker ---------------- */

function PlaceTokenModal({ kind, onClose, onPlace }) {
  const isNpc = kind === 'npc';
  const [label, setLabel] = useState(isNpc ? 'Villager' : 'Objective');
  const [art, setArt] = useState(isNpc ? 'humanoid' : 'marker');
  const [color, setColor] = useState(isNpc ? NPC_COLORS[0] : '#8a7448');
  const [hidden, setHidden] = useState(getPlaceHidden);

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

function MoreSheet({ isDM, showDm, isHost, hasSheet, onClose, onSheet, onMonsters, onPrep, onStory, onRules, onGuide, onSettings, view3d, onToggle3d, guided, onToggleDm, onInvite, onSound }) {
  const items = [
    hasSheet && { label: 'My character sheet', Icon: ScrollIcon, onClick: onSheet },
    onToggle3d && { label: view3d ? 'Switch to the flat 2D map' : 'Switch to the 3D world', Icon: MapIcon, onClick: onToggle3d },
    { label: 'Sound', Icon: VolumeIcon, onClick: onSound },
    { label: 'Copy invite link', Icon: CopyIcon, onClick: onInvite },
    showDm && { label: 'Monster library', Icon: SkullIcon, onClick: onMonsters },
    showDm && { label: 'Scenes', Icon: MapIcon, onClick: onPrep },
    showDm && { label: 'Story outline', Icon: ScrollIcon, onClick: onStory },
    { label: 'Rules reference', Icon: BookIcon, onClick: onRules },
    { label: "Player's guide", Icon: BookIcon, onClick: onGuide },
    { label: isDM && !guided ? 'DM handbook & practice round' : 'DM handbook', Icon: BookIcon, onClick: () => { window.dispatchEvent(new Event('dnd:handbook')); onClose(); } }, // Training.jsx
    (isDM || isHost) && { label: 'Campaign settings', Icon: GearIcon, onClick: onSettings },
    guided && isDM && { label: showDm ? 'Hide the DM tools' : 'Show the DM tools', Icon: SkullIcon, onClick: onToggleDm },
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
  const [name, setName, flushName] = useAutoSave({ key: `${state.code}:name`, value: state.name, save: (v) => v.trim() && socket.emit('renameCampaign', { name: v.trim() }) });
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
                <input id="campaign-rename" value={name} onChange={(e) => setName(e.target.value)} onBlur={flushName} className="grow" maxLength={60} />
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
              <label className="row mt small" title="XP: heroes level up when their XP reaches the next threshold. Milestone: they level up when you grant it.">
                Levelling{' '}
                <select value={state.settings?.leveling === 'milestone' ? 'milestone' : 'xp'} onChange={(e) => socket.emit('updateSettings', { leveling: e.target.value })}>
                  <option value="xp">By XP (award XP after fights)</option>
                  <option value="milestone">Milestone (you grant levels)</option>
                </select>
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
                  title="Every hero at the table may go up one level (milestone levelling, or a reward)"
                  onClick={() => socket.emit('grantLevel', {}, (r) => r?.error && dialog.alert(r.error))}
                >
                  <TrophyIcon size={12} /> Grant a level
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
                        const ok = await dialog.confirm(`Remove ${m.username} from the campaign?`, 'Remove player', 'Remove');
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
          <SaveStatus />
          <span className="grow" />
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

// Where a creature added from the library lands: a couple of squares from
// the party, so it shows up where the action is (or where the DM is looking).
function nearParty(scene) {
  const heroes = scene.tokens.filter((t) => t.kind === 'pc' && !t.dead);
  if (!heroes.length) return viewCell(scene);
  return { x: Math.round(heroes.reduce((n, t) => n + t.x, 0) / heroes.length), y: Math.round(heroes.reduce((n, t) => n + t.y, 0) / heroes.length) };
}

function findFreeCell(scene, from = null, minR = 0) {
  const cx = from ? from.x : Math.floor(scene.grid.w / 2);
  const cy = from ? from.y : Math.floor(scene.grid.h / 2);
  const taken = new Set(scene.tokens.map((t) => `${t.x},${t.y}`));
  for (let r = minR; r < 15; r++) {
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
