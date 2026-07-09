import { describe, expect, it } from 'vitest';
import { isBooleanProp, isBooleanType, parseLiteralUnion, resolvePropValues } from '../src/prop-types.js';

describe('parseLiteralUnion', () => {
  it('parses string, numeric, and mixed literal unions', () => {
    expect(parseLiteralUnion("'a' | 'b'")).toEqual([
      { value: 'a', isNumber: false },
      { value: 'b', isNumber: false },
    ]);
    expect(parseLiteralUnion('0 | 1 | 2')).toEqual([
      { value: '0', isNumber: true },
      { value: '1', isNumber: true },
      { value: '2', isNumber: true },
    ]);
    expect(parseLiteralUnion("0 | 'auto'")).toEqual([
      { value: '0', isNumber: true },
      { value: 'auto', isNumber: false },
    ]);
  });

  it('unwraps any responsive-style wrapper, not just Sanity\'s', () => {
    expect(parseLiteralUnion('Responsive<0 | 1>')).toHaveLength(2);
    expect(parseLiteralUnion("ResponsiveValue<'sm' | 'lg'>")).toHaveLength(2);
    expect(parseLiteralUnion("MaybeResponsive<'a' | 'b'>")).toHaveLength(2);
  });

  it('does NOT unwrap container types — an array of literals is not a literal', () => {
    expect(parseLiteralUnion("Array<'a' | 'b'>")).toBeNull();
    expect(parseLiteralUnion("ReadonlyArray<'a' | 'b'>")).toBeNull();
  });

  it('rejects open types', () => {
    expect(parseLiteralUnion('string | number')).toBeNull();
    expect(parseLiteralUnion('React.ReactNode')).toBeNull();
    expect(parseLiteralUnion(undefined)).toBeNull();
  });
});

describe('isBooleanType', () => {
  it('accepts boolean and responsive-wrapped boolean from any system', () => {
    expect(isBooleanType('boolean')).toBe(true);
    expect(isBooleanType('boolean | undefined')).toBe(true);
    expect(isBooleanType('Responsive<boolean>')).toBe(true);
    expect(isBooleanType('ResponsiveValue<boolean>')).toBe(true);
  });
  it('rejects non-boolean and container-wrapped', () => {
    expect(isBooleanType('string')).toBe(false);
    expect(isBooleanType('Array<boolean>')).toBe(false);
  });
});

describe('resolvePropValues — spec-authority order', () => {
  it('schema.enum wins over values and type', () => {
    const prop = {
      schema: { enum: ['x', 'y'] },
      values: ['a', 'b'],
      type: "'p' | 'q'",
    };
    expect(resolvePropValues(prop).map((m) => m.value)).toEqual(['x', 'y']);
  });

  it('values win over the type string', () => {
    const prop = { values: ['default', 'primary', 'ghost'], type: 'the visual style' };
    expect(resolvePropValues(prop).map((m) => m.value)).toEqual(['default', 'primary', 'ghost']);
  });

  it('numeric values are tagged as numbers', () => {
    const prop = { values: [0, 1, 2, 'auto'] };
    expect(resolvePropValues(prop)).toEqual([
      { value: '0', isNumber: true },
      { value: '1', isNumber: true },
      { value: '2', isNumber: true },
      { value: 'auto', isNumber: false },
    ]);
  });

  it('falls back to the type string when schema/values are absent', () => {
    expect(resolvePropValues({ type: "'a' | 'b'" }).map((m) => m.value)).toEqual(['a', 'b']);
  });

  it('skips non-literal enum members; null when nothing usable', () => {
    expect(resolvePropValues({ schema: { enum: [true, false] } })).toBeNull();
    expect(resolvePropValues({ type: 'string' })).toBeNull();
    expect(resolvePropValues({})).toBeNull();
  });
});

describe('isBooleanProp', () => {
  it('schema.type is authoritative', () => {
    expect(isBooleanProp({ schema: { type: 'boolean' }, type: 'a switch' })).toBe(true);
  });
  it('falls back to the type string', () => {
    expect(isBooleanProp({ type: 'Responsive<boolean>' })).toBe(true);
    expect(isBooleanProp({ type: 'string' })).toBe(false);
  });
});
