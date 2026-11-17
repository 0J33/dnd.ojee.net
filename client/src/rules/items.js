// Items the DM makes, gives, hides in chests and sells (server/rules/items.js
// cleans the same shape). Base weapons and armor are the SRD's.

export const ITEM_TYPES = [
  { key: 'weapon', name: 'Weapon', hint: 'Shows up as an attack. A +1 adds to the attack roll and the damage.' },
  { key: 'armor', name: 'Armor', hint: 'Worn armor sets the AC. A +1 adds to it.' },
  { key: 'shield', name: 'Shield', hint: '+2 AC while held, plus its magic.' },
  { key: 'potion', name: 'Potion', hint: 'Drunk from the gear list. A healing potion heals by itself.' },
  { key: 'relic', name: 'Relic', hint: 'Worn: a ring, cloak, amulet. Can add to AC and every save, or just do what its words say.' },
  { key: 'gear', name: 'Other', hint: 'Anything else: a key, a map, a gem, a letter.' },
];

const W = (name, damage, damageType, properties = [], range = null) => ({ name, damage, damageType, properties, range });
export const BASE_WEAPONS = [
  W('Club', '1d4', 'bludgeoning', ['light']), W('Dagger', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60'),
  W('Greatclub', '1d8', 'bludgeoning', ['two-handed']), W('Handaxe', '1d6', 'slashing', ['light', 'thrown'], '20/60'),
  W('Javelin', '1d6', 'piercing', ['thrown'], '30/120'), W('Light hammer', '1d4', 'bludgeoning', ['light', 'thrown'], '20/60'),
  W('Mace', '1d6', 'bludgeoning'), W('Quarterstaff', '1d6', 'bludgeoning', ['versatile']),
  W('Sickle', '1d4', 'slashing', ['light']), W('Spear', '1d6', 'piercing', ['thrown', 'versatile'], '20/60'),
  W('Light crossbow', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320'), W('Dart', '1d4', 'piercing', ['finesse', 'thrown'], '20/60'),
  W('Shortbow', '1d6', 'piercing', ['ammunition', 'two-handed'], '80/320'), W('Sling', '1d4', 'bludgeoning', ['ammunition'], '30/120'),
  W('Battleaxe', '1d8', 'slashing', ['versatile']), W('Flail', '1d8', 'bludgeoning'),
  W('Glaive', '1d10', 'slashing', ['heavy', 'reach', 'two-handed']), W('Greataxe', '1d12', 'slashing', ['heavy', 'two-handed']),
  W('Greatsword', '2d6', 'slashing', ['heavy', 'two-handed']), W('Halberd', '1d10', 'slashing', ['heavy', 'reach', 'two-handed']),
  W('Lance', '1d12', 'piercing', ['reach']), W('Longsword', '1d8', 'slashing', ['versatile']),
  W('Maul', '2d6', 'bludgeoning', ['heavy', 'two-handed']), W('Morningstar', '1d8', 'piercing'),
  W('Pike', '1d10', 'piercing', ['heavy', 'reach', 'two-handed']), W('Rapier', '1d8', 'piercing', ['finesse']),
  W('Scimitar', '1d6', 'slashing', ['finesse', 'light']), W('Shortsword', '1d6', 'piercing', ['finesse', 'light']),
  W('Trident', '1d6', 'piercing', ['thrown', 'versatile'], '20/60'), W('War pick', '1d8', 'piercing'),
  W('Warhammer', '1d8', 'bludgeoning', ['versatile']), W('Whip', '1d4', 'slashing', ['finesse', 'reach']),
  W('Hand crossbow', '1d6', 'piercing', ['ammunition', 'light', 'loading'], '30/120'), W('Heavy crossbow', '1d10', 'piercing', ['ammunition', 'heavy', 'loading', 'two-handed'], '100/400'),
  W('Longbow', '1d8', 'piercing', ['ammunition', 'heavy', 'two-handed'], '150/600'),
];

const A = (name, acBase, category, maxDex = null) => ({ name, acBase, category, maxDex });
export const BASE_ARMOR = [
  A('Padded armor', 11, 'light'), A('Leather armor', 11, 'light'), A('Studded leather', 12, 'light'),
  A('Hide armor', 12, 'medium', 2), A('Chain shirt', 13, 'medium', 2), A('Scale mail', 14, 'medium', 2),
  A('Breastplate', 14, 'medium', 2), A('Half plate', 15, 'medium', 2),
  A('Ring mail', 14, 'heavy', 0), A('Chain mail', 16, 'heavy', 0), A('Splint armor', 17, 'heavy', 0), A('Plate armor', 18, 'heavy', 0),
];

export const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'radiant', 'necrotic', 'force', 'psychic'];

export const HEALING_POTIONS = [
  { name: 'Potion of Healing', heal: '2d4+2', value: 50 },
  { name: 'Potion of Greater Healing', heal: '4d4+4', value: 150 },
  { name: 'Potion of Superior Healing', heal: '8d4+8', value: 500 },
  { name: 'Potion of Supreme Healing', heal: '10d4+20', value: 1350 },
];

const RARITY_VALUE = { common: 50, uncommon: 300, rare: 3000, 'very rare': 20000, legendary: 50000, artifact: 100000 };

/** A blank item of a type, ready for the maker. */
export function blankItem(kind = 'weapon') {
  if (kind === 'weapon') { const b = BASE_WEAPONS.find((w) => w.name === 'Longsword'); return { kind, name: 'Longsword', qty: 1, desc: '', value: 15, magic: false, base: b.name, stats: { damage: b.damage, damageType: b.damageType, properties: b.properties, range: b.range, bonus: 0 } }; }
  if (kind === 'armor') { const b = BASE_ARMOR.find((a) => a.name === 'Chain mail'); return { kind, name: 'Chain mail', qty: 1, desc: '', value: 75, magic: false, base: b.name, stats: { acBase: b.acBase, category: b.category, maxDex: b.maxDex, bonus: 0 } }; }
  if (kind === 'shield') return { kind, name: 'Shield', qty: 1, desc: '', value: 10, magic: false, stats: { bonus: 0 } };
  if (kind === 'potion') return { kind, name: 'Potion of Healing', qty: 1, desc: 'Regain 2d4 + 2 hit points.', value: 50, magic: true, stats: { heal: '2d4+2' } };
  if (kind === 'relic') return { kind, name: 'Amulet', qty: 1, desc: '', value: 300, magic: true, equipped: true, stats: { ac: 0, saves: 0 } };
  return { kind: 'gear', name: 'Item', qty: 1, desc: '', value: 0, magic: false };
}

/** An SRD magic item as one of ours, for the maker to adjust. */
export function fromSrdMagic(m) {
  const lines = Array.isArray(m.desc) ? m.desc : [String(m.desc || '')];
  const desc = lines.slice(1).join('\n\n').slice(0, 800) || lines[0] || '';
  const plus = Number((String(m.name).match(/\+(\d)/) || [])[1]) || 0;
  const rarity = String(m.rarity?.name || '').toLowerCase();
  const value = RARITY_VALUE[rarity] ?? 300;
  const cat = m.equipment_category?.index || m.category || '';
  const base = { name: m.name, qty: 1, desc, value, magic: true };
  const heal = HEALING_POTIONS.find((p) => p.name === m.name);
  if (cat === 'potion') return { ...base, kind: 'potion', value: heal?.value ?? value, stats: heal ? { heal: heal.heal } : {} };
  if (/^shield/i.test(m.name)) return { ...blankItem('shield'), ...base, kind: 'shield', stats: { bonus: plus } };
  if (cat === 'weapon') {
    const named = BASE_WEAPONS.find((w) => new RegExp(`\\b${w.name}\\b`, 'i').test(lines[0] || ''));
    const w = named || BASE_WEAPONS.find((x) => x.name === 'Longsword');
    return { ...base, kind: 'weapon', name: /^Weapon,/.test(m.name) ? `${w.name} +${plus || 1}` : m.name, base: w.name, stats: { damage: w.damage, damageType: w.damageType, properties: w.properties, range: w.range, bonus: plus } };
  }
  if (cat === 'armor') {
    const named = BASE_ARMOR.find((a) => new RegExp(a.name.split(' ')[0], 'i').test(m.name));
    const a = named || BASE_ARMOR.find((x) => x.name === 'Chain mail');
    return { ...base, kind: 'armor', name: /^Armor,/.test(m.name) ? `${a.name} +${plus || 1}` : m.name, base: a.name, stats: { acBase: a.acBase, category: a.category, maxDex: a.maxDex, bonus: plus } };
  }
  if (cat === 'scroll' || cat === 'ammunition') return { ...base, kind: 'gear' };
  // rings, wondrous things, wands, staffs, rods: worn relics
  const protection = /of protection/i.test(m.name) ? 1 : 0;
  return { ...base, kind: 'relic', equipped: true, stats: { ac: protection, saves: protection } };
}

const sign = (n) => (n > 0 ? `+${n}` : String(n));
/** What it does, in one short line ("1d8+1 slashing, +1 to hit"). */
export function itemSummary(it) {
  const s = it.stats || {};
  if (it.kind === 'weapon') return `${s.damage || '1d4'}${s.bonus ? sign(s.bonus) : ''} ${s.damageType || ''}${s.bonus ? `, ${sign(s.bonus)} to hit` : ''}${s.range ? `, range ${s.range} ft` : ''}`.trim();
  if (it.kind === 'armor') return `AC ${s.acBase}${s.bonus ? ` ${sign(s.bonus)}` : ''}, ${s.category}`;
  if (it.kind === 'shield') return `+${2 + (s.bonus || 0)} AC`;
  if (it.kind === 'potion') return s.heal ? `heals ${s.heal}` : 'potion';
  if (it.kind === 'relic') return [s.ac && `${sign(s.ac)} AC`, s.saves && `${sign(s.saves)} saves`].filter(Boolean).join(', ') || 'relic';
  return '';
}
