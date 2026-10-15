import { describe, expect, it } from 'vitest';
import { createToolRuntime } from '../src/registry.js';

// Every argument error in the 2026-09-10 usage log was the same shape mistake:
// a lone string passed where the schema wants a list, all on
// dsds_lint_by_path's `files`. The call's meaning is unambiguous — one item —
// so the dispatcher wraps it instead of rejecting it.
const runtime = () =>
  createToolRuntime({
    getSystems: () => [],
    getSummaries: () => [],
    getLintConfig: () => ({ plugins: [], resolveDir: process.cwd() }),
  });

describe('dispatch — a lone string where a list is expected', () => {
  it('wraps a string for an array-of-objects arg, using the schema\'s required key', async () => {
    const { dispatch } = runtime();
    const res = await dispatch('dsds_lint_by_path', { files: 'src/App.tsx' });
    // It reaches the handler: the only complaint left is about the file
    // itself, not the argument shape.
    expect(res.content[0].text).not.toContain('must be an array');
  });

  it('wraps a string for an array-of-strings arg', async () => {
    const { dispatch } = runtime();
    const res = await dispatch('dsds_check_exports', { components: 'Button' });
    expect(res.content[0].text).not.toContain('must be an array');
  });

  it('still rejects a non-string scalar, which would mean inventing data', async () => {
    const { dispatch } = runtime();
    const res = await dispatch('dsds_check_exports', { components: 42 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('must be an array, got number');
  });

  it('still rejects an object, which is not a one-item list', async () => {
    const { dispatch } = runtime();
    const res = await dispatch('dsds_check_exports', { components: { name: 'Button' } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('must be an array');
  });

  it('leaves a correctly-shaped array untouched', async () => {
    const { dispatch } = runtime();
    const res = await dispatch('dsds_check_exports', { components: ['Button', 'Card'] });
    expect(res.content[0].text).not.toContain('must be an array');
  });
});
