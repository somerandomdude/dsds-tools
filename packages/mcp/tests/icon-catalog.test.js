import { describe, it, expect } from 'vitest';
import { iconCatalog, packageFromSource, renderAssetMembers, resolveIconGuidance } from '../src/icon-catalog.js';

// The icon tools read the docs' icon asset entry (`kind: dsds.asset`,
// `assetType: icon`) when one is loaded; the TSV is the fallback (2026-10-13).
const asset = {
  kind: 'dsds.asset', identifier: 'icons', assetType: 'icon',
  source: { href: 'https://www.npmjs.com/package/@sanity/icons' },
  sections: [
    { kind: 'definitions', items: [
      { id: 'cog', term: 'CogIcon', definition: 'View or manage settings.', aliases: ['cog', 'Settings', 'Preferences'],
        usage: 'Use when: - To open settings. Do not use: - For tools. Use WrenchIcon instead.' },
      { id: 'inbox', term: 'InboxIcon', definition: '<!-- TODO: describe InboxIcon -->' },
    ] },
    { kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'A rule.' }] },
  ],
};
const systems = [{ entities: [asset] }];

describe('icon catalog from a dsds.asset entry', () => {
  it('reads the package name from an npm source URL', () => {
    expect(packageFromSource(asset.source)).toBe('@sanity/icons');
    expect(packageFromSource('https://example.com')).toBeNull();
  });

  it('builds the guidance the icon tools use, without the entry id as an alias', () => {
    const c = iconCatalog(systems);
    expect(c.get('CogIcon')).toEqual({ aliases: ['settings', 'preferences'], purpose: 'View or manage settings.', whenToUse: '- To open settings.', whenNotToUse: '- For tools. Use WrenchIcon instead.' });
    expect(c.get('InboxIcon').purpose).toBe('');
  });

  it('prefers the asset entry over the TSV, and takes the package from it', () => {
    const g = resolveIconGuidance({ systems, guidelinesPath: '/nonexistent.tsv' });
    expect(g.source).toBe('asset');
    expect(g.iconPackage).toBe('@sanity/icons');
    expect(resolveIconGuidance({ systems: [], guidelinesPath: null }).guidelines.size).toBe(0);
  });

  it('renders members in one line each, with the import rule once and no placeholder comments', () => {
    const lines = [];
    renderAssetMembers(asset, lines);
    const out = lines.join('\n');
    expect(out).toContain("Import each from its own subpath: `import { CogIcon } from '@sanity/icons/Cog'`");
    expect(out).toContain('- **CogIcon** — View or manage settings. *Also:* Settings, Preferences');
    expect(out).not.toContain('TODO');
    expect(out).toContain('Also in the set, not yet described: InboxIcon.');
    expect(out).not.toContain('Not for:');
  });

  it('adds usage notes verbosely', () => {
    const lines = [];
    renderAssetMembers(asset, lines, { verbose: true });
    expect(lines.join('\n')).toContain('  - Not for: - For tools. Use WrenchIcon instead.');
  });
});
