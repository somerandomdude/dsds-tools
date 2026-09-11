# Plan 006: Settle how spec versions are named in `src/spec/`

- Status: TODO
- Priority: P3 — no user-visible defect; it is a legibility and maintenance cost
- Effort: XS for the cleanup, S for the renames
- Noted at: `eefb89f` on 2026-09-09, on branch `0.20.1-support`
- Depends on: nothing. Do it between feature work, not folded into it.

## Why this is written down

Raised while reviewing `render-0.20.0.js` after the 0.20.1 sync: the filename
reads as out of date. The file is not out of date — 0.20.1 changed no field in
the shape it renders — but you cannot tell that from the name, and having to
re-derive it every time is the cost.

Nothing here is broken. Every check is green at the time of writing: 431 mcp
tests, 86 cli tests, `dsds validate` and `dsds doctor` clean, style check at 0
findings across the 120-file corpus. This is cleanup, not a fix.

## The two axes, and why only one is load-bearing

**Model** — legacy 0.15.2 (`entityGroups`/`documentBlocks`) versus the 0.20.x
model (`entries`/`sections`/`traits`). This is real: 24 call sites dispatch on
it through `looksLike20`, `__dsds20` and `is20x`. Every module named `-0.20.0`
implements this *model*.

**Release** — 0.20.0 versus 0.20.1. This barely exists in code. Nothing
branches between them. The three spec tools accept both strings and collapse
them on the next line:

```js
const is20x = (spec) => spec === '0.20.0' || spec === '0.20.1';
```

Only three things are genuinely release-pinned: the vendored `schema-0.20.1/`,
its `conformance-rules.yaml`, and `BUNDLED_VERSION`.

So a module named for a release, when it implements a model, will keep looking
stale at every patch bump while being perfectly current.

## Current state: three conventions in one directory

| Convention | Files |
| --- | --- |
| Pinned to a release, but implements the model | `render-0.20.0.js`, `validator-0.20.0.js`, `prop-extractor-0.20.0.js` |
| Pinned to the release that introduced it | `style-guide-0.20.1.js` |
| Unversioned | `dsds20-lib.js`, `knowledge.js`, `schema-order.js`, `version.js`, `dsds.bundled.schema.json` |
| Genuinely a release | `schema-0.20.1/`, and the dead `schema-0.20.0/` |

Two traps in that table:

- The unversioned `dsds.bundled.schema.json` at the spec root is the **legacy
  0.15.2** schema (`$id: …/v0.15.2/…`), loaded by `validator.js`. The file with
  no version in its name is the oldest thing in the directory.
- `style-guide-0.20.1.js` set a precedent that contradicts the `-0.20.0` files.
  One is named for a model, the other for a release, and nothing tells them
  apart by sight. Both were added by the same person in the same week.

## Proposed scheme — name a module for the axis it serves

- Model-level modules lose the patch digits: `render-20.js`, `validator-20.js`,
  `prop-extractor-20.js`, `style-guide-20.js`. This matches `dsds20-lib.js`,
  which already uses that form and is the one name in the directory that has
  been right the whole time.
- Only the vendored schema directory keeps a full release number, because it
  genuinely is one release. `BUNDLED_VERSION` stays the single source of truth
  for which release that is.
- Rename the legacy schema to `dsds.bundled.schema-0.15.2.json` so the oldest
  file stops looking like the default.

Open question worth deciding first: whether `-20` or something like `-v20` /
`model-20` reads best, and whether the legacy side should get a matching
`-15` treatment for symmetry. Pick one and apply it in a single pass — a
half-applied convention is worse than the current three.

## Work items

1. **Delete `schema-0.20.0/`.** 25 files, 224K, referenced only by a stale
   comment at `knowledge.js:290` that points readers at the unused copy. Fix
   that comment to say `schema-0.20.1/`. This is the whole XS cleanup and is
   worth doing on its own, ahead of any renaming decision.
2. Rename the four model-level modules and update their import sites
   (~20 sites). Pure churn, no behaviour change — do it in one commit with
   nothing else in it, so the diff is reviewable as a rename.
3. Rename the legacy bundled schema and its three references
   (`validator.js`, `knowledge.js:165`, `author-component-doc.js`).
4. Add a short note to `packages/mcp/README.md` stating the rule, so the next
   spec bump does not reopen the question.

## STOP conditions

- Do not rename anything until the convention is chosen. Two half-migrations
  is the state this plan exists to end.
- Item 1 is independent. Do not hold the dead-directory deletion behind the
  renaming decision.
- If a future release changes the 0.20.x *model* rather than patching it, this
  plan is void — that is a genuine new model and deserves its own version in
  the filename.
