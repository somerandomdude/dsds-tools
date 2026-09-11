import { getUpdateNotice } from '../spec/version.js';
import { notFoundMessage } from '../suggest.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { renderApi20, renderCombos20, renderExtensions20, renderSections20, renderSourceAndImports20, renderTraits20 } from '../spec/render-0.20.0.js';
import { resolveStatusDisplay20 } from '../spec/dsds20-lib.js';
import { ERROR_CODES, notFoundError, toolError } from '../errors.js';

export const getEntityDef = {
  name: 'dsds_get_entity',
  description:
    'Get the full documentation for a specific entity by its identifier or name. Returns all metadata and documentBlocks. Use dsds_get_document_block if you only need one section.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The entity identifier (e.g. "button") or name (e.g. "Button"). Case-insensitive.',
      },
    },
    required: ['identifier'],
  },
};

export async function getEntityHandler({ identifier }, getSystems, getSummaries, getIntro = null, getGraph = null, propsConfig = null) {
  const systems = getSystems();
  const introEntities = getIntro ? getIntro() : [];
  if (systems.length === 0 && introEntities.length === 0) {
    return toolError({
      code: ERROR_CODES.NOT_CONFIGURED,
      text: noDocumentsConfiguredBrief(),
      message: 'No DSDS files configured.',
    });
  }

  const needle = identifier.toLowerCase();
  let found = null;
  let foundFilePath = null;

  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) { found = entity; foundFilePath = system.filePath; break; }
  }

  // Fall back to intro entities (loaded outside the queried systems) so the
  // compact-index pointer in the instructions resolves to real content.
  if (!found) {
    const intro = introEntities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (intro) { found = intro; foundFilePath = '(intro guide)'; }
  }

  if (!found) {
    return notFoundError({
      label: 'Entity',
      input: identifier,
      candidates: getSummaries().map(s => s.identifier),
      listHint: '`dsds_list_entities`',
    });
  }

  const lines = [
    `# ${found.name ?? found.identifier} (\`${found.kind}\`)`,
    '',
    `**Identifier:** \`${found.identifier}\``,
    `**File:** ${foundFilePath}`,
    '',
  ];

  if (found.description) {
    lines.push(`## Description\n\n${resolveText(found.description)}\n`);
  }

  if (found.metadata) {
    const m = found.metadata;
    if (m.summary) lines.push(`**Summary:** ${m.summary}\n`);
    if (m.status) lines.push(`**Status:** ${resolveStatus(m.status)}\n`);
    if (m.tags?.length) lines.push(`**Tags:** ${m.tags.join(', ')}\n`);
    if (m.since) lines.push(`**Since:** ${m.since}\n`);
    if (m.aliases?.length) lines.push(`**Aliases:** ${m.aliases.join(', ')}\n`);
  }

  if (found.tokenType) lines.push(`**Token type:** ${found.tokenType}\n`);
  if (found.source) lines.push(`**Source:** \`${typeof found.source === 'string' ? found.source : found.source.href}\`\n`);

  // Relationships: authored outgoing edges (resolved to name/kind) + derived
  // incoming edges (who points at this entity). Falls back to the raw authored
  // edges when the graph isn't available.
  const graph = getGraph ? getGraph() : null;
  if (graph) {
    const out = graph.out.get(found.identifier) ?? [];
    const incoming = graph.in.get(found.identifier) ?? [];
    if (out.length || incoming.length) {
      lines.push('## Relationships', '');
      if (out.length) {
        lines.push('**Outgoing** (this entity → others):', '');
        for (const r of out) {
          const t = graph.nodes.get(r.target);
          const meta = t ? ` (${t.kind})` : ' *(unresolved)*';
          const role = r.role ? ` — ${r.role}` : '';
          const req = r.required ? ' *(required)*' : '';
          lines.push(`- **${r.relation}** \`${r.target}\`${meta}${role}${req}`);
        }
        lines.push('');
      }
      if (incoming.length) {
        lines.push('**Incoming** (others → this entity, derived):', '');
        for (const r of incoming) {
          const t = graph.nodes.get(r.target);
          const meta = t ? ` (${t.kind})` : '';
          const req = r.required ? ' *(required)*' : '';
          lines.push(`- **${r.relation}** \`${r.target}\`${meta}${req}`);
        }
        lines.push('');
      }
    }
  } else if (found.relationships?.length) {
    lines.push(`## Relationships`, '');
    for (const r of found.relationships) {
      const req = r.required ? ' *(required)*' : '';
      const role = r.role ? ` — ${r.role}` : '';
      lines.push(`- **${r.relation}** \`${r.target}\`${role}${req}`);
    }
    lines.push('');
  }

  if (found.__dsds20) {
    // Real 0.20.0: traits/combos/sourceFiles/imports are top-level fields,
    // not sections — render those first, then the sections array itself.
    renderTraits20(found.traits, lines);
    renderCombos20(found.combos, lines);
    renderSourceAndImports20(found, lines);
    renderApi20(found, lines, propsConfig);
    if (found.sections?.length) {
      renderSections20(found.sections, lines, { filePath: found.__filePath, sharedEntries: found.__sharedEntries });
    } else {
      lines.push('*No sections defined for this entry.*');
    }
    renderExtensions20(found.$extensions, lines, { heading: '## Tool data' });
  } else if (found.documentBlocks?.length) {
    lines.push(`## Documentation (${found.documentBlocks.length} block${found.documentBlocks.length !== 1 ? 's' : ''})`, '');
    for (const block of found.documentBlocks) {
      lines.push(`### ${block.kind}`, '', '```json', JSON.stringify(block, null, 2), '```', '');
    }
  } else {
    lines.push('*No document blocks defined for this entity.*');
  }

  if (found.agentDocumentBlocks?.length) {
    lines.push(
      `## Agent Document Blocks (${found.agentDocumentBlocks.length} block${found.agentDocumentBlocks.length !== 1 ? 's' : ''} — agent consumption only)`,
      ''
    );
    for (const block of found.agentDocumentBlocks) {
      lines.push(`### ${block.kind} (agent-only)`, '', '```json', JSON.stringify(block, null, 2), '```', '');
    }
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function resolveText(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : (value.value ?? '');
}

function resolveStatus(status) {
  if (!status) return '';
  // Real 0.20.0 metadata.status is a bare string, {status, platform?, ...},
  // or a per-platform array of those.
  return typeof status === 'string' ? status : (resolveStatusDisplay20(status) ?? status.overall ?? status.value ?? '');
}
