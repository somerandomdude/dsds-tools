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

describe('renderTable — toon', () => {
  it('declares length and fields once, then one row each', () => {
    const out = renderTable(ROWS, COLS, { format: 'toon', name: 'props' }).split('\n');
    expect(out[0]).toBe('props[2]{prop,type}:');
    expect(out[1].trim()).toBe('`as`,`string`');
    expect(out).toHaveLength(3);
  });

  // Hyphenated names are quoted by the encoder, which costs two characters
  // per field on every table — camelCase passes through bare.
  it('names fields from the headers in camelCase, unquoted', () => {
    const out = renderTable([{ a: 'x', b: 'y' }],
      [{ key: 'a', header: 'Prop' }, { key: 'b', header: 'Is Required' }],
      { format: 'toon', name: 'x' });
    expect(out.split('\n')[0]).toBe('x[1]{prop,isRequired}:');
    expect(out).not.toContain('"');
  });

  // The rule the whole format depends on: encoding unrendered fields
  // measured +461% — worse than markdown — so the projection is enforced
  // here rather than trusted to each caller.
  it('encodes only the rendered columns, never extra fields on the row', () => {
    const out = renderTable([{ prop: '`as`', type: '`string`', secret: 'x'.repeat(200) }], COLS,
      { format: 'toon', name: 'props' });
    expect(out).not.toContain('secret');
    expect(out).not.toContain('xxx');
  });

  it('uses the same em dash for empty cells as markdown', () => {
    const out = renderTable([{ prop: null, type: undefined }], COLS, { format: 'toon', name: 'p' });
    expect(out).toContain('—,—');
  });

  it('states an empty array rather than returning nothing', () => {
    const out = renderTable([], COLS, { format: 'toon', name: 'props' });
    expect(out).toBe('props: []');
  });

  it('is smaller than markdown on a realistic table', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ prop: `\`p${i}\``, type: '`Responsive<Space>`' }));
    const md = renderTable(rows, COLS);
    const toon = renderTable(rows, COLS, { format: 'toon', name: 'props' });
    expect(toon.length).toBeLessThan(md.length);
  });
});

describe('renderTable — guards', () => {
  it('returns nothing without columns, in either format', () => {
    expect(renderTable(ROWS, [])).toBe('');
    expect(renderTable(ROWS, [], { format: 'toon' })).toBe('');
  });

  it('treats a non-array rows value as empty instead of throwing', () => {
    expect(() => renderTable(null, COLS)).not.toThrow();
    expect(renderTable(null, COLS)).toBe('| Prop | Type |\n|---|---|');
  });

  it('falls back to markdown for an unknown format', () => {
    expect(renderTable(ROWS, COLS, { format: 'yaml' })).toContain('| Prop | Type |');
  });
});
