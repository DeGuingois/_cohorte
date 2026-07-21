import fs from 'node:fs';
import path from 'node:path';
import { buildGraphData } from '../src/graphData.js';

const SETTINGS_FILE = path.resolve('./settings.json');
const DEFAULT_VAULTS_ROOT = process.env.VAULTS_ROOT || 'C:\\Users\\s.travers\\Documents\\_projet_perso\\agents_vaults';
const DEFAULT_TERMINAL_BUTTONS = [
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'gemini', label: 'Gemini', command: 'agy' },
];

export function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      const terminalButtons = Array.isArray(data.terminalButtons)
        ? data.terminalButtons.filter((item) => item?.label && item?.command).map((item, index) => ({ id: item.id || `terminal-${index}`, label: item.label, command: item.command }))
        : DEFAULT_TERMINAL_BUTTONS;
      return {
        vaultsRoot: data.vaultsRoot || DEFAULT_VAULTS_ROOT,
        terminalButtons: terminalButtons.length ? terminalButtons : DEFAULT_TERMINAL_BUTTONS,
      };
    }
  } catch { /* ignore */ }
  return { vaultsRoot: DEFAULT_VAULTS_ROOT, terminalButtons: DEFAULT_TERMINAL_BUTTONS };
}

export function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

export function getVaultsRoot() {
  return readSettings().vaultsRoot;
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vault';
}

function getAvailableAvatarNames() {
  const possibleDirs = [
    path.resolve('./src/avatars'),
    path.resolve('../src/avatars'),
  ];
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        const avatarNames = files
          .filter((f) => f.toLowerCase().endsWith('.png') && f !== 'cohorte_icon.png')
          .map((f) => path.basename(f, '.png'));
        if (avatarNames.length > 0) return avatarNames;
      } catch { /* ignore */ }
    }
  }
  return ['11', '3', '4', '5', 'ada', 'archiviste', 'bobb', 'comptable', 'coordinateur', 'detracteur', 'développeur', 'eli', 'enseignant', 'entraineur', 'hacker', 'kira', 'milo', 'philosophe', 'protecteur', 'rédacteur', 'voyageur', 'zoe'];
}

function vaultAvatar(name) {
  if (!name) return 'ada';

  const rawLower = name.toLowerCase();
  const normVault = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const availableAvatars = getAvailableAvatarNames();

  const exact = availableAvatars.find((av) => {
    const normAv = av.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rawLower === av.toLowerCase() || normVault === normAv;
  });
  if (exact) return exact;

  const matches = availableAvatars.filter((av) => {
    const normAv = av.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normVault.includes(normAv) || normAv.includes(normVault);
  });

  if (matches.length > 0) {
    matches.sort((a, b) => b.length - a.length);
    return matches[0];
  }

  return 'ada';
}

export function safeResolve(base, relativePath = '') {
  const absBase = path.resolve(base);
  const resolved = path.resolve(absBase, relativePath);

  const cleanBase = absBase.replace(/^\\\\\?\\/, '');
  const cleanResolved = resolved.replace(/^\\\\\?\\/, '');

  const normBase = path.normalize(cleanBase).toLowerCase();
  const normResolved = path.normalize(cleanResolved).toLowerCase();

  const baseWithSep = normBase.endsWith(path.sep) ? normBase : normBase + path.sep;

  if (!normResolved.startsWith(baseWithSep) && normResolved !== normBase) {
    throw new Error('Path escapes vault root');
  }
  return resolved;
}

function scanVault(root) {
  const files = [];
  const folders = [];

  function walk(currentDir) {
    const relDir = path.relative(root, currentDir).replace(/\\/g, '/');
    if (relDir && relDir !== '.') {
      folders.push(relDir);
    }
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === '.obsidian' || entry.name === 'node_modules') continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          const stat = fs.statSync(fullPath);
          const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
          files.push({
            path: relPath,
            name: path.basename(entry.name, '.md'),
            folder: path.dirname(relPath) === '.' ? '/' : path.dirname(relPath).replace(/\\/g, '/'),
            modified: stat.mtime.toISOString(),
            size: stat.size,
          });
        }
      }
    } catch { /* ignore unreadable dirs */ }
  }

  walk(root);
  return { files, folders };
}

function walkMarkdown(root) {
  return scanVault(root).files;
}

function buildTree(files, folders = []) {
  const root = { type: 'folder', name: '/', path: '', children: [] };

  for (const folderPath of folders) {
    const parts = folderPath.split('/');
    let cursor = root;
    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join('/');
      let child = cursor.children.find((item) => item.name === part && item.type === 'folder');
      if (!child) {
        child = { type: 'folder', name: part, path: currentPath, children: [] };
        cursor.children.push(child);
      }
      cursor = child;
    });
  }

  for (const file of files) {
    const parts = file.path.split('/');
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');
      let child = cursor.children.find((item) => item.name === part && item.type === (isFile ? 'file' : 'folder'));
      if (!child) {
        child = isFile
          ? { type: 'file', name: file.name, label: part.replace(/\.md$/i, ''), path: file.path, modified: file.modified, size: file.size }
          : { type: 'folder', name: part, path: currentPath, children: [] };
        cursor.children.push(child);
      }
      if (!isFile) cursor = child;
    });
  }

  const sortChildren = (node) => {
    node.children?.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    node.children?.forEach(sortChildren);
  };
  sortChildren(root);
  return root.children;
}

export function extractLinks(content) {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => {
      const raw = match[1];
      const separator = raw.includes('\\|') ? '\\|' : '|';
      const [target, label] = raw.split(separator);
      return {
        target: target.replace(/\\/g, '/').trim(),
        label: (label || target).replace(/\\/g, '').trim(),
      };
    })
    .filter((link) => link.target);
}

export function extractTags(content) {
  return [...new Set([...content.matchAll(/(^|\s)#([A-Za-z0-9_\-/]+)/g)].map((match) => match[2]))];
}

export function getVaults() {
  const vaultsRoot = getVaultsRoot();
  if (!fs.existsSync(vaultsRoot)) return [];
  return fs.readdirSync(vaultsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '.git')
    .map((entry, index) => {
      const vaultPath = path.join(vaultsRoot, entry.name);
      const { files, folders } = scanVault(vaultPath);
      files.sort((a, b) => a.path.localeCompare(b.path));
      return {
        id: slug(entry.name),
        name: entry.name,
        path: vaultPath,
        avatar: vaultAvatar(entry.name),
        notes: files.length,
        files,
        tree: buildTree(files, folders),
        active: index === 0,
      };
    });
}

export function findVault(vaultId) {
  const vault = getVaults().find((item) => item.id === vaultId);
  if (!vault) throw new Error(`Unknown vault: ${vaultId}`);
  return vault;
}

export function getGraph(vaultId) {
  const vault = findVault(vaultId);
  const { files } = scanVault(vault.path);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const graphFiles = files.map((file) => {
    const fullPath = safeResolve(vault.path, file.path);
    return { ...file, content: fs.readFileSync(fullPath, 'utf8') };
  });
  return buildGraphData({ vaultId: vault.id, files: graphFiles });
}
