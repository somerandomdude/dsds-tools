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

  it('accepts a component `specs` entry pointing at a machine-readable API contract via `rel: contract`', () => {
    const doc = {
      id: 'button',
      kind: 'component',
      name: 'Button',
      description: 'A clickable action trigger.',
      specs: [{ href: './contracts/button.contract.json', rel: 'contract', role: 'DS Contracts' }],
    };
    const { errors } = validateDoc20(doc);
    expect(errors).toEqual([]);
  });

  it('accepts a trait\'s `setBy` field (consumer vs component)', () => {
    const doc = {
      id: 'switch',
      kind: 'component',
      name: 'Switch',
      description: 'A toggle control.',
      traits: [
        { id: 'checked', kind: 'boolean', description: 'Whether the switch is on.', setBy: 'consumer' },
        { id: 'loading', kind: 'boolean', description: 'Whether a pending action is in flight.', setBy: 'component' },
      ],
    };
    const { errors } = validateDoc20(doc);
    expect(errors).toEqual([]);
  });

  it('rejects an invalid `setBy` value', () => {
    const doc = {
      id: 'switch',
      kind: 'component',
      name: 'Switch',
      description: 'A toggle control.',
      traits: [{ id: 'checked', kind: 'boolean', description: 'Whether the switch is on.', setBy: 'somebody-else' }],
    };
    const { errors } = validateDoc20(doc);
    expect(errors.length).toBeGreaterThan(0);
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

describe('validateDoc20 — DSDS-01..11 semantic rules (real fixtures)', () => {
  const files = readdirSync(resolve(fixturesDir, 'invalid-0.20.0'));

  it.each(files)('flags exactly the rule the fixture %s is named for', (file) => {
    const ruleId = file.match(/^DSDS-(\d+)/)[0]; // e.g. "DSDS-04"
    const filePath = resolve(fixturesDir, `invalid-0.20.0/${file}`);
    const doc = loadFixture(`invalid-0.20.0/${file}`);
    // filePath is passed for every fixture, not just the DSDS-11 ones — it's
    // a no-op for DSDS-01..10 (they don't look at opts.filePath at all) and
    // DSDS-11 needs it (a warning, not an error — hence checking both below).
    const { errors, warnings } = validateDoc20(doc, { filePath });
    expect([...errors, ...warnings].some(e => e.startsWith(`[${ruleId}]`))).toBe(true);
  });
});

describe('validateDoc20 — DSDS-02 platform vocabulary against the per-platform metadata.status array', () => {
  it('flags an out-of-vocabulary platform inside the status array, at its own index', () => {
    const doc = {
      schemaVersion: '0.20.0',
      name: 'X',
      entries: [
        { id: 'sys', kind: 'system', name: 'Sys', description: 'd', metadata: { platforms: ['react', 'vue'] } },
        { id: 'btn', kind: 'component', name: 'Btn', description: 'd',
          metadata: { status: [{ status: 'stable', platform: 'react' }, { status: 'draft', platform: 'svelte' }] } },
      ],
    };
    const { errors } = validateDoc20(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('[DSDS-02]');
    expect(errors[0]).toContain('metadata.status[1]');
    expect(errors[0]).toContain('svelte');
  });

  it('does not flag a status array where every platform is declared', () => {
    const doc = {
      schemaVersion: '0.20.0',
      name: 'X',
      entries: [
        { id: 'sys', kind: 'system', name: 'Sys', description: 'd', metadata: { platforms: ['react', 'vue'] } },
        { id: 'btn', kind: 'component', name: 'Btn', description: 'd',
          metadata: { status: [{ status: 'stable', platform: 'react' }, { status: 'draft', platform: 'vue' }] } },
      ],
    };
    const { errors } = validateDoc20(doc);
    expect(errors).toEqual([]);
  });
});

describe('validateDoc20 — DSDS-12..15 advisory tier (never affects validity)', () => {
  it('DSDS-12: flags a lowercase RFC keyword in a guideline statement', () => {
    const doc = {
      id: 'button', kind: 'component', name: 'Button', description: 'd',
      sections: [{ kind: 'guidelines', for: 'all', items: [{ id: 'a', statement: 'You must set an aria-label.', level: 'must', checkedBy: 'manual' }] }],
    };
    const { errors, advisories } = validateDoc20(doc);
    expect(errors).toEqual([]);
    expect(advisories.some(a => a.startsWith('[DSDS-12]'))).toBe(true);
  });

  it('DSDS-13: flags a token description that only restates its id', () => {
    const doc = { id: 'color-action-primary', kind: 'token', name: 'Primary', description: 'color-action-primary' };
    const { advisories } = validateDoc20(doc);
    expect(advisories.some(a => a.startsWith('[DSDS-13]'))).toBe(true);
  });

  it('DSDS-13: does not flag a token description that adds real information', () => {
    const doc = { id: 'color-action-primary', kind: 'token', name: 'Primary', description: 'The default accent for primary actions.' };
    const { advisories } = validateDoc20(doc);
    expect(advisories.some(a => a.startsWith('[DSDS-13]'))).toBe(false);
  });

  it('DSDS-14: flags a must-level guideline with no checkedBy at all', () => {
    const doc = {
      id: 'button', kind: 'component', name: 'Button', description: 'd',
      sections: [{ kind: 'guidelines', for: 'all', items: [{ id: 'a', statement: 'Set an accessible name.', level: 'must' }] }],
    };
    const { advisories } = validateDoc20(doc);
    expect(advisories.some(a => a.startsWith('[DSDS-14]'))).toBe(true);
  });

  it('DSDS-15: flags a component with no when-to-use guidelines section', () => {
    const doc = {
      id: 'button', kind: 'component', name: 'Button', description: 'd',
      sections: [{ kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [{ id: 'a', statement: 'Provide a label.', level: 'must', checkedBy: 'manual' }] }],
    };
    const { advisories } = validateDoc20(doc);
    expect(advisories.some(a => a.startsWith('[DSDS-15]'))).toBe(true);
  });

  it('produces zero advisories for a document with no editorial gaps', () => {
    const doc = {
      id: 'switch', kind: 'component', name: 'Switch', description: 'A toggle control.',
      sections: [
        { kind: 'guidelines', for: 'all', framing: 'when-to-use', items: [{ id: 'a', statement: 'Use for a setting that takes effect immediately.', level: 'should', checkedBy: 'manual' }] },
        { kind: 'guidelines', for: 'all', framing: 'how-to-use', items: [{ id: 'b', statement: 'MUST set an aria-label when no visible label is present.', level: 'must', checkedBy: 'manual' }] },
      ],
    };
    const { advisories } = validateDoc20(doc);
    expect(advisories).toEqual([]);
  });

  it('advisories never affect isError-equivalent validity — errors stay empty regardless', () => {
    const doc = { id: 'x', kind: 'component', name: 'X', description: 'd' };
    const { errors, advisories } = validateDoc20(doc);
    expect(errors).toEqual([]);
    expect(advisories.length).toBeGreaterThan(0); // missing when-to-use, at minimum
  });
});
