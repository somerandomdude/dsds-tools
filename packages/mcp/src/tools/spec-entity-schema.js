import { ENTITY_DESCRIPTIONS_0_20_0, ENTITY_KINDS_0_20_0 } from '../spec/knowledge.js';
import { isValidKind20 } from '../spec/dsds-lib.js';
import { getUpdateNotice } from '../spec/version.js';
import { describeEntryFields, describeSectionKinds } from '../spec/schema-describe.js';
import { renderTable } from '../render/table.js';

// 0.20.0, 0.20.1 and 0.21.0 are one document model: 0.20.1 changed field
// ORDER and added advisory rules, and 0.21.0 added `traitType` to a trait and
// `tags` to a section. An author writes the same shape either way, so all
// three route here and the described field tables come from the vendored
// schema, which is pinned to the bundled release.

export const specEntitySchemaDef = {
  name: 'dsds_spec_entity_schema',
  description:
    'Get the full field definitions for a DSDS entity kind. Use this before authoring or scaffolding to understand what fields are available. ' +
    'For a real 0.20.0 document (.dsds.yaml), pass spec:"0.20.0" — prefer dsds_get_skill({id:"dsds-specs"}) for the fuller picture, this tool only covers one kind at a time. ' +
    'A namespaced custom kind (e.g. "sanity.guide") is valid with spec:"0.20.0" — it falls back to the generic entry shape.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: 'The entity kind to describe. For 0.20.0, either a well-known kind (component, token, theme, system, entry) or a namespaced custom kind (e.g. "sanity.guide").',
      },
    },
    required: ['kind'],
  },
};

/** Every field one entity kind accepts, described from the vendored schema. */
export async function specEntitySchemaHandler({ kind }) {
  return render20(kind);
}

// Schema section-kind descriptions run to a paragraph; the table wants the
// gist. One sentence is often too little, so keep taking sentences until
// there is enough to be useful.
/** The opening sentences of `text`, to at least `min` characters. */
function firstSentence(text, min = 60) {
  const trimmed = String(text ?? '').trim();
  let out = '';
  for (const part of trimmed.split(/(?<=\.)\s+/)) {
    out = out ? `${out} ${part}` : part;
    if (out.length >= min) break;
  }
  return out;
}

/** Render a field list as a Markdown table. */
function fieldTable(fields) {
  return renderTable(
    fields.map(f => ({
      field: `\`${f.name}\``,
      type: f.type ? `\`${f.type}\`` : null,
      description: f.description,
    })),
    [
      { key: 'field', header: 'Field' },
      { key: 'type', header: 'Type' },
      { key: 'description', header: 'Description' },
    ]).split('\n');
}

/** Describe one entity kind from the vendored schema. */
function render20(kind) {
  const isNamespacedCustomKind = !ENTITY_DESCRIPTIONS_0_20_0[kind] && isValidKind20(kind);
  const def = ENTITY_DESCRIPTIONS_0_20_0[isNamespacedCustomKind ? 'entry' : kind];
  if (!def) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Unknown 0.20.0 entity kind "${kind}". Valid kinds: ${ENTITY_KINDS_0_20_0.join(', ')}, or a namespaced custom kind (e.g. "sanity.guide" — dotted, lowercase-dash segments).`,
      }],
    };
  }
  const lines = [
    `# Entity Schema (real 0.20.0): \`${kind}\``,
    '',
  ];
  if (isNamespacedCustomKind) {
    lines.push(
      `"${kind}" is a namespaced custom kind, not one of the 5 well-known kinds — it follows the generic ` +
        '`entry` shape shown below (the same shape underlies every foundation, pattern, guide, and custom kind):',
      ''
    );
  }
  // Fields, their types and their meanings come from the vendored schema
  // rather than a table here — see spec/schema-describe.js. The previous
  // version printed the names alone, out of a hand-kept list, and sent the
  // reader to a skill to find out what any of them held.
  const fields = describeEntryFields(isNamespacedCustomKind ? 'entry' : kind);
  const required = fields.filter(f => f.required);
  const optional = fields.filter(f => !f.required);

  lines.push(def.summary, '');

  if (required.length) {
    lines.push('## Required Fields', '', ...fieldTable(required), '');
  }
  if (optional.length) {
    lines.push('## Optional Fields', '', ...fieldTable(optional), '');
  }

  const sectionKinds = describeSectionKinds();
  if (sectionKinds.length) {
    lines.push(
      '## Section Kinds',
      '',
      'Every item in `sections` carries a `kind`. These are the four it can take:',
      '',
      ...renderTable(
        sectionKinds.map(s => ({ kind: `\`${s.kind}\``, holds: firstSentence(s.description) })),
        [{ key: 'kind', header: 'Kind' }, { key: 'holds', header: 'Holds' }]).split('\n'),
      ''
    );
  }

  lines.push(
    `> **Note:** ${def.notes}`,
    '',
    'For the rest of the model — how refs resolve, what metadata carries, how a section is shaped — read `dsds_get_skill({ id: "dsds-specs" })`.',
  );
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
