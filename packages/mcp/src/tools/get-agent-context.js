import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { notFoundMessage, entityIdentifiers } from '../suggest.js';
import { resolvePropValues, isBooleanProp } from '../prop-types.js';
import { renderApi20, renderCombos20, renderExtensions20, renderSections20, renderSourceAndImports20, renderTraits20 } from '../spec/render.js';
import { notFoundError } from '../errors.js';
import { renderTable } from '../render/table.js';
import { accessRecord } from '../logger.js';

/** Entry kind for telemetry — 0.20+ entries carry `kind`, older ones do not. */
const entityKindOf = e => e.kind ?? e.entityKind ?? undefined;

export const getAgentContextDef = {
  name: 'dsds_get_agent_context',
  description:
    'Get the agent-facing context for an entity — its agent-only document blocks (agentDocumentBlocks), the props table, and the hard constraints from its guidelines. ' +
    'This is the most LLM-optimized content in a DSDS document. Use it to understand the rules and edge cases for an entity before building with it. ' +
    'Returns a compact view by default (agent rules + props); pass verbose:true only if you need the full human documentation (use-case prose, sections, code examples). ' +
    'Pass every component you are about to use in one call: `identifier` takes a list, and each entity is returned in its own section.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'array',
        items: { type: 'string' },
        description: 'Entity identifiers or names, e.g. ["button", "card", "text"]. A single string is accepted too.',
      },
      verbose: {
        type: 'boolean',
        description: 'Default false. When false, returns only the agent-optimized blocks and the props table (much smaller). Set true to also include the full documentation blocks (sections, use-case prose, examples).',
      },
    },
    required: ['identifier'],
  },
};

const asText = v => (typeof v === 'string' ? v : (v?.value ?? ''));








// Real 0.20.0 agent context: traits/combos ARE the hard constraints (no
// separate "allowed prop values" derivation needed — they're already a
// closed set on the entity), sourceFiles/imports replace the old `api`
// block, and sections replace documentBlocks/agentDocumentBlocks entirely.
// Compact (default) renders `for: agent`/`for: all` sections only — a
// `for: human` section is prose for people, not something an agent needs
// to spend context on before writing code. Verbose renders everything.
function renderAgentContext20(found, verbose, getGraph, propsConfig, { notice = true } = {}) {
  const lines = [`# ${found.name ?? found.identifier} — Agent Context`, ''];
  if (found.description) lines.push(asText(found.description), '');

  // `parts` tracks the generated views this response actually carried, so the
  // log distinguishes "read Card's props" from "read Card's guidelines".
  const parts = [];
  const mark = (name, before) => { if (lines.length > before) parts.push(name); };

  let at = lines.length;
  renderTraits20(found.traits, lines); mark('traits', at);
  at = lines.length;
  renderCombos20(found.combos, lines); mark('combos', at);
  at = lines.length;
  renderSourceAndImports20(found, lines); mark('imports', at);
  at = lines.length;
  renderApi20(found, lines, propsConfig); mark('api', at);

  const graph = getGraph ? getGraph() : null;
  if (graph) {
    const deps = graph.out.get(found.identifier) ?? [];
    const dependents = graph.in.get(found.identifier) ?? [];
    if (deps.length || dependents.length) {
      lines.push('## Relationships', '');
      if (deps.length) {
        lines.push('**This depends on / composes:**');
        for (const r of deps) lines.push(`- ${r.relation} → \`${r.target}\`${r.required ? ' (required)' : ''}`);
      }
      if (dependents.length) {
        lines.push(`**Used by ${dependents.length} entit${dependents.length === 1 ? 'y' : 'ies'}:**`);
        for (const r of dependents) lines.push(`- ${r.via} ← \`${r.target}\`${r.required ? ' **(breaking)**' : ''}`);
      }
      lines.push('');
      parts.push('relationships');
    }
  }

  const sections = found.sections ?? [];
  const sectionCtx = { filePath: found.__filePath, sharedEntries: found.__sharedEntries };
  // Mirrors renderSections20's own audience filter — the served set, not the
  // declared set, is what the access log records.
  const served = verbose ? sections : sections.filter((s) => s.for === 'agent' || s.for === 'all');
  let omitted = 0;
  if (sections.length === 0) {
    lines.push('*No sections defined for this entry.*');
  } else if (verbose) {
    renderSections20(sections, lines, sectionCtx);
  } else {
    renderSections20(sections, lines, { ...sectionCtx, audience: 'agent' });
    omitted = sections.filter((s) => s.for === 'human').length;
    if (omitted > 0) {
      lines.push(`> ${omitted} human-only section(s) omitted for brevity. Call dsds_get_agent_context with verbose:true if you need them.`, '');
    }
  }
  // Extensions render in full, including migration guides.
  //
  // These were gated behind `verbose` to save ~13% of payload, on the
  // reasoning that a v3-to-v5 migration guide is useless to an agent building
  // something new. Two runs afterwards failed to build on v3 prop names, and
  // the correction for one of them — `flexGrow` for a v3 `flex` — existed
  // only in the gated content. The payload saving is not worth removing the
  // v3-to-v5 prop mapping from what an agent reads.
  //
  // `renderExtensions20` still takes `compact`; flip this to `!verbose` to
  // restore the gate if a measurement says the saving was fine after all.
  renderExtensions20(found.$extensions, lines, { heading: '## Tool data', compact: false });

  const update = notice ? getUpdateNotice() : null;
  if (update) lines.push(update);
  const text = lines.join('\n');
  return {
    content: [{ type: 'text', text }],
    access: accessRecord({
      identifier: found.identifier,
      name: found.name,
      entityKind: entityKindOf(found),
      sections: served,
      parts,
      omitted,
      mode: verbose ? 'verbose' : 'compact',
      chars: text.length,
    }),
  };
}

function findEntity(systems, identifier) {
  const needle = String(identifier).toLowerCase();
  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) return entity;
  }
  return null;
}

/**
 * Entries rendered for an agent: rules and props, audience-filtered, compact
 * by default.
 *
 * `identifier` takes one id or a list. The list exists because the lookup is
 * mandatory per component: in the 2026-09-23 14.22 run agents made 15–17 of
 * these calls per iteration, one component at a time, and imported 87–96% of
 * what they looked up. The cost was round-trips, not wasted reads. A list
 * turns those into one call, with each entity in its own section.
 */
export async function getAgentContextHandler({ identifier, verbose = false }, getSystems, getGraph = null, propsConfig = null) {
  const systems = getSystems();
  if (systems.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfiguredBrief() }],
    };
  }

  const requested = [...new Set((Array.isArray(identifier) ? identifier : [identifier])
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim()))];

  if (requested.length <= 1) {
    const one = requested[0] ?? '';
    const found = findEntity(systems, one);
    if (!found) {
      return notFoundError({
        label: 'Entity',
        input: one,
        candidates: entityIdentifiers(systems),
        listHint: '`dsds_list_entities`',
      });
    }
    return renderAgentContext20(found, verbose, getGraph, propsConfig);
  }

  // A batch never fails as a whole: a typo in one id must not cost the agent
  // the other fifteen. Misses are listed at the top, with suggestions, so they
  // are seen before the agent writes code against a component it never read.
  const rendered = [];
  const missing = [];
  const seen = new Set();
  for (const id of requested) {
    const found = findEntity(systems, id);
    if (!found) { missing.push(id); continue; }
    if (seen.has(found.identifier)) continue;
    seen.add(found.identifier);
    rendered.push({ id, ...renderAgentContext20(found, verbose, getGraph, propsConfig, { notice: false }) });
  }

  const out = [];
  if (missing.length) {
    const candidates = entityIdentifiers(systems);
    out.push(`> **Not found (${missing.length}):**`);
    for (const id of missing) {
      out.push(`> - \`${id}\` — ${notFoundMessage({ label: 'Entity', input: id, candidates, listHint: '`dsds_list_entities`' }).replace(/\n+/g, ' ')}`);
    }
    out.push('');
  }
  out.push(`Agent context for ${rendered.length} entit${rendered.length === 1 ? 'y' : 'ies'}: ${rendered.map((r) => `\`${r.access.identifier}\``).join(', ')}.`, '');
  for (const r of rendered) out.push('---', '', r.content[0].text, '');
  const update = getUpdateNotice();
  if (update) out.push(update);

  return {
    ...(rendered.length === 0 ? { isError: true } : {}),
    content: [{ type: 'text', text: out.join('\n') }],
    access: rendered.map((r) => ({ ...r.access, ...(r.id.toLowerCase() !== String(r.access.identifier).toLowerCase() ? { requested: r.id } : {}), batch: requested.length })),
  };
}
