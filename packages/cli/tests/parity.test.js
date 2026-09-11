// Parity guarantee (plan FR-4 / metric M3), widened to the whole MCP surface.
//
// The CLI is generated from the same shared surface the MCP server serves, so
// every capability an MCP client can reach must be reachable from a shell:
// tools, prompts, resources, and the instruction block. A capability added to
// the core with no CLI route fails here.

import { describe, it, expect } from 'vitest';
import { createSurface } from 'dsds-mcp/src/surface.js';
import { createGraphGetter } from 'dsds-mcp/src/graph.js';
import { buildManifest } from '../src/manifest.js';
import { SURFACE_COMMANDS } from '../src/surface-commands.js';
import { PORCELAIN } from '../src/porcelain.js';

const empty = [];
const stubDeps = {
  getSystems: () => empty,
  getSummaries: () => empty,
  getGraph: createGraphGetter(() => empty),
};

const introEntity = { identifier: 'intro', name: 'Intro', kind: 'guide' };

describe('CLI ↔ surface parity — tools', () => {
  const surface = createSurface(stubDeps);
  const manifest = buildManifest(surface, { name: 'dsds-cli', version: '0.0.0', description: '' });

  it('manifest lists every registered tool, in registry order', () => {
    expect(manifest.tools.map(t => t.name)).toEqual(surface.toolDefs.map(d => d.name));
    expect(manifest.tools.length).toBeGreaterThanOrEqual(22);
  });

  it('every manifest tool carries its input schema', () => {
    for (const t of manifest.tools) {
      expect(t.inputSchema, `${t.name} is missing inputSchema`).toBeDefined();
    }
  });

  it('feedback tool follows enableFeedback', () => {
    expect(surface.toolDefs.map(d => d.name)).toContain('dsds_feedback');
    const without = createSurface({ ...stubDeps, enableFeedback: false });
    expect(without.toolDefs.map(d => d.name)).not.toContain('dsds_feedback');
  });
});

describe('CLI ↔ surface parity — prompts', () => {
  const surface = createSurface(stubDeps);
  const manifest = buildManifest(surface, { name: 'dsds-cli', version: '0.0.0', description: '' });

  it('manifest lists every prompt the surface serves, with its arguments', () => {
    expect(manifest.prompts.map(p => p.name)).toEqual(surface.listPrompts().map(p => p.name));
    for (const p of manifest.prompts) {
      expect(p.description, `${p.name} is missing a description`).toBeTruthy();
      expect(Array.isArray(p.arguments), `${p.name} is missing arguments`).toBe(true);
    }
  });

  it('every prompt the surface lists is renderable by name', () => {
    const withIntro = createSurface({ ...stubDeps, getIntro: () => [introEntity] });
    for (const { name } of withIntro.listPrompts()) {
      const { messages } = withIntro.getPrompt(name);
      expect(messages[0].content.text.length, `${name} rendered empty`).toBeGreaterThan(0);
    }
  });
});

describe('CLI ↔ surface parity — commands', () => {
  const surface = createSurface(stubDeps);
  const manifest = buildManifest(surface, { name: 'dsds-cli', version: '0.0.0', description: '' });
  const commandNames = manifest.commands.map(c => c.name);

  it('every MCP capability group names the command that reaches it', () => {
    expect(Object.keys(manifest.capabilities).sort()).toEqual([
      'instructions', 'prompts', 'resources', 'tools',
    ]);
    for (const [group, text] of Object.entries(manifest.capabilities)) {
      expect(text, `${group} does not name a command`).toMatch(/^dsds /);
    }
  });

  it('manifest lists every porcelain and surface command', () => {
    for (const name of [...Object.keys(PORCELAIN), ...Object.keys(SURFACE_COMMANDS)]) {
      expect(commandNames, `${name} is missing from the manifest`).toContain(name);
    }
  });

  it('describes how to list and read resources', () => {
    expect(manifest.resources.uriTemplate).toBe('dsds://entity/{identifier}');
    expect(manifest.resources.list).toBe('dsds resource');
    expect(manifest.resources.read).toContain('dsds resource ');
  });
});
