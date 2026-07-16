export const GRAPH_SETTINGS = {
  minRadius: 2.6,
  baseRadius: 2.3,
  radiusScale: 1.65,
  maxRadius: 13.5,
  missingRadiusMax: 6.8,
  linkDistance: 82,
  linkStrength: 0.42,
  charge: 230,
  centerStrength: 0.014,
  collisionPadding: 16,
  collisionStrength: 0.95,
  collisionIterations: 4,
  isolatedRingStrength: 0.075,
  velocityDecay: 0.32,
  alphaDecay: 0.078,
  minAlpha: 0.035,
  edgeWidth: 0.92,
  edgeOpacity: 0.34,
  labelZoomThreshold: 0.82,
  dimOpacity: 0.34,
  minZoom: 0.24,
  maxZoom: 3.2,
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizePath(value = '') {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

export function normalizeLookup(value = '') {
  return normalizePath(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function cleanScalar(value = '') {
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function fileNameNoExt(filePath = '') {
  return normalizePath(filePath).split('/').pop() || '';
}

export function asArray(value) {
  if (Array.isArray(value)) return value.map(cleanScalar).filter(Boolean);
  if (!value) return [];
  return [cleanScalar(value)].filter(Boolean);
}

export function hashNumber(value = '') {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashUnit(value = '') {
  return hashNumber(value) / 4294967295;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nodeRadius(node, settings = GRAPH_SETTINGS) {
  const degree = node.degree ?? node.linkCount ?? 0;
  if (node.isMissing) return clamp(settings.baseRadius + Math.sqrt(degree) * 0.78, settings.minRadius, settings.missingRadiusMax);
  return clamp(settings.baseRadius + Math.sqrt(degree) * settings.radiusScale, settings.minRadius, settings.maxRadius);
}

export function matchesGraphSearch(node, query = '') {
  const value = query.trim().toLowerCase();
  if (!value) return false;
  return [node.title, node.canonicalName, node.filePath, node.folder]
    .filter(Boolean)
    .some((item) => item.toLowerCase().includes(value));
}

export function visibleByGraphFilters(node, filters = {}) {
  if (!filters.showMissing && node.isMissing) return false;
  if (!filters.showIsolated && !node.degree) return false;
  if (filters.tag && !node.tags?.includes(filters.tag)) return false;
  if (filters.folder && node.folder !== filters.folder) return false;
  if (filters.type && node.type !== filters.type) return false;
  if (filters.status && node.status !== filters.status) return false;
  return true;
}

export function createAdjacency(edges = []) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }
  return adjacency;
}

export function areAdjacent(adjacency, a, b) {
  return a === b || adjacency.get(a)?.has(b);
}