// Phase 3: project-local dsds.config file (FR-14/FR-15, CLI side).

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, BUTTON_FIXTURE, VALID_FIXTURE_DIR } from './helpers.js';

let projectDir;

beforeAll(() => {
  // A fake project: fixtures copied in, config file with repo-relative paths.
  projectDir = mkdtempSync(join(tmpdir(), 'dsds-project-'));
  cpSync(VALID_FIXTURE_DIR, join(projectDir, 'dsds'), { recursive: true });
  writeFileSync(
    join(projectDir, 'dsds.config.json'),
    JSON.stringify({ paths: ['./dsds/system.dsds.json'] })
  );
});

describe('dsds.config file', () => {
  it('makes the CLI work with no environment at all', async () => {
    const { code, stdout } = await runCli(['list'], { cwd: projectDir });
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('is discovered from a nested working directory', async () => {
    const nested = join(projectDir, 'src', 'components');
    mkdirSync(nested, { recursive: true });
    const { code, stdout } = await runCli(['get', 'test-card'], { cwd: nested });
    expect(code).toBe(0);
    expect(stdout).toContain('Test Card');
  });

  it('is overridden per key by environment variables', async () => {
    const { code, stdout } = await runCli(['list'], {
      cwd: projectDir,
      env: { DSDS_PATHS: BUTTON_FIXTURE },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('button');
    expect(stdout).not.toContain('test-button');
  });

  it('--config selects an explicit file from anywhere', async () => {
    const { code, stdout } = await runCli(
      ['list', '--config', join(projectDir, 'dsds.config.json')]
      // default neutral cwd — nowhere near the project dir
    );
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('the DSDS_CONFIG env var selects an explicit file (regression: null configPath must not disable it)', async () => {
    const { code, stdout } = await runCli(['list'], {
      env: { DSDS_CONFIG: join(projectDir, 'dsds.config.json') },
      // default neutral cwd — nowhere near the project dir
    });
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  // TODO(dsds-0.20.0-migration Phase 1/D2): BUNDLED_VERSION now declares
  // 0.20.0 — "spec version alignment" correctly flags the legacy 0.15.2
  // fixture as drifted (working as designed). Un-skip once these fixtures
  // have a real 0.20.0 YAML counterpart.
  it.skip('doctor honors DSDS_CONFIG too (its own resolveConfig call path)', async () => {
    const { code, stdout } = await runCli(['doctor', '--json'], {
      env: { DSDS_CONFIG: join(projectDir, 'dsds.config.json') },
    });
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    const source = report.checks.find(c => c.name === 'config source');
    expect(source.status).toBe('pass');
    expect(String(source.details ?? source.detail ?? '')).toContain('dsds.config.json');
  });

  it.skip('doctor reports the config source and passes env-free', async () => {
    const { code, stdout } = await runCli(['doctor', '--json'], { cwd: projectDir });
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    const source = report.checks.find(c => c.name === 'config source');
    expect(source.status).toBe('pass');
    expect(source.details[0]).toContain('dsds.config.json');
  });

  it('doctor fails (exit 2) on a missing explicit config file', async () => {
    const { code, stdout } = await runCli(['doctor', '--json', '--config', '/nope/dsds.config.json']);
    expect(code).toBe(2);
    const report = JSON.parse(stdout);
    const source = report.checks.find(c => c.name === 'config source');
    expect(source.status).toBe('fail');
    expect(source.details[0]).toContain('not found');
  });

  it('a broken config file warns on stderr and falls back to env', async () => {
    const brokenDir = mkdtempSync(join(tmpdir(), 'dsds-broken-'));
    writeFileSync(join(brokenDir, 'dsds.config.json'), '{ not json');
    const { code, stderr, stdout } = await runCli(['list'], {
      cwd: brokenDir,
      env: { DSDS_PATHS: BUTTON_FIXTURE },
    });
    expect(code).toBe(0);
    expect(stderr).toContain('config file error');
    expect(stdout).toContain('button');
  });
});
