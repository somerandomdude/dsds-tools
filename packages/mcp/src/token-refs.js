// Token references in documentation text.
//
// Documentation names a token instead of copying its value: `{space-3}`.
// This is DSDS's own token reference — a token ENTRY's `id` wrapped in
// braces (common/combo.schema.yaml `tokenRef`; DSDS-09 resolves it in
// `combos`), and the dsds-update skill extends it to prose: "Token
// references (in `traits`, `combos`, or prose) must match `id`s of tokens
// actually documented in `tokens/`." So a reference resolves against token
// entries, never against raw DTCG keys: a palette color with no entry is not
// referenceable, and an entry whose id differs from its DTCG key
// (`color.action.primary` → `#blue-500`) resolves by id. The value then
// comes from the entry's `source` pointer, as the token schema requires.
//
// At serve time each reference becomes "`space-3` (12px)", so the value
// lives only in the token file and an agent still sees the number. How a
// reference is displayed is this server's choice; the spec defines only the
// reference itself.
//
// Braces are common in prose that quotes JSX (`{true}`, `{ Box }`,
// `weight={bold}`), so the rules are conservative:
//   - only a name that IS a token is replaced; any other `{…}` is left alone;
//   - nothing inside a code span or fenced block is touched;
//   - a brace right after `=` or `$` is code (`size={2}`, `${x}`), never a
//     reference.

import { buildTokenIndex, formatTokenValue } from './tokens.js';

// The spec's `tokenId` shape (common/id.schema.yaml): segments of
// [A-Za-z0-9_$], dash-joined, chained with `.` or `/`.
const TOKEN_ID = '[A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*(?:[./][A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*)*';

// A reference the doctor reports when it resolves to nothing. The spec's
// shape also admits a bare word, but a bare word in prose braces is usually
// quoted JSX (`{true}`, `{isSelected}`), so only an id with a separator —
// `space-33`, `color.action.primry`, `Color/Action` — counts as a broken
// reference. A bare-word id still resolves when it names a token entry.
export const TOKEN_REF_SHAPE = new RegExp(`^(?=.*[-./])${TOKEN_ID}$`);

const REF = new RegExp(`(^|[^=$])\\{(${TOKEN_ID})\\}`, 'g');
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

/** The short value shown beside a token's name, or null to show the name alone. */
export function inlineTokenValue(token) {
  const v = token.value;
  // A token with modes shows each: "#eeeef1 light, #2d2f38 dark".
  if (token.modeValues) {
    const light = formatTokenValue(token.type, v);
    return [`${light} light`, ...Object.entries(token.modeValues).map(([m, mv]) => `${formatTokenValue(token.type, mv)} ${m}`)].join(', ');
  }
  switch (token.type) {
    case 'typography':
      return v && typeof v === 'object' && v.fontSize
        ? `${v.fontSize.value}${v.fontSize.unit ?? ''} / ${v.lineHeight}`
        : token.display;
    case 'fontFamily': {
      const first = String(Array.isArray(v) ? v[0] : v).split(',')[0].trim();
      return first || null;
    }
    case 'shadow':
      return null;
    default:
      if (typeof v === 'string' && !token.aliasOf) return `"${v}"`;
      return token.display ?? null;
  }
}

/**
 * Map of token entry id → its token (with the value from its DTCG source),
 * for the systems given. Only documented tokens are in it: a reference is to
 * an entry, so a DTCG token no entry points at cannot be referenced.
 */
export function tokenMap(systems) {
  const map = new Map();
  for (const t of buildTokenIndex(systems).tokens) if (t.entry && t.entryKind === 'token') map.set(t.entry, t);
  return map;
}

/** Every `{name}` reference in prose (outside code), with where it sits. */
export function findTokenRefs(text) {
  if (typeof text !== 'string' || !text.includes('{')) return [];
  const out = [];
  text.split(CODE).forEach((part, i) => {
    if (i % 2 === 1) return;
    for (const m of part.matchAll(REF)) out.push(m[2]);
  });
  return out;
}

/**
 * Replace each `{token}` reference in `text` with "`token` (value)".
 *
 * @param {string} text
 * @param {Map<string, object>} tokens - from tokenMap()
 * @returns {string}
 */
export function resolveTokenRefs(text, tokens) {
  if (typeof text !== 'string' || !text.includes('{') || !tokens?.size) return text;
  return text
    .split(CODE)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(REF, (whole, before, name) => {
        const token = tokens.get(name);
        if (!token) return whole;
        const value = inlineTokenValue(token);
        return `${before}\`${name}\`${value ? ` (${value})` : ''}`;
      });
    })
    .join('');
}

/** Resolve references in every string inside a value, without mutating it. */
export function resolveTokenRefsDeep(value, tokens) {
  if (typeof value === 'string') return resolveTokenRefs(value, tokens);
  if (Array.isArray(value)) return value.map(v => resolveTokenRefsDeep(v, tokens));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTokenRefsDeep(v, tokens);
    return out;
  }
  return value;
}
