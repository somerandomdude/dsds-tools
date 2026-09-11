// createSurface — the single core behind both transports.
//
// The contract these tests defend: every capability an MCP client can reach
// is reachable from this object, so the MCP server can stay a thin envelope
// and the CLI can serve the same four groups.

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../src/loader.js';
import { createGraphGetter } from '../src/graph.js';
import { createSurface } from '../src/surface.js';
import { createToolRuntime } from '../src/registry.js';
import { createPromptRuntime } from '../src/prompts.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

const introEntity = {
  identifier: 'design-system-intro',
  name: 'Design System Intro',
  kind: 'guide',
  metadata: [{ kind: 'description', value: 'How this system is organized.' }],
};

async function buildSurface(overrides = {}) {
  const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`, `${fixturesDir}/tokens.dsds.json`]);
  const getSystems = () => systems;
  return createSurface({
    getSystems,
    getSummaries: () => summarizeEntities(systems),
    getGraph: createGraphGetter(getSystems),
    ...overrides,
  });
}

describe('createSurface', () => {
  it('exposes all four MCP capability groups', async () => {
    const surface = await buildSurface();
    expect(Array.isArray(surface.toolDefs)).toBe(true);
    expect(typeof surface.dispatch).toBe('function');
    expect(typeof surface.listPrompts).toBe('function');
    expect(typeof surface.getPrompt).toBe('function');
    expect(typeof surface.listResources).toBe('function');
    expect(typeof surface.readResource).toBe('function');
    expect(typeof surface.getInstructions).toBe('function');
  });

  it('serves exactly the registry tool catalog', async () => {
    const surface = await buildSurface();
    const { toolDefs } = createToolRuntime({
      getSystems: () => [],
      getSummaries: () => [],
      getGraph: createGraphGetter(() => []),
    });
    expect(surface.toolDefs.map(d => d.name)).toEqual(toolDefs.map(d => d.name));
  });

  it('serves exactly the prompt catalog', async () => {
    const surface = await buildSurface();
    const { listPrompts } = createPromptRuntime();
    expect(surface.listPrompts().map(p => p.name)).toEqual(listPrompts().map(p => p.name));
  });

  it('dispatches a tool call', async () => {
    const surface = await buildSurface();
    const result = await surface.dispatch('dsds_get_entity', { identifier: 'button' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Button');
  });

  it('lists one resource per entity and reads one back', async () => {
    const surface = await buildSurface();
    const resources = surface.listResources();
    expect(resources.length).toBeGreaterThan(0);
    const content = surface.readResource(resources[0].uri);
    expect(content.uri).toBe(resources[0].uri);
    expect(() => JSON.parse(content.text)).not.toThrow();
  });

  it('returns null for a resource that does not exist', async () => {
    const surface = await buildSurface();
    expect(surface.readResource('dsds://entity/not-a-real-entity')).toBeNull();
  });

  it('threads intro entities into both the prompts and the instructions', async () => {
    const surface = await buildSurface({ getIntro: () => [introEntity] });
    expect(surface.listPrompts().map(p => p.name)).toContain('dsds-intro');
    expect(surface.getInstructions()).toContain('## Design System Intro');
  });

  it('honors introInline when rendering the instructions', async () => {
    const surface = await buildSurface({ getIntro: () => [introEntity], introInline: false });
    expect(surface.getInstructions()).toContain('## Design system guides');
  });

  it('drops the feedback tool and its reminder together', async () => {
    const surface = await buildSurface({ enableFeedback: false });
    expect(surface.toolDefs.map(d => d.name)).not.toContain('dsds_feedback');
    expect(surface.getInstructions()).not.toContain('call dsds_feedback to rate');
  });
});
