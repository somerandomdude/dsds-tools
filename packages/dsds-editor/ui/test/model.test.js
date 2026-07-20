import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/model.js';

test('newDocument builds a valid single-entity document', () => {
  const doc = m.newDocument('component', 'button', 'Button');
  assert.equal(doc.dsdsVersion, m.DSDS_VERSION);
  assert.equal(doc.$schema, m.SCHEMA_REF);
  assert.equal(doc.entity.kind, 'component');
  assert.equal(doc.entity.identifier, 'button');
  assert.equal(doc.entity.name, 'Button');
  assert.equal(doc.entity.metadata.status, 'draft');
  assert.deepEqual(doc.entity.documentBlocks, []);
});

test('newDocument defaults name to identifier', () => {
  const doc = m.newDocument('token', 'color-text-primary');
  assert.equal(doc.entity.name, 'color-text-primary');
});

test('isValidIdentifier enforces kebab-case starting with a letter', () => {
  assert.ok(m.isValidIdentifier('button'));
  assert.ok(m.isValidIdentifier('color-text-primary'));
  assert.ok(!m.isValidIdentifier('Button'));
  assert.ok(!m.isValidIdentifier('1button'));
  assert.ok(!m.isValidIdentifier('button_primary'));
  assert.ok(!m.isValidIdentifier(''));
  assert.ok(!m.isValidIdentifier('has space'));
});

test('filenameFor appends the DSDS suffix', () => {
  assert.equal(m.filenameFor('button'), 'button.dsds.json');
});

test('isValidDocName rejects traversal and bad suffixes', () => {
  assert.ok(m.isValidDocName('button.dsds.json'));
  assert.ok(!m.isValidDocName('button.json'));
  assert.ok(!m.isValidDocName('.dsds.json'));
  assert.ok(!m.isValidDocName('../x.dsds.json'));
  assert.ok(!m.isValidDocName('a/b.dsds.json'));
});

test('blockKindsFor merges scoped and general kinds', () => {
  const componentKinds = m.blockKindsFor('component');
  assert.ok(componentKinds.includes('anatomy'));
  assert.ok(componentKinds.includes('api'));
  assert.ok(componentKinds.includes('guidelines'));
  // tokens only get general kinds
  const tokenKinds = m.blockKindsFor('token');
  assert.deepEqual(tokenKinds, m.GENERAL_BLOCK_KINDS);
});

test('newBlock seeds collection blocks with one item', () => {
  const block = m.newBlock('guidelines');
  assert.equal(block.kind, 'guidelines');
  assert.equal(block.items.length, 1);
  assert.equal(block.items[0].level, 'must'); // first select option
  assert.equal(block.items[0].guidance, '');
});

test('newBlock leaves specialty blocks as bare discriminator', () => {
  const block = m.newBlock('anatomy');
  assert.deepEqual(block, { kind: 'anatomy' });
});

test('newBlockItem populates known keys with defaults', () => {
  const item = m.newBlockItem('use-cases');
  assert.deepEqual(item, { description: '', stance: 'recommended' });
});

test('parseDoc returns doc on valid JSON object', () => {
  const { doc, error } = m.parseDoc('{"a":1}');
  assert.equal(error, null);
  assert.deepEqual(doc, { a: 1 });
});

test('parseDoc reports errors for invalid JSON', () => {
  const { doc, error } = m.parseDoc('{ not json');
  assert.equal(doc, null);
  assert.ok(error);
});

test('parseDoc rejects non-object roots', () => {
  assert.ok(m.parseDoc('[1,2,3]').error);
  assert.ok(m.parseDoc('42').error);
  assert.ok(m.parseDoc('null').error);
});

test('serializeDoc pretty-prints with trailing newline', () => {
  const text = m.serializeDoc({ a: 1 });
  assert.ok(text.endsWith('\n'));
  assert.ok(text.includes('\n  "a": 1'));
});

test('getPrimaryEntity reads single-entity documents', () => {
  const doc = m.newDocument('component', 'button');
  assert.equal(m.getPrimaryEntity(doc), doc.entity);
});

test('getPrimaryEntity reads grouped documents', () => {
  const entity = { kind: 'component', identifier: 'button' };
  const doc = { entityGroups: [{ name: 'G', entities: [entity] }] };
  assert.equal(m.getPrimaryEntity(doc), entity);
});

test('getPrimaryEntity returns null when absent', () => {
  assert.equal(m.getPrimaryEntity({}), null);
  assert.equal(m.getPrimaryEntity(null), null);
});

test('setPrimaryEntity replaces entity immutably (single)', () => {
  const doc = m.newDocument('component', 'button');
  const updated = { ...doc.entity, name: 'Changed' };
  const next = m.setPrimaryEntity(doc, updated);
  assert.notEqual(next, doc);
  assert.equal(next.entity.name, 'Changed');
  assert.equal(doc.entity.name, 'button'); // original untouched
});

test('setPrimaryEntity replaces entity in grouped doc', () => {
  const entity = { kind: 'component', identifier: 'button', name: 'Button' };
  const doc = { entityGroups: [{ name: 'G', entities: [entity] }] };
  const next = m.setPrimaryEntity(doc, { ...entity, name: 'New' });
  assert.equal(next.entityGroups[0].entities[0].name, 'New');
  assert.equal(doc.entityGroups[0].entities[0].name, 'Button');
});

test('deriveMeta tolerates missing metadata', () => {
  const doc = { entity: { kind: 'component', identifier: 'x' } };
  const entry = { name: 'x.dsds.json', path: '/p/x.dsds.json', size: 10, modified: 5 };
  const meta = m.deriveMeta(entry, doc);
  assert.equal(meta.filename, 'x.dsds.json');
  assert.equal(meta.kind, 'component');
  assert.equal(meta.status, '');
  assert.deepEqual(meta.tags, []);
  assert.equal(meta.blockCount, 0);
});

test('deriveMeta reads rich metadata and block counts', () => {
  const doc = {
    entity: {
      kind: 'component',
      identifier: 'button',
      metadata: {
        status: { overall: 'stable' },
        summary: 'A button',
        since: '1.0.0',
        lastUpdated: { date: '2026-05-28', note: 'x' },
        tags: ['a', 'b'],
      },
      documentBlocks: [{ kind: 'guidelines' }, { kind: 'api' }],
      agentDocumentBlocks: [{ kind: 'guidelines' }],
    },
  };
  const meta = m.deriveMeta({ name: 'button.dsds.json' }, doc);
  assert.equal(meta.status, 'stable');
  assert.equal(meta.summary, 'A button');
  assert.equal(meta.since, '1.0.0');
  assert.equal(meta.lastUpdated, '2026-05-28');
  assert.deepEqual(meta.tags, ['a', 'b']);
  assert.equal(meta.blockCount, 2);
  assert.equal(meta.agentBlockCount, 1);
});

test('normalizeStatus handles string and object forms', () => {
  assert.equal(m.normalizeStatus('stable'), 'stable');
  assert.equal(m.normalizeStatus({ overall: 'draft' }), 'draft');
  assert.equal(m.normalizeStatus({ status: 'experimental' }), 'experimental');
  assert.equal(m.normalizeStatus(undefined), '');
});

test('parseList splits and trims', () => {
  assert.deepEqual(m.parseList('a, b ,c'), ['a', 'b', 'c']);
  assert.deepEqual(m.parseList(''), []);
  assert.deepEqual(m.parseList(' , , '), []);
});

test('dirnameOfPath returns folder or empty at root', () => {
  assert.equal(m.dirnameOfPath('button.dsds.json'), '');
  assert.equal(m.dirnameOfPath('components/button.dsds.json'), 'components');
  assert.equal(m.dirnameOfPath('a/b/c.dsds.json'), 'a/b');
});

test('replaceStem keeps the folder and swaps the stem', () => {
  assert.equal(m.replaceStem('button.dsds.json', 'link'), 'link.dsds.json');
  assert.equal(
    m.replaceStem('components/button.dsds.json', 'link'),
    'components/link.dsds.json'
  );
});

test('buildTree groups flat docs at the root', () => {
  const docs = [
    { name: 'b.dsds.json', relPath: 'b.dsds.json' },
    { name: 'a.dsds.json', relPath: 'a.dsds.json' },
  ];
  const tree = m.buildTree(docs);
  assert.equal(tree.folders.length, 0);
  assert.deepEqual(tree.files.map((f) => f.name), ['a.dsds.json', 'b.dsds.json']);
});

test('buildTree nests by folder and sorts case-insensitively', () => {
  const docs = [
    { name: 'primary.dsds.json', relPath: 'tokens/color/primary.dsds.json' },
    { name: 'button.dsds.json', relPath: 'components/button.dsds.json' },
    { name: 'root.dsds.json', relPath: 'root.dsds.json' },
  ];
  const tree = m.buildTree(docs);
  assert.deepEqual(tree.folders.map((f) => f.name), ['components', 'tokens']);
  assert.deepEqual(tree.files.map((f) => f.name), ['root.dsds.json']);

  const components = tree.folders.find((f) => f.name === 'components');
  assert.equal(components.path, 'components');
  assert.deepEqual(components.files.map((f) => f.name), ['button.dsds.json']);

  const tokens = tree.folders.find((f) => f.name === 'tokens');
  assert.equal(tokens.folders[0].name, 'color');
  assert.equal(tokens.folders[0].path, 'tokens/color');
  assert.deepEqual(
    tokens.folders[0].files.map((f) => f.relPath),
    ['tokens/color/primary.dsds.json']
  );
});

test('buildTree tolerates empty input', () => {
  const tree = m.buildTree([]);
  assert.deepEqual(tree, { folders: [], files: [] });
});
