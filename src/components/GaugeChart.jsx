/**
 * Semi-circular gauge chart (like Salesforce Inspector's Org Limits view).
 *
 * SVG geometry:
 *   - viewBox "0 0 120 70"
 *   - Circle centre: (60, 62), radius: 46
 *   - Arc sweeps 180° from 9 o'clock through 12 o'clock to 3 o'clock
 */

const CX = 60;
const CY = 62;
const R = 46;
const STROKE = 10;

// Full semi-circle background path (left → top → right)
const BG_PATH = `M ${CX - R},${CY} A ${R},${R} 0 1 1 ${CX + R},${CY}`;

/**
 * Build an SVG arc path covering `pct` (0–1) of the 180° sweep,
 * starting from the left (9 o'clock) and going clockwise through the top.
 */
function progressPath(pct) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  if (clamped < 0.001) return null;

  // Angle in standard math (0=right, increases CCW).
  // Sweep from 180° (left) toward 0° (right) based on pct.
  const endRad = Math.PI * (1 - clamped);

  const x1 = CX + R * Math.cos(Math.PI);   // = CX - R (left)
  const y1 = CY - R * Math.sin(Math.PI);   // = CY

  const x2 = CX + R * Math.cos(endRad);
  const y2 = CY - R * Math.sin(endRad);

  // largeArcFlag=1 when pct > 50 % so we take the long arc
  const large = clamped > 0.5 ? 1 : 0;
  // sweep=1 → clockwise on screen → goes UP through 12 o'clock
  return `M ${x1.toFixed(3)},${y1.toFixed(3)} A ${R},${R} 0 ${large} 1 ${x2.toFixed(3)},${y2.toFixed(3)}`;
}

function gaugeColor(pct) {
  if (pct >= 1.0) return '#ef4444'; // red  – at or over limit
  if (pct >= 0.9) return '#ef4444'; // red  – 90 %+
  if (pct >= 0.75) return '#f59e0b'; // amber – 75 %+
  return '#0176d3';                  // Salesforce blue
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString();
}

export default function GaugeChart({ label, max, remaining, loading = false }) {
  const consumed = max - remaining;
  const pct = max > 0 ? consumed / max : 0;
  const displayPct = Math.round(Math.abs(pct * 100));
  const color = gaugeColor(pct);
  const fgPath = progressPath(Math.min(pct, 1));

  return (
    <div className={`gauge-card${loading ? ' gauge-card--loading' : ''}`}>
      <svg viewBox="0 0 120 70" className="gauge-svg" aria-hidden="true">
        {/* Track */}
        <path
          d={BG_PATH}
          fill="none"
          stroke="#dde1ea"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* Progress */}
        {fgPath && (
          <path
            d={fgPath}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}
        {/* Percentage label */}
        <text
          x={CX}
          y={CY - 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="15"
          fontWeight="700"
          fill={loading ? '#5a5d70' : color}
        >
          {loading ? '…' : `${displayPct}%`}
        </text>
      </svg>

      <p className="gauge-label">{label}</p>
      {!loading && (
        <>
          <p className="gauge-consumed">{fmt(consumed)} of {fmt(max)} consumed</p>
          <p className="gauge-remaining">({fmt(remaining)} left)</p>
        </>
      )}
    </div>
  );
}
