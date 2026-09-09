# Plan 006 / Story 006.2 — v0.20 settings corpus

Date: 2026-09-09

## Result

Story 006.2 is complete. The consumer corpus is committed in `dsdsds` as
`45e30c4` (`docs: add v0.20 settings corpus`) on branch
`codex/006-v020-settings-corpus`.

The change preserves the existing v0.15 corpus and adds a dedicated v0.20
manifest selected by `dsds.v020.config.mjs`. It contains seven graph entries:

- the DSDS Site Kit system;
- Button, Text Input, and Checkbox component contracts;
- Site Layout Tokens guidance backed by the existing CSS source;
- Action Group and Account Settings compositions.

The project Web Components authoring skill now maps contracts to v0.20
`sourceFiles`, `imports`, `traits`, `combos`, audience-scoped `sections`, and
`refs`. It explicitly rejects the obsolete v0.15 `api` mapping. Because no
Custom Elements Manifest exists yet, exact tag, attribute, slot, CSS-part, and
current host-API facts are temporarily carried in a generic section with the
namespaced `dsds.web-component-api` context.

## Verification

From the `dsdsds` checkout:

```sh
node ../dsds-tools/packages/cli/src/index.js doctor --config dsds.v020.config.mjs
npm test
node ../dsds-tools/packages/cli/src/index.js context button --config dsds.v020.config.mjs --json
node ../dsds-tools/packages/cli/src/index.js context text-input --config dsds.v020.config.mjs --json
node ../dsds-tools/packages/cli/src/index.js context checkbox --config dsds.v020.config.mjs --json
node ../dsds-tools/packages/cli/src/index.js context account-settings --config dsds.v020.config.mjs --json
node ../dsds-tools/packages/cli/src/index.js deps account-settings --config dsds.v020.config.mjs --json
```

Observed results:

- `doctor` passed: seven entities, v0.20.0 alignment, no unresolved targets,
  no cycles, and no brief-kind gaps.
- The existing consumer suite passed: four tests, zero failures.
- Standalone validation passed for every authored YAML file. A standalone
  entry reports expected DSDS-08 warnings for references owned by sibling
  files; the configured `doctor` graph resolves all of them.
- Agent context includes exact package imports, custom-element tags, slots,
  traits, supporting examples, composition relationships, layout variables,
  and Save/Cancel semantics.
- Account Settings dependencies resolve to Text Input, Checkbox, Action Group,
  and Site Layout Tokens.

The skill creator's Python validator could not import PyYAML in either system
Python environment. Equivalent frontmatter, naming, allowed-key, description,
and unfinished-placeholder checks passed using the already-installed `js-yaml`
dependency. This is an environment limitation, not a skill-content failure.

## Boundary recorded for Story 006.3

At the time of this corpus commit, the source audit found no host-level live
`value` property on Text Input and no host-level live `checked` property on
Checkbox. Neither component declared custom events or form-associated
custom-element behavior. Story 006.3 subsequently added the smallest live-state
and forwarded-event contract; the components remain non-form-associated.

No component implementation changed in Story 006.2, no complete settings page
was supplied, and Qwen was not invoked. Story 006.3 owns the component contract;
Story 006.4 is the first story allowed to ask Qwen to generate the page.
