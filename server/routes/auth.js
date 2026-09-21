const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Session = require('../models/Session');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: 'none',
  secure: true,
};

async function createSession(res, user) {
  const token = uuidv4();
  await Session.create({ sessionToken: token, userId: user._id });
  res.cookie('dndSession', token, COOKIE_OPTS);
}

function publicUser(user) {
  return { id: user._id, username: user.username, preferences: user.preferences || {} };
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || username.length < 2 || username.length > 24) {
      return res.status(400).json({ error: 'Username must be 2-24 characters' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const existing = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing) return res.status(400).json({ error: 'Username is taken' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hash });
    await createSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await User.findOne({ username: new RegExp(`^${(username || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const ok = await bcrypt.compare(password || '', user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid username or password' });
    user.lastLogin = new Date();
    await user.save();
    await createSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies && req.cookies.dndSession;
    if (token) await Session.deleteOne({ sessionToken: token });
    res.clearCookie('dndSession', { ...COOKIE_OPTS, maxAge: 0 });
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
