import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../../src/loader.js';
import { listEntitiesHandler } from '../../src/tools/list-entities.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

function makeGetters(systems) {
  return [() => systems, () => summarizeEntities(systems)];
}

describe('listEntitiesHandler', () => {
  it('lists all entities grouped by kind', async () => {
    const { systems } = await loadSystems([
      `${fixturesDir}/button.dsds.json`,
      `${fixturesDir}/tokens.dsds.json`,
    ]);
    const result = await listEntitiesHandler({}, ...makeGetters(systems));
    const text = result.content[0].text;
    expect(text).toContain('button');
    expect(text).toContain('color-text-primary');
    expect(text).toContain('4 total');
    expect(result.isError).toBeFalsy();
  });

  it('shows status for each entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
    const result = await listEntitiesHandler({}, ...makeGetters(systems));
    expect(result.content[0].text).toContain('deprecated');
    expect(result.content[0].text).toContain('stable');
  });

  it('pluralizes a kind ending in a consonant + y correctly ("entries", not "entrys")', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    systems[0].entities[0] = { ...systems[0].entities[0], kind: 'entry' };
    const result = await listEntitiesHandler({}, ...makeGetters(systems));
    expect(result.content[0].text).toContain('## Entries (1)');
    expect(result.content[0].text).not.toContain('Entrys');
  });

  it('returns isError when no systems loaded', async () => {
    const result = await listEntitiesHandler({}, () => [], () => []);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DSDS_PATHS');
  });

  it('humanizes a namespaced 0.20.0 kind heading instead of mangling it ("Sanity.chunks")', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    // button.dsds.yaml is kind: component — force a namespaced kind onto a
    // clone to exercise the heading logic without a new fixture.
    systems[0].entities[0] = { ...systems[0].entities[0], kind: 'sanity.chunk' };
    const result = await listEntitiesHandler({}, ...makeGetters(systems));
    expect(result.content[0].text).toContain('## Sanity chunks (1)');
    expect(result.content[0].text).not.toContain('Sanity.chunks');
  });
});
