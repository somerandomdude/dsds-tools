// Shared markdown rendering for real DSDS 0.20.0 entities (sections/
// traits/sourceFiles/combos/api/$extensions/shared) — used by get-entity.js,
// get-agent-context.js and get-document-block.js (and the markdown-export
// package) so the
// four tools render the same fields the same way instead of drifting apart.
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { getApiForEntry } from './prop-extractor.js';
import { renderTable } from '../render/table.js';

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

// Two shapes, both real. The original is flat — implemented/availableIn/
// tracking/context directly under the namespace. The corpus now also nests one
// object per extension, each with its own `context`, so a namespace can carry
// more than one unrelated thing (implementation status *and* a migration
// guide) without the keys of one being read as the keys of the other.
//
// Flat support is not legacy politeness: extensions.schema.yaml puts no shape
// on a namespace at all, so another corpus may well use the flat form. Both
// render, and an unrecognized sub-object still prints rather than vanishing —
// the same rule as the namespace allowlist above.
function renderSanityUiExtension(data, lines, { compact = false } = {}) {
  renderSanityUiFacts(data, lines);
  let omitted = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    // The split that matters in compact mode is facts vs free text, not a
    // hardcoded key name. `implementationStatus` is nothing but facts —
    // `implemented: false` is how an agent learns a component has no v5
    // equivalent, which is build-critical and costs one line. A
    // `migrationGuide` is a codemod invocation plus pages of v3-to-v5 prose,
    // which is only useful to something that has v3 code to port.
    //
    // Measured over real get_agent_context traffic: the guides
    // are 95.9% of this block and 13.3% of ALL MCP payload, against 3.6% for
    // implementation status. See plans/008-payload-audit.md.
    const prose = Object.entries(value).filter(
      ([k, v]) => !SANITY_UI_FACTS.has(k) && typeof v === 'string',
    );
    if (compact && prose.length) {
      omitted += 1;
      continue;
    }

    lines.push('', `**${titleCase20(key)}**`, '');
    renderSanityUiFacts(value, lines);
    for (const [, v] of prose) lines.push('', asText20(v));
  }
  return omitted;
}

const SANITY_UI_FACTS = new Set(['implemented', 'availableIn', 'tracking', 'context']);

/** The known implementation-status keys, wherever they sit. */
function renderSanityUiFacts(data, lines) {
  if (typeof data.implemented === 'boolean') {
    lines.push(`- Implemented: ${data.implemented ? 'yes' : 'no'}`);
  }
  if (data.availableIn?.length) lines.push(`- Available in: ${data.availableIn.join(', ')}`);
  if (data.tracking) lines.push(`- Tracking: ${data.tracking}`);
  if (data.context) lines.push(`- ${asText20(data.context)}`);
}

/** `migrationGuide` → "Migration guide". */
function titleCase20(key) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
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

/**
 * Renders `$extensions` at any level (entity, section, or item). Empty/missing
 * is a silent no-op; a populated unknown namespace is never dropped.
 *
 * `compact` drops free-text sub-objects (migration guides) while keeping every
 * fact. Returns how many were dropped, so the caller can say so.
 */
export function renderExtensions20(extensions, lines, { heading = null, compact = false } = {}) {
  const namespaces = Object.keys(extensions ?? {});
  if (!namespaces.length) return 0;
  const start = lines.length;
  if (heading) lines.push(heading, '');
  let omitted = 0;
  for (const ns of namespaces) {
    const data = extensions[ns];
    if (ns === 'com.sanity.ui') omitted += renderSanityUiExtension(data, lines, { compact });
    else if (ns === 'com.figma') renderFigmaExtension(data, lines);
    else renderGenericExtension(ns, data, lines);
  }
  // Compact mode can empty the block out entirely. Leaving a bare heading
  // reads as "this entity has no tool data", which is the opposite of true.
  if (lines.length === start + (heading ? 2 : 0)) {
    lines.length = start;
    return omitted;
  }
  lines.push('');
  return omitted;
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
// A `rel: same-as` ref (`to: "<sharedId>#<itemId>"`) means this item takes
// its content from a pooled `shared[]` entry instead of restating it.
//
// 0.21.1 turned this from a convenience into an obligation. Before it, an
// item had to repeat the target's `level` alongside the pointer, and
// DSDS-10 existed largely to police that the copy agreed with the original
// — the schema forced the duplication, then validated it. Now a section
// item carrying `refs` is exempt from its kind's required content fields:
// a `guidelines` item needs no `level`, a `definitions` item no
// `term`/`definition`, a `steps` item no `title`. The changelog puts the
// consequence on consumers directly: "these fields are no longer
// guaranteed present. Resolve the same-as target to obtain them."
//
// So this module distinguishes two shapes, and renders them differently:
//
//   Pure pointer  — the item declares no content of its own. The target IS
//                   the item; resolve it and render it inline, so a reader
//                   gets the rule rather than a link to go and find it.
//   Sharpened     — the item states its own content AND points at a shared
//                   rule (usually `rel: refines`). The local text is what
//                   applies here; the pointer is shown alongside it so the
//                   reader can trace what it narrows.

const SAME_AS_RELS = new Set(['same-as']);

/** The `{sharedId, itemId}` a ref addresses, or null if it isn't an anchored pointer. */
function splitAnchor(to) {
  if (typeof to !== 'string') return null;
  const hashIdx = to.indexOf('#');
  if (hashIdx === -1) return null;
  return { sharedId: to.slice(0, hashIdx), itemId: to.slice(hashIdx + 1) };
}

/** Look one item up in the `shared[]` pool. */
function lookupSharedItem(to, sharedEntries) {
  const anchor = splitAnchor(to);
  if (!anchor || !sharedEntries?.length) return null;
  const sharedEntry = sharedEntries.find((s) => s.id === anchor.sharedId);
  if (!sharedEntry) return null;
  for (const section of sharedEntry.sections ?? []) {
    const found = (section.items ?? []).find((i) => i.id === anchor.itemId);
    if (found) return found;
  }
  return null;
}

function findSameAsTarget(item, sharedEntries) {
  const sameAs = (item.refs ?? []).find((r) => SAME_AS_RELS.has(r.rel) && typeof r.to === 'string');
  return sameAs ? lookupSharedItem(sameAs.to, sharedEntries) : null;
}

/**
 * Resolve a section item against the shared pool.
 *
 * `contentFields` are the fields that make an item say something on its own
 * — the ones 0.21.1 made optional in the presence of `refs`. An item with
 * none of them set is a pure pointer.
 *
 * @returns {{pure: boolean, target: object|null, pointers: Array}}
 *   `pure`      the item declares no content of its own
 *   `target`    the resolved `same-as` item, when there is one
 *   `pointers`  refs worth showing next to a sharpened item's own content
 */
export function resolveSharedItem20(item, sharedEntries, contentFields) {
  const hasOwnContent = contentFields.some((f) => item?.[f] != null);
  const target = findSameAsTarget(item, sharedEntries);
  const pointers = (item?.refs ?? []).filter(
    (r) => (SAME_AS_RELS.has(r.rel) || r.rel === 'refines') && typeof r.to === 'string' && splitAnchor(r.to),
  );
  return { pure: !hasOwnContent && Boolean(item?.refs?.length), target, pointers };
}

/**
 * A section item with everything it borrows merged in.
 *
 * `resolveSharedItem20` answers "is this a pointer, and what does it point
 * at" for the renderers. This is for callers that hand an item to something
 * other than the renderer — `dsds_get_document_block` serialises the raw
 * block as JSON, so without this an agent asking for a block gets
 * `{"refs":[{"to":"shared-foundations#…","rel":"same-as"}]}` and no rule at
 * all. That was already true before 0.21.1 (a pointer never carried a
 * `statement`); the relaxation only removed the `level` crumb that made it
 * look less empty than it was.
 *
 * Only a pure pointer is hydrated, and `refs` is kept, so provenance
 * survives and a sharpened item's own wording is never overwritten.
 */
export function hydrateSharedItem20(item, sharedEntries, contentFields = ['statement', 'term', 'definition', 'title']) {
  const { pure, target } = resolveSharedItem20(item, sharedEntries, contentFields);
  return pure && target ? { ...target, ...item, refs: item.refs } : item;
}

/** `- Shared rule: …` trace line for a sharpened item. */
function pushSharedPointers(pointers, lines, sharedEntries, indent = '  ') {
  for (const r of pointers) {
    const resolved = lookupSharedItem(r.to, sharedEntries);
    const verb = r.rel === 'refines' ? 'Refines' : 'Shared rule';
    const gist = resolved?.statement ? ` — ${truncateGist(asText20(resolved.statement))}` : '';
    lines.push(`${indent}- ${verb}: \`${r.to}\`${gist}`);
  }
}

function truncateGist(text, max = 140) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
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
    // 0.21.1 gave definitions a `refs` field, so a term declared once in
    // `shared` can be borrowed instead of restated.
    const { pure, target, pointers } = resolveSharedItem20(item, ctx.sharedEntries, ['term', 'definition']);
    const source = pure && target ? target : item;
    const term = source.term ?? item.term;
    const definition = source.definition ?? item.definition;
    if (term == null && definition == null) {
      const pointer = (item.refs ?? []).find((r) => r.to || r.href);
      lines.push(`- see ${pointer?.to ?? pointer?.href ?? '(refs)'}`);
      continue;
    }
    lines.push(`- **${term}**: ${asText20(definition)}`);
    if (!pure) pushSharedPointers(pointers, lines, ctx.sharedEntries);
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
  const { pure, target, pointers } = resolveSharedItem20(item, ctx.sharedEntries, ['statement']);

  // A pure pointer renders as the item it points at. Everything the reader
  // needs — level, statement, checkedBy, alternatives, example — comes from
  // the target, because 0.21.1 stopped requiring the item to restate any of
  // it. A sharpened item keeps its own content and shows the pointer.
  const source = pure && target ? target : item;
  const effectiveLevel = item.level ?? (pure ? target?.level : undefined);
  const level = showLevel && effectiveLevel ? `**${effectiveLevel}** — ` : '';
  const text = source.statement ?? item.statement ?? target?.statement ?? item.guidance;

  if (text != null) {
    lines.push(`- ${level}${asText20(text)}`);
  } else {
    // Nothing to inline: either the pointer is external, or its target is
    // outside the shared pool this render can see.
    const pointer = (item.refs ?? []).find((r) => r.rel === 'same-as' || r.rel === 'external-link');
    lines.push(`- ${level}${pointer ? `see ${pointer.to ?? pointer.href}` : '(see refs)'}`);
  }

  const checkedBy = source.checkedBy ?? item.checkedBy;
  if (checkedBy && showCheckedBy) lines.push(`  - Checked by: ${checkedBy}`);
  if (showAlternatives) {
    for (const alt of source.alternatives ?? item.alternatives ?? []) {
      lines.push(`  - Alternative: \`${alt.to ?? alt.href}\`${alt.rel ? ` (${alt.rel})` : ''}`);
    }
  }
  // Only a sharpened item shows where it came from. A pure pointer has been
  // rendered as the shared rule itself, so a "shared rule:" line under it
  // would just repeat what the reader has already been given.
  if (!pure) pushSharedPointers(pointers, lines, ctx.sharedEntries);

  const example = source.example ?? item.example;
  const skipExample = isProseOnlyExample(example) && !showChecklistExample;
  if (example && !skipExample) renderExample20(example, lines, ctx.filePath);
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
    // A step carrying `refs` needs no `title` of its own as of 0.21.1.
    const { pure, target, pointers } = resolveSharedItem20(item, ctx.sharedEntries, ['title']);
    const source = pure && target ? target : item;
    const title = source.title ?? item.title ?? item.label;
    lines.push(`**${marker} ${title ?? `see ${(item.refs ?? [])[0]?.to ?? '(refs)'}`}**${optional}`, '');
    // Spec field is `instruction`, but every corpus entry authored so far uses `description`
    // instead — accept both rather than silently drop every step's body text.
    const body = source.description ?? source.instruction ?? item.description ?? item.instruction;
    if (body) lines.push(asText20(body), '');
    if (!pure) pushSharedPointers(pointers, lines, ctx.sharedEntries, '');
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
function renderSection20(section, lines, depth = 2, ctx = {}) {
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

/** Renders `traits` (variants/states) as the closed-value-set constraints agents most often get wrong.
 *
 * Grouped by `traitType`, required since 0.21.0. Before it there was no field
 * that told the two apart — `kind` is `boolean`/`enum`, the form the value
 * takes, and a boolean trait can be either sort (`outlined` is a variant,
 * `hover` a state). So a flat list was the honest rendering; now it isn't.
 *
 * The grouping is what a reader is usually after: which of these do I set, and
 * which does the component put itself into. A trait with no `traitType` (a
 * 0.20.x document, still loadable here) falls into a third group rather than
 * being silently filed under one of the two.
 */
export function renderTraits20(traits, lines) {
  if (!traits?.length) return;
  lines.push('## Traits (variants & states)', '');

  const groups = [
    ['Variants', traits.filter((t) => t?.traitType === 'variant')],
    ['States', traits.filter((t) => t?.traitType === 'state')],
    ['Unclassified', traits.filter((t) => t?.traitType !== 'variant' && t?.traitType !== 'state')],
  ].filter(([, list]) => list.length);

  // One group and nothing to contrast it with: a heading would be noise.
  const labelled = groups.length > 1;
  for (const [label, list] of groups) {
    if (labelled) lines.push(`**${label}**`, '');
    for (const trait of list) renderTrait20(trait, lines);
    if (labelled) lines.push('');
  }
  if (!labelled) lines.push('');
}

function renderTrait20(trait, lines) {
  if (trait.kind === 'enum') {
    const values = (trait.values ?? []).map((v) => `\`${v.id}\``).join(' | ');
    lines.push(`- \`${trait.id}\` — enum: ${values}`);
  } else {
    lines.push(`- \`${trait.id}\` — boolean`);
  }
  if (trait.description) lines.push(`  - ${asText20(trait.description)}`);
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

const API_COLUMNS = [
  { key: 'prop', header: 'Prop' },
  { key: 'type', header: 'Type' },
  { key: 'required', header: 'Required' },
  { key: 'description', header: 'Description' },
];

function propRow(prop) {
  const inherited = prop.inheritedFrom ? ` *(from \`${cell20(prop.inheritedFrom)}\`)*` : '';
  return {
    prop: `\`${cell20(prop.name)}\``,
    type: prop.type ? `\`${cell20(prop.type)}\`` : null,
    required: prop.required ? 'yes' : null,
    description: `${cell20(asText20(prop.description ?? ''))}${inherited}`,
  };
}

/**
 * Renders the API table for a 0.20.0 entity's `sourceFiles`, resolved through
 * the fingerprint-validated extractor cache (DEC-2). Never throws and never
 * fabricates a table from stale data — see prop-extractor.js.
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

const EVENT_COLUMNS = [
  { key: 'event', header: 'Event' },
  { key: 'signature', header: 'Signature' },
  { key: 'specific', header: 'Element-specific' },
];

/**
 * The native event surface, from the extractor's `events` block.
 *
 * Why this is separate from the prop table rather than more rows in it: an
 * event has no default, is never required, and has no value set, so three of
 * the six prop columns are empty for every row — and the handlers would
 * outnumber the real props on most form controls, burying the part a caller
 * has to choose. The extractor's own markdown makes the same split.
 *
 * `specialized` is the column worth reading. React declares every handler on
 * every element, so `onClick` on a `<select>` is true of the type and not
 * interesting; `onChange` narrowed to `ChangeEvent<HTMLSelectElement>` is the
 * element's own declaration, and that is the one to wire.
 */
/**
 * Tags whose whole point is being operated. A caller wiring one of these is
 * doing the expected thing, and the handler list is the API.
 *
 * Hand-written, and it holds tag NAMES only — never a handler or a type. Same
 * discipline as the extractor's FORM/UNIVERSAL lists: a name here can make the
 * output shorter or longer, never wrong, because nothing is rendered that
 * @types/react did not declare.
 *
 * The design system draws the same line for itself — `INTERACTIVE_TAG =
 * ['button', 'a']` in types/Interactive.ts constrains what `as` accepts on
 * Button and PressArea — and this is that idea widened to the focusable
 * form and command elements.
 */
const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'details', 'dialog', 'input', 'option', 'select', 'summary', 'textarea',
]);

/** Render a component's event handlers, noting how many the table omits. */
export function renderEvents20(events, polymorphic = null) {
  const handlers = events?.handlers ?? [];
  if (!handlers.length) return [];

  // Two ways to earn the table, because neither alone is the question.
  //
  // `specialized` means React narrowed a handler for this element — `<select>`
  // gets `ChangeEvent<HTMLSelectElement>`. It catches the form controls and
  // `<dialog>`, and it misses every clickable thing: React declares `onClick`
  // once on DOMAttributes, so `<button>` and `<a>` specialize nothing at all.
  // Gating on it alone hid Button, IconButton, PressArea, ListButtonItem,
  // Link and SkipToContent — the components whose main prop is a handler.
  //
  // Interactivity catches those. Neither catches `<hr>`, `<svg>` or a bare
  // `<div>`, which is the point: a documented `onClick` on Divider or Spinner
  // is the precise thing the no-onclick-on-non-interactive lint rule exists to
  // catch, and publishing it as an API table would be the design system
  // teaching the violation it elsewhere forbids.
  const interactive = INTERACTIVE_TAGS.has(events.tag);
  if (!interactive && !handlers.some(h => h.specialized)) return [];

  const rows = handlers.map(h => ({
    event: `\`${cell20(h.name)}\``,
    signature: h.signature ? `\`${cell20(h.signature)}\`` : null,
    specific: h.specialized ? 'yes' : 'no',
  }));

  const out = ['### Events', ''];
  if (events.source) {
    out.push(
      `Native \`<${events.tag}>\` handlers, forwarded to the underlying element. Read from \`${events.source}\`.`,
      ''
    );
  }
  // A polymorphic component's element is a default, not a fact — and the
  // event TYPES move with it, so a reader who changes `as` cannot copy the
  // signatures below unchanged.
  if (polymorphic?.defaultTag) {
    out.push(
      `\`<${polymorphic.defaultTag}>\` is the default element. \`${polymorphic.prop ?? 'as'}\` changes it, and the event types change with it.`,
      ''
    );
  }
  out.push(...renderTable(rows, EVENT_COLUMNS).split('\n'), '');

  // The table is a subset by design (DOMAttributes declares 84 events). Say
  // how big the rest is, so "not listed" never reads as "not accepted".
  const remaining = (events.nativeHandlerCount ?? 0) - handlers.length;
  if (remaining > 0) {
    out.push(
      `\`<${events.tag}>\` accepts ${remaining} further React handlers; these are the ones a component of this kind is normally wired to.`,
      ''
    );
  }
  return out;
}

/** Render the prop table for an entry, resolved through the extractor cache. */
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
        result.extractedFrom
          ? `*The props extractor ran but produced no entry for this component. It read \`${result.extractedFrom}\` — if the component is newer than that checkout, point \`SANITY_UI_ROOT\` at one that has it.*`
          : `*No extracted prop data yet for this entry. See [Source files](#source-files).*`,
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
      const events = result.props?.events ?? null;
      // Extraction succeeded. A component with no props of its own is a real
      // answer, not a gap — List.ItemImage forwards everything to a native
      // <img>. Returning silently here used to leave the caller with an empty
      // block, which it labelled "No API data available for this entry", the
      // same wording it uses when extraction genuinely failed. An agent then
      // read a documented component as undocumented and went looking for
      // props that do not exist.
      if (!props.length && !alsoAccepts.length && !events?.handlers?.length) return;
      lines.push('## API', '');
      if (result.status === 'unverified') {
        lines.push('> *Freshness not verified against source (`uiSourceRoot` not configured).*', '');
      }
      if (props.length) {
        lines.push(...renderTable(props.map(propRow), API_COLUMNS).split('\n'), '');
      } else {
        lines.push('This component has no props of its own.', '');
      }
      if (alsoAccepts.length) {
        lines.push(...renderAlsoAccepts(alsoAccepts));
      }
      lines.push(...renderEvents20(events, result.props?.polymorphic));
      return;
    }
  }
}
