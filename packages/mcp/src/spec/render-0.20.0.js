// Shared markdown rendering for real DSDS 0.20.0 entities (sections/
// traits/sourceFiles/combos/api/$extensions/shared) — used by get-entity.js,
// get-agent-context.js, get-document-block.js, and to-markdown.js so the
// four tools render the same fields the same way instead of drifting apart.
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { getApiForEntry } from './prop-extractor-0.20.0.js';

const asText20 = (v) => (typeof v === 'string' ? v : (v?.value ?? ''));

// GFM treats an unescaped `|` as a column separator even inside inline code,
// so a union type like `A | B` would break the table — escape it, and
// collapse newlines (a literal one ends the row).
const cell20 = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const LANGUAGE_BY_EXT = { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js', '.css': 'css' };

/**
 * Resolves a `rel: file` ref's target, relative to the entity's own file
 * (see loader.js's `__filePath`). Shared by chunk code resolution and
 * inline example code — both name a sibling source file the same way.
 * Never throws: a moved/unreadable file degrades to null, not a crash.
 */
export function resolveFileRef20(entityFilePath, ref) {
  if (!ref || ref.rel !== 'file' || typeof ref.href !== 'string' || !entityFilePath) return null;
  try {
    const absPath = resolvePath(dirname(entityFilePath), ref.href);
    const code = readFileSync(absPath, 'utf-8');
    return { code, language: LANGUAGE_BY_EXT[extname(absPath)] ?? '' };
  } catch {
    return null;
  }
}

// ── $extensions — namespace allowlist, never a silent drop ─────────────────
//
// com.sanity.ui's real corpus shape is implementation-status/tracking
// metadata (implemented/availableIn/tracking), not props — the actual API
// table is served separately via sourceFiles (see renderApi20). com.figma
// has no real corpus usage yet; rendered per the extensions.schema.yaml
// example shape. Any other namespace still renders — as raw tool data in a
// collapsed <details> block — rather than vanishing.

function renderSanityUiExtension(data, lines) {
  if (typeof data.implemented === 'boolean') {
    lines.push(`- Implemented: ${data.implemented ? 'yes' : 'no'}`);
  }
  if (data.availableIn?.length) lines.push(`- Available in: ${data.availableIn.join(', ')}`);
  if (data.tracking) lines.push(`- Tracking: ${data.tracking}`);
  if (data.context) lines.push(`- ${asText20(data.context)}`);
}

function renderFigmaExtension(data, lines) {
  if (data.displayName) lines.push(`- Figma component: \`${data.displayName}\``);
  if (data.nodeId) lines.push(`- Node id: \`${data.nodeId}\``);
  if (data.context) lines.push(`- ${asText20(data.context)}`);
}

function renderGenericExtension(namespace, data, lines) {
  lines.push('<details>', `<summary>Tool data: ${namespace}</summary>`, '');
  lines.push('```json', JSON.stringify(data, null, 2), '```', '', '</details>');
}

/** Renders `$extensions` at any level (entity, section, or item). Empty/missing is a silent no-op; a populated unknown namespace is never dropped. */
export function renderExtensions20(extensions, lines, { heading = null } = {}) {
  const namespaces = Object.keys(extensions ?? {});
  if (!namespaces.length) return;
  if (heading) lines.push(heading, '');
  for (const ns of namespaces) {
    const data = extensions[ns];
    if (ns === 'com.sanity.ui') renderSanityUiExtension(data, lines);
    else if (ns === 'com.figma') renderFigmaExtension(data, lines);
    else renderGenericExtension(ns, data, lines);
  }
  lines.push('');
}

// ── Examples / showcase ──────────────────────────────────────────────────

function renderShowcase20(showcase, lines) {
  lines.push(`- **Showcase** (${showcase.kind}): ${showcase.url}`);
  if (showcase.alt) lines.push(`  - Alt: ${showcase.alt}`);
  if (showcase.note) lines.push(`  - ${asText20(showcase.note)}`);
}

/** Renders one `common/example.schema.yaml` object — title/description, a visual showcase, and/or a resolved code file. */
function renderExample20(example, lines, filePath) {
  if (!example) return;
  if (example.title) lines.push(`**${example.title}**`, '');
  if (example.description) lines.push(asText20(example.description), '');
  if (example.showcase) renderShowcase20(example.showcase, lines);
  if (example.ref?.rel === 'file') {
    const resolved = resolveFileRef20(filePath, example.ref);
    lines.push(
      resolved
        ? `\`\`\`${resolved.language}\n${resolved.code.trimEnd()}\n\`\`\``
        : `*Example file not found: \`${example.ref.href}\`*`,
      ''
    );
  } else if (example.ref) {
    lines.push(`- See: ${example.ref.href ?? example.ref.to} (${example.ref.rel})`, '');
  }
}

// ── shared[] / same-as resolution ───────────────────────────────────────
//
// A `rel: same-as` ref (`to: "<sharedId>#<itemId>"`) means this item pulls
// its statement from a pooled `shared[]` entry instead of restating it —
// resolve and inline that item's text rather than rendering a bare pointer.

function findSameAsTarget(item, sharedEntries) {
  const sameAs = (item.refs ?? []).find((r) => r.rel === 'same-as' && typeof r.to === 'string');
  if (!sameAs || !sharedEntries?.length) return null;
  const hashIdx = sameAs.to.indexOf('#');
  if (hashIdx === -1) return null;
  const sharedId = sameAs.to.slice(0, hashIdx);
  const itemId = sameAs.to.slice(hashIdx + 1);
  const sharedEntry = sharedEntries.find((s) => s.id === sharedId);
  if (!sharedEntry) return null;
  for (const section of sharedEntry.sections ?? []) {
    const found = (section.items ?? []).find((i) => i.id === itemId);
    if (found) return found;
  }
  return null;
}

function renderFreeform(freeform, lines, ctx = {}, depth = 3) {
  const heading = '#'.repeat(depth);
  for (const item of freeform ?? []) {
    if (item.title) lines.push(`${heading} ${item.title}`, '');
    if (item.body) lines.push(asText20(item.body), '');
    for (const example of item.examples ?? []) renderExample20(example, lines, ctx.filePath);
    if (item.refs?.length) {
      lines.push('*See also:*');
      for (const r of item.refs) {
        const rel = r.rel ? ` (${r.rel})` : '';
        const role = r.role ? ` — ${r.role}` : '';
        const note = r.note ? `: ${r.note}` : '';
        lines.push(`- ${r.to ?? r.href}${rel}${role}${note}`);
      }
      lines.push('');
    }
    renderExtensions20(item.$extensions, lines);
    // `items` nests sub-entries to any depth (same field name as a
    // section's top-level `items` — a different concept, not reused code).
    if (item.items?.length) renderFreeform(item.items, lines, ctx, depth + 1);
  }
}

function renderDefinitions(section, lines, ctx) {
  for (const item of section.items ?? []) {
    lines.push(`- **${item.term}**: ${asText20(item.definition)}`);
  }
  lines.push('');
  renderFreeform(section.freeform, lines, ctx);
}

// A prose-only example (title/description, no code ref or visual showcase)
// is a QA-checklist aid for a `checkedBy: manual` item — "How to satisfy
// this: review X, confirm Y" — not doc content a Do/Don't reader is asking
// for. An example with a real `ref`/`showcase` is a genuine demonstration
// (e.g. a controlled-usage code sample) and stays regardless of caller.
function isProseOnlyExample(example) {
  return Boolean(example) && !example.ref && !example.showcase;
}

/**
 * Renders one guideline item's statement (or same-as-resolved text),
 * checkedBy, alternatives, example, and $extensions. `showLevel` is turned
 * off by callers that already convey should/should-not via a heading (e.g.
 * "### When to use" / "### Do") so the level isn't stated twice.
 * `showChecklistExample` is turned off in the same spirit by Best
 * practices, to drop only the prose-only "how to satisfy this" kind.
 * `showCheckedBy` drops the "Checked by: manual/automated" line the same
 * callers turn off — internal verification-process metadata, not doc prose.
 */
export function renderGuidelineItem(item, lines, ctx, { showLevel = true, showChecklistExample = true, showCheckedBy = true, showAlternatives = true } = {}) {
  const level = showLevel && item.level ? `**${item.level}** — ` : '';
  const sameAsTarget = item.statement == null ? findSameAsTarget(item, ctx.sharedEntries) : null;
  const text = item.statement ?? sameAsTarget?.statement ?? item.guidance;
  if (text != null) {
    lines.push(`- ${level}${asText20(text)}`);
  } else {
    // No statement, and no resolvable same-as target — the item points
    // somewhere else instead (e.g. an external-link), see `refs`.
    const pointer = (item.refs ?? []).find((r) => r.rel === 'same-as' || r.rel === 'external-link');
    lines.push(`- ${level}${pointer ? `see ${pointer.to ?? pointer.href}` : '(see refs)'}`);
  }
  if (item.checkedBy && showCheckedBy) lines.push(`  - Checked by: ${item.checkedBy}`);
  if (showAlternatives) {
    for (const alt of item.alternatives ?? []) {
      lines.push(`  - Alternative: \`${alt.to ?? alt.href}\`${alt.rel ? ` (${alt.rel})` : ''}`);
    }
  }
  const skipExample = isProseOnlyExample(item.example) && !showChecklistExample;
  if (item.example && !skipExample) renderExample20(item.example, lines, ctx.filePath);
  renderExtensions20(item.$extensions, lines);
}

function renderGuidelines(section, lines, ctx) {
  // `framing` (when-to-use/how-to-use) is guidelines-specific; the newer
  // base-level `context` (anatomy/terms/keyboard/events/namespaced) is a
  // different, section-kind-agnostic concept the spec freed this name up
  // for — a guidelines section could in principle carry both.
  if (section.framing) lines.push(`*Framing: ${section.framing}*`, '');
  if (section.context) lines.push(`*Context: ${section.context}*`, '');
  for (const item of section.items ?? []) renderGuidelineItem(item, lines, ctx);
  lines.push('');
  renderFreeform(section.freeform, lines, ctx);
}

function renderSteps(section, lines, ctx) {
  const isOrdered = section.ordered !== false;
  // Rendered as a bold literal marker ("**1.**"), not markdown list syntax ("1. "). A real
  // ordered/unordered list only renders correctly in the Google Docs export when every item is
  // one line with nothing between them — the Docs API only continues a list's numbering across
  // adjacent bulleted paragraphs (there is no way to reuse an existing list's id for a
  // non-adjacent paragraph). Steps almost always carry a multi-paragraph body or a code example
  // between items, which breaks that adjacency, so every item silently restarted at "1." in the
  // exported doc. A literal marker has no such constraint and is always correct.
  (section.items ?? []).forEach((item, i) => {
    const marker = isOrdered ? `${i + 1}.` : '-';
    const optional = item.optional ? ' *(optional)*' : '';
    lines.push(`**${marker} ${item.title ?? item.label}**${optional}`, '');
    // Spec field is `instruction`, but every corpus entry authored so far uses `description`
    // instead — accept both rather than silently drop every step's body text.
    const body = item.description ?? item.instruction;
    if (body) lines.push(asText20(body), '');
    for (const example of item.examples ?? []) renderExample20(example, lines, ctx.filePath);
  });
  renderFreeform(section.freeform, lines, ctx);
}

function renderGenericSection(section, lines, ctx) {
  for (const item of section.items ?? []) {
    if (item.title) lines.push(`- **${item.title}**${item.body ? `: ${asText20(item.body)}` : ''}`);
    else if (item.body) lines.push(`- ${asText20(item.body)}`);
  }
  if (section.items?.length) lines.push('');
  renderFreeform(section.freeform, lines, ctx);
}

const SECTION_TITLES = {
  definitions: 'Definitions',
  guidelines: 'Guidelines',
  steps: 'Steps',
  section: 'Notes',
};

/**
 * Turns a custom section kind into a readable heading when it has no
 * `title` of its own — e.g. `sanity.migration-note` → "Migration note".
 * Strips a namespace prefix, splits on dashes, capitalizes the first word.
 */
function humanizeSectionKind(kind) {
  const withoutNamespace = kind.includes('.') ? kind.slice(kind.lastIndexOf('.') + 1) : kind;
  const words = withoutNamespace.split('-').filter(Boolean);
  if (!words.length) return kind;
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

/** Renders one 0.20.0 section, headed by its kind/title, at the given depth. */
export function renderSection20(section, lines, depth = 2, ctx = {}) {
  const heading = '#'.repeat(depth);
  const title = section.title ?? SECTION_TITLES[section.kind] ?? humanizeSectionKind(section.kind);
  lines.push(`${heading} ${title}`, '');
  switch (section.kind) {
    case 'definitions': renderDefinitions(section, lines, ctx); break;
    case 'guidelines': renderGuidelines(section, lines, ctx); break;
    case 'steps': renderSteps(section, lines, ctx); break;
    default: renderGenericSection(section, lines, ctx); break;
  }
  renderExtensions20(section.$extensions, lines);
}

/** Renders every section in `sections`, optionally filtered by audience (`for`). */
export function renderSections20(sections, lines, { audience = null, depth = 2, filePath = null, sharedEntries = [] } = {}) {
  const ctx = { filePath, sharedEntries };
  for (const section of sections ?? []) {
    if (audience && section.for !== audience && section.for !== 'all') continue;
    renderSection20(section, lines, depth, ctx);
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

function renderPropRow(prop) {
  const req = prop.required ? 'yes' : '—';
  const type = prop.type ? `\`${cell20(prop.type)}\`` : '—';
  const inherited = prop.inheritedFrom ? ` *(from \`${cell20(prop.inheritedFrom)}\`)*` : '';
  return `| \`${cell20(prop.name)}\` | ${type} | ${req} | ${cell20(asText20(prop.description ?? ''))}${inherited} |`;
}

/**
 * Renders the API table for a 0.20.0 entity's `sourceFiles`, resolved through
 * the fingerprint-validated extractor cache (DEC-2). Never throws and never
 * fabricates a table from stale data — see prop-extractor-0.20.0.js.
 */
/**
 * Render the `alsoAccepts` line(s) for an API block.
 *
 * The extractor emits two shapes and they need different sentences:
 *
 *   "native <img> attributes"        a whole phrase, from a component that
 *                                    forwards to a native element
 *   "React.ComponentProps<'div'>"    a bare type name
 *
 * The old single template — `Also accepts native attributes from \`${...}\`` —
 * was written for the type shape and read as "accepts native attributes from
 * `native <dialog> attributes`" once the phrase shape appeared. Each shape
 * now gets the sentence it fits, and the angle brackets stay inside code
 * formatting either way so a markdown renderer cannot eat them as a tag.
 */
function renderAlsoAccepts(entries) {
  const phrases = [];
  const types = [];
  for (const entry of entries) {
    const text = String(entry);
    if (/^native\s+<[^>]+>\s+attributes$/i.test(text)) {
      phrases.push(text.replace(/<([^>]+)>/, '`<$1>`'));
    } else {
      types.push(`\`${text}\``);
    }
  }
  const out = [];
  if (phrases.length) out.push(`*Also accepts ${phrases.join(', ')}.*`, '');
  if (types.length) out.push(`*Also accepts native attributes from ${types.join(', ')}.*`, '');
  return out;
}

export function renderApi20(entity, lines, propsConfig) {
  const result = getApiForEntry(entity, propsConfig);

  switch (result.status) {
    case 'unconfigured':
    case 'no-source':
      return; // Nothing to render — not an error, just nothing configured/available.
    case 'missing':
      lines.push(
        '## API',
        '',
        `*No extracted prop data yet for this entry. See [Source files](#source-files).*`,
        ''
      );
      return;
    case 'stale':
      lines.push(
        '## API',
        '',
        '> **Stale prop cache** — the source has changed since the last extraction and the ' +
          'extractor toolchain (Node ≥22.6) is unavailable to regenerate it. Omitting the table ' +
          'rather than risk showing an outdated one.',
        ''
      );
      return;
    case 'unverified':
    case 'fresh': {
      const props = result.props?.props ?? [];
      const alsoAccepts = result.props?.alsoAccepts ?? [];
      // Extraction succeeded. A component with no props of its own is a real
      // answer, not a gap — List.ItemImage forwards everything to a native
      // <img>. Returning silently here used to leave the caller with an empty
      // block, which it labelled "No API data available for this entry", the
      // same wording it uses when extraction genuinely failed. An agent then
      // read a documented component as undocumented and went looking for
      // props that do not exist.
      if (!props.length && !alsoAccepts.length) return;
      lines.push('## API', '');
      if (result.status === 'unverified') {
        lines.push('> *Freshness not verified against source (`uiSourceRoot` not configured).*', '');
      }
      if (props.length) {
        lines.push('| Prop | Type | Required | Description |');
        lines.push('|------|------|----------|-------------|');
        for (const prop of props) lines.push(renderPropRow(prop));
        lines.push('');
      } else {
        lines.push('This component has no props of its own.', '');
      }
      if (alsoAccepts.length) {
        lines.push(...renderAlsoAccepts(alsoAccepts));
      }
      return;
    }
  }
}
