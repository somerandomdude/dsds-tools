// The shared prompt runtime — the catalog server.js used to hold inline.

import { describe, it, expect } from 'vitest';
import { createPromptRuntime, INTRO_PROMPT_NAME } from '../src/prompts.js';
import { PROMPT_META } from '../src/briefs.js';

const introEntity = {
  identifier: 'design-system-intro',
  name: 'Design System Intro',
  kind: 'guide',
  metadata: [{ kind: 'description', value: 'How this system is organized.' }],
  documentBlocks: [
    { kind: 'section', items: [{ title: 'Layout', body: 'Compose with Stack and Grid.' }] },
  ],
};

describe('createPromptRuntime — catalog', () => {
  it('lists the three task briefs by their published names', () => {
    const { listPrompts } = createPromptRuntime();
    expect(listPrompts().map(p => p.name)).toEqual([
      PROMPT_META.build.name,
      PROMPT_META.author.name,
      PROMPT_META.ask.name,
    ]);
  });

  it('gives every task brief an optional task argument', () => {
    const { listPrompts } = createPromptRuntime();
    for (const prompt of listPrompts()) {
      expect(prompt.arguments).toEqual([
        { name: 'task', description: expect.any(String), required: false },
      ]);
      expect(prompt.description.length).toBeGreaterThan(0);
    }
  });

  it('omits the intro prompt when no intro entities are configured', () => {
    const { listPrompts } = createPromptRuntime({ getIntro: () => [] });
    expect(listPrompts().map(p => p.name)).not.toContain(INTRO_PROMPT_NAME);
  });

  it('adds the intro prompt, named after the loaded entities, when they are', () => {
    const { listPrompts } = createPromptRuntime({ getIntro: () => [introEntity] });
    const intro = listPrompts().find(p => p.name === INTRO_PROMPT_NAME);
    expect(intro).toBeDefined();
    expect(intro.description).toContain('Design System Intro');
    expect(intro.description).toContain('introduction '); // singular for one entity
    expect(intro.arguments).toEqual([]);
  });

  it('pluralizes the intro description for several entities', () => {
    const { listPrompts } = createPromptRuntime({
      getIntro: () => [introEntity, { ...introEntity, identifier: 'second', name: 'Second' }],
    });
    const intro = listPrompts().find(p => p.name === INTRO_PROMPT_NAME);
    expect(intro.description).toContain('introductions');
  });

  it('reflects intro entities loaded after construction', () => {
    let entities = [];
    const { listPrompts } = createPromptRuntime({ getIntro: () => entities });
    expect(listPrompts()).toHaveLength(3);
    entities = [introEntity];
    expect(listPrompts()).toHaveLength(4);
  });
});

describe('createPromptRuntime — rendering', () => {
  it('returns the brief as a single user message', () => {
    const { getPrompt } = createPromptRuntime();
    const { messages } = getPrompt(PROMPT_META.build.name);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.type).toBe('text');
    expect(messages[0].content.text).toContain('Before you build');
  });

  it('prefixes a task heading when a task is given', () => {
    const { getPrompt } = createPromptRuntime();
    const text = getPrompt(PROMPT_META.build.name, { task: 'a login form' }).messages[0].content.text;
    expect(text.startsWith('## Your task: a login form')).toBe(true);
  });

  it('labels the ask brief a question rather than a task', () => {
    const { getPrompt } = createPromptRuntime();
    const text = getPrompt(PROMPT_META.ask.name, { task: 'which dialog?' }).messages[0].content.text;
    expect(text.startsWith('## Your question: which dialog?')).toBe(true);
  });

  it('renders each brief distinctly', () => {
    const { getPrompt } = createPromptRuntime();
    const render = name => getPrompt(name).messages[0].content.text;
    const build = render(PROMPT_META.build.name);
    const author = render(PROMPT_META.author.name);
    const ask = render(PROMPT_META.ask.name);
    expect(new Set([build, author, ask]).size).toBe(3);
  });

  it('renders the intro entities in full for the intro prompt', () => {
    const { getPrompt } = createPromptRuntime({ getIntro: () => [introEntity] });
    const text = getPrompt(INTRO_PROMPT_NAME).messages[0].content.text;
    expect(text).toContain('## Design System Intro');
    expect(text).toContain('Compose with Stack and Grid.');
  });

  it('explains how to configure intro entities when the prompt has none', () => {
    const { getPrompt } = createPromptRuntime({ getIntro: () => [] });
    expect(() => getPrompt(INTRO_PROMPT_NAME)).toThrow(/DSDS_INTRO_PATHS/);
  });

  it('throws on an unknown prompt name', () => {
    const { getPrompt } = createPromptRuntime();
    expect(() => getPrompt('nope')).toThrow(/Unknown prompt: "nope"/);
  });
});
