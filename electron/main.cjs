const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { SecureStore } = require('./services/secureStore.cjs');
const { AccountManager } = require('./services/accountManager.cjs');

let account = null; // AccountManager, initialisiert in app.whenReady

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Für automatisierte Tests: eigenes Profil, damit die Single-Instance-Sperre
// eine parallel laufende Nutzer-Instanz nicht blockiert
if (process.env.CUBORY_TEST_USERDATA) {
  app.setPath('userData', process.env.CUBORY_TEST_USERDATA);
}

let mainWindow = null;
// Datei, die per Doppelklick/„Öffnen mit" ankam, bevor das Fenster bereit war
let pendingFile = null;

const SUPPORTED = ['.dxf', '.step', '.stp', '.iges', '.igs', '.brep', '.stl', '.obj'];

function fileFromArgv(argv) {
  return argv
    .slice(1)
    .find((a) => SUPPORTED.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) || null;
}

function sendFileToRenderer(filePath) {
  if (!filePath) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
    mainWindow.webContents.send('open-file', readFilePayload(filePath));
  } else {
    pendingFile = filePath;
  }
}

function readFilePayload(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: buffer.length,
    // ArrayBuffer überlebt structured clone; Text dekodiert der Renderer selbst
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      mainWindow.webContents.send('open-file', readFilePayload(pendingFile));
      pendingFile = null;
    }
  });
}

// macOS: Datei per Doppelklick im Finder
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  sendFileToRenderer(filePath);
});

// Windows/Linux: zweite Instanz reicht Datei an die erste weiter
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const file = fileFromArgv(argv);
    if (file) sendFileToRenderer(file);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CAD-Dateien', extensions: ['dxf', 'step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readFilePayload(result.filePaths[0]);
});

ipcMain.handle('file:read', async (_event, filePath) => {
  if (!SUPPORTED.includes(path.extname(filePath).toLowerCase())) return null;
  return readFilePayload(filePath);
});

// Account/License-IPC: dünne Wrapper; Fehler gehen strukturiert an den Renderer.
function wrap(fn) {
  return async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: { code: err.code || 'unknown', message: err.message } };
    }
  };
}

function setupAccountIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
  const ALLOWED_LINKS = ['https://wolfgang-linz.de', 'https://cubory.app', 'https://github.com/wl-lankin/Cubory'];
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (ALLOWED_LINKS.some((a) => url === a || url.startsWith(a + '/'))) shell.openExternal(url);
  });

  const store = new SecureStore();
  account = new AccountManager(store, app.getVersion(), (state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('account:changed', state);
    }
  });
  account.startHeartbeat();

  ipcMain.handle('account:state', wrap(() => account.state()));
  ipcMain.handle('account:login', wrap((email, password) => account.login(email, password)));
  ipcMain.handle('account:register', wrap((name, email, password) => account.register(name, email, password)));
  ipcMain.handle('account:logout', wrap(() => account.logout()));
  ipcMain.handle('account:devices', wrap(() => account.devices()));
  ipcMain.handle('account:deactivateDevice', wrap((id) => account.deactivateDevice(id)));
  ipcMain.handle('license:can', (_e, key) => account.can(key));
  ipcMain.handle('account:checkout', wrap(async (plan) => {
    const url = await account.createCheckout(plan);
    await shell.openExternal(url);
    return url;
  }));
  ipcMain.handle('account:portal', wrap(async () => {
    const url = await account.portalUrl();
    await shell.openExternal(url);
    return url;
  }));

  // Export (Pro): Durchsetzung im Main-Prozess
  ipcMain.handle('export:save', async (_event, { base64, filename, filterName, ext }) => {
    if (!account.can('export')) {
      return { ok: false, error: { code: 'upgrade_required', message: 'Pro-Feature' } };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { ok: true, data: null };
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    return { ok: true, data: result.filePath };
  });

  // Beispiel-Pro-Feature: HD-Screenshot. Durchsetzung im Main-Prozess -
  // der Renderer kann das Gating nicht umgehen.
  ipcMain.handle('screenshot:save', async (_event, dataUrl) => {
    if (!account.can('hires_screenshot')) {
      return { ok: false, error: { code: 'upgrade_required', message: 'Pro-Feature' } };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `cubory-screenshot-${Date.now()}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { ok: true, data: null };
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    return { ok: true, data: result.filePath };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setupAccountIpc();
  const file = fileFromArgv(process.argv);
  if (file) pendingFile = file;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
