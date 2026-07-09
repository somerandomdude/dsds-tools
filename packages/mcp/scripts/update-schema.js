#!/usr/bin/env node
/**
 * Fetches the latest DSDS bundled schema and updates:
 *   - src/spec/dsds.bundled.schema.json
 *   - BUNDLED_VERSION in src/spec/version.js
 *
 * Usage: npm run update-schema
 */

import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'src/spec/dsds.bundled.schema.json');
const VERSION_PATH = resolve(ROOT, 'src/spec/version.js');

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

  const schema = await downloadSchema(latestVersion);

  await writeFile(SCHEMA_PATH, schema, 'utf-8');
  console.log(`Wrote ${SCHEMA_PATH}`);

  await updateVersionFile(currentVersion, latestVersion);
  console.log(`Updated BUNDLED_VERSION in ${VERSION_PATH}`);

  console.log(`\nDone. Updated ${currentVersion} → ${latestVersion}`);
  console.log('Commit src/spec/dsds.bundled.schema.json and src/spec/version.js to finish the update.');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
