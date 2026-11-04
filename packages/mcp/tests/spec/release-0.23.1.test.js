import { describe, expect, it } from 'vitest';
import { BUNDLED_VERSION } from '../../src/spec/version.js';

// What 0.23.1 changed for a consumer, and what this server does about it.
//
// 0.23.1 is additive and fixes a bug in the vendored validator and resolver:
//   - an entry may declare an optional `uuid`, a stable external identifier.
//     Refs still use `id`, so nothing in this server has to resolve by uuid;
//   - an inline link inside a guideline item's `example` is now found by
//     DSDS-05, DSDS-08 and the resolver's `inlineLinks`.

describe('the bundled version', () => {
  it('is 0.23.1', () => {
    expect(BUNDLED_VERSION).toBe('0.23.1');
  });
});
