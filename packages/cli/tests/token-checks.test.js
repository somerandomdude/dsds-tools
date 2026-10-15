// `dsds doctor` fails on a `{token}` reference that names no token, and warns
// on a pixel value written into prose that duplicates one.
import { describe, it, expect } from 'vitest';
import { checkTokenRefs, findHardcodedTokenValues } from '../src/doctor.js';

const tokens = new Map([
  ['space-0', { name: 'space-0', type: 'dimension', file: 'space', value: { unit: 'px', value: 0 } }],
  ['space-3', { name: 'space-3', type: 'dimension', file: 'space', value: { unit: 'px', value: 12 } }],
  ['radius-0', { name: 'radius-0', type: 'dimension', file: 'radius', value: { unit: 'px', value: 0 } }],
  ['container-0', { name: 'container-0', type: 'dimension', file: 'container', value: { unit: 'px', value: 320 } }],
  ['bold', { name: 'bold', type: 'fontWeight', file: 'fontWeight', value: 700 }],
]);

const entity = (statement) => ({ id: 'card', sections: [{ kind: 'guidelines', items: [{ statement }] }] });

describe('checkTokenRefs', () => {
  it('reports a token-shaped reference that resolves to nothing, with a suggestion', () => {
    const problems = checkTokenRefs([entity('Pads by {space-33}.')], tokens);
    expect(problems).toEqual([expect.stringContaining('{space-33} names no token — did you mean {space-3}')]);
  });

  it('passes a reference that resolves', () => {
    expect(checkTokenRefs([entity('Pads by {space-3}.')], tokens)).toEqual([]);
  });

  it('ignores quoted JSX and single words in braces', () => {
    expect(checkTokenRefs([entity('Pass {true}, { Box } or {isSelected}.')], tokens)).toEqual([]);
  });

  it('ignores references inside code', () => {
    expect(checkTokenRefs([entity('Write `{space-33}` literally.')], tokens)).toEqual([]);
  });
});

describe('findHardcodedTokenValues', () => {
  it('suggests the token for a pixel value in prose', () => {
    const { hits } = findHardcodedTokenValues([entity('Card pads by 12px.')], tokens);
    expect(hits).toEqual([expect.stringContaining('12px → {space-3}')]);
  });

  it('narrows an ambiguous value by the words before it', () => {
    const { hits } = findHardcodedTokenValues([entity('The corner radius is 0px.')], tokens);
    expect(hits).toEqual([expect.stringContaining('0px → {radius-0}')]);
  });

  it('lists every candidate when context cannot decide', () => {
    const { hits } = findHardcodedTokenValues([entity('It is 0px.')], tokens);
    expect(hits[0]).toContain('{space-0} or {radius-0}');
  });

  it('skips WCAG thresholds and component minimum sizes', () => {
    const { count } = findHardcodedTokenValues(
      [entity('Large text is 24px+ regular, or 12px+ bold. Minimum size 12x12px.')],
      tokens,
    );
    expect(count).toBe(0);
  });

  it('skips a table column whose header marks it as not a token', () => {
    const table = '| Size | Height | Padding |\n| --- | --- | --- |\n| `0` | 12px | 12px |';
    const { hits } = findHardcodedTokenValues([entity(table)], tokens);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('12px → {space-3}');
  });

  it('skips negative offsets and border widths', () => {
    const { count } = findHardcodedTokenValues([entity('Trim by −12px. Card draws a 12px border.')], tokens);
    expect(count).toBe(0);
  });

  it('skips code and threshold values such as the 320px reflow width', () => {
    const { count } = findHardcodedTokenValues(
      [entity('Write `padding: 12px` never. Content must reflow at a 320px viewport.')],
      tokens,
    );
    expect(count).toBe(0);
  });
});
