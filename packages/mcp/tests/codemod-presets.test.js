import { describe, expect, it } from 'vitest';
import { getCodemodPreset, listCodemodPresets } from '../src/codemod-presets/index.js';
import sanityUi from '../src/codemod-presets/sanity-ui.js';
import { resolveTransformSpecifier } from '../src/tools/ui-codemods.js';

describe('codemod preset registry', () => {
  it('registers every preset under its own id', () => {
    for (const p of listCodemodPresets()) expect(getCodemodPreset(p.id)).toBe(p);
  });

  it('throws on an unknown id, naming what is available', () => {
    // A silent fallback would leave the codemod pass with nothing to run,
    // which is indistinguishable in lint output from "nothing needed changing".
    expect(() => getCodemodPreset('nope')).toThrow(/Unknown codemod preset "nope"/);
    expect(() => getCodemodPreset('nope')).toThrow(/sanity-ui/);
  });

  it('gives every preset the fields the runner needs', () => {
    for (const p of listCodemodPresets()) {
      expect(typeof p.id, `${p.id}.id`).toBe('string');
      expect(typeof p.description, `${p.id}.description`).toBe('string');
      expect(typeof p.codemodPackage, `${p.id}.codemodPackage`).toBe('string');
      expect(typeof p.fromPackage, `${p.id}.fromPackage`).toBe('string');
      expect(typeof p.toPackage, `${p.id}.toPackage`).toBe('string');
      expect(Array.isArray(p.transforms) && p.transforms.length, `${p.id}.transforms`).toBeTruthy();
      // A template with no <name> would resolve every transform to the same
      // module, silently applying one transform under many names.
      expect(p.transformPath, `${p.id}.transformPath`).toContain('<name>');
      expect(p.transformPath, `${p.id}.transformPath`).toContain('<pkg>');
    }
  });
});

describe('sanity-ui preset', () => {
  it('carries the nine transforms verified safe at @sanity/ui-codemod@1.0.0-alpha.7', () => {
    expect(sanityUi.transforms).toEqual(['box', 'code', 'container', 'flex', 'grid', 'heading', 'inline', 'stack', 'text']);
  });

  it('excludes card and label, each with a stated reason', () => {
    expect(Object.keys(sanityUi.excluded).sort()).toEqual(['card', 'label']);
    for (const [name, why] of Object.entries(sanityUi.excluded)) {
      expect(why.length, `${name} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });

  it('never lists an excluded transform among the ones it runs', () => {
    for (const name of Object.keys(sanityUi.excluded)) expect(sanityUi.transforms).not.toContain(name);
  });

  it('resolves a transform to the package\'s real subpath export', () => {
    expect(resolveTransformSpecifier(sanityUi.transformPath, sanityUi.codemodPackage, 'box')).toBe(
      '@sanity/ui-codemod/transforms/latest/box',
    );
  });
});
