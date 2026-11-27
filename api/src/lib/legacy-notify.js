'use strict';

// TEMPORARY (until every browser uses the Azure API): assignment mails requested by the old
// Firebase-based client, verified against Firebase. Remove after the switch to Azure.

// Görev atama maili: uygulama, bir görevin Sahip'ini değiştiren kullanıcının Firebase ID token'ıyla
// bu fonksiyonu çağırır. Token doğrulanır, görev ve kullanıcılar çağıranın yetkisiyle okunur
// (veritabanı kuralları geçerlidir) ve mail gönderilir. Aynı atama için ikinci mail gitmez.
// Gönderim: ACS_CONNECTION_STRING varsa Azure Communication Services, SMTP_USER/SMTP_PASS varsa
// SMTP (ör. Gmail uygulama şifresi), ikisi de yoksa Resend.

const crypto = require('crypto');

const MAX_KEY = 120;
const ACS_API_VERSION = '2023-03-31';

// Firebase keys may not contain . # $ [ ] / or control characters (same encoding as cloud.js).
const encodeKey = (id) => String(id).replace(/[.#$[\]/%\u0000-\u001f\u007f]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fullName = (u) => [u.ad, u.soyad].filter(Boolean).join(' ') || u.kullaniciAdi || u.email;
const formatDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : '');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// "endpoint=https://x.communication.azure.com/;accesskey=..."
function parseAcs(conn) {
  const parts = Object.fromEntries(String(conn).split(';').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
  }));
  if (!parts.endpoint || !parts.accesskey) throw new HttpError(500, 'Geçersiz ACS_CONNECTION_STRING.');
  return { endpoint: parts.endpoint.replace(/\/+$/, ''), key: parts.accesskey };
}

function settings(env) {
  const acs = env.ACS_CONNECTION_STRING ? parseAcs(env.ACS_CONNECTION_STRING) : null;
  const smtp = !acs && env.SMTP_USER && env.SMTP_PASS ? {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT) || 465,
    user: env.SMTP_USER.trim(),
    pass: env.SMTP_PASS.replace(/\s+/g, ''), // Gmail shows app passwords in groups of four
  } : null;
  const need = ['FIREBASE_API_KEY', 'FIREBASE_DB_URL', 'APP_URL', 'MAIL_FROM', ...(acs || smtp ? [] : ['RESEND_API_KEY'])];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new HttpError(500, `Eksik ayar: ${missing.join(', ')}`);
  return {
    acs,
    smtp,
    resendKey: env.RESEND_API_KEY,
    apiKey: env.FIREBASE_API_KEY,
    db: env.FIREBASE_DB_URL.replace(/\/+$/, ''),
    appUrl: env.APP_URL,
    from: env.MAIL_FROM,
    redirectTo: (env.MAIL_REDIRECT_TO || '').trim(),
  };
}

async function readJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}

async function verifyToken(cfg, idToken, fetchFn) {
  const res = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: cfg.appUrl },
    body: JSON.stringify({ idToken }),
  });
  const json = await readJson(res);
  const email = res.ok && json && json.users && json.users[0] && json.users[0].email;
  if (!email) throw new HttpError(401, 'Oturum doğrulanamadı.');
  return String(email).toLowerCase();
}

function database(cfg, idToken, fetchFn) {
  const url = (path) => `${cfg.db}/${path}.json?auth=${encodeURIComponent(idToken)}`;
  const check = async (res, path) => {
    if (res.status === 401 || res.status === 403) throw new HttpError(403, `Veritabanı erişimi reddedildi (${path}).`);
    if (!res.ok) throw new HttpError(502, `Veritabanı hatası (${res.status}).`);
    return readJson(res);
  };
  return {
    get: async (path) => check(await fetchFn(url(path), { method: 'GET' }), path),
    put: async (path, value) => check(await fetchFn(url(path), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), path),
  };
}

function buildMail({ task, owner, caller, link, redirected }) {
  const no = task.no ? `#${task.no}` : '';
  const title = String(task.gorev || '').trim();
  const subject = `Size bir görev atandı: ${no ? `${no} ` : ''}${title}`.slice(0, 250);
  const rows = [
    ['Görev', `${no ? `${no} ` : ''}${title}`],
    ['Alan', task.alan || '—'],
    ['Öncelik', task.oncelik || 'Belirtilmemiş'],
    ['Durum', task.durum || '—'],
    ['Tamamlanma Tarihi', formatDate(task.tamamlanmaTarihi) || '—'],
    ['Atayan', fullName(caller)],
  ];
  const note = redirected
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff8e6;border:1px solid #f5d48a;border-radius:6px;font-size:13px;color:#7a5200">Test modu: bu mail asıl alıcı ${esc(fullName(owner))} &lt;${esc(owner.email)}&gt; yerine size yönlendirildi.</p>`
    : '';
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px">
${note}<p style="margin:0 0 8px;font-size:15px">Merhaba ${esc(owner.ad || fullName(owner))},</p>
<p style="margin:0 0 16px;font-size:15px"><strong>${esc(fullName(caller))}</strong> sizi aşağıdaki görevin sahibi olarak atadı.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b7280;width:160px;vertical-align:top;border-top:1px solid #f0f1f3">${esc(k)}</td><td style="padding:8px 0;font-weight:600;border-top:1px solid #f0f1f3">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#1d6ff2;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">Görevi aç</a></p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#9ca3af">Bu mail SkyTrack uygulaması tarafından otomatik gönderildi.</p>
</body></html>`;
  const text = [
    redirected ? `[Test modu: asıl alıcı ${fullName(owner)} <${owner.email}>]\n` : '',
    `Merhaba ${owner.ad || fullName(owner)},`,
    '',
    `${fullName(caller)} sizi aşağıdaki görevin sahibi olarak atadı.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Görevi aç: ${link}`,
  ].join('\n');
  return { subject, html, text };
}

// Returns { status, body } for the HTTP response.
async function handleNotify({ authorization, body, env, fetchFn = fetch, log = console, createTransport = defaultTransport }) {
  try {
    const cfg = settings(env);
    const idToken = /^Bearer\s+(\S+)$/i.exec(authorization || '');
    if (!idToken) throw new HttpError(401, 'Oturum bilgisi eksik.');
    const taskId = body && typeof body.task === 'string' ? body.task : '';
    if (!taskId || taskId.length > MAX_KEY) throw new HttpError(400, 'Geçersiz görev.');

    const email = await verifyToken(cfg, idToken[1], fetchFn);
    const db = database(cfg, idToken[1], fetchFn);
    const users = Object.values((await db.get('users')) || {}).filter((u) => u && typeof u === 'object');
    const caller = users.find((u) => String(u.email || '').toLowerCase() === email);
    if (!caller) throw new HttpError(403, 'Bu hesabın uygulamaya erişimi yok.');

    const key = encodeKey(taskId);
    const task = await db.get(`tasks/${key}`);
    const skip = (reason) => ({ status: 200, body: { status: 'skipped', reason } });
    if (!task) return skip('not-found');
    if (!task.sahip) return skip('no-owner');
    if (!String(task.gorev || '').trim()) return skip('no-title');
    const owner = users.find((u) => u.kullaniciAdi === task.sahip);
    if (!owner || !owner.email) return skip('unknown-owner');
    if (owner.kullaniciAdi === caller.kullaniciAdi) return skip('self');
    // Until the /assignmentMails rules are published this read is denied: send anyway (the client
    // only calls on real Sahip changes and the provider's idempotency key covers retries).
    const sent = await db.get(`assignmentMails/${key}`).catch((err) => {
      if (err.status !== 403) throw err;
      if (log.warn) log.warn('assignmentMails not readable – publish database.rules.json');
      return null;
    });
    if (sent && sent.sahip === task.sahip) return skip('already-sent');

    const redirected = !!cfg.redirectTo;
    const link = task.no ? `${cfg.appUrl}?gorev=${task.no}` : cfg.appUrl;
    const mail = buildMail({ task, owner, caller, link, redirected });
    const id = await sendMail(cfg, fetchFn, log, createTransport, {
      to: redirected ? cfg.redirectTo : owner.email,
      toName: redirected ? '' : fullName(owner),
      replyTo: caller.email,
      replyToName: fullName(caller),
      subject: redirected ? `[Test → ${fullName(owner)} <${owner.email}>] ${mail.subject}` : mail.subject,
      html: mail.html,
      text: mail.text,
      idempotencyKey: `assign/${key}/${task.sahip}/${task.updatedAt || ''}`,
    });
    try {
      await db.put(`assignmentMails/${key}`, { sahip: task.sahip, at: new Date().toISOString() });
    } catch (err) {
      if (log.warn) log.warn('assignmentMails write failed', err.message);
    }
    return { status: 200, body: { status: 'sent', id } };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    if (log.error) log.error('notify failed', err);
    return { status: 500, body: { error: 'Beklenmeyen hata.' } };
  }
}

// Deterministic UUID from the idempotency key (ACS Operation-Id must be a UUID).
function uuidFrom(text) {
  const h = crypto.createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Azure Communication Services HMAC-SHA256 request signing.
function acsHeaders(acs, method, url, body) {
  const u = new URL(url);
  const date = new Date().toUTCString();
  const contentHash = crypto.createHash('sha256').update(body).digest('base64');
  const toSign = `${method}\n${u.pathname}${u.search}\n${date};${u.host};${contentHash}`;
  const signature = crypto.createHmac('sha256', Buffer.from(acs.key, 'base64')).update(toSign).digest('base64');
  return {
    'x-ms-date': date,
    'x-ms-content-sha256': contentHash,
    Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
  };
}

const addressOf = (from) => { const m = /<([^>]+)>/.exec(from); return (m ? m[1] : from).trim(); };

// SMTP transport, reused across calls on a warm instance.
let cachedTransport = null;
function defaultTransport(smtp) {
  const key = `${smtp.host}:${smtp.port}:${smtp.user}:${smtp.pass}`;
  if (!cachedTransport || cachedTransport.key !== key) {
    const nodemailer = require('nodemailer');
    cachedTransport = {
      key,
      transport: nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } }),
    };
  }
  return cachedTransport.transport;
}

async function sendMail(cfg, fetchFn, log, createTransport, m) {
  if (cfg.smtp) {
    try {
      const info = await createTransport(cfg.smtp).sendMail({
        from: cfg.from,
        to: m.toName ? { name: m.toName, address: m.to } : m.to,
        replyTo: { name: m.replyToName, address: m.replyTo },
        subject: m.subject,
        html: m.html,
        text: m.text,
        messageId: `<${uuidFrom(m.idempotencyKey)}@gorev-takibi>`,
      });
      return (info && info.messageId) || null;
    } catch (err) {
      if (log.warn) log.warn('SMTP error', err.code, err.responseCode, err.message);
      // 4xx replies and connection problems are temporary – the app retries later.
      const temporary = (err.responseCode >= 400 && err.responseCode < 500) || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code);
      throw new HttpError(temporary ? 503 : 502, `Mail gönderilemedi: ${err.response || err.message}`);
    }
  }
  if (cfg.acs) {
    const url = `${cfg.acs.endpoint}/emails:send?api-version=${ACS_API_VERSION}`;
    const body = JSON.stringify({
      senderAddress: addressOf(cfg.from),
      content: { subject: m.subject, plainText: m.text, html: m.html },
      recipients: { to: [{ address: m.to, ...(m.toName ? { displayName: m.toName } : {}) }] },
      replyTo: [{ address: m.replyTo, displayName: m.replyToName }],
      userEngagementTrackingDisabled: true,
    });
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Operation-Id': uuidFrom(m.idempotencyKey), ...acsHeaders(cfg.acs, 'POST', url, body) },
      body,
    });
    const result = await readJson(res);
    if (res.status === 202 || res.ok) return (result && result.id) || res.headers?.get?.('operation-id') || null;
    if (log.warn) log.warn('ACS error', res.status, JSON.stringify(result));
    const message = (result && result.error && result.error.message) || res.status;
    // 429: the Azure managed domain allows only a few mails per minute/hour – the app retries later.
    throw new HttpError(res.status === 429 ? 503 : 502, `Mail gönderilemedi: ${message}`);
  }
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': m.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from: cfg.from, to: [m.to], reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text }),
  });
  const result = await readJson(res);
  if (!res.ok) {
    if (log.warn) log.warn('Resend error', res.status, JSON.stringify(result));
    throw new HttpError(502, `Mail gönderilemedi: ${(result && result.message) || res.status}`);
  }
  return result && result.id;
}

module.exports = { handleNotify, buildMail, encodeKey, acsHeaders, uuidFrom };
