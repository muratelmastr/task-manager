'use strict';

// Session tokens (compact HS256 JWT) and password hashing (scrypt).

const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function signToken(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

// Returns the payload, or null when the signature, type or expiry is wrong.
function verifyToken(token, secret, typ, nowMs = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = fromB64url(parts[2]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(parts[1]).toString('utf8')); } catch (e) { return null; }
  if (!payload || payload.typ !== typ || typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
  return payload;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function scrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const params = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), keylen: Buffer.from(parts[5], 'base64').length };
  const key = await scrypt(password, Buffer.from(parts[4], 'base64'), params);
  const expected = Buffer.from(parts[5], 'base64');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const randomToken = (bytes = 32) => b64url(crypto.randomBytes(bytes));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

module.exports = { signToken, verifyToken, hashPassword, verifyPassword, randomToken, sha256 };
