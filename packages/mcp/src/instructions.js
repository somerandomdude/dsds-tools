// Agent instructions — the "how to use this design system" briefing.
//
// The MCP server hands this to the client as its server instructions; the CLI
// prints it with `dsds instructions` so a shell-only agent can read the same
// briefing an MCP client gets for free. One source, so the two surfaces cannot
// teach different workflows.

import { BUNDLED_VERSION } from './spec/version.js';
import { renderIntroBlock } from './intro.js';

export const BASE_INSTRUCTIONS = `
DSDS MCP — Design System Documentation Spec v${BUNDLED_VERSION}

HARD RULE — before using ANY component from this design system in code, you MUST call
dsds_get_agent_context(identifier) for it, or at minimum dsds_get_document_block(identifier, "api").
This applies even if you already called dsds_context_brief this session, even for a component
you are confident about, and even for one you already used earlier in the same file or a chunk.
Skipping this check for even one component is the single most common cause of avoidable build
failures — do not rely on general training knowledge for this design system's API surface.

START HERE: Call dsds_context_brief first to get a full briefing before any work begins.
- dsds_context_brief(useCase="build") — before implementing UI with the design system. To implement an existing component interactively, use dsds_build_component (a prop-by-prop wizard, listed under DESIGN SYSTEM TOOLS); for one-shot context use dsds_get_chunk / dsds_get_entity / dsds_get_agent_context.
- dsds_context_brief(useCase="author") — before documenting a design system in DSDS format
- dsds_context_brief(useCase="ask") — before answering a question about how to use the design system (a retrieval-and-answer loop: search → get_agent_context → grounded, cited answer; produces an answer, not code)

SPEC TOOLS — for authoring DSDS-compliant documentation (always available, no configuration needed):
- dsds_spec_overview → dsds_spec_entity_schema → dsds_spec_scaffold → dsds_spec_document_blocks → dsds_validate
- AUTHORING (writing new DSDS docs) is distinct from IMPLEMENTING (building UI from a component that already exists). These spec tools produce DSDS documentation JSON, never UI/React code. To implement an existing component, use dsds_build_component (DESIGN SYSTEM TOOLS below) instead.
- Authoring a COMPONENT document? Two paths: dsds_author_component_doc is a guided, step-by-step wizard (start with step:"start", no data) that produces a DSDS component-documentation *document* (a JSON entity) from scratch — it supplies valid field values at each step and needs no schema knowledge. dsds_spec_scaffold(kind:"component") gives a blank template to fill in yourself when you already know the schema. For any other entity kind (token, theme, foundation, pattern, guide, chunk) or a multi-entity system, use dsds_spec_scaffold.

DESIGN SYSTEM TOOLS — for querying an existing DSDS document (requires DSDS_PATHS to be configured):
- dsds_list_entities → dsds_search_entities → dsds_get_entity or dsds_get_document_block
- dsds_get_agent_context(identifier) — get LLM-optimized rules and constraints for a specific entity
- dsds_get_chunk(identifier) — get a pre-assembled code chunk for a common use case, along with its guidelines and use cases rendered for agent use
- dsds_build_component(step:"start", identifier:"button") — interactive wizard that walks an existing component's props one at a time, offering only each prop's valid options as Q&A, then returns the composed JSX in result.code

RELATIONSHIP GRAPH — typed dependency edges between entities (composes, depends-on, part-of, alternative-to, replaces, extends), with inverse edges derived automatically:
- dsds_impact(identifier) — blast radius: what breaks if you change/remove this entity (direct + transitive dependents, required edges flagged). Start here before changing a shared token or component.
- dsds_get_dependents(identifier, { relation?, transitive? }) — what points AT this entity.
- dsds_get_dependencies(identifier, { relation?, transitive? }) — what this entity needs / is built from.
- dsds_get_alternatives(identifier) — interchangeable options and replacements; surfaces deprecations.

RESOURCES: Each design system entity is also available as a resource at dsds://entity/{identifier}.

Note: If DSDS_PATHS is not set, design system tools will return setup instructions. Spec tools always work.

LINT TOOLS — for linting code against configured ESLint plugins (requires LINT_PLUGINS to be configured). Neither tool saves, creates, or modifies files:
- dsds_lint_by_path(files=[{path}]) — PREFERRED. Lint files already written to disk, by path. Reads from disk; a missing path errors (it never creates the file). Lint every .tsx/.ts file you wrote in one call.
- dsds_lint_inline(code, filename?) — lint a source string in memory (read-only, nothing persisted). Use only when the file is not yet on disk; prefer dsds_lint_by_path once it is.
- Passing source to a lint tool does NOT save it. A "clean" lint result never means a file was written.

EXPORT CHECK — before importing a component, confirm it exists in the package (requires PACKAGE_EXPORT_PATHS):
- dsds_check_exports(components=["Box", "TextInput"]) — verify each name is actually exported. Read-only: does NOT modify packages or install anything.

ERROR EXPLAINER — always available, no configuration needed:
- dsds_explain_error(error) — paste a raw TypeScript/build error and get an actionable fix hint instead of re-guessing from the raw compiler output. Call this reactively the moment a build or typecheck fails. Matches generic patterns (invalid prop, missing required prop, boolean given a string, number given where a CSS string is expected, implicit any, editing scaffold config files) — it does not know this project's specific components, so still cross-check dsds_get_agent_context for the actual fix.

SKILLS — real DSDS 0.20.0 authoring skills, bundled verbatim from the spec repo's own 0.20.0 branch (not generated from this server's own knowledge):
- dsds_list_skills() — see what's available (dsds-specs, dsds-add, dsds-update, dsds-validate) before authoring or editing a .dsds.yaml document.
- dsds_get_skill(id) — read one in full. Start here before authoring against real 0.20.0, instead of dsds_context_brief(useCase="author")'s legacy 0.15.2 guidance.
`.trim();

// Appended to the instructions only when the feedback tool is enabled.
export const FEEDBACK_INSTRUCTION =
  'FEEDBACK: Before you finish your session, call dsds_feedback to rate the experience (1–5) and note ' +
  'what was helpful or confusing. Call it as your last tool call — before emitting any final output or ' +
  'files. This is required at the end of every session.';

/**
 * Assemble the full agent instructions: the base briefing, the feedback
 * reminder when the feedback tool is enabled, and the intro entities
 * (rendered in full, or as a one-line index when `introInline` is false).
 *
 * @param {object} [options]
 * @param {Array} [options.introEntities]
 * @param {boolean} [options.enableFeedback]
 * @param {boolean} [options.introInline]
 * @returns {string}
 */
export function buildInstructions({ introEntities = [], enableFeedback = true, introInline = true } = {}) {
  const base = enableFeedback ? `${BASE_INSTRUCTIONS}\n\n${FEEDBACK_INSTRUCTION}` : BASE_INSTRUCTIONS;
  const introBlock = renderIntroBlock(introEntities, { inline: introInline });
  return introBlock ? `${base}\n\n${introBlock}` : base;
}
