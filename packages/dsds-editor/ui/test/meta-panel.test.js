import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import '../src/components/meta-panel.js';
import { deriveMeta } from '../src/model.js';

function mount() {
  const node = document.createElement('meta-panel');
  document.body.append(node);
  return node;
}

function value(node, term) {
  const dts = [...node.querySelectorAll('dt')];
  const dt = dts.find((d) => d.textContent === term);
  return dt?.nextElementSibling?.textContent;
}

test('shows empty note without a document', () => {
  const node = mount();
  assert.match(node.querySelector('.empty-note').textContent, /No document/);
  node.remove();
});

test('renders file and entity facts', () => {
  const node = mount();
  const doc = {
    entity: {
      kind: 'component',
      identifier: 'button',
      metadata: { status: 'stable', tags: ['a', 'b'], since: '1.0.0' },
      documentBlocks: [{ kind: 'guidelines' }],
    },
  };
  const entry = { name: 'button.dsds.json', path: '/p/button.dsds.json', size: 2048, modified: 1_700_000_000_000 };
  node.meta = deriveMeta(entry, doc);
  assert.equal(value(node, 'Filename'), 'button.dsds.json');
  assert.equal(value(node, 'Size'), '2.0 KB');
  assert.equal(value(node, 'Kind'), 'component');
  assert.equal(value(node, 'Identifier'), 'button');
  assert.equal(value(node, 'Status'), 'stable');
  assert.equal(value(node, 'Tags'), 'a, b');
  assert.equal(value(node, 'Document blocks'), '1');
  node.remove();
});

test('save state indicator reflects saving/saved', () => {
  const node = mount();
  node.meta = deriveMeta({ name: 'x.dsds.json' }, { entity: { kind: 'component', identifier: 'x' } });
  node.saveState = 'saving';
  assert.match(node.querySelector('.save-state').textContent, /Saving/);
  node.saveState = 'saved';
  assert.match(node.querySelector('.save-state').textContent, /saved/);
  node.remove();
});

test('missing metadata falls back to em dashes', () => {
  const node = mount();
  node.meta = deriveMeta({ name: 'x.dsds.json' }, { entity: { kind: 'component', identifier: 'x' } });
  assert.equal(value(node, 'Status'), '—');
  assert.equal(value(node, 'Tags'), '—');
  node.remove();
});
