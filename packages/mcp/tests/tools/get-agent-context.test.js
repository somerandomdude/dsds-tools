import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../../src/loader.js';
import { getAgentContextHandler } from '../../src/tools/get-agent-context.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

describe('getAgentContextHandler', () => {
  it('returns formatted agent context for an entity that has one', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'button' }, () => systems);
    const text = result.content[0].text;
    expect(text).toContain('Agent Context');
    expect(text).toContain('Guidelines');
    expect(result.isError).toBeFalsy();
  });

  it('returns must/must-not constraints grouped and labeled', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'button' }, () => systems);
    expect(result.content[0].text).toContain('**must-not**');
  });

  it('returns a helpful message when no agents field is defined', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'color-text-primary' }, () => systems);
    expect(result.content[0].text).toContain('Color Text Primary');
    expect(result.isError).toBeFalsy();
  });

  it('compact (default) is smaller than verbose and omits the full doc dump', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const compact = (await getAgentContextHandler({ identifier: 'button' }, () => systems)).content[0].text;
    const verbose = (await getAgentContextHandler({ identifier: 'button', verbose: true }, () => systems)).content[0].text;
    expect(compact.length).toBeLessThan(verbose.length);
    expect(verbose.length).toBeGreaterThan(compact.length);
    expect(compact).not.toContain('Full component documentation');
  });

  it('returns isError for an unknown entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'nonexistent' }, () => systems);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns isError when no systems are loaded', async () => {
    const result = await getAgentContextHandler({ identifier: 'button' }, () => []);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DSDS_PATHS');
  });
});

describe('getAgentContextHandler — real 0.20.0 (.dsds.yaml)', () => {
  it('renders traits/combos as the hard constraints, and only agent/all sections by default', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'button' }, () => systems);
    const text = result.content[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Traits (variants & states)');
    expect(text).toContain('Combos (pairing rules)');
    // The fixture's first `guidelines` section is for:"human" — omitted by default.
    expect(text).toContain('human-only section(s) omitted');
    expect(text).not.toContain('Limit each surface to one primary button');
  });

  it('verbose renders every section regardless of audience', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.yaml`]);
    const result = await getAgentContextHandler({ identifier: 'button', verbose: true }, () => systems);
    expect(result.content[0].text).toContain('Limit each surface to one primary button');
  });
});

// `$extensions` is ~19% of this tool's payload, almost all of it v3-to-v5
// migration guides. Gating them behind `verbose` saved ~13% of all MCP
// payload; it was reverted when two runs afterwards failed to build on v3
// prop names and the correction for one — `flexGrow` for a v3 `flex` —
// turned out to live only in the gated content.
//
// The gate itself still works and is unit-tested in tests/render/. What
// these assert is the caller's choice: get_agent_context does not use it.
describe('extensions and the compact view', () => {
  const EXT = {
    'com.sanity.ui': {
      implementationStatus: { implemented: false, availableIn: ['3.5.3'], context: 'Implementation status.' },
      migrationGuide: { context: 'Migration guide.', codemod: 'Run the codemod.', guidance: 'Long porting prose.' },
    },
  };
  // Must be the 0.20.x shape: the legacy `agentDocumentBlocks` branch never
  // reaches renderExtensions20.
  const systemsWith = ($extensions) => [{
    entities: [{
      identifier: 'widget', kind: 'component', name: 'Widget', description: 'A widget.',
      __dsds20: true,
      sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [{ level: 'must', statement: 'A rule.' }] }],
      $extensions,
    }],
  }];
  const ctx = (args, $extensions = EXT) =>
    getAgentContextHandler(args, () => systemsWith($extensions)).then((r) => r.content[0].text);

  it('delivers the migration guide in the compact view', async () => {
    const out = await ctx({ identifier: 'widget' });
    expect(out).toContain('Long porting prose.');
    expect(out).toContain('Run the codemod.');
  });

  it('keeps `implemented: false` — the agent must know there is no v5 build', async () => {
    expect(await ctx({ identifier: 'widget' })).toContain('Implemented: no');
  });

  it('omits nothing, so it has nothing to report omitting', async () => {
    expect(await ctx({ identifier: 'widget' })).not.toMatch(/migration\/porting section\(s\) omitted/);
  });

  it('still delivers the guide in full when asked verbosely', async () => {
    const out = await ctx({ identifier: 'widget', verbose: true });
    expect(out).toContain('Long porting prose.');
    expect(out).not.toMatch(/migration\/porting section\(s\) omitted/);
  });

  it('leaves no bare "Tool data" heading when compaction empties the block', async () => {
    const out = await ctx({ identifier: 'widget' }, { 'com.sanity.ui': { migrationGuide: { guidance: 'Only prose.' } } });
    expect(out).not.toMatch(/## Tool data\s*\n\s*(##|>|$)/);
  });
});
