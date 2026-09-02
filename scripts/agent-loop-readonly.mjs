#!/usr/bin/env node

// Phase 2 pilot: let the local model call dsds CLI tools itself via Ollama's
// tool-calling API, instead of us pre-fetching evidence into the prompt.
// Deliberately read-only — no file-write, shell, or edit tool is exposed.
// This is a trust-building step before any agent gets write access.

import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { OLLAMA_ENDPOINT, OLLAMA_TIMEOUT_MS } from './local-model-evaluation-core.mjs';

const root = resolve(import.meta.dirname, '..');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'dsds_search',
      description: 'Search design-system entities (components, foundations, patterns, tokens) by keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text, e.g. "date picker" or "button"' },
          kind: { type: 'string', description: 'Optional filter: component, foundation, pattern, token-group, guide, chunk' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dsds_get_block',
      description: 'Get one documentation block for a specific entity (e.g. its api, use-cases, states, guidelines, or accessibility block).',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Entity identifier, e.g. "button" or "skip-to-content"' },
          block: { type: 'string', description: 'Block kind, e.g. "api", "use-cases", "guidelines", "accessibility", "states", "imports"' },
        },
        required: ['identifier', 'block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dsds_get_context',
      description: 'Get the full agent-optimized context for one entity: rules, anti-patterns, prop table, and guidelines. Use when a single block is not enough.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Entity identifier, e.g. "button"' },
        },
        required: ['identifier'],
      },
    },
  },
];

const MAX_TURNS = 6;
const TOOL_NAMES = new Set(TOOLS.map(tool => tool.function.name));

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const { task, consumer, model } = parseArguments(process.argv.slice(2));
    const result = await runAgentLoop({ task, consumer, model, log: true });
    console.log(`\nFinal answer:\n${result.finalAnswer ?? '(no final answer — stopped after max turns)'}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error('Usage: node scripts/agent-loop-readonly.mjs --task "<question>" --consumer <dir> [--model <tag>]');
    process.exitCode = 1;
  }
}

// Runs the read-only tool-calling loop and returns the outcome for programmatic use
// (e.g. a scored evaluation harness), as well as being the CLI entrypoint above.
export async function runAgentLoop({ task, consumer, model, log = false }) {
  const messages = [
    {
      role: 'system',
      content: [
        'You are answering questions about a design system using only tools that query its real documentation.',
        'Call dsds_search to find entities, dsds_get_block or dsds_get_context to read their documentation.',
        'Never invent a prop, component, or behavior that the tools did not return.',
        'If a search returns no results, retry once with a single simple keyword (e.g. the component name itself) before concluding it does not exist.',
        'If a block lookup fails, retry with one of the block names the error message lists, rather than giving up.',
        'If the tools still show no matching entity after retrying, say so plainly instead of guessing.',
        'Once you have enough evidence, answer in plain text and stop calling tools.',
      ].join(' '),
    },
    { role: 'user', content: task },
  ];

  let toolCallCount = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    if (log) console.log(`\n--- turn ${turn} ---`);
    const payload = await requestOllama(model, messages);

    const toolCalls = extractToolCalls(payload.message);
    if (toolCalls.length) {
      messages.push(payload.message);
      for (const { name, args } of toolCalls) {
        toolCallCount += 1;
        if (log) console.log(`tool call: ${name}(${JSON.stringify(args)})`);
        const result = runTool(name, args, consumer);
        if (log) console.log(`tool result: ${truncate(result, 300)}`);
        messages.push({ role: 'tool', content: result });
      }
      continue;
    }

    return { finalAnswer: payload.message?.content ?? null, toolCallCount, turns: turn, messages };
  }

  return { finalAnswer: null, toolCallCount, turns: MAX_TURNS, messages, stoppedWithoutAnswer: true };
}

// This model tends to emit its tool call as plain JSON text in `content`
// instead of Ollama's structured `tool_calls` field. Accept both shapes.
function extractToolCalls(message) {
  if (message?.tool_calls?.length) {
    return message.tool_calls.map(call => ({ name: call.function.name, args: call.function.arguments }));
  }

  const content = message?.content?.trim();
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const name = parsed.name ?? parsed.tool;
    const args = parsed.arguments ?? parsed.args ?? {};
    if (TOOL_NAMES.has(name)) return [{ name, args }];
  } catch {
    // Not JSON — treat as a genuine final answer.
  }

  return [];
}

function runTool(name, args, consumer) {
  const cliPath = resolve(root, 'packages/cli/src/index.js');
  let cliArgs;

  if (name === 'dsds_search') {
    cliArgs = ['search', args.query];
    if (args.kind) cliArgs.push('--kind', args.kind);
  } else if (name === 'dsds_get_block') {
    cliArgs = ['get', args.identifier, '--block', args.block];
  } else if (name === 'dsds_get_context') {
    cliArgs = ['context', args.identifier];
  } else {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const result = spawnSync(process.execPath, [cliPath, ...cliArgs, '--json'], { cwd: consumer, encoding: 'utf8' });
  if (result.status !== 0) {
    return JSON.stringify({ error: result.stderr || result.stdout || 'CLI command failed' });
  }
  return result.stdout.trim();
}

async function requestOllama(model, messages) {
  let response;

  try {
    response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        tools: TOOLS,
        options: { temperature: 0, seed: 42, num_ctx: 8192 },
        messages,
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Could not reach local Ollama at ${OLLAMA_ENDPOINT}: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--task', '--consumer', '--model'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (!value) throw new Error(`Missing value for ${flag}`);
    options[flag] = value;
  }
  if (!options['--task']) throw new Error('Missing required option: --task');
  if (!options['--consumer']) throw new Error('Missing required option: --consumer');
  return {
    task: options['--task'],
    consumer: options['--consumer'],
    model: options['--model'] ?? 'qwen2.5-coder:7b',
  };
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
