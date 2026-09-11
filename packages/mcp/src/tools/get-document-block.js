import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { notFoundMessage, entityIdentifiers, didYouMean } from '../suggest.js';
import { renderApi20 } from '../spec/render-0.20.0.js';

export const getDocumentBlockDef = {
  name: 'dsds_get_document_block',
  description:
    'Get a specific document block from an entity (e.g. just the "api" block from "button") without retrieving the full entity. Useful for targeted lookups when building with the design system.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The entity identifier or name.',
      },
      blockType: {
        type: 'string',
        description: 'The document block type to retrieve (e.g. "api", "accessibility", "anatomy", "variants").',
      },
    },
    required: ['identifier', 'blockType'],
  },
};

export async function getDocumentBlockHandler({ identifier, blockType }, getSystems, propsConfig = null) {
  const systems = getSystems();
  if (systems.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfiguredBrief() }],
    };
  }

  const needle = identifier.toLowerCase();
  let found = null;

  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) { found = entity; break; }
  }

  if (!found) {
    return {
      isError: true,
      content: [{ type: 'text', text: notFoundMessage({
          label: 'Entity',
          input: identifier,
          candidates: entityIdentifiers(systems),
          listHint: '`dsds_list_entities`',
        }) }],
    };
  }

  if (found.__dsds20 && blockType === 'api') {
    // Real 0.20.0 has no `api`-kind section — the API comes from `sourceFiles`
    // resolved through the extractor cache (DEC-2). This is the call site the
    // server's HARD RULE points agents at ("at minimum
    // dsds_get_document_block(identifier, 'api')"), so it must render real
    // prop data, not the raw `sourceFiles` pointer a generic passthrough would.
    const lines = [`# ${found.name ?? found.identifier} — \`api\` block`, ''];
    renderApi20(found, lines, propsConfig);
    if (lines.length === 2) lines.push('*No API data available for this entry.*', '');
    const notice = getUpdateNotice();
    if (notice) lines.push(notice);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  let block;
  let available;
  if (found.__dsds20) {
    // Real 0.20.0: look up a section by kind (definitions/guidelines/steps/
    // section) or by its own title (0.20.0's generic sections are often
    // addressed by title rather than kind). traits/sourceFiles/combos/
    // imports are top-level entry fields, not sections — allow those names
    // too, since an agent has no other way to ask for just one of them.
    const TOP_LEVEL_FIELDS = ['traits', 'sourceFiles', 'combos', 'imports'];
    if (TOP_LEVEL_FIELDS.includes(blockType)) {
      block = found[blockType] ? { kind: blockType, items: found[blockType] } : null;
    } else {
      const blockNeedle = blockType.toLowerCase();
      block = found.sections?.find(b => b.kind === blockType) ??
        found.sections?.find(b => b.title?.toLowerCase() === blockNeedle);
    }
    // Every name that actually resolves, each listed once. This used to
    // print one entry per section — so a component with four `guidelines`
    // sections advertised `guidelines` four times — while omitting `api`,
    // which is handled above and is the name the instructions tell agents
    // to ask for.
    available = unique([
      'api',
      ...(found.sections ?? []).map(b => b.kind),
      ...(found.sections ?? []).map(b => b.title).filter(Boolean),
      ...TOP_LEVEL_FIELDS.filter(f => found[f]?.length),
    ]);
  } else {
    block = found.documentBlocks?.find(b => b.kind === blockType);
    available = unique((found.documentBlocks ?? []).map(b => b.kind));
  }

  if (!block) {
    if (available.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Entity "${found.identifier}" has no sections or document blocks defined.` }],
      };
    }
    const suggestions = didYouMean(blockType, available);
    const lines = [`Entity "${found.identifier}" has no "${blockType}" section or block.`];
    if (suggestions.length > 0) {
      lines.push('', `Did you mean: ${suggestions.map(s => `\`${s}\``).join(', ')}?`);
    }
    lines.push('', `Available: ${available.map(a => `\`${a}\``).join(', ')}`);
    return { isError: true, content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const lines = [
    `# ${found.name ?? found.identifier} — \`${blockType}\` block`,
    '',
    '```json',
    JSON.stringify(block, null, 2),
    '```',
  ];

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
