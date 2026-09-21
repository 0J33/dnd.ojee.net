const mongoose = require('mongoose');

// Persisted mirror of an in-memory campaign room. Campaigns are long-lived
// (unlike MTG's 6h rooms) - they expire after 90 days of inactivity.
const campaignSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    memberIds: { type: [String], index: true, default: [] },
    lastActivity: { type: Date, default: Date.now },
  },
  { minimize: false }
);

campaignSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('Campaign', campaignSchema);
