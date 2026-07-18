// Schmaler API-Client für cubory-api mit automatischem Token-Refresh.
const API_BASE = process.env.CUBORY_API_URL || 'https://api.cubory.app';

class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code || 'unknown';
  }
}

class HttpClient {
  /** tokenSource: { accessToken(), refreshTokens() } - liefert der AuthManager */
  constructor(base = API_BASE) {
    this.base = base;
    this.tokenSource = null;
  }

  async request(method, path, body, { auth = true, retry = true } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth && this.tokenSource) {
      const token = this.tokenSource.accessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const e = new ApiError(0, 'offline', 'Keine Verbindung zum Lizenzserver');
      e.cause = err;
      throw e;
    }

    if (res.status === 401 && auth && retry && this.tokenSource?.refreshTokens) {
      const refreshed = await this.tokenSource.refreshTokens();
      if (refreshed) return this.request(method, path, body, { auth, retry: false });
    }
    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, data?.error?.code, data?.error?.message);
    }
    return data;
  }

  get(path, opts) { return this.request('GET', path, undefined, opts); }
  post(path, body, opts) { return this.request('POST', path, body, opts); }
  del(path, opts) { return this.request('DELETE', path, undefined, opts); }
}

module.exports = { HttpClient, ApiError, API_BASE };
