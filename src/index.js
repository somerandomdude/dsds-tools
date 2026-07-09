#!/usr/bin/env node
// Compatibility shim — the MCP server moved to packages/mcp/src/index.js in
// the monorepo restructure. Existing MCP client configs point at this path;
// both entry points start the same server. Point new configs at
// packages/mcp/src/index.js.
import '../packages/mcp/src/index.js';
