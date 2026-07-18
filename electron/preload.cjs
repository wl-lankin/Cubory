const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubory', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (_event, payload) => callback(payload));
  },
  platform: process.platform,

  account: {
    state: () => ipcRenderer.invoke('account:state'),
    login: (email, password) => ipcRenderer.invoke('account:login', email, password),
    register: (name, email, password) => ipcRenderer.invoke('account:register', name, email, password),
    logout: () => ipcRenderer.invoke('account:logout'),
    devices: () => ipcRenderer.invoke('account:devices'),
    deactivateDevice: (id) => ipcRenderer.invoke('account:deactivateDevice', id),
    checkout: (plan) => ipcRenderer.invoke('account:checkout', plan),
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
});
