import { getUpdateNotice } from '../spec/version.js';
import { didYouMean } from '../suggest.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { nextCommandFor } from '../next-command.js';
import { renderTable } from '../render/table.js';
import { ERROR_CODES, describeSuggestions, toolError } from '../errors.js';

export const searchEntitiesDef = {
  name: 'dsds_search_entities',
  description:
    'Search and filter entities across your DSDS files. All parameters are optional — omit any to skip that filter.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description:
          'Filter by entity kind. Legacy kinds: component, guide, pattern, foundation, theme, token, ' +
          'token-group, chunk. Real 0.20.0 kinds: component, token, theme, system, entry, or a namespaced ' +
          'custom kind (e.g. "sanity.guide", "sanity.chunk") — check dsds_list_entities for the kinds actually loaded.',
      },
      status: {
        type: 'string',
        enum: ['draft', 'experimental', 'stable', 'deprecated'],
        description: 'Filter by lifecycle status.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to entities that have ALL of the given tags.',
      },
      query: {
        type: 'string',
        description:
          'Case-insensitive text search across identifier, name, summary, kind, and tags. ' +
          'Multi-word queries match entities containing every word, in any field and any order ' +
          '("primary button", "confirmation dialog").',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results to return. Omit for all matches.',
      },
      nextCommands: {
        type: 'boolean',
        description:
          'Append the follow-up call that reads each result in full. Default false. Measured 2026-09-10: with this on, the agent treated the listing as a worklist and made 13% more dsds_get_agent_context calls, adding ~30k characters per iteration against the ~12k the listing itself saves. Turn it on for an interactive session where the next command is a convenience, not for an agent loop.',
      },
      summaries: {
        type: 'boolean',
        description:
          'Include a one-line summary per result. Default false. Summaries are the single largest part of a result row, so leave this off when you are resolving a name and turn it on when you are deciding between candidates.',
      },
    },
  },
};

export async function searchEntitiesHandler(args, getSystems, getSummaries, format = 'markdown') {
  if (getSystems().length === 0) {
    return toolError({
      code: ERROR_CODES.NOT_CONFIGURED,
      text: noDocumentsConfiguredBrief(),
      message: 'No DSDS files configured.',
    });
  }

  const { kind, status, tags, query, limit } = args ?? {};
  // Default off, for the same reason as dsds_list_entities — see the note
  // on `withSummaries` there. Search rows are fewer, so the saving is
  // smaller in absolute terms, but the judgement is identical: the caller
  // is usually resolving a name, and the next call carries the prose.
  const withSummaries = args?.summaries === true;
  // Off by default — see the note in dsds_list_entities' handler.
  const withNext = args?.nextCommands === true;
  const all = getSummaries();
  let results = all;

  // An unknown kind or status used to return the same "no matches" as a
  // genuinely empty result, so a typo looked like an answer. Name the
  // mistake and list what is actually there.
  // A filter value the tool can already name the correction for is accepted
  // rather than rejected. `--kind components` and `--kind sanity.chunks`
  // were 23 of the 55 failed calls in the 2026-09-11 runs: the plural of a
  // real kind, diagnosed correctly ("Did you mean `component`?") and then
  // refused, costing a turn to retype what the tool had just worked out.
  // Only an unambiguous single candidate is corrected; two or more and the
  // caller still has a real choice to make, so it stays an error.
  const notes = [];
  const coerced = (field, value, valid) => {
    if (valid.includes(value)) return value;
    const near = didYouMean(value, valid);
    if (near.length !== 1) return null;
    notes.push(`Read \`${field}=${value}\` as \`${near[0]}\`.`);
    return near[0];
  };

  let kindFilter = kind;
  if (kind) {
    const kinds = [...new Set(all.map(e => e.kind).filter(Boolean))].sort();
    kindFilter = coerced('kind', kind, kinds);
    if (kindFilter === null) return unknownFilter('kind', kind, kinds);
    results = results.filter(e => e.kind === kindFilter);
  }
  let statusFilter = status;
  if (status) {
    const statuses = [...new Set(all.map(e => e.status).filter(Boolean))].sort();
    statusFilter = coerced('status', status, statuses);
    if (statusFilter === null) return unknownFilter('status', status, statuses);
    results = results.filter(e => e.status === statusFilter);
  }
  if (tags?.length) results = results.filter(e => tags.every(t => e.tags.includes(t)));

  // Every word must appear somewhere in the entity, in any field and any
  // order. A single substring match over the whole query meant the most
  // natural thing anyone types — "primary button" — always returned nothing.
  const terms = tokenize(query);
  if (terms.length > 0) {
    results = results
      .map(e => ({ entity: e, score: scoreEntity(e, terms) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || a.entity.identifier.localeCompare(b.entity.identifier))
      .map(r => r.entity);
  }

  const total = results.length;
  if (limit !== undefined && limit > 0) results = results.slice(0, limit);

  const filterDesc = [
    kindFilter && `kind=${kindFilter}`,
    statusFilter && `status=${statusFilter}`,
    tags?.length && `tags=[${tags.join(', ')}]`,
    query && `query="${query}"`,
  ].filter(Boolean).join(', ');

  if (total === 0) {
    return { content: [{ type: 'text', text: noMatches(query, terms, all, filterDesc) }] };
  }

  const shown = results.length;
  const heading =
    shown < total
      ? `# Search Results${filterDesc ? ` (${filterDesc})` : ''} — showing ${shown} of ${total}`
      : `# Search Results${filterDesc ? ` (${filterDesc})` : ''} — ${total} found`;

  const lines = [
    heading,
    '',
    ...renderTable(
      results.map(e => ({
        identifier: `\`${e.identifier}\``,
        kind: e.kind ?? null,
        status: e.status ?? null,
        summary: truncate(e.summary ?? '', 80),
        next: nextCommandFor(e),
      })),
      searchColumns(withSummaries, withNext),
      { format, name: 'results' }
    ).split('\n'),
  ];
  if (shown < total) lines.push('', `_${total - shown} more — raise \`limit\` to see them._`);

  // Say what was assumed. A silent correction is worse than an error: the
  // caller cannot tell it asked for something that does not exist.
  if (notes.length) lines.push('', `> ${notes.join(' ')}`);

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      total,
      shown,
      filters: { kind: kindFilter, status: statusFilter, tags, query, limit },
      ...(notes.length ? { corrections: notes } : {}),
      entities: results.map(e => toStructured(e, withSummaries, withNext)),
    },
  };
}

export function tokenize(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

// Higher is better. Weighted so an identifier hit outranks a passing mention
// in a description, and an exact identifier match outranks everything.
function scoreEntity(entity, terms) {
  const identifier = (entity.identifier ?? '').toLowerCase();
  const name = (entity.name ?? '').toLowerCase();
  const summary = (entity.summary ?? '').toLowerCase();
  const kind = (entity.kind ?? '').toLowerCase();
  const tags = (entity.tags ?? []).map(t => String(t).toLowerCase());

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (identifier === term) termScore = 100;
    else if (identifier.includes(term)) termScore = 40;
    else if (name.toLowerCase().includes(term)) termScore = 30;
    else if (tags.some(t => t.includes(term))) termScore = 20;
    else if (summary.includes(term)) termScore = 10;
    else if (kind.includes(term)) termScore = 5;

    // Every term must land somewhere, or this is not a match at all.
    if (termScore === 0) return 0;
    score += termScore;
  }
  return score;
}

function searchColumns(withSummaries, withNext) {
  const cols = [
    { key: 'identifier', header: 'Identifier' },
    { key: 'kind', header: 'Kind' },
    { key: 'status', header: 'Status' },
  ];
  if (withSummaries) cols.push({ key: 'summary', header: 'Summary' });
  if (withNext) cols.push({ key: 'next', header: 'Next' });
  return cols;
}

function toStructured(e, withSummaries = false, withNext = false) {
  return {
    identifier: e.identifier,
    name: e.name,
    kind: e.kind ?? null,
    status: e.status ?? null,
    ...(withSummaries ? { summary: e.summary ?? null } : {}),
    tags: e.tags ?? [],
    // The call that reads this row in full. See next-command.js — emitted
    // canonically here; the CLI surface rewrites it to `dsds chunk <id>`.
    ...(withNext ? { next: nextCommandFor(e) } : {}),
  };
}

function unknownFilter(field, value, valid) {
  const suggestions = didYouMean(value, valid);
  const lines = [`Unknown ${field} "${value}".`];
  if (suggestions.length > 0) lines.push('', `Did you mean: ${suggestions.map(s => `\`${s}\``).join(', ')}?`);
  lines.push('', `Available ${field}s: ${valid.map(v => `\`${v}\``).join(', ')}`);
  return toolError({
    code: ERROR_CODES.UNKNOWN_FILTER,
    text: lines.join('\n'),
    message: `Unknown ${field} "${value}".`,
    suggestions: describeSuggestions(value, suggestions),
    details: { field, input: value, valid },
  });
}

// A dead end should say which part of the query killed it, and offer a way on.
function noMatches(query, terms, all, filterDesc) {
  const lines = [`No entities matched${filterDesc ? ` (${filterDesc})` : ' the given filters'}.`];

  if (terms.length > 1) {
    // Which individual words did match? That tells the user which one to drop.
    const productive = terms.filter(t => all.some(e => scoreEntity(e, [t]) > 0));
    const dead = terms.filter(t => !productive.includes(t));
    if (dead.length > 0) {
      lines.push('', `No entity mentions ${dead.map(t => `"${t}"`).join(' or ')}.`);
    }
    if (productive.length > 0 && productive.length < terms.length) {
      lines.push(`Try a narrower query: \`${productive.join(' ')}\`.`);
    }
  } else if (terms.length === 1) {
    const near = didYouMean(terms[0], all.map(e => e.identifier));
    if (near.length > 0) {
      lines.push('', `Did you mean: ${near.map(n => `\`${n}\``).join(', ')}?`);
    }
  }

  lines.push('', 'Run `dsds_list_entities` to see everything available.');
  return lines.join('\n');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
