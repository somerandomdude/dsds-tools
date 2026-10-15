# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING (`--json`): structured data now lands in `data`.** Every read
  command used to put a rendered markdown document there, so the envelope
  was machine-readable but the payload was prose — `dsds list --json | jq
  '.data.entities[].identifier'` was impossible, and the advertised `| jq -r
  .data` just returned markdown. When a tool emits structured content
  (`list`, `search`, `lint`) `data` is that data and the rendered text moves
  to `text`; everything else is unchanged. Lint's findings moved from
  `structured` to `data` — the `structured` key is gone.
- **The CLI no longer speaks MCP.** Handler prose names tools canonically
  (`dsds_get_entity`), which is right for MCP and useless in a shell. The
  CLI now renders that text in its own vocabulary at the output boundary, so
  `dsds brief build` — the first command the generated AGENTS.md tells an
  agent to run — says "Run `dsds list`" instead of "Call `dsds_list_entities`",
  and the "you MUST call" rule reads `dsds get <identifier> --block api`
  rather than a function signature. Tools with no porcelain are shown as the
  `dsds tool …` invocation that runs them.
- **Unconfigured setup guidance points at `dsds init`**, not at an MCP
  client's `env` block, and no longer claims relative paths are unsupported
  — in a config file they resolve against the file's own directory. The
  redundant `DSDS_PATHS not set` stderr warning is gone: it fired even for
  spec commands that need no configuration, and doubled up with the guidance
  for those that do.
- **Search matches every word of a multi-word query**, in any field and any
  order, and indexes tags and kind alongside identifier, name, and summary.
  A single substring match over the whole query meant `dsds search "primary
  button"` — the most natural thing to type — always returned nothing.
  Results are ranked (exact identifier, then identifier, name, tags,
  summary), and a dead end now says which word found nothing.
- An unknown `--kind` or `--status` is an error naming the valid values,
  rather than an empty result indistinguishable from a real one.
- Absolute paths inside the working directory are printed relative to it.

### Fixed
- **The summary column was empty for every entity.** `summarizeEntities`
  read `metadata.summary` only; real 0.20.0 documents keep the one-liner in
  the entity's top-level `description`, so `dsds list` rendered 199 blank
  cells against the Sanity UI corpus. Search reads the same field, so
  entities were only findable by name — fixing the fallback repairs both.
- An entity with no `kind` is grouped under "Uncategorized" instead of the
  pluralized heading "Undefineds".
- A `--block` miss lists each available name once and includes `api` (which
  works but was never advertised); it used to repeat `guidelines` once per
  matching section.

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
- `dsds completion <bash|zsh|fish>` — completes commands, flags, and entity
  identifiers (pulled live from `dsds list --json`, so completion reflects
  whatever document the current directory resolves to). Identifiers are this
  CLI's main argument and nobody remembers 199 of them.
- `--limit <n>` on `dsds list` and `dsds search`; `dsds list` was 246 lines
  with no way to shorten it.
- `dsds manifest --compact` — names and usage without the tool input
  schemas, 38KB → 13KB. The README tells agents to read the manifest instead
  of scraping `--help`; the full payload is ~10k tokens.
- `dsds lint --apply --dry-run` — report what would be rewritten without
  touching a file. `--apply` is the CLI's only destructive operation and had
  no preview.
- `-h` and `-v` short flags, on the root command and every subcommand.
- "Did you mean" suggestions for a mistyped entity, command, flag, `--kind`,
  `--status`, block name, or tool name. A mistyped identifier used to print
  all 199 of them on one unwrapped line.
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
