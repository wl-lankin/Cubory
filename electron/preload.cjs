const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cubory', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (_event, payload) => callback(payload));
  },
  platform: process.platform,
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || null; } catch { return null; }
  },

  screenshot: {
    lastDir: () => ipcRenderer.invoke('screenshot:lastDir'),
    saveTo: (payload) => ipcRenderer.invoke('screenshot:saveTo', payload),
    copy: (dataUrl) => ipcRenderer.invoke('screenshot:copy', dataUrl),
  },
  exportFile: {
    lastDir: () => ipcRenderer.invoke('export:lastDir'),
    saveTo: (payload) => ipcRenderer.invoke('export:saveTo', payload),
    copyText: (text) => ipcRenderer.invoke('export:copyText', text),
  },
  files: {
    listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
    recent: () => ipcRenderer.invoke('fs:recent'),
    reveal: (filePath) => ipcRenderer.invoke('fs:reveal', filePath),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    openDefaultApps: () => ipcRenderer.invoke('settings:openDefaultApps'),
  },
  session: {
    saveTabs: (paths) => ipcRenderer.send('session:tabs', paths),
    onRestore: (callback) => ipcRenderer.on('restore-session', (_e, paths) => callback(paths)),
  },
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.invoke('update:install'),
    check: () => ipcRenderer.invoke('update:check'),
    onChange: (callback) => {
      ipcRenderer.on('update:state', (_event, state) => callback(state));
    },
  },
});
