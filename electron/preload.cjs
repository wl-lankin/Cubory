const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubory', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (_event, payload) => callback(payload));
  },
  platform: process.platform,
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  account: {
    state: () => ipcRenderer.invoke('account:state'),
    login: (email, password) => ipcRenderer.invoke('account:login', email, password),
    register: (name, email, password) => ipcRenderer.invoke('account:register', name, email, password),
    logout: () => ipcRenderer.invoke('account:logout'),
    devices: () => ipcRenderer.invoke('account:devices'),
    deactivateDevice: (id) => ipcRenderer.invoke('account:deactivateDevice', id),
    checkout: (plan) => ipcRenderer.invoke('account:checkout', plan),
    verifyEmail: (code) => ipcRenderer.invoke('account:verifyEmail', code),
    resendCode: () => ipcRenderer.invoke('account:resendCode'),
    deleteAccount: (password) => ipcRenderer.invoke('account:delete', password),
    portal: () => ipcRenderer.invoke('account:portal'),
    onChange: (callback) => {
      ipcRenderer.on('account:changed', (_event, state) => callback(state));
    },
  },
  license: {
    can: (key) => ipcRenderer.invoke('license:can', key),
  },
  screenshot: {
    save: (dataUrl) => ipcRenderer.invoke('screenshot:save', dataUrl),
  },
  exportFile: {
    save: (payload) => ipcRenderer.invoke('export:save', payload),
  },
  files: {
    listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
    recent: () => ipcRenderer.invoke('fs:recent'),
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
  crash: {
    optIn: () => ipcRenderer.invoke('crash:optIn'),
    setOptIn: (on) => ipcRenderer.invoke('crash:setOptIn', on),
    report: (payload) => ipcRenderer.send('crash:report', payload),
  },
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    install: () => ipcRenderer.invoke('update:install'),
    onChange: (callback) => {
      ipcRenderer.on('update:state', (_event, state) => callback(state));
    },
  },
});
