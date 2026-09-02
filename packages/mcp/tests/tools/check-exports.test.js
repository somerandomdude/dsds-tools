import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkExportsHandler } from '../../src/tools/check-exports.js';

// Real-world case this guards: @sanity/icons v5 kept every pre-v5 icon name
// in the root entry's `export { ... }` list (for discoverability) but typed
// each one `never` behind an `@deprecated` JSDoc tag pointing at the real
// per-icon subpath. A name-presence-only check reports these as exported,
// which is technically true and practically wrong — the name resolves to
// `never` and fails to compile the moment it's used as a value or JSX
// component. dsds_check_exports must surface the deprecation, not a plain ✓.
const DTS_WITH_DEPRECATED_NEVER = `
/**
 * @deprecated \`AddIcon\` is no longer exported from the \`@sanity/icons\` root entry (removed in v5) – the icon itself still exists. Import it from its own subpath instead: \`import {AddIcon} from '@sanity/icons/Add'\`
 */
declare const AddIcon: never;
/**
 * @public
 */
declare const Icon: (props: unknown) => unknown;
export { AddIcon, Icon };
`;

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsds-check-exports-'));
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist/index.d.ts'), DTS_WITH_DEPRECATED_NEVER, 'utf8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('checkExportsHandler — deprecated `never` exports', () => {
  it('warns, rather than passing, a name that is exported but typed never', () => {
    const paths = new Map([['@sanity/icons', dir]]);
    const result = checkExportsHandler({ components: ['AddIcon'] }, () => paths);
    const text = result.content[0].text;
    expect(text).toContain('⚠');
    expect(text).toContain('AddIcon');
    expect(text).toContain('never');
    expect(text).toContain("@sanity/icons/Add");
    expect(text).not.toMatch(/✓ \*\*AddIcon\*\*/);
  });

  it('still passes a genuinely usable export from the same file', () => {
    const paths = new Map([['@sanity/icons', dir]]);
    const result = checkExportsHandler({ components: ['Icon'] }, () => paths);
    const text = result.content[0].text;
    expect(text).toContain('✓ **Icon** — exported from `@sanity/icons`');
  });

  it('still reports a genuinely missing name as not found', () => {
    const paths = new Map([['@sanity/icons', dir]]);
    const result = checkExportsHandler({ components: ['DoesNotExistIcon'] }, () => paths);
    const text = result.content[0].text;
    expect(text).toContain('✗ **DoesNotExistIcon** — not found');
  });

  it('prefers a genuine export over a deprecated one when a name is usable in another configured package', () => {
    const usableDir = mkdtempSync(join(tmpdir(), 'dsds-check-exports-usable-'));
    mkdirSync(join(usableDir, 'dist'), { recursive: true });
    writeFileSync(
      join(usableDir, 'dist/index.d.ts'),
      `export declare const AddIcon: () => unknown;\n`,
      'utf8',
    );
    try {
      const paths = new Map([
        ['@sanity/icons', dir],
        ['@some-other-icons-pkg', usableDir],
      ]);
      const result = checkExportsHandler({ components: ['AddIcon'] }, () => paths);
      const text = result.content[0].text;
      expect(text).toContain('✓ **AddIcon** — exported from `@some-other-icons-pkg`');
    } finally {
      rmSync(usableDir, { recursive: true, force: true });
    }
  });
});
