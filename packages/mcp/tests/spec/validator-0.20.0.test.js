import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDoc20, looksLike20 } from '../../src/spec/validator-0.20.0.js';
import { loadYaml20 } from '../../src/spec/dsds20-lib.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

function loadFixture(relPath) {
  return loadYaml20(readFileSync(resolve(fixturesDir, relPath), 'utf-8'));
}

describe('looksLike20', () => {
  it('recognizes a base document (schemaVersion + entries)', () => {
    expect(looksLike20({ schemaVersion: '0.20.0', entries: [] })).toBe(true);
  });

  it('recognizes a standalone real 0.20.0 entry', () => {
    expect(looksLike20({ id: 'button', kind: 'component', name: 'Button', description: 'x' })).toBe(true);
  });

  it('recognizes namespaced custom kinds (sanity.guide, sanity.chunk, sanity.foundation, sanity.pattern)', () => {
    for (const kind of ['sanity.guide', 'sanity.chunk', 'sanity.foundation', 'sanity.pattern']) {
      expect(looksLike20({ id: 'x', kind, name: 'X', description: 'x' })).toBe(true);
    }
  });

  it('rejects a kind that is neither well-known nor validly namespaced', () => {
    expect(looksLike20({ id: 'x', kind: 'widget', name: 'X', description: 'x' })).toBe(false);
    expect(looksLike20({ id: 'x', kind: 'sanity.', name: 'X', description: 'x' })).toBe(false);
  });

  it('rejects a legacy standalone entry (identifier, not id)', () => {
    expect(looksLike20({ identifier: 'button', kind: 'component', name: 'Button' })).toBe(false);
  });

  it('rejects a legacy single-entity wrapper document', () => {
    expect(looksLike20({ dsdsVersion: '0.15.2', entity: { kind: 'component', identifier: 'x', name: 'X' } })).toBe(false);
  });

  it('rejects null/non-object input', () => {
    expect(looksLike20(null)).toBe(false);
    expect(looksLike20('a string')).toBe(false);
  });
});

describe('validateDoc20', () => {
  it('validates the real button.yaml fixture with no errors', () => {
    const doc = loadFixture('button.dsds.yaml');
    const { errors, warnings } = validateDoc20(doc);
    expect(errors).toEqual([]);
    // The fixture references siblings (icon-button, button-group, link,
    // color.action.primary) that don't exist in this single standalone
    // file — correctly a warning (not an error, and not silently skipped):
    // a lone entry file can never prove it's fully self-contained.
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((w) => w.startsWith('[DSDS-08]'))).toBe(true);
  });

  it('gives a standalone entry the same reference checking a base document gets — as a warning, not an error, since it can never prove it is self-contained', () => {
    const doc = { id: 'badge', kind: 'component', name: 'Badge', description: 'A small status label.', related: [{ to: 'does-not-exist-anywhere', rel: 'alternative-to' }] };
    const { errors, warnings } = validateDoc20(doc);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('does-not-exist-anywhere'))).toBe(true);
  });

  it('resolves refs between sibling entries inside the same base document without false positives', () => {
    // Regression: standalone-entry ref checking must not run per-entry
    // inside validateBase's loop — each entry would see only itself as
    // "local" and falsely flag every legitimate sibling reference.
    const doc = {
      schemaVersion: '0.20.0', name: 'X',
      entries: [
        { id: 'a', kind: 'entry', name: 'A', description: 'd', related: [{ to: 'b', rel: 'composes' }] },
        { id: 'b', kind: 'entry', name: 'B', description: 'd' },
      ],
    };
    const { errors, warnings } = validateDoc20(doc);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('validates a real base document with an unfollowed rel:file ref only as a warning, not an error', () => {
    // This document has one rel:file ref this validator (single-document,
    // no filesystem access) can't follow — DSDS-08 must warn, not fail.
    const doc = { schemaVersion: '0.20.0', name: 'X', entries: [{ id: 'a', kind: 'entry', name: 'A', description: 'd' }], refs: [{ href: './b.dsds.yaml', rel: 'file' }] };
    const { errors } = validateDoc20(doc);
    expect(errors).toEqual([]);
  });

  it('rejects an unknown entity kind under a base document with a real schema error', () => {
    const doc = { schemaVersion: '0.20.0', name: 'X', entries: [{ id: 'a', kind: 'widget', name: 'A', description: 'd' }] };
    const { errors } = validateDoc20(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates a generic kind:section without crashing (section.schema.yaml fallback resolution)', () => {
    // Regression: the fallback schema lookup for a section with no dedicated
    // sections/<kind>.schema.yaml file used to construct the wrong $id
    // (`sections/section.schema.yaml` instead of `section.schema.yaml`),
    // resolving to undefined and throwing "validateSection is not a function".
    const doc = {
      id: 'x', kind: 'component', name: 'X', description: 'd',
      sections: [{ kind: 'section', for: 'all', items: [{ title: 'A note', body: 'Some text.' }] }],
    };
    expect(() => validateDoc20(doc)).not.toThrow();
  });
});

describe('validateDoc20 — DSDS-01..08 semantic rules (real fixtures)', () => {
  const files = readdirSync(resolve(fixturesDir, 'invalid-0.20.0'));

  it.each(files)('flags exactly the rule the fixture %s is named for', (file) => {
    const ruleId = file.match(/^DSDS-(\d+)/)[0]; // e.g. "DSDS-04"
    const doc = loadFixture(`invalid-0.20.0/${file}`);
    const { errors } = validateDoc20(doc);
    expect(errors.some(e => e.startsWith(`[${ruleId}]`))).toBe(true);
  });
});
