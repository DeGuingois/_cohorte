import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVaults: () => ipcRenderer.invoke('vaults:get'),
  getNote: (vaultId, path) => ipcRenderer.invoke('note:get', vaultId, path),
  saveNote: (vaultId, path, content) => ipcRenderer.invoke('note:save', vaultId, path, content),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (vaultsRoot) => ipcRenderer.invoke('settings:save', vaultsRoot),
  getGraph: (vaultId) => ipcRenderer.invoke('graph:get', vaultId),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  terminal: {
    create: (vaultId) => ipcRenderer.invoke('terminal:create', vaultId),
    input: (vaultId, data) => ipcRenderer.send('terminal:input', vaultId, data),
    resize: (vaultId, cols, rows) => ipcRenderer.send('terminal:resize', vaultId, cols, rows),
    kill: (vaultId) => ipcRenderer.send('terminal:kill', vaultId),
    onData: (callback) => {
      const handler = (event, vaultId, data) => callback(vaultId, data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.off('terminal:data', handler);
    }
  }
});
