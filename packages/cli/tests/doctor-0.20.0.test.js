// Regression tests for two bugs found while pointing `dsds doctor` at a real
// DSDS 0.20.0 corpus for the first time (dsds-0.20.0-migration-prd.md,
// Phase 1 follow-up): doctor.js had zero prior 0.20.0 test coverage.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runCli } from './helpers.js';
import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';

const COMPONENT_20 = fileURLToPath(new URL('./fixtures/component-0.20.0.dsds.yaml', import.meta.url));
const env = { DSDS_PATHS: COMPONENT_20 };

describe('dsds doctor — real 0.20.0 (.dsds.yaml)', () => {
  it('schema validation dispatches to the 0.20.0 validator instead of the legacy one', async () => {
    // Regression: doctor.js always called the legacy validateDocument(),
    // which fails a real 0.20.0 doc with "(root): must have required
    // property 'entityGroups'" — a legacy-only field.
    const { code, stdout } = await runCli(['doctor'], { env });
    const schemaLine = stdout.split('\n').find((l) => l.includes('schema validation'));
    expect(schemaLine).toContain('✓');
    expect(stdout).not.toContain('entityGroups');
    expect(code).toBe(0);
  });

  it('schema validation validates the file fresh, not loadSystems\' mutated in-memory copy', async () => {
    // Regression: loadSystems() adds identifier/relationships/__dsds20/
    // __filePath/__sharedEntries directly onto each entity object as it
    // normalizes it. Re-validating that same (now-mutated) object trips
    // the schema's `unevaluatedProperties: false` on every injected field.
    const { code, stdout } = await runCli(['doctor', '--json'], { env });
    const report = JSON.parse(stdout);
    const schema = report.checks.find((c) => c.name === 'schema validation');
    expect(schema.status).toBe('pass');
    expect(code).toBe(0);
  });

  it('brief kind references passes for a namespaced 0.20.0 kind vocabulary', async () => {
    // Regression: briefs.js hardcoded legacy bare kind literals
    // (kind=pattern, kind=chunk, kind=token-group) that don't exist under
    // a real 0.20.0 corpus's namespaced kinds — every 0.20.0 doctor run
    // failed this check regardless of how well-formed the corpus was.
    const { stdout } = await runCli(['doctor', '--json'], { env });
    const report = JSON.parse(stdout);
    const brief = report.checks.find((c) => c.name === 'brief kind references');
    expect(brief.status).toBe('pass');
  });

  // Reads BUNDLED_VERSION rather than repeating the literal: this assertion
  // is that doctor reports whatever version is actually bundled, not that the
  // bundle sits at one particular release. The literal went stale on the
  // 0.20.0 -> 0.20.1 sync and failed here for no real defect.
  it('reports the bundled version, and the fixture as aligned with it', async () => {
    const { stdout } = await runCli(['doctor', '--json'], { env });
    const report = JSON.parse(stdout);
    expect(report.bundledSpecVersion).toBe(BUNDLED_VERSION);
    const versionCheck = report.checks.find((c) => c.name === 'spec version alignment');
    expect(versionCheck.status).toBe('pass');
  });
});
