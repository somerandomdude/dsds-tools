// End-to-end tests through the real bin, exercising the output contract:
// stdout payloads, stderr diagnostics, exit codes, --json envelopes, logging.

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../src/index.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/button.dsds.json', import.meta.url));

function runCli(args, { env = {}, cwd } = {}) {
  const cleaned = { ...process.env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('DSDS_') || key.startsWith('LINT_') || key === 'PACKAGE_EXPORT_PATHS' || key === 'ICON_PACKAGE') {
      delete cleaned[key];
    }
  }
  Object.assign(cleaned, env);
  return new Promise(resolve => {
    execFile(process.execPath, [BIN, ...args], { env: cleaned, cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

describe('basics', () => {
  it('--version prints the package version', async () => {
    const { code, stdout } = await runCli(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('help lists usage and tools', async () => {
    const { code, stdout } = await runCli(['help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('dsds_get_entity');
  });

  it('unknown command exits 1 with a hint on stderr', async () => {
    const { code, stderr, stdout } = await runCli(['frobnicate']);
    expect(code).toBe(1);
    expect(stderr).toContain('unknown command');
    expect(stdout).toBe('');
  });

  it('unknown tool exits 1', async () => {
    const { code, stderr } = await runCli(['tool', 'dsds_nope']);
    expect(code).toBe(1);
    expect(stderr).toContain('unknown tool');
  });

  it('unknown flag exits 1', async () => {
    const { code, stderr } = await runCli(['tool', 'dsds_spec_overview', '--nope']);
    expect(code).toBe(1);
    expect(stderr).toContain('dsds:');
  });
});

describe('spec tools (no configuration)', () => {
  it('dsds_spec_overview works with no env', async () => {
    const { code, stdout } = await runCli(['tool', 'dsds_spec_overview']);
    expect(code).toBe(0);
    expect(stdout).toContain('Design System Documentation Spec');
  });

  it('--json wraps the payload in an envelope', async () => {
    const { code, stdout } = await runCli(['tool', 'dsds_spec_overview', '--json']);
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.tool).toBe('dsds_spec_overview');
    expect(typeof envelope.data).toBe('string');
  });
});

describe('design system tools against the fixture', () => {
  const env = { DSDS_PATHS: FIXTURE };

  it('lists entities', async () => {
    const { code, stdout } = await runCli(['tool', 'dsds_list_entities'], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('button');
  });

  it('gets an entity through the flag bridge', async () => {
    const { code, stdout } = await runCli(['tool', 'dsds_get_entity', '--identifier', 'button', '--json'], { env });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toContain('Button');
  });

  it('missing required argument exits 1 via the shared validator', async () => {
    const { code, stderr } = await runCli(['tool', 'dsds_get_entity'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('Missing required argument');
  });

  it('a failed call under --json emits ok:false on stdout and still exits 1', async () => {
    const { code, stdout } = await runCli(['tool', 'dsds_get_entity', '--json'], { env });
    expect(code).toBe(1);
    const envelope = JSON.parse(stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.error).toContain('Missing required argument');
  });

  it('flags override --args JSON', async () => {
    const { code, stdout } = await runCli(
      ['tool', 'dsds_get_entity', '--args', '{"identifier":"does-not-exist"}', '--identifier', 'button'],
      { env }
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Button');
  });

  it('accepts --args-file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsds-cli-'));
    const payload = join(dir, 'args.json');
    writeFileSync(payload, JSON.stringify({ identifier: 'button' }));
    const { code, stdout } = await runCli(['tool', 'dsds_get_entity', '--args-file', payload], { env });
    expect(code).toBe(0);
    expect(stdout).toContain('Button');
  });

  it('rejects malformed --args JSON', async () => {
    const { code, stderr } = await runCli(['tool', 'dsds_get_entity', '--args', '{nope'], { env });
    expect(code).toBe(1);
    expect(stderr).toContain('not valid JSON');
  });
});

describe('manifest', () => {
  it('is machine-readable and complete', async () => {
    const { code, stdout } = await runCli(['manifest']);
    expect(code).toBe(0);
    const manifest = JSON.parse(stdout);
    expect(manifest.name).toBe('dsds');
    expect(manifest.specVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.output.exitCodes['0']).toBeDefined();
    expect(manifest.tools.length).toBeGreaterThanOrEqual(22);
    expect(manifest.tools.map(t => t.name)).toContain('dsds_get_entity');
  });
});

describe('usage logging', () => {
  it('writes a JSONL entry with a cli surface marker when DSDS_LOGS_DIR is set', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'dsds-cli-logs-'));
    const { code } = await runCli(['tool', 'dsds_spec_overview'], { env: { DSDS_LOGS_DIR: logsDir } });
    expect(code).toBe(0);
    const files = readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBe(1);
    const entry = JSON.parse(readFileSync(join(logsDir, files[0]), 'utf-8').trim().split('\n')[0]);
    expect(entry).toMatchObject({ type: 'tool', tool: 'dsds_spec_overview', ok: true, surface: 'cli' });
  });

  it('creates no logs directory when DSDS_LOGS_DIR is not set', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsds-cli-cwd-'));
    const { code } = await runCli(['tool', 'dsds_spec_overview'], { cwd });
    expect(code).toBe(0);
    expect(existsSync(join(cwd, 'logs'))).toBe(false);
  });

  it('--no-log skips logging even with DSDS_LOGS_DIR set', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'dsds-cli-nolog-'));
    const { code } = await runCli(['tool', 'dsds_spec_overview', '--no-log'], { env: { DSDS_LOGS_DIR: logsDir } });
    expect(code).toBe(0);
    expect(readdirSync(logsDir)).toEqual([]);
  });
});
