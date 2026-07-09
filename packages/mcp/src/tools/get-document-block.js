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

  const block = found.documentBlocks?.find(b => b.kind === blockType);

  if (!block) {
    const available = (found.documentBlocks ?? []).map(b => `\`${b.kind}\``).join(', ');
    const msg = available
      ? `Entity "${found.identifier}" has no "${blockType}" block. Available blocks: ${available}`
      : `Entity "${found.identifier}" has no document blocks defined.`;
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
