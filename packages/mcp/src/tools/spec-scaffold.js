import { ENTITY_KINDS, ENTITY_KINDS_0_20_0, SCAFFOLDS, SCAFFOLDS_0_20_0 } from '../spec/knowledge.js';
import { isValidKind20 } from '../spec/dsds20-lib.js';
import { getUpdateNotice } from '../spec/version.js';

export const specScaffoldDef = {
  name: 'dsds_spec_scaffold',
  description:
    'Generate a minimal valid DSDS template for a given entity kind, to fill in yourself. USE THIS WHEN: you know the DSDS schema and prefer to edit a template directly, or you need any entity kind other than a component (token, theme, foundation, pattern, guide, chunk) or a multi-entity "system" starter. For a COMPONENT document, prefer dsds_author_component_doc — an interactive, guided wizard that supplies valid field values step by step and needs no schema knowledge. Fill in the placeholders and add documentBlocks (or sections, in 0.20.0) incrementally, then validate with dsds_validate. ' +
    'For real 0.20.0 (.dsds.yaml), pass spec:"0.20.0" — "system" and "entry" are 0.20.0-only regardless of this flag. A namespaced custom kind (e.g. "sanity.guide") scaffolds from the generic entry template.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: 'Entity kind to scaffold. Use "system" for a multi-entity document (legacy) or the system entry kind (0.20.0), or a namespaced custom kind for 0.20.0.',
      },
      spec: {
        type: 'string',
        enum: ['0.15.2', '0.20.0'],
        description: 'Which DSDS model to scaffold. Defaults to 0.15.2 (legacy) for a kind that exists in both.',
      },
    },
    required: ['kind'],
  },
};

export async function specScaffoldHandler({ kind, spec }) {
  const is20Only = kind === 'entry' || (!ENTITY_KINDS.includes(kind) && isValidKind20(kind));
  if (spec === '0.20.0' || is20Only) {
    const isNamespacedCustomKind = !SCAFFOLDS_0_20_0[kind] && isValidKind20(kind);
    const scaffold20 = isNamespacedCustomKind
      ? { ...SCAFFOLDS_0_20_0.entry, kind }
      : SCAFFOLDS_0_20_0[kind];
    if (!scaffold20) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Unknown 0.20.0 kind "${kind}". Valid kinds: ${Object.keys(SCAFFOLDS_0_20_0).join(', ')}, or a namespaced custom kind (e.g. "sanity.guide").`,
        }],
      };
    }
    const lines = [
      `# DSDS Scaffold (real 0.20.0): \`${kind}\``,
      '',
      'This is a standalone entry file — no `schemaVersion`/`entries` wrapper. `id` must match the filename (e.g. `my-component` → `my-component.dsds.yaml`).',
      ...(isNamespacedCustomKind
        ? [`"${kind}" is a namespaced custom kind — this is the generic \`entry\` scaffold with \`kind\` set accordingly.`]
        : []),
      '',
      '```yaml',
      // The scaffolds are plain JS objects; YAML output isn't wired up
      // here (no YAML *stringify* dependency yet), so render as JSON —
      // still a valid 0.20.0 document body, just not the file's native
      // on-disk syntax. Prefer dsds_get_skill({id:"dsds-add"}) for a
      // real .dsds.yaml-flavored template.
      JSON.stringify(scaffold20, null, 2),
      '```',
      '',
      'Next steps:',
      '- Use `dsds_validate` to validate as you fill it in',
      '- Use `dsds_get_skill({ id: "dsds-add" })` for the real authoring skill, including YAML-flavored templates',
    ];
    const notice = getUpdateNotice();
    if (notice) lines.push(notice);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const scaffold = SCAFFOLDS[kind];
  if (!scaffold) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown kind "${kind}". Valid kinds: ${[...ENTITY_KINDS, 'system'].join(', ')}. (For 0.20.0 kinds, pass spec:"0.20.0".)` }],
    };
  }

  const isChunk = kind === 'chunk';
  const lines = [
    `# DSDS Scaffold: \`${kind}\``,
    '',
    isChunk
      ? 'Replace the placeholder values with your actual content. Add `guidelines` and `useCases` directly on the entity — chunks do not use `documentBlocks`.'
      : 'Replace the placeholder values with your actual content. Add `documentBlocks` to document guidelines, anatomy, API, etc.',
    '',
    '```json',
    JSON.stringify(scaffold, null, 2),
    '```',
    '',
    'Next steps:',
    '- Use `dsds_validate` to validate the document as you fill it in',
    '- Use `dsds_spec_entity_schema` to see all available fields for this entity',
  ];

  if (!isChunk && kind !== 'system') {
    lines.push('- Use `dsds_spec_document_blocks` to see which block types are available for this kind');
  }

  if (isChunk) {
    lines.push('- Use `dsds_get_chunk` to retrieve a chunk and preview how it renders for agents');
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
