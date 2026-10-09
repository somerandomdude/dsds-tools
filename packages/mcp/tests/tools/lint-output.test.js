import { describe, it, expect } from 'vitest';
import { lintHandler, lineEdits } from '../../src/tools/lint-code.js';

// dsds_lint returns findings, never a rewritten file. The old output handed
// back the full corrected source and told the agent to apply it, so every
// lint call was followed by the agent re-emitting whole files — which is why
// the agent tester hid the tool from most models.

const cfg = (extra = {}) => () => ({ plugins: ['eslint-plugin-fixture'], resolveDir: process.cwd(), ...extra });
// Long enough that a whole-file echo would be obvious in the output.
const body = Array.from({ length: 40 }, (_, i) => `const line${i} = ${i};`).join('\n');
const code = `${body}\nconst bar = 1;\nconst foo = 2;\n`;

describe('dsds_lint output', () => {
  it('shows a fixable finding as the lines that change, not the whole file', async () => {
    const text = (await lintHandler({ code, filename: 'A.js' }, cfg())).content[0].text;
    expect(text).not.toMatch(/Corrected code/i);
    expect(text).not.toContain('const line0 = 0;');
    expect(text).toContain('- const bar = 1;');
    expect(text).toContain('+ const baz = 1;');
    expect(text).toContain("Avoid the identifier 'foo'."); // the one that needs a person
  });

  it('tells the agent to leave fixable findings alone when the host applies fixes', async () => {
    const text = (await lintHandler({ code, filename: 'B.js' }, cfg({ autofixByHost: true }))).content[0].text;
    expect(text).toMatch(/will be fixed automatically after your turn/);
    expect(text).not.toContain('+ const baz = 1;');
  });

  it('says a file is unchanged when it is linted again with the same content', async () => {
    await lintHandler({ code, filename: 'C.js' }, cfg());
    const text = (await lintHandler({ code, filename: 'C.js' }, cfg())).content[0].text;
    expect(text).toContain('unchanged since your last dsds_lint call');
  });

  it('reports fixable findings in structuredContent for the harness', async () => {
    const r = await lintHandler({ code, filename: 'D.js' }, cfg());
    expect(r.structuredContent.fixable).toBe(1);
    expect(r.structuredContent.files[0].fixedMessages[0].ruleId).toBe('fixture/no-bar');
  });
});

describe('lineEdits', () => {
  it('returns one hunk per changed region, numbered against the original', () => {
    expect(lineEdits('a\nb\nc\nd', 'a\nB\nc\nd')).toEqual([{ line: 2, removed: ['b'], added: ['B'] }]);
    expect(lineEdits('a\nb', 'a\nb')).toEqual([]);
    expect(lineEdits('a\nc', 'a\nb\nc')).toEqual([{ line: 2, removed: [], added: ['b'] }]);
  });
});
