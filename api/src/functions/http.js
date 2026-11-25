'use strict';

const { app } = require('@azure/functions');
const { fromEnv } = require('../lib/context');

// One catch-all HTTP function; routing happens in lib/router.js (shared with the tests).
// CORS is configured on the Function App (only the GitHub Pages origin).
app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: '{*rest}',
  handler: async (request, context) => {
    const url = new URL(request.url);
    const api = fromEnv(process.env, { warn: (...a) => context.warn(...a), error: (...a) => context.error(...a) });
    const res = await api.handle({
      method: request.method,
      path: url.pathname.replace(/^\/api(\/|$)/, ''),
      query: url.searchParams,
      headers: { authorization: request.headers.get('authorization') || '' },
      body: request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.text(),
    });
    if (res.status >= 500) context.warn('api', request.method, url.pathname, res.status, res.body);
    return { status: res.status, headers: res.headers, body: res.body };
  },
});
