const asText = v => (typeof v === 'string' ? v : (v?.value ?? ''));

// Escape a value for use inside a Markdown table cell. In GFM, an unescaped `|`
// is a column separator even inside an inline-code span, so union types like
// `'a' | 'b'` would break the table. Pipes are backslash-escaped and newlines
// collapse to spaces (a literal newline ends the row).
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// Render an array of allowed values as comma-joined inline code, or an em dash.
const valueList = values =>
  Array.isArray(values) && values.length > 0
    ? values.map(v => `\`${cell(v)}\``).join(', ')
    : '—';

// ── Block renderers ───────────────────────────────────────────────────────────

function renderImports(block, lines) {
  const items = block.items ?? [];
  if (items.length === 0) return;

  // Use the first item as the canonical example
  const item = items[0];
  lines.push('## Basic example', '');
  if (item.package) lines.push(`**Source:** \`${item.package}\``, '');
  if (item.code) {
    const lang = item.language ?? 'tsx';
    lines.push(`\`\`\`${lang}`, item.code, '```', '');
  }
  // A per-import note (e.g. a required stylesheet import) rides on `description`.
  if (item.description) lines.push(asText(item.description), '');

  // Additional import variants (e.g. a second package)
  for (let i = 1; i < items.length; i++) {
    const alt = items[i];
    if (alt.package) lines.push(`**Also available from:** \`${alt.package}\``, '');
    if (alt.code) {
      const lang = alt.language ?? 'tsx';
      lines.push(`\`\`\`${lang}`, alt.code, '```', '');
    }
    if (alt.description) lines.push(asText(alt.description), '');
  }
}

function renderApi(block, lines) {
  const props = block.properties ?? [];
  if (props.length === 0) return;

  // Only show the Values column when at least one prop declares allowed values,
  // so components with no enums keep a compact table.
  const hasValues = props.some(p => Array.isArray(p.values) && p.values.length > 0);

  lines.push('## API documentation', '');
  if (hasValues) {
    lines.push('| Prop | Description | Type | Values | Default | Required |');
    lines.push('| :---- | :---- | :---- | :---- | :---- | :---- |');
  } else {
    lines.push('| Prop | Description | Type | Default | Required |');
    lines.push('| :---- | :---- | :---- | :---- | :---- |');
  }

  for (const prop of props) {
    const type = prop.type ? `\`${cell(prop.type)}\`` : '—';
    // Schema field is `defaultValue`; tolerate a legacy `default` too.
    const rawDefault = prop.defaultValue ?? prop.default;
    const def = rawDefault != null ? `\`${cell(rawDefault)}\`` : '—';
    const req = prop.required ? 'Yes' : 'No';
    const desc = cell(asText(prop.description ?? ''));
    if (hasValues) {
      const vals = valueList(prop.values);
      lines.push(`| \`${cell(prop.identifier)}\` | ${desc} | ${type} | ${vals} | ${def} | ${req} |`);
    } else {
      lines.push(`| \`${cell(prop.identifier)}\` | ${desc} | ${type} | ${def} | ${req} |`);
    }
  }
  lines.push('');
}

function renderVariants(block, lines) {
  const items = block.items ?? [];
  if (items.length === 0) return;

  lines.push('## Variants', '');

  for (const variant of items) {
    if (variant.kind === 'enum') {
      lines.push(`### ${variant.identifier}`, '');
      if (variant.description) lines.push(asText(variant.description), '');

      const values = variant.values ?? [];
      if (values.length > 0) {
        lines.push('| Value | Description |');
        lines.push('| :---- | :---- |');
        for (const v of values) {
          const desc = cell(asText(v.description ?? ''));
          lines.push(`| \`${cell(v.identifier)}\` | ${desc} |`);
        }
        lines.push('');
      }
    } else if (variant.kind === 'boolean' || variant.kind === 'flag') {
      lines.push(`### ${variant.identifier}`, '');
      if (variant.description) lines.push(asText(variant.description), '');
      lines.push('');
    } else {
      // Generic variant: render as a section
      if (variant.identifier) lines.push(`### ${variant.identifier}`, '');
      if (variant.description) lines.push(asText(variant.description), '');
      lines.push('');
    }
  }
}

function renderStates(block, lines) {
  const items = block.items ?? [];
  if (items.length === 0) return;

  lines.push('## States', '');

  // Add a Notes column only when at least one state carries a rationale, so a
  // component with bare state descriptions keeps a two-column table.
  const hasNotes = items.some(s => s.rationale);
  if (hasNotes) {
    lines.push('| Value | Description | Notes |');
    lines.push('| :---- | :---- | :---- |');
    for (const s of items) {
      const desc = cell(asText(s.description ?? ''));
      const note = s.rationale ? cell(asText(s.rationale)) : '—';
      lines.push(`| \`${cell(s.identifier)}\` | ${desc} | ${note} |`);
    }
  } else {
    lines.push('| Value | Description |');
    lines.push('| :---- | :---- |');
    for (const s of items) {
      const desc = cell(asText(s.description ?? ''));
      lines.push(`| \`${cell(s.identifier)}\` | ${desc} |`);
    }
  }
  lines.push('');
}

function renderUseCases(block, lines) {
  const items = block.items ?? [];
  if (items.length === 0) return;

  const recommended = items.filter(u => u.stance === 'recommended');
  const discouraged = items.filter(u => u.stance === 'discouraged');

  lines.push('## Usage guidelines', '');

  if (recommended.length > 0) {
    lines.push('### When to use', '');
    for (const u of recommended) lines.push(`- ${asText(u.description)}`);
    lines.push('');
  }

  if (discouraged.length > 0) {
    lines.push('### When not to use', '');
    for (const u of discouraged) lines.push(`- ${asText(u.description)}`);
    lines.push('');
  }
}

// Best practices renders every guideline EXCEPT those in the accessibility
// category — those surface under the Accessibility heading instead (see
// renderAccessibility), so a reader finds a11y guidance where they expect it.
function renderGuidelines(block, lines) {
  const items = (block.items ?? []).filter(i => i.category !== 'accessibility');
  if (items.length === 0) return;

  const doItems = items.filter(i => i.level === 'must' || i.level === 'should');
  const dontItems = items.filter(i => i.level === 'must-not' || i.level === 'should-not');

  lines.push('## Best practices', '');

  if (doItems.length > 0) {
    lines.push('### Do', '');
    for (const item of doItems) {
      const rationale = item.rationale ? ` ${asText(item.rationale)}` : '';
      lines.push(`- ${asText(item.guidance)}${rationale}`);
    }
    lines.push('');
  }

  if (dontItems.length > 0) {
    lines.push("### Don't", '');
    for (const item of dontItems) {
      const rationale = item.rationale ? ` ${asText(item.rationale)}` : '';
      lines.push(`- ${asText(item.guidance)}${rationale}`);
    }
    lines.push('');
  }
}

// The accessibility block is data-only by spec; prose a11y rules live in the
// guidelines block under category 'accessibility'. This renderer surfaces both
// under one Accessibility heading: structured data (WCAG level, keyboard, ARIA)
// followed by the categorized prose guidelines.
function renderAccessibility(a11yBlock, guidelinesBlock, lines) {
  const a11yGuidelines = (guidelinesBlock?.items ?? []).filter(
    i => i.category === 'accessibility',
  );
  if (!a11yBlock && a11yGuidelines.length === 0) return;

  lines.push('## Accessibility', '');

  if (a11yBlock?.wcagLevel) lines.push(`**WCAG level:** ${a11yBlock.wcagLevel}`, '');

  if (a11yGuidelines.length > 0) {
    for (const g of a11yGuidelines) {
      const rationale = g.rationale ? ` ${asText(g.rationale)}` : '';
      lines.push(`- ${asText(g.guidance)}${rationale}`);
    }
    lines.push('');
  }

  const keyboard = a11yBlock?.keyboardInteractions ?? [];
  if (keyboard.length > 0) {
    lines.push('### Keyboard interactions', '');
    lines.push('| Key | Action |');
    lines.push('| :---- | :---- |');
    for (const k of keyboard) {
      lines.push(`| \`${cell(k.key)}\` | ${cell(k.action)} |`);
    }
    lines.push('');
  }

  const aria = a11yBlock?.ariaAttributes ?? [];
  if (aria.length > 0) {
    lines.push('### ARIA attributes', '');
    lines.push('| Attribute | Value | Description |');
    lines.push('| :---- | :---- | :---- |');
    for (const a of aria) {
      const val = a.value ? `\`${cell(a.value)}\`` : '—';
      lines.push(`| \`${cell(a.attribute)}\` | ${val} | ${cell(asText(a.description ?? ''))} |`);
    }
    lines.push('');
  }

  const focus = a11yBlock?.focusBehaviors ?? [];
  if (focus.length > 0) {
    lines.push('### Focus behavior', '');
    for (const f of focus) {
      const trigger = f.trigger ? `**${cell(f.trigger)}:** ` : '';
      lines.push(`- ${trigger}${asText(f.behavior ?? f.description ?? '')}`);
    }
    lines.push('');
  }
}

function renderContent(block, lines) {
  const labels = block.labels ?? [];
  const hasDescription = Boolean(block.description);
  if (!hasDescription && labels.length === 0) return;

  lines.push('## Content', '');
  if (hasDescription) lines.push(asText(block.description), '');

  for (const label of labels) {
    const def = asText(label.definition ?? '');
    lines.push(`- **${cell(label.term)}:** ${def}`);
  }
  if (labels.length > 0) lines.push('');
}

function renderSectionItem(item, depth, lines) {
  const heading = '#'.repeat(depth);
  if (item.title) lines.push(`${heading} ${item.title}`, '');
  if (item.body) lines.push(asText(item.body), '');
  for (const sub of item.sections ?? []) {
    renderSectionItem(sub, depth + 1, lines);
  }
}

function renderSections(block, lines, depth = 2) {
  for (const item of block.items ?? []) {
    renderSectionItem(item, depth, lines);
  }
}

// ── Main renderer ─────────────────────────────────────────────────────────────

function entityToMarkdown(entity) {
  const lines = [];

  // Header
  const name = entity.name ?? entity.identifier;
  lines.push(`# ${name}`, '');

  if (entity.description) {
    lines.push(asText(entity.description), '');
  }

  const meta = entity.metadata ?? {};
  if (meta.status) lines.push(`**Status:** ${meta.status}  `, '');

  const docBlocks = entity.documentBlocks ?? [];
  const byKind = kind => docBlocks.find(b => b.kind === kind);

  const importsBlock    = byKind('imports');
  const apiBlock        = byKind('api');
  const variantsBlock   = byKind('variants');
  const statesBlock     = byKind('states');
  const useCasesBlock   = byKind('useCases');
  const guidelinesBlock = byKind('guidelines');
  const a11yBlock       = byKind('accessibility');
  const contentBlock    = byKind('content');

  // Order mirrors the authored component docs:
  // Basic example → API → Usage → Best practices → States → Variants →
  // Accessibility → Content → free-form sections (e.g. Migration) → Notes.
  if (importsBlock)                     renderImports(importsBlock, lines);
  if (apiBlock)                         renderApi(apiBlock, lines);
  if (useCasesBlock)                    renderUseCases(useCasesBlock, lines);
  if (guidelinesBlock)                  renderGuidelines(guidelinesBlock, lines);
  if (statesBlock)                      renderStates(statesBlock, lines);
  if (variantsBlock)                    renderVariants(variantsBlock, lines);
  if (a11yBlock || guidelinesBlock)     renderAccessibility(a11yBlock, guidelinesBlock, lines);
  if (contentBlock)                     renderContent(contentBlock, lines);

  // Free-form sections in documentBlocks (e.g. a "Migrating from v3" block)
  // render after the structured sections, at heading depth 2.
  for (const block of docBlocks.filter(b => b.kind === 'sections')) {
    renderSections(block, lines, 2);
  }

  // agentDocumentBlocks.sections often carry examples and how-it-works notes
  // that are equally useful for human documentation.
  const agentSections = (entity.agentDocumentBlocks ?? []).filter(b => b.kind === 'sections');
  if (agentSections.length > 0) {
    lines.push('## Notes', '');
    for (const block of agentSections) {
      renderSections(block, lines, 3);
    }
  }

  return lines.join('\n');
}

// ── Tool definition and handler ───────────────────────────────────────────────

export const toMarkdownDef = {
  name: 'dsds_to_markdown',
  description:
    'Convert a DSDS entity to a human-readable markdown document. ' +
    'Renders documentBlocks (imports, api, useCases, guidelines, states, variants, ' +
    'accessibility, content, sections) and agentDocumentBlocks sections into a single ' +
    '.md-ready string. Accessibility-category guidelines are surfaced under the ' +
    'Accessibility heading alongside the structured accessibility data. ' +
    'Use this to generate or regenerate the markdown component doc for an entity.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'Entity identifier (e.g. "tooltip") or name (e.g. "Tooltip"). Case-insensitive.',
      },
    },
    required: ['identifier'],
  },
};

export async function toMarkdownHandler({ identifier }, getSystems) {
  const systems = getSystems();

  if (!systems || systems.length === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'No DSDS systems loaded. Set the DSDS_PATHS environment variable.',
      }],
    };
  }

  const needle = identifier.toLowerCase();
  let found = null;

  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle,
    );
    if (entity) { found = entity; break; }
  }

  if (!found) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Entity "${identifier}" not found. Use dsds_list_entities to see available identifiers.`,
      }],
    };
  }

  const markdown = entityToMarkdown(found);
  return { content: [{ type: 'text', text: markdown }] };
}
