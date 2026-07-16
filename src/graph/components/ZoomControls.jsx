export default function ZoomControls({ onZoomIn, onZoomOut, onCenter }) {
  return (
    <>
      <button type="button" onClick={onZoomIn}>ZOOM +</button>
      <button type="button" onClick={onZoomOut}>ZOOM -</button>
      <button type="button" onClick={onCenter}>RECENTRER</button>
    </>
  );
}