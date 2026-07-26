#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  formatDuration,
  summarizeSuite,
} from './local-model-evaluation-core.mjs';

const root = resolve(import.meta.dirname, '..');

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error('Usage: node scripts/evaluate-local-model-suite.mjs --consumer <dir> [--model <tag>] [--runs <count>] [--resume <result-dir>]');
  process.exitCode = 1;
}

function main() {
  const options = parseSuiteArguments(process.argv.slice(2));
  const caseDir = resolve(root, 'evaluations/cases');
  const casePaths = readdirSync(caseDir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => resolve(caseDir, file));
  if (casePaths.length === 0) throw new Error(`No evaluation cases found in ${caseDir}`);

  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputDir = options.resume
    ? resolve(options.resume)
    : resolve(root, 'evaluations/results', timestamp);
  if (options.resume && !existsSync(outputDir)) {
    throw new Error(`Resume directory does not exist: ${outputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });

  const results = [];
  for (const casePath of casePaths) {
    const evaluation = JSON.parse(readFileSync(casePath, 'utf8'));
    for (let run = 1; run <= options.runs; run += 1) {
      const outputPath = resolve(outputDir, `${evaluation.id}-run-${run}.json`);
      if (existsSync(outputPath)) {
        const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
        if (JSON.stringify(existing.evaluation) !== JSON.stringify(evaluation)) {
          throw new Error(`Cannot resume ${evaluation.id} run ${run}: case definition changed`);
        }
        if (existing.model?.requested !== options.model) {
          throw new Error(`Cannot resume ${evaluation.id} run ${run}: model changed`);
        }
        results.push(existing);
        process.stdout.write(`Reusing ${evaluation.id} (${run}/${options.runs})... ${existing.score.pass ? 'PASS' : 'FAIL'}\n`);
        continue;
      }
      process.stdout.write(`Running ${evaluation.id} (${run}/${options.runs})... `);
      const completed = spawnSync(process.execPath, [
        resolve(root, 'scripts/evaluate-local-model.mjs'),
        '--case', casePath,
        '--consumer', options.consumer,
        '--model', options.model,
        '--out', outputPath,
      ], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });

      if (![0, 2].includes(completed.status)) {
        process.stdout.write('ERROR\n');
        throw new Error(
          `Harness stopped at ${basename(casePath)} run ${run}: ${completed.stderr || completed.stdout}`,
        );
      }

      const result = JSON.parse(readFileSync(outputPath, 'utf8'));
      results.push(result);
      process.stdout.write(`${result.score.pass ? 'PASS' : 'FAIL'} (${formatDuration(result.timing.wallClockMs)})\n`);
    }
  }

  const summary = summarizeSuite(results);
  const summaryPath = resolve(outputDir, 'summary.json');
  writeFileSync(summaryPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: options.model,
    runsPerCase: options.runs,
    outputDir,
    ...summary,
  }, null, 2)}\n`, 'utf8');

  printSummary(summary, summaryPath);
  if (!summary.pass) process.exitCode = 2;
}

function parseSuiteArguments(argv) {
  const values = new Map();
  const allowed = new Set(['--consumer', '--model', '--runs', '--resume']);

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    values.set(flag, value);
  }

  const consumer = values.get('--consumer');
  if (!consumer) throw new Error('Missing required option: --consumer');
  const runs = Number(values.get('--runs') ?? 1);
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');

  return {
    consumer,
    model: values.get('--model') ?? 'qwen2.5-coder:7b',
    runs,
    resume: values.get('--resume'),
  };
}

function printSummary(summary, summaryPath) {
  process.stdout.write('\nCase                         Stratum      Passes  Rate    Median   Failure\n');
  process.stdout.write('---------------------------  -----------  ------  ------  -------  --------------------------\n');
  for (const item of summary.cases) {
    const row = [
      item.id.padEnd(27),
      item.stratum.padEnd(11),
      `${item.passes}/${item.runs}`.padEnd(6),
      percent(item.passRate).padEnd(6),
      formatDuration(item.medianDurationMs).padEnd(7),
      item.failureCategories.join(', ') || '—',
    ];
    process.stdout.write(`${row.join('  ')}\n`);
  }
  process.stdout.write(`\nSupported: ${summary.supported.passes}/${summary.supported.runs} (${percent(summary.supported.passRate)})\n`);
  process.stdout.write(`Abstention: ${summary.unsupported.passes}/${summary.unsupported.runs} (${percent(summary.unsupported.passRate)})\n`);
  process.stdout.write(`Weighted score: ${percent(summary.weightedScore)}\n`);
  process.stdout.write(`Readiness gate: ${summary.pass ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`Summary artifact: ${summaryPath}\n`);
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
