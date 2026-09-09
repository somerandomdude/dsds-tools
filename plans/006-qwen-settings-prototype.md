# Plan 006: Build a settings-page prototype from DSDS v0.20 documentation

Status: IN PROGRESS — Stories 006.1–006.4 complete; Story 006.5 verification started.
Written: 2026-09-09. This is a fresh plan, independent of Plan 005.
Owners: Davy and Codex; PJ reviews shared tooling and schema decisions asynchronously.

## 1. Executive Summary

### Problem statement

Davy wants to author design-system documentation and have local Qwen use it to
build useful components and reusable page compositions. Earlier extraction
evaluations and local agent experiments provide infrastructure, but do not
establish that Qwen can build a working settings page from DSDS v0.20 evidence.

### Proposed solution

Davy and Codex author a small, verified v0.20 corpus in `dsdsds`. The existing
`dsds-tools` CLI supplies its evidence to Qwen through Ollama. Qwen proposes a
settings page in an isolated preview workspace. We verify the actual page,
record failures, and improve the documentation or runtime according to evidence.

Confirmed with Davy: humans author the documentation for the first milestone;
the desired result is a working settings-page prototype. Qwen authoring DSDS
documents is a later, separate experiment.

### Success criteria

- All selected v0.20 documents validate; every local composition reference resolves.
- Qwen produces a page using the documented custom elements, imports, slots,
  variants, and tokens, with no invented public component APIs.
- Users can edit profile fields, toggle notification preferences, Save a local
  in-memory snapshot, and Cancel back to the last saved snapshot. Save visibly
  confirms success. Reload resets the demo; this is not account persistence.
- The page passes the behavioral checks below and manual keyboard, layout,
  and accessibility review at 375px and 1280px viewport widths.
- Record three fixed-case runs after freezing the corpus and prompt. At least
  two pass automated checks within one explicitly recorded repair attempt per
  run; at least one passing artifact receives human review. A missing-contract
  case must identify insufficient evidence and produce no pretend implementation.

These are small-demo gates, not estimates of accuracy for all design systems.

## 2. User Experience & Functionality

### Personas and scope

Primary: Davy, a designer prototyping with a documented design system. Secondary:
front-end developers evaluating whether the resulting contracts support product work.

First page: a profile section (name and email), notification preferences (two
checkboxes), and primary Save / secondary Cancel actions. Native HTML supplies
the page shell and section headings. Use `ds-text-input`, `ds-checkbox`, and
`ds-button`. Additional components are driven by demonstrated gaps.

### Story 006.1 — Establish the current runtime baseline

Status: DONE. See
`evaluations/reports/plan-006-story-006.1-baseline.md`.

As a builder, I want to reuse the local wiring so that this experiment starts
from existing capabilities.

- Use the prepared `codex/006-qwen-settings-prototype` branch, created from
  fetched `origin/main` at `2b0aa4e`. Inspect status before work; do not
  transplant the old Plan 005 branch wholesale.
- Record tools, schema, and consumer revisions, Node version, installed Qwen
  tag/digest, available context setting, and baseline test results.
- Run one existing deterministic evaluation and one read-only tool-loop case
  against their intended consumer. A consumer mismatch is a setup finding,
  not a model failure. Do not assume old result claims reproduce today.
- Confirm which v0.20 commands provide custom-element contracts and sections.
  Exercise `context`, `deps --relation composes`, `get`, and `validate`.

### Story 006.2 — Author the minimum useful DSDS corpus

Status: DONE. See
`evaluations/reports/plan-006-story-006.2-corpus.md`.

As a designer, I want explicit contracts so Qwen can use the actual components.

- Audit current component implementations and tests before documenting behavior.
- Author v0.20 entries for Button, Text Input, Checkbox, relevant tokens, an
  action group, and account settings. Use a dedicated v0.20 experiment manifest;
  preserve the existing consumer documents while the slice is being proven.
- Represent reusable compositions with `kind: entry`, `refs` using
  `rel: composes`, and scoped sections. A product-facing “template” does not
  require a new schema kind. `combos` describe traits of one component.
- Document exact tags, imports, attributes/properties, slots, observable
  events, labels, spacing guidance, and the page's Save/Cancel semantics using
  existing v0.20 sections and supported fields. Include small usage examples.
- Supply supporting examples without supplying a complete target settings
  page for Qwen to copy. Record the distinction between authored requirements
  and behavior already verified in source.
- Verify that the evidence returned by the CLI contains the needed facts;
  schema-valid source YAML alone is insufficient.

### Story 006.3 — Close only the component gaps needed by the demo

Status: DONE. See
`evaluations/reports/plan-006-story-006.3-components.md`.

As a user, I want Save and Cancel to work through documented public APIs.

- The starting audit found that Text Input and Checkbox did not expose
  host-level `value` / `checked` accessors for live user state, and the selected
  controls did not establish native form association. Verify this on the
  implementation branch before choosing the smallest fix.
- In `dsdsds`, implement and test only public state access/event behavior
  needed by the page. Synchronize documentation and examples with those changes.
- Verify user input, programmatic updates, event propagation, checkbox state,
  and button activation in a browser. Do not have Qwen query shadow internals
  or assume custom elements behave like native form-associated controls.
- A small, documented demo controller may manage local state; it must be part
  of the supplied contract if Qwen is expected to use it.

### Story 006.4 — Generate the prototype with Qwen

Status: DONE — initial bounded harness. See
`evaluations/reports/plan-006-story-006.4-harness.md` and `SETTINGS-PROTOTYPE.md`.

As a designer, I want a repeatable local command that generates a preview.

- First use deterministic evidence collection so documentation failures can
  be distinguished from model-selected retrieval failures.
- Package the task, selected entry context, composition dependencies, relevant
  token guidance, output contract, and provenance. Include only agent/all
  sections for the model; verify supporting examples obey the same policy.
- Ask for structured output containing status, evidence references, declared
  assumptions/gaps, and a bounded list of proposed files. Keep this envelope
  separate from DSDS YAML: prototype source is not a DSDS document.
- Validate the response and approved output paths before materialization.
  Serve a disposable preview with access to the existing component modules.
- Require a clear completion signal; truncated output, malformed JSON,
  exhausted tool turns, and runtime errors are failures, not accepted previews.
- Permit one repair attempt with exact validation feedback. Preserve the
  original response, repair prompt, and result so improvements remain attributable.

### Story 006.5 — Verify and explain the result

Status: STARTED. One live generated preview passes nine browser checks and a
keyboard smoke test. Three frozen runs, the missing-capability case, and full
human visual/accessibility review remain outstanding; this is not MVP acceptance.

As Davy and PJ, we want evidence that the page works and that DSDS helped.

- Browser checks: components register; imports load; no console errors;
  edits and toggles update state; Save captures it and announces confirmation;
  Cancel restores it; keyboard activation works; no horizontal overflow at
  the target widths.
- Inspect labels, focus order/visibility, native semantics, and status feedback.
  Automated accessibility checks supplement manual review.
- Validate referenced entry IDs and exact evidence quotes when provided.
  Check documented API use. Literal matches cannot prove behavior or citation relevance.
- Report first-pass and repaired outcomes separately, latency, model settings,
  prompt/output size, and documentation versus retrieval versus code failures.
- Run a missing-capability variant, such as server persistence without a
  persistence contract; it must explicitly report the gap.

### Non-goals for the first milestone

Full-corpus conversion, model training, a schema rewrite, a template entity type,
a new CLI/MCP implementation, cloud account persistence, and autonomous edits
to the real consumer repository. A documentation page and a newly generated
Web Component are subsequent demonstrations.

## 3. AI System Requirements

### Existing work to reuse or reference

Audit reference: `dsds-tools` fetched `origin/main` at `2b0aa4e`. Preparation
moved this checkout from the older planning branch (`9d5583a`) to a fresh
branch at that main revision. The runtime files below are now available here.

| Existing artifact | Reuse | Required adaptation / limit |
| --- | --- | --- |
| `scripts/local-model-evaluation-core.mjs` | Request defaults, endpoint, timeout constant, hashes, timing, summaries | Existing scorer expects string fields/literals; add separate structured artifact and behavior checks. Context size must be recorded and assessed for the real packet. |
| `scripts/evaluate-local-model.mjs` | CLI evidence collection, dry run, result artifacts, HTTP error handling | Its “example absent” prompt tests extraction; replace that instruction for synthesis, where documented rules can support new arrangements. |
| `scripts/evaluate-local-model-suite.mjs` | Repeated runs and reporting conventions | Preserve historical tests; do not reuse their pass rate as prototype quality. |
| `scripts/agent-loop-readonly.mjs` on main | Bounded conversation, CLI dispatch, tool-result messages, JSON tool-call fallback | Old kinds/block vocabulary, argument validation, timeout/turn reporting, and v0.20 dependency retrieval need review before use. |
| `scripts/evaluate-agent-loop.mjs` on main | Transcript capture and per-case execution | Free-text literals and a negation regex do not establish grounding or useful abstention. Replace those checks for this experiment. |
| `scripts/agent-loop-writepilot.mjs` on main | Example of bounded output and local tool dispatch | A write is not acceptance. Review output contract, exclusive creation, paths, and validation; do not copy the pilot as the finished generation harness. |
| `packages/mcp/src/loader.js`, `graph.js`, `tools/get-agent-context.js`, `spec/render-0.20.0.js` | Existing YAML, references, graph, and audience rendering | Add focused coverage only for gaps found in the actual consumer slice. |
| `OFFLINE-LOCAL-MODEL-WORKFLOW.md` on main | CLI-based offline workflow | Refresh examples for the chosen v0.20 manifest and commands. |

The agent loop uses Ollama tool calling to invoke CLI subprocesses. It is not
an MCP client connection. The CLI and MCP share DSDS tooling, but direct MCP
transport is a separate integration claim that this demo need not make.

The main branch contains 20 agent-loop cases and a write-pilot artifact. Code
comments describe earlier Qwen 14B results; raw run evidence was not verified
in this planning review. Preserve those as historical references, not a fresh
baseline. The older deterministic evaluation scripts are unchanged relative
to the inspected local checkout and can be reused directly where appropriate.

### Evaluation strategy

Start with one fixed settings task and a missing-contract variant. Freeze
evidence before the three-run comparison. After the deterministic route works,
optionally repeat the same task with the adapted read-only loop selecting
context itself; compare retrieved entries, final behavior, latency, and failure
type. This isolates the value and cost of the earlier local-model wiring.

Model tag is a run parameter, initially the locally available Qwen model.
Earlier code has both 7B and 14B defaults; inspect installation and memory before
choosing. No model download or upgrade is required by this plan. Keep requests
on the local Ollama endpoint. Measure context consumption; avoid silently
truncating contracts to fit a guessed token budget.

## 4. Technical Specifications

### Architecture and ownership

`dsdsds` source/tests → Davy + Codex authored v0.20 documents → existing DSDS
CLI → recorded evidence packet → Ollama/Qwen → proposed files → validation →
disposable browser preview → human review.

- `dsdsds`: component fixes, public contracts, tokens, composition documents,
  small examples, and component tests. Apply its authoring skill during implementation.
- `dsds-tools`: evidence packaging, model adapter reuse, artifact checks,
  generation runner, run reports, and this plan.
- Schema repo: reference for v0.20; change only if an actual unrepresentable
  requirement is demonstrated and separately agreed with PJ.

The existing component builder emits JSX usage, and the inspected prop
extractor is oriented around a configured Sanity/React source tree. Do not
assume either generates or extracts arbitrary Web Components. First prove
that explicit section evidence is sufficient for the three selected controls.

### Integration and data handling

Use the existing Node workspace, DSDS CLI, local Ollama, and the consumer's
local module/style assets. Choose browser tooling after checking the available
repository dependencies. Use synthetic profile data. Record source revisions,
evidence hashes, prompt, model settings, raw response, timing, verification
results, and human review. Generated files stay in a run-specific workspace;
promotion into the consumer is a later reviewed change.

## 5. Risks & Roadmap

### Numbered execution order and estimates

| Story | Deliverable | Focused effort estimate |
| --- | --- | --- |
| 006.1 | Confirmed baseline and reuse inventory | 1–2 hours |
| 006.2 | Minimum v0.20 corpus and retrieval check | 2–4 hours |
| 006.3 | Verified public APIs needed for working state | 2–4 hours |
| 006.4 | Qwen generation and disposable preview | 3–5 hours |
| 006.5 | Browser verification, repeated runs, report | 2–3 hours |

Total: approximately 10–18 focused hours, or 2–3 weeks at the earlier six-hour
weekly budget. This includes Davy/Codex pairing but excludes waiting for PJ.
Re-estimate after 006.1 and the component audit. Stories 006.2 and 006.3 should
iterate together so documents describe tested behavior.

Primary risks: documentation can validate while remaining factually wrong;
retrieval can omit critical component facts; the model can invent APIs; public
state access may need real component work; context can exceed the local model's
effective budget. Keep these failure categories separate in the report.

After the settings proof: (1) document and generate a documentation-page
composition, (2) generate one new Web Component from a human-authored contract,
(3) compare deterministic retrieval with the existing agent loop, and
(4) optionally let Qwen draft DSDS documentation for human review. Sequence
these by the first demonstration's findings, not by the old Plan 005.

### Planning handoff

Stories 006.1–006.4 are complete. The v0.20 experiment corpus and component
contracts live in `dsdsds` on `codex/006-v020-settings-corpus`. The bounded
harness lives in `dsds-tools`, with development commands in `dsdsds`. It
materializes isolated files only after static checks, and serves a separate
browser-check page. One live Qwen preview passed those checks. The next unit
is Story 006.5: frozen repeated runs, a missing-capability case, and review.

Working directory:
`/Users/davyfung/Documents/Codex/2026-07-22/i-w-2/work/dsds-tools`

Branch: `codex/006-qwen-settings-prototype`.
Consumer: `../dsdsds` (inspect its existing branch and untracked plans before
any changes; they are separate work). Schema reference:
`../design-system-documentation-schema` (inspect without switching its branch).

Suggested resume instruction:

> Continue Story 006.5 in plans/006-qwen-settings-prototype.md. Read the Story
> 006.4 harness report and SETTINGS-PROTOTYPE.md. Preserve the first failed and
> successful runs as development evidence, not the frozen comparison. Plan
> three fixed-prompt runs and the missing-capability check; keep component
> contracts unchanged unless a new, verified gap warrants a separate fix.

Qwen participates in two distinct places: a small runtime smoke test in 006.1,
then actual settings-page generation in 006.4 after the documented component
contracts and required APIs are ready. The earlier conversational summary
that Qwen only enters after evidence preparation refers to prototype generation.

Leave Plan 005 as historical context; its commands, dependencies, and acceptance
criteria do not govern this plan. Davy and Codex review final preview behavior
together; deterministic checks and model review alone do not establish usability.
