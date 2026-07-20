// One-shot runtime: load config + documents, wire the shared tool registry.
//
// The CLI counterpart of dsds-mcp's server wiring (src/index.js there) — but
// with no file watcher, no update check, and no transport. Load once,
// dispatch, exit.

import { resolveConfig } from 'dsds-mcp/src/config.js';
import { loadSystems, summarizeEntities, loadIntroEntities } from 'dsds-mcp/src/loader.js';
import { createGraphGetter } from 'dsds-mcp/src/graph.js';
import { createToolRuntime } from 'dsds-mcp/src/registry.js';

export async function createRuntime({ quiet = false, configPath = null } = {}) {
  // Env vars > dsds.config.{mjs,js,json} (discovered from cwd upward, or via
  // --config / DSDS_CONFIG) > defaults.
  // Pass `undefined` (not null) when no --config flag was given, so
  // resolveConfig's DSDS_CONFIG default parameter can apply — an explicit
  // null suppresses default parameters and silently disabled the env var.
  const config = await resolveConfig({ configPath: configPath ?? undefined });

  if (config.meta.configFileError) {
    process.stderr.write(`dsds: config file error (using env/defaults): ${config.meta.configFileError}\n`);
  }

  const [{ systems, errors }, introEntities] = await Promise.all([
    loadSystems(config.paths),
    loadIntroEntities(config.introPaths),
  ]);

  if (!quiet) {
    if (config.paths.length === 0) {
      process.stderr.write('dsds: DSDS_PATHS not set — design system tools unavailable (spec tools still work)\n');
    }
    for (const { path, error } of errors) {
      process.stderr.write(`dsds: failed to load ${path}: ${error}\n`);
    }
  }

  const state = { systems, summaries: summarizeEntities(systems) };
  const getSystems = () => state.systems;

  const { toolDefs, dispatch } = createToolRuntime({
    getSystems,
    getSummaries: () => state.summaries,
    getIntro: () => introEntities,
    getGraph: createGraphGetter(getSystems),
    getLintConfig: () => ({ plugins: config.lintPlugins, resolveDir: config.lintResolveDir, sourceDir: config.lintSourceDir }),
    getExportPaths: () => config.packageExportPaths,
    feedbackDir: config.feedbackDir,
    logsDir: config.logsDir,
    enableFeedback: config.enableFeedback,
  });

  return { config, toolDefs, dispatch };
}

// The catalog without any document loading — enough for `dsds tool` (listing),
// per-tool help, and the manifest, which only read tool definitions.
export function createRegistryOnly() {
  const empty = [];
  return createToolRuntime({
    getSystems: () => empty,
    getSummaries: () => empty,
    getGraph: createGraphGetter(() => empty),
  });
}
