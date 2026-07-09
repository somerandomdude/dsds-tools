import { describe, it, expect } from 'vitest';
import { optionsForTool, coerceFlagValues, BASE_OPTIONS } from '../src/flags.js';

const def = {
  name: 'fake_tool',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: { type: 'string' },
      limit: { type: 'integer' },
      score: { type: 'number' },
      transitive: { type: 'boolean' },
      files: { type: 'array' },
      options: { type: 'object' },
      json: { type: 'string' }, // collides with a reserved base flag
    },
    required: ['identifier'],
  },
};

describe('optionsForTool', () => {
  const { options, flagProps } = optionsForTool(def);

  it('maps flat scalars to flags', () => {
    expect(options.identifier).toEqual({ type: 'string' });
    expect(options.limit).toEqual({ type: 'string' });
    expect(options.score).toEqual({ type: 'string' });
    expect(options.transitive).toEqual({ type: 'boolean' });
    expect(flagProps).toEqual({ identifier: 'string', limit: 'integer', score: 'number', transitive: 'boolean' });
  });

  it('skips arrays and objects (JSON-only inputs)', () => {
    expect(options.files).toBeUndefined();
    expect(options.options).toBeUndefined();
  });

  it('keeps reserved base flags reserved on collision', () => {
    expect(options.json).toEqual(BASE_OPTIONS.json); // stays a boolean base flag
    expect(flagProps.json).toBeUndefined();
  });
});

describe('coerceFlagValues', () => {
  const { flagProps } = optionsForTool(def);

  it('converts by schema type', () => {
    const out = coerceFlagValues(
      { identifier: 'button', limit: '5', score: '0.5', transitive: true },
      flagProps
    );
    expect(out).toEqual({ identifier: 'button', limit: 5, score: 0.5, transitive: true });
  });

  it('skips absent values', () => {
    expect(coerceFlagValues({ identifier: 'button' }, flagProps)).toEqual({ identifier: 'button' });
  });

  it('rejects non-numeric values for numeric flags', () => {
    expect(() => coerceFlagValues({ limit: 'many' }, flagProps)).toThrow(/--limit expects an integer/);
    expect(() => coerceFlagValues({ score: 'high' }, flagProps)).toThrow(/--score expects a number/);
  });
});
