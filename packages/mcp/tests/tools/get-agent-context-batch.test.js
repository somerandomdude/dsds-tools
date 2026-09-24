import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems } from '../../src/loader.js';
import { createToolRuntime } from '../../src/registry.js';
import { createGraphGetter } from '../../src/graph.js';

// dsds_get_agent_context takes a list. Agents look up every component before
// using it, one call each — 15–17 calls per iteration in the 2026-09-23 run —
// so a list turns those round-trips into one.

const entity = (id, rule) => `
id: ${id}
kind: component
name: ${id[0].toUpperCase()}${id.slice(1)}
description: A ${id}.
sections:
  - kind: guidelines
    for: agent
    items:
      - statement: ${rule}
        level: must
`;

let root;

async function runtime(logsDir) {
  const { systems } = await loadSystems([join(root, 'index.dsds.yaml')]);
  const getSystems = () => systems;
  return createToolRuntime({ getSystems, getSummaries: () => [], getGraph: createGraphGetter(getSystems), logsDir });
}

function readAccess(dir) {
  return readdirSync(dir).flatMap((f) =>
    readFileSync(join(dir, f), 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse).filter((e) => e.type === 'access'),
  );
}

async function settle(dir, min, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    try { if (readAccess(dir).length >= min) return; } catch { /* not written yet */ }
    if (Date.now() - started > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-batch-'));
  mkdirSync(join(root, 'logs'), { recursive: true });
  writeFileSync(join(root, 'button.dsds.yaml'), entity('button', 'Buttons name the action.'));
  writeFileSync(join(root, 'card.dsds.yaml'), entity('card', 'Cards carry no onClick.'));
  writeFileSync(
    join(root, 'index.dsds.yaml'),
    'id: test-system\nkind: system\nname: Test\nrefs:\n  - href: ./button.dsds.yaml\n    rel: file\n  - href: ./card.dsds.yaml\n    rel: file\n',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('dsds_get_agent_context with a list', () => {
  it('returns every entity in one response, each in its own section', async () => {
    const { dispatch } = await runtime(null);
    const r = await dispatch('dsds_get_agent_context', { identifier: ['button', 'card'] });
    const text = r.content[0].text;
    expect(r.isError).toBeUndefined();
    expect(text).toContain('Agent context for 2 entities: `button`, `card`.');
    expect(text).toContain('# Button — Agent Context');
    expect(text).toContain('Buttons name the action.');
    expect(text).toContain('# Card — Agent Context');
    expect(text).toContain('Cards carry no onClick.');
  });

  it('still takes a single string, and renders it exactly as before', async () => {
    const { dispatch } = await runtime(null);
    const single = await dispatch('dsds_get_agent_context', { identifier: 'button' });
    const listed = await dispatch('dsds_get_agent_context', { identifier: ['button'] });
    expect(single.content[0].text).toBe(listed.content[0].text);
    expect(single.content[0].text).not.toContain('Agent context for');
  });

  it('lists misses at the top instead of failing the whole batch', async () => {
    const { dispatch } = await runtime(null);
    const r = await dispatch('dsds_get_agent_context', { identifier: ['button', 'buton-group', 'card'] });
    const text = r.content[0].text;
    expect(r.isError).toBeUndefined();
    expect(text.indexOf('Not found (1)')).toBeLessThan(text.indexOf('# Button'));
    expect(text).toContain('`buton-group`');
    expect(text).toContain('Cards carry no onClick.');
  });

  it('is an error only when nothing resolves', async () => {
    const { dispatch } = await runtime(null);
    const r = await dispatch('dsds_get_agent_context', { identifier: ['nope', 'nada'] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Not found (2)');
  });

  it('renders a duplicate once, including a name and an id for the same entity', async () => {
    const { dispatch } = await runtime(null);
    const text = (await dispatch('dsds_get_agent_context', { identifier: ['button', 'Button', 'card'] })).content[0].text;
    expect(text.match(/# Button — Agent Context/g)).toHaveLength(1);
  });

  it('writes one access record per entity, so per-entity counts match unbatched runs', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: ['button', 'card'] });
    await settle(logsDir, 2);
    const access = readAccess(logsDir);
    expect(access.map((a) => a.identifier).sort()).toEqual(['button', 'card']);
    expect(access.every((a) => a.tool === 'dsds_get_agent_context' && a.batch === 2)).toBe(true);
  });
});
