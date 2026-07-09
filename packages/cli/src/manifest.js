// Self-describing capability manifest — one machine-readable payload listing
// every command, tool, input schema, and the output contract, so an agent can
// learn the full surface without scraping --help. Generated from the same tool
// definitions the MCP server registers and the same porcelain table the router
// dispatches on; never hand-maintained.

import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';
import { CONFIG_FILENAMES } from 'dsds-mcp/src/config.js';
import { PORCELAIN } from './porcelain.js';

export function buildManifest(toolDefs, pkg) {
  return {
    name: 'dsds',
    package: pkg.name,
    version: pkg.version,
    specVersion: BUNDLED_VERSION,
    description: pkg.description,
    output: {
      default: 'human-readable text on stdout',
      json: 'pass --json for a {ok, tool, exitCode, data|error} envelope on stdout (lint adds a structured findings mirror)',
      stderr: 'diagnostics only — stdout is always pipe-safe',
      exitCodes: {
        0: 'success',
        1: 'usage or runtime error',
        2: 'command ran but found problems (lint findings, validation errors, doctor failures)',
      },
    },
    commands: [
      ...Object.entries(PORCELAIN).map(([name, spec]) => ({
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
      { name: 'manifest', usage: 'dsds manifest', description: 'This payload.' },
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
    tools: toolDefs.map(d => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema,
    })),
  };
}
