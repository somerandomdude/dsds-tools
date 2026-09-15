// A 0.20 intro entity must render its content, not just its name.
//
// Regression guard. 0.20 entities carry their content under `sections`, while
// renderIntroEntity only read the older `documentBlocks` /
// `agentDocumentBlocks` pair. The result was silent: `introInline: true`
// produced a name and a description per entity and nothing else, so two
// configured guides totalling 21,287 characters on disk contributed 228. The
// agent was never told the project setup those guides describe, and no error
// was raised anywhere.

import { describe, it, expect } from 'vitest';
import { renderIntroEntity, renderIntroBlock } from '../src/intro.js';

const entity020 = {
  identifier: 'getting-started',
  name: 'Getting started',
  kind: 'sanity.guide',
  metadata: [{ kind: 'description', value: 'How to set the project up.' }],
  sections: [
    {
      kind: 'guidelines',
      title: 'Project setup',
      items: [
        { level: 'must', statement: 'Import `@scope/ui/styles.css` in the entry file.' },
        { level: 'should-not', statement: 'Do not hand-write a reset.' },
      ],
    },
    {
      kind: 'section',
      freeform: [{ title: 'Entry point', body: 'Render `<App />` into `#root`.' }],
    },
    {
      kind: 'definitions',
      title: 'Terms',
      items: [{ term: 'Token', definition: 'A named design value.' }],
    },
  ],
};

describe('renderIntroEntity — DSDS 0.20 sections', () => {
  const text = renderIntroEntity(entity020);

  it('renders guideline statements, not just the entity name', () => {
    expect(text).toContain('### Project setup');
    expect(text).toContain('Import `@scope/ui/styles.css` in the entry file.');
  });

  it('labels each guideline by its level', () => {
    expect(text).toContain('**Must:** Import');
    expect(text).toContain('**Should not:** Do not hand-write a reset.');
  });

  it('renders freeform section bodies', () => {
    expect(text).toContain('### Entry point');
    expect(text).toContain('Render `<App />` into `#root`.');
  });

  it('renders definitions', () => {
    expect(text).toContain('**Token:** A named design value.');
  });

  // The failure mode itself: content present on disk but absent from output.
  it('produces substantially more than the header alone', () => {
    const headerOnly = renderIntroEntity({
      identifier: entity020.identifier,
      name: entity020.name,
      metadata: entity020.metadata,
    });
    expect(text.length).toBeGreaterThan(headerOnly.length * 2);
  });

  it('still renders the older documentBlocks shape', () => {
    const legacy = renderIntroEntity({
      identifier: 'legacy',
      name: 'Legacy',
      documentBlocks: [{ kind: 'section', items: [{ title: 'Layout', body: 'Use Stack.' }] }],
    });
    expect(legacy).toContain('### Layout');
    expect(legacy).toContain('Use Stack.');
  });

  it('inlines full content when introInline is on, and only an index when off', () => {
    const inline = renderIntroBlock([entity020], { inline: true });
    const index = renderIntroBlock([entity020], { inline: false });
    expect(inline).toContain('Import `@scope/ui/styles.css`');
    expect(index).not.toContain('Import `@scope/ui/styles.css`');
    expect(index).toContain('getting-started');
  });
});
