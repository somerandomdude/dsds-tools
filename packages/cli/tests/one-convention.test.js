// Porcelain accepts the tool's own argument shape as well as its positionals.
//
// Measured across the four 2026-09-11 ui5-cli runs: 25 of 55 failed calls
// were a correctly-shaped argument aimed at the wrong convention. The MCP
// surface never has this problem because each tool publishes one shape. The
// CLI cannot publish a schema through a single generic tool, so instead it
// accepts every form an agent plausibly writes.

import { describe, it, expect } from 'vitest';
import { PORCELAIN, aliasOptions, applyFlagAliases, resolvePositionals } from '../src/porcelain.js';
import { runCli, VALID_SYSTEM } from './helpers.js';

const withSystem = { env: { DSDS_PATHS: VALID_SYSTEM } };

describe('resolvePositionals', () => {
  const spec = { schemaKeys: ['identifier'], positionals: { min: 1, max: 1 } };

  it('fills a missing positional from the schema-named flag', () => {
    expect(resolvePositionals(spec, [], { identifier: 'button' })).toEqual(['button']);
  });

  it('fills it from --args JSON', () => {
    expect(resolvePositionals(spec, [], { args: '{"identifier":"button"}' })).toEqual(['button']);
  });

  it('lifts a key=value positional into the flag it names', () => {
    expect(resolvePositionals(spec, ['identifier=button'], {})).toEqual(['button']);
  });

  // The positional is the documented form; preferring the flag over an
  // explicit positional would be the more surprising of the two.
  it('prefers an explicit positional over the flag', () => {
    expect(resolvePositionals(spec, ['button'], { identifier: 'card' })).toEqual(['button']);
  });

  it('leaves a positional that merely contains = alone', () => {
    const search = { schemaKeys: ['query'], positionals: { min: 1, max: 1 } };
    expect(resolvePositionals(search, ['a=b'], {})).toEqual(['a=b']);
  });

  it('does not lift an unknown key=value', () => {
    expect(resolvePositionals(spec, ['zzz=1'], {})).toEqual(['zzz=1']);
  });

  it('rejects --args that is not a JSON object', () => {
    expect(() => resolvePositionals(spec, [], { args: 'not json' })).toThrow(/must be a JSON object/);
  });

  describe('variadic commands take one list, however it is written', () => {
    const ce = { variadicKey: 'components', positionals: { min: 1, max: Infinity } };
    for (const [label, value] of [
      ['comma', 'Box,Card'],
      ['whitespace', 'Box Card'],
      ['JSON array', '["Box","Card"]'],
    ]) {
      it(label, () => {
        expect(resolvePositionals(ce, [], { components: value })).toEqual(['Box', 'Card']);
      });
    }

    it('and from --args', () => {
      expect(resolvePositionals(ce, [], { args: '{"components":["Box","Card"]}' })).toEqual(['Box', 'Card']);
    });
  });
});

describe('aliasOptions', () => {
  it('declares a flag for every schema key so parseArgs accepts it', () => {
    expect(aliasOptions({ schemaKeys: ['identifier'] })).toHaveProperty('identifier');
    expect(aliasOptions({ variadicKey: 'components' })).toHaveProperty('components');
    expect(aliasOptions({ flagAliases: { blockType: 'block' } })).toHaveProperty('blockType');
  });

  it('is empty for a command with no positionals', () => {
    expect(aliasOptions(PORCELAIN.list)).toEqual({});
  });
});

describe('applyFlagAliases', () => {
  it('maps the schema name onto the porcelain name', () => {
    const values = applyFlagAliases({ flagAliases: { blockType: 'block' } }, { blockType: 'api' });
    expect(values.block).toBe('api');
  });

  it('does not override the porcelain name when both are given', () => {
    const values = applyFlagAliases({ flagAliases: { blockType: 'block' } }, { block: 'api', blockType: 'guidelines' });
    expect(values.block).toBe('api');
  });
});

// End to end, against the real CLI: every form an agent was observed
// writing for the same call must now work.
describe('the forms that used to fail, end to end', () => {
  it.each([
    [['brief', 'build']],
    [['brief', '--useCase', 'build']],
    [['brief', 'useCase=build']],
  ])('brief: %j', async (argv) => {
    const { code } = await runCli(argv, withSystem);
    expect(code).toBe(0);
  });

  it.each([
    [['get', 'test-button']],
    [['get', '--identifier', 'test-button']],
    [['get', 'identifier=test-button']],
    [['get', '--args', '{"identifier":"test-button"}']],
  ])('get: %j', async (argv) => {
    const { code, stdout } = await runCli(argv, withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('get --blockType is the same as --block', async () => {
    const a = await runCli(['get', 'test-button', '--block', 'api'], withSystem);
    const b = await runCli(['get', 'test-button', '--blockType', 'api'], withSystem);
    expect(b.code).toBe(a.code);
    expect(b.stdout).toBe(a.stdout);
  });

  it('search accepts --query', async () => {
    const { code, stdout } = await runCli(['search', '--query', 'test button'], withSystem);
    expect(code).toBe(0);
    expect(stdout).toContain('test-button');
  });

  it('a still-missing required argument reports usage, not a crash', async () => {
    const { code, stderr } = await runCli(['get'], withSystem);
    expect(code).toBe(1);
    expect(stderr).toContain('usage:');
  });
});
