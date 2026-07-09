import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractIconImports, parseIconExports, checkIconImports,
  checkKindReferences, checkVersions, readmeVersions,
  extractExampleCode, extractJsxProps, checkExampleProps,
} from '../src/integrity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_PKG = '@acme/icons';

describe('extractIconImports', () => {
  it('parses single, multi-line, and aliased imports; ignores other packages', () => {
    const code = "import { AddIcon, CloseIcon } from '@acme/icons'\nimport {\n  SortIcon as S,\n} from '@acme/icons'\nimport { Box } from '@acme/ui'";
    expect(extractIconImports(code, ICON_PKG).sort()).toEqual(['AddIcon', 'CloseIcon', 'SortIcon']);
  });
  it('returns nothing when no icon package is configured', () => {
    expect(extractIconImports("import { AddIcon } from '@acme/icons'", null)).toEqual([]);
  });
});

describe('parseIconExports', () => {
  it('extracts XIcon declarations from a d.ts', () => {
    const dts = 'declare const AddIcon: any;\nexport declare const SearchIcon: any;\ndeclare const helper: any;';
    const s = parseIconExports(dts);
    expect(s.has('AddIcon')).toBe(true);
    expect(s.has('SearchIcon')).toBe(true);
    expect(s.has('helper')).toBe(false);
  });
});

describe('checkIconImports', () => {
  const exports = new Set(['AddIcon', 'SortIcon']);
  it('passes when every import resolves', () => {
    expect(checkIconImports([{ identifier: 'c', code: "import { AddIcon } from '@acme/icons'" }], exports, ICON_PKG)).toEqual([]);
  });
  it('flags an unresolved (hallucinated) icon, naming the chunk', () => {
    const errs = checkIconImports([{ identifier: 'toolbar', code: "import { FakeIcon } from '@acme/icons'" }], exports, ICON_PKG);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('FakeIcon');
    expect(errs[0]).toContain('toolbar');
  });
});

describe('checkKindReferences', () => {
  const present = new Set(['chunk', 'token-group', 'pattern']);
  it('passes for populated kinds', () => {
    expect(checkKindReferences('query kind=chunk then kind=token-group', present)).toEqual([]);
  });
  it('flags a directive to an empty kind', () => {
    const errs = checkKindReferences('Call dsds_search_entities with kind=token', present);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('kind=token');
  });
  it('does not flag glossary backticks (non-directive)', () => {
    expect(checkKindReferences('| `token` | an individual design value |', present)).toEqual([]);
  });
});

describe('checkVersions', () => {
  it('passes when all match the bundled version', () => {
    expect(checkVersions('0.13.0', [{ label: 'a', version: '0.13.0' }, { label: 'b', version: '0.13.0' }])).toEqual([]);
  });
  it('flags drift', () => {
    const errs = checkVersions('0.13.0', [{ label: 'README', version: '0.10.2' }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('0.10.2');
  });
});

describe('readmeVersions', () => {
  it('pulls spec versions from the README patterns', () => {
    const rm = '**Bundled spec version:** 0.13.0\nDefaults to `0.13.0`.\nhttps://designsystemdocspec.org/v0.13.0/dsds.bundled.schema.json\n"dsdsVersion": "0.13.0"';
    const vs = readmeVersions(rm);
    expect(vs.length).toBeGreaterThanOrEqual(4);
    expect(vs.every((v) => v.version === '0.13.0')).toBe(true);
  });
});

describe('example-vs-API consistency (R4)', () => {
  const tooltip = {
    kind: 'component', identifier: 'tooltip', name: 'Tooltip',
    documentBlocks: [{ kind: 'api', properties: [{ identifier: 'text' }, { identifier: 'placement' }, { identifier: 'disabled' }] }],
  };

  it('extracts code from fenced blocks and example presentations', () => {
    const entity = {
      documentBlocks: [
        { kind: 'sections', items: [{ body: 'x\n```tsx\n<A b="c"/>\n```' }] },
        { kind: 'sections', items: [{ examples: [{ presentation: { kind: 'code', code: '<D e={1}/>' } }] }] },
      ],
    };
    const code = extractExampleCode(entity);
    expect(code.some((c) => c.includes('<A'))).toBe(true);
    expect(code.some((c) => c.includes('<D'))).toBe(true);
  });

  it('flags a prop that is not in the api block', () => {
    const guide = { kind: 'guide', identifier: 'g', documentBlocks: [{ kind: 'sections', items: [{ body: '```tsx\n<Tooltip content="Del"/>\n```' }] }] };
    const errs = checkExampleProps([tooltip, guide]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('content');
    expect(errs[0]).toContain('tooltip');
  });

  it('allows api props, shared props, handlers, and aria attributes', () => {
    const guide = { kind: 'guide', identifier: 'g', documentBlocks: [{ kind: 'sections', items: [{ body: '```tsx\n<Tooltip text={t} placement="top" marginTop={2} aria-label="x" onClick={f}/>\n```' }] }] };
    expect(checkExampleProps([tooltip, guide])).toHaveLength(0);
  });

  it('skips intentional wrong examples marked with ✗ and resumes on ✓', () => {
    const guide = { kind: 'guide', identifier: 'g', documentBlocks: [{ kind: 'sections', items: [{ body: '```tsx\n// ✗ wrong\n<Tooltip content="x"/>\n// ✓ correct\n<Tooltip badprop="y"/>\n```' }] }] };
    const errs = checkExampleProps([tooltip, guide]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('badprop');
  });

  it('does not misattribute dotted components or spread contents', () => {
    expect(extractJsxProps('<List.Item trailing={x}/>')).toEqual([{ component: 'List.Item', prop: 'trailing' }]);
    expect(extractJsxProps('<Box {...{ src, alt }} radius={2}/>')).toEqual([
      { component: 'Box', prop: 'radius' },
    ]);
  });
});

// Full guard against the configured DSDS — runs only when env is set (e.g. CI).
describe('integration: check-integrity script', () => {
  it.runIf(process.env.DSDS_PATHS)('passes on the configured design system', () => {
    execFileSync('node', ['scripts/check-integrity.js'], { cwd: ROOT, stdio: 'pipe' }); // throws on exit 1
  });
});
