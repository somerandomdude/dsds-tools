const asText = v => (typeof v === 'string' ? v : (v?.value ?? ''));

// Escape a value for use inside a Markdown table cell. In GFM, an unescaped `|`
// is a column separator even inside an inline-code span, so union types like
// `'a' | 'b'` would break the table. Pipes are backslash-escaped and newlines
// collapse to spaces (a literal newline ends the row).
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

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

  // Additional import variants (e.g. a second package)
  for (let i = 1; i < items.length; i++) {
    const alt = items[i];
    if (alt.package) lines.push(`**Also available from:** \`${alt.package}\``, '');
    if (alt.code) {
      const lang = alt.language ?? 'tsx';
      lines.push(`\`\`\`${lang}`, alt.code, '```', '');
    }
  }
}

function renderApi(block, lines) {
  const props = block.properties ?? [];
  if (props.length === 0) return;

  lines.push('## API documentation', '');
  lines.push('| Prop | Description | Type | Default | Required |');
  lines.push('| :---- | :---- | :---- | :---- | :---- |');

  for (const prop of props) {
    const type = prop.type ? `\`${cell(prop.type)}\`` : '—';
    const def = prop.default != null ? `\`${cell(prop.default)}\`` : '—';
    const req = prop.required ? 'Yes' : 'No';
    const desc = cell(asText(prop.description ?? ''));
    lines.push(`| \`${cell(prop.identifier)}\` | ${desc} | ${type} | ${def} | ${req} |`);
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
    } else if (variant.kind === 'boolean') {
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

function renderGuidelines(block, lines) {
  const items = block.items ?? [];
  if (items.length === 0) return;

  const doItems = items.filter(i => i.level === 'must' || i.level === 'should');
  const dontItems = items.filter(i => i.level === 'must-not' || i.level === 'should-not');

  lines.push('## Best practices', '');

  if (doItems.length > 0) {
    lines.push('### Do', '');
    for (const item of doItems) {
      lines.push(`- ${asText(item.guidance)}`);
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

function renderAccessibility(block, lines) {
  lines.push('## Accessibility', '');

  if (block.wcagLevel) lines.push(`**WCAG level:** ${block.wcagLevel}`, '');

  const keyboard = block.keyboardInteractions ?? [];
  if (keyboard.length > 0) {
    lines.push('### Keyboard interactions', '');
    lines.push('| Key | Action |');
    lines.push('| :---- | :---- |');
    for (const k of keyboard) {
      lines.push(`| \`${cell(k.key)}\` | ${cell(k.action)} |`);
    }
    lines.push('');
  }

  const roles = block.roles ?? [];
  if (roles.length > 0) {
    lines.push('### ARIA roles', '');
    for (const r of roles) {
      lines.push(`- \`${r.role}\`${r.appliesTo ? ` — ${r.appliesTo}` : ''}`);
    }
    lines.push('');
  }
}

function renderSectionItem(item, depth, lines) {
  const heading = '#'.repeat(depth);
  if (item.title) lines.push(`${heading} ${item.title}`, '');
  if (item.body) lines.push(asText(item.body), '');
  for (const sub of item.sections ?? []) {
    renderSectionItem(sub, depth + 1, lines);
  }
}

function renderSections(block, lines, depth = 3) {
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

  // Render documentBlocks in a logical order, not just file order
  const docBlocks = entity.documentBlocks ?? [];
  const byKind = kind => docBlocks.find(b => b.kind === kind);

  const importsBlock    = byKind('imports');
  const apiBlock        = byKind('api');
  const variantsBlock   = byKind('variants');
  const useCasesBlock   = byKind('useCases');
  const guidelinesBlock = byKind('guidelines');
  const a11yBlock       = byKind('accessibility');

  if (importsBlock)    renderImports(importsBlock, lines);
  if (apiBlock)        renderApi(apiBlock, lines);
  if (variantsBlock)   renderVariants(variantsBlock, lines);
  if (useCasesBlock)   renderUseCases(useCasesBlock, lines);
  if (guidelinesBlock) renderGuidelines(guidelinesBlock, lines);

  // Any sections blocks in documentBlocks
  for (const block of docBlocks.filter(b => b.kind === 'sections')) {
    renderSections(block, lines, 2);
  }

  if (a11yBlock) renderAccessibility(a11yBlock, lines);

  // Pull in agentDocumentBlocks.sections — they often contain examples and
  // how-it-works notes that are equally useful for human documentation.
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
    'Renders documentBlocks (imports, api, variants, useCases, guidelines, accessibility) ' +
    'and agentDocumentBlocks sections into a single .md-ready string. ' +
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
