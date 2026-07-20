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

function vaultAvatar(name) {
  const normalized = slug(name);
  return ['ada', 'bobb', 'eli', 'kira', 'milo', 'zoe'].find((avatar) => normalized.includes(avatar)) || 'ada';
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

function walkMarkdown(root, dir = root) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === '.git' || entry.name === '.obsidian' || entry.name === 'node_modules') return [];
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(root, fullPath);
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) return [];
    const stat = fs.statSync(fullPath);
    const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
    return [{
      path: relPath,
      name: path.basename(entry.name, '.md'),
      folder: path.dirname(relPath) === '.' ? '/' : path.dirname(relPath).replace(/\\/g, '/'),
      modified: stat.mtime.toISOString(),
      size: stat.size,
    }];
  });
}

function buildTree(files) {
  const root = { type: 'folder', name: '/', path: '', children: [] };
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
      const files = walkMarkdown(vaultPath).sort((a, b) => a.path.localeCompare(b.path));
      return {
        id: slug(entry.name),
        name: entry.name,
        path: vaultPath,
        avatar: vaultAvatar(entry.name),
        notes: files.length,
        files,
        tree: buildTree(files),
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
  const files = walkMarkdown(vault.path).sort((a, b) => a.path.localeCompare(b.path));
  const graphFiles = files.map((file) => {
    const fullPath = safeResolve(vault.path, file.path);
    return { ...file, content: fs.readFileSync(fullPath, 'utf8') };
  });
  return buildGraphData({ vaultId: vault.id, files: graphFiles });
}
