'use strict';

// Server-side port of database.rules.json. A request is allowed only if every written path passes.
// canWrite(path, oldRoot, newRoot, me, nowMs): oldRoot/newRoot are the whole tree before/after the
// request (newRoot already contains all writes of the request, like Firebase's newData/root).

const { getAt, splitPath, isObject } = require('./tree');

const COLLECTIONS = ['users', 'tasks', 'lists', 'taskNumbers', 'details', 'attachments', 'files', 'timesheets', 'assignmentMails', 'comments', 'commentMails'];
const MAX_COMMENT = 600;
const DONE = 'Tamamlandı';
const DAY_MS = 86400000;

const isStr = (v, max, min = 0) => typeof v === 'string' && v.length >= min && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v);
const has = (o, keys) => isObject(o) && keys.every((k) => o[k] !== undefined && o[k] !== null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Validates the children of a record that this request changes ($other: false for unknown ones).
function fieldsOk(oldRec, newRec, validators) {
  for (const [k, v] of Object.entries(newRec)) {
    if (isObject(oldRec) && same(oldRec[k], v)) continue; // untouched by this write
    const check = validators[k];
    if (!check || !check(v)) return false;
  }
  return true;
}

const TASK_FIELDS = {
  id: (v) => isStr(v, 120),
  gorev: (v) => isStr(v, 1000),
  alan: (v) => isStr(v, 200),
  sahip: (v) => isStr(v, 200),
  durum: (v) => isStr(v, 200, 1),
  oncelik: (v) => typeof v === 'string' && ['', 'Yüksek', 'Orta', 'Düşük'].includes(v),
  tamamlanmaTarihi: (v) => v === '' || isDate(v),
  completedAt: (v) => isStr(v, 40),
  createdAt: (v) => isStr(v, 40),
  updatedAt: (v) => isStr(v, 40),
  createdBy: (v) => isStr(v, 120, 1),
  no: (v) => isNum(v) && v >= 1 && v <= 9999999,
  aciklamaVar: (v) => v === true,
  ekSayisi: (v) => isNum(v) && v >= 1 && v <= 1000,
  yorumSayisi: (v) => isNum(v) && v >= 1 && v <= 100000,
};
const COMMENT_FIELDS = {
  yazan: (v) => isStr(v, 120, 1),
  metin: (v) => isStr(v, MAX_COMMENT, 1) && v.trim().length > 0,
  tarih: (v) => isStr(v, 40, 1),
  duzenlenme: (v) => isStr(v, 40, 1),
};
const DETAIL_FIELDS = {
  aciklama: (v) => isStr(v, 3000000), // HTML incl. embedded images (data URIs)
  updatedAt: (v) => isStr(v, 40),
  updatedBy: (v) => isStr(v, 120),
};
const ATTACHMENT_FIELDS = {
  ad: (v) => isStr(v, 255, 1),
  boyut: (v) => isNum(v) && v >= 1 && v <= 10485760,
  tur: (v) => isStr(v, 200),
  yukleyen: (v) => isStr(v, 120, 1),
  yuklenmeTarihi: (v) => isStr(v, 40),
  parca: (v) => isNum(v) && v >= 1 && v <= 40,
};
const TIMESHEET_FIELDS = {
  gorevId: (v) => isStr(v, 120, 1),
  kullanici: (v) => isStr(v, 120, 1),
  tarih: isDate,
  gun: isNum,
  saat: (v) => isNum(v) && v > 0 && v <= 24 && (v * 4) % 1 === 0,
  not: (v) => isStr(v, 200),
  gorevNo: (v) => isNum(v) && v >= 1,
  gorevAdi: (v) => isStr(v, 1000),
  alan: (v) => isStr(v, 200),
  createdAt: (v) => isStr(v, 40),
  updatedAt: (v) => isStr(v, 40),
};
const MAIL_FIELDS = {
  sahip: (v) => isStr(v, 200, 1),
  at: (v) => isStr(v, 40),
};

function canRead(segs) {
  return segs.length > 0 && COLLECTIONS.includes(segs[0]);
}

function canWrite(path, oldRoot, newRoot, me, nowMs = Date.now()) {
  const segs = splitPath(path);
  const [coll, key] = segs;
  if (!coll || !key || !me) return false; // no .write at the root or on whole collections
  const oldV = getAt(oldRoot, [coll, key]);
  const newV = getAt(newRoot, [coll, key]);
  const today = nowMs / DAY_MS;

  switch (coll) {
    case 'tasks': {
      if (newV == null) return !(oldV && oldV.durum === DONE);
      if (key.length > 120 || !has(newV, ['id', 'gorev', 'durum'])) return false;
      if (oldV && oldV.createdBy !== undefined && newV.createdBy !== oldV.createdBy) return false;
      if (oldV && oldV.no !== undefined && newV.no !== oldV.no) return false;
      return fieldsOk(oldV, newV, TASK_FIELDS);
    }
    case 'lists':
      return newV != null && ['alan', 'sahip', 'durum'].includes(key) && isStr(newV, 20000);
    case 'taskNumbers':
      return oldV === undefined && newV != null && /^[1-9][0-9]{0,6}$/.test(key) && isStr(newV, 120);
    case 'details':
      if (newV == null) return true;
      return key.length <= 120 && has(newV, ['aciklama']) && fieldsOk(oldV, newV, DETAIL_FIELDS);
    case 'assignmentMails':
      if (newV == null) return true;
      return key.length <= 120 && has(newV, ['sahip', 'at']) && fieldsOk(oldV, newV, MAIL_FIELDS);
    case 'timesheets': {
      if (oldV == null && newV == null) return true;
      const writeOk = (oldV == null && newV && newV.kullanici === me)
        || (oldV && oldV.kullanici === me && oldV.gun >= today - 31 && (newV == null || newV.kullanici === me));
      if (!writeOk) return false;
      if (newV == null) return true;
      return key.length <= 64 && has(newV, ['gorevId', 'kullanici', 'tarih', 'gun', 'saat'])
        && newV.gun >= today - 31 && newV.gun <= today + 1 && fieldsOk(oldV, newV, TIMESHEET_FIELDS);
    }
    case 'comments': {
      // $key level: a deleted task takes its comments with it.
      if (newV == null && getAt(newRoot, ['tasks', key]) == null) return true;
      if (segs.length < 3) return false;
      const cid = segs[2];
      const o = getAt(oldRoot, [coll, key, cid]);
      const n = getAt(newRoot, [coll, key, cid]);
      // Everyone writes only their own comments; the author never changes.
      const ok = (o == null && n && n.yazan === me && getAt(newRoot, ['tasks', key]) != null)
        || (o != null && o.yazan === me && (n == null || n.yazan === me));
      if (!ok) return false;
      if (n == null) return true;
      return cid.length <= 64 && has(n, ['yazan', 'metin', 'tarih']) && (o == null || n.tarih === o.tarih) && fieldsOk(o, n, COMMENT_FIELDS);
    }
    case 'commentMails':
      // Written by the comment-notify function only; removed together with the task.
      return newV == null && getAt(newRoot, ['tasks', key]) == null;
    case 'attachments':
    case 'files': {
      // $key level: a deleted task takes all of its attachments with it.
      const cascade = newV == null && getAt(newRoot, ['tasks', key]) == null;
      if (cascade) return true;
      if (segs.length < 3) return false;
      const fid = segs[2];
      const o = getAt(oldRoot, [coll, key, fid]);
      const n = getAt(newRoot, [coll, key, fid]);
      if (coll === 'attachments') {
        const ok = (o == null && n && n.yukleyen === me) || (o != null && n == null && o.yukleyen === me);
        if (!ok) return false;
        if (n == null) return true;
        return fid.length <= 64 && has(n, ['ad', 'boyut', 'yukleyen', 'yuklenmeTarihi', 'parca']) && fieldsOk(o, n, ATTACHMENT_FIELDS);
      }
      const ok = (o == null && n && n.yukleyen === me) || (o != null && o.yukleyen === me);
      if (!ok) return false;
      if (n == null) return true;
      if (fid.length > 64 || !has(n, ['yukleyen']) || !isStr(n.yukleyen, 120) || (o && n.yukleyen !== o.yukleyen)) return false;
      for (const [k, v] of Object.entries(n)) {
        if (k === 'yukleyen') continue;
        if (k !== 'p' || !isObject(v)) return false;
        for (const [i, part] of Object.entries(v)) {
          if (o && o.p && o.p[i] === part) continue;
          if (!/^[0-9]{1,2}$/.test(i) || !isStr(part, 600000)) return false;
        }
      }
      return true;
    }
    default:
      return false; // users are read-only; unknown collections are closed
  }
}

module.exports = { canRead, canWrite, COLLECTIONS, MAX_COMMENT };
