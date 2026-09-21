import React, { useEffect, useState } from 'react';
import { srd } from '../api';

// Shared pieces for picking content that can come from more than one book:
// source labels, and the subclass picker used by the builder and level-up.

let sourceCache = null;
/** { srd51: { short, name, publisher, license }, ... } */
export function useSources() {
  const [sources, setSources] = useState(sourceCache || {});
  useEffect(() => {
    if (sourceCache) return;
    srd.sources().then((res) => {
      if (!res || !Array.isArray(res.sources)) return;
      sourceCache = Object.fromEntries(res.sources.map((s) => [s.key, s]));
      setSources(sourceCache);
    });
  }, []);
  return sources;
}

/** Small label naming the book a race or subclass comes from. SRD 5.1 needs none. */
export function SourceChip({ source, sources }) {
  if (!source || source === 'srd51') return null;
  const s = sources[source];
  return <span className="chip source-chip" title={s ? `${s.name} (${s.publisher})` : source}>{s ? s.short : source}</span>;
}

/** Props that make a card-like div behave as a button. */
export const pressable = (onPress) => ({
  role: 'button',
  tabIndex: 0,
  onClick: onPress,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPress();
    }
  },
});

/** Items grouped by source, in the server's source order. */
export function groupBySource(items, sources) {
  const order = Object.keys(sources);
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source).push(item);
  }
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

/** Heading over a group of cards from one book. */
export function SourceHead({ source, sources }) {
  const s = sources[source];
  return (
    <div className="source-group-head">
      <span>{s ? s.name : source}</span>
      {s && <span className="muted small">{s.publisher}</span>}
    </div>
  );
}

/**
 * Every subclass for a class, grouped by book. `onChange` receives the summary
 * ({ index, name, flavor, source, ... }).
 */
export function SubclassPicker({ classIndex, value, onChange }) {
  const sources = useSources();
  const [list, setList] = useState(null);

  useEffect(() => {
    setList(null);
    if (!classIndex) return;
    srd.subclasses(classIndex).then((l) => setList(Array.isArray(l) ? l : []));
  }, [classIndex]);

  if (!list) return <p className="muted">Loading options...</p>;
  return (
    <div className="source-groups">
      {groupBySource(list, sources).map(([source, items]) => (
        <section key={source} className="source-group">
          <SourceHead source={source} sources={sources} />
          <div className="choice-grid">
            {items.map((sc) => (
              <div key={sc.index} className={`choice-card slim ${value === sc.index ? 'selected' : ''}`} aria-pressed={value === sc.index} {...pressable(() => onChange(sc))}>
                <h4>{sc.name}</h4>
                <p>{sc.blurb}</p>
                {sc.restriction && <p className="choice-restriction">{sc.restriction}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Loads one subclass's full record ({ ..., levels: { "3": [{ name, desc }] } }). */
export function useSubclass(index) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    setDetail(null);
    if (!index) return;
    srd.subclass(index).then((d) => d && !d.error && setDetail(d));
  }, [index]);
  return detail && detail.index === index ? detail : null;
}

/** The subclass features gained at levels from..to, in order, ready for sheet.features. */
export function subclassFeaturesBetween(detail, from, to) {
  if (!detail) return [];
  const out = [];
  for (const [lvl, feats] of Object.entries(detail.levels || {})) {
    const l = Number(lvl);
    if (l < from || l > to) continue;
    for (const f of feats) out.push({ name: f.name, source: `${detail.name} ${l}`, desc: f.desc, level: l });
  }
  return out.sort((a, b) => a.level - b.level).map(({ level, ...f }) => f);
}

