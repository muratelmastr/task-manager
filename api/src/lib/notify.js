'use strict';

// Assignment mail: called by the app after a task's Sahip was changed and saved. Reads the task and
// users from the database, mails the owner once per assignment and records it in /assignmentMails.

const { encodeKey, isObject } = require('./tree');
const { sendMail, buildAssignmentMail, fullName, MailError } = require('./mail');

const MAX_KEY = 120;

// deps: { db, mail (settings or null), appUrl, fetchFn?, createTransport?, log? }
async function handleNotify(deps, { email, body }) {
  const { db, mail, appUrl, log = {} } = deps;
  try {
    if (!mail) return { status: 503, body: { error: 'Mail gönderimi yapılandırılmamış.' } };
    const taskId = body && typeof body.task === 'string' ? body.task : '';
    if (!taskId || taskId.length > MAX_KEY) return { status: 400, body: { error: 'Geçersiz görev.' } };
    const member = await db.memberOf(email);
    if (!member) return { status: 403, body: { error: 'Bu hesabın uygulamaya erişimi yok.' } };
    const { root, user: caller } = member;
    const users = Object.values(isObject(root.users) ? root.users : {}).filter(isObject);

    const key = encodeKey(taskId);
    const task = root.tasks && root.tasks[key];
    const skip = (reason) => ({ status: 200, body: { status: 'skipped', reason } });
    if (!task) return skip('not-found');
    if (!task.sahip) return skip('no-owner');
    if (!String(task.gorev || '').trim()) return skip('no-title');
    const owner = users.find((u) => u.kullaniciAdi === task.sahip);
    if (!owner || !owner.email) return skip('unknown-owner');
    if (owner.kullaniciAdi === caller.kullaniciAdi) return skip('self');
    const sent = root.assignmentMails && root.assignmentMails[key];
    if (sent && sent.sahip === task.sahip) return skip('already-sent');

    const redirected = !!mail.redirectTo;
    const link = task.no ? `${appUrl}?gorev=${task.no}` : appUrl;
    const m = buildAssignmentMail({ task, owner, caller, link, redirected });
    const id = await sendMail(mail, {
      to: redirected ? mail.redirectTo : owner.email,
      toName: redirected ? '' : fullName(owner),
      replyTo: caller.email,
      replyToName: fullName(caller),
      subject: redirected ? `[Test → ${fullName(owner)} <${owner.email}>] ${m.subject}` : m.subject,
      html: m.html,
      text: m.text,
      idempotencyKey: `assign/${key}/${task.sahip}/${task.updatedAt || ''}`,
    }, deps);
    try {
      await db.doc.update((cur) => {
        cur.assignmentMails = isObject(cur.assignmentMails) ? cur.assignmentMails : {};
        cur.assignmentMails[key] = { sahip: task.sahip, at: new Date().toISOString() };
        return cur;
      });
    } catch (err) {
      if (log.warn) log.warn('assignmentMails write failed', err.message);
    }
    return { status: 200, body: { status: 'sent', id } };
  } catch (err) {
    if (err instanceof MailError) return { status: err.status, body: { error: err.message } };
    if (log.error) log.error('notify failed', err);
    return { status: 500, body: { error: 'Beklenmeyen hata.' } };
  }
}

module.exports = { handleNotify };
