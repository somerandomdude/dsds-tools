// Phase 4: dsds init — config scaffold + agents stanza (FR-16).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

// realpath: on macOS tmpdir lives behind a /var → /private/var symlink, and
// path relativization compares against the child process's real cwd.
const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsds-init-')));

describe('dsds init', () => {
  it('creates dsds.config.mjs in an empty project', async () => {
    const dir = tmp();
    const { code, stdout } = await runCli(['init'], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toContain('dsds.config.mjs — written');
    const source = readFileSync(join(dir, 'dsds.config.mjs'), 'utf-8');
    expect(source).toContain('export default {');
    expect(source).toContain('paths: []');
  });

  it('seeds the config from current environment variables, relativizing project paths', async () => {
    const dir = tmp();
    const { code, stdout } = await runCli(['init'], {
      cwd: dir,
      env: {
        DSDS_PATHS: join(dir, 'dsds/system.dsds.json'),
        LINT_PLUGINS: 'eslint-plugin-x',
        LINT_RESOLVE_DIR: '/somewhere/else',
      },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('seeded');
    const source = readFileSync(join(dir, 'dsds.config.mjs'), 'utf-8');
    expect(source).toContain('"./dsds/system.dsds.json"'); // inside project → relative
    expect(source).toContain('"eslint-plugin-x"');
    expect(source).toContain('"/somewhere/else"'); // outside project → absolute
  });

  it('is idempotent: refuses to overwrite without --force', async () => {
    const dir = tmp();
    await runCli(['init'], { cwd: dir });
    const before = readFileSync(join(dir, 'dsds.config.mjs'), 'utf-8');
    const { code, stdout } = await runCli(['init'], {
      cwd: dir,
      env: { DSDS_PATHS: '/changed.dsds.json' },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('skipped');
    expect(readFileSync(join(dir, 'dsds.config.mjs'), 'utf-8')).toBe(before);
  });

  it('--force overwrites the config', async () => {
    const dir = tmp();
    await runCli(['init'], { cwd: dir });
    const { code } = await runCli(['init', '--force'], {
      cwd: dir,
      env: { DSDS_PATHS: '/changed.dsds.json' },
    });
    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'dsds.config.mjs'), 'utf-8')).toContain('/changed.dsds.json');
  });

  it('--agents creates AGENTS.md with a marker-delimited stanza', async () => {
    const dir = tmp();
    const { code, stdout } = await runCli(['init', '--agents'], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toContain('AGENTS.md — dsds stanza created');
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('<!-- dsds:begin -->');
    expect(agents).toContain('<!-- dsds:end -->');
    expect(agents).toContain('dsds brief build');
    expect(agents).toContain('dsds search <query>');
    expect(agents).toContain('Exit codes');
  });

  it('re-running --agents replaces the stanza in place (no duplication)', async () => {
    const dir = tmp();
    await runCli(['init', '--agents'], { cwd: dir });
    const { code, stdout } = await runCli(['init', '--agents'], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toMatch(/stanza (updated|unchanged)/);
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents.split('<!-- dsds:begin -->').length).toBe(2); // exactly one marker
  });

  it('appends to an existing AGENTS.md without touching prior content', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'AGENTS.md'), '# My agents file\n\nKeep this.\n');
    const { code } = await runCli(['init', '--agents'], { cwd: dir });
    expect(code).toBe(0);
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('Keep this.');
    expect(agents.indexOf('Keep this.')).toBeLessThan(agents.indexOf('<!-- dsds:begin -->'));
  });

  it('--agents-file targets a different file', async () => {
    const dir = tmp();
    const { code } = await runCli(['init', '--agents', '--agents-file', 'CLAUDE.md'], { cwd: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf-8')).toContain('<!-- dsds:begin -->');
  });

  it('the generated config round-trips through the CLI', async () => {
    const dir = tmp();
    // Seed a config pointing at the valid fixture system, then use it env-free.
    const fixture = new URL('./fixtures/valid/system.dsds.json', import.meta.url).pathname;
    await runCli(['init'], { cwd: dir, env: { DSDS_PATHS: fixture } });
    const { code, stdout } = await runCli(['list'], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });
});
