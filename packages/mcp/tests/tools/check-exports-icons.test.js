import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkExportsHandler } from '../../src/tools/check-exports.js';
import { loadIconGuidelines, nameWords, suggestIcons } from '../../src/icon-suggest.js';

// With an icon package configured, a real icon is answered with its import
// path, and a name that isn't an icon gets suggestions from the guidelines.
// Before, real icons came back as warnings ("will not compile"), and wrong
// guesses — SettingsIcon was the most common, 60 times in three days of
// agent runs — came back as a bare "not found".

const icon = (name) => `/**
 * @deprecated \`${name}\` is no longer exported from the \`@sanity/icons\` root entry. Import it from its own subpath instead: \`import {${name}} from '@sanity/icons/${name.replace(/Icon$/, '')}'\`
 */
declare const ${name}: never;`;
const ICONS = ['CogIcon', 'SearchIcon', 'EyeOpenIcon', 'WarningOutlineIcon', 'CloseIcon'];
const DTS = `${ICONS.map(icon).join('\n')}\nexport { ${ICONS.join(', ')} };\n`;
const TSV = [
  'Icon name\tAlternative names\tPurpose',
  'CogIcon\tSettings | Preferences\tView or manage settings',
  'WarningOutlineIcon\tAlert | Caution\tTo represent a general warning',
  'CloseIcon\tX | Dismiss\tClose or dismiss UI elements',
  'SearchIcon\tFind\tSearch for content',
].join('\n');

let dir;
let tsv;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsds-icons-'));
  mkdirSync(join(dir, 'pkg/dist'), { recursive: true });
  writeFileSync(join(dir, 'pkg/dist/index.d.ts'), DTS);
  tsv = join(dir, 'icon-guidelines.tsv');
  writeFileSync(tsv, TSV);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (components, guidelinesPath = tsv) =>
  checkExportsHandler(
    { components },
    () => new Map([['@sanity/icons', join(dir, 'pkg')]]),
    () => ({ iconPackage: '@sanity/icons', guidelinesPath }),
  ).content[0].text;

describe('dsds_check_exports with an icon package', () => {
  it('answers a real icon with its import path, not a warning', () => {
    const text = run(['SearchIcon']);
    expect(text).toContain("✓ **SearchIcon** — import from `@sanity/icons/Search`");
    expect(text).not.toContain('⚠');
    expect(text).toContain('Each icon is imported from its own subpath');
  });

  it('suggests the icon an alias points to', () => {
    const text = run(['SettingsIcon']);
    expect(text).toContain('✗ **SettingsIcon** — not an icon in `@sanity/icons`');
    expect(text).toContain('`CogIcon` (View or manage settings) — `@sanity/icons/Cog`');
  });

  it('suggests by name prefix when the guidelines have nothing', () => {
    expect(run(['EyeIcon'])).toContain('`EyeOpenIcon`');
  });

  it('answers a name sent twice once', () => {
    expect(run(['SearchIcon', 'SearchIcon']).match(/\*\*SearchIcon\*\*/g)).toHaveLength(1);
  });

  it('still suggests from icon names alone when no guidelines file is configured', () => {
    expect(run(['EyeIcon'], null)).toContain('`EyeOpenIcon`');
  });
});

// Subpath specifiers are checked against the package's real `exports` map.
// Agents could not verify `@sanity/icons/Cog` before (2026-10-07 feedback).
describe('dsds_check_exports with subpath specifiers', () => {
  const withExportsMap = (subs) =>
    writeFileSync(join(dir, 'pkg/package.json'), JSON.stringify({ exports: Object.fromEntries([['.', './dist/index.js'], ...subs.map((x) => [`./${x}`, `./dist/${x}.js`])]) }));

  it('confirms a subpath the package ships, and names its export', () => {
    withExportsMap(['Cog', 'Search']);
    expect(run(['@sanity/icons/Cog'])).toContain('✓ **@sanity/icons/Cog** — subpath exists; it exports `CogIcon`');
  });

  it('rejects a subpath the package does not ship, with suggestions', () => {
    withExportsMap(['Cog', 'Search']);
    const text = run(['@sanity/icons/Settings']);
    expect(text).toContain('✗ **@sanity/icons/Settings** — no such subpath in `@sanity/icons`');
    expect(text).toContain('`@sanity/icons/Cog`');
  });

  it('says so when the package has no exports map to check', () => {
    expect(run(['@sanity/icons/Cog'])).toContain('has no `exports` map');
  });

  it('flags a root-listed icon whose subpath is missing', () => {
    withExportsMap(['Cog']);
    expect(run(['SearchIcon'])).toContain('✗ **SearchIcon** — listed at the `@sanity/icons` root, but `@sanity/icons/Search` does not exist');
    expect(run(['CogIcon'])).toContain('✓ **CogIcon** — import from `@sanity/icons/Cog`');
  });
});

describe('icon-suggest', () => {
  it('splits names into words', () => {
    expect(nameWords('AlertCircleIcon')).toEqual(['alert', 'circle']);
    expect(nameWords('XIcon')).toEqual(['x']);
  });

  it('ranks an exact alias above a prefix match, and never matches short words by spelling', () => {
    const g = loadIconGuidelines(tsv);
    expect(suggestIcons('XIcon', ICONS, g)[0].name).toBe('CloseIcon');
    expect(suggestIcons('AlertIcon', ICONS, g)[0].name).toBe('WarningOutlineIcon');
    expect(suggestIcons('StarIcon', ICONS, g)).toEqual([]);
  });
});
