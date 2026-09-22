import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../../src/loader.js';
import { getAgentContextHandler } from '../../src/tools/get-agent-context.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

describe('getAgentContextHandler', () => {
  it('returns formatted agent context for an entity that has one', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getAgentContextHandler({ identifier: 'button' }, () => systems);
    const text = result.content[0].text;
    expect(text).toContain('Agent Context');
    expect(text).toContain('Agent-optimized context');
    expect(text).toContain('Rules');
    expect(result.isError).toBeFalsy();
  });

  it('returns must/must-not constraints grouped and labeled', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const result = await getAgentContextHandler({ identifier: 'button' }, () => systems);
    expect(result.content[0].text).toContain('MUST');
    expect(result.content[0].text).toContain('MUST_NOT');
  });

  it('returns a helpful message when no agents field is defined', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
    const result = await getAgentContextHandler({ identifier: 'color-text-primary' }, () => systems);
    expect(result.content[0].text).toContain('no agent context defined');
    expect(result.content[0].text).toContain('agentDocumentBlocks');
    expect(result.isError).toBeFalsy();
  });

  it('compact (default) is smaller than verbose and omits the full doc dump', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
    const compact = (await getAgentContextHandler({ identifier: 'button' }, () => systems)).content[0].text;
    const verbose = (await getAgentContextHandler({ identifier: 'button', verbose: true }, () => systems)).content[0].text;
    expect(compact.length).toBeLessThan(verbose.length);
    expect(verbose).toContain('Full component documentation');
    expect(compact).not.toContain('Full component documentation');
  });

  it('returns isError for an unknown entity', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
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

// Measured 2026-09-21 across 310 real get_agent_context calls: `$extensions`
// was 19.5% of this tool's payload and 13.3% of ALL MCP payload in the run,
// and 95.9% of that was v3-to-v5 migration guides shipped to agents building
// something new. `renderExtensions20` sat outside the verbose branch, so the
// "compact view by default" in the tool description applied to sections and
// not to extensions. See plans/008-payload-audit.md.
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

  it('drops the migration guide from the compact view', async () => {
    const out = await ctx({ identifier: 'widget' });
    expect(out).not.toContain('Long porting prose.');
    expect(out).not.toContain('Run the codemod.');
  });

  it('keeps `implemented: false` — the agent must know there is no v5 build', async () => {
    expect(await ctx({ identifier: 'widget' })).toContain('Implemented: no');
  });

  it('says what it omitted rather than hiding it', async () => {
    expect(await ctx({ identifier: 'widget' })).toMatch(/1 migration\/porting section\(s\) omitted/);
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
