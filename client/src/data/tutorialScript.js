// "The Cellar of the Gilded Flagon" - a guided first adventure that teaches
// D&D by playing it. Original adventure; monsters are SRD (giant rat, goblin).
// The app narrates; any player can advance. Effects run once, by the advancing client.
import { sceneFromBuiltin } from './scenes';

const S = (key, id, fogEnabled = false) => {
  const b = sceneFromBuiltin(key);
  return {
    id,
    name: b.name,
    bg: { kind: 'builtin', floor: b.floor },
    grid: { w: b.w, h: b.h },
    cells: b.cells,
    fogEnabled,
    tokens: [],
  };
};

export function buildTutorialScenes() {
  const taproom = S('taproom', 'tut-taproom');
  taproom.tokens.push({ id: 'tut-marla', kind: 'npc', label: 'Marla', letter: 'M', color: '#c98a4b', x: 3, y: 2 });
  const cellar = S('cellar', 'tut-cellar');
  const warren = S('warren', 'tut-warren');
  const vault = S('vault', 'tut-vault');
  return [taproom, cellar, warren, vault];
}

const RAT = (n, x, y) => ({ kind: 'monster', label: `Giant Rat ${n}`, letter: 'R', color: '#7a5a4a', x, y, monsterIndex: 'giant-rat', hp: 7, maxHp: 7, ac: 12, xpValue: 25 });
const GOBLIN = (n, x, y) => ({ kind: 'monster', label: `Goblin ${n}`, letter: 'G', color: '#6a8a3d', x, y, monsterIndex: 'goblin', hp: 7, maxHp: 7, ac: 15, xpValue: 50 });
const SKARN = { kind: 'monster', label: 'Skarn the Bugbear', letter: 'S', color: '#8a3d3d', x: 8, y: 2, monsterIndex: 'bugbear', hp: 27, maxHp: 27, ac: 16, xpValue: 200, size: 1 };

export const TUTORIAL_STEPS = [
  {
    // 0
    title: 'Welcome, adventurers',
    narration:
      `Welcome to DUNGEONS & DRAGONS - a game of shared storytelling. One rule above all: the story describes a situation, you say what your hero does, and the dice decide how it goes.\n\nNormally a human Dungeon Master narrates. Tonight, I'll be your narrator - a short quest to teach you everything: rolling dice, talking, sneaking, fighting, and (hopefully) not dying.`,
    rule: {
      title: 'The golden loop',
      lines: ['1. The narrator describes the scene.', '2. YOU say what your hero does - anything you can imagine.', '3. If the outcome is uncertain, dice decide.', 'That\'s the whole game. Everything else is detail.'],
    },
    instruction: 'When the whole party is here and everyone has a hero, press Continue.',
  },
  {
    // 1
    title: 'The Gilded Flagon',
    narration:
      `Rain drums on the windows of THE GILDED FLAGON, the last inn before the deep woods. A fire crackles. Your party shares a table - and a problem: your coin purses are nearly empty.\n\nBehind the bar stands MARLA, the innkeeper. She keeps glancing at the cellar door and wringing her towel.`,
    rule: {
      title: 'The map & your token',
      lines: ['The colored disc with your initial is YOU.', 'Drag it to move. One square = 5 feet.', 'Scroll to zoom, drag empty space to pan.', 'Double-click anywhere to ping a spot for your friends.'],
    },
    instruction: 'Everyone: drag your token over to the bar (near Marla). Then Continue.',
  },
  {
    // 2
    title: 'Something in the cellar',
    narration:
      `Marla leans in close. "Three nights of scratching under the floor. My cellar-keeper TOBIN went down yesterday to check the ale casks... and he hasn't come back. I've kept the door locked since."\n\nShe slides an iron key across the bar. "Clear out whatever's down there and bring Tobin back. Fifty gold. Please."`,
    rule: {
      title: 'Ability checks',
      lines: ['When you try something uncertain, roll a d20 and add an ability modifier.', 'The narrator sets a Difficulty Class (DC). Roll that number or higher = success.', 'Your six abilities power everything: STR, DEX, CON, INT, WIS, CHA.', 'Open your SHEET and CLICK any skill to roll it - the app adds your bonus automatically.'],
    },
    choices: [
      { label: 'Read Marla\'s mood - is she hiding something? (everyone roll Insight, DC 10)', to: 3 },
      { label: 'Reassure her you\'ll handle it (everyone roll Persuasion, DC 10)', to: 3 },
    ],
    instruction: 'Pick one approach, then EVERYONE: open your Sheet and click that skill to roll. 10 or higher succeeds. Compare results in the chat, then Continue!',
  },
  {
    // 3
    title: 'The key turns',
    narration:
      `Those who read her see it plain: fear, not deceit - and something else. Guilt. "I should have gone down myself," she admits. Those who reassured her earn a weary smile.\n\nEither way, she presses a small basket into your hands: a HEALING POTION for each of you. "Tobin's a good lad. Please hurry."\n\n(Each of you now carries a Potion of Healing - check the Gear tab of your sheet. Drinking one is an action and heals 2d4+2.)`,
    rule: {
      title: 'Advantage & disadvantage',
      lines: ['Situations can tilt the odds: roll TWO d20s instead of one.', 'Advantage: keep the HIGHER die. Disadvantage: keep the LOWER.', 'They never stack, and one of each cancels out.', 'Try it: the ADV / DIS buttons in the dice tray below.'],
    },
    instruction: 'Try one roll with ADV on in the dice tray (click the d20). Then Continue - down the stairs we go.',
    effectsOnEnter: [{ type: 'announce', text: 'Everyone receives a Potion of Healing (2d4+2, action to drink). Add it to your gear if it\'s not there: Gear tab, Add item.', logType: 'reward' }],
  },
  {
    // 4
    title: 'Down the cellar stairs',
    narration:
      `The key turns with a clunk. Stone steps spiral down into darkness that smells of ale, dust... and something musky. From below: skrit-skrit-skritch.\n\nWhatever is scratching hasn't heard you yet. If you move quietly, you might catch it off guard.`,
    rule: {
      title: 'Sneaking (and group efforts)',
      lines: ['Stealth is a DEX skill: click it on your sheet to roll.', 'DC 10 here. In a group, if HALF of you or more succeed, the group sneaks.', 'Heavy armor is loud: fighters and clerics roll Stealth with DISADVANTAGE (use the DIS button!).'],
    },
    instruction: 'Everyone roll Stealth (DC 10) - heavy-armor heroes with DIS. Count successes in chat, then Continue.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'tut-cellar' }],
  },
  {
    // 5
    title: 'Rats. Why did it have to be rats.',
    narration:
      `The cellar is a mess of toppled casks and gnawed grain sacks. Two RATS THE SIZE OF DOGS look up from a torn sack, whiskers twitching, teeth like chisels.\n\nIf your group snuck well, you spotted them first - if not, they're already skittering toward you. Either way: ROLL INITIATIVE!`,
    rule: {
      title: 'Combat: initiative & turns',
      lines: ['Combat runs in TURNS, in initiative order (one d20 + DEX each, rolled once).', 'A round = everyone acts once (about 6 seconds of story time).', 'Press "Roll" on the initiative bar when it appears at the top!', 'The rats roll too - the app handles them.'],
    },
    instruction: 'Press Continue to start combat. Then everyone hit "Roll" in the initiative bar. When all heroes AND rats are in, anyone press "Begin!"',
    effectsOnEnter: [
      { type: 'spawn', sceneId: 'tut-cellar', tokens: [RAT(1, 5, 2), RAT(2, 12, 3)] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
  },
  {
    // 6
    title: 'Fight!',
    narration:
      `Steel out, spells ready! On your turn you can MOVE (drag your token, up to your speed) and take ONE ACTION - usually an attack.\n\nWhen a rat's turn comes up, anyone press the sword button next to it in the Creatures panel (left side) - the app will run it.`,
    rule: {
      title: 'Attacking',
      lines: ['Get adjacent (melee) or in range (bows/spells), then click the ATTACK on your sheet.', 'd20 + your bonus vs their ARMOR CLASS (rats: AC 12). Equal or higher = HIT!', 'On a hit, click the damage dice next to the attack.', 'Then RIGHT-CLICK the rat and choose "Damage..." and type what you dealt.', 'A natural 20 is a CRITICAL HIT: roll the damage dice twice!'],
    },
    instruction: 'Fight! Take turns with "Next turn" after each hero acts. When both rats are dead, Continue.',
    combat: true,
  },
  {
    // 7
    title: 'Squeak no more',
    narration:
      `The last rat collapses in a heap of matted fur. Silence - except your own heartbeats and the drip of spilled ale.\n\nTake a breath. If anyone is hurt, now's a good time for that potion (action: drink, roll 2d4+2, heal that much on your sheet). Casters: a healing spell works too.`,
    rule: {
      title: 'Hit points & healing',
      lines: ['Damage reduces HP; at 0 you fall UNCONSCIOUS and start making death saves.', 'ANY healing brings you back up - even 1 HP.', 'Heal with: potions (2d4+2), spells like Cure Wounds, or resting.', 'Use the Heal box on your sheet to add the HP back.'],
    },
    instruction: 'Patch up if needed (roll 2d4+2 in the dice tray, then Heal on your sheet). Continue when ready.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 25 }],
  },
  {
    // 8
    title: 'The broken wall',
    narration:
      `Behind the shredded grain sacks, the cellar's south wall has been CHEWED AND CLAWED OPEN - a rough tunnel breathing cold, earthy air. Rats didn't dig this alone. Small boot prints track through the dirt. Goblin prints.\n\nSomething glints in the rubble near the tunnel mouth.`,
    rule: {
      title: 'Exploration',
      lines: ['Not everything is labeled - poke at the world and ask questions!', 'Investigation (INT): searching, deducing, "what happened here?"', 'Perception (WIS): noticing things - sounds, glints, movement.', 'One hero can roll while others watch their back.'],
    },
    instruction: 'Someone roll Investigation (DC 12) to search the rubble. Made it? You found the cache - Continue. (Failed? Someone else can try!)',
  },
  {
    // 9
    title: 'Click.',
    narration:
      `Under a loose stone: a dusty strongbox! And beneath the strongbox: a taut copper wire.\n\nCLICK. A tiny dart hisses from the wall!`,
    rule: {
      title: 'Saving throws',
      lines: ['When danger happens TO you, you roll to resist: that\'s a saving throw.', 'The dart: everyone near makes a DEXTERITY SAVE, DC 12.', 'Click DEX in the "Saving throws" list on your sheet.', 'Fail = take 1d4 poison damage (roll it, then Dmg it on your sheet). Ouch, but you\'ll live.'],
    },
    instruction: 'Everyone: roll a DEX save (DC 12). Failures roll 1d4 and take that damage. Then Continue for the loot.',
  },
  {
    // 10
    title: 'The cellar cache',
    narration:
      `Inside the strongbox: 15 GOLD PIECES for each of you and one spare HEALING POTION - Tobin's secret rainy-day stash, by the look of the "T" scratched on the lid. You'll return it to him. Probably.\n\nThe tunnel ahead slopes down. You can hear faint, nasal voices arguing in Goblin.`,
    rule: {
      title: 'Loot & gear',
      lines: ['Treasure goes on your sheet: Gear tab, coins boxes and Add item.', 'Gold buys equipment, rooms, information, and bribes between adventures.', 'Add your 15 gp now!'],
    },
    instruction: 'Everyone add 15 gp on the Gear tab. Decide who carries the spare potion. Continue to enter the tunnel.',
  },
  {
    // 11
    title: 'The rat warren',
    narration:
      `The tunnel opens into a dug-out warren beneath the woods, lit by a guttering torch. TWO GOBLINS bicker over a stolen ale cask - snaggle-toothed, knife-eared, entirely unaware of you.\n\nBy the far wall, a figure lies tied up in a heap: TOBIN! He's breathing.`,
    choices: [
      { label: 'Sneak up and strike first! (everyone Stealth, DC 10)', to: 12 },
      { label: 'Kick the cask and CHARGE! (skip straight to the fight)', to: 12 },
    ],
    instruction: 'Choose your approach! Sneakers: roll Stealth DC 10 - if half of you make it, you\'ll have surprise (advantage-worthy positioning). Then Continue.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'tut-warren' }],
  },
  {
    // 12
    title: 'Goblin brawl!',
    narration:
      `"WHO DRINK MY-" the goblin doesn't finish the sentence. Initiative!\n\nIf you snuck in successfully, position your tokens right next to them before combat starts - first blood is basically yours.`,
    rule: {
      title: 'Teamwork: the Help action',
      lines: ['Instead of attacking, you can HELP: distract the enemy so an ally\'s next attack has ADVANTAGE.', 'Goblins are AC 15 - tougher than rats. Helping a big hitter beats whiffing twice!', 'Casters: Bless, Faerie Fire or a well-placed Sleep can swing a whole fight.'],
    },
    instruction: 'Continue to roll initiative (same as before: everyone Roll, then Begin). Take the goblins down, then Continue.',
    effectsOnEnter: [
      { type: 'spawn', sceneId: 'tut-warren', tokens: [GOBLIN(1, 7, 4), GOBLIN(2, 11, 5)] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    // 13
    title: 'Tobin, found',
    narration:
      `You cut Tobin's ropes. He's bruised and furious: "Goblins! In MY cellar! They tunneled into the warren a week ago. Their boss SKARN is through that far passage, in the old vault - he's got a chest of stolen goods and a temper like a wet cat. He said he'd 'deal with the inn' tonight!"\n\nTobin grabs a plank to defend himself, but this fight is yours. "Skarn's a bugbear - big, mean, twice your size. End it, please. And... did you find my strongbox?"`,
    rule: {
      title: 'Roleplay!',
      lines: ['This is the third pillar of D&D: just TALK, in character.', 'What do you tell Tobin about his (now lighter) strongbox?', 'Say it in the chat - being your character is the best part of the game.'],
    },
    instruction: 'Talk it out in chat (fess up, deflect, or charm him). Rest up (potions/spells) - then Continue to face Skarn.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 50 }, { type: 'spawn', sceneId: 'tut-warren', tokens: [{ kind: 'npc', label: 'Tobin', letter: 'T', color: '#5f87a8', x: 16, y: 8 }] }],
  },
  {
    // 14
    title: 'The old vault',
    narration:
      `The passage ends at an ancient stone vault - some forgotten smuggler's cache. Crates and a heavy chest fill the center. Atop the chest, sharpening a wicked morningstar, looms SKARN THE MAGNIFICENT (his words, probably): a hulking bugbear in scrap-plate armor, the goblins' warlord.\n\n"Ohhh. The tall folk. Skarn was JUST coming to burn your inn." He grins with every tooth. "Kill them!" A last goblin minion scrambles from behind the crates.`,
    rule: {
      title: 'Boss fights',
      lines: ['Skarn is AC 16 with 27 HP - your hardest fight. Use EVERYTHING:', 'Advantage where you can get it, the Help action, potions, your best spells.', 'Bosses can redirect attacks and hit HARD. Spread out. Don\'t panic if someone drops - healing wakes them!', 'If someone hits 0 HP: death saves on their sheet, and someone else can heal or stabilize them.'],
    },
    instruction: 'Continue to roll initiative. This is the real thing - good luck, heroes!',
    effectsOnEnter: [
      { type: 'switchScene', sceneId: 'tut-vault' },
      { type: 'spawn', sceneId: 'tut-vault', tokens: [SKARN, GOBLIN(3, 5, 3)] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    // 15
    title: 'THE MAGNIFICENT, DEFEATED',
    narration:
      `Skarn drops his scimitar, looks at it, looks at you, and falls over dramatically.\n\nSilence. Then - from the chest - the gleam of stolen goods: 50 GOLD each, and an old dagger with an ember-red edge: EMBERFANG (a fine dagger; +1 to hit and damage - give it to someone sneaky).\n\nYou did it. Your first dungeon, cleared.`,
    rule: {
      title: 'LEVEL UP!',
      lines: ['Experience points (XP) from monsters and quests add up - you just crossed 300 XP: LEVEL 2!', 'Open your sheet and press the ▲ Level button (top right).', 'Take the average HP (recommended), read your new feature, done.', 'Most groups level at story milestones - the app supports both.'],
    },
    instruction: 'Everyone: add your loot (Gear tab), then press ▲ Level on your sheet and level up to 2! Then Continue for the finale.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 225 }],
  },
  {
    // 16
    title: 'Heroes of the Gilded Flagon',
    narration:
      `Back upstairs, Marla nearly crushes Tobin in a hug, then lines the bar with drinks on the house. Fifty gold, as promised - and your first legend: the night the Flagon's cellar went quiet again.\n\nYOU NOW KNOW HOW TO PLAY D&D: checks, saves, advantage, initiative, attacking, healing, dying (avoided!), loot, and leveling. That's the whole engine - everything else is imagination.\n\nWhere next? Create your own campaign (one of you as DM - read "Being the DM" in the Guide), keep playing these heroes, or build new ones from scratch. The dice are yours now.`,
    instruction: 'Press Finish to end the guided adventure. This table stays open - explore, spar, or start your own story right here.',
    final: true,
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'tut-taproom' }, { type: 'announce', text: 'The party completes THE CELLAR OF THE GILDED FLAGON! Drinks on Marla.', logType: 'reward' }],
  },
];
