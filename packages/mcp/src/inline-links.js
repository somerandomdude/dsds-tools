// Inline links (DSDS 0.23.0, processing model §2.4): a Markdown prose field can
// mention something in the project as `<dsds:button>` or
// `[text](dsds:shared-a11y#focus-visible)`. This server hands prose to agents
// as text, so it rewrites each link into a form an agent can act on: the text
// to show, then the target in backticks, which is what dsds_get_entity and the
// other tools take as an identifier.
//
//   [focus visible](dsds:shared-a11y#focus-visible) -> focus visible (`shared-a11y#focus-visible`)
//   <dsds:button>                                    -> Button (`button`)
//
// A one-line summary shows only the text, as the spec says a one-line view
// should. Either way, no `dsds:` URL is left for a renderer to turn into an
// href (specification §6.5).
//
// The links are found with the CommonMark parser upstream's validator uses, an
// optional dependency. Without it, or on a Node older than 20.19, prose is
// passed through unchanged: still readable, just not rewritten.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { VENDOR_DIR } from './spec/schema-order.js';

const require = createRequire(import.meta.url);
const { itemAddresses, resolveAddress } = require(join(VENDOR_DIR, 'scripts/lib.js'));

let parse;
function parser() {
  if (parse !== undefined) return parse;
  try {
    parse = require('mdast-util-from-markdown').fromMarkdown;
  } catch {
    parse = null;
  }
  return parse;
}

/** True when this server can read inline links. */
export function canReadInlineLinks() {
  return parser() !== null;
}

// id -> { entity, book }, for the autolink text. Set from the loaded systems
// at startup and after every reload.
let targets = new Map();

/** Index every loaded entry (and shared entry) so an autolink can show its name. */
export function setLinkTargets(systems) {
  const next = new Map();
  const add = (entity) => {
    if (!entity || typeof entity.id !== 'string' || next.has(entity.id)) return;
    next.set(entity.id, { entity, book: null });
  };
  for (const system of systems ?? []) {
    for (const entity of system.entities ?? []) {
      add(entity);
      for (const shared of entity.__sharedEntries ?? []) add(shared);
    }
  }
  targets = next;
}

const str = (v) => (typeof v === 'string' ? v : null);

/**
 * The text an autolink shows (processing model §2.4): an entry's name, a
 * definition's term, a step's or freeform entry's title, a trait's or value's
 * name; otherwise null, and the caller shows the target. A reusing item with
 * no term or title of its own takes the one it reuses.
 */
export function autolinkText(target, seen = new Set()) {
  if (seen.has(target)) return null;
  seen.add(target);
  const hash = target.indexOf('#');
  const known = targets.get(hash === -1 ? target : target.slice(0, hash));
  if (!known) return null;
  if (hash === -1) return str(known.entity.name);
  known.book ??= itemAddresses(known.entity);
  const { candidate } = resolveAddress(known.book, target.slice(hash + 1));
  if (!candidate) return null;
  const t = candidate.target;
  if (candidate.type === 'trait' || candidate.type === 'value') return str(t.name);
  if (candidate.type === 'freeform') return str(t.title);
  if (candidate.type !== 'item') return null;
  const field = { definitions: 'term', steps: 'title' }[candidate.sectionKind];
  if (!field) return null;
  if (str(t[field])) return t[field];
  const sameAs = (t.refs ?? []).find((r) => r && r.rel === 'same-as' && typeof r.to === 'string');
  return sameAs ? autolinkText(sameAs.to, seen) : null;
}

const SCHEME = /^dsds:/i;
const targetOf = (url) => {
  const raw = url.slice('dsds:'.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
const nodeText = (node) =>
  typeof node.value === 'string' ? node.value : (node.children ?? []).map(nodeText).join('');

/**
 * Rewrite every `dsds:` link in a Markdown string.
 *
 * @param {string} text
 * @param {{ oneLine?: boolean }} [options] oneLine shows only the link text,
 *   for a summary; otherwise the target follows in backticks.
 * @returns {string}
 */
export function formatInlineLinks(text, { oneLine = false } = {}) {
  if (typeof text !== 'string' || !/dsds:/i.test(text)) return text;
  const fromMarkdown = parser();
  if (!fromMarkdown) return text;

  const tree = fromMarkdown(text);
  const definitions = new Map(); // identifier -> url, for `[text][x]`
  const edits = []; // { start, end, replacement }
  const show = (label, target) => (oneLine ? label : label === target ? `\`${target}\`` : `${label} (\`${target}\`)`);

  (function collect(node) {
    if (node.type === 'definition' && SCHEME.test(node.url ?? '')) {
      definitions.set(node.identifier, node.url);
      // The definition line is markup, not prose: drop it.
      edits.push({ start: node.position.start.offset, end: node.position.end.offset, replacement: '' });
    }
    (node.children ?? []).forEach(collect);
  })(tree);

  (function walk(node) {
    const pos = node.position;
    if (node.type === 'link' && SCHEME.test(node.url ?? '')) {
      const target = targetOf(node.url);
      const autolink = text[pos.start.offset] === '<';
      const label = autolink ? autolinkText(target) ?? target : nodeText(node);
      edits.push({ start: pos.start.offset, end: pos.end.offset, replacement: show(label, target) });
      return;
    }
    if (node.type === 'linkReference' && definitions.has(node.identifier)) {
      const target = targetOf(definitions.get(node.identifier));
      edits.push({ start: pos.start.offset, end: pos.end.offset, replacement: show(nodeText(node), target) });
      return;
    }
    (node.children ?? []).forEach(walk);
  })(tree);

  let out = text;
  for (const { start, end, replacement } of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, start) + replacement + out.slice(end);
  }
  return edits.some((e) => e.replacement === '') ? out.replace(/\n{3,}/g, '\n\n').trimEnd() : out;
}
