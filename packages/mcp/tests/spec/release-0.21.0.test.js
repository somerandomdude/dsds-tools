// What 0.21.0 changed for an author, and what this server does about it.
//
// Three changes, pulling in different directions: `traitType` is required, so
// it breaks documents; `tags` on a section is optional, so it breaks none;
// and `rel: agent-test` widens what DSDS-03 accepts, so it un-breaks
// documents that were previously rejected. The tests below pin all three,
// plus the places this server reacts to them — the renderer groups traits by
// the new field, and the validate tool explains the one error a 0.20.x corpus
// is guaranteed to hit.

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

// DSDS-03 (CHECKED_BY_NEEDS_REF) asks that `checkedBy: automated` point at
// something that runs. 0.21.0 added `agent-test` to the two rels that
// satisfy it. The validator hardcoded the old pair, so a conforming 0.21.0
// document was rejected — a false positive, the kind that blocks valid work.
describe('rel: agent-test — DSDS-03 evidence', () => {
  const withCheck = (rel) => ({
    id: 'badge',
    kind: 'component',
    name: 'Badge',
    description: 'A small status label.',
    sections: [{
      kind: 'guidelines',
      for: 'all',
      items: [{
        level: 'must',
        statement: 'Give it an accessible name.',
        checkedBy: 'automated',
        checks: [{ to: 'some-check', rel }],
      }],
    }],
  });

  it.each(['test', 'lint-rule', 'agent-test'])('accepts rel: %s as evidence', (rel) => {
    expect(validateDoc20(withCheck(rel)).errors).toEqual([]);
  });

  it('still rejects checkedBy: automated with no check ref at all', () => {
    const doc = withCheck('test');
    delete doc.sections[0].items[0].checks;
    expect(validateDoc20(doc).errors.join(' ')).toMatch(/checkedBy: automated but has no refs\/checks entry/);
  });

  it('names every accepted rel in the error, so the fix is in the message', () => {
    const doc = withCheck('see-also');
    const message = validateDoc20(doc).errors.join(' ');
    for (const rel of ['test', 'lint-rule', 'agent-test']) expect(message).toContain(rel);
  });

  it('matches the rel enum the vendored schema actually ships', async () => {
    const { readFileSync } = await import('node:fs');
    const { SCHEMA_DIR } = await import('../../src/spec/schema-order.js');
    const yaml = (await import('js-yaml')).default;
    const ref = yaml.load(readFileSync(`${SCHEMA_DIR}/common/ref.schema.yaml`, 'utf8'));
    const rels = JSON.stringify(ref).match(/"agent-test"/);
    expect(rels, 'schema-<bundled>/common/ref.schema.yaml should list agent-test').not.toBeNull();
  });
});
