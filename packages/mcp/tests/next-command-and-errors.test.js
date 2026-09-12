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

  it('omits the fetch column by default', async () => {
    const r = await getExamplesHandler({ identifier: 'button' }, getGraph, getSummaries);
    expect(r.content[0].text).toContain('| Example | Demonstrates |');
    expect(r.content[0].text).not.toContain('Fetch');
    for (const e of r.structuredContent.examples) expect(e).not.toHaveProperty('next');
  });

  it('gives every row a fetch call on request', async () => {
    const r = await getExamplesHandler({ identifier: 'button', nextCommands: true }, getGraph, getSummaries);
    expect(r.content[0].text).toContain('| Example | Demonstrates | Fetch |');
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

  it('list includes the summary column by default', async () => {
    const r = await listEntitiesHandler({}, getSystems, getSummaries);
    const t = r.content[0].text;
    expect(t).toContain('| Identifier | Status | Summary |');
    expect(t).toContain('Triggers an action.');
  });

  it('list drops it when summaries is explicitly false', async () => {
    const r = await listEntitiesHandler({ summaries: false }, getSystems, getSummaries);
    const t = r.content[0].text;
    expect(t).toContain('| Identifier | Status |');
    expect(t).not.toContain('Summary');
  });

  // The structured half has to follow the text, or an MCP client that reads
  // structuredContent pays the cost the rendered table just avoided.
  it('keeps structuredContent in step with the rendered table', async () => {
    const off = await listEntitiesHandler({ summaries: false }, getSystems, getSummaries);
    const on = await listEntitiesHandler({}, getSystems, getSummaries);
    expect(off.structuredContent.entities[0]).not.toHaveProperty('summary');
    expect(on.structuredContent.entities[0]).toHaveProperty('summary', 'Triggers an action.');
  });

  // Only an explicit `false` turns it off — a stray truthy/absent value
  // must not silently strip the column the default promises.
  it('only an explicit false turns summaries off', async () => {
    for (const args of [{}, { summaries: true }, { summaries: 'no' }, { summaries: undefined }]) {
      const r = await listEntitiesHandler(args, getSystems, getSummaries);
      expect(r.content[0].text, JSON.stringify(args)).toContain('Summary');
    }
  });

  it('says the catalogue is complete, and not when limit hides rows', async () => {
    const all = await listEntitiesHandler({}, getSystems, getSummaries);
    expect(all.content[0].text).toContain('This is the complete catalogue');
    const capped = await listEntitiesHandler({ limit: 1 }, getSystems, getSummaries);
    expect(capped.content[0].text).not.toContain('This is the complete catalogue');
  });

  it('search omits both summaries and next commands by default', async () => {
    const r = await searchEntitiesHandler({ query: 'button' }, getSystems, getSummaries);
    const t = r.content[0].text;
    expect(t).toContain('| Identifier | Kind | Status |');
    expect(t).not.toContain('Summary');
    expect(t).not.toContain('Next');
    expect(t).not.toContain('dsds_get_agent_context');
    expect(r.structuredContent.entities[0]).not.toHaveProperty('next');
  });

  it('search includes summaries on request', async () => {
    const r = await searchEntitiesHandler({ query: 'button', summaries: true }, getSystems, getSummaries);
    expect(r.content[0].text).toContain('| Identifier | Kind | Status | Summary |');
    expect(r.structuredContent.entities[0]).toHaveProperty('summary');
  });

  // The two flags are independent, and the column order has to stay stable
  // whichever combination is asked for.
  it('search renders every flag combination with matching columns', async () => {
    const cases = [
      [{}, '| Identifier | Kind | Status |'],
      [{ summaries: true }, '| Identifier | Kind | Status | Summary |'],
      [{ nextCommands: true }, '| Identifier | Kind | Status | Next |'],
      [{ summaries: true, nextCommands: true }, '| Identifier | Kind | Status | Summary | Next |'],
    ];
    for (const [args, header] of cases) {
      const r = await searchEntitiesHandler({ query: 'button', ...args }, getSystems, getSummaries);
      const lines = r.content[0].text.split('\n');
      const h = lines.find(l => l.startsWith('| Identifier'));
      expect(h, JSON.stringify(args)).toBe(header);
      // divider column count must match the header's
      const divider = lines[lines.indexOf(h) + 1];
      expect(divider.split('|').length).toBe(h.split('|').length);
    }
  });

  it('list omits the Read one: line by default and adds it on request', async () => {
    const off = await listEntitiesHandler({}, getSystems, getSummaries);
    const on = await listEntitiesHandler({ nextCommands: true }, getSystems, getSummaries);
    expect(off.content[0].text).not.toContain('Read one:');
    expect(on.content[0].text).toContain('Read one: dsds_get_agent_context("<identifier>")');
    expect(off.structuredContent.entities[0]).not.toHaveProperty('next');
    expect(on.structuredContent.entities[0]).toHaveProperty('next');
  });
});
