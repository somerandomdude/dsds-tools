import { getUpdateNotice } from '../spec/version.js';

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

export async function getDocumentBlockHandler({ identifier, blockType }, getSystems) {
  const systems = getSystems();
  if (systems.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'No DSDS files configured. Set the `DSDS_PATHS` environment variable.' }],
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
      content: [{ type: 'text', text: `Entity "${identifier}" not found. Use dsds_list_entities to see available identifiers.` }],
    };
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
    available = [
      ...(found.sections ?? []).map(b => `\`${b.kind}${b.title ? `:${b.title}` : ''}\``),
      ...TOP_LEVEL_FIELDS.filter(f => found[f]?.length).map(f => `\`${f}\``),
    ].join(', ');
  } else {
    block = found.documentBlocks?.find(b => b.kind === blockType);
    available = (found.documentBlocks ?? []).map(b => `\`${b.kind}\``).join(', ');
  }

  if (!block) {
    const msg = available
      ? `Entity "${found.identifier}" has no "${blockType}" section/block. Available: ${available}`
      : `Entity "${found.identifier}" has no sections or document blocks defined.`;
    return { isError: true, content: [{ type: 'text', text: msg }] };
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
