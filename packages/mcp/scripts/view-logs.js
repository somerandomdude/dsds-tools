#!/usr/bin/env node
/**
 * View dsds-mcp usage logs in a readable format.
 *
 * Usage:
 *   node scripts/view-logs.js [options]
 *   npm run logs [-- options]
 *
 * Options:
 *   --type lint|chunk   Show only lint or chunk entries (default: both)
 *   --date YYYY-MM-DD   Show a single day
 *   --days N            Show last N days (default: 7)
 *   --summary           Totals only, no per-entry detail
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, '../logs');

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset:   s => isTTY ? `\x1b[0m${s}\x1b[0m`    : s,
  dim:     s => isTTY ? `\x1b[2m${s}\x1b[0m`     : s,
  bold:    s => isTTY ? `\x1b[1m${s}\x1b[0m`     : s,
  cyan:    s => isTTY ? `\x1b[36m${s}\x1b[0m`    : s,
  yellow:  s => isTTY ? `\x1b[33m${s}\x1b[0m`    : s,
  red:     s => isTTY ? `\x1b[31m${s}\x1b[0m`    : s,
  green:   s => isTTY ? `\x1b[32m${s}\x1b[0m`    : s,
  magenta: s => isTTY ? `\x1b[35m${s}\x1b[0m`    : s,
};

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = { type: 'all', days: 7, date: null, summary: false };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type'    && args[i + 1]) { opts.type    = args[++i]; }
  if (args[i] === '--date'    && args[i + 1]) { opts.date    = args[++i]; }
  if (args[i] === '--days'    && args[i + 1]) { opts.days    = parseInt(args[++i], 10); }
  if (args[i] === '--summary')                { opts.summary = true; }
}

// ─── File selection ───────────────────────────────────────────────────────────

async function getLogFiles() {
  let files;
  try {
    files = (await readdir(LOGS_DIR))
      .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort();
  } catch {
    console.error(`No logs directory found at ${LOGS_DIR}`);
    process.exit(1);
  }

  if (opts.date) {
    return files.filter(f => f.startsWith(opts.date));
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (opts.days - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return files.filter(f => f.slice(0, 10) >= cutoffStr);
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function classify(entry) {
  // Prefer the explicit discriminator; fall back to shape inference for log
  // files written before entries carried a `type` field.
  if (entry.type === 'tool' || entry.type === 'chunk' || entry.type === 'lint') return entry.type;
  if (entry.tool === 'dsds_get_chunk') return 'chunk';
  if (typeof entry.filesLinted === 'number') return 'lint';
  if (entry.tool) return 'tool';
  return null;
}

async function loadEntries(files) {
  const all = [];
  for (const file of files) {
    const date = file.slice(0, 10);
    const text = await readFile(resolve(LOGS_DIR, file), 'utf-8');
    for (const line of text.trim().split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        const type = classify(entry);
        if (type) all.push({ date, type, entry });
      } catch { /* skip malformed lines */ }
    }
  }
  return all;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatTime(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h % 12) || 12);
  return `${String(h12).padStart(2, ' ')}:${m} ${ampm}`;
}

function pad(s, len) {
  return String(s).padEnd(len);
}

function ruleSummary(violations) {
  const counts = {};
  for (const v of violations) {
    counts[v.ruleId] = (counts[v.ruleId] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => `${c.yellow(rule)} ×${n}`)
    .join('  ');
}

function printDayHeader(date) {
  const bar = '─'.repeat(60);
  console.log(`\n${c.bold(c.cyan(`─── ${date} ${bar.slice(date.length + 5)}`))}`);
}

function printLintEntry(entry) {
  const time = formatTime(entry.timestamp);
  const fileCount = entry.filesLinted === 1 ? '1 file ' : `${entry.filesLinted} files`;
  const violations = entry.totalRemainingViolations ?? entry.totalViolations ?? 0;
  const violStr = violations === 0
    ? c.green('✓ clean')
    : c.red(`${violations} violation${violations !== 1 ? 's' : ''}`);
  const fixedStr = (entry.filesFixed || 0) > 0 ? c.green(` (${entry.filesFixed} fixed)`) : '';

  console.log(`  ${c.dim(time)}  ${pad(fileCount, 8)} ${violStr}${fixedStr}`);

  if (!opts.summary && violations > 0 && entry.files) {
    for (const f of entry.files) {
      if (!f.violations?.length) continue;
      const fixTag = f.fixed ? c.green(' ✓fixed') : '';
      console.log(`           ${c.dim(f.filename)}${fixTag}`);
      console.log(`             ${ruleSummary(f.violations)}`);
    }
  }
}

function printChunkEntry(entry) {
  const time = formatTime(entry.timestamp);
  console.log(`  ${c.dim(time)}  ${c.magenta(pad(entry.identifier, 30))}  ${entry.name}`);
}

function printToolEntry(entry) {
  const time = formatTime(entry.timestamp);
  const status = entry.ok === false ? c.red('✗') : c.green('✓');
  const dur = typeof entry.durationMs === 'number' ? c.dim(` ${entry.durationMs}ms`) : '';
  console.log(`  ${c.dim(time)}  ${status} ${c.cyan(pad(entry.tool, 28))}${dur}`);
  if (entry.ok === false && entry.error) {
    console.log(`             ${c.red(entry.error.split('\n')[0])}`);
  }
}

// ─── Summary totals ───────────────────────────────────────────────────────────

function printSummary(entries) {
  const lintEntries  = entries.filter(e => e.type === 'lint');
  const chunkEntries = entries.filter(e => e.type === 'chunk');

  if ((opts.type === 'all' || opts.type === 'lint') && lintEntries.length) {
    const totalRuns       = lintEntries.length;
    const totalViolations = lintEntries.reduce((s, e) => s + (e.entry.totalRemainingViolations ?? e.entry.totalViolations ?? 0), 0);
    const totalFixed      = lintEntries.reduce((s, e) => s + (e.entry.filesFixed || 0), 0);

    const ruleCounts = {};
    for (const { entry } of lintEntries) {
      for (const f of (entry.files || [])) {
        for (const v of (f.violations || [])) {
          ruleCounts[v.ruleId] = (ruleCounts[v.ruleId] || 0) + 1;
        }
      }
    }
    const topRules = Object.entries(ruleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    console.log(`\n${c.bold('── Lint summary ──────────────────────────────────────')}`);
    console.log(`  Runs:        ${totalRuns}`);
    console.log(`  Violations:  ${totalViolations === 0 ? c.green('0') : c.red(String(totalViolations))}`);
    console.log(`  Fixed:       ${c.green(String(totalFixed))}`);
    if (topRules.length) {
      console.log(`  Top rules:`);
      for (const [rule, n] of topRules) {
        console.log(`    ${c.yellow(rule)}  ×${n}`);
      }
    }
  }

  if ((opts.type === 'all' || opts.type === 'chunk') && chunkEntries.length) {
    const totalAccesses = chunkEntries.length;
    const chunkCounts = {};
    for (const { entry } of chunkEntries) {
      const key = entry.identifier;
      if (!chunkCounts[key]) chunkCounts[key] = { name: entry.name, count: 0 };
      chunkCounts[key].count++;
    }
    const topChunks = Object.entries(chunkCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    console.log(`\n${c.bold('── Chunk summary ─────────────────────────────────────')}`);
    console.log(`  Total accesses: ${totalAccesses}`);
    console.log(`  Top chunks:`);
    for (const [id, { name, count }] of topChunks) {
      console.log(`    ${c.magenta(pad(id, 30))}  ×${count}  ${c.dim(name)}`);
    }
  }

  const toolEntries = entries.filter(e => e.type === 'tool');
  if ((opts.type === 'all' || opts.type === 'tool') && toolEntries.length) {
    const totalCalls = toolEntries.length;
    const errors = toolEntries.filter(e => e.entry.ok === false).length;
    const counts = {};
    for (const { entry } of toolEntries) {
      if (!counts[entry.tool]) counts[entry.tool] = { count: 0, errors: 0, reasons: {} };
      counts[entry.tool].count++;
      if (entry.ok === false) {
        counts[entry.tool].errors++;
        const reason = (entry.error || 'unknown error').split('\n')[0];
        counts[entry.tool].reasons[reason] = (counts[entry.tool].reasons[reason] || 0) + 1;
      }
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);

    console.log(`\n${c.bold('── Tool usage ────────────────────────────────────────')}`);
    console.log(`  Total calls: ${totalCalls}`);
    console.log(`  Errors:      ${errors === 0 ? c.green('0') : c.red(String(errors))}`);
    console.log(`  By tool:`);
    for (const [tool, { count, errors: errs, reasons }] of ranked) {
      const errTag = errs > 0 ? c.red(`  (${errs} err)`) : '';
      console.log(`    ${c.cyan(pad(tool, 28))}  ×${count}${errTag}`);
      for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${c.red('↳')} ${c.dim(`×${n}`)} ${reason}`);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const files = await getLogFiles();
  if (!files.length) {
    console.log('No log files found for the selected range.');
    return;
  }

  const entries = await loadEntries(files);
  const filtered = entries.filter(e =>
    opts.type === 'all' || e.type === opts.type
  );

  if (!filtered.length) {
    console.log(`No ${opts.type} entries found.`);
    return;
  }

  if (!opts.summary) {
    // In the combined "all" view, skip per-call tool lines — they'd duplicate the
    // chunk/lint detail and bury it. Tool calls still appear under `--type tool`
    // and always feed the Tool usage summary below.
    const detail = filtered.filter(e => e.type !== 'tool' || opts.type === 'tool');
    let currentDay = null;
    for (const { date, type, entry } of detail) {
      if (date !== currentDay) {
        printDayHeader(date);
        currentDay = date;
      }
      if (type === 'lint')  printLintEntry(entry);
      if (type === 'chunk') printChunkEntry(entry);
      if (type === 'tool')  printToolEntry(entry);
    }
  }

  printSummary(filtered);
  console.log('');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
