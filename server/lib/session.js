'use strict';

const crypto = require('crypto');
const { db } = require('./store');
const { safeEqual } = require('./util');

const COOKIE_NAME = 'sc_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function hmac(value) {
  return crypto.createHmac('sha256', db.getSecret()).update(value).digest('hex');
}

function createToken() {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = `admin.${exp}`;
  const sig = hmac(payload);
  return `${exp}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!sig) return false;
  const expected = hmac(`admin.${exp}`);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

function verifyPassword(candidate) {
  const stored = db.auth.data.passwordHash;
  if (stored && stored.hash) {
    const derived = crypto.scryptSync(String(candidate), stored.salt, 64).toString('hex');
    return safeEqual(derived, stored.hash);
  }
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  return safeEqual(candidate, expected);
}

function isUsingDefaultPassword() {
  return !(db.auth.data.passwordHash && db.auth.data.passwordHash.hash);
}

function setPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  db.auth.data.passwordHash = { salt, hash, updatedAt: new Date().toISOString() };
  db.auth.save();
}

function setSessionCookie(res) {
  res.cookie(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(res.req),
    maxAge: MAX_AGE_MS,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function isSecureRequest(req) {
  if (!req) return false;
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}

function requireAdmin(req, res, next) {
  if (verifyToken(req.cookies ? req.cookies[COOKIE_NAME] : null)) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado. Inicia sesion nuevamente.' });
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_MS,
  createToken,
  verifyToken,
  verifyPassword,
  isUsingDefaultPassword,
  setPassword,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
};
