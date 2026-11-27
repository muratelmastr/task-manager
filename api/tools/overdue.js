'use strict';

// Overdue digest by hand (the timer sends it Monday–Friday at 10:00; this tool works any day).
//
//   set DATA_CONNECTION=<storage connection string>
//   node tools/overdue.js --dry-run                     who would get which tasks today (sends nothing)
//   node tools/overdue.js --to murate@logosoft.com.tr   send that person's digest now (mail settings
//                                                        come from the env: SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL)

const { args, storage } = require('./common');
const { mailSettings } = require('../src/lib/mail');
const { runOverdueDigest } = require('../src/lib/overdue');

(async () => {
  const a = args();
  const { db, jobs } = storage();
  const dryRun = !!a['dry-run'];
  if (!dryRun && !a.to) throw new Error('--dry-run veya --to <e-posta> gerekli (herkese gönderim zamanlayıcının işidir).');
  const report = await runOverdueDigest({
    doc: db,
    jobsDoc: jobs,
    mail: dryRun ? null : mailSettings(process.env),
    appUrl: process.env.APP_URL || 'https://muratelmastr.github.io/task-manager/',
    log: console,
  }, { dryRun, onlyTo: a.to, force: !!a.to });
  console.log(`Tarih (İstanbul): ${report.today}`);
  for (const p of dryRun ? report.preview : report.sent) {
    console.log(`\n${dryRun ? 'Gönderilecek' : 'Gönderildi'}: ${p.name} <${p.email}>`);
    p.tasks.forEach((t) => console.log(`  - ${t}`));
  }
  if (!report.preview.length && !report.sent.length) console.log('Gönderilecek mail yok.');
  report.failed.forEach((f) => console.log(`HATA ${f.email}: ${f.error}`));
  process.exit(report.failed.length ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
