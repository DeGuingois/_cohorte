import GraphSearch from './GraphSearch.jsx';

const SLIDERS = [
  { key: 'linkDistance', label: 'Distance liens', min: 25, max: 260, step: 1 },
  { key: 'charge', label: 'Repulsion', min: 20, max: 900, step: 5 },
  { key: 'collisionPadding', label: 'Espacement', min: 0, max: 80, step: 1 },
  { key: 'collisionIterations', label: 'Passes collision', min: 1, max: 8, step: 1 },
  { key: 'centerStrength', label: 'Centrage', min: 0.004, max: 0.08, step: 0.002 },
  { key: 'isolatedRingStrength', label: 'Force isoles', min: 0.002, max: 0.06, step: 0.002 },
  { key: 'linkStrength', label: 'Force liens', min: 0.12, max: 1.1, step: 0.02 },
  { key: 'radiusScale', label: 'Taille hubs', min: 0.7, max: 3, step: 0.05 },
  { key: 'maxRadius', label: 'Rayon max', min: 6, max: 24, step: 0.5 },
  { key: 'edgeOpacity', label: 'Opacite liens', min: 0.08, max: 0.8, step: 0.02 },
  { key: 'edgeWidth', label: 'Epaisseur liens', min: 0.35, max: 2.2, step: 0.05 },
  { key: 'labelZoomThreshold', label: 'Seuil labels', min: 0.25, max: 1.8, step: 0.05 },
];

function SliderControl({ item, value, onChange }) {
  return (
    <label className="graph-slider">
      <span>{item.label}</span>
      <div>
        <input
          type="range"
          min={item.min}
          max={item.max}
          step={item.step}
          value={value}
          onChange={(event) => onChange({ [item.key]: Number(event.target.value) })}
        />
        <output>{Number(value).toFixed(item.step < 0.01 ? 3 : item.step < 0.1 ? 2 : item.step < 1 ? 1 : 0)}</output>
      </div>
    </label>
  );
}

export default function GraphSettingsPanel({ filters, panel, tuning, options, searchResults, onFilterChange, onPanelChange, onTuningChange, onTuningReset, onSelectSearchResult }) {
  if (panel.collapsed) {
    return (
      <aside className="graph-controls graph-controls--collapsed">
        <button type="button" className="graph-panel-toggle" onClick={() => onPanelChange({ collapsed: false })}>REGLAGES</button>
      </aside>
    );
  }

  return (
    <aside className="graph-controls">
      <div className="graph-panel-head">
        <button type="button" className={panel.section === 'filters' ? 'is-active' : ''} onClick={() => onPanelChange({ section: 'filters' })}>FILTRES</button>
        <button type="button" className={panel.section === 'physics' ? 'is-active' : ''} onClick={() => onPanelChange({ section: 'physics' })}>REGLAGES</button>
        <button type="button" aria-label="Replier" onClick={() => onPanelChange({ collapsed: true })}>x</button>
      </div>

      {panel.section === 'filters' ? (
        <>
          <GraphSearch value={filters.query} onChange={(query) => onFilterChange({ query })} />
          <label>
            <span>TAG</span>
            <select value={filters.tag} onChange={(event) => onFilterChange({ tag: event.target.value })}>
              <option value="">Tous</option>
              {options.tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
          <label>
            <span>DOSSIER</span>
            <select value={filters.folder} onChange={(event) => onFilterChange({ folder: event.target.value })}>
              <option value="">Tous</option>
              {options.folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          </label>
          <label>
            <span>TYPE</span>
            <select value={filters.type} onChange={(event) => onFilterChange({ type: event.target.value })}>
              <option value="">Tous</option>
              {options.types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span>STATUT</span>
            <select value={filters.status} onChange={(event) => onFilterChange({ status: event.target.value })}>
              <option value="">Tous</option>
              {options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="graph-toggle">
            <input type="checkbox" checked={filters.showIsolated} onChange={(event) => onFilterChange({ showIsolated: event.target.checked })} />
            <span>NOTES ISOLEES</span>
          </label>
          <label className="graph-toggle">
            <input type="checkbox" checked={filters.showMissing} onChange={(event) => onFilterChange({ showMissing: event.target.checked })} />
            <span>NOEUDS MANQUANTS</span>
          </label>
          {searchResults.length > 0 && (
            <div className="graph-search-results">
              {searchResults.map((node) => (
                <button type="button" key={node.id} onClick={() => onSelectSearchResult(node.id)}>{node.title}</button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="graph-tuning">
          {SLIDERS.map((item) => (
            <SliderControl key={item.key} item={item} value={tuning[item.key]} onChange={onTuningChange} />
          ))}
          <button type="button" className="graph-reset" onClick={onTuningReset}>VALEURS PAR DEFAUT</button>
        </div>
      )}
    </aside>
  );
}