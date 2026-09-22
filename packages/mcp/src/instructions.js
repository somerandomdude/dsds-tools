// Agent instructions — the "how to use this design system" briefing.
//
// The MCP server hands this to the client as its server instructions; the CLI
// prints it with `dsds instructions` so a shell-only agent can read the same
// briefing an MCP client gets for free. One source, so the two surfaces cannot
// teach different workflows.

import { BUNDLED_VERSION } from './spec/version.js';
import { renderIntroBlock } from './intro.js';
import { MCP_SCHEMA_POINTER } from './setup-guidance.js';

// Recommendations 1, 3 and 4 of the prompt-size review, applied:
//
//   1. The tool catalog is gone. It listed all 29 tools in prose — 1,264 of
//      this block's 1,855 tokens, 68% — while the MCP client already receives
//      every tool's name, description and inputSchema separately (6,101
//      tokens of it). It was a second copy of a payload the reader has, and
//      the copy went stale independently: it still routed authoring through
//      blocks. Anything a tool needs to say about itself belongs in its own
//      `description`, where it cannot drift from the schema beside it.
//
//   3. Rules stated here AND in BUILD_BRIEF now live in one place each. The
//      lookup rule stays here, in the cached prefix, because it is the
//      most-obeyed instruction measured (7.31 lookups/iteration) and 24% of
//      runs never call the brief. The setup *procedure* moves to the brief;
//      what stays here is the fact that makes it urgent.
//
//   4. Corrections: the wizard is an option, not "the required way" (0.02
//      calls/iteration says the corpus never believed it), and nothing here
//      points at a block name that no longer resolves.
//
// Kept deliberately: the HARD RULE's length. At 109 tokens it drives the
// 7.31 lookups; shortening it is cheap, weakening it is not, and the
// difference is easy to confuse.

export const BASE_INSTRUCTIONS = `
DSDS MCP — Design System Documentation Spec v${BUNDLED_VERSION}

HARD RULE — before using ANY component from this design system in code, you MUST call
dsds_get_agent_context(identifier) for it. This applies even if you already called
dsds_context_brief this session, even for a component you are confident about, and even
for one you already used earlier in the same file or a chunk. Skipping this check for
even one component is the single most common cause of avoidable build failures — do not
rely on general training knowledge for this design system's API surface.

SETUP FIRST — this design system needs one-time project setup before ANY component renders
correctly: a stylesheet import, a theme provider, a polyfill, a build plugin. It is in no
component's documentation, and missing it fails silently — the page renders, nothing throws,
and you ship an unstyled app that passes every check. Read this system's getting-started or
installation entry before your first component. Recognising the library is not a substitute:
setup differs between major versions of the same one.

WORK WITHIN THE SYSTEM'S OPINIONS — build inside the constraints, not around them. Use the prop
a component gives you even when it is coarser than what you had in mind: Card takes density
(compact, regular, loose) and has no padding, gap or radius prop — that is the whole of its
spacing surface. A missing knob is a decision, not a gap. Never restyle a component with
style={{ … }}, a className, or a CSS variable override to reach a particular look; reach for a
different component or accept the nearest value the system offers.

START HERE — call dsds_context_brief before any work begins:
- useCase="build" — implementing UI with the design system.
- useCase="author" — documenting a design system in DSDS format.
- useCase="ask" — answering a question about using it (search → dsds_get_agent_context →
  a grounded, cited answer; produces an answer, not code).

FINDING THE TOOLS — every tool publishes its own description and arguments; read those rather
than expecting a catalog here (in a shell, \`dsds --help\` lists the same surface as commands).
Three things a tool cannot tell you about itself:
- Spec tools (dsds_spec_entity_schema, dsds_validate, dsds_style_check) always work, with no
  configuration. Design system tools need DSDS_PATHS,
  lint tools need LINT_PLUGINS, and dsds_check_exports needs PACKAGE_EXPORT_PATHS. A tool whose
  configuration is missing returns setup instructions instead of failing.
- AUTHORING a DSDS document is not IMPLEMENTING a component. The spec tools produce
  documentation, never UI code. To build with a component that already exists, look it up with
  dsds_get_agent_context and write the JSX yourself; dsds_build_component is available if you
  want a prop-by-prop wizard instead.
- dsds_list_skills and dsds_get_skill carry the real authoring skills, bundled verbatim from the
  spec repo at v${BUNDLED_VERSION}. Read one before authoring a .dsds.yaml document.

Each entity is also available as a resource at dsds://entity/{identifier}.
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
/**
 * The research budget, added when an intro is inlined and RESEARCH_MODE is
 * `frugal`.
 *
 * Six attempts to close a token gap by relocating or expanding knowledge all
 * failed: lookups held at ~13 per iteration whether the inlined guide was
 * absent, partial, complete, repositioned to the top, or accompanied by an
 * explicit exemption. A prompt carrying the same knowledge ran at ~4.4. The
 * difference was not what the agent knew — that prompt capped tool spending
 * and the MCP's instructions did not.
 *
 * Knowledge tells an agent what is true. A budget tells it when to stop
 * asking. Only one of those bounds cost.
 */
const RESEARCH_BUDGET =
  '\n\nRESEARCH BUDGET — the guides above are already part of this prompt, so treat what they ' +
  "state about a component's API, prop value types, or import shape as verified and USE IT " +
  'DIRECTLY. Then spend the rest of your lookups deliberately:\n' +
  '- Look up ONLY components the guides above do not cover. Do not re-confirm what they state.\n' +
  '- Prefer dsds_get_document_block(identifier, "api") when you only need props. Reach for ' +
  'dsds_get_agent_context when you need the constraints and edge cases too — it returns far more.\n' +
  '- Around five lookups in total is enough for a whole application. Past that, stop researching ' +
  'and start emitting files. An unwritten file is worth less than a perfectly researched one.\n' +
  '- Batch your thinking, not your calls: decide everything you need to know, then fetch it.';

/** The server instruction text: base rules, feedback reminder, and any inlined intro. */
export function buildInstructions({
  introEntities = [],
  enableFeedback = true,
  introInline = true,
  researchMode = 'thorough',
} = {}) {
  const withPointer = `${BASE_INSTRUCTIONS}\n\n${MCP_SCHEMA_POINTER}`;
  const withFeedback = enableFeedback ? `${withPointer}\n\n${FEEDBACK_INSTRUCTION}` : withPointer;
  const base = withFeedback;
  const introBlock = renderIntroBlock(introEntities, { inline: introInline });
  if (!introBlock) return base;

  // An inlined guide goes BEFORE the tool catalog. Hosts append server
  // instructions to their own system prompt, so this block already starts
  // partway down; putting a ~6k-character catalog ahead of the guide buried it
  // under a HARD RULE telling the agent to look every component up. Measured
  // on the agent-tester: the guide in that position gave 12.8
  // dsds_get_agent_context calls per iteration — the same as no guide at all —
  // against 3.8 with the content at the top. Content after the catalog did not
  // change behaviour; content before it did.
  //
  // A compact index is the opposite: a pointer, not content, so it belongs
  // after the catalog that explains how to follow it.
  if (!introInline) return `${base}\n\n${introBlock}`;
  const budget = researchMode === 'frugal' ? RESEARCH_BUDGET : '';
  return `${introBlock}${budget}\n\n${base}`;
}
