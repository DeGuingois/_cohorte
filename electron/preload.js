import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVaults: () => ipcRenderer.invoke('vaults:get'),
  getNote: (vaultId, path) => ipcRenderer.invoke('note:get', vaultId, path),
  saveNote: (vaultId, path, content) => ipcRenderer.invoke('note:save', vaultId, path, content),
  createNote: (vaultId, path, content) => ipcRenderer.invoke('note:create', vaultId, path, content),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getGraph: (vaultId) => ipcRenderer.invoke('graph:get', vaultId),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  terminal: {
    create: (vaultId, terminalId, cols, rows) => ipcRenderer.invoke('terminal:create', vaultId, terminalId, cols, rows),
    listActive: () => ipcRenderer.invoke('terminal:listActive'),
    input: (vaultId, terminalId, data) => ipcRenderer.send('terminal:input', vaultId, terminalId, data),
    resize: (vaultId, terminalId, cols, rows) => ipcRenderer.send('terminal:resize', vaultId, terminalId, cols, rows),
    kill: (vaultId, terminalId) => ipcRenderer.send('terminal:kill', vaultId, terminalId),
    onData: (callback) => {
      const handler = (event, vaultId, terminalId, data) => callback(vaultId, terminalId, data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.off('terminal:data', handler);
    }
  }
});
