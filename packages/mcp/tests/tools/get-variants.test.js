// `dsds_get_variants` answers "what can I set on this component?", which only
// became a computable question in spec 0.21.0 when `traitType` split a
// component's traits into variants and states.
//
// The behaviour worth pinning is what it leaves out. Variants only by default,
// with the state count stated; combos filtered to the traits on screen; and a
// trait with no `traitType` — a 0.20.x document, still loadable — put in
// neither list rather than guessed into one.

import { describe, expect, it } from 'vitest';
import { getVariantsDef, getVariantsHandler } from '../../src/tools/get-variants.js';

const component = (overrides = {}) => ({
  identifier: 'badge',
  name: 'Badge',
  kind: 'component',
  traits: [
    { id: 'tone', kind: 'enum', traitType: 'variant', description: 'Semantic colour.', values: [{ id: 'neutral' }, { id: 'critical' }] },
    { id: 'muted', kind: 'boolean', traitType: 'variant', description: 'Lower visual weight.' },
    { id: 'hovered', kind: 'boolean', traitType: 'state', description: 'Pointer over.' },
    { id: 'disabled', kind: 'boolean', traitType: 'state', setBy: 'consumer', description: 'Blocks interaction.' },
  ],
  ...overrides,
});

const systemsWith = (...entities) => () => [{ filePath: '/x.dsds.yaml', entities }];
const run = (args, entities = [component()], format) =>
  getVariantsHandler(args, systemsWith(...entities), format);
const textOf = async (...a) => (await run(...a)).content[0].text;

describe('dsds_get_variants', () => {
  it('lists the variants and their closed value sets', async () => {
    const text = await textOf({ identifier: 'badge' });
    expect(text).toContain('`tone`');
    // The value separator is pipe-escaped, since these land in a Markdown cell.
    expect(text).toContain('`neutral` \\| `critical`');
    expect(text).toContain('`muted`');
  });

  it('leaves states out by default, and says how many it left', async () => {
    const text = await textOf({ identifier: 'badge' });
    expect(text).not.toContain('`hovered`');
    expect(text).toContain('2 states not shown');
    expect(text).toContain('include:"states"');
  });

  it('returns only states when asked for them', async () => {
    const text = await textOf({ identifier: 'badge', include: 'states' });
    expect(text).toContain('`hovered`');
    expect(text).not.toContain('`tone`');
    expect(text).toContain('2 variants not shown');
  });

  it('labels each row when asked for both, so the two are not conflated', async () => {
    const text = await textOf({ identifier: 'badge', include: 'all' });
    expect(text).toContain('## Variants');
    expect(text).toContain('## States');
    expect(text).toContain('| Type |');
    expect(text.indexOf('## Variants')).toBeLessThan(text.indexOf('## States'));
  });

  // The reason `traitType` exists rather than reusing `setBy`.
  it('shows setBy, which asks a different question', async () => {
    const text = await textOf({ identifier: 'badge', include: 'states' });
    expect(text).toMatch(/`disabled`.*consumer/);
  });

  it('falls back to variants for an unknown include value', async () => {
    const text = await textOf({ identifier: 'badge', include: 'modifiers' });
    expect(text).toContain('`tone`');
    expect(text).not.toContain('`hovered`');
  });

  describe('combos', () => {
    const withCombos = component({
      combos: [
        { subject: 'tone.critical', level: 'must-not', items: ['muted'], note: 'A critical badge must stay legible.' },
        { subject: 'hovered', level: 'must-not', items: ['disabled'], note: 'A disabled badge has no hover.' },
      ],
    });

    it('includes the pairing rules that touch the traits on screen', async () => {
      const text = await textOf({ identifier: 'badge' }, [withCombos]);
      expect(text).toContain('## Pairing rules');
      expect(text).toContain('A critical badge must stay legible.');
    });

    it('drops the ones about traits it did not list', async () => {
      const text = await textOf({ identifier: 'badge' }, [withCombos]);
      expect(text).not.toContain('A disabled badge has no hover.');
    });
  });

  describe('a document that predates 0.21.0', () => {
    const legacy = component({
      traits: [
        { id: 'tone', kind: 'enum', traitType: 'variant', description: 'Semantic colour.', values: [{ id: 'neutral' }] },
        { id: 'oldTrait', kind: 'boolean', description: 'No traitType.' },
      ],
    });

    it('does not file an unclassified trait as a variant', async () => {
      const text = await textOf({ identifier: 'badge' }, [legacy]);
      expect(text).toContain('## Unclassified');
      expect(text.slice(text.indexOf('## Unclassified'))).toContain('`oldTrait`');
    });

    it('says why, so the gap is not read as the component having none', async () => {
      const text = await textOf({ identifier: 'badge' }, [legacy]);
      expect(text).toContain('required as of spec 0.21.0');
    });

    // The case exists because `required` is a validation property, not a
    // loading one: dsds_validate rejects this document, the loader every read
    // tool uses does not. So the message has to name the fix, not just the
    // cause.
    it('points at the tool that enforces the field', async () => {
      const text = await textOf({ identifier: 'badge' }, [legacy]);
      expect(text).toContain('dsds_validate');
    });
  });

  it('answers "none declared" for a component with no traits, without erroring', async () => {
    const res = await run({ identifier: 'box' }, [{ identifier: 'box', name: 'Box', kind: 'component' }]);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('no documented variants or states');
    // `traits` is not the API surface, and saying so avoids the wrong read
    expect(res.content[0].text).toContain('sourceFiles');
  });

  it('errors with suggestions on an unknown component', async () => {
    const res = await run({ identifier: 'badeg' });
    expect(res.isError).toBeTruthy();
    expect(res.structuredContent.error.code).toBeTruthy();
    expect(JSON.stringify(res.structuredContent)).toContain('badge');
  });

  it('renders TOON when the surface is set to it', async () => {
    const text = await textOf({ identifier: 'badge' }, [component()], 'toon');
    expect(text).toMatch(/variants\[2\]\{trait,values,setBy,description\}:/);
  });

  it('reports counts as structured data', async () => {
    const res = await run({ identifier: 'badge' });
    expect(res.structuredContent.counts).toEqual({ variants: 2, states: 2, unclassified: 0 });
  });

  it('declares an input schema the surface can publish', () => {
    expect(getVariantsDef.name).toBe('dsds_get_variants');
    expect(getVariantsDef.inputSchema.required).toEqual(['identifier']);
    expect(getVariantsDef.inputSchema.properties.include.enum).toEqual(['variants', 'states', 'all']);
  });
});
