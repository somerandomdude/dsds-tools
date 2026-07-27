# Implementation Plans

Execute in order unless dependencies say otherwise. Read each plan fully,
honor its STOP conditions, and update its status when work changes.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [004](004-local-model-evaluation.md) | Evaluate grounded local-model responses | P1 | M | Plan 003 / PR #1 | DONE — conditional smoke run after dependency rebase |
| [005](005-local-authoring-demo.md) | Reframe the local-model product proposal | P1 | M | Plans 003 and 004 | TODO |

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
