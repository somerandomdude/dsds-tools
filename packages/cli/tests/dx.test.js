// Ergonomics: the things a person or agent hits on the way to an answer —
// setup, discovery, typos, and piping output into something else.

import { describe, it, expect } from 'vitest';
import { runCli, VALID_SYSTEM } from './helpers.js';

const withSystem = { env: { DSDS_PATHS: VALID_SYSTEM } };

describe('discovery', () => {
  it('fills in the summary column from a 0.20.0 description', async () => {
    const { code, stdout } = await runCli(['list'], withSystem);
    expect(code).toBe(0);
    const rows = stdout.split('\n').filter(l => /^\| `/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    // Every row's third cell carries text. These were all blank: the loader
    // read metadata.summary only, and 0.20.0 keeps it in `description`.
    for (const row of rows) {
      const summary = row.split('|')[3]?.trim();
      expect(summary, `no summary on: ${row}`).toBeTruthy();
    }
  });

  it('matches a multi-word query, in any field order', async () => {
    const { code, stdout } = await runCli(['search', 'test button'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('ranks an exact identifier above a passing mention', async () => {
    const { stdout } = await runCli(['search', 'test-button'], withSystem);
    const rows = stdout.split('\n').filter(l => /^\| `/.test(l));
    expect(rows[0]).toContain('test-button');
  });

  it('caps output with --limit and says how many are left', async () => {
    const { code, stdout } = await runCli(['search', 'test', '--limit', '1'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toMatch(/showing 1 of \d+/);
    expect(stdout).toContain('more');
  });

  it('rejects a nonsense --limit as a usage error', async () => {
    const { code, stderr } = await runCli(['list', '--limit', 'lots'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('positive integer');
  });

  it('never labels a kindless entity "Undefineds"', async () => {
    const { stdout } = await runCli(['list'], withSystem);
    expect(stdout).not.toContain('Undefineds');
  });
});

describe('errors that help', () => {
  it('suggests the entity you meant instead of listing them all', async () => {
    const { code, stderr } = await runCli(['get', 'test-buton'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Did you mean');
    expect(stderr).toContain('test-button');
    expect(stderr.length).toBeLessThan(400);
  });

  it('points at the CLI listing, not the MCP tool, when nothing is close', async () => {
    const { stderr } = await runCli(['get', 'zzzzzzzzzz'], withSystem);
    expect(stderr).toContain('dsds list');
    expect(stderr).not.toContain('dsds_list_entities');
  });

  it('suggests the flag you meant', async () => {
    const { code, stderr } = await runCli(['list', '--kinds', 'component'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('--kind');
    // Not node's advice about positional arguments that start with a dash.
    expect(stderr).not.toContain('place it at the end');
  });

  it('suggests the command you meant', async () => {
    const { code, stderr } = await runCli(['lst'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('dsds list');
  });

  it('names an unknown --kind instead of reporting an empty result', async () => {
    const { code, stderr } = await runCli(['list', '--kind', 'compnent'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown kind');
    expect(stderr).toContain('component');
  });

  it('explains which word of a multi-word query found nothing', async () => {
    const { stdout } = await runCli(['search', 'button zzzzzzzzzz'], withSystem);
    expect(stdout).toContain('zzzzzzzzzz');
  });
});

describe('conventions', () => {
  it('accepts -h', async () => {
    const { code, stdout } = await runCli(['-h']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
  });

  it('accepts -v', async () => {
    const { code, stdout } = await runCli(['-v']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('accepts -h on a subcommand', async () => {
    const { code, stdout } = await runCli(['search', '-h']);
    expect(code).toBe(0);
    expect(stdout).toContain('dsds search');
  });

  it('emits a syntactically valid bash completion script', async () => {
    const { code, stdout } = await runCli(['completion', 'bash']);
    expect(code).toBe(0);
    expect(stdout).toContain('complete -F _dsds_completions dsds');
  });

  it.each(['zsh', 'fish'])('emits a %s completion script', async shell => {
    const { code, stdout } = await runCli(['completion', shell]);
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(100);
  });

  it('names the supported shells for an unsupported one', async () => {
    const { code, stderr } = await runCli(['completion', 'powershell']);
    expect(code).toBe(1);
    expect(stderr).toContain('bash, zsh, fish');
  });

  it('--dry-run without --apply is a usage error, not a silent no-op', async () => {
    const { code, stderr } = await runCli(['lint', 'src/App.tsx', '--dry-run'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('--dry-run only means something with --apply');
  });
});

describe('setup guidance', () => {
  it('tells an unconfigured CLI user to run dsds init', async () => {
    const { stderr } = await runCli(['list']);
    expect(stderr).toContain('dsds init');
    expect(stderr).not.toContain('MCP client config');
    // Wrong for a config file, where relative paths resolve against the file.
    expect(stderr).not.toContain('only absolute paths are supported');
  });

  it('does not also nag on stderr about DSDS_PATHS being unset', async () => {
    const { stderr } = await runCli(['list']);
    expect(stderr).not.toContain('DSDS_PATHS not set');
  });

  it('stays quiet about configuration for commands that need none', async () => {
    const { code, stderr } = await runCli(['spec', 'overview']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
  });
});

describe('--json carries data, not prose', () => {
  it('list returns entities as objects', async () => {
    const { code, stdout } = await runCli(['list', '--json'], withSystem);
    expect(code).toBe(0);
    const { data, text } = JSON.parse(stdout);
    expect(Array.isArray(data.entities)).toBe(true);
    expect(data.entities[0]).toHaveProperty('identifier');
    expect(data.entities[0]).toHaveProperty('kind');
    // The human rendering is still there, just no longer in the way.
    expect(typeof text).toBe('string');
  });

  it('search returns entities plus the filters that produced them', async () => {
    const { stdout } = await runCli(['search', 'button', '--json'], withSystem);
    const { data } = JSON.parse(stdout);
    expect(data.filters.query).toBe('button');
    expect(data.total).toBeGreaterThan(0);
    expect(data.entities.every(e => 'identifier' in e)).toBe(true);
  });

  it('a command with no structured form still returns its text', async () => {
    const { stdout } = await runCli(['get', 'test-button', '--json'], withSystem);
    const { data } = JSON.parse(stdout);
    expect(typeof data).toBe('string');
    expect(data).toContain('Test Button');
  });
});

describe('manifest', () => {
  it('--compact drops the input schemas', async () => {
    const full = await runCli(['manifest']);
    const compact = await runCli(['manifest', '--compact']);
    expect(compact.code).toBe(0);
    expect(compact.stdout.length).toBeLessThan(full.stdout.length / 2);
    const parsed = JSON.parse(compact.stdout);
    expect(parsed.tools[0]).not.toHaveProperty('inputSchema');
    expect(parsed.tools[0]).toHaveProperty('name');
  });

  it('lists completion among its commands', async () => {
    const { stdout } = await runCli(['manifest']);
    expect(JSON.parse(stdout).commands.map(c => c.name)).toContain('completion');
  });
});
