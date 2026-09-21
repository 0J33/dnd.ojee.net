const srd = require('../srd/store');
const { executeRoll } = require('./dice');
const { findToken, addLog } = require('./roomState');

// Minimal monster-turn automation for guided mode (and a DM convenience).
// Strategy: pick the nearest living PC, walk toward it (blocked by walls),
// attack if adjacent. Attack data comes from the token override or the SRD
// stat block's first attack action.

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function isWall(scene, x, y) {
  if (x < 0 || y < 0 || x >= scene.grid.w || y >= scene.grid.h) return true;
  if (!scene.cells) return false;
  const row = scene.cells[y] || '';
  const ch = row[x] || '.';
  return ch === '#' || ch === '_';
}

function occupied(scene, x, y, ignoreId) {
  return scene.tokens.some((t) => t.id !== ignoreId && !t.dead && t.x === x && t.y === y);
}

function getAttack(token) {
  if (token.attack) return token.attack;
  if (token.monsterIndex) {
    const monster = srd.byIndex.monsters.get(token.monsterIndex);
    if (monster) {
      const action = (monster.actions || []).find((a) => a.attack_bonus !== undefined && a.damage && a.damage.length);
      if (action) {
        const dmg = action.damage.find((d) => d.damage_dice) || action.damage[0];
        return {
          name: action.name,
          bonus: action.attack_bonus,
          damage: dmg.damage_dice || '1d4',
          damageType: dmg.damage_type ? dmg.damage_type.name.toLowerCase() : 'bludgeoning',
        };
      }
    }
  }
  return { name: 'Claw', bonus: 3, damage: '1d6+1', damageType: 'slashing' };
}

function getSpeedCells(token) {
  if (token.speedCells) return token.speedCells;
  if (token.monsterIndex) {
    const monster = srd.byIndex.monsters.get(token.monsterIndex);
    if (monster && monster.speed && monster.speed.walk) {
      const ft = parseInt(monster.speed.walk, 10);
      if (!Number.isNaN(ft)) return Math.max(1, Math.floor(ft / 5));
    }
  }
  return 6;
}

function livingPcTargets(room, scene) {
  return scene.tokens.filter((t) => {
    if (t.kind !== 'pc' || t.dead) return false;
    const sheet = t.characterId ? room.charSheets[t.characterId] : null;
    if (sheet && sheet.derived && sheet.currentHp !== undefined) return sheet.currentHp > 0;
    if (sheet && sheet.currentHp !== undefined) return sheet.currentHp > 0;
    return true;
  });
}

function pcAc(room, token) {
  const sheet = token.characterId ? room.charSheets[token.characterId] : null;
  if (sheet && sheet.derived && sheet.derived.ac) return sheet.derived.ac;
  return token.ac || 10;
}

// Executes one monster turn. Returns a list of effects for the caller to apply
// side-channel events for (hp changes already applied to room state here).
function runMonsterTurn(room, scene, tokenId) {
  const { token } = findToken(room, tokenId);
  if (!token || token.dead) return { moved: false, events: [] };

  const events = [];
  const targets = livingPcTargets(room, scene);
  if (!targets.length) {
    addLog(room, { type: 'info', text: `${token.label} looks around - no one left to fight.` });
    return { moved: false, events };
  }

  let target = targets[0];
  let best = Infinity;
  for (const t of targets) {
    const d = cheb(token, t);
    if (d < best) {
      best = d;
      target = t;
    }
  }

  // Move toward target until adjacent (Chebyshev 1) or out of speed.
  let steps = getSpeedCells(token);
  let moved = false;
  let guard = 0;
  while (cheb(token, target) > 1 && steps > 0 && guard++ < 30) {
    const dx = Math.sign(target.x - token.x);
    const dy = Math.sign(target.y - token.y);
    const options = [
      { x: token.x + dx, y: token.y + dy },
      { x: token.x + dx, y: token.y },
      { x: token.x, y: token.y + dy },
    ];
    const step = options.find((o) => (o.x !== token.x || o.y !== token.y) && !isWall(scene, o.x, o.y) && !occupied(scene, o.x, o.y, token.id));
    if (!step) break;
    token.x = step.x;
    token.y = step.y;
    steps -= 1;
    moved = true;
  }

  if (cheb(token, target) > 1) {
    addLog(room, { type: 'combat', text: `${token.label} moves toward ${target.label}.` });
    return { moved, events };
  }

  // Attack!
  const attack = getAttack(token);
  const ac = pcAc(room, target);
  const attackRoll = executeRoll(`1d20+${attack.bonus}`, 'normal');
  const isCrit = attackRoll.natural === 20;
  const isMiss = attackRoll.natural === 1 || (!isCrit && attackRoll.total < ac);

  events.push({
    kind: 'monsterAttackRoll',
    tokenId: token.id,
    targetTokenId: target.id,
    attackName: attack.name,
    roll: attackRoll,
    targetAc: ac,
    hit: !isMiss,
    crit: isCrit,
  });

  if (isMiss) {
    addLog(room, {
      type: 'combat',
      text: `${token.label} attacks ${target.label} with ${attack.name}: rolled ${attackRoll.total} vs AC ${ac} - MISS!`,
      roll: attackRoll,
    });
    return { moved, events };
  }

  let dmgFormula = attack.damage;
  if (isCrit) {
    // double the dice terms (crude but correct enough: prepend the dice again)
    const diceOnly = dmgFormula.match(/(\d*)d(\d+)/);
    if (diceOnly) dmgFormula = `${diceOnly[0]}+${dmgFormula}`;
  }
  const dmgRoll = executeRoll(dmgFormula, 'normal');
  const dmg = Math.max(1, dmgRoll.total);

  const sheet = target.characterId ? room.charSheets[target.characterId] : null;
  if (sheet) {
    const before = sheet.currentHp ?? 0;
    let remaining = dmg;
    if (sheet.tempHp && sheet.tempHp > 0) {
      const absorbed = Math.min(sheet.tempHp, remaining);
      sheet.tempHp -= absorbed;
      remaining -= absorbed;
    }
    sheet.currentHp = Math.max(0, before - remaining);
    events.push({ kind: 'pcDamaged', characterId: target.characterId, tokenId: target.id, amount: dmg, currentHp: sheet.currentHp });
    addLog(room, {
      type: 'combat',
      text: `${token.label} HITS ${target.label} with ${attack.name}${isCrit ? ' (CRITICAL!)' : ''}: ${dmg} ${attack.damageType} damage. ${target.label} is at ${sheet.currentHp} HP${sheet.currentHp === 0 ? ' and falls unconscious!' : '.'}`,
      roll: dmgRoll,
    });
  } else {
    target.hp = Math.max(0, (target.hp || 1) - dmg);
    if (target.hp === 0) target.dead = true;
    addLog(room, { type: 'combat', text: `${token.label} hits ${target.label} for ${dmg} damage.` });
  }

  return { moved: true, events };
}

module.exports = { runMonsterTurn, cheb };
