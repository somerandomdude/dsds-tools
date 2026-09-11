# Implementation Plans

Execute in order unless dependencies say otherwise. Read each plan fully,
honor its STOP conditions, and update its status when work changes.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [004](004-local-model-evaluation.md) | Evaluate grounded local-model responses | P1 | M | Plan 003 / PR #1 | DONE — conditional smoke run after dependency rebase |
| [005](005-local-authoring-demo.md) | Prove local docs-to-code authoring in a disposable sandbox | P1 | M | Plans 003 and 004 | HISTORICAL — set aside for Plan 006 |
| [006](006-qwen-settings-prototype.md) | Build a settings-page prototype from DSDS v0.20 documentation | P1 | 10–18 hours | Current v0.20 tooling; consumer contract/API slice | IN PROGRESS — 006.1 done; paused before 006.2 |

Status values: TODO, IN PROGRESS, DONE, BLOCKED, REJECTED, or HISTORICAL.

## Dependency notes

- Current direction: Plan 006. Davy and Codex author documentation; Qwen
  builds the settings-page prototype. Story 006.1 is complete, with execution
  paused before Story 006.2 so Davy can change the Codex model.
- The notes below describe the historical Plan 004/005 sequence, not
  prerequisites for Plan 006.
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
