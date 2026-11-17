// The scenes and prompts for learning the table: the group practice round
// (one small scene, a sparring fight, a chest) and the DM training ground's
// sandbox (a blank workshop and a tavern, two practice heroes). Creatures
// are SRD 5.1; the places and people are our own.
import { sceneFromBuiltin } from '../data/scenes';
import { PREGENS } from '../data/pregens';
import { deriveSheet } from '../rules/engine';

/* ---------------- the group practice round ---------------- */

const YARD = [
  '########################',
  '#kkkkkkkkkk#...........#',
  '#kkkkkkkkkk#..b.....[..#',
  '#kkRkkkkkkk#...........#',
  '#kkkkkkkkkkD...........#',
  '#kkkkkkkkkk#...........#',
  '#kkkkkkkkkk#..B......b.#',
  '#kkbkkkkkkk#...........#',
  '#kkkkkkkkkk#...........#',
  '########################',
];

export function practiceScene() {
  return {
    name: 'Practice yard',
    floor: 'stone',
    w: 24,
    h: 10,
    cells: YARD,
    entry: { x: 5, y: 6 },
    mood: { music: 'tavern' },
    notes: 'Practice round. Nothing here counts: sheets go back as they were when you end it.',
    tokens: [
      { kind: 'npc', label: 'Sergeant Wren', color: '#c98a4b', x: 6, y: 2, body: 'feminine', note: 'Runs the practice yard. Cheerful, loud, loves a good question.' },
    ],
    objects: [
      { kind: 'secret', name: 'Loose stone', x: 4, y: 7, dc: 1, hidden: true, trigger: 'search', effects: [{ type: 'text', text: 'Behind a loose stone: a wooden token stamped READY. Well spotted!' }] },
      { kind: 'chest', name: 'Practice chest', x: 18, y: 4, once: false, effects: [{ type: 'loot', text: 'Ten practice coins and a wooden sword. (Practice loot: it goes back in the chest afterwards.)' }] },
    ],
  };
}

// A tiny, fair first fight: a giant rat per hero, two to four.
export function practiceRats(heroes) {
  const n = Math.max(2, Math.min(4, heroes || 2));
  return Array.from({ length: n }, (_, i) => ({ label: `Giant Rat ${i + 1}`, monsterIndex: 'giant-rat', hp: 7, maxHp: 7, ac: 12, xpValue: 25, color: '#7a5a4a' }));
}

// What each player is asked to try, in order, and when it is relevant.
// `why` is the one line of reason; the readiness board uses `short`.
export const PROMPTS = [
  { key: 'move', stage: 'explore', short: 'Walk', say: 'Tap a square on the map to walk there.', sayFlat: 'Drag your hero to another square to walk there.', why: 'Outside a fight you can walk anywhere.' },
  { key: 'chat', stage: 'explore', short: 'Talk', say: 'Say hello to Sergeant Wren in chat.', why: 'Saying what your hero says is half the game.', target: [{ sel: '.chat-collapsed' }, { sel: '.chat-peek' }, { sel: '.board-tabbar button', text: 'Chat' }] },
  { key: 'check', stage: 'explore', short: 'Roll', say: 'Open your sheet and tap a skill to roll it.', sayPhone: 'Tap your portrait (top left) to open your sheet, then tap a skill to roll it.', why: 'Checks decide anything uncertain: d20 plus your bonus.', target: [{ sel: '.sheet-overlay .skill-row, .sheet-overlay .skills' }, { sel: '.hud-hero-btn', text: 'Sheet' }, { sel: '.hud-party-chip.me' }] },
  { key: 'door', stage: 'explore', short: 'Door', say: 'Walk up to the door and click it to open it.', sayFlat: 'Walk up to the door, then press Open it here.', why: 'Doors, chests and levers work when you stand beside them.' },
  { key: 'search', stage: 'explore', short: 'Search', say: 'Press Search to look for hidden things nearby.', sayPhone: 'Press Search here to look for hidden things nearby.', why: 'Search rolls Perception within three squares.', target: [{ sel: '.hud-hero-btn', text: 'Search' }] },
  { key: 'attack', stage: 'fight', short: 'Attack', say: 'On your turn, click a rat to attack it, then End turn.', sayFlat: 'On your turn, roll an attack from your sheet (Combat tab) or cast a spell at a rat, then End turn.', why: 'The % on each attack is your chance to hit.' },
  { key: 'ability', stage: 'fight', short: 'Power', say: 'Try a spell or class power, from the attack menu or your sheet.', why: 'Every class has something special. No power yet? Skip this one.' },
  { key: 'loot', stage: 'after', short: 'Loot', say: 'Open the chest in the back room: walk up and click it.', sayFlat: 'Walk up to the chest in the back room, then press Open it here.', why: 'Treasure goes on your sheet\'s Gear tab.' },
];

const ORDER = { explore: 0, fight: 1, after: 2 };
// Doors and chests are clicked in the 3D world; on the flat map (phones) the
// prompt itself has the button.
export function in3d() {
  try {
    const v = localStorage.getItem('dnd.view3d');
    return v === null ? window.innerWidth > 820 : JSON.parse(v) === true;
  } catch { return false; }
}

/** The one prompt to show this player now, or null. */
export function nextPrompt(stage, mine) {
  const open = PROMPTS.filter((p) => !mine[p.key]);
  if (!open.length) return null;
  if (stage === 'fight') return open.find((p) => p.stage === 'fight') || null;
  // Exploring: the explore prompts first, then the chest while you wait.
  return open.find((p) => ORDER[p.stage] <= ORDER[stage]) || (stage === 'explore' ? open.find((p) => p.stage === 'after') : null) || null;
}

export const DM_HINT = {
  explore: 'Let them explore. Ask for a roll from Table so everyone rolls once. Spring the fight when most have the basics.',
  fight: 'Monsters act on their own. Press Begin once everyone has rolled initiative.',
  after: 'Let them open the chest, then end the practice round.',
};

/* ---------------- the DM training ground ---------------- */

const withDerived = (sheet) => {
  const d = deriveSheet(sheet);
  return { ...sheet, derived: { ac: d.ac, initiative: d.initiative, saves: Object.fromEntries(Object.entries(d.saves || {}).map(([k, v]) => [k, typeof v === 'object' ? v.bonus : v])), perception: d.skills?.perception?.bonus, passivePerception: d.passivePerception } };
};

export function sandboxPayload() {
  const tavern = sceneFromBuiltin('taproom');
  const bots = ['brenna', 'piper'].map((id) => PREGENS.find((p) => p.id === id) || PREGENS[0]).map((p) => ({ sheet: withDerived(JSON.parse(JSON.stringify(p.sheet))) }));
  return {
    scenes: [
      { name: 'Your workshop', floor: 'stone', w: 24, h: 16, entry: { x: 4, y: 12 }, notes: 'An empty scene to paint on. Nothing here touches your real campaigns.' },
      {
        name: tavern.name, floor: tavern.floor, w: tavern.w, h: tavern.h, cells: tavern.cells, mood: { music: 'tavern' },
        tokens: [{ kind: 'npc', label: 'Old Tamsin', color: '#5f87a8', x: 6, y: 3, body: 'feminine', note: 'Keeps the bar. Knows every rumour on the road.' }],
      },
    ],
    bots,
  };
}

// When the fight chapter starts on an empty scene: three goblins to practise on.
export const PRACTICE_GOBLINS = [1, 2, 3].map((n) => ({ kind: 'monster', label: `Goblin ${n}`, letter: 'G', color: '#6a8a3d', monsterIndex: 'goblin', hp: 7, maxHp: 7, ac: 15, xpValue: 50 }));
