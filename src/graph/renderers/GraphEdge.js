export function drawGraphEdge(ctx, edge, graph, ui, camera) {
  const source = graph.nodeMap.get(edge.source);
  const target = graph.nodeMap.get(edge.target);
  if (!source || !target) return;
  const focusId = ui.hoveredNodeId || ui.selectedNodeId || graph.activeNodeId;
  const focused = focusId && (edge.source === focusId || edge.target === focusId);
  const dimmed = focusId && !focused;

  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.lineTo(target.x, target.y);
  ctx.lineWidth = (graph.settings.edgeWidth + Math.min(0.55, (edge.occurrences - 1) * 0.1)) / Math.max(0.75, Math.sqrt(camera.zoom));
  ctx.strokeStyle = focused
    ? 'rgba(244, 239, 234, 0.82)'
    : dimmed
      ? 'rgba(114, 93, 93, 0.12)'
      : source.isMissing || target.isMissing
        ? 'rgba(114, 93, 93, 0.25)'
        : `rgba(114, 93, 93, ${Math.min(0.4, Math.max(0.25, graph.settings.edgeOpacity))})`;
  ctx.stroke();
}
