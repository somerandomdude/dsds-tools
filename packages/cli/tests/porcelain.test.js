// Phase 2: porcelain commands, doctor, and the exit-code-2 contract.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, BUTTON_FIXTURE, VALID_SYSTEM, DSDS_MCP_DIR } from './helpers.js';

const env = { DSDS_PATHS: VALID_SYSTEM };

describe('query porcelain', () => {
  it('list shows all fixture entities', async () => {
    const { code, stdout } = await runCli(['list'], { env });
    expect(code).toBe(0);
    for (const id of ['test-button', 'test-card', 'test-chunk', 'test-pattern', 'test-tokens']) {
      expect(stdout).toContain(id);
    }
  });

  it('list --kind routes through search and filters', async () => {
    const { code, stdout } = await runCli(['list', '--kind', 'chunk'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('test-chunk');
    expect(stdout).not.toContain('test-button');
  });

  it('search finds by query', async () => {
    const { code, stdout } = await runCli(['search', 'card'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('test-card');
  });

  it('get returns the full entity', async () => {
    const { code, stdout } = await runCli(['get', 'test-button'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('Test Button');
  });

  it('get --block returns a single block', async () => {
    const { code, stdout } = await runCli(['get', 'test-button', '--block', 'useCases'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('Trigger a test action');
  });

  it('get without identifier is a usage error', async () => {
    const { code, stderr } = await runCli(['get'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('usage: dsds get');
  });

  it('context returns agent context', async () => {
    const { code, stdout } = await runCli(['context', 'test-button'], { env });
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('chunk returns the code chunk', async () => {
    const { code, stdout } = await runCli(['chunk', 'test-chunk'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('TestChunk');
  });

  it('markdown exports the entity', async () => {
    const { code, stdout } = await runCli(['markdown', 'test-button'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('Test Button');
  });
});

describe('graph porcelain', () => {
  it('deps shows what an entity is built from', async () => {
    const { code, stdout } = await runCli(['deps', 'test-card'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('dependents shows what points at an entity', async () => {
    const { code, stdout } = await runCli(['dependents', 'test-button'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('test-card');
  });

  it('impact flags required dependents as breaking', async () => {
    const { code, stdout } = await runCli(['impact', 'test-button'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('test-card');
    expect(stdout).toContain('Breaking');
  });

  it('alternatives runs clean on an entity without alternatives', async () => {
    const { code } = await runCli(['alternatives', 'test-button'], { env });
    expect(code).toBe(0);
  });
});

describe('spec porcelain', () => {
  it('brief build returns a briefing', async () => {
    const { code, stdout } = await runCli(['brief', 'build'], { env });
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(100);
  });

  it('brief with a bad use case fails via the shared validator', async () => {
    const { code, stderr } = await runCli(['brief', 'nope'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('must be one of');
  });

  it('scaffold emits a template', async () => {
    const { code, stdout } = await runCli(['scaffold', 'component']);
    expect(code).toBe(0);
    expect(stdout).toContain('"kind": "component"');
  });

  it('spec overview / schema / blocks work; blocks without kind is a usage error', async () => {
    expect((await runCli(['spec', 'overview'])).code).toBe(0);
    expect((await runCli(['spec', 'schema', 'component'])).code).toBe(0);
    expect((await runCli(['spec', 'blocks', 'component'])).code).toBe(0);
    const { code, stderr } = await runCli(['spec', 'blocks']);
    expect(code).toBe(1);
    expect(stderr).toContain('usage: dsds spec blocks');
  });
});

describe('validate (exit code 2 contract)', () => {
  it('valid document exits 0', async () => {
    const { code, stdout } = await runCli(['validate', VALID_SYSTEM]);
    expect(code).toBe(0);
    expect(stdout).toContain('Valid DSDS Document');
  });

  it('schema-invalid document exits 2 with findings on stdout', async () => {
    const { code, stdout } = await runCli(['validate', BUTTON_FIXTURE]);
    expect(code).toBe(2);
    expect(stdout).toContain('Validation Failed');
  });

  it('malformed JSON exits 2 (parse findings)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsds-validate-'));
    const file = join(dir, 'broken.dsds.json');
    writeFileSync(file, '{ not json');
    const { code } = await runCli(['validate', file]);
    expect(code).toBe(2);
  });

  it('missing file is a usage error (exit 1)', async () => {
    const { code, stderr } = await runCli(['validate', '/nope/missing.dsds.json']);
    expect(code).toBe(1);
    expect(stderr).toContain('cannot read');
  });

  it('--json envelope carries ok:false and exitCode 2 for findings', async () => {
    const { code, stdout } = await runCli(['validate', BUTTON_FIXTURE, '--json']);
    expect(code).toBe(2);
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.exitCode).toBe(2);
    expect(envelope.data).toContain('Validation Failed');
  });
});

describe('lint (exit code 2 contract)', () => {
  const lintEnv = {
    ...env,
    LINT_PLUGINS: 'eslint-plugin-fixture',
    LINT_RESOLVE_DIR: DSDS_MCP_DIR,
  };

  it('no plugins configured is an environment error (exit 1)', async () => {
    const { code, stderr } = await runCli(['lint', 'whatever.tsx'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('No ESLint plugins configured');
  });

  it('no paths and no --stdin is a usage error', async () => {
    const { code, stderr } = await runCli(['lint'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('usage: dsds lint');
  });

  it('a missing file with plugins configured exits 2 via structured findings', async () => {
    const { code, stdout } = await runCli(['lint', 'does-not-exist.tsx', '--json'], { env: lintEnv });
    expect(code).toBe(2);
    const envelope = JSON.parse(stdout);
    expect(envelope.exitCode).toBe(2);
    expect(envelope.structured.files[0].error).toBeTruthy();
  });

  it('--stdin lints piped code', async () => {
    const { code } = await runCli(['lint', '--stdin', '--filename', 'App.tsx'], {
      env: lintEnv,
      input: 'export const App = () => <div>ok</div>;\n',
    });
    expect([0, 2]).toContain(code); // findings depend on the fixture plugin's rules
  });
});

describe('doctor', () => {
  it('passes on the valid fixture system (exit 0)', async () => {
    const { code, stdout } = await runCli(['doctor'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('all checks passed');
  });

  it('--json reports structured checks', async () => {
    const { code, stdout } = await runCli(['doctor', '--json'], { env });
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(true);
    expect(report.exitCode).toBe(0);
    const names = report.checks.map(c => c.name);
    expect(names).toContain('schema validation');
    expect(names).toContain('relationship graph');
    expect(report.checks.every(c => c.status !== 'fail')).toBe(true);
  });

  it('fails with exit 2 when DSDS_PATHS is not set', async () => {
    const { code, stdout } = await runCli(['doctor']);
    expect(code).toBe(2);
    expect(stdout).toContain('DSDS_PATHS');
  });

  it('fails with exit 2 on an unloadable path', async () => {
    const { code, stdout } = await runCli(['doctor'], { env: { DSDS_PATHS: '/nope/missing.dsds.json' } });
    expect(code).toBe(2);
    expect(stdout).toContain('check(s) failed');
  });

  it('fails with exit 2 on duplicate identifiers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsds-doctor-dupes-'));
    const file = join(dir, 'dupes.dsds.json');
    writeFileSync(
      file,
      JSON.stringify({
        dsdsVersion: '0.13.0',
        entityGroups: [
          {
            name: 'dupes',
            entities: [
              { kind: 'component', identifier: 'dupe', name: 'A' },
              { kind: 'pattern', identifier: 'dupe', name: 'B' },
            ],
          },
        ],
      })
    );
    const { code, stdout } = await runCli(['doctor', '--json'], { env: { DSDS_PATHS: file } });
    expect(code).toBe(2);
    const report = JSON.parse(stdout);
    const check = report.checks.find(c => c.name === 'identifier uniqueness');
    expect(check.status).toBe('fail');
    expect(check.details[0]).toContain('"dupe"');
  });

  it('fails with exit 2 on unresolvable lint plugins', async () => {
    const { code, stdout } = await runCli(['doctor', '--json'], {
      env: { ...env, LINT_PLUGINS: 'eslint-plugin-does-not-exist', LINT_RESOLVE_DIR: tmpdir() },
    });
    expect(code).toBe(2);
    const report = JSON.parse(stdout);
    const lintCheck = report.checks.find(c => c.name === 'lint plugins resolve');
    expect(lintCheck.status).toBe('fail');
  });
});

describe('manifest and help include porcelain', () => {
  it('manifest lists porcelain commands and doctor', async () => {
    const { stdout } = await runCli(['manifest']);
    const manifest = JSON.parse(stdout);
    const names = manifest.commands.map(c => c.name);
    for (const cmd of ['list', 'search', 'get', 'lint', 'validate', 'doctor', 'tool']) {
      expect(names).toContain(cmd);
    }
  });

  it('help lists commands and the exit code contract', async () => {
    const { stdout } = await runCli(['help']);
    expect(stdout).toContain('Commands');
    expect(stdout).toContain('impact');
    expect(stdout).toContain('ran but found problems');
  });

  it('per-command help renders', async () => {
    const { code, stdout } = await runCli(['lint', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('dsds lint');
    expect(stdout).toContain('--stdin');
  });
});
