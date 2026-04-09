// Logos served from Simple Icons CDN (cdn.simpleicons.org) — CC0 licensed SVGs.
// MuleSoft and NetSuite are not available on Simple Icons; text badges are used instead.
// If the CDN is unreachable, onError swaps the broken img for a text badge.
const SI = 'https://cdn.simpleicons.org';

function imgWithFallback(slug, alt, fallbackText) {
  return function CdnLogo() {
    function handleError(e) {
      const span = document.createElement('span');
      span.className = 'service-logo__text';
      span.textContent = fallbackText;
      e.currentTarget.replaceWith(span);
    }
    return <img src={`${SI}/${slug}`} alt={alt} onError={handleError} />;
  };
}

/** Service logo components. */
const GitHubLogo     = imgWithFallback('github',      'GitHub',       'GH');
const SalesforceLogo = imgWithFallback('salesforce',  'Salesforce',   'SF');

function SlackLogo() {
  return (
    <svg viewBox="0 0 127 127" aria-hidden="true">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80z" fill="#E01E5A" />
      <path d="M33.9 80c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
      <path d="M47.1 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.9 6.7 39.8.8 47.1.8c7.3 0 13.2 5.9 13.2 13.2v13.2H47.1z" fill="#36C5F0" />
      <path d="M47.1 33.9c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H14.1C6.8 60.3.9 54.4.9 47.1c0-7.3 5.9-13.2 13.2-13.2h33z" fill="#36C5F0" />
      <path d="M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1z" fill="#2EB67D" />
      <path d="M93.2 47.1c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V14.1C66.8 6.8 72.7.9 80 .9c7.3 0 13.2 5.9 13.2 13.2v33z" fill="#2EB67D" />
      <path d="M80 99.9c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.9H80z" fill="#ECB22E" />
      <path d="M80 93.2c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80z" fill="#ECB22E" />
    </svg>
  );
}
const JiraLogo       = imgWithFallback('jira',         'Jira',         'J');
const ConfluenceLogo = imgWithFallback('confluence',   'Confluence',   'C');
const GCPLogo        = imgWithFallback('googlecloud',  'Google Cloud', 'GC');

function NetSuiteLogo() {
  return <span className="service-logo__text">NS</span>;
}

function MuleSoftLogo() {
  return <span className="service-logo__text">M</span>;
}

const LOGOS = {
  github: GitHubLogo,
  salesforce: SalesforceLogo,
  netsuite: NetSuiteLogo,
  slack: SlackLogo,
  mulesoft: MuleSoftLogo,
  jira: JiraLogo,
  confluence: ConfluenceLogo,
  gcp: GCPLogo,
};

export default function ServiceLogo({ name }) {
  const Logo = LOGOS[name];
  if (!Logo) return null;
  return (
    <span className="service-logo" data-logo={name} aria-hidden="true">
      <Logo />
    </span>
  );
}
