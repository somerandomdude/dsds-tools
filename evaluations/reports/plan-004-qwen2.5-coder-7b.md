# Plan 004 benchmark: Qwen 2.5 Coder 7B

Status: PENDING THREE-RUN BENCHMARK

## Environment

- `dsds-tools` commit: pending
- `dsdsds` commit: pending
- Model requested: `qwen2.5-coder:7b`
- Model returned: pending
- Ollama version: pending
- Machine: MacBook Pro, M1 Pro, 16 GB memory
- Run date: pending

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

Pending `npm run evaluate:local:suite -- --consumer ../dsdsds --runs 3`.

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

## Recommendation

Pending benchmark review.
