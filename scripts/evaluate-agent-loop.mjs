#!/usr/bin/env node

// Scored suite for the read-only agent loop (Phase 2 pilot). Unlike the
// Phase 1 harness, evidence is not pre-fetched — the model decides which
// tools to call. Scoring is looser (literal presence in free text) because
// we cannot constrain the final answer to strict JSON without also
// constraining how the model is allowed to reason about tool use.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAgentLoop } from './agent-loop-readonly.mjs';

const root = resolve(import.meta.dirname, '..');

// A model correctly abstaining will often still say the searched-for name
// out loud ("there is no Accordion component") — so forbidding that literal
// would penalize the correct behavior. Abstention is instead judged by a
// negation signal in the answer, not by the absence of the search term.
const NEGATION_PATTERN = /\b(no|not|n't|doesn't|does not|isn't|insufficient|unavailable|nothing)\b/i;

try {
  await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error('Usage: node scripts/evaluate-agent-loop.mjs --consumer <dir> [--model <tag>] [--out <dir>]');
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const caseDir = resolve(root, 'evaluations/agent-cases');
  const casePaths = readdirSync(caseDir).filter(file => file.endsWith('.json')).sort().map(file => resolve(caseDir, file));
  if (casePaths.length === 0) throw new Error(`No cases found in ${caseDir}`);

  const outputDir = resolve(options.out ?? resolve(root, 'evaluations/results/agent-loop-pilot'));
  mkdirSync(outputDir, { recursive: true });

  const results = [];
  for (const casePath of casePaths) {
    const evaluation = JSON.parse(readFileSync(casePath, 'utf8'));
    process.stdout.write(`Running ${evaluation.id}... `);
    const startedAtMs = Date.now();
    const outcome = await runAgentLoop({ task: evaluation.task, consumer: options.consumer, model: options.model, log: false });
    const wallClockMs = Date.now() - startedAtMs;
    const score = scoreOutcome(outcome, evaluation);
    results.push({ evaluation, outcome, score, wallClockMs });
    writeFileSync(
      resolve(outputDir, `${evaluation.id}.json`),
      `${JSON.stringify({ evaluation, outcome, score, wallClockMs }, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(`${score.pass ? 'PASS' : 'FAIL'} (${outcome.toolCallCount} tool calls, ${(wallClockMs / 1000).toFixed(1)}s)\n`);
  }

  printSummary(results);
}

function scoreOutcome(outcome, evaluation) {
  const failures = [];
  const answer = (outcome.finalAnswer ?? '').toLowerCase();

  if (outcome.stoppedWithoutAnswer) failures.push('stopped_without_answer');
  if (outcome.toolCallCount === 0) failures.push('ungrounded_no_tool_call');

  if (evaluation.stratum === 'unsupported') {
    if (!NEGATION_PATTERN.test(answer)) failures.push('no_abstention_signal');
    return { pass: failures.length === 0, failures };
  }

  for (const literal of evaluation.expect.requiredLiterals ?? []) {
    if (!answer.includes(literal.toLowerCase())) failures.push(`missing_required:${literal}`);
  }
  for (const literal of evaluation.expect.forbiddenLiterals ?? []) {
    if (answer.includes(literal.toLowerCase())) failures.push(`forbidden_present:${literal}`);
  }

  return { pass: failures.length === 0, failures };
}

function printSummary(results) {
  const supported = results.filter(r => r.evaluation.stratum === 'supported');
  const unsupported = results.filter(r => r.evaluation.stratum === 'unsupported');
  const passRate = list => (list.length === 0 ? 0 : list.filter(r => r.score.pass).length / list.length);
  const supportedRate = passRate(supported);
  const unsupportedRate = passRate(unsupported);
  const weighted = supportedRate * 0.8 + unsupportedRate * 0.2;

  console.log('\nCase                          Stratum      Tools  Result  Failures');
  console.log('----------------------------  -----------  -----  ------  --------------------------');
  for (const r of results) {
    console.log(
      `${r.evaluation.id.padEnd(30)}${r.evaluation.stratum.padEnd(13)}${String(r.outcome.toolCallCount).padEnd(7)}${(r.score.pass ? 'PASS' : 'FAIL').padEnd(8)}${r.score.failures.join(', ') || '—'}`,
    );
  }

  console.log(`\nSupported: ${supported.filter(r => r.score.pass).length}/${supported.length} (${(supportedRate * 100).toFixed(1)}%)`);
  console.log(`Abstention: ${unsupported.filter(r => r.score.pass).length}/${unsupported.length} (${(unsupportedRate * 100).toFixed(1)}%)`);
  console.log(`Weighted score: ${(weighted * 100).toFixed(1)}%`);
  console.log(`Readiness gate: ${supportedRate >= 0.8 && unsupportedRate === 1 ? 'PASS' : 'FAIL'}`);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--consumer', '--model', '--out'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (!value) throw new Error(`Missing value for ${flag}`);
    options[flag] = value;
  }
  if (!options['--consumer']) throw new Error('Missing required option: --consumer');
  return { consumer: options['--consumer'], model: options['--model'] ?? 'qwen2.5-coder:7b', out: options['--out'] };
}
