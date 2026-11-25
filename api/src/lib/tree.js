'use strict';

// JSON tree helpers with Firebase Realtime Database semantics (null deletes, empty parents are pruned).

// Firebase keys may not contain . # $ [ ] / or control characters (same encoding as cloud.js).
const encodeKey = (id) => String(id).replace(/[.#$[\]/%\u0000-\u001f\u007f]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`);

// /users keys: lower-case e-mail with every "." written as %2E (see database.rules.json).
const userKey = (email) => String(email || '').trim().toLowerCase().replace(/\./g, '%2E');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function splitPath(path) {
  return String(path || '').split('/').filter(Boolean);
}

function getAt(root, segs) {
  return segs.reduce((o, k) => (o == null || typeof o !== 'object' ? undefined : o[k]), root);
}

// Removes nulls and empty objects (Firebase never stores them).
function normalize(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) v = Object.fromEntries(v.map((x, i) => [String(i), x]));
  if (!isObject(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const n = normalize(x);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

// Sets (or with null deletes) the value at segs, creating and pruning parents like Firebase.
function setAt(root, segs, value) {
  const v = normalize(clone(value));
  if (!segs.length) {
    for (const k of Object.keys(root)) delete root[k];
    if (isObject(v)) Object.assign(root, v);
    return;
  }
  let o = root;
  for (const s of segs.slice(0, -1)) {
    if (!isObject(o[s])) {
      if (v === null) return; // nothing to delete
      o[s] = {};
    }
    o = o[s];
  }
  const last = segs[segs.length - 1];
  if (v === null) delete o[last];
  else o[last] = v;
  for (let i = segs.length - 1; i > 0; i -= 1) {
    const parent = getAt(root, segs.slice(0, i));
    if (isObject(parent) && !Object.keys(parent).length) {
      const grand = i === 1 ? root : getAt(root, segs.slice(0, i - 1));
      delete grand[segs[i - 1]];
    } else break;
  }
}

module.exports = { encodeKey, userKey, clone, isObject, splitPath, getAt, setAt, normalize };
