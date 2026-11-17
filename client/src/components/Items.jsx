import React, { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket';
import { srd } from '../api';
import { ModalOverlay } from '../utils';
import {
  ITEM_TYPES, BASE_WEAPONS, BASE_ARMOR, DAMAGE_TYPES, HEALING_POTIONS, blankItem, fromSrdMagic, itemSummary,
} from '../rules/items';
import { XIcon, PlusIcon, TrashIcon, CoinsIcon, SearchIcon, SparkleIcon } from './Icons';

// Items made on the spot (rules/items.js has the shape):
//   ItemMaker      make one (or start from the SRD magic items) and hand it back
//   GiveItemModal  the DM gives a hero something; it lands in their gear
//   ItemListField  the items in a chest (the Secrets editor)
//   ShopModal      a merchant NPC: the DM sets the wares, heroes buy them

const PLUS = [0, 1, 2, 3];

export function ItemMaker({ title = 'Make an item', doneLabel = 'Done', initial, onDone, onClose, withPrice = false }) {
  const [tab, setTab] = useState('make');
  const [it, setIt] = useState(() => initial || blankItem('weapon'));
  const [price, setPrice] = useState(() => initial?.value ?? 15);
  const set = (patch) => setIt((x) => ({ ...x, ...patch }));
  const setStats = (patch) => setIt((x) => ({ ...x, stats: { ...(x.stats || {}), ...patch } }));
  const type = ITEM_TYPES.find((t) => t.key === it.kind);
  const pick = (m) => { const made = fromSrdMagic(m); setIt(made); setPrice(made.value); setTab('make'); };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal item-maker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" aria-label="Close" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="seg im-tabs" role="tablist">
          <button role="tab" className={tab === 'make' ? 'on' : ''} aria-selected={tab === 'make'} onClick={() => setTab('make')}>Make one</button>
          <button role="tab" className={tab === 'srd' ? 'on' : ''} aria-selected={tab === 'srd'} onClick={() => setTab('srd')}><SparkleIcon size={12} /> Magic items</button>
        </div>
        <div className="modal-body">
          {tab === 'srd' ? <MagicList onPick={pick} /> : (
            <>
              <div className="im-types" role="group" aria-label="Kind of item">
                {ITEM_TYPES.map((t) => (
                  <button key={t.key} type="button" className={`im-type ${it.kind === t.key ? 'on' : ''}`} aria-pressed={it.kind === t.key}
                    onClick={() => { if (it.kind !== t.key) { const b = blankItem(t.key); setIt(b); setPrice(b.value); } }}>{t.name}</button>
                ))}
              </div>
              <p className="muted small im-hint">{type?.hint}</p>

              {it.kind === 'weapon' && (
                <div className="im-grid">
                  <label>Like a
                    <select value={it.base || ''} onChange={(e) => { const b = BASE_WEAPONS.find((w) => w.name === e.target.value); if (b) { set({ base: b.name, name: it.name === it.base || !it.name ? b.name : it.name }); setStats({ damage: b.damage, damageType: b.damageType, properties: b.properties, range: b.range }); } }}>
                      {BASE_WEAPONS.map((w) => <option key={w.name} value={w.name}>{w.name} ({w.damage})</option>)}
                    </select>
                  </label>
                  <label>Magic
                    <select value={it.stats?.bonus || 0} onChange={(e) => setStats({ bonus: +e.target.value })}>{PLUS.map((n) => <option key={n} value={n}>{n ? `+${n}` : 'none'}</option>)}</select>
                  </label>
                  <label>Damage
                    <input value={it.stats?.damage || ''} onChange={(e) => setStats({ damage: e.target.value })} placeholder="1d8" />
                  </label>
                  <label>Type
                    <select value={it.stats?.damageType || 'slashing'} onChange={(e) => setStats({ damageType: e.target.value })}>{DAMAGE_TYPES.map((d) => <option key={d}>{d}</option>)}</select>
                  </label>
                </div>
              )}
              {it.kind === 'armor' && (
                <div className="im-grid">
                  <label>Like
                    <select value={it.base || ''} onChange={(e) => { const b = BASE_ARMOR.find((a) => a.name === e.target.value); if (b) { set({ base: b.name, name: it.name === it.base || !it.name ? b.name : it.name }); setStats({ acBase: b.acBase, category: b.category, maxDex: b.maxDex }); } }}>
                      {BASE_ARMOR.map((a) => <option key={a.name} value={a.name}>{a.name} (AC {a.acBase}, {a.category})</option>)}
                    </select>
                  </label>
                  <label>Magic
                    <select value={it.stats?.bonus || 0} onChange={(e) => setStats({ bonus: +e.target.value })}>{PLUS.map((n) => <option key={n} value={n}>{n ? `+${n}` : 'none'}</option>)}</select>
                  </label>
                </div>
              )}
              {it.kind === 'shield' && (
                <div className="im-grid">
                  <label>Magic
                    <select value={it.stats?.bonus || 0} onChange={(e) => setStats({ bonus: +e.target.value })}>{PLUS.map((n) => <option key={n} value={n}>{n ? `+${n}` : 'none'}</option>)}</select>
                  </label>
                </div>
              )}
              {it.kind === 'potion' && (
                <div className="im-grid">
                  <label>Heals
                    <select value={HEALING_POTIONS.find((p) => p.heal === it.stats?.heal)?.heal || (it.stats?.heal ? 'custom' : '')}
                      onChange={(e) => { const p = HEALING_POTIONS.find((x) => x.heal === e.target.value); if (p) { set({ name: p.name, desc: `Regain ${p.heal.replace('+', ' + ')} hit points.` }); setStats({ heal: p.heal }); setPrice(p.value); } else if (e.target.value === '') setStats({ heal: undefined }); else setStats({ heal: it.stats?.heal || '1d4' }); }}>
                      <option value="">doesn't heal (its words say what it does)</option>
                      {HEALING_POTIONS.map((p) => <option key={p.name} value={p.heal}>{p.heal} ({p.name.replace('Potion of ', '')})</option>)}
                      <option value="custom">other amount…</option>
                    </select>
                  </label>
                  {it.stats?.heal && !HEALING_POTIONS.some((p) => p.heal === it.stats.heal) && (
                    <label>Dice<input value={it.stats.heal} onChange={(e) => setStats({ heal: e.target.value })} placeholder="3d4+3" /></label>
                  )}
                </div>
              )}
              {it.kind === 'relic' && (
                <div className="im-grid">
                  <label>AC
                    <select value={it.stats?.ac || 0} onChange={(e) => setStats({ ac: +e.target.value })}>{PLUS.map((n) => <option key={n} value={n}>{n ? `+${n}` : 'none'}</option>)}</select>
                  </label>
                  <label>Every save
                    <select value={it.stats?.saves || 0} onChange={(e) => setStats({ saves: +e.target.value })}>{PLUS.map((n) => <option key={n} value={n}>{n ? `+${n}` : 'none'}</option>)}</select>
                  </label>
                </div>
              )}

              <div className="im-grid">
                <label className="im-wide">Name<input value={it.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
                <label>How many<input type="number" min={1} max={99} value={it.qty} onChange={(e) => set({ qty: Math.max(1, Math.min(99, +e.target.value || 1)) })} /></label>
                {withPrice && <label>Price (gp)<input type="number" min={0} value={price} onChange={(e) => setPrice(Math.max(0, +e.target.value || 0))} /></label>}
              </div>
              <label className="im-desc">What it is, what it does (the players read this)
                <textarea rows={3} maxLength={800} value={it.desc || ''} onChange={(e) => set({ desc: e.target.value })} placeholder="Warm to the touch. Glows when goblins are near." />
              </label>
              <label className="row small"><input type="checkbox" checked={!!it.magic} onChange={(e) => set({ magic: e.target.checked })} /> Magic</label>
              <p className="im-preview"><b>{it.qty > 1 ? `${it.qty} × ` : ''}{it.name || 'Item'}</b> <span className="muted">{itemSummary(it)}</span></p>
            </>
          )}
        </div>
        {tab === 'make' && (
          <div className="modal-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary-btn" disabled={!it.name?.trim()} onClick={() => { const { base, ...item } = it; onDone(withPrice ? { item: { ...item, value: price }, price } : { ...item, name: item.name.trim() }); }}>{doneLabel}</button>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

function MagicList({ onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { srd.magicItems().then((l) => setList(Array.isArray(l) ? l : [])).catch(() => setList([])); }, []);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    // the "+1, +2, or +3" family headers and duplicate names are noise here
    const seen = new Set();
    return (list || []).filter((m) => !/\+1, \+2, or \+3/.test(m.name) && (!n || m.name.toLowerCase().includes(n)) && !seen.has(m.name) && seen.add(m.name)).slice(0, 80);
  }, [list, q]);
  const choose = async (m) => {
    setBusy(m.index);
    try { const full = await srd.magicItem(m.index); onPick(full && !full.error ? full : m); } finally { setBusy(null); }
  };
  return (
    <div className="im-srd">
      <label className="im-search"><SearchIcon size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: healing, +1, cloak, flame…" /></label>
      {list === null ? <p className="muted">Opening the list…</p> : (
        <ul className="im-srd-list">
          {shown.map((m) => (
            <li key={m.index}>
              <button disabled={busy === m.index} onClick={() => choose(m)}>
                <b>{m.name}</b> <span className="muted small">{[m.category || m.equipment_category?.name, m.rarity?.name || m.rarity].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="muted">Nothing by that name.</li>}
        </ul>
      )}
      <p className="muted small">Open-licensed (SRD 5.1). Picking one opens it in the maker to adjust before you hand it out.</p>
    </div>
  );
}

/** The DM gives a hero something (a reward, a find, a gift from an NPC). */
export function GiveItemModal({ characterId, heroName, onClose, onDone }) {
  const [err, setErr] = useState(null);
  return (
    <>
      <ItemMaker
        title={`Give ${heroName || 'a hero'} an item`}
        doneLabel={`Give to ${heroName || 'them'}`}
        onClose={onClose}
        onDone={(item) => socket.emit('giveItem', { characterId, items: [item] }, (r) => { if (r?.error) setErr(r.error); else { onDone?.(item); onClose(); } })}
      />
      {err && <div className="im-err" role="alert">{err}</div>}
    </>
  );
}

/** The items inside a chest (a loot effect). */
export function ItemListField({ items = [], onChange }) {
  const [making, setMaking] = useState(false);
  return (
    <div className="im-field">
      {items.map((it, i) => (
        <div key={i} className="im-field-row">
          <span className="grow"><b>{it.qty > 1 ? `${it.qty} × ` : ''}{it.name}</b> <span className="muted small">{itemSummary(it)}</span></span>
          <button className="icon-btn ghost-btn" aria-label={`Take out ${it.name}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><TrashIcon size={13} /></button>
        </div>
      ))}
      <button className="small-btn ghost-btn" onClick={() => setMaking(true)}><PlusIcon size={12} /> Put an item in it</button>
      <p className="muted small">Whoever opens it gets these in their gear.</p>
      {making && <ItemMaker title="An item in the chest" doneLabel="Put it in" onClose={() => setMaking(false)} onDone={(it) => { onChange([...items, it]); setMaking(false); }} />}
    </div>
  );
}

const coinLine = (c = {}) => ['pp', 'gp', 'sp', 'cp'].filter((k) => c[k]).map((k) => `${c[k]} ${k}`).join(' ') || 'no coin';

/** A merchant: the DM stocks it; a hero buys from it. */
export function ShopModal({ token, isDM, mySheet, onClose }) {
  const shop = token.shop || { open: true, items: [] };
  const [making, setMaking] = useState(false);
  const [msg, setMsg] = useState(null);
  const save = (next) => socket.emit('updateToken', { tokenId: token.id, patch: { shop: next } });
  const buy = (i) => socket.emit('buyItem', { tokenId: token.id, index: i }, (r) => setMsg(r?.error || `Bought: ${shop.items[i]?.item.name}. It's in your gear.`));
  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal shop-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><CoinsIcon size={16} /> {token.label}{isDM ? "'s wares" : ''}</h3>
          <button className="close-btn" aria-label="Close" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="modal-body">
          {isDM && (
            <label className="row small mb"><input type="checkbox" checked={shop.open !== false} onChange={(e) => save({ ...shop, open: e.target.checked })} /> Open for business (players can buy)</label>
          )}
          {!isDM && mySheet && <p className="muted small mb">Your purse: {coinLine(mySheet.coins)}</p>}
          {!shop.items.length && <p className="muted">{isDM ? 'Nothing for sale yet. Add something below.' : 'Nothing for sale.'}</p>}
          <ul className="shop-list">
            {shop.items.map((w, i) => (
              <li key={i} className="shop-row">
                <div className="grow">
                  <b>{w.item.name}</b> <span className="muted small">{itemSummary(w.item)}</span>
                  {w.item.desc && <div className="shop-desc">{w.item.desc}</div>}
                </div>
                {isDM ? (
                  <div className="shop-dm">
                    <label>gp<input type="number" min={0} value={w.price} onChange={(e) => save({ ...shop, items: shop.items.map((x, j) => (j === i ? { ...x, price: Math.max(0, +e.target.value || 0) } : x)) })} /></label>
                    <label title="Leave empty for as many as they like">stock<input type="number" min={0} value={w.stock ?? ''} placeholder="∞" onChange={(e) => save({ ...shop, items: shop.items.map((x, j) => (j === i ? { ...x, stock: e.target.value === '' ? null : Math.max(0, +e.target.value) } : x)) })} /></label>
                    <button className="icon-btn ghost-btn" aria-label={`Stop selling ${w.item.name}`} onClick={() => save({ ...shop, items: shop.items.filter((_, j) => j !== i) })}><TrashIcon size={13} /></button>
                  </div>
                ) : (
                  <div className="shop-buy">
                    <span className="shop-price">{w.price} gp{w.stock != null ? ` · ${w.stock} left` : ''}</span>
                    <button className="primary-btn small-btn" disabled={!mySheet || w.stock === 0 || shop.open === false} onClick={() => buy(i)}>{w.stock === 0 ? 'Sold out' : 'Buy'}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {isDM && <button className="small-btn" onClick={() => setMaking(true)}><PlusIcon size={12} /> Sell something</button>}
          {!isDM && !mySheet && <p className="muted small">Pick a hero to buy things.</p>}
          {msg && <p className="shop-msg" role="status">{msg}</p>}
        </div>
      </div>
      {making && <ItemMaker title={`Something ${token.label} sells`} doneLabel="Put it on sale" withPrice onClose={() => setMaking(false)} onDone={({ item, price }) => { save({ ...shop, items: [...shop.items, { item: { ...item, qty: 1 }, price, stock: null }] }); setMaking(false); }} />}
    </ModalOverlay>
  );
}
