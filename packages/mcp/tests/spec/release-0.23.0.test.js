// What 0.23.0 changed for an author, and what this server does about it.
//
// An additive release. The parts a consumer acts on:
//   - a Markdown prose field can mention something in the project with a
//     `dsds:` link (`<dsds:button>`, `[text](dsds:shared-a11y#focus-visible)`).
//     The vendored validator checks the target with DSDS-05 and DSDS-08;
//     this server rewrites each link for an agent as its text plus the target
//     in backticks, and a one-line summary shows only the text;
//   - an inline link isn't a relationship, so it never reaches the graph;
//   - every `description` is Markdown now.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BUNDLED_VERSION } from '../../src/spec/version.js';
import { validateDoc20 } from '../../src/spec/validator.js';
import { loadSystems, summarizeEntities } from '../../src/loader.js';
import { buildGraph, dependents } from '../../src/graph.js';
import { formatInlineLinks, canReadInlineLinks } from '../../src/inline-links.js';
import { getEntityHandler } from '../../src/tools/get-entity.js';
import { getAgentContextHandler } from '../../src/tools/get-agent-context.js';

const DOC = `schemaVersion: "0.23.0"
name: X
entries:
  - kind: component
    id: button
    name: Button
    description: Triggers an action. Use <dsds:link> for navigation.
    sections:
      - kind: guidelines
        for: all
        items:
          - level: must
            statement: >-
              Keep [the focus ring](dsds:shared-a11y#focus-visible) visible, and set
              <dsds:button#variant> to <dsds:button#variant.primary> once per screen.
    traits:
      - traitType: variant
        kind: enum
        id: variant
        name: Variant
        description: How much it stands out.
        values:
          - id: primary
            name: Primary
            description: "The main action, never a link in code: \`<dsds:link>\`."
  - kind: component
    id: link
    name: Link
    description: Goes somewhere.
shared:
  - id: shared-a11y
    name: Shared accessibility rules
    description: Rules many components follow.
    sections:
      - kind: guidelines
        for: all
        items:
          - id: focus-visible
            level: must
            statement: Keep the focus ring visible.
`;

let root;
const load = async (yaml = DOC) => {
  root = mkdtempSync(join(tmpdir(), 'dsds-023-'));
  const file = join(root, 'index.dsds.yaml');
  writeFileSync(file, yaml);
  const { systems } = await loadSystems([file]);
  const summaries = summarizeEntities(systems);
  return { systems, summaries };
};
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

describe('the bundled version', () => {
  it('is 0.23.0', () => {
    expect(BUNDLED_VERSION).toBe('0.23.0');
  });

  it('can read inline links: the optional parser is installed', () => {
    expect(canReadInlineLinks()).toBe(true);
  });
});

describe('validation', () => {
  it('reports a broken inline link with its rule and offset', () => {
    const result = validateDoc20({
      schemaVersion: '0.23.0',
      name: 'X',
      entries: [{ kind: 'entry', id: 'a', name: 'A', description: 'See <dsds:missing>.' }],
    });
    expect(result.errors.join('\n')).toContain('[DSDS-08]');
    const finding = result.findings.find((f) => f.rule === 'DSDS-08');
    expect(finding).toMatchObject({ pointer: '/entries/0/description', offset: 4 });
  });

  it('accepts a document whose inline links all resolve', () => {
    expect(validateDoc20({
      schemaVersion: '0.23.0',
      name: 'X',
      entries: [
        { kind: 'entry', id: 'a', name: 'A', description: 'See <dsds:b> and [b](dsds:b).' },
        { kind: 'entry', id: 'b', name: 'B', description: 'B.' },
      ],
    }).errors).toEqual([]);
  });
});

describe('inline links, rewritten for an agent', () => {
  it('shows an autolink as the target\'s name, then the target', async () => {
    await load();
    expect(formatInlineLinks('Use <dsds:link>.')).toBe('Use Link (`link`).');
    expect(formatInlineLinks('<dsds:button#variant.primary>')).toBe('Primary (`button#variant.primary`)');
  });

  it('keeps the author\'s text for `[text](dsds:…)`', async () => {
    await load();
    expect(formatInlineLinks('[the focus ring](dsds:shared-a11y#focus-visible)'))
      .toBe('the focus ring (`shared-a11y#focus-visible`)');
  });

  it('shows the target alone when there is no name to show', async () => {
    await load();
    expect(formatInlineLinks('<dsds:nowhere>')).toBe('`nowhere`');
  });

  it('reads reference-style links, and drops their definition line', async () => {
    await load();
    expect(formatInlineLinks('See [the link][l].\n\n[l]: dsds:link')).toBe('See the link (`link`).');
  });

  it('leaves a link inside a code span alone, and reads any case of the scheme', async () => {
    await load();
    expect(formatInlineLinks('`<dsds:link>` or <DSDS:link>')).toBe('`<dsds:link>` or Link (`link`)');
  });

  it('shows only the text in a one-line summary', async () => {
    const { summaries } = await load();
    expect(summaries.find((s) => s.identifier === 'button').summary)
      .toBe('Triggers an action. Use Link for navigation.');
  });

  it('rewrites prose in dsds_get_entity and dsds_get_agent_context', async () => {
    const { systems, summaries } = await load();
    const graph = buildGraph(systems.flatMap((s) => s.entities));
    const entity = await getEntityHandler({ identifier: 'button' }, () => systems, () => summaries, null, () => graph);
    const context = await getAgentContextHandler({ identifier: ['button'], verbose: true }, () => systems, () => graph);
    for (const result of [entity, context]) {
      const text = result.content.map((c) => c.text).join('\n');
      expect(text).toContain('Link (`link`)');
      expect(text).not.toMatch(/\]\(dsds:|<dsds:/i);
    }
  });
});

describe('the graph', () => {
  it('doesn\'t count an inline link as a relationship', async () => {
    const { systems } = await load();
    const graph = buildGraph(systems.flatMap((s) => s.entities));
    expect(dependents(graph, 'link')).toEqual([]);
  });
});

describe('without the parser', () => {
  // The parser is an optional dependency. Simulate it missing in a child
  // process, where module resolution for it fails, and check that prose comes
  // through unchanged and validation says it skipped the links.
  it('passes prose through unchanged, and validation warns', () => {
    const script = `
      const Module = require('node:module');
      const resolve = Module._resolveFilename;
      Module._resolveFilename = function (request, ...rest) {
        if (request === 'mdast-util-from-markdown') throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' });
        return resolve.call(this, request, ...rest);
      };
      import(${JSON.stringify(new URL('../../src/inline-links.js', import.meta.url).href)}).then(async (links) => {
        const { validateDoc20 } = await import(${JSON.stringify(new URL('../../src/spec/validator.js', import.meta.url).href)});
        const doc = { schemaVersion: '0.23.0', name: 'X', entries: [{ kind: 'entry', id: 'a', name: 'A', description: 'See <dsds:a>.' }] };
        console.log(JSON.stringify({
          canRead: links.canReadInlineLinks(),
          text: links.formatInlineLinks('See <dsds:a>.'),
          warnings: validateDoc20(doc).warnings,
        }));
      });
    `;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf-8' }));
    expect(out.canRead).toBe(false);
    expect(out.text).toBe('See <dsds:a>.');
    expect(out.warnings.join('\n')).toContain("inline links weren't checked");
  });
});
