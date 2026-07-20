import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import '../src/components/file-list.js';
import { tick, typeInto, submit } from './setup.js';

function mount(configure) {
  const node = document.createElement('file-list');
  document.body.append(node);
  if (configure) configure(node);
  return node;
}

const DOCS = [
  { name: 'alpha.dsds.json', relPath: 'alpha.dsds.json', path: '/p/alpha.dsds.json', size: 10, modified: 1 },
  { name: 'beta.dsds.json', relPath: 'beta.dsds.json', path: '/p/beta.dsds.json', size: 20, modified: 2 },
];

const NESTED_DOCS = [
  { name: 'root.dsds.json', relPath: 'root.dsds.json', path: '/p/root.dsds.json', size: 1, modified: 1 },
  { name: 'button.dsds.json', relPath: 'components/button.dsds.json', path: '/p/components/button.dsds.json', size: 1, modified: 1 },
  { name: 'link.dsds.json', relPath: 'components/link.dsds.json', path: '/p/components/link.dsds.json', size: 1, modified: 1 },
];

test('shows an empty note when no project is open', () => {
  const node = mount();
  assert.match(node.querySelector('.empty-note').textContent, /Open a folder/);
  node.remove();
});

test('renders a row per document', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = DOCS;
  });
  const names = [...node.querySelectorAll('.doc-name')].map((b) => b.textContent);
  assert.deepEqual(names, ['alpha.dsds.json', 'beta.dsds.json']);
  node.remove();
});

test('marks the selected document', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = DOCS;
    n.selected = 'beta.dsds.json';
  });
  const selected = node.querySelector('.doc-row.selected .doc-name');
  assert.equal(selected.textContent, 'beta.dsds.json');
  node.remove();
});

test('renders a folder hierarchy from nested relPaths', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = NESTED_DOCS;
  });
  const folders = [...node.querySelectorAll('.folder-name')].map((b) =>
    b.textContent.replace(/^[▸▾]\s*/, '')
  );
  assert.deepEqual(folders, ['components']);
  // The two component docs render nested under the folder.
  const nested = node.querySelector('.folder-row .doc-list.nested');
  const nestedNames = [...nested.querySelectorAll('.doc-name')].map((b) => b.textContent);
  assert.deepEqual(nestedNames, ['button.dsds.json', 'link.dsds.json']);
  node.remove();
});

test('collapsing a folder hides its documents', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = NESTED_DOCS;
  });
  node.querySelector('.folder-name').click(); // collapse
  assert.equal(node.querySelector('.folder-row .doc-list.nested'), null);
  node.querySelector('.folder-name').click(); // expand again
  assert.ok(node.querySelector('.folder-row .doc-list.nested'));
  node.remove();
});

test('selecting a nested document emits its full relPath', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = NESTED_DOCS;
  });
  let detail = null;
  node.addEventListener('select-doc', (e) => (detail = e.detail));
  const nested = node.querySelector('.folder-row .doc-list.nested .doc-name');
  nested.click();
  assert.deepEqual(detail, { path: 'components/button.dsds.json' });
  node.remove();
});

test('emits open-project when Open Folder is clicked', () => {
  const node = mount();
  let fired = false;
  node.addEventListener('open-project', () => (fired = true));
  node.querySelector('.open-project').click();
  assert.ok(fired);
  node.remove();
});

test('emits select-doc with the clicked name', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = DOCS;
  });
  let detail = null;
  node.addEventListener('select-doc', (e) => (detail = e.detail));
  node.querySelectorAll('.doc-name')[1].click();
  assert.deepEqual(detail, { path: 'beta.dsds.json' });
  node.remove();
});

test('emits delete-doc with the row name', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = DOCS;
  });
  let detail = null;
  node.addEventListener('delete-doc', (e) => (detail = e.detail));
  node.querySelector('.doc-row .delete').click();
  assert.deepEqual(detail, { path: 'alpha.dsds.json' });
  node.remove();
});

test('create form emits create-doc for a valid identifier', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = [];
  });
  node.querySelector('.new-doc').click(); // open create form
  const kind = node.querySelector('.new-kind');
  const id = node.querySelector('.new-identifier');
  kind.value = 'token';
  typeInto(id, 'color-primary');
  let detail = null;
  node.addEventListener('create-doc', (e) => (detail = e.detail));
  submit(node.querySelector('.create-form'));
  assert.deepEqual(detail, { kind: 'token', identifier: 'color-primary' });
  node.remove();
});

test('create form rejects an invalid identifier', () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = [];
  });
  node.querySelector('.new-doc').click();
  typeInto(node.querySelector('.new-identifier'), 'Not Valid');
  let fired = false;
  node.addEventListener('create-doc', () => (fired = true));
  submit(node.querySelector('.create-form'));
  assert.ok(!fired);
  assert.ok(!node.querySelector('.form-error').hidden);
  node.remove();
});

test('rename flow emits rename-doc with suffixed filename', async () => {
  const node = mount((n) => {
    n.projectName = 'proj';
    n.docs = DOCS;
  });
  node.querySelector('.doc-row .rename').click();
  await tick();
  const input = node.querySelector('.rename-input');
  assert.equal(input.value, 'alpha'); // stem without suffix
  typeInto(input, 'renamed');
  let detail = null;
  node.addEventListener('rename-doc', (e) => (detail = e.detail));
  submit(node.querySelector('.rename-form'));
  assert.deepEqual(detail, { from: 'alpha.dsds.json', to: 'renamed.dsds.json' });
  node.remove();
});
