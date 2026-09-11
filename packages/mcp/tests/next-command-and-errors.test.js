import { describe, it, expect } from 'vitest';
import { nextCommandFor } from '../src/next-command.js';
import { ERROR_CODES, describeSuggestions, notFoundError, toolError } from '../src/errors.js';
import { toCliVocabulary } from '../src/vocabulary.js';
import { getExamplesHandler } from '../src/tools/get-examples.js';
import { listEntitiesHandler } from '../src/tools/list-entities.js';
import { searchEntitiesHandler } from '../src/tools/search-entities.js';
import { buildGraph } from '../src/graph.js';

describe('nextCommandFor', () => {
  it('sends chunks to the chunk tool — the only one that returns their code', () => {
    expect(nextCommandFor({ identifier: 'app-shell', kind: 'sanity.chunk' }))
      .toBe('dsds_get_chunk("app-shell")');
  });

  it('matches the bare legacy kind as well as the namespaced 0.20.x one', () => {
    expect(nextCommandFor({ identifier: 'a', kind: 'chunk' })).toBe('dsds_get_chunk("a")');
    expect(nextCommandFor({ identifier: 'a', kind: 'sanity.chunk' })).toBe('dsds_get_chunk("a")');
  });

  it('sends everything else to agent_context, which the HARD RULE requires', () => {
    expect(nextCommandFor({ identifier: 'button', kind: 'component' }))
      .toBe('dsds_get_agent_context("button")');
  });

  it('returns null without an identifier rather than a call that cannot run', () => {
    expect(nextCommandFor({ kind: 'component' })).toBeNull();
    expect(nextCommandFor(null)).toBeNull();
  });

  // The whole point of emitting canonical names: one string, both surfaces.
  it('translates to a runnable shell command through the CLI vocabulary', () => {
    expect(toCliVocabulary(nextCommandFor({ identifier: 'app-shell', kind: 'sanity.chunk' })))
      .toBe('dsds chunk "app-shell"');
    expect(toCliVocabulary(nextCommandFor({ identifier: 'button', kind: 'component' })))
      .toBe('dsds context "button"');
  });
});

describe('structured errors', () => {
  it('keeps the prose in content and adds the code beside it', () => {
    const r = toolError({ code: ERROR_CODES.NOT_CONFIGURED, text: 'Nothing here.\nSecond line.' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe('Nothing here.\nSecond line.');
    expect(r.structuredContent.error.code).toBe('ERR_NOT_CONFIGURED');
    // message defaults to the first line, not the whole blob
    expect(r.structuredContent.error.message).toBe('Nothing here.');
  });

  it('omits empty suggestions and details rather than emitting empty containers', () => {
    const e = toolError({ code: 'X', text: 'y' }).structuredContent.error;
    expect(e).not.toHaveProperty('suggestions');
    expect(e).not.toHaveProperty('details');
  });

  it('labels why each suggestion was offered', () => {
    expect(describeSuggestions('chunk', ['sanity.chunk']))
      .toEqual([{ value: 'sanity.chunk', reason: 'contains "chunk"' }]);
    expect(describeSuggestions('buton', ['button']))
      .toEqual([{ value: 'button', reason: 'similar spelling' }]);
  });

  it('notFoundError carries both the did-you-mean prose and the same names as data', () => {
    const r = notFoundError({
      label: 'Entity',
      input: 'buton',
      candidates: ['button', 'card'],
      listHint: '`dsds_list_entities`',
    });
    expect(r.structuredContent.error.code).toBe('ERR_UNKNOWN_ENTITY');
    expect(r.content[0].text).toContain('button');
    expect(r.structuredContent.error.suggestions.map(s => s.value)).toEqual(['button']);
  });

  it('accepts a caller-rendered message while still classifying it', () => {
    const r = notFoundError({
      label: 'Chunk', input: 'x', candidates: ['y'],
      code: ERROR_CODES.UNKNOWN_CHUNK, text: 'custom prose',
    });
    expect(r.content[0].text).toBe('custom prose');
    expect(r.structuredContent.error.code).toBe('ERR_UNKNOWN_CHUNK');
  });
});

describe('dsds_get_examples', () => {
  const entities = [
    { identifier: 'button', name: 'Button', kind: 'component' },
    { identifier: 'badge', name: 'Badge', kind: 'component', relationships: [{ relation: 'alternative-to', target: 'button' }] },
    {
      identifier: 'form-layout', name: 'Form layout', kind: 'sanity.chunk',
      relationships: [{ relation: 'composes', target: 'button', role: 'Submit action' }],
    },
    {
      identifier: 'data-table', name: 'Data table', kind: 'sanity.chunk',
      relationships: [{ relation: 'composes', target: 'button' }],
    },
  ];
  const graph = buildGraph(entities);
  const getGraph = () => graph;
  const getSummaries = () => [
    { identifier: 'data-table', summary: 'A table of rows.' },
  ];

  it('lists the chunks that compose the entity', async () => {
    const r = await getExamplesHandler({ identifier: 'button' }, getGraph, getSummaries);
    const ids = r.structuredContent.examples.map(e => e.identifier);
    expect(ids).toEqual(['data-table', 'form-layout']);
  });

  // An alternative-to edge is a relationship, not a worked example.
  it('excludes non-example relations and non-chunks', async () => {
    const r = await getExamplesHandler({ identifier: 'button' }, getGraph, getSummaries);
    expect(r.structuredContent.examples.map(e => e.identifier)).not.toContain('badge');
  });

  it('prefers the authored role over the generic summary', async () => {
    const r = await getExamplesHandler({ identifier: 'button' }, getGraph, getSummaries);
    const byId = Object.fromEntries(r.structuredContent.examples.map(e => [e.identifier, e]));
    expect(byId['form-layout'].role).toBe('Submit action');
    expect(r.content[0].text).toContain('Submit action');
    // data-table has no role, so its summary fills the column instead
    expect(r.content[0].text).toContain('A table of rows.');
  });

  it('gives every row a fetch call', async () => {
    const r = await getExamplesHandler({ identifier: 'button' }, getGraph, getSummaries);
    for (const e of r.structuredContent.examples) {
      expect(e.next).toBe(`dsds_get_chunk("${e.identifier}")`);
    }
  });

  it('says "no example yet", not "unused", when nothing composes it', async () => {
    const r = await getExamplesHandler({ identifier: 'badge' }, getGraph, getSummaries);
    expect(r.structuredContent.total).toBe(0);
    expect(r.content[0].text).toContain('not that it has no usage');
  });

  it('classifies an unknown identifier', async () => {
    const r = await getExamplesHandler({ identifier: 'buton' }, getGraph, getSummaries);
    expect(r.isError).toBe(true);
    expect(r.structuredContent.error.code).toBe('ERR_UNKNOWN_ENTITY');
    expect(r.structuredContent.error.suggestions.map(s => s.value)).toContain('button');
  });
});

describe('summaries are opt-in', () => {
  const entities = [
    { identifier: 'button', name: 'Button', kind: 'component', status: 'stable', summary: 'Triggers an action.', tags: [] },
    { identifier: 'card', name: 'Card', kind: 'component', status: 'stable', summary: 'A surface.', tags: [] },
  ];
  const getSystems = () => [{ entities }];
  const getSummaries = () => entities;

  it('list omits the summary column by default', async () => {
    const r = await listEntitiesHandler({}, getSystems, getSummaries);
    const t = r.content[0].text;
    expect(t).toContain('| Identifier | Status |');
    expect(t).not.toContain('Summary');
    expect(t).not.toContain('Triggers an action.');
  });

  it('list includes it on request', async () => {
    const r = await listEntitiesHandler({ summaries: true }, getSystems, getSummaries);
    expect(r.content[0].text).toContain('| Identifier | Status | Summary |');
    expect(r.content[0].text).toContain('Triggers an action.');
  });

  // The structured half has to follow the text, or an MCP client that reads
  // structuredContent pays the cost the rendered table just avoided.
  it('keeps structuredContent in step with the rendered table', async () => {
    const off = await listEntitiesHandler({}, getSystems, getSummaries);
    const on = await listEntitiesHandler({ summaries: true }, getSystems, getSummaries);
    expect(off.structuredContent.entities[0]).not.toHaveProperty('summary');
    expect(on.structuredContent.entities[0]).toHaveProperty('summary', 'Triggers an action.');
  });

  it('only the literal true turns it on, not any truthy value', async () => {
    const r = await listEntitiesHandler({ summaries: 'yes' }, getSystems, getSummaries);
    expect(r.content[0].text).not.toContain('Summary');
  });

  it('search omits summaries by default but keeps the Next column', async () => {
    const r = await searchEntitiesHandler({ query: 'button' }, getSystems, getSummaries);
    const t = r.content[0].text;
    expect(t).toContain('| Identifier | Kind | Status | Next |');
    expect(t).not.toContain('Triggers an action.');
    expect(t).toContain('dsds_get_agent_context("button")');
  });

  it('search includes summaries on request', async () => {
    const r = await searchEntitiesHandler({ query: 'button', summaries: true }, getSystems, getSummaries);
    expect(r.content[0].text).toContain('| Identifier | Kind | Status | Summary | Next |');
    expect(r.structuredContent.entities[0]).toHaveProperty('summary');
  });
});
