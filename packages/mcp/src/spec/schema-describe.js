// What each field of a 0.20.x entry means, read out of the vendored schema.
//
// The 0.20.x branch of dsds_spec_entity_schema used to print a list of field
// names and nothing else — `metadata`, `sourceFiles`, `specs`, `imports`,
// `traits`, `combos`, `refs`, `sections` — from a hand-kept table in
// knowledge.js, then defer to a skill for what any of them meant. The legacy
// 0.15.2 branch, describing a model no current document uses, had a full
// field table with a gloss on every entry.
//
// The meanings were in the repository the whole time: 150 of the 173
// properties declared across schema-0.21.0/ carry a `description`, and
// schema-order.js already parses those exact files for field order and throws
// the text away. This reads it instead.
//
// Deriving beats transcribing here for the same reason it does for field
// order (see schema-order.js): a copied table is a second source of truth for
// something that has one, and it goes stale at the next spec bump without
// anything failing.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadYamlFile20 } from './dsds20-lib.js';
import { SCHEMA_DIR } from './schema-order.js';

const cache = new Map();

/**
 * Collect `properties` and `required` from a schema file, following the one
 * structural shape these files use: a base `entry.schema.yaml` plus an
 * `allOf` member holding the kind's own fields.
 *
 * `$ref` members are not resolved — the caller merges the base file itself,
 * which keeps this free of a general-purpose $ref walker for a schema set
 * that only ever nests one level.
 */
function readFile(relPath) {
  const full = join(SCHEMA_DIR, relPath);
  if (!existsSync(full)) return { properties: {}, required: [] };
  const doc = loadYamlFile20(full);
  const properties = { ...(doc.properties ?? {}) };
  const required = [...(doc.required ?? [])];
  for (const member of doc.allOf ?? []) {
    if (member?.properties) Object.assign(properties, member.properties);
    if (Array.isArray(member?.required)) required.push(...member.required);
  }
  return { properties, required };
}

/** The 5 well-known kinds. Anything namespaced falls back to the base entry. */
const KIND_FILES = {
  entry: 'entries/entry.schema.yaml',
  component: 'entries/component.schema.yaml',
  token: 'entries/token.schema.yaml',
  theme: 'entries/theme.schema.yaml',
  system: 'entries/system.schema.yaml',
};

/**
 * Every field of a 0.20.x entry kind, in schema order, with its meaning.
 *
 * A kind's own file overrides the base for a field both declare — `kind` is
 * the case that matters, where `component.schema.yaml` narrows the shared
 * "one of the 5 well-known kinds" to `const: component`.
 *
 * @param {string} kind - a well-known kind, or a namespaced custom kind
 * @returns {Array<{name: string, required: boolean, description: string, type: string|null}>}
 */
export function describeEntryFields(kind) {
  const key = String(kind ?? 'entry');
  if (cache.has(key)) return cache.get(key).map(f => ({ ...f }));

  const base = readFile(KIND_FILES.entry);
  const own = KIND_FILES[key] && key !== 'entry' ? readFile(KIND_FILES[key]) : { properties: {}, required: [] };

  // Base order first, then any field only the kind declares. Matches the
  // order entryFieldOrder() derives, so the table and the style rule agree.
  const merged = { ...base.properties };
  for (const [name, schema] of Object.entries(own.properties)) {
    merged[name] = { ...(merged[name] ?? {}), ...schema };
  }
  const required = new Set([...base.required, ...own.required]);

  const fields = Object.entries(merged).map(([name, schema]) => ({
    name,
    required: required.has(name),
    description: describeProperty(schema),
    type: typeOf(schema),
  }));

  cache.set(key, fields);
  return fields.map(f => ({ ...f }));
}

/**
 * One property's meaning. Prefers its own `description`; falls back to the
 * `const` it is pinned to, which is how `kind` carries its meaning on a
 * kind-specific file.
 */
function describeProperty(schema) {
  if (!schema || typeof schema !== 'object') return '';
  if (typeof schema.description === 'string' && schema.description.trim()) {
    return schema.description.trim();
  }
  if (schema.const !== undefined) return `Always \`${schema.const}\`.`;
  // A $ref-only property carries its text in the file it points at. Naming
  // the target beats printing an empty cell.
  if (typeof schema.$ref === 'string') {
    const leaf = schema.$ref.split('/').pop()?.replace('.schema.yaml', '');
    return leaf ? `See the \`${leaf}\` schema.` : '';
  }
  return '';
}

function typeOf(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.const !== undefined) return `"${schema.const}"`;
  if (Array.isArray(schema.enum)) return schema.enum.map(v => `"${v}"`).join(' | ');
  if (schema.type === 'array' || schema.items) {
    const item = schema.items?.type ?? (schema.items?.$ref ? 'object' : null);
    return item ? `${item}[]` : 'array';
  }
  // A `$ref`-only property has no `type` of its own; every ref in this schema
  // set points at an object. Reporting nothing left a dash in the table for
  // `metadata`, `extends`, `related` and `refs` — four of the fields most
  // worth knowing the shape of.
  if (typeof schema.$ref === 'string') return 'object';
  if (Array.isArray(schema.oneOf ?? schema.anyOf)) {
    const members = schema.oneOf ?? schema.anyOf;
    if (members.every(m => m?.type === 'string')) return 'string';
    if (members.some(m => m?.type === 'array' || m?.items)) return 'object[]';
    return 'object';
  }
  return typeof schema.type === 'string' ? schema.type : null;
}

/**
 * The section kinds a 0.20.x entry can carry, with what each is for.
 *
 * Read from sections/*.schema.yaml rather than listed here, so a section kind
 * added upstream shows up without an edit.
 *
 * @returns {Array<{kind: string, title: string, description: string}>}
 */
export function describeSectionKinds() {
  const files = ['guidelines', 'definitions', 'steps', 'section'];
  const out = [];
  for (const name of files) {
    const full = join(SCHEMA_DIR, `sections/${name}.schema.yaml`);
    if (!existsSync(full)) continue;
    const doc = loadYamlFile20(full);
    out.push({
      kind: name,
      title: doc.title ?? name,
      description: (doc.description ?? '').trim(),
    });
  }
  return out;
}
