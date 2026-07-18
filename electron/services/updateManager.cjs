// OTA-Updates über electron-updater gegen den generic Feed
// (https://cubory.app/downloads). Downloads laufen im Hintergrund;
// installiert wird erst, wenn der Nutzer zustimmt oder die App beendet wird.
//
// macOS-Fallback: Squirrel.Mac verlangt eine signierte App. Ist die App
// nicht signiert, prüfen wir den Feed selbst (latest-mac.yml) und bieten
// den Download der neuen DMG im Browser an ('manual'-Status) - sobald ein
// Developer-ID-Zertifikat da ist, greift automatisch der volle OTA-Pfad.
const { app, shell } = require('electron');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000;
const FEED_URL = process.env.CUBORY_UPDATE_FEED || 'https://cubory.app/downloads';

// Grob-Check: signierte macOS-Apps tragen einen CodeResources-Eintrag
function macAppIsSigned() {
  if (process.platform !== 'darwin') return true;
  try {
    require('fs').accessSync(require('path').join(process.resourcesPath, '..', '_CodeSignature', 'CodeResources'));
    return true;
  } catch {
    return false;
  }
}

function newerVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

class UpdateManager {
  /** @param onState (state)=>void - {status, version?, percent?} an den Renderer */
  constructor(onState) {
    this.onState = onState || (() => {});
    this.state = { status: 'idle' };
    this.autoUpdater = null;
    this._timer = null;
  }

  _set(state) {
    this.state = state;
    this.onState(state);
  }

  start() {
    if (!app.isPackaged) return; // im Dev-Modus gibt es keinen Feed
    if (!macAppIsSigned()) {
      // Unsignierte macOS-App: manueller Update-Pfad über den Feed
      this.check = () => this._checkManual();
      this.check();
      this._timer = setInterval(() => this.check(), CHECK_INTERVAL);
      return;
    }
    try {
      const { autoUpdater } = require('electron-updater');
      this.autoUpdater = autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('update-available', (info) => {
        this._set({ status: 'downloading', version: info.version });
      });
      autoUpdater.on('download-progress', (p) => {
        this._set({ status: 'downloading', version: this.state.version, percent: Math.round(p.percent) });
      });
      autoUpdater.on('update-downloaded', (info) => {
        this._set({ status: 'ready', version: info.version });
      });
      autoUpdater.on('error', () => {
        // z.B. unsignierte macOS-App oder offline - still bleiben, Free-Prinzip
        this._set({ status: 'idle' });
      });

      this.check();
      this._timer = setInterval(() => this.check(), CHECK_INTERVAL);
    } catch {
      // electron-updater fehlt (Dev) - ignorieren
    }
  }

  check() {
    this.autoUpdater?.checkForUpdates().catch(() => {});
  }

  /** Update jetzt installieren (Neustart) bzw. Download-Seite öffnen. */
  install() {
    if (this.state.status === 'ready') this.autoUpdater?.quitAndInstall();
    if (this.state.status === 'manual' && this.state.url) shell.openExternal(this.state.url);
  }

  /** macOS-Fallback ohne Signatur: latest-mac.yml selbst lesen. */
  async _checkManual() {
    try {
      const res = await fetch(`${FEED_URL}/latest-mac.yml`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return;
      const yml = await res.text();
      const version = /^version:\s*(\S+)/m.exec(yml)?.[1];
      if (!version || !newerVersion(version, app.getVersion())) return;
      // passende DMG für die Architektur aus dem Feed suchen
      const files = [...yml.matchAll(/url:\s*(\S+\.dmg)/g)].map((m) => m[1]);
      const arm = process.arch === 'arm64';
      const file = files.find((f) => arm === /arm64/.test(f)) || files[0];
      if (!file) return;
      this._set({ status: 'manual', version, url: `${FEED_URL}/${encodeURIComponent(file)}` });
    } catch {
      // offline o.ä. - still bleiben
    }
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}

module.exports = { UpdateManager };
