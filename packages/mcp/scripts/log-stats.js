#!/usr/bin/env node
/**
 * Aggregate dsds usage logs into rankings: which entries, tools and lint rules
 * get hit the most.
 *
 * Complements `view-logs.js`, which prints entries chronologically. This one
 * never prints an individual entry — it only counts.
 *
 * Usage:
 *   node scripts/log-stats.js [options]
 *   npm run logs:top [-- options]
 *
 * Options:
 *   --section NAME      kinds|entries|sections|tools|errors|lint|jev|days|all  (default: all)
 *   --kind NAME         Restrict entry/section rankings to one entity kind
 *   --entry ID          Restrict the section ranking to one entry
 *   --top N             Rows per ranking (default: 20, 0 = no limit)
 *   --days N            Last N days
 *   --since YYYY-MM-DD  Earliest day to include
 *   --until YYYY-MM-DD  Latest day to include
 *   --date YYYY-MM-DD   A single day (shorthand for --since X --until X)
 *   --dir PATH          Extra log directory; repeatable
 *   --only-dir PATH     Use only this directory; repeatable
 *   --json              Machine-readable output, no formatting
 *   --help
 *
 * Log directories searched by default:
 *   packages/mcp/logs        the MCP server's own log dir
 *   <repo root>/logs         the pre-0.4 location, still holds Jun–Jul history
 *   $DSDS_LOGS_DIR           when set (the CLI only logs when it is)
 */

import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DIRS = [
  resolve(__dirname, '../logs'),
  resolve(__dirname, '../../../logs'),
  process.env.DSDS_LOGS_DIR ? resolve(process.env.DSDS_LOGS_DIR) : null,
].filter(Boolean);

const SECTIONS = ['kinds', 'entries', 'sections', 'tools', 'errors', 'lint', 'jev', 'days'];

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  dim:     s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
  bold:    s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  cyan:    s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  yellow:  s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  red:     s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:   s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  magenta: s => isTTY ? `\x1b[35m${s}\x1b[0m` : s,
};

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = {
  section: 'all', top: 20, days: null, entry: null, kind: null,
  since: null, until: null, json: false,
  dirs: [...DEFAULT_DIRS], onlyDirs: [],
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--section'  && args[i + 1]) { opts.section = args[++i]; }
  else if (a === '--entry' && args[i + 1]) { opts.entry = args[++i].toLowerCase(); }
  else if (a === '--kind' && args[i + 1]) { opts.kind = args[++i].toLowerCase(); }
  else if (a === '--top' && args[i + 1]) { opts.top = parseInt(args[++i], 10); }
  else if (a === '--days'  && args[i + 1]) { opts.days  = parseInt(args[++i], 10); }
  else if (a === '--since' && args[i + 1]) { opts.since = args[++i]; }
  else if (a === '--until' && args[i + 1]) { opts.until = args[++i]; }
  else if (a === '--date'  && args[i + 1]) { opts.since = opts.until = args[++i]; }
  else if (a === '--dir'   && args[i + 1]) { opts.dirs.push(resolve(args[++i])); }
  else if (a === '--only-dir' && args[i + 1]) { opts.onlyDirs.push(resolve(args[++i])); }
  else if (a === '--json') { opts.json = true; }
  else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  else { console.error(`Unknown option: ${a}\nTry --help`); process.exit(2); }
}

if (opts.onlyDirs.length) opts.dirs = opts.onlyDirs;
if (opts.section !== 'all' && !SECTIONS.includes(opts.section)) {
  console.error(`Unknown --section "${opts.section}". Expected: ${SECTIONS.join('|')}|all`);
  process.exit(2);
}
if (opts.days != null) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (opts.days - 1));
  const s = cutoff.toISOString().slice(0, 10);
  // An explicit --since wins; --days only ever narrows.
  opts.since = opts.since && opts.since > s ? opts.since : s;
}

/** The block comment at the top of this file is the help text. */
function printHelp() {
  const raw = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
  console.log(
    raw.slice(raw.indexOf('/**') + 3, raw.indexOf('*/'))
      .split('\n').map(l => l.replace(/^\s*\* ?/, '')).join('\n').trim()
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

async function loadRecords(dirs) {
  const records = [];
  const sources = [];
  let malformed = 0;

  for (const dir of dirs) {
    let files;
    try {
      files = (await readdir(dir)).map(f => DATE_FILE.exec(f)).filter(Boolean);
    } catch {
      continue; // a missing log dir is normal, not an error
    }
    let kept = 0;
    for (const [file, date] of files.map(m => [m[0], m[1]]).sort()) {
      if (opts.since && date < opts.since) continue;
      if (opts.until && date > opts.until) continue;
      const text = await readFile(resolve(dir, file), 'utf-8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          records.push({ date, entry: JSON.parse(line) });
          kept++;
        } catch { malformed++; }
      }
    }
    if (kept) sources.push({ dir, records: kept });
  }
  return { records, sources, malformed };
}

/**
 * Entries written before 0.3 carry no `type`. Recover it from shape so the
 * Jun–Jul history is not silently dropped from the counts.
 */
function classify(e) {
  if (e.type === 'tool' || e.type === 'chunk' || e.type === 'lint' || e.type === 'jev') return e.type;
  if (e.identifier) return 'chunk';
  if (typeof e.filesLinted === 'number') return 'lint';
  if (e.tool) return 'tool';
  return null;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

// Records written before 0.5 carry no `entityKind`, but only dsds_get_chunk
// recorded an identifier then, so the kind is recoverable. The dagger keeps
// the inference visible rather than passing it off as logged fact.
const INFERRED_KIND = 'chunk †';
function entityKindOf(e) {
  if (e.entityKind) return e.entityKind;
  if (e.tool === 'dsds_get_chunk') return INFERRED_KIND;
  return '(kind not recorded)';
}

function aggregate(records) {
  const entries = new Map();   // identifier -> { count, name }
  const tools   = new Map();   // tool -> { count, errors, durations }
  const errors  = new Map();   // message -> { count, tools:Set }
  const rules   = new Map();   // ruleId -> count
  const days    = new Map();   // date -> count
  const kinds   = new Map();   // entityKind -> { count, entries:Map, chars, sections }
  const secs    = new Map();   // "entry/section-label" -> { count, entry, label, tools:Set }
  const bare    = new Map();   // section-label -> count, across all entries
  const surfaces = new Map();  // 'mcp'|'cli' -> count
  const jev     = new Map();   // guideline -> { n, violations, review, scored, correct }
  let jevCalls = 0;
  let jevTokens = 0;

  for (const { date, entry } of records) {
    const type = classify(entry);
    if (!type) continue;
    days.set(date, (days.get(date) || 0) + 1);

    if (entry.identifier) {
      const kind = entityKindOf(entry);
      if (opts.kind && kind.toLowerCase() !== opts.kind) continue;

      const k = kinds.get(kind) || { count: 0, entries: new Map(), chars: 0, sections: 0 };
      k.count++;
      if (typeof entry.chars === 'number') k.chars += entry.chars;
      k.sections += (entry.sections?.length || 0) + (entry.parts?.length || 0);
      const ke = k.entries.get(entry.identifier) || { count: 0, name: entry.name };
      ke.count++; ke.name ||= entry.name;
      k.entries.set(entry.identifier, ke);
      kinds.set(kind, k);

      const cur = entries.get(entry.identifier) || { count: 0, name: null, tools: new Set(), chars: 0, sections: 0, kind };
      cur.count++;
      cur.name ||= entry.name || null;
      if (entry.tool) cur.tools.add(entry.tool);
      if (typeof entry.chars === 'number') cur.chars += entry.chars;
      cur.sections += entry.sections?.length || 0;
      entries.set(entry.identifier, cur);

      // `sections` are what the entry declares; `parts` are generated views
      // (props table, traits, relationships). Both are content that was
      // served, so both are ranked — `parts` prefixed so they stay legible.
      const served = [
        ...(entry.sections || []),
        ...(entry.parts || []).map(p => `:${p}`),
      ];
      const inScope = !opts.entry || entry.identifier.toLowerCase() === opts.entry;
      for (const label of served) {
        bare.set(label, (bare.get(label) || 0) + 1);
        if (!inScope) continue;
        const key = `${entry.identifier}\u0000${label}`;
        const s2 = secs.get(key) || { count: 0, entry: entry.identifier, label, tools: new Set() };
        s2.count++;
        if (entry.tool) s2.tools.add(entry.tool);
        secs.set(key, s2);
      }
    }

    if (type === 'tool') {
      const cur = tools.get(entry.tool) || { count: 0, errors: 0, durations: [] };
      cur.count++;
      if (entry.ok === false) cur.errors++;
      if (typeof entry.durationMs === 'number') cur.durations.push(entry.durationMs);
      tools.set(entry.tool, cur);

      const surface = entry.surface || 'mcp';
      surfaces.set(surface, (surfaces.get(surface) || 0) + 1);

      if (entry.error) {
        const key = normalizeError(entry.error);
        const cur2 = errors.get(key) || { count: 0, tools: new Set() };
        cur2.count++;
        cur2.tools.add(entry.tool);
        errors.set(key, cur2);
      }
    }

    if (type === 'jev' && Array.isArray(entry.judgments)) {
      jevCalls++;
      jevTokens += entry.inputTokens || 0;
      for (const j of entry.judgments) {
        const g = j.guideline || '(unnamed)';
        const row = jev.get(g) || { n: 0, violations: 0, review: 0, scored: 0, correct: 0 };
        row.n++;
        if (j.probability >= 0.8) row.violations++;
        else if (j.probability > 0.2) row.review++;
        if (j.label != null) {
          row.scored++;
          if ((j.probability >= 0.8) === j.label) row.correct++;
        }
        jev.set(g, row);
      }
    }

    if (type === 'lint' && Array.isArray(entry.files)) {
      for (const f of entry.files) {
        for (const v of f.violations || []) {
          const id = v.ruleId || '(no rule id)';
          rules.set(id, (rules.get(id) || 0) + 1);
        }
      }
    }
  }

  return { entries, tools, errors, rules, days, surfaces, secs, bare, kinds, jev, jevCalls, jevTokens };
}

/** Collapse an error to its first line so variants of one failure group. */
function normalizeError(msg) {
  const first = String(msg).split('\n').find(l => l.trim()) || String(msg);
  const clean = first.replace(/^#+\s*/, '').trim();
  return clean.length > 88 ? clean.slice(0, 88) + '…' : clean;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function bar(n, max, width = 22) {
  if (!max) return '';
  const filled = Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width));
  return c.dim('█'.repeat(filled));
}

function limit(rows) {
  return opts.top > 0 ? rows.slice(0, opts.top) : rows;
}

function heading(title, subtitle) {
  const line = '─'.repeat(Math.max(4, 66 - title.length));
  console.log(`\n${c.bold(c.cyan(`── ${title} ${line}`))}`);
  if (subtitle) console.log(`   ${c.dim(subtitle)}`);
  console.log('');
}

function rankKinds(agg) {
  const rows = [...agg.kinds].sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((s, [, v]) => s + v.count, 0);
  heading('Content access by entity kind',
    `${total.toLocaleString()} accesses across ${rows.length} kind${rows.length === 1 ? '' : 's'}` +
    (opts.kind ? `  ·  filtered to "${opts.kind}"` : ''));
  if (!rows.length) return console.log(c.dim('   no content-access records in range'));
  const max = rows[0][1].count;
  console.log(c.dim('     #  access      %  entries  chars/call  kind'));
  rows.forEach(([kind, v], i) => {
    const avg = v.chars ? Math.round(v.chars / v.count).toLocaleString() : '—';
    console.log(
      `   ${String(i + 1).padStart(3)}. ${String(v.count).padStart(6)} ${String((100 * v.count / total).toFixed(1) + '%').padStart(6)} ` +
      `${String(v.entries.size).padStart(8)} ${String(avg).padStart(11)}  ${c.green(kind.padEnd(22))} ${bar(v.count, max, 14)}`
    );
    for (const [id, e] of [...v.entries].sort((a, b) => b[1].count - a[1].count).slice(0, opts.top > 0 ? 5 : v.entries.size)) {
      console.log(`        ${String(e.count).padStart(6)}  ${c.magenta(id.padEnd(28))} ${c.dim(e.name ?? '')}`);
    }
    if (opts.top > 0 && v.entries.size > 5) console.log(c.dim(`        … ${v.entries.size - 5} more (--top 0 for all)`));
  });
  if (agg.kinds.has(INFERRED_KIND)) {
    console.log(c.dim('\n   † kind inferred: before 0.5 only dsds_get_chunk recorded an identifier.'));
  }
}

function rankEntries(agg) {
  const rows = [...agg.entries].sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((s, [, v]) => s + v.count, 0);
  heading('Most accessed entries', `${total.toLocaleString()} accesses across ${rows.length} identifiers`);
  if (!rows.length) return console.log(c.dim('   no entry-level records in range'));
  const max = rows[0][1].count;
  let cum = 0;
  limit(rows).forEach(([id, v], i) => {
    cum += v.count;
    const pct = total ? (100 * v.count / total) : 0;
    console.log(
      `   ${String(i + 1).padStart(3)}. ${String(v.count).padStart(6)}  ${String(pct.toFixed(1) + '%').padStart(6)}  ` +
      `${String((100 * cum / total).toFixed(1) + '%').padStart(6)}  ${c.magenta(id.padEnd(26))} ${bar(v.count, max)} ${c.dim(v.name || '')}`
    );
  });
  if (opts.top > 0 && rows.length > opts.top) {
    console.log(c.dim(`   … ${rows.length - opts.top} more (--top 0 for all)`));
  }
}

function rankSections(agg) {
  const rows = [...agg.secs.values()].sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const scope = opts.entry ? `entry "${opts.entry}"` : 'all entries';
  heading('Most accessed sections', `${total.toLocaleString()} section reads across ${rows.length} entry+section pairs  ·  ${scope}`);
  if (!rows.length) {
    console.log(c.dim('   no section-level records in range.'));
    console.log(c.dim('   Section detail starts with the `type: "access"` records added in 0.5 —'));
    console.log(c.dim('   older logs name the entry but not which part of it was served.'));
    return;
  }
  const max = rows[0].count;
  limit(rows).forEach((r, i) => {
    // A ':' prefix marks a generated view rather than a declared section.
    const label = r.label.startsWith(':') ? c.cyan(r.label.slice(1)) : c.yellow(r.label);
    console.log(
      `   ${String(i + 1).padStart(3)}. ${String(r.count).padStart(6)}  ${String((100 * r.count / total).toFixed(1) + '%').padStart(6)}  ` +
      `${c.magenta(r.entry.padEnd(24))} ${label.padEnd(46)} ${bar(r.count, max, 12)}`
    );
  });
  if (opts.top > 0 && rows.length > opts.top) {
    console.log(c.dim(`   … ${rows.length - opts.top} more (--top 0 for all)`));
  }

  // The same labels pooled across entries: which KIND of content agents read,
  // independent of which component they were reading it for.
  const pooled = [...agg.bare].sort((a, b) => b[1] - a[1]);
  const pTotal = pooled.reduce((s, [, n]) => s + n, 0);
  console.log(`\n   ${c.bold('Pooled across entries')}`);
  for (const [label, n] of pooled.slice(0, 12)) {
    const shown = label.startsWith(':') ? c.cyan(label.slice(1) + ' (generated)') : c.yellow(label);
    console.log(`        ${String(n).padStart(6)}  ${String((100 * n / pTotal).toFixed(1) + '%').padStart(6)}  ${shown}`);
  }
}

function rankTools(agg) {
  const rows = [...agg.tools].sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((s, [, v]) => s + v.count, 0);
  const surf = [...agg.surfaces].map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', ');
  heading('Most called tools', `${total.toLocaleString()} calls across ${rows.length} tools  ·  ${surf}`);
  if (!rows.length) return console.log(c.dim('   no tool records in range'));
  const max = rows[0][1].count;
  console.log(c.dim('     #  calls      %   err%     p50     p95  tool'));
  limit(rows).forEach(([tool, v], i) => {
    const d = v.durations.slice().sort((a, b) => a - b);
    const p50 = percentile(d, 0.5), p95 = percentile(d, 0.95);
    const errPct = v.count ? (100 * v.errors / v.count) : 0;
    const errStr = v.errors === 0 ? c.dim('   —')
      : (errPct >= 10 ? c.red : c.yellow)(`${errPct.toFixed(1)}%`.padStart(5));
    console.log(
      `   ${String(i + 1).padStart(3)}. ${String(v.count).padStart(6)} ${String((100 * v.count / total).toFixed(1) + '%').padStart(6)}  ${errStr}  ` +
      `${(p50 == null ? '—' : p50 + 'ms').padStart(7)} ${(p95 == null ? '—' : p95 + 'ms').padStart(7)}  ${tool.padEnd(26)} ${bar(v.count, max, 14)}`
    );
  });
  if (opts.top > 0 && rows.length > opts.top) {
    console.log(c.dim(`   … ${rows.length - opts.top} more (--top 0 for all)`));
  }
}

function rankErrors(agg) {
  const rows = [...agg.errors].sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((s, [, v]) => s + v.count, 0);
  heading('Most common errors', `${total.toLocaleString()} failed calls, ${rows.length} distinct messages`);
  if (!rows.length) return console.log(c.green('   no errors in range'));
  limit(rows).forEach(([msg, v], i) => {
    console.log(`   ${String(i + 1).padStart(3)}. ${String(v.count).padStart(6)}  ${c.dim([...v.tools].join(', '))}`);
    console.log(`        ${c.red(msg)}`);
  });
}

function rankJev(agg) {
  const rows = [...(agg.jev || new Map())].sort((a, b) => b[1].n - a[1].n);
  heading('Agent evaluations (Jev)',
    `${(agg.jevCalls || 0).toLocaleString()} call(s) · ${rows.reduce((s, [, r]) => s + r.n, 0).toLocaleString()} judgments · ${(agg.jevTokens || 0).toLocaleString()} input tokens`);
  if (!rows.length) return console.log(c.dim('   no evaluation records in range'));
  console.log(c.dim(`   ${'guideline'.padEnd(42)}${'judged'.padStart(7)}${'viol'.padStart(6)}${'review'.padStart(8)}${'agree'.padStart(8)}`));
  limit(rows).forEach(([g, r]) => {
    const agree = r.scored ? `${(100 * r.correct / r.scored).toFixed(0)}%` : '—';
    console.log(`   ${c.yellow(g.padEnd(42))}${String(r.n).padStart(7)}${String(r.violations).padStart(6)}${String(r.review).padStart(8)}${agree.padStart(8)}`);
  });
}

function rankLint(agg) {
  const rows = [...agg.rules].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  heading('Most triggered lint rules', `${total.toLocaleString()} violations across ${rows.length} rules`);
  if (!rows.length) return console.log(c.dim('   no lint records in range'));
  const max = rows[0][1];
  limit(rows).forEach(([rule, n], i) => {
    console.log(
      `   ${String(i + 1).padStart(3)}. ${String(n).padStart(6)}  ${String((100 * n / total).toFixed(1) + '%').padStart(6)}  ` +
      `${c.yellow(rule.padEnd(40))} ${bar(n, max)}`
    );
  });
}

function rankDays(agg) {
  const rows = [...agg.days].sort((a, b) => a[0].localeCompare(b[0]));
  const total = rows.reduce((s, [, n]) => s + n, 0);
  heading('Volume by day', `${total.toLocaleString()} records over ${rows.length} days with activity`);
  if (!rows.length) return;
  const max = Math.max(...rows.map(r => r[1]));
  const shown = opts.top > 0 ? rows.slice(-opts.top) : rows;
  if (shown.length < rows.length) console.log(c.dim(`   (last ${shown.length} of ${rows.length} days)`));
  for (const [date, n] of shown) {
    console.log(`   ${c.dim(date)}  ${String(n).padStart(6)}  ${bar(n, max, 40)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { records, sources, malformed } = await loadRecords(opts.dirs);

if (!records.length) {
  console.error(
    `No log records found.\n  Searched: ${opts.dirs.join('\n            ')}` +
    (opts.since || opts.until ? `\n  Range:    ${opts.since || '…'} → ${opts.until || '…'}` : '')
  );
  process.exit(1);
}

const agg = aggregate(records);
const dates = [...agg.days.keys()].sort();

if (opts.json) {
  const toRows = (map, fn) => [...map].sort((a, b) => fn(b[1]) - fn(a[1])).map(([k, v]) => ({ key: k, ...shape(v) }));
  const shape = v => {
    if (typeof v === 'number') return { count: v };
    const out = { count: v.count };
    if (v.name !== undefined) out.name = v.name;
    if (v.kind) out.kind = v.kind;
    if (v.tools) out.tools = [...v.tools];
    if (v.errors !== undefined) out.errors = v.errors;
    if (v.durations) {
      const d = v.durations.slice().sort((a, b) => a - b);
      out.p50 = percentile(d, 0.5);
      out.p95 = percentile(d, 0.95);
    }
    return out;
  };
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    range: { from: dates[0], to: dates.at(-1), days: dates.length },
    sources, totalRecords: records.length, malformedLines: malformed,
    kinds: [...agg.kinds].sort((a, b) => b[1].count - a[1].count).map(([key, v]) => ({
      key, count: v.count, entries: v.entries.size,
      avgChars: v.chars ? Math.round(v.chars / v.count) : null,
      topEntries: [...v.entries].sort((a, b) => b[1].count - a[1].count)
        .map(([id, e]) => ({ identifier: id, name: e.name, count: e.count })),
    })),
    entries: toRows(agg.entries, v => v.count),
    sections: [...agg.secs.values()].sort((a, b) => b.count - a.count)
      .map(r => ({ entry: r.entry, section: r.label, count: r.count, tools: [...r.tools] })),
    sectionsPooled: [...agg.bare].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
    tools:   toRows(agg.tools,   v => v.count),
    errors:  toRows(agg.errors,  v => v.count),
    lintRules: [...agg.rules].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
    jev: [...(agg.jev || new Map())].map(([guideline, r]) => ({ guideline, ...r })),
    byDay: [...agg.days].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
  }, null, 2));
  // No process.exit here: stdout to a pipe is async in Node, and exiting
  // immediately truncates any payload past the pipe buffer (~64KB).
} else {
  console.log(c.bold(`\ndsds log stats  ${c.dim(`${dates[0]} → ${dates.at(-1)}  ·  ${records.length.toLocaleString()} records  ·  ${dates.length} active days`)}`));
  for (const src of sources) console.log(c.dim(`  ${src.records.toLocaleString().padStart(8)}  ${src.dir}`));
  if (malformed) console.log(c.yellow(`  ${malformed} malformed line(s) skipped`));

  const want = opts.section === 'all' ? SECTIONS : [opts.section];
  if (want.includes('kinds'))    rankKinds(agg);
  if (want.includes('entries'))  rankEntries(agg);
  if (want.includes('sections')) rankSections(agg);
  if (want.includes('tools'))    rankTools(agg);
  if (want.includes('errors'))   rankErrors(agg);
  if (want.includes('lint'))     rankLint(agg);
  if (want.includes('jev'))      rankJev(agg);
  if (want.includes('days'))     rankDays(agg);
  console.log('');
}
