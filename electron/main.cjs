const { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { SecureStore } = require('./services/secureStore.cjs');
const { UpdateManager } = require('./services/updateManager.cjs');

let updates = null; // UpdateManager

let appStore = null; // SecureStore - merkt sich u.a. den zuletzt genutzten Ordner
let tray = null;
let isQuitting = false;

const SETTINGS_DEFAULTS = {
  autostart: false,
  restore_tabs: true,
  close_to_tray: false,
  intro: true,
};

function getSetting(key) {
  const v = appStore?.get('opt_' + key);
  return v === undefined ? SETTINGS_DEFAULTS[key] : v;
}

function applyAutostart(on) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on });
  } catch { /* Linux ohne Desktop-Integration */ }
}

const isGerman = () => app.getLocale().toLowerCase().startsWith('de');

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Cubory');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isGerman() ? 'Cubory öffnen' : 'Open Cubory', click: showMainWindow },
    { type: 'separator' },
    { label: isGerman() ? 'Beenden' : 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

function destroyTray() {
  tray?.destroy();
  tray = null;
}

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Für automatisierte Tests: eigenes Profil, damit die Single-Instance-Sperre
// eine parallel laufende Nutzer-Instanz nicht blockiert
if (process.env.CUBORY_TEST_USERDATA) {
  app.setPath('userData', process.env.CUBORY_TEST_USERDATA);
} else if (DEV_URL) {
  // Dev-Modus: eigenes Profil + keine Kollision mit laufender Installation
  app.setPath('userData', app.getPath('userData') + '-Dev');
}

let mainWindow = null;
// Datei, die per Doppelklick/„Öffnen mit" ankam, bevor das Fenster bereit war
let pendingFile = null;

const SUPPORTED = ['.dxf', '.dwg', '.step', '.stp', '.iges', '.igs', '.brep',
  '.stl', '.obj', '.3mf', '.ply', '.gltf', '.glb'];

// DWG → DXF über LibreDWG (dwg2dxf). Gesucht im PATH und an üblichen Orten.
const { execFileSync } = require('child_process');
const os = require('os');

function findDwg2dxf() {
  const candidates = process.platform === 'win32'
    ? ['dwg2dxf.exe', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreDWG', 'dwg2dxf.exe')]
    : ['dwg2dxf', '/opt/homebrew/bin/dwg2dxf', '/usr/local/bin/dwg2dxf', '/usr/bin/dwg2dxf'];
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 5000 });
      return c;
    } catch (err) {
      if (err.status !== undefined && err.status !== 127) return c; // existiert, meckert nur über Args
    }
  }
  return null;
}

function convertDwg(filePath) {
  const tool = findDwg2dxf();
  if (!tool) {
    // The renderer shows a translated message for the code.
    const err = new Error('DWG files need the free LibreDWG converter (dwg2dxf).');
    err.code = 'dwg_converter_missing';
    throw err;
  }
  const out = path.join(os.tmpdir(), `cubory-dwg-${Date.now()}.dxf`);
  try {
    execFileSync(tool, [filePath, '-o', out], { stdio: 'pipe', timeout: 60000 });
    return out;
  } catch (err) {
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out; // dwg2dxf warnt oft trotz Erfolg
    const e = new Error('The DWG file could not be converted.');
    e.code = 'dwg_convert_failed';
    throw e;
  }
}

function fileFromArgv(argv) {
  return argv
    .slice(1)
    .find((a) => SUPPORTED.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) || null;
}

function sendFileToRenderer(filePath) {
  if (!filePath) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
    rememberFile(filePath);
    mainWindow.webContents.send('open-file', safePayload(filePath));
  } else {
    pendingFile = filePath;
  }
}

function safePayload(filePath) {
  try {
    return readFilePayload(filePath);
  } catch (err) {
    return { name: path.basename(filePath), error: err.message, errorCode: err.code };
  }
}

function readFilePayload(filePath) {
  let readPath = filePath;
  let cleanup = null;
  if (path.extname(filePath).toLowerCase() === '.dwg') {
    readPath = convertDwg(filePath); // wirft mit verständlicher Meldung
    cleanup = readPath;
  }
  const buffer = fs.readFileSync(readPath);
  if (cleanup) { try { fs.unlinkSync(cleanup); } catch { /* egal */ } }
  return {
    name: path.basename(filePath),
    path: filePath,
    size: buffer.length,
    // .dwg wurde zu DXF konvertiert - der Loader entscheidet über diese Endung
    loadAs: path.extname(filePath).toLowerCase() === '.dwg' ? 'dxf' : undefined,
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0e2a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0a0e2a', symbolColor: '#eef0ff', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (getSetting('close_to_tray') && !isQuitting && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    // A file opened by double click joins the restored session instead of
    // replacing it.
    const paths = getSetting('restore_tabs')
      ? (appStore?.get('session_tabs') || []).filter((p) => {
        try { fs.accessSync(p); return true; } catch { return false; }
      })
      : [];
    if (pendingFile) {
      paths.push(pendingFile);
      pendingFile = null;
    }
    if (paths.length) mainWindow.webContents.send('restore-session', [...new Set(paths)]);
  });
}

// macOS: Datei per Doppelklick im Finder
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  sendFileToRenderer(filePath);
  // macOS keeps running without a window; a double click must bring one back.
  if (app.isReady() && (!mainWindow || mainWindow.isDestroyed())) createWindow();
  else showMainWindow();
});

// Windows/Linux: zweite Instanz reicht Datei an die erste weiter
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const file = fileFromArgv(argv);
    if (file) sendFileToRenderer(file);
    showMainWindow();
  });
}

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: appStore?.get('last_open_dir') || undefined,
    properties: ['openFile'],
    filters: [
      { name: isGerman() ? 'CAD-Dateien' : 'CAD files', extensions: ['dxf', 'dwg', 'step', 'stp', 'iges', 'igs', 'brep',
        'stl', 'obj', '3mf', 'ply', 'gltf', 'glb'] },
      { name: isGerman() ? 'Alle Dateien' : 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  rememberFile(result.filePaths[0]);
  return safePayload(result.filePaths[0]);
});

// Auch Doppelklick/„Öffnen mit" aktualisiert Ordner + Zuletzt-geöffnet-Liste
function rememberFile(filePath) {
  try {
    appStore?.set('last_open_dir', path.dirname(filePath));
    const recent = (appStore?.get('recent_files') || []).filter((r) => r.path !== filePath);
    recent.unshift({ path: filePath, name: path.basename(filePath) });
    appStore?.set('recent_files', recent.slice(0, 8));
  } catch { /* egal */ }
}

// Integrierter Datei-Browser: Ordnerinhalt (nur Ordner + CAD-Dateien)
ipcMain.handle('fs:listDir', (_event, dirPath) => {
  try {
    // The last folder may sit on a removed drive; fall back to home then.
    let target = path.resolve(dirPath || appStore?.get('last_open_dir') || app.getPath('home'));
    if (!dirPath && !fs.existsSync(target)) target = app.getPath('home');
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const dirs = [];
    const files = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(target, e.name);
      if (e.isDirectory()) {
        dirs.push({ name: e.name, path: full });
      } else if (SUPPORTED.includes(path.extname(e.name).toLowerCase())) {
        try {
          const st = fs.statSync(full);
          files.push({ name: e.name, path: full, size: st.size, mtime: st.mtimeMs,
            ext: path.extname(e.name).slice(1).toUpperCase() });
        } catch { /* unlesbar - überspringen */ }
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => b.mtime - a.mtime);
    const parent = path.dirname(target);
    return { ok: true, data: {
      path: target,
      parent: parent !== target ? parent : null,
      shortcuts: [
        { key: 'home', path: app.getPath('home') },
        { key: 'desktop', path: app.getPath('desktop') },
        { key: 'documents', path: app.getPath('documents') },
        { key: 'downloads', path: app.getPath('downloads') },
        { key: 'pictures', path: app.getPath('pictures') },
      ],
      dirs, files,
    } };
  } catch (err) {
    return { ok: false, error: { code: 'fs_error', message: err.message } };
  }
});

ipcMain.handle('fs:recent', () => {
  const recent = (appStore?.get('recent_files') || []).filter((r) => {
    try { fs.accessSync(r.path); return true; } catch { return false; }
  });
  return { ok: true, data: recent };
});

ipcMain.handle('file:read', async (_event, filePath) => {
  if (!SUPPORTED.includes(path.extname(filePath).toLowerCase())) return null;
  rememberFile(filePath);
  return safePayload(filePath);
});

// Left over from versions before 2.0, which still had accounts and licences.
const LEGACY_KEYS = ['user', 'access_token', 'refresh_token', 'license_token', 'license_status',
  'last_heartbeat_at', 'last_seen_wallclock', 'crash_reports'];

function setupIpc() {
  appStore = new SecureStore();
  for (const key of LEGACY_KEYS) {
    if (appStore.get(key) !== undefined) appStore.delete(key);
  }
  // Optionen
  ipcMain.handle('settings:get', () => ({
    autostart: getSetting('autostart'),
    restore_tabs: getSetting('restore_tabs'),
    close_to_tray: getSetting('close_to_tray'),
    intro: getSetting('intro'),
    platform: process.platform,
  }));
  ipcMain.handle('settings:set', (_e, key, value) => {
    if (!(key in SETTINGS_DEFAULTS)) return false;
    appStore.set('opt_' + key, !!value);
    if (key === 'autostart') applyAutostart(value);
    if (key === 'close_to_tray') { value ? createTray() : destroyTray(); }
    return true;
  });
  ipcMain.handle('settings:openDefaultApps', () => {
    if (process.platform === 'win32') {
      shell.openExternal('ms-settings:defaultapps');
      return true;
    }
    return false; // macOS/Linux: Hinweistext im Dialog
  });
  ipcMain.on('session:tabs', (_e, paths) => {
    appStore.set('session_tabs', Array.isArray(paths) ? paths.slice(0, 20) : []);
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
  const ALLOWED_LINKS = ['https://wolfgang-linz.de', 'https://cubory.app', 'https://github.com/wl-lankin/Cubory'];
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (ALLOWED_LINKS.some((a) => url === a || url.startsWith(a + '/'))) shell.openExternal(url);
  });

  updates = new UpdateManager((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update:state', state);
    }
  });
  updates.start();

  ipcMain.handle('update:state', () => updates.state);
  ipcMain.handle('update:install', () => updates.install());
  ipcMain.handle('update:check', () => updates.checkNow());

  // Zielordner, den der Export-Dialog beim Öffnen vorschlägt.
  ipcMain.handle('export:lastDir', () => {
    let dir = appStore?.get('last_export_dir');
    try { if (dir) fs.accessSync(dir); else dir = null; } catch { dir = null; }
    return { ok: true, data: dir || app.getPath('documents') || app.getPath('desktop') };
  });

  // Speichern in den im Modal gewählten Ordner - kein System-Dialog.
  ipcMain.handle('export:saveTo', async (_event, { base64, dir, filename, ext }) => {
    try {
      let name = String(filename || '').replace(/[/\\?%*:|"<>]/g, '_').trim() || `cubory-export`;
      const cleanExt = String(ext || 'dat').toLowerCase();
      if (!/^[a-z0-9]{1,8}$/.test(cleanExt)) throw new Error('invalid extension');
      const suffix = '.' + cleanExt;
      if (!name.toLowerCase().endsWith(suffix)) name += suffix;
      const target = path.join(path.resolve(dir), name);
      fs.writeFileSync(target, Buffer.from(base64, 'base64'));
      appStore?.set('last_export_dir', path.resolve(dir));
      return { ok: true, data: { path: target } };
    } catch (err) {
      return { ok: false, error: { code: 'fs_error', message: err.message } };
    }
  });

  // Textinhalt (SVG-Quelltext) in die Zwischenablage.
  ipcMain.handle('export:copyText', async (_event, text) => {
    try { clipboard.writeText(String(text || '')); return { ok: true, data: null }; }
    catch (err) { return { ok: false, error: { code: 'clipboard_error', message: err.message } }; }
  });

  // Zielordner, den sich der HD-Shot-Dialog beim Öffnen vorschlägt: zuletzt
  // genutzter Ordner, sonst der Bilder-Ordner des Systems.
  ipcMain.handle('screenshot:lastDir', () => {
    let dir = appStore?.get('last_shot_dir');
    try { if (dir) fs.accessSync(dir); else dir = null; } catch { dir = null; }
    return { ok: true, data: dir || app.getPath('pictures') || app.getPath('desktop') };
  });

  // Speichern in einen vom Nutzer im Modal gewählten Ordner - kein System-Dialog.
  ipcMain.handle('screenshot:saveTo', async (_event, { base64, dir, filename }) => {
    try {
      // Dateinamen entschärfen: keine Pfadtrenner oder für Dateisysteme
      // ungültige Zeichen zulassen.
      let name = String(filename || '').replace(/[/\\?%*:|"<>]/g, '_').trim() || `cubory-${Date.now()}`;
      if (!name.toLowerCase().endsWith('.png')) name += '.png';
      const target = path.join(path.resolve(dir), name);
      fs.writeFileSync(target, Buffer.from(base64, 'base64'));
      appStore?.set('last_shot_dir', path.resolve(dir));
      return { ok: true, data: { path: target } };
    } catch (err) {
      return { ok: false, error: { code: 'fs_error', message: err.message } };
    }
  });

  // In die Zwischenablage - als echtes Bild, nicht als Text.
  ipcMain.handle('screenshot:copy', async (_event, dataUrl) => {
    try {
      clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
      return { ok: true, data: null };
    } catch (err) {
      return { ok: false, error: { code: 'clipboard_error', message: err.message } };
    }
  });

  // Gespeicherte Datei im Datei-Manager zeigen.
  ipcMain.handle('fs:reveal', (_event, filePath) => {
    try { shell.showItemInFolder(path.resolve(filePath)); return { ok: true, data: null }; }
    catch (err) { return { ok: false, error: { code: 'reveal_error', message: err.message } }; }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setupIpc();
  applyAutostart(getSetting('autostart'));
  if (getSetting('close_to_tray') && process.platform !== 'darwin') createTray();
  const file = fileFromArgv(process.argv);
  if (file) pendingFile = file;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});
