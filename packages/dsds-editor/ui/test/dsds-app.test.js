import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import '../src/components/dsds-app.js';
import { parseDoc, getPrimaryEntity } from '../src/model.js';

// An in-memory stand-in for the Tauri filesystem API.
function fakeApi(seed = {}) {
  const files = new Map(Object.entries(seed));
  const entry = (name) => ({
    name: name.split('/').pop(),
    relPath: name,
    path: `/proj/${name}`,
    size: files.get(name).length,
    modified: 1,
  });
  return {
    files,
    openProjectDir: async () => '/proj',
    listDocs: async () => [...files.keys()].sort().map(entry),
    readDoc: async (_d, name) => {
      if (!files.has(name)) throw new Error('not found');
      return files.get(name);
    },
    writeDoc: async (_d, name, contents) => {
      files.set(name, contents);
      return entry(name);
    },
    createDoc: async (_d, name, contents) => {
      if (files.has(name)) throw new Error('exists');
      files.set(name, contents);
      return entry(name);
    },
    renameDoc: async (_d, from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
      return entry(to);
    },
    deleteDoc: async (_d, name) => {
      files.delete(name);
    },
  };
}

function mount(api) {
  const app = document.createElement('dsds-app');
  app.api = api;
  document.body.append(app);
  return app;
}

test('opening a project loads its documents', async () => {
  const app = mount(fakeApi({ 'a.dsds.json': '{}', 'b.dsds.json': '{}' }));
  await app._openProject();
  const state = app.store.getState();
  assert.equal(state.projectDir, '/proj');
  assert.equal(state.projectName, 'proj');
  assert.equal(state.docs.length, 2);
  assert.equal(app.querySelectorAll('.doc-name').length, 2);
  app.remove();
});

test('creating a document writes the file and selects it', async () => {
  const api = fakeApi();
  const app = mount(api);
  await app._openProject();
  await app._createDoc({ kind: 'component', identifier: 'button' });
  assert.ok(api.files.has('button.dsds.json'));
  const state = app.store.getState();
  assert.equal(state.selectedPath, 'button.dsds.json');
  assert.equal(getPrimaryEntity(state.doc).identifier, 'button');
  app.remove();
});

test('selecting a document reads and parses it', async () => {
  const doc = JSON.stringify({ entity: { kind: 'component', identifier: 'x', name: 'X' } });
  const app = mount(fakeApi({ 'x.dsds.json': doc }));
  await app._openProject();
  await app._selectDoc('x.dsds.json');
  assert.equal(getPrimaryEntity(app.store.getState().doc).name, 'X');
  app.remove();
});

test('an entity change is serialized and flushed to disk', async () => {
  const api = fakeApi();
  const app = mount(api);
  await app._openProject();
  await app._createDoc({ kind: 'component', identifier: 'button' });

  const entity = { ...getPrimaryEntity(app.store.getState().doc), name: 'Renamed' };
  app._onEntityChange(entity);
  // rawText updates synchronously; force the debounced write.
  assert.match(app.store.getState().rawText, /"name": "Renamed"/);
  await app._flushSave();

  const saved = parseDoc(api.files.get('button.dsds.json')).doc;
  assert.equal(getPrimaryEntity(saved).name, 'Renamed');
  assert.equal(app.store.getState().saveState, 'saved');
  app.remove();
});

test('renaming a document updates disk and selection', async () => {
  const api = fakeApi({ 'old.dsds.json': '{"entity":{"kind":"component","identifier":"old"}}' });
  const app = mount(api);
  await app._openProject();
  await app._selectDoc('old.dsds.json');
  await app._renameDoc({ from: 'old.dsds.json', to: 'new.dsds.json' });
  assert.ok(api.files.has('new.dsds.json'));
  assert.ok(!api.files.has('old.dsds.json'));
  assert.equal(app.store.getState().selectedPath, 'new.dsds.json');
  app.remove();
});

test('deleting the selected document clears the editor', async () => {
  const api = fakeApi({ 'gone.dsds.json': '{"entity":{"kind":"component","identifier":"gone"}}' });
  const app = mount(api);
  await app._openProject();
  await app._selectDoc('gone.dsds.json');
  await app._deleteDoc('gone.dsds.json');
  assert.ok(!api.files.has('gone.dsds.json'));
  assert.equal(app.store.getState().selectedPath, null);
  assert.equal(app.querySelector('doc-editor .empty-note') !== null, true);
  app.remove();
});

test('invalid raw JSON sets a parse error without throwing', async () => {
  const api = fakeApi({ 'x.dsds.json': '{"entity":{"kind":"component","identifier":"x"}}' });
  const app = mount(api);
  await app._openProject();
  await app._selectDoc('x.dsds.json');
  app._onRawChange('{ not valid json');
  const state = app.store.getState();
  assert.ok(state.parseError);
  assert.equal(state.rawText, '{ not valid json');
  await app._flushSave();
  assert.equal(api.files.get('x.dsds.json'), '{ not valid json');
  app.remove();
});

function nameInput(app) {
  const field = [...app.querySelectorAll('doc-editor .field')].find(
    (f) => f.querySelector('.field-label')?.textContent === 'Name'
  );
  return field.querySelector('input');
}

test('typing in a field preserves focus and does not reload the editor', async () => {
  const doc = JSON.stringify({ entity: { kind: 'component', identifier: 'button', name: '' } });
  const app = mount(fakeApi({ 'button.dsds.json': doc }));
  await app._openProject();
  await app._selectDoc('button.dsds.json');

  const input = nameInput(app);
  input.focus();
  assert.equal(document.activeElement, input);

  // Simulate two keystrokes.
  input.value = 'B';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.value = 'Bu';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  // The very same input element must still be mounted and focused.
  assert.equal(nameInput(app), input, 'editor was re-rendered (input replaced)');
  assert.equal(document.activeElement, input, 'focus was lost');
  assert.equal(getPrimaryEntity(app.store.getState().doc).name, 'Bu');
  app.remove();
});

test('nested documents load and select by relative path', async () => {
  const doc = JSON.stringify({ entity: { kind: 'component', identifier: 'button', name: 'Button' } });
  const app = mount(fakeApi({ 'components/button.dsds.json': doc, 'root.dsds.json': '{}' }));
  await app._openProject();
  // Folder hierarchy is rendered in the file panel.
  assert.ok(app.querySelector('.folder-name'));
  await app._selectDoc('components/button.dsds.json');
  const state = app.store.getState();
  assert.equal(state.selectedPath, 'components/button.dsds.json');
  assert.equal(state.entry.relPath, 'components/button.dsds.json');
  assert.equal(getPrimaryEntity(state.doc).name, 'Button');
  app.remove();
});

test('open-project event wiring triggers a load', async () => {
  const app = mount(fakeApi({ 'a.dsds.json': '{}' }));
  app.dispatchEvent(new window.CustomEvent('open-project'));
  // allow the async handler to settle
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(app.store.getState().projectName, 'proj');
  app.remove();
});
