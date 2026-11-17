const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const AiToken = require('../models/AiToken');
const tools = require('./tools');
const proposals = require('./proposals');
const kit = require('./kit.cjs');
const { hashToken, forgetToken } = require('./mcp');

// /api/ai: the DM's side of the AI features, signed in with the site cookie.
//
//   tokens      personal access tokens for MCP clients (made, listed, revoked)
//   tools/call  the in-app assistant runs registry tools as the signed-in DM
//   proposals   the review queue: list, accept (with quick edits), reject
//   note        save a (filtered) transcript excerpt into a scene's DM notes
//   relay       optional pass-through to a model API that blocks browsers
//
// The in-app assistant talks to the model from the browser with the DM's own
// API key (kept in their browser, client/src/components/ai/llm.js). It only
// reaches this server for tools, so the key never does, unless the DM turns
// on the relay for a provider that refuses browser calls: then the key passes
// through in memory for that one request and is never stored or logged.

const router = express.Router();
router.use(requireAuth);

const uid = (req) => String(req.user._id);
const clean = kit.makeFilter({ level: 'standard' });

// ---------- tokens ----------

const tokenView = (t) => ({
  id: String(t._id), name: t.name, hint: t.hint, readOnly: t.readOnly, campaigns: t.campaigns, autoApply: t.autoApply,
  createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, lastClient: t.lastClient, expiresAt: t.expiresAt, revoked: !!t.revokedAt,
});

router.get('/tokens', async (req, res) => {
  const list = await AiToken.find({ userId: uid(req), revokedAt: null }).sort({ createdAt: -1 }).lean();
  res.json(list.map(tokenView));
});

router.post('/tokens', async (req, res) => {
  const count = await AiToken.countDocuments({ userId: uid(req), revokedAt: null });
  if (count >= 20) return res.status(400).json({ error: 'You have 20 tokens already; revoke one first.' });
  const b = req.body || {};
  const secret = `dnd_${crypto.randomBytes(32).toString('base64url')}`;
  const days = Number(b.expiresDays) || 0;
  const doc = await AiToken.create({
    userId: uid(req), name: String(b.name || 'AI token').slice(0, 60), hash: hashToken(secret), hint: `${secret.slice(0, 8)}...${secret.slice(-4)}`,
    readOnly: !!b.readOnly, autoApply: !!b.autoApply, campaigns: Array.isArray(b.campaigns) ? b.campaigns.map((c) => String(c).toUpperCase().slice(0, 8)).slice(0, 30) : [],
    expiresAt: days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86400000) : null,
  });
  res.json({ ...tokenView(doc.toObject()), token: secret }); // the only time the secret is shown
});

router.patch('/tokens/:id', async (req, res) => {
  const t = await AiToken.findOne({ _id: req.params.id, userId: uid(req), revokedAt: null }).catch(() => null);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (b.name !== undefined) t.name = String(b.name).slice(0, 60);
  if (b.readOnly !== undefined) t.readOnly = !!b.readOnly;
  if (b.autoApply !== undefined) t.autoApply = !!b.autoApply;
  if (Array.isArray(b.campaigns)) t.campaigns = b.campaigns.map((c) => String(c).toUpperCase().slice(0, 8)).slice(0, 30);
  await t.save();
  forgetToken(t.hash);
  res.json(tokenView(t.toObject()));
});

router.delete('/tokens/:id', async (req, res) => {
  const t = await AiToken.findOne({ _id: req.params.id, userId: uid(req) }).catch(() => null);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.revokedAt = new Date();
  await t.save();
  forgetToken(t.hash);
  res.json({ ok: true });
});

// ---------- the tool registry, for the in-app assistant ----------

router.get('/tools', (req, res) => {
  res.json(tools.listTools().map((t) => ({ name: t.name, title: t.title, kind: t.kind, description: t.description, input_schema: t.input_schema })));
});

router.get('/campaigns', async (req, res) => {
  res.json(await tools.campaignsFor({ userId: uid(req), campaigns: [] }));
});

router.post('/tools/call', async (req, res) => {
  const { name, input, campaign, autoApply } = req.body || {};
  const ctx = { userId: uid(req), source: 'assistant', client: 'In-app assistant', readOnly: false, campaigns: [], autoApply: !!autoApply, defaultCampaign: campaign ? String(campaign).toUpperCase() : null };
  try {
    res.json({ ok: true, result: await tools.callTool(ctx, String(name || ''), input || {}) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ---------- the review queue ----------

router.get('/proposals', async (req, res) => {
  const code = req.query.campaign ? String(req.query.campaign).toUpperCase() : null;
  res.json(await proposals.list(uid(req), { code, status: req.query.status || null, limit: Number(req.query.limit) || 30 }));
});

router.post('/proposals/:id/accept', async (req, res) => {
  const b = req.body || {};
  const out = await proposals.accept(req.params.id, uid(req), { itemIds: Array.isArray(b.items) ? b.items : null, edits: b.edits && typeof b.edits === 'object' ? kit.cleanDeep(b.edits, clean) : {} });
  res.status(out.error ? 404 : 200).json(out);
});

router.post('/proposals/:id/reject', async (req, res) => {
  const b = req.body || {};
  const out = await proposals.reject(req.params.id, uid(req), { itemIds: Array.isArray(b.items) ? b.items : null });
  res.status(out.error ? 404 : 200).json(out);
});

// ---------- saving a transcript excerpt (the DM chose to) ----------

let tablesRef = null;
router.post('/note', async (req, res) => {
  const { campaign, sceneId, text, heading } = req.body || {};
  const code = String(campaign || '').toUpperCase();
  try {
    const room = await tools.roomFor({ userId: uid(req), campaigns: [] }, code);
    const scene = (sceneId && room.scenes.find((s) => s.id === sceneId)) || room.scenes.find((s) => s.id === room.activeSceneId);
    const body = clean(String(text || '').slice(0, 3000)).text.trim(); // the server's own pass, whatever the browser did
    if (!body) return res.status(400).json({ error: 'Nothing to save' });
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const notes = `${scene.notes ? `${scene.notes}\n\n` : ''}${clean(String(heading || 'Table notes')).text.slice(0, 80)} (${stamp}):\n${body}`.slice(-4000);
    const out = await tablesRef.dispatch(room.code, uid(req), 'updateScene', { sceneId: scene.id, patch: { notes } });
    if (out && out.error) return res.status(400).json(out);
    res.json({ ok: true, sceneId: scene.id, sceneName: scene.name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- relay (only for providers that refuse browser calls) ----------

const RELAY_HOSTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'api.mistral.ai', 'api.groq.com', 'api.deepseek.com', 'api.x.ai', 'api.together.xyz', 'api.together.ai'];
const PASS_HEADERS = ['authorization', 'x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type', 'openai-organization', 'http-referer', 'x-title'];
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

router.post('/relay', async (req, res) => {
  const { url, headers = {}, body } = req.body || {};
  let u;
  try { u = new URL(String(url)); } catch { return res.status(400).json({ error: 'Bad URL' }); }
  const allowPrivate = process.env.AI_RELAY_ALLOW_PRIVATE === '1';
  if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) return res.status(400).json({ error: 'The relay only calls https:// APIs.' });
  if (!/\/(v1\/)?(messages|chat\/completions)$/.test(u.pathname)) return res.status(400).json({ error: 'The relay only calls /messages or /chat/completions endpoints.' });
  // Only well-known model APIs: a resolve-then-fetch private-address check alone
  // can be raced by DNS rebinding. AI_RELAY_HOSTS (comma list) adds more.
  const extra = String(process.env.AI_RELAY_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const host = u.hostname.toLowerCase();
  if (!allowPrivate && ![...RELAY_HOSTS, ...extra].some((h) => host === h || host.endsWith(`.${h}`))) return res.status(400).json({ error: 'The relay only calls known model APIs; use direct mode for this one.' });
  try {
    const { address } = await dns.lookup(u.hostname);
    if (!allowPrivate && privateIp(address)) return res.status(400).json({ error: 'The relay does not call private addresses (use direct mode for a model on your own network).' });
  } catch { return res.status(400).json({ error: 'Unknown host' }); }
  const h = {};
  for (const k of PASS_HEADERS) if (headers[k] != null) h[k] = String(headers[k]);
  h['content-type'] = 'application/json';
  // the transcript has been filtered in the browser; filter again here
  const payload = body && typeof body === 'object' ? { ...body, messages: kit.cleanDeep(body.messages || [], clean) } : body;
  try {
    const ctl = new AbortController();
    req.on('close', () => ctl.abort());
    const up = await fetch(u, { method: 'POST', headers: h, body: JSON.stringify(payload), signal: ctl.signal });
    res.status(up.status);
    res.set('Content-Type', up.headers.get('content-type') || 'application/json');
    res.set('Cache-Control', 'no-store');
    res.set('X-Accel-Buffering', 'no'); // let nginx stream it
    if (!up.body) return res.end();
    Readable.fromWeb(up.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: 'The model API could not be reached.' }); // the error may echo headers: not logged
  }
});

function mount(app, tables) {
  tablesRef = tables;
  proposals.setTables(tables);
  app.use('/api/ai', router);
}

module.exports = { mount };
