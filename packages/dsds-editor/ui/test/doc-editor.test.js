import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import '../src/components/doc-editor.js';
import { typeInto, changeTo } from './setup.js';
import { newDocument } from '../src/model.js';

function mount() {
  const node = document.createElement('doc-editor');
  document.body.append(node);
  return node;
}

function field(node, label) {
  const labels = [...node.querySelectorAll('.field')];
  const match = labels.find(
    (l) => l.querySelector('.field-label')?.textContent === label
  );
  return match?.querySelector('input, textarea, select');
}

test('shows placeholder when no document is loaded', () => {
  const node = mount();
  assert.match(node.querySelector('.empty-note').textContent, /Select a document/);
  node.remove();
});

test('renders core fields for a loaded entity', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button', 'Button'), error: null, rawText: '' });
  assert.equal(field(node, 'Kind').value, 'component');
  assert.equal(field(node, 'Identifier').value, 'button');
  assert.equal(field(node, 'Name').value, 'Button');
  node.remove();
});

test('editing name emits change-entity with the new value', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button', 'Button'), error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  typeInto(field(node, 'Name'), 'Primary Button');
  assert.equal(entity.name, 'Primary Button');
  node.remove();
});

test('invalid identifier gets the invalid class but still emits', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button'), error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  const id = field(node, 'Identifier');
  typeInto(id, 'Bad Id');
  assert.ok(id.classList.contains('invalid'));
  assert.equal(entity.identifier, 'Bad Id');
  node.remove();
});

test('editing tags stores an array; clearing removes the key', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button'), error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  typeInto(field(node, 'Tags'), 'action, form');
  assert.deepEqual(entity.metadata.tags, ['action', 'form']);
  typeInto(field(node, 'Tags'), '');
  assert.ok(!('tags' in entity.metadata));
  node.remove();
});

test('changing status select updates metadata', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button'), error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  const status = field(node, 'Status');
  changeTo(status, 'stable');
  assert.equal(entity.metadata.status, 'stable');
  node.remove();
});

test('adding a block renders it and emits', () => {
  const node = mount();
  node.setDocument({ doc: newDocument('component', 'button'), error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  const addSelect = node.querySelector('.add-block-kind');
  addSelect.value = 'guidelines';
  node.querySelector('.add-block-btn').click();
  assert.equal(entity.documentBlocks.length, 1);
  assert.equal(entity.documentBlocks[0].kind, 'guidelines');
  assert.ok(node.querySelector('.block'));
  node.remove();
});

test('editing a collection item field emits updated item', () => {
  const node = mount();
  const doc = newDocument('component', 'button');
  doc.entity.documentBlocks = [
    { kind: 'guidelines', items: [{ guidance: '', level: 'must', rationale: '', category: '' }] },
  ];
  node.setDocument({ doc, error: null, rawText: '' });
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  const guidance = node.querySelector('.block .item textarea');
  typeInto(guidance, 'Limit one primary button');
  assert.equal(entity.documentBlocks[0].items[0].guidance, 'Limit one primary button');
  node.remove();
});

test('specialty block falls back to raw JSON editing', () => {
  const node = mount();
  const doc = newDocument('component', 'button');
  doc.entity.documentBlocks = [{ kind: 'anatomy', parts: [] }];
  node.setDocument({ doc, error: null, rawText: '' });
  const raw = node.querySelector('.raw-block');
  assert.ok(raw);
  let entity = null;
  node.addEventListener('change-entity', (e) => (entity = e.detail.entity));
  typeInto(raw, '{"parts":[{"identifier":"x"}]}');
  assert.equal(entity.documentBlocks[0].kind, 'anatomy');
  assert.deepEqual(entity.documentBlocks[0].parts, [{ identifier: 'x' }]);
  node.remove();
});

test('invalid JSON document renders the raw editor and emits change-raw', () => {
  const node = mount();
  node.setDocument({ doc: null, error: 'Unexpected token', rawText: '{ bad' });
  const raw = node.querySelector('.raw-editor');
  assert.ok(raw);
  assert.equal(raw.value, '{ bad');
  let text = null;
  node.addEventListener('change-raw', (e) => (text = e.detail.text));
  typeInto(raw, '{ still editing');
  assert.equal(text, '{ still editing');
  node.remove();
});
