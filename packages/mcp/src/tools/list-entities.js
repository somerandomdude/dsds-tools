import { getUpdateNotice } from '../spec/version.js';

export const listEntitiesDef = {
  name: 'dsds_list_entities',
  description:
    'List all entities across your loaded DSDS files with identifier, kind, status, and summary. Use dsds_search_entities to filter, or dsds_get_entity to retrieve full detail.',
  inputSchema: { type: 'object', properties: {} },
};

export async function listEntitiesHandler(_args, getSystems, getSummaries) {
  if (getSystems().length === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: [
          '## No DSDS files configured',
          '',
          'Set `DSDS_PATHS` in your MCP client config `env` block:',
          '',
          '```json',
          '"env": { "DSDS_PATHS": "/absolute/path/to/design-system.dsds.json" }',
          '```',
          '',
          'Multiple files: `DSDS_PATHS=/path/a.dsds.json,/path/b.dsds.json`',
          '',
          '**Common mistakes:**',
          '- Path starts with `~` — use the full absolute path instead (e.g. `/Users/you/...`)',
          '- Path is relative — only absolute paths are supported',
          '- `env` block is missing from the MCP server config',
          '',
          'Check the MCP server stderr logs for a startup message that confirms what loaded.',
          '',
          'Spec tools (`dsds_spec_overview`, `dsds_spec_scaffold`, `dsds_validate`) are always available without configuration.',
        ].join('\n'),
      }],
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

  const lines = [`# Design System Entities (${summaries.length} total)`, ''];

  for (const [kind, entities] of Object.entries(byKind)) {
    lines.push(`## ${capitalize(kind)}s (${entities.length})`, '');
    // Name column dropped — it is almost always the identifier in title case
    // (button → Button), so it doubled the table width for no information.
    lines.push('| Identifier | Status | Summary |');
    lines.push('|------------|--------|---------|');
    for (const e of entities) {
      lines.push(`| \`${e.identifier}\` | ${e.status ?? '—'} | ${truncate(e.summary ?? '', 60)} |`);
    }
    lines.push('');
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
