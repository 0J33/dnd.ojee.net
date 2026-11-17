// Plain-language explanations for a new player: what each number, skill,
// action and weapon property means at the table. Written for this app (not
// copied from any book); the SRD's own wording stays one "more" away.

export const ABILITY_DETAILS = {
  str: {
    brief: 'Raw muscle. Melee attacks, jumping, carrying, breaking things.',
    uses: 'Adds to attack and damage with most melee weapons, and to Athletics. A STR save resists being shoved, grabbed or crushed.',
  },
  dex: {
    brief: 'Agility and reflexes. Armor Class, initiative, bows, stealth.',
    uses: 'Adds to your AC in light armor, to initiative, to bows and finesse weapons, and to Acrobatics, Sleight of Hand and Stealth. A DEX save dodges fireballs and traps.',
  },
  con: {
    brief: 'Toughness. Hit points and resisting poison or exhaustion.',
    uses: 'Adds to your hit points every level. A CON save resists poison and disease, and keeps your concentration on a spell when you get hit.',
  },
  int: {
    brief: 'Reasoning and memory. Investigation, lore, wizard magic.',
    uses: 'Powers Arcana, History, Investigation, Nature and Religion, and is a wizard\'s spellcasting ability. An INT save resists mind-bending magic.',
  },
  wis: {
    brief: 'Awareness and willpower. Perception, insight, cleric magic.',
    uses: 'Powers Perception, Insight, Medicine, Survival and Animal Handling, and is the spellcasting ability of clerics, druids and rangers. A WIS save resists charms and fear.',
  },
  cha: {
    brief: 'Force of personality. Persuasion, deception, bard/sorcerer magic.',
    uses: 'Powers Persuasion, Deception, Intimidation and Performance, and is the spellcasting ability of bards, sorcerers, warlocks and paladins. A CHA save resists being banished or possessed.',
  },
};

// One line per skill: what you roll it for.
export const SKILL_BRIEFS = {
  acrobatics: 'Keep your balance, tumble past a foe, land a flip, wriggle free.',
  'animal-handling': 'Calm a frightened horse, read an animal\'s mood, keep a mount steady.',
  arcana: 'Recall what you know of spells, magic items, planes and arcane symbols.',
  athletics: 'Climb, swim, jump far, and grapple or shove a creature.',
  deception: 'Lie convincingly, bluff, wear a disguise, mislead someone.',
  history: 'Recall past events, old kingdoms, wars, legends and famous people.',
  insight: 'Tell whether someone is lying and guess what they really want.',
  intimidation: 'Get your way with threats, a scowl or a show of force.',
  investigation: 'Search for clues, work out how a trap works, piece facts together.',
  medicine: 'Stabilise a dying friend, diagnose an illness, tell how someone died.',
  nature: 'Recall facts about terrain, plants, animals and weather.',
  perception: 'Spot, hear or smell things: hidden foes, traps, secret doors.',
  performance: 'Entertain a crowd with music, dance, acting or a story.',
  persuasion: 'Convince someone honestly, with charm, tact and good reasons.',
  religion: 'Recall facts about gods, rites, holy orders and the undead.',
  'sleight-of-hand': 'Pick a pocket, palm an object, plant something unseen.',
  stealth: 'Sneak past guards, hide in shadows, move without a sound.',
  survival: 'Track creatures, find food and water, avoid getting lost in the wild.',
};

// The numbers at the top of the sheet.
export const VITALS = {
  hp: 'Hit points: how much harm you can take. At 0 you fall unconscious and start making death saves.',
  ac: 'Armor class: an enemy\'s attack roll must reach this number to hit you. Armor, a shield and Dexterity raise it.',
  initiative: 'Rolled when a fight starts (d20 + this). Highest goes first.',
  speed: 'How far you can move on your turn. Every square on the map is 5 feet.',
  pb: 'Proficiency bonus: added to every roll you are trained in (your skills, saves, weapons and spells). It grows as you level.',
  passive: 'Passive Perception: what you notice without trying. Hidden things with a lower DC are spotted automatically.',
  save: 'A saving throw is a d20 roll to resist something bad: a trap, a poison, a spell. Beat the DC and you avoid some or all of it. A filled dot means you are trained in that save.',
  skill: 'A skill check is a d20 roll to do something hard. The DM sets a target (DC): 10 is easy, 15 medium, 20 hard. A filled dot means you are trained; a ringed dot means expertise (double bonus).',
  hitDice: 'Hit dice heal you on a short rest: roll one, add your CON modifier, regain that many hit points.',
  slots: 'Each spell of level 1 or higher uses up a spell slot. Cantrips never do. A long rest refills your slots (a warlock\'s refill on a short rest).',
  saveDc: 'Spell save DC: when your spell forces a saving throw, the target must roll this or higher to resist it.',
  spellAttack: 'Spell attack: added to your d20 when a spell asks you to make a spell attack against a target\'s AC.',
  inspiration: 'Inspiration: the DM awards it for great roleplay. Spend it to roll with advantage once.',
};

// Things anyone can do on their turn (the action list).
export const ACTIONS = [
  { name: 'Attack', desc: 'Make one attack with a weapon or unarmed strike. Roll d20 + your attack bonus against the target\'s AC; meet or beat it and you roll damage.' },
  { name: 'Cast a Spell', desc: 'Cast a spell with a casting time of 1 action. Cantrips are free; spells of level 1 and up use a spell slot.' },
  { name: 'Dash', desc: 'Move again: you get extra movement equal to your speed this turn.' },
  { name: 'Disengage', desc: 'Leaving an enemy\'s reach won\'t give it a free swing at you (no opportunity attacks) for the rest of your turn. Use it to back away safely.' },
  { name: 'Dodge', desc: 'Until your next turn, attacks against you have disadvantage and you make DEX saves with advantage. Good when you are surrounded.' },
  { name: 'Help', desc: 'Give an ally advantage on their next ability check, or on their next attack against a foe within 5 feet of you.' },
  { name: 'Hide', desc: 'Roll Stealth while out of sight. Foes who don\'t beat it with Perception lose track of you, and your next attack on them has advantage.' },
  { name: 'Ready', desc: 'Pick an action and a trigger ("if it comes through the door, I swing"). When the trigger happens before your next turn, you act using your reaction.' },
  { name: 'Search', desc: 'Spend your turn looking for something: a Perception or Investigation check.' },
  { name: 'Use an Object', desc: 'Drink a potion, pull a lever, light a torch: anything that needs a second object interaction this turn.' },
];

export const TURN_PARTS = [
  { name: 'Move', desc: 'Up to your speed, before or after your action, and you can split it up.' },
  { name: 'Action', desc: 'One per turn: attack, cast a spell, or one of the actions below.' },
  { name: 'Bonus action', desc: 'Only if a feature or spell says so (Second Wind, Healing Word, a rogue\'s Cunning Action...). One per turn.' },
  { name: 'Reaction', desc: 'One per round, on someone else\'s turn: an opportunity attack when a foe walks out of your reach, or a spell like Shield.' },
  { name: 'Free interaction', desc: 'Draw a sword, open a door, pick something up: one a turn costs nothing.' },
];

// Weapon properties, in a line each.
export const WEAPON_PROPERTIES = {
  ammunition: 'Needs ammunition (arrows, bolts). After a fight you can recover half of what you fired.',
  finesse: 'Uses STR or DEX, whichever is higher, for its attack and damage rolls.',
  heavy: 'Big and unwieldy: Small creatures attack with it at disadvantage.',
  light: 'Small and easy to handle: hold one in each hand, and after attacking with one, attack with the other as a bonus action.',
  loading: 'Slow to reload: one shot per action, however many attacks you have.',
  reach: 'Long: hits foes 10 feet away instead of 5.',
  thrown: 'Can be thrown for a ranged attack, using the same ability as in melee.',
  'two-handed': 'Needs both hands to attack with.',
  versatile: 'Use it one-handed, or two-handed for a bigger damage die.',
  natural: 'Part of your body (claws, horns, a bite). Always proficient; uses STR.',
  special: 'Has its own rules: see the weapon\'s description.',
  monk: 'Counts as a monk weapon: monks can use DEX and their Martial Arts die with it.',
};
export const RANGE_NOTE = 'Two numbers are normal / long range in feet. Past the first, your attack has disadvantage; past the second, you can\'t hit at all.';

export const ARMOR_CATEGORIES = {
  light: 'Light armor: AC is the armor\'s number plus your full DEX modifier.',
  medium: 'Medium armor: AC is the armor\'s number plus your DEX modifier, up to +2.',
  heavy: 'Heavy armor: a fixed AC, no DEX added. Some need a high STR or slow you down.',
  shield: 'Shield: +2 AC while you hold it in one hand.',
};

// What a spell's casting time costs you.
export function castingTimeNote(ct) {
  const t = String(ct || '').toLowerCase();
  if (t.startsWith('1 action')) return 'uses your action';
  if (t.startsWith('1 bonus action')) return 'uses your bonus action, so you can still act';
  if (t.startsWith('1 reaction')) return 'a reaction: cast on someone else\'s turn when its trigger happens';
  if (/minute|hour/.test(t)) return 'takes a while: not for the middle of a fight';
  return '';
}

export const CONCENTRATION_NOTE = 'Concentration: the spell lasts only while you focus on it. It ends if you cast another concentration spell, fall unconscious, or fail a CON save when you take damage.';
export const RITUAL_NOTE = 'Ritual: you can cast it without a spell slot by taking 10 extra minutes.';
export const COMPONENT_NOTE = { V: 'spoken words', S: 'hand gestures', M: 'a material component (a focus or pouch covers it)' };
export const SAVE_SUCCESS = { half: 'half damage on a success', none: 'no effect on a success', other: 'see the spell for a success' };
