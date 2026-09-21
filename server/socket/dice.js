const crypto = require('crypto');

// Server-authoritative dice. Supports "2d6+3", "1d20+5", "4d6kh3" (keep highest),
// "2d20kl1" (keep lowest), multi-term "1d8+2d6+4", and an adv/dis mode that
// upgrades the first d20 term to 2d20 keep-highest/lowest.
const rollDie = (sides) => crypto.randomInt(1, sides + 1);

const MAX_DICE = 100;
const MAX_SIDES = 1000;

function parseFormula(formula) {
  const cleaned = (formula || '').toString().replace(/\s+/g, '').toLowerCase();
  if (!cleaned || cleaned.length > 100) return null;
  // tokens: NdX(khY|klY)? or integer, separated by + or -
  const tokenRe = /^([+-]?)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/;
  let rest = cleaned;
  const terms = [];
  let guard = 0;
  while (rest.length && guard++ < 30) {
    const m = rest.match(tokenRe);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ kind: 'mod', value: sign * parseInt(m[6], 10) });
    } else {
      const n = Math.min(parseInt(m[2] || '1', 10), MAX_DICE);
      const sides = parseInt(m[3], 10);
      if (!sides || sides > MAX_SIDES || n < 1) return null;
      const keep = m[4] ? { mode: m[4], count: Math.min(parseInt(m[5], 10), n) } : null;
      terms.push({ kind: 'dice', sign, n, sides, keep });
    }
    rest = rest.slice(m[0].length);
  }
  if (!terms.some((t) => t.kind === 'dice')) return null;
  return terms;
}

function executeRoll(formula, mode = 'normal') {
  const terms = parseFormula(formula);
  if (!terms) return null;

  // adv/dis: first 1d20 term becomes 2d20 keep best/worst
  if (mode === 'adv' || mode === 'dis') {
    const d20 = terms.find((t) => t.kind === 'dice' && t.sides === 20 && t.n === 1 && !t.keep);
    if (d20) {
      d20.n = 2;
      d20.keep = { mode: mode === 'adv' ? 'kh' : 'kl', count: 1 };
    }
  }

  const parts = [];
  let total = 0;
  let modifier = 0;
  for (const t of terms) {
    if (t.kind === 'mod') {
      modifier += t.value;
      total += t.value;
      continue;
    }
    const rolls = Array.from({ length: t.n }, () => rollDie(t.sides));
    let keptIdx = rolls.map((_, i) => i);
    if (t.keep) {
      const sorted = rolls.map((v, i) => ({ v, i })).sort((a, b) => (t.keep.mode === 'kh' ? b.v - a.v : a.v - b.v));
      keptIdx = sorted.slice(0, t.keep.count).map((x) => x.i);
    }
    const subtotal = keptIdx.reduce((sum, i) => sum + rolls[i], 0) * t.sign;
    total += subtotal;
    parts.push({ n: t.n, sides: t.sides, sign: t.sign, rolls, kept: keptIdx, keep: t.keep || null, subtotal });
  }

  const d20part = parts.find((p) => p.sides === 20);
  const natural = d20part ? d20part.rolls[d20part.kept[0]] : null;

  return { formula, mode, parts, modifier, total, natural };
}

module.exports = { executeRoll, rollDie, parseFormula };
