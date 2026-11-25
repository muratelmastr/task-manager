'use strict';

// Daily overdue digest: one mail per owner listing their open tasks whose Tamamlanma Tarihi is
// past (geciken) or today (bugün doluyor). Dates follow the Europe/Istanbul calendar.
// jobs.json { overdue: { <email>: 'YYYY-MM-DD' } } records who got today's mail, so a second run
// on the same day sends nothing again.

const { isObject } = require('./tree');
const { sendMail, buildOverdueMail, fullName } = require('./mail');

const DONE = 'Tamamlandı';
const ZONE = 'Europe/Istanbul';
const DAY_MS = 86400000;

const isoDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };

// Returns [{ user, tasks: [{ id, no, gorev, tamamlanmaTarihi, days }] }], tasks sorted most overdue first.
function collectOverdue(root, today) {
  const users = Object.values(isObject(root.users) ? root.users : {}).filter((u) => isObject(u) && u.kullaniciAdi && u.email);
  const byName = new Map(users.map((u) => [u.kullaniciAdi, u]));
  const groups = new Map();
  const t0 = dayNumber(today);
  for (const t of Object.values(isObject(root.tasks) ? root.tasks : {})) {
    if (!isObject(t) || t.durum === DONE || !/^\d{4}-\d{2}-\d{2}$/.test(t.tamamlanmaTarihi || '')) continue;
    const days = t0 - dayNumber(t.tamamlanmaTarihi);
    if (days < 0) continue;
    const user = byName.get(t.sahip);
    if (!user || !String(t.gorev || '').trim()) continue;
    if (!groups.has(user.email)) groups.set(user.email, { user, tasks: [] });
    groups.get(user.email).tasks.push({ id: t.id, no: t.no || null, gorev: t.gorev, tamamlanmaTarihi: t.tamamlanmaTarihi, days });
  }
  const out = [...groups.values()];
  for (const g of out) g.tasks.sort((a, b) => b.days - a.days || (a.no || 1e9) - (b.no || 1e9));
  return out.sort((a, b) => (a.user.sira || 0) - (b.user.sira || 0));
}

// deps: { doc, jobsDoc, mail, appUrl, now?, fetchFn?, createTransport?, log? }
// opts: { dryRun?, onlyTo? (e-mail), force? (manual send: ignores and does not write today's record) }
async function runOverdueDigest(deps, opts = {}) {
  const today = isoDay(new Date(deps.now ? deps.now() : Date.now()));
  const root = (await deps.doc.get()).value || {};
  const groups = collectOverdue(root, today).filter((g) => !opts.onlyTo || g.user.email.toLowerCase() === String(opts.onlyTo).toLowerCase());
  const jobs = (await deps.jobsDoc.get()).value || {};
  const done = isObject(jobs.overdue) ? jobs.overdue : {};
  const report = { today, sent: [], skipped: [], failed: [], preview: [] };
  for (const g of groups) {
    const email = g.user.email.toLowerCase();
    const line = { email, name: fullName(g.user), tasks: g.tasks.map((t) => `${t.no ? `#${t.no} ` : ''}${t.gorev} (${t.days > 0 ? `${t.days} gün` : 'bugün'})`) };
    if (opts.dryRun) { report.preview.push(line); continue; }
    if (!opts.force && done[email] === today) { report.skipped.push(email); continue; }
    if (!deps.mail) { report.failed.push({ email, error: 'Mail gönderimi yapılandırılmamış.' }); continue; }
    const redirected = !!deps.mail.redirectTo;
    const m = buildOverdueMail({ user: g.user, tasks: g.tasks, appUrl: deps.appUrl, redirected });
    try {
      await sendMail(deps.mail, {
        to: redirected ? deps.mail.redirectTo : g.user.email,
        toName: redirected ? '' : fullName(g.user),
        subject: redirected ? `[Test → ${fullName(g.user)} <${g.user.email}>] ${m.subject}` : m.subject,
        html: m.html,
        text: m.text,
        idempotencyKey: `overdue/${email}/${today}${opts.force ? `/${Date.now()}` : ''}`,
      }, deps);
      report.sent.push(line);
      if (!opts.force) await deps.jobsDoc.update((cur) => {
        cur.overdue = isObject(cur.overdue) ? cur.overdue : {};
        cur.overdue[email] = today;
        return cur;
      });
    } catch (err) {
      report.failed.push({ email, error: err.message });
      if (deps.log && deps.log.warn) deps.log.warn('overdue mail failed', email, err.message);
    }
  }
  return report;
}

module.exports = { collectOverdue, runOverdueDigest, isoDay };
