// A race as the character actually gets it: the base race with the chosen
// subrace (heritage, chassis, ancestry...) folded in.
//
// Race records come from /api/srd/races/:index, the same shape for SRD and
// expansion races (server/srd/store.js has the field list).

import { ABILITIES } from './engine';

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

export function resolveRace(race, subraceIndex) {
  if (!race) return null;
  const sub = (race.subraces || []).find((s) => s.index === subraceIndex) || null;
  const replaced = sub?.replaces_traits || [];

  const ability_bonuses = { ...(sub?.replaces_ability ? {} : race.ability_bonuses) };
  for (const [a, b] of Object.entries(sub?.ability_bonuses || {})) ability_bonuses[a] = (ability_bonuses[a] || 0) + b;

  const both = (key) => [...(race[key] || []), ...(sub?.[key] || [])];
  return {
    race,
    sub,
    name: sub?.display || race.name,
    size: sub?.size || race.size,
    speed: sub?.speed || race.speed,
    darkvision: sub?.darkvision ?? race.darkvision ?? 0,
    ability_bonuses,
    ability_choices: [...(sub?.replaces_ability ? [] : race.ability_choices || []), ...(sub?.ability_choices || [])],
    skills: uniq(both('skills')),
    skill_choices: both('skill_choices'),
    weapon_profs: uniq(both('weapon_profs')),
    armor_profs: uniq(both('armor_profs')),
    tool_profs: uniq(both('tool_profs')),
    languages: uniq(both('languages')),
    language_notes: uniq([race.language_note, sub?.language_note]),
    natural_attacks: both('natural_attacks'),
    hp_per_level: (race.hp_per_level || 0) + (sub?.hp_per_level || 0),
    traits: [
      ...(race.traits || []).filter((t) => !replaced.includes(t.name)).map((t) => ({ ...t, source: race.name })),
      ...(sub?.traits || []).map((t) => ({ ...t, source: sub.display || sub.name })),
    ],
  };
}

/** Does this race still need a subrace picked? */
export function needsSubrace(race, subraceIndex) {
  if (!race || !(race.subraces || []).length || race.subrace_optional) return false;
  return !(race.subraces || []).some((s) => s.index === subraceIndex);
}

/** The abilities a choice group may pick from. */
export function choicePool(choice) {
  return (choice.from || ABILITIES).filter((a) => !(choice.exclude || []).includes(a));
}

/** Total racial bonuses: fixed ones plus each choice group's picks. */
export function racialBonuses(resolved, picks = []) {
  const out = { ...(resolved?.ability_bonuses || {}) };
  (resolved?.ability_choices || []).forEach((c, i) => {
    for (const a of picks[i] || []) out[a] = (out[a] || 0) + c.bonus;
  });
  return out;
}

export const choicesComplete = (choices, picks) => (choices || []).every((c, i) => (picks[i] || []).length === c.choose);
