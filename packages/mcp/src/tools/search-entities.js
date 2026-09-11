import { getUpdateNotice } from '../spec/version.js';
import { didYouMean } from '../suggest.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';

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
    },
  },
};

export async function searchEntitiesHandler(args, getSystems, getSummaries) {
  if (getSystems().length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfiguredBrief() }],
    };
  }

  const { kind, status, tags, query, limit } = args ?? {};
  const all = getSummaries();
  let results = all;

  // An unknown kind or status used to return the same "no matches" as a
  // genuinely empty result, so a typo looked like an answer. Name the
  // mistake and list what is actually there.
  if (kind) {
    const kinds = [...new Set(all.map(e => e.kind).filter(Boolean))].sort();
    if (!kinds.includes(kind)) return unknownFilter('kind', kind, kinds);
    results = results.filter(e => e.kind === kind);
  }
  if (status) {
    const statuses = [...new Set(all.map(e => e.status).filter(Boolean))].sort();
    if (!statuses.includes(status)) return unknownFilter('status', status, statuses);
    results = results.filter(e => e.status === status);
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
    kind && `kind=${kind}`,
    status && `status=${status}`,
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
    '| Identifier | Kind | Status | Summary |',
    '|------------|------|--------|---------|',
    ...results.map(e =>
      `| \`${e.identifier}\` | ${e.kind ?? '—'} | ${e.status ?? '—'} | ${truncate(e.summary ?? '', 80)} |`
    ),
  ];
  if (shown < total) lines.push('', `_${total - shown} more — raise \`limit\` to see them._`);

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      total,
      shown,
      filters: { kind, status, tags, query, limit },
      entities: results.map(toStructured),
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

function toStructured(e) {
  return {
    identifier: e.identifier,
    name: e.name,
    kind: e.kind ?? null,
    status: e.status ?? null,
    summary: e.summary ?? null,
    tags: e.tags ?? [],
  };
}

function unknownFilter(field, value, valid) {
  const suggestions = didYouMean(value, valid);
  const lines = [`Unknown ${field} "${value}".`];
  if (suggestions.length > 0) lines.push('', `Did you mean: ${suggestions.map(s => `\`${s}\``).join(', ')}?`);
  lines.push('', `Available ${field}s: ${valid.map(v => `\`${v}\``).join(', ')}`);
  return { isError: true, content: [{ type: 'text', text: lines.join('\n') }] };
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
