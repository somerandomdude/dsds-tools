// Intro-entity rendering — shared by every surface.
//
// Intro entities are DSDS documents loaded outside the queried systems
// (DSDS_INTRO_PATHS / `introPaths`) that introduce the design system itself.
// They are rendered into the MCP server instructions, served as the
// `dsds-intro` prompt, and printed by `dsds instructions` / `dsds prompt
// dsds-intro` on the CLI — one renderer so all three agree.
//
// Lifted verbatim out of server.js so the CLI can reach it without importing
// the MCP transport.

import { entitySummary } from './loader.js';

/**
 * Render a DSDS entity to a markdown string suitable for agent instructions.
 * Handles section, steps, guideline, and purpose document blocks.
 *
 * @param {object|null} entity
 * @returns {string|null}
 */
export function renderIntroEntity(entity) {
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

/**
 * Compact alternative to inlining the full intro entities: a one-line index.
 *
 * @param {Array} entities
 * @returns {string|null}
 */
export function renderIntroIndex(entities) {
  if (!entities.length) return null;
  const lines = ['---', '', '## Design system guides', '', 'Fetch full content with `dsds_get_entity(identifier)` when needed:', ''];
  for (const e of entities) {
    const name = e.name ?? e.identifier;
    const summary = introSummary(e);
    lines.push(`- **${name}** (\`${e.identifier}\`)${summary ? ` — ${summary}` : ''}`);
  }
  return lines.join('\n');
}

// Same fallback chain the entity summaries use, at the index's line length.
export function introSummary(entity) {
  return entitySummary(entity, { maxLength: 140 }) ?? '';
}

/**
 * Render the intro block that gets appended to the agent instructions:
 * every entity in full (inline, the default) or a one-line index.
 *
 * @param {Array} entities
 * @param {{inline?: boolean}} [options]
 * @returns {string|null} null when there are no intro entities
 */
export function renderIntroBlock(entities, { inline = true } = {}) {
  if (!entities || entities.length === 0) return null;
  return inline
    ? entities.map(renderIntroEntity).filter(Boolean).join('\n\n') || null
    : renderIntroIndex(entities);
}
