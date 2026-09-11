import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfigured } from '../setup-guidance.js';
import { nextCommandFor } from '../next-command.js';

export const listEntitiesDef = {
  name: 'dsds_list_entities',
  description:
    'List all entities across your loaded DSDS files with identifier, kind and status. This is an INDEX — it answers "what exists and what is it called", not "what does it do". ' +
    'Pass summaries:true to add a one-line summary per entity, which roughly triples the response. Use dsds_search_entities to filter, or dsds_get_entity for full detail.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum entities to list per kind. Omit for all of them.',
      },
      summaries: {
        type: 'boolean',
        description:
          'Include a one-line summary per entity. Default false. On a 199-entity corpus this takes the response from ~6.7k to ~17.8k characters, so ask for it only when browsing by what things DO rather than looking up a name.',
      },
    },
  },
};

export async function listEntitiesHandler(args, getSystems, getSummaries) {
  if (getSystems().length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfigured() }],
    };
  }

  const summaries = getSummaries();
  if (summaries.length === 0) {
    return { content: [{ type: 'text', text: 'No entities found in the loaded DSDS files.' }] };
  }

  const byKind = {};
  for (const s of summaries) {
    (byKind[s.kind] ??= []).push(s);
  }

  const limit = args?.limit;
  // Off by default. Every entity in this corpus has a description, so the
  // summary column is never empty and never cheap: measured 2026-09-10 on
  // the 199-entity Sanity UI document, including it takes one call from
  // 6,752 to 17,788 characters (+163%). A list is overwhelmingly used to
  // find an identifier, and the follow-up call that reads the entity
  // carries the same prose anyway — so the default pays that cost twice.
  const withSummaries = args?.summaries === true;
  const lines = [`# Design System Entities (${summaries.length} total)`, ''];
  let omitted = 0;

  for (const [kind, entities] of Object.entries(byKind)) {
    const shown = limit > 0 ? entities.slice(0, limit) : entities;
    omitted += entities.length - shown.length;
    lines.push(`## ${humanizeKindPlural(kind)} (${entities.length})`, '');
    // The call that reads one of these, stated once per group rather than
    // per row. Every entity in a group shares a kind and therefore a next
    // call, so a column would repeat one string up to 199 times — the
    // grouping already carries the information a column would.
    const next = nextCommandFor({ identifier: '<identifier>', kind });
    if (next) lines.push(`Read one: ${next}`, '');
    // Name column dropped — it is almost always the identifier in title case
    // (button → Button), so it doubled the table width for no information.
    lines.push(withSummaries ? '| Identifier | Status | Summary |' : '| Identifier | Status |');
    lines.push(withSummaries ? '|------------|--------|---------|' : '|------------|--------|');
    for (const e of shown) {
      lines.push(withSummaries
        ? `| \`${e.identifier}\` | ${e.status ?? '—'} | ${truncate(e.summary ?? '', 60)} |`
        : `| \`${e.identifier}\` | ${e.status ?? '—'} |`);
    }
    if (shown.length < entities.length) {
      lines.push(withSummaries ? `| _…${entities.length - shown.length} more_ | | |` : `| _…${entities.length - shown.length} more_ | |`);
    }
    lines.push('');
  }

  if (omitted > 0) lines.push(`_${omitted} entities hidden by \`limit\`._`, '');

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      total: summaries.length,
      kinds: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k ?? 'uncategorized', v.length])),
      entities: summaries.map(e => ({
        identifier: e.identifier,
        name: e.name,
        kind: e.kind ?? null,
        status: e.status ?? null,
        // Mirrors the rendered table: omitted unless asked for, so the
        // structured half cannot quietly re-add what the text just saved.
        ...(withSummaries ? { summary: e.summary ?? null } : {}),
        tags: e.tags ?? [],
        next: nextCommandFor(e),
      })),
    },
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// A real 0.20.0 namespaced kind (e.g. "sanity.chunk") naively capitalized +
// pluralized reads as "Sanity.chunks" — replace the dot with a space first
// so it reads as "Sanity chunks".
function humanizeKindPlural(kind) {
  // An entity with no kind was rendered as the heading "Undefineds".
  if (!kind || kind === 'undefined') return 'Uncategorized';
  const humanized = capitalize(kind.replace(/\./g, ' '));
  // Standard English pluralization: "entry" -> "entries", not "entrys".
  return /[^aeiou]y$/i.test(humanized) ? `${humanized.slice(0, -1)}ies` : `${humanized}s`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
