// One-line summary of a race's ability score increases, e.g. "+2 DEX, +1 WIS or CHA".
// Shared by the SRD normaliser (store.js) and the open-content importer.

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const NUM = { 1: 'one', 2: 'two', 3: 'three' };

function asiSummary(bonuses, choices) {
  const up = (a) => a.toUpperCase();
  const fixed = Object.entries(bonuses || {});
  const bits = fixed.length === 6 && fixed.every(([, b]) => b === fixed[0][1])
    ? [`+${fixed[0][1]} to every score`]
    : fixed.sort((x, y) => y[1] - x[1]).map(([a, b]) => `+${b} ${up(a)}`);
  for (const c of choices || []) {
    const pool = (c.from || ABILITIES).filter((a) => !(c.exclude || []).includes(a));
    const any = c.choose === 1 ? 'any score' : `any ${NUM[c.choose]} scores`;
    if (pool.length <= 3) bits.push(`+${c.bonus} ${pool.map(up).join(' or ')}`);
    else if (pool.length === 6) bits.push(`+${c.bonus} to ${any}`);
    else bits.push(`+${c.bonus} to ${any} but ${ABILITIES.filter((a) => !pool.includes(a)).map(up).join('/')}`);
  }
  return bits.join(', ');
}

module.exports = { ABILITIES, asiSummary };
