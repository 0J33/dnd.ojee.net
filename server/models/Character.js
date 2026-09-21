const mongoose = require('mongoose');

// The sheet is stored as a flexible document; the client rules engine is the
// source of truth for derived values. Server only needs identity + ownership.
const characterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    sheet: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

module.exports = mongoose.model('Character', characterSchema);
