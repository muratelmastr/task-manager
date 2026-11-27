'use strict';

const { app } = require('@azure/functions');
const { fromEnv } = require('../lib/context');
const { jsonDoc } = require('../lib/store');
const { mailSettings } = require('../lib/mail');
const { runOverdueDigest } = require('../lib/overdue');

// Monday–Friday at 10:00 Turkey time (UTC+3 all year, no daylight saving) = 07:00 UTC; no mail on weekends.
app.timer('overdueDigest', {
  schedule: '0 0 7 * * 1-5',
  handler: async (timer, context) => {
    const log = { warn: (...a) => context.warn(...a), error: (...a) => context.error(...a) };
    const api = fromEnv(process.env, log);
    const report = await runOverdueDigest({
      doc: api.doc,
      jobsDoc: jsonDoc(api.adapter, 'jobs.json'),
      mail: mailSettings(process.env),
      appUrl: process.env.APP_URL || '',
      log,
    });
    context.log('overdue digest', report.today, JSON.stringify({ sent: report.sent.map((s) => s.email), skipped: report.skipped, failed: report.failed }));
  },
});
