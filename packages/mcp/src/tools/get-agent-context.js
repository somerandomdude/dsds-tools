import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { notFoundMessage, entityIdentifiers } from '../suggest.js';
import { resolvePropValues, isBooleanProp } from '../prop-types.js';
import { renderApi20, renderCombos20, renderExtensions20, renderSections20, renderSourceAndImports20, renderTraits20 } from '../spec/render-0.20.0.js';
import { notFoundError } from '../errors.js';
import { renderTable } from '../render/table.js';

export const getAgentContextDef = {
  name: 'dsds_get_agent_context',
  description:
    'Get the agent-facing context for an entity — its agent-only document blocks (agentDocumentBlocks), the props table, and the hard constraints from its guidelines. ' +
    'This is the most LLM-optimized content in a DSDS document. Use it to understand the rules and edge cases for an entity before building with it. ' +
    'Returns a compact view by default (agent rules + props); pass verbose:true only if you need the full human documentation (use-case prose, sections, code examples).',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The entity identifier or name.',
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

function renderGuidelines(block, lines) {
  for (const item of block.items ?? []) {
    const level = item.level ? `**${item.level}** — ` : '';
    lines.push(`- ${level}${asText(item.guidance)}`);
    if (item.rationale) lines.push(`  - Why: ${asText(item.rationale)}`);
    if (item.evidence) lines.push(`  - Evidence: ${item.evidence}`);
    for (const c of item.criteria ?? []) {
      lines.push(`  - Criterion \`${c.identifier}\`: ${asText(c.statement)}`);
    }
  }
  lines.push('');
}

function renderUseCases(block, lines) {
  if (block.purpose) lines.push(asText(block.purpose), '');
  for (const uc of block.items ?? []) {
    const stance = uc.stance === 'discouraged' ? 'Avoid when' : 'Use when';
    let line = `- **${stance}:** ${asText(uc.description)}`;
    if (uc.alternative?.identifier) {
      line += ` → use \`${uc.alternative.identifier}\` instead`;
      if (uc.alternative.rationale) line += ` (${asText(uc.alternative.rationale)})`;
    }
    lines.push(line);
  }
  lines.push('');
}

function renderSectionItem(section, lines) {
  if (section.title) lines.push(`**${section.title}**`, '');
  if (section.body) lines.push(asText(section.body), '');
  for (const ex of section.examples ?? []) {
    if (ex.description) lines.push(ex.description, '');
    if (ex.presentation?.kind === 'code') {
      lines.push('```' + (ex.presentation.language ?? ''), ex.presentation.code, '```', '');
    }
  }
  for (const sub of section.sections ?? []) {
    renderSectionItem(sub, lines);
  }
}

function renderSections(block, lines) {
  for (const section of block.items ?? []) {
    renderSectionItem(section, lines);
  }
}

function renderApi(block, lines, format = 'markdown') {
  const rows = (block.properties ?? []).map(prop => ({
    prop: `\`${prop.identifier}\``,
    type: prop.type ? `\`${prop.type}\`` : null,
    required: prop.required ? 'yes' : null,
    description: asText(prop.description ?? ''),
  }));
  lines.push(...renderTable(rows, [
    { key: 'prop', header: 'Prop' },
    { key: 'type', header: 'Type' },
    { key: 'required', header: 'Required' },
    { key: 'description', header: 'Description' },
  ], { format, name: 'props' }).split('\n'), '');
}

// Lead with the closed value sets (tone, numeric scales, booleans) as hard
// constraints. These are the props agents most often get wrong by carrying over
// values from other libraries (e.g. Button tone="positive", Card padding/radius)
// — surfacing the exact allowed values up front, not buried in the prop table,
// is the cheapest way to prevent those build failures.
function renderConstraints(apiBlock, lines) {
  if (!apiBlock) return false;
  const rows = [];
  for (const prop of apiBlock.properties ?? []) {
    if (!prop?.identifier) continue;
    // Spec-authority order: schema.enum → values → type-string parse.
    const union = resolvePropValues(prop);
    if (union) {
      const values = union.map(m => (m.isNumber ? m.value : `"${m.value}"`)).join(' | ');
      rows.push(`- \`${prop.identifier}\` — exactly one of: ${values}`);
    } else if (isBooleanProp(prop)) {
      rows.push(`- \`${prop.identifier}\` — boolean: {true} | {false}`);
    }
  }
  if (rows.length === 0) return false;
  lines.push(
    '## Allowed prop values — hard constraints',
    '',
    'These props accept a CLOSED set of values. Use EXACTLY one of the listed values; any other value (including ones valid in other libraries) is a build error. String values are quoted, numbers go in braces (e.g. `padding={3}`, `tone="critical"`).',
    '',
    ...rows,
    '',
  );
  return true;
}

function renderBlock(block, lines, format = 'markdown') {
  switch (block.kind) {
    case 'guidelines': lines.push('## Rules', ''); renderGuidelines(block, lines); break;
    case 'useCases': lines.push('## When to use', ''); renderUseCases(block, lines); break;
    case 'sections': renderSections(block, lines); break;
    case 'api': lines.push('## Props', ''); renderApi(block, lines, format); break;
    case 'imports': break; // skip — trivial (just the import statement)
    case 'accessibility': break; // skip — verbose keyboard/criteria detail not needed for code generation
    default:
      lines.push(`## ${block.kind}`, '', '```json', JSON.stringify(block, null, 2), '```', '');
  }
}

// Real 0.20.0 agent context: traits/combos ARE the hard constraints (no
// separate "allowed prop values" derivation needed — they're already a
// closed set on the entity), sourceFiles/imports replace the old `api`
// block, and sections replace documentBlocks/agentDocumentBlocks entirely.
// Compact (default) renders `for: agent`/`for: all` sections only — a
// `for: human` section is prose for people, not something an agent needs
// to spend context on before writing code. Verbose renders everything.
function renderAgentContext20(found, verbose, getGraph, propsConfig, format = 'markdown') {
  const lines = [`# ${found.name ?? found.identifier} — Agent Context`, ''];
  if (found.description) lines.push(asText(found.description), '');

  renderTraits20(found.traits, lines);
  renderCombos20(found.combos, lines);
  renderSourceAndImports20(found, lines);
  renderApi20(found, lines, propsConfig, format);

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
    }
  }

  const sections = found.sections ?? [];
  const sectionCtx = { filePath: found.__filePath, sharedEntries: found.__sharedEntries };
  if (sections.length === 0) {
    lines.push('*No sections defined for this entry.*');
  } else if (verbose) {
    renderSections20(sections, lines, sectionCtx);
  } else {
    renderSections20(sections, lines, { ...sectionCtx, audience: 'agent' });
    const omitted = sections.filter((s) => s.for === 'human').length;
    if (omitted > 0) {
      lines.push(`> ${omitted} human-only section(s) omitted for brevity. Call dsds_get_agent_context with verbose:true if you need them.`, '');
    }
  }
  renderExtensions20(found.$extensions, lines, { heading: '## Tool data' });

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function getAgentContextHandler({ identifier, verbose = false }, getSystems, getGraph = null, propsConfig = null, format = 'markdown') {
  const systems = getSystems();
  if (systems.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfiguredBrief() }],
    };
  }

  const needle = identifier.toLowerCase();
  let found = null;

  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) { found = entity; break; }
  }

  if (!found) {
    return notFoundError({
      label: 'Entity',
      input: identifier,
      candidates: entityIdentifiers(systems),
      listHint: '`dsds_list_entities`',
    });
  }

  if (found.__dsds20) return renderAgentContext20(found, verbose, getGraph, propsConfig, format);

  const agentBlocks = found.agentDocumentBlocks ?? [];
  const docBlocks = found.documentBlocks ?? [];

  if (agentBlocks.length === 0 && docBlocks.length === 0) {
    const lines = [
      `# ${found.name ?? found.identifier} — no agent context defined`,
      '',
      'This entity has no `agentDocumentBlocks` and no `documentBlocks`.',
      '',
      'Add an `agentDocumentBlocks` array — it accepts the same document block kinds as `documentBlocks` but is intended for agent (AI/LLM) consumption only and is never rendered for humans. Typical content:',
      '- A `guidelines` block with generation constraints (`level`: must/must-not, optional `rationale`)',
      '- A `useCases` block disambiguating this entity from confusable ones (discouraged items with `alternative`)',
      '- A `sections` block with ready-to-use code examples',
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const lines = [
    `# ${found.name ?? found.identifier} — Agent Context`,
    '',
  ];

  if (found.description) {
    lines.push(asText(found.description), '');
  }

  // Lead with the closed value sets (tone/scale/boolean) — the constraints
  // agents most often violate. Derived from the same api block rendered below.
  renderConstraints(docBlocks.find(b => b.kind === 'api'), lines);

  // Blast radius up front: what this entity needs (dependencies) and what would
  // break if you change it (dependents). Derived from the relationship graph.
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
        const breaking = dependents.filter(d => d.required);
        lines.push(`**Used by ${dependents.length} entit${dependents.length === 1 ? 'y' : 'ies'}** — changing this affects them${breaking.length ? `; ${breaking.length} depend on it as required (breaking)` : ''}:`);
        for (const r of dependents) lines.push(`- ${r.via} ← \`${r.target}\`${r.required ? ' **(breaking)**' : ''}`);
      }
      lines.push('');
    }
  } else if (found.relationships?.length) {
    lines.push('## Relationships', '');
    for (const r of found.relationships) {
      const req = r.required ? ' (required)' : '';
      const role = r.role ? ` — ${r.role}` : '';
      lines.push(`- ${r.relation} → \`${r.target}\`${role}${req}`);
    }
    lines.push('');
  }

  if (agentBlocks.length > 0) {
    lines.push('## Agent-optimized context', '');
    for (const block of agentBlocks) renderBlock(block, lines, format);
  }

  // Compact (default): only the props table from documentBlocks — props are
  // essential for correct code, the rest (use-case prose, sections, examples)
  // is verbose and accumulates in context. Verbose: render everything.
  const docBlocksToRender = docBlocks.filter(b => b.kind !== 'imports' && b.kind !== 'accessibility');
  if (verbose) {
    if (docBlocksToRender.length > 0) {
      lines.push('## Full component documentation', '');
      for (const block of docBlocksToRender) renderBlock(block, lines, format);
    }
  } else {
    const apiBlock = docBlocksToRender.find(b => b.kind === 'api');
    if (apiBlock) renderBlock(apiBlock, lines, format);
    const omitted = docBlocksToRender.filter(b => b.kind !== 'api').map(b => b.kind);
    if (omitted.length > 0) {
      lines.push(`> ${omitted.length} more documentation block(s) omitted for brevity (${omitted.join(', ')}). Call dsds_get_agent_context with verbose:true, or dsds_get_document_block, if you need them.`, '');
    }
  }

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
