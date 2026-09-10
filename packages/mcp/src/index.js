#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveConfig } from './config.js';
import { loadSystems, summarizeEntities, loadIntroEntities } from './loader.js';
import { createServer } from './server.js';
import { startUpdateCheck } from './spec/version.js';
import { startWatching } from './watcher.js';

async function main() {
  // Env vars > dsds.config.{mjs,js,json} (discovered from cwd upward, or via
  // DSDS_CONFIG) > defaults. A broken file falls back to env — never a crash.
  const config = await resolveConfig();
  if (config.meta.configFile) {
    process.stderr.write(`[dsds-mcp] Config file: ${config.meta.configFile}\n`);
  }
  if (config.meta.configFileError) {
    process.stderr.write(`[dsds-mcp] Config file error (using env/defaults): ${config.meta.configFileError}\n`);
  }

  const [{ systems, errors }, introEntities] = await Promise.all([
    loadSystems(config.paths),
    loadIntroEntities(config.introPaths),
  ]);

  // Startup diagnostics — always written to stderr so client logs show the state
  if (config.paths.length === 0) {
    process.stderr.write('[dsds-mcp] DSDS_PATHS not set — design system tools unavailable\n');
  } else {
    for (const system of systems) {
      process.stderr.write(`[dsds-mcp] Loaded ${system.entities.length} entities from ${system.filePath}\n`);
    }
    for (const { path, error } of errors) {
      process.stderr.write(`[dsds-mcp] Failed to load ${path}: ${error}\n`);
    }
    if (systems.length === 0) {
      process.stderr.write('[dsds-mcp] All paths failed to load — check paths and file permissions\n');
    }
  }

  if (config.lintPlugins.length > 0) {
    process.stderr.write(`[dsds-mcp] Lint plugins: ${config.lintPlugins.join(', ')} (resolving from ${config.lintResolveDir})\n`);
  }

  startUpdateCheck();

  // Shared mutable state — watcher updates these in place on file change
  const state = {
    systems,
    summaries: summarizeEntities(systems),
  };

  const getLintConfig = () => ({
    plugins: config.lintPlugins,
    resolveDir: config.lintResolveDir,
    sourceDir: config.lintSourceDir,
    uiCodemods: {
      enabled: config.lintUiCodemods,
      codemodPackage: config.lintUiCodemodPackage,
      // Whatever is configured is what runs — the runner no longer filters
      // this against a built-in list. An empty list means nothing is
      // configured, and the codemod pass is a no-op.
      transformNames: config.lintUiCodemodTransforms,
      transformPath: config.lintUiCodemodTransformPath,
      todoMarker: config.lintUiCodemodTodoMarker,
      fromPackage: config.lintUiCodemodFromPackage,
      toPackage: config.lintUiCodemodToPackage,
    },
  });
  const getExportPaths = () => config.packageExportPaths;
  const getPropsConfig = () => ({ propsExtractorDir: config.propsExtractorDir, uiSourceRoot: config.uiSourceRoot });

  if (config.packageExportPaths.size > 0) {
    process.stderr.write(`[dsds-mcp] Export paths: ${[...config.packageExportPaths.keys()].join(', ')}\n`);
  }

  if (introEntities.length > 0) {
    process.stderr.write(`[dsds-mcp] Loaded ${introEntities.length} intro entit${introEntities.length === 1 ? 'y' : 'ies'}: ${introEntities.map(e => e.identifier).join(', ')}\n`);
  }

  const server = createServer(
    () => state.systems,
    () => state.summaries,
    introEntities,
    getLintConfig,
    getExportPaths,
    config.feedbackDir,
    config.logsDir,
    config.enableFeedback,
    config.introInline,
    getPropsConfig,
    config.researchMode,
  );

  startWatching(config.paths, state);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Self-terminate when the parent (the MCP client) goes away.
  //
  // The chokidar watcher and the update-check timer keep our event loop alive
  // indefinitely, so once the parent dies we would otherwise linger forever as
  // an orphan reparented to launchd — exactly how dsds-mcp processes piled up
  // (45+) on the test machine. The parent-side harness SIGTERMs its children on
  // graceful exit / Ctrl-C, but a SIGKILL'd, crashed, or OOM-killed parent skips
  // all of that, and macOS has no PR_SET_PDEATHSIG. The one signal we always get
  // is stdin closing: when the parent dies, the OS tears down the stdin pipe and
  // emits 'end'/'close'. The SDK's StdioServerTransport listens only for 'data'
  // and 'error', so we watch for EOF ourselves and exit.
  const exitOnParentLoss = () => process.exit(0);
  process.stdin.on('end', exitOnParentLoss);
  process.stdin.on('close', exitOnParentLoss);
  transport.onclose = exitOnParentLoss;
}

main().catch(err => {
  process.stderr.write(`[dsds-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
