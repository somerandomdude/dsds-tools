// The 0.20.x schema tools describe the model the corpus is written in, with
// each field's meaning read out of the vendored schema.
//
// Two bugs this covers. The 0.20.x branch printed field names and nothing
// else, from a hand-kept list, while the meanings sat unread in
// schema-0.21.0/ (most declared properties carry a `description`). And `spec`
// defaulted to legacy 0.15.2, so the no-argument call against a 0.20.1
// document described `identifier`/`documentBlocks`/`agentDocumentBlocks` —
// none of which exist in the files being read.

import { describe, it, expect } from 'vitest';
import { describeEntryFields, describeSectionKinds } from '../../src/spec/schema-describe.js';
import { BUNDLED_VERSION } from '../../src/spec/version.js';
import { specEntitySchemaHandler } from '../../src/tools/spec-entity-schema.js';

const text = r => r.content[0].text;

describe('describeEntryFields', () => {
  it('carries the real 0.20.x field names, not the legacy ones', () => {
    const names = describeEntryFields('component').map(f => f.name);
    expect(names).toContain('id');
    expect(names).toContain('sections');
    expect(names).toContain('traits');
    expect(names).not.toContain('identifier');
    expect(names).not.toContain('documentBlocks');
    expect(names).not.toContain('agentDocumentBlocks');
  });

  it('marks exactly the schema-required fields as required', () => {
    const required = describeEntryFields('component').filter(f => f.required).map(f => f.name);
    expect(required.sort()).toEqual(['description', 'id', 'kind', 'name']);
  });

  it('reads each meaning from the schema rather than a table here', () => {
    const byName = Object.fromEntries(describeEntryFields('component').map(f => [f.name, f]));
    expect(byName.id.description).toMatch(/unique id/i);
    expect(byName.traits.description).toMatch(/variants and states/i);
    expect(byName.sections.description).toMatch(/documentation section/i);
  });

  // A field with no description of its own left an empty cell; every field
  // in the table should say something.
  it('leaves no field without a description', () => {
    for (const kind of ['component', 'token', 'theme', 'system', 'entry']) {
      for (const f of describeEntryFields(kind)) {
        expect(f.description, `${kind}.${f.name}`).not.toBe('');
      }
    }
  });

  it('gives a type for $ref-only fields instead of a dash', () => {
    const byName = Object.fromEntries(describeEntryFields('component').map(f => [f.name, f]));
    for (const n of ['metadata', 'extends', 'related', 'refs']) {
      expect(byName[n].type, n).toBeTruthy();
    }
  });

  it("narrows `kind` to the kind's own const", () => {
    const kindField = describeEntryFields('component').find(f => f.name === 'kind');
    expect(kindField.type).toBe('"component"');
  });

  it('falls back to the base entry shape for a namespaced custom kind', () => {
    const names = describeEntryFields('sanity.guide').map(f => f.name);
    expect(names).toContain('sections');
    // component-only fields must not appear on the generic shape
    expect(names).not.toContain('traits');
  });

  it('returns a copy, so a caller cannot corrupt the cache', () => {
    const a = describeEntryFields('component');
    a.length = 0;
    expect(describeEntryFields('component').length).toBeGreaterThan(0);
  });
});

describe('describeSectionKinds', () => {
  it('lists the four section kinds with what each holds', () => {
    const kinds = describeSectionKinds();
    expect(kinds.map(k => k.kind).sort()).toEqual(['definitions', 'guidelines', 'section', 'steps']);
    for (const k of kinds) expect(k.description, k.kind).not.toBe('');
  });
});


describe('dsds_spec_entity_schema', () => {
  const loaded20 = () => [{ document: { schemaVersion: '0.20.1' }, entities: [] }];




  // The regression this whole change exists for: names without meanings.
  it('gives every field a description, not just a name', async () => {
    const out = text(await specEntitySchemaHandler({ kind: 'component' }, loaded20));
    expect(out).toContain('| Field | Type | Description |');
    expect(out).toMatch(/\| `traits` \| .+ \| .+variants and states/i);
  });

  it('names the section kinds an entry can carry', async () => {
    const out = text(await specEntitySchemaHandler({ kind: 'component' }, loaded20));
    expect(out).toContain('## Section Kinds');
    for (const k of ['guidelines', 'definitions', 'steps', 'section']) expect(out).toContain(`\`${k}\``);
  });

});
