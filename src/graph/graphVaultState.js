import { GRAPH_SETTINGS } from './graphUtils.js';

const GRAPH_LAYOUT_VERSION = 'obsidian-canvas-v8-close-isolates';
const states = new Map();

export function defaultGraphFilters() {
  return {
    query: '',
    tag: '',
    folder: '',
    type: '',
    status: '',
    showIsolated: true,
    showMissing: true,
  };
}

export function defaultGraphPanelState() {
  return {
    collapsed: false,
    section: 'filters',
  };
}

export function defaultGraphTuning() {
  return { ...GRAPH_SETTINGS };
}

export function loadGraphVaultState(vaultId) {
  const state = states.get(vaultId);
  if (!state || state.layoutVersion !== GRAPH_LAYOUT_VERSION) return null;
  return {
    camera: state.camera ? { ...state.camera } : null,
    selectedNodeId: state.selectedNodeId || '',
    filters: { ...defaultGraphFilters(), ...(state.filters || {}) },
    panel: { ...defaultGraphPanelState(), ...(state.panel || {}) },
    tuning: { ...defaultGraphTuning(), ...(state.tuning || {}) },
    nodePositions: { ...(state.nodePositions || {}) },
  };
}

export function saveGraphVaultState(vaultId, { camera, selectedNodeId, filters, panel, tuning, nodes }) {
  if (!vaultId) return;
  states.set(vaultId, {
    layoutVersion: GRAPH_LAYOUT_VERSION,
    camera: camera ? { ...camera } : null,
    selectedNodeId: selectedNodeId || '',
    filters: { ...defaultGraphFilters(), ...(filters || {}) },
    panel: { ...defaultGraphPanelState(), ...(panel || {}) },
    tuning: { ...defaultGraphTuning(), ...(tuning || {}) },
    nodePositions: Object.fromEntries((nodes || []).map((node) => [node.id, { x: node.x, y: node.y, fixed: !!node.fixed }])),
  });
}