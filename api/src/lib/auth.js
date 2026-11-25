'use strict';

// Sign-in API. Errors use Firebase's shape ({ error: { message: CODE } }) so the client keeps its messages.
//   POST /auth/login          { email, password }       -> session
//   POST /auth/refresh        { refreshToken }          -> session
//   POST /auth/reset-request  { email }                 -> {} (always; mails a link when the user exists)
//   POST /auth/reset-confirm  { token, password }       -> session
// session = { idToken, refreshToken, expiresIn, email, localId }
//
// auth.json: { users: { <email>: { hash, ver, failed, lockedUntil, migratedAt?, updatedAt } },
//              resets: { <sha256(token)>: { email, exp } } }
// Accounts without a hash yet are checked once against Firebase Authentication (FIREBASE_API_KEY)
// and then migrated, so existing passwords keep working.

const { userKey, isObject } = require('./tree');
const { signToken, verifyToken, hashPassword, verifyPassword, randomToken, sha256 } = require('./crypto');
const { sendMail, buildResetMail } = require('./mail');

const ACCESS_TTL = 3600;
const REFRESH_TTL = 365 * 86400;
const RESET_TTL_MS = 3600 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_PASSWORD = 6;

const fail = (status, code) => ({ status, body: { error: { message: code } } });
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
let DUMMY_HASH = null;

// deps: { db, authDoc, secret, appUrl, firebaseApiKey?, mail?, fetchFn?, now?, log? }
function createAuth(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const fetchFn = deps.fetchFn || fetch;
  if (!DUMMY_HASH) DUMMY_HASH = hashPassword(randomToken());

  function session(email, user, ver) {
    const iat = Math.floor(now() / 1000);
    const uid = userKey(email);
    return {
      idToken: signToken({ typ: 'access', sub: email, uid, ver, iat, exp: iat + ACCESS_TTL, jti: randomToken(9) }, deps.secret),
      refreshToken: signToken({ typ: 'refresh', sub: email, uid, ver, iat, exp: iat + REFRESH_TTL, jti: randomToken(9) }, deps.secret),
      expiresIn: String(ACCESS_TTL),
      email,
      localId: uid,
    };
  }

  async function userFor(email) {
    const r = await deps.db.root();
    const u = r.users && r.users[userKey(email)];
    return u && u.kullaniciAdi ? u : null;
  }

  const record = (doc, email) => (isObject(doc.users) && isObject(doc.users[email]) ? doc.users[email] : null);

  // Checks the password with Firebase Authentication (accounts created before the move to Azure).
  async function firebaseCheck(email, password) {
    if (!deps.firebaseApiKey) return false;
    let res;
    try {
      res = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(deps.firebaseApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: deps.appUrl || '' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      });
    } catch (err) {
      throw Object.assign(new Error('Firebase unreachable'), { code: 'network' });
    }
    if (res.ok) return true;
    let code = '';
    try { code = String(((await res.json()).error || {}).message || ''); } catch (e) { /* ignore */ }
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED|MISSING_PASSWORD/.test(code)) return false;
    throw Object.assign(new Error(`Firebase error ${res.status} ${code}`), { code: 'upstream' });
  }

  async function login({ email, password }) {
    email = String(email || '').trim().toLowerCase();
    password = typeof password === 'string' ? password : '';
    if (!looksLikeEmail(email)) return fail(400, 'INVALID_EMAIL');
    if (!password) return fail(400, 'MISSING_PASSWORD');
    const user = await userFor(email);
    const doc = (await deps.authDoc.get()).value || {};
    const rec = record(doc, email);
    if (!user) {
      await verifyPassword(password, await DUMMY_HASH); // same timing as a real check
      return fail(400, 'INVALID_LOGIN_CREDENTIALS');
    }
    if (rec && rec.lockedUntil && rec.lockedUntil > now()) return fail(400, 'TOO_MANY_ATTEMPTS_TRY_LATER');

    let ok = false;
    let newHash = null;
    if (rec && rec.hash) {
      ok = await verifyPassword(password, rec.hash);
    } else {
      try {
        ok = await firebaseCheck(email, password);
      } catch (err) {
        if (deps.log && deps.log.warn) deps.log.warn('firebase check failed', err.message);
        return fail(503, 'SERVICE_UNAVAILABLE');
      }
      if (ok) newHash = await hashPassword(password);
    }

    let ver = 0;
    await deps.authDoc.update((cur) => {
      cur.users = isObject(cur.users) ? cur.users : {};
      const before = isObject(cur.users[email]) ? cur.users[email] : {};
      const r = { ...before };
      if (ok) {
        if (newHash && !r.hash) Object.assign(r, { hash: newHash, migratedAt: new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString() });
        r.failed = 0;
        r.lockedUntil = 0;
      } else {
        r.failed = (r.failed || 0) + 1;
        if (r.failed >= MAX_FAILURES) { r.failed = 0; r.lockedUntil = now() + LOCK_MS; }
      }
      ver = r.ver || 0;
      if (ok && !(newHash && !before.hash) && !before.failed && !before.lockedUntil) return undefined; // nothing to record
      cur.users[email] = r;
      return cur;
    });
    if (!ok) return fail(400, 'INVALID_LOGIN_CREDENTIALS');
    return { status: 200, body: session(email, user, ver) };
  }

  async function refresh({ refreshToken }) {
    const p = verifyToken(refreshToken, deps.secret, 'refresh', now());
    if (!p) return fail(400, 'INVALID_REFRESH_TOKEN');
    const user = await userFor(p.sub);
    if (!user) return fail(400, 'USER_NOT_FOUND');
    const rec = record((await deps.authDoc.get()).value || {}, p.sub);
    if (!rec || (rec.ver || 0) !== (p.ver || 0)) return fail(400, 'TOKEN_EXPIRED');
    return { status: 200, body: session(p.sub, user, rec.ver || 0) };
  }

  async function resetRequest({ email }) {
    email = String(email || '').trim().toLowerCase();
    if (!looksLikeEmail(email)) return fail(400, 'INVALID_EMAIL');
    if (!deps.mail) return fail(503, 'MAIL_NOT_CONFIGURED');
    const user = await userFor(email);
    if (!user) return { status: 200, body: {} }; // don't reveal whether an address has an account
    const token = randomToken();
    let send = true;
    await deps.authDoc.update((cur) => {
      cur.resets = isObject(cur.resets) ? cur.resets : {};
      for (const [h, r] of Object.entries(cur.resets)) if (!r || r.exp <= now()) delete cur.resets[h];
      const recent = Object.values(cur.resets).filter((r) => r.email === email && r.exp - RESET_TTL_MS > now() - 60000);
      if (recent.length) { send = false; return cur; } // at most one mail a minute
      cur.resets[sha256(token)] = { email, exp: now() + RESET_TTL_MS };
      return cur;
    });
    if (send) {
      const link = `${deps.appUrl}?sifre=${encodeURIComponent(token)}`;
      const m = buildResetMail({ user, link });
      await sendMail(deps.mail, { to: email, toName: [user.ad, user.soyad].filter(Boolean).join(' '), subject: m.subject, html: m.html, text: m.text, idempotencyKey: `reset/${sha256(token)}` }, deps);
    }
    return { status: 200, body: {} };
  }

  async function resetConfirm({ token, password }) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) return fail(400, 'WEAK_PASSWORD');
    const hash = sha256(String(token || ''));
    const doc = (await deps.authDoc.get()).value || {};
    const reset = isObject(doc.resets) && doc.resets[hash];
    if (!reset || reset.exp <= now()) return fail(400, 'RESET_TOKEN_INVALID');
    const user = await userFor(reset.email);
    if (!user) return fail(400, 'RESET_TOKEN_INVALID');
    const newHash = await hashPassword(password);
    let ver = 0;
    let used = false;
    await deps.authDoc.update((cur) => {
      const r0 = isObject(cur.resets) && cur.resets[hash];
      if (!r0 || r0.exp <= now()) { used = true; return undefined; }
      for (const [h, r] of Object.entries(cur.resets)) if (!r || r.email === reset.email || r.exp <= now()) delete cur.resets[h];
      cur.users = isObject(cur.users) ? cur.users : {};
      const rec = isObject(cur.users[reset.email]) ? cur.users[reset.email] : {};
      ver = (rec.ver || 0) + 1; // signs out every other session
      cur.users[reset.email] = { ...rec, hash: newHash, ver, failed: 0, lockedUntil: 0, updatedAt: new Date(now()).toISOString() };
      return cur;
    });
    if (used) return fail(400, 'RESET_TOKEN_INVALID');
    return { status: 200, body: session(reset.email, user, ver) };
  }

  // Returns the e-mail of a valid access token, or null.
  function verifyAccess(token) {
    const p = verifyToken(token, deps.secret, 'access', now());
    return p ? p.sub : null;
  }

  async function handle(action, body) {
    const b = isObject(body) ? body : {};
    switch (action) {
      case 'login': return login(b);
      case 'refresh': return refresh(b);
      case 'reset-request': return resetRequest(b);
      case 'reset-confirm': return resetConfirm(b);
      default: return { status: 404, body: { error: { message: 'NOT_FOUND' } } };
    }
  }

  return { handle, verifyAccess, login, refresh, resetRequest, resetConfirm };
}

module.exports = { createAuth };
