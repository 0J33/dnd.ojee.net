import { useEffect, useRef } from 'react';
import { socket } from '../socket';
import { audio } from './audio';

// Picks the music and ambience for what's happening at the table, and plays
// the sounds of the game's events. The DM can override the music per scene
// (Table → Mood); otherwise it follows the action:
//   a fight starting (initiative) → tension · fighting → battle · a big foe → boss
//   exploring outdoors / a dungeon in the dark / a tavern → explore / sneak / tavern
//   a rest → resting

const TAVERN = /tavern|inn|flagon|taproom|alehouse/i;

function sceneKind(scene) {
  const cells = (scene?.cells || []).join('');
  const count = (re) => (cells.match(re) || []).length;
  const n = Math.max(1, cells.length);
  if (count(/l/g) / n > 0.04) return 'volcanic';
  if (count(/[v_]/g) / n > 0.15) return 'cave';
  if (count(/#/g) / n > 0.12 || count(/w/g) / n > 0.08) return 'indoor';
  return 'outdoor';
}

export function useGameAudio({ state, scene, log, charSheets }) {
  const restUntil = useRef(0);
  const prev = useRef({});

  // music mood
  const combat = state.combat;
  const kind = sceneKind(scene);
  const tokens = scene?.tokens || [];
  const foes = tokens.filter((t) => t.kind === 'monster' && !t.dead && !t.hidden);
  const big = foes.some((t) => (t.xpValue || 0) >= 200 || (t.maxHp || 0) >= 25 || /boss|captain|lord|chief|king|queen|dragon/i.test(t.label || ''));
  const lastLog = (log || []).slice(-6).map((e) => e.text || '').join(' ');
  if (/rest|catches its breath/i.test(lastLog) && !combat?.active) restUntil.current = Math.max(restUntil.current, Date.now() + 60000);
  let mood;
  const chosen = scene?.mood?.music;
  if (chosen && chosen !== 'auto') mood = chosen;
  else if (combat?.active && combat.round === 0) mood = 'tension';
  else if (combat?.active) mood = big ? 'boss' : 'combat';
  else if (Date.now() < restUntil.current) mood = 'rest';
  else if (TAVERN.test(scene?.name || '') || ((scene?.cells || []).join('').match(/[t2]/g) || []).length > 8) mood = 'tavern';
  else if (kind === 'cave' || (kind === 'indoor' && scene?.fogEnabled) || kind === 'volcanic') mood = 'sneak';
  else mood = 'explore';
  useEffect(() => { audio.setMood(mood); }, [mood]);

  // ambience
  const weather = scene?.mood?.weather || 'none';
  const night = scene?.mood?.time === 'night';
  const fire = /[cGI4K]/.test((scene?.cells || []).join(''));
  const amb = { kind: kind === 'outdoor' ? (night ? 'night' : 'forest') : kind === 'indoor' ? (mood === 'tavern' ? 'tavern' : 'dungeon') : kind, rain: weather === 'rain', wind: weather === 'snow' || weather === 'fog' || weather === 'ash', fire };
  const ambKey = JSON.stringify(amb);
  useEffect(() => { audio.setAmbience(JSON.parse(ambKey)); }, [ambKey]);

  // Leaving the table (back to the lobby) leaves its music and ambience behind.
  useEffect(() => () => { audio.setMood('silence'); audio.setAmbience({ kind: 'none' }); }, []);

  // events → sounds
  useEffect(() => {
    const onCombat = (ev) => {
      if (ev.kind === 'attack' || ev.kind === 'monsterAttackRoll') {
        const style = ev.style || 'melee';
        audio.sfx(style === 'spell' ? 'spell' : style === 'ranged' ? 'bow' : 'swing', { element: ev.damageType });
        const lag = style === 'melee' ? 240 : 620;
        setTimeout(() => audio.sfx(ev.crit ? 'crit' : ev.hit ? 'hit' : 'miss'), lag);
        if (ev.kind === 'monsterAttackRoll' && Math.random() < 0.5) audio.sfx('growl');
        if (ev.down) setTimeout(() => audio.sfx('death'), lag + 250);
      } else if (ev.kind === 'hp' && ev.delta > 0) audio.sfx('heal');
    };
    const onRoll = () => audio.sfx('dice');
    const onBanner = (b) => { if (b.style === 'alert') audio.sting('alert'); };
    const onHandout = () => audio.sfx('paper');
    const onFired = (o) => {
      if (o.kind === 'trap') audio.sfx('trap');
      else if (o.kind === 'chest') audio.sfx('coins');
      else if (o.kind === 'lever') audio.sfx('door');
      else if (o.kind === 'secret' || o.found) audio.sfx('secret');
    };
    socket.on('combatEvent', onCombat); socket.on('rollResult', onRoll); socket.on('dmBanner', onBanner); socket.on('handout', onHandout); socket.on('objectFired', onFired);
    return () => { socket.off('combatEvent', onCombat); socket.off('rollResult', onRoll); socket.off('dmBanner', onBanner); socket.off('handout', onHandout); socket.off('objectFired', onFired); };
  }, []);

  // state changes → sounds: doors, deaths, victory, defeat, level ups
  const doorSig = (scene?.cells || []).join('').replace(/[^Dd]/g, '');
  const dead = tokens.filter((t) => t.dead).length;
  const heroes = Object.values(charSheets || {});
  const allDown = heroes.length > 0 && heroes.every((h) => (h.currentHp ?? 1) <= 0);
  const levels = heroes.map((h) => h.level || 1).join(',');
  useEffect(() => {
    const p = prev.current;
    if (p.sceneId === scene?.id && p.doorSig !== undefined && p.doorSig !== doorSig) audio.sfx('door');
    if (p.sceneId === scene?.id && p.dead !== undefined && dead > p.dead) audio.sfx('death');
    if (p.combatActive && !combat?.active && foes.length === 0 && !allDown) audio.sting('victory');
    if (!p.allDown && allDown) audio.sting('defeat');
    if (p.levels && p.levels !== levels && levels.split(',').some((l, i) => +l > +(p.levels.split(',')[i] || 99))) audio.sting('levelup');
    prev.current = { sceneId: scene?.id, doorSig, dead, combatActive: !!combat?.active, allDown, levels };
  }, [scene?.id, doorSig, dead, combat?.active, foes.length, allDown, levels]); // eslint-disable-line react-hooks/exhaustive-deps
}
