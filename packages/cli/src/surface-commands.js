// The three MCP capability groups that used to be reachable only over the
// protocol: prompts, resources, and the server instructions.
//
// An MCP client gets these for free — slash commands, @-mentionable
// resources, and a standing instruction block. A shell-only agent got none of
// them, which was the last real gap between the two surfaces. Each command
// here reads the same shared surface (dsds-mcp/src/surface.js) the MCP server
// serves, so the two cannot drift.
//
// Output follows the CLI contract: payload on stdout, diagnostics on stderr,
// `--json` for an envelope. Exit codes: 0 success · 1 unknown name or usage
// error. Neither prompts nor resources have a "found problems" state, so
// exit 2 never applies here.

import { parseArgs } from 'node:util';
import { createRuntime } from './runtime.js';

const RESOURCE_PREFIX = 'dsds://entity/';

const BASE_OPTIONS = {
  json: { type: 'boolean' },
  config: { type: 'string' },
  quiet: { type: 'boolean' },
  help: { type: 'boolean' },
};

// {ok, command, exitCode, data|error} — the tool envelope's shape with the
// tool name swapped for the command name, since no tool ran.
function printPayload({ command, json, text, error = null }) {
  const exitCode = error ? 1 : 0;
  if (json) {
    const envelope = { ok: !error, command, exitCode };
    if (error) envelope.error = error;
    else envelope.data = text;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  } else if (error) {
    process.stderr.write(`dsds: ${error}\n`);
  } else {
    process.stdout.write(text + '\n');
  }
  return exitCode;
}

function parse(argv, extraOptions = {}) {
  return parseArgs({
    args: argv,
    options: { ...BASE_OPTIONS, ...extraOptions },
    allowPositionals: true,
  });
}

// ── dsds prompt ───────────────────────────────────────────────────────────────

export const PROMPT_HELP = [
  'dsds prompt [<name>] [--task <text>] [--json]',
  '',
  'The MCP prompts, on the command line. With no name, lists them; with a',
  'name, prints the rendered briefing an MCP client would insert.',
  '',
  'Options',
  '  --task <text>   The task or question, woven into the briefing',
  '',
  'The dsds-intro prompt only exists when intro documents are configured',
  '(introPaths / DSDS_INTRO_PATHS).',
].join('\n');

export async function runPrompt(argv) {
  let values, positionals;
  try {
    ({ values, positionals } = parse(argv, { task: { type: 'string' } }));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  if (values.help) {
    process.stdout.write(PROMPT_HELP + '\n');
    return 0;
  }
  if (positionals.length > 1) {
    process.stderr.write('dsds: usage: dsds prompt [<name>] [--task <text>]\n');
    return 1;
  }

  const name = positionals[0];

  // Listing needs the intro documents (the intro prompt is conditional on
  // them), so both paths load the full surface.
  const { surface } = await createRuntime({ quiet: values.quiet, configPath: values.config });
  const prompts = surface.listPrompts();

  if (!name) {
    if (values.json) {
      process.stdout.write(JSON.stringify({ ok: true, command: 'prompt', exitCode: 0, data: prompts }, null, 2) + '\n');
      return 0;
    }
    const width = Math.max(...prompts.map(p => p.name.length));
    const lines = ['Available prompts (dsds prompt <name> [--task <text>])', ''];
    for (const p of prompts) lines.push(`  ${p.name.padEnd(width)}  ${p.description}`);
    process.stdout.write(lines.join('\n') + '\n');
    return 0;
  }

  let rendered;
  try {
    rendered = surface.getPrompt(name, values.task ? { task: values.task } : {});
  } catch (err) {
    // The surface knows why it refused (an unknown name, or dsds-intro
    // without intro documents); the CLI adds what this project does offer.
    const known = prompts.map(p => p.name).join(', ');
    return printPayload({
      command: 'prompt',
      json: values.json,
      error: `${err.message}\nAvailable prompts: ${known}`,
    });
  }

  const text = rendered.messages.map(m => m.content?.text ?? '').join('\n\n');
  return printPayload({ command: 'prompt', json: values.json, text });
}

// ── dsds resource ─────────────────────────────────────────────────────────────

export const RESOURCE_HELP = [
  'dsds resource [<uri|identifier>] [--json]',
  '',
  'The MCP resources, on the command line. With no argument, lists every',
  'entity resource; with one, prints the entity JSON.',
  '',
  `A bare identifier is accepted as shorthand for ${RESOURCE_PREFIX}<identifier>.`,
].join('\n');

export async function runResource(argv) {
  let values, positionals;
  try {
    ({ values, positionals } = parse(argv));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  if (values.help) {
    process.stdout.write(RESOURCE_HELP + '\n');
    return 0;
  }
  if (positionals.length > 1) {
    process.stderr.write('dsds: usage: dsds resource [<uri|identifier>]\n');
    return 1;
  }

  const { surface } = await createRuntime({ quiet: values.quiet, configPath: values.config });
  const target = positionals[0];

  if (!target) {
    const resources = surface.listResources();
    if (values.json) {
      process.stdout.write(JSON.stringify({ ok: true, command: 'resource', exitCode: 0, data: resources }, null, 2) + '\n');
      return 0;
    }
    if (resources.length === 0) {
      process.stdout.write('No resources — no DSDS documents are loaded (check `paths` / DSDS_PATHS).\n');
      return 0;
    }
    const lines = [`${resources.length} resource${resources.length === 1 ? '' : 's'} (dsds resource <uri>)`, ''];
    for (const r of resources) lines.push(`  ${r.uri}  —  ${r.description}`);
    process.stdout.write(lines.join('\n') + '\n');
    return 0;
  }

  const uri = target.includes('://') ? target : `${RESOURCE_PREFIX}${encodeURIComponent(target)}`;
  const content = surface.readResource(uri);

  if (!content) {
    return printPayload({
      command: 'resource',
      json: values.json,
      error: `Resource not found: ${uri} — run \`dsds resource\` to list them`,
    });
  }

  if (values.json) {
    // The resource body is already JSON; hand back the parsed entity rather
    // than a JSON string inside JSON.
    let data;
    try {
      data = JSON.parse(content.text);
    } catch {
      data = content.text;
    }
    process.stdout.write(
      JSON.stringify({ ok: true, command: 'resource', exitCode: 0, uri: content.uri, mimeType: content.mimeType, data }, null, 2) + '\n'
    );
    return 0;
  }

  process.stdout.write(content.text + '\n');
  return 0;
}

// ── dsds instructions ─────────────────────────────────────────────────────────

export const INSTRUCTIONS_HELP = [
  'dsds instructions [--json]',
  '',
  'Print the agent instructions the MCP server hands its client on connect:',
  'the workflow rules, the tool map, and any configured intro documents.',
  '',
  'Read this first when working through the CLI — an MCP client receives it',
  'automatically, a shell does not.',
].join('\n');

export async function runInstructions(argv) {
  let values, positionals;
  try {
    ({ values, positionals } = parse(argv));
  } catch (err) {
    process.stderr.write(`dsds: ${err.message}\n`);
    return 1;
  }

  if (values.help) {
    process.stdout.write(INSTRUCTIONS_HELP + '\n');
    return 0;
  }
  if (positionals.length > 0) {
    process.stderr.write('dsds: usage: dsds instructions [--json]\n');
    return 1;
  }

  const { surface } = await createRuntime({ quiet: values.quiet, configPath: values.config });
  return printPayload({ command: 'instructions', json: values.json, text: surface.getInstructions() });
}

// ── Shared metadata ───────────────────────────────────────────────────────────

// Listed in `dsds help` and `dsds manifest` beside the porcelain commands.
export const SURFACE_COMMANDS = {
  prompt: {
    usage: 'dsds prompt [<name>] [--task <text>]',
    summary: 'MCP prompts: list them, or render one as a briefing',
  },
  resource: {
    usage: 'dsds resource [<uri|identifier>]',
    summary: 'MCP resources: list entity resources, or read one as JSON',
  },
  instructions: {
    usage: 'dsds instructions',
    summary: 'The agent instructions an MCP client receives on connect',
  },
};
