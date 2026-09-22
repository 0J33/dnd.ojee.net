import React, { useEffect, useMemo, useState } from 'react';
import { srd } from '../api';
import { ModalOverlay } from '../utils';
import { formatCr, mod, fmtMod, ENCOUNTER_BUDGET } from '../rules/engine';
import { tokenFromMonster } from '../rules/tokens';
import { Avatar, artKeyForMonster } from './Portrait';
import { SwordIcon, PlusIcon, XIcon, SearchIcon } from './Icons';

export function MonsterBrowser({ onClose, onAddToken, onRoll, party, sceneMonsters }) {
  const [search, setSearch] = useState('');
  const [crMax, setCrMax] = useState(''); // default: show all CRs so nothing is hidden
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    // When searching, ignore the CR cap so a query finds monsters of any CR
    // (otherwise typing "ogre" while capped at CR 1 shows nothing).
    if (crMax !== '' && !search) params.set('crMax', crMax);
    setStatus('loading');
    srd.monsters(`?${params.toString()}`)
      .then((res) => {
        if (!live) return;
        if (Array.isArray(res)) {
          setList(res);
          setStatus('ready');
        } else setStatus('error');
      })
      .catch(() => live && setStatus('error'));
    return () => { live = false; };
  }, [search, crMax]);

  // encounter budget helper
  const budget = useMemo(() => {
    const levels = party.map((p) => p.level || 1);
    if (!levels.length) return null;
    const sum = { low: 0, moderate: 0, high: 0 };
    for (const lvl of levels) {
      const row = ENCOUNTER_BUDGET[Math.min(10, Math.max(1, lvl))];
      sum.low += row.low;
      sum.moderate += row.moderate;
      sum.high += row.high;
    }
    return sum;
  }, [party]);
  const spentXp = sceneMonsters.reduce((sum, t) => sum + (t.xpValue || 0), 0);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal monster-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Monsters{status === 'ready' ? ` (${list.length})` : ''}</h3>
          {budget && (
            <span className="muted small" title="2024 encounter budget for the current party. Low = warm-up, Moderate = real fight, High = dangerous.">
              Budget: {budget.low} / {budget.moderate} / {budget.high} XP · on map: <strong className={spentXp > budget.high ? 'gold-text' : ''}>{spentXp} XP</strong>
            </span>
          )}
          <button className="close-btn" aria-label="Close the monster library" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="monster-body">
          <div className="monster-list-col">
            <div className="row" style={{ padding: '10px 12px 6px' }}>
              <input placeholder="Search monsters..." aria-label="Search monsters" value={search} onChange={(e) => setSearch(e.target.value)} className="grow" />
              <select value={crMax} onChange={(e) => setCrMax(e.target.value)} title="Max challenge rating" aria-label="Highest challenge rating">
                <option value="0.25">CR ≤ 1/4</option>
                <option value="0.5">CR ≤ 1/2</option>
                <option value="1">CR ≤ 1</option>
                <option value="3">CR ≤ 3</option>
                <option value="8">CR ≤ 8</option>
                <option value="">Any CR</option>
              </select>
            </div>
            <div className="monster-list">
              {status === 'error' && <p className="muted center" style={{ padding: 24 }}>Couldn't load the monster list. Check your connection and try again.</p>}
              {status === 'loading' && !list.length && <p className="muted center" style={{ padding: 24 }}>Loading monsters…</p>}
              {status === 'ready' && !list.length && (
                <p className="muted center" style={{ padding: 24 }}>
                  {search ? `No monsters match "${search}".` : 'No monsters at this challenge rating.'}
                </p>
              )}
              {status !== 'error' && list.map((m) => (
                <button key={m.index} className={`monster-row ${selected === m.index ? 'on' : ''}`} onClick={() => setSelected(m.index)}>
                  <Avatar art={artKeyForMonster(m)} name={m.name} color="#8a3d3d" size={26} shape="square" ring={false} />
                  <span className="grow">{m.name}</span>
                  <span className="chip">CR {formatCr(m.cr)}</span>
                  <span className="muted small">{m.hp} hp</span>
                </button>
              ))}
            </div>
          </div>
          <div className="monster-detail-col">
            {selected ? (
              <StatBlock index={selected} onAddToken={onAddToken} onRoll={onRoll} />
            ) : (
              <p className="muted center" style={{ padding: 40 }}>Select a monster to view its stat block.</p>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

export function StatBlock({ index, onAddToken, onRoll }) {
  const [m, setM] = useState(null);
  const [failed, setFailed] = useState(false);
  const [added, setAdded] = useState(0);
  useEffect(() => {
    setM(null);
    setFailed(false);
    setAdded(0);
    srd.monster(index)
      .then((res) => (res && !res.error ? setM(res) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [index]);

  if (failed) return <p className="muted center" style={{ padding: 40 }}>Couldn't load this stat block. Try picking it again.</p>;
  if (!m) return <p className="muted center" style={{ padding: 40 }}>Loading…</p>;

  const ac = Array.isArray(m.armor_class) && m.armor_class.length ? m.armor_class[0].value : 10;
  const abilities = [
    ['STR', m.strength], ['DEX', m.dexterity], ['CON', m.constitution],
    ['INT', m.intelligence], ['WIS', m.wisdom], ['CHA', m.charisma],
  ];

  const addToMap = () => {
    onAddToken(tokenFromMonster(m));
    setAdded((n) => n + 1);
  };

  return (
    <div className="statblock">
      <div className="row spread">
        <div className="row" style={{ gap: 10 }}>
          <Avatar art={artKeyForMonster(m)} name={m.name} color="#8a3d3d" size={48} shape="square" />
          <div>
          <h3 className="statblock-name">{m.name}</h3>
          <p className="muted small">{m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ''}, {m.alignment}</p>
          </div>
        </div>
        {onAddToken && (
          <div className="row" style={{ gap: 8 }}>
            {added > 0 && <span className="chip gold" role="status">{added === 1 ? 'Added' : `Added ${added}`}</span>}
            <button className="primary-btn small-btn" onClick={addToMap}><PlusIcon size={12} /> {added ? 'Add another' : 'Add to map'}</button>
          </div>
        )}
      </div>
      <hr className="ornament-line" />
      <p className="small">
        <strong>AC</strong> {ac} · <strong>HP</strong> {m.hit_points} ({m.hit_points_roll || m.hit_dice}) ·{' '}
        <strong>Speed</strong> {Object.entries(m.speed || {}).map(([k, v]) => `${k} ${v}`).join(', ')}
      </p>
      <div className="statblock-abilities">
        {abilities.map(([name, score]) => (
          <div key={name} className="sb-ability">
            <span>{name}</span>
            <strong>{score}</strong>
            <em>({fmtMod(mod(score))})</em>
          </div>
        ))}
      </div>
      <p className="small">
        {m.proficiencies?.length > 0 && <><strong>Skills/saves:</strong> {m.proficiencies.map((p) => `${p.proficiency.name.replace('Skill: ', '').replace('Saving Throw: ', '')} +${p.value}`).join(', ')} · </>}
        {m.damage_resistances?.length > 0 && <><strong>Resists:</strong> {m.damage_resistances.join(', ')} · </>}
        {m.damage_immunities?.length > 0 && <><strong>Immune:</strong> {m.damage_immunities.join(', ')} · </>}
        <strong>Senses:</strong> {Object.entries(m.senses || {}).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')} ·{' '}
        <strong>CR</strong> {formatCr(m.challenge_rating)} ({m.xp} XP)
      </p>
      {(m.special_abilities || []).map((a) => (
        <p key={a.name} className="small sb-trait"><strong><em>{a.name}.</em></strong> {a.desc}</p>
      ))}
      <h4 className="mt">Actions</h4>
      {(m.actions || []).map((a) => (
        <div key={a.name} className="sb-action">
          <p className="small"><strong><em>{a.name}.</em></strong> {a.desc}</p>
          {onRoll && a.attack_bonus !== undefined && (
            <div className="row" style={{ gap: 6 }}>
              <button className="small-btn" onClick={() => onRoll({ formula: `1d20+${a.attack_bonus}`, label: `${m.name}: ${a.name} attack` })}>
                <SwordIcon size={11} /> Attack {fmtMod(a.attack_bonus)}
              </button>
              {(a.damage || []).filter((d) => d.damage_dice).map((d, i) => (
                <button key={i} className="small-btn attack-dmg" onClick={() => onRoll({ formula: d.damage_dice.replace(/\s/g, ''), label: `${m.name}: ${a.name} damage` })}>
                  {d.damage_dice} {d.damage_type ? d.damage_type.name.toLowerCase() : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {(m.legendary_actions || []).length > 0 && (
        <>
          <h4 className="mt">Legendary actions</h4>
          {m.legendary_actions.map((a) => (
            <p key={a.name} className="small sb-trait"><strong><em>{a.name}.</em></strong> {a.desc}</p>
          ))}
        </>
      )}
    </div>
  );
}
