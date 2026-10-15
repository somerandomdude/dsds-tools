// Validates a DSDS document (its parsed object form) with upstream's own
// reference validator, vendored verbatim with the schema in
// ./dsds-<BUNDLED_VERSION>/scripts/validate/validate.js.
//
// Until 0.22.0 this file was a hand port of that validator. Each release had
// to be ported again, and the port drifted: by 0.22.0 it was missing four
// rules and the item-address model. Running upstream's code instead means a
// finding here is the finding the spec's own CLI reports, string for string.
//
// Upstream's validator is CommonJS, as the spec repo ships it; the vendored
// directory carries a package.json saying so, and createRequire loads it.
//
// What stays here:
//   - looksLike20(): whether a parsed object is a DSDS document at all.
//   - The advisory tier (DSDS-13..16). Upstream keeps it in lint-docs.js,
//     which runs on load and exports nothing, so it can't be imported yet.
//     These four checks are ported from it; the ordering advisories
//     (DSDS-18/19/21) live in style-guide.js.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { entriesIn20, isValidKind20 } from './dsds-lib.js';
import { SCHEMA_DIR, VENDOR_DIR } from './schema-order.js';

const require = createRequire(import.meta.url);
const upstream = require(join(VENDOR_DIR, 'scripts/validate/validate.js'));
const { loadYaml } = require(join(VENDOR_DIR, 'scripts/lib.js'));

const catalog = loadYaml(join(SCHEMA_DIR, 'conformance-rules.yaml'));
/** Every rule in the vendored catalog, by name: `{ CHAIN_CYCLE: 'DSDS-06', ... }`. */
export const RULES = Object.fromEntries(catalog.map((rule) => [rule.name, rule.id]));
const ACTIVE_ADVISORY = new Set(catalog.filter((r) => r.enforcement === 'advisory').map((r) => r.name));

function err(id, message) {
  return `[${id}] ${message}`;
}

// ── Advisory tier (DSDS-13..16), ported from upstream's
// scripts/validate/lint-docs.js at 0.22.0. These answer "is this
// documentation good?" and never block a document: they land in
// `advisories`, not `errors` or `warnings`. Each is looked up by name in the
// vendored catalog, so a rule upstream retires stops firing here too.
function normalizeProse(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eachGuidelineItem20(entry, fn) {
  (entry.sections ?? []).forEach((section, si) => {
    if (!section || section.kind !== 'guidelines') return;
    (section.items ?? []).forEach((item, ii) => {
      if (item) fn(item, `/sections/${si}/items/${ii}`);
    });
  });
}

// Every item id declared anywhere on an entry, keyed to the item object.
function collectItemsById(entry) {
  const byId = new Map();
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') byId.set(item.id, item);
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) for (const child of value) walk(child);
    }
  }
  for (const section of entry.sections ?? []) {
    for (const item of section.items ?? []) walk(item);
    for (const item of section.freeform ?? []) walk(item);
  }
  for (const trait of entry.traits ?? []) walk(trait);
  return byId;
}

const ENTRY_CHECKS = {
  'token-description-restates-identifier': (entry, emit) => {
    if (entry.kind !== 'token') return;
    const desc = entry.description;
    if (typeof desc !== 'string' || !desc.trim()) return;
    const raw = desc.trim();
    const d = normalizeProse(desc);
    if (!d) return;
    const id = normalizeProse(entry.id ?? '');
    const name = normalizeProse(entry.name ?? '');
    const restatesName = (id && d === id) || (name && d === name);
    const isBareValue =
      /^#[0-9a-f]{3,8}$/i.test(raw) ||
      /^(rgb|hsl)a?\([^)]*\)$/i.test(raw) ||
      /^-?\d*\.?\d+(px|rem|em|%|pt|vh|vw)?$/i.test(raw);
    if (restatesName || isBareValue) {
      emit('/description', `token "${entry.id}" has a description that only ${restatesName ? 'restates its id or name' : 'gives a raw value'} — a token description should state the token's role or when to use it, not repeat what the id or the DTCG source value already says. Drop it (description is optional here) or state its purpose.`);
    }
  },

  'component-missing-when-to-use': (entry, emit) => {
    if (entry.kind !== 'component') return;
    const hasWhenToUse = (entry.sections ?? []).some((s) => s && s.kind === 'guidelines' && s.framing === 'when-to-use');
    if (!hasWhenToUse) {
      emit('/sections', `component "${entry.id}" has no guidelines section with framing: when-to-use — "when do I use this?" is usually the first question documentation must answer. Add one, or note in metadata why it doesn't apply.`);
    }
  },

  // The scale-position companion to token-description-restates-identifier.
  // Narrow on purpose: the scale word must lead and be singular. A
  // description that restates the id or name is the other rule's case.
  'token-description-restates-scale-position': (entry, emit) => {
    if (entry.kind !== 'token') return;
    const desc = entry.description;
    if (typeof desc !== 'string' || !desc.trim()) return;
    const d = normalizeProse(desc);
    if (!d) return;
    const id = normalizeProse(entry.id ?? '');
    const name = normalizeProse(entry.name ?? '');
    if ((id && d === id) || (name && d === name)) return;
    const SW = '(?:level|step|shade|tint|grade|weight|size|swatch)';
    const N = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
    const scaleOnly = [new RegExp(`^${SW} ${N}$`), new RegExp(`^${SW} ${N} of the [a-z]+ (?:scale|ramp)$`)];
    if (scaleOnly.some((re) => re.test(d))) {
      emit('/description', `token "${entry.id}" has a description that only restates its scale position — a token description should state the token's role or when to use it, not repeat the ordinal the id and its place in the scale already carry. Drop it (description is optional here) or state its purpose.`);
    }
  },
};

const DOCUMENT_CHECKS = {
  // A must/must-not rule with no checkedBy, unless it reuses (same-as) a rule
  // that declares one. A target in another document can't be seen, so the
  // rule stays quiet there rather than demand the pointer restate it.
  'guideline-missing-checkedby': (entities, emit) => {
    const itemsByEntityId = new Map(entities.map((e) => [e.id, collectItemsById(e)]));
    const inheritsCheckedBy = (item) =>
      (item.refs ?? []).some((ref) => {
        if (!ref || ref.rel !== 'same-as' || typeof ref.to !== 'string') return false;
        const hash = ref.to.indexOf('#');
        if (hash === -1) return false;
        const targetItems = itemsByEntityId.get(ref.to.slice(0, hash));
        if (!targetItems) return true;
        const target = targetItems.get(ref.to.slice(hash + 1));
        return Boolean(target && target.checkedBy);
      });
    for (const entity of entities) {
      eachGuidelineItem20(entity, (item, p) => {
        if ((item.level === 'must' || item.level === 'must-not') && !item.checkedBy && !inheritsCheckedBy(item)) {
          emit(`${p}/checkedBy`, `guideline in "${entity.id}" is a hard requirement (level: ${item.level}) with no checkedBy, and no same-as target that declares one — declare 'automated', 'assisted', or 'manual' so a tool can tell whether this rule is verifiable at all.`);
        }
      });
    }
  },
};

function validateAdvisories(doc, advisories) {
  const entities = entriesIn20(doc).filter((e) => e && typeof e === 'object');
  const emitFor = (name) => (path, message) => advisories.push(err(RULES[name], `${path}: ${message}`));
  for (const [name, check] of Object.entries(DOCUMENT_CHECKS)) {
    if (ACTIVE_ADVISORY.has(name)) check(entities, emitFor(name));
  }
  for (const entry of entities) {
    for (const [name, check] of Object.entries(ENTRY_CHECKS)) {
      if (ACTIVE_ADVISORY.has(name)) check(entry, emitFor(name));
    }
  }
}

/**
 * Validates an already-parsed document (base or standalone entry).
 * Returns { errors, warnings, findings, advisories }. `errors` and
 * `warnings` are upstream's strings, each led by its `[DSDS-XX]` id when a
 * rule produced it; `findings` is upstream's structured form of the same
 * (rule, severity, JSON Pointer, fix, docs link). `advisories` never
 * affects validity.
 *
 * Options, all optional:
 *   - filePath: the absolute path the document was read from. Turns on
 *     DSDS-11 (relative paths exist on disk) and lets refs resolve across the
 *     files it links with `rel: file`. Omit it for a pasted document.
 *   - siblings: parsed documents checked together with this one, so refs
 *     between them resolve, as upstream's CLI does with files given at once.
 *   - sourceRoot: `{ value, from }`, a system's `metadata.sourceRoot` and the
 *     absolute path of the document that declares it, for when that system
 *     entry isn't in this document.
 */
export function validateDoc20(doc, { filePath, siblings, sourceRoot } = {}) {
  const cliEntities = siblings ? siblings.flatMap((d) => entriesIn20(d)) : undefined;
  const { errors, warnings, findings } = upstream.validateDoc(doc, { filePath, cliEntities, sourceRoot });
  const advisories = [];
  validateAdvisories(doc, advisories);
  return { errors, warnings, findings, advisories };
}

/** The `{ value, from }` sourceRoot a system entry in `doc` declares, or null. */
export function sourceRootOf20(doc, filePath) {
  for (const entity of entriesIn20(doc)) {
    const value = entity?.kind === 'system' ? entity.metadata?.sourceRoot : undefined;
    if (typeof value === 'string' && filePath) return { value, from: filePath };
  }
  return null;
}

/** Whether a parsed object has the DSDS document shape at all. */
export function looksLike20(doc) {
  if (doc == null || typeof doc !== 'object') return false;
  if (typeof doc.schemaVersion !== 'undefined' && Array.isArray(doc.entries)) return true;
  // Standalone entry: a DSDS kind, addressed by `id` not `identifier`,
  // with no wrapper object around it.
  return (
    typeof doc.id === 'string' &&
    typeof doc.kind === 'string' &&
    isValidKind20(doc.kind) &&
    !doc.entity &&
    !doc.entityGroups &&
    !doc.documentation
  );
}
