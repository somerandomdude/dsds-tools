// Shared markdown rendering for real DSDS 0.20.0 entities (sections/
// traits/sourceFiles/combos/api/$extensions/shared) — used by get-entity.js,
// get-agent-context.js and get-document-block.js (and the markdown-export
// package) so the
// four tools render the same fields the same way instead of drifting apart.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve as resolvePath } from 'node:path';
import { getApiForEntry } from './prop-extractor.js';
import { renderTable } from '../render/table.js';
import { VENDOR_DIR } from './schema-order.js';

// Upstream's item-address model, from the vendored lib.js.
const { itemAddresses, resolveAddress } = createRequire(import.meta.url)(join(VENDOR_DIR, 'scripts/lib.js'));

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
// A local code file: `rel: source` since 0.22.0 (`rel: file` is for DSDS
// documents only). `rel: file` is still read, for a document that predates it.
const CODE_FILE_RELS = new Set(['source', 'file']);

export function resolveFileRef20(entityFilePath, ref) {
  if (!ref || !CODE_FILE_RELS.has(ref.rel) || typeof ref.href !== 'string' || !entityFilePath) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref.href)) return null; // a URL or package, not a local file
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
function renderSanityUiExtension(data, lines, { compact = false, forBuild = false, omitKeys = [], omittedNames = [] } = {}) {
  renderSanityUiFacts(data, lines);
  let omitted = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    // Left out by the server's configuration (`agentContextOmit`).
    if (omitKeys.includes(key)) {
      omitted += 1;
      omittedNames.push(`com.sanity.ui.${key}`);
      continue;
    }

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
    for (const [k, v] of prose) {
      if (forBuild && PORTING_ONLY_KEYS.has(k)) continue;
      const text = forBuild ? dropPortingOnlySubsections(asText20(v)) : asText20(v);
      if (text.trim()) lines.push('', text);
    }
  }
  return omitted;
}

// `forBuild` keeps what an agent writing new code needs from a migration
// guide and drops what only someone porting v3 code can use.
//
// Kept: the prop-mapping table and the breaking changes. They correct v3
// habits from training data: `flex={1}` → `flexGrow={1}`, `wrap` →
// `flexWrap`. Two runs failed to build when the whole guide was gated (see
// get-agent-context.js), so the mapping must stay.
//
// Dropped: the codemod (a command to run over existing v3 files) and "Key
// differences", which restates the table in prose. Each guide gave the same
// renames three or four times over, and on 2026-10-07 agents asked for 30–35
// components in one call and got ~320k characters back. Their feedback named
// it: "repeated checklists and migration notes; the rules I needed were
// buried". A verbose call still returns every word.
const PORTING_ONLY_KEYS = new Set(['codemod']);
const PORTING_ONLY_SUBSECTION = /^#{2,4}\s+(codemod|key differences)\b/i;

/** Remove `### Codemod` / `### Key differences` subsections from a guide's markdown. */
function dropPortingOnlySubsections(text) {
  const out = [];
  let skipLevel = 0;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = !inFence && line.match(/^(#{1,6})\s/);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && PORTING_ONLY_SUBSECTION.test(line)) skipLevel = level;
    }
    if (!skipLevel) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

// An unknown namespace is tool configuration, not guidance: for an agent
// building UI it is noise. On 2026-10-07 three `io.jev` blocks — the Jev
// judge's own configuration, attached to guidelines it evaluates — came to
// 72k of a 298k-character get_agent_context response. `forBuild` names the
// namespace and its size instead, so the drop is never silent and the data is
// one dsds_get_entity call away.
function renderOmittedExtension(namespace, data, lines) {
  const size = JSON.stringify(data)?.length ?? 0;
  lines.push(`- *Tool data for \`${namespace}\` not shown (${size.toLocaleString('en-US')} characters of tool configuration); \`dsds_get_entity\` returns it.*`);
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
 * fact. Returns how many were dropped, so the caller can say so. `forBuild`
 * keeps them but drops their porting-only parts — see PORTING_ONLY_KEYS.
 * `omit` lists dotted paths to leave out entirely — a namespace (`io.jev`) or
 * one block in it (`com.sanity.ui.migrationGuide`); the paths left out are
 * pushed onto `omittedNames`.
 */
export function renderExtensions20(extensions, lines, { heading = null, compact = false, forBuild = false, omit = [], omittedNames = [] } = {}) {
  const namespaces = Object.keys(extensions ?? {});
  if (!namespaces.length) return 0;
  const start = lines.length;
  if (heading) lines.push(heading, '');
  let omitted = 0;
  for (const ns of namespaces) {
    const data = extensions[ns];
    if (omit.includes(ns)) {
      omitted += 1;
      omittedNames.push(ns);
      continue;
    }
    const omitKeys = omit.filter((p) => p.startsWith(`${ns}.`)).map((p) => p.slice(ns.length + 1));
    if (ns === 'com.sanity.ui') omitted += renderSanityUiExtension(data, lines, { compact, forBuild, omitKeys, omittedNames });
    else if (ns === 'com.figma') renderFigmaExtension(data, lines);
    else if (forBuild) renderOmittedExtension(ns, data, lines);
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
  // A local code file: `rel: source` since 0.22.0, `rel: file` before. A
  // `source` that's a URL or a package falls through to the plain link below.
  const isLocalFile = (example.ref?.rel === 'file' || example.ref?.rel === 'source') &&
    typeof example.ref.href === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(example.ref.href);
  if (isLocalFile) {
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
// A `rel: same-as` ref (`to: "<entryId>#<itemId>"`) means this item takes
// its content from an item declared once elsewhere — in the base document's
// `shared[]` or in any entry loaded with it (see loader.js) — instead of
// restating it.
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

/**
 * Look one item up in the resolvable pool (`shared[]` plus sibling entries).
 *
 * Uses upstream's address model (processing model §2): an item is addressed
 * by its `id`, or by the id derived from its text when it has none, so
 * `button#keep-labels-short` finds an item whose statement is "Keep labels
 * short." An address that names two things is ambiguous (an error in
 * DSDS-05), and resolves to nothing here rather than to a guess.
 */
function lookupSharedItem(to, sharedEntries) {
  const anchor = splitAnchor(to);
  if (!anchor || !sharedEntries?.length) return null;
  const sharedEntry = sharedEntries.find((s) => s.id === anchor.sharedId);
  if (!sharedEntry) return null;
  const { candidate } = resolveAddress(itemAddresses(sharedEntry), anchor.itemId);
  return candidate?.type === 'item' ? candidate.target : null;
}

function findSameAsTarget(item, sharedEntries) {
  const sameAs = (item.refs ?? []).find((r) => SAME_AS_RELS.has(r.rel) && typeof r.to === 'string');
  return sameAs ? lookupSharedItem(sameAs.to, sharedEntries) : null;
}

// ── Shared rules in a multi-component answer ───────────────────────────────
//
// A rule the docs declare once and point to (`same-as`) was written out in
// full under every component pointing to it: the form-field rules under
// Checkbox, Radio, Switch, Select and TextInput, the tone rules under Card,
// Text and Badge. Agents named exactly those as the repetition (2026-10-08).
// A multi-component answer now gives each such rule in full once, at the top,
// and each component names it in a line: its own bold lead sentence, or its
// first sentence, or its id. No summary is written by hand.

/** The address of the shared rule a pure pointer stands for (`forms#border-contrast`), or null. */
export function sharedRuleRef(item, sharedEntries) {
  const { pure, target } = resolveSharedItem20(item, sharedEntries, ['statement']);
  if (!pure || !target) return null;
  return (item.refs ?? []).find((r) => SAME_AS_RELS.has(r.rel) && typeof r.to === 'string')?.to ?? null;
}

/** A rule named in one line: its bold lead ("**Error text, not error color alone.**"), else its first sentence, else its id. */
export function ruleLead(statement, ref) {
  const text = asText20(statement ?? '').trim();
  const bold = text.match(/^\*\*(.+?)\*\*/);
  if (bold) return bold[1].trim();
  const sentence = text.match(/^.+?[.!?](?=\s|$)/s)?.[0] ?? text;
  if (sentence && sentence.length <= 160) return sentence.replace(/\s+/g, ' ');
  if (sentence) return `${sentence.slice(0, 140).replace(/\s+\S*$/, '')}…`;
  return ref ?? '';
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
  // `refines` is a field of its own since 0.22.0, on the agent rule, with no
  // `rel`; before, it was a `refs` entry with `rel: refines`. Both are read.
  const pointers = [
    ...(item?.refs ?? []).filter((r) => SAME_AS_RELS.has(r.rel) || r.rel === 'refines'),
    ...(Array.isArray(item?.refines) ? item.refines.map((r) => ({ ...r, rel: 'refines' })) : []),
  ].filter((r) => typeof r?.to === 'string' && splitAnchor(r.to));
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

/**
 * What to print for an item with no content of its own and nothing to inline.
 *
 * A `same-as` that did not resolve is a broken ref and must not look like a
 * working pointer — both used to print "see X", so a rule could disappear
 * from a page with nothing on the page saying so. `dsds doctor` fails on the
 * same condition ("item references"). Any other ref (an external link) is a
 * legitimate pointer and keeps the plain "see X".
 */
function unresolvedLabel(item) {
  const sameAs = (item.refs ?? []).find((r) => r.rel === 'same-as' && typeof r.to === 'string');
  if (sameAs) return `**Unresolved reference:** \`${sameAs.to}\` — this rule could not be found.`;
  // A statement-less item with a `relates-to` href says "this rule is tracked
  // over there" (0.22.0; `external-link` before).
  const pointer =
    (item.refs ?? []).find((r) => (r.rel === 'relates-to' || r.rel === 'external-link') && r.href) ??
    (item.refs ?? []).find((r) => r.to || r.href);
  return pointer ? `see ${pointer.to ?? pointer.href}` : '(see refs)';
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
    renderExtensions20(item.$extensions, lines, { forBuild: ctx.forBuild, omit: ctx.omit, omittedNames: ctx.omittedNames });
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
      lines.push(`- ${unresolvedLabel(item)}`);
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

  // A shared rule given in full at the top of this answer: name it in one line.
  const sharedRef = ctx.sharedRules?.size ? sharedRuleRef(item, ctx.sharedEntries) : null;
  if (sharedRef && ctx.sharedRules.has(sharedRef)) {
    const lvl = item.level ?? target?.level;
    lines.push(`- ${showLevel && lvl ? `**${lvl}** — ` : ''}${ruleLead(target.statement, sharedRef)} *(shared rule, see top)*`);
    return;
  }

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
    // Nothing to inline. An external link is a legitimate pointer. A
    // `same-as` that did not resolve is a broken ref, and must not look like
    // a working one: both used to print "see X", so a rule could vanish from
    // a page with nothing on the page saying so. `dsds doctor` fails on the
    // same condition ("item references").
    lines.push(`- ${level}${unresolvedLabel(item)}`);
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
  renderExtensions20(item.$extensions, lines, { forBuild: ctx.forBuild, omit: ctx.omit, omittedNames: ctx.omittedNames });
}

function renderGuidelines(section, lines, ctx) {
  // `framing` (when-to-use/how-to-use) is guidelines-specific; the newer
  // base-level `context` (anatomy/terms/keyboard/events/namespaced) is a
  // different, section-kind-agnostic concept the spec freed this name up
  // for — a guidelines section could in principle carry both.
  if (section.framing) lines.push(`*Framing: ${section.framing}*`, '');
  if (section.context) lines.push(`*Context: ${section.context}*`, '');
  // "Checked by: manual" says how a reviewer verifies the rule. An agent
  // writing the code has no use for it: 78 lines in one 2026-10-07 batch.
  for (const item of section.items ?? []) renderGuidelineItem(item, lines, ctx, { showCheckedBy: !ctx.forBuild });
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
    lines.push(`**${marker} ${title ?? unresolvedLabel(item)}**${optional}`, '');
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
  renderExtensions20(section.$extensions, lines, { forBuild: ctx.forBuild, omit: ctx.omit, omittedNames: ctx.omittedNames });
}

/** Renders every section in `sections`, optionally filtered by audience (`for`). */
export function renderSections20(sections, lines, { audience = null, depth = 2, filePath = null, sharedEntries = [], forBuild = false, omit = [], omittedNames = [], sharedRules = null } = {}) {
  const ctx = { filePath, sharedEntries, forBuild, omit, omittedNames, sharedRules };
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

// The allowed values of a prop, written after its type name. v5 declares its
// unions as `typeof POSITION[number]`, so the type column alone said
// `Responsive<Position>` and nothing about which positions exist. Agents on
// 2026-10-08 avoided `sticky`, which is valid, and wrote custom CSS instead.
// The extractor already reads the real values; they just weren't shown.
const MAX_LISTED_VALUES = 24;

/** `0–9`, `"absolute" | "fixed"` — integer runs collapse to a range. */
export function formatPropValues(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isInteger(v)) {
      let j = i;
      while (j + 1 < values.length && Number.isInteger(values[j + 1]) && values[j + 1] === values[j] + 1) j++;
      out.push(j - i >= 2 ? `${v}–${values[j]}` : String(v));
      if (j - i === 1) out.push(String(values[j]));
      i = j;
    } else {
      out.push(typeof v === 'string' ? `"${v}"` : String(v));
    }
  }
  const shown = out.length > MAX_LISTED_VALUES ? [...out.slice(0, MAX_LISTED_VALUES), '…'] : out;
  return shown.join(' | ');
}

/** True when the type text already names every value, as in `'button' | 'a'`. */
function typeSpellsValues(type, values) {
  if (typeof type !== 'string') return false;
  return values.every((v) => type.includes(typeof v === 'string' ? v : String(v)));
}

function propRow(prop) {
  const inherited = prop.inheritedFrom ? ` *(from \`${cell20(prop.inheritedFrom)}\`)*` : '';
  const values = Array.isArray(prop.values) && prop.values.length && !typeSpellsValues(prop.type, prop.values)
    ? formatPropValues(prop.values)
    : null;
  return {
    prop: `\`${cell20(prop.name)}\``,
    type: prop.type
      ? `\`${cell20(prop.type)}\`${values ? `: \`${cell20(values)}\`` : ''}`
      : (values ? `\`${cell20(values)}\`` : null),
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

// ── Shared prop groups ─────────────────────────────────────────────────────
//
// Box, Flex, Grid, Card and Text all take the same margin props, and Box,
// Flex and Grid the same padding, position and border props. Listed under
// every component, those rows were 18.9k of 30k prop-table characters in a
// 26-component lookup, and it was the top complaint in that run.
//
// The first fix listed a group under the first component that had it, then
// pointed back ("as listed under `box` above"). Agents did not follow those
// pointers; one guessed Divider's props rather than look under Checkbox. So
// a multi-component answer now lists each shared group ONCE, at the top, with
// the components that take it. Each component lists only its own props and
// names the groups it also takes. The reference always goes to one
// predictable place and says what it includes.

// A group this small is cheaper to repeat than to refer to.
const MIN_SHARED_GROUP_ROWS = 3;

const groupSignature = (name, rows) =>
  `${name}:${JSON.stringify(rows.map((r) => [r.name, r.type, r.values, r.required, asText20(r.description ?? '')]))}`;

function propGroups(props) {
  const groups = new Map();
  for (const p of props) if (p.inheritedFrom) (groups.get(p.inheritedFrom) ?? groups.set(p.inheritedFrom, []).get(p.inheritedFrom)).push(p);
  return groups;
}

/** `MarginProps` → "Margin props", `FlexChildProps` → "Flex child props". */
export function propGroupLabel(name) {
  const words = String(name).replace(/Props$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} props`;
}

/**
 * The prop groups that two or more of `entities` take with identical rows,
 * as Map<signature, { name, rows, owners }>. Groups under
 * MIN_SHARED_GROUP_ROWS rows are left to each component's own table.
 */
export function findSharedPropGroups(entities, propsConfig) {
  const found = new Map();
  for (const entity of entities) {
    const result = getApiForEntry(entity, propsConfig);
    if (result.status !== 'fresh' && result.status !== 'unverified') continue;
    for (const [name, rows] of propGroups(result.props?.props ?? [])) {
      if (rows.length < MIN_SHARED_GROUP_ROWS) continue;
      const sig = groupSignature(name, rows);
      const entry = found.get(sig) ?? { name, rows, owners: [] };
      entry.owners.push(entity.identifier);
      found.set(sig, entry);
    }
  }
  return new Map([...found].filter(([, g]) => g.owners.length >= 2));
}

/**
 * The shared rules two or more of `entities` point to, as
 * Map<ref, { item, owner, owners }>: `item` is a pointer to render in full,
 * `owner` the entity whose file and pool resolve it. Only sections the answer
 * serves count (`audience: 'agent'` serves `for: agent` and `for: all`).
 */
export function findSharedRules(entities, { audience = null } = {}) {
  const found = new Map();
  for (const entity of entities) {
    const pool = entity.__sharedEntries ?? [];
    const refs = new Set();
    for (const section of entity.sections ?? []) {
      if (section.kind !== 'guidelines') continue;
      if (audience && section.for !== audience && section.for !== 'all') continue;
      for (const item of section.items ?? []) {
        const ref = sharedRuleRef(item, pool);
        if (!ref || refs.has(ref)) continue;
        refs.add(ref);
        const entry = found.get(ref) ?? { item, owner: entity, owners: [] };
        entry.owners.push(entity.identifier);
        found.set(ref, entry);
      }
    }
  }
  // A one-line name only saves anything when the rule is much longer than the
  // name. A one-sentence rule is cheaper to repeat than to refer to, and reads
  // better in place, so only rules at least twice their short line move.
  const worthIt = ([ref, r]) => {
    const full = [];
    renderGuidelineItem(r.item, full, { filePath: r.owner.__filePath, sharedEntries: r.owner.__sharedEntries ?? [] });
    const target = resolveSharedItem20(r.item, r.owner.__sharedEntries ?? [], ['statement']).target;
    const short = `${ruleLead(target?.statement, ref)} *(shared rule, see top)*`;
    return full.join('\n').length >= 2 * short.length;
  };
  return new Map([...found].filter((e) => e[1].owners.length >= 2 && worthIt(e)));
}

/** The block at the top of a multi-component answer: each shared rule once, in full. */
export function renderSharedRules(shared, lines, { forBuild = false } = {}) {
  if (!shared?.size) return;
  lines.push(
    '## Shared rules',
    '',
    'Several of the components below follow these same rules. Each is given in full once here; a component names it in one line.',
    '',
  );
  for (const [ref, r] of [...shared].sort((a, b) => b[1].owners.length - a[1].owners.length || a[0].localeCompare(b[0]))) {
    renderGuidelineItem(r.item, lines, { filePath: r.owner.__filePath, sharedEntries: r.owner.__sharedEntries ?? [], forBuild }, { showCheckedBy: !forBuild });
    lines.push(`  - Rule \`${ref}\`. Applies to: ${r.owners.map((o) => `\`${o}\``).join(', ')}.`);
  }
  lines.push('');
}

/** The block at the top of a multi-component answer: each shared group once. */
export function renderSharedPropGroups(shared, lines) {
  if (!shared?.size) return;
  lines.push(
    '## Shared prop groups',
    '',
    'Several of the components below take these same props. Each is listed once here; a component\'s own API names the groups it takes.',
    '',
  );
  for (const g of [...shared.values()].sort((a, b) => b.owners.length - a.owners.length || a.name.localeCompare(b.name))) {
    lines.push(`### ${propGroupLabel(g.name)}`, '', `Taken by: ${g.owners.map((o) => `\`${o}\``).join(', ')}.`, '');
    lines.push(...renderTable(g.rows.map((r) => propRow({ ...r, inheritedFrom: null })), API_COLUMNS).split('\n'), '');
  }
}

/**
 * Render the prop table for an entry, resolved through the extractor cache.
 * `sharedPropGroups` (from findSharedPropGroups) lists groups already given at
 * the top of a multi-component answer: their rows are left out here and the
 * groups are named instead.
 */
export function renderApi20(entity, lines, propsConfig, { sharedPropGroups = null } = {}) {
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
        let own = props;
        const takes = [];
        if (sharedPropGroups?.size) {
          const skip = new Set();
          for (const [name, rows] of propGroups(props)) {
            if (!sharedPropGroups.has(groupSignature(name, rows))) continue;
            takes.push(propGroupLabel(name).toLowerCase());
            for (const r of rows) skip.add(r);
          }
          own = props.filter((p) => !skip.has(p));
        }
        if (own.length) lines.push(...renderTable(own.map(propRow), API_COLUMNS).split('\n'), '');
        else if (takes.length) lines.push('No props of its own beyond the shared groups.', '');
        if (takes.length) lines.push(`Also takes the shared ${takes.join(', ')} (listed under **Shared prop groups** at the top).`, '');
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
