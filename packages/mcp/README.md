# dsds-mcp

An MCP server for the [Design System Documentation Spec (DSDS)](https://designsystemdocspec.org). Exposes DSDS tooling to any MCP-compatible client (Claude Desktop, Cursor, etc.).

Three use cases:
- **Authoring** — help a team document their design system in DSDS format
- **Building** — let agents query an existing DSDS document to build UI with the design system
- **Answering** — let agents answer questions about how to use the design system, grounded in its authored documentation

The DSDS spec is bundled at the version listed below. The server checks for updates on startup and surfaces a notice in tool responses when a newer version is available.

**Bundled spec version:** 0.13.0

---

## Quick start (no coding required)

This gets the design-system tools running inside your AI assistant (Claude Desktop, Cursor, or Claude Code). You won't write any code — you'll copy a small block of text into a settings file.

**What you need:**

- An AI app that supports MCP — **Claude Desktop**, **Cursor**, or **Claude Code**.
- A **DSDS file** for your design system: one `.dsds.json` file that documents your components, tokens, and guidelines. Don't have one yet? See [I don't have a DSDS file yet](#i-dont-have-a-dsds-file-yet) below — you can use this tool to create one.

### Step 1 — Install Node.js

The server runs on Node.js, a free program that lets your computer run tools like this one.

1. Go to **[nodejs.org](https://nodejs.org)** and download the version labeled **"LTS"**.
2. Open the downloaded installer and click through with the default options.

You only do this once.

### Step 2 — Copy your DSDS file's location

You need the full location ("path") of your `.dsds.json` file:

- **macOS:** find the file in Finder, right-click it, hold the **Option** key, then choose **"Copy … as Pathname"**.
- **Windows:** find the file, hold **Shift**, right-click it, then choose **"Copy as path"**.

It will look something like `/Users/you/design-system/my-system.dsds.json`. You'll paste it in Step 4.

### Step 3 — Open your AI app's settings file

Open the configuration for the app you use:

- **Claude Desktop:** Settings → Developer → **Edit Config**.
- **Cursor:** open (or create) a file named `.cursor/mcp.json` in your project folder.
- **Claude Code:** run `claude mcp add` in a terminal, or open `~/.claude.json`.

If the file is empty, that's fine — you'll paste the whole block in the next step.

### Step 4 — Add the design-system server

Copy this block into the file. (If the file already has an `"mcpServers"` section, add just the `"dsds"` part inside it.)

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"],
      "env": {
        "DSDS_PATHS": "PASTE_YOUR_FILE_PATH_HERE"
      }
    }
  }
}
```

Replace `PASTE_YOUR_FILE_PATH_HERE` with the path you copied in Step 2 — keep the quotation marks around it. **Save the file.**

> 💡 **You don't need to install anything else.** The `npx` in the config downloads the server automatically the first time your app runs it, then reuses it afterward. The only thing you installed was Node.js in Step 1 — there's no `npm install` step.

### Step 5 — Restart your AI app

Fully quit the app and open it again so it loads the change. The first time it runs, it downloads the server on its own (this can take a few seconds — no extra steps).

### Step 6 — Check it worked

Ask your assistant:

> "Use the dsds tools to list the components in my design system."

If it lists your components, you're set. (In Claude Desktop you'll also see the tools under the tools/plug icon in the message box.)

### I don't have a DSDS file yet

You can use this tool to create one. Follow Steps 1, 3, and 5, but in Step 4 paste this shorter block (no file path needed):

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"]
    }
  }
}
```

Then ask your assistant: *"Help me document my design system in DSDS format."* It will walk you through it step by step. Once you've saved a `.dsds.json` file, go back to Step 4, add the `"env"` block with your file's path, and restart.

### Prefer to install it instead?

`npx` needs no maintenance and is the easiest option, but you can install the server if you'd rather:

- **Pin a version** so it never changes unexpectedly — set `"args": ["dsds-mcp@0.2.0"]` in your config.
- **Install it globally** and skip `npx` — run `npm install -g dsds-mcp` in a terminal, then use `"command": "dsds-mcp"` with no `"args"`.

> **Power users:** the [Configuration](#configuration) section below covers every option (multiple files, linting, export checks, icon validation) and where each client stores its config.

---

## Integrity guard

`npm run check:integrity` verifies that every reference DSDS can return to an agent resolves:

- every import from the configured icon package (`ICON_PACKAGE`) in chunk code is a real export (catches hallucinated icons),
- no brief directs agents to an entity kind that returns nothing,
- every prop used in example code is a real prop of the documented component (catches docs teaching a build error, e.g. `<Tooltip content=…>` when the prop is `text`; intentional ✗ counter-examples are skipped),
- one spec version across `version.js`, the README, and the loaded DSDS files.

Run it with the same env the server uses, so the icon and kind checks have data:

```sh
DSDS_PATHS=/path/to/your.dsds.json \
ICON_PACKAGE=@your-org/icons \
PACKAGE_EXPORT_PATHS=@your-org/icons=/path/to/@your-org/icons \
npm run check:integrity
```

The icon check is opt-in: it runs only when `ICON_PACKAGE` is set and that package has a `PACKAGE_EXPORT_PATHS` entry. Without `DSDS_PATHS` it still runs the version check and skips the rest with a warning. Wire it into CI or a pre-commit hook to block a merge on a broken reference. The pure checks are covered by `tests/integrity.test.js` (run in `npm test`); the full guard also runs there when `DSDS_PATHS` is set.

---

## Requirements

- Node.js 18 or later
- An MCP-compatible client
- ESLint v9 or later (optional — only required if using the lint tools (`dsds_lint_by_path` / `dsds_lint_inline`))

---

## Setup

### Option 1: npx (no install required)

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"]
    }
  }
}
```

### Option 2: Clone and run locally

```bash
git clone https://github.com/somerandomdude/dsds-mcp.git
cd dsds-mcp
npm install
```

Then point your MCP client at the local path:

```json
{
  "mcpServers": {
    "dsds": {
      "command": "node",
      "args": ["/absolute/path/to/dsds-mcp/src/index.js"]
    }
  }
}
```

---

## Configuration

Configuration is done via environment variables passed through your MCP client config.

| Variable | Required | Description |
|----------|----------|-------------|
| `DSDS_PATHS` | No | Comma-separated paths to your DSDS file(s). Required for design system access tools. |
| `PACKAGE_EXPORT_PATHS` | No | Comma-separated `packageName=path` pairs pointing to each package root. Used by `dsds_check_exports` to verify components exist before importing. See below. |
| `DSDS_INTRO_PATHS` | No | Comma-separated paths to DSDS files loaded as design system introductions. Content from each entity is prepended to the server instructions and exposed via the `dsds-intro` prompt. `DSDS_INTRO_PATH` (singular) still works as a single-path alias. |
| `DSDS_SCHEMA_VERSION` | No | Override the spec version string. Defaults to `0.13.0`. |
| `DSDS_FEEDBACK_DIR` | No | Directory where session feedback from `dsds_feedback` is written. Defaults to `feedback/` inside the dsds-mcp directory. |
| `DSDS_LOGS_DIR` | No | Directory where the lint tools write per-session lint logs. Defaults to `logs/` inside the dsds-mcp directory. |
| `LINT_PLUGINS` | No | Comma-separated ESLint plugin package names to use with the lint tools. Each name must be resolvable from `LINT_RESOLVE_DIR`. |
| `LINT_RESOLVE_DIR` | No | Absolute path the plugin names are resolved from (Node module resolution is anchored here). Point it at a project that has the plugins in `node_modules/`, or at a standalone plugin's own directory (see [Linting code](#linting-code-with-eslint-plugins)). `~` is expanded. Defaults to the current working directory. |
| `LINT_SOURCE_DIR` | No | Absolute path to the project whose code is being linted, used to resolve `dsds_lint_by_path({ path })` and as ESLint's working dir. Plugins are still resolved from `LINT_RESOLVE_DIR`. `~` is expanded. Defaults to unset. |

### Pointing at your design system

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"],
      "env": {
        "DSDS_PATHS": "/path/to/my-design-system.dsds.json"
      }
    }
  }
}
```

Multiple files:

```json
"DSDS_PATHS": "/path/to/components.dsds.json,/path/to/tokens.dsds.json"
```

### Loading intro files on startup

`DSDS_INTRO_PATHS` loads one or more DSDS files when the server starts. Each entity's content is injected into the MCP server instructions so agents see it before any tool call. It also registers a `dsds-intro` prompt that clients can retrieve on demand.

Use this for a top-level system overview, a getting-started guide, or any reference you want agents to have as immediate context — without them needing to call a tool first.

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"],
      "env": {
        "DSDS_PATHS": "/path/to/my-design-system.dsds.json",
        "DSDS_INTRO_PATHS": "/path/to/overview.dsds.json, /path/to/agent-reference.dsds.json"
      }
    }
  }
}
```

Each path can point to any file already in `DSDS_PATHS`, or to a separate document not included in the main file set.

The server renders content from both `documentBlocks` and `agentDocumentBlocks` when building the instructions text. Entities with `agentDocumentBlocks` will have their agent-optimized guidelines and sections included directly.

`DSDS_INTRO_PATH` (singular) still works as a backward-compatible alias for a single path.

### Linting code with ESLint plugins

Two tools run ESLint against your code using plugins installed in your project. Both auto-apply fixable violations and return the corrected code alongside any remaining violations that need manual edits — letting an agent validate and fix component code against your design system's lint rules before finishing a task. Neither tool saves, creates, or modifies files (the harness-only `apply` flag is the sole exception):

- **`dsds_lint_by_path`** — lint files already written to disk, by path. Reads from disk; a missing path returns an error explaining the tool does not create files. This is the preferred tool.
- **`dsds_lint_inline`** — lint a source string in memory (read-only). Nothing is persisted; the result reports how many characters were checked and confirms no file was touched. Use only when the file is not yet on disk.

Splitting these two modes into separate tools removes an ambiguity: there is no single call where "a path and inline source together" is coherent, so a lint call can never be mistaken for a save.

**Prerequisites:**

1. Install `eslint` (v9 or later) in your project:
   ```bash
   npm install -D eslint
   ```
2. Install the ESLint plugin(s) you want to run:
   ```bash
   npm install -D eslint-plugin-your-design-system
   ```

**Configuration:**

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"],
      "env": {
        "DSDS_PATHS": "/path/to/my-design-system.dsds.json",
        "LINT_PLUGINS": "eslint-plugin-your-design-system",
        "LINT_RESOLVE_DIR": "/path/to/your/project"
      }
    }
  }
}
```

Multiple plugins:

```json
"LINT_PLUGINS": "eslint-plugin-your-design-system,eslint-plugin-react"
```

**How plugin resolution works:**

Each name in `LINT_PLUGINS` is resolved with Node's normal module resolution, anchored at `LINT_RESOLVE_DIR` (it defaults to the current working directory). In other words, the MCP does the equivalent of `require("<plugin>")` *from* `LINT_RESOLVE_DIR` — so the plugin must be resolvable from there. **Do not install plugins into the dsds-mcp install directory** — when run via `npx`, that directory is transient, and for a clone it would mix your design-system config into the server's own dependencies. Point `LINT_RESOLVE_DIR` at a directory you own instead. You have three options:

1. **Plugin installed in your app (most common).** Set `LINT_RESOLVE_DIR` to the project that has the plugin in its `node_modules/` (the dir containing `package.json`):
   ```json
   "LINT_RESOLVE_DIR": "/path/to/your/app"
   ```

2. **A standalone plugin package, resolved from its own directory.** If your plugin is its own repo (not a dependency of any app), point `LINT_RESOLVE_DIR` at the plugin directory itself and let it resolve by name via a [package self-reference](https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name). This requires the plugin's `package.json` to have an `exports` field — add one if it only has `main`:
   ```jsonc
   // eslint-plugin-your-design-system/package.json
   {
     "name": "eslint-plugin-your-design-system",
     "main": "index.js",
     "exports": "./index.js"
   }
   ```
   ```json
   "LINT_RESOLVE_DIR": "/path/to/eslint-plugin-your-design-system"
   ```
   Without the `exports` field, Node cannot self-reference the package and resolution fails with `Cannot find module 'eslint-plugin-your-design-system'`.

3. **A linked plugin.** Run `npm link` in the plugin repo and `npm link eslint-plugin-your-design-system` in a project, then point `LINT_RESOLVE_DIR` at that project.

> The plugins only need to be **resolvable** from `LINT_RESOLVE_DIR` — they do not have to be a declared dependency. `LINT_SOURCE_DIR` (if set by the host) governs where the *code being linted* lives; plugins are always resolved from `LINT_RESOLVE_DIR`.

**How the rules are chosen:**

The MCP uses each plugin's `configs.recommended` ruleset if it exports one. If the plugin has no recommended config, all rules are enabled at `warn` level. No `eslint.config.js` from the filesystem is read — the MCP constructs the config purely from what's configured here.

**Usage by an agent:**

Once files are written to disk, lint them by path — pass every file in one call:

```
dsds_lint_by_path(files=[
  { path: "src/Card.tsx" },
  { path: "src/App.tsx" }
])
```

To lint a source string that is not yet on disk (read-only, nothing persisted):

```
dsds_lint_inline(code="<jsx string>", filename="Component.tsx")
```

The `filename` parameter drives parser inference (`.tsx` vs `.js`, etc.). For `dsds_lint_inline` it defaults to `Component.tsx`; for `dsds_lint_by_path` it defaults to the path.

When fixes are applied, the tool returns the corrected code directly — copy it back into your files. Remaining violations (those without an autofix) are listed after the corrected code.

### Checking package exports

`dsds_check_exports` verifies that specific components are actually exported from their packages before your agent imports them. This catches the common case where docs describe a component as `draft` (not yet shipped) and the agent tries to import it anyway.

**Configuration:**

```json
{
  "mcpServers": {
    "dsds": {
      "command": "npx",
      "args": ["dsds-mcp"],
      "env": {
        "DSDS_PATHS": "/path/to/my-design-system.dsds.json",
        "PACKAGE_EXPORT_PATHS": "@your-org/ui=/path/to/your-ui/packages/ui"
      }
    }
  }
}
```

Multiple packages (comma-separated):

```json
"PACKAGE_EXPORT_PATHS": "@your-org/ui=/path/to/your-ui/packages/ui,@your-org/icons=/path/to/your-icons"
```

Each path should point to the package root (the directory containing `package.json`). The tool reads `dist/index.d.ts` if present, or falls back to `src/index.ts`.

**Usage by an agent:**

```
dsds_check_exports(components=["Box", "TextInput", "Badge"])
```

Returns:
```
✓ Box — exported from `@your-org/ui`
✗ TextInput — not found in `@your-org/ui`
✓ Badge — exported from `@your-org/icons`
```

---

### Where to put this config

- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- **Cursor** — `.cursor/mcp.json` in your project root, or `~/.cursor/mcp.json` globally

---

## Tools

### Spec tools — always available, no configuration needed

These help a team author DSDS-compliant documentation.

| Tool | Description |
|------|-------------|
| `dsds_context_brief` | **Start here.** A structured briefing for the current use case — `"author"` (documenting a design system), `"build"` (implementing UI with it), or `"ask"` (answering a question about how to use it). Call this before any other tool. |
| `dsds_spec_overview` | Overview of DSDS: entity types, structure, and authoring workflow |
| `dsds_spec_entity_schema` | Full field definitions for a given entity kind (`component`, `token`, `theme`, etc.) |
| `dsds_spec_document_blocks` | Document block types valid for an entity kind, with descriptions |
| `dsds_spec_scaffold` | Minimal valid DSDS JSON template for an entity kind. Use `kind="system"` for a multi-entity document |
| `dsds_validate` | Validate a DSDS JSON string against the bundled schema |

**Authoring workflow:**
```
dsds_context_brief(useCase="author") → dsds_spec_entity_schema → dsds_spec_scaffold → dsds_spec_document_blocks → dsds_validate
```

### Design system tools — require `DSDS_PATHS`

These let agents query an existing DSDS document.

| Tool | Description |
|------|-------------|
| `dsds_context_brief` | **Start here.** Use `useCase="build"` to get a briefing that includes what entities are loaded and how to query them. |
| `dsds_list_entities` | List all entities with identifier, kind, status, and summary |
| `dsds_search_entities` | Filter entities by kind, status, tags, or a text query |
| `dsds_get_entity` | Full documentation for an entity by identifier or name. Returns all `documentBlocks` and `agentDocumentBlocks`. |
| `dsds_get_document_block` | One specific block (e.g. `api`, `accessibility`) from an entity — faster than fetching the full entity |
| `dsds_get_agent_context` | Agent-optimized view of an entity. Leads with an **Allowed prop values** block — every closed value set (tones, numeric scales, booleans) as hard constraints, resolved from `schema.enum` → `values` → the `type` string. Then renders content from both `agentDocumentBlocks` and `documentBlocks` (guidelines, use cases, props, sections — minus verbose accessibility and import blocks). The primary tool for understanding how to use a component. |

| `dsds_build_component` | Interactive wizard for implementing a documented component: `step:"start"` lists every prop with its allowed values; `step:"finalize"` with an `answers` map returns type-valid JSX (numeric values braced, strings quoted, enum values validated). Value sets resolve `schema.enum` → `values` → `type` string, so systems documented either way get full options. Returns reference JSX only — it does not write files. |
| `dsds_author_component_doc` | Guided wizard that authors a DSDS component-documentation JSON entity from scratch — no schema knowledge needed. |

**Query workflow:**
```
dsds_context_brief(useCase="build") → dsds_list_entities → dsds_search_entities → dsds_get_agent_context or dsds_get_entity
```

**Answer workflow** (answering a question about using the design system):
```
dsds_context_brief(useCase="ask") → dsds_search_entities → dsds_get_agent_context → grounded, cited answer
```

### Lint tools — require `LINT_PLUGINS`

| Tool | Description |
|------|-------------|
| `dsds_lint_by_path` | Lint one or more files already on disk, by path, using the configured ESLint plugins. Auto-applies fixable violations and returns the corrected code; a missing path errors (it never creates the file). Pass all files in a single `files` array. Does not save, create, or modify files. |
| `dsds_lint_inline` | Lint a source string in memory (read-only). Returns findings and corrected code; nothing is read from or written to disk. Use `dsds_lint_by_path` once the file exists. |

### Export check — requires `PACKAGE_EXPORT_PATHS`

| Tool | Description |
|------|-------------|
| `dsds_check_exports` | Verify that specific components are actually exported from their packages. Returns a pass/fail for each name across all configured packages. Use before importing a component to catch `draft`-status components that are not yet shipped. |

### Feedback

| Tool | Description |
|------|-------------|
| `dsds_feedback` | Submit a session rating (1–5) and notes on what worked or was confusing. Call this at the end of any session where you used DSDS tools. Written to `DSDS_FEEDBACK_DIR`. |

---

## DSDS file format

DSDS files are JSON documents. Every file needs `dsdsVersion` and either an `entity` (single entity) or `entityGroups` array (named groups of entities).

**Single entity:**
```json
{
  "$schema": "https://designsystemdocspec.org/v0.13.0/dsds.bundled.schema.json",
  "dsdsVersion": "0.13.0",
  "entity": {
    "kind": "component",
    "identifier": "button",
    "name": "Button",
    "description": "Triggers an action or event when activated.",
    "metadata": { "status": "stable" },
    "documentBlocks": [],
    "agentDocumentBlocks": []
  }
}
```

**Multi-entity:**
```json
{
  "$schema": "https://designsystemdocspec.org/v0.13.0/dsds.bundled.schema.json",
  "dsdsVersion": "0.13.0",
  "systemInfo": { "systemName": "My Design System" },
  "entityGroups": [
    { "$ref": "./components/button.dsds.json#/entity" },
    { "$ref": "./foundations/spacing.dsds.json#/entity" }
  ]
}
```

Use `dsds_spec_scaffold` to generate ready-to-fill templates, and `dsds_validate` to check them. Full spec: [designsystemdocspec.org](https://designsystemdocspec.org).

### `agentDocumentBlocks`

Every entity supports an optional `agentDocumentBlocks` array alongside `documentBlocks`. Both arrays accept the same block kinds. `agentDocumentBlocks` is never rendered for human readers — it exists solely for agent (LLM) consumption.

Use it to add generation constraints, anti-patterns, and disambiguation notes without adding noise to human-facing docs. `dsds_get_agent_context` renders content from both arrays; `dsds_get_entity` returns both arrays in raw JSON.

---

## Development

```bash
npm install
npm test             # run tests once
npm run test:watch   # watch mode
npm run dev          # run the server directly (reads env vars from shell)
npm run update-schema  # fetch the latest published DSDS schema from designsystemdocspec.org
npm run logs         # view usage logs (lint + chunk activity) in a readable format
```

The server records usage to `logs/YYYY-MM-DD.jsonl`:

- **Every tool call** — `{ type: "tool", tool, ok, durationMs }`
- **Chunk access** — `dsds_get_chunk` writes a detailed `{ type: "chunk", identifier, name }` entry
- **Lint runs** — the lint tools write a detailed `{ type: "lint", … }` entry with per-file violations

Read them back with `npm run logs`. Pass options after `--`:

```bash
npm run logs                      # last 7 days: lint + chunk detail, plus a tool-usage summary
npm run logs -- --summary         # totals only, no per-entry detail
npm run logs -- --type tool       # per-call tool log + tool-usage breakdown
npm run logs -- --type lint       # only lint entries (or --type chunk)
npm run logs -- --days 30         # last 30 days
npm run logs -- --date 2026-06-18 # a single day
```

Tool calls always feed the **Tool usage** summary (counts and error totals per tool). They're omitted from the per-entry view in the combined `--type all` mode — where they'd duplicate the chunk/lint detail — but shown per call under `--type tool`.

The spec schema is bundled at `src/spec/dsds.bundled.schema.json`. Run `npm run update-schema` to pull the latest published version automatically. It fetches the schema from `https://designsystemdocspec.org/v{version}/dsds.bundled.schema.json` and updates `BUNDLED_VERSION` in `src/spec/version.js`. The MCP server loads the schema once at startup via `require()`, so restart the server after updating.

---

## License

Licensed under the [Apache License 2.0](./LICENSE). The bundled DSDS schema is also
Apache-2.0; see [NOTICE](./NOTICE) for attribution.
