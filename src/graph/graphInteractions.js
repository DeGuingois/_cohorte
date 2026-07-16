import { distance, visibleByGraphFilters } from './graphUtils.js';
import { screenToWorld } from './graphCamera.js';

export const DRAG_THRESHOLD = 5;

export function findNodeAtPoint(point, camera, nodes, filters) {
  const world = screenToWorld(point, camera);
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!visibleByGraphFilters(node, filters)) continue;
    if (distance(world, node) <= node.radius + 5 / camera.zoom) return node;
  }
  return null;
}

export function pointerPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}