// The agent instruction block — shared by the MCP server (as its server
// instructions) and the CLI (`dsds instructions`).

import { describe, it, expect } from 'vitest';
import { buildInstructions, BASE_INSTRUCTIONS, FEEDBACK_INSTRUCTION } from '../src/instructions.js';
import { BUNDLED_VERSION } from '../src/spec/version.js';

const introEntity = {
  identifier: 'design-system-intro',
  name: 'Design System Intro',
  kind: 'guide',
  metadata: [{ kind: 'description', value: 'How this system is organized.' }],
  documentBlocks: [
    { kind: 'section', items: [{ title: 'Layout', body: 'Compose with Stack and Grid.' }] },
  ],
};

describe('buildInstructions', () => {
  it('states the bundled spec version and the pre-use rule', () => {
    const text = buildInstructions();
    expect(text).toContain(`Design System Documentation Spec v${BUNDLED_VERSION}`);
    expect(text).toContain('dsds_get_agent_context');
  });

  it('includes the feedback reminder by default', () => {
    expect(buildInstructions()).toContain(FEEDBACK_INSTRUCTION);
  });

  it('omits the feedback reminder when the feedback tool is disabled', () => {
    const text = buildInstructions({ enableFeedback: false });
    expect(text).not.toContain(FEEDBACK_INSTRUCTION);
    expect(text).toBe(BASE_INSTRUCTIONS);
  });

  it('appends nothing when there are no intro entities', () => {
    expect(buildInstructions({ introEntities: [] })).toBe(
      `${BASE_INSTRUCTIONS}\n\n${FEEDBACK_INSTRUCTION}`
    );
  });

  it('inlines intro entities in full by default', () => {
    const text = buildInstructions({ introEntities: [introEntity] });
    expect(text).toContain('## Design System Intro');
    expect(text).toContain('Compose with Stack and Grid.');
  });

  it('renders a one-line index instead when introInline is false', () => {
    const text = buildInstructions({ introEntities: [introEntity], introInline: false });
    expect(text).toContain('## Design system guides');
    expect(text).toContain('`design-system-intro`');
    expect(text).toContain('How this system is organized.');
    // The index points at the content rather than carrying it.
    expect(text).not.toContain('Compose with Stack and Grid.');
  });
});
