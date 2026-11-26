// The icon set, read from the docs themselves.
//
// A design system can document its icon set as an icon asset entry: a
// `kind: entry` whose `$extensions` declare `assetType: icon`, plus a
// `rel: source` ref to the npm package that ships the icons. Each icon is its
// own `kind: component` entry, marked with `iconOf` (the set's id) in its
// `$extensions`. Its name is the icon name, its `metadata.aliases` are the
// alternative names, and its when-to-use guidance is in its sections. When the icons are loaded, the icon tools read them.
// Before this they read a separate TSV (`ICON_GUIDELINES_PATH`), so the same
// icon data lived in two places. The TSV is still read when no asset entry
// exists.
//
// The older form, with the icons as a definitions list on the set entry, is
// still read so a corpus can move over without a flag day.
import { loadIconGuidelines, iconSubpath } from './icon-suggest.js';

/**
 * The asset type an entry declares, or null. Read from `$extensions` (any
 * namespace, so the entry names its own), or from the top-level field of the
 * legacy `dsds.asset` form.
 */
export function assetTypeOf(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (entity.kind === 'dsds.asset' && entity.assetType) return entity.assetType;
  for (const ext of Object.values(entity.$extensions ?? {})) {
    if (ext && typeof ext === 'object' && typeof ext.assetType === 'string') return ext.assetType;
  }
  return null;
}

/** The npm source of an entity: its `source` field (legacy) or its `rel: source` ref. */
export function sourceOf(entity) {
  if (entity?.source) return entity.source;
  return (entity?.refs ?? []).find((r) => r?.rel === 'source' && typeof r.href === 'string') ?? null;
}

/** The namespace object of an icon component's $extensions, or null. */
function iconExt(entity) {
  if (!entity || typeof entity !== 'object') return null;
  for (const ext of Object.values(entity.$extensions ?? {})) {
    if (ext && typeof ext === 'object' && typeof ext.iconOf === 'string') return ext;
  }
  return null;
}

/** The statements of a when-to-use section at one level, joined into a sentence. */
function guidanceText(entity, level) {
  const out = [];
  for (const section of entity?.sections ?? []) {
    if (section.kind !== 'guidelines' || section.framing !== 'when-to-use') continue;
    for (const item of section.items ?? []) {
      if (item?.level === level && item.statement) out.push(String(item.statement).trim());
    }
  }
  return out.join(' ');
}

/**
 * One icon as a member: { term, id, aliases, purpose, whenToUse, whenNotToUse,
 * described }. Reads an icon component entry (`$extensions.iconOf`), or a
 * legacy definitions item (`term`, `definition`, `usage`).
 */
export function normalizeMember(entity) {
  const ext = iconExt(entity);
  if (ext) {
    return {
      term: entity.name,
      id: String(entity.id ?? ''),
      aliases: (entity.metadata?.aliases ?? []).map(String),
      purpose: ext.described === false ? '' : String(entity.description ?? '').trim(),
      whenToUse: guidanceText(entity, 'should'),
      whenNotToUse: guidanceText(entity, 'should-not'),
      described: ext.described !== false,
      owner: ext.iconOf,
    };
  }
  const own = String(entity.id ?? '').toLowerCase();
  const usage = splitUsage(entity.usage);
  return {
    term: entity.term,
    id: String(entity.id ?? ''),
    aliases: (entity.aliases ?? []).map((a) => String(a).trim().toLowerCase()).filter((a) => a && a !== own),
    purpose: isPlaceholder(entity.definition) ? '' : String(entity.definition).trim(),
    whenToUse: usage.whenToUse,
    whenNotToUse: usage.whenNotToUse,
    described: !isPlaceholder(entity.definition),
    owner: entity.id,
  };
}

/**
 * The icon components that belong to an icon set, normalized. Given no set id,
 * every icon component in the loaded docs.
 */
export function iconMembers(systems, setId = null) {
  const out = [];
  for (const s of systems ?? []) {
    for (const e of s.entities ?? []) {
      const ext = iconExt(e);
      if (ext && (setId == null || ext.iconOf === setId)) out.push(normalizeMember(e));
    }
  }
  return out;
}

/** Every loaded entry that declares an icon asset type. */
export function iconAssetEntries(systems) {
  return (systems ?? []).flatMap((s) => s.entities ?? []).filter((e) => assetTypeOf(e) === 'icon');
}

/** `@sanity/icons` from an npm package URL in an asset's source, else null. */
export function packageFromSource(source) {
  const href = typeof source === 'string' ? source : source?.href;
  const m = typeof href === 'string' && href.match(/npmjs\.com\/package\/((?:@[^/]+\/)?[^/?#]+)/);
  return m ? m[1] : null;
}

/** A definition that is only a placeholder comment says nothing. */
export const isPlaceholder = (text) => typeof text !== 'string' || !text.trim() || /^<!--[\s\S]*-->$/.test(text.trim());

/** The members of an asset entry: the items of its first definitions section. */
export function assetMembers(entity) {
  const section = (entity?.sections ?? []).find((s) => s.kind === 'definitions');
  return section?.items ?? [];
}

/** "Use when: - a Do not use: - b" → { whenToUse: 'a', whenNotToUse: 'b' }. */
function splitUsage(usage) {
  const text = typeof usage === 'string' ? usage.replace(/\s+/g, ' ').trim() : '';
  const [use, not] = text.split(/Do not use:/i);
  const clean = (s) => (s ?? '').replace(/^\s*Use when:\s*/i, '').trim();
  return { whenToUse: clean(use), whenNotToUse: clean(not) };
}

/**
 * The icon set as Map<IconName, { aliases, purpose, whenToUse, whenNotToUse }>,
 * the shape the icon tools already use. Empty when no icon asset is loaded.
 */
export function iconCatalog(systems) {
  const out = new Map();
  const add = (m) => {
    if (!m.term) return;
    out.set(m.term, { aliases: m.aliases, purpose: m.purpose, whenToUse: m.whenToUse, whenNotToUse: m.whenNotToUse });
  };
  for (const m of iconMembers(systems)) add(m);
  // The older form: members listed on the set entry itself.
  for (const entry of iconAssetEntries(systems)) {
    for (const item of assetMembers(entry)) add(normalizeMember(item));
  }
  return out;
}

/**
 * Icon guidance for the tools: the icon asset entry when one is loaded, else the
 * TSV at `guidelinesPath`. Also returns the icon package, from config or from
 * the asset's `source`.
 */
export function resolveIconGuidance({ systems = [], guidelinesPath = null, iconPackage = null } = {}) {
  const catalog = iconCatalog(systems);
  const asset = iconAssetEntries(systems)[0] ?? null;
  return {
    guidelines: catalog.size ? catalog : loadIconGuidelines(guidelinesPath),
    source: catalog.size ? 'asset' : (guidelinesPath ? 'tsv' : null),
    iconPackage: iconPackage ?? packageFromSource(sourceOf(asset)) ?? null,
    assetId: asset?.identifier ?? null,
  };
}

/**
 * An asset entry's members, one line each, for agents: name, purpose and
 * alternative names. For an icon set from an npm package, the import rule is
 * stated once at the top rather than per icon. Members whose definition is
 * only a placeholder comment are listed by name at the end, never shown as
 * `<!-- TODO … -->`. `verbose` adds each member's usage notes.
 *
 * Rendered generically, the 236-icon entry was a 19k-character list of
 * "name: definition" lines with no import path and the placeholders showing.
 */
export function renderAssetMembers(entity, lines, { verbose = false, members: given = null } = {}) {
  // `given` is already normalized (icon components). Without it, the set's own definitions list.
  const members = given?.length ? given : assetMembers(entity).map(normalizeMember);
  const listed = members.filter((m) => m.term);
  if (!listed.length) return;
  members.splice(0, members.length, ...listed);
  if (!members.length) return;
  const pkg = packageFromSource(sourceOf(entity));
  lines.push('## Members', '');
  if (assetTypeOf(entity) === 'icon' && pkg) {
    const sample = members[0].term;
    lines.push(
      `${members.length} icons. Import each from its own subpath: \`import { ${sample} } from '${iconSubpath(pkg, sample)}'\`. ` +
        'Search them by purpose with `dsds_find_icon` when it is available.',
      '',
    );
  }
  const undescribed = [];
  for (const m of members) {
    if (!m.described) { undescribed.push(m.term); continue; }
    const aliases = m.aliases.map(String);
    lines.push(`- **${m.term}** — ${m.purpose}${aliases.length ? ` *Also:* ${aliases.join(', ')}` : ''}`);
    if (verbose) {
      if (m.whenToUse) lines.push(`  - Use when: ${m.whenToUse}`);
      if (m.whenNotToUse) lines.push(`  - Not for: ${m.whenNotToUse}`);
    }
  }
  if (undescribed.length) lines.push('', `Also in the set, not yet described: ${undescribed.join(', ')}.`);
  lines.push('');
}
