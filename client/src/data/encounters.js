import { ENCOUNTER_BUDGET } from '../rules/engine';

// Ready-made fights, balanced for the party in front of you.
//
// A theme is a pool of SRD 5.1 creatures (all open content, see
// server/data/Monsters.json) with a role each: `minion` fills the ranks,
// `elite` stiffens a group, `boss` leads it. buildEncounter() spends the
// party's XP budget (the per-character budget of the SRD 5.2 encounter rules,
// rules/engine.js, carried on here to level 20) on a leader first, then
// fills the ranks, so a level 1 party meets four goblins and a level 5 party
// meets a bugbear chief with hobgoblins.

// Levels 11-20 of the same per-character table (low / moderate / high).
const HIGH_BUDGET = {
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};
export const DIFFICULTIES = [
  { key: 'low', name: 'Easy', hint: 'A warm-up. Nobody should go down.' },
  { key: 'moderate', name: 'Fair', hint: 'A real fight that costs something.' },
  { key: 'high', name: 'Hard', hint: 'Dangerous. Someone may fall.' },
];

export function budgetFor(level, size, difficulty = 'moderate') {
  const lvl = Math.max(1, Math.min(20, Math.round(level) || 1));
  const i = { low: 0, moderate: 1, high: 2 }[difficulty] ?? 1;
  const per = lvl <= 10 ? ENCOUNTER_BUDGET[lvl][difficulty] ?? ENCOUNTER_BUDGET[lvl].moderate : HIGH_BUDGET[lvl][i];
  return per * Math.max(1, Math.min(8, size || 1));
}

const XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900 };
const m = (i, n, cr, role = 'minion') => ({ index: i, name: n, cr, xp: XP[cr], role });

export const ENCOUNTER_THEMES = [
  { key: 'goblins', name: 'Goblins', blurb: 'Raiders with wolves and a hobgoblin boss', pool: [
    m('goblin', 'Goblin', 0.25), m('wolf', 'Wolf', 0.25), m('hobgoblin', 'Hobgoblin', 0.5, 'elite'), m('worg', 'Worg', 0.5, 'elite'), m('bugbear', 'Bugbear', 1, 'boss'), m('ogre', 'Ogre', 2, 'boss'),
  ] },
  { key: 'bandits', name: 'Bandits', blurb: 'Highway robbers and their captain', pool: [
    m('bandit', 'Bandit', 0.125), m('mastiff', 'Mastiff', 0.125), m('thug', 'Thug', 0.5, 'elite'), m('scout', 'Scout', 0.5, 'elite'), m('bandit-captain', 'Bandit Captain', 2, 'boss'), m('veteran', 'Veteran', 3, 'boss'),
  ] },
  { key: 'undead', name: 'Restless dead', blurb: 'Skeletons, zombies and worse', pool: [
    m('skeleton', 'Skeleton', 0.25), m('zombie', 'Zombie', 0.25), m('shadow', 'Shadow', 0.5, 'elite'), m('ghoul', 'Ghoul', 1, 'elite'), m('ghast', 'Ghast', 2, 'boss'), m('wight', 'Wight', 3, 'boss'), m('wraith', 'Wraith', 5, 'boss'),
  ] },
  { key: 'wolves', name: 'Wolf pack', blurb: 'Hunting beasts of the deep woods', pool: [
    m('wolf', 'Wolf', 0.25), m('boar', 'Boar', 0.25), m('black-bear', 'Black Bear', 0.5, 'elite'), m('dire-wolf', 'Dire Wolf', 1, 'elite'), m('brown-bear', 'Brown Bear', 1, 'boss'), m('winter-wolf', 'Winter Wolf', 3, 'boss'), m('owlbear', 'Owlbear', 3, 'boss'),
  ] },
  { key: 'kobolds', name: 'Kobolds', blurb: 'Tunnel-dwellers in great numbers', pool: [
    m('kobold', 'Kobold', 0.125), m('giant-weasel', 'Giant Weasel', 0.125), m('giant-centipede', 'Giant Centipede', 0.25, 'elite'), m('green-dragon-wyrmling', 'Green Dragon Wyrmling', 2, 'boss'),
  ] },
  { key: 'vermin', name: 'Cellar vermin', blurb: 'Rats, bats and creeping things', pool: [
    m('giant-rat', 'Giant Rat', 0.125), m('stirge', 'Stirge', 0.125), m('swarm-of-rats', 'Swarm of Rats', 0.25, 'elite'), m('giant-centipede', 'Giant Centipede', 0.25, 'elite'), m('gray-ooze', 'Gray Ooze', 0.5, 'boss'), m('ochre-jelly', 'Ochre Jelly', 2, 'boss'),
  ] },
  { key: 'spiders', name: 'Spiders', blurb: 'Webs in the dark', pool: [
    m('giant-wolf-spider', 'Giant Wolf Spider', 0.25), m('swarm-of-spiders', 'Swarm of Spiders', 0.5, 'elite'), m('giant-spider', 'Giant Spider', 1, 'elite'), m('ettercap', 'Ettercap', 2, 'boss'), m('phase-spider', 'Phase Spider', 3, 'boss'),
  ] },
  { key: 'orcs', name: 'Orc warband', blurb: 'Hard-hitting raiders', pool: [
    m('orc', 'Orc', 0.5), m('worg', 'Worg', 0.5), m('berserker', 'Berserker', 2, 'elite'), m('ogre', 'Ogre', 2, 'boss'), m('troll', 'Troll', 5, 'boss'),
  ] },
  { key: 'gnolls', name: 'Gnolls', blurb: 'A hungry pack with hyenas', pool: [
    m('hyena', 'Hyena', 0), m('gnoll', 'Gnoll', 0.5), m('giant-hyena', 'Giant Hyena', 1, 'elite'), m('ogre', 'Ogre', 2, 'boss'),
  ] },
  { key: 'caves', name: 'Cave dwellers', blurb: 'Things of the deep places', pool: [
    m('giant-bat', 'Giant Bat', 0.25), m('grimlock', 'Grimlock', 0.25), m('darkmantle', 'Darkmantle', 0.5, 'elite'), m('duergar', 'Duergar', 1, 'elite'), m('gelatinous-cube', 'Gelatinous Cube', 2, 'boss'), m('basilisk', 'Basilisk', 3, 'boss'),
  ] },
  { key: 'swamp', name: 'Swamp', blurb: 'Lizardfolk and marsh beasts', pool: [
    m('giant-frog', 'Giant Frog', 0.25), m('lizardfolk', 'Lizardfolk', 0.5), m('crocodile', 'Crocodile', 0.5, 'elite'), m('swarm-of-insects', 'Swarm of Insects', 0.5, 'elite'), m('giant-toad', 'Giant Toad', 1, 'boss'), m('will-o-wisp', "Will-o'-Wisp", 2, 'boss'),
  ] },
  { key: 'guardians', name: 'Vault guardians', blurb: 'Animated things that never sleep', pool: [
    m('flying-sword', 'Flying Sword', 0.25), m('animated-armor', 'Animated Armor', 1, 'elite'), m('rug-of-smothering', 'Rug of Smothering', 2, 'elite'), m('gargoyle', 'Gargoyle', 2, 'boss'), m('mimic', 'Mimic', 2, 'boss'), m('earth-elemental', 'Earth Elemental', 5, 'boss'),
  ] },
  { key: 'fire', name: 'Fire and smoke', blurb: 'Mephits and hounds of the burning deep', pool: [
    m('magma-mephit', 'Magma Mephit', 0.5), m('magmin', 'Magmin', 0.5), m('hell-hound', 'Hell Hound', 3, 'elite'), m('fire-elemental', 'Fire Elemental', 5, 'boss'), m('salamander', 'Salamander', 5, 'boss'),
  ] },
  { key: 'guards', name: 'Town guard', blurb: 'Guards and their sergeant (a fight with the law)', pool: [
    m('guard', 'Guard', 0.125), m('mastiff', 'Mastiff', 0.125), m('scout', 'Scout', 0.5, 'elite'), m('spy', 'Spy', 1, 'elite'), m('veteran', 'Veteran', 3, 'boss'), m('knight', 'Knight', 3, 'boss'),
  ] },
];

export const themeByKey = (key) => ENCOUNTER_THEMES.find((t) => t.key === key) || ENCOUNTER_THEMES[0];

// A tiny seeded random, so "Reroll" is a new group and the same seed the same one.
export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * A group for this party: [{ index, name, count, xp, cr }] plus its total XP.
 * The leader takes up to half the budget, the rest is ranks sized to fill it;
 * never more than two creatures per hero (plus two), never more than twelve.
 */
export function buildEncounter(themeKey, { level = 1, size = 4, difficulty = 'moderate', seed = Date.now() } = {}) {
  const theme = themeByKey(themeKey);
  const r = seeded(seed);
  const budget = budgetFor(level, size, difficulty);
  const cap = Math.min(12, Math.max(2, size * 2 + 2));
  const picked = [];
  let left = budget;

  const bosses = theme.pool.filter((x) => x.role !== 'minion' && x.xp <= budget * 0.5);
  if (bosses.length && r() < 0.85) {
    // the strongest leader that fits, sometimes the one below it
    bosses.sort((a, b) => b.xp - a.xp);
    const lead = bosses[r() < 0.7 ? 0 : Math.min(1, bosses.length - 1)];
    picked.push(lead);
    left -= lead.xp;
  }
  // ranks: the kind whose XP best fits what is left per remaining place,
  // so a big budget buys tougher ranks rather than a crowd
  const ranks = theme.pool.filter((x) => x.role !== 'boss');
  const target = Math.max(2, Math.min(cap, size + Math.floor(r() * 3) - 1));
  while (picked.length < cap) {
    const fits = ranks.filter((x) => x.xp <= left);
    if (!fits.length || (picked.length >= target && left < budget * 0.2)) break;
    const want = left / Math.max(1, target - picked.length);
    const near = fits.sort((a, b) => Math.abs(Math.log(a.xp / want)) - Math.abs(Math.log(b.xp / want)));
    const next = near.length > 1 && r() < 0.3 ? near[1] : near[0];
    picked.push(next);
    left -= next.xp;
  }
  if (!picked.length) picked.push([...theme.pool].sort((a, b) => a.xp - b.xp)[0]);

  const groups = [];
  for (const x of picked) {
    const g = groups.find((y) => y.index === x.index);
    if (g) g.count++;
    else groups.push({ index: x.index, name: x.name, cr: x.cr, xp: x.xp, count: 1 });
  }
  groups.sort((a, b) => b.xp - a.xp);
  const total = groups.reduce((n, g) => n + g.xp * g.count, 0);
  return { theme: theme.key, groups, total, budget };
}

/** "3 Goblins and a Hobgoblin" */
export const plural = (name) => {
  if (/^Swarm of /.test(name)) return name.replace(/^Swarm/, 'Swarms');
  if (/(folk|Duergar)$/.test(name)) return name;
  if (/f$/.test(name)) return `${name.slice(0, -1)}ves`;
  if (/(s|x)$/.test(name)) return `${name}es`;
  return `${name}s`;
};
export function describeEncounter(groups) {
  const parts = groups.map((g) => (g.count === 1 ? `${/^[aeiou]/i.test(g.name) ? 'an' : 'a'} ${g.name}` : `${g.count} ${plural(g.name)}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'nobody';
}

/** The party's level and size from the sheets at the table (a lone DM gets a level 1 party of 4). */
export function partyOf(sheets) {
  const levels = (sheets || []).map((s) => s?.level || 1);
  if (!levels.length) return { level: 1, size: 4 };
  return { level: Math.round(levels.reduce((a, b) => a + b, 0) / levels.length), size: levels.length };
}
