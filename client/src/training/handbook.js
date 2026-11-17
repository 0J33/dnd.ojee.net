// The DM handbook: one short card per tool or idea, searchable. `how` is the
// path of clicks; `body` is the why, in a sentence or two. Nothing here is
// game text: rules wording stays in the rules reference (SRD 5.1 / 5.2).

export const GROUPS = [
  { key: 'first', name: 'Your first session' },
  { key: 'build', name: 'Building' },
  { key: 'fill', name: 'Filling a scene' },
  { key: 'fight', name: 'Running a fight' },
  { key: 'table', name: 'Talking to the table' },
  { key: 'players', name: 'For players' },
];

export const CARDS = [
  // ---- your first session
  { g: 'first', t: 'Session zero', body: 'Before the story starts, agree on the tone, how often you play, and anything off the table. Make heroes together so the party fits.', how: 'Then run a practice round so everyone knows the buttons.' },
  { g: 'first', t: 'Run a practice round', body: 'Ten minutes on a practice scene: everyone walks, talks, opens a door, searches, fights a few rats and loots a chest. You see who has the basics; nothing they do sticks.', how: 'In a game: the top-right menu (More on a phone), DM handbook & practice round, Start a practice round.', tags: 'session zero ready onboarding' },
  { g: 'first', t: 'Practise alone first', body: 'The DM training ground is a sandbox with two practice heroes who fight back. Try every tool in about ten minutes; nothing touches your real campaigns.', how: 'Lobby: Learn to DM. Reset it any time from its checklist.', tags: 'sandbox training' },
  { g: 'first', t: 'Pacing a session', body: 'Aim for two to four scenes: a hook, a challenge or two, a reward. Cut a scene the moment it stops being fun and end on a question people want answered.', tags: 'length time' },
  { g: 'first', t: 'Balancing fights', body: 'Quick, Fight spends the party\'s XP budget (SRD 5.2 rules): Low is a warm-up, Moderate costs resources, High can drop a hero. Level 1 budgets are 50, 75 and 100 XP per hero.', how: 'Many weak monsters hit harder than one big one: count their attacks, not just their XP.', tags: 'xp budget difficulty encounter cr' },
  { g: 'first', t: 'Using a premade', body: 'Run it as DM from the quest board: its scenes, people and story beats land in Prep. Read the beats once before you play, then change any name or fight you like.', how: 'Quest board: Run it as DM. Prep, Story to see the beats.', tags: 'adventure module' },
  { g: 'first', t: 'A quick campaign', body: 'Four generated scenes, each with a story beat, a fight balanced for your party and a chest at the end. A whole evening in one click.', how: 'New campaign, A quick campaign (or Prep).', tags: 'generate' },
  { g: 'first', t: 'Share the spotlight', body: 'Give every player a moment each scene. Ask the quiet one what their hero does; let the bold one take a risk. Say "yes, and" to plans you didn\'t expect.', tags: 'players fun' },

  // ---- building
  { g: 'build', t: 'Painting the map', body: 'Pick a tile and drag on the map. Brush, Fill, Room (a box of walls with floor) and Copy change how a drag paints.', how: 'Build tool (B) on the left rail.', tags: 'walls floors tiles brush paint' },
  { g: 'build', t: 'Stamps and room templates', body: 'Stamps drop ready-made furniture and rooms in one click. Quick, Scene has whole rooms to place where you click.', how: 'Build, Stamp; or Quick, Scene, Add a room here.', tags: 'stamp furniture' },
  { g: 'build', t: 'Generated maps', body: 'Dungeons, caves and forests, different every time. It replaces the whole map, and Undo brings the old one back.', how: 'Build, map settings (the size button), Generate.', tags: 'dungeon cave forest random' },
  { g: 'build', t: 'Scenes', body: 'Each place is a scene. Switch and every hero walks along; the old scene keeps its creatures.', how: 'Scenes pill, top left. New ones from Quick, Scene or Prep.', tags: 'switch map location template' },
  { g: 'build', t: 'Doors and levers', body: 'Paint a Wooden door; players open it by clicking next to it. A lever from the Secrets tool can open linked doors.', how: 'Build, Doors group; Secrets (T), Lever, pick doors.', tags: 'door lock' },
  { g: 'build', t: 'Undo and redo', body: 'Every map, creature, fog and secret change on a scene can be undone. Heroes are never touched.', how: 'Ctrl+Z, Ctrl+Shift+Z, or the arrows under the tool rail.', tags: 'undo redo mistake' },
  { g: 'build', t: 'Prepared state and Reset', body: 'A scene remembers how it was when the party arrived (or when you press Save). Reset puts creatures, doors, fog and chests back; your building stays.', how: 'Quick, Scene: Save as prepared, Reset.', tags: 'save reset replay' },
  { g: 'build', t: 'Duplicate and clear', body: 'Copy a scene to make a variant, or clear one layer: the fallen, all creatures, NPCs, secrets, drawings.', how: 'Quick, Scene.', tags: 'copy clear layer' },

  // ---- filling
  { g: 'fill', t: 'A fight in one click', body: 'Pick a theme and difficulty; the group fits your party. Tick Hidden to reveal them later, or Start the fight to roll at once.', how: 'Quick, Fight. Right-click a square to put it there.', tags: 'monsters encounter' },
  { g: 'fill', t: 'Any monster', body: 'Search every SRD creature, read its stat block and drop it on the map.', how: 'Monsters (top bar).', tags: 'monster library stat block' },
  { g: 'fill', t: 'People', body: 'One click gives someone a name, a manner and, where it fits, SRD stats.', how: 'Quick, People. Right-click them to speak as them.', tags: 'npc' },
  { g: 'fill', t: 'Secrets and traps', body: 'Traps, hidden passages, chests, levers, notes, exits and events. Each has a trigger (walk on it, use it, search for it, or you) and effects.', how: 'Secrets tool (T), or Quick, Loot & traps.', tags: 'trap chest loot hidden passage note' },
  { g: 'fill', t: 'Fog of war', body: 'With fog on, players see only what their heroes have seen. Paint to reveal or hide by hand.', how: 'Fog tool (F); Quick, Scene for Hide all, Reveal all, Around the party.', tags: 'fog vision hidden' },
  { g: 'fill', t: 'Story beats', body: 'Your session as a list. Running a beat opens its scene, places its creatures and reads its narration.', how: 'Prep, Story. The caption under the map shows the next beat.', tags: 'plan outline beat' },
  { g: 'fill', t: 'Patrols', body: 'A creature walks a loop until it sees a hero. In games where monsters act on their own, that starts a fight.', how: 'Right-click a creature, Give it a patrol route.', tags: 'patrol guard' },

  // ---- running a fight
  { g: 'fight', t: 'Starting a fight', body: 'Combat asks everyone for initiative. Begin rolls for anyone who hasn\'t and starts round one.', how: 'Combat (top bar), then Begin.', tags: 'initiative combat start' },
  { g: 'fight', t: 'Monster turns', body: 'Tick "Monsters act on their own" and they walk up and attack on their turn. Or run one by hand: move it, then right-click, Run its turn.', how: 'The initiative bar; right-click a creature.', tags: 'auto monsters ai turn' },
  { g: 'fight', t: 'HP and conditions', body: 'Right-click a creature for one small board: damage, healing, conditions, hide.', how: 'Right-click, or the Creatures pill.', tags: 'hp damage condition poisoned prone' },
  { g: 'fight', t: 'A fight mid-fight', body: 'Drop more creatures while combat runs and they roll initiative and join the order.', how: 'Quick, Fight during combat.', tags: 'reinforcements' },
  { g: 'fight', t: 'Ending and rewards', body: 'End combat, then award XP or grant a level. The heroes\' sheets show a Level up button when they can.', how: 'End combat; More, Campaign settings, Award XP or Grant a level.', tags: 'xp level up reward milestone' },
  { g: 'fight', t: 'A hero goes down', body: 'At 0 HP a hero rolls death saves from their sheet. Any healing gets them back up.', tags: 'death saves dying unconscious' },

  // ---- talking to the table
  { g: 'table', t: 'Narrate', body: 'A line across everyone\'s screen and in chat. Big title for chapter breaks.', how: 'Table (crown), Talk.', tags: 'narration text' },
  { g: 'table', t: 'Whisper', body: 'Pick one player in To: only they see it. Good for secrets and what one hero notices.', how: 'Table, Talk, To.', tags: 'private secret' },
  { g: 'table', t: 'Handouts', body: 'A letter, a map, a picture: to everyone or one player.', how: 'Table, Talk, Add a picture, Send.', tags: 'image letter' },
  { g: 'table', t: 'Ask for a roll', body: 'Players get a button to roll exactly what you asked, with the DC if you set one.', how: 'Table, Talk, Ask for a roll.', tags: 'check skill dc request' },
  { g: 'table', t: 'Speak as an NPC', body: 'A speech bubble over their head and a line in chat.', how: 'Right-click the NPC, Speak as them.', tags: 'npc dialogue voice' },
  { g: 'table', t: 'Mood, music, weather', body: 'Time of day, weather, light and music for this scene. Music follows the action on Auto.', how: 'Table, Mood.', tags: 'music sound ambience weather' },
  { g: 'table', t: 'Look here', body: 'Point every player\'s camera at something.', how: 'Right-click a square, Look here.', tags: 'camera' },
  { g: 'table', t: 'See what players see', body: 'Player view (eye, top bar) shows the table as your players see it: fog as they see it, no hidden creatures, no prep or notes. Press it again to come back. In the training ground you also play a practice hero meanwhile.', how: 'Top bar: Player view', tags: 'player view preview' },

  // ---- players
  { g: 'players', t: 'Moving', body: 'Tap a square to walk there. In a fight the squares you can reach glow, and you move on your turn.', tags: 'walk move' },
  { g: 'players', t: 'Checks', body: 'Open your sheet and tap a skill; the bonus is added for you. When the DM asks for a roll, a button appears.', tags: 'skill roll sheet' },
  { g: 'players', t: 'Attacking', body: 'On your turn, click a foe and pick a weapon or spell. The percentage is your chance to hit. Then End turn.', tags: 'attack weapon' },
  { g: 'players', t: 'Spells and powers', body: 'Damaging spells are in the attack menu; healing and class powers (Second Wind, Rage) are on your sheet.', tags: 'spell ability feature' },
  { g: 'players', t: 'Search and loot', body: 'Search rolls Perception for hidden things within three squares. Click a chest beside you to open it.', tags: 'search perception chest' },
  { g: 'players', t: 'Rest and level up', body: 'Short and long rests are on your sheet. When you have the XP, a Level up button appears there.', tags: 'rest level' },
  { g: 'players', t: 'Learn by playing', body: 'The first quest on the home screen is an hour of guided play that teaches the rules, no DM needed.', tags: 'tutorial solo' },
];

export function searchCards(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CARDS;
  return CARDS.filter((c) => {
    const hay = `${c.t} ${c.body} ${c.how || ''} ${c.tags || ''}`.toLowerCase();
    // from the start of a word: "xp" finds XP, not "expect"
    return words.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay));
  });
}
