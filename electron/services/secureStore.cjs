// Verschlüsselter Key-Value-Store im userData-Verzeichnis.
// Nutzt Electron safeStorage (macOS Keychain / Windows DPAPI / Linux Secret Service).
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

class SecureStore {
  constructor(filename = 'account.bin') {
    this.file = path.join(app.getPath('userData'), filename);
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.file);
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8');
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  _write() {
    const json = JSON.stringify(this.data);
    const raw = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    fs.writeFileSync(this.file, raw, { mode: 0o600 });
  }

  get(key) { return this.data[key]; }

  set(key, value) {
    this.data[key] = value;
    this._write();
  }

  delete(key) {
    delete this.data[key];
    this._write();
  }

  clear() {
    this.data = {};
    try { fs.unlinkSync(this.file); } catch { /* schon weg */ }
  }
}

module.exports = { SecureStore };
