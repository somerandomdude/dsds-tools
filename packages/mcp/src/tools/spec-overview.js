import { ENTITY_KINDS, ENTITY_DESCRIPTIONS } from '../spec/knowledge.js';
import { BUNDLED_VERSION, SPEC_URL, getUpdateNotice } from '../spec/version.js';

export const specOverviewDef = {
  name: 'dsds_spec_overview',
  description:
    'Get an overview of the Design System Documentation Spec (DSDS): what it is, entity types, and core concepts. Call this first when authoring DSDS documents.',
  inputSchema: { type: 'object', properties: {} },
};

export async function specOverviewHandler() {
  const lines = [
    `# Design System Documentation Spec (DSDS) — v${BUNDLED_VERSION}`,
    '',
    `DSDS is a machine-readable JSON standard for documenting design systems. It captures the *how and why* of a system — usage rules, anatomy, API, accessibility — not the token values themselves (use the W3C Design Tokens Format for values).`,
    '',
    `Full spec: ${SPEC_URL}`,
    '',
    '## Entity Types',
    '',
  ];

  for (const kind of ENTITY_KINDS) {
    const def = ENTITY_DESCRIPTIONS[kind];
    lines.push(`### \`${kind}\``);
    lines.push(def.summary);
    lines.push(`- **Required fields:** ${def.required.join(', ')}`);
    if (def.notes) lines.push(`- **Note:** ${def.notes}`);
    lines.push('');
  }

  lines.push('## Document Structure');
  lines.push('');
  lines.push('Every DSDS file needs:');
  lines.push(`- \`dsdsVersion\`: \`"${BUNDLED_VERSION}"\``);
  lines.push('- Either `entity` (single entity per file) or `entityGroups` (array of named groups, each with a mixed `entities` array)');
  lines.push('');
  lines.push('Optional root-level properties:');
  lines.push('- `systemInfo`: Identity and provenance — `systemName`, `systemVersion`, `organization`, `url`, `license`');
  lines.push('- `useCases`: Design system intent — optional `purpose` umbrella statement and `items` array (stance: recommended/discouraged)');
  lines.push('- `guidelines`: Cross-cutting rules that apply across the entire system (array of guidelineEntry with `guidance`, `level`, optional `rationale`, `category`, `target`, `tags`)');
  lines.push('- `extends`: Declare inheritance from a parent design system — `system`, `url`, `version`, `description`');
  lines.push('');
  lines.push('Entities carry a `documentBlocks` array of typed content sections. Call `dsds_spec_document_blocks` with an entity kind to see which block types are available.');
  lines.push('');
  lines.push('## Authoring Workflow');
  lines.push('');
  lines.push('1. `dsds_spec_overview` — understand the spec (you are here)');
  lines.push('2. `dsds_spec_entity_schema` — see full field definitions for your entity kind');
  lines.push('3. `dsds_spec_scaffold` — generate a starter template');
  lines.push('4. `dsds_spec_document_blocks` — discover which blocks to add');
  lines.push('5. `dsds_validate` — validate your document at any point');

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
