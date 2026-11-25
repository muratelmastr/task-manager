'use strict';

// Mail sending (SMTP / Azure Communication Services / Resend) and the mail templates.
// Provider: ACS_CONNECTION_STRING, else SMTP_USER+SMTP_PASS (e.g. Gmail app password), else RESEND_API_KEY.

const crypto = require('crypto');

const ACS_API_VERSION = '2023-03-31';

class MailError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fullName = (u) => [u.ad, u.soyad].filter(Boolean).join(' ') || u.kullaniciAdi || u.email;
const formatDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : '');

// "endpoint=https://x.communication.azure.com/;accesskey=..."
function parseAcs(conn) {
  const parts = Object.fromEntries(String(conn).split(';').filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
  }));
  if (!parts.endpoint || !parts.accesskey) throw new MailError(500, 'Geçersiz ACS_CONNECTION_STRING.');
  return { endpoint: parts.endpoint.replace(/\/+$/, ''), key: parts.accesskey };
}

// Returns null when no mail provider is configured.
function mailSettings(env) {
  const acs = env.ACS_CONNECTION_STRING ? parseAcs(env.ACS_CONNECTION_STRING) : null;
  const smtp = !acs && env.SMTP_USER && env.SMTP_PASS ? {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT) || 465,
    user: env.SMTP_USER.trim(),
    pass: env.SMTP_PASS.replace(/\s+/g, ''), // Gmail shows app passwords in groups of four
  } : null;
  if (!acs && !smtp && !env.RESEND_API_KEY) return null;
  if (!env.MAIL_FROM) throw new MailError(500, 'Eksik ayar: MAIL_FROM');
  return { acs, smtp, resendKey: env.RESEND_API_KEY, from: env.MAIL_FROM, redirectTo: (env.MAIL_REDIRECT_TO || '').trim() };
}

async function readJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
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

// m: { to, toName?, replyTo?, replyToName?, subject, html, text, idempotencyKey }
async function sendMail(cfg, m, { fetchFn = fetch, log = {}, createTransport = defaultTransport } = {}) {
  if (cfg.smtp) {
    try {
      const info = await createTransport(cfg.smtp).sendMail({
        from: cfg.from,
        to: m.toName ? { name: m.toName, address: m.to } : m.to,
        ...(m.replyTo ? { replyTo: { name: m.replyToName || '', address: m.replyTo } } : {}),
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
      throw new MailError(temporary ? 503 : 502, `Mail gönderilemedi: ${err.response || err.message}`);
    }
  }
  if (cfg.acs) {
    const url = `${cfg.acs.endpoint}/emails:send?api-version=${ACS_API_VERSION}`;
    const body = JSON.stringify({
      senderAddress: addressOf(cfg.from),
      content: { subject: m.subject, plainText: m.text, html: m.html },
      recipients: { to: [{ address: m.to, ...(m.toName ? { displayName: m.toName } : {}) }] },
      ...(m.replyTo ? { replyTo: [{ address: m.replyTo, displayName: m.replyToName || '' }] } : {}),
      userEngagementTrackingDisabled: true,
    });
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Operation-Id': uuidFrom(m.idempotencyKey), ...acsHeaders(cfg.acs, 'POST', url, body) },
      body,
    });
    const result = await readJson(res);
    if (res.status === 202 || res.ok) return (result && result.id) || null;
    if (log.warn) log.warn('ACS error', res.status, JSON.stringify(result));
    const message = (result && result.error && result.error.message) || res.status;
    // 429: the Azure managed domain allows only a few mails per minute/hour – the app retries later.
    throw new MailError(res.status === 429 ? 503 : 502, `Mail gönderilemedi: ${message}`);
  }
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': m.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from: cfg.from, to: [m.to], ...(m.replyTo ? { reply_to: m.replyTo } : {}), subject: m.subject, html: m.html, text: m.text }),
  });
  const result = await readJson(res);
  if (!res.ok) {
    if (log.warn) log.warn('Resend error', res.status, JSON.stringify(result));
    throw new MailError(502, `Mail gönderilemedi: ${(result && result.message) || res.status}`);
  }
  return result && result.id;
}

function layout(inner, note = '') {
  return `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px">
${note}${inner}
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#9ca3af">Bu mail Ekip Görev Takibi uygulaması tarafından otomatik gönderildi.</p>
</body></html>`;
}
const button = (link, label) => `<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">${esc(label)}</a></p>`;

function buildAssignmentMail({ task, owner, caller, link, redirected }) {
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
  const html = layout(`<p style="margin:0 0 8px;font-size:15px">Merhaba ${esc(owner.ad || fullName(owner))},</p>
<p style="margin:0 0 16px;font-size:15px"><strong>${esc(fullName(caller))}</strong> sizi aşağıdaki görevin sahibi olarak atadı.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b7280;width:160px;vertical-align:top;border-top:1px solid #f0f1f3">${esc(k)}</td><td style="padding:8px 0;font-weight:600;border-top:1px solid #f0f1f3">${esc(v)}</td></tr>`).join('')}</table>
${button(link, 'Görevi aç')}`, note);
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

function buildResetMail({ user, link }) {
  const name = user.ad || fullName(user);
  const subject = 'Ekip Görev Takibi – şifre belirleme';
  const html = layout(`<p style="margin:0 0 8px;font-size:15px">Merhaba ${esc(name)},</p>
<p style="margin:0 0 8px;font-size:15px">Ekip Görev Takibi hesabınız (${esc(user.email)}) için şifre belirleme isteği aldık. Yeni şifrenizi aşağıdaki bağlantıdan belirleyebilirsiniz.</p>
<p style="margin:0;font-size:13px;color:#6b7280">Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği siz yapmadıysanız bu maili dikkate almayın; şifreniz değişmez.</p>
${button(link, 'Yeni şifre belirle')}`);
  const text = [
    `Merhaba ${name},`,
    '',
    `Ekip Görev Takibi hesabınız (${user.email}) için şifre belirleme isteği aldık. Yeni şifrenizi aşağıdaki bağlantıdan belirleyebilirsiniz:`,
    link,
    '',
    'Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği siz yapmadıysanız bu maili dikkate almayın.',
  ].join('\n');
  return { subject, html, text };
}

module.exports = { mailSettings, sendMail, buildAssignmentMail, buildResetMail, acsHeaders, uuidFrom, fullName, MailError };
