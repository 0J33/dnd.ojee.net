import React from 'react';
import { socket } from '../socket';
import { QUICK_CAMPAIGNS, buildQuickCampaign } from '../data/presets';
import { MinusIcon, PlusIcon } from './Icons';
import '../styles/dmquick.css';

// A short campaign from a theme in two clicks: pick the story, pick the
// party's level. Used when a campaign is created (Lobby) and from Prep.

/**
 * Send a built quick campaign to the table: its scenes (with their people and
 * mood), one story beat per scene with the fight waiting there, a chest at the
 * end. Takes the table to the first scene; `replaceSceneId` (the blank table a
 * new campaign starts with) is removed once the new scenes exist.
 */
export function applyQuickCampaign(built, { replaceSceneId = null, go = true } = {}) {
  return new Promise((resolve) => {
    const scenes = built.scenes.map(({ mood, ...payload }) => payload);
    socket.emit('addScenes', { scenes }, (added) => {
      const ids = added?.sceneIds || [];
      ids.forEach((id, i) => socket.emit('updateScene', { sceneId: id, patch: { mood: built.scenes[i].mood } }));
      for (const b of built.beats) {
        socket.emit('addBeat', { title: b.title, sceneId: ids[b.scene] || null, readAloud: b.readAloud, notes: b.notes, encounter: b.encounter });
      }
      for (const t of built.things) if (ids[t.scene]) socket.emit('placeObject', { sceneId: ids[t.scene], object: t.object });
      if (go && ids[0]) socket.emit('switchScene', { sceneId: ids[0] });
      if (replaceSceneId && ids.length) socket.emit('deleteScene', { sceneId: replaceSceneId });
      resolve(ids);
    });
  });
}

export { buildQuickCampaign };

export function QuickCampaignPicker({ value, level, onPick, onLevel }) {
  return (
    <div className="qc-pick">
      <div className="pack-pick" role="group" aria-label="Story">
        {QUICK_CAMPAIGNS.map((c) => (
          <button type="button" key={c.key} className={`pack-card ${value === c.key ? 'selected' : ''}`} aria-pressed={value === c.key} onClick={() => onPick(c.key)}>
            <strong>{c.name}</strong>
            <span className="muted small">{c.blurb}</span>
          </button>
        ))}
      </div>
      <div className="qc-level">
        <label className="field-label">Heroes' level</label>
        <span className="qdm-step">
          <button type="button" className="icon-btn ghost-btn" aria-label="Lower level" disabled={level <= 1} onClick={() => onLevel(level - 1)}><MinusIcon size={13} /></button>
          <b>{level}</b>
          <button type="button" className="icon-btn ghost-btn" aria-label="Higher level" disabled={level >= 10} onClick={() => onLevel(level + 1)}><PlusIcon size={13} /></button>
        </span>
        <p className="muted small qc-note">Four scenes, a story beat each with its read-aloud, fights balanced for the heroes' level, and a reward at the end. All of it editable in Prep.</p>
      </div>
    </div>
  );
}
