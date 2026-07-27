#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildOllamaRequest,
  extractOllamaMetrics,
  formatDuration,
  HARNESS_VERSION,
  OLLAMA_ENDPOINT,
  OLLAMA_TIMEOUT_MS,
  parseArguments,
  scoreResponse,
  sha256,
  validateEvaluation,
} from './local-model-evaluation-core.mjs';

const root = resolve(import.meta.dirname, '..');

try {
  await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error('Usage: node scripts/evaluate-local-model.mjs --case <file> --consumer <dir> [--model <tag>] (--dry-run | --out <file> [--force])');
  process.exitCode = 1;
}

async function main() {
  const {
    casePath,
    consumer,
    model,
    outputPath,
    dryRun,
    force,
  } = parseArguments(process.argv.slice(2));

  const evaluation = validateEvaluation(JSON.parse(readFileSync(resolve(casePath), 'utf8')));
  const evidence = evaluation.evidence.map(command => runCli(command, consumer));
  const prompt = [
    'DSDS means Design System Documentation Spec. The evidence below is the only authority.',
    'If the requested example is absent, return {"status":"insufficient evidence"}.',
    '',
    'EVIDENCE',
    ...evidence.map(({ command, output }) => `--- dsds ${command.join(' ')} ---\n${output}`),
    '',
    `TASK: ${evaluation.task}`,
    evaluation.prompt,
  ].join('\n');

  if (dryRun) {
    process.stdout.write(`${prompt}\n`);
    return;
  }

  const resolvedOutputPath = resolve(outputPath);
  if (existsSync(resolvedOutputPath) && !force) {
    throw new Error(`Result already exists: ${resolvedOutputPath}. Pass --force to overwrite it.`);
  }

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const response = await requestOllama(model, prompt);
  const payload = await response.json();
  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();
  const text = payload.message?.content ?? '';
  const score = scoreResponse(text, evaluation);
  const timing = {
    startedAt,
    finishedAt,
    wallClockMs: finishedAtMs - startedAtMs,
    ollama: extractOllamaMetrics(payload),
  };
  const result = {
    harnessVersion: HARNESS_VERSION,
    evaluation,
    model: {
      requested: model,
      returned: payload.model ?? null,
    },
    evidence,
    prompt,
    promptSha256: sha256(prompt),
    response: text,
    timing,
    score,
  };
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  printSummary(evaluation, result.model, timing, score, outputPath);
  if (!score.pass) process.exitCode = 2;
}

function runCli(command, cwd) {
  const result = spawnSync(process.execPath, [resolve(root, 'packages/cli/src/index.js'), ...command, '--json'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`dsds ${command.join(' ')} failed: ${result.stderr || result.stdout}`);
  const output = result.stdout.trim();
  return { command, output, sha256: sha256(output) };
}

async function requestOllama(model, prompt) {
  let response;

  try {
    response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildOllamaRequest(model, prompt)),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error(`Ollama timed out after ${formatDuration(OLLAMA_TIMEOUT_MS)}`);
    }
    throw new Error(`Could not reach local Ollama at ${OLLAMA_ENDPOINT}: ${error.message}`);
  }

  if (!response.ok) {
    const details = await response.text();
    if (response.status === 404) {
      throw new Error(`Ollama could not load model "${model}": ${details}`);
    }
    throw new Error(`Ollama returned ${response.status}: ${details}`);
  }

  return response;
}

function printSummary(evaluation, model, timing, score, outputPath) {
  const mark = score.pass ? '✓' : '✗';
  const modelLabel = model.returned && model.returned !== model.requested
    ? `${model.requested} (returned ${model.returned})`
    : model.requested;
  process.stdout.write(`${mark} ${evaluation.id} — ${modelLabel}\n`);
  process.stdout.write(`  Valid JSON object: ${score.jsonValid ? 'yes' : 'no'}\n`);
  for (const [field, result] of Object.entries(score.fields)) {
    process.stdout.write(`  ${field}: ${result.pass ? 'pass' : 'fail'}\n`);
  }
  for (const failure of score.failures) {
    process.stdout.write(`  Failure: ${failure.message}\n`);
  }
  process.stdout.write(`  Duration: ${formatDuration(timing.wallClockMs)}\n`);
  if (timing.ollama.promptEvalCount !== null || timing.ollama.evalCount !== null) {
    process.stdout.write(`  Tokens: ${timing.ollama.promptEvalCount ?? 'unknown'} prompt, ${timing.ollama.evalCount ?? 'unknown'} generated\n`);
  }
  process.stdout.write(`  Result: ${score.pass ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`  Artifact: ${outputPath}\n`);
}
