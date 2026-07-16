function previewLines(node) {
  const lines = [];
  if (node.canonicalName) lines.push(`canonical: ${node.canonicalName}`);
  if (node.type) lines.push(`type: ${node.type}`);
  if (node.status) lines.push(`status: ${node.status}`);
  if (node.folder) lines.push(`dossier: ${node.folder}`);
  if (node.tags?.length) lines.push(node.tags.slice(0, 8).map((tag) => `#${tag}`).join(' '));
  lines.push(`${node.degree || 0} connexion(s)`);
  return lines.slice(0, 6);
}

export default function GraphTooltip({ node, selected, onOpen }) {
  if (!node) return null;
  const canOpen = selected && !node.isMissing && node.filePath;
  return (
    <div className={selected ? 'graph-tooltip graph-tooltip--preview' : 'graph-tooltip'}>
      <strong>{node.title}</strong>
      {node.isMissing ? <span>Note inexistante</span> : <span>{node.filePath}</span>}
      {selected && (
        <div className="graph-preview-lines">
          {previewLines(node).map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
      {!selected && (
        <>
          {node.canonicalName && <span>canonical: {node.canonicalName}</span>}
          {node.folder && <span>dossier: {node.folder}</span>}
          {node.status && <span>status: {node.status}</span>}
          {node.type && <span>type: {node.type}</span>}
          <span>{node.degree || 0} connexion(s)</span>
          {!!node.tags?.length && <span>{node.tags.map((tag) => `#${tag}`).join(' ')}</span>}
        </>
      )}
      {canOpen && (
        <button
          type="button"
          className="graph-open-note"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen({ vaultId: node.vaultId, filePath: node.filePath, canonicalName: node.canonicalName });
          }}
        >
          OUVRIR
        </button>
      )}
    </div>
  );
}