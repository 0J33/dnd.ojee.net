// The DM training ground: four short chapters, one thing to do per step.
// A step is done when the server sees the DM do it (`keys`, ticked off in
// room.training.done by server/socket/training.js). `target` lists where to
// point, most specific first: the coach rings the first one on screen, so a
// path of clicks (open the panel, pick the tab, press the button) leads
// itself. Anything not worth a step is one line in `also`, or the handbook.

const QUICK = { sel: '.hud-pill', text: 'Quick' };
const TABLE = { sel: '.topbar-actions button', text: 'Table' };
const qtab = (text) => ({ sel: '.qdm-tabs button', text });

export const CHAPTERS = [
  {
    key: 'build',
    name: 'Build a scene',
    blurb: 'Paint a place, generate one, switch between them.',
    steps: [
      { key: 'paint', name: 'Paint walls', say: 'Open Build and paint a few walls by dragging on the map.', target: [{ sel: '.build-tiles' }, { sel: '.tool-btn', text: 'Build' }] },
      { key: 'generate', name: 'Generate a map', say: 'In the build panel, open map settings and generate a whole map.', target: [{ sel: '.build-resize' }, { sel: 'button[aria-label^="Map size"]' }, { sel: '.tool-btn', text: 'Build' }] },
      { key: 'undo', name: 'Undo', say: 'Not keen on it? Press Undo (Ctrl+Z) to bring the old map back.', target: [{ sel: 'button[aria-label="Undo"]' }] },
      { key: 'newScene', name: 'A scene from a template', say: 'Make a second scene from a template: Quick, then Scene.', target: [{ sel: '.qdm-grid.templates' }, qtab('Scene'), QUICK] },
      { key: 'switchScene', name: 'Switch scenes', say: 'Take the table there and back: Scenes, then pick one.', target: [{ sel: '.scene-strip-list' }, { sel: '.hud-pill', text: 'Scenes' }] },
    ],
    also: 'Fill, Room and Copy brushes, stamps, Duplicate scene, Save as prepared and Reset (Quick, Scene).',
  },
  {
    key: 'fill',
    name: 'Fill it',
    blurb: 'Monsters, people, loot, fog and a story beat.',
    steps: [
      { key: 'fight', name: 'A balanced fight', say: 'Drop a balanced fight: Quick, Fight, then Place them.', target: [{ sel: '.qdm-go' }, qtab('Fight'), QUICK] },
      { key: 'npc', name: 'Someone to talk to', say: 'Add someone to talk to: Quick, People, pick one.', target: [{ sel: '.qdm-grid.people' }, qtab('People'), QUICK] },
      { key: 'secret', name: 'Loot or a trap', say: 'Hide some loot or a trap: Quick, Loot & traps.', target: [{ sel: '.qdm-grid.things' }, qtab('Loot'), QUICK] },
      { key: 'fog', name: 'Fog of war', say: 'Pick the Fog tool and drag over the map to reveal or hide.', target: [{ sel: '.tool-btn', text: 'Fog' }] },
      { key: 'beat', name: 'A story beat', say: 'Plan a story beat: Prep, Story, add a beat.', target: [{ sel: '.prep-toolbar button', text: 'Add beat' }, { sel: '.prep-tabs button', text: 'Story' }, { sel: '.topbar-actions button', text: 'Prep' }] },
    ],
    also: 'Doors (paint a Wooden door; a lever in Secrets opens it), patrol routes (right-click a creature), a quick campaign (New campaign, A quick campaign), Clear a layer.',
  },
  {
    key: 'fight',
    name: 'Run a fight',
    blurb: 'Initiative, monster turns, HP, XP. The practice heroes fight back.',
    needsMonsters: true,
    steps: [
      { key: 'combat', name: 'Start combat', say: 'Press Combat to start a fight.', target: [{ sel: '.topbar-actions button', text: 'Combat' }] },
      { key: 'initiative', name: 'Roll initiative', say: 'Press Begin: anyone who has not rolled initiative rolls now.', target: [{ sel: '.initiative-bar button', text: 'Begin' }] },
      { key: 'monsterTurn', name: 'Monster turns', say: 'Let the monsters act: tick "Monsters act on their own", or right-click one and Run its turn.', target: [{ sel: '.init-auto' }] },
      { key: 'hp', name: 'HP and conditions', say: 'Hurt a monster or give it a condition: Creatures (or right-click it).', target: [{ sel: '.qdm-quick' }, { sel: '.qdm-creature-face' }, { sel: '.hud-pill', text: 'Creatures' }] },
      { key: 'endCombat', name: 'End combat', say: 'When it is over, press End combat.', target: [{ sel: '.initiative-bar button', text: 'End combat' }] },
      { key: 'xp', name: 'Award XP', say: 'Reward the party: More, Campaign settings, Award XP.', target: [{ sel: '.modal button', text: 'Award XP' }, { sel: '.hud-more-menu button', text: 'Campaign settings' }, { sel: '.hud-more > button' }] },
    ],
    also: 'Drop a fight mid-combat (it joins the order), Next turn by hand, Roll monsters, death saves on a hero sheet.',
  },
  {
    key: 'story',
    name: 'Tell the story',
    blurb: 'Narrate, ask for rolls, talk as NPCs, set the mood.',
    steps: [
      { key: 'narrate', name: 'Narrate', say: 'Open Table and narrate a line to everyone.', target: [{ sel: '.dm-panel textarea' }, TABLE] },
      { key: 'requestRoll', name: 'Ask for a roll', say: 'Ask the party for a roll from the same panel.', target: [{ sel: '.dm-panel button', text: 'Ask' }, TABLE] },
      { key: 'npcSay', name: 'Speak as an NPC', say: 'Right-click your NPC on the map and speak as them.', target: [] },
      { key: 'mood', name: 'Music and weather', say: 'Change the music or weather: Table, Mood.', target: [{ sel: '.dm-panel .dm-chips' }, { sel: '.dm-panel .tab-row button', text: 'Mood' }, TABLE] },
      { key: 'viewAs', name: 'View as a player', say: 'See what your players see: press Player view in the top bar. Press it again (DM view) to come back.', target: [{ sel: '.trn-viewas' }] },
    ],
    also: 'Handouts with a picture, Big title, whispers to one player, Look here (point every camera).',
  },
];

export const ALL_STEPS = CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c.key })));
export const ROUGH_MINUTES = 10;
