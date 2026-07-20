// Middle column: the document editor. Renders a structured form for the
// selected document's primary entity — core fields, metadata, and document
// blocks. Files that fail to parse (or lack an entity) fall back to a raw JSON
// textarea so no data is ever stranded.
//
// Field edits mutate an internal working copy and emit `change-entity` without
// re-rendering (preserving input focus). Structural edits (add/remove blocks or
// items, change kind) mutate and re-render. Raw edits emit `change-raw`.

import { el, clear, emit } from '../dom.js';
import {
  ENTITY_KINDS,
  STATUS_VALUES,
  BLOCK_ITEM_FIELDS,
  COLLECTION_BLOCK_KINDS,
  blockKindsFor,
  newBlock,
  newBlockItem,
  isValidIdentifier,
  getPrimaryEntity,
  normalizeStatus,
} from '../model.js';

export class DocEditor extends HTMLElement {
  constructor() {
    super();
    this._entity = null;
    this._rawText = '';
    this._parseError = null;
    this._hasDoc = false;
  }

  connectedCallback() {
    this.render();
  }

  /** Load a document. `{ doc, error, rawText }`. */
  setDocument({ doc, error, rawText }) {
    this._hasDoc = doc != null || error != null || (rawText != null && rawText !== '');
    this._rawText = rawText || '';
    this._parseError = error || null;
    const entity = error ? null : getPrimaryEntity(doc);
    this._entity = entity ? structuredClone(entity) : null;
    this.render();
  }

  clearDocument() {
    this._hasDoc = false;
    this._entity = null;
    this._rawText = '';
    this._parseError = null;
    this.render();
  }

  /** Notify the app that the working entity changed. */
  _changed() {
    emit(this, 'change-entity', { entity: structuredClone(this._entity) });
  }

  render() {
    if (!this.isConnected) return;
    clear(this);
    if (!this._hasDoc) {
      this.append(
        el('p', {
          class: 'empty-note',
          text: 'Select a document to edit, or create a new one.',
        })
      );
      return;
    }
    if (this._entity) {
      this.append(this.renderEntity());
    } else {
      this.append(this.renderRaw());
    }
  }

  // --- Raw fallback -------------------------------------------------------

  renderRaw() {
    const area = el('textarea', {
      class: 'raw-editor',
      spellcheck: 'false',
      onInput: () => emit(this, 'change-raw', { text: area.value }),
    });
    area.value = this._rawText;
    return el(
      'div',
      { class: 'raw-mode' },
      this._parseError
        ? el('p', { class: 'form-error', text: `Invalid JSON: ${this._parseError}` })
        : el('p', {
            class: 'form-note',
            text: 'This document has no editable entity. Editing raw JSON.',
          }),
      area
    );
  }

  // --- Structured entity editor ------------------------------------------

  renderEntity() {
    return el(
      'div',
      { class: 'editor' },
      this.renderCoreSection(),
      this.renderMetadataSection(),
      this.renderBlocksSection()
    );
  }

  field(labelText, input, hint) {
    return el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label', text: labelText }),
      input,
      hint || false
    );
  }

  textInput(value, oninput, extra = {}) {
    const input = el('input', { type: 'text', ...extra });
    input.value = value ?? '';
    input.addEventListener('input', () => oninput(input.value));
    return input;
  }

  textArea(value, oninput, extra = {}) {
    const area = el('textarea', { spellcheck: 'false', ...extra });
    area.value = value ?? '';
    area.addEventListener('input', () => oninput(area.value));
    return area;
  }

  selectInput(value, options, onchange) {
    const select = el(
      'select',
      {},
      ...options.map((o) => el('option', { value: o, text: o }))
    );
    select.value = value;
    select.addEventListener('change', () => onchange(select.value));
    return select;
  }

  renderCoreSection() {
    const e = this._entity;
    const idInput = this.textInput(e.identifier, (v) => {
      e.identifier = v;
      idInput.classList.toggle('invalid', v !== '' && !isValidIdentifier(v));
      this._changed();
    });
    idInput.classList.toggle(
      'invalid',
      e.identifier !== '' && !isValidIdentifier(e.identifier)
    );

    return el(
      'section',
      { class: 'section' },
      el('h2', { text: 'Entity' }),
      this.field(
        'Kind',
        this.selectInput(e.kind, ENTITY_KINDS, (v) => {
          e.kind = v;
          this._changed();
          this.render();
        })
      ),
      this.field(
        'Identifier',
        idInput,
        el('span', { class: 'field-hint', text: 'kebab-case, starts with a letter' })
      ),
      this.field(
        'Name',
        this.textInput(e.name, (v) => {
          e.name = v;
          this._changed();
        })
      ),
      this.field(
        'Description',
        this.textArea(e.description, (v) => {
          e.description = v;
          this._changed();
        })
      )
    );
  }

  metadata() {
    if (!this._entity.metadata || typeof this._entity.metadata !== 'object') {
      this._entity.metadata = {};
    }
    return this._entity.metadata;
  }

  renderMetadataSection() {
    const md = this.metadata();
    const statusIsComplex =
      md.status && typeof md.status === 'object';

    const statusField = statusIsComplex
      ? this.field(
          'Status',
          el('span', {
            class: 'field-readonly',
            text: `${normalizeStatus(md.status)} (per-platform — edit in raw)`,
          })
        )
      : this.field(
          'Status',
          this.selectInput(
            typeof md.status === 'string' ? md.status : '',
            ['', ...STATUS_VALUES],
            (v) => {
              if (v === '') delete md.status;
              else md.status = v;
              this._changed();
            }
          )
        );

    return el(
      'section',
      { class: 'section' },
      el('h2', { text: 'Metadata' }),
      statusField,
      this.field(
        'Category',
        this.textInput(md.category, (v) => {
          this.setOrDelete(md, 'category', v);
        })
      ),
      this.field(
        'Summary',
        this.textInput(md.summary, (v) => {
          this.setOrDelete(md, 'summary', v);
        })
      ),
      this.field(
        'Since',
        this.textInput(md.since, (v) => {
          this.setOrDelete(md, 'since', v);
        })
      ),
      this.field(
        'Tags',
        this.textInput(joinList(md.tags), (v) => {
          this.setListOrDelete(md, 'tags', v);
        }),
        el('span', { class: 'field-hint', text: 'comma-separated' })
      ),
      this.field(
        'Aliases',
        this.textInput(joinList(md.aliases), (v) => {
          this.setListOrDelete(md, 'aliases', v);
        }),
        el('span', { class: 'field-hint', text: 'comma-separated' })
      )
    );
  }

  setOrDelete(obj, key, value) {
    if (value === '') delete obj[key];
    else obj[key] = value;
    this._changed();
  }

  setListOrDelete(obj, key, text) {
    const list = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) delete obj[key];
    else obj[key] = list;
    this._changed();
  }

  blocks() {
    if (!Array.isArray(this._entity.documentBlocks)) {
      this._entity.documentBlocks = [];
    }
    return this._entity.documentBlocks;
  }

  renderBlocksSection() {
    const blocks = this.blocks();
    const kinds = blockKindsFor(this._entity.kind);
    const addSelect = el(
      'select',
      { class: 'add-block-kind' },
      ...kinds.map((k) => el('option', { value: k, text: k }))
    );
    return el(
      'section',
      { class: 'section blocks' },
      el('h2', { text: 'Document blocks' }),
      ...blocks.map((block, i) => this.renderBlock(block, i)),
      el(
        'div',
        { class: 'add-block' },
        addSelect,
        el('button', {
          type: 'button',
          class: 'add-block-btn',
          text: 'Add block',
          onClick: () => {
            blocks.push(newBlock(addSelect.value));
            this._changed();
            this.render();
          },
        })
      )
    );
  }

  renderBlock(block, index) {
    const blocks = this.blocks();
    const legend = el(
      'legend',
      {},
      el('span', { class: 'block-kind', text: block.kind || '(unknown)' }),
      el('button', {
        type: 'button',
        class: 'remove-block',
        text: 'Remove block',
        onClick: () => {
          blocks.splice(index, 1);
          this._changed();
          this.render();
        },
      })
    );
    const body = COLLECTION_BLOCK_KINDS.includes(block.kind)
      ? this.renderCollectionBlock(block)
      : this.renderRawBlock(block, index);
    return el('fieldset', { class: 'block' }, legend, body);
  }

  renderCollectionBlock(block) {
    if (!Array.isArray(block.items)) block.items = [];
    const fields = BLOCK_ITEM_FIELDS[block.kind];
    const list = el(
      'div',
      { class: 'items' },
      ...block.items.map((item, i) => this.renderItem(block, item, i, fields))
    );
    return el(
      'div',
      {},
      list,
      el('button', {
        type: 'button',
        class: 'add-item',
        text: 'Add item',
        onClick: () => {
          block.items.push(newBlockItem(block.kind));
          this._changed();
          this.render();
        },
      })
    );
  }

  renderItem(block, item, index, fields) {
    const inputs = fields.map((f) => {
      if (f.type === 'select') {
        return this.field(
          f.label,
          this.selectInput(item[f.key] ?? f.options[0], f.options, (v) => {
            item[f.key] = v;
            this._changed();
          })
        );
      }
      if (f.type === 'textarea') {
        return this.field(
          f.label,
          this.textArea(item[f.key], (v) => {
            item[f.key] = v;
            this._changed();
          })
        );
      }
      return this.field(
        f.label,
        this.textInput(item[f.key], (v) => {
          item[f.key] = v;
          this._changed();
        })
      );
    });
    return el(
      'div',
      { class: 'item' },
      ...inputs,
      el('button', {
        type: 'button',
        class: 'remove-item',
        text: 'Remove item',
        onClick: () => {
          block.items.splice(index, 1);
          this._changed();
          this.render();
        },
      })
    );
  }

  renderRawBlock(block, index) {
    const { kind, ...rest } = block;
    const error = el('p', { class: 'form-error', hidden: true });
    const area = el('textarea', { class: 'raw-block', spellcheck: 'false' });
    area.value = JSON.stringify(rest, null, 2);
    area.addEventListener('input', () => {
      try {
        const parsed = JSON.parse(area.value);
        this.blocks()[index] = { kind, ...parsed };
        error.hidden = true;
        this._changed();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    });
    return el(
      'div',
      { class: 'raw-block-wrap' },
      el('p', { class: 'form-note', text: 'No structured editor for this block — editing raw JSON.' }),
      area,
      error
    );
  }
}

function joinList(list) {
  return Array.isArray(list) ? list.join(', ') : '';
}

customElements.define('doc-editor', DocEditor);
