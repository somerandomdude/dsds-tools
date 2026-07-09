import { ENTITY_KINDS, DOCUMENT_BLOCK_DESCRIPTIONS, VALID_BLOCKS_BY_KIND } from '../spec/knowledge.js';
import { getUpdateNotice } from '../spec/version.js';

// Chunks don't use documentBlocks — their guidelines/useCases are top-level.
const DOCUMENT_BLOCK_KINDS = ENTITY_KINDS.filter(k => k !== 'chunk');

export const specDocumentBlocksDef = {
  name: 'dsds_spec_document_blocks',
  description:
    'List the document block types available for a DSDS entity kind, with descriptions of what each block captures. Not applicable to chunks — use dsds_spec_entity_schema for chunk field details.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: DOCUMENT_BLOCK_KINDS,
        description: 'The entity kind to list document blocks for.',
      },
    },
    required: ['kind'],
  },
};

export async function specDocumentBlocksHandler({ kind }) {
  const validBlocks = VALID_BLOCKS_BY_KIND[kind];
  if (!validBlocks) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown entity kind "${kind}". Valid kinds: ${DOCUMENT_BLOCK_KINDS.join(', ')}` }],
    };
  }

  const lines = [
    `# Document Blocks for \`${kind}\``,
    '',
    `The \`documentBlocks\` array on a \`${kind}\` entity accepts ${validBlocks.length} block type${validBlocks.length !== 1 ? 's' : ''}:`,
    '',
  ];

  for (const blockType of validBlocks) {
    const desc = DOCUMENT_BLOCK_DESCRIPTIONS[blockType];
    lines.push(`### \`${blockType}\``);
    lines.push(desc?.summary ?? 'No description available.');
    lines.push('');
  }

  lines.push(
    '## Block Structure',
    '',
    'Every block in `documentBlocks` requires a `type` field matching one of the names above. Example:',
    '',
    '```json',
    JSON.stringify(exampleBlock(validBlocks[0]), null, 2),
    '```',
  );

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function exampleBlock(type) {
  const examples = {
    section: { kind: 'section', items: [{ title: 'Section title', body: 'Section body in markdown.' }] },
    steps: { kind: 'steps', title: 'How to…', ordered: true, items: [{ title: 'First step', instruction: 'What to do.' }] },
    guideline: { kind: 'guideline', items: [{ guidance: 'Rule text here.', level: 'MUST' }, { guidance: 'Recommendation text here.', level: 'SHOULD', rationale: 'Why this matters.' }] },
    purpose: { kind: 'purpose', useCases: [{ description: 'Use this when…', stance: 'recommended' }, { description: 'Do not use when…', stance: 'discouraged', alternative: { identifier: 'other-component', rationale: 'Why the alternative fits better.' } }] },
    accessibility: { kind: 'accessibility', wcagLevel: 'AA', notes: 'Keyboard and screen reader notes here.' },
    content: { kind: 'content', notes: 'Copywriting and localization rules here.' },
    anatomy: { kind: 'anatomy', parts: [{ name: 'container', description: 'The root element.' }] },
    api: { kind: 'api', properties: [{ name: 'disabled', type: 'boolean', description: 'Disables interaction.' }] },
    variants: { kind: 'variants', variants: [{ name: 'emphasis', values: ['primary', 'secondary', 'ghost'] }] },
    states: { kind: 'states', states: [{ name: 'disabled', description: 'Non-interactive state.' }] },
    events: { kind: 'events', events: [{ name: 'click', description: 'Fired when activated.' }] },
    'design-specifications': { kind: 'design-specifications', specifications: [] },
    import: { kind: 'import', imports: [{ platform: 'react', snippet: "import { MyComponent } from '@ds/components';" }] },
    interactions: { kind: 'interactions', interactions: [{ title: 'Step 1', description: 'User action.' }] },
    principles: { kind: 'principles', principles: [{ title: 'Principle name', description: 'Rationale.' }] },
    scale: { kind: 'scale', steps: [{ name: 'sm', value: '4px' }] },
    motion: { kind: 'motion', entries: [{ name: 'ease-in', duration: '150ms', easing: 'ease-in' }] },
  };
  return examples[type] ?? { kind: type };
}
