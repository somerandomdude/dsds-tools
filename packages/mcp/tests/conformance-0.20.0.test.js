// D2.5 (dsds-0.20.0-migration-prd.md): run every entry kind through every
// MCP tool that renders 0.20.0 content, and assert no throw, no isError,
// and no empty render. This is a committed version of the ad hoc 135-file
// sweep run against the real corpus during Phase 1 — that sweep found real
// bugs (dsds_get_chunk non-functional, a validator crash on generic
// sections, related silently dropped); this suite exists so the next one
// isn't ad hoc.
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../src/loader.js';
import { toMarkdownHandler } from '../src/tools/to-markdown.js';
import { getEntityHandler } from '../src/tools/get-entity.js';
import { getAgentContextHandler } from '../src/tools/get-agent-context.js';
import { getDocumentBlockHandler } from '../src/tools/get-document-block.js';
import { getChunkHandler } from '../src/tools/get-chunk.js';
import { validateDoc20, looksLike20 } from '../src/spec/validator-0.20.0.js';
import { loadYaml20 } from '../src/spec/dsds20-lib.js';
import { readFileSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

// One fixture per real-world kind, plus edge cases (empty sections,
// $extensions-only) called out in the PRD's golden-file test list.
const FIXTURES = [
  { file: 'button.dsds.yaml', identifier: 'button', kind: 'component' },
  { file: 'guide-example.dsds.yaml', identifier: 'example-guide', kind: 'sanity.guide' },
  { file: 'chunk-example.dsds.yaml', identifier: 'example-chunk', kind: 'sanity.chunk' },
  { file: 'foundation-example.dsds.yaml', identifier: 'example-foundation', kind: 'sanity.foundation' },
  { file: 'pattern-example.dsds.yaml', identifier: 'example-pattern', kind: 'sanity.pattern' },
  { file: 'empty-sections.dsds.yaml', identifier: 'example-empty', kind: 'sanity.chunk' },
  { file: 'extensions-only.dsds.yaml', identifier: 'example-extensions-only', kind: 'component' },
];

describe.each(FIXTURES)('conformance — $kind ($file)', ({ file, identifier, kind }) => {
  it('loads without error', async () => {
    const { systems, errors } = await loadSystems([`${fixturesDir}/${file}`]);
    expect(errors).toEqual([]);
    expect(systems[0].entities).toHaveLength(1);
    expect(systems[0].entities[0].__dsds20).toBe(true);
  });

  it('dsds_to_markdown renders without throwing, isError, or an empty result', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/${file}`]);
    const result = await toMarkdownHandler({ identifier }, () => systems, {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.trim().length).toBeGreaterThan(10);
  });

  it('dsds_get_entity renders without throwing, isError, or an empty result', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/${file}`]);
    const result = await getEntityHandler({ identifier }, () => systems, () => [], null, null, {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.trim().length).toBeGreaterThan(10);
  });

  it('dsds_get_agent_context renders without throwing, isError, or an empty result', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/${file}`]);
    const result = await getAgentContextHandler({ identifier }, () => systems, null, {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.trim().length).toBeGreaterThan(10);
  });

  it('dsds_get_document_block("api") never throws, whatever it has to say about props', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/${file}`]);
    await expect(
      getDocumentBlockHandler({ identifier, blockType: 'api' }, () => systems, {})
    ).resolves.not.toThrow();
  });

  it('dsds_validate recognizes the document as 0.20.0 and never crashes', async () => {
    const raw = readFileSync(`${fixturesDir}/${file}`, 'utf-8');
    const doc = loadYaml20(raw);
    expect(looksLike20(doc)).toBe(true);
    expect(() => validateDoc20(doc)).not.toThrow();
  });

  if (kind === 'sanity.chunk') {
    it('dsds_get_chunk renders without throwing or isError', async () => {
      const { systems } = await loadSystems([`${fixturesDir}/${file}`]);
      const result = await getChunkHandler({ identifier }, () => systems);
      expect(result.isError).toBeFalsy();
    });
  }
});
