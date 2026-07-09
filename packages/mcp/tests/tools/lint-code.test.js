import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintInlineHandler, lintByPathHandler } from '../../src/tools/lint-code.js';

const noPlugins = () => ({ plugins: [], resolveDir: process.cwd() });
const fixturePlugin = () => ({ plugins: ['eslint-plugin-fixture'], resolveDir: process.cwd() });

describe('lintInlineHandler', () => {
  it('returns isError when no plugins configured', async () => {
    const result = await lintInlineHandler({ code: 'const x = 1;' }, noPlugins);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('LINT_PLUGINS');
    expect(result.content[0].text).toContain('LINT_RESOLVE_DIR');
  });

  it('returns isError when plugins are configured but cannot run', async () => {
    const getLintConfig = () => ({
      plugins: ['eslint-plugin-does-not-exist-xyz'],
      resolveDir: process.cwd(),
    });
    const result = await lintInlineHandler({ code: 'const x = 1;' }, getLintConfig);
    expect(result.isError).toBe(true);
  });

  it('requires code or files, not a path', async () => {
    const result = await lintInlineHandler({ path: 'App.tsx' }, fixturePlugin);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('dsds_lint_by_path');
  });

  it('reports that nothing was persisted (read-only contract)', async () => {
    const result = await lintInlineHandler({ code: 'const x = 1;', filename: 'App.tsx' }, fixturePlugin);
    expect(result.content[0].text).toContain('No file was read or written');
    expect(result.content[0].text).toMatch(/Checked \d+ character/);
  });

  it('returns structuredContent with a remaining count and per-file entries', async () => {
    const result = await lintInlineHandler({ code: 'const x = 1;', filename: 'App.tsx' }, fixturePlugin);
    expect(result.structuredContent).toBeDefined();
    expect(typeof result.structuredContent.remaining).toBe('number');
    expect(Array.isArray(result.structuredContent.files)).toBe(true);
    expect(result.structuredContent.files[0]).toMatchObject({ filename: 'App.tsx' });
  });
});

describe('lintByPathHandler (harness gate)', () => {
  it('requires a path, not code', async () => {
    const result = await lintByPathHandler({ code: 'const x = 1;' }, fixturePlugin);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('dsds_lint_inline');
  });

  it('apply mode lints a file on disk via path and leaves a clean file unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lint-apply-'));
    try {
      writeFileSync(join(dir, 'App.tsx'), 'const x = 1;\n');
      const cfg = () => ({ plugins: ['eslint-plugin-fixture'], resolveDir: process.cwd(), sourceDir: dir });
      const result = await lintByPathHandler({ apply: true, files: [{ path: 'App.tsx' }] }, cfg);
      expect(result.structuredContent.files[0].filename).toBe('App.tsx');
      expect(readFileSync(join(dir, 'App.tsx'), 'utf8')).toBe('const x = 1;\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns corrective coaching when the path does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lint-missing-'));
    try {
      const cfg = () => ({ plugins: ['eslint-plugin-fixture'], resolveDir: process.cwd(), sourceDir: dir });
      const result = await lintByPathHandler({ files: [{ path: 'Nope.tsx' }] }, cfg);
      const text = result.content[0].text;
      expect(text).toContain('was not found');
      expect(text).toContain('does not create them');
      expect(text).toContain('dsds_lint_inline');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
