# DSDS CLI — Plan & Requirements

| | |
| --- | --- |
| **Status** | Complete — Phases 0–4 delivered 2026-07-08; open: npm publish/naming (§10.2), CI wiring (§10.5) |
| **Owner** | PJ Onori |
| **Drafted** | 2026-07-08 |
| **Target release** | `dsds-mcp` v0.3.0 |
| **Reference** | [Astryx CLI](https://astryx.atmeta.com/docs/cli) — Meta's design system ships a CLI + MCP server backed by one shared API |

> **Decision & delivery log**
>
> - **2026-07-08 — CLI lives in its own package.** PJ chose a separate `dsds-cli` repo (`~/Documents/Projects/dsds-cli`) over a second bin inside dsds-mcp. dsds-mcp gained `src/registry.js` (the shared tool catalog + dispatcher — FR-1 satisfied in relocated form); dsds-cli depends on dsds-mcp (`file:../dsds-mcp`) and generates its whole surface from that registry. FR-2's "second bin in this package" wording is superseded.
> - **2026-07-08 — Phases 0–1 delivered.** Registry extraction (all 138 dsds-mcp tests green, zero MCP behavior change); CLI MVP: generic `dsds tool` dispatch, schema→flag bridge, `--args`/`--args-file`, `--json` envelope, exit codes, `manifest`, generated help, opt-in logging. 27 CLI tests. Cold start against the real Sanity UI document (115 entities): **0.12s** (NFR-1 target was ≤1s). FR-8 amended in implementation: logging happens only when `DSDS_LOGS_DIR` is explicitly set, so the one-shot CLI never creates `./logs` in arbitrary cwds.
> - **2026-07-08 — Phase 2 delivered.** 16 porcelain commands (FR-11) over the shared registry; `dsds doctor` (FR-12) with 11 checks including schema validation of the root **and every $ref-referenced entity file** plus a new identifier-uniqueness check; exit-code-2 contract live for lint/validate/doctor (FR-7); wizards excluded per FR-13. 62 tests green. Doctor's first real catches: dsds-mcp's own `fixtures/button.dsds.json` is schema-stale, `dsds_spec_scaffold` emits templates that fail `dsds_validate` (both flagged upstream), and the Sanity UI docs declare the identifier `container` twice (component + token-group — flagged in the docs repo). CI wiring (§10.5) still open: the docs repo has no CI infrastructure today, so doctor runs locally; wiring it up is a decision, not a blocker.
> - **2026-07-08 — Phase 3 delivered.** `resolveConfig` in dsds-mcp/src/config.js: `dsds.config.{mjs,js,json}` discovered from cwd upward (or `DSDS_CONFIG` / `--config`), relative paths resolve against the file's directory, precedence env > file > defaults, broken file = stderr warning + env fallback (never a crash). Both surfaces consume it (FR-15): the MCP server and check-integrity boot env-free from a repo containing the file; the CLI adds `--config` and doctor gains a "config source" check. 11 new unit tests (dsds-mcp) + 7 E2E tests (dsds-cli); 287 + 69 green. Dogfood: `dsds.config.mjs` written into the Sanity UI component documentation repo mirroring the live env block — MCP server loads all 115 entities from it with zero env vars. Doctor's Phase 3 catch: the live `LINT_RESOLVE_DIR` points at dsds-mcp where `eslint-plugin-sanity-ui` was never installed (plugin exists only as a source repo at ~/Documents/Projects/eslint-plugin-sanity-ui) — lint tools have been silently non-functional; fix is PJ's call. Remaining acceptance step: shrink `~/.claude.json` (user-applied).
> - **2026-07-08 — Phase 4 delivered; plan complete.** `dsds init` scaffolds `dsds.config.mjs` seeded from the live environment variables (the env→file migration path), relativizing paths inside the project; `--agents` writes a marker-delimited stanza (AGENTS.md default, `--agents-file` for other targets) generated from the porcelain table — idempotent, `--force` to overwrite the config (FR-16). Versions stamped per NFR-4: dsds-mcp 0.3.0 (CHANGELOG entry; server version now read from package.json), dsds-cli 0.1.0 (initial CHANGELOG). 78 CLI tests + 287 dsds-mcp tests green. **Acceptance M1 proven:** a shell-only agent with MCP tools forbidden read the generated AGENTS.md in the docs repo and, env-free, ran `dsds brief build` → `list --kind chunk` → `chunk interactive-row` → `context button --verbose`, correctly identifying the interactive-row chunk (PressArea + Card) and Button's allowed tones (neutral, critical); its verdict: "AGENTS.md was entirely sufficient." Noted friction: multi-word search queries return nothing (single-keyword search) — candidate future improvement.
> - **2026-07-09 — Monorepo Stage A delivered.** Decision: consolidate into a `dsds-tools` monorepo (PJ). The dsds-mcp repo restructured in place — `packages/mcp` (publishes as dsds-mcp, npm identity preserved; already live at 0.2.0 since Jun 29) and `packages/cli` (dsds-cli, name verified free) under npm workspaces, killing the `file:../dsds-mcp` link. A compatibility shim at the old `src/index.js` path keeps existing MCP client configs and the live session working; the local directory name is unchanged (GitHub repo rename to `dsds-tools` is PJ's one click, with redirects). Baseline commits made first in both repos; the old standalone dsds-cli repo is a superseded snapshot. CI updated for workspaces (Node 20/22/24). Verified: 228 tests green from the root, old-path shim boots env-free from the docs repo, AGENTS.md stanza idempotently re-pointed at the new CLI path, cold start 0.12s. **Stage B (deferred to publish):** extract `packages/core`, move doctor's checks down (enables a `dsds_doctor` MCP tool), rewrite imports.
> - **2026-07-09 — Repo home: github.com/somerandomdude/dsds-tools.** PJ created a new repo (not a rename — old dsds-mcp URLs do NOT redirect). Package metadata (repository/bugs/homepage in all three package.json files) re-pointed at dsds-tools; local origin switched; description + homepage set. Push pending one interactive step: the stored GitHub credentials lack the `workflow` OAuth scope, which is required because the history contains `.github/workflows/ci.yml` (`gh auth refresh -h github.com -s workflow`, then push). Note: repo is currently PRIVATE — published npm metadata will link to a 404 for others until it's public. Recommend archiving the old dsds-mcp GitHub repo once pushed (its main is the pre-monorepo 0.2.0 state, matching the last npm publish).
> - **2026-09-11 — Full MCP surface parity; the MCP server is now the thin wrapper.** FR-4's parity guarantee covered *tools* only, because tools were the only thing shared. An MCP server advertises four capability groups, and the other three — instructions, prompts, resources — were defined inside `server.js`, so no CLI command could reach them. Extracted them into the shared core: `src/surface.js` (`createSurface()` → `toolDefs`/`dispatch`, `listPrompts`/`getPrompt`, `listResources`/`readResource`, `getInstructions`), backed by new `src/prompts.js`, `src/instructions.js`, and `src/intro.js`. `server.js` dropped 363 → ~100 lines and now defines nothing: it is protocol handlers delegating to the surface, which is the "MCP as a thin wrapper" end state this plan was aiming at. The CLI gained `dsds prompt [<name>] [--task]`, `dsds resource [<uri|identifier>]`, and `dsds instructions`; the manifest gained `capabilities`, `prompts`, and `resources`; doctor gained an **mcp surface** check that reads every resource. Parity tests widened from tools to all four groups. **First real catch:** `resources/read` threw "Converting circular structure to JSON" on every entity in a document with a `shared[]` pool — the loader's `__sharedEntries` annotation makes a loaded 0.20.0 entity cyclic — so MCP resource reads had been broken against the whole 199-entity Sanity UI corpus. Fixed in the shared reader by dropping the loader's internal `__` keys, which also stops resource bodies leaking runtime bookkeeping. 366 dsds-mcp + 116 dsds-cli tests green. Versions: dsds-mcp 0.4.0, dsds-cli 0.2.0. Remaining MCP-only by design: the file watcher and update check (FR-3 — the CLI is one-shot).
> - **2026-09-11 — DX pass on the CLI; two long-standing data bugs found.** A hands-on review against the live 199-entity Sanity UI document, working through the findings in severity order. **The CLI still spoke MCP:** handler prose names tools canonically, so `dsds brief build` — the very command the generated AGENTS.md tells an agent to run first — carried 16 `dsds_*` names and "Each step uses a tool from this MCP server", and the unconfigured-setup copy explained how to edit an MCP client's `env` block (while wrongly telling CLI users relative paths are unsupported). Fixed with `src/vocabulary.js`: the core keeps one canonical text and each transport renders it, so MCP is unchanged and the CLI reads as a CLI; a new porcelain command costs one line in `CLI_EQUIVALENTS`. **`--json` was prose:** every read command put a markdown document in `data`, so the advertised `| jq -r .data` returned markdown and `.data.entities[].identifier` was impossible — `list`/`search` now emit `structuredContent`, `data` carries it, and the rendering moves to `text` (breaking: lint's `structured` key is gone). **Two data bugs, one root cause:** `summarizeEntities` read `metadata.summary` only, but real 0.20.0 keeps the one-liner in `description` — so all 199 summary cells were blank *and* search, which indexes that field, could only match identifiers; the fallback fixes both. **Search was a single substring match**, so "primary button" always returned nothing (the Phase 4 demo note, now closed): terms are tokenized and ANDed over identifier/name/summary/tags/kind, ranked, and a dead end names the word that failed. Also: Damerau-Levenshtein "did you mean" everywhere a name can be mistyped (a typo'd identifier used to print all 199 on one line), flag/command/kind/status/block suggestions, `-h`/`-v`, `--limit`, `dsds completion` for bash/zsh/fish, `manifest --compact` (38KB → 13KB), `lint --apply --dry-run`, "Uncategorized" instead of the heading "Undefineds", deduped block lists that include `api`, cwd-relative paths, and one fewer redundant stderr warning. 398 dsds-mcp + 144 dsds-cli tests green.
> - **Still open:** push to dsds-tools (needs `workflow` scope grant), archive old dsds-mcp repo, repo visibility (private → public before npm publish), npm publish + naming (§10.2 — `dsds` squatted; `dsds-cli` and `dsds-tools` verified free), Stage B core extraction, CI wiring in the docs repo (§10.5), lint plugin install location (Phase 3 doctor finding), search tokenization (Phase 4 demo note).

## 1. Objective

Expose the existing dsds-mcp logic through a second surface: a command-line tool (`dsds`). The MCP server stays as-is. Both entry points share one core.

Why now: Astryx validated the pattern — CLI, MCP, and programmatic API from a single core, serving humans and agents alike. dsds-mcp's architecture already fits this shape: tool handlers return plain `{content, isError}` objects, the MCP layer in `src/server.js` is a thin envelope, and `scripts/check-integrity.js` / `scripts/view-logs.js` already prove the non-MCP entry-point pattern.

What a CLI adds that MCP can't:

- **Agents without MCP.** Any agent with shell access can query the design system. No client config, no standing tool-schema context cost.
- **CI.** Validation, lint, and integrity checks in pipelines (first consumer: the Sanity UI component documentation repo).
- **Humans.** A browse/query surface for DSDS documents — the first one that exists.
- **Composability.** Pipes, `grep`, `jq`, scripts.

## 2. Goals and non-goals

**Goals**

1. Every registered tool is invocable from a terminal.
2. One definition drives all surfaces: tool defs (name + JSON Schema) generate the CLI dispatch, `--help`, and a machine-readable manifest.
3. Zero regression and zero behavior change to the MCP server.
4. Config that travels with the repo (config file), ending the `~/.claude.json` env-var sprawl.
5. Agent discovery without MCP: a generated agent-docs stanza (AGENTS.md).

**Non-goals**

- Code mutation features (Astryx's `swizzle`, `upgrade`, `template` injection). DSDS is a knowledge layer; the reader stays side-effect free. `dsds_spec_scaffold` output goes to stdout, not into files.
- Bundling design-system data with the package. Path/config-driven loading is what keeps DSDS portable.
- Replacing or deprecating the MCP server. The wizards and auto-injected context briefs stay MCP-first.
- CLI ergonomics for the wizards (`dsds_build_component`, `dsds_author_component_doc`). Reachable via the generic escape hatch only.
- A `--dense` output tier (Astryx-style). `dsds_get_agent_context` already serves dense content; revisit after v0.3.0 if needed.

## 3. Users and use cases

| User | Scenario |
| --- | --- |
| Coding agent, no MCP | Runs `dsds search`, `dsds context <id>`, `dsds chunk <id>` from an AGENTS.md cheat-sheet to build UI correctly |
| CI pipeline | `dsds doctor && dsds validate <file>` gates doc merges in the docs repo |
| PJ / design-system team | Terminal queries while authoring: `dsds get button`, `dsds impact card` |
| Docs tooling | `dsds markdown <id>` feeds static site or review flows |

## 4. Functional requirements

### Core architecture

- **FR-1** Extract shared runtime init into `src/runtime.js`: `loadConfig` → `loadSystems` + `loadIntroEntities` → `state` (`{ systems, summaries }`) → getter bundle (`getSystems`, `getSummaries`, `getLintConfig`, `getExportPaths`, …). `src/index.js` (MCP) and new `src/cli.js` both consume it. MCP behavior unchanged (verified by existing test suite).
- **FR-2** New bin entry `"dsds": "src/cli.js"` alongside the existing `"dsds-mcp"` bin. Same stack as the repo: Node ≥ 18, ESM, plain JS, no build step.
- **FR-3** The CLI is a one-shot process: no file watcher, no update check, no stdio transport, no parent-loss handlers. Load, run one command, exit.

### Generic dispatch (parity guarantee)

- **FR-4** `dsds tool <tool-name> [--args '<json>' | --args-file <path>]` invokes any registered tool handler, including wizards and feedback. Parity target: 100% of registered tools, enforced by an automated test.
- **FR-5** Flat scalar schema properties are also accepted as flags (`dsds tool dsds_get_entity --identifier button`). Flags override keys in `--args`. Nested args use `--args` JSON only.

### Output contract

- **FR-6** Default: handler text content to stdout, human-readable. `--json`: stable envelope `{ ok, tool, data }` / `{ ok: false, tool, error }` to stdout. Diagnostics (load messages, warnings) go to stderr only — stdout stays pipe-safe.
- **FR-7** Exit codes: `0` success · `1` usage or runtime error · `2` command ran but found problems (lint findings, validation failures, doctor failures). CI can gate on this.
- **FR-8** Usage logging: CLI invocations write the same JSONL usage logs as MCP tool calls (continuity for the existing `npm run logs` reporting). `--no-log` opts out.

### Manifest and help

- **FR-9** `dsds manifest [--json]` emits one machine-readable payload describing every command and tool: name, description, input schema, output mode. Generated from the same tool defs `server.js` registers — never hand-maintained. (Astryx's "OpenAPI for the CLI" pattern.)
- **FR-10** `dsds --help` and per-command help are generated from the same defs.

### Porcelain commands

- **FR-11** Curated commands for the common read paths:

| Command | Maps to |
| --- | --- |
| `dsds list [--kind <kind>]` | `dsds_list_entities` |
| `dsds search <query>` | `dsds_search_entities` |
| `dsds get <identifier> [--block <slug>]` | `dsds_get_entity` / `dsds_get_document_block` |
| `dsds context <identifier>` | `dsds_get_agent_context` |
| `dsds chunk <identifier>` | `dsds_get_chunk` |
| `dsds deps <identifier>` / `dsds dependents <identifier>` | `dsds_get_dependencies` / `dsds_get_dependents` |
| `dsds impact <identifier>` | `dsds_impact` |
| `dsds alternatives <identifier>` | `dsds_get_alternatives` |
| `dsds lint <path…>` / `dsds lint --stdin` | `dsds_lint_by_path` / `dsds_lint_inline` |
| `dsds validate <file>` | `dsds_validate` |
| `dsds scaffold <kind>` | `dsds_spec_scaffold` |
| `dsds spec overview\|schema <kind>\|blocks` | `dsds_spec_*` |
| `dsds markdown <identifier>` | `dsds_to_markdown` |
| `dsds brief build\|author\|ask` | `dsds_context_brief` |
| `dsds check-exports <pkg>` | `dsds_check_exports` |

- **FR-12** `dsds doctor`: promote `scripts/check-integrity.js` to a first-class command and add config diagnosis — are paths configured, do files parse, does the schema version match, do lint plugins resolve, do export paths exist. Human and `--json` output; exit `2` on failures.
- **FR-13** Wizards and `dsds_feedback` get no porcelain (documented; reachable via `dsds tool`).

### Configuration

- **FR-14** Support a project-local config file — `dsds.config.mjs` or `dsds.config.json` — discovered from cwd upward. Covers everything the env vars cover today (`DSDS_PATHS`, `LINT_PLUGINS`, `PACKAGE_EXPORT_PATHS`, intro paths, dirs, flags). Precedence: CLI flags > env vars > config file > defaults. **All existing env vars keep working unchanged.**
- **FR-15** The MCP server reads the same config file through the same loader, so MCP client config can shrink to just a cwd. *(Recommended — this directly removes the current `~/.claude.json` + desktop-config duplication. Veto point at go/no-go.)*
- **FR-16** `dsds init` scaffolds `dsds.config.mjs`; `dsds init --agents` additionally writes an AGENTS.md stanza — a command cheat-sheet plus when-to-use guidance derived from the `dsds_context_brief` content (Astryx's `init --features agents` pattern). Idempotent; never clobbers without `--force`.

## 5. Non-functional requirements

- **NFR-1** Cold start (load + one query) ≤ ~1s on the Sanity UI doc set on an M-series laptop. Measure in Phase 1; loader is already parallel.
- **NFR-2** No new runtime dependencies. Arg parsing via `node:util` `parseArgs` (stdlib, Node ≥ 18.3). A dependency (e.g. commander) only if `parseArgs` proves insufficient — logged as a decision.
- **NFR-3** Tests (vitest): dispatch, flag↔schema bridge, output envelope, exit codes, config precedence, plus one `child_process` smoke test per porcelain command. Existing MCP suite stays green.
- **NFR-4** Docs: README section, CHANGELOG entry, version bump to 0.3.0.

## 6. Architecture sketch

```
            src/runtime.js  (new: config + load + state + getters)
              /        \
   src/index.js        src/cli.js  (new)
   MCP server           arg parse (node:util parseArgs)
   + watcher            → dispatch to same tool handlers
   + stdio              → print content / --json envelope
   + instructions       → exit code
              \        /
            src/tools/*.js  (unchanged — Def + Handler pairs)
            src/{loader,config,graph,validator,integrity}.js  (unchanged core)
```

Key properties preserved: handlers stay transport-agnostic; `server.js` keeps its dispatch; the CLI builds its own dispatch from the same `*Def` exports. Known trade-off: the lint LRU cache is in-memory and dies with each CLI process — acceptable for one-shot use; MCP remains the hot-loop surface. A file-backed cache is explicitly out of scope for v0.3.0.

## 7. Phases, estimates, acceptance criteria

Story points per portfolio scale (XS <1h · S .5d · M 1d · L 2–3d · XL 3–5d · XXL 1–2wk).

| Phase | Scope | Points | Done when |
| --- | --- | --- | --- |
| **0. Runtime extraction** | FR-1; `index.js` refactored onto `runtime.js` | **S** | MCP suite green; no behavior diff |
| **1. Generic CLI (MVP)** | FR-2–FR-10: `cli.js`, `dsds tool`, output contract, manifest, help | **L** | Parity test passes; NFR-1 measured; tag `v0.3.0-beta.1` |
| **2. Porcelain + doctor** | FR-11–FR-13 | **L** | All porcelain smoke tests pass; `doctor` wired into docs-repo CI as demo |
| **3. Config file** | FR-14, FR-15 | **M** | PJ's machine runs MCP + CLI from `dsds.config.mjs`; env-var block removed from client config |
| **4. Init + release** | FR-16, NFR-4, npm publish decision executed | **M** | `dsds init --agents` produces a stanza an MCP-less agent demonstrably uses; v0.3.0 shipped |

**Total: ~6–8 working days (XXL, lower bound).** Phases 0–1 alone (~L–XL) ship standalone value; each later phase is independently shippable.

## 8. Proposed timeline and check-ins

Assumes ~2 days/week on this against your 40 h/week, competing with the four main projects — allocation is the go/no-go question.

| Date | Milestone |
| --- | --- |
| **Fri Jul 10** | 30-min review of this doc → go/no-go + §10 decisions |
| **Wk of Jul 13** | Phases 0–1 → `v0.3.0-beta.1` · check-in Fri Jul 17 |
| **Wk of Jul 20** | Phase 2 · check-in Fri Jul 24 — demo: `dsds doctor` in docs-repo CI |
| **Wk of Jul 27** | Phases 3–4 → **v0.3.0 ships Fri Jul 31** · retro notes |

Check-ins: async note in PORTFOLIO-STATUS.md each Friday. If greenlit, add this as a tracked workstream line there.

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| CLI and MCP surfaces drift apart | Both generated from the same `*Def` exports; automated parity test (FR-4) |
| npm name `dsds` is **taken** (v0.0.2, unrelated) | Local bin `dsds` still works via project-local `.bin` (`npx dsds` inside a repo that installs the package). Bare global `npx dsds` would hit the squatter — publish as `@sanity-labs/dsds` (confirmed free) or keep `dsds-mcp`. Decision in §10 |
| Complex nested schemas map poorly to flags | `--args` JSON escape hatch is always available; porcelain only wraps flat-arg tools |
| Lint cold-start cost per invocation | Documented; MCP stays the hot-loop surface; file cache deferred |
| `parseArgs` too limited (no auto-help) | Help is generated from tool defs anyway (FR-10); commander as fallback decision |
| Bandwidth collision with the four main projects | Phased plan; MVP standalone; timeline explicit about 2d/wk assumption |

## 10. Decisions needed at go/no-go (Jul 10)

1. **Priority/allocation** — is ~2 days/week for three weeks acceptable right now?
2. **Distribution & naming** — stay git-installed as `dsds-mcp` with a `dsds` bin (recommended for v0.3.0), or publish `@sanity-labs/dsds`? (`dsds` on npm is squatted.)
3. **FR-15** — should the MCP server read `dsds.config` too? (Recommended: yes.)
4. **Agent docs target** — `AGENTS.md` (recommended), `CLAUDE.md`, or print-only snippet?
5. **First CI consumer** — wire `doctor`/`validate` into the Sanity UI component documentation repo in Phase 2, or defer?

## 11. Success metrics

- **M1 — MCP-less agent eval:** an agent with shell access only (no MCP configured) answers "which component, which props, correct import" for a sample task using only the CLI + generated AGENTS.md stanza.
- **M2 — CI catch:** docs-repo CI running `dsds doctor` + `dsds validate` fails on a deliberately seeded doc error.
- **M3 — Parity:** 100% of registered tools invocable via `dsds tool` (automated).
- **M4 — Context economics:** documented comparison of standing MCP tool-schema cost vs. the AGENTS.md stanza for a sample session.
- **M5 — Config dogfood:** PJ's own client config reduced to the `dsds.config` file (FR-15).

## 12. Out of scope, noted for later

- `--dense` rendering tier across commands (Astryx pattern) — revisit with real agent-usage data from logs.
- File-backed lint cache for repeated CLI lint runs.
- Manifest concepts feeding back into the DSDS spec itself (Labs schema repo) — the spec needs **no changes** for any of this plan; the CLI is purely a consumer of DSDS v0.13 documents.

## 13. References

- [Astryx CLI docs](https://astryx.atmeta.com/docs/cli) · [MarkTechPost coverage of Astryx's CLI + MCP release](https://www.marktechpost.com/2026/06/27/metas-astryx-brings-a-cli-and-mcp-server-to-an-open-source-react-design-system-agents-can-read/)
- Seam being extracted: `src/index.js` (config → load → state → server wiring)
- Prior art in-repo for non-MCP entry points: `scripts/check-integrity.js`, `scripts/view-logs.js`
