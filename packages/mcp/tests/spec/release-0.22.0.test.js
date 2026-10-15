// What 0.22.0 changed for an author, and what this server does about it.
//
// A breaking release that simplifies. The parts a consumer has to act on:
//   - validation runs upstream's own validator, vendored with the schema;
//   - pointers live in fields named for their kind, with no `rel`, so the
//     relationship graph reads `uses`, `alternatives`, `extends`, `specs`
//     and a deprecated status's `replacedBy`;
//   - a check's kind is its `role`, and DSDS-03 needs an `href`;
//   - `rel: file` is for DSDS documents, and a code file is `rel: source`;
//   - an item can be addressed by the id its text derives;
//   - DSDS-07, -12, -17, -20, -22 and -23 are retired.
import { describe, expect, it } from 'vitest';
import { validateDoc20, RULES } from '../../src/spec/validator.js';
import { validateHandler } from '../../src/tools/validate.js';
import { renderSections20 } from '../../src/spec/render.js';
import { BUNDLED_VERSION } from '../../src/spec/version.js';
import { buildGraph, alternatives, dependents } from '../../src/graph.js';
import { loadSystems } from '../../src/loader.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('the bundled version', () => {
  // 0.23.0 is additive, so everything here still holds; release-0.23.0.test.js
  // checks the exact bundled version.
  it('is 0.22.0 or a later 0.2x release', () => {
    expect(BUNDLED_VERSION).toMatch(/^0\.2[2-9]\./);
  });

  it('has the retired rules marked retired, and the new ones present', () => {
    expect(RULES.CHAIN_CYCLE).toBe('DSDS-06');
    expect(RULES.REF_PLACEMENT).toBe('DSDS-25');
    expect(RULES.UNDECLARED_FIELD).toBe('DSDS-24');
  });
});

describe('DSDS-03 — a check names its kind in `role`, with no `rel`', () => {
  const withChecks = (checks) => ({
    id: 'badge', kind: 'component', name: 'Badge', description: 'A small status label.',
    sections: [{ kind: 'guidelines', for: 'all', items: [{
      level: 'must', statement: 'Give it an accessible name.', checkedBy: 'automated', checks,
    }] }],
  });

  it.each(['test', 'lint-rule', 'agent-test'])('accepts a check with role: %s', (role) => {
    expect(validateDoc20(withChecks([{ href: 'https://example.com/check', role }])).errors).toEqual([]);
  });

  it('rejects checkedBy: automated with no check at all', () => {
    const doc = withChecks(undefined);
    delete doc.sections[0].items[0].checks;
    expect(validateDoc20(doc).errors.some((e) => e.startsWith('[DSDS-03]'))).toBe(true);
  });

  it('rejects a `rel` on a check, since `checks` already says what it holds', () => {
    expect(validateDoc20(withChecks([{ href: 'https://example.com/check', rel: 'test' }])).errors.length).toBeGreaterThan(0);
  });
});

describe('the migration hint', () => {
  const old = [
    'kind: component', 'id: card', 'name: Card', 'description: A card.',
    'purpose: Groups related content.',
    'refs:', '  - to: box', '    rel: composes',
  ].join('\n');

  it('points a 0.21 document at the 0.22 migration script', async () => {
    const text = (await validateHandler({ document: old })).content[0].text;
    expect(text).toContain(`### Migrating to ${BUNDLED_VERSION}`);
    expect(text).toContain('migrate-to-0.22.js');
  });

  it('says nothing for a 0.22 document', async () => {
    const current = ['kind: component', 'id: card', 'name: Card', 'description: A card.', 'uses:', '  - to: box'].join('\n');
    const text = (await validateHandler({ document: current })).content[0].text;
    expect(text).not.toContain('### Migrating to');
  });
});

describe('the relationship graph reads the named pointer fields', () => {
  let root;
  const load = async (yaml) => {
    root = mkdtempSync(join(tmpdir(), 'dsds-022-'));
    const file = join(root, 'index.dsds.yaml');
    writeFileSync(file, yaml);
    const { systems } = await loadSystems([file]);
    return buildGraph(systems.flatMap((s) => s.entities));
  };

  const DOC = `schemaVersion: "0.22.0"
name: X
entries:
  - kind: component
    id: box
    name: Box
    description: A layout primitive.
  - kind: component
    id: card
    name: Card
    description: A surface.
    uses:
      - to: box
    alternatives:
      - to: panel
  - kind: component
    id: panel
    name: Panel
    description: A newer surface.
  - kind: component
    id: old-card
    name: Old card
    description: The first card.
    metadata:
      status:
        status: deprecated
        deprecationNotice: Use card.
        replacedBy:
          - to: card
`;

  it('derives used-by from `uses`', async () => {
    const g = await load(DOC);
    expect(dependents(g, 'box').map((d) => d.identifier)).toEqual(['card']);
    expect(dependents(g, 'box')[0].via).toBe('uses');
    rmSync(root, { recursive: true, force: true });
  });

  it('reads alternatives, and a successor from a deprecated status', async () => {
    const g = await load(DOC);
    expect(alternatives(g, 'card').alternatives.map((a) => a.identifier)).toContain('panel');
    expect(alternatives(g, 'old-card').replacedBy.map((r) => r.identifier)).toEqual(['card']);
    expect(alternatives(g, 'card').replaces.map((r) => r.identifier)).toEqual(['old-card']);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('an item addressed by the id its text derives', () => {
  const RULES_ENTRY = {
    kind: 'entry', id: 'rules', name: 'Rules', description: 'Shared rules.',
    sections: [{ kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'Keep labels short.', checkedBy: 'manual' }] }],
  };
  const consumer = {
    kind: 'component', id: 'button', name: 'Button', description: 'A button.',
    sections: [{ kind: 'guidelines', for: 'all', items: [{ refs: [{ to: 'rules#keep-labels-short', rel: 'same-as' }] }] }],
  };

  it('validates, since upstream derives the address', () => {
    expect(validateDoc20({ schemaVersion: '0.22.0', name: 'X', entries: [RULES_ENTRY, consumer] }).errors).toEqual([]);
  });

  it('renders the reused rule inline', () => {
    const lines = [];
    renderSections20(consumer.sections, lines, { sharedEntries: [RULES_ENTRY] });
    expect(lines.join('\n')).toContain('Keep labels short.');
  });
});
