import { describe, it, expect } from 'vitest';
import { buildComponentHandler } from '../../src/tools/build-component.js';

// A minimal stand-in for a loaded design system, shaped like a real 0.21.x
// component entry: `traits` carry the enum and flag dimensions the wizard
// walks, and a `when-to-use` guidelines section supplies the overview.
const BUTTON = {
  kind: 'component',
  identifier: 'button',
  id: 'button',
  name: 'Button',
  description: 'A clickable button.',
  __dsds20: true,
  sections: [
    {
      kind: 'guidelines',
      for: 'all',
      framing: 'when-to-use',
      items: [
        { level: 'should', statement: 'Trigger an action.' },
        { level: 'should-not', statement: 'Navigating between pages. Use a Link instead.' },
      ],
    },
  ],
  traits: [
    {
      id: 'level',
      kind: 'enum',
      traitType: 'variant',
      description: 'Visual weight.',
      values: [
        { id: 'tertiary', description: 'Low weight.' },
        { id: 'primary', description: 'Full weight.' },
      ],
    },
    {
      id: 'fullWidth',
      kind: 'boolean',
      traitType: 'variant',
      description: 'Fill the container.',
    },
  ],
};

const getSystems = () => [{ filePath: 'mem://test', entities: [BUTTON] }];
const getSummaries = () => [{ identifier: 'button', kind: 'component' }];

function read(response) {
  expect(response.isError).toBeFalsy();
  return JSON.parse(response.content[0].text);
}

const start = (identifier) => buildComponentHandler({ step: 'start', identifier }, getSystems, getSummaries);
const finalize = (data, answers) => buildComponentHandler({ step: 'finalize', data, answers }, getSystems, getSummaries);

describe('dsds_build_component (implementation wizard)', () => {
  it('start returns the full prop catalog and points at finalize', async () => {
    const out = read(await start('Button'));
    expect(out.overview).toContain('Implementing Button');
    expect(out.overview).toContain('Trigger an action');
    expect(out.nextStepId).toBe('finalize');
    // The whole catalog comes back in one call (option 2), not one question.
    expect(out.question).toBeUndefined();
    expect(out.questions).toHaveLength(3); // level + fullWidth + synthetic children
    expect(out.questions.map(q => q.questionId)).toEqual(['level', 'fullWidth', 'children']);
    expect(out.questions[0].options.map(o => o.value)).toEqual(['tertiary', 'primary']);
  });

  it('catalog derives the right option shape from each trait kind', async () => {
    const out = read(await start('button'));
    const byId = Object.fromEntries(out.questions.map(q => [q.questionId, q]));
    expect(byId.level.propKind).toBe('enum');
    expect(byId.level.options.map(o => o.value)).toEqual(['tertiary', 'primary']);
    expect(byId.fullWidth.propKind).toBe('flag');
  });

  it('one-shot: finalize with an answers map composes JSX, omitting unspecified props', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, {
      level: 'primary',
      fullWidth: true,
      // children omitted → skipped
    }));
    expect(out.result.component).toBe('Button');
    expect(out.result.props).toEqual({ level: 'primary', fullWidth: true });
    expect(out.result.lintSafe).toBe(true);
    const code = out.result.code;
    expect(code).toContain('level="primary"');
    expect(code).toContain('fullWidth');       // boolean true → bare attribute
    expect(code).not.toContain('fullWidth={');
  });

  it('one-shot needs no data echo: finalize with just identifier + answers (#3)', async () => {
    // No `data` from start — the agent passes identifier + answers directly.
    const out = read(await buildComponentHandler(
      { step: 'finalize', identifier: 'button', answers: { level: 'primary' } },
      getSystems, getSummaries,
    ));
    expect(out.result.component).toBe('Button');
    expect(out.result.code).toContain('level="primary"');
  });

  it('finalize rejects an invalid enum value and returns the catalog to correct it', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, { level: 'bogus' }));
    expect(out.result).toBeUndefined();
    expect(out.validated).toMatch(/not a valid option/);
    expect(out.nextStepId).toBe('finalize');
    expect(out.questions).toBeTruthy(); // catalog re-shown so the agent can fix
  });

  // 0.21.x traits carry no `required` flag — every question is optional —
  // so there is no missing-required-prop case for finalize to block on.

  it('finalize ignores unknown prop names but still composes', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, { level: 'primary', notARealProp: 'x' }));
    expect(out.result.code).toContain('level="primary"');
    expect(out.validated).toMatch(/Ignored unknown prop\(s\).*notARealProp/);
  });

  it('stepwise answer mode still works as an alternative', async () => {
    const s = read(await start('button'));
    let data = s.data;
    const answer = (a) => buildComponentHandler({ step: 'answer', data, answer: a }, getSystems, getSummaries);

    // cursor 0 = level → an invalid value re-asks the same question
    let out = read(await answer({ use: true, value: 'nope' }));
    expect(out.validated).toMatch(/valid value|Rejected/);

    // then answer it properly and walk the rest by skipping
    out = read(await answer({ use: true, value: 'primary' })); data = out.data;
    for (let i = 0; i < 10 && out.nextStepId === 'answer'; i++) {
      out = read(await buildComponentHandler({ step: 'answer', data, answer: { use: false } }, getSystems, getSummaries));
      data = out.data;
    }
    const fin = read(await finalize(data));
    expect(fin.result.props.level).toBe('primary');
  });

  it('errors with available components when the identifier is unknown', async () => {
    const res = await start('nope');
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/);
    expect(res.content[0].text).toMatch(/`button`/);
  });
});

// A minimal real 0.20.0 component: traits (not documentBlocks) declare the
// variants/states this wizard should turn into questions.
const BUTTON_20 = {
  __dsds20: true,
  id: 'button',
  identifier: 'button',
  kind: 'component',
  name: 'Button',
  description: 'A clickable button.',
  traits: [
    { kind: 'enum', id: 'level', description: 'Visual weight.', values: [{ id: 'tertiary', description: 'Low weight.' }, { id: 'primary', description: 'Full weight.' }] },
    { kind: 'boolean', id: 'disabled', description: 'Non-interactive.' },
  ],
  combos: [{ subject: 'level.primary', level: 'must-not', items: ['disabled'], note: 'A primary action cannot be disabled.' }],
  sections: [
    { kind: 'guidelines', for: 'agent', framing: 'when-to-use', items: [{ statement: 'Use for in-page actions only.', level: 'must' }] },
  ],
};
const getSystems20 = () => [{ filePath: 'mem://test', entities: [BUTTON_20] }];
const getSummaries20 = () => [{ identifier: 'button', kind: 'component' }];

describe('dsds_build_component — real 0.20.0 (traits, not documentBlocks)', () => {
  it('derives questions from traits, plus the synthetic children question', async () => {
    const out = read(await buildComponentHandler({ step: 'start', identifier: 'button' }, getSystems20, getSummaries20));
    expect(out.questions.map(q => q.questionId)).toEqual(['level', 'disabled', 'children']);
    expect(out.questions[0].propKind).toBe('enum');
    expect(out.questions[0].options.map(o => o.value)).toEqual(['tertiary', 'primary']);
    expect(out.questions[1].propKind).toBe('flag');
  });

  it('overview surfaces when-to-use guidelines and combos, not a useCases block', async () => {
    const out = read(await buildComponentHandler({ step: 'start', identifier: 'button' }, getSystems20, getSummaries20));
    expect(out.overview).toContain('Use for in-page actions only.');
    expect(out.overview).toContain('must-not');
    expect(out.overview).toContain('level.primary');
  });

  it('finalize composes JSX from trait-derived answers', async () => {
    const s = read(await buildComponentHandler({ step: 'start', identifier: 'button' }, getSystems20, getSummaries20));
    const out = read(await buildComponentHandler(
      { step: 'finalize', data: s.data, answers: { level: 'primary' } },
      getSystems20, getSummaries20,
    ));
    expect(out.result.code).toContain('level="primary"');
  });
});
