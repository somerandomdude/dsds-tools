// App shell: owns the store, renders the three-column layout, and wires the
// child components' intent events to filesystem operations via the API. All
// state lives in the store; the columns are pure views fed through properties.

import { el } from '../dom.js';
import { createStore } from '../store.js';
import { debounce, basename } from '../util.js';
import defaultApi from '../api.js';
import {
  newDocument,
  filenameFor,
  parseDoc,
  serializeDoc,
  setPrimaryEntity,
  deriveMeta,
} from '../model.js';

import './file-list.js';
import './doc-editor.js';
import './meta-panel.js';

const INITIAL_STATE = {
  projectDir: null,
  projectName: null,
  docs: [],
  selectedPath: null, // relPath of the selected file
  entry: null, // DocEntry of the selected file
  doc: null, // parsed document object
  rawText: '', // raw file text (source of truth for saves)
  parseError: null,
  saveState: 'idle',
};

export class DsdsApp extends HTMLElement {
  constructor() {
    super();
    this.api = defaultApi;
    this.store = createStore(INITIAL_STATE);
    this._saveDebounced = debounce(() => this._flushSave(), 400);
  }

  connectedCallback() {
    this._buildLayout();
    this.store.subscribe((state) => this._sync(state));
    this._wireEvents();
    this._sync(this.store.getState());
  }

  _buildLayout() {
    this._fileList = el('file-list', { class: 'column column-start' });
    this._docEditor = el('doc-editor', { class: 'column column-middle' });
    this._metaPanel = el('meta-panel', { class: 'column column-end' });
    this.append(this._fileList, this._docEditor, this._metaPanel);
  }

  _sync(state) {
    const prev = this._prev || {};

    // Update file-list slices only when they change, so unrelated edits (which
    // leave `docs` untouched) never re-render the list.
    if (state.projectName !== prev.projectName) {
      this._fileList.projectName = state.projectName;
    }
    if (state.docs !== prev.docs) this._fileList.docs = state.docs;
    if (state.selectedPath !== prev.selectedPath) {
      this._fileList.selected = state.selectedPath;
    }

    // Load a document into the editor ONLY when the selected document changes
    // identity. While a document is open, the editor owns its working state —
    // re-loading on every keystroke would destroy input focus.
    if (state.selectedPath !== prev.selectedPath) {
      if (state.selectedPath) {
        this._docEditor.setDocument({
          doc: state.doc,
          error: state.parseError,
          rawText: state.rawText,
        });
      } else {
        this._docEditor.clearDocument();
      }
    }

    // The metadata panel is read-only, so it can safely reflect live edits
    // (block counts, status, save state) without disturbing focus.
    if (
      state.selectedPath !== prev.selectedPath ||
      state.doc !== prev.doc ||
      state.entry !== prev.entry
    ) {
      this._metaPanel.meta = state.selectedPath
        ? deriveMeta(state.entry, state.doc)
        : null;
    }
    if (state.saveState !== prev.saveState) {
      this._metaPanel.saveState = state.saveState;
    }

    this._prev = state;
  }

  _wireEvents() {
    this.addEventListener('open-project', () => this._openProject());
    this.addEventListener('create-doc', (e) => this._createDoc(e.detail));
    this.addEventListener('select-doc', (e) => this._selectDoc(e.detail.path));
    this.addEventListener('rename-doc', (e) => this._renameDoc(e.detail));
    this.addEventListener('delete-doc', (e) => this._deleteDoc(e.detail.path));
    this.addEventListener('change-entity', (e) => this._onEntityChange(e.detail.entity));
    this.addEventListener('change-raw', (e) => this._onRawChange(e.detail.text));
  }

  async _openProject() {
    try {
      const dir = await this.api.openProjectDir();
      if (!dir) return;
      const docs = await this.api.listDocs(dir);
      this.store.setState({
        projectDir: dir,
        projectName: basename(dir),
        docs,
        selectedPath: null,
        entry: null,
        doc: null,
        rawText: '',
        parseError: null,
        saveState: 'idle',
      });
    } catch (err) {
      this._fail(err);
    }
  }

  async _refreshDocs() {
    const { projectDir } = this.store.getState();
    if (!projectDir) return [];
    const docs = await this.api.listDocs(projectDir);
    this.store.setState({ docs });
    return docs;
  }

  async _createDoc({ kind, identifier }) {
    const { projectDir } = this.store.getState();
    if (!projectDir) return;
    const relPath = filenameFor(identifier); // created at the project root
    const doc = newDocument(kind, identifier);
    try {
      await this.api.createDoc(projectDir, relPath, serializeDoc(doc));
      await this._refreshDocs();
      await this._selectDoc(relPath);
    } catch (err) {
      this._fail(err);
    }
  }

  async _selectDoc(path) {
    // Persist any pending edits to the currently open doc before switching.
    this._saveDebounced.cancel();
    await this._flushSave();
    const { projectDir } = this.store.getState();
    try {
      const rawText = await this.api.readDoc(projectDir, path);
      const { doc, error } = parseDoc(rawText);
      const entry =
        this.store.getState().docs.find((d) => d.relPath === path) || null;
      this.store.setState({
        selectedPath: path,
        entry,
        doc,
        rawText,
        parseError: error,
        saveState: 'idle',
      });
    } catch (err) {
      this._fail(err);
    }
  }

  async _renameDoc({ from, to }) {
    const { projectDir, selectedPath } = this.store.getState();
    this._saveDebounced.cancel();
    await this._flushSave();
    try {
      const entry = await this.api.renameDoc(projectDir, from, to);
      await this._refreshDocs();
      if (selectedPath === from) {
        this.store.setState({ selectedPath: to, entry });
      }
    } catch (err) {
      this._fail(err);
    }
  }

  async _deleteDoc(path) {
    const { projectDir, selectedPath } = this.store.getState();
    if (!(await this._confirm(`Delete ${path}? This cannot be undone.`))) return;
    try {
      await this.api.deleteDoc(projectDir, path);
      await this._refreshDocs();
      if (selectedPath === path) {
        this.store.setState({
          selectedPath: null,
          entry: null,
          doc: null,
          rawText: '',
          parseError: null,
        });
      }
    } catch (err) {
      this._fail(err);
    }
  }

  _onEntityChange(entity) {
    const { doc } = this.store.getState();
    if (!doc) return;
    const nextDoc = setPrimaryEntity(doc, entity);
    const rawText = serializeDoc(nextDoc);
    this.store.setState({ doc: nextDoc, rawText, parseError: null, saveState: 'saving' });
    this._saveDebounced();
  }

  _onRawChange(text) {
    const { doc, error } = parseDoc(text);
    this.store.setState({
      rawText: text,
      doc: error ? this.store.getState().doc : doc,
      parseError: error,
      saveState: 'saving',
    });
    this._saveDebounced();
  }

  async _flushSave() {
    const { projectDir, selectedPath, rawText } = this.store.getState();
    if (!projectDir || !selectedPath) return;
    try {
      const entry = await this.api.writeDoc(projectDir, selectedPath, rawText);
      // Merge refreshed file facts and reflect them in the doc list.
      const docs = this.store
        .getState()
        .docs.map((d) => (d.relPath === entry.relPath ? entry : d));
      this.store.setState({ entry, docs, saveState: 'saved' });
    } catch (err) {
      this.store.setState({ saveState: 'error' });
      this._fail(err);
    }
  }

  async _confirm(message) {
    const t = globalThis.window && window.__TAURI__;
    if (t && t.dialog && typeof t.dialog.confirm === 'function') {
      return t.dialog.confirm(message, { title: 'Confirm', kind: 'warning' });
    }
    return true;
  }

  _fail(err) {
    const message = err && err.message ? err.message : String(err);
    console.error('[dsds-editor]', message);
  }
}

customElements.define('dsds-app', DsdsApp);
