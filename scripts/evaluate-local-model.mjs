#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const casePath = args.get('--case');
const consumer = args.get('--consumer');
const model = args.get('--model') ?? 'qwen2.5-coder:7b';
const outputPath = args.get('--out');
const dryRun = args.has('--dry-run');

if (!casePath || !consumer || (!dryRun && !outputPath)) {
  console.error('Usage: node scripts/evaluate-local-model.mjs --case <file> --consumer <dir> [--model <tag>] (--dry-run | --out <file>)');
  process.exit(1);
}

const evaluation = JSON.parse(readFileSync(resolve(casePath), 'utf8'));
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
  process.exit(0);
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
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);

function runCli(command, cwd) {
  const result = spawnSync(process.execPath, [resolve(root, 'packages/cli/src/index.js'), ...command, '--json'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`dsds ${command.join(' ')} failed: ${result.stderr || result.stdout}`);
  return { command, output: result.stdout.trim() };
}

function scoreResponse(text, evaluation) {
  const comparable = responseStrings(text).join('\n');
  const requiredMissing = evaluation.requiredLiterals.filter(value => !comparable.includes(value));
  const forbiddenFound = evaluation.forbiddenLiterals.filter(value => comparable.includes(value));
  return { pass: requiredMissing.length === 0 && forbiddenFound.length === 0, requiredMissing, forbiddenFound };
}

function responseStrings(text) {
  try {
    const value = JSON.parse(text);
    return collectStrings(value);
  } catch {
    return [text];
  }
}

function collectStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
}
