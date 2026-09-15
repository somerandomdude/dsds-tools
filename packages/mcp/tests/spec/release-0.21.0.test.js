// What 0.21.0 changed for an author, and what this server does about it.
//
// Two shape changes, and they pull in opposite directions: `traitType` is
// required, so it breaks documents; `tags` on a section is optional, so it
// breaks none. The tests below pin both, plus the two places this server
// reacts to them — the renderer groups traits by the new field, and the
// validate tool explains the one error a 0.20.x corpus is guaranteed to hit.

import { describe, expect, it } from 'vitest';
import { validateDoc20 } from '../../src/spec/validator-0.20.0.js';
import { renderTraits20 } from '../../src/spec/render-0.20.0.js';
import { validateHandler } from '../../src/tools/validate.js';
import { BUNDLED_VERSION } from '../../src/spec/version.js';

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

  // The reason the field exists: `setBy` cannot answer the same question.
  it('accepts a state the consumer sets', () => {
    const { errors } = validateDoc20(component([
      { kind: 'boolean', traitType: 'state', setBy: 'consumer', id: 'disabled', description: 'Blocks interaction.' },
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

  it('states setBy when present, since it is a different question', () => {
    const out = render([
      { kind: 'boolean', traitType: 'state', setBy: 'consumer', id: 'disabled', description: 'Blocks interaction.' },
    ]);
    expect(out).toContain('set by: consumer');
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

describe('the migration hint', () => {
  const doc = [
    'kind: component', 'id: badge', 'name: Badge', 'description: A small status label.',
    'traits:', '  - kind: boolean', '    id: loading', '    description: Pending.',
  ].join('\n');

  it('explains the one error a 0.20.x document hits', async () => {
    const text = (await validateHandler({ document: doc })).content[0].text;
    expect(text).toContain(`### Migrating to ${BUNDLED_VERSION}`);
    expect(text).toContain('1 trait here is missing it');
    expect(text).toMatch(/variant.*caller configures/);
    expect(text).toContain('migrate-to-0.21.js');
  });

  it('says nothing when traits are fine', async () => {
    const ok = doc.replace('  - kind: boolean', '  - kind: boolean\n    traitType: state');
    const text = (await validateHandler({ document: ok })).content[0].text;
    expect(text).not.toContain('### Migrating to');
  });
});
