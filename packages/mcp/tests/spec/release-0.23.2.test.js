import { describe, expect, it } from 'vitest';
import { BUNDLED_VERSION } from '../../src/spec/version.js';
import { resolveSharedItem20 } from '../../src/spec/render.js';

// What 0.23.2 changed for a consumer, and what this server does about it.
//
// 0.23.2 lets `refines` point at a rule written for any audience, not only a
// `for: agent` rule. A consumer applies both rules and the refinement does not
// replace the one it refines. The server reads `refines` the same way for
// every audience, so the change is in the wording, not in the code path.

describe('the bundled version', () => {
  it('is 0.23.2', () => {
    expect(BUNDLED_VERSION).toBe('0.23.2');
  });
});

describe('refines for any audience', () => {
  const POINTER = { to: 'shared-a11y#focus-visible' };

  it('reads a refinement on a component rule, not only on a for: agent rule', () => {
    const item = { level: 'must', statement: 'Narrower component rule.', refines: [POINTER] };
    const { pointers, pure } = resolveSharedItem20(item, [], ['statement']);
    expect(pure).toBe(false);
    expect(pointers).toEqual([{ ...POINTER, rel: 'refines' }]);
  });
});
