import { asArray, cleanScalar, fileNameNoExt, normalizePath, unique } from './graphUtils.js';

function parseInlineList(value) {
  const trimmed = cleanScalar(value);
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']') || trimmed.startsWith('[[')) return null;
  return trimmed.slice(1, -1).split(',').map(cleanScalar).filter(Boolean);
}

export function parseFrontmatter(raw = '') {
  const result = {};
  const lines = String(raw).replace(/\r\n/g, '\n').split('\n');
  let currentKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = result[currentKey] ? [result[currentKey]] : [];
      result[currentKey].push(cleanScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    currentKey = key;
    if (!rawValue.trim()) {
      result[key] = [];
      continue;
    }

    result[key] = parseInlineList(rawValue) || cleanScalar(rawValue);
  }

  return result;
}

export function splitMarkdownFrontmatter(content = '') {
  const normalized = String(content).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontmatterRaw: '', frontmatter: {}, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { frontmatterRaw: '', frontmatter: {}, body: normalized };
  const frontmatterRaw = normalized.slice(4, end);
  const bodyStart = normalized.indexOf('\n', end + 4);
  const body = bodyStart === -1 ? '' : normalized.slice(bodyStart + 1);
  return { frontmatterRaw, frontmatter: parseFrontmatter(frontmatterRaw), body };
}

export function parseWikiLink(rawValue = '') {
  const raw = String(rawValue).trim();
  if (!raw) return null;
  const unwrapped = raw.match(/^\[\[([\s\S]+)\]\]$/)?.[1] ?? raw;
  const separator = unwrapped.includes('\\|') ? '\\|' : '|';
  const [targetPart, aliasPart] = unwrapped.split(separator);
  const targetText = String(targetPart || '').trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(targetText)) return null;
  const normalizedTarget = normalizePath(targetText);
  const [withoutHeading, heading] = normalizedTarget.split('#');
  if (!withoutHeading) return null;
  return {
    raw,
    target: normalizePath(withoutHeading),
    alias: aliasPart ? cleanScalar(aliasPart).replace(/\\\\/g, '') : undefined,
    heading: heading ? heading.trim() : undefined,
  };
}

export function extractWikiLinks(content = '') {
  return [...String(content).matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => parseWikiLink(`[[${match[1]}]]`))
    .filter(Boolean);
}

function firstHeading(body = '') {
  return String(body).match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function extractInlineTags(content = '') {
  return [...String(content).matchAll(/(^|\s)#([A-Za-z0-9_\-/]+)/g)].map((match) => match[2]);
}

export function graphNodeId(vaultId, filePath) {
  return `${vaultId}:${normalizePath(filePath)}.md`;
}

export function missingNodeId(vaultId, target) {
  return `${vaultId}:missing:${target.toLowerCase()}`;
}

export function parseGraphNotes(vaultId, files = []) {
  return files.map((file, index) => {
    const { body, frontmatter } = splitMarkdownFrontmatter(file.content || '');
    const cleanPath = normalizePath(file.path);
    const canonicalName = cleanScalar(frontmatter.canonical_name || '');
    const title = cleanScalar(frontmatter.title || '') || firstHeading(body) || fileNameNoExt(file.path) || canonicalName || 'Sans titre';
    return {
      index,
      id: graphNodeId(vaultId, cleanPath),
      vaultId,
      filePath: `${cleanPath}.md`,
      canonicalName,
      title,
      folder: cleanScalar(frontmatter.folder || file.folder || cleanPath.split('/').slice(0, -1).join('/') || '/'),
      type: cleanScalar(frontmatter.type || ''),
      sourceType: cleanScalar(frontmatter.source_type || ''),
      status: cleanScalar(frontmatter.status || ''),
      tags: unique([...asArray(frontmatter.tags), ...extractInlineTags(body)]),
      body,
      frontmatter,
      isMissing: false,
      degree: 0,
      linkCount: 0,
    };
  });
}

export function extractGraphRelations(note) {
  const relations = [];
  for (const item of asArray(note.frontmatter.related)) {
    const link = parseWikiLink(item);
    if (link) relations.push({ sourceId: note.id, link, kind: 'related' });
  }
  for (const item of asArray(note.frontmatter.raw_note)) {
    const link = parseWikiLink(item);
    if (link) relations.push({ sourceId: note.id, link, kind: 'raw-note' });
  }
  for (const link of extractWikiLinks(note.body)) {
    relations.push({ sourceId: note.id, link, kind: 'content-link' });
  }
  return relations;
}