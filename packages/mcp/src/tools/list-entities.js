import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfigured } from '../setup-guidance.js';

export const listEntitiesDef = {
  name: 'dsds_list_entities',
  description:
    'List all entities across your loaded DSDS files with identifier, kind, status, and summary. Use dsds_search_entities to filter, or dsds_get_entity to retrieve full detail.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum entities to list per kind. Omit for all of them.',
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
  const lines = [`# Design System Entities (${summaries.length} total)`, ''];
  let omitted = 0;

  for (const [kind, entities] of Object.entries(byKind)) {
    const shown = limit > 0 ? entities.slice(0, limit) : entities;
    omitted += entities.length - shown.length;
    lines.push(`## ${humanizeKindPlural(kind)} (${entities.length})`, '');
    // Name column dropped — it is almost always the identifier in title case
    // (button → Button), so it doubled the table width for no information.
    lines.push('| Identifier | Status | Summary |');
    lines.push('|------------|--------|---------|');
    for (const e of shown) {
      lines.push(`| \`${e.identifier}\` | ${e.status ?? '—'} | ${truncate(e.summary ?? '', 60)} |`);
    }
    if (shown.length < entities.length) {
      lines.push(`| _…${entities.length - shown.length} more_ | | |`);
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
        summary: e.summary ?? null,
        tags: e.tags ?? [],
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
