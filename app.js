(() => {
  'use strict';

  const STORAGE_KEY = 'taskManager.v1';
  const CLOUD_CACHE_KEY = 'taskManager.cloud.v2';
  const MIGRATED_KEY = 'taskManager.v1.migratedAt';
  const VIEW_KEY = 'taskManager.view';
  const TS_TAB_KEY = 'taskManager.tsTab';
  const NOTIFY_KEY = 'taskManager.notifyPending';
  const POLL_MS = 30000;
  const config = window.TASK_MANAGER_CONFIG || {};
  // Shared database: the Azure API (apiUrl, always with sign-in) or Firebase (databaseUrl [+ apiKey]).
  const cloudEnabled = !!((config.apiUrl || config.databaseUrl) && window.TaskCloud);
  // With an apiUrl/apiKey every team member signs in with their own e-mail and password.
  const auth = cloudEnabled && (config.apiUrl || config.apiKey) && window.TaskAuth ? window.TaskAuth.createAuth(config) : null;
  // Task numbers and descriptions work in local mode and in the signed-in shared database;
  // attachments need the shared database. The legacy no-login mode keeps the old record format.
  const richTasks = !cloudEnabled || !!auth;
  const attachmentsEnabled = !!auth;
  const timesheetEnabled = !!auth && !!window.TaskTimesheet;
  // Assignment mails are sent by the API (see api/).
  const notifyUrl = auth ? String(config.notifyUrl || (config.apiUrl ? `${String(config.apiUrl).replace(/\/+$/, '')}/assignment-notify` : '')).trim() : '';
  // Task comments live in the Azure API (they need its comment-notify mail function).
  const commentsEnabled = !!auth && !!config.apiUrl;
  const commentNotifyUrl = commentsEnabled ? `${String(config.apiUrl).replace(/\/+$/, '')}/comment-notify` : '';
  const COMMENT_NOTIFY_KEY = 'taskManager.commentNotifyPending';
  const MAX_COMMENT = 600;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const CHUNK_BYTES = 384 * 1024; // 512 KB once base64-encoded
  const LOGIN_MESSAGE_KEY = 'taskManager.loginMessage';
  const DONE = 'Tamamlandı';
  const RED_DAYS = 3;
  const YELLOW_DAYS = 7;
  const BACKUP_WARN_DAYS = 7;
  const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

  const LIST_LABELS = { alan: 'Alan', sahip: 'Sahip', durum: 'Durum' };
  const LIST_KEYS = Object.keys(LIST_LABELS);

  // Fixed priority levels (not editable in settings). Ordered from highest to lowest.
  const PRIORITIES = ['Yüksek', 'Orta', 'Düşük'];
  const DEFAULT_PRIORITY = 'Orta';
  const PRIORITY_STYLE = {
    'Yüksek': { cls: 'prio-high', icon: 'prio-high' },
    'Orta': { cls: 'prio-medium', icon: 'prio-medium' },
    'Düşük': { cls: 'prio-low', icon: 'prio-low' },
  };
  const PRIORITY_ALIASES = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
  const NO_PRIORITY_LABEL = 'Belirtilmemiş';

  const DEFAULT_LISTS = {
    alan: ['Skymate', 'SkyBee', 'Copilot Specialization', 'Fabric Specialization', 'Bulut360 - CRM', 'İş Ortağı Portalı', 'Sertifikasyon', 'Copilot Engage'],
    sahip: ['Murat', 'Serhat', 'Kaan', 'FurkanC', 'FurkanS', 'Erdem'],
    durum: ['Başlanmadı', 'Devam Ediyor', 'Beklemede', DONE],
  };

  const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
  const $ = (sel) => document.querySelector(sel);

  // ---------- Helpers ----------

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  const nowIso = () => new Date().toISOString();
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseLocalDate(v).getTime());
  const sameText = (a, b) => collator.compare(a, b) === 0;

  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysUntil(iso) {
    const today = parseLocalDate(todayIso());
    return Math.round((parseLocalDate(iso) - today) / 86400000);
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  }

  const formatDate = (iso) => parseLocalDate(iso).toLocaleDateString('tr-TR');

  function uniqueValues(values) {
    const out = [];
    for (const v of values) if (v && !out.some((x) => sameText(x, v))) out.push(v);
    return out;
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if ((k.startsWith('aria-') || k === 'role') && v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
      else if (v !== undefined && v !== null && v !== false) node[k] = v;
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name, cls = '') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `icon ${cls}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  // ---------- Visual tones (derived from values, not stored) ----------

  const TONES = ['blue', 'violet', 'teal', 'pink', 'indigo', 'cyan', 'orange', 'moss', 'amber', 'green'];
  const EXTRA_STATUS_TONES = ['violet', 'teal', 'pink', 'indigo', 'cyan', 'orange', 'moss'];
  const STATUS_TONES = { 'başlanmadı': 'gray', 'devam ediyor': 'blue', 'beklemede': 'amber', 'tamamlandı': 'green' };

  function hashText(text) {
    let h = 0;
    for (const ch of text.toLocaleLowerCase('tr')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
  }

  function toneFor(key, value) {
    if (!value) return 'gray';
    if (key === 'durum') {
      return STATUS_TONES[value.toLocaleLowerCase('tr')] || EXTRA_STATUS_TONES[hashText(value) % EXTRA_STATUS_TONES.length];
    }
    return TONES[hashText(value) % TONES.length];
  }

  function setTone(node, tone) {
    [...node.classList].filter((c) => c.startsWith('tone-')).forEach((c) => node.classList.remove(c));
    node.classList.add(`tone-${tone}`);
  }

  function initials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    if (words.length > 1) return (words[0][0] + words[1][0]).toLocaleUpperCase('tr');
    const w = words[0];
    const cap = [...w.slice(1)].find((c) => c !== c.toLocaleLowerCase('tr'));
    return (w[0] + (cap || '')).toLocaleUpperCase('tr');
  }

  function updateAvatar(avatar, name) {
    avatar.classList.toggle('avatar-empty', !name);
    if (name) {
      setTone(avatar, toneFor('sahip', name));
      avatar.textContent = initials(name);
    } else {
      setTone(avatar, 'gray');
      avatar.replaceChildren(icon('user'));
    }
  }

  function buildAvatar(name, cls = '') {
    const avatar = el('span', { class: `avatar ${cls}`.trim(), 'aria-hidden': 'true' });
    updateAvatar(avatar, name);
    return avatar;
  }

  // ---------- Rich text (task descriptions) ----------

  // Descriptions may embed images as data URIs: the whole HTML is capped at MAX_DESCRIPTION_CHARS,
  // the part outside the images at MAX_DESCRIPTION_TEXT_CHARS.
  const MAX_DESCRIPTION_CHARS = 3000000;
  const MAX_DESCRIPTION_TEXT_CHARS = 100000;
  const MAX_IMAGE_BYTES = 1024 * 1024;
  const MAX_IMAGE_SIDE = 1920;
  // Allowed tags (others are unwrapped, keeping their text) and tag aliases.
  const RICH_TAGS = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'CODE', 'PRE', 'IMG']);
  const RICH_ALIASES = { B: 'STRONG', I: 'EM', STRIKE: 'S', DEL: 'S', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3', DIV: 'P' };
  // Dropped together with their content.
  const RICH_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'META', 'LINK', 'TEMPLATE', 'SVG', 'MATH', 'VIDEO', 'AUDIO', 'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'TITLE', 'XML']);
  const safeHref = (href) => {
    const h = str(href);
    return /^(https?:|mailto:)/i.test(h) ? h : '';
  };
  // Only embedded raster images: remote/blob sources would leak reads or break after reload.
  const IMAGE_SRC_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  const safeImageSrc = (src) => {
    const s = String(src || '').replace(/\s+/g, '');
    return IMAGE_SRC_RE.test(s) ? s : '';
  };
  const hasContent = (node) => !!(node.textContent.trim() || node.querySelector('img'));
  const descriptionTextLength = (html) => html.replace(/src="data:[^"]*"/g, 'src=""').length;

  // Whitelist sanitizer: parses in an inert document, rebuilds only allowed elements without attributes
  // (links keep a checked href). Used on paste, before saving and before rendering.
  function sanitizeHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const out = document.createElement('div');
    const copy = (src, dest) => {
      for (const node of src.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) { dest.append(node.nodeValue); continue; }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = RICH_ALIASES[node.tagName] || node.tagName;
        if (RICH_DROP.has(tag)) continue;
        if (!RICH_TAGS.has(tag)) { copy(node, dest); continue; }
        const elx = document.createElement(tag);
        if (tag === 'IMG') {
          const src = safeImageSrc(node.getAttribute('src'));
          if (!src) continue;
          elx.setAttribute('src', src);
          elx.setAttribute('alt', '');
          dest.append(elx);
          continue;
        }
        if (tag === 'A') {
          const href = safeHref(node.getAttribute('href'));
          if (!href) { copy(node, dest); continue; }
          elx.setAttribute('href', href);
          elx.setAttribute('target', '_blank');
          elx.setAttribute('rel', 'noopener noreferrer');
        }
        copy(node, elx);
        dest.append(elx);
      }
    };
    copy(doc.body, out);
    // Loose inline content at the top level goes into paragraphs; empty paragraphs are dropped.
    const BLOCKS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE', 'PRE']);
    const normalized = document.createElement('div');
    let para = null;
    for (const node of [...out.childNodes]) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCKS.has(node.nodeName)) {
        para = null;
        if (node.nodeName === 'P' && !hasContent(node)) continue;
        normalized.append(node);
      } else if (node.nodeName === 'BR' && para) {
        para = null; // a line break between loose runs starts a new paragraph
      } else if (node.nodeName !== 'BR' && !(node.nodeType === Node.TEXT_NODE && !para && !node.nodeValue.trim())) {
        if (!para) { para = document.createElement('p'); normalized.append(para); }
        para.append(node);
      }
    }
    normalized.querySelectorAll('li').forEach((li) => { if (!hasContent(li)) li.remove(); });
    normalized.querySelectorAll('ul, ol').forEach((list) => { if (!list.children.length) list.remove(); });
    normalized.querySelectorAll('p').forEach((p) => { if (!hasContent(p)) p.remove(); });
    return hasContent(normalized) ? normalized.innerHTML : '';
  }

  // Plain text for Excel export.
  function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    doc.querySelectorAll('img').forEach((img) => img.replaceWith(' [Resim] '));
    doc.querySelectorAll('li').forEach((li) => li.prepend('• '));
    doc.querySelectorAll('p, h2, h3, li, blockquote, pre').forEach((b) => b.append('\n'));
    return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  let toastTimer;
  function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // ---------- Data layer ----------

  function seedData() {
    return { version: 1, lists: structuredCloneSafe(DEFAULT_LISTS), tasks: [], meta: { lastBackupAt: null } };
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // A missing value means the default; an explicit empty string means "no priority".
  function normalizePriority(value) {
    if (value === undefined || value === null) return DEFAULT_PRIORITY;
    const s = str(value);
    if (!s) return '';
    return PRIORITIES.find((p) => sameText(p, s)) || PRIORITY_ALIASES[s.toLowerCase()] || DEFAULT_PRIORITY;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.lists || typeof raw.lists !== 'object' || !Array.isArray(raw.tasks)) {
      throw new Error('Geçersiz dosya biçimi: "lists" ve "tasks" alanları bulunamadı.');
    }
    const lists = {};
    for (const key of LIST_KEYS) {
      const arr = Array.isArray(raw.lists[key]) ? raw.lists[key] : [];
      lists[key] = uniqueValues(arr.map(str));
    }
    lists.durum = lists.durum.filter((v) => !sameText(v, DONE));
    lists.durum.push(DONE);

    const seenIds = new Set();
    const tasks = raw.tasks.filter((t) => t && typeof t === 'object').map((t) => {
      let id = str(t.id);
      if (!id || seenIds.has(id)) id = uid();
      seenIds.add(id);
      const created = str(t.createdAt) || nowIso();
      let durum = str(t.durum);
      if (sameText(durum, DONE)) durum = DONE;
      if (!durum) durum = firstOpenStatus(lists);
      return {
        id,
        alan: str(t.alan),
        gorev: str(t.gorev),
        sahip: str(t.sahip),
        durum,
        oncelik: normalizePriority(t.oncelik),
        tamamlanmaTarihi: isIsoDate(t.tamamlanmaTarihi) ? t.tamamlanmaTarihi : '',
        createdAt: created,
        updatedAt: str(t.updatedAt) || created,
        completedAt: durum === DONE ? (str(t.completedAt) || null) : null,
        createdBy: str(t.createdBy),
        no: normalizeNo(t.no),
        // Description: kept in the task only in local mode; the shared database stores it in /details.
        aciklama: typeof t.aciklama === 'string' ? sanitizeHtml(t.aciklama) : '',
        aciklamaVar: t.aciklamaVar === true,
        ekSayisi: normalizeCount(t.ekSayisi),
        yorumSayisi: normalizeCount(t.yorumSayisi),
      };
    });

    // Values referenced by tasks must exist in the lists so they remain selectable.
    for (const key of LIST_KEYS) {
      for (const t of tasks) {
        if (t[key] && !lists[key].includes(t[key])) {
          if (key === 'durum') lists.durum.splice(lists.durum.length - 1, 0, t[key]);
          else lists[key].push(t[key]);
        }
      }
    }

    const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
    return { version: 1, lists, tasks, meta: { lastBackupAt: str(meta.lastBackupAt) || null, nextNo: normalizeNo(meta.nextNo) } };
  }

  function normalizeNo(v) {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 9999999 ? n : null;
  }

  function normalizeCount(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0;
  }

  const taskNoLabel = (t) => (t.no ? `#${t.no}` : '');
  const hasDescription = (t) => !!(t.aciklama || t.aciklamaVar);

  // Local mode: tasks get the next free number when they are saved (existing ones by creation date).
  function numberLocalTasks() {
    const pending = data.tasks.filter((t) => !t.no).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    let next = Math.max(data.meta.nextNo || 1, ...data.tasks.map((t) => (t.no || 0) + 1));
    for (const t of pending) t.no = next++;
    data.meta.nextNo = next;
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    try {
      return normalize(JSON.parse(raw));
    } catch (err) {
      const backupKey = `${STORAGE_KEY}.corrupt-${Date.now()}`;
      localStorage.setItem(backupKey, raw);
      alert(`Kayıtlı veriler okunamadı (${err.message}). Eski veri "${backupKey}" anahtarıyla saklandı; boş liste ile başlanıyor.`);
      return seedData();
    }
  }

  // Cloud mode: localStorage only caches the last known data plus the server snapshot,
  // so unsaved changes survive a reload and are pushed on the next sync.
  function loadCloudCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CLOUD_CACHE_KEY));
      if (raw && raw.data) {
        const remote = raw.remote && raw.remote.tasks && raw.remote.lists ? raw.remote : { tasks: {}, lists: {} };
        return { data: normalize(raw.data), remote, lastSyncAt: raw.lastSyncAt || null, users: Array.isArray(raw.users) ? raw.users : null };
      }
    } catch (err) {
      console.warn('Önbellek okunamadı', err);
    }
    return { data: seedData(), remote: { tasks: {}, lists: {} }, lastSyncAt: null, users: null };
  }

  function persistCloudCache() {
    try {
      localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify({ data, remote: cloud.remote, lastSyncAt: cloud.lastSyncAt, users: directory }));
    } catch (err) {
      console.warn('Önbellek yazılamadı', err);
    }
  }

  function save() {
    if (cloud) {
      persistCloudCache();
      scheduleSync();
      return;
    }
    try {
      numberLocalTasks();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      alert(`Veriler kaydedilemedi: ${err.message}`);
    }
  }

  function firstOpenStatus(lists = data.lists) {
    return lists.durum.find((d) => d !== DONE) || DONE;
  }

  // status: loading | saving | saved | error | offline
  const cloud = cloudEnabled ? {
    store: null, remote: { tasks: {}, lists: {} }, ready: false,
    status: 'loading', error: null, lastSyncAt: null, timer: null, queue: Promise.resolve(), renderPending: false,
  } : null;

  let data;
  // Team members from /users (signed-in mode only): [{ ad, soyad, kullaniciAdi, email, sira }]
  let directory = null;
  let currentUser = null;
  if (cloud) {
    const cache = loadCloudCache();
    data = cache.data;
    Object.assign(cloud, { remote: cache.remote, lastSyncAt: cache.lastSyncAt });
    if (auth) setDirectory(cache.users);
  } else {
    data = load();
    save();
  }

  // ---------- Users (signed-in mode) ----------

  function setDirectory(users) {
    const list = (Array.isArray(users) ? users : [])
      .filter((u) => u && typeof u === 'object')
      .map((u) => ({ ad: str(u.ad), soyad: str(u.soyad), kullaniciAdi: str(u.kullaniciAdi), email: str(u.email).toLowerCase(), sira: Number(u.sira) || 0 }))
      .filter((u) => u.kullaniciAdi && u.email)
      .sort((a, b) => a.sira - b.sira || collator.compare(a.kullaniciAdi, b.kullaniciAdi));
    directory = list.length ? list : null;
    currentUser = directory && auth ? directory.find((u) => u.email === auth.email) || null : null;
  }

  const fullName = (u) => [u.ad, u.soyad].filter(Boolean).join(' ') || u.kullaniciAdi;
  const userByName = (name) => (directory && name ? directory.find((u) => u.kullaniciAdi === name) : null);

  // Names that were used for a person before accounts existed ("Murat E.", "Murat Elmas", "Murat").
  function ownerAliases(u) {
    const aliases = [u.kullaniciAdi, u.ad];
    if (u.ad && u.soyad) aliases.push(`${u.ad} ${u.soyad}`, `${u.ad} ${u.soyad[0]}.`, `${u.ad} ${u.soyad[0]}`);
    return aliases.filter(Boolean);
  }

  // The Sahip list mirrors the user directory; owner names that unambiguously belong to a
  // user are rewritten to their user name. Returns true when anything changed.
  function applyDirectory() {
    if (!directory) return false;
    let changed = false;
    const names = directory.map((u) => u.kullaniciAdi);
    if (data.lists.sahip.join('\n') !== names.join('\n')) {
      data.lists.sahip = names;
      changed = true;
    }
    for (const t of data.tasks) {
      if (!t.sahip || names.includes(t.sahip)) continue;
      const matches = directory.filter((u) => ownerAliases(u).some((a) => sameText(a, t.sahip)));
      if (matches.length === 1 && applyChange(t, 'sahip', matches[0].kullaniciAdi)) changed = true;
    }
    return changed;
  }

  const ui = {
    view: (() => {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'board' || v === 'report' || (v === 'timesheet' && timesheetEnabled) ? v : 'list';
    })(),
    shownCount: 0,
    showCompleted: false,
    search: '',
    filters: emptyFilters(), // selected values per list; empty = all
    due: null, // 'red' (kritik) | 'yellow' (yaklaşan) | null
    sort: { key: 'tamamlanmaTarihi', dir: 1 },
    pinned: new Set(), // newly added rows stay visible and on top until filters/sorting change
    loadingShown: false,
  };

  // ---------- Due date logic ----------

  function dueInfo(task) {
    if (!task.tamamlanmaTarihi) return { level: null, label: '' };
    if (task.durum === DONE) return { level: null, label: '✓' };
    const days = daysUntil(task.tamamlanmaTarihi);
    let label;
    if (days < 0) label = `${-days} gün gecikti`;
    else if (days === 0) label = 'Bugün';
    else label = `${days} gün`;
    let level = null;
    if (days < RED_DAYS) level = 'red';
    else if (days < YELLOW_DAYS) level = 'yellow';
    return { level, label };
  }

  // ---------- Filtering & sorting ----------

  function emptyFilters() {
    return { alan: [], sahip: [], durum: [] };
  }

  // Board columns are the statuses, so the Durum filter is hidden and ignored there.
  const activeFilterKeys = () => (ui.view === 'board' ? LIST_KEYS.filter((k) => k !== 'durum') : LIST_KEYS);
  const statusFilter = () => (ui.view === 'board' ? [] : ui.filters.durum);
  const doneFiltered = () => statusFilter().includes(DONE);

  function matchesFilters(t, { includeDone = false } = {}) {
    const showDone = includeDone || ui.showCompleted || doneFiltered();
    if (t.durum === DONE && !showDone) return false;
    for (const key of activeFilterKeys()) {
      if (ui.filters[key].length && !ui.filters[key].includes(t[key])) return false;
    }
    if (ui.due && dueInfo(t).level !== ui.due) return false;
    const q = ui.search.trim().toLocaleLowerCase('tr');
    if (q) {
      const hay = [t.alan, t.gorev, t.sahip, t.durum, t.oncelik, taskNoLabel(t)].join(' ').toLocaleLowerCase('tr');
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function compareTasks(a, b) {
    const { key, dir } = ui.sort;
    let res;
    if (key === 'tamamlanmaTarihi') {
      const av = a.tamamlanmaTarihi;
      const bv = b.tamamlanmaTarihi;
      if (!av && !bv) res = 0;
      else if (!av) return 1; // empty dates always last
      else if (!bv) return -1;
      else res = av < bv ? -1 : av > bv ? 1 : 0;
    } else if (key === 'durum') {
      res = data.lists.durum.indexOf(a.durum) - data.lists.durum.indexOf(b.durum);
    } else if (key === 'oncelik') {
      if (!a.oncelik && b.oncelik) return 1; // no priority always last
      if (a.oncelik && !b.oncelik) return -1;
      res = PRIORITIES.indexOf(a.oncelik) - PRIORITIES.indexOf(b.oncelik);
    } else if (key === 'no') {
      if (!a.no && b.no) return 1;
      if (a.no && !b.no) return -1;
      res = (a.no || 0) - (b.no || 0);
    } else {
      const av = a[key] || '';
      const bv = b[key] || '';
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      res = collator.compare(av, bv);
    }
    if (res === 0) res = (a.createdAt || '').localeCompare(b.createdAt || '');
    return res * dir;
  }

  function visibleTasks() {
    const pinned = data.tasks.filter((t) => ui.pinned.has(t.id));
    const rest = data.tasks.filter((t) => !ui.pinned.has(t.id) && matchesFilters(t)).sort(compareTasks);
    return [...pinned.reverse(), ...rest];
  }

  function resetPinned() {
    ui.pinned.clear();
  }

  // ---------- Rendering ----------

  function render() {
    renderFilterOptions();
    renderView();
    renderSummary();
    renderSortIndicators();
    renderBackupInfo();
    updateFilterUi();
  }

  function renderView() {
    const view = ui.view;
    $('#list-view').hidden = view !== 'list';
    $('#board-view').hidden = view !== 'board';
    $('#timesheet-view').hidden = view !== 'timesheet';
    $('#report-view').hidden = view !== 'report';
    document.body.classList.toggle('view-timesheet', view === 'timesheet');
    document.body.classList.toggle('view-report', view === 'report');
    document.body.classList.toggle('view-board', view === 'board');
    placeSummaryBar(view === 'board');
    renderNav();
    if (view === 'board') renderBoard();
    else if (view === 'timesheet') { if (timesheet) timesheet.render(); }
    else if (view === 'report') { ui.loadingShown = isInitialLoading(); report.render(); }
    else renderTable();
  }

  // Board: the kritik/yaklaşan chips sit inline next to the filters to save vertical space.
  function placeSummaryBar(inToolbar) {
    const bar = $('.summary-bar');
    const clear = $('#btn-clear-filters');
    if (inToolbar) {
      if (bar.nextElementSibling !== clear) clear.before(bar);
    } else if ($('.toolbar').nextElementSibling !== bar) {
      $('.toolbar').after(bar);
    }
  }

  function renderFilterOptions() {
    for (const key of LIST_KEYS) {
      const values = data.lists[key];
      ui.filters[key] = values.filter((v) => ui.filters[key].includes(v)); // list order, drop removed values
      const panel = $(`#filter-${key}-panel`);
      const active = document.activeElement;
      const focused = panel.contains(active) && active.tagName === 'INPUT' ? active.value : null;
      const option = (value, label, extra = {}) => el('label', { class: 'filter-option' },
        el('input', { type: 'checkbox', value, ...extra }),
        el('span', { textContent: label }));
      panel.replaceChildren(
        option('', 'Tümü', { dataset: { all: '1' } }),
        el('div', { class: 'menu-separator', role: 'separator' }),
        ...values.map((v) => option(v, v)),
      );
      syncFilterControl(key);
      if (focused !== null) panel.querySelector(`input[value="${CSS.escape(focused)}"]`)?.focus();
    }
    $('#show-completed').checked = ui.showCompleted;
    $('#search').value = ui.search;
  }

  function syncFilterControl(key) {
    const selected = ui.filters[key];
    for (const box of $(`#filter-${key}-panel`).querySelectorAll('input')) {
      box.checked = box.dataset.all ? selected.length === 0 : selected.includes(box.value);
    }
    const trigger = $(`#filter-${key}`);
    trigger.querySelector('.filter-value').textContent =
      selected.length === 0 ? 'Tümü' : selected.length === 1 ? selected[0] : `${selected.length} seçili`;
    trigger.title = selected.length > 1 ? selected.join(', ') : '';
  }

  const EMPTY_LABELS = { alan: '— Seçiniz —', sahip: 'Atanmamış', durum: '— Seçiniz —' };

  function fillOptions(select, key, value, emptyLabel = '— Seçiniz —') {
    select.replaceChildren();
    if (key !== 'durum' || !value) select.append(el('option', { value: '', textContent: emptyLabel }));
    for (const v of data.lists[key]) select.append(el('option', { value: v, textContent: v }));
    if (value && !data.lists[key].includes(value)) {
      select.append(el('option', { value, textContent: `${value} (listede yok)` }));
    }
    select.value = value || '';
  }

  function buildSelect(key, task, onChange) {
    const select = el('select', {
      class: `cell-${key} cell-select`,
      'aria-label': LIST_LABELS[key],
      onchange: (e) => onChange(e.target.value),
    });
    fillOptions(select, key, task[key], EMPTY_LABELS[key]);
    return select;
  }

  function fillPriorityOptions(select, value) {
    select.replaceChildren(
      el('option', { value: '', textContent: NO_PRIORITY_LABEL }),
      ...PRIORITIES.map((p) => el('option', { value: p, textContent: p })),
    );
    select.value = value || '';
  }

  function priorityIcon(value) {
    const style = PRIORITY_STYLE[value];
    return style ? icon(style.icon, 'icon-sm') : icon('prio-none', 'icon-sm');
  }

  function updatePriorityCell(cell, value) {
    for (const s of Object.values(PRIORITY_STYLE)) cell.classList.remove(s.cls);
    if (PRIORITY_STYLE[value]) cell.classList.add(PRIORITY_STYLE[value].cls);
    cell.classList.toggle('is-empty', !value);
    cell.querySelector('.prio-icon').replaceChildren(priorityIcon(value));
  }

  function buildPriorityChip(value) {
    if (!value) return null;
    return el('span', { class: `prio-chip ${PRIORITY_STYLE[value].cls}`, title: `Öncelik: ${value}` },
      priorityIcon(value), value);
  }

  function buildRow(task) {
    const tr = el('tr', { dataset: { id: task.id } });
    const update = (field) => (value) => onFieldChange(task, field, value, tr);

    const gorevInput = el('input', {
      type: 'text',
      class: 'gorev-input',
      maxLength: 255,
      value: task.gorev,
      placeholder: 'Görev açıklaması…',
      title: task.gorev,
      'aria-label': 'Görev',
      onchange: (e) => { e.target.title = e.target.value; update('gorev')(e.target.value.trim()); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });

    const dateInput = el('input', {
      type: 'date',
      class: 'cell-tarih',
      value: task.tamamlanmaTarihi,
      'aria-label': 'Tamamlanma Tarihi',
      onclick: (e) => { try { e.target.showPicker(); } catch { /* not supported or not allowed */ } },
      onchange: (e) => update('tamamlanmaTarihi')(isIsoDate(e.target.value) ? e.target.value : ''),
    });

    const deleteBtn = el('button', {
      type: 'button',
      class: 'btn btn-ghost btn-icon btn-delete',
      'aria-label': 'Görevi sil',
      onclick: () => deleteTask(task),
    }, icon('trash'));

    const detailBtn = el('button', {
      type: 'button',
      class: 'btn btn-ghost btn-icon btn-detail',
      'aria-label': 'Detayı aç',
      title: 'Detayı aç (açıklama, ekler)',
      onclick: () => openTaskDialog(task),
    }, icon('open'));

    tr.append(
      el('td', { class: 'cell-no' }, el('button', { type: 'button', class: 'task-no', title: 'Detayı aç', onclick: () => openTaskDialog(task) })),
      el('td', { class: 'cell-alan-td' }, buildSelect('alan', task, update('alan'))),
      el('td', { class: 'cell-gorev-td' }, el('div', { class: 'gorev-cell' }, gorevInput, el('span', { class: 'row-indicators' }))),
      el('td', {}, el('div', { class: 'owner-cell' }, buildAvatar(task.sahip, 'avatar-sm'), buildSelect('sahip', task, update('sahip')))),
      el('td', {}, buildSelect('durum', task, update('durum'))),
      el('td', {}, buildPriorityCell(task, update('oncelik'))),
      el('td', {}, el('div', { class: 'date-cell' }, dateInput, el('span', { class: 'date-empty', 'aria-hidden': 'true', textContent: '—' }))),
      el('td', { class: 'kalan' }),
      el('td', { class: 'actions' }, detailBtn, deleteBtn),
    );
    applyRowState(tr, task);
    return tr;
  }

  // Small icons showing that a task has a description and/or attachments.
  function buildIndicators(task) {
    const items = [];
    if (hasDescription(task)) items.push(el('span', { class: 'indicator', title: 'Açıklaması var' }, icon('text', 'icon-sm')));
    if (task.ekSayisi) items.push(el('span', { class: 'indicator', title: `${task.ekSayisi} ek` }, icon('paperclip', 'icon-sm'), String(task.ekSayisi)));
    if (task.yorumSayisi) items.push(el('span', { class: 'indicator', title: `${task.yorumSayisi} yorum` }, icon('message', 'icon-sm'), String(task.yorumSayisi)));
    return items;
  }

  function buildPriorityCell(task, onChange) {
    const select = el('select', {
      class: 'cell-oncelik cell-select',
      'aria-label': 'Öncelik',
      onchange: (e) => onChange(e.target.value),
    });
    fillPriorityOptions(select, task.oncelik);
    return el('div', { class: 'prio-cell' }, el('span', { class: 'prio-icon', 'aria-hidden': 'true' }), select);
  }

  function applyRowState(tr, task) {
    const { level, label } = dueInfo(task);
    const done = task.durum === DONE;
    tr.classList.toggle('due-red', level === 'red');
    tr.classList.toggle('due-yellow', level === 'yellow');
    tr.classList.toggle('is-done', done);
    tr.classList.toggle('is-new', ui.pinned.has(task.id));

    const alan = tr.querySelector('select.cell-alan');
    alan.classList.toggle('is-empty', !task.alan);
    setTone(alan, toneFor('alan', task.alan));
    const durum = tr.querySelector('select.cell-durum');
    setTone(durum, toneFor('durum', task.durum));
    tr.querySelector('select.cell-sahip').classList.toggle('is-empty', !task.sahip);
    updateAvatar(tr.querySelector('.owner-cell .avatar'), task.sahip);
    updatePriorityCell(tr.querySelector('.prio-cell'), task.oncelik);
    tr.querySelector('.date-cell').classList.toggle('is-empty', !task.tamamlanmaTarihi);
    const noBtn = tr.querySelector('.task-no');
    noBtn.textContent = taskNoLabel(task) || '#…';
    noBtn.classList.toggle('is-pending', !task.no);
    noBtn.setAttribute('aria-label', task.no ? `Görev ${task.no} detayını aç` : 'Detayı aç');
    tr.querySelector('.row-indicators').replaceChildren(...buildIndicators(task));

    const kalan = tr.querySelector('td.kalan');
    const badgeCls = done ? 'badge-success' : level === 'red' ? 'badge-danger' : level === 'yellow' ? 'badge-warning' : '';
    kalan.replaceChildren(label ? el('span', { class: `badge ${badgeCls}`.trim(), textContent: label }) : '');
    kalan.title = done && task.completedAt ? `Tamamlandı: ${formatDateTime(task.completedAt)}` : '';

    const btn = tr.querySelector('.btn-delete');
    btn.disabled = done;
    btn.title = done ? 'Tamamlanan görevler silinemez' : 'Görevi sil';
  }

  const isInitialLoading = () => !!cloud && !cloud.ready && cloud.status === 'loading' && data.tasks.length === 0;

  function renderLoadingState() {
    const box = $('#loading-state');
    if (!box.childElementCount) {
      for (let i = 0; i < 5; i++) {
        box.append(el('div', { class: 'skeleton-row' },
          ...['5%', '14%', '30%', '12%', '12%', '8%', '10%', '8%'].map((w) => el('span', { class: 'skeleton', style: `width:${w}` }))));
      }
    }
  }

  function renderEmptyState(empty) {
    const noTasks = data.tasks.length === 0;
    empty.replaceChildren(
      el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon(noTasks ? 'inbox' : 'search', 'icon-lg')),
      el('p', { class: 'empty-title', textContent: noTasks ? 'Henüz görev yok' : 'Filtrelere uyan görev bulunamadı' }),
      el('p', { class: 'empty-text', textContent: noTasks ? '"Yeni Görev" ile ilk görevi ekleyebilirsiniz.' : 'Aramayı veya filtreleri değiştirmeyi deneyin.' }),
      noTasks
        ? el('button', { type: 'button', class: 'btn btn-primary', onclick: () => addTask() }, icon('plus'), 'Yeni Görev')
        : (hasActiveFilters() ? el('button', { type: 'button', class: 'btn', onclick: () => $('#btn-clear-filters').click() }, icon('x', 'icon-sm'), 'Filtreleri temizle') : null),
    );
  }

  function renderTable() {
    const loading = isInitialLoading();
    ui.loadingShown = loading;
    $('#loading-state').hidden = !loading;
    $('#list-view').setAttribute('aria-busy', String(loading));
    if (loading) renderLoadingState();
    const rows = loading ? [] : visibleTasks();
    ui.shownCount = rows.length;
    $('#task-body').replaceChildren(...rows.map(buildRow));
    const empty = $('#empty-state');
    empty.hidden = loading || rows.length > 0;
    if (!empty.hidden) renderEmptyState(empty);
  }
  // ---------- Board view ----------

  function buildCard(task) {
    const { level, label } = dueInfo(task);
    const done = task.durum === DONE;
    const classes = ['card'];
    if (level) classes.push(`due-${level}`);
    if (done) classes.push('is-done');
    if (ui.pinned.has(task.id)) classes.push('is-new');

    const badgeCls = level === 'red' ? 'badge-danger' : level === 'yellow' ? 'badge-warning' : '';
    const indicators = buildIndicators(task);
    const meta = el('div', { class: 'card-meta' },
      el('span', { class: `card-sahip${task.sahip ? '' : ' is-empty'}` }, buildAvatar(task.sahip, 'avatar-sm'), task.sahip || 'Atanmamış'),
      indicators.length ? el('span', { class: 'card-indicators' }, ...indicators) : null,
      task.tamamlanmaTarihi
        ? el('span', { class: 'card-due' },
          el('span', { class: 'card-date' }, icon('calendar', 'icon-sm'), formatDate(task.tamamlanmaTarihi)),
          label && !done ? el('span', { class: `badge ${badgeCls}`.trim(), textContent: label }) : null)
        : null,
    );

    const card = el('article', {
      class: classes.join(' '),
      draggable: true,
      tabIndex: 0,
      title: 'Düzenlemek için tıklayın, durumunu değiştirmek için sürükleyin',
      'aria-label': `${task.no ? `Görev ${task.no}: ` : ''}${task.gorev || 'İsimsiz görev'}${task.oncelik ? `, ${task.oncelik} öncelik` : ''}${task.sahip ? `, ${task.sahip}` : ''}${label && !done ? `, ${label}` : ''}`,
      dataset: { id: task.id },
      onclick: () => openTaskDialog(task),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskDialog(task); } },
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        document.body.classList.add('is-dragging');
      },
      ondragend: () => { card.classList.remove('dragging'); document.body.classList.remove('is-dragging'); },
    },
    el('div', { class: 'card-top' },
      richTasks ? el('span', { class: `card-no${task.no ? '' : ' is-pending'}`, textContent: taskNoLabel(task) || '#…' }) : null,
      task.alan ? el('span', { class: `tag card-alan tone-${toneFor('alan', task.alan)}`, textContent: task.alan }) : null,
      buildPriorityChip(task.oncelik)),
    el('div', { class: `card-title${task.gorev ? '' : ' is-empty'}`, textContent: task.gorev || '(İsimsiz görev)' }),
    meta);
    return card;
  }

  function buildColumnHeader(status, count) {
    return el('h3', { class: 'board-column-header' },
      el('span', { class: `status-dot tone-${toneFor('durum', status)}`, 'aria-hidden': 'true' }),
      el('span', { class: 'board-column-title', textContent: status }),
      el('span', { class: 'count-badge', textContent: String(count) }));
  }

  function buildColumn(status, tasks) {
    const showDone = ui.showCompleted || doneFiltered();
    const doneHidden = status === DONE && !showDone;
    const cards = el('div', { class: 'board-cards' });
    let count = tasks.length;

    cards.append(...tasks.map(buildCard));
    if (status === DONE && showDone && ui.showCompleted && tasks.length > 0) {
      cards.prepend(el('p', { class: 'board-note' },
        icon('eye', 'icon-sm'),
        el('span', {}, 'Tamamlanan görevler gösteriliyor. ',
          el('button', {
            type: 'button',
            class: 'btn btn-link',
            textContent: 'Gizle',
            onclick: () => { ui.showCompleted = false; resetPinned(); render(); },
          }))));
    }
    if (doneHidden) {
      const hiddenTasks = data.tasks.filter((t) => t.durum === DONE && !ui.pinned.has(t.id) && matchesFilters(t, { includeDone: true }));
      count += hiddenTasks.length;
      if (hiddenTasks.length > 0) {
        cards.append(el('p', { class: 'board-note' },
          icon('eye-off', 'icon-sm'),
          el('span', {}, `${hiddenTasks.length} tamamlanan görev gizli. `,
            el('button', {
              type: 'button',
              class: 'btn btn-link',
              textContent: 'Göster',
              onclick: () => { ui.showCompleted = true; render(); },
            }))));
      }
    }
    if (count === 0) cards.append(el('p', { class: 'board-note board-empty' }, icon('inbox', 'icon-sm'), 'Görev yok'));

    const column = el('section', { class: 'board-column', dataset: { status }, 'aria-label': status },
      buildColumnHeader(status, count),
      cards);

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', (e) => {
      if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
    });
    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      moveTaskToStatus(e.dataTransfer.getData('text/plain'), status);
    });
    return column;
  }

  function buildLoadingColumn(status, i) {
    const cards = el('div', { class: 'board-cards' });
    for (let n = 0; n < 3 - (i % 2); n++) {
      cards.append(el('div', { class: 'card card-skeleton', 'aria-hidden': 'true' },
        el('span', { class: 'skeleton', style: 'width:40%' }),
        el('span', { class: 'skeleton', style: 'width:85%' }),
        el('span', { class: 'skeleton', style: 'width:60%' })));
    }
    const header = buildColumnHeader(status, 0);
    header.querySelector('.count-badge').textContent = '–';
    return el('section', { class: 'board-column', 'aria-hidden': 'true' }, header, cards);
  }

  function renderBoard() {
    const board = $('#board-view');
    const loading = isInitialLoading();
    ui.loadingShown = loading;
    board.setAttribute('aria-busy', String(loading));
    if (loading) {
      ui.shownCount = 0;
      board.replaceChildren(...data.lists.durum.map(buildLoadingColumn));
      return;
    }
    const tasks = visibleTasks();
    ui.shownCount = tasks.length;
    board.replaceChildren(...data.lists.durum.map((s) => buildColumn(s, tasks.filter((t) => t.durum === s))));
  }
  function isHiddenWhenDone() {
    return !ui.showCompleted && !doneFiltered();
  }

  function moveTaskToStatus(id, status) {
    const task = data.tasks.find((t) => t.id === id);
    if (!task || !applyChange(task, 'durum', status)) return;
    save();
    if (status === DONE && isHiddenWhenDone()) {
      ui.pinned.delete(task.id);
      toast('Görev tamamlandı ve gizlendi. Görmek için "Tamamlananları göster" seçeneğini işaretleyin.');
    }
    renderView();
    renderSummary();
    renderBackupInfo();
  }

  // ---------- Task dialog (details) ----------

  let editingTask = null;
  let savingTask = false;
  let timesheet = null; // Timesheet module (signed-in mode)
  let report = null; // Görev raporu module
  let taskTimeToken = 0;

  // Task details: total time logged on the task and who logged it.
  async function loadTaskTime(task) {
    const field = $('#task-time-field');
    const token = ++taskTimeToken;
    field.hidden = !timesheet || !task;
    if (field.hidden) return;
    const total = $('#task-time-total');
    const people = $('#task-time-people');
    const btn = $('#btn-task-time');
    btn.disabled = !timesheet.isSelectable(task);
    btn.title = btn.disabled ? '30 günden önce tamamlanan görevlere zaman girilemez' : 'Bu göreve zaman girişi yap';
    total.textContent = '…';
    total.title = '';
    people.replaceChildren();
    if (!cloud || !cloud.store) return;
    try {
      const entries = await timesheet.taskEntries(task.id);
      if (token !== taskTimeToken) return;
      total.textContent = entries.length ? timesheet.formatHours(timesheet.sum(entries)) : 'Henüz giriş yok';
      const byUser = new Map();
      for (const e of entries) byUser.set(e.kullanici, (byUser.get(e.kullanici) || 0) + e.saat);
      people.replaceChildren(...[...byUser].sort((a, b) => b[1] - a[1]).map(([u, h]) => el('li', {},
        buildAvatar(u, 'avatar-sm'),
        el('span', { class: 'task-time-name', textContent: displayName(u) }),
        el('span', { class: 'task-time-hours', textContent: timesheet.formatHours(h) }))));
    } catch (err) {
      if (token !== taskTimeToken) return;
      total.textContent = '—';
      total.title = `Zaman girişleri yüklenemedi: ${err.message}`;
    }
  }
  // Description editor state: the HTML it was loaded with and the server version it is based on.
  const desc = { original: '', updatedAt: null, loaded: false, token: 0, busy: 0 };

  const taskKey = (id) => window.TaskCloud.encodeKey(id);
  const displayName = (username) => { const u = userByName(username); return u ? fullName(u) : username; };

  function openTaskDialog(task) {
    editingTask = task || null;
    const draft = task || newTaskDraft();
    const form = $('#task-form');
    $('#task-dialog').classList.toggle('is-simple', !richTasks);
    $('#task-dialog-title').textContent = task ? 'Görevi Düzenle' : 'Yeni Görev';
    const badge = $('#task-no-badge');
    badge.hidden = !task || !richTasks;
    badge.textContent = task ? (taskNoLabel(task) || '#…') : '';
    badge.title = task && !task.no ? 'Numara kaydedildikten sonra atanır' : '';
    form.elements.gorev.value = draft.gorev;
    for (const key of LIST_KEYS) fillOptions(form.elements[key], key, draft[key], key === 'alan' && !task ? 'Alan seçin…' : EMPTY_LABELS[key]);
    // A new task can't be created without an Alan (existing tasks without one can still be edited).
    $('#alan-required').hidden = !!task;
    showAlanError(false);
    fillPriorityOptions(form.elements.oncelik, draft.oncelik);
    form.elements.tamamlanmaTarihi.value = draft.tamamlanmaTarihi;
    // createdAt is set automatically on creation; new tasks don't have one yet.
    $('#task-created-field').hidden = !task;
    $('#task-created').value = task ? (formatDateTime(task.createdAt) || '—') : '';
    const creator = task ? userByName(task.createdBy) : null;
    $('#task-created-by-field').hidden = !task || !(auth || task.createdBy);
    $('#task-created-by').value = task ? (creator ? fullName(creator) : task.createdBy || '—') : '';
    const del = $('#task-delete');
    del.hidden = !task;
    del.disabled = !!task && task.durum === DONE;
    del.title = del.disabled ? 'Tamamlanan görevler silinemez' : 'Görevi sil';
    showGorevError(false);
    updateTaskFormState();
    setTaskSaving(false);
    loadDescription(task);
    loadAttachments(task);
    loadComments(task);
    loadTaskTime(task);
    $('#task-dialog').showModal();
    form.elements.gorev.focus();
  }

  function showGorevError(show) {
    $('#task-form').elements.gorev.setAttribute('aria-invalid', String(show));
    $('#gorev-error').hidden = !show;
  }

  function showAlanError(show) {
    $('#task-form').elements.alan.setAttribute('aria-invalid', String(show));
    $('#alan-error').hidden = !show;
  }

  function updateTaskFormState() {
    const form = $('#task-form');
    const empty = !form.elements.gorev.value.trim();
    form.querySelector('button[type=submit]').disabled = empty || savingTask;
    if (!empty) showGorevError(false);
  }

  function setTaskSaving(busy) {
    savingTask = busy;
    const submit = $('#task-form button[type=submit]');
    submit.querySelector('.spinner').hidden = !busy;
    submit.querySelector('.submit-label').textContent = busy ? 'Kaydediliyor…' : 'Kaydet';
    document.querySelectorAll('#task-dialog [data-close], #task-delete').forEach((b) => { b.disabled = busy || (b.id === 'task-delete' && !!editingTask && editingTask.durum === DONE); });
    updateTaskFormState();
  }

  const descriptionDirty = () => richTasks && desc.loaded && sanitizeHtml($('#desc-editor').innerHTML) !== desc.original;

  // Asks before throwing away an edited description.
  function closeTaskDialog() {
    if (savingTask) return;
    if (descriptionDirty() && !confirm('Açıklamada kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?')) return;
    if (commentDraftPending() && !confirm('Gönderilmemiş bir yorumunuz var. Gönderilmeden kapatılsın mı?')) return;
    $('#task-dialog').close();
  }

  async function saveTaskDialog(e) {
    e.preventDefault();
    if (savingTask) return;
    const form = $('#task-form');
    const gorev = form.elements.gorev.value.trim();
    if (!gorev) {
      showGorevError(true);
      alert('Görev açıklaması boş olamaz.');
      form.elements.gorev.focus();
      return;
    }
    if (!editingTask && !form.elements.alan.value) {
      showAlanError(true);
      form.elements.alan.focus();
      return;
    }
    const tarih = form.elements.tamamlanmaTarihi.value;
    const values = {
      gorev,
      alan: form.elements.alan.value,
      sahip: form.elements.sahip.value,
      durum: form.elements.durum.value,
      oncelik: normalizePriority(form.elements.oncelik.value),
      tamamlanmaTarihi: isIsoDate(tarih) ? tarih : '',
    };
    let task = editingTask;
    const draft = task || { ...newTaskDraft(), ...values };

    // Description: saved first (shared database) so a failed save keeps the dialog open.
    if (richTasks && desc.loaded) {
      if (desc.busy) {
        alert('Resimler hâlâ işleniyor. Birkaç saniye sonra tekrar kaydedin.');
        return;
      }
      const html = sanitizeHtml($('#desc-editor').innerHTML);
      const textLength = descriptionTextLength(html);
      if (textLength > MAX_DESCRIPTION_TEXT_CHARS) {
        alert(`Açıklama çok uzun (${Math.round(textLength / 1000)} bin karakter). En fazla ${MAX_DESCRIPTION_TEXT_CHARS / 1000} bin karakter olabilir.`);
        return;
      }
      if (html.length > MAX_DESCRIPTION_CHARS) {
        alert(`Açıklamadaki resimler toplamda çok büyük (${formatSize(html.length)}). En fazla ${formatSize(MAX_DESCRIPTION_CHARS)} olabilir; bazı resimleri kaldırın veya ek olarak yükleyin.`);
        return;
      }
      if (html !== desc.original) {
        if (cloud) {
          setTaskSaving(true);
          let ok;
          try {
            ok = await saveDescription(draft.id, html);
          } catch (err) {
            setTaskSaving(false);
            alert(`Açıklama kaydedilemedi: ${err.message}\n\nDeğişiklikleriniz pencerede duruyor; bağlantınızı kontrol edip tekrar deneyin.`);
            return;
          }
          setTaskSaving(false);
          if (!ok) return;
          values.aciklamaVar = !!html;
        } else {
          values.aciklama = html;
        }
      }
    }

    const previousSahip = task ? task.sahip : '';
    if (task) {
      for (const [field, value] of Object.entries(values)) applyChange(task, field, value);
    } else {
      task = Object.assign(draft, values);
      if (task.durum === DONE) task.completedAt = nowIso();
      data.tasks.push(task);
      if (task.durum !== DONE || !isHiddenWhenDone()) ui.pinned.add(task.id);
    }
    markAssignment(task, previousSahip);
    save();
    desc.loaded = false;
    $('#task-dialog').close();
    if (task.durum === DONE && isHiddenWhenDone()) {
      ui.pinned.delete(task.id);
      toast('Görev tamamlandı ve gizlendi. Görmek için "Tamamlananları göster" seçeneğini işaretleyin.');
    }
    render();
  }

  // ---------- Description (rich text) ----------

  function setDescStatus(text, kind = 'muted') {
    const s = $('#desc-status');
    s.hidden = !text;
    s.textContent = text || '';
    s.className = `rte-status is-${kind}`;
  }

  function setEditorEnabled(on) {
    const editor = $('#desc-editor');
    editor.contentEditable = on ? 'true' : 'false';
    editor.setAttribute('aria-disabled', String(!on));
    $('#desc-editor-wrap').classList.toggle('is-disabled', !on);
    document.querySelectorAll('#desc-editor-wrap .rte-btn').forEach((b) => { b.disabled = !on; });
  }

  function lastEditedText(d) {
    return d && d.updatedBy ? `Son düzenleyen: ${displayName(d.updatedBy)} · ${formatDateTime(d.updatedAt)}` : '';
  }

  async function loadDescription(task) {
    const token = ++desc.token;
    const editor = $('#desc-editor');
    Object.assign(desc, { original: '', updatedAt: null, loaded: false });
    editor.innerHTML = '';
    setDescStatus('');
    if (!richTasks) return;
    if (!cloud || !task || !task.aciklamaVar) {
      // Local mode keeps the description in the task; tasks without one start empty.
      const html = !cloud && task ? sanitizeHtml(task.aciklama) : '';
      editor.innerHTML = html;
      Object.assign(desc, { original: html, loaded: true });
      setEditorEnabled(true);
      return;
    }
    setEditorEnabled(false);
    setDescStatus('Açıklama yükleniyor…');
    try {
      const d = await cloud.store.get(`details/${taskKey(task.id)}`);
      if (token !== desc.token) return;
      const html = sanitizeHtml(d && d.aciklama);
      editor.innerHTML = html;
      Object.assign(desc, { original: html, updatedAt: (d && d.updatedAt) || null, loaded: true });
      setEditorEnabled(true);
      setDescStatus(lastEditedText(d));
    } catch (err) {
      if (token !== desc.token) return;
      // Stays read-only so an unloaded description can't be overwritten.
      setDescStatus(`Açıklama yüklenemedi: ${err.message}`, 'error');
    }
  }

  // Returns false when the user chose to load a newer version written by someone else.
  async function saveDescription(id, html) {
    const path = `details/${taskKey(id)}`;
    const current = await cloud.store.get(path);
    const currentAt = (current && current.updatedAt) || null;
    if (currentAt !== desc.updatedAt && sanitizeHtml(current && current.aciklama) !== desc.original) {
      const who = current && current.updatedBy ? displayName(current.updatedBy) : 'başka bir kullanıcı';
      if (!confirm(`Bu görevin açıklaması siz düzenlerken ${who} tarafından değiştirildi.\n\nTamam: sizin açıklamanız kaydedilsin (diğer değişiklik kaybolur).\nİptal: güncel açıklama yüklensin.`)) {
        const fresh = sanitizeHtml(current && current.aciklama);
        $('#desc-editor').innerHTML = fresh;
        Object.assign(desc, { original: fresh, updatedAt: currentAt });
        setDescStatus('Güncel açıklama yüklendi. Kontrol edip tekrar kaydedebilirsiniz.', 'info');
        return false;
      }
    }
    if (html) {
      const at = nowIso();
      await cloud.store.put(path, { aciklama: html, updatedAt: at, updatedBy: currentUser ? currentUser.kullaniciAdi : auth.email });
      desc.updatedAt = at;
    } else {
      await cloud.store.remove(path);
      desc.updatedAt = null;
    }
    desc.original = html;
    return true;
  }

  // ---------- Description images (embedded as data URIs) ----------

  // Images need the signed-in shared database (local mode would fill up localStorage).
  const imagesEnabled = attachmentsEnabled;
  const EMBED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const isImageFile = (f) => f && /^image\//.test(f.type);

  function loadImageElement(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Resim okunamadı (desteklenmeyen biçim).')); };
      img.src = url;
    });
  }

  const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  // Downscales to MAX_IMAGE_SIDE and picks the smallest encoding; returns a data URI.
  async function imageFileToDataUrl(file) {
    const img = await loadImageElement(file);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('Resim okunamadı.');
    const fits = Math.max(w, h) <= MAX_IMAGE_SIDE;
    // Small GIFs stay untouched so animations survive.
    if (file.type === 'image/gif' && fits && file.size <= MAX_IMAGE_BYTES) return `data:image/gif;base64,${await blobToBase64(file)}`;
    const keepOriginal = fits && EMBED_TYPES.includes(file.type) && file.type !== 'image/gif';
    for (const side of [MAX_IMAGE_SIDE, 1280]) {
      const scale = Math.min(1, side / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      // JPEG has no transparency: flatten onto white.
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext('2d');
      fctx.fillStyle = '#fff';
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      // Lossless versions (the original or PNG) keep screenshots sharp; lossy ones are fallbacks.
      const lossless = [await canvasToBlob(canvas, 'image/png')];
      if (keepOriginal && side === MAX_IMAGE_SIDE) lossless.push(file);
      const lossy = [];
      for (const q of [0.85, 0.7, 0.55]) {
        lossy.push(await canvasToBlob(canvas, 'image/webp', q), await canvasToBlob(flat, 'image/jpeg', q));
        if (lossy.some((c) => c && c.size <= MAX_IMAGE_BYTES)) break;
      }
      const usable = (list) => list.filter((c) => c && c.size <= MAX_IMAGE_BYTES && EMBED_TYPES.includes(c.type));
      const smallest = (list) => list.reduce((a, b) => (b.size < a.size ? b : a));
      const ok = usable([...lossless, ...lossy]);
      if (!ok.length) continue;
      const best = smallest(ok);
      const okLossless = usable(lossless);
      const sharp = okLossless.length ? smallest(okLossless) : null;
      const pick = sharp && sharp.size <= Math.max(300 * 1024, best.size * 1.5) ? sharp : best;
      return `data:${pick.type};base64,${await blobToBase64(pick)}`;
    }
    throw new Error(`küçültüldükten sonra da ${formatSize(MAX_IMAGE_BYTES)} sınırını aşıyor. Daha küçük bir resim seçin veya dosyayı Ekler'e yükleyin.`);
  }

  const editorEditable = () => $('#desc-editor').isContentEditable;

  function rangeInEditor() {
    const editor = $('#desc-editor');
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return editor.contains(r.commonAncestorContainer) ? r.cloneRange() : null;
  }

  function rangeFromPoint(x, y) {
    let r = null;
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        r = document.createRange();
        r.setStart(pos.offsetNode, pos.offset);
        r.collapse(true);
      }
    }
    return r && $('#desc-editor').contains(r.commonAncestorContainer) ? r : null;
  }

  function placeCaret(range) {
    const editor = $('#desc-editor');
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range && editor.contains(range.commonAncestorContainer)) sel.addRange(range);
    else {
      const end = document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      sel.addRange(end);
    }
  }

  // Processes image files and inserts them where the caret was when they were pasted/dropped/chosen.
  async function insertImages(files, range) {
    const images = [...files].filter(isImageFile);
    if (!images.length) return;
    if (!imagesEnabled) { toast('Açıklamaya resim yalnızca kullanıcı girişli ortak veritabanı modunda eklenebilir.'); return; }
    if (!editorEditable()) return;
    const token = desc.token;
    const previousStatus = { text: $('#desc-status').textContent, hidden: $('#desc-status').hidden, cls: $('#desc-status').className };
    setDescStatus(images.length > 1 ? `${images.length} resim işleniyor…` : 'Resim işleniyor…', 'info');
    desc.busy += 1;
    const urls = [];
    const errors = [];
    for (const f of images) {
      try {
        urls.push(await imageFileToDataUrl(f));
      } catch (err) {
        errors.push(`• ${f.name || 'Resim'}: ${err.message}`);
      }
    }
    desc.busy -= 1;
    if (token !== desc.token) return; // the dialog was closed meanwhile
    const status = $('#desc-status');
    status.textContent = previousStatus.text;
    status.hidden = previousStatus.hidden;
    status.className = previousStatus.cls;
    if (urls.length && editorEditable()) {
      placeCaret(range);
      const html = urls.map((u) => `<img src="${u}" alt="">`).join('');
      if (!document.execCommand('insertHTML', false, html)) {
        const sel = window.getSelection();
        const r = sel.getRangeAt(0);
        r.deleteContents();
        const frag = r.createContextualFragment(html);
        const last = frag.lastChild;
        r.insertNode(frag);
        r.setStartAfter(last);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      $('#desc-editor').dispatchEvent(new Event('input'));
    }
    if (errors.length) alert(`Şu resimler eklenemedi:\n${errors.join('\n')}`);
  }

  const imageView = { img: null };

  function openImageDialog(img) {
    imageView.img = img;
    const dlg = $('#image-dialog');
    $('#image-dialog-img').src = img.src;
    const m = /^data:([^;]+);base64,/.exec(img.src);
    const bytes = Math.floor(((img.src.length - (m ? m[0].length : 0)) * 3) / 4);
    $('#image-dialog-info').textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${formatSize(bytes)}`;
    $('#image-dialog-remove').hidden = !editorEditable();
    dlg.showModal();
    $('#image-dialog-close').focus();
  }

  function setupImageDialog() {
    const dlg = $('#image-dialog');
    const close = () => dlg.close();
    $('#image-dialog-close').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // backdrop
    dlg.addEventListener('close', () => { $('#image-dialog-img').removeAttribute('src'); imageView.img = null; });
    $('#image-dialog-download').addEventListener('click', () => {
      const m = /^data:(image\/([a-z]+));base64,(.*)$/.exec($('#image-dialog-img').src);
      if (!m) return;
      const no = editingTask && editingTask.no ? `gorev-${editingTask.no}-` : '';
      download(`${no}resim.${m[2] === 'jpeg' ? 'jpg' : m[2]}`, new Blob([base64ToBytes(m[3])], { type: m[1] }));
    });
    $('#image-dialog-remove').addEventListener('click', () => {
      const editor = $('#desc-editor');
      const img = imageView.img;
      if (img && editor.contains(img) && editorEditable()) {
        const parent = img.parentElement;
        img.remove();
        if (parent && parent !== editor && !hasContent(parent) && parent.tagName === 'P') parent.remove();
        editor.dispatchEvent(new Event('input'));
      }
      close();
    });
  }

  function setupEditor() {
    const editor = $('#desc-editor');
    const toolbar = $('#desc-editor-wrap .rte-toolbar');
    const imageInput = $('#desc-image-input');
    let imageRange = null;
    $('#desc-image-btn').hidden = !imagesEnabled;
    const exec = (cmd, value = null) => { editor.focus(); document.execCommand(cmd, false, value); updateToolbarState(); };
    const currentBlock = () => String(document.queryCommandValue('formatBlock') || '').toUpperCase();

    function insertLink() {
      const sel = window.getSelection();
      const text = sel && editor.contains(sel.anchorNode) ? sel.toString() : '';
      const url = prompt('Bağlantı adresi (https://…, mailto:…)', 'https://');
      if (url === null) return;
      const href = safeHref(url);
      if (!href || href === 'https://') { alert('Geçerli bir bağlantı girin (https://, http:// veya mailto: ile başlamalı).'); return; }
      if (text) exec('createLink', href);
      else {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = href;
        exec('insertHTML', a.outerHTML);
      }
    }

    function updateToolbarState() {
      if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
      const block = currentBlock();
      toolbar.querySelectorAll('.rte-btn').forEach((b) => {
        let on = false;
        if (b.dataset.cmd) { try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { on = false; } }
        if (b.dataset.block) on = block === b.dataset.block;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('.rte-btn')) e.preventDefault(); }); // keep the selection
    toolbar.addEventListener('click', (e) => {
      const b = e.target.closest('.rte-btn');
      if (!b || b.disabled) return;
      if (b.dataset.cmd) exec(b.dataset.cmd);
      else if (b.dataset.block) exec('formatBlock', currentBlock() === b.dataset.block ? '<p>' : `<${b.dataset.block.toLowerCase()}>`);
      else if (b.dataset.action === 'link') insertLink();
      else if (b.dataset.action === 'image') { imageRange = rangeInEditor(); imageInput.click(); }
      else if (b.dataset.action === 'clear') { exec('removeFormat'); exec('unlink'); exec('formatBlock', '<p>'); }
    });
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); insertLink(); }
    });
    imageInput.addEventListener('change', () => {
      const files = [...imageInput.files];
      imageInput.value = '';
      insertImages(files, imageRange);
    });
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const cd = e.clipboardData;
      const plain = cd.getData('text/plain');
      // A copied picture/screenshot has no text; Word/Excel copies carry an image of the text too.
      const images = [...cd.files].filter(isImageFile);
      if (images.length && !plain.trim()) { insertImages(images, rangeInEditor()); return; }
      const html = cd.getData('text/html');
      if (html) {
        let clean = sanitizeHtml(html) || '';
        if (!imagesEnabled) clean = clean.replace(/<img [^>]*>/g, '');
        document.execCommand('insertHTML', false, clean);
      } else document.execCommand('insertText', false, plain);
    });
    editor.addEventListener('dragover', (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files') && editorEditable()) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    editor.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      const images = files.filter(isImageFile);
      if (images.length < files.length) toast('Resim olmayan dosyaları Ekler bölümüne bırakın.');
      if (images.length) insertImages(images, rangeFromPoint(e.clientX, e.clientY));
    });
    editor.addEventListener('input', () => editor.classList.toggle('is-empty', !hasContent(editor) && !editor.querySelector('li')));
    // Links open in a new tab with Ctrl/Cmd+click (a plain click places the caret); images open large.
    editor.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') { openImageDialog(e.target); return; }
      const a = e.target.closest('a');
      if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });
    document.addEventListener('selectionchange', updateToolbarState);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* not supported */ }
  }

  // ---------- Attachments (signed-in shared database) ----------

  // In-progress uploads per task id (they keep running when the dialog is closed).
  const uploads = new Map();
  const attach = { taskId: null, items: [], token: 0, downloads: new Map() };

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsDataURL(blob);
    });
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  const myUsername = () => (currentUser ? currentUser.kullaniciAdi : '');
  const attachTask = () => data.tasks.find((t) => t.id === attach.taskId) || null;

  function setAttachNote(text) {
    const n = $('#attach-note');
    n.hidden = !text;
    n.textContent = text || '';
  }

  function setAttachControls(enabled) {
    $('#btn-attach').disabled = !enabled;
    $('#btn-attach-link').disabled = !enabled;
    $('#attach-drop').hidden = !enabled;
  }

  async function loadAttachments(task) {
    const token = ++attach.token;
    attach.taskId = task ? task.id : null;
    attach.items = [];
    $('#attachments').hidden = !richTasks;
    setAttachNote('');
    if (!richTasks) return;
    if (!attachmentsEnabled) {
      setAttachControls(false);
      setAttachNote('Ekler yalnızca kullanıcı girişli ortak veritabanı modunda kullanılabilir.');
      renderAttachments();
      return;
    }
    if (!task) {
      setAttachControls(false);
      setAttachNote('Dosya eklemek için önce görevi kaydedin.');
      renderAttachments();
      return;
    }
    setAttachControls(true);
    renderAttachments();
    if (task.ekSayisi) setAttachNote('Ekler yükleniyor…');
    try {
      const list = await cloud.store.get(`attachments/${taskKey(task.id)}`);
      if (token !== attach.token) return;
      attach.items = Object.entries(list || {})
        .filter(([, v]) => v && typeof v === 'object')
        .map(([id, v]) => ({ id, ad: str(v.ad) || 'dosya', boyut: Number(v.boyut) || 0, tur: str(v.tur), yukleyen: str(v.yukleyen), yuklenmeTarihi: str(v.yuklenmeTarihi), parca: Number(v.parca) || 1 }))
        .sort((a, b) => a.yuklenmeTarihi.localeCompare(b.yuklenmeTarihi));
      setAttachNote('');
      renderAttachments();
      setAttachmentCount(task, attach.items.length, task.ekSayisi !== attach.items.length);
    } catch (err) {
      if (token !== attach.token) return;
      setAttachNote(`Ekler yüklenemedi: ${err.message}`);
    }
  }

  // The attachment counter on the task record (for the card/list icon) is recounted from the
  // server after every change and written directly, so concurrent uploads can't leave it stale.
  async function refreshAttachmentCount(task) {
    let keys;
    try {
      keys = await cloud.store.get(`attachments/${taskKey(task.id)}`, 'shallow=true');
    } catch (err) {
      return;
    }
    setAttachmentCount(task, Object.keys(keys || {}).length, true);
  }

  function setAttachmentCount(task, count, direct = false) {
    setTaskCount(task, 'ekSayisi', count, direct);
  }

  // Counters on the task record (ekSayisi, yorumSayisi) shown as card/list icons.
  function setTaskCount(task, field, count, direct = false) {
    if (!data.tasks.includes(task)) return;
    const id = task.id;
    const known = cloud.remote.tasks[id];
    const inSync = known !== undefined && known === taskSig(task);
    if (task[field] !== count) applyChange(task, field, count);
    else if (!direct) return;
    if (direct && inSync) {
      cloud.store.patch({ [`${taskPath(id)}/${field}`]: count || null, [`${taskPath(id)}/updatedAt`]: task.updatedAt })
        .then(() => {
          if (cloud.remote.tasks[id] === known) cloud.remote.tasks[id] = taskSig(task);
          persistCloudCache();
        })
        .catch(() => { /* the regular sync pushes the task */ });
    }
    save();
    renderWhenIdle();
  }

  function renderAttachments() {
    const list = $('#attach-list');
    const pending = (attach.taskId && uploads.get(attach.taskId)) || [];
    const count = attach.items.length;
    const badge = $('#attach-count');
    badge.hidden = !count;
    badge.textContent = String(count);
    list.replaceChildren(
      ...attach.items.map(buildAttachmentItem),
      ...pending.map(buildUploadItem),
    );
  }

  function buildAttachmentItem(item) {
    const own = item.yukleyen && item.yukleyen === myUsername();
    const dl = attach.downloads.get(item.id);
    const isImage = item.tur.startsWith('image/');
    const meta = dl
      ? (dl.error ? `İndirilemedi: ${dl.error}` : `İndiriliyor… %${Math.round(dl.progress * 100)}`)
      : [formatSize(item.boyut), item.yukleyen ? displayName(item.yukleyen) : '', formatDateTime(item.yuklenmeTarihi)].filter(Boolean).join(' · ');
    return el('li', { class: `attach-item${dl && dl.error ? ' is-error' : ''}`, dataset: { id: item.id } },
      el('span', { class: 'attach-icon', 'aria-hidden': 'true' }, icon(isImage ? 'image' : 'file')),
      el('span', { class: 'attach-info' },
        el('button', { type: 'button', class: 'attach-name', title: `${item.ad} – indirmek için tıklayın`, textContent: item.ad, onclick: () => downloadAttachment(item) }),
        el('span', { class: 'attach-meta', textContent: meta })),
      el('span', { class: 'attach-actions' },
        iconButton('download', 'İndir', { 'aria-label': `${item.ad} indir`, disabled: !!(dl && !dl.error), onclick: () => downloadAttachment(item) }),
        own ? iconButton('trash', 'Sil', { class: 'btn btn-ghost btn-icon btn-sm btn-danger', 'aria-label': `${item.ad} sil`, onclick: () => deleteAttachment(item) }) : null));
  }

  function buildUploadItem(up) {
    const pct = up.file.size ? Math.round((up.loaded / up.file.size) * 100) : 0;
    return el('li', { class: `attach-item is-uploading${up.error ? ' is-error' : ''}` },
      el('span', { class: 'attach-icon', 'aria-hidden': 'true' }, icon('upload')),
      el('span', { class: 'attach-info' },
        el('span', { class: 'attach-name is-static', textContent: up.file.name }),
        up.error
          ? el('span', { class: 'attach-meta', textContent: `Yüklenemedi: ${up.error}` })
          : el('span', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `${up.file.name} yükleniyor` },
            el('span', { class: 'progress-bar', style: `width:${pct}%` }))),
      el('span', { class: 'attach-actions' },
        up.error ? iconButton('refresh', 'Tekrar dene', { onclick: () => runUpload(up) }) : el('span', { class: 'attach-pct', textContent: `%${pct}` }),
        up.error ? iconButton('x', 'Kaldır', { onclick: () => { removeUpload(up); renderAttachments(); } }) : null));
  }

  function removeUpload(up) {
    const list = uploads.get(up.taskId) || [];
    uploads.set(up.taskId, list.filter((u) => u !== up));
  }

  function addFiles(fileList) {
    const task = attachTask();
    if (!task || !attachmentsEnabled) return;
    const files = [...fileList];
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const empty = files.filter((f) => f.size === 0);
    if (tooBig.length) alert(`Şu dosyalar 10 MB sınırını aşıyor ve eklenmedi:\n${tooBig.map((f) => `• ${f.name} (${formatSize(f.size)})`).join('\n')}`);
    if (empty.length) toast(`Boş dosyalar eklenmedi: ${empty.map((f) => f.name).join(', ')}`);
    const ok = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES);
    if (!ok.length) return;
    const list = uploads.get(task.id) || [];
    const added = ok.map((file) => ({ id: uid(), taskId: task.id, file, loaded: 0, error: null }));
    uploads.set(task.id, [...list, ...added]);
    renderAttachments();
    (async () => { for (const up of added) await runUpload(up); })();
  }

  async function runUpload(up) {
    up.error = null;
    up.loaded = 0;
    if (attach.taskId === up.taskId) renderAttachments();
    const key = taskKey(up.taskId);
    const base = `files/${key}/${up.id}`;
    const parts = Math.max(1, Math.ceil(up.file.size / CHUNK_BYTES));
    try {
      for (let i = 0; i < parts; i += 1) {
        const b64 = await blobToBase64(up.file.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
        if (i === 0) await cloud.store.put(base, { yukleyen: myUsername(), p: { 0: b64 } });
        else await cloud.store.put(`${base}/p/${i}`, b64);
        up.loaded = Math.min(up.file.size, (i + 1) * CHUNK_BYTES);
        if (attach.taskId === up.taskId) renderAttachments();
      }
      const item = { ad: up.file.name.slice(0, 255), boyut: up.file.size, tur: (up.file.type || '').slice(0, 200), yukleyen: myUsername(), yuklenmeTarihi: nowIso(), parca: parts };
      // The metadata is written last, so others only see complete files.
      await cloud.store.put(`attachments/${key}/${up.id}`, item);
      removeUpload(up);
      const task = data.tasks.find((t) => t.id === up.taskId);
      if (attach.taskId === up.taskId) {
        attach.items.push({ id: up.id, ...item });
        renderAttachments();
      } else {
        toast(`"${item.ad}" yüklendi.`);
      }
      if (task) refreshAttachmentCount(task);
    } catch (err) {
      up.error = err.message;
      if (attach.taskId === up.taskId) renderAttachments();
      else toast(`"${up.file.name}" yüklenemedi: ${err.message}`);
      cloud.store.remove(base).catch(() => {});
    }
  }

  async function downloadAttachment(item) {
    if (attach.downloads.has(item.id) && !attach.downloads.get(item.id).error) return;
    const state = { progress: 0, error: null };
    attach.downloads.set(item.id, state);
    renderAttachments();
    const base = `files/${taskKey(attach.taskId)}/${item.id}/p`;
    try {
      const chunks = [];
      for (let i = 0; i < item.parca; i += 1) {
        const b64 = await cloud.store.get(`${base}/${i}`);
        if (typeof b64 !== 'string') throw new Error('Dosya eksik veya bozuk.');
        chunks.push(base64ToBytes(b64));
        state.progress = (i + 1) / item.parca;
        renderAttachments();
      }
      download(item.ad, new Blob(chunks, { type: item.tur || 'application/octet-stream' }));
      attach.downloads.delete(item.id);
    } catch (err) {
      state.error = err.message;
    }
    renderAttachments();
  }

  async function deleteAttachment(item) {
    if (!confirm(`"${item.ad}" eki silinsin mi? Bu işlem geri alınamaz.`)) return;
    const key = taskKey(attach.taskId);
    try {
      await cloud.store.patch({ [`attachments/${key}/${item.id}`]: null, [`files/${key}/${item.id}`]: null });
    } catch (err) {
      alert(`Ek silinemedi: ${err.message}`);
      return;
    }
    attach.items = attach.items.filter((x) => x !== item);
    renderAttachments();
    const task = attachTask();
    if (task) refreshAttachmentCount(task);
  }

  function setupAttachments() {
    const input = $('#attach-input');
    $('#btn-attach').addEventListener('click', () => input.click());
    $('#btn-attach-link').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    const zone = $('#attachments');
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    zone.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!$('#attach-drop').hidden) zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-dragover'); });
    zone.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      zone.classList.remove('is-dragover');
      if (!$('#attach-drop').hidden) addFiles(e.dataTransfer.files);
    });
    // Files dropped elsewhere in the dialog must not make the browser open them.
    const dialog = $('#task-dialog');
    dialog.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    dialog.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });
  }

  // ---------- Comments (signed-in Azure mode) ----------
  // /comments/{task}/{id} = { yazan, metin (≤ 600), tarih, duzenlenme? }. Everyone writes only their
  // own comments. People tagged with @KullaniciAdi and the task owner are mailed by comment-notify.

  const comm = { taskId: null, items: [], token: 0, editing: null, editDraft: '', focusEdit: false, busy: false, focusId: null };
  const commentPath = (taskId, id) => `comments/${taskKey(taskId)}${id ? `/${taskKey(id)}` : ''}`;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // "@name" for known user names, not inside a word or an e-mail address (same as the API).
  function mentionRegex() {
    const names = [...new Set((directory || []).map((u) => u.kullaniciAdi))].sort((a, b) => b.length - a.length).map(escapeRe);
    return names.length ? new RegExp(`(^|[^\\p{L}\\p{N}_@.])@(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null;
  }

  // Comment text as text nodes with highlighted @mentions (never parsed as HTML).
  function commentNodes(text) {
    const re = mentionRegex();
    const out = [];
    let last = 0;
    if (re) {
      for (const m of text.matchAll(re)) {
        const at = m.index + m[1].length;
        if (at > last) out.push(text.slice(last, at));
        const u = directory.find((x) => x.kullaniciAdi.toLocaleLowerCase('tr') === m[2].toLocaleLowerCase('tr'));
        out.push(el('span', { class: 'mention', textContent: `@${m[2]}`, title: u ? fullName(u) : '' }));
        last = at + m[2].length + 1;
      }
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  const commentFromServer = (id, v) => ({ id, yazan: str(v.yazan), metin: str(v.metin), tarih: str(v.tarih), duzenlenme: str(v.duzenlenme) });

  function setCommentNote(text) {
    const n = $('#comment-note');
    n.hidden = !text;
    n.textContent = text || '';
  }

  function updateChars(node, value) {
    node.textContent = `${value.length}/${MAX_COMMENT}`;
    node.classList.toggle('is-near', value.length >= MAX_COMMENT - 20);
  }

  function updateCommentCompose() {
    const value = $('#comment-input').value;
    updateChars($('#comment-chars'), value);
    const btn = $('#btn-comment');
    btn.disabled = comm.busy || !value.trim();
    btn.textContent = comm.busy && !comm.editing ? 'Gönderiliyor…' : 'Yorum yap';
  }

  function setCommentBusy(busy) {
    comm.busy = busy;
    updateCommentCompose();
    document.querySelectorAll('#comment-list .comment-edit .btn-primary').forEach((b) => { b.disabled = busy; });
  }

  async function loadComments(task) {
    const token = ++comm.token;
    comm.taskId = task ? task.id : null;
    comm.items = [];
    comm.editing = null;
    closeMentions();
    $('#comments').hidden = !commentsEnabled;
    if (!commentsEnabled) return;
    $('#comment-input').value = '';
    setCommentBusy(false);
    $('#comment-compose').hidden = !task;
    if (!task) {
      setCommentNote('Yorum yapmak için önce görevi kaydedin.');
      renderComments();
      return;
    }
    setCommentNote(task.yorumSayisi ? 'Yorumlar yükleniyor…' : '');
    renderComments();
    try {
      const list = await cloud.store.get(commentPath(task.id));
      if (token !== comm.token) return;
      comm.items = Object.entries(list || {}).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => commentFromServer(id, v));
      setCommentNote('');
      renderComments();
      setTaskCount(task, 'yorumSayisi', comm.items.length, task.yorumSayisi !== comm.items.length);
      focusDeepLinkedComment();
    } catch (err) {
      if (token !== comm.token) return;
      setCommentNote(`Yorumlar yüklenemedi: ${err.message}`);
    }
  }

  function renderComments() {
    const items = [...comm.items].sort((a, b) => b.tarih.localeCompare(a.tarih));
    const badge = $('#comment-count');
    badge.hidden = !items.length;
    badge.textContent = String(items.length);
    const me = myUsername();
    $('#comment-list').replaceChildren(...items.map((c) => {
      const editing = comm.editing === c.id;
      const head = el('div', { class: 'comment-head' },
        buildAvatar(c.yazan, 'avatar-sm'),
        el('strong', { class: 'comment-author', textContent: displayName(c.yazan) || '—' }),
        el('span', { class: 'comment-meta', textContent: formatDateTime(c.tarih) }),
        c.duzenlenme ? el('span', { class: 'comment-meta comment-edited', textContent: '· düzenlendi', title: `Düzenlenme: ${formatDateTime(c.duzenlenme)}` }) : null);
      if (me && c.yazan === me && !editing) {
        head.append(el('span', { class: 'comment-actions' },
          iconButton('pencil', 'Yorumu düzenle', { onclick: () => startEditComment(c) }),
          iconButton('trash', 'Yorumu sil', { class: 'btn btn-ghost btn-icon btn-sm btn-danger', onclick: () => deleteComment(c) })));
      }
      const li = el('li', { class: 'comment', dataset: { id: c.id } }, head);
      li.append(editing ? buildCommentEditor(c) : el('p', { class: 'comment-text' }, ...commentNodes(c.metin)));
      return li;
    }));
  }

  function buildCommentEditor(c) {
    const ta = el('textarea', { class: 'input comment-input', rows: 2, maxLength: MAX_COMMENT, value: comm.editDraft, 'aria-label': 'Yorumu düzenle' });
    const chars = el('span', { class: 'comment-chars' });
    const save = el('button', { type: 'button', class: 'btn btn-sm btn-primary', textContent: 'Kaydet', onclick: () => saveEditedComment(c, ta.value) });
    const cancel = el('button', { type: 'button', class: 'btn btn-sm', textContent: 'Vazgeç', onclick: () => cancelEditComment() });
    const sync = () => {
      comm.editDraft = ta.value;
      updateChars(chars, ta.value);
      save.disabled = comm.busy || !ta.value.trim() || ta.value.trim() === c.metin;
    };
    attachMentions(ta);
    ta.addEventListener('input', sync);
    ta.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return; // handled by the @ suggestion list
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!save.disabled) saveEditedComment(c, ta.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditComment();
      }
    });
    sync();
    if (comm.focusEdit) {
      comm.focusEdit = false;
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    }
    return el('div', { class: 'comment-edit' },
      el('div', { class: 'mention-wrap' }, ta),
      el('div', { class: 'comment-compose-foot' }, chars, el('span', { class: 'spacer' }), cancel, save));
  }

  function startEditComment(c) {
    comm.editing = c.id;
    comm.editDraft = c.metin;
    comm.focusEdit = true;
    renderComments();
  }

  function cancelEditComment() {
    comm.editing = null;
    closeMentions();
    renderComments();
  }

  const commentDraftPending = () => !!(commentsEnabled && (($('#comment-input').value.trim() && !$('#comment-compose').hidden)
    || (comm.editing && comm.items.some((c) => c.id === comm.editing && c.metin !== comm.editDraft.trim()))));

  async function postComment() {
    const task = editingTask;
    const input = $('#comment-input');
    const text = input.value.trim();
    if (!task || !text || comm.busy || comm.taskId !== task.id || text.length > MAX_COMMENT) return;
    if (cloud.remote.tasks[task.id] === undefined) {
      toast('Görev henüz ortak veritabanına kaydedilmedi; birkaç saniye sonra tekrar deneyin.');
      return;
    }
    const id = uid();
    const item = { yazan: myUsername(), metin: text, tarih: nowIso() };
    setCommentBusy(true);
    try {
      await cloud.store.put(commentPath(task.id, id), item);
    } catch (err) {
      setCommentBusy(false);
      toast(`Yorum kaydedilemedi: ${err.message}`);
      return;
    }
    setCommentBusy(false);
    if (comm.taskId === task.id) {
      comm.items.push(commentFromServer(id, item));
      input.value = '';
      updateCommentCompose();
      renderComments();
    }
    refreshCommentCount(task);
    queueCommentNotify(task.id, id);
  }

  async function saveEditedComment(c, value) {
    const task = editingTask;
    const text = value.trim();
    if (!task || !text || comm.busy || text.length > MAX_COMMENT) return;
    const item = { yazan: c.yazan, metin: text, tarih: c.tarih, duzenlenme: nowIso() };
    setCommentBusy(true);
    try {
      await cloud.store.put(commentPath(task.id, c.id), item);
    } catch (err) {
      setCommentBusy(false);
      toast(`Yorum kaydedilemedi: ${err.message}`);
      return;
    }
    setCommentBusy(false);
    Object.assign(c, item);
    comm.editing = null;
    closeMentions();
    renderComments();
    queueCommentNotify(task.id, c.id);
  }

  async function deleteComment(c) {
    const task = editingTask;
    if (!task || comm.busy || !confirm('Yorum silinsin mi? Bu işlem geri alınamaz.')) return;
    setCommentBusy(true);
    try {
      await cloud.store.remove(commentPath(task.id, c.id));
    } catch (err) {
      setCommentBusy(false);
      toast(`Yorum silinemedi: ${err.message}`);
      return;
    }
    setCommentBusy(false);
    comm.items = comm.items.filter((x) => x !== c);
    if (comm.editing === c.id) comm.editing = null;
    renderComments();
    refreshCommentCount(task);
  }

  // The comment counter on the task is recounted from the server (concurrent comments).
  async function refreshCommentCount(task) {
    let keys;
    try {
      keys = await cloud.store.get(commentPath(task.id), 'shallow=true');
    } catch (err) {
      return;
    }
    setTaskCount(task, 'yorumSayisi', Object.keys(keys || {}).length, true);
  }

  // Opened from a comment mail (?gorev=12&yorum=<id>): scroll to and highlight the comment.
  function focusDeepLinkedComment() {
    const id = comm.focusId;
    if (!id) return;
    comm.focusId = null;
    const li = [...document.querySelectorAll('#comment-list .comment')].find((x) => x.dataset.id === id);
    if (!li) return;
    li.classList.add('is-focus');
    li.scrollIntoView({ block: 'nearest' });
    setTimeout(() => li.classList.remove('is-focus'), 4000);
  }

  // @ suggestions: typing "@" (optionally followed by the start of a name) lists teammates;
  // ↑/↓ move, Enter/Tab pick, Esc closes. One shared list, moved under the active textarea.
  const mention = { input: null, start: 0, items: [], active: 0, list: null };
  const mentionsOpen = () => !!(mention.list && !mention.list.hidden);

  function closeMentions() {
    if (mention.list) mention.list.hidden = true;
    if (mention.input) mention.input.setAttribute('aria-expanded', 'false');
    mention.input = null;
    mention.items = [];
  }

  function attachMentions(ta) {
    ta.setAttribute('aria-autocomplete', 'list');
    ta.setAttribute('aria-expanded', 'false');
    ta.addEventListener('input', () => updateMentions(ta));
    ta.addEventListener('click', () => updateMentions(ta));
    ta.addEventListener('keydown', (e) => onMentionKey(e, ta));
    ta.addEventListener('blur', () => setTimeout(() => { if (mention.input === ta && document.activeElement !== ta) closeMentions(); }, 150));
  }

  function updateMentions(ta) {
    const caret = ta.selectionStart;
    const m = caret === ta.selectionEnd ? /(^|[^\p{L}\p{N}_@.])@([\p{L}\p{N}_.-]{0,30})$/u.exec(ta.value.slice(0, caret)) : null;
    const q = m ? m[2].toLocaleLowerCase('tr') : '';
    const me = myUsername();
    const matches = m && directory ? directory.filter((u) => u.kullaniciAdi !== me
      && (!q || [u.kullaniciAdi, u.ad, u.soyad, fullName(u)].some((s) => s && s.toLocaleLowerCase('tr').startsWith(q)))).slice(0, 6) : [];
    if (!matches.length || (matches.length === 1 && matches[0].kullaniciAdi.toLocaleLowerCase('tr') === q)) { closeMentions(); return; }
    if (!mention.list) {
      mention.list = el('ul', { class: 'combo-list mention-list', role: 'listbox', 'aria-label': 'Kişiler', id: 'mention-list' });
      mention.list.addEventListener('mousedown', (e) => e.preventDefault()); // keep the textarea focused
    }
    if (mention.list.parentElement !== ta.parentElement) ta.parentElement.append(mention.list);
    const sameQuery = mention.input === ta && mention.start === caret - m[2].length - 1 && mention.items.length === matches.length;
    mention.input = ta;
    mention.start = caret - m[2].length - 1;
    mention.items = matches;
    if (!sameQuery) mention.active = 0;
    ta.setAttribute('aria-controls', 'mention-list');
    ta.setAttribute('aria-expanded', 'true');
    renderMentionItems();
    mention.list.hidden = false;
  }

  function renderMentionItems() {
    mention.list.replaceChildren(...mention.items.map((u, i) => el('li', {
      class: `combo-option mention-option${i === mention.active ? ' is-active' : ''}`,
      role: 'option',
      'aria-selected': String(i === mention.active),
      onclick: () => pickMention(i),
    }, buildAvatar(u.kullaniciAdi, 'avatar-sm'), el('span', { class: 'mention-name', textContent: fullName(u) }), el('span', { class: 'mention-user', textContent: `@${u.kullaniciAdi}` }))));
  }

  function onMentionKey(e, ta) {
    if (!mentionsOpen() || mention.input !== ta) return;
    const n = mention.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      mention.active = (mention.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderMentionItems();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pickMention(mention.active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMentions();
    }
  }

  function pickMention(i) {
    const u = mention.items[i];
    const ta = mention.input;
    if (!u || !ta) return;
    const before = ta.value.slice(0, mention.start);
    const after = ta.value.slice(ta.selectionStart).replace(/^\s+/, '');
    const insert = `@${u.kullaniciAdi} `;
    closeMentions();
    if ((before + insert + after).length > MAX_COMMENT) {
      toast(`Yorum en fazla ${MAX_COMMENT} karakter olabilir.`);
      return;
    }
    ta.value = before + insert + after;
    const pos = before.length + insert.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setupComments() {
    const input = $('#comment-input');
    attachMentions(input);
    input.addEventListener('input', updateCommentCompose);
    input.addEventListener('keydown', (e) => {
      if (!e.defaultPrevented && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        postComment();
      }
    });
    $('#btn-comment').addEventListener('click', postComment);
  }

  function renderSummary() {
    const open = data.tasks.filter((t) => t.durum !== DONE);
    const done = data.tasks.length - open.length;
    let red = 0;
    let yellow = 0;
    for (const t of open) {
      const { level } = dueInfo(t);
      if (level === 'red') red += 1;
      else if (level === 'yellow') yellow += 1;
    }
    const shown = ui.shownCount;
    const stat = (value, label, extra = {}) => el(extra.due ? 'button' : 'span', {
      class: `stat ${extra.class || ''}`.trim(),
      title: extra.title || '',
      ...(extra.due ? {
        type: 'button',
        dataset: { due: extra.due },
        'aria-pressed': String(ui.due === extra.due),
        disabled: value === 0 && ui.due !== extra.due,
        onclick: () => toggleDueFilter(extra.due),
      } : {}),
    },
      extra.dot ? el('span', { class: 'status-dot', 'aria-hidden': 'true' }) : null,
      el('span', { class: 'stat-value', textContent: String(value) }),
      el('span', { class: 'stat-label', textContent: label }),
      extra.hint ? el('span', { class: 'stat-hint', textContent: extra.hint }) : null);
    const dueTitle = (text, level) => `${text}${ui.due === level ? ' — filtreyi kaldırmak için tıklayın' : ' — yalnızca bunları göstermek için tıklayın'}`;
    $('#summary').replaceChildren(
      stat(shown, 'gösterilen'),
      stat(open.length, 'açık'),
      stat(done, 'tamamlanan'),
      stat(red, 'kritik', { due: 'red', class: `count-red${red ? '' : ' is-zero'}`, dot: true, hint: '3 günden az / gecikmiş', title: dueTitle('Tamamlanma tarihine 3 günden az kalan veya geciken açık görevler (kırmızı)', 'red') }),
      stat(yellow, 'yaklaşan', { due: 'yellow', class: `count-yellow${yellow ? '' : ' is-zero'}`, dot: true, hint: '1 haftadan az', title: dueTitle('Tamamlanma tarihine 1 haftadan az kalan açık görevler (sarı)', 'yellow') }),
    );
  }

  function toggleDueFilter(level) {
    ui.due = ui.due === level ? null : level;
    resetPinned();
    renderView();
    renderSummary();
    updateFilterUi();
    $(`#summary [data-due="${level}"]`)?.focus();
  }

  function hasActiveFilters() {
    return !!(ui.search.trim() || ui.showCompleted || ui.due || activeFilterKeys().some((k) => ui.filters[k].length));
  }

  const isMyTasks = () => !!currentUser && ui.filters.sahip.length === 1 && ui.filters.sahip[0] === currentUser.kullaniciAdi;

  function toggleMyTasks() {
    if (!currentUser) return;
    ui.filters.sahip = isMyTasks() ? [] : [currentUser.kullaniciAdi];
    syncFilterControl('sahip');
    resetPinned();
    renderView();
    renderSummary();
    updateFilterUi();
  }

  function updateFilterUi() {
    for (const key of LIST_KEYS) {
      $(`#filter-${key}`).closest('.filter-control').classList.toggle('is-active', ui.filters[key].length > 0);
    }
    $('#btn-my-tasks').setAttribute('aria-pressed', String(isMyTasks()));
    $('#btn-clear-filters').hidden = !hasActiveFilters();
  }

  function renderSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === ui.sort.key && !th.classList.contains('col-kalan');
      th.classList.toggle('is-sorted', active);
      if (th.classList.contains('col-kalan')) return;
      th.setAttribute('aria-sort', active ? (ui.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      const use = th.querySelector('.sort-icon use');
      if (use) use.setAttribute('href', active ? (ui.sort.dir === 1 ? '#i-arrow-up' : '#i-arrow-down') : '#i-sort');
    });
  }

  function renderBackupInfo() {
    const info = $('#backup-info');
    if (cloud) {
      info.textContent = cloud.lastSyncAt ? `Son eşitleme: ${formatDateTime(cloud.lastSyncAt)}` : '';
      info.classList.remove('warn');
      return;
    }
    const last = data.meta.lastBackupAt;
    let warn = false;
    if (last) {
      info.textContent = `Son yedek: ${formatDateTime(last)}`;
      warn = (Date.now() - new Date(last).getTime()) / 86400000 > BACKUP_WARN_DAYS && data.tasks.length > 0;
    } else {
      info.textContent = 'Henüz yedek alınmadı.';
      warn = data.tasks.length > 0;
    }
    info.classList.toggle('warn', warn);
  }

  // ---------- Task actions ----------

  function applyChange(task, field, value) {
    const prev = task[field];
    if (prev === value) return false;
    task[field] = value;
    task.updatedAt = nowIso();
    if (field === 'durum') {
      if (value === DONE && prev !== DONE) task.completedAt = nowIso();
      else if (value !== DONE) task.completedAt = null;
    }
    return true;
  }

  function onFieldChange(task, field, value, tr) {
    const previousSahip = task.sahip;
    if (!applyChange(task, field, value)) return;
    if (field === 'sahip') markAssignment(task, previousSahip);
    save();

    if (field === 'durum' && value === DONE && isHiddenWhenDone()) {
      ui.pinned.delete(task.id);
      renderTable();
      renderSummary();
      toast('Görev tamamlandı ve listeden gizlendi. Görmek için "Tamamlananları göster" seçeneğini işaretleyin.');
      return;
    }
    applyRowState(tr, task);
    renderSummary();
    renderBackupInfo();
  }

  function newTaskDraft() {
    const ts = nowIso();
    return {
      id: uid(),
      alan: ui.filters.alan[0] || '',
      gorev: '',
      sahip: ui.filters.sahip[0] || '',
      durum: statusFilter().find((s) => s !== DONE) || firstOpenStatus(),
      oncelik: DEFAULT_PRIORITY,
      tamamlanmaTarihi: '',
      createdAt: ts,
      updatedAt: ts,
      completedAt: null,
      createdBy: currentUser ? currentUser.kullaniciAdi : '',
    };
  }

  // New tasks are created in the details dialog (Alan is required there).
  function addTask() {
    openTaskDialog(null);
  }

  async function deleteTask(task) {
    if (task.durum === DONE) {
      alert('Tamamlanan görevler silinemez.');
      return false;
    }
    if (timesheet && cloud && cloud.store) {
      // Tasks with time entries are kept so reports stay complete.
      let entries;
      try {
        entries = await timesheet.taskEntries(task.id);
      } catch (err) {
        if (err.code !== 'denied') {
          alert(`Görevin zaman girişleri kontrol edilemedi, görev silinmedi: ${err.message}`);
          return false;
        }
        entries = [];
      }
      if (entries.length) {
        alert(`Bu göreve toplam ${timesheet.formatHours(timesheet.sum(entries))} zaman girişi yapılmış (${entries.length} giriş). Zaman girişi olan görevler silinemez; bunun yerine durumunu değiştirebilirsiniz.`);
        return false;
      }
    }
    const name = task.gorev ? `"${task.gorev}"` : 'Bu (isimsiz)';
    if (!confirm(`${name} görevi silinsin mi?${commentsEnabled ? ' Açıklaması, ekleri ve yorumları da silinir.' : attachmentsEnabled ? ' Açıklaması ve ekleri de silinir.' : ''} Bu işlem geri alınamaz.`)) return false;
    data.tasks = data.tasks.filter((t) => t.id !== task.id);
    ui.pinned.delete(task.id);
    save();
    render();
    return true;
  }

  // ---------- Settings (parametric lists) ----------

  function usageCount(key, value) {
    return data.tasks.filter((t) => t[key] === value).length;
  }

  function renameValue(key, oldValue, newValueRaw) {
    const newValue = str(newValueRaw);
    if (newValue === oldValue) return true;
    if (!newValue) { alert('Değer boş olamaz.'); return false; }
    if (data.lists[key].some((v) => v !== oldValue && sameText(v, newValue))) {
      alert(`"${newValue}" zaten listede var.`);
      return false;
    }
    const idx = data.lists[key].indexOf(oldValue);
    data.lists[key][idx] = newValue;
    for (const t of data.tasks) if (t[key] === oldValue) t[key] = newValue;
    ui.filters[key] = ui.filters[key].map((v) => (v === oldValue ? newValue : v));
    save();
    return true;
  }

  function removeValue(key, value) {
    const used = usageCount(key, value);
    if (used > 0) {
      alert(`"${value}" ${used} görevde kullanılıyor. Önce bu görevlerin ${LIST_LABELS[key]} değerini değiştirin.`);
      return;
    }
    if (key === 'durum' && data.lists.durum.filter((d) => d !== DONE).length <= 1) {
      alert('"Tamamlandı" dışında en az bir durum değeri bulunmalıdır.');
      return;
    }
    if (!confirm(`"${value}" ${LIST_LABELS[key]} listesinden silinsin mi?`)) return;
    data.lists[key] = data.lists[key].filter((v) => v !== value);
    save();
    renderSettings();
    render();
  }

  function moveValue(key, index, delta) {
    const list = data.lists[key];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    if (key === 'durum' && (list[index] === DONE || list[target] === DONE)) return;
    [list[index], list[target]] = [list[target], list[index]];
    save();
    renderSettings();
    render();
  }

  function addValue(key, raw) {
    const value = str(raw);
    if (!value) return false;
    if (data.lists[key].some((v) => sameText(v, value))) {
      alert(`"${value}" zaten listede var.`);
      return false;
    }
    if (key === 'durum') data.lists.durum.splice(data.lists.durum.length - 1, 0, value);
    else data.lists[key].push(value);
    save();
    renderSettings();
    render();
    return true;
  }

  let settingsFlash = null;

  function iconButton(name, title, props = {}) {
    return el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title, 'aria-label': props['aria-label'] || title, ...props }, icon(name, 'icon-sm'));
  }

  function renderSettings() {
    const container = $('#settings-lists');
    const flash = settingsFlash;
    settingsFlash = null;
    container.replaceChildren(...LIST_KEYS.map((key) => {
      if (key === 'sahip' && directory) return buildUserListSection();
      const list = data.lists[key];
      const items = list.map((value, i) => {
        const fixed = key === 'durum' && value === DONE;
        const used = usageCount(key, value);
        const input = el('input', {
          type: 'text',
          class: 'input input-sm',
          value,
          disabled: fixed,
          'aria-label': `${LIST_LABELS[key]} değeri`,
          title: fixed ? 'Sabit durum – değiştirilemez' : `${value} – yeniden adlandırmak için düzenleyin`,
          onchange: (e) => {
            const next = str(e.target.value);
            if (renameValue(key, value, e.target.value)) {
              if (next !== value) settingsFlash = { key, value: next };
              renderSettings();
              render();
            } else e.target.value = value;
          },
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
        });
        const lastMovable = key === 'durum' ? list.length - 2 : list.length - 1;
        const flashed = flash && flash.key === key && flash.value === value;
        const del = fixed
          ? el('span', { class: 'settings-lock', title: 'Sabit durum silinemez' }, icon('lock', 'icon-sm'))
          : iconButton('trash', 'Sil', {
            class: `btn btn-ghost btn-icon btn-sm btn-danger${used ? ' is-blocked' : ''}`,
            'aria-label': used ? `Sil (${used} görevde kullanılıyor)` : `${value} değerini sil`,
            onclick: () => removeValue(key, value),
          });
        return el('li', { class: flashed ? 'is-flashed' : '' },
          input,
          flashed ? el('span', { class: 'saved-flash', role: 'status' }, icon('check', 'icon-sm'), 'Kaydedildi') : null,
          el('span', { class: `badge usage${used ? '' : ' is-zero'}`, title: 'Kullanıldığı görev sayısı', textContent: `${used} görev` }),
          el('span', { class: 'settings-actions' },
            iconButton('arrow-up', 'Yukarı taşı', { disabled: fixed || i === 0, onclick: () => moveValue(key, i, -1) }),
            iconButton('arrow-down', 'Aşağı taşı', { disabled: fixed || i >= lastMovable, onclick: () => moveValue(key, i, 1) }),
            del),
        );
      });
      const addInput = el('input', { type: 'text', class: 'input input-sm', placeholder: `Yeni ${LIST_LABELS[key].toLocaleLowerCase('tr')}…`, 'aria-label': `Yeni ${LIST_LABELS[key].toLocaleLowerCase('tr')} ekle` });
      const doAdd = () => { if (addValue(key, addInput.value)) $(`#settings-add-${key}`)?.focus(); };
      addInput.id = `settings-add-${key}`;
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
      return el('section', { class: 'settings-list' },
        el('h3', {}, LIST_LABELS[key], el('span', { class: 'count-badge', textContent: String(list.length) })),
        el('ul', {}, ...items),
        el('div', { class: 'add-row' }, addInput, el('button', { type: 'button', class: 'btn btn-sm', onclick: doAdd }, icon('plus', 'icon-sm'), 'Ekle')),
      );
    }));
  }

  // Signed-in mode: owners are the user accounts (/users).
  function buildUserListSection() {
    const items = directory.map((u) => {
      const used = usageCount('sahip', u.kullaniciAdi);
      return el('li', { class: 'settings-user' },
        buildAvatar(u.kullaniciAdi, 'avatar-sm'),
        el('span', { class: 'settings-user-name' },
          el('strong', { textContent: u.kullaniciAdi }),
          el('span', { class: 'settings-user-meta', textContent: `${fullName(u)} · ${u.email}` })),
        el('span', { class: `badge usage${used ? '' : ' is-zero'}`, title: 'Kullanıldığı görev sayısı', textContent: `${used} görev` }));
    });
    return el('section', { class: 'settings-list' },
      el('h3', {}, LIST_LABELS.sahip, el('span', { class: 'count-badge', textContent: String(directory.length) })),
      el('p', { class: 'settings-note' }, icon('lock', 'icon-sm'), 'Sahip listesi kullanıcı hesaplarından otomatik oluşur.'),
      el('ul', {}, ...items));
  }
  // ---------- Import / Export ----------

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Shared database: descriptions live in /details; fetched in one request for backups/exports.
  async function fetchDescriptions() {
    if (!cloud || !auth) return new Map(data.tasks.map((t) => [t.id, t.aciklama || '']));
    const all = await cloud.store.get('details');
    const byKey = new Map(Object.entries(all || {}));
    return new Map(data.tasks.map((t) => {
      const d = byKey.get(taskKey(t.id));
      return [t.id, sanitizeHtml(d && d.aciklama)];
    }));
  }

  async function exportJson() {
    let descriptions;
    try {
      descriptions = await fetchDescriptions();
    } catch (err) {
      alert(`Açıklamalar alınamadı, yedek oluşturulmadı: ${err.message}`);
      return;
    }
    data.meta.lastBackupAt = nowIso();
    save();
    const out = { ...data, tasks: data.tasks.map((t) => ({ ...t, aciklama: descriptions.get(t.id) || '' })) };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    download(`gorevler-yedek-${todayIso()}.json`, blob);
    renderBackupInfo();
    toast(attachmentsEnabled ? 'Yedek dosyası indirildi (ekler yedeğe dahil değildir).' : 'Yedek dosyası indirildi.');
  }

  // Signed-in import: descriptions from the backup are written to /details.
  async function importDescriptions(tasks) {
    let failed = 0;
    for (const t of tasks) {
      try {
        await cloud.store.put(`details/${taskKey(t.id)}`, { aciklama: t.aciklama, updatedAt: nowIso(), updatedBy: myUsername() || auth.email });
        const local = data.tasks.find((x) => x.id === t.id);
        if (local) applyChange(local, 'aciklamaVar', true);
      } catch (err) {
        failed += 1;
      }
    }
    save();
    if (failed) toast(`${failed} görevin açıklaması yüklenemedi.`);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        incoming = normalize(JSON.parse(reader.result));
      } catch (err) {
        alert(`Dosya içe aktarılamadı: ${err.message}`);
        return;
      }
      if (cloud) {
        if (!cloud.ready) { alert('Önce ortak veritabanı bağlantısının kurulmasını bekleyin.'); return; }
        const msg = `Yedekteki ${incoming.tasks.length} görev ortak listeye eklenecek (aynı görevler güncellenir, mevcut görevler silinmez). Devam edilsin mi?`;
        if (!confirm(msg)) return;
        const withDescriptions = auth ? incoming.tasks.filter((t) => t.aciklama) : [];
        mergeIncoming(incoming);
        save();
        if (withDescriptions.length) importDescriptions(withDescriptions);
        toast('Yedek ortak listeye yükleniyor…');
        return;
      }
      const msg = `Yedekte ${incoming.tasks.length} görev var. Mevcut ${data.tasks.length} görev ve liste ayarları bu yedekle DEĞİŞTİRİLECEK. Devam edilsin mi?`;
      if (!confirm(msg)) return;
      data = incoming;
      resetPinned();
      save();
      render();
      toast('Yedek yüklendi.');
    };
    reader.onerror = () => alert('Dosya okunamadı.');
    reader.readAsText(file, 'utf-8');
  }

  let sheetJsPromise;
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetJsPromise) {
      sheetJsPromise = new Promise((resolve, reject) => {
        const s = el('script', { src: SHEETJS_URL });
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => { sheetJsPromise = null; reject(new Error('Excel kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).')); };
        document.head.append(s);
      });
    }
    return sheetJsPromise;
  }

  function excelSerial(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  async function exportXlsx() {
    let XLSX;
    try {
      XLSX = await loadSheetJs();
    } catch (err) {
      alert(err.message);
      return;
    }
    let descriptions = new Map();
    if (richTasks) {
      try {
        descriptions = await fetchDescriptions();
      } catch (err) {
        if (!confirm(`Açıklamalar alınamadı (${err.message}). Excel açıklamasız oluşturulsun mu?`)) return;
      }
    }
    const headers = ['No', 'Alan', 'Görev', 'Sahip', 'Durum', 'Öncelik', 'Tamamlanma Tarihi', 'Tamamlandığı Zaman', 'Açıklama'];
    const sorted = [...data.tasks].sort((a, b) => {
      const ad = a.durum === DONE ? 1 : 0;
      const bd = b.durum === DONE ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const prevSort = ui.sort;
      ui.sort = { key: 'tamamlanmaTarihi', dir: 1 };
      const r = compareTasks(a, b);
      ui.sort = prevSort;
      return r;
    });
    const aoa = [headers, ...sorted.map((t) => [t.no || '', t.alan, t.gorev, t.sahip, t.durum, t.oncelik, '', t.completedAt ? formatDateTime(t.completedAt) : '', htmlToText(descriptions.get(t.id) || '')])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    sorted.forEach((t, i) => {
      if (!t.tamamlanmaTarihi) return;
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: 6 });
      ws[ref] = { t: 'n', v: excelSerial(t.tamamlanmaTarihi), z: 'dd.mm.yyyy' };
    });
    ws['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 60 }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(sorted.length, 1), c: headers.length - 1 } }) };

    const maxLen = Math.max(...LIST_KEYS.map((k) => data.lists[k].length));
    const listAoa = [['Alanlar', 'Sahip', 'Durum']];
    for (let i = 0; i < maxLen; i += 1) listAoa.push(LIST_KEYS.map((k) => data.lists[k][i] || ''));
    const wsLists = XLSX.utils.aoa_to_sheet(listAoa);
    wsLists['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Görevler');
    XLSX.utils.book_append_sheet(wb, wsLists, 'Listeler');
    XLSX.writeFile(wb, `gorevler-${todayIso()}.xlsx`);
  }

  // ---------- Cloud sync (Azure API / Firebase Realtime Database) ----------

  const taskValue = (t) => {
    const v = { id: t.id, gorev: t.gorev, alan: t.alan, sahip: t.sahip, durum: t.durum, tamamlanmaTarihi: t.tamamlanmaTarihi, createdAt: t.createdAt, updatedAt: t.updatedAt };
    if (t.completedAt) v.completedAt = t.completedAt;
    // The default priority is stored as a missing field, so records written before priorities
    // existed keep their signature and older clients/rules keep accepting default tasks.
    if (t.oncelik !== DEFAULT_PRIORITY) v.oncelik = t.oncelik;
    if (t.createdBy) v.createdBy = t.createdBy;
    if (t.no) v.no = t.no;
    if (t.aciklamaVar) v.aciklamaVar = true;
    if (t.ekSayisi) v.ekSayisi = t.ekSayisi;
    if (t.yorumSayisi) v.yorumSayisi = t.yorumSayisi;
    return v;
  };
  const taskSig = (t) => {
    const sig = [t.gorev, t.alan, t.sahip, t.durum, t.tamamlanmaTarihi, t.completedAt || ''];
    if (t.oncelik !== DEFAULT_PRIORITY) sig.push(t.oncelik);
    if (t.createdBy) sig.push(`by:${t.createdBy}`);
    if (t.no) sig.push(`no:${t.no}`);
    if (t.aciklamaVar) sig.push('desc');
    if (t.ekSayisi) sig.push(`files:${t.ekSayisi}`);
    if (t.yorumSayisi) sig.push(`comments:${t.yorumSayisi}`);
    return JSON.stringify(sig);
  };
  const listSig = (values) => values.join('\n');
  const taskPath = (id) => `tasks/${window.TaskCloud.encodeKey(id)}`;

  function taskFromServer(v) {
    const durum = str(v.durum);
    const tarih = str(v.tamamlanmaTarihi);
    return {
      id: str(v.id),
      gorev: str(v.gorev),
      alan: str(v.alan),
      sahip: str(v.sahip),
      durum: sameText(durum, DONE) ? DONE : durum,
      oncelik: normalizePriority(v.oncelik),
      tamamlanmaTarihi: isIsoDate(tarih) ? tarih : '',
      createdAt: str(v.createdAt) || nowIso(),
      updatedAt: str(v.updatedAt) || nowIso(),
      completedAt: str(v.completedAt) || null,
      createdBy: str(v.createdBy),
      no: normalizeNo(v.no),
      aciklama: '',
      aciklamaVar: v.aciklamaVar === true,
      ekSayisi: normalizeCount(v.ekSayisi),
      yorumSayisi: normalizeCount(v.yorumSayisi),
    };
  }

  const isEditing = () => {
    const a = document.activeElement;
    return !!(a && a.closest && ((a.closest('#task-body') && a.matches('input, select, textarea')) || a.closest('dialog, .filter-panel'))) || $('#task-dialog').open || $('#settings-dialog').open || $('#ts-dialog').open;
  };

  function renderWhenIdle() {
    if (isEditing()) {
      cloud.renderPending = true;
      return;
    }
    cloud.renderPending = false;
    render();
  }

  // cloud.remote holds the signature of each record as last seen on the server.
  // Server state wins unless this browser has an unsynced change for the same record.
  function mergeServer(server) {
    const before = JSON.stringify([data.lists, data.tasks]);
    const remote = { tasks: {}, lists: {} };
    const byId = new Map(data.tasks.map((t) => [t.id, t]));
    const merged = [];

    const lists = {};
    for (const key of LIST_KEYS) {
      const values = server.lists[key];
      if (!values) {
        lists[key] = data.lists[key];
        continue;
      }
      const clean = values.map(str).filter(Boolean);
      const known = cloud.remote.lists[key];
      remote.lists[key] = listSig(clean);
      const localPending = known !== undefined && listSig(data.lists[key]) !== known;
      lists[key] = localPending ? data.lists[key] : clean;
    }

    for (const v of server.tasks) {
      const s = taskFromServer(v);
      if (!s.id || remote.tasks[s.id] !== undefined) continue;
      const known = cloud.remote.tasks[s.id];
      const local = byId.get(s.id);
      remote.tasks[s.id] = taskSig(s);
      if (local && known !== undefined && taskSig(local) !== known) {
        // Keep the unsynced local edit, but a number given on the server always wins (it can't change).
        if (s.no && !local.no) local.no = s.no;
        merged.push(local);
      }
      else if (!local && known !== undefined) continue; // deleted here, delete pending
      else if (local) merged.push(Object.assign(local, s)); // keep object identity for open editors
      else merged.push(s);
    }
    for (const t of data.tasks) {
      if (remote.tasks[t.id] === undefined && cloud.remote.tasks[t.id] === undefined) merged.push(t); // created here, not yet pushed
    }

    const normalized = normalize({ lists, tasks: merged, meta: data.meta });
    // normalize() rebuilds task objects; reuse the originals so open editors stay bound.
    const originals = new Map(merged.map((t) => [t.id, t]));
    data.lists = normalized.lists;
    data.tasks = normalized.tasks.map((t) => Object.assign(originals.get(t.id) || t, t));
    cloud.remote = remote;
    return before !== JSON.stringify([data.lists, data.tasks]);
  }

  function buildOps() {
    const ops = [];
    for (const t of data.tasks) {
      const sig = taskSig(t);
      if (cloud.remote.tasks[t.id] !== sig) ops.push({ kind: 'tasks', id: t.id, sig, path: taskPath(t.id), value: taskValue(t) });
    }
    const ids = new Set(data.tasks.map((t) => t.id));
    for (const id of Object.keys(cloud.remote.tasks)) {
      if (ids.has(id)) continue;
      const op = { kind: 'tasks', id, path: taskPath(id), value: null };
      // A deleted task takes its description and attachments with it.
      if (auth) {
        const key = window.TaskCloud.encodeKey(id);
        op.also = { [`details/${key}`]: null, [`attachments/${key}`]: null, [`files/${key}`]: null };
        if (commentsEnabled) Object.assign(op.also, { [`comments/${key}`]: null, [`commentMails/${key}`]: null });
      }
      ops.push(op);
    }
    for (const key of LIST_KEYS) {
      const sig = listSig(data.lists[key]);
      if (cloud.remote.lists[key] !== sig) ops.push({ kind: 'lists', id: key, sig, path: `lists/${key}`, value: sig });
    }
    return ops;
  }

  async function pushOps(ops) {
    const results = await cloud.store.write(ops.map(({ path, value, also }) => ({ path, value, also })));
    let rejected = 0;
    ops.forEach((op, i) => {
      const store = cloud.remote[op.kind];
      if (results[i].ok) {
        if (op.value === null) delete store[op.id];
        else store[op.id] = op.sig;
      } else {
        // Rejected by the database rules (e.g. a teammate completed a task that was deleted here):
        // forget the snapshot so the next pull restores the server copy.
        delete store[op.id];
        rejected += 1;
      }
    });
    persistCloudCache();
    if (rejected) {
      toast(`${rejected} değişiklik veritabanı kurallarınca reddedildi; sunucudaki hâli geri yüklendi.`);
      await runPull();
    }
  }

  function offerMigration() {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    let local;
    try { local = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch (e) { return; }
    const ids = new Set(data.tasks.map((t) => t.id));
    const fresh = local.tasks.filter((t) => !ids.has(t.id));
    if (fresh.length && confirm(`Bu tarayıcıda ortak listeye aktarılmamış ${fresh.length} görev var. Ortak listeye yüklensin mi?\n\n(İptal ederseniz görevler bu tarayıcıda kalır, daha sonra Yedek Al / Yedekten Yükle ile aktarabilirsiniz.)`)) {
      mergeIncoming(local);
      if (auth) {
        const withDescriptions = fresh.filter((t) => t.aciklama);
        if (withDescriptions.length) importDescriptions(withDescriptions);
      }
      toast(`${fresh.length} görev ortak listeye yükleniyor…`);
    }
    localStorage.setItem(MIGRATED_KEY, nowIso());
  }

  // Adds tasks/list values from another data set without deleting anything.
  function mergeIncoming(incoming) {
    for (const key of LIST_KEYS) {
      for (const v of incoming.lists[key]) {
        if (data.lists[key].some((x) => sameText(x, v))) continue;
        if (key === 'durum') data.lists.durum.splice(data.lists.durum.length - 1, 0, v);
        else data.lists[key].push(v);
      }
    }
    for (const t of incoming.tasks) {
      // Numbers, attachment counters and descriptions belong to the shared database: keep the
      // server's values for known tasks; new tasks get a fresh number.
      const existing = data.tasks.find((x) => x.id === t.id);
      const copy = { ...t, aciklama: '' };
      if (existing) {
        Object.assign(copy, { no: existing.no, ekSayisi: existing.ekSayisi, yorumSayisi: existing.yorumSayisi, aciklamaVar: existing.aciklamaVar });
        Object.assign(existing, copy);
      } else {
        data.tasks.push(Object.assign(copy, { no: null, ekSayisi: 0, yorumSayisi: 0, aciklamaVar: false }));
      }
    }
    applyDirectory();
    resetPinned();
    persistCloudCache();
    render();
  }

  function setCloudStatus(status, error = null) {
    cloud.status = status;
    cloud.error = error;
    renderCloudStatus();
    if (ui.loadingShown && !isInitialLoading()) renderView();
  }

  function renderCloudStatus() {
    const el2 = $('#cloud-status');
    const time = cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    const states = {
      loading: ['Yükleniyor…', 'busy'],
      saving: ['Kaydediliyor…', 'busy'],
      saved: [`Kaydedildi${time ? ` · ${time}` : ''}`, 'ok'],
      offline: ['Çevrimdışı – bağlantı gelince kaydedilecek', 'warn'],
      error: ['Kaydedilemedi – tekrar denenecek', 'warn'],
    };
    const [text, cls] = states[cloud.status];
    el2.textContent = text;
    el2.className = `cloud-status cloud-${cls}`;
    el2.title = cloud.error || 'Veriler ortak veritabanına otomatik kaydedilir.';
    renderBackupInfo();
  }

  function scheduleSync() {
    if (!cloud.ready) return;
    clearTimeout(cloud.timer);
    setCloudStatus('saving');
    cloud.timer = setTimeout(() => sync(), 500);
  }

  function sync({ pull = false } = {}) {
    cloud.queue = cloud.queue.then(() => runSync(pull));
    return cloud.queue;
  }

  async function runPull() {
    const server = await cloud.store.fetchAll();
    if (auth) {
      setDirectory(server.users);
      if (!currentUser) throw Object.assign(new Error('Bu hesabın uygulamaya erişimi yok.'), { code: 'noaccess' });
    }
    const firstLoad = !cloud.ready;
    let changed = mergeServer(server);
    if (applyDirectory()) changed = true;
    cloud.ready = true;
    persistCloudCache();
    if (auth) renderUser();
    if (firstLoad) { render(); offerMigration(); openDeepLinkedTask(); } else if (changed) renderWhenIdle();
  }

  async function runSync(pull) {
    if (!cloud.store || (!pull && !cloud.ready)) return;
    clearTimeout(cloud.timer);
    try {
      if (pull) await runPull();
      await claimNumbers();
      const ops = buildOps();
      if (ops.length) {
        setCloudStatus('saving');
        await pushOps(ops);
      }
      cloud.lastSyncAt = nowIso();
      persistCloudCache();
      setCloudStatus('saved');
      sendAssignmentMails();
      sendCommentMails();
    } catch (err) {
      console.warn('Eşitleme hatası', err);
      if (auth && (err.code === 'noaccess' || err.code === 'denied')) {
        // Signed in, but not on the team list (or removed from it).
        endSession('Bu hesabın uygulamaya erişimi yok. Yöneticinizle görüşün.', { clearCache: true });
        return;
      }
      if (auth && err.code === 'auth' && !auth.session) return; // session ended – reloading to the login screen
      const offline = !navigator.onLine || err.code === 'network';
      setCloudStatus(offline ? 'offline' : 'error', err.message);
      if (!cloud.ready) {
        $('#cloud-error').hidden = false;
        $('#cloud-error').textContent = `Ortak veritabanına bağlanılamadı: ${err.message}`;
      }
      return;
    }
    $('#cloud-error').hidden = true;
  }

  const hasPendingChanges = () => !!(cloud && cloud.ready && (cloud.status === 'saving' || buildOps().length));

  // Task numbers (signed-in mode). A number is taken by creating /taskNumbers/{no}, which the
  // rules allow only once, in the same atomic update that writes the task. If another browser
  // took the number first the whole update is rejected and we retry with fresh data, so two
  // tasks never share a number. Existing tasks are numbered by creation date.
  let numbersRetryAt = 0;
  let numbersWarned = false;

  async function claimNumbers() {
    if (!auth || !cloud.ready || Date.now() < numbersRetryAt) return;
    try {
      if (await tryClaimNumbers()) return;
    } catch (err) {
      // A rejected read/write here means the rules don't allow numbering (yet); it must not
      // be mistaken for losing access to the app.
      if (err.code !== 'denied') throw err;
    }
    numbersRetryAt = Date.now() + 60000;
    if (!numbersWarned) {
      numbersWarned = true;
      toast('Görev numaraları atanamadı; veritabanı kurallarının güncel olduğundan emin olun. Daha sonra tekrar denenecek.');
    }
  }

  // Returns true when every task has a number.
  async function tryClaimNumbers() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const pending = data.tasks.filter((t) => !t.no).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      if (!pending.length) return true;
      const taken = await cloud.store.get('taskNumbers', 'shallow=true');
      let next = Math.max(0, ...Object.keys(taken || {}).map(Number).filter(Number.isFinite), ...data.tasks.map((t) => t.no || 0)) + 1;
      const patch = {};
      const assigned = pending.map((t) => {
        const no = next++;
        patch[`taskNumbers/${no}`] = t.id;
        patch[taskPath(t.id)] = taskValue({ ...t, no });
        return [t, no];
      });
      try {
        await cloud.store.patch(patch);
      } catch (err) {
        if (err.code !== 'denied') throw err;
        await runPull(); // someone else took a number (or numbered these tasks) – retry with fresh data
        continue;
      }
      for (const [t, no] of assigned) {
        t.no = no;
        cloud.remote.tasks[t.id] = taskSig(t);
      }
      persistCloudCache();
      renderWhenIdle();
      return true;
    }
    return false; // still rejected: most likely the database rules haven't been published yet
  }

  // ---------- Assignment mails ----------
  // When the signed-in user makes a teammate the Sahip of a task, the notify function mails them once
  // the task is saved to the shared database. Marks live in localStorage, so offline edits and reloads
  // still notify; the function itself skips self-assignments and assignments it has already mailed.

  // Retry delays for temporary failures (e.g. the mail service's hourly limit), in minutes.
  const NOTIFY_RETRY_MINUTES = [1, 5, 10, 15, 15, 15, 15, 15];

  function pendingNotify() {
    try {
      const p = JSON.parse(localStorage.getItem(NOTIFY_KEY));
      return p && typeof p === 'object' ? p : {};
    } catch (e) {
      return {};
    }
  }

  function setPendingNotify(p) {
    if (Object.keys(p).length) localStorage.setItem(NOTIFY_KEY, JSON.stringify(p));
    else localStorage.removeItem(NOTIFY_KEY);
  }

  function markAssignment(task, previousSahip) {
    if (!notifyUrl || !task.sahip || task.sahip === previousSahip) return;
    const p = pendingNotify();
    p[task.id] = { n: 0, after: 0 };
    setPendingNotify(p);
  }

  async function postJson(url, body, force = false) {
    const token = await auth.getToken(force);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && !force) return postJson(url, body, true);
    return res;
  }

  const postNotify = (id) => postJson(notifyUrl, { task: id });

  async function sendAssignmentMails() {
    if (!notifyUrl || !cloud || cloud.notifying) return;
    const p = pendingNotify();
    const ready = [];
    const now = Date.now();
    for (const [id, mark] of Object.entries(p)) {
      const t = data.tasks.find((x) => x.id === id);
      if (!t || !t.sahip || (currentUser && t.sahip === currentUser.kullaniciAdi)) { delete p[id]; continue; }
      if (cloud.remote.tasks[id] !== taskSig(t) || !t.gorev.trim()) continue; // not saved yet / no title yet
      if (mark && mark.after > now) continue; // waiting before a retry
      ready.push([id, (mark && Number(mark.n)) || 0]);
      delete p[id];
    }
    setPendingNotify(p);
    if (!ready.length) return;
    cloud.notifying = true;
    try {
      for (const [id, attempts] of ready) {
        let retry = false;
        try {
          const res = await postNotify(id);
          retry = res.status >= 500;
          if (!res.ok) console.warn('Atama maili gönderilemedi', res.status, await res.text());
        } catch (err) {
          retry = true;
          console.warn('Atama maili gönderilemedi', err);
        }
        if (retry && attempts < NOTIFY_RETRY_MINUTES.length) {
          const again = pendingNotify();
          if (!(id in again)) again[id] = { n: attempts + 1, after: Date.now() + NOTIFY_RETRY_MINUTES[attempts] * 60000 };
          setPendingNotify(again);
        }
      }
    } finally {
      cloud.notifying = false;
    }
  }

  // ---------- Comment mails ----------
  // After a comment is saved (or edited) the comment-notify function mails tagged people and the
  // task owner. Requests wait in localStorage, so a failed or interrupted request is retried; the
  // function records who has been mailed, so repeats never send a mail twice.

  function pendingCommentNotify() {
    try {
      const p = JSON.parse(localStorage.getItem(COMMENT_NOTIFY_KEY));
      return Array.isArray(p) ? p.filter((x) => x && typeof x.task === 'string' && typeof x.comment === 'string') : [];
    } catch (e) {
      return [];
    }
  }

  function setPendingCommentNotify(list) {
    if (list.length) localStorage.setItem(COMMENT_NOTIFY_KEY, JSON.stringify(list));
    else localStorage.removeItem(COMMENT_NOTIFY_KEY);
  }

  function queueCommentNotify(task, comment) {
    if (!commentNotifyUrl) return;
    const p = pendingCommentNotify().filter((x) => !(x.task === task && x.comment === comment));
    p.push({ task, comment, n: 0, after: 0 });
    setPendingCommentNotify(p);
    sendCommentMails();
  }

  async function sendCommentMails() {
    if (!commentNotifyUrl || !cloud || cloud.commentNotifying) return;
    const now = Date.now();
    const all = pendingCommentNotify();
    const ready = all.filter((x) => !(x.after > now));
    if (!ready.length) return;
    setPendingCommentNotify(all.filter((x) => x.after > now));
    cloud.commentNotifying = true;
    try {
      for (const x of ready) {
        let retry = false;
        try {
          const res = await postJson(commentNotifyUrl, { task: x.task, comment: x.comment });
          retry = res.status >= 500;
          if (!res.ok) console.warn('Yorum maili gönderilemedi', res.status, await res.text());
        } catch (err) {
          retry = true;
          console.warn('Yorum maili gönderilemedi', err);
        }
        const n = Number(x.n) || 0;
        if (retry && n < NOTIFY_RETRY_MINUTES.length) {
          const again = pendingCommentNotify();
          if (!again.some((y) => y.task === x.task && y.comment === x.comment)) {
            again.push({ task: x.task, comment: x.comment, n: n + 1, after: Date.now() + NOTIFY_RETRY_MINUTES[n] * 60000 });
            setPendingCommentNotify(again);
          }
        }
      }
    } finally {
      cloud.commentNotifying = false;
    }
    // Comments posted while the requests above were running.
    if (pendingCommentNotify().some((x) => !(x.after > Date.now()))) sendCommentMails();
  }

  // ---------- Deep link (?gorev=No) ----------

  function openDeepLinkedTask() {
    const params = new URLSearchParams(location.search);
    if (!params.has('gorev')) return;
    const raw = params.get('gorev');
    const commentId = params.get('yorum');
    params.delete('gorev');
    params.delete('yorum');
    const qs = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    const no = /^[1-9][0-9]{0,6}$/.test(raw) ? Number(raw) : null;
    const task = no ? data.tasks.find((t) => t.no === no) : null;
    comm.focusId = commentId && /^[\w-]{1,64}$/.test(commentId) ? commentId : null;
    if (task) openTaskDialog(task);
    else toast(`#${raw} numaralı görev bulunamadı.`);
  }

  async function startCloud() {
    document.body.classList.add('cloud-mode');
    $('#cloud-bar').hidden = false;
    $('#storage-note').textContent = 'Veriler ekibin ortak bulut veritabanında saklanır ve her değişiklik otomatik kaydedilir.';
    try {
      cloud.store = window.TaskCloud.createStore(auth ? { ...config, getToken: (force) => auth.getToken(force) } : config);
    } catch (err) {
      setCloudStatus('error', err.message);
      $('#cloud-error').hidden = false;
      $('#cloud-error').textContent = err.message;
      return;
    }
    setCloudStatus('loading');
    await sync({ pull: true });
    setInterval(() => { if (document.visibilityState === 'visible') sync({ pull: true }); }, POLL_MS);
    window.addEventListener('focus', () => sync({ pull: true }));
    window.addEventListener('online', () => sync({ pull: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync({ pull: true }); });
    document.addEventListener('focusout', () => setTimeout(() => { if (cloud.renderPending) renderWhenIdle(); }, 0));
    ['task-dialog', 'settings-dialog'].forEach((id) => $(`#${id}`).addEventListener('close', () => { if (cloud.renderPending) renderWhenIdle(); }));
    window.addEventListener('beforeunload', (e) => {
      if (!leaving && hasPendingChanges()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- Sign-in ----------

  let leaving = false;

  // Signs out locally and reloads to the login screen (optionally with a message).
  function endSession(message, { clearCache = false } = {}) {
    if (leaving) return;
    leaving = true;
    auth.signOut();
    localStorage.removeItem(NOTIFY_KEY); // marks belong to this user's session
    if (clearCache) localStorage.removeItem(CLOUD_CACHE_KEY);
    if (message) sessionStorage.setItem(LOGIN_MESSAGE_KEY, message);
    location.reload();
  }

  function logout() {
    if (hasPendingChanges() && !confirm('Henüz kaydedilmemiş değişiklikler var. Çıkış yaparsanız bu değişiklikler kaybolur. Devam edilsin mi?')) return;
    endSession(null, { clearCache: true });
  }

  async function changePassword() {
    try {
      await auth.sendPasswordReset(auth.email);
      toast(`Şifre değiştirme bağlantısı ${auth.email} adresine gönderildi.`);
    } catch (err) {
      alert(`E-posta gönderilemedi: ${err.message}`);
    }
  }

  function renderUser() {
    const menu = $('#user-menu');
    menu.hidden = !auth || !auth.session;
    if (menu.hidden) return;
    const name = currentUser ? fullName(currentUser) : auth.email;
    const avatar = $('#user-avatar');
    setTone(avatar, toneFor('sahip', currentUser ? currentUser.kullaniciAdi : auth.email));
    avatar.textContent = initials(name);
    $('#user-name').textContent = name;
    $('#user-email').textContent = auth.email;
    $('#user-menu-name').textContent = name;
    $('#user-menu-email').textContent = auth.email;
    $('#btn-user-menu').title = `${name} (${auth.email})`;
    $('#btn-my-tasks').hidden = !currentUser;
  }

  function showLoginMessage(text, kind = 'error') {
    const box = $('#login-message');
    box.hidden = !text;
    box.textContent = text || '';
    box.className = `login-message is-${kind}`;
  }

  function setLoginBusy(busy) {
    const form = $('#login-form');
    const submit = form.querySelector('.login-submit');
    submit.disabled = busy;
    submit.querySelector('.spinner').hidden = !busy;
    submit.querySelector('.login-submit-label').textContent = busy ? 'Giriş yapılıyor…' : 'Giriş yap';
    $('#btn-forgot').disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  }

  const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function showLogin() {
    document.body.classList.add('auth-locked');
    $('#login-screen').hidden = false;
    const message = sessionStorage.getItem(LOGIN_MESSAGE_KEY);
    sessionStorage.removeItem(LOGIN_MESSAGE_KEY);
    showLoginMessage(message);
    const form = $('#login-form');
    const field = (name) => form.elements[name];

    const toggle = form.querySelector('.password-toggle');
    toggle.addEventListener('click', () => {
      const show = field('password').type === 'password';
      field('password').type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      const label = show ? 'Şifreyi gizle' : 'Şifreyi göster';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggle.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
    });

    $('#btn-forgot').addEventListener('click', async () => {
      const email = field('email').value.trim();
      if (!looksLikeEmail(email)) {
        showLoginMessage('Şifre sıfırlama bağlantısı için önce e-posta adresinizi girin.');
        field('email').focus();
        return;
      }
      setLoginBusy(true);
      try {
        await auth.sendPasswordReset(email);
        showLoginMessage(`Hesap kayıtlıysa ${email} adresine şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.`, 'info');
      } catch (err) {
        showLoginMessage(err.message);
      } finally {
        setLoginBusy(false);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = field('email').value.trim();
      const password = field('password').value;
      field('email').setAttribute('aria-invalid', String(!looksLikeEmail(email)));
      field('password').setAttribute('aria-invalid', String(!password));
      if (!looksLikeEmail(email)) { showLoginMessage('Geçerli bir e-posta adresi girin.'); field('email').focus(); return; }
      if (!password) { showLoginMessage('Şifrenizi girin.'); field('password').focus(); return; }
      setLoginBusy(true);
      showLoginMessage('');
      try {
        await auth.signIn(email, password);
      } catch (err) {
        setLoginBusy(false);
        showLoginMessage(err.message);
        field('password').select();
        return;
      }
      await startApp();
      if (leaving) return;
      document.body.classList.remove('auth-locked');
      $('#login-screen').hidden = true;
      field('password').value = '';
      setLoginBusy(false);
    });

    field(field('email').value ? 'password' : 'email').focus();
  }

  // ?sifre=<token>: the link from the password e-mail (Azure sign-in).
  function showPasswordReset(token) {
    const params = new URLSearchParams(location.search);
    params.delete('sifre');
    const qs = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    document.body.classList.add('auth-locked');
    $('#login-screen').hidden = false;
    $('#login-form').hidden = true;
    const form = $('#reset-form');
    form.hidden = false;
    const box = $('#reset-message');
    const show = (text, kind = 'error') => { box.hidden = !text; box.textContent = text || ''; box.className = `login-message is-${kind}`; };
    const busy = (on) => {
      const submit = form.querySelector('.login-submit');
      submit.disabled = on;
      submit.querySelector('.spinner').hidden = !on;
      submit.querySelector('.login-submit-label').textContent = on ? 'Kaydediliyor…' : 'Şifreyi kaydet';
    };
    $('#btn-reset-cancel').addEventListener('click', () => location.reload());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = form.elements.password.value;
      const pw2 = form.elements.password2.value;
      if (pw.length < 6) { show('Şifre en az 6 karakter olmalı.'); form.elements.password.focus(); return; }
      if (pw !== pw2) { show('Şifreler aynı değil.'); form.elements.password2.focus(); return; }
      busy(true);
      show('');
      try {
        await auth.confirmPasswordReset(token, pw);
      } catch (err) {
        busy(false);
        show(err.message);
        return;
      }
      leaving = true;
      location.reload();
    });
    form.elements.password.focus();
  }

  async function startApp() {
    if (auth) {
      auth.onSessionEnded((reason) => endSession(reason));
      applyDirectory();
      renderUser();
    }
    render();
    if (cloud) await startCloud();
    else openDeepLinkedTask();
  }

  // ---------- Event wiring ----------

  function setupMenu(menuSel, buttonSel, listSel) {
    const button = $(buttonSel);
    const list = $(listSel);
    const items = () => [...list.querySelectorAll('[role="menuitem"]')];
    const isOpen = () => !list.hidden;

    function open(focusIndex = 0) {
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const all = items();
      all[(focusIndex + all.length) % all.length].focus();
    }
    function close(returnFocus = false) {
      if (!isOpen()) return;
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (returnFocus) button.focus();
    }

    button.addEventListener('click', () => (isOpen() ? close() : open()));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); open(0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); open(-1); }
    });
    list.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) close(true); });
    list.addEventListener('keydown', (e) => {
      const all = items();
      const idx = all.indexOf(document.activeElement);
      const moves = { ArrowDown: idx + 1, ArrowUp: idx - 1, Home: 0, End: all.length - 1 };
      if (e.key in moves) {
        e.preventDefault();
        all[(moves[e.key] + all.length) % all.length].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Tab') {
        close();
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest(menuSel)) close(); });
  }

  function setupFilterMenus() {
    const controls = [...document.querySelectorAll('.filter-control[data-filter]')];
    const parts = (control) => ({ trigger: control.querySelector('.filter-trigger'), panel: control.querySelector('.filter-panel') });
    const boxes = (panel) => [...panel.querySelectorAll('input[type=checkbox]')];

    function close(control, returnFocus = false) {
      const { trigger, panel } = parts(control);
      if (panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    }
    function open(control, focusIndex = 0) {
      controls.forEach((c) => c !== control && close(c));
      const { trigger, panel } = parts(control);
      panel.hidden = false;
      panel.classList.remove('align-right');
      if (panel.getBoundingClientRect().right > document.documentElement.clientWidth - 8) panel.classList.add('align-right');
      trigger.setAttribute('aria-expanded', 'true');
      const all = boxes(panel);
      all[(focusIndex + all.length) % all.length]?.focus();
    }

    for (const control of controls) {
      const key = control.dataset.filter;
      const { trigger, panel } = parts(control);
      trigger.addEventListener('click', () => (panel.hidden ? open(control) : close(control)));
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); open(control, 0); }
        if (e.key === 'ArrowUp') { e.preventDefault(); open(control, -1); }
      });
      panel.addEventListener('change', (e) => {
        const box = e.target;
        if (box.dataset.all) {
          ui.filters[key] = [];
        } else {
          const picked = new Set(boxes(panel).filter((b) => b.checked && !b.dataset.all).map((b) => b.value));
          ui.filters[key] = data.lists[key].filter((v) => picked.has(v));
        }
        syncFilterControl(key);
        resetPinned();
        renderView();
        renderSummary();
        updateFilterUi();
      });
      panel.addEventListener('keydown', (e) => {
        const all = boxes(panel);
        const idx = all.indexOf(document.activeElement);
        const moves = { ArrowDown: idx + 1, ArrowUp: idx - 1, Home: 0, End: all.length - 1 };
        if (e.key in moves) {
          e.preventDefault();
          all[(moves[e.key] + all.length) % all.length].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(control, true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          document.activeElement.click();
        }
      });
      control.addEventListener('focusout', (e) => { if (!control.contains(e.relatedTarget)) close(control); });
    }
    document.addEventListener('click', (e) => {
      controls.forEach((c) => { if (!c.contains(e.target)) close(c); });
    });
  }

  function setupHeader() {
    const header = $('#app-header');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // Sticky table headers sit right below the page header.
    const setHeight = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    if (window.ResizeObserver) new ResizeObserver(setHeight).observe(header);
    setHeight();
  }

  // ---------- Sidebar ----------

  const SIDEBAR_KEY = 'taskManager.sidebar';
  const drawerQuery = window.matchMedia('(max-width: 768px)');
  const isDrawer = () => drawerQuery.matches;

  function setSidebarCollapsed(collapsed, remember = true) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const btn = $('#btn-sidebar-collapse');
    btn.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Menüyü genişlet' : 'Menüyü daralt';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (remember) localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  }

  function openDrawer() {
    document.body.classList.add('sidebar-open');
    $('#sidebar-backdrop').hidden = false;
    $('#btn-nav').setAttribute('aria-expanded', 'true');
    ($('#sidebar .nav-item.active') || $('#sidebar .nav-item')).focus();
  }

  function closeDrawer(returnFocus = false) {
    if (!document.body.classList.contains('sidebar-open')) return;
    document.body.classList.remove('sidebar-open');
    $('#sidebar-backdrop').hidden = true;
    $('#btn-nav').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('#btn-nav').focus();
  }

  function setupSidebar() {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    // Without a saved choice, laptop-sized screens start with the compact rail so the table fits.
    setSidebarCollapsed(stored ? stored === 'collapsed' : window.innerWidth < 1400, false);
    $('#btn-sidebar-collapse').addEventListener('click', () => setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed')));
    $('#btn-nav').addEventListener('click', openDrawer);
    $('#btn-sidebar-close').addEventListener('click', () => closeDrawer(true));
    $('#sidebar-backdrop').addEventListener('click', () => closeDrawer(true));
    const sidebar = $('#sidebar');
    sidebar.addEventListener('keydown', (e) => {
      if (!isDrawer() || !document.body.classList.contains('sidebar-open')) return;
      if (e.key === 'Escape' && !sidebar.querySelector('.menu-list:not([hidden])')) {
        e.preventDefault();
        closeDrawer(true);
      } else if (e.key === 'Tab') {
        // Keep focus inside the open drawer.
        const items = [...sidebar.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // Choosing a page, a menu action or Ayarlar closes the drawer.
    sidebar.addEventListener('click', (e) => {
      if (isDrawer() && e.target.closest('.view-btn, .menu-item, #btn-settings')) closeDrawer();
    });
    drawerQuery.addEventListener('change', () => closeDrawer());
  }

  const PAGE_TITLES = {
    list: ['Görevler', 'Liste'],
    board: ['Görevler', 'Board'],
    report: ['Görevler', 'Rapor'],
    'timesheet:entries': ['Timesheet', 'Girişler'],
    'timesheet:report': ['Timesheet', 'Rapor'],
  };

  function renderNav() {
    const tab = timesheet ? timesheet.tab() : 'entries';
    const key = ui.view === 'timesheet' ? `timesheet:${tab}` : ui.view;
    document.querySelectorAll('.view-btn').forEach((btn) => {
      const active = btn.dataset.view === ui.view && (!btn.dataset.tab || btn.dataset.tab === tab);
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    const [section, title] = PAGE_TITLES[key];
    $('#page-section').textContent = section;
    $('#page-section').lang = section === 'Timesheet' ? 'en' : '';
    $('#page-title').textContent = title;
    document.title = `${title} · ${section} – Ekip Görev Takibi`;
    $('#btn-add').hidden = ui.view === 'timesheet' || ui.view === 'report';
    $('#ts-add').hidden = ui.view !== 'timesheet';
  }

  function bindEvents() {
    $('#btn-add').addEventListener('click', addTask);
    setupSidebar();

    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (ui.view === btn.dataset.view && (!tab || !timesheet || timesheet.tab() === tab)) return;
        ui.view = btn.dataset.view;
        localStorage.setItem(VIEW_KEY, ui.view);
        if (tab && timesheet) {
          timesheet.setTab(tab);
          localStorage.setItem(TS_TAB_KEY, tab);
        }
        resetPinned();
        renderView();
        renderSummary();
        updateFilterUi();
      });
    });

    $('#task-form').addEventListener('submit', saveTaskDialog);
    const gorevInput = $('#task-form').elements.gorev;
    gorevInput.addEventListener('input', updateTaskFormState);
    $('#task-form').elements.alan.addEventListener('change', (e) => { if (e.target.value) showAlanError(false); });
    gorevInput.addEventListener('blur', () => { if ($('#task-dialog').open && !gorevInput.value.trim()) showGorevError(true); });
    document.querySelectorAll('#task-dialog [data-close]').forEach((btn) => {
      btn.addEventListener('click', closeTaskDialog);
    });
    $('#task-dialog').addEventListener('cancel', (e) => { e.preventDefault(); closeTaskDialog(); });
    $('#task-dialog').addEventListener('close', () => { desc.token += 1; attach.token += 1; attach.taskId = null; comm.token += 1; comm.taskId = null; comm.editing = null; closeMentions(); });
    setupEditor();
    setupImageDialog();
    setupAttachments();
    setupComments();
    if (!richTasks) document.body.classList.add('no-task-extras');
    $('#task-delete').addEventListener('click', async () => {
      if (editingTask && await deleteTask(editingTask)) $('#task-dialog').close();
    });
    $('#btn-task-time').addEventListener('click', () => {
      if (timesheet && editingTask) timesheet.openEntry({ taskId: editingTask.id });
    });
    if (timesheetEnabled) {
      $('#nav-group-timesheet').hidden = false;
      timesheet = window.TaskTimesheet.create({
        $, el, icon, iconButton, toast, uid, buildAvatar, toneFor, DONE, loadSheetJs, download,
        store: () => (cloud ? cloud.store : null),
        tasks: () => data.tasks,
        lists: () => data.lists,
        directory: () => directory,
        me: () => myUsername(),
        fullNameOf: (username) => (username ? displayName(username) : '—'),
        openTask: (task) => openTaskDialog(task),
        isVisible: () => ui.view === 'timesheet' && !document.body.classList.contains('auth-locked'),
        onEntriesChanged: (taskId) => {
          if ($('#task-dialog').open && editingTask && editingTask.id === taskId) loadTaskTime(editingTask);
        },
      });
      timesheet.setTab(localStorage.getItem(TS_TAB_KEY));
    }
    report = window.TaskReport.create({
      $, el, icon, buildAvatar, toneFor, DONE, loadSheetJs,
      tasks: () => data.tasks,
      lists: () => data.lists,
      fullNameOf: (name) => (name ? displayName(name) : '—'),
      isLoading: () => isInitialLoading(),
    });

    $('#search').addEventListener('input', (e) => {
      ui.search = e.target.value;
      resetPinned();
      renderView();
      renderSummary();
      updateFilterUi();
    });

    setupFilterMenus();

    $('#show-completed').addEventListener('change', (e) => {
      ui.showCompleted = e.target.checked;
      resetPinned();
      renderView();
      renderSummary();
      updateFilterUi();
    });

    $('#btn-clear-filters').addEventListener('click', () => {
      ui.search = '';
      ui.filters = emptyFilters();
      ui.due = null;
      ui.showCompleted = false;
      resetPinned();
      render();
      $('#search').focus();
    });

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (ui.sort.key === key) ui.sort.dir *= -1;
        else ui.sort = { key, dir: 1 };
        resetPinned();
        renderView();
        renderSortIndicators();
      });
    });

    $('#btn-settings').addEventListener('click', () => {
      renderSettings();
      $('#settings-dialog').showModal();
    });

    $('#btn-export-json').addEventListener('click', exportJson);
    $('#btn-export-xlsx').addEventListener('click', exportXlsx);
    $('#btn-import-json').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJson(file);
      e.target.value = '';
    });
    setupMenu('#data-menu', '#btn-data-menu', '#data-menu-list');
    setupMenu('#user-menu', '#btn-user-menu', '#user-menu-list');
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-change-password').addEventListener('click', changePassword);
    $('#btn-my-tasks').addEventListener('click', toggleMyTasks);
    setupHeader();

    // Keep multiple open tabs in sync.
    window.addEventListener('storage', (e) => {
      if (auth && e.key === auth.sessionKey) {
        // Signed in or out in another tab (token refreshes keep the same user).
        let email = '';
        try { email = e.newValue ? JSON.parse(e.newValue).email : ''; } catch (err) { /* ignore */ }
        if (email !== auth.email && !leaving) { leaving = true; location.reload(); }
        return;
      }
      if (cloud && e.key === CLOUD_CACHE_KEY && e.newValue) {
        const cache = loadCloudCache();
        data = cache.data;
        Object.assign(cloud, { remote: cache.remote, lastSyncAt: cache.lastSyncAt });
        if (auth) { setDirectory(cache.users); applyDirectory(); renderUser(); }
        renderWhenIdle();
        renderCloudStatus();
        return;
      }
      if (!cloud && e.key === STORAGE_KEY) {
        data = load();
        render();
        if ($('#settings-dialog').open) renderSettings();
        if ($('#task-dialog').open) $('#task-dialog').close();
      }
    });
  }

  bindEvents();
  const resetToken = auth && auth.supportsReset ? new URLSearchParams(location.search).get('sifre') : null;
  if (resetToken) showPasswordReset(resetToken);
  else if (auth && !auth.session) showLogin();
  else startApp();
})();
