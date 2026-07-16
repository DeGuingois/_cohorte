import { areAdjacent, hashNumber, matchesGraphSearch } from '../graphUtils.js';

const GROUP_COLORS = [
  '#FFFFFF',
  '#FFF5F1',
  '#F8DDD8',
  '#F2BBB8',
  '#E98282',
];

function groupColor(node) {
  if (node.isMissing) return '#941F24';
  if (!node.degree) return '#FFFFFF';
  const key = node.folder || node.type || node.tags?.[0] || 'default';
  return GROUP_COLORS[hashNumber(key) % GROUP_COLORS.length];
}

function hubColor(node, graph) {
  const maxDegree = graph.maxDegree || 1;
  if ((node.degree || 0) < Math.max(6, maxDegree * 0.34)) return null;
  return '#FF3B42';
}

export function drawGraphNode(ctx, node, graph, ui, camera) {
  const focusId = ui.hoveredNodeId || ui.selectedNodeId || graph.activeNodeId;
  const relatedToFocus = focusId && areAdjacent(graph.adjacency, focusId, node.id);
  const searched = matchesGraphSearch(node, ui.filters.query);
  const unrelated = focusId && !relatedToFocus;
  const active = node.id === graph.activeNodeId;
  const selected = node.id === ui.selectedNodeId;
  const hovered = node.id === ui.hoveredNodeId;
  const hub = Boolean(hubColor(node, graph));
  const radius = node.radius * (hovered ? 1.22 : selected || active ? 1.13 : 1);

  ctx.globalAlpha = unrelated ? graph.settings.dimOpacity : 1;

  if (hub && !active && !selected && !searched) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 59, 66, 0.16)';
    ctx.fill();
  }

  if (active || selected || hovered || searched) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + (hovered ? 7 : 6), 0, Math.PI * 2);
    ctx.fillStyle = active || selected ? 'rgba(255, 81, 89, 0.34)' : searched ? 'rgba(255, 138, 143, 0.24)' : 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = active || selected
    ? '#FF5159'
    : searched
      ? '#FF8A8F'
      : hovered
        ? '#F4EFEA'
        : hubColor(node, graph) || groupColor(node);
  ctx.fill();

  if (active || selected || hovered || searched) {
    ctx.lineWidth = 1.35 / Math.sqrt(camera.zoom);
    ctx.strokeStyle = active || selected ? '#F4EFEA' : searched ? '#FFF5F1' : '#FFFFFF';
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
