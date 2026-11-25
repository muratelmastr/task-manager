'use strict';

// Shared helpers for the maintenance scripts (run locally with DATA_CONNECTION set).

const crypto = require('crypto');
const { blobAdapter, jsonDoc } = require('../src/lib/store');
const { normalize, isObject, clone } = require('../src/lib/tree');

function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

function storage() {
  if (!process.env.DATA_CONNECTION) {
    console.error('DATA_CONNECTION ortam değişkeni gerekli (depolama hesabı bağlantı dizesi).');
    process.exit(2);
  }
  const adapter = blobAdapter(process.env.DATA_CONNECTION);
  return { adapter, db: jsonDoc(adapter, 'db.json'), auth: jsonDoc(adapter, 'auth.json') };
}

// Splits a Firebase tree into the db.json tree and the attachment chunks.
function splitParts(root) {
  const tree = normalize(clone(root)) || {};
  const parts = [];
  for (const [k, files] of Object.entries(isObject(tree.files) ? tree.files : {})) {
    for (const [f, node] of Object.entries(isObject(files) ? files : {})) {
      if (isObject(node) && isObject(node.p)) {
        for (const [i, data] of Object.entries(node.p)) if (typeof data === 'string') parts.push({ key: k, fileId: f, i, data });
        delete node.p;
      }
    }
  }
  return { tree, parts };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Per-collection record counts (two levels for attachments/files) and a content hash of each.
function summary(tree, parts) {
  const out = {};
  for (const [coll, v] of Object.entries(isObject(tree) ? tree : {})) {
    const nested = coll === 'attachments' || coll === 'files';
    const count = nested
      ? Object.values(isObject(v) ? v : {}).reduce((n, x) => n + (isObject(x) ? Object.keys(x).length : 0), 0)
      : isObject(v) ? Object.keys(v).length : 1;
    out[coll] = { count, hash: sha(stable(v)).slice(0, 16) };
  }
  if (parts) {
    const sorted = [...parts].sort((a, b) => `${a.key}/${a.fileId}/${a.i}`.localeCompare(`${b.key}/${b.fileId}/${b.i}`));
    out['(ek parçaları)'] = { count: parts.length, bytes: parts.reduce((n, p) => n + p.data.length, 0), hash: sha(sorted.map((p) => `${p.key}/${p.fileId}/${p.i}:${sha(p.data)}`).join('\n')).slice(0, 16) };
  }
  return out;
}

// JSON with sorted keys, so equal trees hash equally.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function readAllParts(adapter, tree) {
  const parts = [];
  for (const [k, files] of Object.entries(isObject(tree.files) ? tree.files : {})) {
    for (const f of Object.keys(isObject(files) ? files : {})) {
      for (const x of await adapter.listParts(k, f)) parts.push({ key: k, fileId: f, i: x.i, data: await adapter.getPart(k, f, x.i) });
    }
  }
  return parts;
}

function printTable(title, a, b) {
  console.log(`\n${title}`);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b || {})])].sort();
  for (const k of keys) {
    const x = a[k] || { count: 0, hash: '-' };
    const y = b ? b[k] || { count: 0, hash: '-' } : null;
    const same = y && x.count === y.count && x.hash === y.hash;
    console.log(`  ${k.padEnd(18)} ${String(x.count).padStart(6)}${x.bytes !== undefined ? ` (${Math.round(x.bytes / 1024)} KB)` : ''}${y ? `  ->  ${String(y.count).padStart(6)}  ${same ? 'AYNI' : 'FARKLI'}` : ''}`);
  }
}

module.exports = { args, storage, splitParts, summary, readAllParts, printTable, stable };
