// Timesheet: time entries per task and reports (signed-in shared database only).
// Data: /timesheets/{id} = { gorevId, kullanici, tarih (YYYY-MM-DD), gun (days since 1970-01-01),
//         saat, not?, gorevNo?, gorevAdi, alan, createdAt, updatedAt }
// gorevNo/gorevAdi/alan are a snapshot of the task so reports stay readable if the task changes.
(() => {
  'use strict';

  const EDIT_DAYS = 30; // entries can be dated (and edited) up to 30 days back
  const MAX_HOURS = 24;
  const NOTE_MAX = 200;
  const REFRESH_MS = 30000;
  const NO_ALAN = '__none__';

  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const todayIso = () => isoOf(new Date());
  const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoOf(parseIso(s)) === s;
  // Calendar day number used by the database rules to check the 30-day window.
  const dayNumber = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const minEntryDate = () => addDays(todayIso(), -EDIT_DAYS);
  const canEditDate = (tarih) => tarih >= minEntryDate() && tarih <= todayIso();

  const num = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
  const formatHours = (h) => `${num.format(Math.round(h * 100) / 100)} sa`;
  const dayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const weekdayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
  const shortDay = (iso) => { const d = parseIso(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${weekdayFmt.format(d)}`; };

  // "0,5", "0.5", "2", "1,75" → number, or { error }.
  function parseHours(raw) {
    const s = String(raw || '').trim().replace(',', '.');
    if (!s) return { error: 'Süre girin.' };
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return { error: 'Geçerli bir süre girin (ör. 0,5 veya 2).' };
    const v = Number(s);
    if (!(v > 0)) return { error: 'Süre 0\'dan büyük olmalı.' };
    if (v > MAX_HOURS) return { error: `Bir girişte en fazla ${MAX_HOURS} saat olabilir.` };
    if (Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) return { error: 'Süre 0,25 saatlik (15 dk) adımlarla girilmeli (ör. 0,25 · 0,5 · 1,75).' };
    return { value: v };
  }

  function presetRange(preset, custom) {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth();
    switch (preset) {
      case 'lastMonth': return [isoOf(new Date(y, m - 1, 1)), isoOf(new Date(y, m, 0))];
      case 'thisWeek': {
        const start = isoOf(new Date(y, m, t.getDate() - ((t.getDay() + 6) % 7))); // weeks start on Monday
        return [start, addDays(start, 6)];
      }
      case 'last30': return [addDays(todayIso(), -29), todayIso()];
      case 'custom': return custom;
      default: return [isoOf(new Date(y, m, 1)), isoOf(new Date(y, m + 1, 0))];
    }
  }

  function rangeLabel(from, to) {
    const a = parseIso(from);
    const b = parseIso(to);
    try { return dateFmt.formatRange(a, b); } catch (e) { return `${dateFmt.format(a)} – ${dateFmt.format(b)}`; }
  }

  const query = (params) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(JSON.stringify(v))}`).join('&');
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

  function normalizeEntry(id, v) {
    const saat = Number(v.saat);
    const tarih = str(v.tarih);
    if (!isIso(tarih) || !(saat > 0) || !str(v.gorevId)) return null;
    return {
      id,
      gorevId: str(v.gorevId),
      kullanici: str(v.kullanici),
      tarih,
      saat,
      not: str(v.not),
      gorevNo: Number(v.gorevNo) || null,
      gorevAdi: str(v.gorevAdi),
      alan: str(v.alan),
      createdAt: str(v.createdAt),
      updatedAt: str(v.updatedAt),
    };
  }
  const toEntries = (obj) => Object.entries(obj || {})
    .filter(([, v]) => v && typeof v === 'object')
    .map(([id, v]) => normalizeEntry(id, v))
    .filter(Boolean);

  // app: { $, el, icon, iconButton, toast, uid, store(), tasks(), lists(), directory(), me(), fullNameOf(username),
  //        buildAvatar, toneFor, DONE, openTask(task), loadSheetJs, download, onEntriesChanged(taskId), isVisible() }
  function create(app) {
    const { $, el, icon } = app;
    const S = {
      tab: 'entries',
      preset: 'thisMonth',
      custom: presetRange('thisMonth'),
      mine: true,
      kisi: '',
      alan: '',
      entries: null,
      key: '',
      loading: false,
      error: null,
      token: 0,
      lastFetch: 0,
    };

    const taskOf = (id) => app.tasks().find((t) => t.id === id) || null;
    const entryTask = (e) => taskOf(e.gorevId);
    const entryAlan = (e) => { const t = entryTask(e); return t ? t.alan : e.alan; };
    const entryTitle = (e) => { const t = entryTask(e); return (t ? t.gorev : e.gorevAdi) || '(İsimsiz görev)'; };
    const entryNo = (e) => { const t = entryTask(e); return (t && t.no) || e.gorevNo || null; };
    const range = () => presetRange(S.preset, S.custom);
    const sum = (list) => list.reduce((a, e) => a + e.saat, 0);
    const isOwn = (e) => !!app.me() && e.kullanici === app.me();

    // Tasks that can receive time: open ones and those completed within the last 30 days.
    function isSelectable(task) {
      if (!task) return false;
      if (task.durum !== app.DONE) return true;
      return !!task.completedAt && isoOf(new Date(task.completedAt)) >= minEntryDate();
    }

    // ---------- Data ----------

    async function fetchRange(from, to) {
      return toEntries(await app.store().get('timesheets', query({ orderBy: 'tarih', startAt: from, endAt: to })));
    }

    async function taskEntries(taskId) {
      return toEntries(await app.store().get('timesheets', query({ orderBy: 'gorevId', equalTo: taskId })));
    }

    function friendlyError(err, what) {
      if (err && err.code === 'denied') return `${what} Veritabanı kurallarının güncel olduğundan emin olun (README → Firebase kurulumu).`;
      return `${what} ${err ? err.message : ''}`.trim();
    }

    async function load(force = false) {
      if (!app.store()) { S.loading = true; renderBody(); return; }
      const [from, to] = range();
      const key = `${from}|${to}`;
      if (!force && S.key === key && S.entries && Date.now() - S.lastFetch < REFRESH_MS) { renderBody(); return; }
      const token = ++S.token;
      const changedRange = S.key !== key;
      if (changedRange || !S.entries) { S.loading = true; renderBody(); }
      try {
        const list = await fetchRange(from, to);
        if (token !== S.token) return;
        Object.assign(S, { entries: list, key, lastFetch: Date.now(), loading: false, error: null });
      } catch (err) {
        if (token !== S.token) return;
        S.loading = false;
        S.error = friendlyError(err, 'Zaman girişleri yüklenemedi.');
        if (changedRange) { S.entries = null; S.key = ''; }
      }
      renderBody();
    }

    function upsertLocal(entry) {
      if (!S.entries) return;
      const [from, to] = S.key.split('|');
      S.entries = S.entries.filter((e) => e.id !== entry.id);
      if (entry.tarih >= from && entry.tarih <= to) S.entries.push(entry);
    }

    // ---------- Toolbar ----------

    function setupToolbar() {
      $('#ts-period').addEventListener('change', (e) => {
        S.preset = e.target.value;
        if (S.preset === 'custom') {
          $('#ts-from').value = S.custom[0];
          $('#ts-to').value = S.custom[1];
        }
        syncToolbar();
        load();
      });
      const onCustom = () => {
        let from = $('#ts-from').value;
        let to = $('#ts-to').value;
        if (!isIso(from) || !isIso(to)) return;
        if (from > to) [from, to] = [to, from];
        S.custom = [from, to];
        $('#ts-from').value = from;
        $('#ts-to').value = to;
        syncToolbar();
        load();
      };
      $('#ts-from').addEventListener('change', onCustom);
      $('#ts-to').addEventListener('change', onCustom);
      $('#ts-mine').addEventListener('click', () => { S.mine = !S.mine; syncToolbar(); renderBody(); });
      $('#ts-kisi').addEventListener('change', (e) => { S.kisi = e.target.value; renderBody(); });
      $('#ts-alan').addEventListener('change', (e) => { S.alan = e.target.value; renderBody(); });
      $('#ts-add').addEventListener('click', () => openEntry({}));
      $('#ts-export').addEventListener('click', exportXlsx);
      window.addEventListener('focus', () => { if (app.isVisible()) load(true); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && app.isVisible()) load(true); });
      setInterval(() => { if (document.visibilityState === 'visible' && app.isVisible()) load(true); }, REFRESH_MS * 2);
    }

    function fillSelect(select, options, value) {
      select.replaceChildren(...options.map(([v, label]) => el('option', { value: v, textContent: label })));
      select.value = options.some(([v]) => v === value) ? value : '';
      return select.value;
    }

    function syncToolbar() {
      $('#ts-period').value = S.preset;
      $('#ts-custom').hidden = S.preset !== 'custom';
      const mineMode = S.tab === 'entries' && S.mine;
      $('#ts-mine').hidden = S.tab !== 'entries' || !app.me();
      $('#ts-mine').setAttribute('aria-pressed', String(S.mine));
      $('#ts-kisi-wrap').hidden = mineMode;
      $('#ts-export').hidden = S.tab !== 'report';

      const people = new Map((app.directory() || []).map((u) => [u.kullaniciAdi, app.fullNameOf(u.kullaniciAdi)]));
      for (const e of S.entries || []) if (e.kullanici && !people.has(e.kullanici)) people.set(e.kullanici, app.fullNameOf(e.kullanici));
      S.kisi = fillSelect($('#ts-kisi'), [['', 'Tümü'], ...people], S.kisi);
      const alanlar = [...app.lists().alan];
      for (const e of S.entries || []) { const a = entryAlan(e); if (a && !alanlar.includes(a)) alanlar.push(a); }
      S.alan = fillSelect($('#ts-alan'), [['', 'Tümü'], ...alanlar.map((a) => [a, a]), [NO_ALAN, '(Alan yok)']], S.alan);
      const [from, to] = range();
      $('#ts-range').textContent = rangeLabel(from, to);
    }

    function filtered() {
      let list = S.entries || [];
      if (S.tab === 'entries' && S.mine) list = list.filter(isOwn);
      else if (S.kisi) list = list.filter((e) => e.kullanici === S.kisi);
      if (S.alan) list = list.filter((e) => (entryAlan(e) || NO_ALAN) === S.alan);
      return list;
    }

    // ---------- Rendering ----------

    function render() {
      syncToolbar();
      renderBody();
      load();
    }

    function renderBody() {
      const body = $('#ts-body');
      if (!body) return;
      syncToolbar();
      if (S.loading && !S.entries) {
        body.replaceChildren(el('div', { class: 'ts-card ts-loading', 'aria-label': 'Yükleniyor' },
          ...[60, 85, 70, 90].map((w) => el('span', { class: 'skeleton', style: `width:${w}%` }))));
        return;
      }
      if (S.error && !S.entries) {
        body.replaceChildren(el('p', { class: 'cloud-error', role: 'alert', textContent: S.error }));
        return;
      }
      const parts = [];
      if (S.error) parts.push(el('p', { class: 'cloud-error', role: 'alert', textContent: S.error }));
      parts.push(...(S.tab === 'report' ? buildReport(filtered()) : buildEntries(filtered())));
      body.replaceChildren(...parts);
    }

    function taskLink(e, cls = 'ts-task') {
      const t = entryTask(e);
      const no = entryNo(e);
      const content = [no ? el('span', { class: 'ts-no', textContent: `#${no}` }) : null, el('span', { class: 'ts-task-title', textContent: entryTitle(e) })];
      return t
        ? el('button', { type: 'button', class: cls, title: 'Görev detayını aç', onclick: () => app.openTask(t) }, ...content)
        : el('span', { class: `${cls} is-static`, title: 'Görev silinmiş' }, ...content);
    }

    function alanTag(alan) {
      return alan
        ? el('span', { class: `tag tone-${app.toneFor('alan', alan)}`, textContent: alan })
        : el('span', { class: 'ts-muted', textContent: '(Alan yok)' });
    }

    function emptyState(title, text) {
      return el('div', { class: 'empty-state ts-empty' },
        el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon('clock', 'icon-lg')),
        el('p', { class: 'empty-title', textContent: title }),
        el('p', { class: 'empty-text', textContent: text }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEntry({}) }, icon('plus'), 'Zaman gir'));
    }

    function buildEntries(list) {
      if (!list.length) {
        return [emptyState('Bu dönemde giriş yok', S.mine ? 'Bu dönem için henüz zaman girişiniz yok.' : 'Filtrelere uyan zaman girişi bulunamadı.')];
      }
      const sorted = [...list].sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.createdAt || '').localeCompare(a.createdAt || ''));
      const groups = new Map();
      for (const e of sorted) {
        if (!groups.has(e.tarih)) groups.set(e.tarih, []);
        groups.get(e.tarih).push(e);
      }
      const summary = el('div', { class: 'ts-summary' },
        el('span', { class: 'stat' }, el('span', { class: 'stat-value', textContent: formatHours(sum(list)) }), el('span', { class: 'stat-label', textContent: 'toplam' })),
        el('span', { class: 'stat' }, el('span', { class: 'stat-value', textContent: String(list.length) }), el('span', { class: 'stat-label', textContent: 'giriş' })),
        el('span', { class: 'stat' }, el('span', { class: 'stat-value', textContent: String(groups.size) }), el('span', { class: 'stat-label', textContent: 'gün' })));
      const showWho = !(S.tab === 'entries' && S.mine);
      const days = [...groups].map(([tarih, items]) => el('section', { class: 'ts-card ts-day', dataset: { date: tarih } },
        el('h3', { class: 'ts-day-head' },
          el('span', { textContent: dayFmt.format(parseIso(tarih)) }),
          el('span', { class: 'ts-day-total', textContent: formatHours(sum(items)) })),
        el('ul', { class: 'ts-rows' }, ...items.map((e) => buildRow(e, showWho)))));
      return [summary, ...days];
    }

    function buildRow(e, showWho) {
      const own = isOwn(e);
      const editable = own && canEditDate(e.tarih);
      const actions = el('span', { class: 'ts-row-actions' });
      if (editable) {
        actions.append(
          app.iconButton('pencil', 'Düzenle', { 'aria-label': 'Girişi düzenle', onclick: () => openEntry({ entry: e }) }),
          app.iconButton('trash', 'Sil', { class: 'btn btn-ghost btn-icon btn-sm btn-danger', 'aria-label': 'Girişi sil', onclick: () => deleteEntry(e) }));
      } else if (own) {
        actions.append(el('span', { class: 'settings-lock', title: `${EDIT_DAYS} günden eski girişler değiştirilemez` }, icon('lock', 'icon-sm')));
      }
      return el('li', { class: `ts-row${own ? ' is-own' : ''}`, dataset: { id: e.id } },
        showWho ? el('span', { class: 'ts-who', title: app.fullNameOf(e.kullanici) }, app.buildAvatar(e.kullanici, 'avatar-sm'), el('span', { class: 'ts-who-name', textContent: app.fullNameOf(e.kullanici) })) : null,
        el('span', { class: 'ts-row-main' },
          el('span', { class: 'ts-row-task' }, taskLink(e), alanTag(entryAlan(e))),
          e.not ? el('span', { class: 'ts-note', textContent: e.not }) : null),
        el('span', { class: 'ts-hours', textContent: formatHours(e.saat) }),
        actions);
    }

    // ---------- Reports ----------

    function groupBy(list, keyFn) {
      const map = new Map();
      for (const e of list) {
        const k = keyFn(e);
        if (!map.has(k)) map.set(k, { key: k, hours: 0, count: 0, people: new Set(), sample: e });
        const g = map.get(k);
        g.hours += e.saat;
        g.count += 1;
        g.people.add(e.kullanici);
      }
      return [...map.values()].sort((a, b) => b.hours - a.hours || String(a.key).localeCompare(String(b.key), 'tr'));
    }

    const bar = (hours, total) => {
      const pct = total ? (hours / total) * 100 : 0;
      return el('span', { class: 'ts-bar-cell' },
        el('span', { class: 'ts-bar', 'aria-hidden': 'true' }, el('span', { class: 'ts-bar-fill', style: `width:${pct.toFixed(1)}%` })),
        el('span', { class: 'ts-pct', textContent: `%${num.format(Math.round(pct))}` }));
    };

    const COLLAPSE_KEY = 'taskManager.tsCollapsed';
    const collapsedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || []); } catch (e) { return new Set(); } };

    // Adds an icon-only expand/collapse toggle to a report card's title; the state is remembered per card.
    function makeCollapsible(section, key, title) {
      const body = section.querySelector('.ts-table-wrap');
      body.id = `ts-card-body-${key}`;
      const btn = el('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm ts-collapse', 'aria-controls': body.id }, icon('chevron-down', 'icon-sm'));
      const apply = (collapsed) => {
        body.hidden = collapsed;
        section.classList.toggle('is-collapsed', collapsed);
        btn.setAttribute('aria-expanded', String(!collapsed));
        const label = `${title} bölümünü ${collapsed ? 'genişlet' : 'daralt'}`;
        btn.setAttribute('aria-label', label);
        btn.title = collapsed ? 'Genişlet' : 'Daralt';
      };
      btn.addEventListener('click', () => {
        const set = collapsedSet();
        const collapsed = !set.has(key);
        if (collapsed) set.add(key); else set.delete(key);
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
        apply(collapsed);
      });
      section.dataset.card = key;
      section.querySelector('.ts-card-title').append(btn);
      apply(collapsedSet().has(key));
      return section;
    }

    function reportTable(title, iconName, headers, rows, total) {
      return el('section', { class: 'ts-card ts-report-card' },
        el('h3', { class: 'ts-card-title' }, icon(iconName, 'icon-sm'), title),
        el('div', { class: 'ts-table-wrap' },
          el('table', { class: 'ts-table' },
            el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', { class: h.cls || '', textContent: h.label })))),
            el('tbody', {}, ...rows),
            el('tfoot', {}, el('tr', {},
              el('td', { colSpan: headers.length - 2, textContent: 'Toplam' }),
              el('td', { class: 'num', textContent: formatHours(total) }),
              el('td', {}))))));
    }

    function buildReport(list) {
      if (!list.length) return [emptyState('Bu dönemde giriş yok', 'Seçili dönem ve filtreler için raporlanacak zaman girişi yok.')];
      const total = sum(list);
      const byPerson = groupBy(list, (e) => e.kullanici);
      const byAlan = groupBy(list, (e) => entryAlan(e) || '');
      const byTask = groupBy(list, (e) => e.gorevId);

      const kpi = (value, label) => el('div', { class: 'ts-kpi' }, el('span', { class: 'ts-kpi-value', textContent: value }), el('span', { class: 'ts-kpi-label', textContent: label }));
      const kpis = el('div', { class: 'ts-kpis' },
        kpi(formatHours(total), 'Toplam süre'),
        kpi(String(list.length), 'Giriş'),
        kpi(String(byPerson.length), 'Kişi'),
        kpi(String(byTask.length), 'Görev'));

      const personRows = byPerson.map((g) => el('tr', { dataset: { key: g.key } },
        el('td', {}, el('span', { class: 'ts-who' }, app.buildAvatar(g.key, 'avatar-sm'), el('span', { textContent: app.fullNameOf(g.key) }))),
        el('td', { class: 'num', textContent: String(g.count) }),
        el('td', { class: 'num strong', textContent: formatHours(g.hours) }),
        el('td', {}, bar(g.hours, total))));
      const alanRows = byAlan.map((g) => el('tr', { dataset: { key: g.key } },
        el('td', {}, alanTag(g.key)),
        el('td', { class: 'num', textContent: String(g.people.size) }),
        el('td', { class: 'num strong', textContent: formatHours(g.hours) }),
        el('td', {}, bar(g.hours, total))));
      const taskRows = byTask.map((g) => el('tr', { dataset: { key: g.key } },
        el('td', {}, taskLink(g.sample, 'ts-task')),
        el('td', {}, alanTag(entryAlan(g.sample))),
        el('td', { class: 'num', textContent: String(g.people.size) }),
        el('td', { class: 'num strong', textContent: formatHours(g.hours) }),
        el('td', {}, bar(g.hours, total))));

      const grid = el('div', { class: 'ts-report-grid' },
        reportTable('Kişi bazında', 'user', [{ label: 'Kişi' }, { label: 'Giriş', cls: 'num' }, { label: 'Süre', cls: 'num' }, { label: 'Pay', cls: 'bar-col' }], personRows, total),
        reportTable('Alan bazında', 'board', [{ label: 'Alan' }, { label: 'Kişi', cls: 'num' }, { label: 'Süre', cls: 'num' }, { label: 'Pay', cls: 'bar-col' }], alanRows, total));
      const tasks = reportTable('Görev bazında', 'list', [{ label: 'Görev' }, { label: 'Alan' }, { label: 'Kişi', cls: 'num' }, { label: 'Süre', cls: 'num' }, { label: 'Pay', cls: 'bar-col' }], taskRows, total);
      tasks.classList.add('ts-report-wide');
      makeCollapsible(tasks, 'tasks', 'Görev bazında');
      return [kpis, grid, tasks, buildMatrix(list, byPerson, byAlan, total), makeCollapsible(buildDaily(list), 'daily', 'Gün bazında')];
    }

    // Day × person hours for the selected period (days up to today; every team member as a column).
    function dailyData(list) {
      const [from, to] = range();
      const today = todayIso();
      const last = to < today ? to : today;
      const days = [];
      for (let d = from; d <= last && days.length < 400; d = addDays(d, 1)) days.push(d);
      let people = (app.directory() || []).map((u) => u.kullaniciAdi);
      for (const e of list) if (e.kullanici && !people.includes(e.kullanici)) people.push(e.kullanici);
      if (S.kisi) people = [S.kisi];
      const cells = new Map();
      const dayTotals = new Map();
      const personTotals = new Map();
      for (const e of list) {
        const k = `${e.tarih}\u0000${e.kullanici}`;
        cells.set(k, (cells.get(k) || 0) + e.saat);
        dayTotals.set(e.tarih, (dayTotals.get(e.tarih) || 0) + e.saat);
        personTotals.set(e.kullanici, (personTotals.get(e.kullanici) || 0) + e.saat);
      }
      return {
        days,
        people,
        cell: (day, user) => cells.get(`${day}\u0000${user}`) || 0,
        dayTotal: (day) => dayTotals.get(day) || 0,
        personTotal: (user) => personTotals.get(user) || 0,
        total: sum(list),
      };
    }

    const isWeekend = (iso) => { const w = parseIso(iso).getDay(); return w === 0 || w === 6; };

    function buildDaily(list) {
      const D = dailyData(list);
      const today = todayIso();
      const hoursCell = (h, cls = '') => el('td', { class: `num${h ? '' : ' is-zero'}${cls}`, textContent: h ? num.format(h) : '–' });
      const head = el('tr', {}, el('th', { textContent: 'Tarih' }),
        ...D.people.map((u) => el('th', { class: 'num', title: app.fullNameOf(u), dataset: { user: u } },
          el('span', { class: 'ts-daily-who' }, app.buildAvatar(u, 'avatar-sm'), el('span', { textContent: u })))),
        el('th', { class: 'num', textContent: 'Toplam' }));
      const rows = D.days.map((day) => el('tr', {
        class: [isWeekend(day) ? 'is-weekend' : '', day === today ? 'is-today' : ''].filter(Boolean).join(' '),
        dataset: { date: day },
      },
        el('th', { scope: 'row', title: dayFmt.format(parseIso(day)), textContent: shortDay(day) }),
        ...D.people.map((u) => hoursCell(D.cell(day, u))),
        hoursCell(D.dayTotal(day), ' strong')));
      const foot = el('tr', {}, el('th', { scope: 'row', textContent: 'Toplam' }),
        ...D.people.map((u) => el('td', { class: 'num strong', textContent: num.format(D.personTotal(u)) })),
        el('td', { class: 'num strong', textContent: num.format(D.total) }));
      return el('section', { class: 'ts-card ts-report-card ts-report-wide ts-daily-card' },
        el('h3', { class: 'ts-card-title' }, icon('calendar', 'icon-sm'), 'Gün bazında (saat)'),
        el('div', { class: 'ts-table-wrap ts-daily-wrap' },
          el('table', { class: 'ts-table ts-matrix ts-daily' }, el('thead', {}, head), el('tbody', {}, ...rows), el('tfoot', {}, foot))));
    }

    function buildMatrix(list, byPerson, byAlan, total) {
      const cell = new Map();
      for (const e of list) {
        const k = `${e.kullanici}\u0000${entryAlan(e) || ''}`;
        cell.set(k, (cell.get(k) || 0) + e.saat);
      }
      const head = el('tr', {}, el('th', { textContent: 'Kişi \\ Alan' }),
        ...byAlan.map((a) => el('th', { class: 'num', textContent: a.key || '(Alan yok)' })),
        el('th', { class: 'num', textContent: 'Toplam' }));
      const rows = byPerson.map((p) => el('tr', { dataset: { key: p.key } },
        el('th', { scope: 'row' }, el('span', { class: 'ts-who' }, app.buildAvatar(p.key, 'avatar-sm'), el('span', { textContent: app.fullNameOf(p.key) }))),
        ...byAlan.map((a) => {
          const h = cell.get(`${p.key}\u0000${a.key}`) || 0;
          return el('td', { class: `num${h ? '' : ' is-zero'}`, textContent: h ? num.format(h) : '–' });
        }),
        el('td', { class: 'num strong', textContent: num.format(p.hours) })));
      const foot = el('tr', {}, el('th', { scope: 'row', textContent: 'Toplam' }),
        ...byAlan.map((a) => el('td', { class: 'num strong', textContent: num.format(a.hours) })),
        el('td', { class: 'num strong', textContent: num.format(total) }));
      return el('section', { class: 'ts-card ts-report-card ts-report-wide' },
        el('h3', { class: 'ts-card-title' }, icon('sheet', 'icon-sm'), 'Kişi × Alan (saat)'),
        el('div', { class: 'ts-table-wrap' },
          el('table', { class: 'ts-table ts-matrix' }, el('thead', {}, head), el('tbody', {}, ...rows), el('tfoot', {}, foot))));
    }

    async function exportXlsx() {
      const list = filtered();
      if (!list.length) { alert('Aktarılacak zaman girişi yok.'); return; }
      let XLSX;
      try {
        XLSX = await app.loadSheetJs();
      } catch (err) {
        alert(err.message);
        return;
      }
      const [from, to] = range();
      const sorted = [...list].sort((a, b) => a.tarih.localeCompare(b.tarih) || a.kullanici.localeCompare(b.kullanici));
      const entriesAoa = [['Tarih', 'Kullanıcı', 'Ad Soyad', 'No', 'Görev', 'Alan', 'Saat', 'Not'],
        ...sorted.map((e) => [e.tarih, e.kullanici, app.fullNameOf(e.kullanici), entryNo(e) || '', entryTitle(e), entryAlan(e) || '', e.saat, e.not])];
      const byPerson = groupBy(list, (e) => e.kullanici);
      const byAlan = groupBy(list, (e) => entryAlan(e) || '');
      const byTask = groupBy(list, (e) => e.gorevId);
      const total = sum(list);
      const share = (h) => (total ? Math.round((h / total) * 1000) / 10 : 0);
      const wb = XLSX.utils.book_new();
      const add = (name, aoa, cols) => {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = cols.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      add('Girişler', entriesAoa, [12, 12, 20, 6, 44, 22, 8, 50]);
      add('Kişi', [['Kişi', 'Ad Soyad', 'Giriş', 'Saat', 'Pay (%)'], ...byPerson.map((g) => [g.key, app.fullNameOf(g.key), g.count, g.hours, share(g.hours)]), ['Toplam', '', list.length, total, 100]], [12, 22, 8, 10, 10]);
      add('Alan', [['Alan', 'Kişi sayısı', 'Saat', 'Pay (%)'], ...byAlan.map((g) => [g.key || '(Alan yok)', g.people.size, g.hours, share(g.hours)]), ['Toplam', '', total, 100]], [26, 12, 10, 10]);
      add('Görev', [['No', 'Görev', 'Alan', 'Kişi sayısı', 'Saat', 'Pay (%)'], ...byTask.map((g) => [entryNo(g.sample) || '', entryTitle(g.sample), entryAlan(g.sample) || '', g.people.size, g.hours, share(g.hours)]), ['', 'Toplam', '', '', total, 100]], [6, 44, 22, 12, 10, 10]);
      const cell = new Map();
      for (const e of list) { const k = `${e.kullanici}\u0000${entryAlan(e) || ''}`; cell.set(k, (cell.get(k) || 0) + e.saat); }
      add('Kişi x Alan', [['Kişi', ...byAlan.map((a) => a.key || '(Alan yok)'), 'Toplam'],
        ...byPerson.map((p) => [app.fullNameOf(p.key), ...byAlan.map((a) => cell.get(`${p.key}\u0000${a.key}`) || 0), p.hours]),
        ['Toplam', ...byAlan.map((a) => a.hours), total]], [22, ...byAlan.map(() => 14), 10]);
      const D = dailyData(list);
      add('Gün', [['Tarih', ...D.people.map((u) => app.fullNameOf(u)), 'Toplam'],
        ...D.days.map((day) => [day, ...D.people.map((u) => D.cell(day, u)), D.dayTotal(day)]),
        ['Toplam', ...D.people.map((u) => D.personTotal(u)), D.total]], [12, ...D.people.map(() => 16), 10]);
      XLSX.writeFile(wb, `timesheet-${from}_${to}.xlsx`);
    }

    // ---------- Entry dialog ----------

    const dlg = { entry: null, taskId: null, busy: false, active: -1, options: [] };
    const form = () => $('#ts-form');

    function setError(text) {
      const box = $('#ts-error');
      box.hidden = !text;
      box.textContent = text || '';
    }

    function setBusy(busy) {
      dlg.busy = busy;
      const submit = form().querySelector('button[type=submit]');
      submit.disabled = busy;
      submit.querySelector('.spinner').hidden = !busy;
      submit.querySelector('.submit-label').textContent = busy ? 'Kaydediliyor…' : 'Kaydet';
      $('#ts-delete').disabled = busy;
    }

    const taskLabel = (t) => `${t.no ? `#${t.no} · ` : ''}${t.gorev || '(İsimsiz görev)'}`;

    function candidateTasks() {
      const me = app.me();
      const list = app.tasks().filter((t) => isSelectable(t) || t.id === dlg.taskId);
      return list.sort((a, b) => {
        const am = a.sahip === me ? 0 : 1;
        const bm = b.sahip === me ? 0 : 1;
        if (am !== bm) return am - bm;
        const ad = a.durum === app.DONE ? 1 : 0;
        const bd = b.durum === app.DONE ? 1 : 0;
        if (ad !== bd) return ad - bd;
        return (b.no || 0) - (a.no || 0);
      });
    }

    function renderOptions() {
      const input = $('#ts-task-input');
      const q = input.value.trim().toLocaleLowerCase('tr').replace(/^#/, '');
      const selected = dlg.taskId && input.value === (taskOf(dlg.taskId) ? taskLabel(taskOf(dlg.taskId)) : '');
      const all = candidateTasks();
      dlg.options = (q && !selected
        ? all.filter((t) => [t.no ? String(t.no) : '', t.no ? `#${t.no}` : '', t.gorev, t.alan, t.sahip].join(' ').toLocaleLowerCase('tr').includes(q))
        : all).slice(0, 60);
      if (dlg.active >= dlg.options.length) dlg.active = dlg.options.length - 1;
      const listEl = $('#ts-task-list');
      const me = app.me();
      listEl.replaceChildren(...(dlg.options.length
        ? dlg.options.map((t, i) => el('li', {
          id: `ts-opt-${i}`,
          role: 'option',
          class: `combo-option${i === dlg.active ? ' is-active' : ''}${t.id === dlg.taskId ? ' is-selected' : ''}`,
          'aria-selected': String(t.id === dlg.taskId),
          dataset: { id: t.id },
          onmousedown: (e) => { e.preventDefault(); choose(t); },
        },
        el('span', { class: 'combo-no', textContent: t.no ? `#${t.no}` : '#…' }),
        el('span', { class: 'combo-text' },
          el('span', { class: 'combo-title', textContent: t.gorev || '(İsimsiz görev)' }),
          el('span', { class: 'combo-meta', textContent: [t.alan, t.sahip ? (t.sahip === me ? 'Bana atanmış' : t.sahip) : 'Atanmamış', t.durum === app.DONE ? 'Tamamlandı' : t.durum].filter(Boolean).join(' · ') }))))
        : [el('li', { class: 'combo-empty', textContent: 'Görev bulunamadı. Zaman girişi yalnızca açık veya son 30 günde tamamlanan görevlere yapılabilir.' })]));
      input.setAttribute('aria-activedescendant', dlg.active >= 0 ? `ts-opt-${dlg.active}` : '');
      if (dlg.active >= 0) listEl.children[dlg.active]?.scrollIntoView({ block: 'nearest' });
    }

    function openList() {
      $('#ts-task-list').hidden = false;
      $('#ts-task-input').setAttribute('aria-expanded', 'true');
      renderOptions();
    }
    function closeList() {
      $('#ts-task-list').hidden = true;
      $('#ts-task-input').setAttribute('aria-expanded', 'false');
      dlg.active = -1;
    }
    const listOpen = () => !$('#ts-task-list').hidden;

    function choose(t) {
      dlg.taskId = t.id;
      $('#ts-task-input').value = taskLabel(t);
      closeList();
      setError('');
      $('#ts-hours').focus();
    }

    function setupDialog() {
      const input = $('#ts-task-input');
      input.addEventListener('focus', () => { input.select(); openList(); });
      input.addEventListener('click', () => { if (!listOpen()) openList(); });
      input.addEventListener('input', () => { dlg.taskId = null; dlg.active = 0; openList(); });
      input.addEventListener('blur', () => setTimeout(() => {
        closeList();
        const t = dlg.taskId && taskOf(dlg.taskId);
        if (t) input.value = taskLabel(t);
      }, 120));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!listOpen()) openList();
          const n = dlg.options.length;
          if (!n) return;
          dlg.active = e.key === 'ArrowDown' ? (dlg.active + 1) % n : (dlg.active - 1 + n) % n;
          renderOptions();
        } else if (e.key === 'Enter') {
          if (listOpen() && dlg.options[dlg.active]) { e.preventDefault(); choose(dlg.options[dlg.active]); } else if (listOpen()) e.preventDefault();
        } else if (e.key === 'Escape' && listOpen()) {
          e.preventDefault();
          e.stopPropagation();
          closeList();
        }
      });
      $('#ts-dialog').addEventListener('cancel', (e) => {
        if (listOpen()) { e.preventDefault(); closeList(); return; }
        if (dlg.busy) e.preventDefault();
      });
      document.querySelectorAll('#ts-dialog .chip-btn').forEach((b) => b.addEventListener('click', () => {
        $('#ts-hours').value = b.dataset.hours;
        setError('');
        $('#ts-hours').focus();
      }));
      $('#ts-note').addEventListener('input', updateCounter);
      document.querySelectorAll('#ts-dialog [data-close]').forEach((b) => b.addEventListener('click', () => { if (!dlg.busy) $('#ts-dialog').close(); }));
      form().addEventListener('submit', (e) => { e.preventDefault(); save(); });
      $('#ts-delete').addEventListener('click', async () => {
        if (dlg.entry && await deleteEntry(dlg.entry)) $('#ts-dialog').close();
      });
    }

    function updateCounter() {
      const n = $('#ts-note').value.length;
      const c = $('#ts-note-count');
      c.textContent = `${n}/${NOTE_MAX}`;
      c.classList.toggle('is-limit', n >= NOTE_MAX);
    }

    // opts: { entry } to edit, or { taskId } to preselect a task.
    function openEntry(opts = {}) {
      if (!app.me()) { alert('Zaman girişi için kullanıcı hesabınızın ekip listesinde olması gerekir.'); return; }
      const entry = opts.entry || null;
      dlg.entry = entry;
      dlg.taskId = entry ? entry.gorevId : (opts.taskId || null);
      dlg.active = -1;
      $('#ts-dialog-title').textContent = entry ? 'Zaman girişini düzenle' : 'Zaman girişi';
      $('#ts-dialog-subtitle').textContent = entry ? `${app.fullNameOf(entry.kullanici)} · ${dateFmt.format(parseIso(entry.tarih))}` : 'Hangi görev için ne kadar süre harcadınız?';
      const t = dlg.taskId && taskOf(dlg.taskId);
      $('#ts-task-input').value = t ? taskLabel(t) : (entry ? `${entry.gorevNo ? `#${entry.gorevNo} · ` : ''}${entry.gorevAdi}` : '');
      $('#ts-hours').value = entry ? num.format(entry.saat) : '';
      const date = $('#ts-date');
      date.min = minEntryDate();
      date.max = todayIso();
      date.value = entry ? entry.tarih : todayIso();
      $('#ts-note').value = entry ? entry.not : '';
      updateCounter();
      $('#ts-delete').hidden = !entry;
      setError('');
      setBusy(false);
      closeList();
      $('#ts-dialog').showModal();
      (dlg.taskId ? $('#ts-hours') : $('#ts-task-input')).focus();
      if (!dlg.taskId) openList();
    }

    async function save() {
      if (dlg.busy) return;
      setError('');
      const task = dlg.taskId && taskOf(dlg.taskId);
      if (!dlg.taskId || (!task && !dlg.entry)) { setError('Listeden bir görev seçin.'); $('#ts-task-input').focus(); return; }
      if (task && !isSelectable(task) && !(dlg.entry && dlg.entry.gorevId === task.id)) {
        setError('Bu görev 30 günden önce tamamlandı; zaman girişi yapılamaz.');
        return;
      }
      const hours = parseHours($('#ts-hours').value);
      if (hours.error) { setError(hours.error); $('#ts-hours').focus(); return; }
      const tarih = $('#ts-date').value;
      if (!isIso(tarih)) { setError('Geçerli bir tarih seçin.'); $('#ts-date').focus(); return; }
      if (tarih > todayIso()) { setError('Gelecek bir tarihe zaman girişi yapılamaz.'); $('#ts-date').focus(); return; }
      if (tarih < minEntryDate()) { setError(`En fazla ${EDIT_DAYS} gün öncesine zaman girişi yapılabilir.`); $('#ts-date').focus(); return; }
      const note = $('#ts-note').value.trim();
      if (note.length > NOTE_MAX) { setError(`Not en fazla ${NOTE_MAX} karakter olabilir.`); return; }

      setBusy(true);
      const me = app.me();
      try {
        // A person can't log more than 24 hours on one day.
        const sameDay = toEntries(await app.store().get('timesheets', query({ orderBy: 'tarih', equalTo: tarih })));
        const already = sum(sameDay.filter((e) => e.kullanici === me && (!dlg.entry || e.id !== dlg.entry.id)));
        if (already + hours.value > MAX_HOURS + 1e-9) {
          setBusy(false);
          const left = Math.max(0, MAX_HOURS - already);
          setError(`${dateFmt.format(parseIso(tarih))} için zaten ${formatHours(already)} girişiniz var; günlük toplam ${MAX_HOURS} saati aşamaz${left ? ` (en fazla ${formatHours(left)} daha girebilirsiniz)` : ''}.`);
          $('#ts-hours').focus();
          return;
        }
        const id = dlg.entry ? dlg.entry.id : app.uid();
        const now = new Date().toISOString();
        const value = {
          gorevId: dlg.taskId,
          kullanici: me,
          tarih,
          gun: dayNumber(tarih),
          saat: hours.value,
          gorevAdi: (task ? task.gorev : dlg.entry.gorevAdi).slice(0, 1000),
          alan: (task ? task.alan : dlg.entry.alan).slice(0, 200),
          createdAt: dlg.entry ? (dlg.entry.createdAt || now) : now,
          updatedAt: now,
        };
        const no = task ? task.no : dlg.entry.gorevNo;
        if (no) value.gorevNo = no;
        if (note) value.not = note;
        await app.store().put(`timesheets/${id}`, value);
        const saved = normalizeEntry(id, value);
        const prevTask = dlg.entry ? dlg.entry.gorevId : null;
        upsertLocal(saved);
        setBusy(false);
        $('#ts-dialog').close();
        app.toast(dlg.entry ? 'Zaman girişi güncellendi.' : `${formatHours(hours.value)} kaydedildi.`);
        renderBody();
        app.onEntriesChanged(saved.gorevId);
        if (prevTask && prevTask !== saved.gorevId) app.onEntriesChanged(prevTask);
      } catch (err) {
        setBusy(false);
        setError(friendlyError(err, 'Kaydedilemedi.'));
      }
    }

    async function deleteEntry(e) {
      if (!isOwn(e) || !canEditDate(e.tarih)) { alert(`Yalnızca kendi girişlerinizi ve son ${EDIT_DAYS} gün içindekileri silebilirsiniz.`); return false; }
      if (!confirm(`${formatHours(e.saat)} tutarındaki "${entryTitle(e)}" girişi silinsin mi?`)) return false;
      try {
        await app.store().remove(`timesheets/${e.id}`);
      } catch (err) {
        alert(friendlyError(err, 'Giriş silinemedi.'));
        return false;
      }
      if (S.entries) S.entries = S.entries.filter((x) => x.id !== e.id);
      renderBody();
      app.toast('Zaman girişi silindi.');
      app.onEntriesChanged(e.gorevId);
      return true;
    }

    setupToolbar();
    setupDialog();

    // The page (sidebar) decides which tab is shown: 'entries' | 'report'.
    function setTab(tab) {
      S.tab = tab === 'report' ? 'report' : 'entries';
    }

    return { render, load, openEntry, setTab, tab: () => S.tab, taskEntries, isSelectable, formatHours, sum, isOpen: () => $('#ts-dialog').open };
  }

  window.TaskTimesheet = { create, parseHours, presetRange, dayNumber };
})();
