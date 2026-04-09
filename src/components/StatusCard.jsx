import StatusBadge from './StatusBadge';
import ServiceLogo from './ServiceLogo';

export default function StatusCard({ service }) {
  const { name, logo, status, description, statusPageUrl, loading, isProd, isSandbox } = service;

  const cardClass = [
    `status-card status-card--${status}`,
    isProd     ? 'status-card--prod'    : '',
    isSandbox  ? 'status-card--sandbox' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cardClass}
      aria-label={`${name} status`}
    >
      <div className="status-card__header">
        <ServiceLogo name={logo} />
        <div className="status-card__title-row">
          <h2 className="status-card__name">{name}</h2>
          {isProd    && <span className="prod-badge"    aria-label="Production instance">PROD</span>}
          {isSandbox && <span className="sbx-badge"     aria-label="Sandbox instance">SBX</span>}
        </div>
      </div>
      <div className="status-card__body">
        {loading ? (
          <span className="badge badge--loading" aria-label="Loading status">
            <span className="badge__dot spinner" aria-hidden="true">○</span>
            Checking…
          </span>
        ) : (
          <StatusBadge status={status} />
        )}
        {!loading && description && (
          <p className="status-card__description">{description}</p>
        )}
      </div>
      <div className="status-card__footer">
        <a
          href={statusPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="status-card__link"
          aria-label={`View ${name} status page`}
        >
          View Status Page ↗
        </a>
      </div>
    </article>
  );
}
