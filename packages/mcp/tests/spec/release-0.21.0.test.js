// What 0.21.0 changed for an author, and what this server does about it.
//
// Three changes, pulling in different directions: `traitType` is required, so
// it breaks documents; `tags` on a section is optional, so it breaks none;
// and `rel: agent-test` widened what DSDS-03 accepts. The tests below pin the
// first two, and the renderer grouping traits by the new field. 0.22.0
// replaced the third (a check's kind is its `role` now, with no `rel`) and
// the 0.21 migration hint; release-0.22.0.test.js covers both.

import { describe, expect, it } from 'vitest';
import { validateDoc20 } from '../../src/spec/validator.js';
import { renderTraits20 } from '../../src/spec/render.js';

const component = (traits) => ({
  id: 'badge',
  kind: 'component',
  name: 'Badge',
  description: 'A small status label.',
  traits,
});

const render = (traits) => {
  const lines = [];
  renderTraits20(traits, lines);
  return lines.join('\n');
};

describe('traitType — required on every trait', () => {
  it('rejects a trait without it', () => {
    const { errors } = validateDoc20(component([
      { kind: 'boolean', id: 'loading', description: 'Pending.' },
    ]));
    expect(errors.join(' ')).toMatch(/required property 'traitType'/);
  });

  it('rejects a value outside variant | state', () => {
    const { errors } = validateDoc20(component([
      { kind: 'boolean', traitType: 'modifier', id: 'loading', description: 'Pending.' },
    ]));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts either value, on either kind', () => {
    const { errors } = validateDoc20(component([
      { kind: 'boolean', traitType: 'state', id: 'loading', description: 'Pending.' },
      { kind: 'boolean', traitType: 'variant', id: 'outlined', description: 'Outlined form.' },
      { kind: 'enum', traitType: 'variant', id: 'size', description: 'Scale.', values: [{ id: 'md', description: 'Default.' }] },
      { kind: 'enum', traitType: 'state', id: 'validity', description: 'Validation state.', values: [{ id: 'invalid', description: 'Failed.' }] },
    ]));
    expect(errors).toEqual([]);
  });

  // The case the field exists for: a state the consumer turns on. 0.21.0
  // removed `setBy`, so `traitType` has to carry this on its own.
  it('accepts a state the consumer sets, with no `setBy` to lean on', () => {
    const { errors } = validateDoc20(component([
      { kind: 'boolean', traitType: 'state', id: 'disabled', description: 'Blocks interaction.' },
    ]));
    expect(errors).toEqual([]);
  });
});

describe('renderTraits20 — grouped by traitType', () => {
  it('splits variants from states', () => {
    const out = render([
      { kind: 'enum', traitType: 'variant', id: 'size', description: 'Scale.', values: [{ id: 'md' }] },
      { kind: 'boolean', traitType: 'state', id: 'loading', description: 'Pending.' },
    ]);
    expect(out).toContain('**Variants**');
    expect(out).toContain('**States**');
    expect(out.indexOf('**Variants**')).toBeLessThan(out.indexOf('**States**'));
    expect(out.slice(out.indexOf('**Variants**'), out.indexOf('**States**'))).toContain('`size`');
  });

  it('renders a state that the consumer sets with no extra qualifier', () => {
    const out = render([
      { kind: 'boolean', traitType: 'state', id: 'disabled', description: 'Blocks interaction.' },
    ]);
    expect(out).toContain('`disabled`');
    expect(out).not.toContain('set by:');
  });

  it('adds no headings when every trait is the same sort', () => {
    const out = render([
      { kind: 'boolean', traitType: 'state', id: 'loading', description: 'Pending.' },
      { kind: 'boolean', traitType: 'state', id: 'hover', description: 'Pointer over.' },
    ]);
    expect(out).not.toContain('**States**');
    expect(out).toContain('`loading`');
  });

  // A 0.20.x document still loads; it must not be filed under a guess.
  it('keeps an unclassified trait separate rather than guessing', () => {
    const out = render([
      { kind: 'boolean', traitType: 'state', id: 'loading', description: 'Pending.' },
      { kind: 'boolean', id: 'legacy', description: 'No traitType.' },
    ]);
    expect(out).toContain('**Unclassified**');
    expect(out.slice(out.indexOf('**Unclassified**'))).toContain('`legacy`');
  });
});

describe('section tags — optional, so nothing breaks', () => {
  it('accepts a section that declares tags', () => {
    const { errors } = validateDoc20({
      id: 'badge',
      kind: 'component',
      name: 'Badge',
      description: 'A small status label.',
      sections: [{ kind: 'guidelines', for: 'all', tags: ['accessibility'], items: [{ level: 'must', statement: 'Give it an accessible name.' }] }],
    });
    expect(errors).toEqual([]);
  });

  it('still accepts a section with none', () => {
    const { errors } = validateDoc20({
      id: 'badge',
      kind: 'component',
      name: 'Badge',
      description: 'A small status label.',
      sections: [{ kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'Give it an accessible name.' }] }],
    });
    expect(errors).toEqual([]);
  });
});
