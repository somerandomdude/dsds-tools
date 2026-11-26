import { describe, it, expect } from 'vitest';
import { assetTypeOf, iconCatalog, iconMembers, packageFromSource, renderAssetMembers, resolveIconGuidance, sourceOf } from '../src/icon-catalog.js';

// The icon set is an entry whose $extensions declare assetType: icon and whose
// rel: source ref names the npm package. Each icon is its own component entry,
// marked with iconOf (the set's id), with its when-to-use guidance on it.
const set = {
  kind: 'entry', id: 'icons', name: 'Icons',
  $extensions: { 'com.sanity.ui': { assetType: 'icon' } },
  refs: [{ href: 'https://www.npmjs.com/package/@sanity/icons', rel: 'source' }],
  sections: [{ kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'A rule.' }] }],
};
const cog = {
  kind: 'component', id: 'icon-cog', name: 'CogIcon', description: 'View or manage settings.',
  metadata: { aliases: ['Settings', 'Preferences'] },
  $extensions: { 'com.sanity.ui': { iconOf: 'icons', described: true } },
  sections: [{ kind: 'guidelines', for: 'all', framing: 'when-to-use', items: [
    { id: 'cog-use-1', level: 'should', statement: 'To open settings.' },
    { id: 'cog-not-1', level: 'should-not', statement: 'For tools. Use WrenchIcon instead.', alternatives: [{ to: 'icon-wrench' }] },
  ] }],
};
const inbox = {
  kind: 'component', id: 'icon-inbox', name: 'InboxIcon', description: 'The InboxIcon icon from the Sanity icon set.',
  $extensions: { 'com.sanity.ui': { iconOf: 'icons', described: false } },
};
const systems = [{ entities: [set, cog, inbox] }];

describe('icon catalog from an icon asset entry', () => {
  it('finds the asset type and the npm source', () => {
    expect(assetTypeOf(set)).toBe('icon');
    expect(assetTypeOf(cog)).toBeNull();
    expect(packageFromSource(sourceOf(set))).toBe('@sanity/icons');
    expect(packageFromSource('https://example.com')).toBeNull();
  });

  it('lists the icon components of the set', () => {
    expect(iconMembers(systems, 'icons').map((m) => m.term)).toEqual(['CogIcon', 'InboxIcon']);
    expect(iconMembers(systems, 'other')).toEqual([]);
  });

  it('builds the guidance the icon tools use from each component', () => {
    const c = iconCatalog(systems);
    expect(c.get('CogIcon')).toEqual({
      aliases: ['Settings', 'Preferences'], purpose: 'View or manage settings.',
      whenToUse: 'To open settings.', whenNotToUse: 'For tools. Use WrenchIcon instead.',
    });
    expect(c.get('InboxIcon').purpose).toBe('');
  });

  it('prefers the asset entry over the TSV, and takes the package from it', () => {
    const g = resolveIconGuidance({ systems, guidelinesPath: '/nonexistent.tsv' });
    expect(g.source).toBe('asset');
    expect(g.iconPackage).toBe('@sanity/icons');
    expect(resolveIconGuidance({ systems: [], guidelinesPath: null }).guidelines.size).toBe(0);
  });

  it('renders members in one line each, with the import rule once and no placeholders', () => {
    const lines = [];
    renderAssetMembers(set, lines, { members: iconMembers(systems, 'icons') });
    const out = lines.join('\n');
    expect(out).toContain("Import each from its own subpath: `import { CogIcon } from '@sanity/icons/Cog'`");
    expect(out).toContain('- **CogIcon** — View or manage settings. *Also:* Settings, Preferences');
    expect(out).not.toContain('TODO');
    expect(out).toContain('Also in the set, not yet described: InboxIcon.');
  });

  it('adds usage notes verbosely', () => {
    const lines = [];
    renderAssetMembers(set, lines, { verbose: true, members: iconMembers(systems, 'icons') });
    expect(lines.join('\n')).toContain('  - Not for: For tools. Use WrenchIcon instead.');
  });

  it('still reads the legacy form, with the icons as a definitions list on the set', () => {
    const legacy = {
      kind: 'dsds.asset', assetType: 'icon', source: { href: 'https://www.npmjs.com/package/@sanity/icons' },
      sections: [{ kind: 'definitions', items: [
        { id: 'cog', term: 'CogIcon', definition: 'View or manage settings.', aliases: ['cog', 'Settings'], usage: 'Use when: - To open settings. Do not use: - For tools.' },
      ] }],
    };
    expect(assetTypeOf(legacy)).toBe('icon');
    expect(iconCatalog([{ entities: [legacy] }]).get('CogIcon').whenToUse).toBe('- To open settings.');
  });
});
