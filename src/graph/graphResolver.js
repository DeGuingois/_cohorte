import { extractGraphRelations, graphNodeId, missingNodeId, parseGraphNotes } from './graphParser.js';
import { fileNameNoExt, normalizeLookup, normalizePath } from './graphUtils.js';

export function buildNoteIndexes(notes = []) {
  const indexes = {
    byCanonicalName: new Map(),
    byRelativePath: new Map(),
    byFileName: new Map(),
    byTitle: new Map(),
  };

  for (const note of notes) {
    if (note.canonicalName) indexes.byCanonicalName.set(note.canonicalName, note);
    if (note.canonicalName) indexes.byCanonicalName.set(normalizeLookup(note.canonicalName), note);
    indexes.byRelativePath.set(normalizeLookup(note.filePath), note);
    indexes.byRelativePath.set(normalizeLookup(normalizePath(note.filePath)), note);
    const fileKey = normalizeLookup(fileNameNoExt(note.filePath));
    indexes.byFileName.set(fileKey, [...(indexes.byFileName.get(fileKey) || []), note]);
    const titleKey = normalizeLookup(note.title);
    indexes.byTitle.set(titleKey, [...(indexes.byTitle.get(titleKey) || []), note]);
  }

  return indexes;
}

export function resolveWikiTarget(target, indexes) {
  const exact = normalizePath(target);
  if (indexes.byCanonicalName.has(exact)) return indexes.byCanonicalName.get(exact);
  const key = normalizeLookup(target);
  if (!key) return null;
  if (indexes.byCanonicalName.has(key)) return indexes.byCanonicalName.get(key);
  if (indexes.byRelativePath.has(key)) return indexes.byRelativePath.get(key);

  const fileMatches = indexes.byFileName.get(key) || [];
  if (fileMatches.length === 1) return fileMatches[0];

  const titleMatches = indexes.byTitle.get(key) || [];
  if (titleMatches.length === 1) return titleMatches[0];

  return null;
}

function graphStats(parsedNotes, nodes, edges, totalWikiLinks, edgeCountBeforeDedupe, unresolvedLinks) {
  const realNotes = nodes.filter((node) => !node.isMissing);
  const connectedNotes = realNotes.filter((node) => (node.degree || 0) > 0).length;
  const isolatedNotes = realNotes.length - connectedNotes;
  const degrees = nodes.map((node) => node.degree || 0);
  const degreeAverage = degrees.length ? degrees.reduce((sum, value) => sum + value, 0) / degrees.length : 0;
  const degreeMax = degrees.length ? Math.max(...degrees) : 0;
  return {
    notes: parsedNotes.length,
    nodes: nodes.length,
    connectedNotes,
    isolatedNotes,
    totalWikiLinks,
    edgeCountBeforeDedupe,
    edgeCountAfterDedupe: edges.length,
    unresolvedLinks,
    missing: nodes.filter((node) => node.isMissing).length,
    edges: edges.length,
    degreeAverage,
    degreeMax,
  };
}

export function buildGraphData({ vaultId, files = [] }) {
  const parsedNotes = parseGraphNotes(vaultId, files);
  const indexes = buildNoteIndexes(parsedNotes);
  const nodesById = new Map(parsedNotes.map((note) => [note.id, { ...note }]));
  const edgesById = new Map();
  let totalWikiLinks = 0;
  let edgeCountBeforeDedupe = 0;
  let unresolvedLinks = 0;

  for (const note of parsedNotes) {
    const relations = extractGraphRelations(note);
    totalWikiLinks += relations.length;
    for (const relation of relations) {
      const targetNote = resolveWikiTarget(relation.link.target, indexes);
      const targetId = targetNote?.id || missingNodeId(vaultId, normalizeLookup(relation.link.target));
      if (targetId === note.id) continue;
      edgeCountBeforeDedupe += 1;
      if (!targetNote) unresolvedLinks += 1;

      if (!targetNote && !nodesById.has(targetId)) {
        nodesById.set(targetId, {
          id: targetId,
          vaultId,
          filePath: undefined,
          canonicalName: relation.link.target,
          title: relation.link.alias || relation.link.target,
          folder: '',
          type: '',
          sourceType: '',
          status: '',
          tags: [],
          isMissing: true,
          missingTarget: relation.link.target,
          degree: 0,
          linkCount: 0,
        });
      }

      const edgeKey = `${note.id}->${targetId}`;
      const existing = edgesById.get(edgeKey);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.kinds.includes(relation.kind)) existing.kinds.push(relation.kind);
      } else {
        edgesById.set(edgeKey, {
          id: edgeKey,
          source: note.id,
          target: targetId,
          kinds: [relation.kind],
          occurrences: 1,
        });
      }
    }
  }

  const degreeById = new Map();
  for (const edge of edgesById.values()) {
    degreeById.set(edge.source, (degreeById.get(edge.source) || 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) || 0) + 1);
  }

  const nodes = [...nodesById.values()].map((node) => ({
    ...node,
    degree: degreeById.get(node.id) || 0,
    linkCount: degreeById.get(node.id) || 0,
  }));
  const edges = [...edgesById.values()];
  const stats = graphStats(parsedNotes, nodes, edges, totalWikiLinks, edgeCountBeforeDedupe, unresolvedLinks);

  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.info('[graph:data]', {
      vaultId,
      totalNotes: stats.notes,
      connectedNotes: stats.connectedNotes,
      isolatedNotes: stats.isolatedNotes,
      totalWikiLinks: stats.totalWikiLinks,
      edgesBeforeDedupe: stats.edgeCountBeforeDedupe,
      edgesAfterDedupe: stats.edgeCountAfterDedupe,
      unresolvedLinks: stats.unresolvedLinks,
      averageDegree: Number(stats.degreeAverage.toFixed(2)),
      maxDegree: stats.degreeMax,
    });
  }

  return { vaultId, nodes, edges, stats };
}

export { graphNodeId };