'use strict';

// Firebase Realtime Database compatible REST handler:
//   GET    <path>.json [?shallow=true | ?orderBy="child"&startAt=..&endAt=..&equalTo=..]
//   PUT    <path>.json   body = value
//   PATCH  <path>.json   body = { "relative/path": value, ... }   (multi-path, atomic)
//   DELETE <path>.json
// Every request is checked against the rules (rules.js). Attachment chunks
// (files/<key>/<fileId>/p/<i>) are stored as separate blobs; everything else lives in db.json.

const { splitPath, getAt, setAt, clone, isObject, userKey } = require('./tree');
const { canRead, canWrite } = require('./rules');

class DbError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const denied = () => new DbError(403, 'Permission denied');

const isPartsPath = (segs) => segs[0] === 'files' && segs.length >= 4 && segs[3] === 'p';

function parseQueryValue(v) {
  try { return JSON.parse(v); } catch (e) { throw new DbError(400, `Invalid query parameter: ${v}`); }
}

function applyQuery(value, query) {
  if (query.get('shallow') === 'true') {
    return isObject(value) ? Object.fromEntries(Object.keys(value).map((k) => [k, true])) : value;
  }
  if (!query.has('orderBy')) return value;
  const child = parseQueryValue(query.get('orderBy'));
  if (typeof child !== 'string') throw new DbError(400, 'orderBy must be a string');
  const eq = query.has('equalTo') ? parseQueryValue(query.get('equalTo')) : undefined;
  const start = query.has('startAt') ? parseQueryValue(query.get('startAt')) : undefined;
  const end = query.has('endAt') ? parseQueryValue(query.get('endAt')) : undefined;
  const pick = (x, k) => (child === '$key' ? k : child === '$value' ? x : x && x[child]);
  return Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(([k, x]) => {
    const c = pick(x, k);
    if (eq !== undefined) return c === eq;
    return (start === undefined || c >= start) && (end === undefined || c <= end);
  }));
}

// Splits the request into db.json writes and chunk operations, applies the rules and returns
// { next, puts, clears } where clears are { key, fileId?, keep:Set } prefixes to clean up.
function plan(current, writes, me, nowMs) {
  const next = clone(current) || {};
  const puts = [];
  const clears = [];
  const partsOf = (key, fileId, p) => {
    for (const [i, data] of Object.entries(isObject(p) ? p : {})) if (typeof data === 'string') puts.push({ key, fileId, i, data });
  };
  for (const [path, value] of writes) {
    const segs = splitPath(path);
    if (segs[0] === 'files') {
      const [, key, fileId, , i] = segs;
      if (isPartsPath(segs)) {
        if (segs.length > 5) throw denied();
        if (segs.length === 5) {
          if (value === null) clears.push({ key, fileId, only: i });
          else if (typeof value === 'string') puts.push({ key, fileId, i, data: value });
          else throw denied();
        } else {
          clears.push({ key, fileId });
          partsOf(key, fileId, value);
        }
      } else if (segs.length === 3) {
        clears.push({ key, fileId });
        if (isObject(value)) partsOf(key, fileId, value.p);
      } else if (segs.length === 2) {
        clears.push({ key });
        for (const [f, node] of Object.entries(isObject(value) ? value : {})) partsOf(key, f, node && node.p);
      } else if (segs.length === 1) {
        throw denied();
      }
    }
    setAt(next, segs, value);
  }
  for (const [path] of writes) if (!canWrite(path, current, next, me, nowMs)) throw denied();
  // Chunks are not stored in db.json.
  for (const files of Object.values(isObject(next.files) ? next.files : {})) {
    for (const node of Object.values(isObject(files) ? files : {})) if (isObject(node)) delete node.p;
  }
  return { next, puts, clears };
}

function createDb({ doc, adapter, now = () => Date.now() }) {
  async function root() {
    return (await doc.get()).value || {};
  }

  async function memberOf(email) {
    const r = await root();
    const user = r.users && r.users[userKey(email)];
    return user && user.kullaniciAdi ? { root: r, user } : null;
  }

  async function read(segs, query) {
    if (isPartsPath(segs)) {
      const [, key, fileId, , i] = segs;
      if (segs.length === 5) return adapter.getPart(key, fileId, i);
      if (segs.length > 5) return null;
      const list = await adapter.listParts(key, fileId);
      const out = {};
      for (const x of list) out[x.i] = await adapter.getPart(key, fileId, x.i);
      return Object.keys(out).length ? applyQuery(out, query) : null;
    }
    const v = getAt(await root(), segs);
    return v === undefined ? null : applyQuery(v, query);
  }

  async function write(writes, me) {
    let result;
    const done = new Set();
    await doc.update(async (current) => {
      result = plan(current, writes, me, now());
      // Chunks first, so metadata never points at missing data; repeated on a retry only if new.
      for (const p of result.puts) {
        const id = `${p.key}/${p.fileId}/${p.i}`;
        if (!done.has(id)) { await adapter.putPart(p.key, p.fileId, p.i, p.data); done.add(id); }
      }
      return result.next;
    });
    const kept = new Set(result.puts.map((p) => `${p.key}/${p.fileId}/${p.i}`));
    for (const c of result.clears) {
      const list = c.only !== undefined ? [{ key: c.key, fileId: c.fileId, i: c.only }] : await adapter.listParts(c.key, c.fileId);
      for (const x of list) if (!kept.has(`${x.key}/${x.fileId}/${x.i}`)) await adapter.deletePart(x.key, x.fileId, x.i);
    }
  }

  // req: { method, path, query: URLSearchParams, body: string|undefined, email }
  async function handle(req) {
    try {
      const member = await memberOf(req.email);
      if (!member) throw denied();
      const segs = splitPath(req.path);
      if (req.method === 'GET') {
        if (!canRead(segs)) throw denied();
        return { status: 200, body: await read(segs, req.query || new URLSearchParams()) };
      }
      let body = null;
      if (req.method !== 'DELETE') {
        try { body = JSON.parse(req.body || 'null'); } catch (e) { throw new DbError(400, 'Invalid data; couldn\'t parse JSON object.'); }
      }
      let writes;
      if (req.method === 'PUT') writes = [[segs.join('/'), body]];
      else if (req.method === 'DELETE') writes = [[segs.join('/'), null]];
      else if (req.method === 'PATCH') {
        if (!isObject(body)) throw new DbError(400, 'PATCH body must be an object');
        writes = Object.entries(body).map(([k, v]) => [[...segs, ...splitPath(k)].join('/'), v]);
      } else throw new DbError(405, 'Method not allowed');
      if (!writes.length) return { status: 200, body };
      await write(writes, member.user.kullaniciAdi);
      return { status: 200, body: req.method === 'DELETE' ? null : body };
    } catch (err) {
      if (err instanceof DbError) return { status: err.status, body: { error: err.message } };
      throw err;
    }
  }

  return { handle, root, memberOf, read, write, plan, doc };
}

module.exports = { createDb, plan, DbError };
