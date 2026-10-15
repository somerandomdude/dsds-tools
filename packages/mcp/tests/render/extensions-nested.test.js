// `$extensions.<ns>` carries one object per extension, each with its own
// `context`, as well as the original flat shape.
//
// The corpus moved to the nested form so a namespace can hold two unrelated
// things — implementation status and a migration guide — without either one's
// keys being read as the other's. `extensions.schema.yaml` puts no shape on a
// namespace, so both forms are legal and both have to render: a nested corpus
// that rendered nothing would have hidden 39 migration guides silently, which
// is the exact failure this renderer's namespace allowlist exists to prevent.

import { describe, it, expect } from 'vitest';
import { renderExtensions20 } from '../../src/spec/render.js';

const render = (extensions) => {
  const lines = [];
  renderExtensions20(extensions, lines);
  return lines.join('\n');
};

describe('renderExtensions20 — com.sanity.ui', () => {
  it('renders the flat shape', () => {
    const out = render({
      'com.sanity.ui': {
        context: 'Implementation status.',
        implemented: true,
        availableIn: ['5.0.0-alpha.7'],
        tracking: 'https://example.test/pr/1',
      },
    });
    expect(out).toContain('Implemented: yes');
    expect(out).toContain('Available in: 5.0.0-alpha.7');
    expect(out).toContain('Tracking: https://example.test/pr/1');
    expect(out).toContain('Implementation status.');
  });

  it('renders one object per extension, each under its own heading', () => {
    const out = render({
      'com.sanity.ui': {
        implementationStatus: {
          context: 'Implementation status.',
          implemented: false,
          availableIn: ['3.5.3'],
        },
        migrationGuide: {
          context: 'How to port this component.',
          codemod: 'Run the codemod: `pnpx @sanity/ui-codemod latest:stack`',
          guidance: '`space` is now `gap`.',
        },
      },
    });
    expect(out).toContain('**Implementation status**');
    expect(out).toContain('Implemented: no');
    expect(out).toContain('Available in: 3.5.3');
    expect(out).toContain('**Migration guide**');
    expect(out).toContain('How to port this component.');
    // the prose keys of a nested extension are content, not facts, so they
    // render as text rather than as a `- key: value` line
    expect(out).toContain('Run the codemod: `pnpx @sanity/ui-codemod latest:stack`');
    expect(out).toContain('`space` is now `gap`.');
  });

  it('keeps implementation status and migration guidance apart', () => {
    const out = render({
      'com.sanity.ui': {
        implementationStatus: { implemented: true },
        migrationGuide: { guidance: 'Rename the prop.' },
      },
    });
    const status = out.indexOf('**Implementation status**');
    const migration = out.indexOf('**Migration guide**');
    expect(status).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(status);
    expect(out.slice(status, migration)).toContain('Implemented: yes');
    expect(out.slice(status, migration)).not.toContain('Rename the prop.');
  });

  // The guard the namespace allowlist is built around: never drop data.
  it('still renders a sub-object it does not recognize', () => {
    const out = render({
      'com.sanity.ui': { somethingNew: { context: 'A future extension.', body: 'Its content.' } },
    });
    expect(out).toContain('**Something new**');
    expect(out).toContain('A future extension.');
    expect(out).toContain('Its content.');
  });
});
