# Davy Log

Concise async handoff for Davy and PJ. Newest updates first.

## Current state

- **Active repo/branch:** `dsds-tools` / `codex/offline-local-model-workflow`
- **Consumer integration:** `dsdsds` / `codex/migrate-site-kit-contract`
- **Next milestone:** local-model evaluation demos using CLI-supplied DSDS evidence.
- **Push status:** the most recent commits are local until GitHub DNS is available.

## Updates

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
