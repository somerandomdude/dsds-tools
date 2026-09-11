// MCP transport envelope.
//
// Every capability this server advertises — instructions, tools, prompts,
// resources — comes from src/surface.js, the shared core the dsds CLI also
// builds on. Nothing is defined here: these handlers translate MCP protocol
// requests into surface calls and back. Keep it that way; logic that lands
// here is logic the CLI cannot reach.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json');
import { writeLog } from './logger.js';

import { createSurface } from './surface.js';
import { createGraphGetter } from './graph.js';

export function createServer(getSystems, getSummaries, introEntities = [], getLintConfig = null, getExportPaths = null, feedbackDir = null, logsDir = null, enableFeedback = true, introInline = true, getPropsConfig = null) {
  // Lets get_entity and the intro prompt reach intro entities (they live
  // outside the queried systems), so the compact-index pointer in the
  // instructions resolves to real content on demand.
  const getIntro = () => introEntities;

  const surface = createSurface({
    getSystems,
    getSummaries,
    getIntro,
    getGraph: createGraphGetter(getSystems),
    getLintConfig,
    getExportPaths,
    getPropsConfig,
    feedbackDir,
    logsDir,
    enableFeedback,
    introInline,
  });

  const server = new Server(
    { name: 'dsds-mcp', version: pkg.version },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: surface.getInstructions() }
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: surface.toolDefs }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const startedAt = Date.now();

    const result = await surface.dispatch(name, args);

    // Record every tool call (best-effort, fire-and-forget). Detailed entries
    // (chunk/lint) are still written separately by those handlers. On failure,
    // capture the error message so "why did X error?" is answerable from the log.
    const entry = { type: 'tool', tool: name, ok: !result.isError, durationMs: Date.now() - startedAt };
    if (result.isError) {
      const msg = result.content?.[0]?.text;
      if (msg) entry.error = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
    }
    writeLog(logsDir, entry);

    return result;
  });

  // ── Prompts ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: surface.listPrompts() }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    return surface.getPrompt(name, args);
  });

  // ── Resources ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: surface.listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const content = surface.readResource(uri);

    if (!content) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return { contents: [content] };
  });

  return server;
}
