import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findIconHandler } from '../../src/tools/find-icon.js';
import { findIconsByPurpose } from '../../src/icon-suggest.js';

// Agents need "the icon for X", not a check of a name they guessed (2026-10-08:
// 7 of 10 runs guessed names first and asked for icons by intent).

const TSV = [
  'Icon name\tAlternative names\tPurpose\tWhen to use\tWhen not to use',
  'CogIcon\tSettings | Preferences\tView or manage settings\t- To open settings\t- For tools. Use WrenchIcon instead.',
  'DatabaseIcon\tStorage\tDatabase or data storage\t- When settings are stored\t',
  'EyeClosedIcon\tHidden\tTo indicate that an item is hidden\t\t',
  'TrashIcon\tDelete | Bin\tPermanent deletion of content\t\t- For removal. Use RemoveIcon instead.',
  'GhostIcon\tSpooky\tAn icon the package does not ship\t\t',
].join('\n');

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsds-find-icon-'));
  mkdirSync(join(dir, 'pkg'), { recursive: true });
  writeFileSync(join(dir, 'pkg/package.json'), JSON.stringify({ exports: { '.': './x.js', './Cog': './c.js', './Database': './d.js', './EyeClosed': './e.js', './Trash': './t.js' } }));
  writeFileSync(join(dir, 'g.tsv'), TSV);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (purposes) => findIconHandler(
  { purposes },
  () => new Map([['@sanity/icons', join(dir, 'pkg')]]),
  () => ({ iconPackage: '@sanity/icons', guidelinesPath: join(dir, 'g.tsv') }),
);

describe('dsds_find_icon', () => {
  it('finds an icon by an alternative name, with its import and its "not for" note', () => {
    const text = run(['settings']).content[0].text;
    expect(text).toContain("**CogIcon** — `import { CogIcon } from '@sanity/icons/Cog'`. View or manage settings.");
    expect(text).toContain('Not for: For tools. Use WrenchIcon instead.');
  });

  it('drops weak matches when a strong one exists', () => {
    expect(run(['settings']).content[0].text).not.toContain('DatabaseIcon');
  });

  it('matches word forms ("hide" → hidden)', () => {
    expect(run(['hide']).content[0].text).toContain('EyeClosedIcon');
  });

  it('never returns an icon the package does not ship', () => {
    expect(run(['spooky']).content[0].text).toContain('No icon in the guidelines matches');
  });

  it('answers several purposes in one call', () => {
    const text = run(['delete', 'settings']).content[0].text;
    expect(text).toContain('### "delete"');
    expect(text).toContain('TrashIcon');
    expect(text).toContain('### "settings"');
  });

  it('says what to configure when there are no guidelines', () => {
    const res = findIconHandler({ purposes: ['x'] }, () => new Map(), () => ({}));
    expect(res.isError).toBe(true);
  });

  it('ranks the stated purpose above usage notes', () => {
    const g = new Map([
      ['AIcon', { aliases: [], purpose: 'Search for content', whenToUse: '' }],
      ['BIcon', { aliases: [], purpose: 'Something else', whenToUse: 'Use when searching' }],
    ]);
    expect(findIconsByPurpose('search', ['AIcon', 'BIcon'], g)[0].name).toBe('AIcon');
  });
});
