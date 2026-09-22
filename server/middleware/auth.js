const Session = require('../models/Session');
const User = require('../models/User');

// One account for dnd.ojee.net and mtg.ojee.net (models/accounts.js). Both
// servers set and read the same cookie, so a sign-in or sign-out on either
// site applies to both. Keep this file and
// mtg.ojee.net/server/middleware/auth.js in step.
//
// COOKIE_DOMAIN (".ojee.net" in production) lets both API hosts see the
// cookie; unset locally, where both servers run on localhost and share it anyway.
const SESSION_COOKIE = 'ojeeSession';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  const opts = { httpOnly: true, sameSite: 'none', secure: true };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
  // pre-merge dnd sessions died with the old user table
  res.clearCookie('dndSession', { httpOnly: true, sameSite: 'none', secure: true });
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.clearCookie('dndSession', { httpOnly: true, sameSite: 'none', secure: true });
}

async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
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
    req.sessionToken = user ? token : null;
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

module.exports = { authMiddleware, requireAuth, setSessionCookie, clearSessionCookies, SESSION_COOKIE };
