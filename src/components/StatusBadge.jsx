const STATUS_CONFIG = {
  operational: {
    label: 'Operational',
    className: 'badge badge--operational',
    dot: '●',
  },
  degraded: {
    label: 'Degraded',
    className: 'badge badge--degraded',
    dot: '●',
  },
  outage: {
    label: 'Outage',
    className: 'badge badge--outage',
    dot: '●',
  },
  unknown: {
    label: 'Unknown',
    className: 'badge badge--unknown',
    dot: '●',
  },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span className={config.className} aria-label={`Status: ${config.label}`}>
      <span className="badge__dot" aria-hidden="true">
        {config.dot}
      </span>
      {config.label}
    </span>
  );
}
