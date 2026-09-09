# Story 006.4 — Small local coding harness

Date: 2026-09-09. Story 006.4 is complete as a bounded settings-prototype
runner. Story 006.5 is started, not complete.

## What changed

Previously, chatting with Qwen returned JSON containing proposed source text;
it did not create files. The new `generate:local` command retrieves the six
v0.20 contracts through the existing CLI, submits real evidence to local
Ollama, validates the structured response, and writes two actual files into a
unique ignored run directory. It never edits the consumer's component source.

The runner reuses the existing request, hashing, and timing helpers. It is a
deterministic CLI-to-Ollama experiment, not training or an MCP client. No new
schema, general coding agent, or component API was added.

- Exactly `index.html` and `settings-page.js` are allowed output paths.
- Static checks cover JSON, exact evidence quotes, JavaScript syntax, module
  URLs, selected component attributes, labels, selectors, and documented tokens.
- Live calls require normal completion, have a five-minute attempt timeout,
  and permit at most one repair with the actual validation errors.
- Raw requests, responses, evidence, model digest, hashes, timing, and outcomes
  are retained. Dry run and saved-response replay do not call Ollama.
- Preview assets are copied from the consumer. The loopback server confines
  files to the preview and applies a restrictive content security policy.
- A separate trusted `/__checks` page exercises the generated UI in a browser.
  Static acceptance does not claim browser success; the generator's report
  keeps `browserVerification: not_run`. Browser observations are recorded here.

See `SETTINGS-PROTOTYPE.md` for commands and limitations. Runtime scripts and
tests live in this repository; `dsdsds` only adds shortcuts and README guidance.

## Development runs

Model: `qwen2.5-coder:7b` through local Ollama. Digest:
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
Context 16,384; output limit 4,096; temperature 0; seed 42.
Consumer HEAD during generation: `a98ef94`; tools base HEAD: `677cd08`, with
the harness under development. Exact source and prompt hashes are in each run.

| Run directory under `evaluations/results/` | Outcome |
| --- | --- |
| `settings-PTxkA9` | Dry run; evidence/prompt saved, no inference or preview. |
| `settings-2M26jY` | Initial prompt: first attempt (~138s) and repair (~109s) rejected for missing contract citations, selectors, and token styling. No preview written. |
| `settings-6gnVlS` | Saved-response replay reproduced rejection without inference. |
| `settings-kEOTzW` | Revised prompt: accepted on first attempt (~135s); actual HTML and JavaScript materialized. 3,548 prompt tokens and 1,077 output tokens reported by Ollama. |

The prompt revision placed evidence first and the output instructions last,
repeated the fixed test selectors, and supplied exact citation snippets derived
from the retrieved text. No generated code was manually repaired. These are
development runs with a prompt change, not a frozen reliability comparison.
Exact quotes establish text membership, not semantic grounding or entailment.

## Verification

- Tools full test suite passed: 21 existing evaluation tests; 11 harness
  tests; CLI 86 passed / 4 skipped; MCP 336 passed / 1 skipped.
- Consumer component suite: 4 passed.
- Successful preview: 9/9 browser checks passed: module registration; native
  edits visible through public properties; initial Cancel; Save feedback;
  all-four-value restoration to last Save; replacement by a second Save;
  label slots; and no horizontal overflow at 375px and 1280px.
- Separate keyboard smoke test: Tab moved name to email, Space toggled a
  checkbox, Enter activated Save and Cancel, and Cancel restored the saved
  name and checkbox. The screenshot also showed the saved email restored and
  a visible Cancel focus ring. No warnings/errors were returned by the preview
  tab's browser-log check.

The output is functional, not polished: native headings retain browser-default
typography, page spacing is minimal, and initial fields are empty despite the
prompt requesting synthetic values. These are review findings, not hidden
successes. The browser checks do not replace full accessibility or design QA.

## Still to do (Story 006.5)

Freeze the prompt/corpus for three comparison runs; add a missing-capability
test; review keyboard order, accessibility, and visual quality with Davy. The
current repair loop uses static feedback only; browser failures are reported
for review, not automatically sent back to Qwen. No production persistence or
automatic promotion into `dsdsds` is included.
