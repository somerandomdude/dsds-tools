// The DSDS surface — every capability the tooling exposes, in one object,
// independent of transport.
//
// An MCP server has four capability groups: instructions, tools, prompts, and
// resources. Until now only tools were shared (registry.js); the other three
// lived inside server.js and were therefore MCP-only, which is why the CLI
// could not reach them. This module owns all four, so:
//
//   - src/server.js is a thin envelope: protocol handlers that delegate here.
//   - The dsds CLI builds the same surface and exposes the same four groups
//     (`dsds tool`, `dsds prompt`, `dsds resource`, `dsds instructions`).
//
// Adding a capability here reaches both surfaces at once; that is the point.

import { createToolRuntime } from './registry.js';
import { createPromptRuntime } from './prompts.js';
import { listResources, readResource } from './resources.js';
import { buildInstructions } from './instructions.js';

/**
 * Build the full transport-agnostic surface.
 *
 * Takes the same dependency bundle as createToolRuntime, plus `introInline`
 * (how intro entities render into the instructions). All getters are
 * functions so callers can back them with mutable state — the MCP server's
 * file watcher swaps systems in place; the CLI loads once.
 *
 * @param {object} deps - see createToolRuntime for the shared dependencies
 * @param {() => Array} deps.getSystems
 * @param {() => Array} deps.getSummaries
 * @param {() => Array} [deps.getIntro]
 * @param {() => object} deps.getGraph
 * @param {boolean} [deps.enableFeedback]
 * @param {boolean} [deps.introInline] - render intro entities in full (default) or as an index
 * @returns {{
 *   toolDefs: Array,
 *   dispatch: (name: string, args?: object) => Promise<object>,
 *   listPrompts: () => Array,
 *   getPrompt: (name: string, args?: object) => {messages: Array},
 *   listResources: () => Array,
 *   readResource: (uri: string) => object|null,
 *   getInstructions: () => string,
 * }}
 */
export function createSurface({
  getSystems,
  getSummaries,
  getIntro = () => [],
  getGraph,
  getLintConfig = null,
  getExportPaths = null,
  getPropsConfig = null,
  feedbackDir = null,
  logsDir = null,
  enableFeedback = true,
  introInline = true,
  researchMode = 'thorough',
  outputFormat = 'markdown',
}) {
  const { toolDefs, dispatch } = createToolRuntime({
    getSystems,
    getSummaries,
    getIntro,
    getGraph,
    getLintConfig,
    getExportPaths,
    getPropsConfig,
    feedbackDir,
    logsDir,
    enableFeedback,
    outputFormat,
  });

  const { listPrompts, getPrompt } = createPromptRuntime({ getIntro });

  return {
    toolDefs,
    dispatch,
    listPrompts,
    getPrompt,
    listResources: () => listResources(getSummaries),
    readResource: uri => readResource(uri, getSystems),
    getInstructions: () =>
      buildInstructions({ introEntities: getIntro(), enableFeedback, introInline, researchMode, outputFormat }),
  };
}
