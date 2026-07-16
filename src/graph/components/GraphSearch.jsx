export default function GraphSearch({ value, onChange }) {
  return (
    <label>
      <span>RECHERCHE</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="titre, chemin, canonical..." />
    </label>
  );
}