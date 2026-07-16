import FitGraphButton from './FitGraphButton.jsx';
import ZoomControls from './ZoomControls.jsx';

export default function GraphToolbar({ vault, stats, onZoomIn, onZoomOut, onCenter, onFit, onRestart }) {
  return (
    <header className="graph-toolbar">
      <div>
        <strong>VUE GRAPHIQUE</strong>
        <span>{vault?.name || 'AUCUN VAULT'} / {stats.notes || 0} notes / {stats.edges || 0} liens / {stats.missing || 0} manquants</span>
      </div>
      <div className="graph-actions">
        <ZoomControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} onCenter={onCenter} />
        <FitGraphButton onFit={onFit} />
        <button type="button" onClick={onRestart}>RELANCER</button>
      </div>
    </header>
  );
}