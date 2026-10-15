import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems } from '../../src/loader.js';
import { getTokensHandler } from '../../src/tools/get-tokens.js';
import { buildTokenIndex, formatTokenValue } from '../../src/tokens.js';
import { createToolRuntime } from '../../src/registry.js';

// A token entry never stores its value: `source` points at the DTCG file.
// The fixture mirrors the published package layout, `dist/json` beside
// `dist/css`, so CSS custom property names are read from real declarations.
const TOKENS_YAML = `
schemaVersion: 0.21.0
name: Test
entries:
  - kind: token
    id: space-1
    name: space-1
    description: Tight gaps.
    metadata: {status: {status: stable}, group: space}
    tokenType: dimension
    source: {href: ./dtcg/json/space.tokens.json#space-1, rel: file}
  - kind: entry
    id: space
    name: Space scale
    description: The spacing scale.
    metadata: {status: {status: stable}, group: space}
    source: {href: ./dtcg/json/space.tokens.json, rel: file}
  - kind: entry
    id: type
    name: Type
    description: Type styles.
    metadata: {status: {status: stable}, group: typography}
    source: {href: ./dtcg/json/typography.tokens.json, rel: file}
`;

const SPACE = {
  'space-0': { $type: 'dimension', $value: { unit: 'px', value: 0 } },
  'space-1': { $type: 'dimension', $value: { unit: 'px', value: 4 } },
  'space-2': { $type: 'dimension', $value: { unit: 'px', value: 8 } },
  // An alias, which DTCG allows; resolved to the value it names.
  'gap-default': { $type: 'dimension', $value: '{space-2}' },
};

const TYPOGRAPHY = {
  'heading-4': {
    $type: 'typography',
    $value: {
      fontFamily: 'Inter, sans-serif',
      fontSize: { unit: 'px', value: 33 },
      fontWeight: 400,
      letterSpacing: { unit: 'px', value: -0.5 },
      lineHeight: 1.25,
    },
  },
};

let root, yamlPath;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-tokens-'));
  mkdirSync(join(root, 'dtcg', 'json'), { recursive: true });
  mkdirSync(join(root, 'dtcg', 'css'), { recursive: true });
  yamlPath = join(root, 'tokens.dsds.yaml');
  writeFileSync(yamlPath, TOKENS_YAML);
  writeFileSync(join(root, 'dtcg', 'json', 'space.tokens.json'), JSON.stringify(SPACE));
  writeFileSync(join(root, 'dtcg', 'json', 'typography.tokens.json'), JSON.stringify(TYPOGRAPHY));
  // space-2 deliberately has no declaration: the CSS name is read, not guessed.
  writeFileSync(join(root, 'dtcg', 'css', 'space.css'), ':root {\n  --space-0: 0px;\n  --space-1: 4px;\n}\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function systems() {
  const loaded = await loadSystems([yamlPath]);
  expect(loaded.errors).toHaveLength(0);
  return loaded.systems;
}

describe('buildTokenIndex', () => {
  it('reads every DTCG file the corpus references and joins each token to its entry', async () => {
    const { tokens, files } = buildTokenIndex(await systems());
    expect(files.map(f => f.file).sort()).toEqual(['space', 'typography']);
    const s1 = tokens.find(t => t.name === 'space-1');
    expect(s1).toMatchObject({ display: '4px', cssVar: '--space-1', description: 'Tight gaps.', entry: 'space-1', group: 'space' });
  });

  it('serves tokens that have no entry of their own, from a group entry', async () => {
    const { tokens } = buildTokenIndex(await systems());
    expect(tokens.find(t => t.name === 'space-0')).toMatchObject({ display: '0px', entry: null, group: 'space' });
  });

  it('reports no CSS custom property when the CSS does not declare one', async () => {
    const { tokens } = buildTokenIndex(await systems());
    expect(tokens.find(t => t.name === 'space-2').cssVar).toBeNull();
  });

  it('resolves an alias to the value it names', async () => {
    const { tokens } = buildTokenIndex(await systems());
    const alias = tokens.find(t => t.name === 'gap-default');
    expect(alias.aliasOf).toBe('space-2');
    expect(alias.display).toContain('8px');
  });

  it('picks up an edited token file without a reload', async () => {
    const loaded = await systems();
    const file = join(root, 'dtcg', 'json', 'space.tokens.json');
    writeFileSync(file, JSON.stringify({ ...SPACE, 'space-1': { $type: 'dimension', $value: { unit: 'px', value: 6 } } }));
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    expect(buildTokenIndex(loaded).tokens.find(t => t.name === 'space-1').display).toBe('6px');
  });
});

describe('modes', () => {
  it('reads a dark value from $extensions and shows both', async () => {
    writeFileSync(join(root, 'dtcg', 'json', 'semantic.tokens.json'), JSON.stringify({
      'surface': { $type: 'color', $value: '{gray-100}', $extensions: { 'com.sanity.ui': { modes: { dark: '{gray-900}' }, toned: 'var(--tone-100)' } } },
      'gray-100': { $type: 'color', $value: { hex: '#eeeef1', alpha: 1 } },
      'gray-900': { $type: 'color', $value: { hex: '#1b1d27', alpha: 1 } },
    }));
    writeFileSync(yamlPath, TOKENS_YAML + `  - kind: token
    id: surface
    name: surface
    description: A surface.
    metadata: {status: {status: stable}, group: color}
    source: {href: ./dtcg/json/semantic.tokens.json#surface, rel: file}
`);
    const loaded = await systems();
    const t = buildTokenIndex(loaded).tokens.find(x => x.name === 'surface');
    expect(t.display).toBe('#eeeef1 (`gray-100`) light · #1b1d27 (`gray-900`) dark');
    expect(t.toned).toBe('var(--tone-100)');
    const result = getTokensHandler({ names: ['surface'] }, () => loaded);
    expect(result.structuredContent.tokens[0].modes.dark).toEqual({ hex: '#1b1d27', alpha: 1 });
  });
});

describe('formatTokenValue', () => {
  it('reads a composite typography value on one line', () => {
    expect(formatTokenValue('typography', TYPOGRAPHY['heading-4'].$value)).toBe(
      '33px / 1.25 · weight 400 · letter spacing -0.5px · Inter, …'
    );
  });

  it('reads a translucent color with its opacity', () => {
    expect(formatTokenValue('color', { hex: '#727892', alpha: 0.3 })).toBe('#727892 at 30% opacity');
  });
});

describe('getTokensHandler', () => {
  it('lists the groups when called with no arguments', async () => {
    const s = await systems();
    const result = getTokensHandler({}, () => s);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.groups.map(g => g.file).sort()).toEqual(['space', 'typography']);
  });

  it('returns a whole scale by group', async () => {
    const s = await systems();
    const result = getTokensHandler({ group: 'space' }, () => s);
    const names = result.structuredContent.tokens.map(t => t.name);
    expect(names).toEqual(['space-0', 'space-1', 'space-2', 'gap-default']);
    expect(result.content[0].text).toContain('| `space-1` | `--space-1` | 4px | Tight gaps. |');
  });

  it('matches a group by name prefix', async () => {
    const s = await systems();
    const result = getTokensHandler({ group: 'heading' }, () => s);
    expect(result.structuredContent.tokens.map(t => t.name)).toEqual(['heading-4']);
  });

  it('accepts names written as CSS custom properties or var() calls', async () => {
    const s = await systems();
    const result = getTokensHandler({ names: ['--space-1', 'var(--space-0)'] }, () => s);
    expect(result.structuredContent.tokens.map(t => t.name)).toEqual(['space-1', 'space-0']);
  });

  it('returns what it found and suggests the rest', async () => {
    const s = await systems();
    const result = getTokensHandler({ names: ['space-1', 'space-11'] }, () => s);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.notFound).toEqual(['space-11']);
    expect(result.content[0].text).toMatch(/`space-11` — did you mean `space-1`/);
  });

  it('errors with suggestions when a single name is unknown', async () => {
    const s = await systems();
    const result = getTokensHandler({ names: ['spcae-1'] }, () => s);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('space-1');
  });

  it('matches a query at word starts only', async () => {
    const s = await systems();
    expect(getTokensHandler({ query: 'tight' }, () => s).structuredContent.tokens.map(t => t.name)).toEqual(['space-1']);
    expect(getTokensHandler({ query: 'ight' }, () => s).isError).toBe(true);
  });

  it('explains how to reference a token file when none resolves', async () => {
    writeFileSync(yamlPath, TOKENS_YAML.replace(/dtcg\/json/g, 'missing'));
    const s = await systems();
    const result = getTokensHandler({ group: 'space' }, () => s);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('`source`');
  });

  it('is registered in the shared tool runtime', async () => {
    const s = await systems();
    const runtime = createToolRuntime({ getSystems: () => s, getSummaries: () => [], getGraph: () => ({}) });
    expect(runtime.toolDefs.map(t => t.name)).toContain('dsds_get_tokens');
    const result = await runtime.dispatch('dsds_get_tokens', { names: 'space-1' });
    expect(result.structuredContent.tokens[0].display).toBe('4px');
  });
});
