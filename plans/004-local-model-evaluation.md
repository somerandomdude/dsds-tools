# Plan 004: Evaluate grounded local-model responses

- Status: IN PROGRESS
- Priority: P1
- Effort: M — one focused day for the evaluation MVP
- Planned at: `6a91a16` on 2026-07-24
- Branch: `codex/local-model-evaluation`
- Consumer fixture: sibling `../dsdsds` checkout
- Local model: `qwen2.5-coder:7b` through loopback Ollama
- Depends on: Plan 003 / draft PR #1 for the final adaptive `brief build`
  behavior. Rebase this branch after that PR merges.

## Goal

Determine whether a small local model can answer bounded design-system
questions using only evidence produced by the existing `dsds` CLI.

This is an offline evaluation harness, not a new retrieval system, a public
`dsds` command, or an agent with shell and file-write authority. The
deterministic CLI remains the authority. The model only translates retrieved
evidence into a constrained answer.

The product target is:

- answer supported questions correctly at least 80% of the time; and
- give an honest `insufficient evidence` response when the corpus cannot
  support an answer.

Supported and unsupported cases are scored separately. The reported headline
score weights supported accuracy at 80% and abstention accuracy at 20%, even
though the suite intentionally contains extra abstention cases.

## Why this plan exists

The first manual trials established three useful facts:

1. Qwen can return the exact documented Button markup when the prompt contains
   the real evidence.
2. Qwen can abstain when a requested component is absent.
3. Qwen can preserve a custom Link element and its icon slot.

They also exposed evaluator risks:

- placeholder evidence caused DSDS to be misread as a security directive;
- missing usage examples caused a correct abstention, revealing a corpus gap;
- an unconstrained response substituted native HTML for a custom element; and
- the current scorer searches every string in the response, so a required
  literal in `evidence_quote` could mask an incorrect `html` field.

The next work should harden the measurement before adding many more cases.

## Current implementation

The branch already contains:

- `scripts/evaluate-local-model.mjs`
- `evaluations/cases/button-secondary-html.json`
- `evaluations/cases/modal-absent.json`
- `evaluations/cases/link-external-icon.json`
- the root `evaluate:local` package script
- ignored raw artifacts under `evaluations/results/`

All three current cases have produced a passing Qwen run. Those passes are
promising observations, not yet a trustworthy benchmark, because the scorer
does not validate response fields or require valid JSON.

### Drift check

Before implementing:

```sh
git rev-parse --short HEAD
git status -sb
git diff 6a91a16 -- scripts/evaluate-local-model.mjs evaluations package.json
```

If the harness or case format changed since `6a91a16`, reconcile this plan
with the new implementation before editing. Preserve useful changes rather
than restoring the planned-at version.

## Scope

### In scope

- harden the local evaluator and its case schema;
- unit-test parsing and scoring without contacting Ollama;
- add supported and intentionally unsupported cases;
- add a sequential batch command;
- capture reproducibility and performance metadata;
- produce a tracked, human-readable benchmark report; and
- document the exact local workflow.

### Out of scope

- adding evaluation to the public CLI or MCP server;
- building another retrieval or indexing layer;
- giving the model network, shell, or file-write tools;
- downloading or managing models;
- benchmarking cloud models;
- changing DSDS schema documents merely to make a case pass; and
- treating model output as authoritative.

If a desired answer is not explicitly present in the DSDS evidence, classify
it as a corpus gap or change the case to an abstention case. Do not loosen the
scorer or “teach” the answer in the prompt.

## Target case format

Replace response-wide literal matching with field-scoped assertions. Keep the
format deliberately small; do not add JSONPath or a general assertion
language.

Supported example:

```json
{
  "id": "button-secondary-html",
  "stratum": "supported",
  "task": "Extract the documented minimal HTML for Button's secondary variant.",
  "evidence": [
    ["brief", "build", "--task", "Add a secondary button"],
    ["get", "button", "--block", "imports"],
    ["get", "button", "--block", "api"]
  ],
  "prompt": "Quote the exact example and return JSON only.",
  "expect": {
    "requiredFields": ["evidence_quote", "html"],
    "fields": {
      "html": {
        "requiredLiterals": [
          "<ds-button variant=\"secondary\">Cancel</ds-button>"
        ],
        "forbiddenLiterals": ["<button", "secondary-button"]
      }
    }
  }
}
```

Unsupported example:

```json
{
  "id": "modal-absent",
  "stratum": "unsupported",
  "task": "Which Modal component should I use?",
  "evidence": [
    ["search", "modal"],
    ["list", "--kind", "component"]
  ],
  "prompt": "Return the required JSON-only abstention response.",
  "expect": {
    "requiredFields": ["status"],
    "fields": {
      "status": {
        "equals": "insufficient evidence",
        "forbiddenLiterals": ["ds-modal", "<modal", "Dialog component"]
      }
    }
  }
}
```

Every case requires a valid JSON object. Markdown fences, prose around JSON,
missing fields, wrong types, and correct text in the wrong field are failures.

## Work block A — Make the scorer trustworthy

Estimated time: 60–90 minutes.

Status: COMPLETE on 2026-07-24.

Observed verification:

- 14 evaluator tests pass, including the wrong-field false-positive
  regression.
- All three cases successfully build their real CLI evidence in dry-run mode.
- A strict live `button-secondary-html` Qwen run passes with valid JSON and
  independent passes for `evidence_quote` and `html`.
- The full workspace passes: 86 CLI tests and 149 MCP tests, with one existing
  MCP skip.

### Files

- `scripts/evaluate-local-model.mjs`
- `scripts/local-model-evaluation-core.mjs` (new)
- `scripts/local-model-evaluation-core.test.mjs` (new)
- `evaluations/cases/*.json`
- `package.json`

### Steps

1. Move pure argument, case-validation, response-parsing, and scoring
   functions into `scripts/local-model-evaluation-core.mjs`.
2. Replace the positional `Map` argument loop with explicit parsing for:
   `--case`, `--consumer`, `--model`, `--out`, `--dry-run`, and `--force`.
   Reject unknown flags, missing values, and incompatible modes.
3. Validate the case before running CLI commands. Require non-empty `id`,
   `task`, `evidence`, `prompt`, and `expect.fields`.
4. Parse the model response as strict JSON. Do not fall back to scanning raw
   prose.
5. Evaluate assertions only against their named field:
   - `equals` performs exact string equality;
   - `requiredLiterals` all must occur in that field; and
   - `forbiddenLiterals` all must be absent from that field.
6. Return structured failure reasons for invalid JSON, missing fields, wrong
   field types, missing literals, forbidden literals, and exact mismatches.
7. Exit non-zero for a failed evaluation after saving its artifact. Use exit
   code `1` for harness/configuration errors and `2` for a completed model run
   that fails expectations.
8. Refuse to overwrite an existing result unless `--force` is present.
9. Convert the three existing cases to the new schema.
10. Add `node --test scripts/local-model-evaluation-core.test.mjs` to the root
    test workflow.

### Required unit tests

- correct literal in `html` passes;
- correct literal only in `evidence_quote` fails;
- forbidden native element in `html` fails;
- exact `insufficient evidence` status passes;
- abstention phrase embedded in a longer status fails;
- missing required field fails;
- invalid JSON and fenced JSON fail;
- unknown case assertion fails validation; and
- argument parser handles flags without consuming the next flag as a value.

### Done when

```sh
node --test scripts/local-model-evaluation-core.test.mjs
npm test
```

Both commands pass, and a deliberately wrong `html` field cannot receive a
pass because the evidence quote contains the expected markup.

## Work block B — Make runs reproducible and diagnosable

Estimated time: 45–60 minutes.

Status: COMPLETE on 2026-07-24.

Observed verification:

- The deterministic request uses JSON mode, temperature 0, seed 42, a 4,096
  token context, and a ten-minute keep-alive.
- The live Button run passed in 4.0 seconds with 2,146 prompt tokens and 38
  generated tokens.
- Its artifact records the requested and returned model tag, start/finish
  timestamps, Ollama timing counters, three evidence SHA-256 hashes, and the
  prompt SHA-256 hash.
- The evaluator suite now has 18 passing tests; all workspace tests continue
  to pass.

### Files

- `scripts/evaluate-local-model.mjs`
- `scripts/local-model-evaluation-core.mjs`
- `scripts/local-model-evaluation-core.test.mjs`

### Steps

1. Keep the endpoint fixed at `http://127.0.0.1:11434/api/chat`. Do not accept
   a configurable remote URL.
2. Send `stream: false`, `format: "json"`, `keep_alive: "10m"`, and deterministic
   Ollama options including `temperature: 0`, `seed: 42`, and `num_ctx: 4096`.
3. Add a two-minute request timeout with a clear message explaining whether
   Ollama is unavailable, the model is missing, or the request timed out.
4. Capture:
   - requested model tag and model identifier returned by Ollama;
   - start and finish timestamps;
   - wall-clock duration;
   - Ollama load, prompt-evaluation, and generation timings;
   - prompt and generated-token counts when present;
   - exact prompt;
   - each evidence command and stdout; and
   - SHA-256 hashes for each evidence output and the full prompt.
5. Include a `harnessVersion` integer in every artifact so future schema
   changes are distinguishable.
6. Improve the terminal summary to show JSON validity, each named assertion,
   duration/token information, final result, and artifact path.
7. Keep raw artifacts under ignored `evaluations/results/`.

### Done when

A live run prints a readable summary and its JSON artifact contains enough
information to reproduce what the model saw and diagnose slow output.

## Work block C — Expand the reviewed case suite

Estimated time: 90–120 minutes.

Status: COMPLETE on 2026-07-24.

Observed verification:

- Eleven cases load real evidence successfully in dry-run mode: eight
  supported extractions and three unsupported requests.
- Every case now declares its `supported` or `unsupported` stratum explicitly
  for later batch reporting.
- The six new supported expectations were reviewed directly against emitted
  `dsds get ... --block api --json` evidence; no consumer documents changed.
- The evaluator suite now has 19 passing tests.

### Files

- `evaluations/cases/*.json`

Build eleven cases: eight supported extractions and three unsupported
requests. Each expected value must be copied from the emitted CLI evidence,
not from component source code or memory.

### Supported cases

1. `button-secondary-html` — exact secondary Button example.
2. `link-external-icon` — exact external Link example with the icon slot.
3. `badge-variant-values` — exact `kind`, `experimental`, and `neutral`
   allowed values and the `neutral` default.
4. `icon-button-required-label` — `label` is required and supplies the
   accessible name; do not invent positioning, colors, variants, or sizes.
5. `back-to-top-defaults` — exact default `label` and `href`.
6. `text-input-supported-types` — only the six input types explicitly named
   by the API evidence.
7. `checkbox-error-contract` — the documented `error` property and `error`
   slot, without inventing validation behavior.
8. `select-multiple-contract` — the documented meaning and default of
   `multiple`, without substituting a native select example.

### Unsupported cases

9. `modal-absent`
10. `tooltip-absent`
11. `date-picker-absent`

Each unsupported case must retrieve both the search result and the component
list. It passes only with an exact `{"status":"insufficient evidence"}` object
and no invented or substitute component.

### Case review checklist

- The evidence commands succeed from `../dsdsds`.
- The required answer is visible verbatim in the captured evidence.
- Assertions are field-scoped.
- Forbidden literals target a plausible hallucination, not arbitrary wording.
- The prompt contains format instructions but no hidden answer.
- A human can explain why both a pass and a failure are meaningful.

### Stop condition

If a supported expectation is not explicit in CLI output, stop that case and
record a corpus gap. Do not edit `../dsdsds` from this plan.

## Work block D — Add batch execution and reporting

Estimated time: 60–90 minutes.

Status: COMPLETE on 2026-07-24.

Observed verification:

- The sequential runner completed all eleven cases and wrote per-run artifacts
  plus `summary.json` to one ignored timestamped directory.
- It continued through model-answer failures, printed a compact per-case
  table, separated supported and abstention rates, calculated the 80/20 score,
  and exited `2` when the initial gate failed.
- Artifact review identified four presentation-sensitive false failures.
  After correcting those assertions without changing evidence or responses,
  the frozen pilot rescored to 7/8 supported and 3/3 abstentions.
- The one remaining Checkbox failure omitted an explicitly documented
  behavior and remains a model failure.
- The root README documents the local workflow, and the tracked benchmark
  report records the pilot and awaits the formal three-run result.

### Files

- `scripts/evaluate-local-model-suite.mjs` (new)
- `scripts/local-model-evaluation-core.mjs`
- `scripts/local-model-evaluation-core.test.mjs`
- `evaluations/reports/plan-004-qwen2.5-coder-7b.md` (new, tracked)
- `package.json`
- `README.md`

### Steps

1. Add `npm run evaluate:local:suite` to run sorted case files sequentially.
   Do not run concurrent Ollama requests on the 16 GB machine.
2. Support `--runs <positive integer>` with a default of `1`; use `3` for the
   reviewed benchmark.
3. Write each raw artifact to an ignored, timestamped directory under
   `evaluations/results/`.
4. Continue after individual model failures, but stop immediately on invalid
   case data, failed CLI evidence, or Ollama transport errors.
5. Print a compact table with case, stratum, run count, passes, pass rate,
   median duration, and failure category.
6. Exit `2` if any abstention run fails or if the supported pass rate is below
   80%.
7. Generate or manually update the tracked Markdown report with:
   - commit SHAs for `dsds-tools` and `dsdsds`;
   - model tag and returned identifier;
   - Ollama version;
   - date and machine summary;
   - per-case results;
   - supported and abstention pass rates;
   - weighted score: `(supported rate × 0.8) + (abstention rate × 0.2)`;
   - median timing and token rates;
   - representative failure excerpts; and
   - corpus gaps and next recommendation.
8. Add README instructions for starting Ollama, checking `ollama ps`, dry
   running one case, running one live case, and running the suite.

### Exact local commands

```sh
cd /Users/davyfung/Documents/Codex/2026-07-22/i-w-2/work/dsds-tools
ollama ps

npm run evaluate:local -- \
  --case evaluations/cases/button-secondary-html.json \
  --consumer ../dsdsds \
  --dry-run

npm run evaluate:local -- \
  --case evaluations/cases/button-secondary-html.json \
  --consumer ../dsdsds \
  --out evaluations/results/button-secondary-html-qwen.json

npm run evaluate:local:suite -- \
  --consumer ../dsdsds \
  --model qwen2.5-coder:7b \
  --runs 3
```

## Work block E — Run and interpret the benchmark

Estimated time: 45–75 minutes plus model runtime.

Status: COMPLETE WITH PLAN 003 DEPENDENCY on 2026-07-24.

Observed result:

- 33 scored runs completed: eleven cases repeated three times.
- Supported accuracy: 21/24 (87.5%).
- Abstention accuracy: 9/9 (100%).
- Weighted score: 90%; readiness gate PASS.
- Checkbox Error Contract failed consistently because its synthesized
  behavior omitted the documented error-slot effect.
- Median wall time was 5.0 seconds; median generation speed was 10.9 tokens/s.
- A two-minute Ollama timeout interrupted one request. Resume mode was added,
  verified existing case definitions and model tags, and completed only the
  missing runs.
- `dsds doctor` retains the known empty-kind warning until Plan 003 merges.
  All document, schema, graph, and example checks pass. Treat the result as
  conditional until the branch is rebased and doctor is fully green.

1. Confirm `../dsdsds` is on the intended evidence branch and `dsds doctor`
   passes before starting.
2. Run all unit and workspace tests.
3. Dry-run at least one supported and one unsupported case and manually check
   that the expected answer is present or absent in evidence.
4. Run all eleven cases three times.
5. Inspect every failure artifact. Categorize it as:
   - `retrieval/configuration`;
   - `invalid response format`;
   - `unsupported invention`;
   - `supported extraction error`;
   - `scorer defect`; or
   - `corpus gap`.
6. Complete the tracked report. Do not characterize scorer or corpus defects
   as model failures.
7. Update `davy-log.md` through the existing Davy log workflow with the
   commits, result, and what PJ should review.

## Suggested day schedule

| Block | Focus | Target |
| --- | --- | --- |
| 1 | Scorer integrity and tests | 60–90 min |
| 2 | Metadata, timeout, terminal output | 45–60 min |
| 3 | Eight additional reviewed cases | 90–120 min |
| 4 | Batch runner and report format | 60–90 min |
| 5 | Three-run benchmark and analysis | 45–75 min + inference |

Commit after each block so a later change can target or revert one concern.

Suggested commit sequence:

1. `test: harden local evaluation scoring`
2. `feat: record reproducible local evaluation metadata`
3. `test: expand grounded local model cases`
4. `feat: add local evaluation suite runner`
5. `docs: report plan 004 local model results`

## Verification checklist

```sh
node --check scripts/evaluate-local-model.mjs
node --check scripts/evaluate-local-model-suite.mjs
node --test scripts/local-model-evaluation-core.test.mjs
npm test
git diff --check
git status -sb
```

Then run the dry-run and three-run suite commands from Work block D.

## MVP acceptance criteria

- Every case is backed only by successful `dsds` CLI JSON output.
- Valid JSON and field-scoped assertions are mandatory.
- Unit tests demonstrate that correct text in the wrong field cannot pass.
- Eight supported and three unsupported cases receive human review.
- Every unsupported run abstains without inventing or substituting a
  component.
- Supported accuracy across three runs per case is at least 80%.
- Raw prompts, evidence, responses, hashes, timing, and scores remain local in
  ignored artifacts.
- A tracked report makes the result understandable without opening raw JSON.
- The model has no network, shell, or file-write authority.
- Existing workspace tests still pass.

## Final decision

At the end of the day, classify the local workflow:

- **Ready for bounded offline stories** — abstention is 100%, supported
  accuracy is at least 80%, and failures are reviewable.
- **Promising, needs harness/corpus work** — the model is grounded but
  measurement or documentation gaps dominate.
- **Not ready** — the model repeatedly invents unsupported APIs or cannot
  extract explicit supported answers.

Do not generalize this result beyond constrained DSDS evidence tasks. A pass
supports using Qwen for a bounded offline story with human review, not
autonomous component implementation.

### Recorded decision

**Ready for bounded offline stories, with human review**, conditional on
rebasing after Plan 003 and confirming a clean `dsds doctor` result.
