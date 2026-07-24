# Plan 004 benchmark: Qwen 2.5 Coder 7B

Status: COMPLETE — CONDITIONAL PASS

## Environment

- `dsds-tools` commit: `79c39ff`
- `dsdsds` commit: `a60f363`
- Model requested: `qwen2.5-coder:7b`
- Model returned: `qwen2.5-coder:7b` (`dae161e27b0e` in `ollama ps`)
- Ollama version: `0.32.1`
- Machine: MacBook Pro, M1 Pro, 16 GB memory
- Run date: 2026-07-24

## Method

The suite runs eight supported extraction cases and three intentionally
unsupported cases. Every prompt is built from local `dsds` CLI JSON evidence.
The model receives no network, shell, or file-write tools.

Each case runs three times with temperature 0, seed 42, a 4,096-token context,
and strict JSON field assertions. Supported and unsupported accuracy are
reported separately. The headline score is:

```text
(supported pass rate × 0.8) + (abstention pass rate × 0.2)
```

Readiness requires at least 80% supported accuracy and 100% abstention.

## Results

The formal run completed 33 scored inferences:

| Case | Stratum | Result | Median |
| --- | --- | ---: | ---: |
| Back to Top defaults | Supported | 3/3 | 13.9 s |
| Badge variant values | Supported | 3/3 | 6.2 s |
| Button secondary HTML | Supported | 3/3 | 3.3 s |
| Checkbox error contract | Supported | 0/3 | 7.4 s |
| Date Picker absent | Unsupported | 3/3 | 840 ms |
| Icon Button required label | Supported | 3/3 | 4.6 s |
| Link external icon | Supported | 3/3 | 11.0 s |
| Modal absent | Unsupported | 3/3 | 980 ms |
| Select multiple contract | Supported | 3/3 | 7.1 s |
| Text Input supported types | Supported | 3/3 | 4.7 s |
| Tooltip absent | Unsupported | 3/3 | 996 ms |

- Supported: 21/24 (87.5%)
- Abstention: 9/9 (100%)
- Weighted score: 90%
- Readiness gate: PASS
- Median wall-clock duration: 5.0 s
- Supported median duration: 6.8 s
- Unsupported median duration: 980 ms
- Median generation speed: 10.9 tokens/s
- Total prompt tokens: 23,922
- Total generated tokens: 1,863

The run began at `2026-07-24T18:31:00.275Z` and finished at
`2026-07-24T18:43:29.802Z`. One Ollama request timed out during the run. The
suite's new resume mode verified and reused completed artifacts, then reran
only the missing request successfully.

### One-run pilot

The first complete run proved the batch workflow and produced valid artifacts
for all eleven cases.

The initial automated result was 3/8 supported and 3/3 unsupported. Artifact
review found that four supported failures contained the correct grounded facts
but differed only in evidence-quote shape or comma spacing. Assertions were
changed to test the required facts rather than presentation. No expected
answer, evidence, or model response was changed.

Rescoring the frozen pilot responses with the corrected assertions produced:

- Supported: 7/8 (87.5%)
- Abstention: 3/3 (100%)
- Weighted score: 90%
- Readiness gate: PASS

Checkbox Error Contract remained a legitimate failure: the response said the
property marks the checkbox invalid but omitted the documented fact that it
also shows the error slot.

The corrected cases are now frozen before the formal three-run benchmark.

## Failures and corpus gaps

- Pilot model failure: Checkbox Error Contract omitted one explicitly
  documented behavior.
- Pilot evaluator defect: exact quote formatting and comma spacing initially
  caused four false failures; field-scoped factual assertions replaced those
  presentation checks.
- Formal model failure: all three Checkbox responses quoted the complete
  documented property description, but their `property_behavior` field only
  said that the property marks the checkbox invalid. Each omitted that the
  property also shows the error slot.
- Environment dependency: `dsds doctor` passed document loading, uniqueness,
  schema, spec alignment, relationship, and example-prop checks, but reported
  the known empty `pattern`, `token-group`, and `chunk` brief references.
  Plan 003's adaptive-brief PR addresses this. The benchmark is conditional
  until that change merges and doctor is rerun.

## Recommendation

**Ready for bounded offline stories, with human review.**

Qwen exceeded the 80% supported target and abstained correctly in every
unsupported run. Use it for narrow extraction and repetitive implementation
stories whose required facts are present in CLI evidence. Keep deterministic
validation and a human review step; the Checkbox result shows that the model
can quote a complete fact but still omit part of it in its synthesized answer.

After Plan 003 merges:

1. rebase Plan 004 onto the updated main branch;
2. rerun `dsds doctor` and require a clean result; and
3. run a one-pass smoke suite to confirm the evidence hashes and scores remain
   stable.
