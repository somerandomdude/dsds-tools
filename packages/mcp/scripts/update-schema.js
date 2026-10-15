#!/usr/bin/env node
/**
 * Vendors a DSDS release from a local checkout of
 * somerandomdude/design-system-documentation-schema, at the tag you want.
 *
 * Usage: npm run update-schema -- <path-to-spec-checkout>
 *
 * Copies, verbatim:
 *   - schema/                          -> src/spec/dsds-<version>/schema/
 *   - the reference validator, resolver and formatter, with the lib.js they
 *     share                            -> src/spec/dsds-<version>/scripts/
 *   - .agents/skills/<id>/SKILL.md     -> skills/<id>/SKILL.md
 *   - the conformance suite and its fixtures
 *                                      -> tests/fixtures/conformance-<version>/
 * then writes a package.json marking the vendored scripts CommonJS (upstream
 * ships them that way), and moves BUNDLED_VERSION in src/spec/version.js.
 *
 * Upstream's scripts sit in the same layout they have upstream, so they find
 * the schema with no edits. A split schema can't be rebuilt from one download,
 * which is why this reads a checkout instead of the website.
 *
 * It doesn't delete the previous release's directories, or rename the
 * conformance test: do both by hand, then run npm test.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_PATH = join(ROOT, 'src/spec/version.js');

// What the server loads from a vendored release. Listed so a checkout that's
// missing one fails here, by name, rather than at the first request.
const SCRIPTS = ['scripts/lib.js', 'scripts/validate/validate.js', 'scripts/resolve/resolve.js', 'scripts/format/format.js'];
const REQUIRED_SCHEMA_FILES = ['base.schema.yaml', 'conformance-rules.yaml', 'conformance-suite.json', 'common/ref.schema.yaml', 'entries/entry.schema.yaml', 'sections/section.schema.yaml'];

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

export function updateReadmeVersionSource(source, oldVersion, newVersion) {
  const old = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source
    .replace(new RegExp('(\\*\\*Bundled spec version:\\*\\*\\s*)' + old, 'g'), `$1${newVersion}`)
    .replace(new RegExp('(Defaults to `)' + old + '(`)', 'g'), `$1${newVersion}$2`)
    .replace(new RegExp('(designsystemdocspec\\.org/v)' + old + '(/)', 'g'), `$1${newVersion}$2`)
    .replace(new RegExp('("dsdsVersion"\\s*:\\s*")' + old + '(")', 'g'), `$1${newVersion}$2`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] && resolve(process.argv[2]);
  if (!source) fail('pass the path to a checkout of design-system-documentation-schema, at the release to vendor.');
  if (!existsSync(join(source, 'package.json'))) fail(`${source} has no package.json; is it a spec checkout?`);

  const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf-8')).version;
  const missing = [...SCRIPTS, ...REQUIRED_SCHEMA_FILES.map((f) => `schema/${f}`)].filter((f) => !existsSync(join(source, f)));
  if (missing.length) fail(`${source} is missing ${missing.join(', ')}. Check out a 0.22.0 or later release.`);

  const current = readFileSync(VERSION_PATH, 'utf-8').match(/BUNDLED_VERSION\s*=\s*'([^']+)'/)?.[1];
  const vendor = join(ROOT, `src/spec/dsds-${version}`);

  cpSync(join(source, 'schema'), join(vendor, 'schema'), { recursive: true });
  for (const file of SCRIPTS) {
    mkdirSync(dirname(join(vendor, file)), { recursive: true });
    cpSync(join(source, file), join(vendor, file));
  }
  writeFileSync(
    join(vendor, 'package.json'),
    `${JSON.stringify({
      private: true,
      type: 'commonjs',
      description: `Vendored verbatim from somerandomdude/design-system-documentation-schema at ${version}: schema/ and the reference validator, resolver and formatter in scripts/. CommonJS, as upstream ships them. Do not edit; re-vendor with npm run update-schema.`,
    }, null, 2)}\n`,
  );
  console.log(`Vendored schema and scripts -> src/spec/dsds-${version}/`);

  const skillsDir = join(source, '.agents/skills');
  if (existsSync(skillsDir)) {
    for (const id of readdirSync(skillsDir)) {
      const skill = join(skillsDir, id, 'SKILL.md');
      if (!existsSync(skill)) continue;
      mkdirSync(join(ROOT, 'skills', id), { recursive: true });
      cpSync(skill, join(ROOT, 'skills', id, 'SKILL.md'));
    }
    console.log('Vendored skills -> skills/');
  }

  const suite = JSON.parse(readFileSync(join(source, 'schema/conformance-suite.json'), 'utf-8'));
  const suiteDir = join(ROOT, `tests/fixtures/conformance-${version}`);
  mkdirSync(suiteDir, { recursive: true });
  cpSync(join(source, 'schema/conformance-suite.json'), join(suiteDir, 'conformance-suite.json'));
  for (const fixture of suite.fixtures) cpSync(join(source, fixture.file), join(suiteDir, fixture.file.split('/').pop()));
  console.log(`Vendored ${suite.fixtures.length} conformance fixtures -> tests/fixtures/conformance-${version}/`);

  if (current !== version) {
    writeFileSync(VERSION_PATH, readFileSync(VERSION_PATH, 'utf-8').replace(/BUNDLED_VERSION\s*=\s*'[^']+'/, `BUNDLED_VERSION = '${version}'`));
    console.log(`BUNDLED_VERSION: ${current} -> ${version}`);
  }
  console.log('\nNext: remove the previous release\'s src/spec/dsds-<old>/ and tests/fixtures/conformance-<old>/,');
  console.log('point the conformance test at the new fixtures, then run npm test && npm run check:integrity.');
}
