# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-10-09

Supports DSDS 0.22.0, and only 0.22.x: a 0.21 document fails validation until it's
migrated with the spec's `scripts/tools/migrate-to-0.22.js`. Use dsds-mcp 0.4.0 for
DSDS 0.20.x and 0.21.x.

0.4.0 (published 2026-09-02) shipped without a section of its own, so its changes
are listed here too, under Changed, Added, Fixed and Removed below the 0.22.0 items.

### Breaking
- **Bundled DSDS 0.22.0.** A breaking spec release, so a 0.21 document now
  fails `dsds_validate` until it is migrated. The validate tool says so, and
  points at the spec's `scripts/tools/migrate-to-0.22.js`, when a document
  still uses `purpose`, `related`, `metadata.context` or a retired `rel`.
- **Validation runs the spec's own validator.** `src/spec/dsds-0.22.0/` holds
  the release's `schema/` and its reference validator, resolver and
  formatter, verbatim; `src/spec/validator.js` wraps the validator instead of
  porting it. The port had drifted: it was missing `DSDS-24`, `DSDS-25`, the
  wider `DSDS-06`, `sourceRoot`, and item addresses derived from an item's
  text. Findings now match `npx dsds-validate` string for string, and
  `validateDoc20` also returns upstream's structured `findings`. The advisory
  checks (`DSDS-13`–`DSDS-16`) are still a port, since upstream's
  `lint-docs.js` exports nothing yet.
- **`dsds_style_check` returns the document in field order.** 0.22.0 retired
  the four field-order rules (`DSDS-17`, `-20`, `-22`, `-23`) in favour of
  `dsds-format`, so the tool runs the vendored formatter and returns the
  reordered text, comments kept, plus `DSDS-18`, `-19` and `-21`. A section's
  `tags` no longer change where `DSDS-18` expects it. Adds `yaml` as a
  dependency, which the formatter needs.

### Changed
- **The relationship graph reads 0.22.0's pointer fields:** `uses`,
  `alternatives`, `extends`, `specs`, and a deprecated status's `replacedBy`,
  with `refs` for the rest. Reverse names follow the spec: `used-by`,
  `extended-by`, `replaces`. A pointer inside a section item belongs to that
  item, so it no longer counts as an edge from its whole entry.
- **A code file is `rel: source`.** `dsds_get_chunk` and example rendering find
  a chunk's or example's code through `rel: source`, and still read the old
  `rel: file`. Token files are found through a token's or theme's `source`
  field, so `dsds doctor`'s token checks see them again.
- **Reused items resolve by the spec's address model.** `same-as` targets and
  `dsds doctor`'s item-reference check find an item by its `id` or by the id
  its text derives, and a `refines` field is shown like a `rel: refines` ref.
- **`dsds doctor` validates every file of a system together**, as the spec's
  CLI does with files given at once: refs resolve across them, and the
  system's `metadata.sourceRoot` applies to every `sourceFiles` path. It used
  to validate only the root document of a YAML system.
- **DSDS-12 is gone.** The spec retired it: a guideline's `level` already
  says how strong it is.
- **Bundled skills are the 0.22.0 ones**, and `dsds_get_skill`'s note maps
  their `dsds-validate`, `dsds-lint` and `dsds-format` commands to this
  server's tools.
- **`npm run update-schema -- <spec-checkout>`** vendors a release from a
  local checkout: schema, scripts, skills and conformance fixtures. It used to
  download one bundled file and stop, since a split schema can't be rebuilt
  from it.
- **Tests move to 0.22.0.** The conformance suite runs the 0.22.0 fixtures;
  the 0.20.1 and 0.21.0 suites, which asserted retired rules, are removed.
  The fixtures in `fixtures/` were migrated with the spec's own migration
  script and formatter.
- **`dsds_get_agent_context` serves a build view by default.** The compact
  (default) view keeps each migration guide's prop table and breaking changes
  but drops its codemod and the "Key differences" prose that restates the
  table. It also drops "Checked by" lines and shows unknown extension
  namespaces (such as `io.jev`) as one line naming them, not as raw JSON.
  `verbose: true` still returns everything. A real 33-component batch
  went from 323k to 296k characters.
- **No more "pointed at by" lists.** `dsds_get_agent_context` and
  `dsds_get_entity` show only what an entry points at, not every entry that
  points at it. For core components that list ran to ~20 lines, and in a
  10-iteration run no agent found anything through it.
- **API tables show each prop's values.** A type name like
  `Responsive<Position>` is followed by its values (`"absolute" | … | "sticky"`),
  with integer scales shortened to ranges (`0–9`). The extractor already read
  them; agents saw only the type name and avoided valid values like `sticky`.
- **Shared prop groups are listed once, at the top.** A multi-component
  `dsds_get_agent_context` answer opens with every prop group (three or more
  props) that two or more of its components share — margin, padding,
  position — listed once with the components that take it. Each component
  lists only its own props and names the groups it also takes. Repeated rows
  were 18.9k of 30k prop-table characters in a real 26-component lookup. An
  earlier version pointed back to the first component with the group ("as
  listed under `box` above"); agents did not follow those pointers.
- **Shared rules are given once, at the top.** In a multi-component
  `dsds_get_agent_context` answer, a rule the docs declare once and point to
  (`same-as`) — the form-field and tone rules — is given in full once under
  **Shared rules**, with the components it applies to. Each component names it
  in one line: its bold lead sentence, else its first sentence, else its id.
  Only rules at least twice as long as that line move; a one-sentence rule
  stays in place.
- **No more "Same as under X above" notes.** Paragraph matching across a
  batch replaced whole sections with a pointer to an unrelated component
  (Divider's API pointed at Checkbox), and agents guessed rather than follow.
- **`agentContextOmit` config.** A list of extension paths to leave out of
  `dsds_get_agent_context`'s default view: a namespace (`io.jev`) or one block
  in it (`com.sanity.ui.migrationGuide`). The view names what it left out, and
  `verbose: true` returns everything. Env: `DSDS_AGENT_CONTEXT_OMIT`.
- **Status words are open, as the spec says.** `dsds_context_brief` lists every
  status other than stable, deprecated and experimental under its own word,
  instead of a fixed `draft` bucket that silently emptied when a corpus used
  another word. `dsds_search_entities` no longer limits `status` to four
  values, so `beta` and `unavailable` can be searched.
- **`dsds_check_exports` checks subpath specifiers.** `@sanity/icons/Cog` is
  confirmed against the package's `exports` map, with suggestions when it is
  missing. A root-listed icon whose subpath the package does not ship is now
  flagged instead of reported as importable.
- **Bundled DSDS 0.21.2** (`src/spec/schema-0.21.2/`, vendored verbatim from
  the v0.21.2 tag; `schema-0.21.1/` removed). Upstream calls it documentation
  only: every 0.21.1 document is a valid 0.21.2 document. Its one
  clarification — a `same-as` may point at an item in any entry, not only in
  `base.shared` — needed no code change: DSDS-05 and the renderer's same-as
  pool already covered every entry. `tests/spec/release-0.21.2.test.js` pins
  that down.
- **Bundled skills refreshed to 0.21.2.** They had stayed at 0.21.0 through
  the 0.21.1 bump. They now match upstream `.agents/skills/` at v0.21.2.

### Added
- **`dsds_find_icon`.** Finds icons by purpose (`purposes: ["resolve",
  "settings"]`) from the icon guidelines' alternative names, purpose and usage
  notes, limited to icons the package ships. Returns each match's import path,
  what it is for, and when not to use it. Needs `ICON_PACKAGE` and
  `ICON_GUIDELINES_PATH`.
- **Token references in documentation text.** Write `{space-3}` — the DSDS
  token reference, a token entry's `id` in braces (`tokenRef`, DSDS-09; prose
  use per the dsds-update skill) — and every documentation tool, prompt,
  resource and the agent instructions serve it as "`space-3` (12px)". It
  resolves against documented `kind: token` entries, by id, and reads the
  value through the entry's `source` (`#key` or JSON Pointer `#/key`) on each
  request (`src/token-refs.js`, applied in `createSurface`). Only a
  name that is a token is replaced; code spans, fenced blocks and a brace
  after `=` or `$` are never touched, so quoted JSX such as `weight={bold}`
  survives. Spec, lint, validation and skill tools pass through unchanged.
- **`dsds doctor`: `token references`** fails on a token-shaped reference
  (`{space-33}`) that names no token, with a did-you-mean.
  **`hardcoded token values`** warns on each pixel value in prose that equals
  a token's value and suggests the reference, using nearby words ("padding",
  "radius") to pick the scale. Thresholds (viewport, reflow, touch target)
  and values inside code are skipped. Doctor gains a `warn` status that does
  not fail the run.
- **`dsds_get_tokens`** (CLI: `dsds tokens`) — token names and values. A
  token entry never stores its value; its `source` points at a DTCG file.
  `src/tokens.js` follows those pointers, flattens each file (nested groups,
  inherited `$type`, `{alias}` values), and joins every token to the entry
  that documents it. CSS custom property names are read from the `css/`
  directory beside the JSON, not derived, so a renamed property
  (`--shadow0` → `--shadow-0`) cannot be reported wrongly. Files are cached
  by mtime. Lookup by `names` (CSS `--` and `var()` forms accepted), `group`
  (file, entry group or name prefix) or `query` (word-start match); partial
  misses return what was found plus did-you-mean suggestions.
- **`src/vocabulary.js`** — `toCliVocabulary(text)` renders the core's
  canonical prose for a shell: tool names become the equivalent `dsds`
  commands, call expressions become runnable invocations, and phrases that
  assume an MCP client are rewritten. MCP keeps the canonical text; only the
  CLI translates, so handlers stay transport-agnostic and a new porcelain
  command costs one line in `CLI_EQUIVALENTS`.
- **`src/setup-guidance.js`** — the "nothing is loaded" copy for both
  surfaces. The two answers genuinely differ (edit a client config vs. run
  `dsds init`), so this is a whole-block swap rather than vocabulary.
- **`src/suggest.js`** — `didYouMean` / `notFoundMessage`, a capped
  Damerau-Levenshtein matcher. Adjacent transposition counts as one edit,
  which plain Levenshtein scores as two: "crad" would not have suggested
  "card".
- `dsds_list_entities` and `dsds_search_entities` accept `limit` and return
  `structuredContent`, so a caller can consume the entity list as data
  instead of parsing a markdown table.
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
- **Entity summaries were empty on every real 0.20.0 document.**
  `summarizeEntities` resolved `metadata.summary` only, but 0.20.0 keeps the
  one-liner in the entity's top-level `description` — so `dsds_list_entities`
  returned 199 blank summary cells against the Sanity UI corpus, and
  `dsds_search_entities`, which searches that same field, could only match
  identifiers and names. `entitySummary()` now falls back through
  `metadata.summary` → `metadata.description` → `description` → `purpose` →
  `agents.intent`; `intro.js` shares it instead of keeping its own copy.
- **Multi-word searches always returned nothing.** The query was one
  substring match against the whole string, so "primary button" matched no
  entity whose text did not contain that exact phrase. Terms are tokenized
  and ANDed, tags and kind joined the index, and results are ranked.
- An entity with no `kind` was listed under the heading "Undefineds".
- A `dsds_get_document_block` miss listed available blocks with duplicates
  (one per section sharing a kind) and omitted `api`, which the server's own
  HARD RULE tells agents to request.
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
