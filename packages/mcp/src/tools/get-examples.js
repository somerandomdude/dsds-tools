// Worked examples for one entity, as an index rather than a wall of code.
//
// The examples for a component already exist — chunks are the pre-assembled,
// runnable code in this system — and the graph already knows which chunks
// compose which component. What was missing was the question "show me this
// component being used", answered without paying for the answer up front.
//
// The two existing routes both fail at that. `dsds_get_dependents button`
// answers a different question (blast radius) and mixes 9 chunks in with
// `alternative-to` edges to other components, which are not examples of
// anything. `dsds_get_chunk` returns one chunk in full — the right call once
// you know WHICH chunk, and an expensive way to browse: reading all 9 of
// button's chunks costs about 40k characters to find the one you wanted.
//
// So this returns the index: each example's identifier, what it is, the
// authored role explaining why this component appears in it, and the call
// that fetches it. Then one targeted dsds_get_chunk instead of nine.

import { dependents } from '../graph.js';
import { getUpdateNotice } from '../spec/version.js';
import { notFoundMessage } from '../suggest.js';
import { didYouMean } from '../suggest.js';
import { nextCommandFor } from '../next-command.js';
import { ERROR_CODES, describeSuggestions, toolError } from '../errors.js';

// `composes` is the authored relation for "this chunk is built out of that
// component". Other incoming relations (alternative-to, replaces) describe
// how entities relate to each other, not a worked example of one, so they
// are deliberately excluded rather than filtered in the renderer.
const EXAMPLE_RELATIONS = new Set(['composes', 'depends-on', 'part-of']);

function isChunk(kind) {
  const raw = String(kind ?? '').toLowerCase();
  return raw === 'chunk' || raw.endsWith('.chunk');
}

export const getExamplesDef = {
  name: 'dsds_get_examples',
  description:
    'List the worked examples that use this entity — the chunks whose code composes it — as an index, not their code. ' +
    'Each row names the example, what it demonstrates, and the call that fetches it, so you can pick one and fetch only that. ' +
    'Use this to see a component in real usage; use dsds_get_chunk for the code of one example, and dsds_get_dependents for blast radius.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The entity identifier (e.g. "button").',
      },
    },
    required: ['identifier'],
  },
};

export async function getExamplesHandler({ identifier }, getGraph, getSummaries) {
  const graph = getGraph();

  if (!graph.nodes.has(identifier)) {
    const candidates = [...graph.nodes.keys()];
    const matches = didYouMean(identifier, candidates);
    return toolError({
      code: ERROR_CODES.UNKNOWN_ENTITY,
      text: notFoundMessage({
        label: 'Entity',
        input: identifier,
        candidates,
        listHint: '`dsds_list_entities`',
      }),
      message: `Entity "${identifier}" not found.`,
      suggestions: describeSuggestions(identifier, matches),
      details: { input: identifier },
    });
  }

  // Summaries carry the one-line description the graph nodes don't.
  const summaryById = new Map(
    (getSummaries?.() ?? []).map(e => [e.identifier, e.summary])
  );

  const examples = dependents(graph, identifier, { transitive: false })
    .filter(e => isChunk(e.kind) && EXAMPLE_RELATIONS.has(e.via ?? e.relation))
    .map(e => ({
      identifier: e.identifier,
      name: e.name ?? e.identifier,
      kind: e.kind ?? null,
      // The authored reason this entity appears in that example
      // ("Toolbar actions and sidebar toggle"). Often absent; when it is
      // present it is the most useful column here, because it is the only
      // one written about this pairing specifically.
      role: e.role ?? null,
      summary: summaryById.get(e.identifier) ?? null,
      next: nextCommandFor(e),
    }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));

  const node = graph.nodes.get(identifier);
  const lines = [`# Examples using \`${identifier}\``, ''];

  if (examples.length === 0) {
    lines.push(
      `No chunk composes \`${identifier}\`.`,
      '',
      // A bare "none" invites the conclusion that the component is unused,
      // which is usually wrong — most entities simply have no chunk yet.
      `That means no pre-assembled example exists for it yet, not that it has no usage. ` +
      `Try dsds_get_agent_context(${identifier}) for its own guidelines and code, ` +
      `or dsds_get_dependents(${identifier}) for everything that references it.`
    );
  } else {
    lines.push(
      `${examples.length} example${examples.length === 1 ? '' : 's'} — fetch one with the call in the last column, not all of them.`,
      '',
      '| Example | Demonstrates | Fetch |',
      '|---------|--------------|-------|',
      ...examples.map(e => {
        const what = e.role ?? truncate(e.summary ?? '', 70);
        return `| \`${e.identifier}\` | ${what || '—'} | ${e.next} |`;
      })
    );
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      identifier,
      name: node?.name ?? identifier,
      total: examples.length,
      examples,
    },
  };
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
