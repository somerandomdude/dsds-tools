// Help text generated from the tool definitions and the porcelain command
// table — the same sources the MCP server and the manifest use, so help can
// never describe a different surface.

import { optionsForTool } from './flags.js';
import { PORCELAIN } from './porcelain.js';
import { SURFACE_COMMANDS } from './surface-commands.js';

export function mainHelp(toolDefs, version) {
  return [
    `dsds ${version} — Design System Documentation Spec (DSDS) CLI`,
    '',
    'Usage',
    '  dsds <command> [args]           Commands below',
    '  dsds tool <tool-name> [flags]   Invoke any registry tool directly',
    '  dsds doctor [--json]            Diagnose configuration and document integrity',
    '  dsds init [--agents]            Scaffold dsds.config.mjs (+ agent docs stanza)',
    '  dsds manifest [--compact]       Machine-readable capability manifest (JSON)',
    '  dsds completion <shell>         Shell completion (bash, zsh, fish)',
    '  dsds help | -h | -v',
    '',
    'Commands',
    ...commandList(),
    '',
    'MCP surface — the same capabilities an MCP client gets, from a shell',
    ...commandList(SURFACE_COMMANDS),
    '',
    'Global flags',
    '  --json             JSON envelope {ok, tool, exitCode, data|error} on stdout.',
    '                     For list, search and lint, `data` is structured data and',
    '                     the rendered text moves to `text`.',
    '  --config <file>    Use an explicit dsds.config file (default: discovered from cwd upward)',
    '  --quiet            Suppress stderr diagnostics',
    '  --no-log           Skip usage logging (logging only happens when DSDS_LOGS_DIR is set)',
    '',
    'Exit codes',
    '  0 success · 1 usage or runtime error · 2 ran but found problems (lint, validate, doctor)',
    '',
    'Output format',
    '  Rendered output is GitHub-flavored Markdown, and --json mirrors it. Four shapes',
    '  cover everything, so a caller can parse without knowing the command:',
    '',
    '    Heading   `# <Title>` opens every result; `##` opens a section.',
    '    Table     A pipe table. Row 1 is headers, row 2 the `|---|` rule, then data.',
    '              Identifiers are backticked; an empty cell is an em dash.',
    '    List      `- **relation** `identifier` (kind) — role` for graph edges.',
    '    Code      A fenced block. The fence info string is the real language.',
    '',
    '  Grep a column out of a table, e.g. every example identifier:',
    '    dsds examples button | grep \'^| `\' | awk -F\'|\' \'{print $2}\'',
    '',
    '  `list` prints the whole catalogue with a one-line summary per entity and',
    '  says so — it cannot change mid-session, so read it once and keep it.',
    '  --no-summaries gives the bare index. `search` and `examples` omit summaries',
    '  by default. --next adds the follow-up command on all three; it is off',
    '  because it measurably grew an agent run rather than shortening it.',
    '',
    '  --json is the machine-readable surface and the better target for anything',
    '  non-interactive: `data` holds the structured fields, `text` the rendered',
    '  Markdown. Errors carry a stable `error.code` (ERR_UNKNOWN_ENTITY,',
    '  ERR_UNKNOWN_FILTER, ERR_NOT_CONFIGURED, …) plus `error.suggestions`, so a',
    '  caller can branch on the code instead of matching on the message.',
    '',
    'Tool inputs (dsds tool)',
    '  Flat scalar inputs are flags:  dsds tool dsds_get_entity --identifier button',
    `  Everything else via JSON:      --args '{"files":[{"path":"src/App.tsx"}]}' or --args-file payload.json`,
    '  Per-tool inputs:               dsds tool <tool-name> --help',
    '',
    'The wizards (dsds_build_component, dsds_author_component_doc) and dsds_feedback',
    'have no porcelain command — invoke them via `dsds tool` when needed.',
    '',
    'Configuration comes from dsds.config.{mjs,js,json} (discovered upward from cwd) and',
    'environment variables (DSDS_PATHS, LINT_PLUGINS, …) — env wins per key.',
    'Spec tools need no configuration. `dsds manifest` describes the full surface.',
    '',
    'Tools',
    ...toolList(toolDefs),
  ].join('\n');
}

function commandList(table = PORCELAIN) {
  const entries = Object.entries(table);
  const width = Math.max(...entries.map(([name]) => name.length));
  return entries.map(([name, spec]) => `  ${name.padEnd(width)}  ${spec.summary}`);
}

export function toolList(toolDefs) {
  const width = Math.max(...toolDefs.map(d => d.name.length));
  return toolDefs.map(d => `  ${d.name.padEnd(width)}  ${firstLine(d.description)}`);
}

function firstLine(s = '') {
  const line = s.trim().split('\n')[0];
  return line.length > 100 ? line.slice(0, 99) + '…' : line;
}

export function toolHelp(def) {
  const { flagProps } = optionsForTool(def);
  const required = new Set(def.inputSchema?.required ?? []);
  const lines = [`dsds tool ${def.name}`, ''];
  if (def.description) lines.push(def.description.trim(), '');

  const props = Object.entries(def.inputSchema?.properties ?? {});
  if (props.length === 0) {
    lines.push('No inputs.');
    return lines.join('\n');
  }

  lines.push('Inputs');
  for (const [name, prop] of props) {
    const via = name in flagProps ? `--${name}` : `${name} (via --args JSON)`;
    const req = required.has(name) ? ' (required)' : '';
    const type = prop.type ?? 'any';
    const enumNote = prop.enum ? ` — one of: ${prop.enum.join(', ')}` : '';
    lines.push(`  ${via}${req} [${type}]${enumNote}`);
    if (prop.description) lines.push(`      ${firstLine(prop.description)}`);
  }
  return lines.join('\n');
}
