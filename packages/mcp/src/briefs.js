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
// -----------------------------------------------------------------------------

export const BUILD_BRIEF = `
## Before you build: Design System Context Briefing

Do not write implementation code until you have completed every step below.
Each step uses a tool from this MCP server — call them in order.

---

### Step 1 — Inventory what exists

Call \`dsds_list_entities\` to see every documented entity grouped by kind.

Before continuing, note:
- Any entity marked **deprecated** must not be used. Check for alternatives.
- Any entity marked **experimental** or **draft** should be used with caution.

---

### Step 2 — Find what you need

Call \`dsds_search_entities\` to narrow to the entities relevant to your task.
Filter by \`kind\`, \`status\`, \`tags\`, or a keyword \`query\`.

If you are unsure what exists, search broadly first, then narrow.

---

### Step 3 — Check for applicable patterns

Call \`dsds_search_entities\` with \`kind=pattern\` to find patterns that may already document the layout or interaction flow you are about to build.

If a pattern matches your task, read it with \`dsds_get_entity\` before composing anything from primitives. A documented pattern tells you the correct component combinations, required props, and rules the design system team has already worked out.

---

### Step 4 — Read the documentation for every entity you plan to use

Use the following lookup order — stop as soon as you have what you need:

1. **\`dsds_get_agent_context(identifier)\`** — start here for every component.
   Returns the agent-optimized view: generation rules, anti-patterns, prop table, use-case
   disambiguation, and all guidelines. This is the primary lookup for building.

2. **\`dsds_get_document_block(identifier, blockType)\`** — use when you need one specific
   section that \`dsds_get_agent_context\` did not cover (e.g. \`accessibility\` for WCAG
   details, \`variants\` for the full option matrix, \`states\` for interaction behaviour).
   Faster and cheaper than fetching the whole entity.

3. **\`dsds_build_component(step:"start", identifier)\`** — ALWAYS USE when you're ready to
add a component to code. This is the required way of adding components.

4. **\`dsds_get_entity(identifier)\`** — use only when you need the raw, complete entity
   including all blocks in their original JSON structure. Prefer the two calls above.

---

### Step 5 — Use tokens, not hardcoded values

Call \`dsds_search_entities\` with \`kind=token-group\` to find the design token
scales that apply to your work (spacing, radius, typography, and the rest). Open
a group with \`dsds_get_entity\` to see its individual tokens.

Never hardcode color values, spacing, or type sizes. Always reference the
token identifier from the design system.

---

### Step 6 — Check for an applicable chunk

Call \`dsds_search_entities\` with \`kind=chunk\` to find pre-assembled code that may cover your use case.

If a chunk matches, call \`dsds_get_chunk(identifier)\` to retrieve the full code and its guidelines. Chunks are production-ready compositions — copy the code directly rather than assembling the same pattern from scratch.

---

### Step 7 — Verify every import before you write it (required)

If \`dsds_check_exports\` is available, make ONE call with **every** component and icon
name you intend to import — across all packages — in a single \`components\` array,
BEFORE emitting any code. This is not optional: it is the one cheap check that
catches the most common build-breakers.

- It catches hallucinated names before they become \`TS2305\`/\`TS2724\` errors —
  e.g. \`ThemeProvider\`, \`RootTheme\`, or \`createTheme\` imported from the design
  system package when they are not exported, or \`SettingsIcon\` instead of \`CogIcon\`.
- Include every icon name; icons are the top hallucination risk.
- One call covers all configured packages — there is no \`package\` argument.
- Do NOT import a name the check reports as missing. Find the real export (search
  the docs) or drop it.

Note: this verifies export **names**, not package **versions**. Write the
dependency versions exactly as instructed — do not invent a package or a version
range (e.g. a non-existent \`@sanity/ui@^4.0.0\`).

---

Only after completing these steps should you write code.

---

### Step 8 — Validate and repair before you finish (required)

Writing the code is not the end. Before you consider the work done, run an
ordered, repeating check and fix what it finds — do not skip a stage and do not
stop at the first green light:

1. **Lint.** Call \`dsds_lint_by_path\` with every file you wrote (use the \`files\` array of \`{ path }\`). Apply the corrected code it returns, then resolve any remaining violations it reports. (If a file is not yet on disk, use \`dsds_lint_inline\` with its source — but neither tool saves files; a clean result never means a file was written.) Lint is not optional or advisory — design-system rules only fire on real JSX, so lint your final component code, not a stub.
2. **Build / render.** Make sure the app actually mounts and renders without console or runtime errors. A file that type-checks but throws on render has not passed.
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
## Before you author: DSDS Documentation Briefing

Do not start writing documentation until you have completed every step below.
Each step uses a tool from this MCP server — call them in order.

---

### Step 1 — Understand the spec

Call \`dsds_spec_overview\` to understand what DSDS is, what entity types it
defines, and how it is structured. Read the full output before continuing.

---

### Step 2 — Choose the right entity type

Identify which entity kind matches what you are documenting:

| Kind | Use when... |
|------|-------------|
| \`component\` | A reusable UI element (Button, Modal, Input, Card) |
| \`guide\` | Long-form documentation: getting-started, tutorials, concepts, contribution docs |
| \`pattern\` | A multi-component solution for a user need (empty state, error messaging) |
| \`foundation\` | A visual domain with rules and a scale (color system, type scale, spacing, motion) |
| \`theme\` | A set of token overrides for a specific context (dark, high-contrast) |
| \`token\` | An individual design value (a color, a spacing step, a duration) |
| \`token-group\` | A named collection of related tokens (color-text, spacing-scale) |

Call \`dsds_spec_entity_schema(kind)\` to see every field available for your
chosen kind, which are required, and what metadata you can provide.

---

### Step 3 — Generate a starter template

Call \`dsds_spec_scaffold(kind)\` to get a minimal valid DSDS JSON template.

If you are documenting a full design system with multiple entities, use
\`dsds_spec_scaffold('system')\` to get a multi-entity document structure.

---

### Step 4 — Plan your document blocks

Call \`dsds_spec_document_blocks(kind)\` to see which block types are valid for
your entity and what each one captures.

Prioritize the blocks that answer the questions engineers ask most:

1. **\`useCases\`** — when should I use this, and when should I not?
2. **\`api\`** — what properties, events, and slots does this expose?
3. **\`guidelines\`** — what rules must I follow when using this?
4. **\`accessibility\`** — what are the WCAG requirements and keyboard behaviors?
5. **\`variants\`** — what option axes exist?
6. **\`imports\`** — how do I import and use this in code?

---

### Step 5 — Validate as you go

After completing each section, call \`dsds_validate\` with your current JSON.
Do not wait until the end — fix errors incrementally.

---

### Step 6 — Add agent-only documentation

Once the core documentation is written, add an \`agentDocumentBlocks\` array to
the entity. It accepts the same document block kinds as \`documentBlocks\`, but
is intended for agent (AI/LLM) consumption only — tools never render it for
humans. Use it for guidance that would be noise for human readers:

- A **\`guidelines\`** block with generation constraints (\`level\`: MUST/MUST_NOT,
  optional \`evidence\` from test runs, \`criteria\` agents can self-check against)
- A **\`useCases\`** block disambiguating this entity from confusable ones
  (discouraged items with an \`alternative\`)
- A **\`sections\`** block with ready-to-use code examples

This step significantly improves agent behavior when building with the system.
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
\`dsds_get_alternatives(identifier)\` to recommend the right entity and name what
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
