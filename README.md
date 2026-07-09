# dsds-tools

Tooling monorepo for the [Design System Documentation Spec (DSDS)](https://designsystemdocspec.org): one core, multiple transports. The tool catalog, document loader, validator, relationship graph, and configuration logic are shared; the MCP server and the CLI are thin surfaces over them, generated from the same definitions so they cannot drift apart.

| Package | Publishes as | What it is |
| --- | --- | --- |
| [`packages/mcp`](packages/mcp) | [`dsds-mcp`](https://www.npmjs.com/package/dsds-mcp) | MCP server: 23 tools, prompts, resources, and injected agent instructions for MCP clients (Claude Code, Cursor, Claude Desktop, …). Currently also home to the shared core. |
| [`packages/cli`](packages/cli) | `dsds-cli` (not yet published) | The `dsds` command: porcelain commands, `doctor`, `init --agents`, `manifest`, and generic tool dispatch — for humans, CI, and agents with shell access but no MCP client. |

## Quick start

```sh
npm install                 # workspace install
npm test                    # both packages' suites

# MCP server (existing client configs keep working — src/index.js is a
# compatibility shim for the pre-monorepo path):
node packages/mcp/src/index.js

# CLI:
node packages/cli/src/index.js help
```

Both surfaces read configuration from a project-local `dsds.config.{mjs,js,json}` (discovered upward from the working directory, `DSDS_CONFIG` to pin one), with environment variables overriding per key. See each package's README for details.

## Layout notes

- `src/index.js` at the repo root is a **compatibility shim** for MCP client configs that predate the monorepo — it just imports `packages/mcp/src/index.js`.
- Plan, requirements, and the full decision/delivery log: [CLI-PLAN.md](CLI-PLAN.md).
- Planned next structural step (Stage B, at publish time): extract the shared core into `packages/core` so `doctor`'s checks can also be served as an MCP tool.
