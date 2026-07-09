import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { writeLog } from '../logger.js';

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

async function requirePlugin(packageName, resolveDir) {
  const req = createRequire(resolve(resolveDir, 'package.json'));
  try {
    const mod = req(packageName);
    return mod.default ?? mod;
  } catch (err) {
    if (err.code === 'ERR_REQUIRE_ESM') {
      const resolved = req.resolve(packageName);
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default ?? mod;
    }
    throw err;
  }
}

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

export const lintByPathDef = {
  name: 'dsds_lint_by_path',
  description:
    'Lint one or more files ALREADY WRITTEN TO DISK, given their paths. Reads each file from disk, ' +
    'auto-applies fixable violations, and returns the corrected code plus any remaining violations. ' +
    'Does NOT save, create, or modify files — it only reads them (the `apply` flag, for harness use, is the sole exception). ' +
    'If a path does not exist it returns an error and tells you to persist the file first — it never creates the file for you. ' +
    'Prefer this over dsds_lint_inline: pass paths, not source, so you never re-send file contents. ' +
    'Use the `files` array to lint every file in one call. ' +
    'ONE PASS: a clean or auto-fixed result is FINAL — do not re-lint unchanged files to "confirm". ' +
    'Code produced by dsds_build_component is already design-system-valid — do not lint it. ' +
    'Design-system rules fire on JSX; linting a stub with no JSX gives a false all-clear, so lint your finished component code.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Lint multiple on-disk files at once. Pass every file you wrote.',
        items: {
          type: 'object',
          properties: {
            path:     { type: 'string', description: 'Path to a file on disk, relative to the lint project root.' },
            filename: { type: 'string', description: "Optional filename override for parser inference (e.g. 'App.tsx'). Defaults to the path." },
          },
          required: ['path'],
        },
      },
      path: {
        type: 'string',
        description: 'Single-file mode: path to a file on disk, relative to the lint project root.',
      },
      filename: {
        type: 'string',
        description: 'Single-file mode: optional filename override for parser inference. Defaults to the path.',
      },
      apply: {
        type: 'boolean',
        description: 'Harness/automation only: write auto-fixed code back to disk (lint as a non-skippable gate). Agents copy the corrected code from the response instead.',
      },
    },
  },
};

export const lintInlineDef = {
  name: 'dsds_lint_inline',
  description:
    'Lint a source STRING in memory (read-only). Returns lint findings and auto-fixed code for you to copy into your files. ' +
    'Does NOT save, create, or modify any file — nothing is written to disk and nothing is persisted. It only checks the text you pass; ' +
    'the response reports how many characters were checked and confirms no file was touched. ' +
    'For a file that is already on disk, use dsds_lint_by_path instead (pass the path, not the source). ' +
    'Code produced by dsds_build_component is already design-system-valid — do not lint it. ' +
    'Design-system rules fire on JSX; linting a stub with no JSX gives a false all-clear, so lint your finished component code.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Lint multiple source strings at once.',
        items: {
          type: 'object',
          properties: {
            code:     { type: 'string', description: 'Source code to lint. Required unless `cacheKey` is provided.' },
            filename: { type: 'string', description: "Filename for parser inference (e.g. 'App.tsx')." },
            cacheKey: { type: 'string', description: 'Cache key from a previous dsds_lint_inline result. Pass instead of `code` to skip re-sending unchanged content.' },
          },
        },
      },
      code: {
        type: 'string',
        description: 'Single-file mode: source code to lint. Use `files` when you have multiple.',
      },
      filename: {
        type: 'string',
        description: "Single-file mode: filename for parser inference (e.g. 'Component.tsx'). Defaults to Component.tsx.",
      },
      cacheKey: {
        type: 'string',
        description: 'Single-file mode: cache key from a previous call. Pass instead of `code` to skip re-sending unchanged content.',
      },
    },
  },
};

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
 * dsds_lint_by_path — lint files already written to disk, by path. Reads each
 * file; a missing path returns corrective coaching (this tool does not create files).
 */
export async function lintByPathHandler(args, getLintConfig, logsDir = null) {
  const filesToLint = args.files?.length
    ? args.files.map(f => ({ path: f.path, filename: f.filename }))
    : args.path != null
      ? [{ path: args.path, filename: args.filename }]
      : null;

  if (!filesToLint) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Provide `path` (a file on disk) or `files: [{ path }]`. This tool lints files by path — to lint a source string without a file, use `dsds_lint_inline`.' }],
    };
  }
  return runLint(filesToLint, getLintConfig, { logsDir, apply: !!args.apply, mode: 'path' });
}

/**
 * dsds_lint_inline — lint a source string in memory. Read-only: nothing is read
 * from or written to disk. No `path` argument, so there is no illusion of persistence.
 */
export async function lintInlineHandler(args, getLintConfig, logsDir = null) {
  const filesToLint = args.files?.length
    ? args.files.map(f => ({ code: f.code, filename: f.filename, cacheKey: f.cacheKey }))
    : args.code != null || args.cacheKey != null
      ? [{ code: args.code, filename: args.filename, cacheKey: args.cacheKey }]
      : null;

  if (!filesToLint) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Provide `code` (a source string) or `files: [{ code }]`. This tool checks a string in memory — to lint a file already on disk, use `dsds_lint_by_path`.' }],
    };
  }
  return runLint(filesToLint, getLintConfig, { logsDir, apply: false, mode: 'inline' });
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

  if (Object.keys(loadedPlugins).length === 0) {
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

  // fix: true — auto-apply all fixable violations; result.output holds the corrected code.
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig,
    cwd: lintDir,
    fix: true,
  });

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
            'Do not pass the file contents here — dsds_lint_by_path only reads from disk (to lint a string without a file, use dsds_lint_inline).',
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
        error: 'Provide either `code` (source) or `cacheKey` (from a previous dsds_lint_inline call).',
      });
      continue;
    }

    const filePath = resolve(lintDir, filename);
    try {
      const results = await eslint.lintText(file.code, { filePath });
      const r = results[0];
      // output is only set when at least one fix was applied
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
      const cacheKey = computeCacheKey(file.code);
      const result = { filename, messages, fixedCode, fixed, cacheKey };
      storeCacheEntry(cacheKey, result);
      fileResults.push(result);
    } catch (err) {
      fileResults.push({ filename, error: err.message, messages: [], fixedCode: null, fixed: false, cacheKey: null });
    }
  }

  // Write log entry (best-effort, non-blocking)
  if (logsDir) writeLintLog(logsDir, fileResults);

  // Render output
  const lines = [];
  const isBatch = filesToLint.length > 1;
  const toolName = mode === 'path' ? 'dsds_lint_by_path' : 'dsds_lint_inline';

  const totalRemaining = fileResults.reduce((n, f) => n + (f.messages?.length ?? 0), 0);
  const filesFixed = fileResults.filter(f => f.fixed).length;
  const filesWithErrors = fileResults.filter(f => f.error).length;
  const filesClean = fileResults.filter(f => !f.error && !f.fixed && f.messages?.length === 0).length;
  const filesAutoFixedClean = fileResults.filter(f => f.fixed && f.messages?.length === 0).length;
  const filesWithRemaining = fileResults.filter(f => f.messages?.length > 0).length;

  if (isBatch) {
    const allClean = totalRemaining === 0 && !fileResults.some(f => f.error);
    if (allClean && filesFixed === 0) {
      lines.push(`All ${fileResults.length} files lint clean.`);
    } else if (allClean && filesFixed > 0) {
      lines.push(
        `All ${fileResults.length} files lint clean after auto-fix. ` +
        `Apply the corrected code for ${filesFixed} file${filesFixed === 1 ? '' : 's'} below.`,
        '',
      );
    } else {
      const parts = [];
      if (filesFixed > 0) parts.push(`${filesFixed} auto-fixed`);
      if (filesClean > 0) parts.push(`${filesClean} clean`);
      if (filesWithRemaining > 0) parts.push(`${filesWithRemaining} with remaining violations`);
      if (filesWithErrors > 0) parts.push(`${filesWithErrors} error`);
      lines.push(
        `## Lint results — ${fileResults.length} file${fileResults.length === 1 ? '' : 's'} (${parts.join(', ')}), ` +
        `${totalRemaining} remaining violation${totalRemaining === 1 ? '' : 's'}`,
        '',
      );
    }

    for (const f of fileResults) {
      if (f.error) {
        lines.push(`### \`${f.filename}\` — ESLint error`, '', f.error, '');
        continue;
      }

      const lang = inferLanguage(f.filename);

      if (f.fixed && f.messages.length === 0) {
        lines.push(`### \`${f.filename}\` — all violations auto-fixed`, '');
        lines.push('**Corrected code:**', '');
        lines.push('```' + lang, f.fixedCode, '```', '');
        continue;
      }

      if (f.fixed && f.messages.length > 0) {
        lines.push(`### \`${f.filename}\` — ${f.messages.length} remaining violation${f.messages.length === 1 ? '' : 's'} (auto-fixes applied)`, '');
        lines.push('**Corrected code** (apply this, then address the remaining violations below):', '');
        lines.push('```' + lang, f.fixedCode, '```', '');
        lines.push('**Remaining violations:**', '');
        for (const m of f.messages) {
          const sev = m.severity === 2 ? 'error' : 'warn';
          lines.push(`#### \`${m.ruleId ?? 'unknown'}\` [${sev}] — line ${m.line}, col ${m.column}`, '');
          lines.push(m.message, '');
        }
        continue;
      }

      if (f.messages.length === 0) {
        lines.push(`### \`${f.filename}\` — clean`, '');
        continue;
      }

      lines.push(`### \`${f.filename}\` — ${f.messages.length} violation${f.messages.length === 1 ? '' : 's'}`, '');
      for (const m of f.messages) {
        const sev = m.severity === 2 ? 'error' : 'warn';
        lines.push(`#### \`${m.ruleId ?? 'unknown'}\` [${sev}] — line ${m.line}, col ${m.column}`, '');
        lines.push(m.message, '');
      }
    }
  } else {
    // Single-file output
    const { filename, messages, fixedCode, fixed, error } = fileResults[0];
    const lang = inferLanguage(filename);

    if (error) {
      lines.push(`ESLint error: ${error}`);
    } else if (fixed && messages.length === 0) {
      lines.push('All violations were auto-fixed.', '');
      lines.push('**Corrected code:**', '');
      lines.push('```' + lang, fixedCode, '```');
    } else if (fixed && messages.length > 0) {
      lines.push(`## Lint results — ${messages.length} remaining violation${messages.length === 1 ? '' : 's'} (auto-fixes applied)`, '');
      lines.push('**Corrected code** (apply this, then address the remaining violations below):', '');
      lines.push('```' + lang, fixedCode, '```', '');
      lines.push('**Remaining violations:**', '');
      for (const m of messages) {
        const sev = m.severity === 2 ? 'error' : 'warn';
        lines.push(`### \`${m.ruleId ?? 'unknown'}\` [${sev}] — line ${m.line}, col ${m.column}`, '');
        lines.push(m.message, '');
      }
    } else if (messages.length === 0) {
      lines.push('No lint issues found.');
    } else {
      lines.push(`## Lint results — ${messages.length} violation${messages.length === 1 ? '' : 's'}`, '');
      for (const m of messages) {
        const sev = m.severity === 2 ? 'error' : 'warn';
        lines.push(`### \`${m.ruleId ?? 'unknown'}\` [${sev}] — line ${m.line}, col ${m.column}`, '');
        lines.push(m.message, '');
      }
    }
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
  if (totalRemaining === 0 && filesWithErrors === 0) {
    lines.push(
      '',
      `> ✓ One pass complete — apply the corrected code above and move on. Do NOT call ${toolName} again to confirm. ` +
      'Lint again only if you change a file.',
    );
  }

  // Inline mode is read-only — make the no-persistence contract explicit so a
  // "clean" result is never mistaken for "the file was saved".
  if (mode === 'inline') {
    const chars = filesToLint.reduce((n, f) => n + (typeof f.code === 'string' ? f.code.length : 0), 0);
    lines.push(
      '',
      `> Checked ${chars} character${chars === 1 ? '' : 's'} in memory. No file was read or written — dsds_lint_inline does not persist anything. ` +
      'To save a file, write it through whatever process manages your project; to lint a file already on disk, use dsds_lint_by_path.',
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
      files: fileResults.map((f) => ({
        filename: f.filename,
        fixed: !!f.fixed,
        messages: f.messages ?? [],
        error: f.error ?? null,
      })),
    },
  };
}
