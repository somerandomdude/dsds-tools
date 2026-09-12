import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfigured } from '../setup-guidance.js';
import { nextCommandFor } from '../next-command.js';
import { renderTable } from '../render/table.js';

export const listEntitiesDef = {
  name: 'dsds_list_entities',
  description:
    'List every entity across your loaded DSDS files with its identifier, status and a one-line summary. ' +
    'This is the whole catalogue and it does not change during a session — call it ONCE, keep the result, and look entities up directly from then on. ' +
    'Pass summaries:false for a bare identifier index. Use dsds_search_entities to filter, or dsds_get_entity for full detail.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum entities to list per kind. Omit for all of them.',
      },
      nextCommands: {
        type: 'boolean',
        description:
          'Append the follow-up call that reads each result in full. Default false. Measured 2026-09-10: with this on, the agent treated the listing as a worklist and made 13% more dsds_get_agent_context calls, adding ~30k characters per iteration against the ~12k the listing itself saves. Turn it on for an interactive session where the next command is a convenience, not for an agent loop.',
      },
      summaries: {
        type: 'boolean',
        description:
          'Include a one-line summary per entity. Default TRUE. The summary is what lets you decide which entities you need without opening each one; measured 2026-09-10, dropping it saved ~12k characters here and cost ~30k in extra dsds_get_agent_context calls. Pass false only when you already know the identifier you want.',
      },
    },
  },
};

export async function listEntitiesHandler(args, getSystems, getSummaries, format = 'markdown') {
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
  // On by default, and deliberately so after measuring both ways. Summaries
  // do cost: +163% on this call (6,752 -> 17,788 chars on the 199-entity
  // Sanity UI document). But they were switched OFF for the 23.10 run and
  // the saving reversed — agent-context calls rose 23.8 -> 27.0 per
  // iteration (+30,354 chars) against the 11,775 saved here, a net LOSS of
  // ~19k, and lookups that never reached the final code went 7% -> 17%.
  // The summary is doing triage work; without it the only way to learn what
  // an entity is, is to open it.
  const withSummaries = args?.summaries !== false;
  // Off by default. The per-kind "Read one:" line reads as an instruction
  // rather than a label — it sits beside 199 identifiers and names the
  // command that expands one, which turned the index into a worklist. See
  // the `nextCommands` input description for the measurement.
  const withNext = args?.nextCommands === true;
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
    if (withNext) {
      const next = nextCommandFor({ identifier: '<identifier>', kind });
      if (next) lines.push(`Read one: ${next}`, '');
    }
    // Name column dropped — it is almost always the identifier in title case
    // (button → Button), so it doubled the table width for no information.
    const cols = [{ key: 'identifier', header: 'Identifier' }, { key: 'status', header: 'Status' }];
    if (withSummaries) cols.push({ key: 'summary', header: 'Summary' });
    const tableRows = shown.map(e => ({
      identifier: `\`${e.identifier}\``,
      status: e.status ?? null,
      summary: truncate(e.summary ?? '', 60),
    }));
    if (shown.length < entities.length) {
      tableRows.push({ identifier: `_…${entities.length - shown.length} more_`, status: '', summary: '' });
    }
    lines.push(...renderTable(tableRows, cols, { format, name: toonName(kind) }).split('\n'));
    lines.push('');
  }

  if (omitted > 0) lines.push(`_${omitted} entities hidden by \`limit\`._`, '');

  // A complete catalogue is worth saying is complete. Observed 2026-09-10:
  // one iteration in five called this twice in the same session and got a
  // byte-identical 6–18k answer the second time. The catalogue is loaded at
  // startup and cannot change mid-session, so a re-read can only ever
  // return the same thing — which the caller has no way to know unless the
  // response says so. Only claimed when nothing was hidden: with `limit`
  // set, calling again with a higher limit is a legitimate next step.
  if (omitted === 0) {
    lines.push(
      `> This is the complete catalogue — all ${summaries.length} entities, and it does not change while this server is running. ` +
      'Keep it; calling this tool again returns exactly the same text. ' +
      'To go deeper, look an identifier up directly rather than re-listing.',
      ''
    );
  }

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
        ...(withNext ? { next: nextCommandFor(e) } : {}),
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

// TOON names the array; the kind is the honest name for a per-kind group.
function toonName(kind) {
  return String(kind ?? 'entities').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entities';
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
