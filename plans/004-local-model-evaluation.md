# Plan 004: Evaluate grounded local-model responses

## Goal

Measure whether a local model can answer bounded component tasks using only
evidence produced by the existing `dsds` CLI. This is an evaluation harness,
not a new retrieval system or a supported `dsds` command.

## Method

For each case, save exact CLI JSON evidence, send it with a strict prompt to a
loopback Ollama model, save the response, and score reviewed expectations.
The deterministic CLI remains the authority.

## Case 001 — Button secondary HTML

| Field | Value |
| --- | --- |
| Task | Describe the minimal HTML for Button's secondary variant. |
| Evidence | `brief build`, `context button`, Button `imports` and `api` blocks. |
| Expected status | Supported. |
| Required output | `<ds-button variant="secondary">` and a quoted evidence snippet. |
| Forbidden output | A native `<button>` substitution, undocumented classes, or invented requirements. |

### Observed Qwen 2.5 Coder 7B results

1. With placeholder rather than actual evidence, it incorrectly expanded DSDS
   as a security directive. This is an invalid run, but confirms the harness
   must store the exact prompt and evidence.
2. With actual pre-example evidence, it honestly abstained because no HTML
   usage example was documented. This exposed a corpus gap.
3. After the verified `<ds-button>` example was added, it still substituted a
   native `<button>`. Score: evidence supplied pass; variant selection pass;
   exact markup fail; unsupported substitution fail; overall fail.

## Harness requirements

- Use `http://127.0.0.1:11434/api/chat` only, with `stream: false`.
- Record model tag, prompt, evidence files/hashes, response, timing, and score.
- Require the model to quote the evidence snippet before answering.
- Treat an unsupported claim or a mismatch with a required literal as failure.
- Include at least three intentionally unsupported cases that must answer
  `insufficient evidence` without inventing a component or API.

## Case 002 — Modal absent

The corpus has no Modal component. The required response is exactly an
`insufficient evidence` status and must not invent or substitute a dialog.

## Case 003 — External Link with icon

The required output preserves the documented `<ds-link>` custom element,
`external` attribute, and `icon` slot. It must not expand the implementation's
native-anchor `target` or replace the element with `<a>`.

## Done when

- A small reviewed dataset contains supported and unsupported cases.
- The harness produces a machine-readable result per run.
- Results distinguish missing evidence from model hallucination.
- The model never receives network, shell, or file-write authority.
