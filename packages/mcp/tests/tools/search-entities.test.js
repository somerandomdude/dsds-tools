import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems, summarizeEntities } from '../../src/loader.js';
import { searchEntitiesHandler } from '../../src/tools/search-entities.js';
import { createToolRuntime } from '../../src/registry.js';
import { createGraphGetter } from '../../src/graph.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

async function buildGetters() {
  const { systems } = await loadSystems([
    `${fixturesDir}/button.dsds.json`,
    `${fixturesDir}/tokens.dsds.json`,
  ]);
  return [() => systems, () => summarizeEntities(systems)];
}

describe('searchEntitiesHandler', () => {
  it('returns all entities when no filters given', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({}, ...getters);
    expect(result.content[0].text).toContain('4 found');
    expect(result.isError).toBeFalsy();
  });

  it('filters by kind', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({ kind: 'token' }, ...getters);
    expect(result.content[0].text).toContain('3 found');
    expect(result.content[0].text).not.toContain('button');
  });

  it('filters by status', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({ status: 'deprecated' }, ...getters);
    expect(result.content[0].text).toContain('color-grey-100');
    expect(result.content[0].text).not.toContain('button');
  });

  it('filters by tags', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({ tags: ['color', 'text'] }, ...getters);
    expect(result.content[0].text).toContain('color-text-primary');
    expect(result.content[0].text).not.toContain('color-grey-100');
  });

  it('filters by text query', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({ query: 'primary' }, ...getters);
    expect(result.content[0].text).toContain('color-text-primary');
    expect(result.content[0].text).not.toContain('color-grey-100');
  });

  it('returns isError when no systems loaded', async () => {
    const result = await searchEntitiesHandler({}, () => [], () => []);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DSDS_PATHS');
  });

  it('returns no-match message when nothing matches', async () => {
    const getters = await buildGetters();
    const result = await searchEntitiesHandler({ query: 'xyzzy-no-match' }, ...getters);
    expect(result.content[0].text).toContain('No entities matched');
    expect(result.isError).toBeFalsy();
  });

  it('accepts a real 0.20.0 namespaced kind through the actual dispatch/input-validation layer', async () => {
    // Regression: the tool's inputSchema used to enum-constrain `kind` to the
    // legacy vocabulary (component/guide/pattern/...), so registry.js's own
    // arg validation rejected `kind: "sanity.guide"` before the handler ever
    // ran — a bug invisible to tests that call the handler directly.
    const dir = mkdtempSync(join(tmpdir(), 'dsds-search-'));
    const guidePath = join(dir, 'a11y.dsds.yaml');
    writeFileSync(guidePath, 'id: a11y-checklist\nkind: sanity.guide\nname: A11y Checklist\ndescription: x\n');
    const { systems } = await loadSystems([guidePath]);
    const getSystems = () => systems;
    const getSummaries = () => summarizeEntities(systems);
    const { dispatch } = createToolRuntime({ getSystems, getSummaries, getGraph: createGraphGetter(getSystems) });
    const result = await dispatch('dsds_search_entities', { kind: 'sanity.guide' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('a11y-checklist');
  });
});
