// =============================================================================
// src/prop-types.js
//
// Shared helpers for interpreting a DSDS api-block property's value set. Used
// by both dsds_build_component (to offer valid options and emit correct JSX)
// and dsds_get_agent_context (to lead with allowed-value constraints). Keeping
// the logic in one place ensures the wizard and the context never disagree
// about what a prop's closed value set is.
//
// Resolution order follows the spec (0.13.0): `schema` (JSON Schema) is the
// authoritative machine-readable definition when present; `values` is the
// portable enum list; the `type` string is a display summary parsed as a
// last-resort heuristic. Systems that document via `values`/`schema` — with a
// plain-prose `type` — get full enum support without TS-style type strings.
// =============================================================================

/** Normalize a raw enum member to `{ value, isNumber }`, or null if unusable. */
function member(v) {
  if (typeof v === 'string') return { value: v, isNumber: false };
  if (typeof v === 'number' && Number.isFinite(v)) return { value: String(v), isNumber: true };
  return null; // booleans/null/objects in an enum are not offerable literals
}

/**
 * Resolve a prop's closed value set from a DSDS apiProperty, in spec-authority
 * order: `schema.enum` → `values` → literal-union parse of the `type` string.
 * Returns `[{ value, isNumber }]`, or null when the prop has no closed set.
 */
export function resolvePropValues(prop) {
  const fromEnum = Array.isArray(prop?.schema?.enum)
    ? prop.schema.enum.map(member).filter(Boolean)
    : [];
  if (fromEnum.length) return fromEnum;

  const fromValues = Array.isArray(prop?.values)
    ? prop.values.map(member).filter(Boolean)
    : [];
  if (fromValues.length) return fromValues;

  return parseLiteralUnion(prop?.type);
}

/**
 * Is this prop a boolean flag? `schema.type` is authoritative when present;
 * otherwise the `type` string decides.
 */
export function isBooleanProp(prop) {
  if (prop?.schema?.type === 'boolean') return true;
  return isBooleanType(prop?.type);
}

// A generic wrapper like `Responsive<T>` / `ResponsiveValue<T>` is transparent:
// the inner union is the value set. Matched by NAME (contains "responsive"),
// never blindly — unwrapping a container type like `Array<'a' | 'b'>` would
// change semantics (the value is an array, not a member).
const TRANSPARENT_WRAPPER = /^([A-Za-z_$][\w$]*)<([\s\S]+)>$/;
const isTransparentName = (name) => /responsive/i.test(name);

/**
 * Parse a literal union type into its members, e.g. "'a' | 'b'" or
 * "0 | 1 | 2 | 3" or "0 | 1 | 'auto'". Returns `[{ value, isNumber }]`, or null
 * if any member is not a pure string-or-number literal (so `string | number`,
 * `React.ReactNode`, etc. fall through). A single responsive-style wrapper
 * (`Responsive<…>`, `ResponsiveValue<…>`, …) and a trailing `| undefined` are
 * unwrapped first, so numeric scale props like `Responsive<0 | 1 | 2 | 3>` are
 * recognised (and emitted as `{n}`, never `"n"`).
 */
export function parseLiteralUnion(type) {
  if (typeof type !== 'string') return null;
  let t = type.trim().replace(/\|\s*undefined\b/g, '').trim();
  const wrap = t.match(TRANSPARENT_WRAPPER);
  if (wrap && isTransparentName(wrap[1])) t = wrap[2].trim();
  const parts = t.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const members = [];
  for (const part of parts) {
    const str = part.match(/^'([^']*)'$/) || part.match(/^"([^"]*)"$/);
    if (str) { members.push({ value: str[1], isNumber: false }); continue; }
    if (/^-?\d+(?:\.\d+)?$/.test(part)) { members.push({ value: part, isNumber: true }); continue; }
    return null; // not a pure literal union
  }
  return members.length ? members : null;
}

/**
 * True for `boolean`, optionally wrapped in a responsive-style wrapper
 * (`Responsive<boolean>`, `ResponsiveValue<boolean>`, …) or `| undefined`.
 */
export function isBooleanType(type) {
  if (typeof type !== 'string') return false;
  // Strip whitespace FIRST, then the undefined branch — 'boolean | undefined'
  // has a space between '|' and 'undefined', which a single-pass strip missed.
  const t = type.replace(/\s+/g, '').replace(/\|undefined/g, '');
  if (t === 'boolean') return true;
  const wrap = t.match(/^([A-Za-z_$][\w$]*)<boolean>$/);
  return !!(wrap && isTransparentName(wrap[1]));
}
