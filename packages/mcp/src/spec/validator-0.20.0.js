// Validates a real DSDS 0.20.0 document (YAML or its parsed object form)
// against the split schema files under ./schema-0.20.0/, using the same
// dispatch and semantic-rule logic as the real spec repo's own
// scripts/validate.js (0.20.0 branch) — ported here so this server's
// dsds_validate tool checks 0.20.0 documents against real ground truth
// instead of a guessed shape.
//
// Deliberately single-document: this validates whatever text an agent
// pastes into dsds_validate, with no filesystem access to sibling files a
// `rel: file` ref might point at. That matches the upstream validator's own
// behavior when it has no file path to resolve a project from — an
// unresolved bare `to:` ref is a hard error only when this document
// declares no `rel: file` links at all (i.e. isn't part of a larger,
// unseen project); DSDS-04/05/08/09 and the composes/depends-on cycle
// checks (06/07) all still run fully within this one document's own
// entries. DSDS-10 (same-as level match) needs no project-scope fallback
// at all — an unresolved same-as target is already ITEM_REF_RESOLVES's
// job to flag, so this rule only fires once resolution has succeeded.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entriesIn20, findRefs20, isValidKind20, loadYaml20, walkSchemaYamlFiles } from './dsds20-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolvePath(__dirname, 'schema-0.20.0');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const schemaById = new Map();
for (const file of walkSchemaYamlFiles(SCHEMA_DIR)) {
  const schema = loadYaml20(readFileSync(file, 'utf8'));
  ajv.addSchema(schema, schema.$id);
  schemaById.set(schema.$id, schema);
}

const conformanceRules = loadYaml20(readFileSync(resolvePath(SCHEMA_DIR, 'conformance-rules.yaml'), 'utf8'));
export const RULES = Object.fromEntries(conformanceRules.map((rule) => [rule.name, rule.id]));

function err(id, message) {
  return `[${id}] ${message}`;
}

const SPEC_VERSION = (() => {
  for (const id of schemaById.keys()) {
    const m = /\/v([^/]+)\//.exec(id);
    if (m) return m[1];
  }
  throw new Error('Could not determine the 0.20.0 spec version from any loaded schema $id.');
})();

function specUrl(relPath) {
  return `https://designsystemdocspec.org/v${SPEC_VERSION}/${relPath}`;
}

function schemaFor(id, fallbackId) {
  return ajv.getSchema(id) || ajv.getSchema(fallbackId);
}

// A branch is either a plain object schema, or one that extends a shared
// base via allOf — the discriminator field can live on either shape.
function branchDiscriminatorValues(branch, prop) {
  const candidates = [branch, ...(branch.allOf ?? [])];
  for (const candidate of candidates) {
    const propSchema = candidate.properties?.[prop];
    if (!propSchema) continue;
    if (propSchema.const !== undefined) return [propSchema.const];
    if (Array.isArray(propSchema.enum)) return propSchema.enum;
  }
  return null;
}

const branchValidatorCache = new Map();
function compileBranch(branch) {
  let validate = branchValidatorCache.get(branch);
  if (!validate) {
    validate = ajv.compile(branch);
    branchValidatorCache.set(branch, validate);
  }
  return validate;
}

// Brute-forcing every anyOf branch on a typo produces one error per branch
// per required/additional-properties check. Read the discriminator tag
// first and validate only against the one matching branch instead.
function validateDiscriminatedItems(items, branches, prop, label, errors) {
  const fallbackBranch = branches.find((b) => branchDiscriminatorValues(b, prop) === null);
  const knownValues = [...new Set(branches.flatMap((b) => branchDiscriminatorValues(b, prop) ?? []))];

  for (const [i, item] of (items ?? []).entries()) {
    const itemLabel = `${label}[${i}]`;
    const value = item?.[prop];

    let branch;
    if (value === undefined) {
      branch = fallbackBranch;
      if (!branch) {
        errors.push(`${itemLabel} is missing "${prop}" (expected one of [${knownValues.join(', ')}])`);
        continue;
      }
    } else {
      branch = branches.find((b) => (branchDiscriminatorValues(b, prop) ?? []).includes(value));
      if (!branch) {
        errors.push(`${itemLabel} has "${prop}": ${JSON.stringify(value)}, which is not one of [${knownValues.join(', ')}]`);
        continue;
      }
    }

    const validateBranch = compileBranch(branch);
    if (!validateBranch(item)) {
      const tag = value !== undefined ? value : '(untagged)';
      for (const e of validateBranch.errors) {
        errors.push(`${itemLabel} (${prop}: ${tag}) schema: ${e.instancePath || '/'} ${e.message}`);
      }
    }
  }
}

function traitsBranches() {
  const schema = schemaById.get(specUrl('entries/component.schema.yaml'));
  return schema.allOf[1].properties.traits.items.anyOf;
}

function validateSections(sections, label, errors) {
  for (const [i, section] of (sections ?? []).entries()) {
    const sectionSchemaId = specUrl(`sections/${section.kind}.schema.yaml`);
    const validateSection = schemaFor(sectionSchemaId, specUrl('section.schema.yaml'));
    const sectionLabel = `${label} section[${i}] (${section.kind})`;

    if (!validateSection(section)) {
      for (const e of validateSection.errors) {
        errors.push(`${sectionLabel} schema: ${e.instancePath || '/'} ${e.message}`);
      }
    }
  }
}

const NESTED_SECTION_ERROR = /^\/sections\/\d/;

// Note: does NOT call validateItemRefs — when this runs per-entry inside
// validateBase's loop, each entry would otherwise see only itself as
// "local" and falsely flag every sibling-entry ref as unresolved. Base
// documents get ref checking once, over the whole doc, at the end of
// validateBase. A standalone entry gets it separately (see validateDoc20)
// since entriesIn20() already treats `[entry]` as its own tiny document.
function validateEntry(entry, errors) {
  const entrySchemaId = specUrl(`entries/${entry.kind}.schema.yaml`);
  const validate = schemaFor(entrySchemaId, specUrl('entry.schema.yaml'));
  const isComponent = entry.kind === 'component';

  if (!validate(entry)) {
    for (const e of validate.errors) {
      if (isComponent && e.instancePath.startsWith('/traits')) continue;
      if (NESTED_SECTION_ERROR.test(e.instancePath)) continue;
      errors.push(`entry "${entry.id}" schema: ${e.instancePath || '/'} ${e.message}`);
    }
    if (isComponent && Array.isArray(entry.traits)) {
      validateDiscriminatedItems(entry.traits, traitsBranches(), 'kind', `entry "${entry.id}" traits`, errors);
    }
  }
  validateSections(entry.sections, `entry "${entry.id}"`, errors);
  validateSemanticRules(entry, errors);
}

function validateShared(entry, errors) {
  const validate = ajv.getSchema(specUrl('shared.schema.yaml'));
  if (!validate(entry)) {
    for (const e of validate.errors) {
      if (NESTED_SECTION_ERROR.test(e.instancePath)) continue;
      errors.push(`shared "${entry.id}" schema: ${e.instancePath || '/'} ${e.message}`);
    }
  }
  validateSections(entry.sections, `shared "${entry.id}"`, errors);
  validateSemanticRules(entry, errors);
}

// Checks that need to see across an entry's sections/fields at once.
function validateSemanticRules(entry, errors) {
  const sections = entry.sections ?? [];

  for (const section of sections) {
    if (section.kind !== 'guidelines') continue;
    for (const [i, item] of (section.items ?? []).entries()) {
      if (item.checkedBy !== 'automated') continue;
      const hasCheckRef = [...(item.refs ?? []), ...(item.checks ?? [])].some((r) => r.rel === 'test' || r.rel === 'lint-rule');
      if (!hasCheckRef) {
        errors.push(
          err(RULES.CHECKED_BY_NEEDS_REF, `entry "${entry.id}" ${section.kind} item[${i}] declares checkedBy: automated but has no refs/checks entry (rel: test, lint-rule) pointing at what actually runs the check`),
        );
      }
    }
  }

  const sourceFilesByPlatform = new Map();
  for (const sourceFile of entry.sourceFiles ?? []) {
    const key = sourceFile.platform ?? '(unspecified)';
    sourceFilesByPlatform.set(key, (sourceFilesByPlatform.get(key) ?? 0) + 1);
  }
  for (const [platform, count] of sourceFilesByPlatform) {
    if (count > 1) {
      errors.push(err(RULES.ONE_API_PER_PLATFORM, `entry "${entry.id}" declares ${count} sourceFiles entries for platform "${platform}" — only one is allowed per platform`));
    }
  }
}

const NESTED_ENTRY_OR_SHARED_ERROR = /^\/(entries|shared)\/\d/;

function validateBase(doc, errors, warnings) {
  const validate = ajv.getSchema(specUrl('base.schema.yaml'));
  if (!validate(doc)) {
    for (const e of validate.errors) {
      if (NESTED_ENTRY_OR_SHARED_ERROR.test(e.instancePath)) continue;
      errors.push(`base schema: ${e.instancePath || '/'} ${e.message}`);
    }
  }
  for (const entry of doc.entries ?? []) validateEntry(entry, errors);
  for (const entry of doc.shared ?? []) validateShared(entry, errors);

  const seenIds = new Set();
  for (const entity of entriesIn20(doc)) {
    if (seenIds.has(entity.id)) {
      errors.push(err(RULES.UNIQUE_ENTRY_ID, `id "${entity.id}" is declared more than once in this document (entries and shared entries share one id space)`));
    }
    seenIds.add(entity.id);
  }

  const declaredPlatforms = (doc.entries ?? [])
    .filter((e) => e.kind === 'system')
    .flatMap((e) => e.metadata?.platforms ?? []);
  if (declaredPlatforms.length) {
    const known = new Set(declaredPlatforms);
    for (const entry of doc.entries ?? []) {
      for (const [i, sourceFile] of (entry.sourceFiles ?? []).entries()) {
        if (sourceFile.platform && !known.has(sourceFile.platform)) {
          errors.push(
            err(RULES.PLATFORM_VOCABULARY, `entry "${entry.id}" sourceFiles[${i}] declares platform "${sourceFile.platform}", which is not in the system entry's metadata.platforms [${[...known].join(', ')}]`),
          );
        }
      }
      for (const [i, item] of (entry.imports ?? []).entries()) {
        if (item.platform && !known.has(item.platform)) {
          errors.push(
            err(RULES.PLATFORM_VOCABULARY, `entry "${entry.id}" imports[${i}] declares platform "${item.platform}", which is not in the system entry's metadata.platforms [${[...known].join(', ')}]`),
          );
        }
      }
      const entryStatus = entry.metadata?.status;
      if (entryStatus?.platform && !known.has(entryStatus.platform)) {
        errors.push(
          err(RULES.PLATFORM_VOCABULARY, `entry "${entry.id}" metadata.status declares platform "${entryStatus.platform}", which is not in the system entry's metadata.platforms [${[...known].join(', ')}]`),
        );
      }
    }
  }

  validateItemRefs(doc, errors, warnings);
  validateCombos(doc, errors, warnings);
  validateSameAsLevels(doc, errors);
  validateGraphCycles(doc, errors);
}

function findCycle(edges) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  let cycle = null;

  function visit(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (cycle) return;
      const state = color.get(next) ?? WHITE;
      if (state === WHITE) {
        visit(next);
      } else if (state === GRAY) {
        const start = stack.indexOf(next);
        cycle = stack.slice(start).concat(next);
      }
      if (cycle) return;
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of edges.keys()) {
    if (cycle) break;
    if ((color.get(node) ?? WHITE) === WHITE) visit(node);
  }
  return cycle;
}

function validateGraphCycles(doc, errors) {
  const entities = entriesIn20(doc);
  const relsToCheck = [
    { rel: 'composes', ruleId: RULES.COMPOSES_CYCLE },
    { rel: 'depends-on', ruleId: RULES.DEPENDS_ON_CYCLE },
  ];

  for (const { rel, ruleId } of relsToCheck) {
    const edges = new Map();
    for (const entity of entities) {
      const found = [];
      findRefs20(entity, '', found);
      for (const { to, rel: foundRel } of found) {
        if (foundRel !== rel || to.includes('#')) continue;
        if (!edges.has(entity.id)) edges.set(entity.id, new Set());
        edges.get(entity.id).add(to);
      }
    }
    const cycle = findCycle(edges);
    if (cycle) {
      errors.push(err(ruleId, `"${rel}" ref chain forms a cycle: ${cycle.join(' -> ')}`));
    }
  }
}

function collectItemIds(entry) {
  const ids = new Set();
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') ids.add(item.id);
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        for (const child of value) walk(child);
      }
    }
  }
  for (const section of entry.sections ?? []) {
    for (const item of section.items ?? []) walk(item);
    for (const item of section.freeform ?? []) walk(item);
  }
  for (const trait of entry.traits ?? []) walk(trait);
  return ids;
}

// Same traversal as collectItemIds, but keeps the actual item object (not
// just its id) — validateSameAsLevels needs to read a resolved item's own
// `level`, not just confirm the id exists.
function collectItemsById(entry) {
  const byId = new Map();
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') byId.set(item.id, item);
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        for (const child of value) walk(child);
      }
    }
  }
  for (const section of entry.sections ?? []) {
    for (const item of section.items ?? []) walk(item);
    for (const item of section.freeform ?? []) walk(item);
  }
  for (const trait of entry.traits ?? []) walk(trait);
  return byId;
}

// A combo target names one of three things (DSDS-09): a trait on the SAME
// entry (bare id for a boolean trait, `traitId.valueId` for an enum value),
// a token entry wrapped in braces (`{color.action.primary}`), or a bare
// entry id. Trait ids can themselves contain dots (id.schema.yaml allows
// chained segments), so `traitId.valueId` is only treated as a trait
// reference when the owning entry actually has that trait — otherwise it
// falls through to entry-id resolution, same as a target with no dot at all.
function resolveComboTarget(target, entry) {
  if (typeof target !== 'string') return { kind: 'invalid' };
  const braceMatch = /^\{(.+)\}$/.exec(target);
  if (braceMatch) return { kind: 'token', id: braceMatch[1] };

  const dotIdx = target.indexOf('.');
  if (dotIdx !== -1) {
    const traitId = target.slice(0, dotIdx);
    const valueId = target.slice(dotIdx + 1);
    const trait = (entry.traits ?? []).find((t) => t.id === traitId);
    if (trait) return { kind: 'traitValue', trait, valueId };
  }

  const boolTrait = (entry.traits ?? []).find((t) => t.id === target);
  if (boolTrait) return { kind: 'trait', trait: boolTrait };

  return { kind: 'entry', id: target };
}

// DSDS-09: resolve every combo's subject and items. The trait form is
// always fully visible on the owning entry, so a miss there is a hard
// error unconditionally; the token/entry forms follow the same
// project-scope search (and warn-not-error-when-incomplete treatment) as
// ENTRY_REF_RESOLVES/ITEM_REF_RESOLVES.
function validateCombos(doc, errors, warnings, { alwaysWarn = false } = {}) {
  const isSplitAcrossFiles = alwaysWarn || (doc.refs ?? []).some((r) => r?.rel === 'file');
  const unresolvedHint = alwaysWarn
    ? 'a standalone entry file can\'t prove it\'s self-contained — this may resolve in a sibling file this validator can\'t see without disk access'
    : 'this document declares rel: file links this validator can\'t follow without disk access';
  const localEntities = entriesIn20(doc);
  const localIds = new Set(localEntities.map((e) => e.id));

  for (const entity of localEntities) {
    for (const combo of entity.combos ?? []) {
      const targets = [combo.subject, ...(combo.items ?? [])];
      for (const target of targets) {
        const resolved = resolveComboTarget(target, entity);
        const label = `entry "${entity.id}" combo (subject: ${combo.subject}) target "${target}"`;

        if (resolved.kind === 'trait') continue;

        if (resolved.kind === 'traitValue') {
          const hasValue = (resolved.trait.values ?? []).some((v) => v.id === resolved.valueId);
          if (!hasValue) {
            errors.push(err(RULES.COMBO_TARGET_RESOLVES, `${label} references value "${resolved.valueId}" on trait "${resolved.trait.id}", which has no such value`));
          }
          continue;
        }

        if (localIds.has(resolved.id)) continue;
        if (!isSplitAcrossFiles) {
          errors.push(err(RULES.COMBO_TARGET_RESOLVES, `${label} targets unknown ${resolved.kind} "${resolved.id}"`));
        } else {
          warnings.push(err(RULES.COMBO_TARGET_RESOLVES, `${label} targets unknown ${resolved.kind} "${resolved.id}" (${unresolvedHint})`));
        }
      }
    }
  }
}

// DSDS-10: a guidelines item borrowing its statement via `same-as` still
// carries its own `level` (required on every guidelines item — same-as
// only exempts `statement`), so nothing schema-level stops that copy from
// drifting from the target's. Only checked when the target resolves and
// itself has a `level` — an unresolved same-as ref is already reported by
// ITEM_REF_RESOLVES, and a target with no `level` (e.g. a non-guidelines
// item) has nothing to compare against.
function validateSameAsLevels(doc, errors) {
  const localEntities = entriesIn20(doc);
  const itemsByEntity = new Map(localEntities.map((e) => [e.id, collectItemsById(e)]));

  for (const entity of localEntities) {
    for (const section of entity.sections ?? []) {
      if (section.kind !== 'guidelines') continue;
      for (const [i, item] of (section.items ?? []).entries()) {
        if (typeof item.level !== 'string') continue;
        const sameAs = (item.refs ?? []).find((r) => r?.rel === 'same-as' && typeof r.to === 'string');
        if (!sameAs) continue;
        const hashIdx = sameAs.to.indexOf('#');
        if (hashIdx === -1) continue;
        const targetEntityId = sameAs.to.slice(0, hashIdx);
        const targetItemId = sameAs.to.slice(hashIdx + 1);
        const targetItem = itemsByEntity.get(targetEntityId)?.get(targetItemId);
        if (!targetItem || typeof targetItem.level !== 'string') continue;
        if (targetItem.level !== item.level) {
          errors.push(
            err(RULES.SAME_AS_LEVEL_MATCHES, `entry "${entity.id}" guidelines item[${i}] has level "${item.level}" but its same-as target "${sameAs.to}" has level "${targetItem.level}" — these must match`),
          );
        }
      }
    }
  }
}

// Single-document resolution only — no filesystem access to a `rel: file`
// sibling. A document that declares one is treated as "part of a larger
// project we can't see," so an unresolved ref there is a warning, not a
// hard error; a fully self-contained base document has nowhere else the
// target could be, so unresolved there is a real error.
//
// A standalone entry file is different: in the real corpus, the split-file
// relationship is declared by the *index* (`rel: file` pointing OUT at each
// leaf), not by each leaf pointing back — so a lone entry almost always has
// ordinary `to:` refs to siblings it legitimately can't see, with no
// `rel: file` of its own to signal that. Treating that as a hard error
// produces mass false positives (245 across 56 of 135 real corpus files,
// measured directly). A standalone file can never prove it's fully
// self-contained, so `alwaysWarn` forces the same lenient treatment a base
// document only gets when it explicitly declares a split.
function validateItemRefs(doc, errors, warnings, { alwaysWarn = false } = {}) {
  const isSplitAcrossFiles = alwaysWarn || (doc.refs ?? []).some((r) => r?.rel === 'file');
  const unresolvedHint = alwaysWarn
    ? 'a standalone entry file can\'t prove it\'s self-contained — this may resolve in a sibling file this validator can\'t see without disk access'
    : 'this document declares rel: file links this validator can\'t follow without disk access';
  const localEntities = entriesIn20(doc);
  const localIds = new Set(localEntities.map((e) => e.id));
  const localItemIdsByEntity = new Map(localEntities.map((e) => [e.id, collectItemIds(e)]));

  for (const entity of localEntities) {
    const found = [];
    findRefs20(entity, '', found);
    for (const { to, rel, at } of found) {
      if (to.includes('://')) continue;
      const label = `"${entity.id}" ref${at ? ` (${at})` : ''} "${to}" (rel: ${rel})`;
      const hashIdx = to.indexOf('#');

      if (hashIdx === -1) {
        if (!to || localIds.has(to)) continue;
        if (!isSplitAcrossFiles) {
          errors.push(err(RULES.ENTRY_REF_RESOLVES, `${label} targets unknown entry/shared "${to}"`));
        } else {
          warnings.push(err(RULES.ENTRY_REF_RESOLVES, `${label} targets unknown entry/shared "${to}" (${unresolvedHint})`));
        }
        continue;
      }

      const targetId = to.slice(0, hashIdx);
      const itemId = to.slice(hashIdx + 1);
      if (!targetId || !itemId) continue;

      const localItemIds = localItemIdsByEntity.get(targetId);
      if (localItemIds) {
        if (!localItemIds.has(itemId)) {
          errors.push(err(RULES.ITEM_REF_RESOLVES, `${label} targets unknown item "${itemId}" on "${targetId}"`));
        }
        continue;
      }

      if (!isSplitAcrossFiles) {
        errors.push(err(RULES.ITEM_REF_RESOLVES, `${label} targets unknown entry/shared "${targetId}"`));
      } else {
        warnings.push(err(RULES.ITEM_REF_RESOLVES, `${label} targets unknown entry/shared "${targetId}" (${unresolvedHint})`));
      }
    }
  }
}

/**
 * Validates an already-parsed 0.20.0 document (base or standalone entry).
 * Returns { errors: string[], warnings: string[] } — mirrors the upstream
 * validator's return shape so a bug report can cite the same [DSDS-XX] ids.
 */
export function validateDoc20(doc) {
  const errors = [];
  const warnings = [];
  const isBase = typeof doc.schemaVersion !== 'undefined';
  if (isBase) {
    validateBase(doc, errors, warnings);
  } else {
    validateEntry(doc, errors);
    // Standalone entry files (142 of 143 in the real corpus) previously got
    // no reference checking at all — validateItemRefs was only reached via
    // validateBase. entriesIn20() already treats a non-base doc as its own
    // one-entry document, so this needs no changes to validateItemRefs itself.
    validateItemRefs(doc, errors, warnings, { alwaysWarn: true });
    validateCombos(doc, errors, warnings, { alwaysWarn: true });
    validateSameAsLevels(doc, errors);
  }
  return { errors, warnings };
}

/** Whether a parsed object looks like a 0.20.0 document (vs. legacy 0.15.2 JSON). */
export function looksLike20(doc) {
  if (doc == null || typeof doc !== 'object') return false;
  if (typeof doc.schemaVersion !== 'undefined' && Array.isArray(doc.entries)) return true;
  // Standalone entry: real 0.20.0 kinds, addressed by `id` not `identifier`,
  // with no legacy wrapper (`entity`/`entityGroups`/`documentation`).
  return (
    typeof doc.id === 'string' &&
    typeof doc.kind === 'string' &&
    isValidKind20(doc.kind) &&
    !doc.entity &&
    !doc.entityGroups &&
    !doc.documentation
  );
}
