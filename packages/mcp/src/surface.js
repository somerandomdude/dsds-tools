// Every capability the tooling exposes — instructions, tools, prompts,
// resources — in one object, independent of transport.
//
// server.js is a thin MCP envelope over this, and the dsds CLI builds the
// same surface. Adding a capability here reaches both at once; anything
// defined in either transport instead is something the other cannot see.

import { createToolRuntime } from './registry.js';
import { createPromptRuntime } from './prompts.js';
import { listResources, readResource } from './resources.js';
import { buildInstructions } from './instructions.js';
import { resolveTokenRefs, resolveTokenRefsDeep, tokenMap } from './token-refs.js';

// Tools whose output is documentation text. Their `{token}` references are
// resolved to "`token` (value)" on the way out. Spec, lint, validation and
// skill tools are not: they echo the caller's input or the spec's own text,
// where a brace means what it says.
const RESOLVING_TOOLS = new Set([
  'dsds_context_brief',
  'dsds_list_entities',
  'dsds_search_entities',
  'dsds_get_entity',
  'dsds_get_document_block',
  'dsds_get_agent_context',
  'dsds_get_chunk',
  'dsds_build_component',
]);

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
  getIconConfig = null,
  feedbackDir = null,
  logsDir = null,
  enableFeedback = true,
  introInline = true,
  researchMode = 'thorough',
}) {
  const { toolDefs, dispatch } = createToolRuntime({
    getSystems,
    getSummaries,
    getIntro,
    getGraph,
    getLintConfig,
    getExportPaths,
    getPropsConfig,
    getIconConfig,
    feedbackDir,
    logsDir,
    enableFeedback,
  });

  const { listPrompts, getPrompt } = createPromptRuntime({ getIntro });

  // Built per call: token files are cached by mtime in tokens.js, so an
  // edited value shows up on the next request without a restart.
  const tokens = () => tokenMap(getSystems() ?? []);

  return {
    toolDefs,
    dispatch: async (name, args) => {
      const result = await dispatch(name, args);
      return RESOLVING_TOOLS.has(name) ? resolveTokenRefsDeep(result, tokens()) : result;
    },
    listPrompts,
    getPrompt: (name, args) => resolveTokenRefsDeep(getPrompt(name, args), tokens()),
    listResources: () => listResources(getSummaries),
    readResource: uri => {
      const res = readResource(uri, getSystems);
      return res ? resolveTokenRefsDeep(res, tokens()) : res;
    },
    getInstructions: () =>
      resolveTokenRefs(
        buildInstructions({ introEntities: getIntro(), enableFeedback, introInline, researchMode }),
        tokens()
      ),
  };
}
