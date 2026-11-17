import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { socket } from '../socket';
import { ModalOverlay, useLocalStorage, useDialog } from '../utils';
import { CHAPTERS, ALL_STEPS } from '../training/dmCourse';
import { GROUPS, searchCards } from '../training/handbook';
import { PROMPTS, nextPrompt, in3d, DM_HINT, practiceScene, practiceRats, sandboxPayload, PRACTICE_GOBLINS } from '../training/practice';
import { BookIcon, CheckIcon, XIcon, ChevronRight, EyeIcon, SwordIcon, TrophyIcon, SearchIcon, ListIcon, RestartIcon, UsersIcon, SparkleIcon, MinusIcon } from './Icons';
import '../styles/training.css';

// Learning the table, on top of the board: the DM training ground's coach,
// the practice round (each player's next prompt, the DM's readiness board,
// everyone's summary at the end) and the DM handbook. Progress lives in the
// room state (server/socket/training.js), so it survives a reload and every
// screen agrees; nothing here sends anything a normal game doesn't.

/* ---------------- a little shared state: handbook open, view as player ---------------- */

const store = { handbook: false, viewAs: false };
const subs = new Set();
const setStore = (patch) => { Object.assign(store, patch); for (const fn of subs) fn(); };
const useStore = (key) => useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => store[key]);
export const openHandbook = () => setStore({ handbook: true });
if (typeof window !== 'undefined') window.addEventListener('dnd:handbook', openHandbook);

const BOT = 'bot:1';

/** Whether the DM is looking at the table as a player sees it. */
export const useViewAs = () => useStore('viewAs');
/**
 * Look as a player (or stop). In the training ground the practice hero is
 * yours to play meanwhile; at a real table it is only a preview.
 */
export function setViewAs(on, { training = false } = {}) {
  setStore({ viewAs: !!on });
  if (!training) return;
  socket.emit('trainingDrive', { botId: on ? BOT : null });
  if (on) socket.emit('practiceMark', { key: 'viewAs' });
}

// What a player would be sent (roomState.viewForUser, for players): no
// hidden creatures or secrets, nothing standing in fog they haven't seen, no
// prep, story outline or DM notes, and a turn order without hidden creatures.
function asPlayer(state) {
  const hiddenIds = new Set();
  for (const sc of state.scenes) for (const t of sc.tokens) if (t.hidden && t.kind !== 'pc') hiddenIds.add(t.id);
  const c = state.combat;
  let combat = c;
  if (c?.order?.some((o) => hiddenIds.has(o.tokenId))) {
    const order = [];
    let turnIndex = -1;
    c.order.forEach((o, i) => { if (!hiddenIds.has(o.tokenId)) { order.push(o); if (i <= c.turnIndex) turnIndex = order.length - 1; } });
    combat = { ...c, order, turnIndex: Math.max(0, turnIndex < 0 ? order.length - 1 : turnIndex) };
  }
  const { dmNotes, ...rest } = state;
  return {
    ...rest,
    viewerIsDM: false,
    combat,
    story: { beats: [], activeBeatId: null },
    scenes: state.scenes.map((sc) => {
      const fog = sc.fogEnabled ? new Set(sc.revealed || []) : null;
      return {
        ...sc, notes: '', prepAt: null,
        tokens: sc.tokens
          .filter((t) => !t.hidden && (!fog || t.kind === 'pc' || fog.has(`${t.x},${t.y}`)))
          .map(({ dmNote, patrol, ...t }) => t),
        objects: (sc.objects || []).filter((o) => !o.hidden).map((o) => ({ id: o.id, x: o.x, y: o.y, kind: o.kind, name: o.name, used: o.used, trigger: o.trigger })),
      };
    }),
  };
}

/**
 * The board, plus everything for learning it. A DM can look at the table as
 * a player sees it (the eye in the top bar). In the training ground the board
 * then also thinks it is a practice hero's player (the server still knows it
 * is the DM, who may move and attack for anyone); at a real table the DM
 * stays themselves, just without the DM's eyes.
 */
export function TrainingTable({ user, state, code, render }) {
  const viewAs = useStore('viewAs');
  const realDM = state.mode === 'dm' && state.dmId === user.id;
  const viewing = viewAs && realDM;
  const asHero = viewing && !!state.training && state.members.some((m) => m.userId === BOT);
  const shown = useMemo(() => (viewing ? asPlayer(state) : state), [viewing, state]);
  const shownUser = useMemo(() => (asHero ? { ...user, id: BOT } : user), [asHero, user]);
  // Leaving the table (or the DM handing it over) ends the pretending.
  useEffect(() => () => setStore({ viewAs: false }), [code]);
  useEffect(() => { if (viewAs && !realDM) setStore({ viewAs: false }); }, [viewAs, realDM]);
  return (
    <>
      {render(shown, shownUser)}
      <TrainingLayer state={state} user={user} code={code} viewing={viewing} />
    </>
  );
}

function TrainingLayer({ state, user, code, viewing }) {
  const handbook = useStore('handbook');
  const dialog = useDialog();
  const realDM = state.mode === 'dm' && state.dmId === user.id;
  const me = state.members.find((m) => m.userId === user.id);
  const p = state.practice;
  return (
    <>
      {state.training && realDM && !handbook && <DmCoach state={state} code={code} viewing={viewing} />}
      {viewing && !state.training && <ViewAsBar live onExit={() => setViewAs(false)} />}
      {p?.active && realDM && <Readiness state={state} />}
      {p?.active && !realDM && me?.characterId && <PracticePrompt state={state} me={me} />}
      {p && !p.active && p.endedAt && <ReadySummary state={state} user={user} code={code} />}
      {handbook && (
        <Handbook
          onClose={() => setStore({ handbook: false })}
          canPractice={realDM && !state.training && !p?.active}
          onPractice={() => { setStore({ handbook: false }); startPractice(state, dialog); }}
        />
      )}
    </>
  );
}

/* ---------------- pointing at things ---------------- */

// On screen, or in a list that can scroll it there (Spotlight scrolls it in).
const scroller = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if ((/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) || (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth)) return p;
  }
  return null;
};
const visible = (el) => {
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden') return false;
  if (r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return true;
  const sc = scroller(el);
  if (!sc) return false;
  const q = sc.getBoundingClientRect(); // its list must be on screen
  return q.bottom > 0 && q.right > 0 && q.top < window.innerHeight && q.left < window.innerWidth;
};
function findTarget(targets) {
  for (const t of targets || []) {
    for (const el of document.querySelectorAll(t.sel)) {
      if (el.closest('.trn-card, .trn-ready')) continue;
      if (t.text && !el.textContent.includes(t.text)) continue;
      if (visible(el)) return el;
    }
  }
  return null;
}

// The part of `el` you can actually see: its box cut down by every ancestor
// that clips it (a scrolling list, a panel) and by the window. Null when it
// is scrolled out of sight or something else sits on top of it.
function shownBox(el) {
  const r = el.getBoundingClientRect();
  let cl0 = 0, ct0 = 0, cr0 = window.innerWidth, cb0 = window.innerHeight; // the clip
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const pr = p.getBoundingClientRect();
    const cl = pr.left + p.clientLeft, ct = pr.top + p.clientTop;
    cl0 = Math.max(cl0, cl); ct0 = Math.max(ct0, ct);
    cr0 = Math.min(cr0, cl + p.clientWidth); cb0 = Math.min(cb0, ct + p.clientHeight);
  }
  const left = Math.max(r.left, cl0), top = Math.max(r.top, ct0), right = Math.min(r.right, cr0), bottom = Math.min(r.bottom, cb0);
  if (right - left < 4 || bottom - top < 4) return null;
  // Covered by another panel? Then don't draw over that panel. (The coach's
  // own card doesn't count: it moves out of the way, see useClearSlot.)
  const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]];
  const seen = pts.some(([fx, fy]) => {
    const hit = document.elementFromPoint(left + (right - left) * fx, top + (bottom - top) * fy);
    return !hit || el.contains(hit) || hit.contains(el) || hit.closest('.trn-card');
  });
  if (!seen) return null;
  // a little room around it, but never past the clip
  const l = Math.max(left - 4, cl0), t = Math.max(top - 4, ct0);
  return { left: l, top: t, width: Math.min(right + 4, cr0) - l, height: Math.min(bottom + 4, cb0) - t };
}

// Scroll only the list the target sits in, by as little as it takes; never
// the page or the panels around it (scrollIntoView moves those too).
function bringIntoView(el) {
  const p = scroller(el);
  if (!p) return;
  const cs = getComputedStyle(p);
  const sy = /(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight;
  const sx = /(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth;
  const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
  const top = pr.top + p.clientTop, left = pr.left + p.clientLeft;
  if (sy) {
    if (r.top < top) p.scrollTop -= top - r.top + 8;
    else if (r.bottom > top + p.clientHeight) p.scrollTop += Math.min(r.bottom - top - p.clientHeight + 8, r.top - top - 8);
  }
  if (sx) {
    if (r.left < left) p.scrollLeft -= left - r.left + 8;
    else if (r.right > left + p.clientWidth) p.scrollLeft += Math.min(r.right - left - p.clientWidth + 8, r.left - left - 8);
  }
}

/** A soft ring around the first of `targets` on screen; it follows the element as anything scrolls. */
function Spotlight({ targets }) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (!targets?.length) { setBox(null); return undefined; }
    let last = '';
    let shownEl = null;
    let frame = 0;
    const tick = () => {
      frame = 0;
      const el = findTarget(targets);
      // A new thing to point at, half out of its list: bring it into view once.
      if (el && el !== shownEl) { shownEl = el; bringIntoView(el); }
      const r = el && shownBox(el);
      const key = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : '';
      if (key !== last) { last = key; setBox(r); }
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(tick); };
    tick();
    const id = setInterval(soon, 300); // panels opening and closing
    window.addEventListener('scroll', soon, true); // any list, in any panel
    window.addEventListener('resize', soon);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', soon, true);
      window.removeEventListener('resize', soon);
    };
  }, [targets]);
  if (!box) return null;
  return <div className="trn-ring" style={box} aria-hidden="true" />;
}

/* ---------------- the DM training ground ---------------- */

// The coach sits bottom-left, clear of the party in the middle of the view;
// when a panel, a tool's options or the thing it points at is there it moves
// to the bottom-right, or above the dice. Opening a tool never ends up
// underneath it; if every spot is taken it picks the one that hides least.
const IN_THE_WAY = '.qdm, .scene-flyout, .build-panel, .dm-panel, .dm-obj, .dm-flash, .dm-note, .qdm-quick, .qdm-creatures, .hud-more-menu, .hud-hero, .tool-options, .sound-panel, .dice-tray, .dice-toggle, .chat-panel, .scene-notes-pop, .dm-patrol-bar, .trn-ready, .trn-ring, .modal';
function useClearSlot(ref) {
  const [place, setPlace] = useState({ slot: 'left', lift: 0, tuck: false });
  useEffect(() => {
    const id = setInterval(() => {
      const card = ref.current;
      if (!card) return;
      const phone = window.innerWidth <= 820;
      const cr = card.getBoundingClientRect();
      const lift0 = parseFloat(card.style.translate?.split(' ')[1]) || 0; // what it is lifted by now (negative)
      const h = cr.height, w = cr.width, W = window.innerWidth, top = cr.top - lift0;
      const boxes = [...document.querySelectorAll(IN_THE_WAY)].filter((el) => !card.contains(el)).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
      // phones: one place, full width
      const at = phone ? { left: cr.left } : { left: 76, right: W - w - 14, mid: (W - w) / 2 };
      const hits = (k) => boxes.filter((r) => r.left < at[k] + w && r.right > at[k] && r.top < top + h && r.bottom > top);
      const area = (k) => hits(k).reduce((n, r) => n + (Math.min(r.right, at[k] + w) - Math.max(r.left, at[k])) * (Math.min(r.bottom, top + h) - Math.max(r.top, top)), 0);
      setPlace((p) => {
        const keys = Object.keys(at);
        const was = keys.includes(p.slot) ? p.slot : 'left';
        const slot = !area(was) ? was : keys.reduce((best, k) => (area(k) < area(best) ? k : best), 'left'); // stay put while clear: no hopping
        // Still something in the way there (the dice tray is wide): rise above it, if that fits.
        const low = hits(slot).filter((r) => r.top > top);
        let lift = low.length ? top + h + 8 - Math.min(...low.map((r) => r.top)) : 0;
        if (top - lift < 60) lift = 0;
        // A phone panel reaching down over it: tuck the coach away until it closes.
        const tuck = phone && hits(slot).some((r) => r.top <= top);
        return p.slot === slot && p.tuck === tuck && Math.abs(p.lift - lift) < 2 ? p : { slot, lift, tuck };
      });
    }, 400);
    return () => clearInterval(id);
  }, [ref]);
  return place;
}

const doneAt = (done, key) => Math.abs(done?.[key] || 0);

function DmCoach({ state, code, viewing }) {
  const dialog = useDialog();
  const done = state.training.done || {};
  const [chapterKey, setChapterKey] = useLocalStorage(`dnd.trn.chapter.${code}`, null);
  const [min, setMin] = useLocalStorage('dnd.trn.min', false);
  const [replay, setReplay] = useState({}); // step key -> when it was asked for again
  const [cheer, setCheer] = useState(null);
  const cardRef = useRef(null);
  const { slot, lift, tuck } = useClearSlot(cardRef);
  const [peek, setPeek] = useState(false); // a phone: the tucked coach, shown anyway
  useEffect(() => { if (!tuck) setPeek(false); }, [tuck]);
  const tucked = tuck && !peek;
  const isDone = (k) => doneAt(done, k) > (replay[k] || 0);
  const chapter = CHAPTERS.find((c) => c.key === chapterKey) || null;
  const step = chapter ? chapter.steps.find((s) => !isDone(s.key)) : null;
  const total = ALL_STEPS.length;
  const count = ALL_STEPS.filter((s) => isDone(s.key)).length;

  // A step just got done: a beat of praise, then the next one shows itself.
  const prevStep = useRef(null);
  useEffect(() => {
    const was = prevStep.current;
    prevStep.current = step?.key || null;
    if (was && was !== step?.key && isDone(was) && done[was] > 0) {
      setCheer('Done!');
      const id = setTimeout(() => setCheer(null), 1400);
      return () => clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);

  // Back from a reload mid "view as a player": the practice hero acts on its own again.
  const driving = state.training.driving;
  useEffect(() => { if (driving && !viewing) socket.emit('trainingDrive', { botId: null }); }, [driving, viewing]);
  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const noMonsters = chapter?.needsMonsters && !state.combat?.active && !scene.tokens.some((t) => t.kind === 'monster' && !t.dead);
  const viewAs = (on) => setViewAs(on, { training: true });
  const reset = async (progress) => {
    if (!(await dialog.confirm(progress ? 'Fresh scenes, the practice heroes healed, and the checklist starts over.' : 'Fresh scenes and the practice heroes healed. Your ticks stay.', 'Reset the training ground', 'Reset'))) return;
    viewAs(false);
    socket.emit('trainingReset', { ...sandboxPayload(), progress });
    setReplay({});
    if (progress) setChapterKey(null);
  };
  const dropGoblins = () => {
    const heroes = scene.tokens.filter((t) => t.kind === 'pc');
    const cx = heroes.length ? heroes[0].x : Math.floor(scene.grid.w / 2), cy = heroes.length ? heroes[0].y : Math.floor(scene.grid.h / 2);
    PRACTICE_GOBLINS.forEach((g, i) => socket.emit('addToken', { sceneId: scene.id, token: { ...g, x: Math.min(scene.grid.w - 2, cx + 4 + (i % 2)), y: Math.max(1, cy - 3 + i) } }));
  };

  if (min) {
    return (
      <>
        <button className="trn-pill" onClick={() => setMin(false)} title="Show the DM training coach">
          <SparkleIcon size={14} /> DM training <b>{count}/{total}</b>
        </button>
        {viewing && <ViewAsBar onExit={() => viewAs(false)} />}
      </>
    );
  }

  return (
    <>
      {step && !viewing && <Spotlight targets={step.target} />}
      {viewing && <ViewAsBar onExit={() => viewAs(false)} />}
      {tucked && (
        <button className="trn-pill is-tucked" onClick={() => setPeek(true)} title={step ? step.say : 'Show the DM training coach'}>
          <SparkleIcon size={14} /> <b>{count}/{total}</b>
        </button>
      )}
      <section ref={cardRef} className={`trn-card slot-${slot} ${tucked ? 'is-tucked' : ''}`} style={lift ? { translate: `0 ${-lift}px` } : undefined} aria-label="DM training" aria-hidden={tucked || undefined}>
        <header className="trn-head">
          {chapter ? (
            <button className="icon-btn ghost-btn" onClick={() => setChapterKey(null)} aria-label="All chapters" title="All chapters"><ListIcon size={15} /></button>
          ) : <SparkleIcon size={16} />}
          <span className="trn-title">{chapter ? chapter.name : 'DM training ground'}</span>
          <span className="trn-count" title="Steps done">{count}/{total}</span>
          <button className="icon-btn ghost-btn" onClick={() => setMin(true)} aria-label="Minimise" title="Minimise"><MinusIcon size={15} /></button>
        </header>

        {!chapter && (
          <div className="trn-body">
            <p className="trn-say">Four short chapters, about ten minutes. Do them in any order; nothing here touches your real campaigns.</p>
            <ol className="trn-chapters">
              {CHAPTERS.map((c) => {
                const n = c.steps.filter((s) => isDone(s.key)).length;
                return (
                  <li key={c.key}>
                    <button className={`trn-chapter ${n === c.steps.length ? 'is-done' : ''}`} onClick={() => setChapterKey(c.key)}>
                      <span className="trn-chapter-name">{n === c.steps.length && <CheckIcon size={13} />} {c.name}</span>
                      <span className="trn-chapter-sub">{c.blurb}</span>
                      <span className="trn-dots" aria-label={`${n} of ${c.steps.length} done`}>{c.steps.map((s) => <i key={s.key} className={isDone(s.key) ? 'on' : ''} />)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="trn-row">
              <button className="small-btn trn-viewas" onClick={() => viewAs(!viewing)}><EyeIcon size={13} /> {viewing ? 'Back to the DM view' : 'View as a player'}</button>
              <button className="small-btn ghost-btn" onClick={openHandbook}><BookIcon size={13} /> Handbook</button>
              <button className="small-btn ghost-btn" onClick={() => reset(count === total)} title={count === total ? 'Fresh scenes, heroes healed, and the checklist from the start' : 'Fresh scenes, heroes healed'}><RestartIcon size={13} /> Reset</button>
            </div>
            {count === total && <p className="trn-win"><TrophyIcon size={14} /> Every step done. You are ready to run a game: try a practice round with your group next.</p>}
          </div>
        )}

        {chapter && step && (
          <div className="trn-body">
            <div className="trn-stepline">
              <span className="trn-dots">{chapter.steps.map((s) => <i key={s.key} className={`${isDone(s.key) ? 'on' : ''} ${s === step ? 'now' : ''}`} />)}</span>
              {cheer && <span className="trn-cheer" role="status"><CheckIcon size={12} /> {cheer}</span>}
            </div>
            <p className="trn-say" aria-live="polite">{step.say}</p>
            {noMonsters && (
              <p className="trn-hint">This scene has no monsters yet. <button className="link-btn" onClick={dropGoblins}>Add three goblins</button></p>
            )}
            <div className="trn-row">
              {step.key === 'viewAs' && <button className="small-btn primary-btn trn-viewas" onClick={() => viewAs(true)}><EyeIcon size={13} /> View as a player</button>}
              <button className="small-btn ghost-btn" onClick={() => socket.emit('practiceMark', { key: step.key, skip: true })}>Skip</button>
            </div>
          </div>
        )}

        {chapter && !step && (
          <div className="trn-body">
            <p className="trn-win"><CheckIcon size={14} /> {chapter.name}: done.</p>
            <p className="trn-also"><b>Also try:</b> {chapter.also}</p>
            <ul className="trn-redo">
              {chapter.steps.map((s) => (
                <li key={s.key}>
                  <span className={doneAt(done, s.key) && done[s.key] < 0 ? 'is-skipped' : ''}>{s.name}</span>
                  <button className="link-btn" onClick={() => setReplay((r) => ({ ...r, [s.key]: Date.now() }))}>Again</button>
                </li>
              ))}
            </ul>
            <div className="trn-row">
              {(() => {
                const next = CHAPTERS.find((c) => c.steps.some((s) => !isDone(s.key)));
                return next
                  ? <button className="small-btn primary-btn" onClick={() => setChapterKey(next.key)}>Next: {next.name} <ChevronRight size={12} /></button>
                  : <button className="small-btn primary-btn" onClick={() => setChapterKey(null)}>All chapters</button>;
              })()}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function ViewAsBar({ onExit, live }) {
  return (
    <div className="trn-viewbar" role="status">
      <EyeIcon size={14} /> {live ? 'Player view: fog, hidden creatures and your notes are hidden, as your players see it.' : 'You are seeing what a player sees, and playing their hero.'}
      <button className="small-btn primary-btn" onClick={onExit}>Back to the DM view</button>
    </div>
  );
}

/* ---------------- the practice round ---------------- */

export async function startPractice(state, dialog) {
  const heroes = state.members.filter((m) => m.characterId && m.userId !== state.dmId).length;
  const ok = await dialog.confirm(`About ten minutes on a practice scene: everyone walks, talks, opens a door, searches, fights a few rats and loots a chest, with a prompt telling them what to try. ${heroes ? '' : 'Nobody has picked a hero yet: wait for your players first. '}Hero sheets go back to how they were when you end it.`, 'Start a practice round', 'Start');
  if (ok) socket.emit('practiceStart', { scene: practiceScene() }, (r) => r?.error && dialog.alert(r.error));
}

const players = (state) => state.members.filter((m) => m.userId !== state.dmId && m.characterId);

function Readiness({ state }) {
  const dialog = useDialog();
  const p = state.practice;
  const [open, setOpen] = useState(true);
  const list = players(state);
  const ready = (m) => PROMPTS.filter((pr) => p.done?.[m.userId]?.[pr.key]).length;
  const fight = () => socket.emit('practiceFight', { monsters: practiceRats(list.length) }, (r) => r?.error && dialog.alert(r.error));
  const end = async () => { if (await dialog.confirm('Everyone goes back to where you were, hero sheets as they were before practice.', 'End the practice round', 'End practice')) socket.emit('practiceEnd'); };
  // The fight is over: on to the chest.
  useEffect(() => {
    if (p.stage === 'fight' && !state.combat?.active) socket.emit('practiceStage', { stage: 'after' });
  }, [p.stage, state.combat?.active]);

  if (!open) {
    return <button className="trn-pill is-ready" onClick={() => setOpen(true)}><UsersIcon size={14} /> Practice round <b>{list.filter((m) => ready(m) === PROMPTS.length).length}/{list.length} ready</b></button>;
  }
  return (
    <section className="trn-ready" aria-label="Practice round: who has tried what">
      <header className="trn-head">
        <UsersIcon size={15} />
        <span className="trn-title">Practice round</span>
        <button className="icon-btn ghost-btn" onClick={() => setOpen(false)} aria-label="Minimise" title="Minimise"><MinusIcon size={15} /></button>
      </header>
      <div className="trn-body">
        <p className="trn-hint">{DM_HINT[p.stage] || DM_HINT.explore}</p>
        {list.length ? (
          <table className="trn-grid">
            <thead><tr><th scope="col">Player</th>{PROMPTS.map((pr) => <th key={pr.key} scope="col" title={pr.say}>{pr.short}</th>)}</tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.userId}>
                  <th scope="row"><span className="trn-dot" style={{ background: m.color }} />{state.charSheets[m.characterId]?.name || m.username}</th>
                  {PROMPTS.map((pr) => {
                    const v = p.done?.[m.userId]?.[pr.key];
                    return <td key={pr.key} className={v > 0 ? 'on' : v < 0 ? 'skip' : ''} title={`${pr.short}: ${v > 0 ? 'done' : v < 0 ? 'skipped' : 'not yet'}`}>{v > 0 ? <CheckIcon size={12} /> : v < 0 ? '–' : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="trn-say">Waiting for players to pick a hero.</p>}
        <div className="trn-row">
          {p.stage === 'explore' && <button className="small-btn primary-btn" onClick={fight}><SwordIcon size={13} /> Spring the fight</button>}
          {p.stage === 'fight' && state.combat?.active && <button className="small-btn" onClick={() => socket.emit('endCombat')}>End the fight</button>}
          <button className={`small-btn ${p.stage === 'after' ? 'primary-btn' : 'ghost-btn'}`} onClick={end}><TrophyIcon size={13} /> End practice</button>
        </div>
      </div>
    </section>
  );
}

function PracticePrompt({ state, me }) {
  const p = state.practice;
  const mine = p.done?.[me.userId] || {};
  const prompt = nextPrompt(p.stage, mine);
  const [hidden, setHidden] = useState(false);
  // The sheet is a screen of its own: notice it opening here.
  useEffect(() => {
    if (mine.sheet) return undefined;
    const id = setInterval(() => { if (document.querySelector('.sheet-overlay')) socket.emit('practiceMark', { key: 'sheet' }); }, 800);
    return () => clearInterval(id);
  }, [mine.sheet]);
  const flat = !in3d();
  const n = PROMPTS.filter((pr) => mine[pr.key]).length;
  // Standing beside the door or the chest: the button to use it, right here.
  const scene = state.scenes.find((sc) => sc.id === state.activeSceneId);
  const hero = scene?.tokens.find((t) => t.kind === 'pc' && t.ownerId === me.userId);
  const near = (x, y) => hero && Math.max(Math.abs(hero.x - x), Math.abs(hero.y - y)) <= 1;
  let use = null;
  if (scene && hero && prompt?.key === 'door') {
    for (let y = hero.y - 1; y <= hero.y + 1 && !use; y++) for (let x = hero.x - 1; x <= hero.x + 1; x++) {
      const ch = (scene.cells[y] || '')[x];
      if (ch === 'D' || ch === 'd') { use = { label: ch === 'D' ? 'Open the door' : 'Close the door', go: () => socket.emit('toggleDoor', { sceneId: scene.id, x, y }) }; break; }
    }
  }
  // (phones have no hero bar, so no Search button of their own)
  const phone = typeof window !== 'undefined' && window.innerWidth <= 820;
  if (hero && phone && prompt?.key === 'search') use = { label: 'Search', go: () => socket.emit('searchArea', {}) };
  if (scene && hero && prompt?.key === 'loot') {
    const chest = (scene.objects || []).find((o) => o.kind === 'chest' && near(o.x, o.y));
    if (chest) use = { label: 'Open the chest', go: () => socket.emit('useObject', { id: chest.id }) };
  }
  const c = state.combat;
  const myTurn = c?.active && c.round > 0 && (() => {
    const id = c.order[c.turnIndex]?.tokenId;
    return state.scenes.some((sc) => sc.tokens.some((t) => t.id === id && t.ownerId === me.userId));
  })();

  if (!prompt) {
    if (p.stage === 'after' || n === PROMPTS.length) return <div className="trn-pill is-ready is-player" role="status"><CheckIcon size={14} /> You've tried everything. Ready!</div>;
    const line = p.stage === 'fight' && c?.active ? (myTurn ? 'Nice! Press End turn when you are done.' : 'Nice! Keep at it until the rats are down.') : 'Nice. Wait for the DM\'s next surprise…';
    return <div className="trn-pill is-player" role="status"><SparkleIcon size={14} /> {line}</div>;
  }
  if (hidden) return <button className="trn-pill is-player" onClick={() => setHidden(false)}><SparkleIcon size={14} /> Practice <b>{n}/{PROMPTS.length}</b></button>;
  const waiting = prompt.stage === 'fight' && c?.active && !myTurn;
  return (
    <>
      <Spotlight targets={waiting ? (c.round === 0 ? [{ sel: '.initiative-bar button', text: 'Roll' }] : null) : prompt.target} />
      <section className="trn-card is-player" aria-label="Practice round">
        <header className="trn-head">
          <SparkleIcon size={15} />
          <span className="trn-title">Practice round</span>
          <span className="trn-count">{n}/{PROMPTS.length}</span>
          <button className="icon-btn ghost-btn" onClick={() => setHidden(true)} aria-label="Minimise" title="Minimise"><MinusIcon size={15} /></button>
        </header>
        <div className="trn-body">
          <p className="trn-say" aria-live="polite">{waiting ? (c.round === 0 ? 'A fight! Roll initiative on the bar at the top.' : 'Wait for your turn: the glow on the bar shows whose it is.') : (phone && prompt.sayPhone) || (flat && prompt.sayFlat) || prompt.say}</p>
          {!waiting && <p className="trn-why">{prompt.why}</p>}
          {!waiting && (
            <div className="trn-row">
              {use && <button className="small-btn primary-btn" onClick={use.go}>{use.label}</button>}
              <button className="small-btn ghost-btn" onClick={() => socket.emit('practiceMark', { key: prompt.key, skip: true })}>Skip</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ReadySummary({ state, user, code }) {
  const p = state.practice;
  const [seen, setSeen] = useLocalStorage(`dnd.practice.seen.${code}`, 0);
  if (seen >= p.endedAt || Date.now() - p.endedAt > 3 * 3600 * 1000) return null;
  const list = players(state);
  const mine = p.done?.[user.id] || {};
  const amDM = state.dmId === user.id;
  const tried = PROMPTS.filter((pr) => mine[pr.key] > 0);
  const missed = PROMPTS.filter((pr) => !(mine[pr.key] > 0));
  return (
    <ModalOverlay onClose={() => setSeen(p.endedAt)}>
      <div className="modal trn-summary" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><TrophyIcon size={18} /> Ready to play</h3>
          <button className="close-btn" onClick={() => setSeen(p.endedAt)} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="trn-summary-body">
          {amDM ? (
            <ul className="trn-roster">
              {list.map((m) => {
                const n = PROMPTS.filter((pr) => p.done?.[m.userId]?.[pr.key] > 0).length;
                return <li key={m.userId}><span className="trn-dot" style={{ background: m.color }} />{state.charSheets[m.characterId]?.name || m.username} <b>{n}/{PROMPTS.length}</b>{n < PROMPTS.length && <span className="muted small"> (still new: {PROMPTS.filter((pr) => !(p.done?.[m.userId]?.[pr.key] > 0)).map((pr) => pr.short.toLowerCase()).join(', ')})</span>}</li>;
              })}
            </ul>
          ) : (
            <>
              <p>You tried <b>{tried.length} of {PROMPTS.length}</b>: {tried.map((pr) => pr.short.toLowerCase()).join(', ') || 'nothing yet'}.</p>
              {missed.length > 0 && <p className="muted">Still new: {missed.map((pr) => pr.short.toLowerCase()).join(', ')}. You'll pick them up as you play.</p>}
            </>
          )}
          <h4>Remember</h4>
          {amDM ? (
            <ul className="trn-tips">
              <li>Anyone still new to something: give them a moment for it in the first scene.</li>
              <li>Ask for rolls from <b>Table</b>; drop balanced fights from <b>Quick</b>.</li>
              <li>Everything else is a search away in the DM handbook.</li>
            </ul>
          ) : (
            <ul className="trn-tips">
              <li>Tap the map to walk; in a fight, move and act on your turn, then <b>End turn</b>.</li>
              <li>Your sheet rolls checks and saves for you. Rest and level up from there too.</li>
              <li>Not sure you can do something? Say what your hero tries, and the DM asks for a roll.</li>
            </ul>
          )}
          {!amDM && <p className="muted small">Want more practice alone? The first quest on the home screen teaches the rules in about an hour.</p>}
        </div>
        <div className="modal-actions"><button className="primary-btn" onClick={() => setSeen(p.endedAt)}>Let's play</button></div>
      </div>
    </ModalOverlay>
  );
}

/* ---------------- the DM handbook ---------------- */

export function Handbook({ onClose, canPractice, onPractice, onTraining, onSolo }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('first');
  const cards = useMemo(() => searchCards(q), [q]);
  const shown = q ? cards : cards.filter((c) => c.g === group);
  useEffect(() => { socket.connected && socket.emit('practiceMark', { key: 'handbook' }); }, []);
  return (
    <ModalOverlay onClose={onClose} className="trn-hb-overlay">
      <div className="modal trn-hb" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="DM handbook">
        <div className="modal-header">
          <h3><BookIcon size={17} /> DM handbook</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close the handbook"><XIcon size={16} /></button>
        </div>
        {(canPractice || onTraining || onSolo) && (
          <div className="trn-hb-actions">
            {onTraining && <button className="small-btn primary-btn" onClick={onTraining}><SparkleIcon size={13} /> Learn to DM (training ground)</button>}
            {canPractice && <button className="small-btn primary-btn" onClick={onPractice}><UsersIcon size={13} /> Start a practice round</button>}
            {onSolo && <button className="small-btn" onClick={onSolo}><ChevronRight size={13} /> Players: the solo first quest</button>}
          </div>
        )}
        <label className="trn-hb-search">
          <SearchIcon size={14} />
          <input type="search" placeholder="Search: fog, XP, doors, music…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the handbook" />
        </label>
        {!q && (
          <div className="trn-hb-tabs" role="tablist" aria-label="Handbook sections">
            {GROUPS.map((g) => <button key={g.key} role="tab" aria-selected={group === g.key} className={group === g.key ? 'on' : ''} onClick={() => setGroup(g.key)}>{g.name}</button>)}
          </div>
        )}
        <div className="trn-hb-cards">
          {shown.map((c) => (
            <article key={c.t} className="trn-hb-card">
              <h4>{c.t}</h4>
              <p>{c.body}</p>
              {c.how && <p className="trn-hb-how"><ChevronRight size={11} /> {c.how}</p>}
            </article>
          ))}
          {!shown.length && <p className="muted center">Nothing matches that. Try one word.</p>}
        </div>
      </div>
    </ModalOverlay>
  );
}

