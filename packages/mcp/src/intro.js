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


  // DSDS 0.20 entities carry their content under `sections`, not the older
  // `documentBlocks` / `agentDocumentBlocks` pair below. Without this branch a
  // 0.20 intro entity renders as nothing but its name and description: the
  // two guides configured here produced 228 characters between them, out of
  // 21,287 on disk, so `introInline: true` silently behaved like the index.
  for (const section of (entity.sections ?? [])) {
    if (section.kind === 'guidelines') {
      if (section.title) lines.push(`### ${section.title}`, '');
      for (const item of (section.items ?? [])) {
        const level = String(item.level ?? '').toLowerCase();
        const label =
          level === 'must' ? 'Must'
          : level === 'must-not' ? 'Must not'
          : level === 'should' ? 'Should'
          : level === 'should-not' ? 'Should not'
          : 'Note';
        // 0.20 names the text `statement`; older shapes used `guidance`.
        const text = item.statement ?? item.guidance;
        if (text) lines.push(`- **${label}:** ${text}`);
      }
      lines.push('');
    } else if (section.kind === 'section') {
      for (const entry of (section.freeform ?? [])) {
        if (entry.title) lines.push(`### ${entry.title}`, '');
        if (entry.body) lines.push(entry.body, '');
      }
    } else if (section.kind === 'definitions') {
      if (section.title) lines.push(`### ${section.title}`, '');
      for (const item of (section.items ?? [])) {
        if (item.term) lines.push(`- **${item.term}:** ${item.definition ?? ''}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}


/**
 * Compact alternative to inlining the full intro entities: a one-line index.
 *
 * @param {Array} entities
 * @returns {string|null}
 */
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

// Same fallback chain the entity summaries use, at the index's line length.
function introSummary(entity) {
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
