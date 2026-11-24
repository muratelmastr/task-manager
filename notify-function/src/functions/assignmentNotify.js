'use strict';

const { app } = require('@azure/functions');
const { handleNotify } = require('../notify');

// POST /api/assignment-notify  { task: "<görev id>" }  Authorization: Bearer <Firebase ID token>
// CORS is configured on the Function App (only the GitHub Pages origin).
app.http('assignmentNotify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'assignment-notify',
  handler: async (request, context) => {
    let body = null;
    try { body = await request.json(); } catch (e) { /* invalid JSON -> 400 below */ }
    const result = await handleNotify({
      authorization: request.headers.get('authorization'),
      body,
      env: process.env,
      log: { warn: (...a) => context.warn(...a), error: (...a) => context.error(...a) },
    });
    context.log('assignment-notify', result.status, JSON.stringify(result.body));
    return { status: result.status, jsonBody: result.body };
  },
});
