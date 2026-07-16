import { clamp, GRAPH_SETTINGS } from './graphUtils.js';

export function createCamera() {
  return { zoom: 1, x: 0, y: 0 };
}

export function screenToWorld(point, camera) {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function zoomAt(camera, point, factor, settings = GRAPH_SETTINGS) {
  const before = screenToWorld(point, camera);
  const zoom = clamp(camera.zoom * factor, settings.minZoom, settings.maxZoom);
  camera.zoom = zoom;
  camera.x = point.x - before.x * zoom;
  camera.y = point.y - before.y * zoom;
}

export function panCamera(camera, delta) {
  camera.x += delta.x;
  camera.y += delta.y;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[clamp(Math.floor((sorted.length - 1) * ratio), 0, sorted.length - 1)];
}

export function largestConnectedComponent(nodes, edges, allowedIds = null) {
  const nodeIds = new Set(nodes.filter((node) => (allowedIds ? allowedIds.has(node.id) : true)).map((node) => node.id));
  const adjacency = new Map([...nodeIds].map((id) => [id, new Set()]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }

  const seen = new Set();
  let best = [];
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    const queue = [id];
    const component = [];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of adjacency.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (component.length > best.length) best = component;
  }
  return new Set(best);
}

export function fitGraphToViewport(camera, nodes, edges, size, settings = GRAPH_SETTINGS) {
  if (!nodes.length || !size.width || !size.height) return;
  const connectedIds = new Set(nodes.filter((node) => (node.degree || 0) > 0 && !node.isMissing).map((node) => node.id));
  const mainComponentIds = largestConnectedComponent(nodes, edges, connectedIds);
  let frameNodes = nodes.filter((node) => mainComponentIds.has(node.id));
  if (!frameNodes.length) frameNodes = nodes.filter((node) => (node.degree || 0) > 0);
  if (!frameNodes.length) frameNodes = nodes;

  const xs = frameNodes.map((node) => node.x);
  const ys = frameNodes.map((node) => node.y);
  const minX = percentile(xs, 0.02);
  const maxX = percentile(xs, 0.98);
  const minY = percentile(ys, 0.02);
  const maxY = percentile(ys, 0.98);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const marginX = Math.max(28, width * 0.12);
  const marginY = Math.max(28, height * 0.12);
  const zoom = clamp(Math.min(size.width / (width + marginX * 2), size.height / (height + marginY * 2)), settings.minZoom, 1.72);
  camera.zoom = zoom;
  camera.x = size.width / 2 - ((minX + maxX) / 2) * zoom;
  camera.y = size.height / 2 - ((minY + maxY) / 2) * zoom;
}

export function centerCamera(camera, size) {
  camera.x = size.width / 2;
  camera.y = size.height / 2;
}