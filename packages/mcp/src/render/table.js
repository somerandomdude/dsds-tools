// One place that decides how a table is written.
//
// Seven handlers each built their own pipe table by hand, which is why the
// column set, the divider style (`|---|` in some, `| :---- |` in others) and
// the empty-cell convention had already drifted apart. They all call this
// now, so a format change is one edit rather than seven, and the divider can
// no longer disagree with its header.
//
// The second reason it exists is TOON (plan 007). TOON declares an array's
// length and fields once and then emits one delimited row per record:
//
//   props[9]{prop,type,required,description}:
//     `as`,`InteractiveAs<T>`,—,HTML element to render.
//
// Measured on this corpus (2026-09-10, gpt-tokenizer): TOON is 13.3% smaller
// than Markdown across 36 component API tables (399 prop rows), and smaller
// on all 36. On the 199-row entity index rendered at its real width it is
// 25% smaller.
//
// The rule that makes that true, and the one thing a caller must not break:
// TOON encodes EXACTLY the columns the Markdown table would have rendered.
// Encoding a richer object instead measured +461% — worse than doing
// nothing — because unrendered fields carry their own keys and because
// values holding the delimiter get quoted per cell.

import { encode as toonEncode } from '@toon-format/toon';

/** The empty cell. One convention, since the seven sites had three. */
const EMPTY = '—';

/**
 * Render rows as a table in the requested format.
 *
 * @param {object[]} rows
 * @param {Array<{key: string, header: string}>} columns
 *        Column order is render order. `key` indexes into a row; `header` is
 *        the Markdown heading and the TOON field name.
 * @param {object} [options]
 * @param {'markdown'|'toon'} [options.format='markdown']
 * @param {string} [options.name='rows'] TOON's array name. Ignored by Markdown.
 * @returns {string} the table, with no trailing newline
 */
export function renderTable(rows, columns, { format = 'markdown', name = 'rows' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = Array.isArray(columns) ? columns : [];
  if (cols.length === 0) return '';

  // An empty table still states its shape. A bare header in Markdown and a
  // `name[0]{…}:` line in TOON both say "this exists and is empty", which a
  // caller can tell apart from "this tool returned nothing".
  if (format === 'toon') return renderToon(list, cols, name);
  return renderMarkdown(list, cols);
}

function cellOf(row, key) {
  const v = row?.[key];
  if (v === null || v === undefined || v === '') return EMPTY;
  return String(v);
}

function renderMarkdown(rows, cols) {
  const lines = [
    `| ${cols.map(c => c.header).join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
  ];
  for (const row of rows) {
    // A literal pipe inside a cell would end the cell early and shift every
    // column after it. Escaping is idempotent — only pipes that are not
    // already escaped get a backslash — because several callers (cell20 in
    // render-0.20.0.js, for one) escape on the way in, and escaping twice
    // renders a visible `\\|` to the reader.
    lines.push(`| ${cols.map(c => cellOf(row, c.key).replace(/(?<!\\)\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderToon(rows, cols, name) {
  // Project first — this is the rule from the module comment, enforced here
  // rather than trusted to each caller. The encoder only ever sees the
  // rendered columns, under their rendered names.
  const projected = rows.map(row =>
    Object.fromEntries(cols.map(c => [toonField(c.header), cellOf(row, c.key)]))
  );
  return toonEncode({ [name]: projected }).trimEnd();
}

// TOON field names sit in a comma-separated header, and the encoder quotes
// any name it cannot write bare. Verified against @toon-format/toon@4.1.1:
// `isRequired` and `is_required` pass through, `is-required` comes back as
// `"is-required"` — two quote characters per field, paid on every table.
// camelCase it is, which also matches how the structured half names things.
function toonField(header) {
  const words = String(header).trim().toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.length === 0) return 'field';
  return words[0] + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join('');
}
