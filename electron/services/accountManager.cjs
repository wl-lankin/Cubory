// AccountManager: Auth-, License- und Device-Logik im Main-Prozess.
// Der Renderer sieht nur den abgeleiteten Zustand (state()) und can().
const crypto = require('crypto');
const { HttpClient, ApiError } = require('./http.cjs');
const { getDeviceInfo, getFingerprint } = require('./fingerprint.cjs');

// Ed25519 Public Key des Lizenzservers (base64, raw 32 Byte).
// Dev-Key - für Produktions-Builds durch den Prod-Key ersetzen
// (CUBORY_LICENSE_PUBKEY überschreibt für Tests).
const LICENSE_PUBKEY_B64 =
  process.env.CUBORY_LICENSE_PUBKEY || 'NWH1G+2gyBog5d39DqKReAmkfZyUtyCPkkdAGbBmT68=';

// Node erwartet SPKI-DER; für Ed25519: fester Prefix + 32 Byte Raw-Key.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyLicenseToken(token) {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const payload = Buffer.from(token.slice(0, dot), 'base64url');
    const sig = Buffer.from(token.slice(dot + 1), 'base64url');
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(LICENSE_PUBKEY_B64, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    if (!crypto.verify(null, payload, key, sig)) return null;
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return null;
  }
}

const HEARTBEAT_INTERVAL = 24 * 60 * 60 * 1000;

class AccountManager {
  /** @param store SecureStore  @param appVersion string  @param onChange (state)=>void */
  constructor(store, appVersion, onChange) {
    this.store = store;
    this.appVersion = appVersion;
    this.onChange = onChange || (() => {});
    this.http = new HttpClient();
    this.http.tokenSource = {
      accessToken: () => this.store.get('access_token'),
      refreshTokens: () => this._refresh(),
    };
    this._heartbeatTimer = null;
  }

  /* ── abgeleiteter Zustand ────────────────────────────────────────────── */

  // Gültiges Lizenz-Token aus dem Store: Signatur + Gerät + Zeitfenster.
  _validToken() {
    const token = this.store.get('license_token');
    if (!token) return null;
    const payload = verifyLicenseToken(token);
    if (!payload) return null;
    if (payload.fingerprint_hash !== getFingerprint()) return null;
    // Clock-Tamper-Basisschutz: Uhr rückwärts hinter den letzten Kontakt → ungültig
    const lastSeen = this.store.get('last_seen_wallclock') || 0;
    const now = Date.now();
    if (now < lastSeen - 5 * 60 * 1000) return null;
    if (now >= new Date(payload.valid_until).getTime()) return null;
    return payload;
  }

  state() {
    const user = this.store.get('user') || null;
    const payload = this._validToken();
    const status = this.store.get('license_status') || null;
    return {
      signedIn: !!user,
      user,
      plan: payload ? payload.plan : 'free',
      kind: payload ? payload.kind : (user ? 'free' : 'anonymous'),
      entitlements: payload ? payload.entitlements : [],
      licenseExpiresAt: payload?.license_expires_at || null,
      trialDaysLeft: status?.trial_days_left ?? null,
      offlineSince: payload ? null : (user ? this.store.get('last_heartbeat_at') || null : null),
      needsVerification: !!user && !payload, // angemeldet, aber kein gültiges Token
    };
  }

  can(entitlement) {
    const payload = this._validToken();
    return !!payload && payload.entitlements.includes(entitlement);
  }

  _emit() { this.onChange(this.state()); }

  /* ── Auth ────────────────────────────────────────────────────────────── */

  async register(name, email, password) {
    const data = await this.http.post('/api/auth/register', { name, email, password }, { auth: false });
    this._storeSession(data);
    await this._activate();
    return this.state();
  }

  async login(email, password) {
    const data = await this.http.post('/api/auth/login', {
      email, password, device: getDeviceInfo(this.appVersion),
    }, { auth: false });
    this._storeSession(data);
    await this._activate();
    return this.state();
  }

  async logout() {
    const refresh = this.store.get('refresh_token');
    if (refresh) {
      await this.http.post('/api/auth/logout', { refresh_token: refresh }).catch(() => {});
    }
    this.stopHeartbeat();
    this.store.clear();
    this._emit();
  }

  _storeSession(data) {
    this.store.set('user', data.user);
    this.store.set('access_token', data.tokens.access_token);
    this.store.set('refresh_token', data.tokens.refresh_token);
  }

  async _refresh() {
    const refresh = this.store.get('refresh_token');
    if (!refresh) return false;
    try {
      const data = await this.http.post('/api/auth/refresh', { refresh_token: refresh }, { auth: false });
      this.store.set('access_token', data.tokens.access_token);
      this.store.set('refresh_token', data.tokens.refresh_token);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session serverseitig beendet → lokal abmelden, App bleibt als Free nutzbar
        this.store.delete('access_token');
        this.store.delete('refresh_token');
        this._emit();
      }
      return false;
    }
  }

  async verifyEmail(code) {
    const email = this.store.get('user')?.email;
    if (!email) throw new Error('Nicht angemeldet');
    await this.http.post('/api/auth/verify-email', { email, code }, { auth: false });
    const user = this.store.get('user');
    user.email_verified = true;
    this.store.set('user', user);
    this._emit();
    return this.state();
  }

  async deleteAccount(password) {
    await this.http.request('DELETE', '/api/account', { password });
    this.stopHeartbeat();
    this.store.clear();
    this._emit();
  }

  async resendVerifyCode() {
    const email = this.store.get('user')?.email;
    if (email) await this.http.post('/api/auth/resend-verification', { email }, { auth: false });
  }

  /* ── Lizenz ──────────────────────────────────────────────────────────── */

  async _activate() {
    const resp = await this.http.post('/api/license/activate', getDeviceInfo(this.appVersion));
    this._storeLicense(resp);
  }

  async heartbeat() {
    if (!this.store.get('user')) return;
    try {
      const resp = await this.http.post('/api/license/heartbeat', {
        fingerprint: getFingerprint(),
        app_version: this.appVersion,
      });
      this._storeLicense(resp);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'device_not_active') {
        // Gerät wurde im Portal deaktiviert → Token verwerfen
        this.store.delete('license_token');
        this._emit();
      } else if (err instanceof ApiError && err.status === 401) {
        // Session tot; _refresh hat schon aufgeräumt
      }
      // offline: still weiter - die 30-Tage-Karenz läuft
    }
    this.store.set('last_seen_wallclock', Date.now());
  }

  _storeLicense(resp) {
    this.store.set('license_token', resp.license_token);
    this.store.set('license_status', resp.status);
    this.store.set('last_heartbeat_at', new Date().toISOString());
    this.store.set('last_seen_wallclock', Date.now());
    this._emit();
  }

  startHeartbeat() {
    this.heartbeat(); // sofort beim Start
    this._heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  /* ── Billing ─────────────────────────────────────────────────────────── */

  async createCheckout(plan) {
    const data = await this.http.post('/api/subscription/create', { plan });
    return data.checkout_url;
  }

  async portalUrl() {
    const data = await this.http.get('/api/billing/portal');
    return data.portal_url;
  }

  /* ── Geräte ──────────────────────────────────────────────────────────── */

  async devices() {
    const data = await this.http.request('GET', '/api/devices', undefined, { auth: true });
    return data.devices;
  }

  async deactivateDevice(id) {
    await this.http.del(`/api/devices/${id}`);
    // eigenes Gerät deaktiviert? → Token weg, Zustand neu melden
    await this.heartbeat();
    return this.state();
  }
}

module.exports = { AccountManager, verifyLicenseToken };
