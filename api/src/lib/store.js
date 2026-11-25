'use strict';

// Storage adapters. The whole JSON tree (except attachment chunks) is one document ("db.json");
// sign-in data is a second document ("auth.json"). Documents are written with optimistic
// concurrency (ETag): a request that lost a race re-reads the document and is evaluated again,
// so multi-path updates stay atomic like in Firebase. Attachment chunks are separate blobs.
//
// adapter interface:
//   readDoc(name, ifNoneMatch?) -> { value, etag } | { notModified: true }   (missing: value null)
//   writeDoc(name, value, etag) -> newEtag   (etag null = create only; throws ConflictError)
//   getPart(key, fileId, i) -> string | null
//   putPart(key, fileId, i, data)
//   listParts(key, fileId?) -> [{ key, fileId, i }]
//   deletePart(key, fileId, i)
//   backup(name, targetName)   (optional)

const { clone } = require('./tree');

class ConflictError extends Error {
  constructor() {
    super('Document changed concurrently');
    this.code = 'conflict';
  }
}

// Cached JSON document with conditional reads and optimistic-concurrency updates.
function jsonDoc(adapter, name) {
  let cache = null; // { value, etag }
  return {
    async get() {
      const res = await adapter.readDoc(name, cache && cache.etag);
      if (res.notModified && cache) return cache;
      cache = { value: res.value, etag: res.etag };
      return cache;
    },
    // fn(currentValueClone) -> newValue | undefined (no change). Retries on concurrent writes.
    async update(fn) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const cur = await this.get();
        const next = await fn(clone(cur.value) || {}, attempt);
        if (next === undefined || JSON.stringify(next) === JSON.stringify(cur.value || {})) return cur.value;
        try {
          const etag = await adapter.writeDoc(name, next, cur.etag);
          cache = { value: next, etag };
          return next;
        } catch (err) {
          if (err.code !== 'conflict') throw err;
          cache = null;
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
        }
      }
      throw new Error('Too many concurrent updates, try again.');
    },
    invalidate() { cache = null; },
  };
}

// In-memory adapter (unit tests and local runs).
function memoryAdapter(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, { value: clone(v), etag: '1' }]));
  const parts = new Map();
  let n = 1;
  const partName = (k, f, i) => `${k}\u0000${f}\u0000${i}`;
  return {
    docs,
    parts,
    async readDoc(name, ifNoneMatch) {
      const d = docs.get(name);
      if (!d) return { value: null, etag: null };
      if (ifNoneMatch && ifNoneMatch === d.etag) return { notModified: true };
      return { value: clone(d.value), etag: d.etag };
    },
    async writeDoc(name, value, etag) {
      const d = docs.get(name);
      if ((etag === null && d) || (etag !== null && (!d || d.etag !== etag))) throw new ConflictError();
      const next = { value: clone(value), etag: String(++n) };
      docs.set(name, next);
      return next.etag;
    },
    async getPart(k, f, i) { return parts.has(partName(k, f, i)) ? parts.get(partName(k, f, i)) : null; },
    async putPart(k, f, i, data) { parts.set(partName(k, f, i), data); },
    async listParts(k, f) {
      return [...parts.keys()].map((x) => x.split('\u0000')).filter(([a, b]) => a === k && (f === undefined || b === f)).map(([key, fileId, i]) => ({ key, fileId, i }));
    },
    async deletePart(k, f, i) { parts.delete(partName(k, f, i)); },
    async backup(name, target) { const d = docs.get(name); if (d) docs.set(target, { value: clone(d.value), etag: String(++n) }); },
  };
}

// Azure Blob Storage adapter. Container "data" holds the documents and files/<key>/<fileId>/<i>;
// container "backups" holds daily copies.
function blobAdapter(connectionString, { container = 'data', backupContainer = 'backups' } = {}) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const svc = BlobServiceClient.fromConnectionString(connectionString);
  const data = svc.getContainerClient(container);
  const backups = svc.getContainerClient(backupContainer);
  const enc = encodeURIComponent;
  const partBlob = (k, f, i) => data.getBlockBlobClient(`files/${enc(k)}/${enc(f)}/${i}`);

  async function readText(blob, conditions) {
    const res = await blob.download(0, undefined, { conditions });
    const chunks = [];
    for await (const c of res.readableStreamBody) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return { text: Buffer.concat(chunks).toString('utf8'), etag: res.etag };
  }
  async function upload(blob, text, conditions) {
    const buf = Buffer.from(text, 'utf8');
    const res = await blob.upload(buf, buf.length, { conditions, blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' } });
    return res.etag;
  }

  return {
    async readDoc(name, ifNoneMatch) {
      try {
        const { text, etag } = await readText(data.getBlockBlobClient(name), ifNoneMatch ? { ifNoneMatch } : undefined);
        return { value: text ? JSON.parse(text) : null, etag };
      } catch (err) {
        if (err.statusCode === 304) return { notModified: true };
        if (err.statusCode === 404) return { value: null, etag: null };
        throw err;
      }
    },
    async writeDoc(name, value, etag) {
      try {
        return await upload(data.getBlockBlobClient(name), JSON.stringify(value), etag ? { ifMatch: etag } : { ifNoneMatch: '*' });
      } catch (err) {
        if (err.statusCode === 412 || err.statusCode === 409) throw new ConflictError();
        throw err;
      }
    },
    async getPart(k, f, i) {
      try {
        return (await readText(partBlob(k, f, i))).text;
      } catch (err) {
        if (err.statusCode === 404) return null;
        throw err;
      }
    },
    async putPart(k, f, i, text) { await upload(partBlob(k, f, i), text); },
    async listParts(k, f) {
      const prefix = f === undefined ? `files/${enc(k)}/` : `files/${enc(k)}/${enc(f)}/`;
      const out = [];
      for await (const b of data.listBlobsFlat({ prefix })) {
        const [, key, fileId, i] = b.name.split('/');
        out.push({ key: decodeURIComponent(key), fileId: decodeURIComponent(fileId), i });
      }
      return out;
    },
    async deletePart(k, f, i) { await partBlob(k, f, i).deleteIfExists(); },
    async backup(name, target) {
      try {
        const { text } = await readText(data.getBlockBlobClient(name));
        await upload(backups.getBlockBlobClient(target), text);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    },
    async ensureContainers() {
      await data.createIfNotExists();
      await backups.createIfNotExists();
    },
  };
}

module.exports = { jsonDoc, memoryAdapter, blobAdapter, ConflictError };
