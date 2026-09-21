#!/usr/bin/env node
/**
 * Vendors a new DSDS release: downloads its bundled schema into
 * src/spec/schema-<version>/ and bumps BUNDLED_VERSION.
 *
 * Usage: npm run update-schema
 *
 * This script predates the split. It used to overwrite
 * src/spec/dsds.bundled.schema.json, which was the only schema the server
 * had. That file is now the LEGACY 0.15.2 schema — src/validator.js compiles
 * it to check legacy JSON documents, and it does not move when the current
 * spec does. Overwriting it with a 0.21.0 schema would break legacy
 * validation silently, so this script no longer touches it.
 *
 * The current model lives in src/spec/schema-<version>/, a directory of split
 * files (base, common/, entries/, sections/, metadata/) plus the
 * conformance rules. One HTTP request cannot reconstruct that, so this
 * script downloads what it can and stops short of a bump it cannot honour:
 * BUNDLED_VERSION only moves once the vendored directory is complete, since
 * schema-order.js resolves SCHEMA_DIR from it and throws when it is missing.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LEGACY_SCHEMA_PATH = resolve(ROOT, 'src/spec/dsds.bundled.schema.json');
const VERSION_PATH = resolve(ROOT, 'src/spec/version.js');
const vendorDir = (version) => resolve(ROOT, `src/spec/schema-${version}`);

// Every file the validator reads out of a vendored release. Listed so a
// partial vendor is reported as such instead of failing later, one confusing
// missing-$ref at a time.
const REQUIRED_VENDOR_FILES = [
  'base.schema.yaml',
  'conformance-rules.yaml',
  'common/ref.schema.yaml',
  'common/id.schema.yaml',
  'entries/component.schema.yaml',
  'entries/entry.schema.yaml',
  'sections/section.schema.yaml',
  'sections/guidelines.schema.yaml',
  'metadata/metadata.schema.yaml',
];

const GITHUB_TAGS_URL =
  'https://api.github.com/repos/somerandomdude/design-system-documentation-schema/tags';
const SCHEMA_URL_TEMPLATE =
  'https://designsystemdocspec.org/v{version}/dsds.bundled.schema.json';

async function getLatestVersion() {
  console.log('Checking for latest DSDS version…');
  const res = await fetch(GITHUB_TAGS_URL, {
    headers: { 'User-Agent': 'dsds-mcp-updater' },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

  const tags = await res.json();
  const versions = tags
    .map(t => t.name.replace(/^v/, ''))
    .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => {
      const [aMaj, aMin, aPat] = a.split('.').map(Number);
      const [bMaj, bMin, bPat] = b.split('.').map(Number);
      if (aMaj !== bMaj) return bMaj - aMaj;
      if (aMin !== bMin) return bMin - aMin;
      return bPat - aPat;
    });

  if (!versions.length) throw new Error('No version tags found on GitHub');
  return versions[0];
}

async function getCurrentVersion() {
  const src = await readFile(VERSION_PATH, 'utf-8');
  const match = src.match(/BUNDLED_VERSION\s*=\s*'([^']+)'/);
  return match?.[1] ?? null;
}

async function downloadSchema(version) {
  const url = SCHEMA_URL_TEMPLATE.replace('{version}', version);
  console.log(`Downloading schema from ${url}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Schema download returned ${res.status} for ${url}`);
  return res.text();
}

async function updateVersionFile(oldVersion, newVersion) {
  const src = await readFile(VERSION_PATH, 'utf-8');
  const updated = src.replace(
    /BUNDLED_VERSION\s*=\s*'[^']+'/,
    `BUNDLED_VERSION = '${newVersion}'`
  );
  if (updated === src) throw new Error('Could not find BUNDLED_VERSION in version.js to update');
  await writeFile(VERSION_PATH, updated, 'utf-8');
}

async function main() {
  const latestVersion = await getLatestVersion();
  const currentVersion = await getCurrentVersion();

  console.log(`Current version: ${currentVersion ?? 'unknown'}`);
  console.log(`Latest version:  ${latestVersion}`);

  if (latestVersion === currentVersion) {
    console.log('Already up to date.');
    return;
  }

  const dir = vendorDir(latestVersion);
  await mkdir(dir, { recursive: true });

  const schema = await downloadSchema(latestVersion);
  const bundledPath = resolve(dir, 'dsds.bundled.schema.json');
  await writeFile(bundledPath, schema, 'utf-8');
  console.log(`Wrote ${bundledPath}`);

  const missing = REQUIRED_VENDOR_FILES.filter((f) => !existsSync(resolve(dir, f)));
  if (missing.length > 0) {
    console.log(`\n⚠ Vendor incomplete — BUNDLED_VERSION left at ${currentVersion}.`);
    console.log(`  The validator reads split files from src/spec/schema-${latestVersion}/, and ${missing.length} are missing:`);
    for (const f of missing) console.log(`    - ${f}`);
    console.log(`\n  Copy them from the ${latestVersion} release of`);
    console.log('  somerandomdude/design-system-documentation-schema, then re-run this script.');
    console.log(`\n  The legacy schema at ${LEGACY_SCHEMA_PATH} was NOT touched — it is`);
    console.log('  the 0.15.2 model that src/validator.js still checks legacy JSON against.');
    process.exitCode = 1;
    return;
  }

  await updateVersionFile(currentVersion, latestVersion);
  console.log(`Updated BUNDLED_VERSION in ${VERSION_PATH}`);

  console.log(`\nDone. Updated ${currentVersion} → ${latestVersion}`);
  console.log(`Commit src/spec/schema-${latestVersion}/ and src/spec/version.js to finish the update.`);
  console.log('Then run: npm test && npm run check:integrity');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
