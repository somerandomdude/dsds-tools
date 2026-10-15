import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getApiForEntry, fingerprintFor } from '../../src/spec/prop-extractor.js';
import { findSharedPropGroups, formatPropValues, renderApi20, renderSharedPropGroups } from '../../src/spec/render.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const BOX_SOURCE = `export const boxProps = { as: { type: 'string' } };\n`;
const BOX_SOURCE_FILE = 'packages/ui/src/components/box/box.props.ts';

const boxEntity = {
  identifier: 'box',
  sourceFiles: [{ platform: 'react', file: BOX_SOURCE_FILE }],
};

const noSourceEntity = { identifier: 'no-source-thing', sourceFiles: [] };

let root;
let extractorDir;
let uiSourceRoot;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-props-'));
  extractorDir = join(root, 'extractor');
  uiSourceRoot = join(root, 'ui');
  mkdirSync(join(extractorDir, 'out'), { recursive: true });
  mkdirSync(join(uiSourceRoot, 'packages/ui/src/components/box'), { recursive: true });
  writeFileSync(join(uiSourceRoot, BOX_SOURCE_FILE), BOX_SOURCE);
  writeFileSync(join(uiSourceRoot, 'packages/ui/package.json'), JSON.stringify({ version: '5.0.0' }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeCache(fingerprint, props = { props: [{ name: 'as', kind: 'string', required: false, description: 'Element to render', type: 'T' }] }) {
  writeFileSync(
    join(extractorDir, 'out', 'props-0.20.0.cache.json'),
    JSON.stringify({ box: { fingerprint, props, generatedAt: '2026-01-01T00:00:00.000Z' } })
  );
}

function realFingerprint() {
  return fingerprintFor(boxEntity, { uiSourceRoot, propsExtractorDir: extractorDir });
}

describe('getApiForEntry', () => {
  it('returns unconfigured when no propsExtractorDir is set', () => {
    const result = getApiForEntry(boxEntity, {});
    expect(result.status).toBe('unconfigured');
  });

  it('returns no-source for an entity with no sourceFiles', () => {
    const result = getApiForEntry(noSourceEntity, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(result.status).toBe('no-source');
  });

  it('returns missing when there is no cache and regeneration fails (no extractor project present)', () => {
    const result = getApiForEntry(boxEntity, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(result.status).toBe('missing');
  }, 15000);

  it('serves from cache as fresh when the fingerprint matches the current source', () => {
    writeCache(realFingerprint());
    const result = getApiForEntry(boxEntity, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(result.status).toBe('fresh');
    expect(result.props.props[0].name).toBe('as');
  });

  it('serves from cache as unverified when uiSourceRoot is not configured', () => {
    writeCache(realFingerprint());
    const result = getApiForEntry(boxEntity, { propsExtractorDir: extractorDir });
    expect(result.status).toBe('unverified');
    expect(result.props.props[0].name).toBe('as');
  });

  it('falls back to stale (no props) when the fingerprint mismatches and regeneration fails', () => {
    writeCache('deliberately-wrong-fingerprint');
    const result = getApiForEntry(boxEntity, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(result.status).toBe('stale');
    expect(result.props).toBeUndefined();
  }, 15000);

  it('never throws when the source file has moved', () => {
    const movedEntity = { identifier: 'box', sourceFiles: [{ platform: 'react', file: 'packages/ui/src/components/box/gone.ts' }] };
    writeCache(realFingerprint());
    const result = getApiForEntry(movedEntity, { propsExtractorDir: extractorDir, uiSourceRoot });
    // Can't compute a current fingerprint for a file that doesn't exist —
    // falls back to unverified (serves the cache) rather than crashing.
    expect(['unverified', 'missing', 'stale']).toContain(result.status);
  }, 15000);
});

describe('renderApi20', () => {
  it('renders nothing when unconfigured', () => {
    const lines = [];
    renderApi20(boxEntity, lines, {});
    expect(lines).toEqual([]);
  });

  it('renders nothing for an entity with no sourceFiles', () => {
    const lines = [];
    renderApi20(noSourceEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(lines).toEqual([]);
  });

  it('renders a "no extracted prop data yet" note when missing', () => {
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    expect(lines.join('\n')).toContain('No extracted prop data yet');
  }, 15000);

  it('renders a real prop table when fresh', () => {
    writeCache(realFingerprint());
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    const text = lines.join('\n');
    expect(text).toContain('## API');
    expect(text).toContain('| `as` |');
    expect(text).not.toContain('Stale prop cache');
  });

  it('renders a loud staleness warning, and no table, when stale', () => {
    writeCache('deliberately-wrong-fingerprint');
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    const text = lines.join('\n');
    expect(text).toContain('Stale prop cache');
    expect(text).not.toContain('| `as` |');
  }, 15000);

  it('flags freshness as unverified when uiSourceRoot is not configured', () => {
    writeCache(realFingerprint());
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir });
    expect(lines.join('\n')).toContain('Freshness not verified');
  });

  it('escapes pipes in a union type so the table does not break', () => {
    writeCache(realFingerprint(), {
      props: [{ name: 'iconEnd', kind: 'union', required: false, description: 'Ending icon', type: 'React.ElementType | React.ReactNode' }],
    });
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    const tableRow = lines.find((l) => l.startsWith('| `iconEnd`'));
    expect(tableRow).toContain('React.ElementType \\| React.ReactNode');
    // Exactly 5 unescaped pipes = 4 real column separators + none from the type.
    expect((tableRow.match(/(?<!\\)\|/g) ?? []).length).toBe(5);
  });

  it('renders inheritedFrom and alsoAccepts when present', () => {
    writeCache(realFingerprint(), {
      alsoAccepts: ["React.ComponentProps<'div'>"],
      props: [{ name: 'top', kind: 'union', required: false, description: 'CSS top', type: 'Responsive<SpaceAuto>', inheritedFrom: 'PositionProps' }],
    });
    const lines = [];
    renderApi20(boxEntity, lines, { propsExtractorDir: extractorDir, uiSourceRoot });
    const text = lines.join('\n');
    expect(text).toContain('(from `PositionProps`)');
    expect(text).toContain("Also accepts native attributes from `React.ComponentProps<'div'>`");
  });
});

describe('fingerprintFor', () => {
  // The table comes from the sibling *.props.ts and from the extractor, not
  // only from the .tsx that sourceFiles names. A change to either must stop
  // the old table being served as fresh.
  it('changes when a sibling props file changes', () => {
    const before = fingerprintFor(boxEntity, { uiSourceRoot, propsExtractorDir: extractorDir });
    writeFileSync(join(uiSourceRoot, 'packages/ui/src/components/box/box.props.ts'), 'export const boxProps = {}');
    expect(fingerprintFor(boxEntity, { uiSourceRoot, propsExtractorDir: extractorDir })).not.toBe(before);
  });

  it("changes when the extractor's own code changes", () => {
    mkdirSync(join(extractorDir, 'src'), { recursive: true });
    writeFileSync(join(extractorDir, 'src', 'extract.mjs'), '// v1');
    const before = fingerprintFor(boxEntity, { uiSourceRoot, propsExtractorDir: extractorDir });
    writeFileSync(join(extractorDir, 'src', 'extract.mjs'), '// v2');
    expect(fingerprintFor(boxEntity, { uiSourceRoot, propsExtractorDir: extractorDir })).not.toBe(before);
  });
});

// Prop values in the type column, and shared prop groups listed once per
// multi-entity response (2026-10-08).
describe('renderApi20 — values and shared groups', () => {
  const margin = (owner) => [
    { name: 'margin', kind: 'union', type: 'Responsive<SpaceAutoNegative>', description: 'CSS margin', inheritedFrom: 'MarginProps', values: [-1, 0, 1, 2, 'auto'] },
    { name: 'marginX', kind: 'union', type: 'Responsive<SpaceAutoNegative>', description: 'CSS margin-x', inheritedFrom: 'MarginProps', values: [-1, 0, 1, 2, 'auto'] },
  ];
  const position = { name: 'position', kind: 'union', type: 'Responsive<Position>', description: 'CSS position', inheritedFrom: 'PositionProps', values: ['absolute', 'fixed', 'sticky'] };
  const as = { name: 'as', kind: 'string', type: "'button' | 'a'", description: 'Element', values: ['button', 'a'] };
  const writeTwo = () => writeFileSync(
    join(extractorDir, 'out', 'props-0.20.0.cache.json'),
    JSON.stringify({
      box: { fingerprint: 'x', props: { props: [...margin(), position, as] } },
      flex: { fingerprint: 'x', props: { props: [...margin(), { name: 'gap', type: 'Responsive<Space>', values: [0, 1, 2, 3], description: 'CSS gap' }] } },
    })
  );
  const flexEntity = { identifier: 'flex', sourceFiles: [{ platform: 'react', file: 'packages/ui/src/components/flex/flex.props.ts' }] };
  const render = (entity, opts) => { const lines = []; renderApi20(entity, lines, { propsExtractorDir: extractorDir }, opts); return lines.join('\n'); };

  it('formats values, collapsing integer runs', () => {
    expect(formatPropValues([-1, 0, 1, 2, 3, 'auto'])).toBe('-1–3 | "auto"');
    expect(formatPropValues([0, 1])).toBe('0 | 1');
    expect(formatPropValues(['absolute', 'sticky'])).toBe('"absolute" | "sticky"');
  });

  it('shows the values a type name hides, and not ones the type already spells out', () => {
    writeTwo();
    const out = render(boxEntity);
    expect(out).toContain('`Responsive<Position>`: `"absolute" \\| "fixed" \\| "sticky"`');
    expect(out).not.toMatch(/'button' \\\| 'a'`: /);
  });

  it('finds groups two or more components share, with who takes them', () => {
    writeTwo();
    const shared = findSharedPropGroups([boxEntity, flexEntity], { propsExtractorDir: extractorDir });
    // MarginProps is shared but has only two rows, under the threshold of three.
    expect(shared.size).toBe(0);
  });

  it('lists a shared group once at the top and names it under each component', () => {
    const rows = ['margin', 'marginX', 'marginY'].map((name) => ({ name, type: 'Responsive<Space>', values: [0, 1, 2], description: name, inheritedFrom: 'MarginProps' }));
    writeFileSync(
      join(extractorDir, 'out', 'props-0.20.0.cache.json'),
      JSON.stringify({
        box: { fingerprint: 'x', props: { props: [...rows, position] } },
        flex: { fingerprint: 'x', props: { props: [...rows] } },
      })
    );
    const cfg = { propsExtractorDir: extractorDir };
    const shared = findSharedPropGroups([boxEntity, flexEntity], cfg);
    expect([...shared.values()].map((g) => [g.name, g.owners])).toEqual([['MarginProps', ['box', 'flex']]]);

    const top = [];
    renderSharedPropGroups(shared, top);
    expect(top.join('\n')).toContain('### Margin props');
    expect(top.join('\n')).toContain('Taken by: `box`, `flex`.');
    expect(top.join('\n')).toContain('| `marginY` |');

    const box = render(boxEntity, { sharedPropGroups: shared });
    expect(box).not.toContain('| `marginY` |');
    expect(box).toContain('| `position` |'); // its own props stay
    expect(box).toContain('Also takes the shared margin props (listed under **Shared prop groups** at the top).');
    expect(render(flexEntity, { sharedPropGroups: shared })).toContain('No props of its own beyond the shared groups.');
  });

  it('keeps every row without shared groups (single lookups, get_entity)', () => {
    writeTwo();
    expect(render(flexEntity)).toContain('| `marginX` |');
  });

});
