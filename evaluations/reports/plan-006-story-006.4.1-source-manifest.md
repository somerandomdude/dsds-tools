# Story 006.4.1 — Source manifest boundary

Date: 2026-09-09. This is a harness follow-up, not a new model evaluation.

The first settings harness was coupled to the `dsdsds` checkout: it hardcoded
six entity IDs, the settings config filename, five component source files, and
the `src/` preview snapshot. That made it unsafe to point at the schema repo's
example corpus, whose entries, source references, and preview assets have a
different shape.

The runner now has a validated source manifest at
`evaluations/manifests/settings-page.json`. It records the config, evidence
entities, dependency queries, source files used for provenance, and the
optional preview asset root. The default behavior remains backward-compatible
with `dsdsds`; a dry run from that checkout successfully wrote a new evidence
and prompt artifact without calling Ollama.

The manifest is intentionally a boundary, not a claim that every prompt is
generic yet. `promptKind: settings-page` still requires the six settings
entities and the existing HTML/JavaScript validator. A future schema-repo
composition case must add its own prompt and validator rather than silently
running the settings contract against unrelated examples. A manifest may omit
the source snapshot for schema-only evidence runs; generated previews then
cannot assume local component modules exist.

Tests cover manifest validation, optional source snapshots, the existing
materialization boundary, and the prior malformed-output cases. Full repeated
runs and the schema-repo composition manifest remain Story 006.5 work.
