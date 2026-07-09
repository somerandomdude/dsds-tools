import { ENTITY_KINDS } from '../spec/knowledge.js';
import { getUpdateNotice } from '../spec/version.js';

export const searchEntitiesDef = {
  name: 'dsds_search_entities',
  description:
    'Search and filter entities across your DSDS files. All parameters are optional — omit any to skip that filter.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ENTITY_KINDS,
        description: 'Filter by entity kind.',
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
        description: 'Case-insensitive text search across identifier, name, and summary.',
      },
    },
  },
};

export async function searchEntitiesHandler(args, getSystems, getSummaries) {
  if (getSystems().length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'No DSDS files configured. Set the `DSDS_PATHS` environment variable.' }],
    };
  }

  const { kind, status, tags, query } = args ?? {};
  let results = getSummaries();

  if (kind) results = results.filter(e => e.kind === kind);
  if (status) results = results.filter(e => e.status === status);
  if (tags?.length) results = results.filter(e => tags.every(t => e.tags.includes(t)));
  if (query) {
    const needle = query.toLowerCase();
    results = results.filter(
      e =>
        e.identifier.toLowerCase().includes(needle) ||
        (e.name ?? '').toLowerCase().includes(needle) ||
        (e.summary ?? '').toLowerCase().includes(needle)
    );
  }

  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No entities matched the given filters.' }] };
  }

  const filterDesc = [
    kind && `kind=${kind}`,
    status && `status=${status}`,
    tags?.length && `tags=[${tags.join(', ')}]`,
    query && `query="${query}"`,
  ].filter(Boolean).join(', ');

  const lines = [
    `# Search Results${filterDesc ? ` (${filterDesc})` : ''} — ${results.length} found`,
    '',
    '| Identifier | Kind | Status | Summary |',
    '|------------|------|--------|---------|',
    ...results.map(e =>
      `| \`${e.identifier}\` | ${e.kind} | ${e.status ?? '—'} | ${truncate(e.summary ?? '', 80)} |`
    ),
  ];

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
