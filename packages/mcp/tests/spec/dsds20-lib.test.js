import { describe, it, expect } from 'vitest';
import { entriesIn20, findRefs20, isBaseDoc20, loadYaml20 } from '../../src/spec/dsds20-lib.js';

describe('loadYaml20', () => {
  it('parses a bare date as a string, not a Date object', () => {
    const doc = loadYaml20('date: 2026-06-02');
    expect(typeof doc.date).toBe('string');
    expect(doc.date).toBe('2026-06-02');
  });
});

describe('isBaseDoc20 / entriesIn20', () => {
  it('treats a document with schemaVersion as a base document', () => {
    const base = { schemaVersion: '0.20.0', name: 'X', entries: [{ id: 'a', kind: 'entry', name: 'A', description: 'd' }] };
    expect(isBaseDoc20(base)).toBe(true);
    expect(entriesIn20(base)).toHaveLength(1);
  });

  it('treats a document without schemaVersion as a standalone entry', () => {
    const entry = { id: 'a', kind: 'component', name: 'A', description: 'd' };
    expect(isBaseDoc20(entry)).toBe(false);
    expect(entriesIn20(entry)).toEqual([entry]);
  });

  it('includes shared entries alongside entries', () => {
    const base = {
      schemaVersion: '0.20.0',
      name: 'X',
      entries: [{ id: 'a', kind: 'entry', name: 'A', description: 'd' }],
      shared: [{ id: 'shared-1', name: 'Shared', description: 'd' }],
    };
    expect(entriesIn20(base).map(e => e.id)).toEqual(['a', 'shared-1']);
  });
});

describe('findRefs20', () => {
  it('finds every {to, rel} pair anywhere inside a value', () => {
    const entry = {
      id: 'button',
      refs: [{ to: 'link', rel: 'alternative-to' }],
      sections: [
        { kind: 'guidelines', items: [{ statement: 'x', level: 'must', refs: [{ to: 'other', rel: 'same-as' }] }] },
      ],
    };
    const found = [];
    findRefs20(entry, '', found);
    expect(found).toHaveLength(2);
    expect(found.map(f => f.to).sort()).toEqual(['link', 'other']);
  });

  it('does not pick up combos (bare-string subject/items, not {to, rel} objects)', () => {
    const entry = { id: 'x', combos: [{ subject: 'a', level: 'must-not', items: ['b'] }] };
    const found = [];
    findRefs20(entry, '', found);
    expect(found).toHaveLength(0);
  });
});
