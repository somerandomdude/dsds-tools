import { getUpdateNotice } from '../spec/version.js';
import { loadSkills } from './list-skills.js';
import { accessRecord } from '../logger.js';

export const getSkillDef = {
  name: 'dsds_get_skill',
  description:
    'Get the full content of a DSDS authoring skill by id (see dsds_list_skills for the available ids), for the bundled spec version. ' +
    'Returns the skill verbatim — the same content the design-system-documentation-schema repo\'s own agents use, ' +
    'not a summary or a paraphrase.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Skill id, e.g. "dsds-add", "dsds-update", "dsds-validate", "dsds-specs".',
      },
    },
    required: ['id'],
  },
};

// The skills describe the spec's own command-line tools. A project authoring
// through this MCP server runs the same checks through its tools instead.
// Appended as a note rather than rewritten into the skill text, so the
// vendored content stays byte-identical to its source and the next spec sync
// is a clean diff.
const ADAPTER_NOTE = `
---
> **Using this skill through dsds-mcp:** the commands above are the spec's own command-line tools. Through this MCP server, \`dsds_validate\` runs the same validator as \`npx dsds-validate\`, and its "documentation suggestions" are the \`npx dsds-lint\` advisories. \`dsds_style_check\` runs \`dsds-format\` and returns the document in field order, plus the reading-order advisories. There is no scaffolding or authoring tool on this server — write a new file from the templates above by hand, then validate it.`;

/** One bundled authoring skill, in full. */
export async function getSkillHandler({ id }) {
  const skills = loadSkills();
  const skill = skills.find((s) => s.id === id);

  if (!skill) {
    const available = skills.map((s) => `\`${s.id}\``).join(', ') || '(none bundled)';
    return {
      isError: true,
      content: [{ type: 'text', text: `Skill "${id}" not found. Available: ${available}` }],
    };
  }

  const notice = getUpdateNotice();
  const text = skill.text + ADAPTER_NOTE + (notice ?? '');

  return {
    content: [{ type: 'text', text }],
    access: accessRecord({ identifier: skill.id, name: skill.title, entityKind: 'skill', chars: text.length }),
  };
}
