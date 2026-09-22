#!/usr/bin/env node
// One-off, 2026-09-22: move dnd.ojee.net's own accounts into mtg.ojee.net's,
// which both sites now share (models/accounts.js).
//
//   node scripts/merge-accounts.js --delete a,b,c           # dry run: prints the plan
//   node scripts/merge-accounts.js --delete a,b,c --apply   # does it
//
// - A dnd user whose name exists on mtg (any case) becomes that mtg user; the
//   mtg password wins.
// - A dnd-only user becomes a new mtg user with the same password hash, so
//   their password keeps working.
// - Users named in --delete are removed with their characters; a campaign
//   left with no real member goes too (including test campaigns whose members
//   never had an account), and deleted members are taken out of the others.
// - Every user id inside characters and campaign state is re-pointed. The old
//   dnd user table is kept as users_premerge; dnd sessions are dropped (the
//   shared cookie replaces them).
//
// Run it with the dnd server stopped, so an in-memory room can't autosave the
// old ids back over the rewrite.

const mongoose = require('mongoose');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const delArg = process.argv[process.argv.indexOf('--delete') + 1];
const DELETE = process.argv.includes('--delete') && delArg ? delArg.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];

const DND_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dnd';
const AUTH_URI = process.env.AUTH_MONGODB_URI || DND_URI.replace(/\/[^/?]*(\?|$)/, '/mtg$1');

// Replace every string equal to a mapped id, anywhere in a document.
function remap(value, map) {
  if (typeof value === 'string') return map.has(value) ? map.get(value) : value;
  if (Array.isArray(value)) return value.map((v) => remap(v, map));
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = remap(v, map);
    return out;
  }
  return value;
}

(async () => {
  const dnd = await mongoose.createConnection(DND_URI).asPromise();
  const auth = await mongoose.createConnection(AUTH_URI).asPromise();
  const D = dnd.db;
  const A = auth.db;
  console.log(`dnd: ${D.databaseName}   accounts: ${A.databaseName}   ${APPLY ? 'APPLYING' : 'dry run'}`);

  const dndUsers = await D.collection('users').find().toArray();
  const mtgUsers = await A.collection('users').find().toArray();
  const mtgByName = new Map(mtgUsers.map((u) => [u.username.toLowerCase(), u]));

  const missing = DELETE.filter((n) => !dndUsers.some((u) => u.username.toLowerCase() === n));
  if (missing.length) throw new Error(`--delete names not found in dnd users: ${missing.join(', ')}`);

  const idMap = new Map(); // old dnd id (string) -> mtg id (string)
  const deleted = new Set(); // old dnd ids
  const creates = [];
  for (const u of dndUsers) {
    const id = String(u._id);
    if (DELETE.includes(u.username.toLowerCase())) {
      deleted.add(id);
      console.log(`  delete   ${u.username}`);
      continue;
    }
    const match = mtgByName.get(u.username.toLowerCase());
    if (match) {
      idMap.set(id, String(match._id));
      console.log(`  merge    ${u.username} -> mtg ${match.username} (${match._id})`);
    } else {
      const newId = new mongoose.Types.ObjectId();
      idMap.set(id, String(newId));
      creates.push({
        _id: newId, username: u.username, password: u.password,
        decks: [], preferences: { defaultBackground: null, cardSize: 'normal' },
        createdAt: u.createdAt || new Date(), lastLogin: u.lastLogin || new Date(),
      });
      console.log(`  create   ${u.username} on mtg (${newId}), keeps its password`);
    }
  }

  const characters = await D.collection('characters').find().toArray();
  const charDeletes = characters.filter((c) => deleted.has(String(c.userId)));
  const charMoves = characters.filter((c) => idMap.has(String(c.userId)));
  console.log(`characters: move ${charMoves.length}, delete ${charDeletes.length} (${charDeletes.map((c) => c.name).join(', ') || '-'})`);

  const campaigns = await D.collection('campaigns').find().toArray();
  const campDeletes = [];
  const campUpdates = [];
  const mtgIds = new Set(mtgUsers.map((u) => String(u._id)));
  for (const c of campaigns) {
    const members = (c.memberIds || []).map(String);
    // members that are real users once merged; anything else (a deleted
    // account, a test probe that never had one) doesn't keep a campaign alive
    const kept = members.filter((m) => !deleted.has(m) && (idMap.has(m) || mtgIds.has(m)));
    if (kept.length === 0) {
      campDeletes.push(c);
      continue;
    }
    const state = { ...c.state };
    const gone = (id) => !kept.includes(String(id)) && members.includes(String(id));
    if (Array.isArray(state.members)) state.members = state.members.filter((m) => !gone(m.userId));
    if (state.charSheets) {
      state.charSheets = Object.fromEntries(Object.entries(state.charSheets).filter(([, s]) => !gone(s && s.ownerId)));
    }
    if (gone(state.hostId) && state.members && state.members[0]) state.hostId = state.members[0].userId;
    if (gone(state.dmId) && state.mode === 'dm' && state.members && state.members[0]) state.dmId = state.members[0].userId;
    campUpdates.push({ _id: c._id, code: c.code, memberIds: kept.map((m) => idMap.get(m) || m), state: remap(state, idMap) });
  }
  console.log(`campaigns: update ${campUpdates.length}, delete ${campDeletes.length} (${campDeletes.map((c) => `${c.code} ${c.state && c.state.name}`).join('; ') || '-'})`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write.');
    process.exit(0);
  }

  if (creates.length) await A.collection('users').insertMany(creates);
  for (const c of charMoves) await D.collection('characters').updateOne({ _id: c._id }, { $set: { userId: new mongoose.Types.ObjectId(idMap.get(String(c.userId))) } });
  if (charDeletes.length) await D.collection('characters').deleteMany({ _id: { $in: charDeletes.map((c) => c._id) } });
  for (const c of campUpdates) await D.collection('campaigns').updateOne({ _id: c._id }, { $set: { memberIds: c.memberIds, state: c.state } });
  if (campDeletes.length) await D.collection('campaigns').deleteMany({ _id: { $in: campDeletes.map((c) => c._id) } });
  const names = (await D.listCollections().toArray()).map((c) => c.name);
  await D.collection('users').rename(names.includes('users_premerge') ? `users_premerge_${Date.now()}` : 'users_premerge');
  await D.collection('sessions').drop().catch(() => {});
  console.log('\nDone. Old dnd users kept as users_premerge; dnd sessions dropped.');
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
