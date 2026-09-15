// schema-0.21.0/ is vendored verbatim from the upstream repo's 0.21.0 release
// of somerandomdude/design-system-documentation-schema, replacing the v0.20.1
// vendor. schema-0.20.0/ and schema-0.20.1/ stay for the tools that still
// describe those models on request.
//
// 0.21.0 is a minor with exactly one shape change an author feels: every
// component trait now requires `traitType` (`variant` or `state`), a
// different axis from the optional `setBy` — `disabled` and `loading` are
// states the *consumer* sets, so neither field derives from the other. A
// 0.20.x document with traits is therefore not a valid 0.21.0 document until
// each trait gains the field; upstream ships scripts/tools/migrate-to-0.21.js
// for that.
//
// Also new and worth knowing here: `tags` on a section, which DSDS-18 now
// reads instead of inferring a section's topic from its items. The old
// inference needed two or more items all naming the same tag, so a section's
// required position depended on how many rules it held and whether their tags
// intersected. style-guide-0.20.1.js implements the declared form.
//
// Sibling modules keep their -0.20.0/-0.20.1 filenames: they implement the
// 0.20.x *model*, which 0.21.0 extends rather than replaces. Only the
// vendored schema and this constant are version-pinned.
export const BUNDLED_VERSION = '0.21.0';
export const SPEC_URL = 'https://designsystemdocspec.org';

const GITHUB_TAGS_URL =
  'https://api.github.com/repos/somerandomdude/design-system-documentation-schema/tags';

let cached = null;

export function startUpdateCheck() {
  checkForUpdates()
    .then(result => { cached = result; })
    .catch(() => { cached = { latestVersion: null, isNewer: false }; });
}

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
