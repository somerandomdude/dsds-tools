# Plan 004 expanded coverage pilot

Status: CASE COVERAGE COMPLETE — FORMAL RERUN PENDING

## Scope

This stretch pass expands the evaluation inventory from 11 to 30 cases while
preserving the original 11-case, three-run benchmark and report unchanged.

- Supported: 24 cases — one minimum evidence-backed check for every documented
  `dsdsds` component.
- Unsupported: 6 cases — absent-component requests that must return the exact
  `insufficient evidence` status.
- Total: 30 cases, matching the project's 80/20 supported-to-abstention
  target.

Each case successfully built its evidence from the local `dsds` CLI in
dry-run mode. The evaluator unit suite also passed before inference.

## One-run discovery pass

Qwen 2.5 Coder 7B completed one run of all 30 cases on 2026-07-24. Its raw
artifacts remain local and ignored in
`evaluations/results/2026-07-25T04-22-29-187Z/`.

Initial automated result:

- Supported: 7/24
- Abstention: 6/6
- Weighted score: 43.3%

Artifact review found that many supported responses had the correct grounded
fact but failed assertions that were too presentation-specific: exact quote
wrapping, exact paraphrase wording, or an angle-bracket difference in a tag
field. Those assertions were revised to require the documented factual
content in the answer field. No evidence, model response, or expected API was
changed.

Rescoring the frozen discovery responses after those assertion corrections
gives 17/24 supported and 6/6 abstention. This is **not** a new formal score:
two cases also clarified their JSON string-output instruction, so the full
30-case suite must run again before making a readiness claim.

## Remaining discovery failures

These six outputs remain useful, substantive checks for the next run:

- Checkbox: omitted the documented error-slot effect from synthesized property
  behavior (the established baseline failure).
- Def Section: omitted the documented deep-linking purpose of `anchor`.
- Header: reduced the documented source rendering behavior to only “Optional.”
- Def Index and JSON View: returned an object where the contract requires a
  string identifier.
- Spec Nav and Type Ref: omitted material documented behavior from their
  explanatory fields.

## Next step

Run a fresh one-pass suite with the corrected case definitions, then inspect
every failure before deciding whether to repeat it three times. Keep the
original 11-case benchmark as the MVP baseline; this wider suite is minimum
surface coverage, not deep state/slot coverage for every component.
