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
    expect(await ctx({ identifier: 'widget' })).toContain('Long porting prose.');
  });

  // The codemod is a command to run over existing v3 files; an agent writing
  // new code has none (2026-10-07).
  it('leaves the codemod out of the compact view, and in the verbose one', async () => {
    expect(await ctx({ identifier: 'widget' })).not.toContain('Run the codemod.');
    expect(await ctx({ identifier: 'widget', verbose: true })).toContain('Run the codemod.');
  });

  it('keeps the prop mapping and drops the prose that restates it', async () => {
    const guidance = [
      '### Key differences', '', '- `wrap` is now `flexWrap`.', '',
      '### Detailed list of differences', '', '| v3 prop | v5 prop |', '| :-- | :-- |', '| `wrap` | `flexWrap` |', '',
      '### Codemod', '', '```', 'pnpx @sanity/ui-codemod latest:flex', '```', '',
      '### Breaking changes', '', '- **`wrap` renamed to `flexWrap`.**',
    ].join('\n');
    const out = await ctx({ identifier: 'widget' }, { 'com.sanity.ui': { migrationGuide: { guidance } } });
    expect(out).toContain('| `wrap` | `flexWrap` |');
    expect(out).toContain('### Breaking changes');
    expect(out).not.toContain('### Key differences');
    expect(out).not.toContain('pnpx @sanity/ui-codemod');
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

describe('the build view drops what only a reviewer or a tool reads', () => {
  const systemsWith = (item) => [{
    entities: [{
      identifier: 'widget', kind: 'component', name: 'Widget', __dsds20: true,
      sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [item] }],
    }],
  }];
  const ctx = (item, args = {}) =>
    getAgentContextHandler({ identifier: 'widget', ...args }, () => systemsWith(item)).then((r) => r.content[0].text);

  it('omits "Checked by" in the compact view only', async () => {
    const item = { level: 'must', statement: 'A rule.', checkedBy: 'manual' };
    expect(await ctx(item)).not.toContain('Checked by');
    expect(await ctx(item, { verbose: true })).toContain('Checked by: manual');
  });

  // Never a silent drop: the namespace is named, and the data is one call away.
  it('names an unknown extension namespace instead of dumping it', async () => {
    const item = { level: 'must', statement: 'A rule.', $extensions: { 'io.jev': { type: 'boolean' } } };
    const out = await ctx(item);
    expect(out).toMatch(/Tool data for `io\.jev` not shown/);
    expect(out).not.toContain('"type": "boolean"');
    expect(await ctx(item, { verbose: true })).toContain('"type": "boolean"');
  });
});

// `agentContextOmit`: server-configured extension content left out of the
// default view, said so in the view, and still returned verbosely (2026-10-07).
describe('agentContextOmit', () => {
  const systems = [{
    entities: [{
      identifier: 'flex', kind: 'component', name: 'Flex', __dsds20: true,
      sections: [{
        kind: 'guidelines', for: 'all', framing: 'how-to-use',
        items: [{ level: 'must', statement: 'A rule.', $extensions: { 'io.jev': { type: 'boolean' } } }],
      }],
      $extensions: {
        'com.sanity.ui': {
          implementationStatus: { implemented: true, context: 'Implementation status.' },
          migrationGuide: { context: 'Migration guide.', guidance: '| v3 | v5 |\n| `wrap` | `flexWrap` |' },
        },
      },
    }],
  }];
  const ctx = (args, omit) =>
    getAgentContextHandler(args, () => systems, null, { agentContextOmit: omit }).then((r) => r.content[0].text);

  it('leaves out one block inside a namespace, and keeps the rest of it', async () => {
    const out = await ctx({ identifier: 'flex' }, ['com.sanity.ui.migrationGuide']);
    expect(out).not.toContain('flexWrap');
    expect(out).toContain('Implemented: yes');
    expect(out).toMatch(/Left out by this server's configuration: `com\.sanity\.ui\.migrationGuide`/);
  });

  it('leaves out a whole namespace, at item level too', async () => {
    const out = await ctx({ identifier: 'flex' }, ['io.jev']);
    expect(out).not.toMatch(/io\.jev` not shown/);
    expect(out).toMatch(/Left out by this server's configuration: `io\.jev`/);
  });

  it('returns everything verbosely, and says nothing about omitting', async () => {
    const out = await ctx({ identifier: 'flex', verbose: true }, ['com.sanity.ui.migrationGuide']);
    expect(out).toContain('flexWrap');
    expect(out).not.toMatch(/Left out by this server/);
  });

  it('omits nothing when unconfigured', async () => {
    const out = await ctx({ identifier: 'flex' }, undefined);
    expect(out).toContain('flexWrap');
    expect(out).not.toMatch(/Left out by this server/);
  });
});

// Shared rules: a rule the docs declare once and point to (`same-as`) is given
// in full once at the top of a multi-component answer; each component names it
// in one line. Short rules stay where they are (2026-10-08).
describe('shared rules in a multi-component answer', () => {
  const LONG = '**Error text, not error color alone.** A field in an error state needs the error described in text, linked to the field with `aria-describedby`, so assistive technology announces the error with the field. Color alone is not enough for anyone who cannot see it.';
  const pool = [{
    id: 'forms', kind: 'sanity.pattern', name: 'Forms',
    sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [
      { id: 'error-text', level: 'should', statement: LONG },
      { id: 'short-rule', level: 'must', statement: 'Keep labels short.' },
    ] }],
  }];
  const entity = (id) => ({
    identifier: id, kind: 'component', name: id, __dsds20: true, __sharedEntries: pool,
    sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [
      { refs: [{ to: 'forms#error-text', rel: 'same-as' }] },
      { refs: [{ to: 'forms#short-rule', rel: 'same-as' }] },
      { level: 'must', statement: `A rule only ${id} has.` },
    ] }],
  });
  const systems = [{ entities: [entity('checkbox'), entity('radio')] }];
  const ctx = (identifier) => getAgentContextHandler({ identifier }, () => systems).then((r) => r.content[0].text);

  it('gives a long shared rule in full once, at the top, with who it applies to', async () => {
    const out = await ctx(['checkbox', 'radio']);
    expect(out.split('described in text').length - 1).toBe(1);
    const top = out.slice(out.indexOf('## Shared rules'), out.indexOf('---'));
    expect(top).toContain('Rule `forms#error-text`. Applies to: `checkbox`, `radio`.');
  });

  it('names it in each component by its bold lead sentence', async () => {
    const out = await ctx(['checkbox', 'radio']);
    expect(out.split('- **should** — Error text, not error color alone. *(shared rule, see top)*').length - 1).toBe(2);
  });

  it('keeps a short shared rule in place under each component', async () => {
    const out = await ctx(['checkbox', 'radio']);
    expect(out.split('- **must** — Keep labels short.').length - 1).toBe(2);
    expect(out).not.toContain('Rule `forms#short-rule`');
  });

  it('keeps every rule in full for a single component', async () => {
    const out = await ctx('checkbox');
    expect(out).toContain('described in text');
    expect(out).not.toContain('## Shared rules');
  });

  it('never writes "Same as under" notes', async () => {
    expect(await ctx(['checkbox', 'radio'])).not.toContain('Same as under');
  });
});
