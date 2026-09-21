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

// ── Accessibility and Content buckets, driven by the section's tag ─────────
//
// Spec 0.21.0 put `tags` on a section and pointed DSDS-18's ordering at it,
// which makes the tag the machine-readable answer to "what is this section
// about". The renderer used to answer that question with the human-written
// title: `title === 'Accessibility'` for a11y, and a `definitions` section
// titled 'Content' for content. In the live corpus that missed 2 of 41
// accessibility sections and 19 of 20 content sections — the latter because
// the corpus moved its freeform Content blocks into tagged `guidelines`,
// which the definitions-only rule could never match.
//
// Title matching stays: a corpus predating the field still has to render.
describe('toMarkdownHandler — sections bucketed by tag', () => {
  const entity = (sections) => ({
    schemaVersion: '0.21.0',
    name: 'Tagged',
    entries: [{ kind: 'component', id: 'tagged', name: 'Tagged', description: 'A component.', sections }],
  });

  const render = async (sections) => {
    const { systems } = await loadSystems([]);
    const doc = entity(sections);
    const loaded = [{ filePath: '/x.dsds.yaml', entities: [{ ...doc.entries[0], identifier: 'tagged', __dsds20: true }] }];
    const result = await toMarkdownHandler({ identifier: 'tagged' }, () => loaded);
    expect(result.isError).toBeFalsy();
    return result.content[0].text;
  };

  it('renders a guidelines section tagged accessibility under Accessibility', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', tags: ['accessibility'], title: 'Screen readers',
        items: [{ level: 'must', statement: 'Give it an accessible name.' }] },
    ]);
    expect(text).toContain('## Accessibility');
    expect(text).toContain('Give it an accessible name.');
    // the tag decides the bucket, so the section's own title is not a heading
    expect(text).not.toContain('## Screen readers');
  });

  it('renders a guidelines section tagged content under Content', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', tags: ['content'], title: 'Copy',
        items: [{ level: 'should', statement: 'Use sentence case for labels.' }] },
    ]);
    expect(text).toContain('## Content');
    expect(text).toContain('Use sentence case for labels.');
  });

  it('still honours the older title convention for both', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', title: 'Accessibility',
        items: [{ level: 'must', statement: 'Label the control.' }] },
      { kind: 'definitions', for: 'all', title: 'Content',
        items: [{ term: 'Be concise', definition: 'Short labels.' }] },
    ]);
    expect(text).toContain('## Accessibility');
    expect(text).toContain('Label the control.');
    expect(text).toContain('## Content');
    expect(text).toContain('**Be concise:** Short labels.');
  });

  it('renders statements and labels under one Content heading', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', tags: ['content'], items: [{ level: 'should', statement: 'Lead with a verb.' }] },
      { kind: 'definitions', for: 'all', title: 'Content', items: [{ term: 'Tone', definition: 'Plain and direct.' }] },
    ]);
    expect(text.match(/^## Content$/gm)).toHaveLength(1);
    // a rule outranks a glossary entry for someone writing copy
    expect(text.indexOf('Lead with a verb.')).toBeLessThan(text.indexOf('**Tone:**'));
  });

  it('lifts a tagged item out of Best practices into its own heading', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [
        { level: 'should', statement: 'Wrap it in a Box.' },
        { level: 'should', statement: 'Use sentence case.', tags: ['content'] },
        { level: 'must', statement: 'Give it a name.', tags: ['accessibility'] },
      ] },
    ]);
    const best = text.slice(text.indexOf('## Best practices'), text.indexOf('## Accessibility'));
    expect(best).toContain('Wrap it in a Box.');
    expect(best).not.toContain('Use sentence case.');
    expect(best).not.toContain('Give it a name.');
    expect(text.slice(text.indexOf('## Accessibility'))).toContain('Give it a name.');
    expect(text.slice(text.indexOf('## Content'))).toContain('Use sentence case.');
  });

  it('renders a tagged section once, not twice', async () => {
    const text = await render([
      { kind: 'guidelines', for: 'all', tags: ['accessibility'], title: 'Accessibility',
        items: [{ level: 'must', statement: 'Only once.' }] },
    ]);
    expect(text.match(/^## Accessibility$/gm)).toHaveLength(1);
    expect(text.match(/Only once\./g)).toHaveLength(1);
  });
});
