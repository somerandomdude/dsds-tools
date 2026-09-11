# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **MCP surface parity.** An MCP server advertises four capability groups —
  instructions, tools, prompts, resources. The CLI served only tools; the
  other three lived inside `server.js` and were unreachable from a shell.
  They now come from one shared core (`dsds-mcp/src/surface.js`) and each has
  a command:
  - `dsds prompt [<name>] [--task <text>]` — list the prompts an MCP client
    offers as slash commands, or render one. `dsds-intro` appears when intro
    documents are configured, exactly as it does over MCP.
  - `dsds resource [<uri|identifier>]` — list the `dsds://entity/{identifier}`
    resources, or read one as entity JSON. A bare identifier is shorthand.
  - `dsds instructions` — the instruction block an MCP client receives on
    connect, intro documents included. An MCP client gets this for free; a
    shell-only agent had no way to read it.
- `dsds doctor` gains an **mcp surface** check: reports how many tools,
  prompts, and resources this project resolves to, and proves each one
  renders — it reads every resource, so a resource that fails to serialize
  is a failing check rather than a surprise at call time.
- `dsds manifest` now describes all four capability groups (`capabilities`),
  lists `prompts` with their arguments, and documents the `resources` URI
  template alongside the existing `tools` array.
- `dsds build <component> [--answers '<json>']` — porcelain over the
  `dsds_build_component` wizard, giving shell agents the guided compose path
  MCP clients already had. Without `--answers` it lists the component's props
  and allowed values; with a `{ propId: value }` map it returns guaranteed-valid
  JSX in `result.code`. A rejected value or missing required prop exits 2
  (ran-but-found-problems); malformed `--answers` JSON exits 1. Manifest, help,
  and the `dsds init --agents` stanza pick it up automatically.

## [0.1.0] - 2026-07-08

Initial release — a command-line transport over dsds-mcp's shared tool
registry (`dsds-mcp/src/registry.js`). One catalog, two surfaces: this CLI and
the MCP server cannot drift apart.

### Added
- Generic dispatch: `dsds tool <tool-name>` invokes any registry tool. Flat
  scalar schema inputs become flags; everything else arrives as JSON via
  `--args` / `--args-file`.
- 16 porcelain commands: `list`, `search`, `get`, `context`, `chunk`, `deps`,
  `dependents`, `impact`, `alternatives`, `markdown`, `brief`, `scaffold`,
  `spec`, `check-exports`, `validate`, `lint`.
- `dsds doctor` — 13 checks over configuration and loaded documents, including
  schema validation of the root and every `$ref`-referenced entity file,
  identifier uniqueness, relationship-graph integrity, spec-version alignment,
  and lint-plugin resolution. Exit 2 on failures.
- `dsds manifest` — self-describing JSON payload of every command, tool, input
  schema, and the output contract, generated from the shared registry.
- `dsds init` — scaffolds `dsds.config.mjs` seeded from the current
  environment variables (the env → file migration path); `--agents` writes a
  marker-delimited agent-docs stanza (AGENTS.md by default, `--agents-file`
  for another target). Idempotent; `--force` to overwrite the config.
- Output contract: payload on stdout, diagnostics on stderr; `--json` envelope
  `{ok, tool, exitCode, data|error}` plus a structured mirror for lint
  findings; exit codes `0` / `1` / `2` (ran but found problems — CI gating).
- Project-local `dsds.config.{mjs,js,json}` support via dsds-mcp's
  `resolveConfig`, with `--config` and `DSDS_CONFIG` selection.
- Opt-in JSONL usage logging (`DSDS_LOGS_DIR`), sharing dsds-mcp's log format
  with a `surface: "cli"` marker; `--no-log` per call.
- Generated help (`dsds help`, per-command and per-tool `--help`) from the same
  definitions as the manifest.
