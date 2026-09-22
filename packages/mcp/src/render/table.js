// One place that decides how a table is written.
//
// Seven handlers each built their own pipe table by hand, which is why the
// column set, the divider style (`|---|` in some, `| :---- |` in others) and
// the empty-cell convention had already drifted apart. They all call this
// now, so a format change is one edit rather than seven, and the divider can
// no longer disagree with its header.
//
// This module briefly also emitted TOON (plan 007). That was measured and
// rejected on 2026-09-21: -3.7% of payload against a pinned dependency
// upstream calls "an idea in progress", a format argument threaded through
// 26 signatures, and a legend the model has to be taught. The seam is worth
// keeping on its own; the second format was not. See plan 007's rejection
// note before adding one back.

/** The empty cell. One convention, since the seven sites had three. */
const EMPTY = '—';

/**
 * Render rows as a Markdown table.
 *
 * @param {object[]} rows
 * @param {Array<{key: string, header: string}>} columns
 *        Column order is render order. `key` indexes into a row; `header` is
 *        the Markdown heading.
 * @returns {string} the table, with no trailing newline
 */
export function renderTable(rows, columns) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = Array.isArray(columns) ? columns : [];
  if (cols.length === 0) return '';

  // An empty table still states its shape: a bare header says "this exists
  // and is empty", which a caller can tell apart from "this returned
  // nothing".
  const lines = [
    `| ${cols.map(c => c.header).join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
  ];
  for (const row of list) {
    // A literal pipe inside a cell would end the cell early and shift every
    // column after it. Escaping is idempotent — only pipes that are not
    // already escaped get a backslash — because several callers (cell20 in
    // render-0.20.0.js, for one) escape on the way in, and escaping twice
    // renders a visible `\|` to the reader.
    lines.push(`| ${cols.map(c => cellOf(row, c.key).replace(/(?<!\\)\|/g, '\\|')).join(' | ')} |`);
  }
  return lines.join('\n');
}

function cellOf(row, key) {
  const v = row?.[key];
  if (v === null || v === undefined || v === '') return EMPTY;
  return String(v);
}
