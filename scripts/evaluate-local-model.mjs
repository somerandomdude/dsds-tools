#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseArguments,
  scoreResponse,
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
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const text = payload.message?.content ?? '';
  const score = scoreResponse(text, evaluation);
  const result = { evaluation, model, startedAt, evidence, prompt, response: text, score };
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  printSummary(evaluation, model, score, outputPath);
  if (!score.pass) process.exitCode = 2;
}

function runCli(command, cwd) {
  const result = spawnSync(process.execPath, [resolve(root, 'packages/cli/src/index.js'), ...command, '--json'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`dsds ${command.join(' ')} failed: ${result.stderr || result.stdout}`);
  return { command, output: result.stdout.trim() };
}

function printSummary(evaluation, model, score, outputPath) {
  const mark = score.pass ? '✓' : '✗';
  process.stdout.write(`${mark} ${evaluation.id} — ${model}\n`);
  process.stdout.write(`  Valid JSON object: ${score.jsonValid ? 'yes' : 'no'}\n`);
  for (const [field, result] of Object.entries(score.fields)) {
    process.stdout.write(`  ${field}: ${result.pass ? 'pass' : 'fail'}\n`);
  }
  for (const failure of score.failures) {
    process.stdout.write(`  Failure: ${failure.message}\n`);
  }
  process.stdout.write(`  Result: ${score.pass ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`  Artifact: ${outputPath}\n`);
}
