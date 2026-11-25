'use strict';

// HTTP router shared by the Azure Function and the tests.
//   /db/<path>.json          Firebase RTDB compatible data API (Authorization: Bearer <idToken>)
//   /auth/<action>           sign-in API
//   /assignment-notify       assignment mail
//   /comment-notify          comment mail (@mentions + task owner)
//   /health                  liveness check

const { createDb } = require('./db');
const { createAuth } = require('./auth');
const { handleNotify } = require('./notify');
const { handleCommentNotify } = require('./comments');
const { jsonDoc } = require('./store');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,DELETE,POST,OPTIONS' };

// deps: { adapter, secret, appUrl, mail, firebaseApiKey?, fetchFn?, createTransport?, now?, log?, cors? }
function createApi(deps) {
  const doc = jsonDoc(deps.adapter, 'db.json');
  const authDoc = jsonDoc(deps.adapter, 'auth.json');
  const db = createDb({ doc, adapter: deps.adapter, now: deps.now });
  const auth = createAuth({ ...deps, db, authDoc });

  const bearer = (headers, query) => {
    const h = /^Bearer\s+(\S+)$/i.exec((headers && (headers.authorization || headers.Authorization)) || '');
    return h ? h[1] : (query && query.get('auth')) || '';
  };

  // req: { method, path (after /api), query: URLSearchParams, headers, body: string }
  async function handle(req) {
    const extra = deps.cors ? CORS : {};
    const reply = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, body: JSON.stringify(body === undefined ? null : body) });
    try {
      if (req.method === 'OPTIONS') return { status: 204, headers: extra, body: '' };
      const path = String(req.path || '').replace(/^\/+/, '');
      const query = req.query || new URLSearchParams();
      if (path === 'health') return reply(200, { ok: true });

      if (path.startsWith('auth/')) {
        if (req.method !== 'POST') return reply(405, { error: { message: 'METHOD_NOT_ALLOWED' } });
        let body = null;
        try { body = JSON.parse(req.body || '{}'); } catch (e) { return reply(400, { error: { message: 'INVALID_JSON' } }); }
        const res = await auth.handle(path.slice(5), body);
        return reply(res.status, res.body);
      }

      if (path === 'assignment-notify') {
        if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
        const email = auth.verifyAccess(bearer(req.headers));
        if (!email && deps.env && deps.env.FIREBASE_DB_URL) {
          // Old Firebase client during the switch (see legacy-notify.js).
          let body = null;
          try { body = JSON.parse(req.body || '{}'); } catch (e) { /* 400 below */ }
          const res = await require('./legacy-notify').handleNotify({ authorization: req.headers && req.headers.authorization, body, env: deps.env, log: deps.log || {}, ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}), ...(deps.createTransport ? { createTransport: deps.createTransport } : {}) });
          return reply(res.status, res.body);
        }
        if (!email) return reply(401, { error: 'Oturum doğrulanamadı.' });
        let body = null;
        try { body = JSON.parse(req.body || '{}'); } catch (e) { return reply(400, { error: 'Geçersiz istek.' }); }
        const res = await handleNotify({ ...deps, db }, { email, body });
        return reply(res.status, res.body);
      }

      if (path === 'comment-notify') {
        if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
        const email = auth.verifyAccess(bearer(req.headers));
        if (!email) return reply(401, { error: 'Oturum doğrulanamadı.' });
        let body = null;
        try { body = JSON.parse(req.body || '{}'); } catch (e) { return reply(400, { error: 'Geçersiz istek.' }); }
        const res = await handleCommentNotify({ ...deps, db }, { email, body });
        return reply(res.status, res.body);
      }

      if (path === 'db' || path.startsWith('db/')) {
        const token = bearer(req.headers, query);
        const email = auth.verifyAccess(token);
        if (!email) return reply(401, { error: token ? 'Auth token is expired' : 'Unauthorized request.' });
        let dbPath;
        try { dbPath = decodeURIComponent(path.slice(3).replace(/\.json$/, '')); } catch (e) { return reply(400, { error: 'Invalid path' }); }
        const res = await db.handle({ method: req.method, path: dbPath, query, body: req.body, email });
        return reply(res.status, res.body);
      }
      return reply(404, { error: 'Not found' });
    } catch (err) {
      if (deps.log && deps.log.error) deps.log.error('api error', err);
      return reply(500, { error: 'Sunucu hatası. Lütfen tekrar deneyin.' });
    }
  }

  return { handle, db, auth, doc, authDoc, adapter: deps.adapter };
}

module.exports = { createApi };
