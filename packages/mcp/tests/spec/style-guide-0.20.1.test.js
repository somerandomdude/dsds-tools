import { describe, expect, it } from 'vitest';
import { loadYaml20 } from '../../src/spec/dsds20-lib.js';
import { checkStyle20, styleRules } from '../../src/spec/style-guide-0.20.1.js';
import { styleCheckHandler } from '../../src/tools/style-check.js';

const ids = (doc) => checkStyle20(loadYaml20(doc)).map((f) => f.id);
const text = async (document, opts = {}) => (await styleCheckHandler({ document, ...opts })).content[0].text;

describe('style-guide catalog binding', () => {
  it('binds all seven STYLE_GUIDE.md rules to an implementation', () => {
    const rules = styleRules();
    expect(rules.map((r) => r.id).sort()).toEqual([
      'DSDS-17', 'DSDS-18', 'DSDS-19', 'DSDS-20', 'DSDS-21', 'DSDS-22', 'DSDS-23',
    ]);
    for (const r of rules) expect(typeof r.check, `${r.id} has no check`).toBe('function');
  });

  it('carries the catalog title, so findings can name the rule in prose', () => {
    const r = styleRules().find((x) => x.id === 'DSDS-17');
    expect(r.title).toMatch(/field order/i);
  });
});

describe('DSDS-17 entry field order', () => {
  it('flags a field that comes before one the schema declares earlier', () => {
    expect(ids('kind: component\nid: b\ndescription: d\nname: B\n')).toContain('DSDS-17');
  });

  it('accepts the schema order', () => {
    expect(ids('kind: component\nid: b\nname: B\ndescription: d\npurpose: p\n')).not.toContain('DSDS-17');
  });

  it('never flags a field merely for being absent', () => {
    // name/purpose omitted entirely — the remaining fields are still in order.
    expect(ids('kind: component\nid: b\ndescription: d\n')).not.toContain('DSDS-17');
  });
});

describe('DSDS-18 section order', () => {
  const section = (kind, extra = '') => `  - kind: ${kind}\n${extra}    items: [{term: T, definition: D}]\n`;

  it('flags same-kind sections that are not contiguous', () => {
    const doc = `kind: component\nid: b\nname: B\ndescription: d\nsections:\n${section('guidelines').replace('{term: T, definition: D}', '{level: must, statement: S}')}${section('definitions')}${section('guidelines').replace('{term: T, definition: D}', '{level: must, statement: S}')}`;
    expect(ids(doc)).toContain('DSDS-18');
  });

  it('orders when-to-use before how-to-use', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items: [{level: must, statement: How}]',
      '  - kind: guidelines', '    framing: when-to-use', '    items: [{level: must, statement: When}]',
    ].join('\n');
    expect(ids(doc)).toContain('DSDS-18');
  });

  it('allows a narrower audience to follow a broader one at the same breadth', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    for: all', '    items: [{level: must, statement: A}]',
      '  - kind: guidelines', '    for: agent', '    items: [{level: must, statement: B}]',
    ].join('\n');
    expect(ids(doc)).not.toContain('DSDS-18');
  });

  it('flags a broader audience following a narrower one at the same breadth', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    for: agent', '    items: [{level: must, statement: A}]',
      '  - kind: guidelines', '    for: all', '    items: [{level: must, statement: B}]',
    ].join('\n');
    expect(ids(doc)).toContain('DSDS-18');
  });

  it('treats a section whose every item shares one tag as the narrowest tier', () => {
    // Two how-to-use sections; the tagged one must come last. Here it comes
    // first, so it is an inversion even though both are how-to-use.
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items:',
      '      - {level: must, statement: A, tags: [accessibility]}',
      '      - {level: must, statement: B, tags: [accessibility]}',
      '  - kind: guidelines', '    items: [{level: must, statement: C}]',
    ].join('\n');
    expect(ids(doc)).toContain('DSDS-18');
  });

  it('does not treat a single tagged item as a tag-scoped section', () => {
    // One item always shares a tag with itself; the rule needs two.
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items: [{level: must, statement: A, tags: [accessibility]}]',
      '  - kind: guidelines', '    items: [{level: must, statement: C}]',
    ].join('\n');
    expect(ids(doc)).not.toContain('DSDS-18');
  });
});

describe('DSDS-19 guideline item level order', () => {
  it('flags should before must', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items:',
      '      - {level: should, statement: Later}',
      '      - {level: must, statement: Earlier}',
    ].join('\n');
    expect(ids(doc)).toContain('DSDS-19');
  });

  it('accepts must, should, may, should-not, must-not', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items:',
      '      - {level: must, statement: A}',
      '      - {level: should, statement: B}',
      '      - {level: may, statement: C}',
      '      - {level: should-not, statement: D}',
      '      - {level: must-not, statement: E}',
    ].join('\n');
    expect(ids(doc)).not.toContain('DSDS-19');
  });

  it('leaves items sharing one level in the order written', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items:',
      '      - {level: must, statement: Zebra}',
      '      - {level: must, statement: Apple}',
    ].join('\n');
    expect(ids(doc)).not.toContain('DSDS-19');
  });
});

describe('DSDS-21 entry order in a base document', () => {
  const base = (kinds) =>
    ['schemaVersion: 0.20.1', 'entries:']
      .concat(kinds.map((k, i) => `  - {kind: ${k}, id: e${i}, name: E${i}, description: d}`))
      .join('\n');

  it('flags a component before the token it is built on', () => {
    expect(ids(base(['component', 'token']))).toContain('DSDS-21');
  });

  it('accepts system, token, theme, component, entry', () => {
    expect(ids(base(['system', 'token', 'theme', 'component', 'entry']))).not.toContain('DSDS-21');
  });
});

describe('DSDS-23 combo order', () => {
  const withCombos = (combos) =>
    ['kind: component', 'id: b', 'name: B', 'description: d', 'combos:'].concat(combos).join('\n');

  it('flags combos out of subject order', () => {
    expect(ids(withCombos(['  - {subject: z, level: must, items: [a]}', '  - {subject: a, level: must, items: [b]}']))).toContain('DSDS-23');
  });

  it('flags a level inversion within one subject', () => {
    expect(ids(withCombos(['  - {subject: a, level: should, items: [x]}', '  - {subject: a, level: must, items: [y]}']))).toContain('DSDS-23');
  });

  it('accepts subject-then-level order', () => {
    expect(ids(withCombos(['  - {subject: a, level: must, items: [x]}', '  - {subject: a, level: should, items: [y]}', '  - {subject: b, level: must, items: [z]}']))).not.toContain('DSDS-23');
  });
});

describe('dsds_style_check tool', () => {
  it('reports a clean document', async () => {
    expect(await text('kind: component\nid: b\nname: B\ndescription: d\n')).toContain('Style guide: clean');
  });

  it('suggests a corrected field order for DSDS-17', async () => {
    const out = await text('kind: component\nid: b\ndescription: d\nname: B\n');
    expect(out).toContain('DSDS-17');
    expect(out).toContain('Suggested order: `kind, id, name, description`');
  });

  it('omits suggestions when asked', async () => {
    const out = await text('kind: component\nid: b\ndescription: d\nname: B\n', { suggest: false });
    expect(out).toContain('DSDS-17');
    expect(out).not.toContain('Suggested order');
  });

  it('states plainly that findings never affect validity', async () => {
    expect(await text('kind: component\nid: b\ndescription: d\nname: B\n')).toMatch(/does not affect validity/i);
  });

  it('declines a legacy 0.15.2 document rather than reporting nonsense', async () => {
    const out = await text('{"dsdsVersion":"0.15.2","entityGroups":[]}');
    expect(out).toContain('Style check skipped');
  });

  it('reports a parse error as an error', async () => {
    const res = await styleCheckHandler({ document: 'kind: [unclosed' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Parse Error');
  });
});
