# Plan 005: Reframe the local-model product proposal

> **Status:** Draft proposal for review
>
> This document describes the next experiment. It is not an implementation
> checklist and does not authorize new runtime code, CLI commands, or changes
> to the consumer project.

## Summary

The DSDS foundation and the first local-model evaluation are working. The next
useful question is not whether `dsds-tools` can retrieve component facts. It is
whether a local model can use grounded DSDS context to select and compose
documented components into a useful layout or prototype without inventing
components, APIs, or design-system rules.

This proposal keeps the existing `dsds` CLI and MCP as the context layer. It
proposes one small, reviewable experiment in a disposable sandbox before any
public local-generation command, model training, or autonomous consumer edits
are considered.

## What is already proven

### DSDS Site Kit and documentation site

- A Web Component-based Site Kit has been built.
- A working documentation site uses those components.
- The site is a real consumer corpus for testing DSDS tooling.
- The corpus documents 24 components across 25 DSDS documents.
- The documents include component examples, API details, imports,
  accessibility guidance, and usage guidance.

### DSDS and Web Component contract

- Web Component APIs are documented in DSDS.
- An authoring skill describes how to keep source and DSDS documentation
  synchronized.
- A source-to-document contract test checks that relationship.
- The documentation site is the first concrete implementation target for
  future prototype generation.

### CLI and MCP integration

- The consumer project has a `dsds.config.mjs` configuration.
- `dsds-tools` is connected to the real DSDS documentation corpus.
- `doctor`, `list`, `search`, `get`, and `context` have been verified.
- The component corpus loads and validates through the existing CLI and MCP.

### Local-model evaluation

PR #2 merged the local evaluation harness. The formal Qwen benchmark showed:

- 21 of 24 supported checks passed.
- 9 of 9 unsupported requests correctly abstained.
- 90% weighted score.
- Median response time of approximately five seconds.

This proves bounded fact retrieval and honest abstention. It does not prove
layout composition or code generation.

## The remaining product question

> Can a local model use DSDS context to select and compose documented
> components into a useful layout or prototype without inventing components,
> APIs, or design-system rules?

This is a different question from whether the CLI or MCP already works. Those
systems provide structured context; the experiment evaluates what a local
model can responsibly do with that context.

## Recommended MVP

Test one small, reviewable layout story. Start with a structured layout plan;
make prototype Web Component code optional or a second step after the plan is
reviewed.

The model should receive:

- documented components and APIs;
- relevant DSDS usage guidance;
- available imports and custom-element tags;
- accessibility requirements;
- existing layout or composition guidance, when documented; and
- a small number of approved examples.

The model should return:

1. a structured layout plan;
2. the DSDS evidence used for each component choice;
3. optional prototype Web Component code;
4. assumptions or missing information; and
5. an explicit `insufficient evidence` response when the corpus does not
   support the request.

Generated code, if included, must remain in a disposable sandbox. It must not
be written into `dsdsds` automatically or treated as production code.

## What the experiment needs to learn

The experiment should distinguish among these failure modes:

- insufficient component or composition documentation;
- poor task-specific evidence selection;
- model reasoning or prompt limitations;
- invalid or unsafe generated code; and
- gaps in deterministic validation or human review.

The first result should be judged on grounded component selection and
composition before code aesthetics. A useful plan with clear evidence is a
valuable result even when the optional prototype needs revision.

## FAQ

### Doesn’t this already work?

The CLI and MCP already work as context tools. The local-model evaluation also
works for narrow questions about documented components.

What has not been tested is whether the model can combine several documented
components into a useful layout without making up APIs or design guidance.

### Are we building a new retrieval system?

No. The existing `dsds` CLI and MCP remain the context layer.

The experiment should use task-specific DSDS evidence instead of introducing a
new vector database or retrieval system.

### Are we training a local model?

Not for the MVP.

First test an existing model with structured context, clear instructions, and
approved examples. Fine-tuning should only be considered if repeated
evaluation shows that context and prompting are not enough.

### How would the model learn to build layouts?

It needs more than individual component API descriptions. It also needs
composition guidance:

- which components work together;
- which components should not be combined;
- page and section structures;
- responsive behavior;
- token and spacing guidance;
- accessibility rules; and
- examples of approved compositions.

This may require better DSDS documentation before it requires model training.

### What should the model produce?

The first output should be a layout plan with evidence. Prototype code can
follow as a second step.

This lets us evaluate whether the model chose the right components before
judging the code.

### Why use the documentation site?

The docs site is a real DSDS consumer and gives us a concrete implementation
target. It also provides a controlled Web Component environment where
generated prototypes can be reviewed against known conventions.

### Does Web Components support this experiment?

Yes. Web Components are the first implementation target because the Site Kit
already uses them and their custom-element APIs are explicit.

The model needs documentation for tags, attributes, properties, slots, events,
CSS parts, imports, and accessibility behavior.

### What is still missing from the DSDS corpus?

The current corpus is strongest for components. Layout generation may also
need:

- patterns;
- foundations;
- token groups;
- chunks;
- responsive layout guidance; and
- multi-component examples.

The experiment should identify which of these are truly necessary instead of
assuming the model needs all eight DSDS entity types immediately.

### What does the local model do versus the schema?

The schema defines the documented knowledge. The CLI and MCP retrieve it. The
local model reasons over that context. The evaluator checks whether the model
stayed grounded and produced a valid result.

The model is not the source of truth.

### What is out of scope?

- fine-tuning or LoRA;
- bundling model weights;
- a public `dsds generate-local` command;
- a new vector store;
- direct MCP tool calls from Ollama;
- autonomous edits to `dsdsds`;
- production-ready code generation;
- supporting every DSDS entity type; and
- automatically changing the shared build brief.

## Decisions requested from PJ

1. Is the next useful proof a layout plan, a disposable code prototype, or
   both?
2. Should the first experiment use one existing component, such as Button, or
   a small multi-component docs layout?
3. Should the model output code at all in the MVP, or should it first produce a
   structured plan?
4. Which missing DSDS content matters most for layout generation?
5. Should Plan 005 remain a Button authoring experiment, or become a broader
   layout-composition experiment?
6. Should the focused-corpus behavior from PR #1 be handled separately through
   configuration?

## Scope boundaries

This proposal does not include:

- implementation code or model runtime code;
- new CLI commands or a public local-generation API;
- changes to `dsds-tools` CLI or MCP behavior;
- changes to the `dsdsds` consumer or its components;
- fine-tuning, LoRA, embeddings, or a vector store;
- direct MCP tool calling from Ollama; or
- automatic writes to the consumer repository.

Any future prototype must use the existing CLI/MCP context layer, save the
model response before materialization, keep generated files in a disposable
workspace, and separate deterministic checks from human review.

## Async working notes

### 2026-07-27 — Reframed the next experiment around layout composition

**Decision**

Treat bounded retrieval and abstention as proven; make grounded
multi-component composition the next product question.

**Changed**

Replaced the Button implementation checklist with this product proposal,
including the evidence inventory, MVP boundary, FAQ, scope boundaries, and
questions for PJ.

**Verified**

The proposal reflects the merged local-model benchmark, the existing DSDS
consumer corpus, and the CLI/MCP capabilities recorded in Plans 003 and 004.

**Next**

Agree on the first composition story and whether the MVP should stop at a
structured plan.

**Question for PJ**

Should the first proof target a multi-component documentation layout, or keep
the smaller Button story as the initial controlled case?
