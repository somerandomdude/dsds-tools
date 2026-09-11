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
