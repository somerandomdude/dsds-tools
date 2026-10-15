import { describe, expect, it } from 'vitest';
import { loadYaml20 } from '../../src/spec/dsds-lib.js';
import { checkStyle20, styleRules } from '../../src/spec/style-guide.js';
import { styleCheckHandler } from '../../src/tools/style-check.js';

const ids = (doc) => checkStyle20(loadYaml20(doc)).map((f) => f.id);
const text = async (document, opts = {}) => (await styleCheckHandler({ document, ...opts })).content[0].text;

describe('style-guide catalog binding', () => {
  // 0.22.0 retired the four field-order rules (DSDS-17, -20, -22, -23):
  // dsds-format applies that order instead. The three reading-order rules stay.
  it('binds the three STYLE_GUIDE.md reading-order rules to an implementation', () => {
    const rules = styleRules();
    expect(rules.map((r) => r.id).sort()).toEqual(['DSDS-18', 'DSDS-19', 'DSDS-21']);
    for (const r of rules) expect(typeof r.check, `${r.id} has no check`).toBe('function');
  });

  it('carries the catalog title, so findings can name the rule in prose', () => {
    const r = styleRules().find((x) => x.id === 'DSDS-21');
    expect(r.title).toMatch(/entries/i);
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

  // 0.22.0: `tags` only classify a section. Neither a section's tags nor its
  // items' tags say anything about its position.
  it('does not rank a section by its tags', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    tags: [accessibility]',
      '    items: [{level: must, statement: A}]',
      '  - kind: guidelines', '    items: [{level: must, statement: C}]',
    ].join('\n');
    expect(ids(doc)).not.toContain('DSDS-18');
  });

  it('does not infer a tier from item tags', () => {
    const doc = [
      'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
      '  - kind: guidelines', '    items:',
      '      - {level: must, statement: A, tags: [accessibility]}',
      '      - {level: must, statement: B, tags: [accessibility]}',
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

  // A pointer: no level of its own, a same-as ref to a rule elsewhere.
  const withPointerAfterMustNot = [
    'kind: component', 'id: b', 'name: B', 'description: d', 'sections:',
    '  - kind: guidelines', '    items:',
    '      - {level: must-not, statement: Never}',
    '      - refs: [{to: "shared#tone-rule", rel: same-as}]',
  ].join('\n');

  it('skips a pointer it cannot resolve', () => {
    expect(ids(withPointerAfterMustNot)).not.toContain('DSDS-19');
  });

  it('ranks a pointer at the level of the rule it points to', () => {
    const levels = new Map([['shared#tone-rule', 'must']]);
    const findings = checkStyle20(loadYaml20(withPointerAfterMustNot), { levels });
    const f = findings.find((x) => x.id === 'DSDS-19');
    expect(f, 'a must pointer after a must-not item is an inversion').toBeTruthy();
    expect(f.message).toContain('pointer to shared#tone-rule (level: must)');
  });

  it('accepts a pointer placed in its own level group', () => {
    const levels = new Map([['shared#tone-rule', 'must-not']]);
    expect(checkStyle20(loadYaml20(withPointerAfterMustNot), { levels }).map((f) => f.id)).not.toContain('DSDS-19');
  });

  it('resolves pointers to the same document\'s shared[] without a corpus index', () => {
    const doc = [
      'schemaVersion: 0.20.1',
      'entries:',
      '  - kind: component', '    id: b', '    name: B', '    description: d', '    sections:',
      '      - kind: guidelines', '        items:',
      '          - {level: must-not, statement: Never}',
      '          - refs: [{to: "pool#tone-rule", rel: same-as}]',
      'shared:',
      '  - id: pool', '    sections:',
      '      - kind: guidelines', '        items:',
      '          - {id: tone-rule, level: must, statement: Tone signals state}',
    ].join('\n');
    expect(ids(doc)).toContain('DSDS-19');
  });
});

describe('DSDS-19 across a corpus', () => {
  it('ranks pointers through the shared pool every entity carries', async () => {
    const { checkLevelOrderAcross } = await import('../../src/spec/style-guide.js');
    const pool = [
      {
        id: 'shared-foundations',
        sections: [{ kind: 'guidelines', items: [{ id: 'tone-rule', level: 'must', statement: 'Tone signals state' }] }],
      },
    ];
    const card = {
      id: 'card',
      __filePath: '/docs/components/card.dsds.yaml',
      __sharedEntries: pool,
      sections: [
        {
          kind: 'guidelines',
          items: [
            { level: 'should', statement: 'Use density' },
            { refs: [{ to: 'shared-foundations#tone-rule', rel: 'same-as' }] },
          ],
        },
      ],
    };
    const findings = checkLevelOrderAcross([card]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ entry: 'card', file: '/docs/components/card.dsds.yaml', pointer: '/sections/0/items' });
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

describe('dsds_style_check tool', () => {
  it('reports a clean document', async () => {
    expect(await text('kind: component\nid: b\nname: B\ndescription: d\n')).toContain('Style guide: clean');
  });

  it('returns the document in field order, from the vendored dsds-format', async () => {
    const out = await text('kind: component\nid: b\ndescription: d\nname: B\n');
    expect(out).toContain('Field order (dsds-format)');
    expect(out).toContain('kind: component\nid: b\nname: B\ndescription: d');
  });

  it('keeps comments when it reorders', async () => {
    const out = await text('kind: component\nid: b\n# why it exists\ndescription: d\nname: B\n');
    expect(out).toContain('# why it exists');
  });

  it('omits the reordered document when asked', async () => {
    const out = await text('kind: component\nid: b\ndescription: d\nname: B\n', { suggest: false });
    expect(out).toContain('Field order (dsds-format)');
    expect(out).not.toContain('```yaml');
  });

  it('groups combos by subject, which a retired rule used to report', async () => {
    const doc = ['kind: component', 'id: b', 'name: B', 'description: d', 'combos:',
      '  - {subject: a, level: must, items: [x]}', '  - {subject: z, level: must, items: [y]}',
      '  - {subject: a, level: should, items: [w]}'].join('\n');
    expect(await text(doc)).toContain('Field order (dsds-format)');
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
