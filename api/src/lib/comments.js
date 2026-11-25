'use strict';

// Comment mails: called by the app after a comment was saved (or edited). Mails everyone tagged with
// @kullaniciAdi and – for a new comment – the task's owner; the author never gets a mail. Who has
// been mailed is recorded in /commentMails/{task}/{comment}/{kullaniciAdi}, so retries and edits
// only reach people who haven't been notified about this comment yet.

const { encodeKey, isObject } = require('./tree');
const { sendMail, buildCommentMail, fullName, MailError } = require('./mail');

const MAX_KEY = 120;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches "@name" for the given user names (not inside a word or an e-mail address); group 1 is
// the character before the "@", group 2 the name. Longer names first so "@FurkanS" beats "@Furkan".
function mentionRegex(names) {
  const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map(escRe);
  return list.length ? new RegExp(`(^|[^\\p{L}\\p{N}_@.])@(${list.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
}

// Users tagged in the text, in order of appearance (case-insensitive, Turkish rules).
function mentionedUsers(text, users) {
  const re = mentionRegex(users.map((u) => u.kullaniciAdi));
  if (!re) return [];
  const out = [];
  for (const m of String(text || '').matchAll(re)) {
    const name = m[2].toLocaleLowerCase('tr');
    const u = users.find((x) => x.kullaniciAdi.toLocaleLowerCase('tr') === name);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

// deps: { db, mail (settings or null), appUrl, fetchFn?, createTransport?, log? }
async function handleCommentNotify(deps, { email, body }) {
  const { db, mail, appUrl, log = {} } = deps;
  try {
    if (!mail) return { status: 503, body: { error: 'Mail gönderimi yapılandırılmamış.' } };
    const taskId = body && typeof body.task === 'string' ? body.task : '';
    const commentId = body && typeof body.comment === 'string' ? body.comment : '';
    if (!taskId || taskId.length > MAX_KEY || !commentId || commentId.length > 64) return { status: 400, body: { error: 'Geçersiz istek.' } };
    const member = await db.memberOf(email);
    if (!member) return { status: 403, body: { error: 'Bu hesabın uygulamaya erişimi yok.' } };
    const { root, user: caller } = member;
    const users = Object.values(isObject(root.users) ? root.users : {}).filter((u) => isObject(u) && u.kullaniciAdi && u.email);

    const key = encodeKey(taskId);
    const cid = encodeKey(commentId);
    const task = root.tasks && root.tasks[key];
    const comment = root.comments && isObject(root.comments[key]) ? root.comments[key][cid] : null;
    const skip = (reason) => ({ status: 200, body: { status: 'skipped', reason } });
    if (!task) return skip('not-found');
    if (!isObject(comment)) return skip('no-comment');
    if (comment.yazan !== caller.kullaniciAdi) return { status: 403, body: { error: 'Yalnızca kendi yorumunuz için bildirim gönderilebilir.' } };

    const mailed = (root.commentMails && isObject(root.commentMails[key]) && isObject(root.commentMails[key][cid])) ? root.commentMails[key][cid] : {};
    const recipients = mentionedUsers(comment.metin, users).map((u) => ({ user: u, reason: 'mention' }));
    // The owner hears about new comments only; an edit notifies newly tagged people only.
    const owner = !comment.duzenlenme && task.sahip ? users.find((u) => u.kullaniciAdi === task.sahip) : null;
    if (owner && !recipients.some((r) => r.user === owner)) recipients.push({ user: owner, reason: 'owner' });
    const todo = recipients.filter((r) => r.user.kullaniciAdi !== caller.kullaniciAdi && !mailed[encodeKey(r.user.kullaniciAdi)]);
    if (!todo.length) return skip('nobody');

    const redirected = !!mail.redirectTo;
    const link = task.no ? `${appUrl}?gorev=${task.no}&yorum=${encodeURIComponent(commentId)}` : appUrl;
    const mentionRe = mentionRegex(users.map((u) => u.kullaniciAdi));
    const sent = [];
    const failed = [];
    for (const { user, reason } of todo) {
      const m = buildCommentMail({ task, comment, caller, recipient: user, reason, link, redirected, mentionRe, edited: !!comment.duzenlenme });
      try {
        await sendMail(mail, {
          to: redirected ? mail.redirectTo : user.email,
          toName: redirected ? '' : fullName(user),
          replyTo: caller.email,
          replyToName: fullName(caller),
          subject: redirected ? `[Test → ${fullName(user)} <${user.email}>] ${m.subject}` : m.subject,
          html: m.html,
          text: m.text,
          idempotencyKey: `comment/${key}/${cid}/${user.kullaniciAdi}`,
        }, deps);
        sent.push(user.kullaniciAdi);
      } catch (err) {
        failed.push({ user: user.kullaniciAdi, status: err instanceof MailError ? err.status : 500, error: err.message });
      }
    }
    if (sent.length) {
      try {
        await db.doc.update((cur) => {
          cur.commentMails = isObject(cur.commentMails) ? cur.commentMails : {};
          const byTask = isObject(cur.commentMails[key]) ? cur.commentMails[key] : (cur.commentMails[key] = {});
          const rec = isObject(byTask[cid]) ? byTask[cid] : (byTask[cid] = {});
          const at = new Date().toISOString();
          for (const name of sent) rec[encodeKey(name)] = at;
          return cur;
        });
      } catch (err) {
        if (log.warn) log.warn('commentMails write failed', err.message);
      }
    }
    if (failed.length) {
      // 503: at least one temporary failure – the app retries (already mailed people are skipped).
      const status = failed.some((f) => f.status === 503) ? 503 : 502;
      if (log.warn) log.warn('comment mail failed', JSON.stringify(failed));
      return { status, body: { error: failed[0].error, sent, failed: failed.map((f) => f.user) } };
    }
    return { status: 200, body: { status: 'sent', sent } };
  } catch (err) {
    if (err instanceof MailError) return { status: err.status, body: { error: err.message } };
    if (log.error) log.error('comment notify failed', err);
    return { status: 500, body: { error: 'Beklenmeyen hata.' } };
  }
}

module.exports = { handleCommentNotify, mentionedUsers, mentionRegex };
