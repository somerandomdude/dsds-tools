// One-shot runtime: load config + documents, wire the shared surface.
//
// The CLI counterpart of dsds-mcp's server wiring (src/index.js there) — but
// with no file watcher, no update check, and no transport. Load once,
// dispatch, exit.
//
// createSurface is the same core the MCP server builds on, so the CLI gets
// all four capability groups — tools, prompts, resources, instructions — from
// one call, and neither surface can advertise something the other lacks.

import { resolveConfig } from 'dsds-mcp/src/config.js';
import { loadSystems, summarizeEntities, loadIntroEntities } from 'dsds-mcp/src/loader.js';
import { createGraphGetter } from 'dsds-mcp/src/graph.js';
import { createSurface } from 'dsds-mcp/src/surface.js';

export async function createRuntime({ quiet = false, configPath = null, outputFormat = null } = {}) {
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

  // Only real problems are reported here. "No paths configured" used to warn
  // on stderr as well, which meant a spec command that needs no configuration
  // nagged about it, and a command that does need it printed the complaint
  // twice — once here and once as the handler's setup guidance, which is the
  // one that actually tells you what to do.
  if (!quiet) {
    for (const { path, error } of errors) {
      process.stderr.write(`dsds: failed to load ${path}: ${error}\n`);
    }
  }

  const state = { systems, summaries: summarizeEntities(systems) };
  const getSystems = () => state.systems;

  const surface = createSurface({
    getSystems,
    getSummaries: () => state.summaries,
    getIntro: () => introEntities,
    getGraph: createGraphGetter(getSystems),
    getLintConfig: () => ({ plugins: config.lintPlugins, resolveDir: config.lintResolveDir, sourceDir: config.lintSourceDir }),
    getExportPaths: () => config.packageExportPaths,
    getPropsConfig: () => ({ propsExtractorDir: config.propsExtractorDir, uiSourceRoot: config.uiSourceRoot }),
    feedbackDir: config.feedbackDir,
    // Handler-level telemetry (chunk fetches, lint passes) follows the same
    // rule cli.js applies to its own tool-call log: only when logging was
    // explicitly configured. `config.logsDir` always holds a path — it
    // defaults to the dsds-mcp package's own logs/ — so passing it straight
    // through made every CLI invocation write there, bypassing that gate.
    // The existing "creates no logs directory" test missed it because it
    // checks cwd, and the default writes somewhere else entirely. The visible
    // symptom was the CLI test suite appending "Test Chunk" fixture records
    // to the production usage log, 9% of its chunk telemetry for the day.
    logsDir: config.logsDirExplicit ? config.logsDir : null,
    enableFeedback: config.enableFeedback,
    introInline: config.introInline,
    // --format wins over config/env for this one invocation; anything
    // else falls back to what the config resolved.
    outputFormat: outputFormat ?? config.outputFormat,
  });

  return { config, surface, toolDefs: surface.toolDefs, dispatch: surface.dispatch };
}

// The catalogs without any document loading — enough for `dsds tool`
// (listing), per-tool help, and the manifest, none of which read entity data.
// The prompt catalog it carries is the config-free set: dsds-intro depends on
// loaded intro documents, so it is absent here by construction, exactly as it
// is on a server started without intro paths. `dsds prompt` uses the loaded
// runtime instead, so it reports what this project actually offers.
export function createRegistryOnly() {
  const empty = [];
  return createSurface({
    getSystems: () => empty,
    getSummaries: () => empty,
    getGraph: createGraphGetter(() => empty),
  });
}
