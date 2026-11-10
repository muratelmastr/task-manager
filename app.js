(() => {
  'use strict';

  const STORAGE_KEY = 'taskManager.v1';
  const CLOUD_CACHE_KEY = 'taskManager.cloud.v2';
  const MIGRATED_KEY = 'taskManager.v1.migratedAt';
  const VIEW_KEY = 'taskManager.view';
  const POLL_MS = 30000;
  const config = window.TASK_MANAGER_CONFIG || {};
  const cloudEnabled = !!(config.databaseUrl && window.TaskCloud);
  const DONE = 'Tamamlandı';
  const RED_DAYS = 3;
  const YELLOW_DAYS = 7;
  const BACKUP_WARN_DAYS = 7;
  const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

  const LIST_LABELS = { alan: 'Alan', sahip: 'Sahip', durum: 'Durum' };
  const LIST_KEYS = Object.keys(LIST_LABELS);

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
      else if (v !== undefined && v !== null && v !== false) node[k] = v;
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
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
        tamamlanmaTarihi: isIsoDate(t.tamamlanmaTarihi) ? t.tamamlanmaTarihi : '',
        createdAt: created,
        updatedAt: str(t.updatedAt) || created,
        completedAt: durum === DONE ? (str(t.completedAt) || null) : null,
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
    return { version: 1, lists, tasks, meta: { lastBackupAt: str(meta.lastBackupAt) || null } };
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
        return { data: normalize(raw.data), remote, lastSyncAt: raw.lastSyncAt || null };
      }
    } catch (err) {
      console.warn('Önbellek okunamadı', err);
    }
    return { data: seedData(), remote: { tasks: {}, lists: {} }, lastSyncAt: null };
  }

  function persistCloudCache() {
    try {
      localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify({ data, remote: cloud.remote, lastSyncAt: cloud.lastSyncAt }));
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
  if (cloud) {
    const cache = loadCloudCache();
    data = cache.data;
    Object.assign(cloud, { remote: cache.remote, lastSyncAt: cache.lastSyncAt });
  } else {
    data = load();
    save();
  }

  const ui = {
    view: localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list',
    shownCount: 0,
    showCompleted: false,
    search: '',
    filters: { alan: '', sahip: '', durum: '' },
    sort: { key: 'tamamlanmaTarihi', dir: 1 },
    pinned: new Set(), // newly added rows stay visible and on top until filters/sorting change
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

  function matchesFilters(t, { includeDone = false } = {}) {
    const showDone = includeDone || ui.showCompleted || ui.filters.durum === DONE;
    if (t.durum === DONE && !showDone) return false;
    for (const key of LIST_KEYS) {
      if (ui.filters[key] && t[key] !== ui.filters[key]) return false;
    }
    const q = ui.search.trim().toLocaleLowerCase('tr');
    if (q) {
      const hay = [t.alan, t.gorev, t.sahip, t.durum].join(' ').toLocaleLowerCase('tr');
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
  }

  function renderView() {
    const isBoard = ui.view === 'board';
    $('#list-view').hidden = isBoard;
    $('#board-view').hidden = !isBoard;
    document.querySelectorAll('.view-btn').forEach((btn) => {
      const active = btn.dataset.view === ui.view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (isBoard) renderBoard();
    else renderTable();
  }

  function renderFilterOptions() {
    for (const key of LIST_KEYS) {
      const select = $(`#filter-${key}`);
      const values = data.lists[key];
      if (ui.filters[key] && !values.includes(ui.filters[key])) ui.filters[key] = '';
      select.replaceChildren(
        el('option', { value: '', textContent: 'Tümü' }),
        ...values.map((v) => el('option', { value: v, textContent: v })),
      );
      select.value = ui.filters[key];
    }
    $('#show-completed').checked = ui.showCompleted;
    $('#search').value = ui.search;
  }

  function fillOptions(select, key, value) {
    select.replaceChildren();
    if (key !== 'durum' || !value) select.append(el('option', { value: '', textContent: '— Seçiniz —' }));
    for (const v of data.lists[key]) select.append(el('option', { value: v, textContent: v }));
    if (value && !data.lists[key].includes(value)) {
      select.append(el('option', { value, textContent: `${value} (listede yok)` }));
    }
    select.value = value || '';
  }

  function buildSelect(key, task, onChange) {
    const select = el('select', { class: `cell-${key}`, title: LIST_LABELS[key], onchange: (e) => onChange(e.target.value) });
    fillOptions(select, key, task[key]);
    return select;
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
      onchange: (e) => { e.target.title = e.target.value; update('gorev')(e.target.value.trim()); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });

    const dateInput = el('input', {
      type: 'date',
      class: 'cell-tarih',
      value: task.tamamlanmaTarihi,
      title: 'Tamamlanma Tarihi',
      onchange: (e) => update('tamamlanmaTarihi')(isIsoDate(e.target.value) ? e.target.value : ''),
    });

    const deleteBtn = el('button', {
      type: 'button',
      class: 'btn btn-link btn-icon btn-delete',
      textContent: '🗑',
      onclick: () => deleteTask(task),
    });

    tr.append(
      el('td', {}, buildSelect('alan', task, update('alan'))),
      el('td', {}, gorevInput),
      el('td', {}, buildSelect('sahip', task, update('sahip'))),
      el('td', {}, buildSelect('durum', task, update('durum'))),
      el('td', {}, dateInput),
      el('td', { class: 'kalan' }),
      el('td', { class: 'actions' }, deleteBtn),
    );
    applyRowState(tr, task);
    return tr;
  }

  function applyRowState(tr, task) {
    const { level, label } = dueInfo(task);
    tr.classList.toggle('due-red', level === 'red');
    tr.classList.toggle('due-yellow', level === 'yellow');
    tr.classList.toggle('is-done', task.durum === DONE);
    tr.classList.toggle('is-new', ui.pinned.has(task.id));
    const kalan = tr.querySelector('td.kalan');
    kalan.textContent = label;
    kalan.title = task.durum === DONE && task.completedAt ? `Tamamlandı: ${formatDateTime(task.completedAt)}` : '';
    const btn = tr.querySelector('.btn-delete');
    const done = task.durum === DONE;
    btn.disabled = done;
    btn.title = done ? 'Tamamlanan görevler silinemez' : 'Görevi sil';
  }

  function renderTable() {
    const rows = visibleTasks();
    ui.shownCount = rows.length;
    $('#task-body').replaceChildren(...rows.map(buildRow));
    const empty = $('#empty-state');
    if (rows.length === 0) {
      empty.hidden = false;
      empty.textContent = data.tasks.length === 0
        ? 'Henüz görev yok. "+ Yeni Görev" ile ekleyebilirsiniz.'
        : 'Filtrelere uyan görev bulunamadı.';
    } else {
      empty.hidden = true;
    }
  }

  // ---------- Board view ----------

  function buildCard(task) {
    const { level, label } = dueInfo(task);
    const classes = ['card'];
    if (level) classes.push(`due-${level}`);
    if (task.durum === DONE) classes.push('is-done');
    if (ui.pinned.has(task.id)) classes.push('is-new');

    const meta = el('div', { class: 'card-meta' },
      el('span', { class: 'card-sahip', textContent: `👤 ${task.sahip || '—'}` }),
      task.tamamlanmaTarihi
        ? el('span', { class: 'card-due', textContent: `📅 ${formatDate(task.tamamlanmaTarihi)}${label && label !== '✓' ? ` · ${label}` : ''}` })
        : null,
    );

    const card = el('article', {
      class: classes.join(' '),
      draggable: true,
      tabIndex: 0,
      title: 'Düzenlemek için tıklayın, durumunu değiştirmek için sürükleyin',
      dataset: { id: task.id },
      onclick: () => openTaskDialog(task),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskDialog(task); } },
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      },
      ondragend: () => card.classList.remove('dragging'),
    },
    task.alan ? el('span', { class: 'card-alan', textContent: task.alan }) : null,
    el('div', { class: 'card-title', textContent: task.gorev || '(İsimsiz görev)' }),
    meta);
    return card;
  }

  function buildColumn(status, tasks) {
    const showDone = ui.showCompleted || ui.filters.durum === DONE;
    const doneHidden = status === DONE && !showDone;
    const cards = el('div', { class: 'board-cards' });
    let count = tasks.length;

    if (doneHidden) {
      const hiddenTasks = data.tasks.filter((t) => t.durum === DONE && !ui.pinned.has(t.id) && matchesFilters(t, { includeDone: true }));
      count += hiddenTasks.length;
      cards.append(...tasks.map(buildCard));
      if (hiddenTasks.length > 0) {
        cards.append(el('p', { class: 'board-note' },
          `${hiddenTasks.length} tamamlanan görev gizli. `,
          el('button', {
            type: 'button',
            class: 'btn btn-link',
            textContent: 'Göster',
            onclick: () => { ui.showCompleted = true; render(); },
          })));
      }
    } else {
      cards.append(...tasks.map(buildCard));
      if (tasks.length === 0) cards.append(el('p', { class: 'board-note', textContent: 'Görev yok' }));
    }

    const column = el('section', { class: 'board-column', dataset: { status } },
      el('h3', {}, el('span', { textContent: status }), el('span', { class: 'count-badge', textContent: String(count) })),
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

  function renderBoard() {
    const tasks = visibleTasks();
    ui.shownCount = tasks.length;
    const statuses = ui.filters.durum ? [ui.filters.durum] : data.lists.durum;
    $('#board-view').replaceChildren(...statuses.map((s) => buildColumn(s, tasks.filter((t) => t.durum === s))));
  }

  function isHiddenWhenDone() {
    return !ui.showCompleted && ui.filters.durum !== DONE;
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

  // ---------- Task dialog (board view) ----------

  let editingTask = null;

  function openTaskDialog(task) {
    editingTask = task || null;
    const draft = task || newTaskDraft();
    const form = $('#task-form');
    $('#task-dialog-title').textContent = task ? 'Görevi Düzenle' : 'Yeni Görev';
    form.elements.gorev.value = draft.gorev;
    for (const key of LIST_KEYS) fillOptions(form.elements[key], key, draft[key]);
    form.elements.tamamlanmaTarihi.value = draft.tamamlanmaTarihi;
    const del = $('#task-delete');
    del.hidden = !task;
    del.disabled = !!task && task.durum === DONE;
    del.title = del.disabled ? 'Tamamlanan görevler silinemez' : 'Görevi sil';
    $('#task-dialog').showModal();
    form.elements.gorev.focus();
  }

  function saveTaskDialog(e) {
    e.preventDefault();
    const form = $('#task-form');
    const gorev = form.elements.gorev.value.trim();
    if (!gorev) {
      alert('Görev açıklaması boş olamaz.');
      form.elements.gorev.focus();
      return;
    }
    const tarih = form.elements.tamamlanmaTarihi.value;
    const values = {
      gorev,
      alan: form.elements.alan.value,
      sahip: form.elements.sahip.value,
      durum: form.elements.durum.value,
      tamamlanmaTarihi: isIsoDate(tarih) ? tarih : '',
    };
    let task = editingTask;
    if (task) {
      for (const [field, value] of Object.entries(values)) applyChange(task, field, value);
    } else {
      task = { ...newTaskDraft(), ...values };
      if (task.durum === DONE) task.completedAt = nowIso();
      data.tasks.push(task);
      if (task.durum !== DONE || !isHiddenWhenDone()) ui.pinned.add(task.id);
    }
    save();
    $('#task-dialog').close();
    if (task.durum === DONE && isHiddenWhenDone()) {
      ui.pinned.delete(task.id);
      toast('Görev tamamlandı ve gizlendi. Görmek için "Tamamlananları göster" seçeneğini işaretleyin.');
    }
    render();
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
    $('#summary').replaceChildren(
      el('span', { textContent: `Gösterilen: ${shown}` }),
      el('span', { textContent: `Açık: ${open.length}` }),
      el('span', { textContent: `Tamamlanan: ${done}` }),
      el('span', { class: 'count-red', textContent: `Kritik: ${red}` }),
      el('span', { class: 'count-yellow', textContent: `Yaklaşan: ${yellow}` }),
    );
  }

  function renderSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.querySelector('.sort-indicator')?.remove();
      if (th.dataset.sort === ui.sort.key && th.classList.contains('col-kalan') === false) {
        th.append(el('span', { class: 'sort-indicator', textContent: ui.sort.dir === 1 ? '▲' : '▼' }));
      }
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
    if (!applyChange(task, field, value)) return;
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
      alan: ui.filters.alan || '',
      gorev: '',
      sahip: ui.filters.sahip || '',
      durum: ui.filters.durum && ui.filters.durum !== DONE ? ui.filters.durum : firstOpenStatus(),
      tamamlanmaTarihi: '',
      createdAt: ts,
      updatedAt: ts,
      completedAt: null,
    };
  }

  function addTask() {
    if (ui.view === 'board') {
      openTaskDialog(null);
      return;
    }
    const task = newTaskDraft();
    data.tasks.push(task);
    ui.pinned.add(task.id);
    save();
    render();
    document.querySelector(`tr[data-id="${CSS.escape(task.id)}"] .gorev-input`)?.focus();
  }

  function deleteTask(task) {
    if (task.durum === DONE) {
      alert('Tamamlanan görevler silinemez.');
      return false;
    }
    const name = task.gorev ? `"${task.gorev}"` : 'Bu (isimsiz)';
    if (!confirm(`${name} görevi silinsin mi? Bu işlem geri alınamaz.`)) return false;
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
    if (ui.filters[key] === oldValue) ui.filters[key] = newValue;
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

  function renderSettings() {
    const container = $('#settings-lists');
    container.replaceChildren(...LIST_KEYS.map((key) => {
      const list = data.lists[key];
      const items = list.map((value, i) => {
        const fixed = key === 'durum' && value === DONE;
        const input = el('input', {
          type: 'text',
          value,
          disabled: fixed,
          title: fixed ? 'Sabit durum – değiştirilemez' : 'Yeniden adlandırmak için düzenleyin',
          onchange: (e) => {
            if (renameValue(key, value, e.target.value)) { renderSettings(); render(); } else e.target.value = value;
          },
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
        });
        const lastMovable = key === 'durum' ? list.length - 2 : list.length - 1;
        return el('li', {},
          input,
          el('span', { class: 'usage', title: 'Kullanıldığı görev sayısı', textContent: String(usageCount(key, value)) }),
          el('button', { type: 'button', class: 'btn btn-icon', textContent: '↑', title: 'Yukarı taşı', disabled: fixed || i === 0, onclick: () => moveValue(key, i, -1) }),
          el('button', { type: 'button', class: 'btn btn-icon', textContent: '↓', title: 'Aşağı taşı', disabled: fixed || i >= lastMovable, onclick: () => moveValue(key, i, 1) }),
          el('button', { type: 'button', class: 'btn btn-icon', textContent: '✕', title: fixed ? 'Sabit durum silinemez' : 'Sil', disabled: fixed, onclick: () => removeValue(key, value) }),
        );
      });
      const addInput = el('input', { type: 'text', placeholder: `Yeni ${LIST_LABELS[key].toLocaleLowerCase('tr')}…` });
      const doAdd = () => { if (addValue(key, addInput.value)) $(`#settings-add-${key}`)?.focus(); };
      addInput.id = `settings-add-${key}`;
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
      return el('section', { class: 'settings-list' },
        el('h3', { textContent: `${LIST_LABELS[key]} (${list.length})` }),
        el('ul', {}, ...items),
        el('div', { class: 'add-row' }, addInput, el('button', { type: 'button', class: 'btn', textContent: 'Ekle', onclick: doAdd })),
      );
    }));
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

  function exportJson() {
    data.meta.lastBackupAt = nowIso();
    save();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    download(`gorevler-yedek-${todayIso()}.json`, blob);
    renderBackupInfo();
    toast('Yedek dosyası indirildi.');
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
        mergeIncoming(incoming);
        save();
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
    const headers = ['Alan', 'Görev', 'Sahip', 'Durum', 'Tamamlanma Tarihi', 'Tamamlandığı Zaman'];
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
    const aoa = [headers, ...sorted.map((t) => [t.alan, t.gorev, t.sahip, t.durum, '', t.completedAt ? formatDateTime(t.completedAt) : ''])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    sorted.forEach((t, i) => {
      if (!t.tamamlanmaTarihi) return;
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: 4 });
      ws[ref] = { t: 'n', v: excelSerial(t.tamamlanmaTarihi), z: 'dd.mm.yyyy' };
    });
    ws['!cols'] = [{ wch: 24 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 20 }];
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

  // ---------- Cloud sync (Firebase Realtime Database, no login) ----------

  const taskValue = (t) => {
    const v = { id: t.id, gorev: t.gorev, alan: t.alan, sahip: t.sahip, durum: t.durum, tamamlanmaTarihi: t.tamamlanmaTarihi, createdAt: t.createdAt, updatedAt: t.updatedAt };
    if (t.completedAt) v.completedAt = t.completedAt;
    return v;
  };
  const taskSig = (t) => JSON.stringify([t.gorev, t.alan, t.sahip, t.durum, t.tamamlanmaTarihi, t.completedAt || '']);
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
      tamamlanmaTarihi: isIsoDate(tarih) ? tarih : '',
      createdAt: str(v.createdAt) || nowIso(),
      updatedAt: str(v.updatedAt) || nowIso(),
      completedAt: str(v.completedAt) || null,
    };
  }

  const isEditing = () => {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest('#task-body, dialog')) || $('#task-dialog').open || $('#settings-dialog').open;
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
      if (local && known !== undefined && taskSig(local) !== known) merged.push(local);
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
      if (!ids.has(id)) ops.push({ kind: 'tasks', id, path: taskPath(id), value: null });
    }
    for (const key of LIST_KEYS) {
      const sig = listSig(data.lists[key]);
      if (cloud.remote.lists[key] !== sig) ops.push({ kind: 'lists', id: key, sig, path: `lists/${key}`, value: sig });
    }
    return ops;
  }

  async function pushOps(ops) {
    const results = await cloud.store.write(ops.map(({ path, value }) => ({ path, value })));
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
      const existing = data.tasks.find((x) => x.id === t.id);
      if (existing) Object.assign(existing, t);
      else data.tasks.push(t);
    }
    resetPinned();
    persistCloudCache();
    render();
  }

  function setCloudStatus(status, error = null) {
    cloud.status = status;
    cloud.error = error;
    renderCloudStatus();
  }

  function renderCloudStatus() {
    const el2 = $('#cloud-status');
    const time = cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    const states = {
      loading: ['⟳ Yükleniyor…', 'busy'],
      saving: ['⟳ Kaydediliyor…', 'busy'],
      saved: [`☁ Kaydedildi${time ? ` · ${time}` : ''}`, 'ok'],
      offline: ['⚠ Çevrimdışı – bağlantı gelince kaydedilecek', 'warn'],
      error: ['⚠ Kaydedilemedi – tekrar denenecek', 'warn'],
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
    const firstLoad = !cloud.ready;
    const changed = mergeServer(server);
    cloud.ready = true;
    persistCloudCache();
    if (firstLoad) { render(); offerMigration(); } else if (changed) renderWhenIdle();
  }

  async function runSync(pull) {
    if (!cloud.store || (!pull && !cloud.ready)) return;
    clearTimeout(cloud.timer);
    try {
      if (pull) await runPull();
      const ops = buildOps();
      if (ops.length) {
        setCloudStatus('saving');
        await pushOps(ops);
      }
      cloud.lastSyncAt = nowIso();
      persistCloudCache();
      setCloudStatus('saved');
    } catch (err) {
      console.warn('Eşitleme hatası', err);
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

  async function startCloud() {
    document.body.classList.add('cloud-mode');
    $('#cloud-bar').hidden = false;
    $('#storage-note').textContent = 'Veriler ekibin ortak bulut veritabanında saklanır ve her değişiklik otomatik kaydedilir.';
    try {
      cloud.store = window.TaskCloud.createStore(config);
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
      if (hasPendingChanges()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- Event wiring ----------

  function bindEvents() {
    $('#btn-add').addEventListener('click', addTask);

    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (ui.view === btn.dataset.view) return;
        ui.view = btn.dataset.view;
        localStorage.setItem(VIEW_KEY, ui.view);
        resetPinned();
        renderView();
        renderSummary();
      });
    });

    $('#task-form').addEventListener('submit', saveTaskDialog);
    document.querySelectorAll('#task-dialog [data-close]').forEach((btn) => {
      btn.addEventListener('click', () => $('#task-dialog').close());
    });
    $('#task-delete').addEventListener('click', () => {
      if (editingTask && deleteTask(editingTask)) $('#task-dialog').close();
    });

    $('#search').addEventListener('input', (e) => {
      ui.search = e.target.value;
      resetPinned();
      renderView();
      renderSummary();
    });

    document.querySelectorAll('select[data-filter]').forEach((select) => {
      select.addEventListener('change', (e) => {
        ui.filters[e.target.dataset.filter] = e.target.value;
        resetPinned();
        renderView();
        renderSummary();
      });
    });

    $('#show-completed').addEventListener('change', (e) => {
      ui.showCompleted = e.target.checked;
      resetPinned();
      renderView();
      renderSummary();
    });

    $('#btn-clear-filters').addEventListener('click', () => {
      ui.search = '';
      ui.filters = { alan: '', sahip: '', durum: '' };
      ui.showCompleted = false;
      resetPinned();
      render();
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

    // Keep multiple open tabs in sync.
    window.addEventListener('storage', (e) => {
      if (cloud && e.key === CLOUD_CACHE_KEY && e.newValue) {
        const cache = loadCloudCache();
        data = cache.data;
        Object.assign(cloud, { remote: cache.remote, lastSyncAt: cache.lastSyncAt });
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
  render();
  if (cloud) startCloud();
})();
