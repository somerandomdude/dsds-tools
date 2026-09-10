import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BUNDLED_VERSION } from './spec/version.js';
import { getCodemodPreset } from './codemod-presets/index.js';

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

  // LINT_UI_CODEMODS: opt-in. When truthy, dsds_lint_by_path/dsds_lint_inline
  // run the configured jscodeshift transforms before ESLint, moving
  // components from LINT_UI_CODEMOD_FROM_PACKAGE to LINT_UI_CODEMOD_TO_PACKAGE.
  // Off by default — this is a real code transform, not just a lint rule, so
  // a consumer opts in deliberately. Which transforms run is configuration:
  // see LINT_UI_CODEMOD_PRESET below.
  const rawLintUiCodemods = process.env['LINT_UI_CODEMODS'];
  const lintUiCodemods = rawLintUiCodemods != null && !/^(false|0|no|off)$/i.test(rawLintUiCodemods.trim());

  // LINT_UI_CODEMOD_PRESET: selects a per-design-system preset from
  // src/codemod-presets/ (e.g. 'sanity-ui'), which supplies the codemod
  // package, the from/to import sources, the transform-module template, the
  // vetted transform list and the package's TODO-comment marker.
  //
  // Every field below can also be set directly, and an explicit environment
  // variable always beats the preset — so a preset is a starting point, not a
  // lock-in. Unset means no preset: configure the fields individually.
  //
  // Before 0.20.1 these five defaulted to @sanity/ui values inline here, and
  // ui-codemods.js additionally filtered the transform list against a
  // hardcoded @sanity/ui allowlist — so another design system could configure
  // the pass fully and still get nothing. Both are now preset data.
  const rawLintUiCodemodPreset = process.env['LINT_UI_CODEMOD_PRESET'];
  const lintUiCodemodPresetId = rawLintUiCodemodPreset ? rawLintUiCodemodPreset.trim() : null;
  // Throws on an unknown id — see getCodemodPreset's own comment for why a
  // silent fallback would be worse than a startup failure.
  const preset = lintUiCodemodPresetId ? getCodemodPreset(lintUiCodemodPresetId) : null;

  const rawLintUiCodemodPackage = process.env['LINT_UI_CODEMOD_PACKAGE'];
  const lintUiCodemodPackage = rawLintUiCodemodPackage ? rawLintUiCodemodPackage.trim() : (preset?.codemodPackage ?? null);

  // LINT_UI_CODEMOD_TRANSFORMS: comma-separated transform names to attempt.
  // Every name given is attempted — the runner no longer second-guesses the
  // list. Unset falls back to the preset's vetted set.
  const rawLintUiCodemodTransforms = process.env['LINT_UI_CODEMOD_TRANSFORMS'];
  const lintUiCodemodTransforms = rawLintUiCodemodTransforms
    ? rawLintUiCodemodTransforms.split(',').map(s => s.trim()).filter(Boolean)
    : (preset?.transforms ?? []);

  // LINT_UI_CODEMOD_TRANSFORM_PATH: how the codemod package exposes one
  // transform as a module, with `<pkg>` and `<name>` placeholders — e.g.
  // '<pkg>/transforms/latest/<name>'. No universal default exists; without
  // one (from here or a preset) nothing can be resolved.
  const rawLintUiCodemodTransformPath = process.env['LINT_UI_CODEMOD_TRANSFORM_PATH'];
  const lintUiCodemodTransformPath = rawLintUiCodemodTransformPath
    ? rawLintUiCodemodTransformPath.trim()
    : (preset?.transformPath ?? null);

  // LINT_UI_CODEMOD_TODO_MARKER: the marker the package writes into its
  // "double check this" comments, which the runner rewrites into a JSX-safe
  // form. Unset and unprovided by a preset means that pass is skipped.
  const rawLintUiCodemodTodoMarker = process.env['LINT_UI_CODEMOD_TODO_MARKER'];
  const lintUiCodemodTodoMarker = rawLintUiCodemodTodoMarker
    ? rawLintUiCodemodTodoMarker.trim()
    : (preset?.todoMarker ?? null);

  const rawLintUiCodemodFromPackage = process.env['LINT_UI_CODEMOD_FROM_PACKAGE'];
  const lintUiCodemodFromPackage = rawLintUiCodemodFromPackage ? rawLintUiCodemodFromPackage.trim() : (preset?.fromPackage ?? null);

  const rawLintUiCodemodToPackage = process.env['LINT_UI_CODEMOD_TO_PACKAGE'];
  const lintUiCodemodToPackage = rawLintUiCodemodToPackage ? rawLintUiCodemodToPackage.trim() : (preset?.toPackage ?? null);

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

  // RESEARCH_MODE: how hard the server pushes an agent to economise on lookups
  // when an intro is inlined. Measured on the agent-tester at 5 iterations per
  // arm, Opus, same knowledge in both modes:
  //
  //   thorough  ~13 lookups/iter  ~199k tokens/iter   2-5 type errors
  //   frugal    ~4.6              ~145k               ~23
  //
  // The two are a genuine trade, not an optimisation: ~54k tokens per iteration
  // buys roughly a 5x reduction in type errors. `thorough` is the default
  // because an agent shipping unattended costs more in a failed build than in
  // tokens. Only meaningful with an inlined intro — with a compact index there
  // is nothing to economise against.
  const rawResearchMode = process.env['RESEARCH_MODE'];
  const researchMode = rawResearchMode && /^frugal$/i.test(rawResearchMode.trim())
    ? 'frugal'
    : 'thorough';

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
    lintUiCodemods,
    lintUiCodemodPresetId,
    lintUiCodemodPackage,
    lintUiCodemodTransforms,
    lintUiCodemodTransformPath,
    lintUiCodemodTodoMarker,
    lintUiCodemodFromPackage,
    lintUiCodemodToPackage,
    introPaths,
    packageExportPaths,
    iconPackage,
    uiSourceRoot,
    propsExtractorDir,
    enableFeedback,
    introInline,
    researchMode,
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
// lintPlugins, lintResolveDir, lintSourceDir, lintUiCodemods,
// lintUiCodemodPresetId, lintUiCodemodPackage, lintUiCodemodTransforms,
// lintUiCodemodTransformPath, lintUiCodemodTodoMarker,
// lintUiCodemodFromPackage, lintUiCodemodToPackage,
// packageExportPaths (object map), iconPackage,
// feedbackDir, logsDir, enableFeedback, introInline, researchMode, schemaVersion.

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
  if (raw.lintUiCodemods != null) out.lintUiCodemods = !!raw.lintUiCodemods;
  if (raw.lintUiCodemodPackage != null) out.lintUiCodemodPackage = String(raw.lintUiCodemodPackage).trim();
  if (raw.lintUiCodemodTransforms != null) out.lintUiCodemodTransforms = asList(raw.lintUiCodemodTransforms);
  if (raw.lintUiCodemodFromPackage != null) out.lintUiCodemodFromPackage = String(raw.lintUiCodemodFromPackage).trim();
  if (raw.lintUiCodemodToPackage != null) out.lintUiCodemodToPackage = String(raw.lintUiCodemodToPackage).trim();
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
  if (raw.researchMode != null) out.researchMode = /^frugal$/i.test(String(raw.researchMode)) ? 'frugal' : 'thorough';
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
    lintUiCodemods: has('LINT_UI_CODEMODS'),
    lintUiCodemodPackage: has('LINT_UI_CODEMOD_PACKAGE'),
    lintUiCodemodTransforms: has('LINT_UI_CODEMOD_TRANSFORMS'),
    lintUiCodemodFromPackage: has('LINT_UI_CODEMOD_FROM_PACKAGE'),
    lintUiCodemodToPackage: has('LINT_UI_CODEMOD_TO_PACKAGE'),
    introPaths: has('DSDS_INTRO_PATHS') || has('DSDS_INTRO_PATH'),
    packageExportPaths: has('PACKAGE_EXPORT_PATHS'),
    iconPackage: has('ICON_PACKAGE'),
    uiSourceRoot: has('DSDS_UI_SOURCE_ROOT'),
    propsExtractorDir: has('DSDS_PROPS_EXTRACTOR_DIR'),
    enableFeedback: has('DSDS_ENABLE_FEEDBACK'),
    introInline: has('DSDS_INTRO_INLINE'),
    researchMode: has('RESEARCH_MODE'),
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
