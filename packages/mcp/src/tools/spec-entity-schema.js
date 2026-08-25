import { ENTITY_KINDS, ENTITY_DESCRIPTIONS, ENTITY_DESCRIPTIONS_0_20_0, ENTITY_KINDS_0_20_0, VALID_BLOCKS_BY_KIND, METADATA_FIELDS } from '../spec/knowledge.js';
import { getUpdateNotice } from '../spec/version.js';

const ALL_KINDS = [...new Set([...ENTITY_KINDS, ...ENTITY_KINDS_0_20_0])];

export const specEntitySchemaDef = {
  name: 'dsds_spec_entity_schema',
  description:
    'Get the full field definitions for a DSDS entity kind. Use this before authoring or scaffolding to understand what fields are available. ' +
    'For a real 0.20.0 document (.dsds.yaml), pass spec:"0.20.0" — prefer dsds_get_skill({id:"dsds-specs"}) for the fuller picture, this tool only covers one kind at a time.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ALL_KINDS,
        description: 'The entity kind to describe.',
      },
      spec: {
        type: 'string',
        enum: ['0.15.2', '0.20.0'],
        description: 'Which DSDS model to describe this kind under. Defaults to 0.15.2 (legacy) for a kind that exists in both; system/entry are 0.20.0-only regardless of this flag.',
      },
    },
    required: ['kind'],
  },
};

export async function specEntitySchemaHandler({ kind, spec }) {
  const is20Only = kind === 'system' || kind === 'entry';
  if (spec === '0.20.0' || is20Only) return render20(kind);

  const def = ENTITY_DESCRIPTIONS[kind];
  if (!def) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown legacy 0.15.2 entity kind "${kind}". Valid kinds: ${ENTITY_KINDS.join(', ')}. (system/entry are 0.20.0-only — call again with spec:"0.20.0".)` }],
    };
  }

  const validBlocks = VALID_BLOCKS_BY_KIND[kind] ?? [];

  const lines = [
    `# Entity Schema: \`${kind}\``,
    '',
    def.summary,
  ];

  if (def.notes) lines.push('', `> **Note:** ${def.notes}`);

  lines.push(
    '',
    '## Required Fields',
    '',
    ...def.required.map(f => `- \`${f}\``),
    '',
    '## Top-Level Fields',
    '',
    '| Field | Required | Description |',
    '|-------|----------|-------------|',
    ...buildFieldTable(kind, def),
    '',
    '## Metadata Fields',
    '',
    'Set via the `metadata` object on the entity:',
    '',
    ...Object.entries(METADATA_FIELDS).map(([k, v]) => `- **\`${k}\`** — ${v}`),
  );

  if (kind === 'chunk') {
    lines.push(
      '',
      '## Structure Note',
      '',
      'Chunks do **not** use `documentBlocks`. Instead, `guidelines` and `useCases` are top-level arrays directly on the entity. Use `dsds_get_chunk` to retrieve a chunk with its code and rules rendered for agent use.',
    );
  } else {
    lines.push(
      '',
      '## Valid Document Block Types',
      '',
      validBlocks.length
        ? `For \`${kind}\`, these block types are allowed in \`documentBlocks\`:\n\n${validBlocks.map(b => `- \`${b}\``).join('\n')}`
        : 'No document blocks defined for this kind.',
      '',
      'Use `dsds_spec_document_blocks` to get descriptions of each block type.',
    );
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function render20(kind) {
  const def = ENTITY_DESCRIPTIONS_0_20_0[kind];
  if (!def) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown 0.20.0 entity kind "${kind}". Valid kinds: ${ENTITY_KINDS_0_20_0.join(', ')}.` }],
    };
  }
  const lines = [
    `# Entity Schema (real 0.20.0): \`${kind}\``,
    '',
    def.summary,
    '',
    '## Required Fields',
    '',
    ...def.required.map(f => `- \`${f}\``),
    '',
    '## Optional Top-Level Fields',
    '',
    ...def.optionalTop.map(f => `- \`${f}\``),
    '',
    `> **Note:** ${def.notes}`,
    '',
    'Prefer `dsds_get_skill({ id: "dsds-specs" })` for the full model (section kinds, refs, metadata) — this tool covers only this one kind\'s own top-level shape.',
  ];
  const notice = getUpdateNotice();
  if (notice) lines.push(notice);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function buildFieldTable(kind, def) {
  const rows = [
    ['`kind`', 'Yes', `Always \`"${kind}"\``],
    ['`identifier`', 'Yes', 'Machine-readable name (kebab-case recommended)'],
  ];

  if (kind === 'token') {
    rows.push(['`tokenType`', 'Yes', 'color | dimension | fontFamily | fontWeight | fontStyle | duration | cubicBezier | number | string']);
    rows.push(['`source`', 'No', 'Source value or token reference']);
  } else if (kind === 'token-group') {
    rows.push(['`tokenType`', 'No', 'Inherited token type for child tokens']);
    rows.push(['`source`', 'No', 'Source value or token reference']);
    rows.push(['`children`', 'No', 'Array of token or token-group entities']);
  } else {
    rows.push(['`name`', 'Yes', 'Human-readable display label']);
  }

  if (kind === 'theme') {
    rows.push(['`source`', 'No', 'Reference to the base theme this overrides']);
    rows.push(['`overrides`', 'No', 'Array of token override objects']);
  }

  if (kind === 'chunk') {
    rows.push(['`code`', 'Yes', 'Two forms: inline (`code` + `language`) or referenced (`src` + `language`, where `src` is a relative path to a code file)']);
    rows.push(['`description`', 'No', 'What this chunk captures and which components it composes (CommonMark)']);
    rows.push(['`guidelines`', 'No', 'Top-level array of guidelineEntry objects (must/should/should-not/must-not + rationale)']);
    rows.push(['`useCases`', 'No', 'Top-level array of useCase objects (recommended/discouraged + optional alternative)']);
    rows.push(['`metadata`', 'No', 'status, tags, since, links (use links to reference composed components), etc.']);
    rows.push(['`$extensions`', 'No', 'Vendor extensions (use reverse-domain namespace keys)']);
  } else {
    rows.push(
      ['`metadata`', 'No', 'Object containing description, status, tags, summary, links, etc.'],
      ['`documentBlocks`', 'No', 'Array of typed documentation blocks'],
      ['`agents`', 'No', 'AI-optimized context: constraints, disambiguation, anti-patterns, keywords'],
      ['`$extensions`', 'No', 'Vendor extensions (use reverse-domain namespace keys)'],
    );
  }

  return rows.map(([field, req, desc]) => `| ${field} | ${req} | ${desc} |`);
}
