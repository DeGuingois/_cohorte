import { areAdjacent, clamp, matchesGraphSearch } from '../graphUtils.js';

function labelImportance(node, graph, ui) {
  if (node.id === ui.hoveredNodeId) return 'hovered';
  if (node.id === ui.selectedNodeId) return 'selected';
  if (node.id === graph.activeNodeId) return 'active';
  if (matchesGraphSearch(node, ui.filters.query)) return 'search';
  return '';
}

export function shouldDrawLabel(node, graph, ui, camera) {
  if (labelImportance(node, graph, ui)) return true;
  if (camera.zoom < graph.settings.labelZoomThreshold) return false;

  const maxDegree = graph.maxDegree || 1;
  const degree = node.degree || 0;
  const zoom = camera.zoom;

  if (degree >= Math.max(6, maxDegree * 0.34)) return true;
  if (zoom >= graph.settings.labelZoomThreshold + 0.35 && degree >= Math.max(3, maxDegree * 0.18)) return true;
  if (zoom >= graph.settings.labelZoomThreshold + 0.75 && degree >= 1) return true;
  if (zoom >= graph.settings.labelZoomThreshold + 1.15 && !node.isMissing) return true;
  return false;
}

function screenFontSize(node, graph, ui, camera) {
  const importance = labelImportance(node, graph, ui);
  if (importance === 'hovered') return clamp(13.5 - camera.zoom * 0.45, 11.5, 13.5);
  if (importance) return clamp(12.5 - camera.zoom * 0.35, 10.8, 12.5);
  if (camera.zoom >= graph.settings.labelZoomThreshold + 1.15) return 8.2;
  if (camera.zoom >= graph.settings.labelZoomThreshold + 0.75) return 8.8;
  if (camera.zoom >= graph.settings.labelZoomThreshold + 0.35) return 9.4;
  return 10;
}

export function drawGraphLabel(ctx, node, graph, ui, camera) {
  if (!shouldDrawLabel(node, graph, ui, camera)) return;
  const focusId = ui.hoveredNodeId || ui.selectedNodeId || graph.activeNodeId;
  const focused = focusId && areAdjacent(graph.adjacency, focusId, node.id);
  const importance = labelImportance(node, graph, ui);
  ctx.globalAlpha = focusId && !focused ? graph.settings.dimOpacity : importance ? 1 : 0.72;
  const fontSize = screenFontSize(node, graph, ui, camera) / camera.zoom;
  ctx.font = `${fontSize}px "Cascadia Code", Consolas, monospace`;
  ctx.fillStyle = importance ? '#F4EFEA' : 'rgba(175, 163, 163, 0.74)';
  ctx.textBaseline = 'middle';
  const maxLength = importance ? 38 : camera.zoom > 1.8 ? 28 : 22;
  const label = node.title.length > maxLength ? `${node.title.slice(0, maxLength - 3)}...` : node.title;
  ctx.fillText(label, node.x + node.radius + 7 / camera.zoom, node.y + 1 / camera.zoom);
  ctx.globalAlpha = 1;
}
