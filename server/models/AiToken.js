const mongoose = require('mongoose');

// A personal access token for connecting an AI model (an MCP client such as
// Claude Desktop) to the DM's campaigns. Only a SHA-256 hash of the secret
// is stored; the secret itself is shown once when it is made (routes/ai.js).
const aiTokenSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, default: 'AI token', maxlength: 60 },
  hash: { type: String, required: true, unique: true },
  hint: { type: String, default: '' }, // the first characters, so the DM can tell tokens apart
  readOnly: { type: Boolean, default: false },
  campaigns: { type: [String], default: [] }, // campaign codes; empty = every campaign this user runs
  autoApply: { type: Boolean, default: false }, // prep changes go in straight away (still undoable from the review queue)
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null },
  lastClient: { type: String, default: '' },
  expiresAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
});

module.exports = mongoose.model('AiToken', aiTokenSchema);
