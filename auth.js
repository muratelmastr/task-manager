// Sign-in with e-mail/password – no SDK. Two backends with the same interface:
//   cfg.apiUrl  -> the Azure API (api/src/lib/auth.js): /auth/login, /auth/refresh, /auth/reset-*
//   cfg.apiKey  -> Firebase Authentication (Identity Toolkit REST API; kept for rollback)
// The session (refresh token + short-lived ID token) is kept in localStorage until sign-out.
(() => {
  'use strict';

  const FIREBASE_SESSION_KEY = 'taskManager.auth.v1';
  const AZURE_SESSION_KEY = 'taskManager.auth.v2';
  const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
  const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
  const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh before the 1h ID token expires
  const MIN_FORCED_REFRESH_MS = 60 * 1000;

  const MESSAGES = {
    INVALID_LOGIN_CREDENTIALS: 'E-posta veya şifre hatalı.',
    INVALID_PASSWORD: 'E-posta veya şifre hatalı.',
    EMAIL_NOT_FOUND: 'E-posta veya şifre hatalı.',
    INVALID_EMAIL: 'Geçerli bir e-posta adresi girin.',
    MISSING_PASSWORD: 'Şifrenizi girin.',
    MISSING_EMAIL: 'E-posta adresinizi girin.',
    USER_DISABLED: 'Bu hesap devre dışı bırakılmış. Yöneticinizle görüşün.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Çok fazla başarısız deneme yapıldı. Bir süre sonra tekrar deneyin.',
    OPERATION_NOT_ALLOWED: 'E-posta/şifre ile giriş Firebase projesinde etkin değil (README).',
    PASSWORD_LOGIN_DISABLED: 'E-posta/şifre ile giriş Firebase projesinde etkin değil (README).',
    API_KEY_INVALID: 'config.js içindeki apiKey değeri geçersiz.',
    TOKEN_EXPIRED: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
    USER_NOT_FOUND: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
    INVALID_REFRESH_TOKEN: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
    RESET_TOKEN_INVALID: 'Şifre belirleme bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Giriş ekranından yeni bir bağlantı isteyin.',
    WEAK_PASSWORD: 'Şifre en az 6 karakter olmalı.',
    SERVICE_UNAVAILABLE: 'Giriş servisine şu an ulaşılamıyor. Biraz sonra tekrar deneyin.',
    MAIL_NOT_CONFIGURED: 'E-posta gönderimi yapılandırılmamış. Yöneticinizle görüşün.',
  };
  // Refresh failures that mean the session can no longer be used.
  const SESSION_ENDED = new Set(['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN', 'INVALID_GRANT_TYPE', 'MISSING_REFRESH_TOKEN', 'PROJECT_NUMBER_MISMATCH']);

  class AuthError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  function errorCode(json) {
    const raw = (json && json.error && (json.error.message || json.error.status)) || (json && json.error_description) || '';
    return String(raw).split(/[\s:]/)[0] || 'UNKNOWN';
  }

  function loadSession(key) {
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && s.refreshToken && s.email) return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  // Endpoint calls of each backend. Responses use Firebase's field names.
  function firebaseBackend(cfg) {
    const apiKey = encodeURIComponent(cfg.apiKey);
    return {
      sessionKey: FIREBASE_SESSION_KEY,
      supportsReset: false,
      login: (post, email, password) => post(`${IDENTITY_URL}:signInWithPassword?key=${apiKey}`, { email, password, returnSecureToken: true }),
      refresh: async (post, refreshToken) => {
        const r = await post(`${TOKEN_URL}?key=${apiKey}`, { grant_type: 'refresh_token', refresh_token: refreshToken }, true);
        return { idToken: r.id_token, refreshToken: r.refresh_token, expiresIn: r.expires_in };
      },
      resetRequest: (post, email) => post(`${IDENTITY_URL}:sendOobCode?key=${apiKey}`, { requestType: 'PASSWORD_RESET', email }),
      resetConfirm: () => { throw new AuthError('UNSUPPORTED', 'Desteklenmiyor.'); },
    };
  }

  function azureBackend(cfg) {
    const base = String(cfg.apiUrl).replace(/\/+$/, '');
    return {
      sessionKey: AZURE_SESSION_KEY,
      supportsReset: true,
      login: (post, email, password) => post(`${base}/auth/login`, { email, password }),
      refresh: (post, refreshToken) => post(`${base}/auth/refresh`, { refreshToken }),
      resetRequest: (post, email) => post(`${base}/auth/reset-request`, { email }),
      resetConfirm: (post, token, password) => post(`${base}/auth/reset-confirm`, { token, password }),
    };
  }

  function createAuth(cfg) {
    const backend = cfg.apiUrl ? azureBackend(cfg) : firebaseBackend(cfg);
    const SESSION_KEY = backend.sessionKey;
    let session = loadSession(SESSION_KEY);
    let refreshing = null;
    let lastRefreshAt = 0;
    const listeners = new Set();

    function persist() {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    }

    async function post(url, body, form = false) {
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
          body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
          cache: 'no-store',
        });
      } catch (err) {
        throw new AuthError('network', 'Sunucuya ulaşılamadı (internet bağlantısını kontrol edin).');
      }
      let json = null;
      try { json = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok) {
        const code = errorCode(json);
        throw new AuthError(code, MESSAGES[code] || `Giriş yapılamadı (${code}).`);
      }
      return json || {};
    }

    function setTokens(idToken, refreshToken, expiresIn) {
      session.idToken = idToken;
      session.refreshToken = refreshToken || session.refreshToken;
      session.expiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
      lastRefreshAt = Date.now();
      persist();
    }

    function end(reason) {
      session = null;
      persist();
      listeners.forEach((fn) => fn(reason));
    }

    async function refresh() {
      if (!session) throw new AuthError('signed-out', 'Oturum açılmamış.');
      if (!refreshing) {
        const current = session;
        refreshing = backend.refresh(post, current.refreshToken)
          .then((r) => { if (session === current) setTokens(r.idToken, r.refreshToken, r.expiresIn); })
          .catch((err) => {
            if (SESSION_ENDED.has(err.code) && session === current) end(err.message);
            throw err;
          })
          .finally(() => { refreshing = null; });
      }
      await refreshing;
    }

    function start(r, email) {
      session = { uid: r.localId, email: String(r.email || email).trim().toLowerCase() };
      setTokens(r.idToken, r.refreshToken, r.expiresIn);
      return session;
    }

    return {
      get session() { return session; },
      get email() { return session ? session.email : ''; },
      sessionKey: SESSION_KEY,
      supportsReset: backend.supportsReset,

      async signIn(email, password) {
        const r = await backend.login(post, String(email).trim(), password);
        return start(r, email);
      },

      async sendPasswordReset(email) {
        try {
          await backend.resetRequest(post, String(email).trim());
        } catch (err) {
          // Don't reveal whether an address has an account.
          if (err.code !== 'EMAIL_NOT_FOUND') throw err;
        }
      },

      // Sets a new password with the token from the e-mailed link and signs in.
      async confirmPasswordReset(token, password) {
        const r = await backend.resetConfirm(post, token, password);
        return start(r, r.email);
      },

      // Returns a valid ID token, refreshing it when it is about to expire.
      // force: refresh even if not expired (used after a 401), at most once a minute.
      async getToken(force = false) {
        if (!session) throw new AuthError('signed-out', 'Oturum açılmamış.');
        const stale = !session.idToken || !session.expiresAt || session.expiresAt - Date.now() < REFRESH_MARGIN_MS;
        if (stale || (force && Date.now() - lastRefreshAt > MIN_FORCED_REFRESH_MS)) await refresh();
        return session.idToken;
      },

      signOut() {
        session = null;
        persist();
      },

      onSessionEnded(fn) { listeners.add(fn); },
    };
  }

  window.TaskAuth = { createAuth, AuthError, SESSION_KEY: FIREBASE_SESSION_KEY, AZURE_SESSION_KEY };
})();
