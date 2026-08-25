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

describe('loadSystems — real 0.20.0 (.dsds.yaml)', () => {
  it('loads a standalone entry file and normalizes it', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    expect(errors).toHaveLength(0);
    expect(systems[0].entities).toHaveLength(1);
    const entity = systems[0].entities[0];
    expect(entity.identifier).toBe('button'); // aliased from `id`
    expect(entity.__dsds20).toBe(true);
  });

  it('derives relationships from internal refs (to, not href), excluding rel:file and external links', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const entity = systems[0].entities[0];
    const targets = entity.relationships.map(r => r.target);
    expect(targets).toContain('button-group');
    expect(targets).toContain('color.action.primary');
    // External href-only refs (source, storybook, package) never become relationships.
    expect(entity.relationships.every(r => typeof r.target === 'string' && !r.target.startsWith('http'))).toBe(true);
  });

  it('follows rel:file refs transitively from a base document to a sibling file', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/base-with-refs.dsds.yaml`]);
    expect(errors).toHaveLength(0);
    const identifiers = systems[0].entities.map(e => e.identifier);
    expect(identifiers).toContain('pizza-party-design-system');
    expect(identifiers).toContain('button'); // from the sibling ./components/button.dsds.yaml
  });

  it('does not set __dsds20 on legacy JSON entities', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    expect(systems[0].entities[0].__dsds20).toBeUndefined();
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

  it('resolves status from real 0.20.0 metadata.status ({status: "..."} object)', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const summaries = summarizeEntities(systems);
    expect(summaries[0].status).toBe('stable');
    expect(summaries[0].tags).toEqual(['actions', 'button', 'cta', 'form-control']);
  });
});
