const mongoose = require('mongoose');

// Accounts are shared with mtg.ojee.net: users and sessions live in its
// database, so one username and password works on both sites and a session
// made on either signs you in on both. This connection is the only way the
// dnd server touches that database.
//
// AUTH_MONGODB_URI points at it; without one, the mtg database on the same
// server as MONGODB_URI is assumed (both run on one box).
function authUri() {
  if (process.env.AUTH_MONGODB_URI) return process.env.AUTH_MONGODB_URI;
  const main = process.env.MONGODB_URI || 'mongodb://localhost:27017/dnd';
  return main.replace(/\/[^/?]*(\?|$)/, '/mtg$1');
}

const connection = mongoose.createConnection(authUri());
connection.on('connected', () => console.log('Accounts database connected'));
connection.on('error', (err) => console.error('Accounts database error:', err.message));

// A subset of mtg.ojee.net's User schema. strict: false keeps the fields only
// mtg uses (decks, preferences) intact when dnd saves a user.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, minlength: 2, maxlength: 24 },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
  },
  { strict: false }
);

const sessionSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
});

const User = connection.model('User', userSchema);
const Session = connection.model('Session', sessionSchema);

module.exports = { connection, User, Session };
