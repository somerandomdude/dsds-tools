import { describe, it, expect } from 'vitest';
import { renderTable } from '../../src/render/table.js';

const COLS = [
  { key: 'prop', header: 'Prop' },
  { key: 'type', header: 'Type' },
];
const ROWS = [
  { prop: '`as`', type: '`string`' },
  { prop: '`size`', type: '`number`' },
];

describe('renderTable — markdown', () => {
  it('writes a header, a divider of matching width, and one row each', () => {
    const out = renderTable(ROWS, COLS).split('\n');
    expect(out[0]).toBe('| Prop | Type |');
    expect(out[1]).toBe('|---|---|');
    expect(out).toHaveLength(4);
    // divider cell count must track the header's, which is exactly what
    // drifted when seven handlers each wrote their own.
    expect(out[1].split('|').length).toBe(out[0].split('|').length);
  });

  it('renders an em dash for null, undefined and empty string alike', () => {
    const out = renderTable([{ prop: null, type: '' }, { prop: undefined }], COLS);
    expect(out).toContain('| — | — |');
  });

  it('escapes a pipe so the row cannot shift columns', () => {
    const out = renderTable([{ prop: '`x`', type: 'A | B' }], COLS);
    const row = out.split('\n')[2];
    expect(row).toContain('A \\| B');
    expect((row.match(/(?<!\\)\|/g) ?? []).length).toBe(3);
  });

  // Several callers escape on the way in; escaping again showed the reader
  // a literal backslash.
  it('does not double-escape an already-escaped pipe', () => {
    const out = renderTable([{ prop: '`x`', type: 'A \\| B' }], COLS);
    expect(out).toContain('A \\| B');
    expect(out).not.toContain('A \\\\| B');
  });

  it('still states its shape when there are no rows', () => {
    const out = renderTable([], COLS);
    expect(out).toBe('| Prop | Type |\n|---|---|');
  });
});


describe('renderTable — guards', () => {
  it('returns nothing without columns', () => {
    expect(renderTable(ROWS, [])).toBe('');
  });

  it('treats a non-array rows value as empty instead of throwing', () => {
    expect(() => renderTable(null, COLS)).not.toThrow();
    expect(renderTable(null, COLS)).toBe('| Prop | Type |\n|---|---|');
  });

});

// Callers escape pipes so their cells survive a Markdown table. Escaping is
// idempotent, because several callers escape on the way in and a second pass
// would render a visible `\|` to the reader.
