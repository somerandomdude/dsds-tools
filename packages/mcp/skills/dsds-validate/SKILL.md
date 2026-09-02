---
name: dsds-validate
description: Validate DSDS specs against the bundled schema and check for consistency issues. Triggers on "validate specs", "check specs", "spec errors", "run validation".
metadata:
  version: 0.20.0
---

# Validate DSDS Specs

Run schema and semantic validation on spec files in `packages/specs/`.

## Quick Command

```bash
npm run validate -w packages/specs
```

This validates every `*.dsds.yaml` file against the DSDS v0.20.0 bundled schema using Ajv2020, plus the `DSDS-01`–`DSDS-11` semantic-tier catalog — resolution, uniqueness, platform vocabulary, `composes`/`depends-on` cycles, `same-as` level matching, and (DSDS-11) that a relative `sourceFiles`/`source`/`rel: file` href actually exists on disk. A separate `DSDS-12`–`DSDS-15` advisory tier (documentation-quality lint: RFC keyword casing, a token description that just restates its id, a hard requirement with no `checkedBy`, a component with no when-to-use guidance) never fails the build — it's warnings-only, reported alongside but distinct from the semantic tier.

## Full Validation (with tests)

```bash
npm test -w packages/specs
```

Checks:

1. Schema compliance (every file validates against `schema/dsds.bundled.schema.json`)
2. Filename/id consistency (`id` matches the filename)
3. Semantic rules (`DSDS-01`–`DSDS-11`)
4. Advisory/documentation-quality lint (`DSDS-12`–`DSDS-15`) — warnings only, never fails the build

## Interpreting Failures

| Error pattern | Fix |
| --- | --- |
| `must have required property 'id'/'kind'/'name'/'description'` | Every entry needs all four — add the missing field |
| `must have required property 'entries'` | A base document (has `schemaVersion`) needs a non-empty `entries` array |
| `must match pattern` (on `id`) | Use lowercase, dash-separated segments, optionally dot-chained (e.g. `color.action.primary`) |
| `[DSDS-04] id "..." is declared more than once` | Two entries (or an entry and a `shared` item) share an `id` — rename one |
| `[DSDS-05] ... targets unknown entry/shared / unknown item` | A ref's `to: "entryId#itemId"` doesn't resolve — check the target `id` and item `id` both exist |
| `[DSDS-06]`/`[DSDS-07]` cycle | A `composes` or `depends-on` ref chain loops back on itself — break the cycle |
| `[DSDS-11] ... points at "...", which doesn't exist on disk` | A `sourceFiles`/`source`/`rel: file` href is stale or typo'd — fix the path, or remove the field if the file genuinely doesn't exist yet |
| `[DSDS-12] ... uses lowercase 'must'/'should'` (advisory) | Capitalize the RFC 2119 keyword in the guideline's `statement` (MUST/SHOULD) |
| `[DSDS-13] ... description that only restates its id or name` (advisory) | Drop the token's `description` (it's optional) or state its role/when-to-use instead of repeating the id or raw value |
| `[DSDS-14] ... hard requirement ... with no checkedBy` (advisory) | Add `checkedBy: automated \| assisted \| manual` to a `must`/`must-not` guideline item |
| `[DSDS-15] ... no guidelines section with framing: when-to-use` (advisory) | Add a `when-to-use` guidelines section to the component, or note in `metadata` why it doesn't apply |
| Id/filename mismatch | Rename the entry's `id` to match the filename (without `.dsds.yaml`) |

## Validation Loop

1. Run `npm run validate -w packages/specs`
2. If errors, fix the first reported file
3. Re-run validation
4. Repeat until all pass

## Schema Sources

The validation schema comes from the [DSDS project](https://github.com/somerandomdude/design-system-documentation-schema):

- **Bundled schema** (used by `npm run validate`): `packages/specs/schema/dsds.bundled.schema.json`
- This is a single-file version with every schema file's own `$id` still present, so `$ref`s resolve without needing to be inlined

If validation fails on a field you're unsure about, consult the relevant docs page:

- https://designsystemdocspec.org/conformance.html (full field reference, rule catalog, and how the schema is organized)
- `https://designsystemdocspec.org/sections-{kind}` (per-section constraints)
- `https://designsystemdocspec.org/entries-{kind}` (per-entry constraints)

## When to Validate

- After creating or modifying any `.dsds.yaml` file
- Before committing changes
