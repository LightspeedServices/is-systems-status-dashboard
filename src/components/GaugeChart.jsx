function barColor(pct) {
  if (pct >= 0.9) return '#ef4444'; // red  – 90%+
  if (pct >= 0.75) return '#f59e0b'; // amber – 75%+
  return '#0176d3';                   // Salesforce blue
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString();
}

export default function GaugeChart({ label, max, remaining, loading = false }) {
  const consumed = max - remaining;
  const pct = max > 0 ? consumed / max : 0;
  const barPct = Math.min(Math.max(pct, 0), 1);
  const displayPct = Math.round(Math.abs(pct * 100));
  const color = barColor(pct);
  const isOver = pct > 1;

  return (
    <div className={`gauge-card${loading ? ' gauge-card--loading' : ''}`}>
      <div className="gauge-bar-header">
        <span className="gauge-label">{label}</span>
        <span className="gauge-pct" style={{ color: loading ? undefined : color }}>
          {loading ? '…' : `${displayPct}%`}
        </span>
      </div>

      <div className="gauge-bar-track" role="progressbar" aria-valuenow={displayPct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div
          className="gauge-bar-fill"
          style={{ width: `${barPct * 100}%`, background: color }}
        />
      </div>

      {!loading && (
        <p className="gauge-consumed">
          {fmt(consumed)} / {fmt(max)}
          {isOver && <span className="gauge-over"> over limit</span>}
        </p>
      )}
    </div>
  );
}
