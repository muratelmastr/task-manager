'use strict';

// Imports a Firebase Realtime Database JSON export into Azure.
//
//   set DATA_CONNECTION=<storage connection string>
//   node tools/import-firebase.js --export firebase-export.json [--mode full|merge] [--dry-run] [--force]
//
// full  : writes the whole export (first migration). Refuses to overwrite existing data unless --force;
//         the previous db.json is copied to backups/ first.
// merge : adds records missing in Azure and takes newer ones (by updatedAt) from the export.
//         Never deletes. Used for changes made in Firebase during the switch.
// After writing, the data is read back from Azure and compared with the export (counts + hashes).

const fs = require('fs');
const { args, storage, splitParts, summary, readAllParts, printTable, stable } = require('./common');
const { isObject } = require('../src/lib/tree');

const STAMPED = ['tasks', 'details', 'timesheets'];

function merge(current, incoming, report) {
  const out = JSON.parse(JSON.stringify(current || {}));
  for (const [coll, records] of Object.entries(incoming)) {
    if (!isObject(records)) {
      if (out[coll] === undefined) { out[coll] = records; report.push(`${coll}: eklendi`); }
      continue;
    }
    out[coll] = isObject(out[coll]) ? out[coll] : {};
    for (const [key, rec] of Object.entries(records)) {
      const have = out[coll][key];
      if (have === undefined) {
        out[coll][key] = rec;
        report.push(`${coll}/${key}: eklendi`);
      } else if (coll === 'attachments' || coll === 'files') {
        for (const [fid, x] of Object.entries(isObject(rec) ? rec : {})) {
          if (!isObject(have) || have[fid] === undefined) { out[coll][key] = { ...(isObject(have) ? have : {}), [fid]: x }; report.push(`${coll}/${key}/${fid}: eklendi`); }
        }
      } else if (STAMPED.includes(coll) && isObject(rec) && isObject(have) && String(rec.updatedAt || '') > String(have.updatedAt || '')) {
        out[coll][key] = { ...rec, ...(have.no !== undefined ? { no: have.no } : {}), ...(have.createdBy !== undefined ? { createdBy: have.createdBy } : {}) };
        report.push(`${coll}/${key}: daha yeni sürüm alındı`);
      } else if (stable(rec) !== stable(have)) {
        report.push(`${coll}/${key}: farklı, Azure'daki korundu`);
      }
    }
  }
  return out;
}

(async () => {
  const a = args();
  if (!a.export) { console.error('Kullanım: node tools/import-firebase.js --export <dosya.json> [--mode full|merge] [--dry-run] [--force]'); process.exit(2); }
  const mode = a.mode || 'full';
  const raw = JSON.parse(fs.readFileSync(a.export, 'utf8'));
  const { tree, parts } = splitParts(raw);
  const src = summary(tree, parts);
  printTable(`Dışa aktarım (${a.export})`, src);

  const { adapter, db } = storage();
  await adapter.ensureContainers();
  const cur = await db.get();
  const curTree = cur.value || {};
  const hasData = Object.keys(curTree).length > 0;

  let next;
  const report = [];
  if (mode === 'full') {
    if (hasData && !a.force) { console.error('\nAzure\'da zaten veri var. Üzerine yazmak için --force, eklemek için --mode merge kullanın.'); process.exit(1); }
    next = tree;
  } else if (mode === 'merge') {
    next = merge(curTree, tree, report);
    console.log(`\nBirleştirme: ${report.length} değişiklik`);
    report.slice(0, 200).forEach((r) => console.log(`  ${r}`));
  } else { console.error('mode: full veya merge'); process.exit(2); }

  const existing = new Set();
  for (const [k, files] of Object.entries(isObject(curTree.files) ? curTree.files : {})) {
    for (const f of Object.keys(files)) for (const x of await adapter.listParts(k, f)) existing.add(`${k}/${f}/${x.i}`);
  }
  const uploads = parts.filter((p) => mode === 'full' || !existing.has(`${p.key}/${p.fileId}/${p.i}`));
  console.log(`\nYüklenecek ek parçası: ${uploads.length}`);
  if (a['dry-run']) { console.log('\n--dry-run: hiçbir şey yazılmadı.'); return; }

  if (hasData) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await adapter.backup('db.json', `db-before-import-${stamp}.json`);
    console.log(`Önceki db.json yedeklendi: backups/db-before-import-${stamp}.json`);
  }
  let n = 0;
  for (const p of uploads) {
    await adapter.putPart(p.key, p.fileId, p.i, p.data);
    n += 1;
    if (n % 20 === 0) process.stdout.write(`  ${n}/${uploads.length}\r`);
  }
  await db.update(() => next);
  db.invalidate();

  // Verification: read everything back from Azure.
  const after = (await db.get()).value || {};
  const afterParts = await readAllParts(adapter, after);
  const dst = summary(after, afterParts);
  printTable('Doğrulama (dışa aktarım -> Azure)', src, dst);
  const keys = Object.keys(src);
  const ok = mode === 'full'
    ? keys.every((k) => dst[k] && dst[k].count === src[k].count && dst[k].hash === src[k].hash)
    : keys.every((k) => dst[k] && dst[k].count >= src[k].count);
  console.log(ok ? '\nSONUÇ: TAMAM – veriler eksiksiz aktarıldı.' : '\nSONUÇ: UYUMSUZLUK VAR – yukarıdaki FARKLI satırlarını kontrol edin.');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
