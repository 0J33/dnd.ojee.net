import React, { useEffect, useState } from 'react';
import { ModalOverlay } from '../utils';
import { ChevronLeft, ChevronRight } from './Icons';

const PAGES = [
  {
    title: 'What is D&D?',
    body: (
      <>
        <p>Dungeons & Dragons is a game of collaborative storytelling. Together you tell a story about a band of heroes exploring a fantasy world - and dice decide the uncertain moments.</p>
        <p>One person is the <strong>Dungeon Master (DM)</strong>: they describe the world, play every monster and townsperson, and referee the rules. Everyone else plays one <strong>hero</strong> (a "player character").</p>
        <p>Nobody wins or loses. The fun is the shared adventure. If your group is brand new, use <strong>Learn to Play</strong> on the home screen - the app plays the DM for a first quest and teaches you everything.</p>
        <p className="muted">This guide is always here (the Guide button). Skim it, or read it as you play.</p>
      </>
    ),
  },
  {
    title: 'The core roll',
    body: (
      <>
        <p>Almost everything uses one move: roll a twenty-sided die (<strong>d20</strong>) and add a modifier.</p>
        <p className="rule-box"><strong>d20 + ability modifier + proficiency (if you're good at it)</strong> versus a target number.</p>
        <ul>
          <li><strong>Ability check</strong> - trying something uncertain (climb, persuade, sneak). Beat the DM's <em>Difficulty Class</em> (Easy 10, Medium 15, Hard 20).</li>
          <li><strong>Attack roll</strong> - hitting something. Meet or beat its <em>Armor Class</em>.</li>
          <li><strong>Saving throw</strong> - resisting danger (a trap, a spell, poison).</li>
        </ul>
        <p>Here you rarely do the math: <strong>click a stat on your sheet</strong> and it rolls with the right bonus.</p>
      </>
    ),
  },
  {
    title: 'Advantage & disadvantage',
    body: (
      <>
        <p>Sometimes the situation helps or hurts you. Then you roll <strong>two d20s</strong> instead of one:</p>
        <ul>
          <li><strong>Advantage</strong> - keep the higher die. (You're flanking, hidden, or aided.)</li>
          <li><strong>Disadvantage</strong> - keep the lower die. (You're blinded, prone, poisoned...)</li>
        </ul>
        <p>They don't stack - two sources of advantage is still just one extra die. And one advantage + one disadvantage cancel out to a normal roll.</p>
        <p>In the dice tray at the bottom of the table, tap <kbd>ADV</kbd> or <kbd>DIS</kbd> before rolling.</p>
      </>
    ),
  },
  {
    title: 'Your character sheet',
    body: (
      <>
        <p>Your sheet holds everything about your hero. The big ideas:</p>
        <ul>
          <li><strong>Six abilities</strong> (STR, DEX, CON, INT, WIS, CHA) - your raw talents. Each gives a <em>modifier</em> you add to rolls.</li>
          <li><strong>Skills</strong> - specific things like Stealth or Persuasion. A filled dot means you're proficient (add your proficiency bonus).</li>
          <li><strong>HP</strong> (hit points) - your health. <strong>AC</strong> (armor class) - how hard you are to hit.</li>
          <li><strong>Attacks</strong> and, for some, <strong>Spells</strong>.</li>
        </ul>
        <p>Click any ability, skill, save, or attack to roll it. Everything recalculates automatically as you level up or change gear.</p>
      </>
    ),
  },
  {
    title: 'Making a character',
    body: (
      <>
        <p>Four choices define a hero, and the builder walks you through each:</p>
        <ul>
          <li><strong>Race</strong> (ancestry) - dwarf, elf, human... sets size, speed, and knacks.</li>
          <li><strong>Class</strong> (profession) - fighter, wizard, rogue... how you contribute.</li>
          <li><strong>Background</strong> - your past life; grants skills and a story hook.</li>
          <li><strong>Ability scores</strong> - use the recommended <em>standard array</em> to start.</li>
        </ul>
        <p>In a hurry or unsure? Pick a <strong>ready-made hero</strong> - fully built, balanced, and annotated with tips. You can always build a custom one later.</p>
      </>
    ),
  },
  {
    title: 'Combat',
    body: (
      <>
        <p>When a fight starts, everyone rolls <strong>initiative</strong> (one d20 + DEX) to set the turn order for the whole fight. A <strong>round</strong> is everyone acting once - about 6 seconds of story time.</p>
        <p>On your turn you may:</p>
        <ul>
          <li><strong>Move</strong> up to your speed (30 ft = 6 squares). Drag your token.</li>
          <li>Take <strong>one action</strong> - usually Attack or Cast a Spell (full list under Rules).</li>
          <li>Maybe a <strong>bonus action</strong>, if a feature grants one.</li>
        </ul>
        <p>Attack: click it on your sheet (d20 vs their AC), and on a hit click the damage. A natural 20 is a <strong>critical hit</strong> - double the damage dice!</p>
        <p>Press <strong>Next turn</strong> when you're done. The DM (or the app, in guided mode) runs the monsters.</p>
      </>
    ),
  },
  {
    title: 'Getting hurt & healing',
    body: (
      <>
        <p>Damage lowers your HP. Hit <strong>0 HP</strong> and you fall unconscious and start rolling <strong>death saves</strong> at the start of your turns: 10+ is a success. Three successes and you're stable; three failures and you die. A natural 20 wakes you at 1 HP!</p>
        <p>The good news: <strong>any healing</strong> - a potion (2d4+2), a Cure Wounds spell, even 1 HP - brings an unconscious ally right back up. Never leave a friend down.</p>
        <p><strong>Rests</strong> restore you too. A <em>short rest</em> (1 hour) lets you spend Hit Dice to heal. A <em>long rest</em> (8 hours) restores all HP and your spell slots.</p>
      </>
    ),
  },
  {
    title: 'Magic',
    body: (
      <>
        <p>Casters (wizard, cleric, bard, druid, sorcerer, warlock, and part-time paladin/ranger) have a Spells tab.</p>
        <ul>
          <li><strong>Cantrips</strong> are minor spells you can cast forever, at will.</li>
          <li><strong>Leveled spells</strong> spend a <strong>spell slot</strong> - you get them back on a long rest. Click a slot pip to spend it.</li>
          <li>Open a spell to read it and cast with one click - the app spends the slot and rolls the dice.</li>
        </ul>
        <p>Your <strong>spell save DC</strong> is how hard your spells are to resist; your <strong>spell attack</strong> is how you hit with them. Both are shown at the top of the Spells tab.</p>
      </>
    ),
  },
  {
    title: 'The table & tools',
    body: (
      <>
        <p>The map is your shared play space:</p>
        <ul>
          <li><strong>Move</strong>: drag your token. Scroll to zoom, drag empty space to pan.</li>
          <li><strong>Ping</strong>: double-click a spot to flash it for everyone.</li>
          <li><strong>Measure</strong>: distance in feet (1 square = 5 ft).</li>
          <li><strong>Draw</strong>: sketch on the map. <strong>Dice tray</strong>: roll anything - tap a die, or type <kbd>2d6+3</kbd>.</li>
          <li><strong>Chat</strong>: talk in character; type <kbd>/r 1d20+5</kbd> to roll inline, and whisper the DM privately.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Playing together',
    body: (
      <>
        <p>Start or open a <strong>campaign</strong> and share its 6-letter <strong>code</strong> (or the invite link - tap the code up top to copy it). Friends log in, enter the code, and pick a hero.</p>
        <p>Everyone sees the same map in real time. You control your own token and sheet; the DM controls the world. You can leave and come back any time - your campaign is saved.</p>
        <p className="muted">Tip: one screen per person works best, but you can also gather around one screen and pass it around.</p>
      </>
    ),
  },
  {
    title: 'Being the Dungeon Master',
    body: (
      <>
        <p>Ready to run your own game? Create a campaign in <strong>"I'll be the DM"</strong> mode. Your job is to narrate and referee - and it's more fun than it sounds.</p>
        <ul>
          <li><strong>Prep a scene</strong>: the Scenes button has ready-made maps (taprooms, caverns, forests) or blank grids and image URLs.</li>
          <li><strong>Add monsters</strong>: the Monsters library has every SRD creature - drop them on the map, and the encounter-budget hint keeps fights fair.</li>
          <li><strong>Run combat</strong>: press Combat, have everyone roll initiative, roll for your monsters, and use the sword auto button (or their stat block) to act.</li>
          <li><strong>Fog of war</strong>: hide unexplored map and reveal it as they go.</li>
          <li><strong>Reward them</strong>: award XP or just tell them to level up at big story moments (both work).</li>
        </ul>
        <p>Golden rule: when in doubt, make a call, keep it moving, and say "yes, and..." to your players' ideas. The best adventures come from their choices.</p>
      </>
    ),
  },
  {
    title: '2014 vs 2024 rules',
    body: (
      <>
        <p>dnd.ojee.net uses the freely-licensed <strong>5e System Reference Document</strong>. The core math (d20 + modifier, advantage, HP, spell slots) is identical between the 2014 and 2024 versions, so anything you read or watch to learn 5e applies here.</p>
        <p>A few things changed in the 2024 revision (surprise, the exact Hide rules, grapple, "Heroic Inspiration" as a reroll, weapon mastery). If a video or book differs slightly from what you see here, that's why - it won't affect a beginner game.</p>
        <p className="muted">dnd.ojee.net is an unofficial, fan-made tool, compatible with fifth edition. See "licenses & credits" on the home screen.</p>
      </>
    ),
  },
];

export default function Guide({ onClose }) {
  const [page, setPage] = useState(0);
  const go = (d) => setPage((p) => Math.max(0, Math.min(PAGES.length - 1, p + d)));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const p = PAGES[page];
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal guide-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{p.title}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="guide-body">{p.body}</div>
        <div className="guide-foot">
          <button className="icon-btn" disabled={page === 0} onClick={() => go(-1)}><ChevronLeft /></button>
          <div className="guide-dots">
            {PAGES.map((_, i) => (
              <button key={i} className={`guide-dot ${i === page ? 'on' : ''}`} onClick={() => setPage(i)} title={PAGES[i].title} />
            ))}
          </div>
          <button className="icon-btn" disabled={page === PAGES.length - 1} onClick={() => go(1)}><ChevronRight /></button>
        </div>
      </div>
    </ModalOverlay>
  );
}
