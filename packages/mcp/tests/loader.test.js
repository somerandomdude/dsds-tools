import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../src/loader.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

describe('loadSystems', () => {
  it('loads a single-entity file', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    expect(errors).toHaveLength(0);
    expect(systems).toHaveLength(1);
    expect(systems[0].entities).toHaveLength(1);
    expect(systems[0].entities[0].identifier).toBe('button');
  });

  it('loads a multi-entity file', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
    expect(errors).toHaveLength(0);
    expect(systems[0].entities).toHaveLength(3);
  });

  it('loads multiple files', async () => {
    const { systems, errors } = await loadSystems([
      `${fixturesDir}/button.dsds.json`,
      `${fixturesDir}/tokens.dsds.json`,
    ]);
    expect(errors).toHaveLength(0);
    expect(systems).toHaveLength(2);
  });

  it('reports an error for a missing file without throwing', async () => {
    const { systems, errors } = await loadSystems(['/nonexistent/path.dsds.json']);
    expect(systems).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('/nonexistent/path.dsds.json');
  });
});

describe('$ref resolution', () => {
  it('resolves a fragment ref (#/entity) from a manifest', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/manifest.dsds.json`]);
    expect(errors).toHaveLength(0);
    const identifiers = systems[0].entities.map(e => e.identifier);
    expect(identifiers).toContain('button');
  });

  it('resolves a whole-file ref from a manifest', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/manifest.dsds.json`]);
    const identifiers = systems[0].entities.map(e => e.identifier);
    expect(identifiers).toContain('color-text-primary');
    expect(identifiers).toContain('color-grey-100');
  });

  it('loads all entities through a manifest', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/manifest.dsds.json`]);
    expect(systems[0].entities).toHaveLength(4);
  });
});

describe('summarizeEntities', () => {
  it('returns summaries for a single-entity system', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const summaries = summarizeEntities(systems);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      identifier: 'button',
      name: 'Button',
      kind: 'component',
      status: 'stable',
      tags: ['action', 'interactive', 'button', 'cta', 'call to action', 'submit', 'click', 'press', 'trigger'],
    });
  });

  it('returns summaries for all entities in a multi-entity file', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
    const summaries = summarizeEntities(systems);
    expect(summaries).toHaveLength(3);
    const identifiers = summaries.map(s => s.identifier);
    expect(identifiers).toContain('color-text-primary');
    expect(identifiers).toContain('color-grey-100');
  });

  it('includes filePath in each summary', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const summaries = summarizeEntities(systems);
    expect(summaries[0].filePath).toContain('button.dsds.json');
  });
});
