// schema-0.21.1/ is vendored verbatim from the 0.21.1 release of
// somerandomdude/design-system-documentation-schema. Exactly one version is
// vendored at a time; schema-order.js derives its path from the constant
// below and throws at load if the directory is missing.
//
// What 0.21.x asks of a consumer, and where this server answers it:
//
//   0.21.0  every component trait requires `traitType` (`variant` or
//           `state`), and a section may carry `tags` — DSDS-18 reads the
//           declared tag rather than inferring a topic from the items.
//           See style-guide.js.
//   0.21.1  a section item carrying `refs` is exempt from its kind's
//           required content fields, so `level`, `term`/`definition` and
//           `title` are no longer guaranteed present. Resolving the
//           `same-as` target is the consumer's job; resolveSharedItem20 in
//           render.js is where this server does it.
//
export const BUNDLED_VERSION = '0.21.1';
export const SPEC_URL = 'https://designsystemdocspec.org';

const GITHUB_TAGS_URL =
  'https://api.github.com/repos/somerandomdude/design-system-documentation-schema/tags';

let cached = null;

/** Begin the background check for a newer published spec. Never throws. */
export function startUpdateCheck() {
  checkForUpdates()
    .then(result => { cached = result; })
    .catch(() => { cached = { latestVersion: null, isNewer: false }; });
}

/** A one-line notice when a newer spec exists, or null. */
export function getUpdateNotice() {
  if (!cached?.isNewer || !cached.latestVersion) return null;
  return (
    `\n\n---\n> **DSDS spec update available:** ${cached.latestVersion} ` +
    `(bundled: ${BUNDLED_VERSION}). Visit ${SPEC_URL} or update dsds-mcp to get the latest.`
  );
}

async function checkForUpdates() {
  const res = await fetch(GITHUB_TAGS_URL, {
    headers: { 'User-Agent': 'dsds-mcp' },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return { latestVersion: null, isNewer: false };

  const tags = await res.json();
  const versions = tags
    .map(t => t.name.replace(/^v/, ''))
    .filter(v => /^\d+(\.\d+){1,2}$/.test(v));

  if (versions.length === 0) return { latestVersion: null, isNewer: false };

  const latest = versions.sort(compareVersionsDesc)[0];
  return { latestVersion: latest, isNewer: isNewer(latest, BUNDLED_VERSION) };
}

function compareVersionsDesc(a, b) {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const diff = (bp[i] ?? 0) - (ap[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isNewer(latest, current) {
  return compareVersionsDesc(current, latest) > 0;
}
