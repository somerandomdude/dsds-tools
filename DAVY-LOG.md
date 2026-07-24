# Davy Log

Concise async handoff for Davy and PJ. Newest updates first.

## Current state

- **Foundation PR:** `dsds-tools` / `codex/offline-local-model-workflow` /
  draft PR #1.
- **Evaluation branch:** `dsds-tools` / `codex/local-model-evaluation`,
  pushed through `04df8de`; draft PR creation is pending.
- **Consumer integration:** `dsdsds` / `codex/migrate-site-kit-contract`,
  pushed through `a60f363`.
- **Next milestone:** merge PR #1, rebase Plan 004, require a clean
  `dsds doctor`, and run a one-pass smoke evaluation.
- **Push status:** all commits named above are on GitHub. The GitHub plugin can
  read `dsds-tools` but returned 403 when asked to create the Plan 004 PR.

## Updates

### 2026-07-24 — Local Qwen evaluation passes the readiness gate

- **Decision:** `qwen2.5-coder:7b` is ready for bounded offline DSDS stories
  with deterministic validation and human review; it is not approved for
  autonomous component implementation.
- **Changed:** `dsds-tools` branch `codex/local-model-evaluation` is pushed
  through `04df8de` with strict field-scoped scoring, reproducible Ollama
  metadata, eleven reviewed cases, a resumable suite runner, and the tracked
  Plan 004 benchmark report.
- **Verified:** 33 local Ollama runs produced 21/24 supported passes (87.5%),
  9/9 honest abstentions (100%), and a 90% weighted score. The full repository
  suite passes: 21 evaluator tests, 86 CLI tests, and 149 MCP tests with one
  existing skip.
- **Next:** PJ reviews and merges draft PR #1; then Davy rebases Plan 004,
  reruns `dsds doctor`, and opens the Plan 004 draft PR using the prepared
  description.

### 2026-07-24 — Real dsdsds corpus passes the prepared CLI

- **Verified:** running `doctor` from `dsdsds` through this branch passes every check: 24 components and 25 valid DSDS documents.
- **Next:** publish this branch as the Plan 003 completion PR; then create the separate local-model evaluation PR.

### 2026-07-24 — Plan 003 consumer integration is complete locally

- **Decision:** use existing `dsds-tools` CLI/MCP as the context layer; do not revive the schema repo's experimental local CLI, Gum wrapper, or custom retrieval.
- **Changed:** `dsdsds` now has `dsds.config.mjs` pointing to `docs/index.dsds.json`; its MCP config uses the prepared sibling `dsds-tools` checkout rather than `npx`.
- **Verified:** `doctor` loads 24 components and validates 25 DSDS documents; `list`, `search button`, and `context button` return grounded results.
- **Next:** run local-model evaluation demos with supported and insufficient-evidence tasks.

### 2026-07-24 — Build briefs adapt to focused corpora

- **Changed:** local `dsds-tools` commit `759729b` removes unavailable `pattern`, `token-group`, and `chunk` advice from build briefs and validates the rendered brief in `doctor`.
- **Verified:** full suite passed: 236 tests passed, 1 skipped.
- **Next:** push `759729b` when GitHub DNS resolves; no PJ decision needed.

### 2026-07-24 — Component work moved to dsdsds

- **Decision:** components, their DSDS docs, contract test, and authoring skill belong in `dsdsds`; CLI/MCP and offline workflow belong in `dsds-tools`.
- **Changed:** `dsdsds` branch `codex/migrate-site-kit-contract` contains the Web Components authoring skill and a source/document contract test.
- **Next:** merge the component migration independently of the local-model work.

### 2026-07-24 — Offline local-model workflow documented

- **Changed:** `dsds-tools` commit `edf7c79` adds `OFFLINE-LOCAL-MODEL-WORKFLOW.md` and README links.
- **Decision:** the local model receives bounded CLI JSON evidence, must cite it, and must answer honestly when evidence is missing.
- **Next:** convert this workflow into a small evaluated demo rather than adding a new runtime.
