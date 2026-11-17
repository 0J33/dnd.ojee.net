const mongoose = require('mongoose');

// A set of changes an AI model proposed for a campaign, waiting for the DM
// (server/ai/proposals.js). Each item is one reviewable change made of the
// same table actions a DM's own clicks send. Kept 30 days.
const aiProposalSchema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true },
    source: { type: String, default: 'assistant' }, // assistant | mcp
    client: { type: String, default: '' }, // the MCP client's name, or the token's
    title: { type: String, default: '' },
    why: { type: String, default: '' },
    status: { type: String, default: 'pending' }, // pending | applied | done | rejected
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { minimize: false }
);
aiProposalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model('AiProposal', aiProposalSchema);
