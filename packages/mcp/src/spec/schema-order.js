// Canonical field and enum order, read out of the vendored schema files at
// runtime rather than transcribed into a table here.
//
// STYLE_GUIDE.md's first rule is "the schema is the style guide": write fields
// in the order the schema declares them. That makes the schema files the only
// place the order is recorded, so reading it at runtime is the only honest way
// to check it. A hardcoded copy would be a second source of truth for the exact
// thing the guide says has one — upstream had that copy drift twice (a stale
// `related`/`extends` order, and `imports` in the wrong place) before deriving
// it, which is why this is derived here too.
//
// Ported from the upstream spec repo's scripts/lib.js at tag v0.20.1, narrowed
// to what the style rules need and repointed at our vendored schema directory.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYamlFile20 } from './dsds20-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = resolve(__dirname, 'schema-0.20.1');

export const EXTENSIONS_KEY = '$extensions';

const declaredPropsCache = new Map();

/**
 * A schema file's own property names, in the order it declares them.
 *
 * Throws when a file declares none. Every file callers ask for declares
 * properties today, so an empty answer means they moved somewhere this doesn't
 * look — into an `allOf` branch, behind a `$ref`, down into `$defs`. Without
 * the throw the callers fail silently: a field-order check with an empty order
 * passes every document, which reads exactly like success.
 *
 * @param {string} relPath - e.g. 'entries/entry.schema.yaml'
 * @returns {string[]}
 */
export function declaredProps(relPath) {
  if (!declaredPropsCache.has(relPath)) {
    const doc = loadYamlFile20(join(SCHEMA_DIR, relPath));
    const inline = (doc.allOf || []).find((member) => member.properties);
    const keys = Object.keys(doc.properties || (inline && inline.properties) || {});
    if (keys.length === 0) {
      throw new Error(
        `schema-0.20.1/${relPath} declares no properties of its own, so no field order can be derived from it. Either the file was restructured, or the caller asked for the wrong one.`,
      );
    }
    declaredPropsCache.set(relPath, keys);
  }
  // A copy, so a caller that sorts or splices its result can't corrupt the cache.
  return declaredPropsCache.get(relPath).slice();
}

/**
 * The field order for an entry of `kind`: the fields every kind shares, then
 * that kind's own, then `$extensions` last.
 *
 * Two lists because a kind's own fields live in a different file from the
 * shared ones and JSON Schema's `allOf` can't interleave them. `$extensions`
 * is pinned explicitly because it's declared among the shared fields, so
 * joining the lists end to end would strand it in the middle. A namespaced
 * custom kind (`acme.icon-library`) has no schema file and gets the shared
 * fields alone — the same fallback entry.schema.yaml's own dispatch gives it.
 *
 * @param {string|undefined} kind
 * @returns {string[]}
 */
export function entryFieldOrder(kind) {
  const base = declaredProps('entries/entry.schema.yaml');
  const shared = base.filter((key) => key !== EXTENSIONS_KEY);
  const kindFile = `entries/${kind}.schema.yaml`;
  const own =
    kind && existsSync(join(SCHEMA_DIR, kindFile))
      ? declaredProps(kindFile).filter((key) => !base.includes(key))
      : [];
  return [...shared, ...own, EXTENSIONS_KEY];
}

/**
 * A schema file's enum values in declared order, plus the default it declares.
 *
 * `locate` picks the field out of the loaded document because these sit at
 * different depths: requirement-level is an enum at its root, section.schema
 * keeps `for` under `properties`, guidelines.schema keeps `framing` inside an
 * `allOf` member. Throws for the same reason declaredProps does — a missing
 * enum turns a sort check into a no-op that passes everything.
 *
 * @param {string} relPath
 * @param {(doc: object) => object} locate
 * @returns {{values: string[], fallback: string|undefined}}
 */
export function declaredEnum(relPath, locate) {
  const field = locate(loadYamlFile20(join(SCHEMA_DIR, relPath)));
  const values = field && field.enum;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(
      `schema-0.20.1/${relPath} declares no enum where one was expected, so no order can be derived from it. Either the file was restructured, or the caller looked in the wrong place.`,
    );
  }
  return { values, fallback: field.default };
}

/**
 * A rank function over a declared enum, for sorting into the schema's order.
 *
 * A field left out ranks as the schema's declared default — the same value a
 * validator would read it as, not "unknown". A value the schema doesn't list
 * ranks last, so an unrecognized one sorts to the end instead of throwing.
 *
 * @param {string} relPath
 * @param {(doc: object) => object} locate
 * @returns {(value: string|undefined) => number}
 */
export function enumRanker(relPath, locate) {
  const { values, fallback } = declaredEnum(relPath, locate);
  const rank = new Map(values.map((value, index) => [value, index]));
  return (value) => {
    const resolved = value === undefined || value === null ? fallback : value;
    return rank.has(resolved) ? rank.get(resolved) : values.length;
  };
}

/**
 * The first out-of-order pair in `actual`, or null when it's already
 * non-decreasing by canonical rank. The general "is this sequence sorted"
 * check that every ordering rule reduces to.
 *
 * @template T
 * @param {T[]} actual
 * @param {(item: T) => number} rankOf
 * @returns {[T, T] | null}
 */
export function firstInversion(actual, rankOf) {
  for (let i = 1; i < actual.length; i++) {
    if (rankOf(actual[i]) < rankOf(actual[i - 1])) return [actual[i - 1], actual[i]];
  }
  return null;
}
