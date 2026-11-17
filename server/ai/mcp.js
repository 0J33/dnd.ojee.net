const crypto = require('crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const AiToken = require('../models/AiToken');
const User = require('../models/User');
const tools = require('./tools');

// The MCP server: POST /mcp (Streamable HTTP, stateless, JSON responses).
//
// Any MCP client (Claude Desktop through mcp-remote, Claude Code, the MCP
// inspector...) connects with a personal access token the DM makes in the
// app: `Authorization: Bearer dnd_...`. Clients that can only take a URL may
// put it in the path instead (/mcp/dnd_...), which is weaker (URLs end up in
// logs) and said so in the app's help.
//
// Stateless: every request gets its own Server and transport, so nothing
// lives between requests and a restart loses nothing. Responses are plain
// JSON, not an SSE stream, so nginx and Cloudflare need nothing special.

const TOKEN_RE = /^dnd_[A-Za-z0-9_-]{30,80}$/;
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// a token is looked up at most once a minute
const cache = new Map(); // hash -> { doc, user, at }
async function resolveToken(secret) {
  if (!TOKEN_RE.test(secret || '')) return null;
  const hash = hashToken(secret);
  const hit = cache.get(hash);
  if (hit && Date.now() - hit.at < 60000) return hit.doc.revokedAt ? null : hit;
  const doc = await AiToken.findOne({ hash }).lean();
  if (!doc || doc.revokedAt || (doc.expiresAt && doc.expiresAt < new Date())) { cache.delete(hash); return null; }
  const user = await User.findById(doc.userId).lean();
  if (!user) return null;
  const entry = { doc, user: { id: String(user._id), username: user.username }, at: Date.now() };
  cache.set(hash, entry);
  return entry;
}
function forgetToken(hash) { cache.delete(hash); }

// 120 calls a minute per token
const buckets = new Map();
function allow(hash) {
  const now = Date.now();
  const b = buckets.get(hash) || { n: 0, since: now };
  if (now - b.since > 60000) { b.n = 0; b.since = now; }
  b.n++;
  buckets.set(hash, b);
  return b.n <= 120;
}

function bearerOf(req) {
  const h = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  if (req.params && req.params.token) return req.params.token;
  return null;
}

function buildServer(ctx) {
  const server = new Server(
    { name: 'dnd-ojee-net', title: 'dnd.ojee.net - D&D tabletop', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: tools.SERVER_INSTRUCTIONS }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.listTools({ readOnly: ctx.readOnly }).map((t) => ({
      name: t.name, title: t.title, description: t.description + (t.kind === 'write' ? ' (Goes to the DM\'s review queue: nothing changes until they accept.)' : ''),
      inputSchema: t.input_schema, annotations: { readOnlyHint: t.kind === 'read', destructiveHint: t.name === 'delete', openWorldHint: false },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const out = await tools.callTool(ctx, name, args || {});
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { results: out } : out };
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
  });
  return server;
}

async function handle(req, res) {
  const secret = bearerOf(req);
  const found = await resolveToken(secret).catch(() => null);
  if (!found) {
    res.set('WWW-Authenticate', 'Bearer realm="dnd.ojee.net", error="invalid_token"');
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'A valid dnd.ojee.net AI token is required (Authorization: Bearer dnd_...). Make one in the app: in a game you run, AI assistant > Connect.' }, id: null });
  }
  const hash = found.doc.hash;
  if (!allow(hash)) return res.status(429).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Too many calls; slow down (120 a minute).' }, id: null });
  if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: POST only).' }, id: null });

  const clientName = req.body?.params?.clientInfo?.name;
  const ctx = {
    userId: found.user.id, username: found.user.username, source: 'mcp', client: found.doc.name || clientName || 'MCP client',
    readOnly: !!found.doc.readOnly, campaigns: found.doc.campaigns || [], autoApply: !!found.doc.autoApply,
  };
  // remember when it was last used (at most once a minute)
  if (!found.doc.lastUsedAt || Date.now() - new Date(found.doc.lastUsedAt).getTime() > 60000 || clientName) {
    found.doc.lastUsedAt = new Date();
    AiToken.updateOne({ _id: found.doc._id }, { $set: { lastUsedAt: found.doc.lastUsedAt, ...(clientName ? { lastClient: String(clientName).slice(0, 60) } : {}) } }).catch(() => {});
  }

  const server = buildServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('mcp request failed:', err.message);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}

function mount(app) {
  app.all('/mcp', handle);
  app.all('/mcp/:token', handle);
}

module.exports = { mount, hashToken, forgetToken, TOKEN_RE };
