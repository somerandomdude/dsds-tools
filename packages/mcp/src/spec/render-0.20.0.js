// Shared markdown rendering for real DSDS 0.20.0 entities (sections/
// traits/sourceFiles/combos) — used by get-entity.js, get-agent-context.js,
// get-document-block.js, and to-markdown.js so the four tools render the
// same fields the same way instead of drifting apart.
const asText20 = (v) => (typeof v === 'string' ? v : (v?.value ?? ''));

function renderFreeform(freeform, lines, depth = 3) {
  const heading = '#'.repeat(depth);
  for (const item of freeform ?? []) {
    if (item.title) lines.push(`${heading} ${item.title}`, '');
    if (item.body) lines.push(asText20(item.body), '');
  }
}

function renderDefinitions(section, lines) {
  for (const item of section.items ?? []) {
    lines.push(`- **${item.term}**: ${asText20(item.definition)}`);
  }
  lines.push('');
  renderFreeform(section.freeform, lines);
}

function renderGuidelineItem(item, lines) {
  const level = item.level ? `**${item.level}** — ` : '';
  const text = item.statement ?? item.guidance;
  if (text != null) {
    lines.push(`- ${level}${asText20(text)}`);
  } else {
    // No `statement` — the item points somewhere else instead (same-as / external-link), see `refs`.
    const pointer = (item.refs ?? []).find((r) => r.rel === 'same-as' || r.rel === 'external-link');
    lines.push(`- ${level}${pointer ? `see ${pointer.to ?? pointer.href}` : '(see refs)'}`);
  }
  if (item.checkedBy) lines.push(`  - Checked by: ${item.checkedBy}`);
  for (const alt of item.alternatives ?? []) {
    lines.push(`  - Alternative: \`${alt.to ?? alt.href}\`${alt.rel ? ` (${alt.rel})` : ''}`);
  }
}

function renderGuidelines(section, lines) {
  if (section.context) lines.push(`*Context: ${section.context}*`, '');
  for (const item of section.items ?? []) renderGuidelineItem(item, lines);
  lines.push('');
  renderFreeform(section.freeform, lines);
}

function renderSteps(section, lines) {
  const isOrdered = section.ordered !== false;
  (section.items ?? []).forEach((item, i) => {
    const marker = isOrdered ? `${i + 1}.` : '-';
    const optional = item.optional ? ' *(optional)*' : '';
    lines.push(`${marker} ${item.title}${optional}`);
    if (item.instruction) lines.push(`   ${asText20(item.instruction)}`);
  });
  lines.push('');
  renderFreeform(section.freeform, lines);
}

function renderGenericSection(section, lines) {
  for (const item of section.items ?? []) {
    if (item.title) lines.push(`- **${item.title}**${item.body ? `: ${asText20(item.body)}` : ''}`);
    else if (item.body) lines.push(`- ${asText20(item.body)}`);
  }
  if (section.items?.length) lines.push('');
  renderFreeform(section.freeform, lines);
}

const SECTION_TITLES = {
  definitions: 'Definitions',
  guidelines: 'Guidelines',
  steps: 'Steps',
  section: 'Notes',
};

/** Renders one 0.20.0 section, headed by its kind/title, at the given depth. */
export function renderSection20(section, lines, depth = 2) {
  const heading = '#'.repeat(depth);
  const title = section.title ?? SECTION_TITLES[section.kind] ?? section.kind;
  lines.push(`${heading} ${title}`, '');
  switch (section.kind) {
    case 'definitions': renderDefinitions(section, lines); break;
    case 'guidelines': renderGuidelines(section, lines); break;
    case 'steps': renderSteps(section, lines); break;
    default: renderGenericSection(section, lines); break;
  }
}

/** Renders every section in `sections`, optionally filtered by audience (`for`). */
export function renderSections20(sections, lines, { audience = null, depth = 2 } = {}) {
  for (const section of sections ?? []) {
    if (audience && section.for !== audience && section.for !== 'all') continue;
    renderSection20(section, lines, depth);
  }
}

/** Renders `traits` (variants/states) as the closed-value-set constraints agents most often get wrong. */
export function renderTraits20(traits, lines) {
  if (!traits?.length) return;
  lines.push('## Traits (variants & states)', '');
  for (const trait of traits) {
    if (trait.kind === 'enum') {
      const values = (trait.values ?? []).map((v) => `\`${v.id}\``).join(' | ');
      lines.push(`- \`${trait.id}\` — enum: ${values}`);
    } else {
      lines.push(`- \`${trait.id}\` — boolean`);
    }
    if (trait.description) lines.push(`  - ${asText20(trait.description)}`);
  }
  lines.push('');
}

/** Renders `combos` (must/must-not pairing rules between traits) — hard constraints. */
export function renderCombos20(combos, lines) {
  if (!combos?.length) return;
  lines.push('## Combos (pairing rules)', '');
  for (const combo of combos) {
    const items = (combo.items ?? []).map((i) => `\`${i}\``).join(', ');
    lines.push(`- **${combo.level}** — \`${combo.subject}\` with ${items}`);
    if (combo.note) lines.push(`  - ${asText20(combo.note)}`);
  }
  lines.push('');
}

/** Renders `sourceFiles`/`imports` — where the real API/install info lives. */
export function renderSourceAndImports20(entity, lines) {
  if (entity.sourceFiles?.length) {
    lines.push('## Source files', '', 'The real API comes from these files, not from a hand-typed prop list:', '');
    for (const sf of entity.sourceFiles) {
      lines.push(`- ${sf.platform ? `**${sf.platform}**: ` : ''}\`${sf.file}\``);
    }
    lines.push('');
  }
  if (entity.imports?.length) {
    lines.push('## Imports', '');
    for (const imp of entity.imports) {
      lines.push(`- ${imp.platform ? `**${imp.platform}**: ` : ''}\`${imp.package}\``);
      if (imp.code) lines.push('  ```', `  ${imp.code}`, '  ```');
    }
    lines.push('');
  }
}
