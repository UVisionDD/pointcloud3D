export function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wm-dim">point</span>
      <span className="wm-dot">·</span>
      <span className="wm-dim">cloud</span>
      <span className="wm-dot">·</span>
      <span className="wm-bright">3d</span>
    </span>
  );
}
