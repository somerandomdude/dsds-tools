import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createRequire } from 'node:module';
import { BUNDLED_VERSION } from './spec/version.js';

const pkg = createRequire(import.meta.url)('../package.json');
import { BUILD_BRIEF, AUTHOR_BRIEF, ASK_BRIEF, PROMPT_META } from './briefs.js';
import { listResources, readResource } from './resources.js';
import { writeLog } from './logger.js';

import { createToolRuntime } from './registry.js';
import { createGraphGetter } from './graph.js';

const BASE_INSTRUCTIONS = `
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
const FEEDBACK_INSTRUCTION =
  'FEEDBACK: Before you finish your session, call dsds_feedback to rate the experience (1–5) and note ' +
  'what was helpful or confusing. Call it as your last tool call — before emitting any final output or ' +
  'files. This is required at the end of every session.';

/**
 * Renders a DSDS entity to a markdown string suitable for agent instructions.
 * Handles section, steps, guideline, and purpose document blocks.
 */
function renderIntroEntity(entity) {
  if (!entity) return null;

  const lines = [];

  const name = entity.name ?? entity.identifier;
  lines.push(`---`, '', `## ${name}`, '');

  if (Array.isArray(entity.metadata)) {
    const desc = entity.metadata.find(m => m.kind === 'description');
    if (desc?.value) lines.push(desc.value, '');
  }

  if (entity.agents?.intent) {
    lines.push(entity.agents.intent, '');
  }

  for (const block of (entity.documentBlocks ?? [])) {
    if (block.kind === 'section') {
      for (const item of (block.items ?? [])) renderSectionItem(item, 3, lines);
    } else if (block.kind === 'steps') {
      if (block.title) lines.push(`### ${block.title}`, '');
      const ordered = block.ordered !== false;
      (block.items ?? []).forEach((step, i) => {
        lines.push(`${ordered ? `${i + 1}.` : '-'} **${step.title}**`);
        if (step.instruction) lines.push(`   ${step.instruction}`);
      });
      lines.push('');
    } else if (block.kind === 'guideline') {
      lines.push('### Guidelines', '');
      for (const item of (block.items ?? [])) {
        // 0.5+: item.level (MUST/MUST_NOT/SHOULD/SHOULD_NOT); fallback for pre-0.5 item.kind
        const level = item.level ?? (item.kind === 'required' ? 'MUST' : item.kind === 'prohibited' ? 'MUST_NOT' : null);
        const label = level === 'MUST' ? 'Must' : level === 'MUST_NOT' ? 'Must not' : level === 'SHOULD' ? 'Should' : level === 'SHOULD_NOT' ? 'Should not' : 'Note';
        const rationale = item.rationale ? ` — ${item.rationale}` : '';
        lines.push(`- **${label}:** ${item.guidance}${rationale}`);
      }
      lines.push('');
    } else if (block.kind === 'purpose') {
      const positive = (block.useCases ?? []).filter(u => u.stance === 'recommended' || u.kind === 'positive');
      const negative = (block.useCases ?? []).filter(u => u.stance === 'discouraged' || u.kind === 'negative');
      if (positive.length > 0) {
        lines.push('### When to use', '');
        for (const u of positive) lines.push(`- ${u.description}`);
        lines.push('');
      }
      if (negative.length > 0) {
        lines.push('### When not to use', '');
        for (const u of negative) lines.push(`- ${u.description}`);
        lines.push('');
      }
    }
  }

  // Render agentDocumentBlocks — these are the LLM-optimized rules and constraints.
  for (const block of (entity.agentDocumentBlocks ?? [])) {
    if (block.kind === 'guidelines') {
      lines.push('### Rules', '');
      for (const item of (block.items ?? [])) {
        const level = item.level ?? 'note';
        const label = level === 'must' ? 'Must' : level === 'must-not' ? 'Must not' : level === 'should' ? 'Should' : level === 'should-not' ? 'Should not' : 'Note';
        lines.push(`- **${label}:** ${item.guidance}`);
        if (item.rationale) lines.push(`  - ${item.rationale}`);
      }
      lines.push('');
    } else if (block.kind === 'sections') {
      for (const item of (block.items ?? [])) renderSectionItem(item, 3, lines);
    } else if (block.kind === 'useCases') {
      const positive = (block.items ?? []).filter(u => u.stance === 'recommended');
      const negative = (block.items ?? []).filter(u => u.stance === 'discouraged');
      if (positive.length > 0) {
        lines.push('### When to use', '');
        for (const u of positive) lines.push(`- ${u.description}`);
        lines.push('');
      }
      if (negative.length > 0) {
        lines.push('### When not to use', '');
        for (const u of negative) {
          let line = `- ${u.description}`;
          if (u.alternative?.identifier) line += ` → use \`${u.alternative.identifier}\` instead`;
          lines.push(line);
        }
        lines.push('');
      }
    }
  }

  if (Array.isArray(entity.agents?.constraints) && entity.agents.constraints.length > 0) {
    lines.push('### Rules', '');
    for (const c of entity.agents.constraints) {
      lines.push(`- **${c.level.toUpperCase()}:** ${c.rule}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderSectionItem(item, depth, lines) {
  lines.push(`${'#'.repeat(depth)} ${item.title}`, '');
  if (item.body) lines.push(item.body, '');
  for (const sub of (item.sections ?? [])) renderSectionItem(sub, depth + 1, lines);
}

// Compact alternative to inlining the full intro entities: a one-line index.
function renderIntroIndex(entities) {
  if (!entities.length) return null;
  const lines = ['---', '', '## Design system guides', '', 'Fetch full content with `dsds_get_entity(identifier)` when needed:', ''];
  for (const e of entities) {
    const name = e.name ?? e.identifier;
    const summary = introSummary(e);
    lines.push(`- **${name}** (\`${e.identifier}\`)${summary ? ` — ${summary}` : ''}`);
  }
  return lines.join('\n');
}

function introSummary(entity) {
  let s = '';
  if (Array.isArray(entity.metadata)) {
    const d = entity.metadata.find(m => m.kind === 'description');
    if (d?.value) s = d.value;
  }
  if (!s && typeof entity.description === 'string') s = entity.description;
  if (!s && entity.agents?.intent) s = entity.agents.intent;
  s = (s || '').split('\n')[0].trim();
  return s.length > 140 ? s.slice(0, 139) + '…' : s;
}

function promptMessage(text) {
  return { role: 'user', content: { type: 'text', text } };
}

export function createServer(getSystems, getSummaries, introEntities = [], getLintConfig = null, getExportPaths = null, feedbackDir = null, logsDir = null, enableFeedback = true, introInline = true) {
  const baseWithFeedback = enableFeedback
    ? `${BASE_INSTRUCTIONS}\n\n${FEEDBACK_INSTRUCTION}`
    : BASE_INSTRUCTIONS;
  // Inline (default): render each intro entity in full into the prompt. Compact:
  // inject a one-line index and let agents fetch full content via dsds_get_entity.
  let introBlock = null;
  if (introEntities.length > 0) {
    introBlock = introInline
      ? introEntities.map(renderIntroEntity).filter(Boolean).join('\n\n') || null
      : renderIntroIndex(introEntities);
  }
  const INSTRUCTIONS = introBlock
    ? `${baseWithFeedback}\n\n${introBlock}`
    : baseWithFeedback;

  // Lets get_entity reach intro entities (they live outside the queried systems),
  // so the compact-index pointer above resolves to real content on demand.
  const getIntro = () => introEntities;

  const getGraph = createGraphGetter(getSystems);

  const server = new Server(
    { name: 'dsds-mcp', version: pkg.version },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: INSTRUCTIONS }
  );

  // ── Tools ──────────────────────────────────────────────────────────────────
  // The tool catalog and dispatcher live in registry.js, shared with the dsds CLI.

  const { toolDefs, dispatch } = createToolRuntime({
    getSystems,
    getSummaries,
    getIntro,
    getGraph,
    getLintConfig,
    getExportPaths,
    feedbackDir,
    logsDir,
    enableFeedback,
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const startedAt = Date.now();

    const result = await dispatch(name, args);

    // Record every tool call (best-effort, fire-and-forget). Detailed entries
    // (chunk/lint) are still written separately by those handlers. On failure,
    // capture the error message so "why did X error?" is answerable from the log.
    const entry = { type: 'tool', tool: name, ok: !result.isError, durationMs: Date.now() - startedAt };
    if (result.isError) {
      const msg = result.content?.[0]?.text;
      if (msg) entry.error = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
    }
    writeLog(logsDir, entry);

    return result;
  });

  // ── Prompts ────────────────────────────────────────────────────────────────

  const prompts = [
    {
      name: PROMPT_META.build.name,
      description: PROMPT_META.build.description,
      arguments: [{ name: 'task', description: PROMPT_META.build.taskArgDescription, required: false }],
    },
    {
      name: PROMPT_META.author.name,
      description: PROMPT_META.author.description,
      arguments: [{ name: 'task', description: PROMPT_META.author.taskArgDescription, required: false }],
    },
    {
      name: PROMPT_META.ask.name,
      description: PROMPT_META.ask.description,
      arguments: [{ name: 'task', description: PROMPT_META.ask.taskArgDescription, required: false }],
    },
  ];

  if (introEntities.length > 0) {
    const introNames = introEntities.map(e => e.name ?? e.identifier).join(', ');
    prompts.push({
      name: 'dsds-intro',
      description: `${introNames} — retrieve the design system introduction${introEntities.length > 1 ? 's' : ''} loaded on server start.`,
      arguments: [],
    });
  }

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const task = args.task ?? null;

    if (name === PROMPT_META.build.name) {
      const lines = [];
      if (task) lines.push(`## Your task: ${task}`, '');
      lines.push(BUILD_BRIEF);
      return { messages: [promptMessage(lines.join('\n'))] };
    }

    if (name === PROMPT_META.author.name) {
      const lines = [];
      if (task) lines.push(`## Your task: ${task}`, '');
      lines.push(AUTHOR_BRIEF);
      return { messages: [promptMessage(lines.join('\n'))] };
    }

    if (name === PROMPT_META.ask.name) {
      const lines = [];
      if (task) lines.push(`## Your question: ${task}`, '');
      lines.push(ASK_BRIEF);
      return { messages: [promptMessage(lines.join('\n'))] };
    }

    if (name === 'dsds-intro') {
      if (introEntities.length === 0) throw new Error('No intro entities configured. Set the DSDS_INTRO_PATHS environment variable.');
      const text = introEntities.map(renderIntroEntity).filter(Boolean).join('\n\n');
      return { messages: [promptMessage(text)] };
    }

    throw new Error(`Unknown prompt: "${name}"`);
  });

  // ── Resources ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(getSummaries),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const content = readResource(uri, getSystems);

    if (!content) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return { contents: [content] };
  });

  return server;
}
