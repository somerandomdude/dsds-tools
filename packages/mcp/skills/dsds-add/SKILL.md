---
name: dsds-add
description: Author a new Design System Doc Spec (DSDS) spec from component implementation, Figma design, or written requirements. Triggers on "add spec", "create spec", "new spec", "author spec", "spec from component", "spec from Figma".
metadata:
  version: 0.21.0
---

# Add a DSDS Spec

Create a new standalone `.dsds.yaml` entry file in your project's documentation directory (see File Placement below for where a given kind lives).

## Procedure

1. Determine entry kind: `component`, `token`, `theme`, or the generic `entry` kind (for a foundation, pattern, guide, or anything else — use a namespaced custom kind like `acme.icon-library` instead if the document wants its own recognizable name).
2. Gather inputs — read the source (component source code, Figma frame, requirements doc).
3. Create `{directory}/{id}.dsds.yaml` using the template below.
4. Add a `refs` entry (`rel: file`) in `index.dsds.yaml` pointing at the new file.
5. Run `npx dsds-validate {directory}/{id}.dsds.yaml` — fix errors until it passes.
6. Keep the template's field order. It follows [the style guide](https://designsystemdocspec.org/style-guide), which asks you to write an entry's fields in the order the schema files list them — so the guide and the schema are the only two places that order lives, and this skill doesn't keep a third copy. Order never affects validity, and nothing in your project checks it: `npx dsds-validate` won't mention it, and the `DSDS-17`–`DSDS-23` advisory rules that report it live in the spec repo's own tooling, which the published package doesn't ship.
7. If your project generates its own index or catalog from these documents, regenerate it now.

## File Placement

| Kind | Directory |
| --- | --- |
| `component` | `components/` |
| `token` | `tokens/` |
| `theme` | `themes/` |
| `entry` (foundation) | `foundations/` |
| `entry` (pattern) | `patterns/` |
| `entry` (guide) | `guides/` |

## Template (Component)

```yaml
kind: component
id: <filename-without-extension>
name: <PascalCase>
description: <one-sentence summary>

metadata:
  tags: [<action|feedback|form|disclosure|overlay|navigation|layout>]
  since: <version>
  status: {status: draft}

sections:
  - kind: guidelines
    for: all
    framing: when-to-use
    items:
      - level: should
        statement: <when this component is the right choice>
  - kind: guidelines
    for: all
    items:
      - level: must
        statement: <a rule for using it correctly>
        checkedBy: manual

sourceFiles:
  - platform: <react|web-component|...>
    file: <path to the real source file>

imports:
  - platform: <react|web-component|...>
    code: <import statement, written out>
    package: <package name>
```

## Sections to Include (Components)

Include at minimum: a `guidelines` section (`framing: how-to-use`, the default) covering usage rules and accessibility requirements. Add `traits` (top-level, not a section) for variants/states, a `guidelines` section with `framing: when-to-use` for fit judgments, and a `definitions` section for props/anatomy only when there's no real source file to point `sourceFiles` at instead. Add a `for: agent` section for firm rules an agent needs but a person wouldn't.

## Extraction Guidelines

- **From code**: Point `sourceFiles` at the real file instead of hand-typing props — that's the whole point of the field. Map variant/state props → `traits`, each tagged `traitType: variant` or `traitType: state`, with `kind: enum` or `kind: boolean` for the form its value takes. Map CSS parts or named sub-elements → a `definitions` section titled "Anatomy".
- **From Figma**: Map component properties → `traits`, layer structure → a `definitions` section, variable bindings → token `refs`.
- **From requirements**: Map acceptance criteria → `guidelines` items (`level` from RFC 2119: `must`/`should`/`should-not`/`must-not`/`may`), interaction requirements → a `definitions` section titled "Keyboard interactions" (term = key, definition = action).

## Schema References

When unsure about fields or required properties, consult:

- **Bundled schema**: `https://designsystemdocspec.org/v0.21.0/dsds.bundled.schema.json` (or `node_modules/design-system-documentation-schema/schema/dsds.bundled.schema.json` if DSDS is installed as a dependency)
- **One entry kind's fields**: `/schema/entries-<kind>.md` on this site — a few KB of field
  names, types, requiredness and descriptions for that kind alone, in the order the schema
  declares them. Prefer it over the whole bundle when you need one shape:
  [entries-component.md](https://designsystemdocspec.org/schema/entries-component.md).
- **One section kind's fields**: `/schema/sections-<kind>.md` — for example
  [sections-guidelines.md](https://designsystemdocspec.org/schema/sections-guidelines.md).
- **The same content for a human reader**: one Schema page anchor per definition, such as
  [/schema#entries-component](https://designsystemdocspec.org/schema#entries-component).
- **Quick start examples**: https://designsystemdocspec.org/quickstart

## Gotchas

- `id` must match the filename (e.g. `checkbox` → `checkbox.dsds.yaml`).
- A component's `sourceFiles`, `imports`, `traits`, and `combos` are top-level fields on the entry, never inside a section.
- Use RFC 2119 levels in guidelines: `must`, `should`, `should-not`, `must-not`, `may`.
- `metadata.status` is always an object (`{status: "draft"}`), never a bare string.
