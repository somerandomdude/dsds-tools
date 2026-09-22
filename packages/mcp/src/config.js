import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BUNDLED_VERSION } from './spec/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Expand a leading `~` to the user's home directory. */
function expandHome(p) {
  if (p === '~' || p.startsWith('~/')) return homedir() + p.slice(1);
  return p;
}

const asList = value =>
  (value == null ? [] : Array.isArray(value) ? value : String(value).split(','))
    .map(s => String(s).trim())
    .filter(Boolean);

const isFalsy = v => /^(false|0|no|off)$/i.test(String(v).trim());

// Every setting, once. Each row drives all three things the old file spelled
// out separately: reading the environment, normalising a config-file value,
// and answering "did the environment actually set this?".
//
//   kind  'list'     comma-separated or array, trimmed
//         'pathList' a list, each entry home-expanded (and file-relative in a config file)
//         'path'     one home-expanded path
//         'string'   one trimmed string
//         'bool'     true unless the value reads false/0/no/off
//         'map'      "a=b,c=d" pairs, or an object in a config file; values are paths
//         'enum'     one of `values`, falling back to `fallback`
const SETTINGS = [
  { key: 'paths',             env: 'DSDS_PATHS',                 kind: 'pathList' },
  { key: 'introPaths',        env: 'DSDS_INTRO_PATHS',           kind: 'pathList', altEnv: 'DSDS_INTRO_PATH' },
  { key: 'lintPaths',         env: 'LINT_PATHS',                 kind: 'pathList' },
  { key: 'lintPlugins',       env: 'LINT_PLUGINS',               kind: 'list' },
  { key: 'lintResolveDir',    env: 'LINT_RESOLVE_DIR',           kind: 'path',   default: () => process.cwd() },
  // The root of the project being linted, where the agent's files live. When
  // set, a by-path lint resolves against it and ESLint runs with it as cwd,
  // so files written there count as inside the base path. Plugins still
  // resolve from lintResolveDir.
  { key: 'lintSourceDir',     env: 'LINT_SOURCE_DIR',            kind: 'path',   default: () => null },
  { key: 'packageExportPaths', env: 'PACKAGE_EXPORT_PATHS',      kind: 'map' },
  // The package whose exports count as the icon set. Unset means no icon check.
  { key: 'iconPackage',       env: 'ICON_PACKAGE',               kind: 'string' },
  // A checkout of the design system's source. Only used to tell whether a
  // cached prop table has gone stale — unset disables that check, not prop
  // serving itself (see spec/prop-extractor.js).
  { key: 'uiSourceRoot',      env: 'DSDS_UI_SOURCE_ROOT',        kind: 'path' },
  // A props-extractor tool directory (an `npm run all` producing
  // out/dsds-extensions.json). Unset disables API-table serving.
  { key: 'propsExtractorDir', env: 'DSDS_PROPS_EXTRACTOR_DIR',   kind: 'path' },
  { key: 'feedbackDir',       env: 'DSDS_FEEDBACK_DIR',          kind: 'path',   default: () => resolve(__dirname, '../feedback') },
  { key: 'logsDir',           env: 'DSDS_LOGS_DIR',              kind: 'path',   default: () => resolve(__dirname, '../logs') },
  { key: 'enableFeedback',    env: 'DSDS_ENABLE_FEEDBACK',       kind: 'bool',   default: () => true },
  // Inline renders intro entities in full (thousands of tokens); off injects
  // a one-line index instead and agents pull the rest with dsds_get_entity.
  { key: 'introInline',       env: 'DSDS_INTRO_INLINE',          kind: 'bool',   default: () => true },
  // How hard the server pushes an agent to economise on lookups when an
  // intro is inlined. `thorough` trades tokens for correctness; see
  // plans/ for the measurement behind the default.
  { key: 'researchMode',      env: 'RESEARCH_MODE',              kind: 'enum',   values: ['thorough', 'frugal'], fallback: 'thorough' },
  { key: 'schemaVersion',     env: 'DSDS_SCHEMA_VERSION',        kind: 'string', default: () => BUNDLED_VERSION },
];

function parseMapString(raw) {
  const map = new Map();
  for (const entry of asList(raw)) {
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const name = entry.slice(0, eq).trim();
    const path = expandHome(entry.slice(eq + 1).trim());
    if (name && path) map.set(name, path);
  }
  return map;
}

/** Read one setting from the environment, or its default when unset. */
function fromEnv(setting) {
  const raw = process.env[setting.env] ?? (setting.altEnv ? process.env[setting.altEnv] : undefined);
  const fallback = setting.default ? setting.default() : (setting.kind === 'map' ? new Map() : setting.kind === 'list' || setting.kind === 'pathList' ? [] : null);
  if (raw == null) return setting.kind === 'enum' ? setting.fallback : fallback;

  switch (setting.kind) {
    case 'list':     return asList(raw);
    case 'pathList': return asList(raw).map(expandHome);
    case 'path':     return expandHome(raw.trim());
    case 'string':   return raw.trim();
    case 'bool':     return !isFalsy(raw);
    case 'map':      return parseMapString(raw);
    case 'enum':     return setting.values.includes(raw.trim().toLowerCase()) ? raw.trim().toLowerCase() : setting.fallback;
    default:         return raw;
  }
}

/**
 * The configuration as the environment describes it, with defaults filled in.
 *
 * @returns {object} one property per SETTINGS row, plus `logsDirExplicit`
 *   (whether logging was actually asked for, as opposed to `logsDir` merely
 *   holding its default — a long-lived server logs unconditionally, a
 *   one-shot CLI must not).
 */
export function loadConfig() {
  const out = {};
  for (const setting of SETTINGS) out[setting.key] = fromEnv(setting);
  out.logsDirExplicit = process.env['DSDS_LOGS_DIR'] != null;
  return out;
}

// ── Project-local config file ─────────────────────────────────────────────────
//
// resolveConfig() layers a dsds.config.{mjs,js,json} file under the
// environment: env vars win per key, file values fill the rest, defaults fill
// whatever remains. Relative paths in the file resolve against the file's own
// directory, so the config travels with the repo. File keys are the `key`
// column of SETTINGS.

export const CONFIG_FILENAMES = ['dsds.config.mjs', 'dsds.config.js', 'dsds.config.json'];

/** Walk from startDir to the filesystem root; return the first config file found. */
export function findConfigFile(startDir = process.cwd()) {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadConfigFile(filePath) {
  if (filePath.endsWith('.json')) return JSON.parse(await readFile(filePath, 'utf-8'));
  const mod = await import(pathToFileURL(filePath).href);
  return mod.default ?? mod;
}

/** Normalise one config-file value, resolving any path against the file's directory. */
function fromFile(setting, value, fileDir) {
  const resolveFrom = p => resolve(fileDir, expandHome(String(p).trim()));
  switch (setting.kind) {
    case 'list':     return asList(value);
    case 'pathList': return asList(value).map(resolveFrom);
    case 'path':     return resolveFrom(value);
    case 'string':   return String(value).trim();
    case 'bool':     return !!value;
    case 'enum':     return setting.values.includes(String(value).trim().toLowerCase()) ? String(value).trim().toLowerCase() : setting.fallback;
    case 'map': {
      const map = new Map();
      for (const [name, path] of Object.entries(value ?? {})) {
        if (name && path) map.set(name, resolveFrom(path));
      }
      return map;
    }
    default: return value;
  }
}

/**
 * Resolve the effective configuration: env vars > config file > defaults.
 *
 * The file is looked up at `configPath` (or DSDS_CONFIG) when given, otherwise
 * discovered by walking up from `cwd`. A missing or broken file never throws —
 * the error lands in `meta.configFileError` and the env/default configuration
 * is returned, so a bad file cannot take the server down.
 *
 * @returns {Promise<object>} the loadConfig() shape plus
 *   `meta: { configFile: string|null, configFileError: string|null }`
 */
export async function resolveConfig({ cwd = process.cwd(), configPath = undefined } = {}) {
  // Callers pass `configPath: null` for "no --config flag" — treat null and
  // undefined alike so DSDS_CONFIG applies in both cases (a default parameter
  // only fires on undefined, which silently disabled it).
  configPath = configPath ?? process.env['DSDS_CONFIG'] ?? null;
  const envConfig = loadConfig();
  const meta = { configFile: null, configFileError: null };

  let filePath;
  if (configPath) {
    filePath = resolve(cwd, expandHome(String(configPath).trim()));
    if (!existsSync(filePath)) {
      meta.configFileError = `config file not found: ${filePath}`;
      return { ...envConfig, meta };
    }
  } else {
    filePath = findConfigFile(cwd);
    if (!filePath) return { ...envConfig, meta };
  }

  meta.configFile = filePath;
  let raw;
  try {
    raw = (await loadConfigFile(filePath)) ?? {};
  } catch (err) {
    meta.configFileError = `failed to load ${filePath}: ${err.message}`;
    return { ...envConfig, meta };
  }

  const fileDir = dirname(filePath);
  const merged = { ...envConfig };
  for (const setting of SETTINGS) {
    const envSet = process.env[setting.env] != null || (setting.altEnv && process.env[setting.altEnv] != null);
    if (envSet || raw[setting.key] == null) continue;
    merged[setting.key] = fromFile(setting, raw[setting.key], fileDir);
  }
  // A config file naming `logsDir` is as explicit a request as the env var.
  merged.logsDirExplicit = process.env['DSDS_LOGS_DIR'] != null || raw.logsDir != null;
  return { ...merged, meta };
}
