// Parity guarantee (plan FR-4 / metric M3): the CLI surface is generated from
// the same registry the MCP server serves, so every registered tool must
// appear in the manifest with its schema.

import { describe, it, expect } from 'vitest';
import { createToolRuntime } from 'dsds-mcp/src/registry.js';
import { createGraphGetter } from 'dsds-mcp/src/graph.js';
import { buildManifest } from '../src/manifest.js';

const empty = [];
const stubDeps = {
  getSystems: () => empty,
  getSummaries: () => empty,
  getGraph: createGraphGetter(() => empty),
};

describe('CLI ↔ registry parity', () => {
  const { toolDefs } = createToolRuntime(stubDeps);
  const manifest = buildManifest(toolDefs, { name: 'dsds-cli', version: '0.0.0', description: '' });

  it('manifest lists every registered tool, in registry order', () => {
    expect(manifest.tools.map(t => t.name)).toEqual(toolDefs.map(d => d.name));
    expect(manifest.tools.length).toBeGreaterThanOrEqual(22);
  });

  it('every manifest tool carries its input schema', () => {
    for (const t of manifest.tools) {
      expect(t.inputSchema, `${t.name} is missing inputSchema`).toBeDefined();
    }
  });

  it('feedback tool follows enableFeedback', () => {
    expect(toolDefs.map(d => d.name)).toContain('dsds_feedback');
    const { toolDefs: without } = createToolRuntime({ ...stubDeps, enableFeedback: false });
    expect(without.map(d => d.name)).not.toContain('dsds_feedback');
  });
});
