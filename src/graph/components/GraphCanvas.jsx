import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { centerCamera, fitGraphToViewport, panCamera, screenToWorld, zoomAt } from '../graphCamera.js';
import { DRAG_THRESHOLD, findNodeAtPoint, pointerPoint } from '../graphInteractions.js';
import { createGraphSimulation } from '../graphSimulation.js';
import { GRAPH_SETTINGS } from '../graphUtils.js';
import { drawGraphCanvas } from '../renderers/drawGraphCanvas.js';

const GraphCanvas = forwardRef(function GraphCanvas({ graphRef, cameraRef, uiRef, vaultId, onHoverNode, onSelectNode, onPersistState }, ref) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const simulationRef = useRef(null);
  const pointerRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const initialFitPendingRef = useRef(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const isPreparingRef = useRef(true);
  const [size, setSize] = useState({ width: 0, height: 0 });

  function setPreparing(value) {
    isPreparingRef.current = value;
    setIsPreparing(value);
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const ctx = canvas.getContext('2d');
    drawGraphCanvas(ctx, size, graphRef.current, cameraRef.current, uiRef.current);
  }

  function persist() {
    onPersistState?.();
  }

  function fit() {
    fitGraphToViewport(cameraRef.current, graphRef.current.nodes, graphRef.current.edges, size, graphRef.current.settings);
    initialFitPendingRef.current = false;
    persist();
    draw();
  }

  function zoomFromCenter(factor) {
    zoomAt(cameraRef.current, { x: size.width / 2, y: size.height / 2 }, factor, graphRef.current.settings);
    persist();
    draw();
  }

  function restart() {
    setPreparing(true);
    graphRef.current.nodes.forEach((node) => { node.fixed = false; });
    simulationRef.current?.start(0.76);
  }

  useImperativeHandle(ref, () => ({
    draw,
    fit,
    zoomIn: () => zoomFromCenter(1.22),
    zoomOut: () => zoomFromCenter(0.82),
    center: () => {
      centerCamera(cameraRef.current, size);
      persist();
      draw();
    },
    restart,
    centerOnNode: (node, zoom = Math.max(cameraRef.current.zoom, 1.08)) => {
      if (!node || !size.width) return;
      const nextZoom = Math.min(GRAPH_SETTINGS.maxZoom, Math.max(GRAPH_SETTINGS.minZoom, zoom));
      cameraRef.current.zoom = nextZoom;
      cameraRef.current.x = size.width / 2 - node.x * nextZoom;
      cameraRef.current.y = size.height / 2 - node.y * nextZoom;
      persist();
      draw();
    },
  }));

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    canvas.width = Math.floor(size.width);
    canvas.height = Math.floor(size.height);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    if (initialFitPendingRef.current && graphRef.current.nodes.length) fit();
    else draw();
  }, [size.width, size.height]);

  useEffect(() => {
    simulationRef.current?.stop();
    simulationRef.current = null;
    setPreparing(true);
    if (!graphRef.current.nodes.length) {
      setPreparing(false);
      draw();
      return undefined;
    }

    if (!cameraRef.current.restored && size.width && size.height) fitGraphToViewport(cameraRef.current, graphRef.current.nodes, graphRef.current.edges, size, graphRef.current.settings);
    else if (!cameraRef.current.restored) initialFitPendingRef.current = true;

    simulationRef.current = createGraphSimulation({
      nodes: graphRef.current.nodes,
      edges: graphRef.current.edges,
      nodeMap: graphRef.current.nodeMap,
      settings: graphRef.current.settings,
      onTick: () => { if (!isPreparingRef.current) draw(); },
      onReady: () => { draw(); setPreparing(false); },
      onStop: persist,
    });
    simulationRef.current.start(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.16 : 0.82);
    draw();

    return () => {
      simulationRef.current?.stop();
      simulationRef.current = null;
    };
  }, [vaultId, graphRef.current.version]);

  function nodeAt(point) {
    return findNodeAtPoint(point, cameraRef.current, graphRef.current.nodes, uiRef.current.filters);
  }

  function handlePointerDown(event) {
    if (isPreparing) return;
    const canvas = canvasRef.current;
    const point = pointerPoint(event, canvas);
    activePointersRef.current.set(event.pointerId, point);
    const node = nodeAt(point);
    if (!node && activePointersRef.current.size >= 2) {
      const points = [...activePointersRef.current.values()].slice(0, 2);
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      pointerRef.current = {
        id: event.pointerId,
        mode: 'pinch',
        startDistance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
        startZoom: cameraRef.current.zoom,
        startWorld: screenToWorld(center, cameraRef.current),
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    pointerRef.current = { id: event.pointerId, start: point, last: point, node, mode: node ? 'node-pending' : 'pan', dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (isPreparing) return;
    const canvas = canvasRef.current;
    const point = pointerPoint(event, canvas);
    if (activePointersRef.current.has(event.pointerId)) activePointersRef.current.set(event.pointerId, point);
    const pointer = pointerRef.current;

    if (pointer?.mode === 'pinch' && activePointersRef.current.size >= 2) {
      const points = [...activePointersRef.current.values()].slice(0, 2);
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const nextDistance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
      const zoom = Math.min(GRAPH_SETTINGS.maxZoom, Math.max(GRAPH_SETTINGS.minZoom, pointer.startZoom * (nextDistance / pointer.startDistance)));
      cameraRef.current.zoom = zoom;
      cameraRef.current.x = center.x - pointer.startWorld.x * zoom;
      cameraRef.current.y = center.y - pointer.startWorld.y * zoom;
      draw();
      return;
    }

    if (!pointer) {
      const nextId = nodeAt(point)?.id || '';
      if (nextId !== uiRef.current.hoveredNodeId) onHoverNode(nextId);
      return;
    }

    if (Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) > DRAG_THRESHOLD) pointer.dragged = true;

    if (pointer.node && pointer.dragged) {
      const world = screenToWorld(point, cameraRef.current);
      pointer.node.x = world.x;
      pointer.node.y = world.y;
      pointer.node.fx = world.x;
      pointer.node.fy = world.y;
      pointer.node.fixed = true;
      draw();
      return;
    }

    if (!pointer.node && pointer.mode === 'pan') {
      panCamera(cameraRef.current, { x: point.x - pointer.last.x, y: point.y - pointer.last.y });
      pointer.last = point;
      draw();
    }
  }

  function handlePointerUp(event) {
    if (isPreparing) return;
    activePointersRef.current.delete(event.pointerId);
    try {
      canvasRef.current.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }
    const pointer = pointerRef.current;
    pointerRef.current = null;
    persist();
    if (!pointer || pointer.mode === 'pinch') return;
    if (pointer.dragged) return;
    if (!pointer.node) {
      onSelectNode('');
      draw();
      return;
    }
    onSelectNode(pointer.node.id);
  }

  function handleWheel(event) {
    if (isPreparing) return;
    event.preventDefault();
    const point = pointerPoint(event, canvasRef.current);
    zoomAt(cameraRef.current, point, Math.exp(-event.deltaY * 0.0012), graphRef.current.settings);
    persist();
    draw();
  }

  function handleDoubleClick(event) {
    if (isPreparing) return;
    const node = nodeAt(pointerPoint(event, canvasRef.current));
    if (node) ref?.current?.centerOnNode?.(node, 1.25);
    else fit();
  }

  return (
    <div className="graph-canvas-wrap" ref={wrapRef}>
      {!graphRef.current.nodes.length && <div className="graph-empty">Aucune note a afficher dans le graphique.</div>}
      {isPreparing && graphRef.current.nodes.length > 0 && (
        <div className="graph-loading" aria-live="polite">
          <span />
          <strong>Chargement des synapses</strong>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={isPreparing ? 'graph-canvas graph-canvas--hidden' : 'graph-canvas'}
        aria-label="Graphe global du vault actif"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
});

export default GraphCanvas;