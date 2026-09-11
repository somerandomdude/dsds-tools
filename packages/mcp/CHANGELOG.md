# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`src/surface.js` — the whole surface in one object.** `createSurface()`
  returns every capability group this server advertises: `toolDefs` /
  `dispatch`, `listPrompts` / `getPrompt`, `listResources` / `readResource`,
  and `getInstructions`. Both transports build from it, so a capability added
  here reaches the MCP server and the `dsds` CLI at once. Supporting modules:
  `src/prompts.js` (the prompt catalog and renderer), `src/instructions.js`
  (the agent instruction block), `src/intro.js` (intro-entity rendering).

### Changed
- **`src/server.js` is now a thin transport envelope** — protocol handlers
  that delegate to `createSurface()`. Prompts, resources, instructions, and
  intro rendering used to be defined inside it, which is why the CLI could
  not reach them; nothing is defined there any more. No protocol-visible
  behavior change: the same tools, prompts, resources, and instruction text
  as before.
- **Bundled DSDS spec updated 0.13.0 → 0.15.2.** Swapped `src/spec/dsds.bundled.schema.json`,
  bumped `BUNDLED_VERSION`, the `DSDS_SCHEMA_VERSION` default, spec knowledge,
  scaffolds, and all doc references. The validator is schema-driven, so the
  schema-only renames are picked up automatically: `criterionFixture` →
  `criterionTestCase`, `apiEvent.returns` → `payload`, `scaleStep.label` →
  `name`, `stepEntry.title` → `label`, `platformStatus.description` → `note`, and
  trimmed `link` fields (`identifier`/`required`/`role` removed).
- **`systemInfo` fields renamed** `systemName`/`systemVersion` → `name`/`version`
  (required: `name`). Updated the system scaffold and `dsds_spec_overview` text.
- **`$extensions` is now valid on document blocks** (0.15.x adopted the
  block-level extension bag the entity level already had) — no code change needed
  beyond the schema; the closed-schema (`additionalProperties: false`) protection
  is unchanged.

### Fixed
- **`resources/read` no longer throws on a 0.20.0 entity.** The loader
  annotates each entity in place with `__sharedEntries` — the base document's
  `shared[]` pool, whose own entries carry the same pool — so the entity is a
  cyclic object graph and `JSON.stringify` failed with "Converting circular
  structure to JSON". Every entity in a document with a shared pool was
  therefore unreadable as a resource. The reader now drops the loader's
  internal `__`-prefixed keys, which both terminates and leaves the resource
  body as the document the author wrote. Caught by `dsds resource` against the
  199-entity Sanity UI document.

### Removed
- **Chunk top-level `guidelines`/`useCases` shorthand** — removed in DSDS 0.15.0.
  Updated `knowledge.js` (chunk `optionalTop` and notes) to point authors at
  `documentBlocks`.

## [0.3.0] - 2026-07-08

### Added
- `src/registry.js` — `createToolRuntime(deps)` extracts the tool catalog and
  dispatcher from the MCP server so every transport serves the identical tool
  surface. First consumer beyond this server: the `dsds` CLI (dsds-cli repo),
  which generates its commands, help, and manifest from this registry.
- `createGraphGetter` in `src/graph.js` — the identity-keyed relationship-graph
  cache, moved out of server.js for reuse.
- Project-local configuration file: `resolveConfig()` in `src/config.js` reads
  `dsds.config.{mjs,js,json}` — discovered by walking up from the working
  directory, or selected via `DSDS_CONFIG`. Environment variables override the
  file per key; relative paths resolve against the file's directory; a broken
  file falls back to env vars with a stderr warning instead of failing startup.
  The server and `scripts/check-integrity.js` both use it, so an MCP client
  entry can shrink to a working directory or a single `DSDS_CONFIG` var.

### Changed
- The MCP server now reports its real package version (was hardcoded `0.1.0`).

## [0.2.0] - 2026-07-04

### Changed — BREAKING
- **`dsds_lint_code` is removed**, replaced by two tools with disjoint schemas:
  `dsds_lint_by_path` (reads files on disk; a missing path returns corrective
  guidance — the tool never creates files) and `dsds_lint_inline` (checks a
  source string in memory; reports how many characters were checked and that
  no file was touched). The one-tool-two-modes design let agents infer that a
  lint call persisted a file; the split makes that inference impossible.
  Update any client or harness that invoked `dsds_lint_code` by name.
- **Bundled DSDS spec updated 0.12.0 → 0.13.0.** Spec knowledge, scaffolds, and
  the authoring wizard follow the new rules: chunks accept `documentBlocks` /
  `agentDocumentBlocks` (top-level `guidelines`/`useCases` are deprecated
  shorthand), the `checklist` block kind is available everywhere, `governance`
  and `docOrigin` metadata are documented, and empty arrays/objects are no
  longer emitted (0.13.0 forbids empty collections).

### Added
- `dsds_context_brief(useCase="ask")` and the `ask-design-system` prompt — a
  retrieval-and-answer briefing for answering design-system questions with
  grounded, cited answers.
- `dsds_get_agent_context` now leads with an **Allowed prop values** section:
  every closed value set (tones, numeric scales, booleans) rendered as hard
  constraints before the prose.
- Spec-authority prop-value resolution shared by the wizard and agent context:
  `schema.enum` → `values` → `type`-string parse (per 0.13.0, `schema` is
  authoritative). Systems documented with portable `values` arrays — no
  TS-style type strings — get full enum options and constraints.
- Responsive-wrapper generalization: any wrapper named like `Responsive<…>` /
  `ResponsiveValue<…>` is unwrapped when parsing literal unions; container
  types (`Array<…>`) are never unwrapped.
- Build brief: a required pre-emission `dsds_check_exports` gate (verify every
  import name in one call) and a lint-first validate-and-repair loop.
- Integrity guard: example-vs-API consistency check — every prop used in
  example code must be a real prop of the documented component; intentional
  ✗ counter-examples are skipped. Catches docs that teach build errors.
- Negative-space tool descriptions: lint tools, `dsds_build_component`, and
  `dsds_check_exports` now state what they do NOT do (save, create, install).

### Fixed
- `dsds_build_component` emits type-valid JSX: numeric union values are braced
  (`contentSize={3}`, never `"3"`), plain-text values for ReactNode props are
  quoted, enum answers are validated against the component's real value set
  (invalid values are rejected with the allowed list), and empty
  `documentBlocks` arrays are omitted.
- `isBooleanType` now recognises `boolean | undefined` (the space between
  `|` and `undefined` defeated the old single-pass strip).
- Lint plugins resolve from `LINT_RESOLVE_DIR` via documented strategies,
  including a standalone plugin package self-reference (`exports` field).


## [0.1.1] - 2026-06-29

### Changed
- Docs: added a step-by-step "Quick start (no coding required)" guide for non-technical users (install Node.js → copy DSDS file path → edit client config → restart → verify), plus an "I don't have a DSDS file yet" path.
- Docs: clarified that no separate install step is needed — `npx` fetches the server automatically — with optional version-pinning (`dsds-mcp@0.1.1`) and global-install instructions for those who prefer them.

### Fixed
- Mark the `dsds-mcp` bin as executable.

## [0.1.0] - 2026-06-28

Initial public release.

### Added
- MCP server exposing the Design System Documentation Spec (DSDS) to MCP clients.
- Spec authoring tools: `dsds_spec_overview`, `dsds_spec_entity_schema`,
  `dsds_spec_document_blocks`, `dsds_spec_scaffold`, `dsds_validate`.
- Design-system query tools: `dsds_context_brief`, `dsds_list_entities`,
  `dsds_search_entities`, `dsds_get_entity`, `dsds_get_document_block`,
  `dsds_get_agent_context`, `dsds_get_chunk`, `dsds_to_markdown`.
- Relationship graph tools: `dsds_impact`, `dsds_get_dependents`,
  `dsds_get_dependencies`, `dsds_get_alternatives`.
- Interactive wizards: `dsds_build_component`, `dsds_author_component_doc`.
- `dsds_lint_code` (bring-your-own ESLint plugins via `LINT_PLUGINS`) and
  `dsds_check_exports` (via `PACKAGE_EXPORT_PATHS`).
- Optional feedback tool and an opt-in reference-integrity guard
  (`npm run check:integrity`, icon check gated on `ICON_PACKAGE`).
- Bundled DSDS schema (v0.12.0) with a startup update check.

### Notes
- The server is generic and configurable — all design-system–specific behavior
  (icon package, component packages, lint plugins) is driven by configuration.
- `json-render` UI generation (catalog / spec validation / render) is not included
  in this release and is planned to return as a configurable feature.
