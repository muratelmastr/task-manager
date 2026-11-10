(() => {
  'use strict';

  const STORAGE_KEY = 'taskManager.v1';
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

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      alert(`Veriler kaydedilemedi: ${err.message}`);
    }
  }

  function firstOpenStatus(lists = data.lists) {
    return lists.durum.find((d) => d !== DONE) || DONE;
  }

  let data = load();
  save();

  const ui = {
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

  function matchesFilters(t) {
    const showDone = ui.showCompleted || ui.filters.durum === DONE;
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
    renderTable();
    renderSummary();
    renderSortIndicators();
    renderBackupInfo();
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

  function buildSelect(key, task, onChange) {
    const select = el('select', { class: `cell-${key}`, title: LIST_LABELS[key], onchange: (e) => onChange(e.target.value) });
    if (key !== 'durum' || !task.durum) select.append(el('option', { value: '', textContent: '— Seçiniz —' }));
    for (const v of data.lists[key]) select.append(el('option', { value: v, textContent: v }));
    if (task[key] && !data.lists[key].includes(task[key])) {
      select.append(el('option', { value: task[key], textContent: `${task[key]} (listede yok)` }));
    }
    select.value = task[key] || '';
    return select;
  }

  function buildRow(task) {
    const tr = el('tr', { dataset: { id: task.id } });
    const update = (field) => (value) => onFieldChange(task, field, value, tr);

    const gorevInput = el('input', {
      type: 'text',
      class: 'gorev-input',
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
    const shown = $('#task-body').children.length;
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

  function onFieldChange(task, field, value, tr) {
    const prev = task[field];
    if (prev === value) return;
    task[field] = value;
    task.updatedAt = nowIso();
    if (field === 'durum') {
      if (value === DONE && prev !== DONE) task.completedAt = nowIso();
      else if (value !== DONE) task.completedAt = null;
    }
    save();

    const hidesNow = field === 'durum' && value === DONE && !ui.showCompleted && ui.filters.durum !== DONE;
    if (hidesNow) {
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

  function addTask() {
    const ts = nowIso();
    const task = {
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
    data.tasks.push(task);
    ui.pinned.add(task.id);
    save();
    render();
    document.querySelector(`tr[data-id="${CSS.escape(task.id)}"] .gorev-input`)?.focus();
  }

  function deleteTask(task) {
    if (task.durum === DONE) {
      alert('Tamamlanan görevler silinemez.');
      return;
    }
    const name = task.gorev ? `"${task.gorev}"` : 'Bu (isimsiz)';
    if (!confirm(`${name} görevi silinsin mi? Bu işlem geri alınamaz.`)) return;
    data.tasks = data.tasks.filter((t) => t.id !== task.id);
    ui.pinned.delete(task.id);
    save();
    render();
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

  // ---------- Event wiring ----------

  function bindEvents() {
    $('#btn-add').addEventListener('click', addTask);

    $('#search').addEventListener('input', (e) => {
      ui.search = e.target.value;
      resetPinned();
      renderTable();
      renderSummary();
    });

    document.querySelectorAll('select[data-filter]').forEach((select) => {
      select.addEventListener('change', (e) => {
        ui.filters[e.target.dataset.filter] = e.target.value;
        resetPinned();
        renderTable();
        renderSummary();
      });
    });

    $('#show-completed').addEventListener('change', (e) => {
      ui.showCompleted = e.target.checked;
      resetPinned();
      renderTable();
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
        renderTable();
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
      if (e.key === STORAGE_KEY) {
        data = load();
        render();
        if ($('#settings-dialog').open) renderSettings();
      }
    });
  }

  bindEvents();
  render();
})();
