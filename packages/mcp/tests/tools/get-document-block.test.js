import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadSystems } from '../../src/loader.js';
import { getDocumentBlockHandler } from '../../src/tools/get-document-block.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

describe('getDocumentBlockHandler — legacy 0.15.2', () => {
  // NOTE: fixtures/button.dsds.json's documentBlocks use a `type` field
  // (`{type: "api", ...}`), but every legacy handler here and in
  // to-markdown.js matches on `.kind`. That's a pre-existing mismatch,
  // unrelated to the 0.20.0 prop-serving work this file otherwise tests —
  // flagged, not fixed, here. It means no legacy blockType lookup against
  // this fixture has ever actually matched; only the not-found path below
  // is safe to assert against.
  it('errors for an unknown entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getDocumentBlockHandler({ identifier: 'nonexistent', blockType: 'api' }, () => systems);
    expect(result.isError).toBe(true);
  });
});

describe('getDocumentBlockHandler — real 0.20.0 (.dsds.yaml)', () => {
  it('retrieves a top-level field (sourceFiles)', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getDocumentBlockHandler({ identifier: 'button', blockType: 'sourceFiles' }, () => systems);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Button.tsx');
  });

  it('retrieves a section by kind', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getDocumentBlockHandler({ identifier: 'button', blockType: 'guidelines' }, () => systems);
    expect(result.isError).toBeFalsy();
  });
});

describe('getDocumentBlockHandler — "api" on a real 0.20.0 entity (the HARD RULE call site)', () => {
  let root, extractorDir, uiSourceRoot;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dsds-doc-block-'));
    extractorDir = join(root, 'extractor');
    uiSourceRoot = join(root, 'ui');
    mkdirSync(join(extractorDir, 'out'), { recursive: true });
    mkdirSync(uiSourceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders a real prop table, not the raw sourceFiles pointer, when the cache is fresh', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    // button.dsds.yaml declares sourceFiles: [{platform: react, file: ./src/Button.tsx}]
    mkdirSync(join(uiSourceRoot, 'src'), { recursive: true });
    const fileContent = 'export const buttonProps = {};\n';
    writeFileSync(join(uiSourceRoot, 'src/Button.tsx'), fileContent);
    mkdirSync(join(uiSourceRoot, 'packages/ui'), { recursive: true });
    writeFileSync(join(uiSourceRoot, 'packages/ui/package.json'), JSON.stringify({ version: '5.0.0' }));
    const fingerprint = sha256(`5.0.0:${sha256(fileContent)}`);
    writeFileSync(
      join(extractorDir, 'out', 'props-0.20.0.cache.json'),
      JSON.stringify({ button: { fingerprint, props: { props: [{ name: 'text', kind: 'string', required: true, description: 'Button label', type: 'string' }] } } })
    );

    const result = await getDocumentBlockHandler(
      { identifier: 'button', blockType: 'api' },
      () => systems,
      { propsExtractorDir: extractorDir, uiSourceRoot }
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('| `text` |');
    expect(text).not.toContain('```json'); // not the raw sourceFiles dump
  });

  it('renders "no API data available" rather than the raw sourceFiles JSON when unconfigured', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getDocumentBlockHandler({ identifier: 'button', blockType: 'api' }, () => systems, {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No API data available');
  });
});
