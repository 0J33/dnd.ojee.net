import { artKeyForMonster } from '../components/Portrait';

// One place that turns an SRD stat block into a map token, so a creature looks
// and fights the same whether it was dropped from the monster browser or
// spawned by a prepped story beat.

export const TOKEN_COLORS = ['#8a3d3d', '#3d6a8a', '#6a8a3d', '#8a6a3d', '#7a3d8a', '#3d8a7a'];

export const sizeToCells = (size) =>
  size === 'Large' ? 2 : size === 'Huge' ? 3 : size === 'Gargantuan' ? 4 : 1;

export function tokenFromMonster(m, { color, label, hidden = false } = {}) {
  if (!m) return null;
  const ac = Array.isArray(m.armor_class) && m.armor_class.length ? m.armor_class[0].value : 10;
  const attackAction = (m.actions || []).find((a) => a.attack_bonus !== undefined && a.damage && a.damage.length);
  const dmg = attackAction && (attackAction.damage.find((d) => d.damage_dice) || attackAction.damage[0]);
  const walk = parseInt(String((m.speed && m.speed.walk) || '30'), 10) || 30;

  return {
    kind: 'monster',
    label: label || m.name,
    monsterIndex: m.index,
    monsterType: m.type || null,
    art: artKeyForMonster({ name: m.name, type: m.type, index: m.index }),
    color: color || TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)],
    hp: m.hit_points,
    maxHp: m.hit_points,
    ac,
    size: sizeToCells(m.size),
    speedCells: Math.max(1, Math.round(walk / 5)),
    xpValue: m.xp,
    hidden,
    attack: attackAction
      ? {
          name: attackAction.name,
          bonus: attackAction.attack_bonus,
          damage: (dmg && dmg.damage_dice) || '1d4',
          damageType: dmg && dmg.damage_type ? dmg.damage_type.name.toLowerCase() : 'bludgeoning',
        }
      : null,
  };
}

/** Label a group so "Goblin" x3 reads as Goblin 1 / 2 / 3 on the map. */
export const numberedLabel = (name, i, total) => (total > 1 ? `${name} ${i + 1}` : name);
