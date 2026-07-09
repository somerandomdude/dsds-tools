import { describe, it, expect } from 'vitest';
import { buildGraph, inverseOf, dependents, dependencies, alternatives, impact } from '../src/graph.js';

const entities = [
  { identifier: 'button', kind: 'component', relationships: [
    { relation: 'composes', target: 'box', required: true },
    { relation: 'alternative-to', target: 'link' },
    { relation: 'depends-on', target: 'color-text', required: true },
  ] },
  { identifier: 'box', kind: 'component', relationships: [
    { relation: 'depends-on', target: 'color-text' },
  ] },
  { identifier: 'link', kind: 'component', relationships: [
    { relation: 'replaces', target: 'old-link' },
  ] },
  { identifier: 'old-link', kind: 'component' },
  { identifier: 'color-text', kind: 'token-group' },
  { identifier: 'card', kind: 'component', relationships: [
    { relation: 'composes', target: 'box', required: true },
    { relation: 'composes', target: 'ghost' }, // unresolved target
  ] },
];

describe('relationship graph', () => {
  const g = buildGraph(entities);

  it('derives the fixed inverse relations', () => {
    expect(inverseOf('composes')).toBe('composed-by');
    expect(inverseOf('depends-on')).toBe('dependency-of');
    expect(inverseOf('alternative-to')).toBe('alternative-to');
    expect(inverseOf('acme.themes')).toBe('inverse-of:acme.themes');
  });

  it('builds incoming (inverse) edges so reverse queries work', () => {
    const boxDependents = dependents(g, 'box').map(d => d.identifier).sort();
    expect(boxDependents).toEqual(['button', 'card']); // both compose box
    expect(dependents(g, 'color-text').map(d => d.identifier).sort()).toEqual(['box', 'button']);
  });

  it('filters dependents by authored relation', () => {
    const composedByBox = dependents(g, 'box', { relation: 'composes' });
    expect(composedByBox.every(d => d.via === 'composes')).toBe(true);
    expect(composedByBox).toHaveLength(2);
  });

  it('returns outgoing dependencies and resolves their kind', () => {
    const deps = dependencies(g, 'button');
    expect(deps.map(d => d.identifier).sort()).toEqual(['box', 'color-text', 'link']);
    expect(deps.find(d => d.identifier === 'box').kind).toBe('component');
  });

  it('walks transitively with a cycle guard', () => {
    // button -composes-> box -depends-on-> color-text
    const t = dependencies(g, 'button', { transitive: true }).map(d => d.identifier).sort();
    expect(t).toContain('color-text');
  });

  it('reports alternatives and replacements (with deprecation direction)', () => {
    expect(alternatives(g, 'button').alternatives.map(a => a.identifier)).toContain('link');
    expect(alternatives(g, 'link').replaces.map(r => r.identifier)).toEqual(['old-link']);
    expect(alternatives(g, 'old-link').replacedBy.map(r => r.identifier)).toEqual(['link']); // old-link is deprecated
  });

  it('computes impact and flags required dependents as breaking', () => {
    const i = impact(g, 'box');
    expect(i.directCount).toBe(2);
    expect(i.breaking.map(b => b.identifier).sort()).toEqual(['button', 'card']); // both require box
  });

  it('records unresolved targets without throwing', () => {
    expect(g.unresolved.map(u => u.target)).toContain('ghost');
    expect(g.cycles).toEqual([]);
  });

  it('detects cycles over composes/depends-on', () => {
    const cyc = buildGraph([
      { identifier: 'a', relationships: [{ relation: 'composes', target: 'b' }] },
      { identifier: 'b', relationships: [{ relation: 'composes', target: 'a' }] },
    ]);
    expect(cyc.cycles.length).toBeGreaterThan(0);
  });
});
