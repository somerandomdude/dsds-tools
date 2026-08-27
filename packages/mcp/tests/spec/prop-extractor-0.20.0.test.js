import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getApiForEntry } from '../../src/spec/prop-extractor-0.20.0.js';
import { renderApi20 } from '../../src/spec/render-0.20.0.js';

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
  const fileContent = BOX_SOURCE;
  return sha256(`5.0.0:${sha256(fileContent)}`);
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
