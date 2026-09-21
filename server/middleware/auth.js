const Session = require('../models/Session');
const User = require('../models/User');

// Attaches req.user (or null) from the dndSession cookie. Mirrors mtg.ojee.net.
async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies && req.cookies.dndSession;
    if (!token) {
      req.user = null;
      return next();
    }
    const session = await Session.findOne({ sessionToken: token });
    if (!session || session.expiresAt < new Date()) {
      req.user = null;
      return next();
    }
    const user = await User.findById(session.userId);
    req.user = user || null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

module.exports = { authMiddleware, requireAuth };
