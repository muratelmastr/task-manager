'use strict';

// Builds the API from the Function App settings (one instance per process).

const { createApi } = require('./router');
const { blobAdapter, memoryAdapter } = require('./store');
const { mailSettings } = require('./mail');

let api = null;
let adapter = null;

function fromEnv(env = process.env, log = console) {
  if (api) return api;
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET ayarı eksik veya kısa.');
  adapter = env.DATA_CONNECTION ? blobAdapter(env.DATA_CONNECTION) : memoryAdapter();
  api = createApi({
    adapter,
    secret: env.JWT_SECRET,
    appUrl: env.APP_URL || '',
    mail: mailSettings(env),
    firebaseApiKey: env.FIREBASE_API_KEY || '',
    env,
    log,
  });
  return api;
}

function storage(env = process.env) {
  if (!adapter) fromEnv(env);
  return adapter;
}

module.exports = { fromEnv, storage };
