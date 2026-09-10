import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadYaml20 } from '../../src/spec/dsds20-lib.js';
import { validateDoc20 } from '../../src/spec/validator-0.20.0.js';

// The upstream spec repo publishes its own conformance suite at v0.20.1
// (schema/conformance-suite.json) — 26 documents that MUST be rejected, each
// declaring why. Running it here is what makes "we support 0.20.1" a checked
// claim rather than an assertion: if our validator stops catching one of
// these, or catches it for the wrong reason, this fails.
//
// The manifest and fixtures are vendored verbatim from tag v0.20.1 alongside
// the schema itself. Re-copy both together when bumping the spec.
//
// Two details of our validator that the contract accommodates:
//
//   1. Findings are plain strings, not objects. A rule id appears as a
//      leading `[DSDS-XX]` tag; a JSON Schema violation instead embeds its
//      instance path after `schema: `. Both are parsed back out below.
//   2. For a *standalone entry file* (as opposed to a base document), an
//      unresolvable ref is reported as a warning rather than an error,
//      because a single file genuinely cannot prove a target absent — it may
//      live in a sibling file. Three fixtures land there (DSDS-09 and both
//      DSDS-11 cases). The manifest's own contract allows this: "a semantic
//      rule may report as either, depending on --strict". So the semantic
//      assertion below looks in errors *and* warnings, exactly as written.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/conformance-0.20.1');
const suite = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'conformance-suite.json'), 'utf-8'));

/** Rule ids reported as a `[DSDS-XX]` tag across a list of findings. */
function ruleIdsIn(findings) {
  const ids = new Set();
  for (const f of findings) {
    for (const m of String(f).matchAll(/\[(DSDS-\d+)\]/g)) ids.add(m[1]);
  }
  return ids;
}

/** True when a finding is a pure JSON Schema violation (carries no rule id). */
function isPureSchema(finding) {
  return !/\[DSDS-\d+\]/.test(String(finding));
}

/**
 * The Ajv instance path embedded in a schema finding, e.g.
 * `entry "x" schema: /sourceFiles must NOT have...` → `/sourceFiles`.
 * Returns null for a finding that carries no `schema:` segment.
 */
function instancePathOf(finding) {
  const m = String(finding).match(/\bschema:\s+(\/\S*)/);
  return m ? m[1] : null;
}

function validateFixture(file) {
  // Manifest paths are repo-relative ("examples/invalid/x.yaml"); the fixtures
  // are vendored flat, so only the basename is meaningful here.
  const path = resolve(FIXTURE_DIR, file.split('/').pop());
  const doc = loadYaml20(readFileSync(path, 'utf-8'));
  // filePath is passed so DSDS-11 (a relative file ref must exist on disk)
  // resolves against the fixture's own location, as it would in real use.
  return validateDoc20(doc, { filePath: path });
}

describe(`DSDS conformance suite v${suite.schemaVersion}`, () => {
  it('vendors every fixture the manifest declares', () => {
    expect(suite.fixtures).toHaveLength(suite.fixtureCount);
    expect(suite.schemaVersion).toBe('0.20.1');
  });

  describe.each(suite.fixtures)('$file', (fixture) => {
    const label =
      fixture.rejectedBy === 'schema'
        ? `is rejected by the schema${fixture.errorAt ? ` at ${fixture.errorAt}` : ''}`
        : `reports ${fixture.expect.join(', ')}`;

    it(label, () => {
      const { errors, warnings } = validateFixture(fixture.file);

      if (fixture.rejectedBy === 'schema') {
        // A schema fixture must produce at least one finding that is NOT a
        // semantic rule — otherwise it was caught for the wrong reason.
        const pure = errors.filter(isPureSchema);
        expect(pure.length, `expected a pure schema error, got: ${errors.join(' | ') || 'none'}`).toBeGreaterThan(0);

        if (fixture.errorAt != null) {
          const paths = pure.map(instancePathOf).filter(Boolean);
          expect(
            paths.includes(fixture.errorAt),
            `expected an error at ${fixture.errorAt}, got ${JSON.stringify(paths)}`,
          ).toBe(true);
        }
      } else {
        // Semantic: every declared rule id must be reported, in either tier.
        const reported = ruleIdsIn([...errors, ...warnings]);
        for (const id of fixture.expect) {
          expect(
            reported.has(id),
            `expected ${id}; reported ${[...reported].join(', ') || 'none'}`,
          ).toBe(true);
        }
      }
    });
  });

  it('rejects all 26 fixtures — none validates cleanly', () => {
    const clean = suite.fixtures.filter((f) => {
      const { errors, warnings } = validateFixture(f.file);
      return errors.length === 0 && warnings.length === 0;
    });
    expect(clean.map((f) => f.file)).toEqual([]);
  });
});
