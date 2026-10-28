import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { adventureByKey, forParty } from '../data/adventures';
import { ScrollIcon, ChevronRight, D20Icon, SparkleIcon, BookIcon, TrophyIcon, MinusIcon } from './Icons';

// Drives the guided "Learn to Play" adventure. Reads room.tutorial from server
// state; the client that presses Continue/Choice applies that step's effects and
// broadcasts the advance so every table member stays in sync.
// The narration shouts names and dangers in capitals (MARLA, TWO GOBLINS);
// set them in small caps so they read as emphasis, not yelling.
function smallCaps(text) {
  const parts = text.split(/(\b[A-Z][A-Z'’]{2,}(?:[\s-]+[A-Z][A-Z'’]*)*\b)/);
  return parts.map((s, i) => (i % 2 ? <span key={i} className="tut-sc">{s.toLowerCase()}</span> : s));
}

export default function TutorialOverlay({ state, me, mySheet, charSheets, needsCharacter }) {
  const tut = state.tutorial || { active: false, step: 0 };
  const [collapsed, setCollapsed] = useState(false);
  const [started, setStarted] = useState(tut.active);
  // When a fight actually starts, get out of the way of the battlefield
  // (tap the Step button to bring the story back).
  const fighting = !!(state.combat?.active && state.combat.round > 0);
  useEffect(() => { if (fighting) setCollapsed(true); }, [fighting]);
  const appliedRef = useRef(-1);

  // Which adventure this table is playing (the first quest unless chosen).
  const adv = adventureByKey(tut.adventure || state.adventureKey || 'flagon');
  const STEPS = adv.steps;
  const step = STEPS[tut.step] || STEPS[0];
  const heroCount = Math.max(1, state.members.filter((m) => m.characterId).length);
  const isHost = state.hostId === me?.userId;

  // Apply a step's on-enter effects exactly once for the whole table: the
  // server hands the step to the first client that claims it, so a reload or
  // a second player never spawns the monsters twice.
  useEffect(() => {
    if (!tut.active) return;
    if (appliedRef.current === tut.step) return;
    appliedRef.current = tut.step;
    if (tut.applied === tut.step) return;
    const at = tut.step;
    socket.emit('tutorialClaimStep', { step: at }, (r) => {
      if (!r?.ok) return;
      for (const fx of STEPS[at]?.effectsOnEnter || []) applyEffect(fx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut.step, tut.active]);

  const applyEffect = (fx) => {
    switch (fx.type) {
      case 'switchScene':
        socket.emit('switchScene', { sceneId: fx.sceneId });
        break;
      case 'spawn':
        {
          // Going Back and forward again must not bring a second copy of anyone.
          const there = new Set((state.scenes.find((sc) => sc.id === fx.sceneId)?.tokens || []).map((t) => t.label));
          for (const t of forParty(fx.tokens, heroCount)) if (!there.has(t.label)) socket.emit('addToken', { sceneId: fx.sceneId, token: t });
        }
        break;
      case 'startCombat':
        socket.emit('startCombat');
        break;
      case 'rollMonsters':
        setTimeout(() => socket.emit('rollMonsterInitiative'), 400);
        break;
      case 'endCombat':
        socket.emit('endCombat');
        break;
      case 'awardXp':
        socket.emit('awardXp', { amount: fx.amount });
        break;
      case 'restoreHeroes':
        socket.emit('restoreHeroes');
        break;
      case 'announce':
        socket.emit('announce', { text: fx.text, type: fx.logType || 'story' });
        break;
      default:
        break;
    }
  };

  const beginAdventure = () => {
    const scenes = adv.buildScenes();
    socket.emit('tutorialStart', { scenes, step: 0, adventure: adv.key });
    setStarted(true);
  };

  const advance = (toStep) => {
    const target = toStep !== undefined ? toStep : tut.step + 1;
    socket.emit('tutorialAdvance', { step: target });
  };

  const finish = () => {
    socket.emit('tutorialEnd');
  };

  // Not started yet: show the "start" gate (host launches, once everyone has a hero)
  if (!tut.active && !started) {
    const everyoneReady = state.members.every((m) => m.characterId);
    return (
      <div className="tut-launch panel">
        <div className="tut-launch-inner">
          <SparkleIcon size={30} />
          <h2>{adv.name}</h2>
          <p className="muted">
            {adv.tutorial ? 'Your first quest: about an hour of guided play that teaches D&D as you go.' : `${adv.blurb} ${adv.levels}, ${adv.length.toLowerCase()}. The app narrates and runs the monsters.`}{' '}
            Everyone needs a hero first (a ready-made one is one click).
          </p>
          <div className="tut-launch-roster">
            {state.members.map((m) => (
              <span key={m.userId} className={`chip ${m.characterId ? 'gold' : ''}`}>
                {m.username}: {m.characterId ? (charSheets[m.characterId]?.name || 'ready') : 'choosing...'}
              </span>
            ))}
          </div>
          {isHost ? (
            <button className="primary-btn big-btn" onClick={beginAdventure} disabled={!everyoneReady}>
              <D20Icon size={16} /> {everyoneReady ? 'Begin the adventure!' : 'Waiting for everyone to pick a hero...'}
            </button>
          ) : (
            <p className="muted">Waiting for {state.members.find((m) => m.userId === state.hostId)?.username || 'the host'} to start...</p>
          )}
          <p className="small muted">Invite friends with the campaign code up top. You can also just explore this table freely.</p>
        </div>
      </div>
    );
  }

  if (!tut.active) return null;

  if (collapsed) {
    return (
      <button className="tut-collapsed" onClick={() => setCollapsed(false)} title="Show adventure guide">
        <ScrollIcon size={18} /> Step {tut.step + 1}
      </button>
    );
  }

  return (
    <div className="tut-panel panel">
      <div className="tut-head">
        <span className="tut-step-num">Scene {tut.step + 1} / {STEPS.length}</span>
        <h3>{step.title}</h3>
        <button className="close-btn" onClick={() => setCollapsed(true)} title="Minimize" aria-label="Minimize the adventure guide"><MinusIcon size={16} /></button>
      </div>

      <div className="tut-body">
        <div className="tut-narration">
          {step.narration.split('\n\n').map((p, i) => <p key={i}>{smallCaps(p)}</p>)}
        </div>

        {step.rule && (
          <div className="tut-rule">
            <h4><BookIcon size={14} /> {step.rule.title}</h4>
            <ul>{step.rule.lines.map((l, i) => <li key={i} className={/^\d+\.\s/.test(l) ? 'is-numbered' : undefined}>{l}</li>)}</ul>
          </div>
        )}

        <div className="tut-instruction">
          <strong><ChevronRight size={13} /> Your move:</strong> {step.instruction}
        </div>
      </div>

      <div className="tut-foot">
        {isHost ? (
          <>
            {step.choices ? (
              <div className="tut-choices">
                {step.choices.map((c, i) => (
                  <button key={i} className="primary-btn" onClick={() => advance(c.to)}>{c.label}</button>
                ))}
              </div>
            ) : step.final ? (
              <button className="primary-btn big-btn" onClick={finish}><TrophyIcon size={15} /> Finish adventure</button>
            ) : (
              <button className="primary-btn" onClick={() => advance()}>Continue <ChevronRight size={13} /></button>
            )}
            {tut.step > 0 && !step.final && (
              <button className="ghost-btn small-btn" onClick={() => advance(Math.max(0, tut.step - 1))}>Back</button>
            )}
          </>
        ) : (
          <p className="muted small">
            {state.members.find((m) => m.userId === state.hostId)?.username || 'The host'} advances the story when the party is ready.
          </p>
        )}
      </div>
    </div>
  );
}
