import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems } from '../src/loader.js';
import { createSurface } from '../src/surface.js';
import { summarizeEntities } from '../src/loader.js';
import { createGraphGetter } from '../src/graph.js';
import { findTokenRefs, inlineTokenValue, resolveTokenRefs, tokenMap } from '../src/token-refs.js';

// Documentation names a token — `{space-3}` — and the server fills in the
// value from the DTCG file when it serves the text.
const YAML = `
schemaVersion: 0.21.0
name: Test
entries:
  - kind: token
    id: space-3
    name: space-3
    description: Standard padding.
    metadata: {status: {status: stable}, group: space}
    source: {href: ./json/space.tokens.json#space-3, rel: file}
  - kind: token
    id: heading-4
    name: heading-4
    description: Document titles.
    metadata: {status: {status: stable}, group: typography}
    source: {href: ./json/typography.tokens.json#/heading-4, rel: file}
  - kind: token
    id: color.action.primary
    name: color.action.primary
    description: The primary action color.
    metadata: {status: {status: stable}, group: color}
    source: {href: ./json/typography.tokens.json#blue-500, rel: file}
  - kind: entry
    id: space
    name: Space scale
    description: The spacing scale.
    metadata: {status: {status: stable}, group: space}
    source: {href: ./json/space.tokens.json, rel: file}
  - kind: entry
    id: type
    name: Type
    description: Type styles.
    metadata: {status: {status: stable}, group: typography}
    source: {href: ./json/typography.tokens.json, rel: file}
  - kind: component
    id: card
    name: Card
    description: 'Compact density pads by {space-3}.'
    metadata: {status: {status: stable}}
    sections:
      - kind: guidelines
        for: all
        items:
          - level: must
            statement: 'Card pads by {space-3}. Write \`padding={space-3}\` nowhere; \`size={2}\` stays code, and weight={bold} too.'
`;

let root, yamlPath;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-tokrefs-'));
  mkdirSync(join(root, 'json'), { recursive: true });
  yamlPath = join(root, 'doc.dsds.yaml');
  writeFileSync(yamlPath, YAML);
  writeFileSync(join(root, 'json', 'space.tokens.json'), JSON.stringify({
    'space-3': { $type: 'dimension', $value: { unit: 'px', value: 12 } },
  }));
  writeFileSync(join(root, 'json', 'typography.tokens.json'), JSON.stringify({
    'heading-4': { $type: 'typography', $value: { fontFamily: 'Inter', fontSize: { unit: 'px', value: 33 }, fontWeight: 400, lineHeight: 1.25 } },
    bold: { $type: 'fontWeight', $value: 700 },
    'blue-500': { $type: 'color', $value: { hex: '#556bfc', alpha: 1 } },
  }));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

async function load() {
  const { systems, errors } = await loadSystems([yamlPath]);
  expect(errors).toHaveLength(0);
  return systems;
}

describe('resolveTokenRefs', () => {
  it('replaces a reference with the token name and its value', async () => {
    const tokens = tokenMap(await load());
    expect(resolveTokenRefs('Pads by {space-3}.', tokens)).toBe('Pads by `space-3` (12px).');
  });

  it('shows a type style as size and line height', async () => {
    const tokens = tokenMap(await load());
    expect(resolveTokenRefs('{heading-4}', tokens)).toBe('`heading-4` (33px / 1.25)');
  });

  it('never touches code spans, fenced blocks, or braces after = or $', async () => {
    const tokens = tokenMap(await load());
    const text = '`{space-3}` and\n```\n{space-3}\n```\nand weight={bold} and ${space-3}';
    expect(resolveTokenRefs(text, tokens)).toBe(text);
  });

  it('resolves by the token entry id, not the DTCG key', async () => {
    const tokens = tokenMap(await load());
    expect(resolveTokenRefs('{color.action.primary}', tokens)).toBe('`color.action.primary` (#556bfc)');
    expect(resolveTokenRefs('{blue-500}', tokens)).toBe('{blue-500}');
  });

  it('does not treat a DTCG token with no entry as referenceable', async () => {
    const tokens = tokenMap(await load());
    expect(tokens.has('bold')).toBe(false);
    expect(tokens.has('heading-4')).toBe(true);
  });

  it('leaves a brace that names no token as it is', async () => {
    const tokens = tokenMap(await load());
    expect(resolveTokenRefs('Pass {true} or {space-33}.', tokens)).toBe('Pass {true} or {space-33}.');
  });

  it('finds references in prose only', () => {
    expect(findTokenRefs('{space-3} `{radius-2}` a={b} {heading-4}')).toEqual(['space-3', 'heading-4']);
  });

  it('shows a shadow by name alone', () => {
    expect(inlineTokenValue({ type: 'shadow', value: [] })).toBeNull();
  });
});

describe('the surface resolves references in what it serves', () => {
  function surfaceFor(systems) {
    return createSurface({
      getSystems: () => systems,
      getSummaries: () => summarizeEntities(systems),
      getGraph: createGraphGetter(() => systems),
      enableFeedback: false,
    });
  }

  it('resolves them in agent context', async () => {
    const surface = surfaceFor(await load());
    const result = await surface.dispatch('dsds_get_agent_context', { identifier: 'card' });
    const text = result.content.map(c => c.text).join('\n');
    expect(text).toContain('Card pads by `space-3` (12px).');
    expect(text).not.toContain('{space-3}.');
    expect(text).toContain('weight={bold}');
  });

  it('serves a changed value without a reload', async () => {
    const systems = await load();
    const surface = surfaceFor(systems);
    const file = join(root, 'json', 'space.tokens.json');
    writeFileSync(file, JSON.stringify({ 'space-3': { $type: 'dimension', $value: { unit: 'px', value: 14 } } }));
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    const result = await surface.dispatch('dsds_get_agent_context', { identifier: 'card' });
    expect(result.content.map(c => c.text).join('\n')).toContain('`space-3` (14px)');
  });

  it('leaves spec and lint tools alone', async () => {
    const surface = surfaceFor(await load());
    const result = await surface.dispatch('dsds_validate', { document: 'description: "{space-3}"' });
    expect(JSON.stringify(result)).not.toContain('`space-3` (12px)');
  });
});
