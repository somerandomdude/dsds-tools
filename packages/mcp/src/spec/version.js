// dsds-0.23.0/ is vendored verbatim from the 0.23.0 release of
// somerandomdude/design-system-documentation-schema: its schema/ directory,
// and the reference validator and resolver from its scripts/. Exactly one
// version is vendored at a time; schema-order.js derives its path from the
// constant below and throws at load if the directory is missing.
//
// What 0.23.0 asks of a consumer, and where this server answers it:
//
//   0.23.0  additive. A Markdown prose field can mention something in the
//           project with a `dsds:` link. The vendored validator checks the
//           target (DSDS-05, DSDS-08) with an optional CommonMark parser;
//           inline-links.js rewrites each link for an agent as its text plus
//           the target, and every tool's prose goes through it. A link is
//           never a relationship, so the graph ignores it. Every entry's
//           `description` is Markdown now.
//
// Earlier:
//
//   0.22.0  a breaking release. Validation runs upstream's own validator
//           (validator.js wraps it), so every schema and semantic rule is
//           upstream's, not a port. Pointers moved into named fields with
//           no `rel` (`uses`, `extends`, `alternatives`, `evidence`,
//           `checks`, `refines`, `replacedBy`, `specs`, a token's
//           `source`), and `rel` dropped from 20 values to 14: loader.js
//           and graph.js read the relationship graph from those fields.
//           `purpose` and `metadata.context` folded into `description`.
//           `rel: file` is only for DSDS documents; a code file is
//           `rel: source` (get-chunk.js). DSDS-07, -12, -17, -20, -22 and
//           -23 are retired; field order is `dsds-format`'s job now.
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
//   0.21.2  documentation only — no schema shape or validation change. A
//           `same-as` may point at an item in any entry, not only in
//           `base.shared`. Nothing to change here: DSDS-05 already resolved
//           `entryId#itemId` against every local entry, and the loader's
//           same-as pool (loader.js) already holds every entry loaded
//           alongside `shared[]`. The bundled skills move to 0.21.2 with it.
//
export const BUNDLED_VERSION = '0.23.0';
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
