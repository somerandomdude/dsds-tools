// `dsds prompt`, `dsds resource`, `dsds instructions` — the MCP capability
// groups that used to be reachable only over the protocol.

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, VALID_SYSTEM } from './helpers.js';

const withSystem = { env: { DSDS_PATHS: VALID_SYSTEM } };

let introPath;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'dsds-intro-'));
  introPath = join(dir, 'intro.dsds.json');
  writeFileSync(
    introPath,
    JSON.stringify({
      entity: {
        identifier: 'system-intro',
        kind: 'guide',
        name: 'System Intro',
        metadata: [{ kind: 'description', value: 'Start here.' }],
        documentBlocks: [
          { kind: 'section', items: [{ title: 'Layout', body: 'Compose with Stack.' }] },
        ],
      },
    })
  );
});

describe('dsds prompt', () => {
  it('lists the prompts an MCP client would offer', async () => {
    const { code, stdout } = await runCli(['prompt'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('build-with-design-system');
    expect(stdout).toContain('author-dsds-docs');
    expect(stdout).toContain('ask-design-system');
  });

  it('renders a prompt to its briefing text', async () => {
    const { code, stdout } = await runCli(['prompt', 'build-with-design-system'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('Before you build');
  });

  it('weaves --task into the briefing', async () => {
    const { code, stdout } = await runCli(
      ['prompt', 'ask-design-system', '--task', 'which dialog?'],
      withSystem
    );
    expect(code).toBe(0);
    expect(stdout.startsWith('## Your question: which dialog?')).toBe(true);
  });

  it('lists prompts as data with --json', async () => {
    const { code, stdout } = await runCli(['prompt', '--json'], withSystem);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({ ok: true, command: 'prompt', exitCode: 0 });
    expect(payload.data.map(p => p.name)).toContain('build-with-design-system');
  });

  it('names the alternatives when the prompt is unknown (exit 1)', async () => {
    const { code, stderr } = await runCli(['prompt', 'nope'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown prompt');
    expect(stderr).toContain('Available prompts:');
    expect(stderr).toContain('build-with-design-system');
  });

  it('reports an unknown prompt in the envelope with --json', async () => {
    const { code, stdout } = await runCli(['prompt', 'nope', '--json'], withSystem);
    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, command: 'prompt', exitCode: 1 });
  });

  it('rejects more than one prompt name', async () => {
    const { code, stderr } = await runCli(['prompt', 'a', 'b'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('usage:');
  });

  it('offers the intro prompt only when intro documents are configured', async () => {
    const without = await runCli(['prompt'], withSystem);
    expect(without.stdout).not.toContain('dsds-intro');

    const withIntro = await runCli(['prompt'], {
      env: { DSDS_PATHS: VALID_SYSTEM, DSDS_INTRO_PATHS: introPath },
    });
    expect(withIntro.stdout).toContain('dsds-intro');
    expect(withIntro.stdout).toContain('System Intro');
  });

  it('renders the intro documents through the intro prompt', async () => {
    const { code, stdout } = await runCli(['prompt', 'dsds-intro'], {
      env: { DSDS_PATHS: VALID_SYSTEM, DSDS_INTRO_PATHS: introPath },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('## System Intro');
    expect(stdout).toContain('Compose with Stack.');
  });

  it('explains how to configure intro documents when asked for the intro prompt without them', async () => {
    const { code, stderr } = await runCli(['prompt', 'dsds-intro'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('No intro entities configured');
    expect(stderr).toContain('DSDS_INTRO_PATHS');
    expect(stderr).toContain('Available prompts:');
  });

  it('documents itself with --help without loading documents', async () => {
    const { code, stdout } = await runCli(['prompt', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('dsds prompt');
    expect(stdout).toContain('--task');
  });
});

describe('dsds resource', () => {
  it('lists one resource per entity, as dsds:// URIs', async () => {
    const { code, stdout } = await runCli(['resource'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('dsds://entity/test-button');
    expect(stdout).toContain('dsds://entity/test-card');
  });

  it('reads a resource by URI as entity JSON', async () => {
    const { code, stdout } = await runCli(['resource', 'dsds://entity/test-button'], withSystem);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).identifier).toBe('test-button');
  });

  it('accepts a bare identifier as shorthand', async () => {
    const { code, stdout } = await runCli(['resource', 'test-button'], withSystem);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).identifier).toBe('test-button');
  });

  it('returns the entity as structured data with --json', async () => {
    const { code, stdout } = await runCli(['resource', 'test-button', '--json'], withSystem);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({
      ok: true,
      command: 'resource',
      exitCode: 0,
      uri: 'dsds://entity/test-button',
      mimeType: 'application/json',
    });
    expect(payload.data.identifier).toBe('test-button');
  });

  it('lists resources as data with --json', async () => {
    const { code, stdout } = await runCli(['resource', '--json'], withSystem);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.data.every(r => r.uri.startsWith('dsds://entity/'))).toBe(true);
  });

  it('fails with exit 1 on an unknown resource', async () => {
    const { code, stderr } = await runCli(['resource', 'not-a-real-entity'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('Resource not found');
  });

  it('says so plainly when nothing is loaded', async () => {
    const { code, stdout } = await runCli(['resource', '--quiet']);
    expect(code).toBe(0);
    expect(stdout).toContain('No resources');
  });
});

describe('dsds instructions', () => {
  it('prints the instruction block an MCP client receives on connect', async () => {
    const { code, stdout } = await runCli(['instructions'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('Design System Documentation Spec');
    expect(stdout).toContain('dsds_get_agent_context');
    expect(stdout).toContain('dsds_context_brief');
  });

  it('appends the configured intro documents', async () => {
    const { code, stdout } = await runCli(['instructions'], {
      env: { DSDS_PATHS: VALID_SYSTEM, DSDS_INTRO_PATHS: introPath },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('## System Intro');
    expect(stdout).toContain('Compose with Stack.');
  });

  it('wraps the text in the command envelope with --json', async () => {
    const { code, stdout } = await runCli(['instructions', '--json'], withSystem);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({ ok: true, command: 'instructions', exitCode: 0 });
    expect(payload.data).toContain('Design System Documentation Spec');
  });

  it('rejects stray positional arguments', async () => {
    const { code, stderr } = await runCli(['instructions', 'extra'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('usage:');
  });
});

describe('discoverability', () => {
  it('help lists the MCP surface commands', async () => {
    const { code, stdout } = await runCli(['help']);
    expect(code).toBe(0);
    expect(stdout).toContain('MCP surface');
    for (const name of ['prompt', 'resource', 'instructions']) {
      expect(stdout).toMatch(new RegExp(`^\\s+${name}\\s`, 'm'));
    }
  });

  // A resource that throws on serialization is invisible until something
  // asks for it — doctor asks for all of them.
  it('doctor reports the surface and proves every part of it renders', async () => {
    const { stdout } = await runCli(['doctor', '--json'], withSystem);
    const check = JSON.parse(stdout).checks.find(c => c.name === 'mcp surface');
    expect(check).toBeDefined();
    expect(check.status).toBe('pass');
    expect(check.details.join('\n')).toMatch(/\d+ tools/);
    expect(check.details.join('\n')).toMatch(/\d+ prompts/);
    expect(check.details.join('\n')).toMatch(/\d+ resources/);
    expect(check.details.join('\n')).toMatch(/agent instructions/);
  });

  it('manifest describes all four capability groups', async () => {
    const { code, stdout } = await runCli(['manifest']);
    expect(code).toBe(0);
    const manifest = JSON.parse(stdout);
    expect(Object.keys(manifest.capabilities).sort()).toEqual([
      'instructions', 'prompts', 'resources', 'tools',
    ]);
    expect(manifest.prompts.length).toBeGreaterThanOrEqual(3);
    expect(manifest.resources.uriTemplate).toBe('dsds://entity/{identifier}');
  });
});
