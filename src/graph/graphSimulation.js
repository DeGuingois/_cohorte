import { clamp, createAdjacency, GRAPH_SETTINGS, hashUnit, nodeRadius } from './graphUtils.js';

function initialPosition(node, sortedIndex, connectedCount, isolatedIndex, isolatedCount, mainRadius, adjacency, positioned) {
  const angle = hashUnit(`${node.id}:angle`) * Math.PI * 2;
  const jitter = hashUnit(`${node.id}:radius`);

  if (!(node.degree || 0)) {
    const ringAngle = (isolatedIndex / Math.max(1, isolatedCount)) * Math.PI * 2 + angle * 0.22;
    const ringRadius = mainRadius * (0.60 + jitter * 0.06);
    return { x: Math.cos(ringAngle) * ringRadius, y: Math.sin(ringAngle) * ringRadius };
  }

  const neighborId = [...(adjacency.get(node.id) || [])].find((id) => positioned.has(id));
  const neighbor = neighborId ? positioned.get(neighborId) : null;
  if (neighbor) {
    const radius = 44 + jitter * 58;
    return { x: neighbor.x + Math.cos(angle) * radius, y: neighbor.y + Math.sin(angle) * radius };
  }

  const normalized = (sortedIndex + 0.5) / Math.max(1, connectedCount);
  const radius = Math.sqrt(normalized) * mainRadius * (0.32 + jitter * 0.62);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function createLayoutNodes(graph, savedPositions = {}, settings = GRAPH_SETTINGS) {
  const adjacency = createAdjacency(graph.edges || []);
  const connectedCount = graph.nodes.filter((node) => node.degree || node.linkCount).length;
  const isolatedCount = graph.nodes.length - connectedCount;
  const mainRadius = clamp(Math.sqrt(Math.max(connectedCount, 12)) * settings.linkDistance * 0.82, 220, 760);
  const positioned = new Map();
  let isolatedIndex = 0;

  return graph.nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => (b.node.degree || b.node.linkCount || 0) - (a.node.degree || a.node.linkCount || 0))
    .map(({ node, index }, sortedIndex) => {
      const saved = savedPositions?.[node.id];
      const isolatedSlot = node.degree || node.linkCount ? isolatedIndex : isolatedIndex++;
      const initial = saved || initialPosition(node, sortedIndex, connectedCount, isolatedSlot, isolatedCount, mainRadius, adjacency, positioned);
      const layoutNode = {
        ...node,
        degree: node.degree ?? node.linkCount ?? 0,
        linkCount: node.linkCount ?? node.degree ?? 0,
        x: initial.x,
        y: initial.y,
        vx: 0,
        vy: 0,
        fx: initial.x,
        fy: initial.y,
        fixed: !!saved?.fixed,
        radius: nodeRadius(node, settings),
        originalIndex: index,
      };
      positioned.set(layoutNode.id, layoutNode);
      return layoutNode;
    })
    .sort((a, b) => a.originalIndex - b.originalIndex);
}


function separateOverlaps(nodes, settings, passes = 18, strength = 1) {
  let moved = false;
  for (let pass = 0; pass < passes; pass += 1) {
    let passMoved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (!d) {
          const angle = hashUnit(`${a.id}:${b.id}:final-collision`) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        } else {
          dx /= d;
          dy /= d;
        }
        const minDistance = a.radius + b.radius + settings.collisionPadding;
        if (d >= minDistance) continue;
        const overlap = (minDistance - d) * strength;
        const aShare = b.fixed ? 1 : 0.5;
        const bShare = a.fixed ? 1 : 0.5;
        if (!a.fixed) {
          a.x -= dx * overlap * aShare;
          a.y -= dy * overlap * aShare;
          a.vx = 0;
          a.vy = 0;
        }
        if (!b.fixed) {
          b.x += dx * overlap * bShare;
          b.y += dy * overlap * bShare;
          b.vx = 0;
          b.vy = 0;
        }
        passMoved = true;
        moved = true;
      }
    }
    if (!passMoved) break;
  }
  return moved;
}
function componentRadius(nodes) {
  const connected = nodes.filter((node) => node.degree > 0);
  const source = connected.length ? connected : nodes;
  if (!source.length) return 130;
  const distances = source.map((node) => Math.hypot(node.x, node.y)).sort((a, b) => a - b);
  return clamp(distances[Math.floor(distances.length * 0.9)] || 130, 75, 520);
}

export function createGraphSimulation({ nodes, edges, nodeMap, settings = GRAPH_SETTINGS, onTick, onReady, onStop }) {
  const simulation = {
    alpha: 0.82,
    running: false,
    frame: 0,
    tickCount: 0,
    ready: false,
    start(alpha = 0.82) {
      this.alpha = Math.max(this.alpha, alpha);
      if (this.running) return;
      this.running = true;
      this.frame = requestAnimationFrame(step);
    },
    stop() {
      this.running = false;
      cancelAnimationFrame(this.frame);
    },
  };

  const step = () => {
    if (!simulation.running) return;
    const alpha = simulation.alpha;
    const charge = settings.charge * (0.86 + Math.min(0.52, nodes.length / 460));

    for (const node of nodes) {
      node.vx = (node.vx || 0) * (1 - settings.velocityDecay);
      node.vy = (node.vy || 0) * (1 - settings.velocityDecay);
    }

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        const localCharge = charge * (a.degree && b.degree ? 1 : 0.08);
        const force = (localCharge * alpha) / Math.max(70, d2);
        if (!a.fixed) {
          a.vx -= dx * force;
          a.vy -= dy * force;
        }
        if (!b.fixed) {
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
    }

    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const degreeBoost = clamp(Math.sqrt(Math.max(1, a.degree) * Math.max(1, b.degree)) / 12, 0, 0.22);
      const leafBoost = (a.degree === 1 || b.degree === 1) ? 0.1 : 0;
      const targetDistance = settings.linkDistance + (a.isMissing || b.isMissing ? 10 : 0);
      const force = (d - targetDistance) * (settings.linkStrength + degreeBoost + leafBoost) * alpha;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    const collisionAlpha = Math.max(0.42, alpha);
    const collisionPasses = Math.max(1, Math.round(settings.collisionIterations || 3));
    for (let pass = 0; pass < collisionPasses; pass += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (!d) {
            const angle = hashUnit(`${a.id}:${b.id}:collision`) * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
          } else {
            dx /= d;
            dy /= d;
          }
          const minDistance = a.radius + b.radius + settings.collisionPadding;
          if (d >= minDistance) continue;
          const overlap = (minDistance - d) * settings.collisionStrength * collisionAlpha;
          const aShare = b.fixed ? 1 : 0.5;
          const bShare = a.fixed ? 1 : 0.5;
          if (!a.fixed) {
            a.x -= dx * overlap * aShare;
            a.y -= dy * overlap * aShare;
            a.vx -= dx * overlap * 0.08;
            a.vy -= dy * overlap * 0.08;
          }
          if (!b.fixed) {
            b.x += dx * overlap * bShare;
            b.y += dy * overlap * bShare;
            b.vx += dx * overlap * 0.08;
            b.vy += dy * overlap * 0.08;
          }
        }
      }
    }

    const ringRadius = componentRadius(nodes) * 0.70;
    for (const node of nodes) {
      if (node.fixed) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      if (!node.degree) {
        const d = Math.hypot(node.x, node.y) || 1;
        const ringForce = (ringRadius - d) * settings.isolatedRingStrength * alpha;
        node.vx += (node.x / d) * ringForce;
        node.vy += (node.y / d) * ringForce;
      } else {
        node.vx += -node.x * settings.centerStrength * alpha;
        node.vy += -node.y * settings.centerStrength * alpha;
      }
      node.x += clamp(node.vx, -12, 12);
      node.y += clamp(node.vy, -12, 12);
    }

    simulation.alpha *= (1 - settings.alphaDecay);
    simulation.tickCount += 1;
    if (simulation.alpha < settings.minAlpha) {
      simulation.running = false;
      separateOverlaps(nodes, settings, Math.max(24, Math.round((settings.collisionIterations || 4) * 8)), 1);
      onTick?.();
      if (!simulation.ready) {
        simulation.ready = true;
        onReady?.();
      }
      onStop?.();
      return;
    }
    onTick?.();
    simulation.frame = requestAnimationFrame(step);
  };

  return simulation;
}