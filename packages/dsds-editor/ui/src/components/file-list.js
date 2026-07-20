// Left column: the document browser. Lists every *.dsds.json file in the
// project — recursing into subfolders and rendering the folder hierarchy — and
// lets the user open a project folder, create, rename, and delete documents.
// Emits intents as CustomEvents; the app shell performs the actual filesystem
// work.
//
// Documents are keyed by their project-relative path (`relPath`).
//
// Events emitted: `open-project`, `create-doc` {kind, identifier},
// `select-doc` {path}, `rename-doc` {from, to}, `delete-doc` {path}.

import { el, clear, emit } from '../dom.js';
import {
  ENTITY_KINDS,
  isValidIdentifier,
  filenameFor,
  buildTree,
  replaceStem,
} from '../model.js';

export class FileList extends HTMLElement {
  constructor() {
    super();
    this._docs = [];
    this._selected = null; // relPath of the selected doc
    this._projectName = null;
    this._creating = false;
    this._renaming = null; // relPath currently being renamed
    this._collapsed = new Set(); // folder paths that are collapsed
  }

  connectedCallback() {
    this.render();
  }

  set docs(value) {
    this._docs = Array.isArray(value) ? value : [];
    this.render();
  }
  get docs() {
    return this._docs;
  }

  set selected(relPath) {
    this._selected = relPath;
    this.render();
  }

  set projectName(name) {
    this._projectName = name;
    this.render();
  }

  render() {
    if (!this.isConnected) return;
    clear(this);
    this.append(this.renderHeader());
    if (this._creating) this.append(this.renderCreateForm());
    this.append(this.renderTree());
  }

  renderHeader() {
    return el(
      'header',
      { class: 'col-header' },
      el('span', { class: 'project-name', text: this._projectName || 'No project open' }),
      el(
        'div',
        { class: 'header-actions' },
        el('button', {
          type: 'button',
          class: 'open-project',
          text: 'Open Folder',
          onClick: () => emit(this, 'open-project'),
        }),
        el('button', {
          type: 'button',
          class: 'new-doc',
          text: '+ New',
          disabled: !this._projectName,
          onClick: () => {
            this._creating = !this._creating;
            this.render();
          },
        })
      )
    );
  }

  renderCreateForm() {
    const kindSelect = el(
      'select',
      { class: 'new-kind' },
      ...ENTITY_KINDS.map((k) => el('option', { value: k, text: k }))
    );
    const idInput = el('input', {
      type: 'text',
      class: 'new-identifier',
      placeholder: 'identifier (e.g. button)',
    });
    const error = el('p', { class: 'form-error', hidden: true });

    const submit = () => {
      const identifier = idInput.value.trim();
      if (!isValidIdentifier(identifier)) {
        error.textContent =
          'Identifier must be kebab-case and start with a letter.';
        error.hidden = false;
        return;
      }
      this._creating = false;
      emit(this, 'create-doc', { kind: kindSelect.value, identifier });
    };

    const form = el(
      'form',
      {
        class: 'create-form',
        onSubmit: (e) => {
          e.preventDefault();
          submit();
        },
      },
      kindSelect,
      idInput,
      el('div', { class: 'form-actions' },
        el('button', { type: 'submit', text: 'Create' }),
        el('button', {
          type: 'button',
          text: 'Cancel',
          onClick: () => {
            this._creating = false;
            this.render();
          },
        })
      ),
      error
    );
    queueMicrotask(() => idInput.focus());
    return form;
  }

  renderTree() {
    if (this._docs.length === 0) {
      return el('p', {
        class: 'empty-note',
        text: this._projectName
          ? 'No documents yet. Create one with + New.'
          : 'Open a folder to get started.',
      });
    }
    const tree = buildTree(this._docs);
    return this.renderNode(tree, 0);
  }

  /** Render a tree node's folders then files into a single <ul>. */
  renderNode(node, depth) {
    return el(
      'ul',
      { class: depth === 0 ? 'doc-list' : 'doc-list nested' },
      ...node.folders.map((folder) => this.renderFolder(folder, depth)),
      ...node.files.map((doc) => this.renderDocRow(doc, depth))
    );
  }

  renderFolder(folder, depth) {
    const collapsed = this._collapsed.has(folder.path);
    const toggle = el('button', {
      type: 'button',
      class: 'folder-name',
      style: `padding-left: ${depth * 0.75}rem`,
      text: `${collapsed ? '▸' : '▾'} ${folder.name}`,
      onClick: () => {
        if (collapsed) this._collapsed.delete(folder.path);
        else this._collapsed.add(folder.path);
        this.render();
      },
    });
    return el(
      'li',
      { class: 'folder-row' },
      toggle,
      collapsed ? false : this.renderNode(folder, depth + 1)
    );
  }

  renderDocRow(doc, depth) {
    if (this._renaming === doc.relPath) return this.renderRenameRow(doc, depth);
    const isSelected = doc.relPath === this._selected;
    return el(
      'li',
      { class: isSelected ? 'doc-row selected' : 'doc-row' },
      el('button', {
        type: 'button',
        class: 'doc-name',
        style: `padding-left: ${depth * 0.75}rem`,
        text: doc.name,
        title: doc.relPath,
        onClick: () => emit(this, 'select-doc', { path: doc.relPath }),
      }),
      el(
        'span',
        { class: 'row-actions' },
        el('button', {
          type: 'button',
          class: 'rename',
          title: 'Rename',
          text: 'Rename',
          onClick: () => {
            this._renaming = doc.relPath;
            this.render();
          },
        }),
        el('button', {
          type: 'button',
          class: 'delete',
          title: 'Delete',
          text: 'Delete',
          onClick: () => emit(this, 'delete-doc', { path: doc.relPath }),
        })
      )
    );
  }

  renderRenameRow(doc, depth) {
    const stem = doc.name.replace(/\.dsds\.json$/, '');
    const input = el('input', { type: 'text', class: 'rename-input', value: stem });
    const commit = () => {
      const next = input.value.trim();
      this._renaming = null;
      if (next && next !== stem) {
        emit(this, 'rename-doc', {
          from: doc.relPath,
          to: replaceStem(doc.relPath, next),
        });
      } else {
        this.render();
      }
    };
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return el(
      'li',
      { class: 'doc-row renaming', style: `padding-left: ${depth * 0.75}rem` },
      el(
        'form',
        {
          class: 'rename-form',
          onSubmit: (e) => {
            e.preventDefault();
            commit();
          },
        },
        input,
        el('span', { class: 'suffix', text: '.dsds.json' }),
        el('button', { type: 'submit', text: 'Save' }),
        el('button', {
          type: 'button',
          text: 'Cancel',
          onClick: () => {
            this._renaming = null;
            this.render();
          },
        })
      )
    );
  }
}

customElements.define('file-list', FileList);
