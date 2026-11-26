// Görev raporu: per person / area summary of the tasks worked on in a period (uses only task data).
// A task counts as "worked on" by its owner (sahip) when it was open at some point in the period:
//   created ≤ period end AND (not completed OR completed ≥ period start).
// Closed  = completed within the period.   Ongoing = worked on and still open at the end of the period.
// New     = created within the period.     Overdue = ongoing with a due date before min(period end, today).
(() => {
  'use strict';

  const NONE = '__none__';

  // app: { $, el, icon, DONE, tasks(), lists(), fullNameOf(name), buildAvatar, toneFor, loadSheetJs, isLoading() }
  function create(app) {
    const { $, el, icon, DONE } = app;
    const U = window.TaskTimesheet.util;
    const num = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
    const S = { preset: 'thisMonth', custom: U.presetRange('thisMonth'), kisi: '', alan: '' };

    const range = () => U.presetRange(S.preset, S.custom);
    const dayOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : U.isoOf(d); };
    const ownerName = (key) => (key ? app.fullNameOf(key) : '(Atanmamış)');
    const alanName = (key) => key || '(Alan yok)';
    const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

    // ---------- Metrics ----------

    // One row per task that was open during the period, with its state at the end of the period.
    function periodRows() {
      const [from, to] = range();
      const today = U.todayIso();
      const ref = to < today ? to : today;
      const rows = [];
      for (const t of app.tasks()) {
        const done = t.durum === DONE;
        const closedDay = done ? dayOf(t.completedAt) : null;
        if (done && !closedDay) continue; // completion date unknown (old data)
        const createdDay = dayOf(t.createdAt) || '0000-01-01';
        if (createdDay > to || (done && closedDay < from)) continue;
        const closed = done && closedDay <= to;
        rows.push({
          task: t,
          createdDay,
          closedDay: closed ? closedDay : null,
          closed,
          ongoing: !closed,
          isNew: createdDay >= from,
          overdue: !closed && !!t.tamamlanmaTarihi && t.tamamlanmaTarihi < ref,
        });
      }
      return rows;
    }

    function filtered() {
      let rows = periodRows();
      if (S.kisi) rows = rows.filter((r) => (r.task.sahip || NONE) === S.kisi);
      if (S.alan) rows = rows.filter((r) => (r.task.alan || NONE) === S.alan);
      return rows;
    }

    const emptyCounts = () => ({ worked: 0, closed: 0, ongoing: 0, created: 0, overdue: 0 });
    function addTo(c, r) {
      c.worked += 1;
      if (r.closed) c.closed += 1;
      if (r.ongoing) c.ongoing += 1;
      if (r.isNew) c.created += 1;
      if (r.overdue) c.overdue += 1;
      return c;
    }
    const totals = (rows) => rows.reduce(addTo, emptyCounts());

    function groupBy(rows, keyFn, nameFn) {
      const map = new Map();
      for (const r of rows) {
        const k = keyFn(r);
        if (!map.has(k)) map.set(k, { key: k, ...emptyCounts() });
        addTo(map.get(k), r);
      }
      return [...map.values()].sort((a, b) => b.worked - a.worked || b.closed - a.closed
        || (!a.key) - (!b.key) || nameFn(a.key).localeCompare(nameFn(b.key), 'tr'));
    }
    const byPerson = (rows) => groupBy(rows, (r) => r.task.sahip || '', ownerName);
    const byAlan = (rows) => groupBy(rows, (r) => r.task.alan || '', alanName);

    // ---------- Toolbar ----------

    function setupToolbar() {
      $('#rp-period').addEventListener('change', (e) => {
        S.preset = e.target.value;
        if (S.preset === 'custom') {
          $('#rp-from').value = S.custom[0];
          $('#rp-to').value = S.custom[1];
        }
        render();
      });
      const onCustom = () => {
        let from = $('#rp-from').value;
        let to = $('#rp-to').value;
        if (!U.isIso(from) || !U.isIso(to)) return;
        if (from > to) [from, to] = [to, from];
        S.custom = [from, to];
        $('#rp-from').value = from;
        $('#rp-to').value = to;
        render();
      };
      $('#rp-from').addEventListener('change', onCustom);
      $('#rp-to').addEventListener('change', onCustom);
      $('#rp-kisi').addEventListener('change', (e) => { S.kisi = e.target.value; render(); });
      $('#rp-alan').addEventListener('change', (e) => { S.alan = e.target.value; render(); });
      $('#rp-export').addEventListener('click', exportXlsx);
    }

    function fillSelect(select, options, value) {
      select.replaceChildren(...options.map(([v, label]) => el('option', { value: v, textContent: label })));
      select.value = options.some(([v]) => v === value) ? value : '';
      return select.value;
    }

    function syncToolbar() {
      $('#rp-period').value = S.preset;
      $('#rp-custom').hidden = S.preset !== 'custom';
      const owners = [...app.lists().sahip];
      const alanlar = [...app.lists().alan];
      for (const t of app.tasks()) {
        if (t.sahip && !owners.includes(t.sahip)) owners.push(t.sahip);
        if (t.alan && !alanlar.includes(t.alan)) alanlar.push(t.alan);
      }
      S.kisi = fillSelect($('#rp-kisi'), [['', 'Tümü'], ...owners.map((o) => [o, app.fullNameOf(o)]), [NONE, '(Atanmamış)']], S.kisi);
      S.alan = fillSelect($('#rp-alan'), [['', 'Tümü'], ...alanlar.map((a) => [a, a]), [NONE, '(Alan yok)']], S.alan);
      const [from, to] = range();
      $('#rp-range').textContent = U.rangeLabel(from, to);
    }

    // ---------- Rendering ----------

    function render() {
      const body = $('#rp-body');
      if (!body) return;
      syncToolbar();
      if (app.isLoading()) {
        body.setAttribute('aria-busy', 'true');
        body.replaceChildren(el('div', { class: 'ts-card ts-loading', 'aria-label': 'Yükleniyor' },
          ...[60, 85, 70, 90].map((w) => el('span', { class: 'skeleton', style: `width:${w}%` }))));
        return;
      }
      body.removeAttribute('aria-busy');
      body.replaceChildren(...buildReport(filtered()));
    }

    function emptyState() {
      return el('div', { class: 'empty-state ts-empty' },
        el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon('chart', 'icon-lg')),
        el('p', { class: 'empty-title', textContent: 'Bu dönemde görev yok' }),
        el('p', { class: 'empty-text', textContent: 'Seçili dönem ve filtreler için raporlanacak görev yok.' }));
    }

    const whoCell = (key) => el('span', { class: 'ts-who' }, app.buildAvatar(key, 'avatar-sm'), el('span', { class: key ? '' : 'ts-muted', textContent: ownerName(key) }));
    const alanTag = (alan) => (alan
      ? el('span', { class: `tag tone-${app.toneFor('alan', alan)}`, textContent: alan })
      : el('span', { class: 'ts-muted', textContent: '(Alan yok)' }));
    const countCell = (n, cls = '') => el('td', { class: `num${n ? '' : ' is-zero'}${cls ? ` ${cls}` : ''}`, textContent: n ? num.format(n) : '–' });

    function rateBar(closed, worked) {
      const p = pct(closed, worked);
      return el('span', { class: 'ts-bar-cell', title: `${closed} / ${worked} kapatıldı` },
        el('span', { class: 'ts-bar', 'aria-hidden': 'true' }, el('span', { class: 'ts-bar-fill rp-bar-fill', style: `width:${p}%` })),
        el('span', { class: 'ts-pct', textContent: `%${num.format(p)}` }));
    }

    const COUNT_HEADERS = [
      { label: 'Çalışılan', cls: 'num', title: 'Dönem içinde açık olan görevler' },
      { label: 'Kapatılan', cls: 'num', title: 'Dönem içinde tamamlanan görevler' },
      { label: 'Devam eden', cls: 'num', title: 'Dönem sonunda hâlâ açık olan görevler' },
      { label: 'Yeni', cls: 'num', title: 'Dönem içinde oluşturulan görevler' },
      { label: 'Geciken', cls: 'num', title: 'Devam edenlerden tamamlanma tarihi geçmiş olanlar' },
      { label: 'Kapanma', cls: 'bar-col', title: 'Kapatılan / Çalışılan' },
    ];
    const countCells = (c, strong = false) => [
      countCell(c.worked, 'strong'),
      countCell(c.closed, strong ? 'strong' : ''),
      countCell(c.ongoing, strong ? 'strong' : ''),
      countCell(c.created, strong ? 'strong' : ''),
      countCell(c.overdue, `rp-overdue${strong ? ' strong' : ''}`),
      el('td', {}, rateBar(c.closed, c.worked)),
    ];
    const headRow = (headers) => el('tr', {}, ...headers.map((h) => el('th', { class: h.cls || '', title: h.title || '', textContent: h.label })));

    function countTable(title, iconName, firstHeader, groups, firstCell, total) {
      return el('section', { class: 'ts-card ts-report-card' },
        el('h3', { class: 'ts-card-title' }, icon(iconName, 'icon-sm'), title),
        el('div', { class: 'ts-table-wrap' },
          el('table', { class: 'ts-table rp-table' },
            el('thead', {}, headRow([{ label: firstHeader }, ...COUNT_HEADERS])),
            el('tbody', {}, ...groups.map((g) => el('tr', { dataset: { key: g.key } }, el('td', {}, firstCell(g.key)), ...countCells(g)))),
            el('tfoot', {}, el('tr', {}, el('td', { textContent: 'Toplam' }), ...countCells(total, true))))));
    }

    function buildReport(rows) {
      if (!rows.length) return [emptyState()];
      const total = totals(rows);
      const people = byPerson(rows);
      const alanlar = byAlan(rows);

      const kpi = (value, label, hint, cls = '') => el('div', { class: `ts-kpi${cls ? ` ${cls}` : ''}` },
        el('span', { class: 'ts-kpi-value', textContent: num.format(value) }),
        el('span', { class: 'ts-kpi-label', textContent: label }),
        hint ? el('span', { class: 'rp-kpi-hint', textContent: hint }) : null);
      const kpis = el('div', { class: 'ts-kpis rp-kpis' },
        kpi(total.worked, 'Çalışılan görev', `${people.length} kişi`),
        kpi(total.closed, 'Kapatılan', `%${num.format(pct(total.closed, total.worked))} kapanma`, 'rp-kpi-closed'),
        kpi(total.ongoing, 'Devam eden', 'dönem sonunda açık'),
        kpi(total.created, 'Yeni açılan', 'dönem içinde oluşturulan'),
        kpi(total.overdue, 'Geciken', 'devam edenlerden', total.overdue ? 'rp-kpi-overdue' : ''));

      const grid = el('div', { class: 'ts-report-grid rp-grid' },
        countTable('Kişi bazında', 'user', 'Kişi', people, whoCell, total),
        countTable('Alan bazında', 'board', 'Alan', alanlar, alanTag, total));
      return [kpis, grid, buildMatrix(rows, people, alanlar, total)];
    }

    function buildMatrix(rows, people, alanlar, total) {
      const cells = new Map();
      for (const r of rows) {
        const k = `${r.task.sahip || ''}\u0000${r.task.alan || ''}`;
        if (!cells.has(k)) cells.set(k, emptyCounts());
        addTo(cells.get(k), r);
      }
      const cell = (c) => (c && c.worked
        ? el('td', { class: 'num', title: `${c.closed} kapatıldı · ${c.ongoing} devam ediyor` }, el('strong', { textContent: num.format(c.closed) }), ` / ${num.format(c.worked)}`)
        : el('td', { class: 'num is-zero', textContent: '–' }));
      const head = el('tr', {}, el('th', { textContent: 'Kişi \\ Alan' }),
        ...alanlar.map((a) => el('th', { class: 'num', textContent: alanName(a.key) })),
        el('th', { class: 'num', textContent: 'Toplam' }));
      const body = people.map((p) => el('tr', { dataset: { key: p.key } },
        el('th', { scope: 'row' }, whoCell(p.key)),
        ...alanlar.map((a) => cell(cells.get(`${p.key}\u0000${a.key}`))),
        cell(p)));
      const foot = el('tr', {}, el('th', { scope: 'row', textContent: 'Toplam' }), ...alanlar.map(cell), cell(total));
      return el('section', { class: 'ts-card ts-report-card ts-report-wide' },
        el('h3', { class: 'ts-card-title' }, icon('sheet', 'icon-sm'), 'Kişi × Alan (kapatılan / çalışılan)'),
        el('div', { class: 'ts-table-wrap' },
          el('table', { class: 'ts-table ts-matrix' }, el('thead', {}, head), el('tbody', {}, ...body), el('tfoot', {}, foot))));
    }

    const stateRank = (r) => (r.overdue ? 0 : r.ongoing ? 1 : 2);
    const sortRows = (rows) => [...rows].sort((a, b) => stateRank(a) - stateRank(b)
      || (a.task.no || Infinity) - (b.task.no || Infinity) || a.createdDay.localeCompare(b.createdDay));
    const stateLabel = (r) => (r.closed ? 'Kapatıldı' : r.overdue ? 'Gecikmiş' : 'Devam ediyor');

    // ---------- Excel ----------

    async function exportXlsx() {
      const rows = filtered();
      if (!rows.length) { alert('Aktarılacak görev yok.'); return; }
      let XLSX;
      try {
        XLSX = await app.loadSheetJs();
      } catch (err) {
        alert(err.message);
        return;
      }
      const [from, to] = range();
      const total = totals(rows);
      const people = byPerson(rows);
      const alanlar = byAlan(rows);
      const wb = XLSX.utils.book_new();
      const add = (name, aoa, cols) => {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = cols.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      const countHead = ['Çalışılan', 'Kapatılan', 'Devam eden', 'Yeni', 'Geciken', 'Kapanma (%)'];
      const counts = (c) => [c.worked, c.closed, c.ongoing, c.created, c.overdue, pct(c.closed, c.worked)];
      const orNull = (d) => (d && d !== '0000-01-01' ? d : '');
      add('Görevler', [['No', 'Görev', 'Alan', 'Sahip', 'Ad Soyad', 'Dönem sonunda', 'Şu anki durum', 'Oluşturma', 'Tamamlanma tarihi', 'Kapanış'],
        ...sortRows(rows).map((r) => [r.task.no || '', r.task.gorev, r.task.alan, r.task.sahip, r.task.sahip ? app.fullNameOf(r.task.sahip) : '',
          stateLabel(r), r.task.durum, orNull(r.createdDay), r.task.tamamlanmaTarihi || '', r.closedDay || ''])],
      [6, 44, 22, 12, 20, 14, 16, 12, 16, 12]);
      add('Kişi', [['Kişi', 'Ad Soyad', ...countHead], ...people.map((g) => [g.key, ownerName(g.key), ...counts(g)]), ['Toplam', '', ...counts(total)]],
        [12, 22, 10, 10, 12, 8, 9, 12]);
      add('Alan', [['Alan', ...countHead], ...alanlar.map((g) => [alanName(g.key), ...counts(g)]), ['Toplam', ...counts(total)]],
        [26, 10, 10, 12, 8, 9, 12]);
      const cells = new Map();
      for (const r of rows) {
        const k = `${r.task.sahip || ''}\u0000${r.task.alan || ''}`;
        if (!cells.has(k)) cells.set(k, emptyCounts());
        addTo(cells.get(k), r);
      }
      const pair = (c) => (c && c.worked ? `${c.closed} / ${c.worked}` : '');
      add('Kişi x Alan', [['Kişi (kapatılan / çalışılan)', ...alanlar.map((a) => alanName(a.key)), 'Toplam'],
        ...people.map((p) => [ownerName(p.key), ...alanlar.map((a) => pair(cells.get(`${p.key}\u0000${a.key}`))), pair(p)]),
        ['Toplam', ...alanlar.map(pair), pair(total)]], [26, ...alanlar.map(() => 14), 10]);
      XLSX.writeFile(wb, `gorev-raporu-${from}_${to}.xlsx`);
    }

    setupToolbar();
    return { render };
  }

  window.TaskReport = { create };
})();
