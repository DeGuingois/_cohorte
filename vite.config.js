import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildGraphData } from './src/graphData.js';

const vaultsRoot = process.env.VAULTS_ROOT || 'C:\\Users\\s.travers\\Documents\\_projet_perso\\agents_vaults';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vault';
}

function safeResolve(base, relativePath = '') {
  const resolved = path.resolve(base, relativePath);
  if (!resolved.toLowerCase().startsWith(path.resolve(base).toLowerCase())) {
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
        avatar: entry.name.toLowerCase().includes('bobb') ? 'bobb' : (entry.name.toLowerCase().includes('kira') ? 'kira' : 'ada'),
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
      server.middlewares.use('/api/vaults', (req, res) => {
        try {
          sendJson(res, 200, { root: vaultsRoot, vaults: getVaults() });
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
