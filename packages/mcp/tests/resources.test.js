import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../src/loader.js';
import { listResources, readResource } from '../src/resources.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

async function buildGetters() {
  const { systems } = await loadSystems([
    `${fixturesDir}/button.dsds.json`,
    `${fixturesDir}/tokens.dsds.json`,
  ]);
  return { getSystems: () => systems, getSummaries: () => summarizeEntities(systems) };
}

describe('listResources', () => {
  it('returns one resource per entity', async () => {
    const { getSummaries } = await buildGetters();
    const resources = listResources(getSummaries);
    expect(resources).toHaveLength(4);
  });

  it('uses dsds://entity/ URI scheme', async () => {
    const { getSummaries } = await buildGetters();
    const resources = listResources(getSummaries);
    expect(resources.every(r => r.uri.startsWith('dsds://entity/'))).toBe(true);
  });

  it('includes entity identifier in URI', async () => {
    const { getSummaries } = await buildGetters();
    const resources = listResources(getSummaries);
    const uris = resources.map(r => r.uri);
    expect(uris).toContain('dsds://entity/button');
    expect(uris).toContain('dsds://entity/color-text-primary');
  });

  it('returns empty list when no systems are loaded', () => {
    const resources = listResources(() => []);
    expect(resources).toHaveLength(0);
  });
});

describe('readResource', () => {
  it('returns entity JSON for a valid URI', async () => {
    const { getSystems } = await buildGetters();
    const content = readResource('dsds://entity/button', getSystems);
    expect(content).not.toBeNull();
    expect(content.mimeType).toBe('application/json');
    const entity = JSON.parse(content.text);
    expect(entity.identifier).toBe('button');
    expect(entity.kind).toBe('component');
  });

  it('returns null for an unknown entity', async () => {
    const { getSystems } = await buildGetters();
    const content = readResource('dsds://entity/nonexistent', getSystems);
    expect(content).toBeNull();
  });

  it('returns null for an unrecognized URI scheme', async () => {
    const { getSystems } = await buildGetters();
    const content = readResource('https://example.com/button', getSystems);
    expect(content).toBeNull();
  });

  it('is case-insensitive on identifier', async () => {
    const { getSystems } = await buildGetters();
    const content = readResource('dsds://entity/BUTTON', getSystems);
    expect(content).not.toBeNull();
  });

  // A loaded 0.20.0 entity carries __sharedEntries — the base document's
  // shared[] pool, whose own entries carry the same pool. Serializing the
  // entity as-is threw "Converting circular structure to JSON", which broke
  // resources/read for every entity in a document with a shared pool.
  it('serializes a 0.20.0 entity whose shared pool refers back to it', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/golden-0.20.0/base.dsds.yaml`]);
    const getSystems = () => systems;
    const content = readResource('dsds://entity/full-featured', getSystems);
    expect(content).not.toBeNull();
    const entity = JSON.parse(content.text);
    expect(entity.id).toBe('full-featured');
  });

  it('leaves the loader\'s internal annotations out of the resource body', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/golden-0.20.0/base.dsds.yaml`]);
    const entity = JSON.parse(readResource('dsds://entity/full-featured', () => systems).text);
    for (const key of ['__dsds20', '__filePath', '__sharedEntries']) {
      expect(entity, `${key} is a loader detail, not document content`).not.toHaveProperty(key);
    }
    // The authored content survives the filter.
    expect(entity.sections.length).toBeGreaterThan(0);
  });
});
