import { describe, it, expect } from 'vitest';
import { buildComponentHandler } from '../../src/tools/build-component.js';

// A minimal stand-in for a loaded design system, shaped like the real
// sanity-ui button entity: a variants block (enum) plus an api block whose
// props exercise each option-derivation path (string-union, boolean, free).
const BUTTON = {
  kind: 'component',
  identifier: 'button',
  name: 'Button',
  description: 'A clickable button.',
  documentBlocks: [
    {
      kind: 'useCases',
      items: [
        { stance: 'recommended', description: 'Trigger an action.' },
        { stance: 'discouraged', description: 'Navigating between pages.', alternative: { identifier: 'link' } },
      ],
    },
    {
      kind: 'variants',
      items: [
        {
          kind: 'enum',
          identifier: 'level',
          description: 'Visual weight.',
          values: [
            { identifier: 'tertiary', description: 'Low weight.' },
            { identifier: 'primary', description: 'Full weight.' },
          ],
        },
      ],
    },
    {
      kind: 'api',
      properties: [
        { identifier: 'as', type: "'button' | 'a'", required: false, description: 'Element to render.' },
        { identifier: 'fullWidth', type: 'Responsive<boolean>', required: false, description: 'Fill the container.' },
        { identifier: 'iconStart', type: 'React.ElementType', required: false, description: 'Leading icon.' },
        { identifier: 'text', type: 'string', required: true, description: 'Visible label.' },
      ],
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
    expect(out.overview).toContain('When to use');
    expect(out.nextStepId).toBe('finalize');
    // The whole catalog comes back in one call (option 2), not one question.
    expect(out.question).toBeUndefined();
    expect(out.questions).toHaveLength(6); // level + as, fullWidth, iconStart, text + synthetic children
    expect(out.questions.map(q => q.questionId)).toEqual(['level', 'as', 'fullWidth', 'iconStart', 'text', 'children']);
    expect(out.questions[0].options.map(o => o.value)).toEqual(['tertiary', 'primary']);
  });

  it('catalog derives the right option shape from each api type', async () => {
    const out = read(await start('button'));
    const byId = Object.fromEntries(out.questions.map(q => [q.questionId, q]));
    expect(byId.as.propKind).toBe('enum');                  // string-literal union
    expect(byId.as.options.map(o => o.value)).toEqual(['button', 'a']);
    expect(byId.fullWidth.propKind).toBe('flag');           // boolean
    expect(byId.iconStart.propKind).toBe('free');           // React.ElementType
  });

  it('one-shot: finalize with an answers map composes JSX, omitting unspecified props', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, {
      level: 'primary',
      as: 'button',
      fullWidth: true,
      text: 'Save',
      // iconStart omitted → skipped
    }));
    expect(out.result.component).toBe('Button');
    expect(out.result.props).toEqual({ level: 'primary', as: 'button', fullWidth: true, text: 'Save' });
    expect(out.result.lintSafe).toBe(true); // #2 — design-system-valid by construction
    const code = out.result.code;
    expect(code).toContain('level="primary"');
    expect(code).toContain('as="button"');
    expect(code).toContain('fullWidth');       // boolean true → bare attribute
    expect(code).not.toContain('fullWidth={');
    expect(code).not.toContain('iconStart');   // omitted
  });

  it('one-shot needs no data echo: finalize with just identifier + answers (#3)', async () => {
    // No `data` from start — the agent passes identifier + answers directly.
    const out = read(await buildComponentHandler(
      { step: 'finalize', identifier: 'button', answers: { level: 'primary', text: 'Save' } },
      getSystems, getSummaries,
    ));
    expect(out.result.component).toBe('Button');
    expect(out.result.code).toContain('level="primary"');
    expect(out.result.code).toContain('text="Save"');
  });

  it('finalize rejects an invalid enum value and returns the catalog to correct it', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, { level: 'bogus', text: 'Save' }));
    expect(out.result).toBeUndefined();
    expect(out.validated).toMatch(/not a valid option/);
    expect(out.nextStepId).toBe('finalize');
    expect(out.questions).toBeTruthy(); // catalog re-shown so the agent can fix
  });

  it('finalize blocks until required props are provided', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, { level: 'primary' })); // missing required `text`
    expect(out.result).toBeUndefined();
    expect(out.validated).toMatch(/required prop\(s\) not set: text/);
    expect(out.nextStepId).toBe('finalize');
  });

  it('finalize ignores unknown prop names but still composes', async () => {
    const s = read(await start('button'));
    const out = read(await finalize(s.data, { text: 'Save', notARealProp: 'x' }));
    expect(out.result.code).toContain('text="Save"');
    expect(out.validated).toMatch(/Ignored unknown prop\(s\).*notARealProp/);
  });

  it('stepwise answer mode still works as an alternative', async () => {
    const s = read(await start('button'));
    let data = s.data;
    // Walk via step:"answer": skip optionals, set required `text`.
    const answer = (a) => buildComponentHandler({ step: 'answer', data, answer: a }, getSystems, getSummaries);
    // cursor 0 = level (optional) → skip
    let out = read(await answer({ use: false })); data = out.data;
    // an invalid value re-asks the same question
    out = read(await buildComponentHandler({ step: 'answer', data, answer: { use: true, value: 'nope' } }, getSystems, getSummaries));
    expect(out.validated).toMatch(/valid value|Rejected/);
    // continue skipping until we reach required `text`, which cannot be skipped
    for (let i = 0; i < 10 && out.nextStepId === 'answer'; i++) {
      const q = out.question;
      const a = q.required ? { use: true, value: 'Save' } : { use: false };
      out = read(await buildComponentHandler({ step: 'answer', data, answer: a }, getSystems, getSummaries));
      data = out.data;
    }
    const fin = read(await finalize(data));
    expect(fin.result.props.text).toBe('Save');
  });

  it('errors with available components when the identifier is unknown', async () => {
    const res = await start('nope');
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/);
    expect(res.content[0].text).toMatch(/`button`/);
  });
});
