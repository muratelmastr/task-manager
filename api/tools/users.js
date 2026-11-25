'use strict';

// Team members (replaces the Firebase console user management).
//
//   set DATA_CONNECTION=<storage connection string>
//   node tools/users.js list
//   node tools/users.js add --email ayse@logosoft.com.tr --ad Ayşe --soyad Yılmaz --kullanici Ayse [--sira 8]
//   node tools/users.js remove --email ayse@logosoft.com.tr
//   set NEW_PASSWORD=...   &   node tools/users.js set-password --email ayse@logosoft.com.tr
//
// A new member can also set a password with "Şifremi unuttum" on the login screen.

const { args, storage } = require('./common');
const { userKey, isObject } = require('../src/lib/tree');
const { hashPassword } = require('../src/lib/crypto');

(async () => {
  const a = args();
  const cmd = a._[0];
  const { db, auth } = storage();
  const email = String(a.email || '').trim().toLowerCase();

  if (cmd === 'list') {
    const users = Object.values(((await db.get()).value || {}).users || {});
    const creds = ((await auth.get()).value || {}).users || {};
    users.sort((x, y) => (x.sira || 0) - (y.sira || 0)).forEach((u) => {
      const c = creds[u.email.toLowerCase()];
      console.log(`${String(u.sira || '').padStart(2)}  ${u.kullaniciAdi.padEnd(10)} ${`${u.ad} ${u.soyad}`.padEnd(22)} ${u.email.padEnd(32)} ${c && c.hash ? (c.migratedAt ? 'şifre taşındı' : 'şifre var') : 'henüz giriş yapmadı'}`);
    });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email gerekli');

  if (cmd === 'add') {
    if (!a.ad || !a.kullanici) throw new Error('--ad ve --kullanici gerekli');
    await db.update((cur) => {
      cur.users = isObject(cur.users) ? cur.users : {};
      if (Object.values(cur.users).some((u) => u.kullaniciAdi === a.kullanici && u.email !== email)) throw new Error(`Kullanıcı adı kullanımda: ${a.kullanici}`);
      const sira = Number(a.sira) || Math.max(0, ...Object.values(cur.users).map((u) => u.sira || 0)) + 1;
      cur.users[userKey(email)] = { ad: String(a.ad), soyad: String(a.soyad || ''), kullaniciAdi: String(a.kullanici), email, sira };
      return cur;
    });
    console.log(`Eklendi: ${email}. Şifre için "Şifremi unuttum" kullanılabilir veya set-password çalıştırın.`);
  } else if (cmd === 'remove') {
    await db.update((cur) => { if (cur.users) delete cur.users[userKey(email)]; return cur; });
    await auth.update((cur) => { if (cur.users) delete cur.users[email]; return cur; });
    console.log(`Kaldırıldı: ${email} (görevleri ve zaman girişleri korunur).`);
  } else if (cmd === 'set-password') {
    const pw = process.env.NEW_PASSWORD || '';
    if (pw.length < 6) throw new Error('NEW_PASSWORD ortam değişkeni (en az 6 karakter) gerekli');
    const hash = await hashPassword(pw);
    await auth.update((cur) => {
      cur.users = isObject(cur.users) ? cur.users : {};
      const r = cur.users[email] || {};
      cur.users[email] = { ...r, hash, ver: (r.ver || 0) + 1, failed: 0, lockedUntil: 0, updatedAt: new Date().toISOString() };
      return cur;
    });
    console.log(`Şifre ayarlandı: ${email} (açık oturumları kapatıldı).`);
  } else {
    throw new Error('Komut: list | add | remove | set-password');
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
