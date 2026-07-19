import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as pty from 'node-pty';
import { 
  readSettings, writeSettings, getVaultsRoot, getVaults, findVault, 
  safeResolve, extractLinks, extractTags, getGraph 
} from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

const ptyProcesses = new Map();

function getShell() {
  return process.env[process.platform === 'win32' ? 'COMSPEC' : 'SHELL'] || 'cmd.exe';
}

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => readSettings());
  
  ipcMain.handle('settings:save', (event, vaultsRoot) => {
    const normalized = path.resolve(vaultsRoot.trim());
    let stat;
    try { stat = fs.statSync(normalized); } catch { stat = null; }
    if (!stat || !stat.isDirectory()) {
      throw new Error(`Le répertoire n'existe pas ou n'est pas un dossier : ${normalized}`);
    }
    writeSettings({ vaultsRoot: normalized });
    return { ok: true, vaultsRoot: normalized };
  });

  ipcMain.handle('vaults:get', () => {
    return { root: getVaultsRoot(), vaults: getVaults() };
  });

  ipcMain.handle('note:get', (event, vaultId, notePath) => {
    const vault = findVault(vaultId);
    const fullPath = safeResolve(vault.path, notePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return {
      vaultId: vault.id,
      path: notePath,
      content,
      links: extractLinks(content),
      tags: extractTags(content),
    };
  });

  ipcMain.handle('note:save', (event, vaultId, notePath, content) => {
    const vault = findVault(vaultId);
    const fullPath = safeResolve(vault.path, notePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content ?? '', 'utf8');
    return { ok: true };
  });

  ipcMain.handle('graph:get', (event, vaultId) => {
    return getGraph(vaultId);
  });

  ipcMain.handle('dialog:pickDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.filePaths[0];
  });

  ipcMain.handle('terminal:create', (event, vaultId) => {
    if (ptyProcesses.has(vaultId)) {
      return { vaultId, exists: true };
    }
    const vault = findVault(vaultId);
    const ptyProcess = pty.spawn(getShell(), [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: vault.path,
      env: process.env
    });
    
    ptyProcess.onData((data) => {
      mainWindow.webContents.send('terminal:data', vaultId, data);
    });
    
    ptyProcesses.set(vaultId, ptyProcess);
    return { vaultId, exists: false };
  });

  ipcMain.on('terminal:input', (event, vaultId, data) => {
    const ptyProcess = ptyProcesses.get(vaultId);
    if (ptyProcess) ptyProcess.write(data);
  });

  ipcMain.on('terminal:resize', (event, vaultId, cols, rows) => {
    const ptyProcess = ptyProcesses.get(vaultId);
    if (ptyProcess) {
      try { ptyProcess.resize(cols, rows); } catch (e) { /* ignore */ }
    }
  });

  ipcMain.on('terminal:kill', (event, vaultId) => {
    const ptyProcess = ptyProcesses.get(vaultId);
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcesses.delete(vaultId);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
