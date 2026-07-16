import GraphCanvas from './GraphCanvas.jsx';
import GraphLegend from './GraphLegend.jsx';
import GraphSettingsPanel from './GraphSettingsPanel.jsx';
import GraphToolbar from './GraphToolbar.jsx';
import GraphTooltip from './GraphTooltip.jsx';

export default function GraphTemplate({
  vault,
  stats,
  filters,
  panel,
  tuning,
  filterOptions,
  searchResults,
  tooltipNode,
  graphRef,
  cameraRef,
  uiRef,
  canvasApiRef,
  onFilterChange,
  onPanelChange,
  onTuningChange,
  onTuningReset,
  onSelectSearchResult,
  onHoverNode,
  onSelectNode,
  onNodeOpen,
  onPersistState,
}) {
  return (
    <main className="graph-pane graph-pane-v2" tabIndex={0}>
      <GraphToolbar
        vault={vault}
        stats={stats}
        onZoomIn={() => canvasApiRef.current?.zoomIn()}
        onZoomOut={() => canvasApiRef.current?.zoomOut()}
        onCenter={() => canvasApiRef.current?.center()}
        onFit={() => canvasApiRef.current?.fit()}
        onRestart={() => canvasApiRef.current?.restart()}
      />
      <GraphSettingsPanel
        filters={filters}
        panel={panel}
        tuning={tuning}
        options={filterOptions}
        searchResults={searchResults}
        onFilterChange={onFilterChange}
        onPanelChange={onPanelChange}
        onTuningChange={onTuningChange}
        onTuningReset={onTuningReset}
        onSelectSearchResult={onSelectSearchResult}
      />
      <GraphCanvas
        ref={canvasApiRef}
        vaultId={vault?.id || ''}
        graphRef={graphRef}
        cameraRef={cameraRef}
        uiRef={uiRef}
        onHoverNode={onHoverNode}
        onSelectNode={onSelectNode}
        onPersistState={onPersistState}
      />
      <GraphLegend />
      <GraphTooltip node={tooltipNode} selected={tooltipNode?.id === uiRef.current.selectedNodeId} onOpen={onNodeOpen} />
    </main>
  );
}
