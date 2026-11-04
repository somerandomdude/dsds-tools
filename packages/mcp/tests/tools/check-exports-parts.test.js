import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkExportsHandler } from '../../src/tools/check-exports.js';

// The shape @sanity/ui 5.0.0-alpha.19 declares for Tabs. Tab's own type has a
// `}` in it, which cut the namespace body short and dropped Panel (2026-10-29).
const DTS = `
interface TabProps { label: string; value: string }
interface TabsPanelProps { value: string }
declare function TabsRoot({ value }: { value: string }): import("react").JSX.Element;
declare namespace TabsRoot {
  var displayName: string;
  var List: typeof TabsList;
  var Tab: ({ value, tone, ...props }: TabProps) => import("react").JSX.Element;
  var Panel: typeof TabPanel;
}
declare function TabsList(props: {}): import("react").JSX.Element;
declare function TabPanel(props: TabsPanelProps): import("react").JSX.Element;
export declare const Tabs: typeof TabsRoot;
export declare function Box(props: {}): import("react").JSX.Element;
export {};
`;

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsds-check-parts-'));
  mkdirSync(join(dir, 'pkg/dist'), { recursive: true });
  writeFileSync(join(dir, 'pkg/dist/index.d.ts'), DTS);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (components) =>
  checkExportsHandler({ components }, () => new Map([['@sanity/ui', join(dir, 'pkg')]])).content[0].text;

describe('dsds_check_exports — namespace members', () => {
  it('finds every member of a namespace, including one after a `}` in its type', () => {
    const text = run(['Tabs.Tab', 'Tabs.List', 'Tabs.Panel']);
    expect(text).toContain('✓ **Tabs.Tab** — exported from `@sanity/ui`');
    expect(text).toContain('✓ **Tabs.List** — exported from `@sanity/ui`');
    expect(text).toContain('✓ **Tabs.Panel** — exported from `@sanity/ui`');
  });

  it('says a bare part name is a part of its root, and names the import', () => {
    const text = run(['Tab', 'TabList', 'TabPanel']);
    expect(text).toContain('✗ **Tab** — not a root export. It is a part of `Tabs`: use `Tabs.Tab`, and import `Tabs`.');
    expect(text).toContain('✗ **TabList** — not a root export. It is a part of `Tabs`: use `Tabs.List`, and import `Tabs`.');
    expect(text).toContain('✗ **TabPanel** — not a root export. It is a part of `Tabs`: use `Tabs.Panel`, and import `Tabs`.');
  });

  it('still says "not found" for a name that is neither a root nor a part', () => {
    expect(run(['Nonesuch'])).toContain('✗ **Nonesuch** — not found in `@sanity/ui`');
  });
});
