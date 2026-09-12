# Implementation Plans

Execute in order unless dependencies say otherwise. Read each plan fully,
honor its STOP conditions, and update its status when work changes.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [004](004-local-model-evaluation.md) | Evaluate grounded local-model responses | P1 | M | Plan 003 / PR #1 | DONE — conditional smoke run after dependency rebase |
| [005](005-local-authoring-demo.md) | Prove local docs-to-code authoring in a disposable sandbox | P1 | M | Plans 003 and 004 | TODO |
| [006](006-spec-version-naming.md) | Settle how spec versions are named in `src/spec/` | P3 | XS–S | none | TODO |
| [007](007-toon-output-format.md) | Deliver structured output as TOON | P2 | S–M | none (decision first) | TODO |

Status values: TODO, IN PROGRESS, DONE, BLOCKED, or REJECTED.

## Dependency notes

- Plan 004's formal benchmark is complete. After Plan 003 merges, rebase and
  run a one-pass smoke suite with a fully green `dsds doctor`.
- Plan 005 builds on Plan 004's strict Ollama request, metadata, hashing, and
  artifact conventions. Start after the dependency rebase, or explicitly make
  it a stacked branch.

## Direction considered and deferred

- Public `dsds ask-local` or `generate-local` commands: deferred until a
  disposable authoring demonstration proves the workflow and clarifies the
  right product boundary.
- Fine-tuning or LoRA: deferred because no evidence yet shows prompting,
  structured evidence, and deterministic validation are insufficient.
- Direct MCP tool calling from Ollama: separate runtime experiment, not needed
  to prove docs-to-code authoring.
- Applying generated code to `dsdsds`: rejected for Plan 005; proposals remain
  isolated until deterministic checks and human review establish value.
- Encoding every payload as TOON: rejected in Plan 007. TOON's headline saving
  is measured against JSON; we emit Markdown tables, which already beat JSON by
  19–72% here. Against Markdown the measured prize is 2.5–4.9% of total payload,
  concentrated entirely in API tables — and encoding raw `structuredContent`
  makes it *worse* (+461% measured). Prose, bullets and code blocks are 78% of
  what we deliver and are not TOON-shaped at all.

- Renaming the `src/spec/` modules: deferred to Plan 006. Nothing is broken —
  the `-0.20.0` names describe the 0.20.x *model*, not a release — but three
  naming conventions now coexist and the question reopens at every spec bump.
