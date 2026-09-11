// Surface vocabulary — rendering the shared core's prose in the idiom of the
// transport that is serving it.
//
// Handler output names tools canonically (`dsds_get_entity`), which is right
// for MCP and wrong for a shell: a CLI user told to "call dsds_list_entities"
// has been handed the name of something they cannot invoke. Before this,
// `dsds brief build` — the first command the generated AGENTS.md tells an
// agent to run — contained 16 such names and the line "Each step uses a tool
// from this MCP server", and the unconfigured-setup guidance explained how to
// edit an MCP client's `env` block.
//
// Rather than fork the briefs or thread a surface flag through 22 handlers,
// the core keeps one canonical text and each transport renders it: MCP is the
// identity, the CLI translates. Adding a porcelain command means adding one
// line to CLI_EQUIVALENTS.

import { MCP_GUIDANCE, CLI_GUIDANCE, MCP_BRIEF, CLI_BRIEF } from './setup-guidance.js';

// Canonical tool name → the CLI command that does the same job. A tool with
// no porcelain maps to its `dsds tool` invocation, which is still accurate.
export const CLI_EQUIVALENTS = {
  dsds_list_entities: 'dsds list',
  dsds_search_entities: 'dsds search',
  dsds_get_entity: 'dsds get',
  dsds_get_document_block: 'dsds get --block',
  dsds_get_agent_context: 'dsds context',
  dsds_get_chunk: 'dsds chunk',
  dsds_get_dependencies: 'dsds deps',
  dsds_get_dependents: 'dsds dependents',
  dsds_get_alternatives: 'dsds alternatives',
  dsds_impact: 'dsds impact',
  dsds_to_markdown: 'dsds markdown',
  dsds_context_brief: 'dsds brief',
  dsds_spec_overview: 'dsds spec overview',
  dsds_spec_entity_schema: 'dsds spec schema',
  dsds_spec_document_blocks: 'dsds spec blocks',
  dsds_spec_scaffold: 'dsds scaffold',
  dsds_validate: 'dsds validate',
  dsds_lint_by_path: 'dsds lint',
  dsds_lint_inline: 'dsds lint --stdin',
  dsds_check_exports: 'dsds check-exports',
  dsds_build_component: 'dsds build',
  dsds_style_check: 'dsds tool dsds_style_check',
  dsds_explain_error: 'dsds tool dsds_explain_error',
  dsds_list_skills: 'dsds tool dsds_list_skills',
  dsds_get_skill: 'dsds tool dsds_get_skill',
  dsds_author_component_doc: 'dsds tool dsds_author_component_doc',
  dsds_feedback: 'dsds tool dsds_feedback',
};

// Phrases that assume an MCP client is in the loop. Order matters: the more
// specific pattern must come first.
const PHRASE_REWRITES = [
  [/^DSDS MCP — /m, 'DSDS CLI — '],
  [/\bEach step uses a tool from this MCP server — call them in order\./g,
   'Each step is a dsds command — run them in order.'],
  [/\buses? a tool from this MCP server\b/g, 'is a dsds command'],
  [/\bthis MCP server\b/g, 'the dsds CLI'],
  [/\bthe MCP server\b/g, 'the dsds CLI'],
  [/\bMCP client config\b/g, 'dsds.config.mjs'],
  [/\bCall `(dsds [a-z][^`]*)`/g, 'Run `$1`'],
  [/\bcall `(dsds [a-z][^`]*)`/g, 'run `$1`'],
  [/\bCall (dsds [a-z][a-z -]*)\(/g, 'Run $1 ('],
];

const TOOL_NAME_PATTERN = /dsds_[a-z_]+/g;

// Blocks whose CLI answer is a different instruction, not the same one with
// different nouns — swapped whole. Both sides come from one module, so they
// cannot drift out of sync with each other.
const BLOCK_SWAPS = [
  [MCP_GUIDANCE, CLI_GUIDANCE],
  [MCP_BRIEF, CLI_BRIEF],
];

/**
 * Rewrite text that names MCP tools into the equivalent CLI commands.
 *
 * Unknown `dsds_*` names are left alone: an unmapped tool is better shown by
 * its real name than silently mistranslated.
 *
 * @param {string} text
 * @returns {string}
 */
export function toCliVocabulary(text) {
  if (typeof text !== 'string' || text.length === 0) return text;

  let out = text;
  for (const [mcp, cli] of BLOCK_SWAPS) {
    if (out.includes(mcp)) out = out.split(mcp).join(cli);
  }

  // Multi-argument calls whose CLI form reorders the arguments — handled
  // before name substitution, which would otherwise leave the arguments in
  // the tool's order (`dsds get --block identifier, "api"`).
  out = out.replace(
    /dsds_get_document_block\(\s*([^,)]+?)\s*,\s*["']?([^"')]+?)["']?\s*\)/g,
    (_m, identifier, block) => `dsds get <${identifier}> --block ${block}`
  );

  out = out.replace(TOOL_NAME_PATTERN, name => CLI_EQUIVALENTS[name] ?? name);

  // A translated name inside a call expression leaves function syntax behind:
  // `dsds context(identifier)` is not something a shell will run. Porcelain
  // takes the argument positionally; a tool reached through `dsds tool` takes
  // it as a flag.
  out = out.replace(/\b(dsds [a-z][a-z_ -]*)\(([^)]*)\)/g, (match, command, inner) => {
    const args = inner.trim();
    if (!args) return command;
    // Only rewrite what still looks like an argument list, not prose.
    if (args.length > 60 || args.includes('. ')) return match;
    const bareWord = /^[a-z][a-zA-Z]*$/.test(args);
    if (/^dsds tool /.test(command) && bareWord) {
      return `${command} --${args} "<${args}>"`;
    }
    // A lone parameter name is a placeholder, not a literal value.
    if (bareWord) return `${command} <${args}>`;
    return `${command} ${args}`;
  });

  for (const [pattern, replacement] of PHRASE_REWRITES) {
    out = out.replace(pattern, replacement);
  }

  return out;
}
