# Plan 006 — Story 006.1 baseline

Date: 2026-09-09

This report establishes the runtime baseline before authoring the v0.20
settings-page corpus. It does not implement Stories 006.2–006.5.

## Revisions and runtime

| Item | Observed value |
| --- | --- |
| `dsds-tools` branch | `codex/006-qwen-settings-prototype` |
| `dsds-tools` HEAD / fetched `origin/main` | `2b0aa4e8df9b058170b30943593a944a69d3a4af` |
| `dsdsds` branch / HEAD | `codex/005-composition-experiments` / `a60f3630f29ddca2cd71e9637b173b4b2c5d5fb1` |
| `dsdsds` fetched `origin/main` | `55196f5658fa847ac4179fd0bbaad708c4619256` |
| schema checkout branch / HEAD | `codex/prd-local-context-cli` / `25fb1cd7e76b54b8354568be07229c2f7d9981d0` |
| schema fetched `origin/main` | `85813444fd3b8d023b6c9b3dfe6e3fab65b966ea` |
| Node / npm | `v22.17.1` / `10.9.2` |
| Ollama | `0.33.2` |
| Qwen | `qwen2.5-coder:7b`, digest `dae161e27b0e`, 7.6B, `Q4_K_M` |
| Model capacity reported by Ollama | 32,768-token context |
| Context requested by deterministic harness | 4,096 |
| Context requested and loaded by read-only loop | 8,192 |
| Processor during runs | 100% GPU |

The local schema checkout is still on a v0.15-era branch even though its
fetched `origin/main` is v0.20.0. The v0.20 checks below use files archived
from `origin/main`; the checkout was not switched or reset.

## Test baseline

The first `dsds-tools` run found stale installed dependencies: `js-yaml` was
present in the lockfile but absent from `node_modules`. `npm install` could not
use the global npm cache because it contains root-owned files. Running the same
install with `/private/tmp/dsds-tools-npm-cache` added the missing package and
left the tracked lockfile unchanged after normalization was reverted.

After refreshing dependencies:

- evaluator: 21 passed;
- CLI: 86 passed, 4 skipped;
- MCP: 336 passed, 1 skipped; and
- `dsdsds`: 4 passed.

`dsds doctor` against the current `dsdsds` checkout loads 24 entities, finds
no duplicate identifiers or relationship errors, and passes the example and
brief checks. It exits 2 on one expected boundary: the consumer declares
`dsdsVersion: 0.15.2`, while the tools bundle v0.20.0. The consumer is therefore
usable for historical harness checks but is not the Plan 006 v0.20 corpus.

## Existing deterministic harness smoke test

Command case: `evaluations/cases/button-secondary-html.json`, consumer
`../dsdsds`, model `qwen2.5-coder:7b`.

Result: PASS. Qwen returned the documented
`<ds-button variant="secondary">Cancel</ds-button>` example and its evidence
quote in valid JSON.

| Metric | Value |
| --- | --- |
| Wall time | 3.356 seconds |
| Prompt tokens | 2,434 |
| Generated tokens | 38 |
| Completion reason | `stop` |
| Prompt SHA-256 | `53443aebec47a6900dbeff74fe2aea24422872b2f2f7a61d530c6632681e8418` |

The raw result was written to
`/private/tmp/story-006-button-secondary.json`. This confirms that deterministic
CLI evidence collection, the Ollama request, strict JSON scoring, timing, and
hashing still operate on the historical consumer.

## Read-only agent-loop smoke tests

The checked-in 20 agent cases do not identify or include their original
consumer. Their component vocabulary and expected facts extend beyond
`dsdsds`, so they cannot be treated as reproducible scores against this public
consumer.

A diagnostic run of `checkbox-error` against `dsdsds` made two tool calls,
recovered from an invalid `props` block request to `api`, and returned an
answer. It would miss the case's required `error message` literal. This is
recorded as a consumer mismatch, not a model-quality score.

An aligned probe then asked for Button's exact secondary HTML, which is present
in `dsdsds`:

1. Qwen requested nonexistent block `examples`.
2. It recovered to `api` after the CLI listed `imports`, `api`, `guidelines`,
   and `accessibility` as available blocks.
3. It did not request `imports`, where the exact example is documented.
4. It incorrectly answered that no specific HTML example was included.

Result: FAIL for grounded retrieval, after two tool calls and three turns
(13.2 seconds wall time reported by the command runner). The loop connected to
Ollama, dispatched CLI tools, returned tool results, and stopped normally. The
failure is evidence selection: the current prompt and tool policy do not make
Qwen continue across the blocks needed to answer the task.

## v0.20 CLI characterization

The following commands were exercised with `empty-state`, `icon`, `button`,
`spacing-scale`, and `error-state` files archived from the schema repository's
fetched v0.20 `origin/main`:

| Command | Result |
| --- | --- |
| `dsds validate <empty-state.yaml>` | Passed schema and semantic validation, with five expected standalone-reference warnings. |
| `dsds get empty-state` | Returned metadata, outgoing/incoming relationships, and all sections, including the human section. |
| `dsds context empty-state` | Returned relationships plus `for: all` guidance and steps; omitted the human-only section and reported the omission. |
| `dsds deps empty-state --relation composes` | Returned resolved `icon` and `button` component dependencies. |

The graph also reports five unresolved relationships elsewhere in the
deliberately small catalog. Story 006.2 needs a v0.20 base document that loads
the complete local settings slice so validation and graph results are clean.

## Baseline decision

The local runtime is usable. Reuse the deterministic harness for the first
settings-page generation packet. Treat the read-only agent loop as a later
comparison until its v0.20 vocabulary, block-selection behavior, case
provenance, and failure scoring are adapted.

Story 006.2 begins by authoring a self-contained v0.20 consumer slice for
Button, Text Input, Checkbox, tokens, action group, and account settings. No
part of that story was implemented in this baseline.
