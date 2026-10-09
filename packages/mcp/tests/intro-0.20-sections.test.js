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


  it('inlines full content when introInline is on, and only an index when off', () => {
    const inline = renderIntroBlock([entity020], { inline: true });
    const index = renderIntroBlock([entity020], { inline: false });
    expect(inline).toContain('Import `@scope/ui/styles.css`');
    expect(index).not.toContain('Import `@scope/ui/styles.css`');
    expect(index).toContain('getting-started');
  });
});

// Steps and file-backed examples reach the intro (2026-10-07). Setup is written
// as steps, and a guide shows the real tsconfig by pointing at the file; before
// this, the intro carried the rules about both and neither the steps nor the file.
describe('renderIntroEntity — steps and file examples', () => {
  it('renders steps in order, and inlines a file an example points at', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'intro-'));
    writeFileSync(join(dir, 'tsconfig.json'), '{ "compilerOptions": { "jsx": "react-jsx" } }\n');
    const out = renderIntroEntity({
      name: 'Installation',
      __filePath: join(dir, 'installation.dsds.yaml'),
      sections: [
        { kind: 'steps', ordered: true, title: 'Set up', items: [{ title: 'Install', description: 'npm i' }, { title: 'Entry file', description: "import './styles.css'" }] },
        { kind: 'section', freeform: [{ title: 'Files', body: 'Start here.', examples: [{ ref: { href: './tsconfig.json', rel: 'source' } }, { ref: { href: './missing.json', rel: 'source' } }] }] },
      ],
    });
    expect(out).toContain('### Set up');
    expect(out.indexOf('**1. Install**')).toBeLessThan(out.indexOf('**2. Entry file**'));
    expect(out).toContain('"jsx": "react-jsx"');
    expect(out).toContain('*Example file not found: `./missing.json`*');
  });
});
