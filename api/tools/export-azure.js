'use strict';

// Exports the Azure data as one Firebase-compatible JSON file (attachment chunks included).
// Use it for an off-site backup or to go back to Firebase (Realtime Database -> Import JSON).
//
//   set DATA_CONNECTION=<storage connection string>
//   node tools/export-azure.js --out azure-export.json

const fs = require('fs');
const { args, storage, readAllParts, summary, printTable } = require('./common');

(async () => {
  const a = args();
  const out = a.out || `azure-export-${new Date().toISOString().slice(0, 10)}.json`;
  const { adapter, db } = storage();
  const tree = JSON.parse(JSON.stringify((await db.get()).value || {}));
  const parts = await readAllParts(adapter, tree);
  for (const p of parts) {
    const node = tree.files[p.key][p.fileId];
    node.p = node.p || {};
    node.p[p.i] = p.data;
  }
  fs.writeFileSync(out, JSON.stringify(tree));
  printTable(`Dışa aktarıldı: ${out}`, summary(tree, parts));
})().catch((e) => { console.error(e); process.exit(2); });
