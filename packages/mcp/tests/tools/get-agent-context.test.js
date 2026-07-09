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
