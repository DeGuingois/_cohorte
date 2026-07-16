import { useEffect, useMemo, useRef, useState } from 'react';
import GraphTemplate from './components/GraphTemplate.jsx';
import { createCamera } from './graphCamera.js';
import { createLayoutNodes } from './graphSimulation.js';
import { createAdjacency, matchesGraphSearch, nodeRadius } from './graphUtils.js';
import {
  defaultGraphFilters,
  defaultGraphPanelState,
  defaultGraphTuning,
  loadGraphVaultState,
  saveGraphVaultState,
} from './graphVaultState.js';

function emptyRuntimeGraph(settings = defaultGraphTuning()) {
  return {
    version: 0,
    nodes: [],
    edges: [],
    nodeMap: new Map(),
    adjacency: new Map(),
    settings,
    activeNodeId: '',
    maxDegree: 1,
  };
}

function activeNodeIdFromPath(nodes, activePath) {
  if (!activePath) return '';
  const normalized = activePath.replace(/\\/g, '/').replace(/\.md$/i, '.md');
  return nodes.find((node) => node.filePath === normalized)?.id || '';
}

const PHYSICAL_TUNING_KEYS = new Set([
  'linkDistance',
  'linkStrength',
  'charge',
  'centerStrength',
  'collisionPadding',
  'collisionStrength',
  'collisionIterations',
  'isolatedRingStrength',
  'minRadius',
  'baseRadius',
  'radiusScale',
  'maxRadius',
]);

export default function GraphPage({ vault, graph, activePath, onOpenFile }) {
  const graphRef = useRef(emptyRuntimeGraph());
  const cameraRef = useRef(createCamera());
  const uiRef = useRef({ hoveredNodeId: '', selectedNodeId: '', filters: defaultGraphFilters() });
  const canvasApiRef = useRef(null);
  const [hoveredNodeId, setHoveredNodeId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [filters, setFilters] = useState(defaultGraphFilters());
  const [panel, setPanel] = useState(defaultGraphPanelState());
  const [tuning, setTuning] = useState(defaultGraphTuning());
  const [runtimeVersion, setRuntimeVersion] = useState(0);

  const activeNodeId = useMemo(() => activeNodeIdFromPath(graphRef.current.nodes, activePath), [activePath, runtimeVersion]);

  function persistState(nextPanel = panel, nextTuning = graphRef.current.settings) {
    saveGraphVaultState(vault?.id, {
      camera: cameraRef.current,
      selectedNodeId: uiRef.current.selectedNodeId,
      filters: uiRef.current.filters,
      panel: nextPanel,
      tuning: nextTuning,
      nodes: graphRef.current.nodes,
    });
  }

  useEffect(() => {
    uiRef.current.hoveredNodeId = hoveredNodeId;
    uiRef.current.selectedNodeId = selectedNodeId;
    uiRef.current.filters = filters;
    canvasApiRef.current?.draw();
  }, [hoveredNodeId, selectedNodeId, filters]);

  useEffect(() => {
    graphRef.current.activeNodeId = activeNodeId;
    canvasApiRef.current?.draw();
  }, [activeNodeId]);

  useEffect(() => {
    if (!graph?.nodes || graph.vaultId !== vault?.id) {
      const nextTuning = defaultGraphTuning();
      graphRef.current = emptyRuntimeGraph(nextTuning);
      cameraRef.current = createCamera();
      cameraRef.current.restored = false;
      uiRef.current = { hoveredNodeId: '', selectedNodeId: '', filters: defaultGraphFilters() };
      setHoveredNodeId('');
      setSelectedNodeId('');
      setFilters(defaultGraphFilters());
      setPanel(defaultGraphPanelState());
      setTuning(nextTuning);
      setRuntimeVersion((value) => value + 1);
      return;
    }

    const saved = loadGraphVaultState(vault.id);
    const nextTuning = saved?.tuning || defaultGraphTuning();
    const nodes = createLayoutNodes(graph, saved?.nodePositions || {}, nextTuning);
    const edges = graph.edges || [];
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = createAdjacency(edges);
    const maxDegree = Math.max(1, ...nodes.map((node) => node.degree || 0));
    const activeId = activeNodeIdFromPath(nodes, activePath);

    graphRef.current = {
      version: Date.now(),
      nodes,
      edges,
      nodeMap,
      adjacency,
      settings: nextTuning,
      activeNodeId: activeId,
      maxDegree,
    };
    cameraRef.current = saved?.camera ? { ...saved.camera, restored: true } : { ...createCamera(), restored: false };
    const nextFilters = saved?.filters || defaultGraphFilters();
    const nextPanel = saved?.panel || defaultGraphPanelState();
    const nextSelected = saved?.selectedNodeId || '';
    uiRef.current = { hoveredNodeId: '', selectedNodeId: nextSelected, filters: nextFilters };
    setHoveredNodeId('');
    setSelectedNodeId(nextSelected);
    setFilters(nextFilters);
    setPanel(nextPanel);
    setTuning(nextTuning);
    setRuntimeVersion((value) => value + 1);
  }, [graph, vault?.id]);

  const filterOptions = useMemo(() => {
    const nodes = graph?.nodes || [];
    return {
      tags: [...new Set(nodes.flatMap((node) => node.tags || []))].sort(),
      folders: [...new Set(nodes.map((node) => node.folder).filter(Boolean))].sort(),
      types: [...new Set(nodes.map((node) => node.type).filter(Boolean))].sort(),
      statuses: [...new Set(nodes.map((node) => node.status).filter(Boolean))].sort(),
    };
  }, [graph]);

  const searchResults = useMemo(() => {
    const query = filters.query.trim();
    if (!query) return [];
    return graphRef.current.nodes.filter((node) => matchesGraphSearch(node, query)).slice(0, 12);
  }, [filters.query, runtimeVersion]);

  const tooltipNode = graphRef.current.nodeMap.get(hoveredNodeId) || graphRef.current.nodeMap.get(selectedNodeId) || null;

  function updateFilter(partial) {
    setFilters((current) => {
      const next = { ...current, ...partial };
      uiRef.current.filters = next;
      return next;
    });
  }

  function updatePanel(partial) {
    setPanel((current) => {
      const next = { ...current, ...partial };
      persistState(next);
      return next;
    });
  }

  function updateTuning(partial) {
    const shouldRestart = Object.keys(partial).some((key) => PHYSICAL_TUNING_KEYS.has(key));
    const next = { ...graphRef.current.settings, ...partial };
    graphRef.current.settings = next;
    graphRef.current.nodes.forEach((node) => {
      node.radius = nodeRadius(node, next);
      if (shouldRestart) node.fixed = false;
    });
    setTuning(next);
    persistState(panel, next);
    if (shouldRestart) canvasApiRef.current?.restart();
    else canvasApiRef.current?.draw();
  }

  function resetTuning() {
    updateTuning(defaultGraphTuning());
  }

  function selectSearchResult(nodeId) {
    const node = graphRef.current.nodeMap.get(nodeId);
    if (!node) return;
    setSelectedNodeId(node.id);
    uiRef.current.selectedNodeId = node.id;
    canvasApiRef.current?.centerOnNode(node, 1.12);
  }

  return (
    <GraphTemplate
      vault={vault}
      stats={graph?.stats || { notes: 0, edges: 0, missing: 0 }}
      filters={filters}
      panel={panel}
      tuning={tuning}
      filterOptions={filterOptions}
      searchResults={searchResults}
      tooltipNode={tooltipNode}
      graphRef={graphRef}
      cameraRef={cameraRef}
      uiRef={uiRef}
      canvasApiRef={canvasApiRef}
      onFilterChange={updateFilter}
      onPanelChange={updatePanel}
      onTuningChange={updateTuning}
      onTuningReset={resetTuning}
      onSelectSearchResult={selectSearchResult}
      onHoverNode={setHoveredNodeId}
      onSelectNode={(nodeId) => {
        setSelectedNodeId(nodeId);
        uiRef.current.selectedNodeId = nodeId;
      }}
      onNodeOpen={onOpenFile}
      onPersistState={() => persistState()}
    />
  );
}