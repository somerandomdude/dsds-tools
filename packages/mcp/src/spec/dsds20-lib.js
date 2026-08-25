// Shared helpers for the real DSDS 0.20.0 format — YAML documents following
// the upstream design-system-documentation-schema repo's 0.20.0 branch
// (entries/sections/traits/sourceFiles/common-ref), as opposed to the
// legacy 0.15.2 JSON format (entityGroups/documentBlocks/relationships)
// the rest of this server already speaks. Ported from that branch's
// scripts/lib.js — see packages/mcp/skills/ for the same branch's own
// authoring skills, which describe this model in prose.
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import yaml from 'js-yaml';

// JSON_SCHEMA disables YAML's implicit !!timestamp type, which otherwise
// parses a bare `2026-06-02` into a JS Date instead of the plain string the
// schema's isoDate format expects.
export function loadYaml20(text) {
  return yaml.load(text, { schema: yaml.JSON_SCHEMA });
}

export function loadYamlFile20(absPath) {
  return loadYaml20(readFileSync(absPath, 'utf8'));
}

/** Recursively collects every *.schema.yaml file under dir (excludes conformance-rules.yaml). */
export function walkSchemaYamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walkSchemaYamlFiles(full);
    return entry.name.endsWith('.schema.yaml') ? [full] : [];
  });
}

/** A document has a top-level `schemaVersion` iff it's a base document (vs. a standalone entry file). */
export function isBaseDoc20(doc) {
  return doc != null && typeof doc.schemaVersion !== 'undefined';
}

/**
 * Every entity in a document, whether it's a standalone entry or a base
 * document with several inline. Includes `shared` entries alongside
 * `entries` — both share one id/refs/sections addressing space.
 */
export function entriesIn20(doc) {
  return isBaseDoc20(doc) ? [...(doc.entries ?? []), ...(doc.shared ?? [])] : [doc];
}

/**
 * Finds every {to, rel} shaped object anywhere inside a value, regardless
 * of what field it's under — entry.refs, a section's own refs, a
 * guideline item's refs, etc. `combos` subjects/items (bare strings) are a
 * deliberately different, lighter pointer concept and aren't picked up here.
 */
export function findRefs20(value, at, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => findRefs20(item, `${at}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    if (typeof value.to === 'string' && typeof value.rel === 'string') {
      out.push({ to: value.to, rel: value.rel, at });
    }
    for (const [key, val] of Object.entries(value)) {
      findRefs20(val, at ? `${at}.${key}` : key, out);
    }
  }
}
