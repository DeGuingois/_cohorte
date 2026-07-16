import { drawGraphEdge } from '../renderers/GraphEdge.js';
import { drawGraphLabel } from '../renderers/GraphLabel.js';
import { drawGraphNode } from '../renderers/GraphNode.js';
import { visibleByGraphFilters } from '../graphUtils.js';

const GRAPH_BG = '#202020';

export function drawGraphCanvas(ctx, size, graph, camera, ui) {
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = GRAPH_BG;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.save();
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

  const visible = new Set(graph.nodes.filter((node) => visibleByGraphFilters(node, ui.filters)).map((node) => node.id));
  for (const edge of graph.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    drawGraphEdge(ctx, edge, graph, ui, camera);
  }
  for (const node of graph.nodes) {
    if (!visible.has(node.id)) continue;
    drawGraphNode(ctx, node, graph, ui, camera);
  }
  for (const node of graph.nodes) {
    if (!visible.has(node.id)) continue;
    drawGraphLabel(ctx, node, graph, ui, camera);
  }

  ctx.restore();
}
