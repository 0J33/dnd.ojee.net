import React, { useEffect, useState } from 'react';
import { srd } from '../api';
import { ModalOverlay } from '../utils';
import { CONDITIONS } from '../rules/engine';
import { ConditionIcon, XIcon } from './Icons';

const ACTIONS = [
  { name: 'Attack', desc: 'Make one attack with a weapon or unarmed strike. Roll d20 + your attack bonus vs the target\'s AC. Hit = roll damage.' },
  { name: 'Cast a Spell', desc: 'Cast a spell you know/have prepared with a casting time of 1 action. Cantrips are free; leveled spells spend a spell slot.' },
  { name: 'Dash', desc: 'Gain extra movement equal to your speed this turn (move twice as far).' },
  { name: 'Disengage', desc: 'Your movement doesn\'t provoke opportunity attacks this turn. Use it to retreat safely.' },
  { name: 'Dodge', desc: 'Until your next turn: attacks against you have disadvantage; you make DEX saves with advantage.' },
  { name: 'Help', desc: 'Give an ally advantage on their next ability check, or on their next attack against a creature within 5 ft of you.' },
  { name: 'Hide', desc: 'Make a Stealth check. If you beat their Perception, they can\'t see you - your next attack has advantage.' },
  { name: 'Ready', desc: 'Prepare an action with a trigger ("if the goblin comes through the door, I shoot"). Uses your reaction when triggered.' },
  { name: 'Search', desc: 'Devote your turn to finding something: usually a Perception or Investigation check.' },
  { name: 'Use an Object', desc: 'Drink a potion, pull a lever, throw a torch - interact with a second object this turn.' },
];

const CHEATS = [
  { title: 'Your turn in combat', lines: ['Move up to your speed (30 ft = 6 squares, split freely)', 'Take ONE action (see the action list)', 'Maybe a bonus action, if a feature grants one', 'One free object interaction (draw a sword, open a door)', 'One reaction per ROUND (opportunity attacks, Shield...)'] },
  { title: 'The core roll', lines: ['d20 + ability modifier + proficiency (if proficient)', 'Meet or beat the target number (DC or AC) = success', 'Advantage: roll 2d20 keep higher. Disadvantage: keep lower', 'Natural 20 on an attack = critical hit: double the damage dice!'] },
  { title: 'Typical DCs', lines: ['Very easy 5 · Easy 10 · Medium 15', 'Hard 20 · Very hard 25 · Nearly impossible 30'] },
  { title: 'Dropping to 0 HP', lines: ['You fall unconscious and start making death saves', 'd20: 10+ = success, 9 or less = failure', '3 successes = stable · 3 failures = dead', 'Nat 20 = wake up with 1 HP · Nat 1 = two failures', 'ANY healing wakes you right up'] },
  { title: 'Cover', lines: ['Half cover: +2 AC and DEX saves', 'Three-quarters cover: +5', 'Total cover: can\'t be targeted directly'] },
  { title: 'Resting', lines: ['Short rest (1h): spend Hit Dice to heal', 'Long rest (8h): full HP, spell slots, half your Hit Dice back', 'One long rest per 24 hours'] },
];

export default function ReferencePanel({ onClose }) {
  const [tab, setTab] = useState('cheat');
  const [conditionDetails, setConditionDetails] = useState({});

  useEffect(() => {
    if (tab === 'conditions') {
      srd.conditions().then((list) => {
        if (Array.isArray(list)) {
          const map = {};
          for (const c of list) map[c.index] = (c.desc || []).join(' ');
          setConditionDetails(map);
        }
      });
    }
  }, [tab]);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Rules reference</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="tab-row" style={{ padding: '0 18px' }}>
          <button className={tab === 'cheat' ? 'active' : ''} onClick={() => setTab('cheat')}>Cheat sheet</button>
          <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>Actions</button>
          <button className={tab === 'conditions' ? 'active' : ''} onClick={() => setTab('conditions')}>Conditions</button>
        </div>
        <div className="modal-body">
          {tab === 'cheat' && (
            <div className="cheat-grid">
              {CHEATS.map((c) => (
                <div key={c.title} className="cheat-card">
                  <h4>{c.title}</h4>
                  <ul>{c.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
          {tab === 'actions' && (
            <div>
              <p className="muted small">On your turn you move + take ONE of these actions:</p>
              {ACTIONS.map((a) => (
                <p key={a.name} className="small" style={{ margin: '8px 0' }}>
                  <strong className="gold-text">{a.name}.</strong> {a.desc}
                </p>
              ))}
            </div>
          )}
          {tab === 'conditions' && (
            <div>
              {CONDITIONS.filter((c) => c.index !== 'concentrating').map((c) => (
                <details key={c.index} className="feature-item" style={{ marginBottom: 6 }}>
                  <summary><span className="cond-glyph"><ConditionIcon index={c.index} size={16} /></span> <strong>{c.name}</strong> <span className="muted small">- {c.brief}</span></summary>
                  <p className="small">{conditionDetails[c.index] || c.brief}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
