import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSystems } from '../src/loader.js';
import { createToolRuntime } from '../src/registry.js';
import { createGraphGetter } from '../src/graph.js';
import { sectionLabel, accessRecord } from '../src/logger.js';

// A `type: 'tool'` line records that a tool ran; it never recorded WHAT came
// back. These tests cover the `type: 'access'` line that does: which entry,
// and which of its sections the response actually carried.

const ENTITY_YAML = `
id: widget
kind: component
name: Widget
description: A widget.
traits:
  - id: tone
    traitType: variant
    kind: enum
    values: [default, critical]
sections:
  - kind: guidelines
    for: all
    title: When to use
    items:
      - statement: Use it for widgets.
        level: should
  - kind: guidelines
    for: agent
    items:
      - statement: Never nest widgets.
        level: must-not
  - kind: section
    for: human
    title: Design rationale
    body: Long prose for people.
  - kind: section
    for: human
    title: History
    body: More prose for people.
`;

let root;

function runtime(logsDir) {
  return loadSystems([join(root, 'index.dsds.yaml')]).then(({ systems }) => {
    const getSystems = () => systems;
    return createToolRuntime({
      getSystems,
      getSummaries: () => [],
      getGraph: createGraphGetter(getSystems),
      logsDir,
    });
  });
}

function readAccess(dir) {
  return readdirSync(dir).flatMap(f =>
    readFileSync(join(dir, f), 'utf-8').trim().split('\n').filter(Boolean)
      .map(JSON.parse).filter(e => e.type === 'access')
  );
}

// writeLog is fire-and-forget, so a test has to wait for the append rather
// than assume it landed. Polling beats a fixed sleep: a 50ms timer passed
// locally but raced under parallel test load.
async function settle(dir, min = 1, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    try { if (readAccess(dir).length >= min) return; } catch { /* dir not written yet */ }
    if (Date.now() - started > timeoutMs) return;
    await new Promise(r => setTimeout(r, 10));
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsds-access-'));
  mkdirSync(join(root, 'logs'), { recursive: true });
  writeFileSync(join(root, 'widget.dsds.yaml'), ENTITY_YAML);
  writeFileSync(join(root, 'index.dsds.yaml'), 'id: test-system\nkind: system\nname: Test\nrefs:\n  - href: ./widget.dsds.yaml\n    rel: file\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('sectionLabel', () => {
  it('uses the kind alone when there is no title and the audience is everyone', () => {
    expect(sectionLabel({ kind: 'guidelines', for: 'all' })).toBe('guidelines');
  });

  it('appends the title with #', () => {
    expect(sectionLabel({ kind: 'guidelines', title: 'When to use' })).toBe('guidelines#When to use');
  });

  it('appends a non-"all" audience with @, so an @agent in a label always means something', () => {
    expect(sectionLabel({ kind: 'guidelines', for: 'agent' })).toBe('guidelines@agent');
    expect(sectionLabel({ kind: 'section', title: 'Notes', for: 'human' })).toBe('section#Notes@human');
  });

  it('strips # and @ out of titles rather than escaping them', () => {
    expect(sectionLabel({ kind: 'section', title: 'A # B @ C' })).toBe('section#A B C');
  });

  it('passes a pre-made string label through', () => {
    expect(sectionLabel('code')).toBe('code');
  });
});

describe('accessRecord', () => {
  it('drops empty fields so log lines stay small', () => {
    expect(accessRecord({ identifier: 'widget' })).toEqual({ identifier: 'widget' });
  });

  it('omits `name` when it only repeats the identifier', () => {
    expect(accessRecord({ identifier: 'widget', name: 'widget' })).toEqual({ identifier: 'widget' });
  });

  it('records `requested` only when the caller\'s input differs from what resolved', () => {
    expect(accessRecord({ identifier: 'widget', requested: 'Widget' }).requested).toBeUndefined();
    expect(accessRecord({ identifier: 'widget', requested: 'widgets' }).requested).toBe('widgets');
  });

  it('counts sections alongside labelling them', () => {
    const r = accessRecord({ identifier: 'widget', sections: [{ kind: 'api' }, { kind: 'guidelines', for: 'agent' }] });
    expect(r.sections).toEqual(['api', 'guidelines@agent']);
    expect(r.sectionCount).toBe(2);
  });
});

describe('access logging through dispatch', () => {
  it('writes one access line naming the entry and the sections served', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: 'widget' });
    await settle(logsDir);

    const [entry] = readAccess(logsDir);
    expect(entry.tool).toBe('dsds_get_agent_context');
    expect(entry.identifier).toBe('widget');
    expect(entry.name).toBe('Widget');
    expect(entry.entityKind).toBe('component');
    expect(entry.chars).toBeGreaterThan(0);
  });

  it('records the sections the response carried, not the ones the entry declares', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: 'widget' });
    await settle(logsDir);

    // The entry has four sections; two are `for: human` and a compact call
    // withholds them. The log has to show the two that were served.
    const [entry] = readAccess(logsDir);
    expect(entry.sections).toEqual(['guidelines#When to use', 'guidelines@agent']);
    expect(entry.omitted).toBe(2);
    expect(entry.mode).toBe('compact');
  });

  it('records all four sections for a verbose call', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: 'widget', verbose: true });
    await settle(logsDir);

    const [entry] = readAccess(logsDir);
    expect(entry.sectionCount).toBe(4);
    expect(entry.sections).toContain('section#Design rationale@human');
    expect(entry.mode).toBe('verbose');
    expect(entry.omitted).toBeUndefined();
  });

  it('names the single block for dsds_get_document_block', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_document_block', { identifier: 'widget', blockType: 'traits' });
    await settle(logsDir);

    const [entry] = readAccess(logsDir);
    expect(entry.tool).toBe('dsds_get_document_block');
    expect(entry.sections).toEqual(['traits']);
  });

  it('records generated views as `parts`, separate from declared sections', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: 'widget' });
    await settle(logsDir);

    expect(readAccess(logsDir)[0].parts).toContain('traits');
  });

  it('never leaks the access descriptor into the tool result', async () => {
    const { dispatch } = await runtime(join(root, 'logs'));
    const result = await dispatch('dsds_get_agent_context', { identifier: 'widget' });
    expect(result.access).toBeUndefined();
    expect(Object.keys(result)).toEqual(['content']);
  });

  it('writes nothing when logging is off, and still returns a clean result', async () => {
    const { dispatch } = await runtime(null);
    const result = await dispatch('dsds_get_agent_context', { identifier: 'widget' });
    expect(result.access).toBeUndefined();
    expect(result.content[0].text).toContain('Widget');
    expect(readdirSync(join(root, 'logs'))).toEqual([]);
  });

  it('logs no access line for a miss — nothing was served', async () => {
    const logsDir = join(root, 'logs');
    const { dispatch } = await runtime(logsDir);
    await dispatch('dsds_get_agent_context', { identifier: 'nonexistent' });
    // Nothing should appear; give a real write the chance to show up first.
    await settle(logsDir, 1, 200);
    expect(readAccess(logsDir)).toEqual([]);
  });
});
