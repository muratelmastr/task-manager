'use strict';

const { app } = require('@azure/functions');
const { storage } = require('../lib/context');

// Daily copy of the data documents into the "backups" container (kept 30 days by a lifecycle rule).
// Attachment chunks are protected by blob soft delete and versioning instead.
app.timer('dailyBackup', {
  schedule: '0 30 1 * * *',
  handler: async (timer, context) => {
    const day = new Date().toISOString().slice(0, 10);
    const adapter = storage(process.env);
    await adapter.backup('db.json', `db-${day}.json`);
    await adapter.backup('auth.json', `auth-${day}.json`);
    context.log('backup done', day);
  },
});
