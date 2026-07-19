import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildGraphData } from './src/graphData.js';

const SETTINGS_FILE = path.resolve('./settings.json');
const DEFAULT_VAULTS_ROOT = process.env.VAULTS_ROOT || 'C:\\Users\\s.travers\\Documents\\_projet_perso\\agents_vaults';

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      return { vaultsRoot: data.vaultsRoot || DEFAULT_VAULTS_ROOT };
    }
  } catch { /* ignore */ }
  return { vaultsRoot: DEFAULT_VAULTS_ROOT };
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getVaultsRoot() {
  return readSettings().vaultsRoot;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        req.destroy(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Vérifie que la requête provient bien de localhost.
 * Protège contre le CSRF : une page tiers ne peut pas appeler les endpoints
 * d'écriture depuis le navigateur de l'utilisateur.
 */
function assertLocalOrigin(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  const isLocal = !origin
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://127.0.0.1');
  if (!isLocal) {
    sendJson(res, 403, { error: 'Forbidden: cross-origin request rejected' });
    return false;
  }
  return true;
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

function safeResolve(base, relativePath = '') {
  const resolved = path.resolve(base, relativePath);
  // Résout les symlinks pour éviter qu'un lien symbolique dans le vault
  // ne permette de sortir de la racine autorisée (symlink path traversal).
  const realBase = fs.realpathSync.native(path.resolve(base));
  let realResolved;
  try {
    realResolved = fs.realpathSync.native(resolved);
  } catch {
    // Le fichier n'existe pas encore (ex: création) — on vérifie le chemin résolu
    // sans symlinks, qui est suffisant dans ce cas.
    realResolved = resolved;
  }
  if (!realResolved.toLowerCase().startsWith(realBase.toLowerCase() + path.sep)
      && realResolved.toLowerCase() !== realBase.toLowerCase()) {
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

function extractLinks(content) {
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

function extractTags(content) {
  return [...new Set([...content.matchAll(/(^|\s)#([A-Za-z0-9_\-/]+)/g)].map((match) => match[2]))];
}

function noteTitle(content, fallback) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function getVaults() {
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

function findVault(vaultId) {
  const vault = getVaults().find((item) => item.id === vaultId);
  if (!vault) throw new Error(`Unknown vault: ${vaultId}`);
  return vault;
}


function getGraph(vaultId) {
  const vault = findVault(vaultId);
  const files = walkMarkdown(vault.path).sort((a, b) => a.path.localeCompare(b.path));
  const graphFiles = files.map((file) => {
    const fullPath = safeResolve(vault.path, file.path);
    return { ...file, content: fs.readFileSync(fullPath, 'utf8') };
  });
  return buildGraphData({ vaultId: vault.id, files: graphFiles });
}

function obsidianLocalApi() {
  return {
    name: 'obsidian-local-api',
    configureServer(server) {
      server.middlewares.use('/api/settings', async (req, res) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, 200, readSettings());
            return;
          }
          if (req.method === 'POST') {
            if (!assertLocalOrigin(req, res)) return;
            const body = await readBody(req);
            if (typeof body.vaultsRoot !== 'string' || !body.vaultsRoot.trim()) {
              sendJson(res, 400, { error: 'Invalid vaultsRoot' });
              return;
            }
            const normalized = path.resolve(body.vaultsRoot.trim());
            // Vérifie que le chemin est un dossier existant avant toute écriture.
            let stat;
            try { stat = fs.statSync(normalized); } catch { stat = null; }
            if (!stat || !stat.isDirectory()) {
              sendJson(res, 400, { error: `Le répertoire n'existe pas ou n'est pas un dossier : ${normalized}` });
              return;
            }
            writeSettings({ vaultsRoot: normalized });
            sendJson(res, 200, { ok: true, vaultsRoot: normalized });
            return;
          }
          sendJson(res, 405, { error: 'Method not allowed' });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/vaults', (req, res) => {
        try {
          sendJson(res, 200, { root: getVaultsRoot(), vaults: getVaults() });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/note', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const url = new URL(req.url, 'http://localhost');
            const vault = findVault(url.searchParams.get('vaultId'));
            const notePath = url.searchParams.get('path');
            const fullPath = safeResolve(vault.path, notePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            sendJson(res, 200, {
              vaultId: vault.id,
              path: notePath,
              content,
              links: extractLinks(content),
              tags: extractTags(content),
            });
            return;
          }

          if (req.method === 'POST') {
            if (!assertLocalOrigin(req, res)) return;
            const body = await readBody(req);
            const vault = findVault(body.vaultId);
            const fullPath = safeResolve(vault.path, body.path);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, body.content ?? '', 'utf8');
            sendJson(res, 200, { ok: true });
            return;
          }

          sendJson(res, 405, { error: 'Method not allowed' });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });

      server.middlewares.use('/api/graph', (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          sendJson(res, 200, getGraph(url.searchParams.get('vaultId')));
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), obsidianLocalApi()],
});
