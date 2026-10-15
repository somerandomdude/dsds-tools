// 0.21.2: documentation only. "A 0.21.1 document is a valid 0.21.2
// document." The one clarification a consumer can act on: a `same-as` may
// point at an item in ANY entry, not only in `base.shared` — "A rule one
// entry owns, such as a pattern several components follow, no longer has to
// move into `shared` to be referenced." DSDS-05 already enforced it; these
// tests hold this server to the documented form on both sides — the
// validator resolves it, and the renderer inlines it.
import { describe, expect, it } from 'vitest';
import { renderSections20 } from '../../src/spec/render.js';
import { validateDoc20 } from '../../src/spec/validator.js';

// The pattern owns the rule; the component points at it. No `shared` at all.
const PATTERN = {
  kind: 'entry',
  id: 'form-pattern',
  name: 'Form pattern',
  description: 'How forms are laid out.',
  sections: [{ kind: 'guidelines', for: 'all', items: [{ id: 'label-above-field', level: 'must', statement: 'Put the label above its field.' }] }],
};

const component = (to) => ({
  kind: 'component',
  id: 'text-input',
  name: 'TextInput',
  description: 'A single-line field.',
  sections: [{ kind: 'guidelines', for: 'all', items: [{ refs: [{ to, rel: 'same-as' }] }] }],
});

const doc = (to) => ({ schemaVersion: '0.21.2', name: 'X', entries: [PATTERN, component(to)] });

describe('same-as into an ordinary entry', () => {
  it('validates, with no shared entry anywhere in the document', () => {
    expect(validateDoc20(doc('form-pattern#label-above-field')).errors).toEqual([]);
  });

  it('still fails DSDS-05 when the item does not exist on that entry', () => {
    const { errors } = validateDoc20(doc('form-pattern#no-such-rule'));
    expect(errors.some((e) => e.startsWith('[DSDS-05]'))).toBe(true);
  });

  it('renders the borrowed rule inline', () => {
    const lines = [];
    renderSections20(component('form-pattern#label-above-field').sections, lines, { sharedEntries: [PATTERN] });
    expect(lines.join('\n')).toContain('Put the label above its field.');
  });
});
