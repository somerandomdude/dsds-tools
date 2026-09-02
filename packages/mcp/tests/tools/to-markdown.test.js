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
  // dsds_to_markdown targets the shape of the hand-authored reference docs
  // (e.g. button.md in "Sanity UI component documentation"): traits split
  // into States/Variants, guidelines split into headed Do/Don't and When
  // (to/not to) use buckets, `for: agent` sections dropped from the human
  // doc entirely — not the flat "Traits (variants & states)"/"Guidelines"
  // dump that get-entity/get-agent-context still render for agent use.
  it('renders sourceFiles/traits/combos and every real section kind', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await toMarkdownHandler({ identifier: 'button' }, () => systems);
    const text = result.content[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('# Button');
    expect(text).toContain('**Status:** stable');
    expect(text).toContain('## States');
    expect(text).toContain('## Variants');
    expect(text).toContain('Combos (pairing rules)');
    expect(text).toContain('Definitions');
    // `for: human` renders (no title on this one, so it falls back to the
    // generic "## Guidelines" heading rather than Best practices — it has
    // no `context: when-to-use`/`how-to-use` to route it there).
    expect(text).toContain('## Guidelines');
    expect(text).toContain('Limit each surface to one primary button.');
    // `for: agent` is agent-only and must not leak into the human doc.
    expect(text).not.toContain('Pre-release checklist');
    expect(text).not.toContain('Do not use button when the action navigates');
  });
});
