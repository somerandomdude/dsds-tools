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

  // The fallback above made every one of those cells expensive rather than
  // empty: on the 199-entity corpus it took `dsds list` from 6,752 to 17,788
  // characters. The content is right; paying for it on every list is not.
  it('drops the summary column on --no-summaries', async () => {
    const { code, stdout } = await runCli(['list', '--no-summaries'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('| Identifier | Status |');
    expect(stdout).not.toContain('| Identifier | Status | Summary |');
    const rows = stdout.split('\n').filter(l => /^\| `/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    // Two columns means three pipe-delimited parts, no third cell.
    for (const row of rows) {
      expect(row.split('|').length, `unexpected column count: ${row}`).toBe(4);
    }
  });

  it('--no-summaries is materially smaller than the default list', async () => {
    const bare = await runCli(['list', '--no-summaries'], withSystem);
    const full = await runCli(['list'], withSystem);
    expect(bare.stdout.length).toBeLessThan(full.stdout.length);
  });

  // The catalogue cannot change mid-session, so the response says so —
  // one iteration in five was re-listing and getting identical bytes.
  it('tells the caller the catalogue is complete, so it is not re-fetched', async () => {
    const { stdout } = await runCli(['list'], withSystem);
    expect(stdout).toContain('This is the complete catalogue');
    expect(stdout).toContain('returns exactly the same text');
  });

  it('does not claim completeness when --limit hid some entities', async () => {
    const { stdout } = await runCli(['list', '--limit', '1'], withSystem);
    expect(stdout).not.toContain('This is the complete catalogue');
  });

  it('search omits summaries and next commands by default', async () => {
    const { code, stdout } = await runCli(['search', 'test button'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('| Identifier | Kind | Status |');
    expect(stdout).not.toContain('Summary');
    expect(stdout).not.toContain('Next');
  });

  // Turned off after measuring it: the listing became a worklist and the
  // agent made 13% more agent-context calls. Still available on request.
  it('--next restores the follow-up command on list and search', async () => {
    const l = await runCli(['list', '--next'], withSystem);
    expect(l.stdout).toContain('Read one: dsds context');
    const s = await runCli(['search', 'test button', '--next'], withSystem);
    expect(s.stdout).toContain('| Identifier | Kind | Status | Next |');
    expect(s.stdout).toContain('dsds context');
  });

  it('list has no Read one: line by default', async () => {
    const { stdout } = await runCli(['list'], withSystem);
    expect(stdout).not.toContain('Read one:');
  });

  it('keeps the JSON half in step with the rendered table', async () => {
    const bare = await runCli(['list', '--no-summaries', '--json'], withSystem);
    const full = await runCli(['list', '--json'], withSystem);
    const b = JSON.parse(bare.stdout).data.entities[0];
    const f = JSON.parse(full.stdout).data.entities[0];
    expect(b).not.toHaveProperty('summary');
    expect(f).toHaveProperty('summary');
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

  // Changed 2026-09-11: a --kind the tool can correct unambiguously is now
  // accepted with a note, rather than refused. `--kind components` and
  // `--kind sanity.chunks` were 23 of 55 failed calls in the ui5-cli runs —
  // diagnosed correctly, then rejected, costing a turn to retype.
  it('accepts a single-candidate --kind typo and says what it assumed', async () => {
    const { code, stdout } = await runCli(['list', '--kind', 'compnent'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('kind=component');
    expect(stdout).toContain('Read `kind=compnent` as `component`');
  });

  it('still refuses a --kind with more than one candidate', async () => {
    const { code, stderr } = await runCli(['list', '--kind', 'sanity'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown kind');
  });

  it('still refuses a --kind that resembles nothing', async () => {
    const { code, stderr } = await runCli(['list', '--kind', 'zzzzzzzz'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown kind');
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
