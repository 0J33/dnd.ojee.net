import React, { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import { VolumeIcon, MuteIcon, XIcon } from './Icons';

// Music, effects and ambience: a volume and a mute each. Remembered in this browser.
const ROWS = [
  { key: 'music', name: 'Music', hint: 'Follows the action: exploring, sneaking, battle, boss fights, resting.' },
  { key: 'sfx', name: 'Sound effects', hint: 'Swords, spells, doors, traps, dice.' },
  { key: 'ambience', name: 'Ambience', hint: 'The place itself: wind, birds, drips, fire, rain.' },
];

export default function SoundSettings({ onClose }) {
  const [s, setS] = useState(audio.settings);
  useEffect(() => audio.onChange(setS), []);
  return (
    <div className="sound-panel panel" role="dialog" aria-label="Sound" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sound-head"><h4>Sound</h4><button className="close-btn" onClick={onClose} aria-label="Close"><XIcon size={14} /></button></div>
      {ROWS.map((r) => {
        const v = s[r.key];
        return (
          <div key={r.key} className="sound-row">
            <div className="sound-top">
              <span>{r.name}</span>
              <span className="sound-val">{v.muted ? 'Muted' : `${Math.round(v.vol * 100)}%`}</span>
            </div>
            <div className="sound-ctl">
              <button className={`icon-btn ${v.muted ? 'danger-btn' : 'ghost-btn'}`} onClick={() => { audio.unlock(); audio.set(r.key, { muted: !v.muted }); }} aria-pressed={v.muted} aria-label={v.muted ? `Unmute ${r.name}` : `Mute ${r.name}`} title={v.muted ? 'Unmute' : 'Mute'}>
                {v.muted ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
              </button>
              <input type="range" min="0" max="1" step="0.01" value={v.vol} disabled={v.muted} onChange={(e) => { audio.unlock(); audio.set(r.key, { vol: +e.target.value }); }} aria-label={`${r.name} volume`} />
            </div>
            <span className="sound-hint">{r.hint}</span>
          </div>
        );
      })}
    </div>
  );
}
