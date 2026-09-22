import { describe, it, expect } from 'vitest';
import { createToolRuntime } from '../../src/registry.js';
import { createGraphGetter } from '../../src/graph.js';

// Regression: dsds_spec_entity_schema and dsds_spec_scaffold used to
// enum-constrain `kind` to the well-known 0.15.2/0.20.0 vocabulary, so a
// real namespaced custom kind (e.g. "sanity.guide" — 80 of 144 files in the
// real corpus) was rejected by input validation before the handler ever
// ran. Both now fall back to the generic `entry` shape for any validly-
// namespaced kind not otherwise known.
function buildDispatch() {
  const { dispatch } = createToolRuntime({
    getSystems: () => [],
    getSummaries: () => [],
    getGraph: createGraphGetter(() => []),
  });
  return dispatch;
}

describe('dsds_spec_entity_schema — namespaced 0.20.0 kinds', () => {
  it('accepts a namespaced custom kind through the actual dispatch/input-validation layer', async () => {
    const dispatch = buildDispatch();
    const result = await dispatch('dsds_spec_entity_schema', { kind: 'sanity.guide' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('namespaced custom kind');
    expect(result.content[0].text).toContain('id');
  });

  it('routes a namespaced kind to the entry shape', async () => {
    const dispatch = buildDispatch();
    const result = await dispatch('dsds_spec_entity_schema', { kind: 'sanity.chunk' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('real 0.20.0');
  });

  it('still rejects a kind that is neither well-known nor validly namespaced', async () => {
    const dispatch = buildDispatch();
    const result = await dispatch('dsds_spec_entity_schema', { kind: 'widget' });
    expect(result.isError).toBe(true);
  });

  it('still renders the well-known component schema unaffected by the fallback', async () => {
    const dispatch = buildDispatch();
    const result = await dispatch('dsds_spec_entity_schema', { kind: 'component' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toContain('namespaced custom kind');
    expect(result.content[0].text).toContain('sourceFiles');
  });
});


