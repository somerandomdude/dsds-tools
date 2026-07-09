import { describe, it, expect } from 'vitest';
import { authorComponentDocHandler, assembleComponent } from '../../src/tools/author-component-doc.js';
import { validateDocument } from '../../src/validator.js';

// Parse the JSON payload a step returns.
function read(response) {
  expect(response.isError).toBeFalsy();
  return JSON.parse(response.content[0].text);
}

// Drive the wizard end-to-end, always echoing `data` back like a real agent.
async function run(steps) {
  let data = {};
  let last;
  for (const [step, patch] of steps) {
    const res = await authorComponentDocHandler({ step, data: { ...data, ...patch } });
    last = read(res);
    data = last.data;
  }
  return last;
}

describe('dsds_author_component_doc', () => {
  it('self-bootstraps: a cold "start" returns its field schema, not an error', async () => {
    const out = read(await authorComponentDocHandler({ step: 'start' }));
    expect(out.nextStepId).toBe('start');
    expect(out.nextStepFields.map(f => f.name)).toContain('identifier');
  });

  it('rejects a non-kebab identifier and re-prompts', async () => {
    const out = read(await authorComponentDocHandler({ step: 'start', data: { identifier: 'My Button', name: 'Button' } }));
    expect(out.nextStepId).toBe('start');
    expect(out.validated).toMatch(/kebab/);
  });

  it('surfaces allowedValues for closed enums', async () => {
    const out = read(await authorComponentDocHandler({ step: 'configure_guidelines' }));
    const field = out.nextStepFields.find(f => f.name === 'guidelineItems');
    expect(field.allowedValues).toEqual(['must', 'should', 'should-not', 'must-not']);
  });

  it('rejects unknown block kinds', async () => {
    const out = read(await authorComponentDocHandler({
      step: 'select_blocks',
      data: { identifier: 'x', name: 'X', selectedBlocks: ['api', 'content'] },
    }));
    // "content" is not (yet) selectable — no valid empty form exists for it.
    expect(out.nextStepId).toBe('select_blocks');
    expect(out.validated).toMatch(/content/);
  });

  it('queues configurable blocks in selected order', async () => {
    const out = read(await authorComponentDocHandler({
      step: 'select_blocks',
      data: { identifier: 'x', name: 'X', selectedBlocks: ['states', 'api'] },
    }));
    expect(out.nextStepId).toBe('configure_states'); // first in selected order
    expect(out.data.blockQueue).toEqual(['configure_api']); // api still queued
  });

  it('runs a full flow and produces a document that passes the real validator', async () => {
    const final = await run([
      ['start', { identifier: 'button', name: 'Button', description: 'A clickable action trigger.' }],
      ['metadata', { status: 'stable', category: 'action', summary: 'Clickable action trigger.', tags: ['interactive'] }],
      ['select_blocks', { selectedBlocks: ['anatomy', 'api', 'variants', 'states', 'guidelines', 'accessibility'] }],
      ['configure_anatomy', { anatomyParts: [{ identifier: 'label', description: 'The button text.', required: true }] }],
      ['configure_api', { apiProperties: [
        { identifier: 'tone', type: 'enum', description: 'Visual tone.', values: ['default', 'primary'] },
        { identifier: 'disabled', type: 'boolean', description: 'Disables interaction.', defaultValue: false },
      ] }],
      ['configure_variants', { variantItems: [
        { kind: 'flag', identifier: 'loading', description: 'Shows a spinner.' },
        { kind: 'enum', identifier: 'size', description: 'Control size.', values: [
          { identifier: 'sm', description: 'Small.' }, { identifier: 'lg', description: 'Large.' },
        ] },
      ] }],
      ['configure_states', { stateItems: [
        { identifier: 'hover', description: 'Pointer over the control.' },
        { identifier: 'disabled', description: 'Non-interactive.' },
      ] }],
      ['configure_guidelines', { guidelineItems: [
        { guidance: 'Use a clear verb as the label.', level: 'should' },
        { guidance: 'Do not place two primary buttons in one view.', level: 'must-not' },
      ] }],
      ['configure_accessibility', { wcagLevel: 'AA' }],
      ['finalize', {}],
    ]);

    expect(final.result).toBeDefined();
    expect(final.validated).toMatch(/passes/i);

    // Independently re-validate the emitted document.
    const v = validateDocument(final.result);
    expect(v.valid, JSON.stringify(v.errors)).toBe(true);

    // Block order is preserved and shapes are correct.
    const blocks = final.result.entity.documentBlocks;
    expect(blocks.map(b => b.kind)).toEqual(['anatomy', 'api', 'variants', 'states', 'guidelines', 'accessibility']);
    expect(blocks.find(b => b.kind === 'anatomy').parts).toHaveLength(1);
    expect(blocks.find(b => b.kind === 'variants').items.find(v => v.kind === 'enum').values).toHaveLength(2);
    expect(final.result.entity.metadata.status).toBe('stable');
  });

  it('a minimal component (no blocks) still validates', async () => {
    const final = await run([
      ['start', { identifier: 'spacer', name: 'Spacer' }],
      ['metadata', {}],
      ['select_blocks', { selectedBlocks: [] }],
      ['finalize', {}],
    ]);
    expect(final.result.entity.documentBlocks).toBeUndefined();
    expect(validateDocument(final.result).valid).toBe(true);
  });

  it('assembleComponent throws clearly when identifier is missing', () => {
    expect(() => assembleComponent({ name: 'X' })).toThrow(/identifier/);
  });
});
