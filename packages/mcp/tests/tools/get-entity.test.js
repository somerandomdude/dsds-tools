import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../../src/loader.js';
import { getEntityHandler } from '../../src/tools/get-entity.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

function makeGetters(systems) {
  return [() => systems, () => summarizeEntities(systems)];
}

describe('getEntityHandler', () => {
  it('retrieves an entity by identifier', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getEntityHandler({ identifier: 'button' }, ...makeGetters(systems));
    const text = result.content[0].text;
    expect(text).toContain('Button');
    expect(text).toContain('component');
    expect(text).toContain('api');
    expect(text).toContain('accessibility');
    expect(result.isError).toBeFalsy();
  });

  it('retrieves an entity by name, case-insensitively', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getEntityHandler({ identifier: 'BUTTON' }, ...makeGetters(systems));
    expect(result.content[0].text).toContain('Button');
  });

  it('includes metadata fields', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getEntityHandler({ identifier: 'button' }, ...makeGetters(systems));
    const text = result.content[0].text;
    expect(text).toContain('stable');
    expect(text).toContain('1.0.0');
  });

  it('returns isError with not-found message for unknown entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getEntityHandler({ identifier: 'nonexistent' }, ...makeGetters(systems));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
    expect(result.content[0].text).toContain('button');
  });

  it('returns isError when no systems loaded', async () => {
    const result = await getEntityHandler({ identifier: 'button' }, () => [], () => []);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DSDS_PATHS');
  });

  it('falls back to intro entities (so the compact-index pointer resolves)', async () => {
    const intro = [{ kind: 'guide', identifier: 'getting-started', name: 'Getting Started', documentBlocks: [] }];
    // No systems, but an intro guide is available via the getIntro accessor.
    const result = await getEntityHandler({ identifier: 'getting-started' }, () => [], () => [], () => intro);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Getting Started');
  });
});
