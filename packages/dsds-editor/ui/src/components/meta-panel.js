// Right column: read-only metadata about the selected document — file facts
// (name, path, size, last modified, save state) plus entity metadata derived
// from the document (kind, identifier, status, tags, block counts).

import { el, clear } from '../dom.js';
import { formatBytes, formatDate } from '../util.js';

const SAVE_LABELS = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
};

export class MetaPanel extends HTMLElement {
  constructor() {
    super();
    this._meta = null;
    this._saveState = 'idle';
  }

  connectedCallback() {
    this.render();
  }

  set meta(value) {
    this._meta = value;
    this.render();
  }

  set saveState(value) {
    this._saveState = value || 'idle';
    this.render();
  }

  render() {
    if (!this.isConnected) return;
    clear(this);
    this.append(el('header', { class: 'col-header' }, el('span', { text: 'Details' })));
    if (!this._meta) {
      this.append(el('p', { class: 'empty-note', text: 'No document selected.' }));
      return;
    }
    const m = this._meta;
    this.append(this.saveIndicator());
    this.append(
      this.group('File', [
        ['Filename', m.filename],
        ['Size', formatBytes(m.size)],
        ['Last modified', formatDate(m.modified)],
        ['Path', m.path],
      ])
    );
    this.append(
      this.group('Entity', [
        ['Kind', m.kind],
        ['Identifier', m.identifier],
        ['Status', m.status || '—'],
        ['Summary', m.summary || '—'],
        ['Since', m.since || '—'],
        ['Last updated', m.lastUpdated || '—'],
        ['Tags', m.tags.length ? m.tags.join(', ') : '—'],
        ['Document blocks', String(m.blockCount)],
        ['Agent blocks', String(m.agentBlockCount)],
      ])
    );
  }

  saveIndicator() {
    const label = SAVE_LABELS[this._saveState] || '';
    return el('p', {
      class: `save-state save-${this._saveState}`,
      text: label,
      hidden: !label,
    });
  }

  group(title, rows) {
    return el(
      'section',
      { class: 'meta-group' },
      el('h2', { text: title }),
      el(
        'dl',
        {},
        ...rows.flatMap(([key, value]) => [
          el('dt', { text: key }),
          el('dd', { text: value == null || value === '' ? '—' : String(value), title: String(value ?? '') }),
        ])
      )
    );
  }
}

customElements.define('meta-panel', MetaPanel);
