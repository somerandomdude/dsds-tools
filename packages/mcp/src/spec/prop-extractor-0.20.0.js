// Resolves a 0.20.0 entity's `sourceFiles` pointer to real prop data, per
// DEC-2 (dsds-0.20.0-migration-prd.md §8): extraction is cached, but the
// cache is fingerprint-validated against the resolved `@sanity/ui` version
// plus a content hash of the `sourceFiles` read. A fingerprint match serves
// from cache at zero cost; a mismatch regenerates via subprocess if the
// extractor's toolchain (Node >=22.6, --experimental-strip-types) is present,
// or otherwise serves the entry with NO table and a loud staleness warning.
// A missing table is acceptable; a stale one silently served is not.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CACHE_FILENAME = 'props-0.20.0.cache.json';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function cachePath(propsExtractorDir) {
  // Cache lives alongside the extractor's own output, not inside dsds-mcp —
  // it's derived from that tool's output and travels with it.
  return join(propsExtractorDir, 'out', CACHE_FILENAME);
}

/** The extractor's own fixed output path (not configurable — see its package.json scripts). */
function extractorOutputPath(propsExtractorDir) {
  return join(propsExtractorDir, 'out', 'dsds-extensions.json');
}

/**
 * Resolves the first sourceFiles entry's real file content plus the
 * design system's currently-checked-out version, for fingerprinting.
 * Returns null if either can't be read — freshness can't be verified, but
 * that's distinct from "never extracted" (see getApiForEntry).
 */
function resolveCurrentSource(entity, uiSourceRoot) {
  const sourceFile = entity.sourceFiles?.[0]?.file;
  if (!sourceFile || !uiSourceRoot) return null;
  try {
    const filePath = join(uiSourceRoot, sourceFile);
    const fileContent = readFileSync(filePath, 'utf-8');
    const pkgJson = readJsonSafe(join(uiSourceRoot, 'packages/ui/package.json'));
    const version = pkgJson?.version ?? '(unknown)';
    return { version, fileHash: sha256(fileContent) };
  } catch {
    return null;
  }
}

function computeFingerprint(current) {
  return sha256(`${current.version}:${current.fileHash}`);
}

/** True if the extractor's Node toolchain (>=22.6, --experimental-strip-types) is usable. */
function toolchainAvailable() {
  const result = spawnSync('node', ['--experimental-strip-types', '--eval', 'process.exit(0)'], {
    stdio: 'ignore',
    timeout: 5000,
  });
  return result.status === 0;
}

/** Runs the extractor's `npm run all` and returns its parsed output, or null on any failure. */
function regenerate(propsExtractorDir) {
  const result = spawnSync('npm', ['run', 'all'], {
    cwd: propsExtractorDir,
    stdio: 'ignore',
    timeout: 120_000,
  });
  if (result.status !== 0) return null;
  return readJsonSafe(extractorOutputPath(propsExtractorDir));
}

function writeCacheEntry(propsExtractorDir, entryId, fingerprint, props) {
  const path = cachePath(propsExtractorDir);
  const cache = readJsonSafe(path) ?? {};
  cache[entryId] = { fingerprint, props, generatedAt: new Date().toISOString() };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
  } catch {
    // Cache is a pure optimization — a write failure just means the next
    // request regenerates again. Never let it break serving.
  }
}

/**
 * Resolves API prop data for one 0.20.0 entity.
 *
 * Returns one of:
 *   { status: 'unconfigured' }               — no propsExtractorDir configured; feature is off
 *   { status: 'no-source' }                  — entity has no sourceFiles; nothing to extract
 *   { status: 'missing' }                    — never extracted, and couldn't extract now
 *   { status: 'unverified', props }           — served from cache; freshness can't be checked
 *                                                (no uiSourceRoot configured)
 *   { status: 'fresh', props }                — cache fingerprint matches current source
 *   { status: 'stale' }                       — cache fingerprint mismatches and toolchain is
 *                                                unavailable to regenerate; NO props returned
 */
export function getApiForEntry(entity, config) {
  const { propsExtractorDir, uiSourceRoot } = config ?? {};
  if (!propsExtractorDir) return { status: 'unconfigured' };
  if (!entity.sourceFiles?.length) return { status: 'no-source' };

  const entryId = entity.identifier ?? entity.id;
  const cache = readJsonSafe(cachePath(propsExtractorDir)) ?? {};
  const cached = cache[entryId];
  const current = resolveCurrentSource(entity, uiSourceRoot);

  if (cached && current == null) {
    // Can't verify freshness (no uiSourceRoot) — serve what we have, labeled.
    return { status: 'unverified', props: cached.props };
  }

  if (cached && current != null && cached.fingerprint === computeFingerprint(current)) {
    return { status: 'fresh', props: cached.props };
  }

  // Missing or stale — try to regenerate before giving up.
  if (toolchainAvailable()) {
    const extracted = regenerate(propsExtractorDir);
    const freshProps = extracted?.[entryId]?.['com.sanity.ui'];
    if (freshProps && current != null) {
      const fingerprint = computeFingerprint(current);
      writeCacheEntry(propsExtractorDir, entryId, fingerprint, freshProps);
      return { status: 'fresh', props: freshProps };
    }
    if (freshProps) {
      // Regenerated but can't fingerprint it (no uiSourceRoot) — still real, current data.
      return { status: 'unverified', props: freshProps };
    }
  }

  return cached ? { status: 'stale' } : { status: 'missing' };
}
