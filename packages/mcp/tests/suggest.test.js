import { describe, it, expect } from 'vitest';
import { didYouMean, notFoundMessage, entityIdentifiers } from '../src/suggest.js';

const IDS = ['button', 'icon-button', 'menu-button', 'card', 'text-input', 'confirmation-dialogs'];

describe('didYouMean', () => {
  it('catches a single-character typo', () => {
    expect(didYouMean('buton', IDS)[0]).toBe('button');
  });

  it('catches a transposition', () => {
    expect(didYouMean('crad', IDS)[0]).toBe('card');
  });

  it('treats a partial name as partial recall, closest length first', () => {
    expect(didYouMean('dialog', IDS)).toContain('confirmation-dialogs');
    expect(didYouMean('button', IDS)[0]).toBe('icon-button');
  });

  it('never suggests the exact input back', () => {
    expect(didYouMean('card', IDS)).not.toContain('card');
  });

  it('returns nothing when nothing is close', () => {
    expect(didYouMean('zzzzzzzz', IDS)).toEqual([]);
  });

  it('caps how many it offers', () => {
    const many = Array.from({ length: 50 }, (_, i) => `button-${i}`);
    expect(didYouMean('button', many).length).toBeLessThanOrEqual(5);
  });

  it('is case-insensitive', () => {
    expect(didYouMean('BUTON', IDS)[0]).toBe('button');
  });

  it('handles empty input without throwing', () => {
    expect(didYouMean('', IDS)).toEqual([]);
    expect(didYouMean(undefined, IDS)).toEqual([]);
  });
});

describe('notFoundMessage', () => {
  it('names the miss, the suggestion, and the way to see everything', () => {
    const msg = notFoundMessage({
      label: 'Entity',
      input: 'buton',
      candidates: IDS,
      listHint: '`dsds_list_entities`',
    });
    expect(msg).toContain('Entity "buton" not found.');
    expect(msg).toContain('Did you mean');
    expect(msg).toContain('`button`');
    expect(msg).toContain('dsds_list_entities');
  });

  it('still points at the listing when nothing is close', () => {
    const msg = notFoundMessage({
      label: 'Entity',
      input: 'zzzzzzzz',
      candidates: IDS,
      listHint: '`dsds_list_entities`',
    });
    expect(msg).not.toContain('Did you mean');
    expect(msg).toContain('dsds_list_entities');
  });

  // The behaviour this replaced: 199 identifiers inlined on one line.
  it('does not inline the whole catalog', () => {
    const many = Array.from({ length: 199 }, (_, i) => `entity-${i}`);
    const msg = notFoundMessage({ label: 'Entity', input: 'nope', candidates: many, listHint: '`dsds list`' });
    expect(msg.length).toBeLessThan(300);
  });
});

describe('entityIdentifiers', () => {
  it('flattens identifiers across systems and skips entities without one', () => {
    const systems = [
      { entities: [{ identifier: 'a' }, { name: 'no identifier' }] },
      { entities: [{ identifier: 'b' }] },
    ];
    expect(entityIdentifiers(systems)).toEqual(['a', 'b']);
  });

  it('tolerates missing input', () => {
    expect(entityIdentifiers(undefined)).toEqual([]);
    expect(entityIdentifiers([{}])).toEqual([]);
  });
});
