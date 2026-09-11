// Self-describing capability manifest — one machine-readable payload listing
// every command, tool, prompt, resource shape, input schema, and the output
// contract, so an agent can learn the full surface without scraping --help.
//
// Generated from the shared surface (dsds-mcp/src/surface.js) the MCP server
// serves and the same command tables the router dispatches on; never
// hand-maintained. The `tools` and `prompts` arrays are therefore exactly
// what an MCP client sees from tools/list and prompts/list.

import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';
import { CONFIG_FILENAMES } from 'dsds-mcp/src/config.js';
import { PORCELAIN } from './porcelain.js';
import { SURFACE_COMMANDS } from './surface-commands.js';

/**
 * @param {{toolDefs: Array, listPrompts: () => Array}} surface
 * @param {object} pkg - the CLI package.json
 * @param {{compact?: boolean}} [options] - compact drops the tool input
 *   schemas, which are most of the payload's ~38KB; an agent that only needs
 *   to know what exists should not have to spend that.
 */
export function buildManifest(surface, pkg, { compact = false } = {}) {
  return {
    name: 'dsds',
    package: pkg.name,
    version: pkg.version,
    specVersion: BUNDLED_VERSION,
    description: pkg.description,
    output: {
      default: 'human-readable text on stdout',
      json:
        'pass --json for a {ok, tool, exitCode, data|error} envelope on stdout. When the tool emits structured data (list, search, lint) `data` is that data and the rendered prose moves to `text`; otherwise `data` is the text.',
      jsonSurfaceCommands:
        'prompt, resource, and instructions return {ok, command, exitCode, data|error} — no tool ran, so the tool key is a command key',
      stderr: 'diagnostics only — stdout is always pipe-safe',
      exitCodes: {
        0: 'success',
        1: 'usage or runtime error',
        2: 'command ran but found problems (lint findings, validation errors, doctor failures)',
      },
    },
    // The MCP server's four capability groups, and the command that reaches
    // each one from a shell. Parity between the two surfaces is a tested
    // guarantee, not an aspiration.
    capabilities: {
      tools: 'dsds tool <name> — every registered tool, plus porcelain commands for the common read paths',
      prompts:
        'dsds prompt [<name>] — the same prompts an MCP client offers as slash commands. The list below is the config-free set; dsds-intro joins it when intro documents are configured, so `dsds prompt` is the authority for a given project.',
      resources: 'dsds resource [<uri>] — the same dsds://entity/{identifier} resources',
      instructions: 'dsds instructions — the instruction block an MCP client receives on connect',
    },
    commands: [
      ...Object.entries(PORCELAIN).map(([name, spec]) => ({
        name,
        usage: spec.usage,
        description: spec.summary,
      })),
      ...Object.entries(SURFACE_COMMANDS).map(([name, spec]) => ({
        name,
        usage: spec.usage,
        description: spec.summary,
      })),
      {
        name: 'doctor',
        usage: 'dsds doctor [--json]',
        description: 'Diagnose configuration and DSDS document integrity. Exit 2 on failures.',
      },
      {
        name: 'init',
        usage: 'dsds init [--agents] [--agents-file <path>] [--force]',
        description:
          'Scaffold dsds.config.mjs (seeded from current env vars); --agents writes a marker-delimited agent-docs stanza.',
      },
      {
        name: 'tool',
        usage: 'dsds tool <tool-name> [flags | --args <json> | --args-file <path>]',
        description:
          'Invoke any registered tool, including the wizards. Flat scalar inputs as flags; everything else as JSON.',
      },
      {
        name: 'manifest',
        usage: 'dsds manifest [--compact]',
        description: 'This payload. --compact drops tool input schemas.',
      },
      {
        name: 'completion',
        usage: 'dsds completion <bash|zsh|fish>',
        description: 'Shell completion script; completes commands, flags, and entity identifiers.',
      },
      { name: 'help', usage: 'dsds help', description: 'Usage. `dsds tool <tool-name> --help` shows per-tool inputs.' },
    ],
    configFile: {
      names: CONFIG_FILENAMES,
      discovery: 'nearest match walking up from cwd; DSDS_CONFIG or --config selects one explicitly',
      precedence: 'environment variables > config file > defaults',
      relativePaths: 'resolve against the config file directory',
      keys: [
        'paths', 'introPaths', 'lintPlugins', 'lintResolveDir', 'lintSourceDir',
        'packageExportPaths', 'iconPackage', 'feedbackDir', 'logsDir',
        'enableFeedback', 'introInline', 'schemaVersion',
      ],
    },
    environment: {
      DSDS_CONFIG: 'explicit path to a dsds.config file (overrides upward discovery)',
      DSDS_PATHS: 'comma-separated DSDS document paths — required for the design system tools',
      DSDS_INTRO_PATHS: 'design system intro entity documents',
      LINT_PLUGINS: 'ESLint plugin packages for the lint tools',
      LINT_RESOLVE_DIR: 'directory lint plugins resolve from',
      LINT_SOURCE_DIR: 'project root for linting relative paths',
      PACKAGE_EXPORT_PATHS: 'pkg=path pairs for dsds_check_exports',
      ICON_PACKAGE: 'icon package name for doctor icon-import checks',
      DSDS_LOGS_DIR: 'set to enable JSONL usage logging (off otherwise)',
    },
    tools: surface.toolDefs.map(d => ({
      name: d.name,
      description: compact ? firstSentence(d.description) : d.description,
      ...(compact ? {} : { inputSchema: d.inputSchema }),
    })),
    ...(compact ? { note: 'Compact form — run `dsds manifest` for tool input schemas.' } : {}),
    prompts: surface.listPrompts().map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
    resources: {
      uriTemplate: 'dsds://entity/{identifier}',
      mimeType: 'application/json',
      description: 'One resource per loaded entity; the body is the entity document.',
      list: 'dsds resource',
      read: 'dsds resource <uri|identifier>',
    },
  };
}

function firstSentence(description = '') {
  const text = description.trim();
  const end = text.search(/\.\s/);
  return end === -1 ? text : text.slice(0, end + 1);
}
