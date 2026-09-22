// Render a DSDS entry as a publication-ready Markdown page.
//
// Deliberately not `dsds_get_entity`'s output. That dumps a document in
// document order for an agent to read; this lays out a page for a person:
// guidelines regrouped into "Usage guidelines" (when to use / when not to)
// and "Best practices" (Do / Don't), traits as per-variant sections,
// accessibility-category guidelines surfaced under Accessibility. The layout
// is the product, which is why it lives apart from the server.
//
// Section content renders through dsds-mcp's shared renderers, so what a
// heading contains never drifts from what the MCP serves — only where it
// sits on the page differs.

import { getApiForEntry } from 'dsds-mcp/src/spec/prop-extractor.js';
import { renderCombos20, renderEvents20, renderExtensions20, renderGuidelineItem, renderSections20 } from 'dsds-mcp/src/spec/render.js';
import { resolveStatusDisplay20 } from 'dsds-mcp/src/spec/dsds-lib.js';

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

// Real 0.20.0: traits/combos/sourceFiles/imports are top-level fields, and
// `sections` (definitions/guidelines/steps/section) replaces the whole
// documentBlocks/agentDocumentBlocks model.
//
// `dsds_to_markdown` is the human-facing doc export (feeds dsds-gdocs-export),
// so it targets the shape of the hand-authored reference docs in
// "Sanity UI component documentation" (e.g. button.md): Basic example → API
// documentation → Usage guidelines → Best practices → States → Variants →
// Accessibility → Content, with `for: agent` sections dropped entirely (they
// restate the same guidance for a different audience — get-agent-context.js
// is where that copy belongs, not the human doc). This reshapes the same
// section/trait data the generic renderSections20/renderTraits20 render
// flatly, by feeding it through the block-shaped renderers above
// (renderImports/renderApi/renderUseCases/renderGuidelines/renderStates/
// renderVariants/renderAccessibility/renderContent). Those are this file's
// layout primitives: they own the publishing headings and the Do/Don't
// split, which is the whole reason this tool exists separately from
// get_entity. Section data is adapted into their block shape rather than
// re-implementing the layout.
// section.schema.yaml's `for` enum is human|agent|all (default all) — a
// human-facing doc renders `human` and `all`, never an `agent`-only section.
const isHumanSection = (s) => s.for === 'human' || s.for === 'all' || !s.for;

// Opt-in escape hatch for machine consumers (see `includeAgentContent` on
// dsds_to_markdown / `dsds markdown --include-agent-content`).
//
// Why this exists: `for: agent` sections are a third of the corpus (201 of
// most sections) and carry the most precise, compiler-checked
// API facts — the kind a human doc deliberately keeps out of the reading flow.
// Dropping them is right for a doc site or a Google Doc, and wrong for an
// eval harness or an agent context file, which measured the cost directly:
// HStack's exported markdown was 58 lines containing none of its as/gap-only
// rules, none of the TS2322 detail, and none of the spread caveat, because
// all of it lives in `for: agent` sections.
//
// Default stays human-only so no existing consumer changes behaviour.
const sectionFilter = (includeAgentContent) =>
  includeAgentContent ? (() => true) : isHumanSection;

function apiPropsBlock(entity, propsConfig) {
  const result = getApiForEntry(entity, propsConfig);
  if (result.status !== 'fresh' && result.status !== 'unverified') return null;
  const props = result.props?.props ?? [];
  const events = result.props?.events ?? null;
  // Events alone are enough to render the block: a component that forwards
  // everything to a native element has no props of its own and still has an
  // event surface worth documenting.
  if (!props.length && !events?.handlers?.length) return null;
  return {
    unverified: result.status === 'unverified',
    alsoAccepts: result.props?.alsoAccepts ?? [],
    events,
    polymorphic: result.props?.polymorphic ?? null,
    properties: props.map(p => ({
      identifier: p.name,
      description: p.description,
      type: p.type,
      values: p.values,
      defaultValue: p.defaultValue ?? p.default,
      required: p.required,
    })),
  };
}

function renderApi20Rich(entity, lines, propsConfig) {
  const result = getApiForEntry(entity, propsConfig);
  if (result.status === 'unconfigured' || result.status === 'no-source') return;
  if (result.status === 'missing') {
    lines.push(
      '## API documentation',
      '',
      result.extractedFrom
        ? `*The props extractor ran but produced no entry for this component. It read \`${result.extractedFrom}\` — if the component is newer than that checkout, point \`SANITY_UI_ROOT\` at one that has it.*`
        : '*No extracted prop data yet for this entry. See `sourceFiles` on the entity.*',
      ''
    );
    return;
  }
  if (result.status === 'stale') {
    lines.push(
      '## API documentation', '',
      '> **Stale prop cache** — the source has changed since the last extraction and the ' +
        'extractor toolchain (Node ≥22.6) is unavailable to regenerate it. Omitting the table ' +
        'rather than risk showing an outdated one.',
      ''
    );
    return;
  }
  const block = apiPropsBlock(entity, propsConfig);
  if (!block) return;
  if (block.unverified) lines.push('*Freshness not verified against source (`uiSourceRoot` not configured).*', '');
  // renderApi owns the heading, and bails on an empty prop list — so an
  // events-only component has to write its own, or the event table lands
  // under whatever section preceded it.
  if (block.properties.length) renderApi({ properties: block.properties }, lines);
  else lines.push('## API documentation', '', 'This component has no props of its own.', '');
  if (block.alsoAccepts.length) {
    lines.push(`Native HTML attributes (\`${block.alsoAccepts.join('`, `')}\`, etc.) pass through to the base element.`, '');
  }
  lines.push(...renderEvents20(block.events, 'markdown', block.polymorphic));
}

/** Item-level `tags` relate one rule across categories — see section.tags' own
 *  $comment for the distinction from the section-level field. */
function hasTag(item, tag) {
  return (item.tags ?? []).includes(tag);
}

const isRecommended = (item) => item.level === 'should' || item.level === 'must';

/**
 * Splits items into two headed buckets by level, rendering each via renderGuidelineItem
 * (preserves same-as/example/$extensions) rather than a lossy plain-bullet adapter.
 * Only used for Usage guidelines and Best practices (see call sites) — both suppress the
 * "Alternative: `x`" line renderGuidelineItem otherwise emits, since the alternative is
 * already named in the statement's own prose (e.g. "Use HStack instead") and the terse
 * `alternative-to` identifier repeats it with no added information.
 */
function renderSplitGuidelines20(items, lines, ctx, { yesHeading, noHeading, showChecklistExample = true }) {
  const yes = items.filter(isRecommended);
  const no = items.filter((i) => !isRecommended(i));
  if (yes.length) {
    lines.push(yesHeading, '');
    for (const item of yes) renderGuidelineItem(item, lines, ctx, { showLevel: false, showChecklistExample, showCheckedBy: false, showAlternatives: false });
    lines.push('');
  }
  if (no.length) {
    lines.push(noHeading, '');
    for (const item of no) renderGuidelineItem(item, lines, ctx, { showLevel: false, showChecklistExample, showCheckedBy: false, showAlternatives: false });
    lines.push('');
  }
}

function entityToMarkdown20(entity, lines, propsConfig, { includeAgentContent = false } = {}) {
  const keep = sectionFilter(includeAgentContent);
  const sections = entity.sections ?? [];
  const ctx = { filePath: entity.__filePath, sharedEntries: entity.__sharedEntries };
  const consumed = new Set();
  const collectMatches = (matches) => {
    matches.forEach((s) => consumed.add(s));
    const items = matches.flatMap((s) => s.items ?? []);
    return { items, sections: matches };
  };
  // `framing` (when-to-use/how-to-use) only exists on `guidelines` sections
  // — not to be confused with the base `context` field below, a same-named-
  // sounding but distinct concept the spec renamed this one away from to
  // make room for.
  const collectByFraming = (framing) => collectMatches(sections.filter((s) => keep(s) && s.kind === 'guidelines' && s.framing === framing));
  // `context` (anatomy/terms/keyboard/events/namespaced) is the section
  // base schema's newer, machine-readable way to say what job a
  // `definitions` section is doing — matched here alongside the older
  // title-string convention (`title: 'Content'`) the real corpus still
  // uses everywhere, since nothing has been re-authored to the new field
  // yet. Either one earns the same treatment.
  const collectByTitleOrContext = (title, context) =>
    collectMatches(sections.filter((s) => keep(s) && s.kind === 'definitions' && (s.title === title || (context && s.context === context))));
  const collectByGuidelinesTitle = (title) =>
    collectMatches(sections.filter((s) => keep(s) && s.kind === 'guidelines' && s.title === title));
  // Spec 0.21.0 added `tags` to a section, and DSDS-18 reads it to decide a
  // section's scope. That makes the tag — not the human-written title — the
  // machine-readable answer to "what is this section about", so the buckets
  // below collect on it. Title matching stays for the corpora that predate
  // the field: in this one, 41 sections carry `tags: [accessibility]` and 39
  // are titled "Accessibility", so neither rule alone finds all of them.
  const collectByGuidelinesTag = (tag) =>
    collectMatches(
      sections.filter(
        (s) => keep(s) && s.kind === 'guidelines' && (s.tags ?? []).includes(tag) && !consumed.has(s),
      ),
    );
  const renderSectionExtensions = (matches) => {
    for (const s of matches) renderExtensions20(s.$extensions, lines);
  };

  if (entity.imports?.length) {
    // entity.imports has no explicit language field — every real corpus entry
    // so far is a `platform: react` code sample, so default to tsx rather
    // than guessing per-entity.
    renderImports({ items: entity.imports.map(i => ({ package: i.package, code: i.code, language: 'tsx' })) }, lines);
  }

  renderApi20Rich(entity, lines, propsConfig);

  const whenToUse = collectByFraming('when-to-use');
  if (whenToUse.items.length) {
    lines.push('## Usage guidelines', '');
    renderSplitGuidelines20(whenToUse.items, lines, ctx, { yesHeading: '### When to use', noHeading: '### When not to use' });
    renderSectionExtensions(whenToUse.sections);
  }

  const howToUse = collectByFraming('how-to-use');
  // An item tagged `accessibility` or `content` inside a how-to-use section
  // is surfaced under its own heading below, where a reader looks for it,
  // rather than mixed into Do/Don't.
  const bestPracticeItems = howToUse.items.filter((i) => !hasTag(i, 'accessibility') && !hasTag(i, 'content'));
  if (bestPracticeItems.length) {
    lines.push('## Best practices', '');
    renderSplitGuidelines20(bestPracticeItems, lines, ctx, { yesHeading: '### Do', noHeading: "### Don't", showChecklistExample: false });
    renderSectionExtensions(howToUse.sections);
  }

  const booleanTraits = (entity.traits ?? []).filter((t) => t.kind !== 'enum');
  if (booleanTraits.length) {
    renderStates({
      items: booleanTraits.map(t => ({ identifier: t.id, description: t.description, rationale: t.purpose })),
    }, lines);
  }

  const enumTraits = (entity.traits ?? []).filter((t) => t.kind === 'enum');
  if (enumTraits.length) {
    renderVariants({
      items: enumTraits.map(t => ({
        identifier: t.id,
        kind: 'enum',
        description: t.description,
        values: (t.values ?? []).map(v => ({ identifier: v.id, description: v.description })),
      })),
    }, lines);
  }

  renderCombos20(entity.combos, lines);

  const a11yTitled = collectByGuidelinesTitle('Accessibility');
  const a11yTagged = collectByGuidelinesTag('accessibility');
  const a11ySection = {
    items: [...a11yTitled.items, ...a11yTagged.items],
    sections: [...a11yTitled.sections, ...a11yTagged.sections],
  };
  const a11yTaggedItems = howToUse.items.filter((i) => hasTag(i, 'accessibility'));
  const a11yItems = [...a11ySection.items, ...a11yTaggedItems];
  const keyboardSection = collectByTitleOrContext('Keyboard interactions', 'keyboard');
  if (a11yItems.length || keyboardSection.items.length) {
    lines.push('## Accessibility', '');
    for (const item of a11yItems) renderGuidelineItem(item, lines, ctx, { showLevel: false, showCheckedBy: false });
    if (a11yItems.length) lines.push('');
    if (keyboardSection.items.length) {
      lines.push('### Keyboard interactions', '');
      lines.push('| Key | Action |');
      lines.push('| :---- | :---- |');
      for (const k of keyboardSection.items) lines.push(`| \`${cell(k.term)}\` | ${cell(asText(k.definition))} |`);
      lines.push('');
    }
    renderSectionExtensions(a11ySection.sections);
    renderSectionExtensions(keyboardSection.sections);
  }

  // Content arrives in two shapes. The older one is a `definitions` section
  // of term/definition labels. The newer one — after the corpus moved its
  // freeform "Content" blocks into real guidelines — is a `guidelines`
  // section tagged `content`, whose items are statements with a level. Both
  // render under one heading, statements first, because a rule outranks a
  // glossary entry for a reader writing copy.
  const contentLabels = collectByTitleOrContext('Content', 'terms');
  const contentTagged = collectByGuidelinesTag('content');
  const contentTaggedItems = howToUse.items.filter((i) => hasTag(i, 'content'));
  const contentStatements = [...contentTagged.items, ...contentTaggedItems];
  if (contentStatements.length || contentLabels.items.length) {
    lines.push('## Content', '');
    for (const item of contentStatements) {
      renderGuidelineItem(item, lines, ctx, { showLevel: false, showCheckedBy: false });
    }
    if (contentStatements.length) lines.push('');
    for (const label of contentLabels.items) {
      lines.push(`- **${cell(label.term)}:** ${asText(label.definition ?? '')}`);
    }
    if (contentLabels.items.length) lines.push('');
    renderSectionExtensions(contentTagged.sections);
    renderSectionExtensions(contentLabels.sections);
  }

  // Anything not claimed above (custom section kinds, freeform-only notes
  // like a migration guide, other titled definitions/guidelines/steps) still
  // renders — via the generic per-kind renderer — so nothing silently
  // disappears just because it doesn't match one of the named patterns above.
  const leftover = sections.filter((s) => keep(s) && !consumed.has(s));
  renderSections20(leftover, lines, { depth: 2, filePath: entity.__filePath, sharedEntries: entity.__sharedEntries });

  renderExtensions20(entity.$extensions, lines, { heading: '## Tool data' });
}

/**
 * One entry as a Markdown page.
 *
 * @param {object} entity - a loaded DSDS entry
 * @param {object|null} propsConfig - prop-extractor config, for the API table
 * @param {{includeAgentContent?: boolean}} [options] - include `for: agent` sections
 * @returns {string} the page, with no trailing newline
 */
export function entityToMarkdown(entity, propsConfig, { includeAgentContent = false } = {}) {
  const lines = [];

  // Header
  const name = entity.name ?? entity.identifier;
  lines.push(`# ${name}`, '');

  if (entity.description) {
    lines.push(asText(entity.description), '');
  }

  const meta = entity.metadata ?? {};
  // meta.status can be a bare string (legacy), one {status, platform?, ...}
  // object, or — since the per-platform array form was added — a list of
  // those. resolveStatusDisplay20 handles all three without misreading an
  // array as a single object (typeof [] === 'object' too).
  const status20 = resolveStatusDisplay20(meta.status);
  if (status20) lines.push(`**Status:** ${status20}  `, '');

  entityToMarkdown20(entity, lines, propsConfig, { includeAgentContent });
  return lines.join('\n');
}
