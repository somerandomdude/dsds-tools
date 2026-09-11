import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { writeLog } from 'dsds-mcp/src/logger.js';
import { createRuntime, createRegistryOnly } from './runtime.js';
import { BASE_OPTIONS, optionsForTool, coerceFlagValues } from './flags.js';
import { printResult, contentText } from './output.js';
import { buildManifest } from './manifest.js';
import { mainHelp, toolList, toolHelp } from './help.js';
import { PORCELAIN, UsageError, checkPositionals, porcelainHelp } from './porcelain.js';
import { runDoctor } from './doctor.js';
import { runInit } from './init.js';
import { runPrompt, runResource, runInstructions } from './surface-commands.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

export async function run(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;

  if (!command) {
    let values;
    try {
      ({ values } = parseArgs({
        args: argv,
        options: { help: { type: 'boolean' }, version: { type: 'boolean' } },
        allowPositionals: false,
      }));
    } catch (err) {
      process.stderr.write(`dsds: ${err.message}\n`);
      return 1;
    }
    if (values.version) {
      process.stdout.write(pkg.version + '\n');
      return 0;
    }
    process.stdout.write(mainHelp(createRegistryOnly().toolDefs, pkg.version) + '\n');
    return 0;
  }

  switch (command) {
    case 'tool':
      return toolCommand(argv.slice(1));
    case 'prompt':
      return runPrompt(argv.slice(1));
    case 'resource':
      return runResource(argv.slice(1));
    case 'instructions':
      return runInstructions(argv.slice(1));
    case 'doctor':
      return doctorCommand(argv.slice(1));
    case 'init':
      return initCommand(argv.slice(1));
    case 'manifest':
      process.stdout.write(JSON.stringify(buildManifest(createRegistryOnly(), pkg), null, 2) + '\n');
      return 0;
    case 'help':
      process.stdout.write(mainHelp(createRegistryOnly().toolDefs, pkg.version) + '\n');
      return 0;
    default:
      if (PORCELAIN[command]) return porcelainCommand(command, argv.slice(1));
      process.stderr.write(`dsds: unknown command "${command}" — run \`dsds help\`\n`);
      return 1;
  }
}

async function doctorCommand(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { json: { type: 'boolean' }, config: { type: 'string' }, help: { type: 'boolean' } },
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }
  if (values.help) {
    process.stdout.write(
      [
        'dsds doctor [--json] [--config <file>]',
        '',
        'Diagnose configuration and DSDS document integrity: paths, loading,',
        'schema validation (root + referenced files), spec version alignment,',
        'relationship graph, example props, brief references, lint plugins,',
        'and package export paths.',
        '',
        'Exit codes: 0 all checks pass · 2 one or more checks failed',
      ].join('\n') + '\n'
    );
    return 0;
  }
  return runDoctor({ json: values.json, configPath: values.config });
}

async function initCommand(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        agents: { type: 'boolean' },
        force: { type: 'boolean' },
        'agents-file': { type: 'string' },
        help: { type: 'boolean' },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }
  if (values.help) {
    process.stdout.write(
      [
        'dsds init [--agents] [--agents-file <path>] [--force]',
        '',
        'Scaffold a project-local dsds.config.mjs in the current directory,',
        'seeded from whatever DSDS_* / LINT_* environment variables are set',
        '(the env → file migration path).',
        '',
        '--agents        Also write a marker-delimited stanza teaching shell-only',
        '                agents the dsds commands (default target: AGENTS.md).',
        '--agents-file   Target a different file (e.g. CLAUDE.md). The stanza is',
        '                replaced between its markers on re-runs, appended otherwise.',
        '--force         Overwrite an existing dsds.config.mjs.',
      ].join('\n') + '\n'
    );
    return 0;
  }
  return runInit({ agents: values.agents, force: values.force, agentsFile: values['agents-file'] ?? 'AGENTS.md' });
}

async function porcelainCommand(name, argv) {
  const spec = PORCELAIN[name];
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: { ...BASE_OPTIONS, ...(spec.options ?? {}) },
      allowPositionals: true,
    }));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  if (values.help) {
    process.stdout.write(porcelainHelp(name, spec) + '\n');
    return 0;
  }

  let route;
  try {
    checkPositionals(spec, positionals);
    route = await spec.build(positionals, values);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`dsds: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  return executeTool(route.tool, route.args, values, spec.exitCode ? spec.exitCode.bind(spec) : null);
}

async function toolCommand(argv) {
  const name = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;

  // Listing, help, and flag parsing need only the catalog — no document loading.
  const { toolDefs } = createRegistryOnly();

  if (!name) {
    process.stdout.write(
      ['Available tools (dsds tool <tool-name> --help for inputs)', '', ...toolList(toolDefs)].join('\n') + '\n'
    );
    return 0;
  }

  const def = toolDefs.find(d => d.name === name);
  if (!def) {
    process.stderr.write(`dsds: unknown tool "${name}" — run \`dsds tool\` to list tools\n`);
    return 1;
  }

  const { options, flagProps } = optionsForTool(def);
  let values;
  try {
    ({ values } = parseArgs({ args: argv.slice(1), options, allowPositionals: false }));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  if (values.help) {
    process.stdout.write(toolHelp(def) + '\n');
    return 0;
  }

  let args;
  try {
    args = assembleArgs(values, flagProps);
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  return executeTool(name, args, values);
}

// Shared execution path for `dsds tool` and every porcelain command: load the
// runtime, dispatch through the registry, log, print, and map the exit code.
async function executeTool(name, args, values, exitCodeFn = null) {
  const { config, dispatch } = await createRuntime({ quiet: values.quiet, configPath: values.config });

  const startedAt = Date.now();
  const result = await dispatch(name, args);
  const code = exitCodeFn ? exitCodeFn(result, contentText(result)) : result.isError ? 1 : 0;

  // Mirrors the MCP server's log entry (plus a surface marker) so both
  // transports share one usage log. Only when DSDS_LOGS_DIR is explicitly set —
  // a one-shot CLI must not create ./logs directories in whatever cwd it runs.
  if (process.env.DSDS_LOGS_DIR && !values['no-log']) {
    const entry = { type: 'tool', tool: name, ok: !result.isError, durationMs: Date.now() - startedAt, surface: 'cli' };
    if (result.isError) {
      const msg = contentText(result);
      if (msg) entry.error = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
    }
    await writeLog(config.logsDir, entry);
  }

  return printResult(result, { json: values.json, tool: name, code });
}

function assembleArgs(values, flagProps) {
  let args = {};
  if (values['args-file']) {
    let raw;
    try {
      raw = readFileSync(values['args-file'], 'utf-8');
    } catch (err) {
      throw new Error(`--args-file: ${err.message}`);
    }
    args = parseJsonArgs(raw, '--args-file');
  }
  if (values.args) {
    args = { ...args, ...parseJsonArgs(values.args, '--args') };
  }
  return { ...args, ...coerceFlagValues(values, flagProps) };
}

function parseJsonArgs(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object of tool arguments`);
  }
  return parsed;
}
