import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { writeLog } from '../logger.js';
import { requireFromProject } from './require-from-project.js';

// Session-level lint result cache. An agent can pass { cacheKey, filename } instead of
// { code, filename } on subsequent calls to avoid re-sending unchanged file content.
// Cache key = first 12 hex chars of SHA-256(source). LRU eviction at MAX_CACHE entries.
const MAX_CACHE = 200;
const lintCache = new Map();

function computeCacheKey(code) {
  return createHash('sha256').update(code).digest('hex').slice(0, 12);
}

function storeCacheEntry(key, result) {
  if (lintCache.has(key)) lintCache.delete(key); // refresh insertion order
  if (lintCache.size >= MAX_CACHE) lintCache.delete(lintCache.keys().next().value);
  lintCache.set(key, result);
}

function pluginPrefix(packageName) {
  const scoped = packageName.match(/^(@[^/]+)\/eslint-plugin(?:-(.+))?$/);
  if (scoped) return scoped[2] ? `${scoped[1]}/${scoped[2]}` : scoped[1];
  const bare = packageName.match(/^eslint-plugin-(.+)$/);
  if (bare) return bare[1];
  return packageName;
}

const requirePlugin = requireFromProject;

function rulesFromPlugin(prefix, plugin) {
  const recommended = plugin.configs?.recommended;
  if (Array.isArray(recommended)) {
    const rules = {};
    for (const entry of recommended) {
      if (entry.rules) Object.assign(rules, entry.rules);
    }
    if (Object.keys(rules).length > 0) return rules;
  }
  if (recommended?.rules) return recommended.rules;
  // Fall back: enable all rules at warn
  const rules = {};
  for (const ruleName of Object.keys(plugin.rules ?? {})) {
    rules[`${prefix}/${ruleName}`] = 'warn';
  }
  return rules;
}

// Returns filenames that look like stubs: JSX/TSX files with no JSX elements in the body.
// Design-system rules only fire on actual JSX, so linting stubs produces no useful signal.
function detectStubFiles(filesToLint) {
  const stubs = [];
  for (const file of filesToLint) {
    if (!file.code) continue; // cache-only entries were already linted — skip
    const filename = file.filename ?? 'Component.tsx';
    if (!/\.[jt]sx$/.test(filename)) continue;
    // Strip import lines, then check for any JSX element syntax
    const withoutImports = (file.code ?? '').replace(
      /^\s*import\s[\s\S]*?from\s['"][^'"]+['"]\s*;?\s*$/gm,
      '',
    );
    if (!/<[A-Za-z]/.test(withoutImports)) {
      stubs.push(filename);
    }
  }
  return stubs;
}

function inferLanguage(filename) {
  if (filename.endsWith('.tsx')) return 'tsx';
  if (filename.endsWith('.ts')) return 'ts';
  if (filename.endsWith('.jsx')) return 'jsx';
  return 'js';
}

export const lintDef = {
  name: 'dsds_lint',
  description:
    'Lint code against the design system\'s own ESLint rules. Returns findings only, never a rewritten file: ' +
    'each finding that needs a change from you, and for fixable ones the exact lines to edit ' +
    '(or, where the host applies fixes itself, a note to leave them alone). Re-emit only the files you change. ' +
    'Pass `path` (or `files: [{path}]`) for code already written to disk — preferred, since you never re-send contents. ' +
    'Pass `code` for a source string not yet on a disk. Nothing is ever written, created, or modified ' +
    '(the `apply` flag, for harness use, is the sole exception). ' +
    'A missing path returns an error telling you to persist the file first; it never creates the file for you. ' +
    'ONE PASS: a clean or auto-fixed result is FINAL — do not re-lint unchanged files to "confirm". ' +
    'Code produced by dsds_build_component is already design-system-valid — do not lint it. ' +
    'Design-system rules fire on JSX; linting a stub with no JSX gives a false all-clear, so lint finished component code.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Lint several files in one call. Each entry carries either `path` (on disk) or `code` (a string).',
        items: {
          type: 'object',
          properties: {
            path:     { type: 'string', description: 'Path to a file on disk, relative to the lint project root.' },
            code:     { type: 'string', description: 'Source code to lint, when the file is not on disk.' },
            filename: { type: 'string', description: "Filename for parser inference (e.g. 'App.tsx'). Defaults to the path." },
            cacheKey: { type: 'string', description: 'Cache key from a previous result. Pass instead of `code` to skip re-sending unchanged content.' },
          },
        },
      },
      path: {
        type: 'string',
        description: 'Single-file mode: path to a file on disk, relative to the lint project root.',
      },
      code: {
        type: 'string',
        description: 'Single-file mode: source code to lint, when the file is not on disk.',
      },
      filename: {
        type: 'string',
        description: "Single-file mode: filename for parser inference (e.g. 'Component.tsx').",
      },
      cacheKey: {
        type: 'string',
        description: 'Single-file mode: cache key from a previous call. Pass instead of `code`.',
      },
      apply: {
        type: 'boolean',
        description: 'Harness/automation only: write auto-fixed code back to disk (lint as a non-skippable gate). Agents make the listed line edits instead.',
      },
    },
  },
};

// Last content linted per filename in this process, for "unchanged since
// your last call". Keyed by the same hash as the result cache.
const lastLinted = new Map();

/**
 * The line-level edits that turn `before` into `after`, as hunks of
 * `{ line, removed, added }` numbered against `before`. A longest-common-
 * subsequence diff: files here are hundreds of lines, so O(n·m) is fine.
 */
export function lineEdits(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0, j = 0, cur = null;
  const flush = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; continue; }
    cur ??= { line: i + 1, removed: [], added: [] };
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { cur.added.push(b[j]); j++; }
    else { cur.removed.push(a[i]); i++; }
  }
  flush();
  return hunks;
}

const MAX_EDITS_SHOWN = 20;

/** Hunks as a compact diff an agent can apply by hand. */
function renderEdits(hunks, lang) {
  const out = [];
  for (const h of hunks.slice(0, MAX_EDITS_SHOWN)) {
    out.push(`line ${h.line}:`, '```diff');
    for (const l of h.removed) out.push(`- ${l}`);
    for (const l of h.added) out.push(`+ ${l}`);
    out.push('```');
  }
  if (hunks.length > MAX_EDITS_SHOWN) {
    out.push(`…and ${hunks.length - MAX_EDITS_SHOWN} more edit${hunks.length - MAX_EDITS_SHOWN === 1 ? '' : 's'} of the same kinds.`);
  }
  void lang;
  return out;
}

async function writeLintLog(logsDir, fileResults) {
  const relevant = fileResults.filter(f => f.messages?.length > 0 || f.fixed);
  if (relevant.length === 0) return;

  await writeLog(logsDir, {
    type: 'lint',
    filesLinted: fileResults.length,
    filesFixed: fileResults.filter(f => f.fixed).length,
    totalRemainingViolations: fileResults.reduce((n, f) => n + (f.messages?.length ?? 0), 0),
    files: relevant.map(f => ({
      filename: f.filename,
      fixed: f.fixed ?? false,
      violations: (f.messages ?? []).map(m => ({
        ruleId: m.ruleId ?? null,
        severity: m.severity,
        line: m.line,
        col: m.column,
        fixable: m.fix,
      })),
    })),
  });
}

/**
 * Lint by path or by source string, or a mix of both in one `files` array.
 *
 * `mode` only affects framing: a by-path run can write fixes back with
 * `apply`, and an in-memory run says explicitly that no file was touched.
 * A call carrying any `path` is treated as by-path.
 */
export async function lintHandler(args, getLintConfig, logsDir = null) {
  const filesToLint = args.files?.length
    ? args.files.map(f => ({ path: f.path, code: f.code, filename: f.filename, cacheKey: f.cacheKey }))
    : args.path != null
      ? [{ path: args.path, filename: args.filename }]
      : args.code != null || args.cacheKey != null
        ? [{ code: args.code, filename: args.filename, cacheKey: args.cacheKey }]
        : null;

  if (!filesToLint) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Provide `path` (a file on disk), `code` (a source string), or `files: [{ path }]` / `files: [{ code }]`.' }],
    };
  }

  const mode = filesToLint.some(f => f.path != null) ? 'path' : 'inline';
  return runLint(filesToLint, getLintConfig, { logsDir, apply: mode === 'path' && !!args.apply, mode });
}

// Shared linter. `mode` is 'path' (entries have `path`) or 'inline' (entries
// have `code`/`cacheKey`); it only affects framing (the inline "no file touched"
// note and the missing-file coaching message).
async function runLint(filesToLint, getLintConfig, { logsDir = null, apply = false, mode = 'inline' } = {}) {
  const { plugins: pluginNames, resolveDir, sourceDir } = getLintConfig();
  // Files (and ESLint's cwd) live in the project being linted, when configured;
  // plugins are still resolved from resolveDir (where they're installed).
  const lintDir = sourceDir || resolveDir;

  if (pluginNames.length === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: [
          '## No ESLint plugins configured',
          '',
          'Set `LINT_PLUGINS` in your MCP client config `env` block:',
          '',
          '```json',
          '"env": {',
          '  "LINT_PLUGINS": "eslint-plugin-your-ds",',
          '  "LINT_RESOLVE_DIR": "/absolute/path/to/your/project"',
          '}',
          '```',
          '',
          '`LINT_RESOLVE_DIR` should be the root of the project where your ESLint plugins are installed.',
          'Multiple plugins: `"LINT_PLUGINS": "eslint-plugin-your-ds,eslint-plugin-react"`',
        ].join('\n'),
      }],
    };
  }

  let ESLint;
  try {
    ({ ESLint } = await import('eslint'));
  } catch {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: '`eslint` is not installed. Run `npm install eslint` in your dsds-mcp directory or add it as a devDependency.',
      }],
    };
  }

  const loadedPlugins = {};
  const loadErrors = [];

  await Promise.all(pluginNames.map(async name => {
    try {
      loadedPlugins[name] = await requirePlugin(name, resolveDir);
    } catch (err) {
      loadErrors.push(`\`${name}\`: ${err.message}`);
    }
  }));

  if (pluginNames.length > 0 && Object.keys(loadedPlugins).length === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: [
          '## Failed to load ESLint plugins',
          '',
          ...loadErrors,
          '',
          `Make sure the plugins are installed in LINT_RESOLVE_DIR (${resolveDir}).`,
        ].join('\n'),
      }],
    };
  }

  // Build overrideConfig from each plugin.
  const overrideConfig = [];
  for (const [name, plugin] of Object.entries(loadedPlugins)) {
    if (Array.isArray(plugin.configs?.recommended)) {
      overrideConfig.push(...plugin.configs.recommended);
    } else {
      const prefix = pluginPrefix(name);
      const rules = rulesFromPlugin(prefix, plugin);
      overrideConfig.push({ plugins: { [prefix]: plugin }, rules });
    }
  }

  const hasEslintRules = Object.keys(loadedPlugins).length > 0;

  // fix: true — auto-apply all fixable violations; result.output holds the corrected code.
  const eslint = hasEslintRules
    ? new ESLint({
        overrideConfigFile: true,
        overrideConfig,
        cwd: lintDir,
        fix: true,
      })
    : null;
  // A fix run reports only what is left, so the findings it fixed are
  // invisible in its result. This second, no-fix pass names them, for the
  // "fixable" part of the output.
  const eslintReport = hasEslintRules
    ? new ESLint({ overrideConfigFile: true, overrideConfig, cwd: lintDir, fix: false })
    : null;

  // Warn the agent if it submitted stub files (no JSX → design-system rules won't fire)
  const stubFiles = detectStubFiles(filesToLint);

  // Lint all files
  const fileResults = [];
  for (const file of filesToLint) {
    // Lint-by-path: the file is already on disk, so read it here instead of
    // making the agent re-emit its full contents as a tool argument.
    if (file.path && file.code == null && file.cacheKey == null) {
      try {
        file.code = await readFile(resolve(lintDir, file.path), 'utf-8');
        file.filename = file.filename ?? file.path;
      } catch {
        fileResults.push({
          filename: file.filename ?? file.path, messages: [], fixedCode: null, fixed: false, cacheKey: null,
          error:
            `"${file.path}" was not found (looked in ${lintDir}). ` +
            'This tool reads files; it does not create them. ' +
            'Make sure whatever process manages your files has persisted this one to disk, then re-run with just the path. ' +
            'Do not pass the file contents here — a `path` entry only reads from disk (to lint a string without a file, pass `code` instead of `path`).',
        });
        continue;
      }
    }

    const filename = file.filename ?? 'Component.tsx';

    // Cache hit: agent passed a key from a previous call — return stored result.
    if (file.cacheKey && !file.code) {
      const cached = lintCache.get(file.cacheKey);
      if (!cached) {
        fileResults.push({
          filename, messages: [], fixedCode: null, fixed: false, cacheKey: null,
          error: `Cache miss for key "${file.cacheKey}". Re-send this file with full \`code\`.`,
        });
      } else {
        fileResults.push({ ...cached, filename });
      }
      continue;
    }

    if (!file.code) {
      fileResults.push({
        filename, messages: [], fixedCode: null, fixed: false, cacheKey: null,
        error: 'Provide either `code` (source) or `cacheKey` (from a previous dsds_lint call).',
      });
      continue;
    }

    const filePath = resolve(lintDir, filename);
    // Cache key reflects the code the caller actually submitted, so a later
    // call with the same cacheKey and no code gets the same result without
    // re-running ESLint.
    const originalCode = file.code;
    const cacheKey = computeCacheKey(originalCode);


    try {
      const results = hasEslintRules ? await eslint.lintText(file.code, { filePath }) : [];
      const r = results[0];
      // `output` is only set when ESLint applied a fix.
      const fixedCode = r?.output ?? null;
      const fixed = fixedCode !== null;
      // Harness mode: write the auto-fixed code back to the file on disk so the
      // lint gate's fixes are applied without the caller re-emitting source.
      if (apply && file.path && fixedCode != null) {
        try { await writeFile(filePath, fixedCode, 'utf-8'); } catch { /* best effort */ }
      }
      const messages = (r?.messages ?? []).map(m => ({
        ruleId: m.ruleId,
        severity: m.severity,
        message: m.message,
        line: m.line,
        column: m.column,
        fix: !!m.fix,
      }));
      let fixedMessages = [];
      if (fixed && eslintReport) {
        const before = (await eslintReport.lintText(originalCode, { filePath }))[0]?.messages ?? [];
        const left = new Set(messages.map(m => `${m.ruleId}:${m.message}`));
        fixedMessages = before
          .filter(m => m.fix && !left.has(`${m.ruleId}:${m.message}`))
          .map(m => ({ ruleId: m.ruleId, severity: m.severity, message: m.message, line: m.line, column: m.column }));
      }
      const edits = fixed ? lineEdits(originalCode, fixedCode) : [];
      // Same file, same content as the last call in this process: say so
      // rather than repeating the findings the agent already has.
      const unchanged = lastLinted.get(filename) === cacheKey;
      lastLinted.set(filename, cacheKey);
      const result = {
        filename, messages, fixedCode, fixed, cacheKey, fixedMessages, edits,
      };
      storeCacheEntry(cacheKey, result);
      fileResults.push(unchanged ? { ...result, unchanged: true } : result);
    } catch (err) {
      fileResults.push({ filename, error: err.message, messages: [], fixedCode: null, fixed: false, cacheKey: null });
    }
  }

  // Write log entry (best-effort, non-blocking)
  if (logsDir) writeLintLog(logsDir, fileResults);

  // Render output.
  //
  // Findings only — never a whole corrected file. The old output returned the
  // full fixed source and told the agent to "apply the corrected code", so
  // every lint call was followed by the agent re-emitting every file it had
  // linted. On 2026-09-22 that roughly doubled output tokens for Haiku and
  // Sonnet alike, and led the agent tester to hide this tool from both.
  //
  // A fixable finding is shown as the lines that change, or — when the host
  // applies ESLint's fixes itself (`lintAutofixByHost`) — as a note to leave
  // it alone. Output grows with the number of findings, not with file size.
  const lines = [];
  const toolName = 'dsds_lint';
  const { autofixByHost = false } = getLintConfig();

  const totalRemaining = fileResults.reduce((n, f) => n + (f.messages?.length ?? 0), 0);
  const totalFixable = fileResults.reduce((n, f) => n + (f.fixedMessages?.length ?? 0), 0);
  const filesWithErrors = fileResults.filter(f => f.error).length;
  const filesUnchanged = fileResults.filter(f => f.unchanged).length;

  const sevOf = (m) => (m.severity === 2 ? 'error' : 'warn');
  const header = [];
  header.push(`${fileResults.length} file${fileResults.length === 1 ? '' : 's'} linted`);
  if (totalFixable) header.push(`${totalFixable} fixable automatically`);
  header.push(`${totalRemaining} need${totalRemaining === 1 ? 's' : ''} a change from you`);
  if (filesWithErrors) header.push(`${filesWithErrors} could not be linted`);
  lines.push(`## Lint results — ${header.join(', ')}`, '');

  for (const f of fileResults) {
    if (f.error) {
      lines.push(`### \`${f.filename}\` — could not lint`, '', f.error, '');
      continue;
    }
    if (f.unchanged) {
      lines.push(`### \`${f.filename}\` — unchanged since your last ${toolName} call`, '',
        'The result you already have still stands. Lint it again only after you change it.', '');
      continue;
    }
    const fixable = f.fixedMessages ?? [];
    if (!fixable.length && !f.messages.length) {
      lines.push(`### \`${f.filename}\` — clean`, '');
      continue;
    }
    lines.push(`### \`${f.filename}\``, '');
    for (const m of f.messages) {
      lines.push(`- ${m.line ? `**line ${m.line}** ` : ''}\`${m.ruleId ?? 'eslint'}\` [${sevOf(m)}] — ${m.message}`);
    }
    if (fixable.length) {
      if (autofixByHost) {
        lines.push(`- ${fixable.length} more finding${fixable.length === 1 ? '' : 's'} (${[...new Set(fixable.map(m => m.ruleId))].map(r => `\`${r}\``).join(', ')}) will be fixed automatically after your turn. Do not change or re-emit the file for ${fixable.length === 1 ? 'it' : 'them'}.`);
      } else {
        lines.push('', `**Fixable — make these line edits** (${fixable.length} finding${fixable.length === 1 ? '' : 's'}: ${[...new Set(fixable.map(m => m.ruleId))].map(r => `\`${r}\``).join(', ')}):`, '');
        lines.push(...renderEdits(f.edits ?? [], inferLanguage(f.filename)));
      }
    }
    lines.push('');
  }

  if (stubFiles.length > 0) {
    lines.push(
      '---',
      '',
      `> ⚠️ **${stubFiles.length} stub file${stubFiles.length === 1 ? '' : 's'} detected** — no JSX elements found in: ${stubFiles.map(f => `\`${f}\``).join(', ')}`,
      '>',
      '> Design-system ESLint rules only fire on actual JSX. These files produced no design-system violations because they contain no rendered components.',
      `> **Call \`${toolName}\` again after completing your implementation.**`,
      '',
    );
  }

  if (loadErrors.length > 0) {
    lines.push('---', '', `> ${loadErrors.length} plugin(s) failed to load: ${loadErrors.join(', ')}`);
  }

  // One-pass directive: when nothing is left to fix, tell the agent to stop here
  // rather than re-linting to "confirm" (which just re-sends the same code).
  if (filesWithErrors === 0) {
    const next = totalRemaining > 0
      ? 'Fix the findings above in the files named, and re-emit only those files.'
      : autofixByHost || totalFixable === 0
        ? 'Nothing needs a change from you.'
        : 'Make the line edits above, and re-emit only the files they touch.';
    lines.push('', `> ✓ One pass complete. ${next} Do NOT call ${toolName} again to confirm; lint again only if you change a file.`);
  }

  // Inline mode is read-only — make the no-persistence contract explicit so a
  // "clean" result is never mistaken for "the file was saved".
  if (mode === 'inline') {
    const chars = filesToLint.reduce((n, f) => n + (typeof f.code === 'string' ? f.code.length : 0), 0);
    lines.push(
      '',
      `> Checked ${chars} character${chars === 1 ? '' : 's'} in memory. No file was read or written — dsds_lint never persists anything. ` +
      'To save a file, write it through whatever process manages your project; to lint a file already on disk, pass `path` instead of `code`.',
    );
  }

  // Cache-key hints apply only to inline mode (by-path callers re-lint by path).
  if (mode === 'inline') {
    const freshResults = fileResults.filter(f => f.cacheKey);
    if (freshResults.length === 1) {
      lines.push('', `**Cache key:** \`${freshResults[0].cacheKey}\` — pass \`{ cacheKey: "${freshResults[0].cacheKey}", filename: "${freshResults[0].filename}" }\` instead of \`code\` on subsequent calls **only if this file has not changed**. If you modify the file, always pass the updated \`code\` — the cache key is tied to the exact source content linted above.`);
    } else if (freshResults.length > 1) {
      lines.push('', '---', '', '**Cache keys** — only valid while these files remain unchanged. If you modify a file, re-send its full `code` instead of the cache key:', '');
      for (const f of freshResults) {
        lines.push(`- \`${f.filename}\` → \`${f.cacheKey}\``);
      }
      lines.push('');
    }
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    // Structured mirror for automation (the agent-tester lint gate). Agents read
    // the text above; the harness reads this.
    structuredContent: {
      remaining: totalRemaining,
      fixable: totalFixable,
      files: fileResults.map((f) => ({
        filename: f.filename,
        fixed: !!f.fixed,
        fixedMessages: f.fixedMessages ?? [],
        messages: f.messages ?? [],
        error: f.error ?? null,
      })),
    },
  };
}
