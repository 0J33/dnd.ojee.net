// Class features and healing spells the board can play (Rage, Second Wind,
// Lay on Hands, Bardic Inspiration, Cure Wounds, Healing Word, Heal). The
// server resolves them (server/rules/attacks.js heroFeature / healingSpell);
// this side only builds the menu rows with what's left and what each does.
// Keep the numbers in step with the server's.

const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
const lv = (sheet) => Math.max(1, Math.min(20, Number(sheet?.level) || 1));

const rageCount = (l) => (l >= 20 ? Infinity : l >= 17 ? 6 : l >= 12 ? 5 : l >= 6 ? 4 : l >= 3 ? 3 : 2);
export const rageBonus = (l) => (l >= 16 ? 4 : l >= 9 ? 3 : 2);
const bardDie = (l) => (l >= 15 ? 12 : l >= 10 ? 10 : l >= 5 ? 8 : 6);

export const FEATURES = {
  rage: {
    name: 'Rage', cls: 'barbarian', bonusAction: true, self: true,
    uses: (sh) => rageCount(lv(sh)), rest: () => 'long',
    detail: (sh) => `bonus action · +${rageBonus(lv(sh))} melee damage, half damage from blows`,
    info: (sh) => [
      `For the rest of the fight: +${rageBonus(lv(sh))} damage with melee weapon attacks that use Strength, and you take half damage from bludgeoning, piercing and slashing.`,
      'A bonus action, so you can still attack this turn. It ends when the fight does.',
    ],
  },
  'second-wind': {
    name: 'Second Wind', cls: 'fighter', bonusAction: true, self: true,
    uses: () => 1, rest: () => 'short',
    detail: (sh) => `bonus action · heal 1d10+${lv(sh)}`,
    info: (sh) => [`Catch your breath: regain 1d10 + ${lv(sh)} hit points.`, 'A bonus action; once per short or long rest.'],
  },
  'lay-on-hands': {
    name: 'Lay on Hands', cls: 'paladin', bonusAction: false, rangeFt: 5, friendly: true, pool: true,
    uses: (sh) => 5 * lv(sh), rest: () => 'long',
    detail: (sh, left) => `action · touch · heals from a pool of ${left} HP`,
    info: (sh) => [`Touch a creature (or yourself) and heal what it's missing, from a pool of ${5 * lv(sh)} hit points a long rest.`, 'Uses your action. Out of reach, your hero walks up first.'],
  },
  'bardic-inspiration': {
    name: 'Bardic Inspiration', cls: 'bard', bonusAction: true, rangeFt: 60, friendly: true, notSelf: true, heroOnly: true,
    uses: (sh) => Math.max(1, mod(sh?.abilities?.cha)), rest: (sh) => (lv(sh) >= 5 ? 'short' : 'long'),
    detail: (sh) => `bonus action · gives a d${bardDie(lv(sh))}`,
    info: (sh) => [`Give a friend a d${bardDie(lv(sh))}. The app adds it to their next attack that would otherwise miss.`, 'A bonus action, range 60 ft. Uses = your Charisma modifier (at least 1).'],
  },
};

export const HEAL_SPELLS = new Set(['cure-wounds', 'healing-word', 'heal']);

/** Uses left of a feature (HP in Lay on Hands' pool). */
export function featureLeft(sheet, key) {
  const f = FEATURES[key];
  const max = f.uses(sheet);
  return { max, left: max === Infinity ? Infinity : Math.max(0, max - (Number(sheet?.uses?.[key]) || 0)) };
}

/** The features this hero has, with what's left: [{ key, ...feature, left, max }]. */
export function heroFeatures(sheet) {
  return Object.entries(FEATURES)
    .filter(([, f]) => f.cls === sheet?.classIndex)
    .map(([key, f]) => ({ key, ...f, ...featureLeft(sheet, key) }));
}

/** What a rest gives back: the `uses` a sheet keeps after one. */
export function usesAfterRest(sheet, kind) {
  if (kind === 'long') return {};
  const out = { ...(sheet?.uses || {}) };
  for (const [key, f] of Object.entries(FEATURES)) if (f.rest(sheet) === 'short') delete out[key];
  return out;
}
