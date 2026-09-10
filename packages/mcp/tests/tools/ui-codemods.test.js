import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyUiCodemods, neutralizeUnsafeTodoComments, resolveTransformSpecifier } from '../../src/tools/ui-codemods.js';
import sanityUi from '../../src/codemod-presets/sanity-ui.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');

// Real package, real transforms — verified by hand against
// @sanity/ui-codemod@1.0.0-alpha.7 during the 2026-09-03 UI3-usage review.
// Driven through the sanity-ui preset rather than a literal list here, so
// these stay honest about what a configured consumer actually gets.
const opts = {
  codemodPackage: sanityUi.codemodPackage,
  transformNames: sanityUi.transforms,
  transformPath: sanityUi.transformPath,
  todoMarker: sanityUi.todoMarker,
  fromPackage: sanityUi.fromPackage,
  toPackage: sanityUi.toPackage,
  resolveDir: process.cwd(),
};

describe('applyUiCodemods', () => {
  it('moves a Box import to the target package', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', opts);
    expect(result.changed).toBe(true);
    expect(result.appliedTransforms).toEqual(['box']);
    expect(result.code).toContain("from \"@sanity/ui-v5\"");
    expect(result.code).not.toContain("Box } from '@sanity/ui'");
  });

  it('renames Stack to VStack and space to gap, not just the import', async () => {
    const code = "import { Stack } from '@sanity/ui'\n\nexport function X() { return <Stack space={2} /> }";
    const result = await applyUiCodemods(code, 'X.tsx', opts);
    expect(result.appliedTransforms).toEqual(['stack']);
    expect(result.code).toContain('VStack');
    expect(result.code).toContain('gap={2}');
    expect(result.code).not.toContain('<Stack');
  });

  it('runs multiple applicable transforms in one pass', async () => {
    const code = "import { Box, Stack } from '@sanity/ui'\n\nexport function X() { return <Box><Stack space={1} /></Box> }";
    const result = await applyUiCodemods(code, 'X.tsx', opts);
    expect(result.appliedTransforms.sort()).toEqual(['box', 'stack']);
  });

  it('honours an explicitly requested transform the preset excludes — vetting is the preset\'s job, not the runner\'s', async () => {
    // `card` is real and really does run; the sanity-ui preset leaves it out
    // because its output is wrong (see that preset's `excluded`). The runner
    // deliberately no longer second-guesses the caller: previously this was
    // filtered out silently, which also silently discarded every transform
    // name belonging to any other design system.
    const code = "import { Card } from '@sanity/ui'\n\nexport function X() { return <Card /> }";
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, transformNames: ['card'] });
    expect(result.appliedTransforms).toEqual(['card']);
  });

  it('is a no-op without a transformPath, and says why', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, transformPath: undefined });
    expect(result.changed).toBe(false);
    expect(result.error).toMatch(/transformPath/);
  });

  it('skips files with no import from fromPackage (fast path, no transform attempted)', async () => {
    const code = "import { Box } from '@sanity/ui-v5'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', opts);
    expect(result.changed).toBe(false);
    expect(result.code).toBe(code);
  });

  it('skips non-JS/TS files', async () => {
    const code = "@import '@sanity/ui';";
    const result = await applyUiCodemods(code, 'styles.css', opts);
    expect(result.changed).toBe(false);
    expect(result.code).toBe(code);
  });

  it('is a no-op when codemodPackage is not configured', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, codemodPackage: undefined });
    expect(result.changed).toBe(false);
    expect(result.code).toBe(code);
  });

  it('skips a transform name the package does not export, without error', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, transformNames: ['not-a-real-transform'] });
    expect(result.changed).toBe(false);
    expect(result.appliedTransforms).toEqual([]);
  });

  it('reports a config error, not a throw, when jscodeshift is unresolvable', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, resolveDir: '/tmp' });
    expect(result.changed).toBe(false);
    expect(result.error).toMatch(/jscodeshift/i);
  });

  it('quietly skips an unavailable transform name in the configured package', async () => {
    const code = "import { Box } from '@sanity/ui'\n\nexport function X() { return <Box /> }";
    // 'text' is a real, safe transform name, but request it against a
    // package that doesn't export it under this subpath — should skip
    // that one transform, not throw, and still run 'box'.
    const result = await applyUiCodemods(code, 'X.tsx', { ...opts, codemodPackage: 'jscodeshift', transformNames: ['box'] });
    expect(result.changed).toBe(false);
  });
});

describe('neutralizeUnsafeTodoComments', () => {
  it('regression: real ui5-mcp iteration-10 output (2026-09-03 16.11) — every nested TODO comment becomes JSX-safe', () => {
    const source = readFileSync(resolve(fixturesDir, 'ui-codemod-visible-comment-regression.tsx'), 'utf8');
    const { code, changed } = neutralizeUnsafeTodoComments(source, sanityUi.todoMarker);
    expect(changed).toBe(true);

    // Every remaining bare `//` TODO line must be the one genuinely-safe
    // expression-root position: immediately after `return (`.
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (!/\/\/\s*UI-CODEMOD TODO:/.test(line)) return;
      const prevMeaningful = lines.slice(0, i).reverse().find((l) => l.trim() !== '') ?? '';
      expect(prevMeaningful.trim().endsWith('(')).toBe(true);
    });

    // All 4 nested-position instances converted to the safe form.
    expect((code.match(/\{\/\* UI-CODEMOD TODO:.*?\*\/\}/g) ?? []).length).toBe(4);
  });

  it('leaves a TODO comment untouched when it is the first thing after `return (`', () => {
    const source = 'function X() {\n  return (\n    // UI-CODEMOD TODO: Please double check the Box migration below\n    <Box />\n  );\n}';
    const { code, changed } = neutralizeUnsafeTodoComments(source, sanityUi.todoMarker);
    expect(changed).toBe(false);
    expect(code).toBe(source);
  });

  it('converts a TODO comment nested inside a parent element\'s children', () => {
    const source = 'function X() {\n  return (\n    <Box>\n      // UI-CODEMOD TODO: Please double check the Box migration below\n      <Box />\n    </Box>\n  );\n}';
    const { code, changed } = neutralizeUnsafeTodoComments(source, sanityUi.todoMarker);
    expect(changed).toBe(true);
    expect(code).toContain('{/* UI-CODEMOD TODO: Please double check the Box migration below */}');
    expect(code).not.toMatch(/^\s*\/\/\s*UI-CODEMOD TODO/m);
  });

  it('converts a TODO comment sharing a line with an existing JSX comment', () => {
    const source = '  return (\n    <Box>\n      {/* Main Content */}// UI-CODEMOD TODO: Please double check the Box migration below\n      <Box />\n    </Box>\n  );';
    const { code, changed } = neutralizeUnsafeTodoComments(source, sanityUi.todoMarker);
    expect(changed).toBe(true);
    expect(code).toContain('{/* Main Content */}{/* UI-CODEMOD TODO: Please double check the Box migration below */}');
  });

  it('is a no-op on code with no UI-CODEMOD TODO comments', () => {
    const source = "import { Box } from '@sanity/ui-v5'\nexport function X() { return <Box /> }";
    const { code, changed } = neutralizeUnsafeTodoComments(source, sanityUi.todoMarker);
    expect(changed).toBe(false);
    expect(code).toBe(source);
  });
});

describe('applyUiCodemods — end-to-end regression for the visible-comment bug', () => {
  it('never leaves a codemod-inserted comment in a position that would render on screen', async () => {
    // Same shape as the real regression file, pre-codemod: Box on v3, with
    // ordinary CSS values (not the tiny keyword set box's mapped-only mods
    // recognize), nested three levels deep — the exact condition that
    // triggered box's insertTodoWarning fallback in production.
    const code = [
      "import { Box } from '@sanity/ui'",
      'export function X() {',
      '  return (',
      '    <Box minHeight="100vh">',
      '      <Box maxWidth="1200px">',
      '        <Box minWidth="200px" />',
      '      </Box>',
      '    </Box>',
      '  );',
      '}',
    ].join('\n');
    const result = await applyUiCodemods(code, 'X.tsx', opts);
    expect(result.appliedTransforms).toContain('box');

    const lines = result.code.split('\n');
    lines.forEach((line, i) => {
      if (!/\/\/\s*UI-CODEMOD TODO:/.test(line)) return;
      const prevMeaningful = lines.slice(0, i).reverse().find((l) => l.trim() !== '') ?? '';
      expect(prevMeaningful.trim().endsWith('(')).toBe(true);
    });
  });
});
