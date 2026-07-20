// Thin wrapper over the Tauri runtime. Uses the global `window.__TAURI__`
// object (enabled via `app.withGlobalTauri` in tauri.conf.json) so the
// frontend needs no bundler. Every method mirrors a Rust command in
// src-tauri/src/lib.rs, except `openProjectDir`, which uses the dialog plugin.

function tauri() {
  const t = globalThis.window && window.__TAURI__;
  if (!t) {
    throw new Error(
      'Tauri runtime unavailable — run this app with `npm run dev`.'
    );
  }
  return t;
}

/** Open the native folder picker; returns the chosen path or null if cancelled. */
export async function openProjectDir() {
  const selected = await tauri().dialog.open({
    directory: true,
    multiple: false,
    title: 'Open DSDS project folder',
  });
  return typeof selected === 'string' ? selected : null;
}

export function listDocs(dir) {
  return tauri().core.invoke('list_docs', { dir });
}

export function readDoc(dir, name) {
  return tauri().core.invoke('read_doc', { dir, name });
}

export function writeDoc(dir, name, contents) {
  return tauri().core.invoke('write_doc', { dir, name, contents });
}

export function createDoc(dir, name, contents) {
  return tauri().core.invoke('create_doc', { dir, name, contents });
}

export function renameDoc(dir, from, to) {
  return tauri().core.invoke('rename_doc', { dir, from, to });
}

export function deleteDoc(dir, name) {
  return tauri().core.invoke('delete_doc', { dir, name });
}

export default {
  openProjectDir,
  listDocs,
  readDoc,
  writeDoc,
  createDoc,
  renameDoc,
  deleteDoc,
};
