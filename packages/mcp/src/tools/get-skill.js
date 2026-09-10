import { getUpdateNotice } from '../spec/version.js';
import { loadSkills } from './list-skills.js';

export const getSkillDef = {
  name: 'dsds_get_skill',
  description:
    'Get the full content of a real DSDS 0.20.0 authoring skill by id (see dsds_list_skills for the available ids). ' +
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

// The skills' own CLI commands (`npm run validate -w packages/specs`, etc.)
// describe the upstream spec repo's own workflow — a consumer project
// authoring against DSDS through this MCP server validates and scaffolds
// through this server's own tools instead. Appended as a note rather than
// rewritten into the skill text, so the vendored content stays byte-
// identical to its source and doesn't drift from it over time.
const ADAPTER_NOTE = `
---
> **Using this skill through dsds-mcp:** the commands above (\`npm run validate -w packages/specs\`, etc.) describe the upstream spec repo's own workflow. Through this MCP server, use \`dsds_validate\` in place of \`npm run validate\`, and \`dsds_spec_scaffold\`/\`dsds_author_component_doc\` in place of hand-writing a new file from the templates above.`;

// Several skills state that the style-guide rules run only in the spec repo
// and that "nothing in your project will check this" — true of the published
// dsds-validate package, and true of this server until 0.20.1, but not true
// here any more: dsds_style_check implements DSDS-17..23 directly. Left as an
// appended correction rather than an edit to the skill text, for the same
// reason as ADAPTER_NOTE — the vendored content stays byte-identical to its
// source so the next spec sync is a clean diff.
const STYLE_RULES_NOTE = `
> **One correction for dsds-mcp:** where this skill says the \`DSDS-17\`–\`DSDS-23\` style-guide rules live only in the spec repo's own \`lint-docs.js\`, or that nothing in your project will check field order — that is no longer true through this server. Call \`dsds_style_check\` to run all seven against a document. They remain advisory: ordering never affects validity, and \`dsds_validate\`'s verdict is unchanged.`;

/** Skills whose vendored text says the style rules are unavailable outside the spec repo. */
const STYLE_RULES_PATTERN = /DSDS-17|STYLE_GUIDE/;

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
  const styleNote = STYLE_RULES_PATTERN.test(skill.text) ? STYLE_RULES_NOTE : '';
  const text = skill.text + ADAPTER_NOTE + styleNote + (notice ?? '');

  return { content: [{ type: 'text', text }] };
}
