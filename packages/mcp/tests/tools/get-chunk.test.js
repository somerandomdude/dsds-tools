import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems } from '../../src/loader.js';
import { getChunkHandler } from '../../src/tools/get-chunk.js';

// Real sanity.chunk entries name their code via a `rel: file` pointer to a
// sibling non-YAML file, rather than inlining it — this was previously
// unhandled (dsds_get_chunk only recognized legacy kind:'chunk'/'blueprint'
// and a `code.code` field neither of which exist on real 0.20.0 chunks).
const CHUNK_YAML = `
id: test-chunk
kind: sanity.chunk
name: Test Chunk
description: A chunk for testing.
metadata:
  status: {status: stable}
related:
  - to: some-other-chunk
    rel: alternative-to
refs:
  - href: ./code/test-chunk.tsx
    rel: file
    role: source
  - to: box
    rel: composes
sections:
  - kind: guidelines
    for: all
    context: when-to-use
    items:
      - statement: Use this when testing.
        level: should
`;

const CODE_CONTENT = `import { Box } from '@sanity/ui-v5'\nexport const TestChunk = () => <Box />\n`;

let root, chunkPath;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-chunk-'));
  mkdirSync(join(root, 'code'), { recursive: true });
  chunkPath = join(root, 'test-chunk.dsds.yaml');
  writeFileSync(chunkPath, CHUNK_YAML);
  writeFileSync(join(root, 'code', 'test-chunk.tsx'), CODE_CONTENT);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getChunkHandler — real 0.20.0 (sanity.chunk)', () => {
  it('finds a real sanity.chunk entity by identifier', async () => {
    const { systems, errors } = await loadSystems([chunkPath]);
    expect(errors).toHaveLength(0);
    const result = await getChunkHandler({ identifier: 'test-chunk' }, () => systems);
    expect(result.isError).toBeFalsy();
  });

  it('resolves and renders the sibling code file named via a rel:file ref', async () => {
    const { systems } = await loadSystems([chunkPath]);
    const result = await getChunkHandler({ identifier: 'test-chunk' }, () => systems);
    const text = result.content[0].text;
    expect(text).toContain('```tsx');
    expect(text).toContain("export const TestChunk");
  });

  it('renders relationships derived from both related and refs', async () => {
    const { systems } = await loadSystems([chunkPath]);
    const result = await getChunkHandler({ identifier: 'test-chunk' }, () => systems);
    const text = result.content[0].text;
    expect(text).toContain('**alternative-to** `some-other-chunk`');
    expect(text).toContain('**composes** `box`');
  });

  it('renders sections (guidelines) instead of the legacy useCases/guidelines fields', async () => {
    const { systems } = await loadSystems([chunkPath]);
    const result = await getChunkHandler({ identifier: 'test-chunk' }, () => systems);
    expect(result.content[0].text).toContain('Use this when testing.');
  });

  it('degrades gracefully (no crash) when the code file is missing', async () => {
    const brokenYaml = CHUNK_YAML.replace('./code/test-chunk.tsx', './code/does-not-exist.tsx');
    const brokenPath = join(root, 'broken-chunk.dsds.yaml');
    writeFileSync(brokenPath, brokenYaml.replace('test-chunk', 'broken-chunk'));
    const { systems } = await loadSystems([brokenPath]);
    const result = await getChunkHandler({ identifier: 'broken-chunk' }, () => systems);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No code file found');
  });

  it('still returns a not-found error with an available-chunks hint for an unknown identifier', async () => {
    const { systems } = await loadSystems([chunkPath]);
    const result = await getChunkHandler({ identifier: 'nonexistent' }, () => systems);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Available chunks:');
    expect(result.content[0].text).toContain('test-chunk');
  });
});
