const GROUP_SWATCHES = ['#FFFFFF', '#FFF5F1', '#F8DDD8', '#F2BBB8', '#E98282'];

const LEGEND_ITEMS = [
  { label: 'Hub', color: '#FF3B42' },
  { label: 'Isolee', color: '#FFFFFF' },
  { label: 'Non resolue', color: '#941F24' },
  { label: 'Recherche', color: '#FF8A8F' },
  { label: 'Selection', color: '#FF5159' },
];

export default function GraphLegend() {
  return (
    <aside className="graph-legend" aria-label="Legende du graphe">
      <strong>Couleurs</strong>
      <div className="graph-legend-row">
        <span className="graph-legend-swatches" aria-hidden="true">
          {GROUP_SWATCHES.map((color) => (
            <span key={color} className="graph-legend-dot" style={{ background: color }} />
          ))}
        </span>
        <span>Groupes</span>
      </div>
      {LEGEND_ITEMS.map((item) => (
        <div className="graph-legend-row" key={item.label}>
          <span className="graph-legend-dot" style={{ background: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
        </div>
      ))}
    </aside>
  );
}
