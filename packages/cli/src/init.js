// dsds init — scaffold a project-local dsds.config.mjs (seeded from whatever
// environment variables are currently set, as the env→file migration path)
// and, with --agents, a marker-delimited stanza that teaches shell-only
// agents the CLI (plan FR-16, Astryx's `init --features agents` pattern).
//
// Idempotent: an existing config is skipped unless --force; the agents stanza
// is replaced between its markers on re-runs, and appended without touching
// anything else when the target file already has other content.

import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { PORCELAIN } from './porcelain.js';

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export const MARK_BEGIN = '<!-- dsds:begin -->';
export const MARK_END = '<!-- dsds:end -->';

// ── Config scaffold ───────────────────────────────────────────────────────────

// Make paths inside the project relative so the config travels with the repo.
// Tries both the given cwd and its realpath (macOS tmp dirs live behind a
// /var → /private/var symlink).
function relativize(cwd, rawPath) {
  const p = rawPath.trim();
  if (!p || p.startsWith('~')) return p;
  if (!isAbsolute(p)) return p;
  for (const base of new Set([cwd, safeRealpath(cwd)])) {
    const rel = relative(base, p);
    if (!rel.startsWith('..') && !isAbsolute(rel)) return `./${rel}`;
  }
  return p;
}

const splitCsv = raw => raw.split(',').map(s => s.trim()).filter(Boolean);

export function buildConfigSource(cwd) {
  const env = process.env;
  const entries = [];
  const quote = v => JSON.stringify(v);
  const pathList = raw => `[${splitCsv(raw).map(p => quote(relativize(cwd, p))).join(', ')}]`;

  if (env.DSDS_PATHS) entries.push(['paths', pathList(env.DSDS_PATHS)]);
  const intro = env.DSDS_INTRO_PATHS ?? env.DSDS_INTRO_PATH;
  if (intro) entries.push(['introPaths', pathList(intro)]);
  if (env.LINT_PLUGINS) entries.push(['lintPlugins', `[${splitCsv(env.LINT_PLUGINS).map(quote).join(', ')}]`]);
  if (env.LINT_RESOLVE_DIR) entries.push(['lintResolveDir', quote(relativize(cwd, env.LINT_RESOLVE_DIR))]);
  if (env.LINT_SOURCE_DIR) entries.push(['lintSourceDir', quote(relativize(cwd, env.LINT_SOURCE_DIR))]);
  if (env.PACKAGE_EXPORT_PATHS) {
    const pairs = splitCsv(env.PACKAGE_EXPORT_PATHS)
      .map(entry => {
        const eq = entry.indexOf('=');
        if (eq <= 0) return null;
        return `${quote(entry.slice(0, eq).trim())}: ${quote(relativize(cwd, entry.slice(eq + 1)))}`;
      })
      .filter(Boolean);
    if (pairs.length > 0) entries.push(['packageExportPaths', `{ ${pairs.join(', ')} }`]);
  }
  if (env.ICON_PACKAGE) entries.push(['iconPackage', quote(env.ICON_PACKAGE.trim())]);
  if (env.DSDS_FEEDBACK_DIR) entries.push(['feedbackDir', quote(relativize(cwd, env.DSDS_FEEDBACK_DIR))]);
  if (env.DSDS_LOGS_DIR) entries.push(['logsDir', quote(relativize(cwd, env.DSDS_LOGS_DIR))]);
  if (env.DSDS_SCHEMA_VERSION) entries.push(['schemaVersion', quote(env.DSDS_SCHEMA_VERSION.trim())]);

  const seeded = entries.length > 0;
  const lines = [
    '// Configuration for the DSDS tooling — read by both the dsds-mcp MCP server',
    '// and the dsds CLI. Discovered by walking up from the working directory;',
    '// environment variables override any key here. Relative paths resolve',
    '// against this file\'s directory, so the config travels with the repo.',
    '//',
    '// Keys: paths, introPaths, lintPlugins, lintResolveDir, lintSourceDir,',
    '// packageExportPaths, iconPackage, feedbackDir, logsDir, enableFeedback,',
    '// introInline, schemaVersion.',
    'export default {',
  ];
  if (seeded) {
    for (const [key, value] of entries) lines.push(`  ${key}: ${value},`);
  } else {
    lines.push('  // Point at your DSDS document(s):');
    lines.push('  paths: [],');
  }
  lines.push('};', '');
  return { source: lines.join('\n'), seeded };
}

// ── Agents stanza ─────────────────────────────────────────────────────────────

export function buildAgentsStanza({ binPath = process.argv[1] } = {}) {
  const installedAsBin = basename(binPath ?? '') === 'dsds';
  const invoke = installedAsBin
    ? '`dsds`'
    : `\`dsds\` (on this machine: \`node ${binPath}\`)`;
  const commands = Object.entries(PORCELAIN).map(
    ([, spec]) => `- \`${spec.usage}\` — ${spec.summary}`
  );
  return [
    MARK_BEGIN,
    '## Design system documentation (DSDS CLI)',
    '',
    `This repo's design system is documented as machine-readable DSDS data. Query it from the shell with ${invoke} — no MCP client needed. Configuration is discovered automatically from dsds.config.mjs.`,
    '',
    '**Start every design-system task with a briefing:** `dsds brief build` (building UI), `dsds brief author` (writing DSDS docs), or `dsds brief ask` (answering questions about the system).',
    '',
    '**Typical flow:** `dsds search <query>` to find entities → `dsds get <id>` for full docs, `dsds context <id>` for hard constraints, `dsds chunk <id>` for ready-made code → `dsds impact <id>` before changing anything shared → `dsds lint <files>` after writing UI code.',
    '',
    '### Commands',
    ...commands,
    '',
    'Every command accepts `--json` (envelope `{ok, tool, exitCode, data|error}`). Exit codes: `0` success · `1` error · `2` ran but found problems (lint, validate, doctor). Full machine-readable surface: `dsds manifest`. Setup diagnosis: `dsds doctor`.',
    MARK_END,
  ].join('\n');
}

function upsertStanza(filePath, stanza) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${stanza}\n`);
    return 'created';
  }
  const current = readFileSync(filePath, 'utf-8');
  const begin = current.indexOf(MARK_BEGIN);
  const end = current.indexOf(MARK_END);
  if (begin !== -1 && end > begin) {
    const updated = current.slice(0, begin) + stanza + current.slice(end + MARK_END.length);
    if (updated === current) return 'unchanged';
    writeFileSync(filePath, updated);
    return 'updated';
  }
  writeFileSync(filePath, current.replace(/\n*$/, '\n\n') + stanza + '\n');
  return 'appended';
}

// ── Command ───────────────────────────────────────────────────────────────────

export async function runInit({
  agents = false,
  force = false,
  agentsFile = 'AGENTS.md',
  cwd = process.cwd(),
  binPath = process.argv[1],
} = {}) {
  const notes = [];

  const configPath = join(cwd, 'dsds.config.mjs');
  if (existsSync(configPath) && !force) {
    notes.push('dsds.config.mjs — exists, skipped (use --force to overwrite)');
  } else {
    const { source, seeded } = buildConfigSource(cwd);
    writeFileSync(configPath, source);
    notes.push(
      seeded
        ? 'dsds.config.mjs — written, seeded from your current environment variables (you can now drop them)'
        : 'dsds.config.mjs — written (fill in `paths`)'
    );
  }

  if (agents) {
    const target = resolve(cwd, agentsFile);
    const outcome = upsertStanza(target, buildAgentsStanza({ binPath }));
    notes.push(`${agentsFile} — dsds stanza ${outcome}`);
  }

  notes.push('next: run `dsds doctor` to verify the setup');
  process.stdout.write(notes.join('\n') + '\n');
  return 0;
}
