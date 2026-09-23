// 0.21.1: an item that points elsewhere no longer restates what it borrows.
//
// A section item carrying `refs` is exempt from its kind's required content
// fields — a `guidelines` item needs no `level`, a `definitions` item no
// `term`/`definition`, a `steps` item no `title`. The changelog puts the
// consequence on consumers in as many words: "these fields are no longer
// guaranteed present. Resolve the same-as target to obtain them."
//
// Two shapes, rendered differently, and the distinction is the point:
//
//   Pure pointer  the item declares nothing of its own, so the target IS the
//                 item. Render it inline — a reader asking for a component's
//                 rules should get the rules, not a list of links.
//   Sharpened     the item states its own rule and points at a broader one.
//                 The local text governs; the pointer rides along so the
//                 reader can see what it narrows.

import { describe, expect, it } from 'vitest';
import { hydrateSharedItem20, renderSections20, resolveSharedItem20 } from '../../src/spec/render.js';
import { validateDoc20 } from '../../src/spec/validator.js';
import { checkStyle20 } from '../../src/spec/style-guide.js';
import { BUNDLED_VERSION } from '../../src/spec/version.js';

const SHARED = [{
  id: 'shared-foundations',
  sections: [{
    kind: 'guidelines',
    items: [
      {
        id: 'never-disable-error',
        level: 'must',
        statement: 'Never disable an input that is in an error state.',
        checkedBy: 'manual',
        alternatives: [{ to: 'text-input', rel: 'alternative-to' }],
      },
      { id: 'ok', term: 'OK', definition: 'The confirm affordance.' },
      { id: 'install', title: 'Install the package', description: 'Run the install command.' },
    ],
  }],
}];

const render = (sections) => {
  const lines = [];
  renderSections20(sections, lines, { sharedEntries: SHARED });
  return lines.join('\n');
};

const guidelines = (items) => [{ kind: 'guidelines', for: 'all', items }];
const POINTER = { to: 'shared-foundations#never-disable-error', rel: 'same-as' };

describe('the schema relaxation', () => {
  const doc = (items) => ({
    id: 'widget', kind: 'component', name: 'Widget', description: 'A widget.',
    sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items }],
  });

  it('accepts a guidelines item that is nothing but a pointer', () => {
    expect(validateDoc20(doc([{ refs: [POINTER] }])).errors).toEqual([]);
  });

  it('still accepts the 0.21.0 form that declares `level` alongside the pointer', () => {
    expect(validateDoc20(doc([{ level: 'must', refs: [POINTER] }])).errors).toEqual([]);
  });

  it('still rejects an item that neither states a rule nor points at one', () => {
    expect(validateDoc20(doc([{ level: 'must' }])).errors.length).toBeGreaterThan(0);
  });
});

describe('resolveSharedItem20', () => {
  it('calls an item with no content of its own a pure pointer', () => {
    const { pure, target } = resolveSharedItem20({ refs: [POINTER] }, SHARED, ['statement']);
    expect(pure).toBe(true);
    expect(target.id).toBe('never-disable-error');
  });

  it('treats a declared `level` as redundant, not as content', () => {
    // DSDS-10 reframed to "when declared, must match" — a level next to a
    // same-as is still borrowing the rule, so this stays a pure pointer.
    expect(resolveSharedItem20({ level: 'must', refs: [POINTER] }, SHARED, ['statement']).pure).toBe(true);
  });

  it('calls an item with its own statement sharpened, not pure', () => {
    const item = { level: 'must-not', statement: 'Narrower rule.', refs: [{ ...POINTER, rel: 'refines' }] };
    const { pure, pointers } = resolveSharedItem20(item, SHARED, ['statement']);
    expect(pure).toBe(false);
    expect(pointers).toHaveLength(1);
  });

  it('calls an item with neither content nor refs neither', () => {
    expect(resolveSharedItem20({ level: 'must' }, SHARED, ['statement']).pure).toBe(false);
  });
});

describe('a pure pointer renders as the item it points at', () => {
  const out = render(guidelines([{ refs: [POINTER] }]));

  it('takes the target\'s level, which the item never declared', () => {
    expect(out).toContain('**must**');
  });

  it('inlines the statement rather than a link', () => {
    expect(out).toContain('Never disable an input that is in an error state.');
    expect(out).not.toContain('see shared-foundations#');
  });

  it('carries the target\'s checkedBy — the DSDS-14 false positive in 0.21.0', () => {
    expect(out).toContain('Checked by: manual');
  });

  it('carries the target\'s alternatives', () => {
    expect(out).toContain('`text-input`');
  });

  it('adds no "shared rule" trace, because the rule is already on the page', () => {
    expect(out).not.toMatch(/Shared rule|Refines/);
  });

  it('renders the 0.21.0 and 0.21.1 forms identically', () => {
    expect(render(guidelines([{ level: 'must', refs: [POINTER] }]))).toBe(out);
  });
});

describe('a sharpened item keeps its own content and shows the pointer', () => {
  const out = render(guidelines([{
    level: 'must-not',
    statement: 'Never disable this Select while it shows a validation error.',
    refs: [{ ...POINTER, rel: 'refines' }],
  }]));

  it('leads with the local rule, at the local level', () => {
    expect(out).toContain('**must-not** — Never disable this Select');
  });

  it('does not overwrite the local statement with the shared one', () => {
    expect(out).not.toContain('Never disable an input that is in an error state.\n  - Checked by');
  });

  it('shows what it refines, with a gist so the link is worth following', () => {
    expect(out).toContain('Refines: `shared-foundations#never-disable-error`');
    expect(out).toContain('Never disable an input that is in an error state.');
  });
});

describe('the other two kinds 0.21.1 relaxed', () => {
  it('resolves a definitions item that only points — `refs` is new on this kind', () => {
    const out = render([{ kind: 'definitions', for: 'all', items: [{ refs: [{ to: 'shared-foundations#ok', rel: 'same-as' }] }] }]);
    expect(out).toContain('**OK**: The confirm affordance.');
  });

  it('resolves a steps item that only points', () => {
    const out = render([{ kind: 'steps', for: 'all', items: [{ refs: [{ to: 'shared-foundations#install', rel: 'same-as' }] }] }]);
    expect(out).toContain('Install the package');
    expect(out).toContain('Run the install command.');
  });
});

describe('when the target cannot be resolved', () => {
  it('falls back to naming the pointer rather than rendering an empty bullet', () => {
    const out = render(guidelines([{ refs: [{ to: 'somewhere-else#nope', rel: 'same-as' }] }]));
    expect(out).toContain('`somewhere-else#nope`');
    // …and says it is broken. A plain "see X" read exactly like a working
    // pointer, so a rule could vanish from a page with nothing saying so.
    expect(out).toContain('**Unresolved reference:**');
    expect(out).not.toMatch(/^- see somewhere-else#nope$/m);
  });

  it('does the same when no shared pool was supplied at all', () => {
    const lines = [];
    renderSections20(guidelines([{ refs: [POINTER] }]), lines, {});
    expect(lines.join('\n')).toContain('**Unresolved reference:** `shared-foundations#never-disable-error`');
  });
});

// `dsds_get_document_block` serialises a block as JSON rather than rendering
// it, and the server's HARD RULE names it as the minimum call before using a
// component. A pointer reaching an agent through that path has to arrive with
// the rule attached, or the agent gets a link it cannot follow.
describe('hydrateSharedItem20, for callers that serialise instead of render', () => {
  it('fills a pure pointer in with what it borrows', () => {
    const out = hydrateSharedItem20({ refs: [POINTER] }, SHARED);
    expect(out.level).toBe('must');
    expect(out.statement).toBe('Never disable an input that is in an error state.');
  });

  it('keeps `refs`, so the provenance survives the merge', () => {
    expect(hydrateSharedItem20({ refs: [POINTER] }, SHARED).refs).toEqual([POINTER]);
  });

  it('leaves a sharpened item\'s own wording alone', () => {
    const item = { level: 'must-not', statement: 'Narrower rule.', refs: [{ ...POINTER, rel: 'refines' }] };
    expect(hydrateSharedItem20(item, SHARED).statement).toBe('Narrower rule.');
  });

  it('returns an unresolvable pointer untouched rather than inventing content', () => {
    const item = { refs: [{ to: 'somewhere-else#nope', rel: 'same-as' }] };
    expect(hydrateSharedItem20(item, SHARED)).toBe(item);
  });

  it('is a no-op for an ordinary item', () => {
    const item = { level: 'must', statement: 'A real rule.' };
    expect(hydrateSharedItem20(item, SHARED)).toBe(item);
  });
});

describe('the bundled version', () => {
  it('is 0.21.1', () => {
    expect(BUNDLED_VERSION).toBe('0.21.1');
  });
});

// DSDS-19 orders guideline items by `level`. A pure pointer has no `level`
// to order by — the one it borrows lives in the `shared[]` pool, usually in
// another file — so it is skipped rather than ranked. Without this, the
// enum ranker sorts an undeclared level last and reports every pointer
// above a `must` as an inversion, which is the shape 0.21.1 recommends.
describe('DSDS-19 and the pure-pointer form', () => {
  const entry = (items) => ({
    id: 'widget', kind: 'component', name: 'Widget', description: 'A widget.',
    sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items }],
  });
  const order = (doc) => (checkStyle20(doc) || []).filter((f) => f.name === 'guideline-item-level-order');

  it('does not flag a pointer sitting above a must', () => {
    expect(order(entry([
      { refs: [POINTER] },
      { level: 'must', statement: 'A real rule.' },
    ]))).toEqual([]);
  });

  it('still flags a genuine inversion between two declared levels', () => {
    expect(order(entry([
      { level: 'must-not', statement: 'Never.' },
      { level: 'must', statement: 'Always.' },
    ]))).toHaveLength(1);
  });

  it('still ranks a pointer that declares its level, the 0.21.0 form', () => {
    expect(order(entry([
      { level: 'must-not', refs: [POINTER] },
      { level: 'must', statement: 'Always.' },
    ]))).toHaveLength(1);
  });
});
