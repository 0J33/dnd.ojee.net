import React, { useMemo } from 'react';

// ================= Character & creature likenesses =================
//
// One drawing system, three sizes:
//   <Avatar>   framed bust - lobby cards, party list, sheet header, pickers
//   <TokenFace> the same bust cropped into the map token's disc
//
// A hero's look is derived from their race, class and name, so the same
// character is recognisably the same person in the lobby and on the battle
// map without anyone having to upload a picture.

/* ---------------- deterministic per-character variation ---------------- */

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str || '').length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const pick = (arr, t) => arr[Math.floor(t * arr.length) % arr.length];

/* ---------------- races ---------------- */

const SKIN = {
  pale: '#e8c4a8', tan: '#c99268', brown: '#8d5a3b', deep: '#5c3823',
  grey: '#9aa0a8', green: '#7d9464', red: '#b56a63', scaled: '#8a9a6a', blue: '#7d94b5',
};

const RACES = {
  human: { skins: [SKIN.pale, SKIN.tan, SKIN.brown, SKIN.deep], ears: 'round', build: 1 },
  elf: { skins: [SKIN.pale, SKIN.tan, SKIN.brown], ears: 'point', build: 0.94, longFace: true },
  'half-elf': { skins: [SKIN.pale, SKIN.tan, SKIN.brown, SKIN.deep], ears: 'halfpoint', build: 0.97 },
  dwarf: { skins: [SKIN.tan, SKIN.brown, SKIN.pale], ears: 'round', build: 1.12, beard: 'full' },
  halfling: { skins: [SKIN.pale, SKIN.tan, SKIN.brown], ears: 'round', build: 0.88, roundFace: true },
  gnome: { skins: [SKIN.pale, SKIN.tan], ears: 'point', build: 0.86, roundFace: true, beard: 'short' },
  'half-orc': { skins: [SKIN.green, SKIN.grey, SKIN.brown], ears: 'point', build: 1.16, tusks: true },
  dragonborn: { skins: [SKIN.scaled, SKIN.red, SKIN.blue, SKIN.grey], ears: 'frill', build: 1.1, snout: true },
  tiefling: { skins: [SKIN.red, SKIN.tan, SKIN.deep], ears: 'point', build: 1, horns: true },
};

const HAIR = ['#2b2018', '#4a3320', '#6b4a28', '#8a6a3a', '#b8a068', '#a83a2a', '#d8d2c2', '#3a3a44'];

/* ---------------- classes ---------------- */
// garb  - shoulder/torso colour   trim - accent   head - headwear shape

const CLASSES = {
  barbarian: { garb: '#6b4a28', trim: '#c2542e', head: 'none', hair: 'wild', mark: 'warpaint' },
  bard: { garb: '#6b3a6b', trim: '#e8c476', head: 'cap', hair: 'long' },
  cleric: { garb: '#c9c2ae', trim: '#d4a94f', head: 'mitre', hair: 'short', mark: 'symbol' },
  druid: { garb: '#4a5c34', trim: '#8fae6a', head: 'antlers', hair: 'long' },
  fighter: { garb: '#6d6a63', trim: '#9aa0a8', head: 'helm', hair: 'short' },
  monk: { garb: '#a86a3a', trim: '#e8c476', head: 'none', hair: 'topknot' },
  paladin: { garb: '#8d8a95', trim: '#e8c476', head: 'greathelm', hair: 'short', mark: 'symbol' },
  ranger: { garb: '#3f5a3a', trim: '#6b4a28', head: 'hood', hair: 'long' },
  rogue: { garb: '#2f3138', trim: '#5f87a8', head: 'hood', hair: 'short', mark: 'mask' },
  sorcerer: { garb: '#7a2f3a', trim: '#e07040', head: 'none', hair: 'wild', mark: 'spark' },
  warlock: { garb: '#3a2f52', trim: '#8f7fd4', head: 'circlet', hair: 'long', mark: 'spark' },
  wizard: { garb: '#2f3f6b', trim: '#8f7fd4', head: 'wizhat', hair: 'long', mark: 'symbol' },
  npc: { garb: '#5a5348', trim: '#8d8a95', head: 'none', hair: 'short' },
};

/* ---------------- creature archetypes (monsters, NPCs, markers) ---------------- */
// Each is a compact silhouette that stays legible at 22px on the battle map.

const CREATURES = {
  rat: (c) => (
    <g fill={c}>
      <ellipse cx="30" cy="38" rx="16" ry="10" />
      <circle cx="46" cy="34" r="8" />
      <circle cx="44" cy="26" r="4" />
      <circle cx="51" cy="27" r="3.4" />
      <path d="M14 38q-9 4-11 12" stroke={c} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="33" r="1.8" fill="#1a1a1a" />
    </g>
  ),
  wolf: (c) => (
    <g fill={c}>
      <ellipse cx="26" cy="38" rx="17" ry="10" />
      <path d="M8 40q-7 3-6 12l6-1q-1-6 4-8z" />
      <path d="M40 32q6-3 10 0l8-3-3 7 3 3-8 5-10-2z" />
      <path d="M40 26l1-11 7 9zM50 25l7-9 1 10z" />
      <circle cx="52" cy="34" r="1.9" fill="#1a1a1a" />
      <path d="M56 38h5" stroke="#1a1a1a" strokeWidth="1.6" />
      <path d="M14 46l4 12M28 46l3 12M38 44l3 12" stroke={c} strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  bear: (c) => (
    <g fill={c}>
      <circle cx="16" cy="16" r="7" />
      <circle cx="48" cy="16" r="7" />
      <circle cx="32" cy="24" r="16" />
      <path d="M12 44q0-8 20-8t20 8v18H12z" />
      <ellipse cx="32" cy="30" rx="8" ry="6.5" fill="#efe7d4" opacity="0.9" />
      <ellipse cx="32" cy="27" rx="3" ry="2.2" fill="#1a1a1a" />
      <circle cx="25" cy="20" r="2" fill="#1a1a1a" />
      <circle cx="39" cy="20" r="2" fill="#1a1a1a" />
    </g>
  ),
  boar: (c) => (
    <g fill={c}>
      <path d="M10 46q2-18 16-18t18 8l14 4-4 12-16 4q-16 2-28-10z" />
      <path d="M52 42q5 1 6 6M46 44q5 2 5 7" stroke="#efe7d4" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <circle cx="52" cy="38" r="1.8" fill="#1a1a1a" />
      <path d="M40 30l3-9 5 8z" />
      <path d="M16 52l2 10M28 54l1 9M40 52l2 10" stroke={c} strokeWidth="4" strokeLinecap="round" />
      <path d="M8 40q-6-2-7-8 5 1 8 5z" />
    </g>
  ),
  spider: (c) => (
    <g stroke={c} strokeWidth="3.4" fill="none" strokeLinecap="round">
      <path d="M22 22 8 12M22 30 6 26M22 38 6 42M24 44 12 56M42 22 56 12M42 30 58 26M42 38 58 42M40 44 52 56" />
      <ellipse cx="32" cy="38" rx="13" ry="14" fill={c} stroke="none" />
      <circle cx="32" cy="23" r="8" fill={c} stroke="none" />
      <circle cx="29" cy="21" r="1.8" fill="#1a1a1a" stroke="none" />
      <circle cx="35" cy="21" r="1.8" fill="#1a1a1a" stroke="none" />
    </g>
  ),
  snake: (c) => (
    <g fill="none" stroke={c} strokeWidth="7" strokeLinecap="round">
      <path d="M10 50q10-10 20 0t22-8" />
      <circle cx="52" cy="40" r="5" fill={c} stroke="none" />
      <path d="M56 40h7" strokeWidth="2.4" stroke="#c94f6d" />
    </g>
  ),
  bat: (c) => (
    <g fill={c}>
      <path d="M32 26q-8-12-22-10 6 6 4 12 8 2 10 8zM32 26q8-12 22-10-6 6-4 12-8 2-10 8z" />
      <ellipse cx="32" cy="34" rx="7" ry="10" />
      <path d="M27 22l-2-8 7 6zM37 22l2-8-7 6z" />
    </g>
  ),
  bird: (c) => (
    <g fill={c}>
      <path d="M32 20 8 34l18 2z" />
      <path d="M32 20 56 34l-18 2z" />
      <ellipse cx="32" cy="36" rx="8" ry="14" />
      <path d="M32 50l-5 10h10z" />
      <circle cx="32" cy="24" r="6" />
      <path d="M32 24l8 3-8 3z" fill="#e8c476" />
    </g>
  ),
  insect: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="40" rx="12" ry="17" />
      <ellipse cx="32" cy="22" rx="9" ry="8" />
      <path d="M23 16l-6-8M41 16l6-8" stroke={c} strokeWidth="3" strokeLinecap="round" />
      <path d="M20 32H8M20 42H8M44 32h12M44 42h12" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 24v34" stroke="#1a1a1a" strokeWidth="2" opacity="0.4" />
    </g>
  ),
  goblinoid: (c) => (
    <g fill={c}>
      <path d="M32 18q11 0 11 12 0 10-11 10T21 30q0-12 11-12z" />
      <path d="M21 26 6 18l13 12zM43 26 58 18 45 30z" />
      <path d="M22 42h20l6 18H16z" />
      <circle cx="27" cy="28" r="2.2" fill="#f2c14e" />
      <circle cx="37" cy="28" r="2.2" fill="#f2c14e" />
      <path d="M27 35h10l-5 4z" fill="#1a1a1a" opacity="0.6" />
    </g>
  ),
  orc: (c) => (
    <g fill={c}>
      <path d="M20 20q0-10 12-10t12 10v9q0 11-12 13T20 29z" />
      <path d="M20 24 8 18l11 10zM44 24 56 18 45 28z" />
      <path d="M18 44h28l6 18H12z" />
      <path d="M26 36l-1.5 7 4-4zM38 36l1.5 7-4-4z" fill="#efe7d4" />
      <path d="M22 22h8M34 22h8" stroke="#1a1a1a" strokeWidth="2.4" opacity="0.5" />
      <circle cx="26" cy="27" r="2.3" fill="#c94f6d" />
      <circle cx="38" cy="27" r="2.3" fill="#c94f6d" />
    </g>
  ),
  skeleton: (c) => (
    <g fill={c}>
      <path d="M32 12q12 0 12 14 0 8-4 11H24q-4-3-4-11 0-14 12-14z" />
      <circle cx="27" cy="26" r="3.6" fill="#141414" />
      <circle cx="37" cy="26" r="3.6" fill="#141414" />
      <path d="M30 33h4l-2 4z" fill="#141414" />
      <path d="M26 40h12v4H26z" />
      <path d="M20 48h24M22 54h20M24 60h16" stroke={c} strokeWidth="4" strokeLinecap="round" />
    </g>
  ),
  zombie: (c) => (
    <g fill={c}>
      <ellipse cx="30" cy="20" rx="10" ry="11" />
      <path d="M21 33h18l4 29H17z" />
      <path d="M39 38h20v6H39zM39 46h17v6H39z" />
      <circle cx="26" cy="18" r="2.6" fill="#141414" />
      <circle cx="35" cy="20" r="1.8" fill="#141414" />
      <path d="M25 27q5 3 10 0" stroke="#141414" strokeWidth="1.8" fill="none" />
      <path d="M23 40l4 8-5 3z" fill="#141414" opacity="0.35" />
    </g>
  ),
  ghost: (c) => (
    <g fill={c} opacity="0.85">
      <path d="M32 10q14 0 14 18v26l-6-6-6 6-6-6-6 6V28q0-18 10-18z" />
      <circle cx="27" cy="26" r="3" fill="#0d0d12" />
      <circle cx="38" cy="26" r="3" fill="#0d0d12" />
    </g>
  ),
  dragon: (c) => (
    <g fill={c}>
      <path d="M24 30 2 16q0 18 8 26 8-4 14-4z" />
      <path d="M40 30 62 16q0 18-8 26-8-4-14-4z" />
      <path d="M32 18q11 0 11 12 0 8-4 12l-7 8-7-8q-4-4-4-12 0-12 11-12z" />
      <path d="M22 20 14 8l12 6zM42 20 50 8 38 14z" />
      <circle cx="27" cy="28" r="2.6" fill="#f2c14e" />
      <circle cx="37" cy="28" r="2.6" fill="#f2c14e" />
      <path d="M28 38h8l-4 5z" fill="#1a1a1a" opacity="0.55" />
    </g>
  ),
  ooze: (c) => (
    <g fill={c} opacity="0.88">
      <path d="M12 46q0-24 20-24t20 24q0 8-20 8t-20-8z" />
      <circle cx="25" cy="36" r="4" fill="#0d0d12" opacity="0.4" />
      <circle cx="40" cy="41" r="6" fill="#0d0d12" opacity="0.3" />
      <path d="M12 46q4 8 20 8t20-8" stroke={c} strokeWidth="3" fill="none" />
    </g>
  ),
  elemental: (c) => (
    <g fill={c}>
      <path d="M32 6q6 14 14 18-6 4-6 12t-8 20q-8-12-8-20t-6-12q8-4 14-18z" />
      <path d="M32 22q3 8 7 11-4 3-4 8t-3 10q-3-5-3-10t-4-8q4-3 7-11z" fill="#ffe08a" opacity="0.55" />
    </g>
  ),
  golem: (c) => (
    <g fill={c}>
      <rect x="22" y="8" width="20" height="15" rx="2" />
      <rect x="21" y="27" width="22" height="22" rx="2" />
      <rect x="5" y="28" width="12" height="14" rx="2" />
      <rect x="47" y="28" width="12" height="14" rx="2" />
      <rect x="6" y="44" width="10" height="11" rx="2" />
      <rect x="48" y="44" width="10" height="11" rx="2" />
      <rect x="23" y="53" width="7" height="9" rx="1.5" />
      <rect x="34" y="53" width="7" height="9" rx="1.5" />
      <rect x="26" y="13" width="4.5" height="4.5" fill="#f2c14e" />
      <rect x="33.5" y="13" width="4.5" height="4.5" fill="#f2c14e" />
      <path d="M21 36h22" stroke="#1a1a1a" strokeWidth="1.6" opacity="0.4" />
    </g>
  ),
  giant: (c) => (
    <g fill={c}>
      <circle cx="28" cy="14" r="9" />
      <path d="M15 27h26l5 24H10z" />
      <path d="M10 30 2 44l7 5" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M42 30l6 6" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M44 32 60 8" stroke="#6b4a28" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="58" cy="11" rx="7" ry="8" fill="#6b4a28" transform="rotate(-32 58 11)" />
      <path d="M18 53l3 9M36 53l3 9" stroke={c} strokeWidth="5" strokeLinecap="round" />
      <circle cx="24" cy="13" r="2" fill="#1a1a1a" />
      <circle cx="33" cy="13" r="2" fill="#1a1a1a" />
    </g>
  ),
  fiend: (c) => (
    <g fill={c}>
      <path d="M32 16q12 0 12 13t-12 15-12-15 12-13z" />
      <path d="M21 20 14 6l12 8zM43 20 50 6 38 14z" />
      <path d="M22 44h20l6 18H16z" />
      <path d="M18 30q-12-6-16 4 10 0 14 8zM46 30q12-6 16 4-10 0-14 8z" opacity="0.85" />
      <circle cx="27" cy="27" r="2.4" fill="#f2c14e" />
      <circle cx="37" cy="27" r="2.4" fill="#f2c14e" />
    </g>
  ),
  celestial: (c) => (
    <g fill={c}>
      <circle cx="32" cy="24" r="10" />
      <path d="M22 38h20l5 22H17z" />
      <path d="M22 30q-14-8-20 2 12 0 18 8zM42 30q14-8 20 2-12 0-18 8z" opacity="0.9" />
      <circle cx="32" cy="9" r="7" fill="none" stroke="#e8c476" strokeWidth="2.6" />
    </g>
  ),
  fey: (c) => (
    <g fill={c}>
      <path d="M26 24 8 8q-6 14 4 22 8 2 14-6zM38 24 56 8q6 14-4 22-8 2-14-6z" opacity="0.55" />
      <path d="M26 32 12 30q0 10 8 12 5 0 7-6zM38 32l14-2q0 10-8 12-5 0-7-6z" opacity="0.4" />
      <circle cx="32" cy="26" r="8" />
      <path d="M25 36h14l3 20H22z" />
      <path d="M28 16q4-8 8 0z" fill="#e8c476" />
    </g>
  ),
  plant: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="18" rx="19" ry="13" />
      <circle cx="18" cy="22" r="8" />
      <circle cx="46" cy="22" r="8" />
      <path d="M26 28h12v28H26z" />
      <path d="M26 36 12 28l-4 8 18 8zM38 36l14-8 4 8-18 8z" />
      <path d="M20 62q4-10 12-8t12 8z" />
      <circle cx="28" cy="42" r="2.2" fill="#1a1a1a" />
      <circle cx="36" cy="42" r="2.2" fill="#1a1a1a" />
    </g>
  ),
  aberration: (c) => (
    <g fill={c}>
      <ellipse cx="32" cy="30" rx="16" ry="15" />
      <circle cx="32" cy="30" r="8" fill="#f2f0e2" />
      <circle cx="32" cy="30" r="4" fill="#141414" />
      <path d="M20 42q-8 10-14 10M44 42q8 10 14 10M28 45v14M36 45v14" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  ),
  construct: (c) => (
    <g fill={c}>
      <rect x="18" y="16" width="28" height="26" rx="4" />
      <rect x="24" y="44" width="16" height="16" rx="2" />
      <circle cx="27" cy="27" r="3.4" fill="#5f87a8" />
      <circle cx="38" cy="27" r="3.4" fill="#5f87a8" />
      <rect x="26" y="34" width="12" height="3" fill="#141414" opacity="0.6" />
      <path d="M32 10v6" stroke={c} strokeWidth="3" />
      <circle cx="32" cy="8" r="3" />
    </g>
  ),
  humanoid: (c) => (
    <g fill={c}>
      <circle cx="32" cy="22" r="10" />
      <path d="M20 36h24l5 24H15z" />
    </g>
  ),
  monstrosity: (c) => (
    <g fill={c}>
      <path d="M30 22q10 0 10 10t-10 12-10-12 10-10z" />
      <path d="M22 16l-4-11 10 7zM38 16l4-11-10 7z" />
      <ellipse cx="30" cy="44" rx="16" ry="11" />
      <path d="M18 34l3-7 4 6 4-7 4 6 4-7 3 7z" />
      <path d="M44 46q10 2 13 12l-5 2q-2-7-9-8z" />
      <path d="M20 54l2 8M34 54l2 8" stroke={c} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="25" cy="30" r="2.2" fill="#c94f6d" />
      <circle cx="35" cy="30" r="2.2" fill="#c94f6d" />
      <path d="M25 37h10l-5 4z" fill="#efe7d4" />
    </g>
  ),
  swarm: (c) => (
    <g fill={c}>
      {[[16, 22], [32, 16], [48, 24], [22, 36], [38, 34], [12, 46], [30, 48], [48, 44], [40, 56], [20, 56]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="5" ry="3.6" transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
    </g>
  ),
  marker: (c) => (
    <g fill={c}>
      <path d="M32 6 39 24l19 1-15 12 5 19-16-11-16 11 5-19-15-12 19-1z" />
    </g>
  ),
  chest: (c) => (
    <g fill={c}>
      <path d="M8 26q24-16 48 0v6H8z" />
      <rect x="8" y="32" width="48" height="24" rx="2" />
      <path d="M8 32h48" stroke="#1a1a1a" strokeWidth="2" opacity="0.5" />
      <rect x="18" y="20" width="5" height="36" fill="#1a1a1a" opacity="0.35" />
      <rect x="41" y="20" width="5" height="36" fill="#1a1a1a" opacity="0.35" />
      <rect x="28" y="30" width="8" height="12" rx="1.5" fill="#e8c476" />
      <circle cx="32" cy="36" r="1.8" fill="#1a1a1a" />
    </g>
  ),
};

/* ---------------- resolving a creature to an archetype ---------------- */

const NAME_HINTS = [
  [/\brat\b|vermin/i, 'rat'],
  [/wolf|jackal|hyena|dog|mastiff/i, 'wolf'],
  [/bear|ape|gorilla/i, 'bear'],
  [/boar|pig|hog/i, 'boar'],
  [/spider|scorpion/i, 'spider'],
  [/snake|serpent|viper|constrictor|naga/i, 'snake'],
  [/bat\b/i, 'bat'],
  [/eagle|hawk|owl|raven|vulture|bird|harpy/i, 'bird'],
  [/beetle|wasp|ant\b|centipede|locust|fly\b/i, 'insect'],
  [/goblin|kobold|hobgoblin|bugbear/i, 'goblinoid'],
  [/orc|troll|ogre/i, 'orc'],
  [/skeleton|bones/i, 'skeleton'],
  [/zombie|ghoul|ghast|mummy/i, 'zombie'],
  [/ghost|spectre|specter|wraith|shadow|banshee|will-o/i, 'ghost'],
  [/dragon|drake|wyvern|wyrm|hydra/i, 'dragon'],
  [/ooze|slime|pudding|jelly|cube/i, 'ooze'],
  [/elemental|salamander|magmin|mephit/i, 'elemental'],
  [/golem|homunculus|animated|armor/i, 'golem'],
  [/giant|ettin|cyclops|titan/i, 'giant'],
  [/demon|devil|imp|quasit|hell|balor|fiend/i, 'fiend'],
  [/angel|deva|planetar|solar|unicorn|pegasus/i, 'celestial'],
  [/sprite|pixie|dryad|satyr|fey|blink/i, 'fey'],
  [/treant|shambling|vine|plant|shrieker|fungus|myconid/i, 'plant'],
  [/aboleth|beholder|mind flayer|gazer|aberrat/i, 'aberration'],
  [/swarm/i, 'swarm'],
];

const TYPE_TO_ART = {
  aberration: 'aberration', beast: 'wolf', celestial: 'celestial', construct: 'construct',
  dragon: 'dragon', elemental: 'elemental', fey: 'fey', fiend: 'fiend', giant: 'giant',
  humanoid: 'humanoid', monstrosity: 'monstrosity', ooze: 'ooze', plant: 'plant',
  undead: 'skeleton', swarm: 'swarm',
};

// SRD stat blocks that are just people. They are checked before the shape
// hints so "half-red-dragon-veteran" stays a person rather than becoming a
// dragon, and so a token that only stored its index (as every token saved
// before art existed did) doesn't fall through to the generic monster shape.
// Goblins, orcs, kobolds and lycanthropes are deliberately absent - they have
// silhouettes of their own.
const HUMANOID_NPCS = new Set([
  'acolyte', 'archmage', 'assassin', 'bandit', 'bandit-captain', 'berserker', 'commoner',
  'cult-fanatic', 'cultist', 'deep-gnome-svirfneblin', 'drow', 'druid', 'duergar', 'gladiator',
  'gnoll', 'grimlock', 'guard', 'half-red-dragon-veteran', 'knight', 'lizardfolk', 'mage',
  'merfolk', 'noble', 'priest', 'sahuagin', 'scout', 'spy', 'thug', 'tribal-warrior', 'veteran',
]);

const slug = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '-');

/** Best silhouette for a monster, from its name first and its SRD type second. */
export function artKeyForMonster({ name, type, index } = {}) {
  const label = `${name || ''} ${index || ''}`;
  if (/swarm/i.test(label)) return 'swarm';
  // A numbered copy on the map is still the same creature ("Goblin 2").
  const bare = slug(name).replace(/-\d+$/, '');
  if (HUMANOID_NPCS.has(slug(index)) || HUMANOID_NPCS.has(bare)) return 'humanoid';
  for (const [re, key] of NAME_HINTS) if (re.test(label)) return key;
  return TYPE_TO_ART[String(type || '').toLowerCase()] || 'monstrosity';
}

/* ---------------- the hero bust ---------------- */

// Exact match first, then the longest matching key, so "half-elf" never
// resolves to "elf" and "lightfoot halfling" lands on halfling.
function lookup(table, value, fallbackKey) {
  const key = String(value || '').toLowerCase().replace(/\s+/g, '-');
  if (table[key]) return table[key];
  const hit = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => key.includes(k));
  return hit ? table[hit] : table[fallbackKey];
}

function HeroBust({ sheet, seed }) {
  const race = lookup(RACES, sheet?.raceIndex || sheet?.race || sheet?.raceName, 'human');
  const classSource = sheet?.classIndex || sheet?.className;
  const cls = lookup(CLASSES, classSource, 'npc');
  const classKey = String(classSource || 'npc').toLowerCase();

  const skin = pick(race.skins, hashString(`${seed}-skin`));
  const hair = pick(HAIR, hashString(`${seed}-hair`));
  const b = race.build;

  // Head geometry. Everything else is positioned relative to these, so a
  // headdress can never end up over the eyes.
  const cx = 32;
  const cy = 28;
  const rx = (race.roundFace ? 12.5 : 11.5) * b;
  const ry = (race.longFace ? 14.5 : race.roundFace ? 12 : 13.5) * b;
  const top = cy - ry; // crown of the head
  const eyeY = cy + 1.5;
  const browY = cy - 3.5; // nothing opaque may sit below this line
  const mouthY = cy + 7;

  const dark = (c, amount = 0.72) => c; // colours are authored pre-shaded
  const fullFace = cls.head === 'greathelm';

  return (
    // scaled about the bottom edge so the shoulders still fill the frame
    <g transform="translate(3.2 6.4) scale(0.9)">
      {/* ---- shoulders ---- */}
      <path d={`M32 40 ${11 - b} 50 ${7 - b * 2} 64h${50 + b * 4}L${53 + b} 50z`} fill={cls.garb} />
      {/* collar: a V-neck in the trim colour, never a stripe down the chest */}
      <path d="M24 44 32 54 40 44 43 46 32 60 21 46z" fill={cls.trim} opacity="0.5" />
      {(classKey === 'fighter' || classKey === 'paladin') && (
        <>
          <ellipse cx={12} cy={53} rx="9.5" ry="7.5" fill={cls.trim} />
          <ellipse cx={52} cy={53} rx="9.5" ry="7.5" fill={cls.trim} />
        </>
      )}
      {cls.mark === 'symbol' && <circle cx={cx} cy={54} r="4.6" fill={cls.trim} />}

      {/* ---- hood sits behind the head so it frames the face ---- */}
      {cls.head === 'hood' && (
        <path
          d={`M${cx} ${top - 5}
              q-${rx + 7} 0 -${rx + 7} ${ry + 11}
              q0 6 4 8
              l${rx * 2 + 6} 0
              q4 -2 4 -8
              q0 -${ry + 11} -${rx + 7} -${ry + 11}z`}
          fill={cls.garb}
        />
      )}

      {/* ---- neck ---- */}
      <rect x={cx - 5} y={cy + ry - 6} width="10" height="12" fill={skin} />

      {/* ---- ears ---- */}
      {(race.ears === 'point' || race.ears === 'halfpoint' || race.ears === 'frill') && (
        <>
          <path
            d={`M${cx - rx + 1} ${cy - 2} L${cx - rx - (race.ears === 'point' ? 8 : 4.5)} ${
              cy - (race.ears === 'point' ? 11 : 6)
            } L${cx - rx + 2} ${cy + 5} Z`}
            fill={skin}
          />
          <path
            d={`M${cx + rx - 1} ${cy - 2} L${cx + rx + (race.ears === 'point' ? 8 : 4.5)} ${
              cy - (race.ears === 'point' ? 11 : 6)
            } L${cx + rx - 2} ${cy + 5} Z`}
            fill={skin}
          />
        </>
      )}
      {race.ears === 'round' && (
        <>
          <circle cx={cx - rx} cy={cy + 1} r="3.2" fill={skin} />
          <circle cx={cx + rx} cy={cy + 1} r="3.2" fill={skin} />
        </>
      )}

      {/* ---- head ---- */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skin} />

      {/* dragonborn muzzle */}
      {race.snout && (
        <>
          <ellipse cx={cx} cy={mouthY} rx={rx * 0.62} ry={ry * 0.34} fill={skin} />
          <circle cx={cx - 3} cy={mouthY - 1} r="1.2" fill="#241c14" />
          <circle cx={cx + 3} cy={mouthY - 1} r="1.2" fill="#241c14" />
        </>
      )}

      {/* ---- beards: below the mouth line only ---- */}
      {race.beard === 'full' && !race.snout && (
        <path
          d={`M${cx - rx * 0.86} ${cy + 3}
              q0 ${ry + 7} ${rx * 0.86} ${ry + 8}
              q${rx * 0.86} -1 ${rx * 0.86} -${ry + 8}
              q-${rx * 0.86} 4 -${rx * 1.72} 0z`}
          fill={hair}
        />
      )}
      {race.beard === 'short' && !race.snout && (
        <path d={`M${cx - rx + 3} ${cy + 5} q${rx - 3} ${ry * 0.75} ${rx * 2 - 6} 0 q-${rx - 3} 5.5 -${rx * 2 - 6} 0z`} fill={hair} />
      )}

      {/* ---- hair: crown only, stops above the brow ---- */}
      {!fullFace && cls.hair === 'long' && (
        <>
          <path d={`M${cx - rx - 1.5} ${cy + 8} q-1 -${ry + 10} ${rx + 1.5} -${ry + 10} q${rx + 1.5} 0 ${rx + 1.5} ${ry + 10} l-4 1 q0 -${ry - 1} -${rx - 2.5} -${ry - 1} q-${rx - 2.5} 0 -${rx - 2.5} ${ry - 1}z`} fill={hair} />
        </>
      )}
      {!fullFace && (cls.hair === 'short' || cls.hair === 'topknot') && (
        <path d={`M${cx - rx} ${browY} q0 -${ry + 1} ${rx} -${ry + 1} q${rx} 0 ${rx} ${ry + 1} q-${rx} -5.5 -${rx * 2} 0z`} fill={hair} />
      )}
      {!fullFace && cls.hair === 'wild' && (
        <>
          <path d={`M${cx - rx} ${browY} q0 -${ry + 3} ${rx} -${ry + 3} q${rx} 0 ${rx} ${ry + 3} q-${rx} -6.5 -${rx * 2} 0z`} fill={hair} />
          <path d={`M${cx - rx + 2} ${top + 1} ${cx - rx - 7} ${top - 8} ${cx - 3} ${top - 3}z`} fill={hair} />
          <path d={`M${cx + rx - 2} ${top + 1} ${cx + rx + 7} ${top - 8} ${cx + 3} ${top - 3}z`} fill={hair} />
        </>
      )}
      {cls.hair === 'topknot' && !fullFace && <ellipse cx={cx} cy={top - 4} rx="5" ry="4.2" fill={hair} />}

      {/* ---- tiefling horns ---- */}
      {race.horns && (
        <>
          <path d={`M${cx - rx * 0.66} ${top + 3} q-6.5 -9 1.5 -13.5 -2 6.5 3 11.5z`} fill="#3a2f2a" />
          <path d={`M${cx + rx * 0.66} ${top + 3} q6.5 -9 -1.5 -13.5 2 6.5 -3 11.5z`} fill="#3a2f2a" />
        </>
      )}

      {/* ---- headwear: everything opaque stays above the brow ---- */}
      {cls.head === 'hood' && (
        /* front rim of the hood - a crescent over the crown, never the eyes */
        <path
          d={`M${cx - rx - 3} ${browY + 1}
              q0 -${ry + 5} ${rx + 3} -${ry + 5}
              q${rx + 3} 0 ${rx + 3} ${ry + 5}
              q-2 -4 -6 -4
              q0 -${ry - 3} -${rx - 3} -${ry - 3}
              q-${rx - 3} 0 -${rx - 3} ${ry - 3}
              q-4 0 -6 4z`}
          fill={cls.garb}
        />
      )}
      {cls.head === 'wizhat' && (
        <>
          <path d={`M${cx} ${top - 20} ${cx + 13} ${top + 3} ${cx - 13} ${top + 3}z`} fill={cls.garb} />
          <rect x={cx - 18} y={top + 1} width="36" height="5" rx="2.5" fill={cls.garb} />
          <rect x={cx - 7} y={top - 5} width="14" height="4" rx="1" fill={cls.trim} />
        </>
      )}
      {cls.head === 'cap' && (
        <>
          <path d={`M${cx - rx - 2} ${browY} q${rx + 2} -10 ${rx * 2 + 4} 0z`} fill={cls.garb} />
          <path d={`M${cx + rx - 1} ${browY - 3} q11 -8 13 -1 -7.5 0 -11 4.5z`} fill={cls.trim} />
        </>
      )}
      {cls.head === 'helm' && (
        <>
          {/* dome over the crown */}
          <path d={`M${cx - rx - 1} ${browY} q0 -${ry + 5} ${rx + 1} -${ry + 5} q${rx + 1} 0 ${rx + 1} ${ry + 5}z`} fill={cls.trim} />
          {/* cheek guards down the sides, leaving the eyes clear */}
          <path d={`M${cx - rx - 1} ${browY} l3.5 0 0 ${ry * 0.9} -3.5 2z`} fill={cls.trim} />
          <path d={`M${cx + rx + 1} ${browY} l-3.5 0 0 ${ry * 0.9} 3.5 2z`} fill={cls.trim} />
          {/* nose guard */}
          <rect x={cx - 1.4} y={browY} width="2.8" height={ry * 0.6} fill={cls.trim} />
        </>
      )}
      {cls.head === 'greathelm' && (
        <>
          <path d={`M${cx - rx - 1.5} ${cy + 5} q0 -${ry + 7} ${rx + 1.5} -${ry + 7} q${rx + 1.5} 0 ${rx + 1.5} ${ry + 7}z`} fill={cls.trim} />
          <rect x={cx - 8} y={cy - 2} width="16" height="3.6" rx="1.4" fill="#141414" />
          <rect x={cx - 1.6} y={cy + 3} width="3.2" height={ry * 0.5} fill="#141414" opacity="0.45" />
          <path d={`M${cx - 7} ${top - 2} ${cx} ${top - 10} ${cx + 7} ${top - 2}z`} fill="#e8c476" />
        </>
      )}
      {cls.head === 'mitre' && (
        <path
          d={`M${cx} ${top - 13} q${rx + 3} 6 ${rx + 3} ${ry * 0.85} l-${rx * 2 + 6} 0 q0 -${ry * 0.85 - 6} ${rx + 3} -${ry * 0.85 + 6}z`}
          fill={cls.garb}
          stroke={cls.trim}
          strokeWidth="1.6"
        />
      )}
      {cls.head === 'antlers' && (
        <g stroke={hair} strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d={`M${cx - 6} ${top + 2} l-6 -9 l-5.5 -2.5 M${cx - 12} ${top - 7} l1.5 -7`} />
          <path d={`M${cx + 6} ${top + 2} l6 -9 l5.5 -2.5 M${cx + 12} ${top - 7} l-1.5 -7`} />
        </g>
      )}
      {cls.head === 'circlet' && (
        <>
          <path d={`M${cx - rx + 1} ${browY - 1} q${rx - 1} 5 ${rx * 2 - 2} 0`} stroke={cls.trim} strokeWidth="2.6" fill="none" />
          <circle cx={cx} cy={browY + 0.5} r="2.6" fill={cls.trim} />
        </>
      )}

      {/* ---- face: drawn last so nothing can hide it ---- */}
      {!fullFace && !race.snout && (
        <>
          <ellipse cx={cx - rx * 0.4} cy={eyeY} rx="2" ry="2.4" fill="#1c1a18" />
          <ellipse cx={cx + rx * 0.4} cy={eyeY} rx="2" ry="2.4" fill="#1c1a18" />
        </>
      )}
      {!fullFace && cls.mark === 'warpaint' && (
        <path d={`M${cx - rx * 0.72} ${cy - 2.5} h${rx * 0.55} M${cx + rx * 0.17} ${cy - 2.5} h${rx * 0.55}`} stroke={cls.trim} strokeWidth="2.4" />
      )}
      {/* half-orc tusks sit at the mouth, under the eyes */}
      {race.tusks && !fullFace && (
        <>
          <path d={`M${cx - 4.5} ${mouthY + 2} l-1.6 -4.6 3.2 0z`} fill="#e8e2cc" />
          <path d={`M${cx + 4.5} ${mouthY + 2} l1.6 -4.6 -3.2 0z`} fill="#e8e2cc" />
        </>
      )}
      {/* a rogue's mask covers nose and mouth, not the eyes */}
      {cls.mark === 'mask' && !fullFace && (
        <path d={`M${cx - rx + 1} ${cy + 4} q${rx - 1} 2 ${rx * 2 - 2} 0 l0 5 q-${rx - 1} 4 -${rx * 2 - 2} 0z`} fill="#1c1c22" opacity="0.9" />
      )}
      {cls.mark === 'spark' && <circle cx={cx + rx + 4} cy={top + 4} r="3" fill={cls.trim} />}
    </g>
  );
}

/* ---------------- public components ---------------- */

/**
 * What a character or creature looks like. Everything else (portrait frames,
 * map tokens, list rows) wraps this.
 */
export function CreatureArt({ sheet, art, color = '#d4a94f', seed, size = 64 }) {
  const body = useMemo(() => {
    if (art && CREATURES[art]) return CREATURES[art](color);
    return null;
  }, [art, color]);

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      {body || <HeroBust sheet={sheet} seed={seed || sheet?.name || 'hero'} />}
    </svg>
  );
}

/**
 * Framed portrait. Use for lobby cards, the party list, sheet headers and
 * every character picker.
 */
export function Avatar({ sheet, art, name, color = '#d4a94f', size = 44, shape = 'round', ring = true, className = '', title }) {
  const label = name || sheet?.name || 'Character';
  return (
    <span
      className={`avatar avatar-${shape} ${ring ? 'avatar-ring' : ''} ${className}`}
      style={{ '--av-size': `${size}px`, '--av-color': color }}
      role="img"
      aria-label={`${label} portrait`}
      title={title || label}
    >
      <span className="avatar-bg" />
      <CreatureArt sheet={sheet} art={art} color={art ? '#efe7d4' : color} seed={label} size={size} />
    </span>
  );
}

/**
 * Which silhouette a token should wear.
 *
 * Tokens created before art existed carry no `art` key, so a monster's look is
 * re-derived from its name and stat-block index. Without this every creature on
 * an older campaign's map would fall through to the generic hero bust.
 */
export function artForToken(token) {
  if (!token) return null;
  if (token.art) return token.art;
  if (token.kind === 'marker') return 'marker';
  if (token.kind === 'monster') return artKeyForMonster({ name: token.label, type: token.monsterType, index: token.monsterIndex });
  if (token.kind === 'npc') return 'humanoid';
  return null; // a PC draws its hero bust from the character sheet
}

/** The same likeness, sized and clipped for a map token disc. */
export function TokenFace({ token, sheet, size }) {
  return (
    <span className="token-face" aria-hidden="true">
      <CreatureArt sheet={sheet} art={artForToken(token)} color="#f2ecdc" seed={token.label} size={size} />
    </span>
  );
}

export const CREATURE_ART_KEYS = Object.keys(CREATURES);
export const NPC_ART_KEYS = ['humanoid', 'goblinoid', 'orc', 'skeleton', 'zombie', 'ghost', 'fey', 'celestial', 'construct', 'golem'];
