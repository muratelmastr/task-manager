// Firebase Realtime Database REST client – no SDK, no login.
// Data layout:  /tasks/{key} = { id, gorev, alan, sahip, durum, tamamlanmaTarihi, completedAt, createdAt, updatedAt }
//               /lists/{alan|sahip|durum} = values separated by "\n"
(() => {
  'use strict';

  class CloudError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  // Firebase keys may not contain . # $ [ ] / or control characters.
  const encodeKey = (id) => String(id).replace(/[.#$[\]/%\u0000-\u001f\u007f]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function createStore(cfg) {
    let base;
    try {
      const u = new URL(cfg.databaseUrl);
      base = `${u.origin}`;
    } catch (e) {
      throw new CloudError(0, `Geçersiz veritabanı adresi: ${cfg.databaseUrl}`);
    }

    async function request(method, path, body) {
      for (let attempt = 0; ; attempt += 1) {
        let res;
        try {
          res = await fetch(`${base}/${path}.json`, {
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: 'no-store',
          });
        } catch (err) {
          throw new CloudError(0, 'Sunucuya ulaşılamadı (internet bağlantısını kontrol edin).', 'network');
        }
        if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 4) {
          await sleep(Math.min(Number(res.headers.get('Retry-After')) || 2 ** attempt, 10) * 1000);
          continue;
        }
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        if (!res.ok) {
          const msg = (json && json.error) || text || res.statusText;
          if (res.status === 401 || res.status === 403) throw new CloudError(res.status, `İzin reddedildi (${msg}). Veritabanı kurallarını kontrol edin (README).`, 'denied');
          if (res.status === 404) throw new CloudError(404, 'Veritabanı bulunamadı. config.js içindeki databaseUrl değerini kontrol edin.', 'notfound');
          throw new CloudError(res.status, `${res.status} ${msg}`);
        }
        return json;
      }
    }

    return {
      // Returns { tasks: [task...], lists: { key: [values] | undefined } }
      async fetchAll() {
        const [tasks, lists] = await Promise.all([request('GET', 'tasks'), request('GET', 'lists')]);
        return {
          tasks: Object.values(tasks || {}).filter((t) => t && typeof t === 'object'),
          lists: Object.fromEntries(Object.entries(lists || {}).map(([k, v]) => [k, String(v).split(/\r?\n/)])),
        };
      },
      // updates: [{ path: 'tasks/<id>' | 'lists/<key>', value | null }]
      // Returns per-update { ok, status, message }. Tries one atomic multi-path update first;
      // if the rules reject it, retries each path on its own so one bad write doesn't block the rest.
      async write(updates) {
        if (!updates.length) return [];
        const patch = Object.fromEntries(updates.map((u) => [u.path, u.value]));
        try {
          await request('PATCH', '', patch);
          return updates.map(() => ({ ok: true }));
        } catch (err) {
          if (err.code !== 'denied' || updates.length === 1) {
            if (updates.length === 1 && err.code === 'denied') return [{ ok: false, status: err.status, message: err.message }];
            throw err;
          }
        }
        const results = [];
        for (const u of updates) {
          try {
            await request('PATCH', '', { [u.path]: u.value });
            results.push({ ok: true });
          } catch (err) {
            if (err.code !== 'denied') throw err;
            results.push({ ok: false, status: err.status, message: err.message });
          }
        }
        return results;
      },
      encodeKey,
    };
  }

  window.TaskCloud = { createStore, CloudError, encodeKey };
})();
