// The icon set, read from the docs themselves.
//
// A design system can document its icon set as a `dsds.asset` entry with
// `assetType: icon` (an incubating DSDS 0.22.0 kind): one definitions item per
// icon, with its name, purpose, alternative names and usage notes. When one is
// loaded, the icon tools read it. Before this they read a separate TSV
// (`ICON_GUIDELINES_PATH`), so the same icon data lived in two places and the
// docs entry agents could open was never the one the tools used. The TSV is
// still read when no asset entry exists.
import { loadIconGuidelines } from './icon-suggest.js';

/** Every loaded `dsds.asset` entry documenting icons. */
export function iconAssetEntries(systems) {
  return (systems ?? []).flatMap((s) => s.entities ?? []).filter((e) => e?.kind === 'dsds.asset' && e.assetType === 'icon');
}

/** `@sanity/icons` from an npm package URL in an asset's `source`, else null. */
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
  for (const entry of iconAssetEntries(systems)) {
    for (const item of assetMembers(entry)) {
      if (!item?.term) continue;
      const own = String(item.id ?? '').toLowerCase();
      out.set(item.term, {
        aliases: (item.aliases ?? []).map((a) => String(a).trim().toLowerCase()).filter((a) => a && a !== own),
        purpose: isPlaceholder(item.definition) ? '' : String(item.definition).trim(),
        ...splitUsage(item.usage),
      });
    }
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
    iconPackage: iconPackage ?? packageFromSource(asset?.source) ?? null,
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
export function renderAssetMembers(entity, lines, { verbose = false } = {}) {
  const members = assetMembers(entity);
  if (!members.length) return;
  const pkg = packageFromSource(entity.source);
  lines.push('## Members', '');
  if (entity.assetType === 'icon' && pkg) {
    const sample = members.find((m) => m.term)?.term ?? 'AddIcon';
    lines.push(
      `${members.length} icons. Import each from its own subpath: \`import { ${sample} } from '${pkg}/${sample.replace(/Icon$/, '')}'\`. ` +
        'Search them by purpose with `dsds_find_icon` when it is available.',
      '',
    );
  }
  const undescribed = [];
  for (const m of members) {
    if (!m?.term) continue;
    if (isPlaceholder(m.definition)) { undescribed.push(m.term); continue; }
    const own = String(m.id ?? '').toLowerCase();
    const aliases = (m.aliases ?? []).map(String).filter((a) => a.toLowerCase() !== own);
    lines.push(`- **${m.term}** — ${String(m.definition).trim()}${aliases.length ? ` *Also:* ${aliases.join(', ')}` : ''}`);
    if (verbose && m.usage) {
      const { whenToUse, whenNotToUse } = splitUsage(m.usage);
      if (whenToUse) lines.push(`  - Use when: ${whenToUse}`);
      if (whenNotToUse) lines.push(`  - Not for: ${whenNotToUse}`);
    }
  }
  if (undescribed.length) lines.push('', `Also in the set, not yet described: ${undescribed.join(', ')}.`);
  lines.push('');
}
