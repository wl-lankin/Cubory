// OTA-Updates über electron-updater gegen den generic Feed
// (https://cubory.app/downloads). Downloads laufen im Hintergrund;
// installiert wird erst, wenn der Nutzer zustimmt oder die App beendet wird.
//
// Hinweis macOS: Squirrel.Mac verlangt eine signierte App - ohne Code-
// signing meldet der Updater dort einen Fehler und wird still deaktiviert.
// Windows (NSIS) funktioniert auch unsigniert.
const { app } = require('electron');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000;

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

  /** Update jetzt installieren (Neustart). */
  install() {
    if (this.state.status === 'ready') this.autoUpdater?.quitAndInstall();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}

module.exports = { UpdateManager };
