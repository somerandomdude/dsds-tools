// Shared tool runtime — the single catalog of tool definitions and the
// dispatcher that wires each handler to its dependencies.
//
// Every transport builds its surface from this module: the MCP server
// (src/server.js) and the dsds CLI (the dsds-cli package) both consume
// createToolRuntime, so the tool catalog cannot drift between them.

import { specOverviewDef, specOverviewHandler } from './tools/spec-overview.js';
import { specEntitySchemaDef, specEntitySchemaHandler } from './tools/spec-entity-schema.js';
import { specDocumentBlocksDef, specDocumentBlocksHandler } from './tools/spec-document-blocks.js';
import { specScaffoldDef, specScaffoldHandler } from './tools/spec-scaffold.js';
import { validateDef, validateHandler } from './tools/validate.js';
import { contextBriefDef, contextBriefHandler } from './tools/context-brief.js';
import { listEntitiesDef, listEntitiesHandler } from './tools/list-entities.js';
import { getEntityDef, getEntityHandler } from './tools/get-entity.js';
import { searchEntitiesDef, searchEntitiesHandler } from './tools/search-entities.js';
import { getDocumentBlockDef, getDocumentBlockHandler } from './tools/get-document-block.js';
import { getAgentContextDef, getAgentContextHandler } from './tools/get-agent-context.js';
import { lintByPathDef, lintByPathHandler, lintInlineDef, lintInlineHandler } from './tools/lint-code.js';
import { getChunkDef, getChunkHandler } from './tools/get-chunk.js';
import { feedbackDef, feedbackHandler } from './tools/feedback.js';
import { checkExportsDef, checkExportsHandler } from './tools/check-exports.js';
import { explainErrorDef, explainErrorHandler } from './tools/explain-error.js';
import { listSkillsDef, listSkillsHandler } from './tools/list-skills.js';
import { getSkillDef, getSkillHandler } from './tools/get-skill.js';
import { toMarkdownDef, toMarkdownHandler } from './tools/to-markdown.js';
import { buildComponentDef, buildComponentHandler } from './tools/build-component.js';
import { authorComponentDocDef, authorComponentDocHandler } from './tools/author-component-doc.js';
import {
  getDependentsDef, getDependentsHandler,
  getDependenciesDef, getDependenciesHandler,
  getAlternativesDef, getAlternativesHandler,
  impactDef, impactHandler,
} from './tools/relationships.js';

function validateArgs(toolDef, args) {
  const { required = [], properties = {} } = toolDef.inputSchema ?? {};

  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return `Missing required argument: "${field}"`;
    }
  }

  for (const [field, value] of Object.entries(args)) {
    const prop = properties[field];
    if (!prop) continue;
    if (prop.type === 'string' && typeof value !== 'string') {
      return `Argument "${field}" must be a string, got ${typeof value}`;
    }
    if (prop.type === 'array' && !Array.isArray(value)) {
      return `Argument "${field}" must be an array, got ${typeof value}`;
    }
    if (prop.enum && !prop.enum.includes(value)) {
      return `Argument "${field}" must be one of: ${prop.enum.join(', ')}`;
    }
  }

  return null;
}

function errorResponse(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Build the shared tool runtime: the ordered tool catalog plus a dispatcher
 * that validates args and routes each call to its handler with the right
 * dependencies injected.
 *
 * All getters are functions so callers can back them with mutable state
 * (the MCP server's file watcher swaps systems in place; the CLI loads once).
 *
 * @param {object} deps
 * @param {() => Array} deps.getSystems - loaded DSDS systems
 * @param {() => Array} deps.getSummaries - entity summaries for the loaded systems
 * @param {() => Array} [deps.getIntro] - intro entities (outside the queried systems)
 * @param {() => object} deps.getGraph - relationship graph (see createGraphGetter in graph.js)
 * @param {(() => {plugins: string[], resolveDir: string, sourceDir?: string})|null} [deps.getLintConfig]
 * @param {(() => Map<string, string>)|null} [deps.getExportPaths]
 * @param {string|null} [deps.feedbackDir]
 * @param {string|null} [deps.logsDir]
 * @param {boolean} [deps.enableFeedback]
 * @returns {{ toolDefs: Array, dispatch: (name: string, args?: object) => Promise<{isError?: boolean, content: Array}> }}
 */
export function createToolRuntime({
  getSystems,
  getSummaries,
  getIntro = () => [],
  getGraph,
  getLintConfig = null,
  getExportPaths = null,
  feedbackDir = null,
  logsDir = null,
  enableFeedback = true,
}) {
  const toolDefs = [
    contextBriefDef,
    specOverviewDef,
    specEntitySchemaDef,
    specDocumentBlocksDef,
    specScaffoldDef,
    authorComponentDocDef,
    buildComponentDef,
    validateDef,
    listEntitiesDef,
    getEntityDef,
    searchEntitiesDef,
    getDocumentBlockDef,
    getAgentContextDef,
    getChunkDef,
    getDependentsDef,
    getDependenciesDef,
    getAlternativesDef,
    impactDef,
    lintByPathDef,
    lintInlineDef,
    checkExportsDef,
    explainErrorDef,
    listSkillsDef,
    getSkillDef,
    toMarkdownDef,
    ...(enableFeedback ? [feedbackDef] : []),
  ];

  const toolMap = new Map(toolDefs.map(t => [t.name, t]));

  // Resolve and run a tool call, returning its result (never throws).
  async function dispatch(name, args = {}) {
    const toolDef = toolMap.get(name);
    if (!toolDef) return errorResponse(`Unknown tool: "${name}"`);

    const validationError = validateArgs(toolDef, args);
    if (validationError) return errorResponse(validationError);

    try {
      switch (name) {
        case 'dsds_context_brief':        return contextBriefHandler(args, getSystems, getSummaries);
        case 'dsds_spec_overview':        return specOverviewHandler(args);
        case 'dsds_spec_entity_schema':   return specEntitySchemaHandler(args);
        case 'dsds_spec_document_blocks': return specDocumentBlocksHandler(args);
        case 'dsds_spec_scaffold':        return specScaffoldHandler(args);
        case 'dsds_build_component':      return buildComponentHandler(args, getSystems, getSummaries);
        case 'dsds_author_component_doc': return authorComponentDocHandler(args);
        case 'dsds_validate':             return validateHandler(args);
        case 'dsds_list_entities':        return listEntitiesHandler(args, getSystems, getSummaries);
        case 'dsds_get_entity':           return getEntityHandler(args, getSystems, getSummaries, getIntro, getGraph);
        case 'dsds_search_entities':      return searchEntitiesHandler(args, getSystems, getSummaries);
        case 'dsds_get_document_block':   return getDocumentBlockHandler(args, getSystems);
        case 'dsds_get_agent_context':    return getAgentContextHandler(args, getSystems, getGraph);
        case 'dsds_get_chunk':            return getChunkHandler(args, getSystems, logsDir);
        case 'dsds_get_dependents':       return getDependentsHandler(args, getGraph);
        case 'dsds_get_dependencies':     return getDependenciesHandler(args, getGraph);
        case 'dsds_get_alternatives':     return getAlternativesHandler(args, getGraph);
        case 'dsds_impact':               return impactHandler(args, getGraph);
        case 'dsds_lint_by_path':         return lintByPathHandler(args, getLintConfig ?? (() => ({ plugins: [], resolveDir: process.cwd() })), logsDir);
        case 'dsds_lint_inline':          return lintInlineHandler(args, getLintConfig ?? (() => ({ plugins: [], resolveDir: process.cwd() })), logsDir);
        case 'dsds_check_exports':        return checkExportsHandler(args, getExportPaths ?? (() => new Map()));
        case 'dsds_explain_error':        return explainErrorHandler(args);
        case 'dsds_list_skills':          return listSkillsHandler(args);
        case 'dsds_get_skill':            return getSkillHandler(args);
        case 'dsds_to_markdown':          return toMarkdownHandler(args, getSystems);
        case 'dsds_feedback':             return feedbackHandler(args, feedbackDir);
        default:                          return errorResponse(`Unknown tool: "${name}"`);
      }
    } catch (err) {
      return errorResponse(`Tool error: ${err.message}`);
    }
  }

  return { toolDefs, dispatch };
}
