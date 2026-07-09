import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems, summarizeEntities } from '../../src/loader.js';
import { contextBriefHandler } from '../../src/tools/context-brief.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

function makeGetters(systems) {
  return [() => systems, () => summarizeEntities(systems)];
}

describe('contextBriefHandler', () => {
  describe('build use case', () => {
    it('returns the build brief', async () => {
      const result = await contextBriefHandler({ useCase: 'build' }, () => [], () => []);
      expect(result.content[0].text).toContain('Before you build');
      expect(result.isError).toBeFalsy();
    });

    it('prepends a task header when task is provided', async () => {
      const result = await contextBriefHandler(
        { useCase: 'build', task: 'a login form' },
        () => [], () => []
      );
      expect(result.content[0].text).toContain('Your task: a login form');
    });

    it('includes a not-configured notice when no systems are loaded', async () => {
      const result = await contextBriefHandler({ useCase: 'build' }, () => [], () => []);
      expect(result.content[0].text).toContain('DSDS_PATHS');
    });

    it('includes entity counts when systems are loaded', async () => {
      const { systems } = await loadSystems([
        `${fixturesDir}/button.dsds.json`,
        `${fixturesDir}/tokens.dsds.json`,
      ]);
      const result = await contextBriefHandler({ useCase: 'build' }, ...makeGetters(systems));
      expect(result.content[0].text).toContain('4 entities loaded');
    });

    it('lists deprecated entities as warnings', async () => {
      const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
      const result = await contextBriefHandler({ useCase: 'build' }, ...makeGetters(systems));
      expect(result.content[0].text).toContain('deprecated');
      expect(result.content[0].text).toContain('color-grey-100');
    });
  });

  describe('author use case', () => {
    it('returns the author brief', async () => {
      const result = await contextBriefHandler({ useCase: 'author' }, () => [], () => []);
      expect(result.content[0].text).toContain('Before you author');
      expect(result.isError).toBeFalsy();
    });

    it('prepends a task header when task is provided', async () => {
      const result = await contextBriefHandler(
        { useCase: 'author', task: 'a Button component' },
        () => [], () => []
      );
      expect(result.content[0].text).toContain('Your task: a Button component');
    });

    it('does not include system status section', async () => {
      const { systems } = await loadSystems([`${fixturesDir}/button.dsds.json`]);
      const result = await contextBriefHandler({ useCase: 'author' }, ...makeGetters(systems));
      // author brief never shows system status
      expect(result.content[0].text).not.toContain('entities loaded');
    });
  });

  describe('ask use case', () => {
    it('returns the ask brief', async () => {
      const result = await contextBriefHandler({ useCase: 'ask' }, () => [], () => []);
      expect(result.content[0].text).toContain('Before you answer');
      expect(result.isError).toBeFalsy();
    });

    it('prepends a task header when task is provided', async () => {
      const result = await contextBriefHandler(
        { useCase: 'ask', task: 'how do I lay out a form?' },
        () => [], () => []
      );
      expect(result.content[0].text).toContain('Your task: how do I lay out a form?');
    });

    it('includes system status so answers reflect what is loaded', async () => {
      const { systems } = await loadSystems([`${fixturesDir}/tokens.dsds.json`]);
      const result = await contextBriefHandler({ useCase: 'ask' }, ...makeGetters(systems));
      expect(result.content[0].text).toContain('entities loaded');
      // deprecated entities must be surfaced so they aren't recommended
      expect(result.content[0].text).toContain('color-grey-100');
    });
  });
});
