// D3 (dsds-0.20.0-migration-prd.md, Phase 2): golden-file tests for the
// markdown exporter's full 0.20.0 shape — freeform (incl. nesting),
// custom section kinds, $extensions (namespace allowlist), shared/same-as,
// showcase/example. One fixture (`golden-0.20.0/base.dsds.yaml`) covers all
// of it plus the two edge-case fixtures already used in the conformance
// suite (empty sections, extensions-only) — reused here rather than
// re-authored, per the Phase 1 investigation's recommendation.
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSystems } from '../src/loader.js';
import { toMarkdownHandler } from '../src/tools/to-markdown.js';
import { getEntityHandler } from '../src/tools/get-entity.js';
import { getAgentContextHandler } from '../src/tools/get-agent-context.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../fixtures');
const goldenFile = `${fixturesDir}/golden-0.20.0/base.dsds.yaml`;

async function renderAll(identifier) {
  const { systems } = await loadSystems([goldenFile]);
  const [toMd, getE, getAC] = await Promise.all([
    toMarkdownHandler({ identifier }, () => systems, {}),
    getEntityHandler({ identifier }, () => systems, () => [], null, null, {}),
    getAgentContextHandler({ identifier, verbose: true }, () => systems, null, {}),
  ]);
  return { toMd, getE, getAC };
}

describe('golden 0.20.0 — full-featured entry ($extensions, example, same-as)', () => {
  it('loads with no errors', async () => {
    const { systems, errors } = await loadSystems([goldenFile]);
    expect(errors).toEqual([]);
    expect(systems[0].entities.map((e) => e.identifier)).toContain('full-featured');
  });

  it('dsds_to_markdown renders every $extensions namespace — allowlisted and unknown alike', async () => {
    const { toMd } = await renderAll('full-featured');
    const text = toMd.content[0].text;
    expect(toMd.isError).toBeFalsy();
    // com.sanity.ui
    expect(text).toContain('Implemented: yes');
    expect(text).toContain('Available in: 5.0.0');
    // com.figma
    expect(text).toContain('Figma component: `Example/Default`');
    expect(text).toContain('Node id: `1:1`');
    // unknown namespace never silently dropped
    expect(text).toContain('Tool data: acme.custom');
    expect(text).toContain('"note": "unrecognized namespace, must still render"');
  });

  it('renders section-level and item-level $extensions too, not just entity-level', async () => {
    const { toMd } = await renderAll('full-featured');
    const text = toMd.content[0].text;
    expect(text).toContain('Tool data: acme.section-level');
    expect(text).toContain('Tool data: acme.item-level');
  });

  it('resolves an inline example with a real code ref into a fenced code block', async () => {
    const { toMd } = await renderAll('full-featured');
    const text = toMd.content[0].text;
    expect(text).toContain('**Controlled Example**');
    expect(text).toContain('Ties the component to state.');
    expect(text).toContain("import { Button } from '@sanity/ui-v5'");
    expect(text).not.toContain('Example file not found');
  });

  it('resolves a same-as ref to the shared entry\'s pooled statement', async () => {
    const { toMd } = await renderAll('full-featured');
    const text = toMd.content[0].text;
    expect(text).toContain('Focus must be visible at all times.');
  });

  it('dsds_get_entity and dsds_get_agent_context render the same extensions/example/same-as content', async () => {
    const { getE, getAC } = await renderAll('full-featured');
    for (const result of [getE, getAC]) {
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      expect(text).toContain('Implemented: yes');
      expect(text).toContain('Focus must be visible at all times.');
    }
  });
});

describe('golden 0.20.0 — nested-freeform entry', () => {
  it('renders freeform content nested three levels deep', async () => {
    const { toMd } = await renderAll('nested-freeform');
    const text = toMd.content[0].text;
    expect(toMd.isError).toBeFalsy();
    expect(text).toContain('Level 1');
    expect(text).toContain('Top-level prose.');
    expect(text).toContain('Level 2');
    expect(text).toContain('Nested prose.');
    expect(text).toContain('Level 3');
    expect(text).toContain('Doubly-nested prose.');
  });

  it('renders examples, refs, and $extensions on a nested freeform entry', async () => {
    const { toMd } = await renderAll('nested-freeform');
    const text = toMd.content[0].text;
    expect(text).toContain('**Nested Example**');
    expect(text).toContain('An example at the deepest level.');
    expect(text).toContain('*See also:*');
    expect(text).toContain('full-featured (relates-to)');
    expect(text).toContain('Tool data: acme.freeform-level');
  });
});

describe('golden 0.20.0 — custom section kind humanization', () => {
  it('humanizes an untitled namespaced section kind instead of printing the raw slug', async () => {
    const { toMd } = await renderAll('custom-section-kind');
    const text = toMd.content[0].text;
    expect(toMd.isError).toBeFalsy();
    expect(text).toContain('## Migration note');
    expect(text).not.toContain('## acme.migration-note');
  });
});

describe('golden 0.20.0 — a fully novel custom entry kind with no dedicated renderer', () => {
  it('renders correctly across all three tools with zero special-casing for this kind', async () => {
    const { toMd, getE, getAC } = await renderAll('novel-custom-kind');
    for (const result of [toMd, getE, getAC]) {
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Overview');
      expect(result.content[0].text).toContain('Generic content rendered with no special-casing for this kind.');
    }
  });
});

describe('golden 0.20.0 — visual showcase (not a code ref)', () => {
  it('renders a showcase image with its alt text, distinct from a code-ref example', async () => {
    const { toMd } = await renderAll('showcase-example');
    const text = toMd.content[0].text;
    expect(toMd.isError).toBeFalsy();
    expect(text).toContain('**Showcase** (image): https://cdn.example.com/screenshots/empty-state.png');
    expect(text).toContain('Alt: An empty list with a call-to-action button.');
  });
});

describe('golden 0.20.0 — edge cases (reused from the conformance suite)', () => {
  it('an entry with no sections at all renders without crashing (empty-sections.dsds.yaml)', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/empty-sections.dsds.yaml`]);
    const result = await toMarkdownHandler({ identifier: 'example-empty' }, () => systems, {});
    expect(result.isError).toBeFalsy();
  });

  it('an entry with only $extensions and no sections/traits/sourceFiles renders the extensions, not nothing (extensions-only.dsds.yaml)', async () => {
    const { systems } = await loadSystems([`${fixturesDir}/extensions-only.dsds.yaml`]);
    const result = await toMarkdownHandler({ identifier: 'example-extensions-only' }, () => systems, {});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Figma component: `Example/Default`');
    expect(result.content[0].text).toContain('Node id: `1:1`');
  });
});
