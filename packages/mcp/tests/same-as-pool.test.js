// A `same-as` must resolve into any entry loaded alongside it, not only the
// base document's `shared[]` — and one that cannot resolve must say so.
//
// Regression: the loader pooled `shared[]` alone, so a `same-as` into an
// ordinary sibling entry (a `forms` pattern holding rules its form
// components share) rendered as "see forms#…", word for word the same as a
// ref to an item that does not exist. Every migrated rule vanished from
// its component page and nothing reported it.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../src/loader.js';
import { renderSections20 } from '../src/spec/render.js';

const INDEX = fileURLToPath(new URL('../fixtures/same-as-pool/index.dsds.yaml', import.meta.url));

async function consumer() {
  const { systems, errors } = await loadSystems([INDEX]);
  expect(errors).toHaveLength(0);
  const entities = systems.flatMap((s) => s.entities);
  return { entities, found: entities.find((e) => e.id === 'consumer') };
}

function render(entity) {
  const lines = [];
  renderSections20(entity.sections, lines, { sharedEntries: entity.__sharedEntries, filePath: entity.__filePath });
  return lines.join('\n');
}

describe('same-as pool', () => {
  it('pools every sibling entry, not only shared[]', async () => {
    const { found } = await consumer();
    const ids = found.__sharedEntries.map((e) => e.id);
    expect(ids).toContain('shared-rules');
    expect(ids).toContain('pool-pattern');
  });

  it('still resolves a same-as into shared[]', async () => {
    const { found } = await consumer();
    expect(render(found)).toContain('Borrowed from the shared pool.');
  });

  it('resolves a same-as into an ordinary sibling entry', async () => {
    const { found } = await consumer();
    const out = render(found);
    expect(out).toContain('Borrowed from a sibling pattern entry.');
    expect(out).not.toContain('see pool-pattern#from-pattern');
  });

  it('marks an unresolvable same-as instead of printing a plain pointer', async () => {
    const { found } = await consumer();
    const out = render(found);
    expect(out).toContain('**Unresolved reference:** `pool-pattern#does-not-exist`');
    expect(out).not.toMatch(/^- see pool-pattern#does-not-exist$/m);
  });
});

describe('a sibling file that fails to load', () => {
  it('is reported as an error instead of silently disappearing', async () => {
    const { mkdtemp, writeFile, cp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'dsds-sibling-'));
    await cp(fileURLToPath(new URL('../fixtures/same-as-pool/', import.meta.url)), dir, { recursive: true });
    // The real failure: an apostrophe inside a single-quoted YAML scalar.
    await writeFile(join(dir, 'pool-pattern.dsds.yaml'), "kind: sanity.pattern\nid: pool-pattern\ndescription: 'it's broken'\n");
    const { systems, errors } = await loadSystems([join(dir, 'index.dsds.yaml')]);
    // The rest of the system still loads…
    expect(systems).toHaveLength(1);
    expect(systems[0].entities.some((e) => e.id === 'consumer')).toBe(true);
    // …but the gap is visible.
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toContain('pool-pattern.dsds.yaml');
    expect(errors[0].sibling).toBe(true);
  });
});
