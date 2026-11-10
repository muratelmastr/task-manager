// Microsoft sign-in (MSAL) and a small Microsoft Graph client for SharePoint lists.
(() => {
  'use strict';

  const MSAL_URL = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.30.0/lib/msal-browser.min.js';
  const MSAL_SRI = 'sha384-RGxxfG5yRS8DLU7ZJ8OoLhbV/BsJFHyPuMVHrTLbpj3t5Z15LnviJmaznKY/a7LZ';
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const BATCH_SIZE = 20;
  const MAX_RETRIES = 4;

  const TASK_COLUMNS = ['TaskId', 'Alan', 'Sahip', 'Durum', 'TamamlanmaTarihi', 'CompletedAt'];
  const SETTINGS_COLUMNS = ['Degerler'];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadMsal() {
    if (window.msal) return Promise.resolve(window.msal);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MSAL_URL;
      s.integrity = MSAL_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.msal);
      s.onerror = () => reject(new Error('Microsoft oturum kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).'));
      document.head.append(s);
    });
  }

  async function createAuth(cfg) {
    const msal = await loadMsal();
    const pca = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
        redirectUri: window.location.origin + window.location.pathname,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    const result = await pca.handleRedirectPromise();
    let account = (result && result.account) || pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
    if (account) pca.setActiveAccount(account);
    const scopes = cfg.scopes && cfg.scopes.length ? cfg.scopes : ['Sites.Manage.All'];

    return {
      account: () => account,
      login: () => pca.loginRedirect({ scopes, prompt: 'select_account' }),
      logout: () => pca.logoutRedirect({ account }),
      async getToken() {
        try {
          return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
        } catch (err) {
          if (err instanceof msal.InteractionRequiredAuthError) {
            await pca.acquireTokenRedirect({ scopes, account });
            return new Promise(() => {}); // page is navigating away
          }
          throw err;
        }
      },
    };
  }

  class GraphError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  function retryDelay(headers, attempt) {
    const ra = Number(headers && (typeof headers.get === 'function' ? headers.get('Retry-After') : headers['Retry-After'] || headers['retry-after']));
    return (Number.isFinite(ra) && ra > 0 ? ra : 2 ** attempt) * 1000;
  }

  const retryable = (status) => status === 429 || status === 503 || status === 504;

  function createGraph(getToken, cfg) {
    async function request(method, path, body, attempt = 0) {
      const token = await getToken();
      let res;
      try {
        res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        throw new GraphError(0, 'Sunucuya ulaşılamadı (internet bağlantısını kontrol edin).', 'network');
      }
      if (retryable(res.status) && attempt < MAX_RETRIES) {
        await sleep(retryDelay(res.headers, attempt));
        return request(method, path, body, attempt + 1);
      }
      if (!res.ok) {
        let msg = res.statusText;
        let code;
        try { const j = await res.json(); msg = (j.error && j.error.message) || msg; code = j.error && j.error.code; } catch (e) { /* not json */ }
        throw new GraphError(res.status, `${res.status} ${msg}`, code);
      }
      return res.status === 204 ? null : res.json();
    }

    async function getAll(path) {
      const out = [];
      let next = path;
      while (next) {
        const page = await request('GET', next);
        out.push(...page.value);
        next = page['@odata.nextLink'];
      }
      return out;
    }

    // requests: [{ method, url, body }] (url relative to /v1.0). Returns [{ status, body }] in the same order.
    async function batch(requests) {
      const results = new Array(requests.length);
      for (let start = 0; start < requests.length; start += BATCH_SIZE) {
        let pending = requests.slice(start, start + BATCH_SIZE).map((r, i) => ({ ...r, index: start + i }));
        for (let attempt = 0; pending.length; attempt += 1) {
          const payload = {
            requests: pending.map((r) => ({
              id: String(r.index),
              method: r.method,
              url: r.url,
              ...(r.body ? { headers: { 'Content-Type': 'application/json' }, body: r.body } : {}),
            })),
          };
          const res = await request('POST', '/$batch', payload);
          const retry = [];
          let wait = 0;
          for (const r of res.responses) {
            const idx = Number(r.id);
            if (retryable(r.status) && attempt < MAX_RETRIES) {
              retry.push(pending.find((p) => p.index === idx));
              wait = Math.max(wait, retryDelay(r.headers, attempt));
            } else {
              results[idx] = { status: r.status, body: r.body };
            }
          }
          pending = retry;
          if (pending.length) await sleep(wait);
        }
      }
      return results;
    }

    async function resolveSite() {
      let url;
      try { url = new URL(cfg.siteUrl); } catch (e) { throw new GraphError(0, `Geçersiz SharePoint site adresi: ${cfg.siteUrl}`); }
      const full = decodeURIComponent(url.pathname);
      const m = full.match(/^\/(sites|teams)\/[^/]+/i);
      const path = m ? m[0] : '';
      const site = await request('GET', path ? `/sites/${url.hostname}:${encodeURI(path)}` : `/sites/${url.hostname}`);
      return site;
    }

    async function ensureList(siteId, name, columns) {
      const lists = await getAll(`/sites/${siteId}/lists?$select=id,name,displayName`);
      let list = lists.find((l) => l.displayName === name || l.name === name);
      try {
        if (!list) {
          list = await request('POST', `/sites/${siteId}/lists`, {
            displayName: name,
            columns: columns.map((c) => ({ name: c, text: c === 'Degerler' ? { allowMultipleLines: true, textType: 'plain' } : {} })),
            list: { template: 'genericList' },
          });
        } else {
          const existing = await getAll(`/sites/${siteId}/lists/${list.id}/columns?$select=name`);
          for (const c of columns) {
            if (!existing.some((e) => e.name === c)) {
              await request('POST', `/sites/${siteId}/lists/${list.id}/columns`, {
                name: c,
                text: c === 'Degerler' ? { allowMultipleLines: true, textType: 'plain' } : {},
              });
            }
          }
        }
      } catch (err) {
        if (err.status === 403) {
          throw new GraphError(403, `"${name}" listesi oluşturulamadı/güncellenemedi: yetki yok. Uygulamaya Sites.Manage.All izni verin veya listeyi SharePoint'te elle oluşturun (README).`);
        }
        throw err;
      }
      return list.id;
    }

    async function connect() {
      const site = await resolveSite();
      const taskListId = await ensureList(site.id, cfg.taskListName || 'Gorevler', TASK_COLUMNS);
      const settingsListId = await ensureList(site.id, cfg.settingsListName || 'GorevAyarlari', SETTINGS_COLUMNS);
      return { siteId: site.id, siteName: site.displayName || site.name || '', siteWebUrl: site.webUrl || cfg.siteUrl, taskListId, settingsListId };
    }

    function listItems(siteId, listId, columns) {
      const select = ['Title', ...columns].join(',');
      return getAll(`/sites/${siteId}/lists/${listId}/items?$expand=fields($select=${select})&$top=999`);
    }

    return {
      connect,
      batch,
      fetchTasks: (ids) => listItems(ids.siteId, ids.taskListId, TASK_COLUMNS),
      fetchSettings: (ids) => listItems(ids.siteId, ids.settingsListId, SETTINGS_COLUMNS),
    };
  }

  window.TaskCloud = { createAuth, createGraph, GraphError };
})();
