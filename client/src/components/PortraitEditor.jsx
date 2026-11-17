import React, { Suspense, lazy, useRef, useState } from 'react';
import { TWO_HANDED } from '../look/catalog';
import { Avatar, resolveLook, lookOptions, safePortraitImage, randomLook } from './Portrait';
import { D20Icon, UploadIcon, TrashIcon } from './Icons';

// The 3D figure is drawn with three.js, which loads only when it's shown.
export const FigureStage = lazy(() => import('../world/FigureStage'));

export const PORTRAIT_COLORS = ['#d4a94f', '#c2542e', '#7fb069', '#5f87a8', '#8f7fd4', '#c94f6d', '#5fb0a5', '#b8b8b8', '#e0c060', '#b06ab0'];

const PICTURE_SIZE = 192;

// A picture the player chose, cropped square (biased upward, where faces are)
// and shrunk so it can travel with the character sheet.
function squarePicture(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) * 0.3;
      const canvas = document.createElement('canvas');
      canvas.width = PICTURE_SIZE;
      canvas.height = PICTURE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

// custom: also offer a free colour picker (its swatch shows a colour that
// isn't one of the presets).
function Swatches({ label, colors, value, onPick, custom = false }) {
  const own = custom && value && !colors.includes(value);
  return (
    <div className="pe-row">
      <span className="pe-label">{label}</span>
      <div className="pe-swatches" role="group" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={c}
            type="button"
            className={`pe-swatch ${value === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={`${label} ${i + 1}`}
            aria-pressed={value === c}
            onClick={() => onPick(c)}
          />
        ))}
        {custom && (
          <label className={`pe-swatch pe-swatch-custom ${own ? 'on' : ''}`} style={own ? { background: value } : undefined} title={`Any ${label.toLowerCase()}`}>
            <input type="color" aria-label={`Pick any ${label.toLowerCase()}`} value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#888888'} onChange={(e) => onPick(e.target.value)} />
            {!own && <span aria-hidden="true">+</span>}
          </label>
        )}
      </div>
    </div>
  );
}

function Chips({ label, options, value, onPick, note }) {
  return (
    <div className="pe-row">
      <span className="pe-label">{label}</span>
      <div className="pe-chips" role="group" aria-label={label}>
        {Object.entries(options).map(([k, name]) => (
          <button key={k} type="button" className={`pe-chip ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onPick(k)}>
            {name}
          </button>
        ))}
        {note && <p className="pe-row-note">{note}</p>}
      </div>
    </div>
  );
}

// Several at once (things carried or worn): each chip toggles.
function Toggles({ label, options, value = [], onPick }) {
  return (
    <div className="pe-row">
      <span className="pe-label">{label}</span>
      <div className="pe-chips" role="group" aria-label={label}>
        {Object.entries(options).map(([k, name]) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" className={`pe-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onPick(on ? value.filter((x) => x !== k) : [...value, k])}>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The editor's sections, in the order you'd dress a miniature.
const TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['gear', 'Gear'], ['colours', 'Colours']];

// Choices you judge by eye (a haircut, a beard) are shown as little portraits.
function Faces({ label, options, value, onPick, faceFor, color, note }) {
  return (
    <div className="pe-row">
      <span className="pe-label">{label}</span>
      <div className="pe-faces" role="group" aria-label={label}>
        {Object.entries(options).map(([k, name]) => (
          <button key={k} type="button" className={`pe-face ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onPick(k)}>
            <Avatar sheet={faceFor(k)} color={color} size={54} ring={false} title={name} />
            <span>{name}</span>
          </button>
        ))}
        {note && <p className="pe-row-note">{note}</p>}
      </div>
    </div>
  );
}

/**
 * The portrait editor: every drawn trait, a reroll, and the player's own
 * picture. `sheet` supplies race, class and name; `portrait` is the
 * sheet.portrait being edited.
 */
export default function PortraitEditor({ sheet, portrait = {}, onChange, showFigure = true }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('body');
  const look = portrait.look || {};
  const preview = { ...sheet, portrait };
  const cur = resolveLook(preview);
  const opts = lookOptions(preview);
  const picture = safePortraitImage(portrait.image);
  const color = portrait.color || PORTRAIT_COLORS[0];
  const masked = cur.mark === 'mask';

  // Pinning the seed with the first choice keeps every other trait where it
  // is, even if the hero is renamed afterwards.
  const set = (patch) => onChange({ ...portrait, look: { ...look, seed: look.seed || cur.seed, ...patch } });
  // Everything at random (but the body you chose), or back to what the race
  // and class would give this hero.
  const keepBody = look.body ? { body: look.body } : {};
  const randomize = () => onChange({ ...portrait, image: null, look: randomLook(preview, keepBody) });
  const defaults = () => onChange({ ...portrait, look: { ...keepBody, seed: cur.seed } }); // same seed: the defaults don't jump with the name
  const faceWith = (patch) => ({ ...preview, portrait: { ...portrait, image: null, look: { ...look, seed: cur.seed, ...patch } } });

  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setError("That file isn't a picture. Try a JPG or PNG.");
      return;
    }
    setBusy(true);
    setError('');
    try {
      onChange({ ...portrait, image: await squarePicture(file) });
    } catch (_) {
      setError("That picture couldn't be read. Try a different file.");
    }
    setBusy(false);
  };

  return (
    <div className="pe">
      <div className="pe-stage">
        <div className="pe-pair">
          <Avatar sheet={preview} color={color} size={132} />
          {showFigure && (
            <Suspense fallback={<div className="figure-stage" style={{ height: 200 }} />}>
              <FigureStage sheet={preview} height={200} className="pe-figure" />
            </Suspense>
          )}
        </div>
        <div className="pe-token">
          <Avatar sheet={preview} color={color} size={34} />
          <span>on the battle map</span>
        </div>
        <div className="pe-actions">
          <button type="button" className="pe-roll" onClick={randomize}>
            <D20Icon size={16} /> Randomize
          </button>
          <button type="button" className="pe-link" onClick={defaults} disabled={!Object.keys(look).some((k) => k !== 'body' && k !== 'seed')}>
            Defaults
          </button>
        </div>
        <button type="button" className="pe-upload" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
          <UploadIcon size={17} /> {busy ? 'Reading…' : picture ? 'Change picture' : 'Use my own picture'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        {picture && (
          <button type="button" className="pe-link" onClick={() => onChange({ ...portrait, image: null })}>
            <TrashIcon size={15} /> Use a drawn portrait
          </button>
        )}
        {error && <p className="pe-error" role="alert">{error}</p>}
      </div>

      <div className="pe-traits">
        <Swatches label="Colour" colors={PORTRAIT_COLORS} value={color} onPick={(c) => onChange({ ...portrait, color: c })} />
        {picture ? (
          <p className="pe-note">Your picture is used in the lobby, on your sheet and on the battle map. The colour above rings your token.</p>
        ) : (
          <>
            <div className="pe-tabs" role="tablist" aria-label="Look">
              {TABS.map(([k, name]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pe-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                  {name}
                </button>
              ))}
            </div>
            {tab === 'body' && (
              <>
                {opts.bodies && <Chips label="Presentation" options={opts.bodies} value={cur.body || ''} onPick={(k) => set({ body: k })} />}
                <Chips label="Build" options={Object.fromEntries(Object.entries(opts.frames).map(([k, f]) => [k, f.label]))} value={cur.frame} onPick={(k) => set({ frame: k })} />
                <Chips label="Height" options={opts.heights} value={cur.height} onPick={(k) => set({ height: k })} />
                <Swatches label={opts.skinLabel} colors={opts.skins} value={cur.skin} onPick={(c) => set({ skin: c })} custom />
                {opts.robotHeads && <Chips label="Head" options={opts.robotHeads} value={cur.robotHead} onPick={(k) => set({ robotHead: k })} />}
                {opts.finishes && <Chips label="Finish" options={opts.finishes} value={cur.finish} onPick={(k) => set({ finish: k })} />}
              </>
            )}
            {tab === 'face' && (
              <>
                {opts.faces && <Chips label="Face" options={opts.faces} value={cur.face} onPick={(k) => set({ face: k })} />}
                <Swatches label={opts.eyesLabel} colors={opts.eyes} value={cur.eyes} onPick={(c) => set({ eyes: c })} />
                {opts.eyeShapes && <Chips label="Eye shape" options={opts.eyeShapes} value={cur.eyeShape} onPick={(k) => set({ eyeShape: k })} />}
                {opts.brows && <Chips label="Brows" options={opts.brows} value={cur.brows} onPick={(k) => set({ brows: k })} />}
                {opts.noses && <Chips label="Nose" options={opts.noses} value={cur.nose} onPick={(k) => set({ nose: k })} />}
                {opts.moods && (
                  <Chips label="Expression" options={opts.moods} value={cur.mood} onPick={(k) => set({ mood: k })} note={masked ? 'The face mask hides the mouth; the brows still show it.' : null} />
                )}
                {opts.marks && <Chips label="Marks" options={opts.marks} value={cur.mark} onPick={(k) => set({ mark: k })} />}
              </>
            )}
            {tab === 'hair' && (
              <>
                {opts.hairStyles ? (
                  <Faces
                    label="Hair"
                    options={opts.hairStyles}
                    value={cur.hairStyle}
                    color={color}
                    // A haircut you can't see is no choice at all: picking one takes
                    // off headwear the hero was only wearing by default.
                    onPick={(k) => set({ hairStyle: k, ...(!look.hat && !look.headwear && cur.hat !== 'none' ? { hat: 'none' } : {}) })}
                    faceFor={(k) => faceWith({ hairStyle: k, hat: 'none' })}
                  />
                ) : <p className="pe-note">Nothing to style on this head.</p>}
                {opts.hairColors && <Swatches label="Hair colour" colors={opts.hairColors} value={cur.hair} onPick={(c) => set({ hair: c })} custom />}
                {opts.beards && (
                  <Faces
                    label="Facial hair"
                    options={opts.beards}
                    value={cur.beard}
                    color={color}
                    onPick={(k) => set({ beard: k })}
                    faceFor={(k) => faceWith({ beard: k, ...(masked ? { mark: 'none' } : {}) })}
                    note={masked ? 'Shown without the face mask; the mask covers it until you take it off under Face.' : null}
                  />
                )}
              </>
            )}
            {tab === 'outfit' && (
              <>
                {opts.outfits && <Chips label="Clothes" options={opts.outfits} value={cur.outfit} onPick={(k) => set({ outfit: k })} />}
                <Chips label="Armour" options={opts.armours} value={cur.armour} onPick={(k) => set({ armour: k })} />
                <Chips label="Cloak" options={opts.cloaks} value={cur.cloak} onPick={(k) => set({ cloak: k })} />
                <Chips label="Headwear" options={opts.hats} value={cur.hat} onPick={(k) => set({ hat: k })} />
              </>
            )}
            {tab === 'gear' && (
              <>
                <Chips label="Main hand" options={opts.mains} value={cur.main} onPick={(k) => set({ main: k })} />
                <Chips label="Off hand" options={opts.offs} value={cur.off} onPick={(k) => set({ off: k })} note={TWO_HANDED.has(cur.main) ? 'Both hands are on the main weapon, so the off hand stays empty.' : null} />
                <Toggles label="Carried" options={opts.extras} value={cur.extras} onPick={(v) => set({ extras: v })} />
              </>
            )}
            {tab === 'colours' && (
              <>
                <Swatches label={opts.garbLabel} colors={opts.garbs} value={cur.garb} onPick={(c) => set({ garb: c })} custom />
                <Swatches label={opts.trimLabel} colors={opts.trims} value={cur.trim} onPick={(c) => set({ trim: c })} custom />
                {cur.cloak !== 'none' && cur.cloak !== 'mantle' && <Swatches label="Cloak" colors={opts.cloakColors} value={cur.cloakColor} onPick={(c) => set({ cloakColor: c })} custom />}
                <Chips label="Leather" options={{ tan: 'Tan', brown: 'Brown', dark: 'Dark', black: 'Black', red: 'Oxblood', grey: 'Grey' }} value={cur.leatherKey} onPick={(k) => set({ leather: k })} />
                <Chips label="Metal" options={opts.metals} value={cur.metal} onPick={(k) => set({ metal: k })} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
