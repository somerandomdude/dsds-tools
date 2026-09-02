import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BUNDLED_VERSION } from './spec/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function expandHome(p) {
  if (p === '~' || p.startsWith('~/')) return homedir() + p.slice(1);
  return p;
}

export function loadConfig() {
  const rawPaths = process.env['DSDS_PATHS'];
  const paths = rawPaths
    ? rawPaths.split(',').map(p => expandHome(p.trim())).filter(Boolean)
    : [];

  const rawLintPaths = process.env['LINT_PATHS'];
  const lintPaths = rawLintPaths
    ? rawLintPaths.split(',').map(p => expandHome(p.trim())).filter(Boolean)
    : [];

  const rawLintPlugins = process.env['LINT_PLUGINS'];
  const lintPlugins = rawLintPlugins
    ? rawLintPlugins.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  const rawLintResolveDir = process.env['LINT_RESOLVE_DIR'];
  const lintResolveDir = rawLintResolveDir ? expandHome(rawLintResolveDir.trim()) : process.cwd();

  // LINT_SOURCE_DIR is the root of the project being linted (where the agent's
  // files live). When set, `dsds_lint_by_path({ path })` resolves paths against it
  // and ESLint runs with it as cwd, so files written there are "inside base
  // path". Plugins are still resolved from LINT_RESOLVE_DIR. Defaults to the
  // resolve dir (current behavior) when unset.
  const rawLintSourceDir = process.env['LINT_SOURCE_DIR'];
  const lintSourceDir = rawLintSourceDir ? expandHome(rawLintSourceDir.trim()) : null;

  // DSDS_INTRO_PATHS accepts comma-separated paths; DSDS_INTRO_PATH is the legacy single-path alias.
  const rawIntros = process.env['DSDS_INTRO_PATHS'] ?? process.env['DSDS_INTRO_PATH'];
  const introPaths = rawIntros
    ? rawIntros.split(',').map(p => expandHome(p.trim())).filter(Boolean)
    : [];
  const rawFeedbackDir = process.env['DSDS_FEEDBACK_DIR'];
  const rawLogsDir = process.env['DSDS_LOGS_DIR'];

  // Feedback is on by default; set DSDS_ENABLE_FEEDBACK to a falsy string
  // (false/0/no/off) to remove the dsds_feedback tool and its instruction entirely.
  const rawEnableFeedback = process.env['DSDS_ENABLE_FEEDBACK'];
  const enableFeedback = rawEnableFeedback == null
    ? true
    : !/^(false|0|no|off)$/i.test(rawEnableFeedback.trim());

  // Intro entities are injected into every system prompt. Inline (default) renders
  // them in full (~thousands of tokens). Set DSDS_INTRO_INLINE to a falsy string to
  // inject only a compact index (title + one-line each) instead — much smaller per
  // prompt; agents can pull full content with dsds_get_entity when needed.
  const rawIntroInline = process.env['DSDS_INTRO_INLINE'];
  const introInline = rawIntroInline == null
    ? true
    : !/^(false|0|no|off)$/i.test(rawIntroInline.trim());

  // PACKAGE_EXPORT_PATHS: comma-separated "packageName=packagePath" pairs.
  // Example: @your-org/ui=/path/to/your-ui/packages/ui,@your-org/icons=/path/to/your-icons
  const rawExportPaths = process.env['PACKAGE_EXPORT_PATHS'];
  const packageExportPaths = new Map();
  if (rawExportPaths) {
    for (const entry of rawExportPaths.split(',').map(s => s.trim()).filter(Boolean)) {
      const eqIdx = entry.indexOf('=');
      if (eqIdx > 0) {
        const pkgName = entry.slice(0, eqIdx).trim();
        const pkgPath = expandHome(entry.slice(eqIdx + 1).trim());
        if (pkgName && pkgPath) packageExportPaths.set(pkgName, pkgPath);
      }
    }
  }

  // ICON_PACKAGE: the package name whose exports the integrity guard treats as the
  // icon set (e.g. "@acme/icons"). When set, chunk code that imports from this
  // package is checked against its real exports. Unset (default) → no icon check.
  const rawIconPackage = process.env['ICON_PACKAGE'];
  const iconPackage = rawIconPackage ? rawIconPackage.trim() : null;

  // DSDS_UI_SOURCE_ROOT: repo root containing `packages/ui` for the design
  // system's source (e.g. an `@sanity/ui` checkout). Used only to verify a
  // 0.20.0 `sourceFiles` prop-table cache hasn't gone stale — unset disables
  // freshness verification, not prop serving itself (see prop-extractor-0.20.0.js).
  const rawUiSourceRoot = process.env['DSDS_UI_SOURCE_ROOT'];
  const uiSourceRoot = rawUiSourceRoot ? expandHome(rawUiSourceRoot.trim()) : null;

  // DSDS_PROPS_EXTRACTOR_DIR: path to a sanity-ui-props-extractor-shaped tool
  // (an `npm run all` script producing `out/dsds-extensions.json`). Unset
  // disables 0.20.0 API-table serving entirely — components render without
  // one, same as today.
  const rawPropsExtractorDir = process.env['DSDS_PROPS_EXTRACTOR_DIR'];
  const propsExtractorDir = rawPropsExtractorDir ? expandHome(rawPropsExtractorDir.trim()) : null;

  return {
    paths,
    lintPaths,
    lintPlugins,
    lintResolveDir,
    lintSourceDir,
    introPaths,
    packageExportPaths,
    iconPackage,
    uiSourceRoot,
    propsExtractorDir,
    enableFeedback,
    introInline,
    feedbackDir: rawFeedbackDir ? expandHome(rawFeedbackDir.trim()) : resolve(__dirname, '../feedback'),
    logsDir: rawLogsDir ? expandHome(rawLogsDir.trim()) : resolve(__dirname, '../logs'),
    schemaVersion: process.env['DSDS_SCHEMA_VERSION'] ?? BUNDLED_VERSION,
  };
}

// ── Project-local config file ─────────────────────────────────────────────────
//
// resolveConfig() layers a dsds.config.{mjs,js,json} file under the environment
// variables: env vars win per key, file values fill the rest, loadConfig()'s
// defaults fill whatever remains. Relative paths in the file resolve against
// the file's own directory, so the config travels with the repo.
//
// File keys mirror the config object: paths, introPaths, lintPaths,
// lintPlugins, lintResolveDir, lintSourceDir, packageExportPaths (object map),
// iconPackage, feedbackDir, logsDir, enableFeedback, introInline, schemaVersion.

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
  if (filePath.endsWith('.json')) {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  }
  const mod = await import(pathToFileURL(filePath).href);
  return mod.default ?? mod;
}

const asList = value =>
  (value == null ? [] : Array.isArray(value) ? value : String(value).split(','))
    .map(s => String(s).trim())
    .filter(Boolean);

function normalizeFileConfig(raw, fileDir) {
  const resolveFrom = p => resolve(fileDir, expandHome(String(p).trim()));
  const pathList = v => asList(v).map(resolveFrom);
  const out = {};
  if (raw.paths != null) out.paths = pathList(raw.paths);
  if (raw.introPaths != null) out.introPaths = pathList(raw.introPaths);
  if (raw.lintPaths != null) out.lintPaths = pathList(raw.lintPaths);
  if (raw.lintPlugins != null) out.lintPlugins = asList(raw.lintPlugins);
  if (raw.lintResolveDir != null) out.lintResolveDir = resolveFrom(raw.lintResolveDir);
  if (raw.lintSourceDir != null) out.lintSourceDir = resolveFrom(raw.lintSourceDir);
  if (raw.packageExportPaths != null) {
    const map = new Map();
    for (const [pkg, pkgPath] of Object.entries(raw.packageExportPaths)) {
      if (pkg && pkgPath) map.set(pkg, resolveFrom(pkgPath));
    }
    out.packageExportPaths = map;
  }
  if (raw.iconPackage != null) out.iconPackage = String(raw.iconPackage).trim();
  if (raw.uiSourceRoot != null) out.uiSourceRoot = resolveFrom(raw.uiSourceRoot);
  if (raw.propsExtractorDir != null) out.propsExtractorDir = resolveFrom(raw.propsExtractorDir);
  if (raw.feedbackDir != null) out.feedbackDir = resolveFrom(raw.feedbackDir);
  if (raw.logsDir != null) out.logsDir = resolveFrom(raw.logsDir);
  if (raw.enableFeedback != null) out.enableFeedback = !!raw.enableFeedback;
  if (raw.introInline != null) out.introInline = !!raw.introInline;
  if (raw.schemaVersion != null) out.schemaVersion = String(raw.schemaVersion);
  return out;
}

// Which keys the environment explicitly provides (as opposed to defaulted).
function envProvidedKeys() {
  const has = name => process.env[name] != null;
  return {
    paths: has('DSDS_PATHS'),
    lintPaths: has('LINT_PATHS'),
    lintPlugins: has('LINT_PLUGINS'),
    lintResolveDir: has('LINT_RESOLVE_DIR'),
    lintSourceDir: has('LINT_SOURCE_DIR'),
    introPaths: has('DSDS_INTRO_PATHS') || has('DSDS_INTRO_PATH'),
    packageExportPaths: has('PACKAGE_EXPORT_PATHS'),
    iconPackage: has('ICON_PACKAGE'),
    uiSourceRoot: has('DSDS_UI_SOURCE_ROOT'),
    propsExtractorDir: has('DSDS_PROPS_EXTRACTOR_DIR'),
    enableFeedback: has('DSDS_ENABLE_FEEDBACK'),
    introInline: has('DSDS_INTRO_INLINE'),
    feedbackDir: has('DSDS_FEEDBACK_DIR'),
    logsDir: has('DSDS_LOGS_DIR'),
    schemaVersion: has('DSDS_SCHEMA_VERSION'),
  };
}

/**
 * Resolve the effective configuration: env vars > config file > defaults.
 *
 * The file is looked up at `configPath` (or the DSDS_CONFIG env var) when
 * given, otherwise discovered by walking up from `cwd`. A missing or broken
 * file never throws — the error is reported in `meta.configFileError` and the
 * env/default configuration is returned, so a bad file can't take the MCP
 * server down.
 *
 * @returns {Promise<object>} the loadConfig() shape plus
 *   `meta: { configFile: string|null, configFileError: string|null }`
 */
export async function resolveConfig({ cwd = process.cwd(), configPath = undefined } = {}) {
  // Callers pass `configPath: null` to mean "no --config flag" — treat null
  // and undefined alike so the DSDS_CONFIG env var applies in both cases
  // (default parameters only fire on undefined, which silently disabled it).
  configPath = configPath ?? process.env['DSDS_CONFIG'] ?? null;
  const envConfig = loadConfig();
  const meta = { configFile: null, configFileError: null };

  let filePath = null;
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
  let fileConfig;
  try {
    fileConfig = normalizeFileConfig((await loadConfigFile(filePath)) ?? {}, dirname(filePath));
  } catch (err) {
    meta.configFileError = `failed to load ${filePath}: ${err.message}`;
    return { ...envConfig, meta };
  }

  const envProvided = envProvidedKeys();
  const merged = { ...envConfig };
  for (const [key, value] of Object.entries(fileConfig)) {
    if (!envProvided[key]) merged[key] = value;
  }
  return { ...merged, meta };
}
