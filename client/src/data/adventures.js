// Ready-to-play adventures. Each one is written once, as narrated steps, and
// can be played two ways:
//   - without a DM: the app narrates the steps and runs the monsters
//     (guided mode, the same engine as the first quest), or
//   - with a DM: the steps become the DM's story beats – read-aloud text,
//     the encounter to place and notes – run with one click from Prep.
//
// Step fields (shared with the first quest): title, narration, rule (an
// optional tip box), instruction, choices [{ label, to }], final, combat, and
// effectsOnEnter: switchScene, spawn (tokens; minHeroes = only with that many
// heroes or more, so a lone hero isn't swarmed), startCombat, rollMonsters,
// endCombat, awardXp, announce, restoreHeroes.
//
// Monsters are SRD (open-licensed) only. Places reuse the built-in maps.
import { sceneFromBuiltin } from './scenes';
import { buildTutorialScenes, TUTORIAL_STEPS } from './tutorialScript';

const S = (key, id, { entry, tokens = [], fogEnabled = false, name } = {}) => {
  const b = sceneFromBuiltin(key);
  return { id, name: name || b.name, bg: { kind: 'builtin', floor: b.floor }, grid: { w: b.w, h: b.h }, cells: b.cells, fogEnabled, entry, tokens };
};

const M = (monsterIndex, label, x, y, stats, more = {}) => ({ kind: 'monster', label, letter: label[0], color: '#8a3d3d', x, y, monsterIndex, ...stats, ...more });
const WOLF = (n, x, y, more) => M('wolf', `Wolf ${n}`, x, y, { hp: 11, maxHp: 11, ac: 13, xpValue: 50, color: '#6a6a70' }, more);
const GOBLIN = (n, x, y, more) => M('goblin', `Goblin ${n}`, x, y, { hp: 7, maxHp: 7, ac: 15, xpValue: 50, color: '#6a8a3d' }, more);
const RAT = (n, x, y, more) => M('giant-rat', `Giant Rat ${n}`, x, y, { hp: 7, maxHp: 7, ac: 12, xpValue: 25, color: '#7a5a4a' }, more);
const SWORD = (n, x, y, more) => M('flying-sword', `Flying Sword ${n}`, x, y, { hp: 17, maxHp: 17, ac: 17, xpValue: 50, color: '#8e98a3' }, more);
const SKELETON = (n, x, y, more) => M('skeleton', `Skeleton ${n}`, x, y, { hp: 13, maxHp: 13, ac: 13, xpValue: 50, color: '#d8d0bc' }, more);
const NPC = (label, x, y, color = '#c98a4b', body) => ({ kind: 'npc', label, letter: label[0], color, x, y, body });

/* ===================== The Lantern Road ===================== */

const LANTERN_STEPS = [
  {
    title: 'Brindle at dusk',
    narration:
      `The village of BRINDLE lives by its lanterns: every night a cart rolls in from the hill-glassworks with fresh ones for the long road through the woods. Tonight the cart is three hours late, and the road lamps beyond the river have gone dark one by one.\n\nODDA the lamplighter waits by the well, wringing her soot-black hands. "Pell drives that cart. He's never late. Never. Something's out there putting the lights out."`,
    rule: {
      title: 'Playing without a DM',
      lines: ['The app narrates; anyone can press Continue when the table is ready.', 'Click a square to walk there. Click a foe to attack it – the app rolls everything.', 'Monsters take their own turns. Fights scale to the size of your party.'],
    },
    instruction: 'Talk to Odda in the chat if you like (what do you ask her?). Anyone may roll History (DC 10) to recall tales of the road. Then Continue.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'lr-village' }],
  },
  {
    title: 'The dark road',
    narration:
      `Odda presses a lit lantern into your hands. "Bring Pell home. And the lanterns, if you can – the road's no road without them."\n\nThe way north is quiet. Too quiet: no crickets, no owls. The first dark lamp-post leans over the road with its glass smashed out – not by a branch. By a club.`,
    instruction: 'Someone roll Survival or Perception (DC 12). Success: you spot small boot prints AND big paw prints leading toward the river. Then Continue.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'lr-field' }],
  },
  {
    title: 'Teeth at the crossing',
    narration:
      `The road narrows to a plank bridge over black water. On the far bank, eyes catch your lantern-light: lean grey WOLVES, collared with rope – somebody's hunting dogs. They lower their heads and growl.\n\nThe bridge is the only way across. It's also the only way across for them.`,
    rule: {
      title: 'Holding a bridge',
      lines: ['A narrow crossing means only one or two can reach you at a time.', 'Ranged heroes: shoot them as they cross. Sturdy heroes: hold the planks.', 'Wolves bite hard and try to knock you prone – stay near a friend.'],
    },
    instruction: 'Roll initiative (Begin! rolls for anyone who hasn\'t). Defeat the wolves, then Continue.',
    effectsOnEnter: [
      { type: 'switchScene', sceneId: 'lr-bridge' },
      { type: 'spawn', sceneId: 'lr-bridge', tokens: [WOLF(1, 12, 1), WOLF(2, 8, 2, { minHeroes: 2 }), WOLF(3, 15, 2, { minHeroes: 3 })] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    title: 'Rope collars',
    narration:
      `The last wolf slinks off yelping into the reeds. On the far bank lies a dropped prize: one of Pell's lanterns, its glass cracked, still warm. Beyond it, a trail of trampled bracken and the smell of woodsmoke and burnt stew.\n\nGoblins. And from the smell, a lot of them.`,
    instruction: 'Take a breath – the party rests a little and patches up (HP restored). Then Continue toward the smoke.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 100 }, { type: 'restoreHeroes' }],
  },
  {
    title: 'The goblin camp',
    narration:
      `A ring of sharpened stakes around a muddy clearing. Inside: patched tents, a cook-fire, and a heap of stolen lanterns glowing like a dragon's hoard. Pell sits tied to a post, gagged and furious.\n\nPacing in front of him: CAPTAIN VRASK, a hobgoblin in a dented breastplate, admiring a lantern like a crown. "Light," she purrs. "Everyone pays for light."`,
    choices: [
      { label: 'Slip in through the gate unseen (everyone Stealth, DC 12)', to: 5 },
      { label: 'Walk in bold: "We\'re here to BUY lanterns" (Deception, DC 13)', to: 5 },
      { label: 'Kick the gate down and charge!', to: 5 },
    ],
    instruction: 'Choose how you go in. Sneaking or bluffing well means you start right next to them – move up before the fight. Then the fight begins.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'lr-camp' }],
  },
  {
    title: 'Lights out, Vrask',
    narration:
      `"THIEVES!" Vrask roars, the irony entirely lost on her. Goblins scramble out of the tents, knives flashing in the lantern-glow.\n\nVrask fights cleverly – she hits harder when a goblin is beside you. Take the little ones down first, or go straight for the captain?`,
    rule: {
      title: 'Picking targets',
      lines: ['Hover a foe to see how hurt it looks; its HP bar shows in combat.', 'Goblins are quick but fragile (7 HP). The hobgoblin wears heavy armor (AC 18).', 'Spells that force a saving throw ignore armor entirely.'],
    },
    instruction: 'Roll initiative and win the camp. When Vrask falls, Continue.',
    effectsOnEnter: [
      { type: 'spawn', sceneId: 'lr-camp', tokens: [
        M('hobgoblin', 'Captain Vrask', 11, 2, { hp: 11, maxHp: 11, ac: 18, xpValue: 100, color: '#a8542a' }),
        GOBLIN(1, 6, 3), GOBLIN(2, 15, 3, { minHeroes: 2 }), GOBLIN(3, 13, 5, { minHeroes: 3 }),
      ] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    title: 'Pell, untied',
    narration:
      `Pell spits out the gag. "About TIME. They hit me at the river – wolves first, then the little ones. That captain wanted to sell Brindle its own lanterns back, one silver a night."\n\nThe camp's hoard holds every one of his lanterns, a purse of 40 GOLD the goblins had "collected" from other travellers, and Vrask's own blade: a well-kept LONGSWORD.`,
    instruction: 'Split the loot (Gear tab: add gold and items). Help Pell load the cart – then Continue home.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 300 }, { type: 'spawn', sceneId: 'lr-camp', tokens: [NPC('Pell', 16, 8, '#5f87a8', 'masculine')] }],
  },
  {
    title: 'The road, relit',
    narration:
      `You walk the cart home through the woods, stopping at every post to hang a fresh lantern. Behind you the road unrolls in little islands of gold.\n\nBrindle is waiting at the well – all of it. Odda doesn't say anything. She just hands each of you a lantern of your own, the glass etched with a tiny flame: the mark of the Lantern Road.`,
    instruction: 'You crossed 300 XP: heroes who started at level 1 can level up (▲ Level on your sheet). Press Finish to end the adventure – the table stays open.',
    final: true,
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'lr-village' }, { type: 'restoreHeroes' }, { type: 'announce', text: 'The Lantern Road is lit again. Brindle remembers its heroes.', logType: 'reward' }],
  },
];

/* ===================== Beneath Greywater ===================== */

const GREYWATER_STEPS = [
  {
    title: 'Knocking under the wells',
    narration:
      `GREYWATER is a river town built on top of an older one. Lately, at night, the wells KNOCK – three slow knocks, then silence.\n\nILSA VENN, the town archivist, went down the old drain under the market two days ago to find out why. She hasn't come back. Her apprentice found a note on her desk: "The old Varrow house had a cellar below the river. If I'm right, it's still there."`,
    rule: {
      title: 'Down in the dark',
      lines: ['Underground, walls block sight: rooms appear as you see into them.', 'Click a door next to you to open it.', 'Monsters take their own turns. Fights scale to the size of your party.'],
    },
    instruction: 'Climb down the drain. Someone roll Perception (DC 11) as you land – success: you hear something scurry away from the light. Then Continue.',
    effectsOnEnter: [{ type: 'switchScene', sceneId: 'gw-sewer' }],
  },
  {
    title: 'Teeth in the channels',
    narration:
      `The junction stinks of river-rot. Ilsa's chalk arrows mark the walls – she came this way – but the last one is half-gnawed away.\n\nThe water boils. GIANT RATS pour out of the channels, chittering, hungry, and very brave in the dark.`,
    instruction: 'Roll initiative (Begin! rolls for anyone who hasn\'t). Clear the junction, then Continue.',
    effectsOnEnter: [
      { type: 'spawn', sceneId: 'gw-sewer', tokens: [RAT(1, 14, 1), RAT(2, 15, 8), RAT(3, 17, 4, { minHeroes: 2 }), RAT(4, 12, 8, { minHeroes: 3 })] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    title: 'The ladder down',
    narration:
      `Past the junction, an iron ladder drops into masonry far older than the drains: tight passages, heavy doors, and dust no boot has disturbed in a century. Except one set of small footprints – Ilsa's – leading in.\n\nAt the end of the first hall, swords hang on a rack. As you step closer, the blades begin, very slowly, to turn and point at you.`,
    instruction: 'Anyone may roll Arcana (DC 12) – success: these blades are guardians, bound to defend the house; they stop when no intruder is in sight. Then Continue to face them.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 100 }, { type: 'switchScene', sceneId: 'gw-halls' }],
  },
  {
    title: 'The dancing blades',
    narration:
      `The swords tear free of their rack and come at you edge-first, humming like angry hornets.\n\nThey're armored and tireless, but they are only steel: a solid blow knocks them out of the air.`,
    rule: {
      title: 'Hard targets',
      lines: ['Flying swords have AC 17 – hard to hit. Look for advantage.', 'Spells that make the target roll a saving throw ignore armor entirely.', 'If you are hurt, step back and use a potion: one action, 2d4+2 HP.'],
    },
    instruction: 'Roll initiative and ground the blades. Then Continue.',
    effectsOnEnter: [
      { type: 'spawn', sceneId: 'gw-halls', tokens: [SWORD(1, 9, 6), SWORD(2, 11, 6, { minHeroes: 2 }), SWORD(3, 10, 2, { minHeroes: 3 })] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    title: 'Ilsa',
    narration:
      `Behind a barred door, a voice: "Is it you? Is it PEOPLE?" ILSA VENN, dusty and starving and absolutely delighted. "I knew it! The Varrow vault! And something in it does NOT want me reading its ledgers."\n\nShe points down the last stair. "Old Lord Varrow had himself buried with his account books. Someone's been digging there – grave-robbers, I think – and woke whatever he left guarding them. The knocking is them, trying to get out through the wells."`,
    instruction: 'Rest and talk with Ilsa (the party patches up: HP restored). Ask her anything in chat. Then Continue down to the vault.',
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 150 }, { type: 'restoreHeroes' }, { type: 'spawn', sceneId: 'gw-halls', tokens: [NPC('Ilsa Venn', 17, 2, '#7a5fa8', 'feminine')] }],
  },
  {
    title: 'The Varrow vault',
    narration:
      `Long rows of stone tombs, their lids pushed aside. Bones lie scattered where the grave-robbers dropped them – and then the bones begin to MOVE, clattering together into SKELETONS with rusted blades.\n\nAt the far end, the oldest tomb grinds open. LORD VARROW climbs out, swollen and grey, still wearing his ledger-keys on a chain around his neck.`,
    rule: {
      title: 'The undead',
      lines: ['Skeletons crack under bludgeoning blows (maces, hammers).', 'Lord Varrow is slow and easy to hit (AC 8) but very hard to put down.', 'Bring him to 0 HP and the house\'s binding breaks – the rest fall with him.'],
    },
    instruction: 'Roll initiative. Bring down Lord Varrow and his guards, then Continue.',
    effectsOnEnter: [
      { type: 'switchScene', sceneId: 'gw-vault' },
      { type: 'spawn', sceneId: 'gw-vault', tokens: [
        M('zombie', 'Lord Varrow', 10, 2, { hp: 30, maxHp: 30, ac: 8, xpValue: 100, color: '#6f7a5a' }),
        SKELETON(1, 6, 4), SKELETON(2, 15, 4, { minHeroes: 2 }), SKELETON(3, 10, 6, { minHeroes: 3 }),
      ] },
      { type: 'startCombat' },
      { type: 'rollMonsters' },
    ],
    combat: true,
  },
  {
    title: 'Quiet under Greywater',
    narration:
      `Lord Varrow sinks to his knees and the last skeleton falls to pieces mid-swing. In the silence you hear it: the river, and nothing else. The knocking has stopped.\n\nIlsa unhooks the ledger-keys from the old lord's neck with great ceremony. Inside the tomb: his ledgers, a purse of 60 GOLD, and a POTION OF HEALING for each of you. "The town will want a story," she says. "I'll write it. You'll be in it."`,
    instruction: 'Take the loot (Gear tab). Level up if you crossed an XP threshold (▲ Level on your sheet). Then Finish.',
    final: true,
    effectsOnEnter: [{ type: 'endCombat' }, { type: 'awardXp', amount: 300 }, { type: 'spawn', sceneId: 'gw-vault', tokens: [NPC('Ilsa Venn', 10, 8, '#7a5fa8', 'feminine')] }, { type: 'announce', text: 'The wells of Greywater fall silent. Ilsa Venn starts writing.', logType: 'reward' }],
  },
];

export const ADVENTURES = [
  {
    key: 'flagon',
    tutorial: true,
    name: 'The Cellar of the Gilded Flagon',
    tagline: 'Your first quest – learn D&D by playing it.',
    blurb: 'Nobody needs to know the rules. The app narrates, runs the monsters and teaches one thing per scene.',
    levels: 'Level 1',
    length: 'About an hour',
    buildScenes: buildTutorialScenes,
    steps: TUTORIAL_STEPS,
  },
  {
    key: 'lantern-road',
    name: 'The Lantern Road',
    tagline: 'Wolves at the bridge, goblins in the woods, and a village waiting in the dark.',
    blurb: 'A wilderness one-shot: a missing lantern cart, an ambush at a river crossing and a raid on a goblin camp.',
    levels: 'Levels 1-2',
    length: 'About an hour',
    buildScenes: () => [
      S('village', 'lr-village', { entry: { x: 12, y: 9 }, tokens: [NPC('Odda', 11, 6, '#c98a4b', 'feminine')] }),
      S('field', 'lr-field', { entry: { x: 11, y: 12 } }),
      S('bridge', 'lr-bridge', { entry: { x: 11, y: 10 } }),
      S('goblincamp', 'lr-camp', { entry: { x: 8, y: 9 } }),
    ],
    steps: LANTERN_STEPS,
  },
  {
    key: 'greywater',
    name: 'Beneath Greywater',
    tagline: 'Something is knocking under the wells. The archivist went to see what.',
    blurb: 'A dungeon one-shot: sewer rats, guardian blades in a forgotten cellar, and a lord who would not stay buried.',
    levels: 'Levels 1-3',
    length: 'About an hour',
    buildScenes: () => [
      S('sewer', 'gw-sewer', { entry: { x: 2, y: 4 } }),
      S('corridors', 'gw-halls', { entry: { x: 10, y: 11 }, name: 'The Varrow Cellars' }),
      S('crypt', 'gw-vault', { entry: { x: 10, y: 9 }, name: 'The Varrow Vault' }),
    ],
    steps: GREYWATER_STEPS,
  },
];

export const adventureByKey = (key) => ADVENTURES.find((a) => a.key === key) || ADVENTURES[0];

/** Spawned tokens for a party of `heroes` (drops those that need a bigger party). */
export const forParty = (tokens, heroes) => tokens.filter((t) => !t.minHeroes || heroes >= t.minHeroes).map(({ minHeroes, ...t }) => t);

/**
 * The same adventure as a DM's story outline: one beat per step, with the
 * read-aloud text, the encounter (counts for a full party – scale down for a
 * small one), and the step's instructions and choices as notes.
 */
export function adventureBeats(adv, sceneIdFor) {
  let sceneId = null;
  return adv.steps.map((st) => {
    const fx = st.effectsOnEnter || [];
    const sw = fx.find((f) => f.type === 'switchScene');
    if (sw) sceneId = sceneIdFor(sw.sceneId) || sceneId;
    const counts = new Map();
    for (const f of fx) if (f.type === 'spawn') for (const t of f.tokens) {
      if (t.kind !== 'monster' || !t.monsterIndex) continue;
      const k = t.monsterIndex;
      const name = t.label.replace(/\s+\d+$/, '');
      counts.set(k, { monsterIndex: k, name, count: (counts.get(k)?.count || 0) + 1 });
    }
    const scaled = fx.some((f) => f.type === 'spawn' && f.tokens.some((t) => t.minHeroes));
    const notes = [
      st.instruction,
      st.choices ? `Choices: ${st.choices.map((c) => c.label).join(' / ')}` : '',
      st.rule ? `${st.rule.title}: ${st.rule.lines.join(' ')}` : '',
      scaled ? 'Encounter is for a party of 3+. With 1 hero use one of each; with 2, drop the last one.' : '',
      fx.find((f) => f.type === 'awardXp') ? `Award ${fx.find((f) => f.type === 'awardXp').amount} XP.` : '',
    ].filter(Boolean).join('\n\n');
    return { title: st.title, sceneId, readAloud: st.narration, notes, encounter: [...counts.values()] };
  });
}
