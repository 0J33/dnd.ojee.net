const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Session = require('../models/Session');
const { setSessionCookie, clearSessionCookies } = require('../middleware/auth');

const router = express.Router();

// Same rules, messages and user shape as mtg.ojee.net/server/routes/auth.js:
// an account made here is an mtg.ojee.net account too.
const USERNAME_RULE = 'Username must be 2-24 characters';
const PASSWORD_RULE = 'Password must be at least 4 characters';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byUsername = (username) => User.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } });

async function startSession(res, user) {
  const token = uuidv4();
  await Session.create({ sessionToken: token, userId: user._id });
  setSessionCookie(res, token);
}

const publicUser = (user) => ({ id: user._id, username: user.username });

router.post('/register', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (username.length < 2 || username.length > 24) return res.status(400).json({ error: USERNAME_RULE });
    if (password.length < 4) return res.status(400).json({ error: PASSWORD_RULE });
    if (await byUsername(username)) return res.status(400).json({ error: 'That username is taken' });
    const hash = await bcrypt.hash(password, 10);
    // decks/preferences match what mtg.ojee.net gives a new user
    const user = await User.create({ username, password: hash, decks: [], preferences: { defaultBackground: null, cardSize: 'normal' } });
    await startSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const user = username && (await byUsername(username));
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Wrong username or password' });
    }
    user.lastLogin = new Date();
    await user.save();
    await startSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Deleting the shared session signs out of mtg.ojee.net too.
router.post('/logout', async (req, res) => {
  try {
    if (req.sessionToken) await Session.deleteOne({ sessionToken: req.sessionToken });
    clearSessionCookies(res);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
