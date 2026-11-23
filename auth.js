// Firebase Authentication (e-mail/password) via the Identity Toolkit REST API – no SDK.
// The session (refresh token + short-lived ID token) is kept in localStorage until sign-out.
(() => {
  'use strict';

  const SESSION_KEY = 'taskManager.auth.v1';
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

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (s && s.refreshToken && s.email) return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  function createAuth(cfg) {
    const apiKey = encodeURIComponent(cfg.apiKey);
    let session = loadSession();
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
        refreshing = post(`${TOKEN_URL}?key=${apiKey}`, { grant_type: 'refresh_token', refresh_token: current.refreshToken }, true)
          .then((r) => { if (session === current) setTokens(r.id_token, r.refresh_token, r.expires_in); })
          .catch((err) => {
            if (SESSION_ENDED.has(err.code) && session === current) end(err.message);
            throw err;
          })
          .finally(() => { refreshing = null; });
      }
      await refreshing;
    }

    return {
      get session() { return session; },
      get email() { return session ? session.email : ''; },

      async signIn(email, password) {
        const r = await post(`${IDENTITY_URL}:signInWithPassword?key=${apiKey}`, { email: String(email).trim(), password, returnSecureToken: true });
        session = { uid: r.localId, email: String(r.email || email).trim().toLowerCase() };
        setTokens(r.idToken, r.refreshToken, r.expiresIn);
        return session;
      },

      async sendPasswordReset(email) {
        try {
          await post(`${IDENTITY_URL}:sendOobCode?key=${apiKey}`, { requestType: 'PASSWORD_RESET', email: String(email).trim() });
        } catch (err) {
          // Don't reveal whether an address has an account.
          if (err.code !== 'EMAIL_NOT_FOUND') throw err;
        }
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

  window.TaskAuth = { createAuth, AuthError, SESSION_KEY };
})();
