#!/usr/bin/env node

// Phase 2, step 2: a bounded file-write pilot. Builds on the read-only loop
// (agent-loop-readonly.mjs), which cleared the 80/100 readiness gate at 20
// cases on qwen2.5-coder:14b. This adds exactly one new capability — writing
// a file — and constrains it hard:
//   - the model may only write inside evaluations/agent-write-pilot/
//   - it may only create new files, never overwrite existing ones
//   - filenames may not contain path separators or ".." (no traversal)
// Every write is logged. Nothing here is treated as accepted until a human
// reviews the resulting file.

import { resolve, basename } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { OLLAMA_ENDPOINT, OLLAMA_TIMEOUT_MS } from './local-model-evaluation-core.mjs';

const root = resolve(import.meta.dirname, '..');
const SANDBOX_DIR = resolve(root, 'evaluations/agent-write-pilot');
mkdirSync(SANDBOX_DIR, { recursive: true });

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'dsds_search',
      description: 'Search design-system entities (components, foundations, patterns, tokens) by keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
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
          identifier: { type: 'string' },
          block: { type: 'string' },
        },
        required: ['identifier', 'block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dsds_get_context',
      description: 'Get the full agent-optimized context for one entity: rules, anti-patterns, prop table, and guidelines.',
      parameters: {
        type: 'object',
        properties: { identifier: { type: 'string' } },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file with the given content. Can only create new files inside a sandboxed output directory — cannot overwrite an existing file or write anywhere else.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename only, no directories, e.g. "my-case.json"' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['filename', 'content'],
      },
    },
  },
];

const MAX_TURNS = 8;
const TOOL_NAMES = new Set(TOOLS.map(tool => tool.function.name));

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const { task, consumer, model } = parseArguments(process.argv.slice(2));
    await runWritePilot({ task, consumer, model, log: true });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error('Usage: node scripts/agent-loop-writepilot.mjs --task "<instruction>" --consumer <dir> [--model <tag>]');
    process.exitCode = 1;
  }
}

export async function runWritePilot({ task, consumer, model, log = false }) {
  const messages = [
    {
      role: 'system',
      content: [
        'You are documenting a design system using only tools that query its real documentation, plus one tool to write a file.',
        'Ground every claim in tool output before writing anything. Never invent a prop, component, or behavior the tools did not return.',
        'Call write_file exactly once, only after you have gathered enough evidence, and only with a filename (no directories).',
        'If a block or search lookup fails, retry once with a simpler term or one of the block names the error lists before giving up.',
      ].join(' '),
    },
    { role: 'user', content: task },
  ];

  let toolCallCount = 0;
  let writtenFile = null;

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
        if (name === 'write_file' && !result.startsWith('{"error"')) writtenFile = args.filename;
        messages.push({ role: 'tool', content: result });
      }
      continue;
    }

    if (log) console.log(`\nFinal message:\n${payload.message?.content ?? '(empty)'}`);
    return { finalAnswer: payload.message?.content ?? null, toolCallCount, writtenFile, turns: turn };
  }

  return { finalAnswer: null, toolCallCount, writtenFile, turns: MAX_TURNS, stoppedWithoutAnswer: true };
}

function extractToolCalls(message) {
  if (message?.tool_calls?.length) {
    return message.tool_calls.map(call => ({ name: call.function.name, args: call.function.arguments }));
  }
  let content = message?.content?.trim();
  if (!content) return [];
  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) content = fenced[1];
  try {
    const parsed = JSON.parse(content);
    const name = parsed.name ?? parsed.tool;
    const args = parsed.arguments ?? parsed.args ?? {};
    if (TOOL_NAMES.has(name)) return [{ name, args }];
  } catch {
    // Not JSON — a genuine final answer.
  }
  return [];
}

function runTool(name, args, consumer) {
  if (name === 'write_file') return writeSandboxedFile(args);

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
  if (result.status !== 0) return JSON.stringify({ error: result.stderr || result.stdout || 'CLI command failed' });
  return result.stdout.trim();
}

function writeSandboxedFile({ filename, content }) {
  if (typeof filename !== 'string' || !filename) return JSON.stringify({ error: 'filename is required' });
  const safeName = basename(filename);
  if (safeName !== filename || safeName === '..' || safeName === '.') {
    return JSON.stringify({ error: 'filename must not contain directories or ".."' });
  }
  const target = resolve(SANDBOX_DIR, safeName);
  if (!target.startsWith(SANDBOX_DIR)) return JSON.stringify({ error: 'path escapes the sandbox directory' });
  if (existsSync(target)) return JSON.stringify({ error: `${safeName} already exists — cannot overwrite` });

  writeFileSync(target, content, 'utf8');
  return JSON.stringify({ ok: true, path: `evaluations/agent-write-pilot/${safeName}` });
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
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
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
  return { task: options['--task'], consumer: options['--consumer'], model: options['--model'] ?? 'qwen2.5-coder:14b' };
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
