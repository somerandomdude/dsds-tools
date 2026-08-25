import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../../src/loader.js';
import { toMarkdownHandler } from '../../src/tools/to-markdown.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

describe('toMarkdownHandler', () => {
  it('renders a legacy 0.15.2 entity to markdown', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await toMarkdownHandler({ identifier: 'button' }, () => systems);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('# Button');
  });

  it('returns isError for an unknown entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await toMarkdownHandler({ identifier: 'nonexistent' }, () => systems);
    expect(result.isError).toBe(true);
  });
});

describe('toMarkdownHandler — real 0.20.0 (.dsds.yaml)', () => {
  it('renders sourceFiles/traits/combos and every real section kind', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await toMarkdownHandler({ identifier: 'button' }, () => systems);
    const text = result.content[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('# Button');
    expect(text).toContain('**Status:** stable');
    expect(text).toContain('Source files');
    expect(text).toContain('Traits (variants & states)');
    expect(text).toContain('Combos (pairing rules)');
    expect(text).toContain('Definitions');
    expect(text).toContain('Pre-release checklist');
    expect(text).toContain('Guidelines');
  });
});
