---
name: dsds-update
description: Update an existing DSDS spec based on implementation changes, Figma updates, or written instructions. Triggers on "update spec", "modify spec", "add prop to spec", "sync spec", "spec drift".
metadata:
  version: 0.21.0
---

# Update a DSDS Spec

Modify an existing `.dsds.yaml` file.

## Procedure

1. Read the existing document.
2. Identify what changed — compare against the source (code diff, Figma update, user instructions).
3. Apply edits to the document, preserving structure and existing content.
4. Run `npx dsds-validate <the-file>.dsds.yaml` — fix errors until it passes.
5. If your project generates its own index or catalog from these documents, regenerate it now.

## Common Updates

| Change | Location in the document |
| --- | --- |
| New prop | `sourceFiles` already points at the real file — no edit needed, unless there's no source file, in which case update the `definitions` section titled "Props" |
| New variant value | Top-level `traits` item with `traitType: variant` and `kind: enum`, in its `values` array |
| New state | Top-level `traits` item with `traitType: state` |
| Anatomy change | The `definitions` section titled "Anatomy" |
| New accessibility requirement | A `guidelines` item in a `framing: how-to-use` section, or a `definitions` section titled "Keyboard interactions" |
| Status change | `metadata.status` (always an object: `{status: "..."}`) |
| New agent rule | A section with `for: agent` |

## Rules

- Never remove existing content unless explicitly instructed — documents are additive by default.
- Preserve the existing order of `sections` and `traits` items.
- When you add a *new* top-level field, insert it at its
  [STYLE_GUIDE.md](https://github.com/somerandomdude/design-system-documentation-schema/blob/main/STYLE_GUIDE.md)
  position rather than appending it to the end — that guide's whole point is
  that a reader can rely on the order. Nothing in your project will check
  this: field order never affects validity, and the `DSDS-17`–`DSDS-23`
  advisory rules that report it live in the spec repo's own `lint-docs.js`,
  which the published package doesn't ship. Follow it because the next
  reader benefits, not because a tool will catch you. Don't reshuffle
  fields that were already there just to comply; that turns a one-line edit
  into an unreviewable diff.
- When adding trait values, place them in logical order (not necessarily alphabetical) — the first value is implied as the default.
- Update `metadata.status` if the change constitutes a breaking API modification.
- If adding a new relationship, use `common/ref`'s one form: `{to: "<id>", rel: "<depends-on|extends|alternative-to|composes|...>"}` for something in this document's own graph, or `{href: "<url>", rel: "..."}` for something outside it.

## Schema References

When adding new sections or fields, verify the exact fields:

- **Bundled schema**: `https://designsystemdocspec.org/v0.21.0/dsds.bundled.schema.json` (or `node_modules/design-system-documentation-schema/schema/dsds.bundled.schema.json` if DSDS is installed as a dependency)
- **Section reference**: `/schema/sections-<kind>.md` on this site — for example
  [sections-guidelines.md](https://designsystemdocspec.org/schema/sections-guidelines.md)
- **Entry reference**: `/schema/entries-<kind>.md` — for example
  [entries-component.md](https://designsystemdocspec.org/schema/entries-component.md)
- **Full architecture**: https://designsystemdocspec.org/schema#how-the-schema-is-organized

## Gotchas

- Modifying `id` or `kind` is a breaking change — confirm with the user.
- DSDS doesn't track which props are "required" as a schema fact — that lives in the real source file `sourceFiles` points at. A new required prop is still a breaking change worth calling out in a `guidelines` item, just not a field to flip in the spec itself.
- Token references (in `traits`, `combos`, or prose) must match `id`s of tokens actually documented in `tokens/`.
