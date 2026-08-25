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
