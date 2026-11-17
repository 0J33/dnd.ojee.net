// Profanity filter for what the table says out loud.
//
// Speech the DM's microphone picks up is cleaned here, at capture time,
// before it is kept in memory, shown, sent to a model or saved anywhere. The
// server runs the same module (bundled into server/ai/kit.cjs by
// server/scripts/build-ai-kit.mjs) over anything that reaches it, as a second
// line of defence.
//
// How it decides:
//  - Whole words only. Text is split into words and each word is compared
//    against stems plus the endings a stem takes ("-ing", "-er", "-ed"...),
//    so "class", "assassin", "Scunthorpe", "cocktail" and the cockatrice stay
//    as they are.
//  - Leet and padding are undone first: 5h1t, f@ck, fuuuck, f.u.c.k and
//    "f u c k" (single letters spoken or typed apart) are all caught.
//  - Three strictness levels: off, standard (strong words and slurs) and
//    strict (adds mild words like "damn" and "crap"). Custom words join the
//    strong list; custom allowed words are never touched.
//
// The word lists are stored ROT13 so the source reads clean; decoded once.

const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});
const decode = (list) => list.split(' ').filter(Boolean).map(rot13);

// stems: matched with any of the ENDINGS below
const STRONG_STEMS = decode('shpx fuvg phag zbgureshpx pbpxfhpx gjng jnax jnaxre cevpx qvpxurnq nffubyr nefrubyr ohyyfuvg ubefrfuvg qvcfuvg fuvgurnq fuvgont shpxjvg shpxurnq fyhg juber cvff chffl ovgpu onfgneq qvpx pbpx gvgf obyybpxf ohttre fbqqvat fuvggl');
// whole words only (no endings): short or ambiguous ones
const STRONG_WORDS = decode('nff nefr nffung wnpxnff qhzonff fznegnff onqnff shx spx shpxva fuvgr pbpxf qvpxf gvg gjnggl jnaxf');
const SLURS = decode('avttre avttn snttbg snt ergneq fcvp puvax xvxr jrgonpx genaal pbba tbbx');
const MILD_STEMS = decode('qnza qnzzvg tbqqnza ohttrel');
const MILD_WORDS = decode('uryy penc penccl oybbql qnza qnzarq ohz nefr');

const ENDINGS = ['', 's', 'es', 'ed', 'd', 'er', 'ers', 'ing', 'in', 'ings', 'y', 'ies', 'head', 'heads', 'face', 'wit', 'wits', 'hole', 'holes', 'bag', 'bags', 'off', 'up'];

// Real words that contain a listed stem: never filtered.
const ALLOW = new Set([
  'scunthorpe', 'penistone', 'assassin', 'assassins', 'assassinate', 'assassination', 'class', 'classes', 'classic', 'pass', 'passes', 'passed', 'mass', 'grass', 'brass', 'glass',
  'bass', 'assess', 'assist', 'assume', 'assemble', 'cocktail', 'cockatrice', 'cockatrices', 'cockpit', 'peacock', 'hancock', 'hitchcock', 'cockroach', 'dickens', 'shitake', 'shiitake',
  'titan', 'titans', 'title', 'titmouse', 'analysis', 'therapist', 'hello', 'shell', 'shellfish', 'hellhound', 'hellhounds', 'hellfire', 'damnation', 'buttress', 'button', 'scrap', 'crappie',
  'bigger', 'snigger', 'niger', 'spice', 'spicy', 'spices', 'spiced', 'spick', 'kinetic', 'skiing', 'cumin', 'pricked', 'prickly', 'prickle', 'whorl', 'wankel', 'twain', 'bitcoin', 'cocking', 'cockney', 'puss', 'pissarro',
  'bummer', 'bumble', 'bump', 'hellenic', 'helloo', 'cumulus', 'document', 'circumstance', 'arsenal', 'arsenic', 'sussex', 'essex', 'middlesex', 'cocky', 'dickering',
]);

// Phrases where a mild word is part of a name: "hell hound" (an SRD monster).
const SAFE_NEXT = { hell: new Set(['hound', 'hounds', 'fire']), bastard: new Set(['sword', 'swords']) };

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'l', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g', '(': 'c', '<': 'c', '€': 'e', '¢': 'c' };

/** A word as it would be said: lower case, leet undone, padding gone, long runs shortened. */
export function normaliseWord(w) {
  let s = String(w).toLowerCase();
  s = s.replace(/[0-9!|@$+(<€¢]/g, (c) => LEET[c] || c);
  s = s.replace(/[^a-z-]/g, '');
  return s;
}
const squeeze = (s) => s.replace(/(.)\1{2,}/g, '$1$1'); // fuuuuck -> fuuck
const squeezeAll = (s) => s.replace(/(.)\1+/g, '$1'); // fuuck -> fuck, assshole -> ashole (also tried)

function buildSets(level, custom = [], allow = []) {
  const stems = new Set(), words = new Set();
  if (level === 'off') return { stems, words, allow: new Set() };
  for (const w of STRONG_STEMS) stems.add(w);
  for (const w of SLURS) stems.add(w);
  for (const w of STRONG_WORDS) words.add(w);
  if (level === 'strict') { for (const w of MILD_STEMS) stems.add(w); for (const w of MILD_WORDS) words.add(w); }
  for (const w of custom) { const n = normaliseWord(w); if (n.length >= 2) stems.add(n); }
  const al = new Set(ALLOW);
  for (const w of allow) al.add(normaliseWord(w));
  for (const w of al) { stems.delete(w); words.delete(w); }
  return { stems, words, allow: al };
}

// '@', '*' and '#' stand in for a vowel as often as for an 'a': f@ck, sh*t
function vowelVariants(raw) {
  const wild = String(raw).toLowerCase().replace(/[@*#]/g, '?');
  const n = (wild.match(/\?/g) || []).length;
  if (!n || n > 2) return [];
  let out = [wild];
  for (let i = 0; i < n; i++) out = out.flatMap((w) => 'aeiou'.split('').map((v) => w.replace('?', v)));
  return out.map(normaliseWord);
}

function isBadWord(norm, sets, raw = null) {
  if (raw) for (const v of vowelVariants(raw)) if (v !== norm && isBadWord(v, sets)) return true;
  if (!norm || norm.length < 2) return false;
  if (sets.allow.has(norm)) return false;
  const tries = new Set([norm, squeeze(norm), squeezeAll(norm), norm.replace(/-/g, '')]);
  for (const t of tries) {
    if (sets.allow.has(t)) return false;
    if (sets.words.has(t) || sets.stems.has(t)) return true;
    for (const stem of sets.stems) {
      if (t.length <= stem.length || !t.startsWith(stem)) continue;
      if (ENDINGS.includes(t.slice(stem.length))) return true;
    }
    // compounds made of a bad stem and an ordinary prefix: "motherf...", "bullsh..."
    for (const pre of ['mother', 'bull', 'horse', 'dip', 'dumb', 'jack', 'clusterf', 'cluster', 'holy', 'apeshi', 'chicken']) {
      if (!t.startsWith(pre) || t.length <= pre.length + 2) continue;
      const rest = t.slice(pre.length);
      for (const stem of sets.stems) if (rest === stem || (rest.startsWith(stem) && ENDINGS.includes(rest.slice(stem.length)))) return true;
    }
  }
  return false;
}

/** How a filtered word is shown. */
function mask(word, style) {
  if (style === 'bleep') return '[bleep]';
  if (style === 'grawlix') return '#@$%!'.slice(0, Math.max(3, Math.min(5, word.length)));
  return `${word[0] || '*'}${'*'.repeat(Math.max(2, word.length - 1))}`;
}

/**
 * Clean a piece of text. Options:
 *   level   'off' | 'standard' (default) | 'strict'
 *   style   'stars' (default, "f***") | 'bleep' ("[bleep]") | 'grawlix'
 *   custom  extra words to filter; allow: words never to filter
 * Returns { text, count, hits: [{ at, length }] } (hits index the output).
 */
export function cleanText(input, opts = {}) {
  const text = String(input ?? '');
  const level = opts.level || 'standard';
  if (level === 'off' || !text) return { text, count: 0, hits: [] };
  const sets = opts._sets || buildSets(level, opts.custom || [], opts.allow || []);
  const style = opts.style || 'stars';
  // tokens: words (letters plus leet and inner punctuation) and everything between
  const re = /[A-Za-z0-9@$!|+(<€¢][A-Za-z0-9@$!|+(<€¢.*'_-]*[A-Za-z0-9@$!|+(<€¢*]|[A-Za-z0-9@$]/g;
  const tokens = [];
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ sep: text.slice(last, m.index) });
    tokens.push({ word: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ sep: text.slice(last) });

  const bad = new Array(tokens.length).fill(false);
  const words = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
  // runs of single letters said apart: "f u c k", "s h i t"
  for (let a = 0; a < words.length; a++) {
    const single = (i) => tokens[i].word && normaliseWord(tokens[i].word).length === 1;
    if (!single(words[a])) continue;
    let b = a;
    while (b + 1 < words.length && single(words[b + 1]) && /^[\s.\-_*]{0,3}$/.test(tokens[words[b + 1] - 1]?.sep ?? '')) b++;
    if (b - a >= 2) {
      const joined = words.slice(a, b + 1).map((i) => normaliseWord(tokens[i].word)).join('');
      if (isBadWord(joined, sets)) {
        // collapse the run into its first token
        tokens[words[a]].word = words.slice(a, b + 1).map((i) => tokens[i].word).join('');
        for (let k = words[a] + 1; k <= words[b]; k++) { tokens[k].word = tokens[k].word ? '' : undefined; tokens[k].sep = tokens[k].sep !== undefined ? '' : tokens[k].sep; }
        bad[words[a]] = true;
      }
      a = b;
    }
  }
  for (let j = 0; j < words.length; j++) {
    const i = words[j];
    if (bad[i] || !tokens[i].word) continue;
    const raw = tokens[i].word.replace(/^[.'_-]+|[.'_-]+$/g, '');
    const norm = normaliseWord(raw);
    if (!isBadWord(norm, sets, raw)) continue;
    // "hell hound": a mild word that is part of a name
    const nextWord = words[j + 1] != null ? normaliseWord(tokens[words[j + 1]].word) : '';
    if (SAFE_NEXT[norm] && SAFE_NEXT[norm].has(nextWord)) continue;
    bad[i] = true;
  }

  let out = '', count = 0;
  const hits = [];
  tokens.forEach((t, i) => {
    if (t.sep !== undefined && t.word === undefined) { out += t.sep; return; }
    if (bad[i]) {
      const masked = mask(t.word, style);
      hits.push({ at: out.length, length: masked.length });
      out += masked;
      count++;
    } else out += t.word || '';
  });
  return { text: out, count, hits };
}

/** A filter with its settings baked in (word sets built once). */
export function makeFilter(opts = {}) {
  const level = opts.level || 'standard';
  const _sets = buildSets(level, opts.custom || [], opts.allow || []);
  return (text) => cleanText(text, { ...opts, level, _sets });
}

/** Every string inside a JSON-ish value, cleaned (server-side pass over requests). */
export function cleanDeep(value, filter, depth = 0) {
  if (depth > 12) return value;
  if (typeof value === 'string') return filter(value).text;
  if (Array.isArray(value)) return value.map((v) => cleanDeep(v, filter, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanDeep(v, filter, depth + 1);
    return out;
  }
  return value;
}

export const FILTER_LEVELS = [
  { key: 'off', name: 'Off' },
  { key: 'standard', name: 'Standard', hint: 'Strong language and slurs' },
  { key: 'strict', name: 'Strict', hint: 'Also mild words (damn, crap, hell)' },
];
export const FILTER_STYLES = [
  { key: 'stars', name: 'f***' },
  { key: 'bleep', name: '[bleep]' },
  { key: 'grawlix', name: '#@$%' },
];
