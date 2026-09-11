# dsds-cli

Command-line interface for the [Design System Documentation Spec (DSDS)](https://designsystemdocspec.org). Query, search, validate, and lint against DSDS documents from any terminal — for humans, CI pipelines, and coding agents that have shell access but no MCP client.

This package is a thin transport. All logic lives in [dsds-mcp](../mcp)'s shared surface (`src/surface.js`), which also powers the MCP server. One core, two surfaces — the CLI and the MCP server cannot drift apart.

An MCP server advertises four capability groups. Each has a command here, so a shell-only agent works with the same material an MCP client is handed:

| MCP capability | Command |
| --- | --- |
| Instructions (sent on connect) | `dsds instructions` |
| Tools | `dsds tool <name>`, plus the porcelain commands below |
| Prompts (slash commands) | `dsds prompt [<name>] [--task <text>]` |
| Resources (`dsds://entity/…`) | `dsds resource [<uri\|identifier>]` |

Parity is a tested guarantee, not an aspiration: a capability added to the shared surface with no CLI route fails the test suite.

## Status

v0.1.0 — plan Phases 0–4 complete; not yet published to npm. Run it from this repo:

```sh
npm install
node src/index.js --version    # or: npx dsds (after npm link / project install)
```

## Quick start

```sh
# Spec tools need no configuration
dsds spec overview
dsds scaffold component

# Design system commands read DSDS_PATHS
export DSDS_PATHS="/path/to/your-system.dsds.json"
dsds list --kind component
dsds search button
dsds get button --block api
dsds context button
dsds impact card

# Health check for CI (exit 2 on failures)
dsds doctor

# Machine-readable: what can this CLI do?
dsds manifest
```

## Commands

| Command | Purpose |
| --- | --- |
| `dsds list [--kind k] [--status s]` | List entities, optionally filtered |
| `dsds search <query> [--kind k] [--status s]` | Search entities by text |
| `dsds get <id> [--block <blockType>]` | Full entity docs, or one block (api, guidelines, …) |
| `dsds context <id> [--verbose]` | LLM-optimized rules and constraints |
| `dsds chunk <id>` | Pre-assembled code chunk with guidelines |
| `dsds build <component> [--answers '<json>']` | Compose a component into guaranteed-valid JSX — omit `--answers` to list its props and allowed values, then finalize with a `{ propId: value }` map — **exit 2 if a value is rejected** |
| `dsds deps <id>` / `dsds dependents <id>` | Relationship graph, either direction (`--relation`, `--transitive`) |
| `dsds impact <id>` | Blast radius: what breaks if this changes |
| `dsds alternatives <id>` | Interchangeable options and replacements |
| `dsds markdown <id>` | Export an entity as markdown |
| `dsds brief <build\|author\|ask> [--task t]` | Task briefing |
| `dsds scaffold <kind>` | Blank DSDS JSON template |
| `dsds spec overview \| schema <kind> \| blocks <kind>` | Spec reference |
| `dsds validate <file>` | Schema-validate a document — **exit 2 on findings** |
| `dsds lint <path…>` / `dsds lint --stdin` | Lint against configured ESLint plugins — **exit 2 on findings** |
| `dsds check-exports <Component…>` | Verify names are real package exports |
| `dsds doctor [--json]` | Config + document integrity diagnosis — **exit 2 on failures** |
| `dsds init [--agents] [--force]` | Scaffold `dsds.config.mjs` (seeded from current env vars); `--agents` writes an agent-docs stanza |
| `dsds tool <tool-name> [flags]` | Invoke any registry tool directly (incl. wizards) |
| `dsds prompt [<name>] [--task t]` | List the MCP prompts, or render one as a briefing |
| `dsds resource [<uri\|id>]` | List the entity resources, or read one as JSON |
| `dsds instructions` | The instruction block an MCP client receives on connect |
| `dsds manifest` | Self-describing JSON manifest of the full surface |

Doctor checks: paths configured, documents load, identifier uniqueness, schema validation of the root **and every `$ref`-referenced entity file**, spec version alignment, relationship graph (unresolved targets, cycles), example-code props, brief kind references, lint plugin resolution, package export paths, and the MCP surface (every tool, prompt, and resource this project resolves to — each resource is read, so one that fails to serialize is a failing check).

The wizards (`dsds_build_component`, `dsds_author_component_doc`) and `dsds_feedback` deliberately have no porcelain command — they are conversational tools; reach them via `dsds tool … --args` when needed.

## Tool inputs (`dsds tool`)

Flat scalar inputs are flags named after the schema property; nested inputs arrive as JSON:

```sh
dsds tool dsds_get_entity --identifier button
dsds tool dsds_lint_by_path --args '{"files":[{"path":"src/App.tsx"}]}'
dsds tool dsds_validate --args-file payload.json
```

Flags win over `--args` keys when both are present.

## Output contract

- **stdout** — the payload. Human-readable text by default; with `--json`, a stable envelope: `{ "ok", "tool", "exitCode", "data" | "error" }`. Tools with structured findings (lint) add a `structured` mirror so machines don't parse prose. `prompt`, `resource`, and `instructions` run no tool, so their envelope carries `"command"` in place of `"tool"`.
- **stderr** — diagnostics only. stdout stays pipe-safe (`dsds get button --json | jq -r .data`).
- **Exit codes** — `0` success · `1` usage or runtime error · `2` the command ran and found problems (lint findings, validation errors, doctor failures). CI can gate on `2`.

## Configuration

Preferred: a project-local config file — `dsds.config.mjs`, `dsds.config.js`, or `dsds.config.json` — discovered by walking up from the working directory. `--config <file>` or the `DSDS_CONFIG` env var select one explicitly. Relative paths resolve against the file's directory, so the config travels with the repo:

```js
// dsds.config.mjs
export default {
  paths: ['./dsds/my-system.dsds.json'],
  lintPlugins: ['eslint-plugin-my-ds'],
  lintResolveDir: '../tooling',
};
```

Accepted keys: `paths`, `introPaths`, `lintPlugins`, `lintResolveDir`, `lintSourceDir`, `packageExportPaths` (object map), `iconPackage`, `feedbackDir`, `logsDir`, `enableFeedback`, `introInline`, `schemaVersion`.

**The dsds-mcp MCP server reads the same file**, so an MCP client entry can shrink to just a working directory (or a single `DSDS_CONFIG` var). A broken config file never crashes either surface — it falls back to env vars with a stderr warning, and `dsds doctor` reports it.

Environment variables override the file per key (env > file > defaults), so existing setups keep working unchanged:

| Variable | Purpose |
| --- | --- |
| `DSDS_CONFIG` | Explicit path to a dsds.config file |
| `DSDS_PATHS` | Comma-separated DSDS document paths (required for design system commands) |
| `DSDS_INTRO_PATHS` | Intro entity documents |
| `LINT_PLUGINS` / `LINT_RESOLVE_DIR` / `LINT_SOURCE_DIR` | ESLint plugins for `dsds lint` |
| `PACKAGE_EXPORT_PATHS` | `pkg=path` pairs for `dsds check-exports` |
| `ICON_PACKAGE` | Icon package name, enables doctor's icon-import check |
| `DSDS_LOGS_DIR` | Set to enable JSONL usage logging (shared format with dsds-mcp, entries marked `"surface": "cli"`). Off otherwise; `--no-log` skips per call |

Spec commands (`spec`, `scaffold`, `validate`) work with no configuration at all.

## For agents

`dsds init --agents` writes a marker-delimited stanza into the project's AGENTS.md (`--agents-file` targets another file, e.g. CLAUDE.md): the command cheat-sheet, the briefing entry points, and the exit-code contract. Re-running replaces the stanza in place. That's how shell-only agents discover the CLI without an MCP client.

`dsds manifest` returns every command, tool, prompt, and input schema as one JSON payload, plus a `capabilities` map naming the command behind each MCP capability group — read it once instead of scraping `--help`.

Starting cold, with no MCP client: `dsds instructions` is the briefing an MCP client would have been handed on connect, and `dsds prompt build-with-design-system --task "…"` is the slash command it would have offered.

For a network-free local-model session, see the repository's
[offline local-model workflow](../../OFFLINE-LOCAL-MODEL-WORKFLOW.md).

## Roadmap

Phases, requirements, decision log, and open items live in [CLI-PLAN.md](../../CLI-PLAN.md) at the monorepo root. All planned phases (0–4) are implemented; the remaining open decision is npm publishing and naming (`dsds` on npm is squatted; `@sanity-labs/dsds` is free).
