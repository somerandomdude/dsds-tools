// =============================================================================
// src/briefs.js
//
// Edit this file to customize the context briefs shown to agents before they
// start work. Markdown is supported throughout. The briefs appear in two
// places: the dsds_context_brief tool and the MCP prompt slash commands.
//
// BUILD_BRIEF   — shown before implementing UI with the design system
// AUTHOR_BRIEF  — shown before documenting a design system in DSDS format
// ASK_BRIEF     — shown before answering a question about using the design system
// PROMPT_META   — titles and descriptions shown in MCP client UIs
// =============================================================================


// -----------------------------------------------------------------------------
// BUILD BRIEF
// Shown to agents before they write any code that uses the design system.
// Edit this to reflect what engineers most commonly get wrong, what tokens
// or patterns are easy to miss, and what non-obvious rules must be followed.
//
// This is a tool RESULT, not part of the cached prefix: every token here is
// paid at full rate, once per iteration, in 76% of runs. That is why it was
// cut from 1,718 tokens to ~1,250 — the three changes, from the prompt-size
// review:
//
//   2. Old steps 1, 2, 3, 5 and 6 were five ways of saying "find what exists
//      first", and between them they instructed `dsds_list_entities` four
//      separate times. Measured across 1,565 ui5 iterations, that produced
//      0.46 calls to it per iteration — the repetition bought nothing. They
//      are now one step that names the tool once and keeps all four rules
//      (deprecated, patterns, chunks, tokens), since those are distinct even
//      when the calls collapse.
//
//   3. The lookup rule and the setup fact were each stated here AND in
//      BASE_INSTRUCTIONS. The setup *procedure* stays here, where it is
//      actionable; the lookup rule keeps its full weight here because this is
//      the document an agent reads immediately before writing JSX.
//
//   4. Two corrections. The old step 4 sent agents to
//      `dsds_get_document_block(identifier, "variants")` and `"states"` —
//      0.15.2 block names that return "has no variants section or block" on a
//      0.20.x corpus, so the instruction bought a failed call and a retry.
//      option rather than "ALWAYS USE… the required way of adding
//      components": at 0.02 calls per iteration no agent believed that, and a
//      false "required" costs credibility for the rules that are obeyed.
//
// Step 5's validate-and-repair loop is unchanged — the review flagged it as
// long, but shortening it was not part of what was approved.
// -----------------------------------------------------------------------------

export const BUILD_BRIEF = `
## Before you build

Five steps, in order. The first four happen before you write any implementation
code; the fifth is how you finish.

---

### 1 — Set the project up

This design system needs one-time setup before ANY component renders correctly: a
stylesheet import, a theme provider, a polyfill, a build plugin. It is in no
component's documentation, and missing it fails silently — the page renders, nothing
throws, and the result is an unstyled app that looks like a success.

1. Search for this system's guide category with \`dsds_search_entities\` (a legacy system
   names the kind plain "guide"; a 0.20.x system typically namespaces it, e.g.
   "sanity.guide").
2. Read its getting-started, installation or quick-start entry with \`dsds_get_agent_context\`.
3. Do every step it lists, in your entry file, before the first component.

Do not skip this because you recognise the library. Setup differs between major versions
of the same design system.

---

### 2 — Find what already exists

Call \`dsds_list_entities\` once to see everything documented, grouped by kind, then
\`dsds_search_entities\` to narrow to your task. Four rules follow from what you find:

- **A deprecated entity must not be used.** Read its Relationships in \`dsds_get_entity\` for the
  replacement. Treat experimental or draft as usable with caution.
- **A pattern beats primitives.** If a documented pattern covers your layout or flow,
  read it with \`dsds_get_entity\` before composing anything yourself — it carries the
  component combinations and rules the design system team already settled.
- **A chunk beats writing it again.** If a chunk covers your use case, fetch it with
  \`dsds_get_chunk\` and use its code directly. \`dsds_get_agent_context\` lists a component's
  chunks as an index, so you can pick one instead of reading all of them.
- **Never hardcode a colour, spacing value or type size.** Reference the token.

---

### 3 — Look up every component you are about to use (no exceptions)

MUST: call \`dsds_get_agent_context(identifier)\` for a component before you write a single
JSX usage of it — including one you are confident about, used earlier this session, or saw
inside a chunk. There is no "I already know this one" exception. Skipping it for even one
component is the single most common cause of otherwise-avoidable build failures: missing
required props, renamed or removed props, props typed \`never\`. This system's API often
differs from the conventional pattern, so training knowledge of similar libraries is not a
substitute.

That one call returns the generation rules, anti-patterns, prop table and guidelines. Two
narrower calls when you need less:

  The value set is closed, so anything outside it is invalid.
- \`dsds_get_document_block(identifier, blockType)\` — one section only, e.g. "api" for props
  or "accessibility" for WCAG detail.

\`dsds_build_component(step:"start", identifier)\` is available if you would rather answer a
prop-by-prop wizard than write the JSX yourself. It is an option, not a requirement.

---

### 4 — Verify every import before you write it

If \`dsds_check_exports\` is available, make ONE call listing **every** component and icon
name you intend to import, across all packages, before emitting any code. It is the
cheapest check that catches the most common build-breakers.

- It catches hallucinated names before they become \`TS2305\`/\`TS2724\` — \`ThemeProvider\`,
  \`RootTheme\` or \`createTheme\` imported when the package exports none of them, or
  \`SettingsIcon\` instead of \`CogIcon\`.
- Include every icon name; icons are the top hallucination risk.
- One call covers all configured packages — there is no \`package\` argument.
- Do NOT import a name it reports missing. Find the real export or drop it.

It verifies export **names**, not package **versions**. Write dependency versions exactly as
instructed; do not invent a package or a version range.

---

Only now write code.

---

### 5 — Validate and repair before you finish (required)

Writing the code is not the end. Before you consider the work done, run an
ordered, repeating check and fix what it finds — do not skip a stage and do not
stop at the first green light:

1. **Lint.** Call \`dsds_lint\` with every file you wrote (use the \`files\` array of \`{ path }\`). Apply the corrected code it returns, then resolve any remaining violations it reports. (If a file is not yet on disk, pass its source as \`code\` instead of \`path\` — either way nothing is saved; a clean result never means a file was written.) Lint is not optional or advisory — design-system rules only fire on real JSX, so lint your final component code, not a stub.
2. **Build / render.** Make sure the app actually mounts and renders without console or runtime errors. A file that type-checks but throws on render has not passed. The moment a build or typecheck fails, call \`dsds_explain_error(error)\` with the raw error text before attempting a fix — it names the shape of the mistake so you fix the actual cause instead of re-guessing from raw compiler output.
3. **Accessibility.** Resolve accessibility issues (labels, landmarks, alt text, ARIA, and color contrast) so the rendered UI is usable by assistive technology.

If a later stage forces a change, re-run from lint — a fix can reintroduce an
earlier problem. Treat this loop as part of building the component, not a
separate QA pass someone else will do.
`.trim();


// -----------------------------------------------------------------------------
// AUTHOR BRIEF
// Shown to agents and teams before they document a design system in DSDS format.
// Edit this to reflect the most common authoring mistakes, which blocks matter
// most, and any org-specific conventions for how you structure DSDS files.
// -----------------------------------------------------------------------------

export const AUTHOR_BRIEF = `
## Before you write: DSDS Authoring Briefing

You are authoring documentation in DSDS format — a structured YAML document,
not UI code and not prose. Work in this order.

---

### Step 1 — Learn the model

Call \`dsds_get_skill({ id: "dsds-specs" })\`. It covers the whole model: how a
document is composed, how \`refs\` resolve, what \`metadata\` carries, and how a
section is shaped. Read it before writing anything.

A document is one or more \`entries\`, each with \`sections\`. A component entry
also carries \`traits\` (its variants and states) and \`sourceFiles\`.

---

### Step 2 — Choose the entity kind

| Kind | Use when... |
|------|-------------|
| \`component\` | A reusable UI element (Button, Modal, Input, Card) |
| \`token\` | An individual design value (a color, a spacing step, a duration) |
| \`theme\` | A set of token overrides for a context (dark, high-contrast) |
| \`system\` | The document that composes a whole design system |
| \`entry\` | Anything else — a guide, pattern, or foundation. Namespaced custom kinds (\`sanity.guide\`) follow this shape. |

Call \`dsds_spec_entity_schema(kind)\` for every field that kind accepts, which
are required, and what each one holds. The field list comes from the schema
itself, so it is never out of date.

---

### Step 3 — Write the sections

Every item in \`sections\` carries a \`kind\`. Lead with the ones that answer what
engineers actually ask:

1. **\`guidelines\`** — the rules. Each item takes a \`level\`
   (\`must\`/\`must-not\`/\`should\`/\`should-not\`/\`may\`) and a \`statement\`.
   Set \`for: agent\` on an item that is noise for a human reader.
2. **\`definitions\`** — terms this entity introduces.
3. **\`steps\`** — an ordered procedure.
4. **\`section\`** — free-form prose for anything the three above do not fit.

Use \`framing: when-to-use\` for selection guidance and \`framing: how-to-use\`
for conformance rules. They are different questions and readers want them apart.

---

### Step 4 — Say things once

A rule that applies to more than one entity belongs in the shared pool, stated
once, referenced everywhere else:

\`\`\`yaml
- refs:
    - to: shared-foundations#never-disable-error
      rel: same-as
\`\`\`

An item that is nothing but a \`refs\` pointer needs no \`level\` or \`statement\`
of its own — it *is* the shared rule, and tools render it inline. Use
\`rel: refines\` instead when the local item narrows the shared one; then state
your own \`level\` and \`statement\` and the pointer rides along as provenance.

---

### Step 5 — Validate as you go

Call \`dsds_validate\` after each section, not at the end. Then
\`dsds_style_check\` once it validates — that covers field and item ordering,
which never affects validity but does affect whether the document reads well.
`.trim();


// -----------------------------------------------------------------------------
// ASK BRIEF
// Shown to agents before they answer a question about using the design system
// ("how do I…", "which component for…", "what are the rules for…"). This is a
// retrieval-and-answer loop, NOT a build loop: the goal is a correct, grounded,
// cited answer — not generated code. Edit this to reflect the questions your
// team is asked most and any house rules for how answers should be framed.
// -----------------------------------------------------------------------------

export const ASK_BRIEF = `
## Before you answer: Design System Q&A Briefing

You are answering a question about how to use this design system — not building
UI and not authoring documentation. Your answer must come from the design
system's own documentation, not from general knowledge or assumption.

Follow this retrieval-and-answer loop.

---

### Step 1 — Locate the relevant entities

Call \`dsds_search_entities\` to find the components, tokens, patterns, or guides
the question is about. Filter by \`kind\`, \`status\`, \`tags\`, or a keyword \`query\`.

Search is keyword-based, so the user's wording may not match the system's
vocabulary. If the first query returns nothing useful, try synonyms and the
underlying concept (e.g. a question about "spacing between items" maps to layout
components and the spacing \`token-group\`). If you still find nothing, say the
topic does not appear to be documented rather than guessing.

---

### Step 2 — Read the authored guidance

For each relevant entity, use this lookup order — stop as soon as you can answer:

1. **\`dsds_get_agent_context(identifier)\`** — start here. Returns the rules,
   anti-patterns, prop table, and use-case disambiguation. This answers most
   "how do I" and "what are the rules for" questions directly.
2. **\`dsds_get_document_block(identifier, blockType)\`** — for one specific
   section (e.g. \`accessibility\`, \`variants\`, \`useCases\`) when the agent context
   did not cover it.
3. **\`dsds_get_entity(identifier)\`** — only when you need the complete raw entity.

For "which should I use" questions, also check relationships and
the Relationships section of \`dsds_get_entity\` to recommend the right entity and name what
it replaces or is preferred over.

---

### Step 3 — Answer, grounded and cited

- Answer **only** from what the documentation says. If the docs are silent on
  part of the question, say so explicitly — do not fill the gap with assumption.
- **Cite the entity identifiers** you drew from (e.g. \`Use \\\`Stack\\\` (see
  \`stack\`)\`) so the answer is traceable.
- Respect lifecycle status: never recommend a **deprecated** entity without
  naming its replacement; flag **experimental** or **draft** entities as such.
- Prefer documented **patterns** and **chunks** over assembling primitives from
  scratch — if a pattern answers the question, point to it.
- If the user is clearly about to build, you may hand off: tell them to run
  \`dsds_context_brief(useCase="build")\` before writing code.

Keep the answer concise and specific to what was asked. A short, correct, cited
answer beats an exhaustive one.
`.trim();


// -----------------------------------------------------------------------------
// PROMPT_META
// Controls how prompts appear in MCP client UIs (Claude Desktop, Cursor, etc.)
// Edit the description and taskArgDescription to change what users see.
// Do not change the `name` fields without also updating server.js.
// -----------------------------------------------------------------------------

export const PROMPT_META = {
  build: {
    name: 'build-with-design-system',
    description: 'Get a full context briefing before implementing UI with this design system. Tells you exactly what to check before writing a single line of code.',
    taskArgDescription: 'What are you building? (e.g. "a login form", "a data table with sorting and pagination")',
  },
  author: {
    name: 'author-dsds-docs',
    description: 'Get a step-by-step briefing before documenting a design system in DSDS format. Covers entity types, required fields, and authoring workflow.',
    taskArgDescription: 'What are you documenting? (e.g. "a Button component", "our color token system", "the error messaging pattern")',
  },
  ask: {
    name: 'ask-design-system',
    description: 'Get a briefing before answering a question about how to use this design system. Covers how to find the right entities, read their authored guidance, and answer with grounded, cited information.',
    taskArgDescription: 'What is the question? (e.g. "how do I lay out a form?", "which component for a confirmation dialog?", "what are the spacing rules?")',
  },
};
