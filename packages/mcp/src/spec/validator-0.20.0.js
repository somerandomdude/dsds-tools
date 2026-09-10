// Validates a real DSDS 0.20.0 document (YAML or its parsed object form)
// against the split schema files under ./schema-0.20.1/, using the same
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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entriesIn20, findRefs20, isValidKind20, loadYaml20, statusEntriesOf20, walkSchemaYamlFiles } from './dsds20-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolvePath(__dirname, 'schema-0.20.1');

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
    const validateSection = schemaFor(sectionSchemaId, specUrl('sections/section.schema.yaml'));
    const sectionLabel = `${label} section[${i}] (${section.kind})`;

    if (!validateSection(section)) {
      for (const e of validateSection.errors) {
        errors.push(`${sectionLabel} schema: ${e.instancePath || '/'} ${e.message}`);
      }
    }
  }
}

const NESTED_SECTION_ERROR = /^\/sections\/\d/;

// ── DSDS-11 (FILE_REF_EXISTS) — ported from the upstream spec repo's
// scripts/validate.js (0.20.0 branch). Warning-only: this is the one rule
// that opens files the validator otherwise has no reason to read, so it
// only runs when the caller supplies a real filePath to resolve relative
// paths against (a pasted-document tool has no path at all — same
// "nothing wider to check against" tolerance DSDS-05/08/09 already give a
// standalone entry).
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function resolveHref20(href, fromAbsPath) {
  return resolvePath(dirname(fromAbsPath), href);
}

function isWithinRoot20(absPath, root) {
  const rel = relative(root, absPath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function checkFileExists20(href, filePath, warnings, label) {
  if (!filePath || typeof href !== 'string' || URL_SCHEME_RE.test(href)) return;
  const abs = resolveHref20(href, filePath);
  const root = dirname(filePath);
  if (!isWithinRoot20(abs, root)) return; // outside this check's boundary — not evaluated, not assumed broken
  if (!existsSync(abs)) {
    warnings.push(err(RULES.FILE_REF_EXISTS, `${label} points at "${href}", which doesn't exist on disk (checked ${abs})`));
  }
}

// Every {href, rel: "file"} object anywhere in a value's own tree.
function findFileHrefRefs20(value, out) {
  if (Array.isArray(value)) {
    value.forEach((item) => findFileHrefRefs20(item, out));
    return;
  }
  if (value && typeof value === 'object') {
    if (value.rel === 'file' && typeof value.href === 'string') out.push(value.href);
    for (const val of Object.values(value)) findFileHrefRefs20(val, out);
  }
}

// sourceFiles[].file and a token's source (common/ref.schema.yaml values)
// accept either a bare string (shorthand for href) or the full {href, ...}
// object — both point at a real file regardless of any `rel` they carry.
function refHref20(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.href === 'string') return value.href;
  return undefined;
}

function validateFileRefs20(entity, warnings, opts) {
  if (!opts?.filePath) return;
  if (entity.kind === 'component') {
    for (const [i, sf] of (entity.sourceFiles ?? []).entries()) {
      checkFileExists20(refHref20(sf.file), opts.filePath, warnings, `"${entity.id}" sourceFiles[${i}].file`);
    }
  }
  if (entity.kind === 'token' && entity.source !== undefined) {
    checkFileExists20(refHref20(entity.source), opts.filePath, warnings, `"${entity.id}" source`);
  }
  // Exclude sourceFiles/source from this generic walk — already checked
  // explicitly above regardless of bare-string vs {href, rel: file} form.
  // Walking them again here would double up a finding when the object
  // form happens to also carry rel: file.
  const { sourceFiles, source, ...rest } = entity;
  const fileHrefs = [];
  findFileHrefRefs20(rest, fileHrefs);
  for (const href of fileHrefs) {
    checkFileExists20(href, opts.filePath, warnings, `"${entity.id}" ref (rel: file)`);
  }
}

// Note: does NOT call validateItemRefs — when this runs per-entry inside
// validateBase's loop, each entry would otherwise see only itself as
// "local" and falsely flag every sibling-entry ref as unresolved. Base
// documents get ref checking once, over the whole doc, at the end of
// validateBase. A standalone entry gets it separately (see validateDoc20)
// since entriesIn20() already treats `[entry]` as its own tiny document.
function validateEntry(entry, errors, warnings, opts) {
  const entrySchemaId = specUrl(`entries/${entry.kind}.schema.yaml`);
  const validate = schemaFor(entrySchemaId, specUrl('entries/entry.schema.yaml'));
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
  validateFileRefs20(entry, warnings, opts);
}

function validateShared(entry, errors, warnings, opts) {
  const validate = ajv.getSchema(specUrl('shared.schema.yaml'));
  if (!validate(entry)) {
    for (const e of validate.errors) {
      if (NESTED_SECTION_ERROR.test(e.instancePath)) continue;
      errors.push(`shared "${entry.id}" schema: ${e.instancePath || '/'} ${e.message}`);
    }
  }
  validateSections(entry.sections, `shared "${entry.id}"`, errors);
  validateSemanticRules(entry, errors);
  validateFileRefs20(entry, warnings, opts);
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

function validateBase(doc, errors, warnings, opts) {
  const validate = ajv.getSchema(specUrl('base.schema.yaml'));
  if (!validate(doc)) {
    for (const e of validate.errors) {
      if (NESTED_ENTRY_OR_SHARED_ERROR.test(e.instancePath)) continue;
      errors.push(`base schema: ${e.instancePath || '/'} ${e.message}`);
    }
  }
  for (const entry of doc.entries ?? []) validateEntry(entry, errors, warnings, opts);
  for (const entry of doc.shared ?? []) validateShared(entry, errors, warnings, opts);

  // DSDS-11 for the base document's OWN top-level `refs` — entry-level
  // refs are already covered by validateFileRefs20() inside
  // validateEntry/validateShared above. Walk only doc.refs, not the whole
  // document: findFileHrefRefs20 recurses, so passing doc would re-find
  // every entry's refs and double-report them.
  if (opts?.filePath) {
    const docFileHrefs = [];
    findFileHrefRefs20(doc.refs, docFileHrefs);
    for (const href of docFileHrefs) {
      checkFileExists20(href, opts.filePath, warnings, 'base document ref (rel: file)');
    }
  }

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
      // metadata.status is one object or — since the per-platform array
      // form was added — a list of them, one per platform.
      for (const [i, statusEntry] of statusEntriesOf20(entry.metadata?.status).entries()) {
        if (statusEntry?.platform && !known.has(statusEntry.platform)) {
          const where = Array.isArray(entry.metadata?.status) ? `metadata.status[${i}]` : 'metadata.status';
          errors.push(
            err(RULES.PLATFORM_VOCABULARY, `entry "${entry.id}" ${where} declares platform "${statusEntry.platform}", which is not in the system entry's metadata.platforms [${[...known].join(', ')}]`),
          );
        }
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

// ── Advisory tier (DSDS-12..16) — ported from the upstream spec repo's own
// scripts/validate/lint-docs.js (tag v0.20.1). Schema validation and DSDS-01..11
// answer "is this document allowed/internally consistent?" These answer
// "is this documentation good?" — they never block a document (they land
// in `advisories`, not `errors` or `warnings`), and every rule here is
// looked up by name against schema-0.20.1/conformance-rules.yaml's own
// `enforcement: advisory` entries via RULES, so a rule removed from the
// catalog silently stops firing here too, with no code change needed.
function normalizeProse(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every `guidelines` section item across an entry's sections, with a
// pointer for each.
function eachGuidelineItem20(entry, fn) {
  (entry.sections ?? []).forEach((section, si) => {
    if (!section || section.kind !== 'guidelines') return;
    (section.items ?? []).forEach((item, ii) => {
      if (item) fn(item, `/sections/${si}/items/${ii}`);
    });
  });
}

const LOWERCASE_RFC_REGEX = /(?<![A-Za-z])(must|should)(?: not)?(?![A-Za-z])/g;

const ADVISORY_CHECKS = {
  'rfc-keywords-lowercase-in-normative-prose': (entry, emit) => {
    eachGuidelineItem20(entry, (item, p) => {
      if (typeof item.statement !== 'string') return;
      const hits = item.statement.match(LOWERCASE_RFC_REGEX);
      if (hits) {
        emit(`${p}/statement`, `guideline in "${entry.id}" uses lowercase '${hits[0]}' in its statement — capitalize RFC 2119 keywords in normative prose (${hits[0].toUpperCase()}) so the conformance weight is explicit.`);
      }
    });
  },

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

  'guideline-missing-checkedby': (entry, emit) => {
    eachGuidelineItem20(entry, (item, p) => {
      if ((item.level === 'must' || item.level === 'must-not') && !item.checkedBy) {
        emit(`${p}/checkedBy`, `guideline in "${entry.id}" is a hard requirement (level: ${item.level}) with no checkedBy — declare 'automated', 'assisted', or 'manual' so a tool can tell whether this rule is verifiable at all.`);
      }
    });
  },

  'component-missing-when-to-use': (entry, emit) => {
    if (entry.kind !== 'component') return;
    const hasWhenToUse = (entry.sections ?? []).some((s) => s && s.kind === 'guidelines' && s.framing === 'when-to-use');
    if (!hasWhenToUse) {
      emit('/sections', `component "${entry.id}" has no guidelines section with framing: when-to-use — "when do I use this?" is usually the first question documentation must answer. Add one, or note in metadata why it doesn't apply.`);
    }
  },

  // DSDS-16 (new in 0.20.1) — the scale-position companion to DSDS-13's
  // token-description-restates-identifier: a description that reduces to a
  // single leading scale word plus a number carries only the ordinal the id
  // and the token's place in its scale already say.
  //
  // Kept deliberately narrow: the scale word must lead and be singular, so
  // number-first forms ("900 shade"), plurals, and anything with a role or
  // usage word are left alone. A description that restates the id or name is
  // DSDS-13's case and returns early here, so a description that is both is
  // reported once rather than twice.
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

function validateAdvisories(doc, advisories) {
  for (const entry of entriesIn20(doc)) {
    for (const [name, check] of Object.entries(ADVISORY_CHECKS)) {
      const ruleId = RULES[name];
      if (!ruleId) continue; // catalog drift — rule removed upstream, not this tool's job to guess a replacement
      check(entry, (path, message) => advisories.push(err(ruleId, `${path}: ${message}`)));
    }
  }
}

/**
 * Validates an already-parsed 0.20.0 document (base or standalone entry).
 * Returns { errors: string[], warnings: string[], advisories: string[] } —
 * mirrors the upstream validator's error/warning shape so a bug report can
 * cite the same [DSDS-XX] ids; `advisories` is additive (upstream keeps the
 * advisory tier in a separate lint-docs.js run) and never affects validity.
 *
 * `filePath` (optional) is the absolute path of the file being validated —
 * pass it to also run DSDS-11 (a `sourceFiles`/`source`/`rel: file` href
 * actually exists on disk, resolved relative to this path). Omit it for a
 * pasted-document tool with no real path to resolve against; DSDS-11
 * simply doesn't run, the same way DSDS-05/08/09 tolerate having nothing
 * wider to check a ref against.
 */
export function validateDoc20(doc, { filePath } = {}) {
  const errors = [];
  const warnings = [];
  const advisories = [];
  const opts = { filePath };
  const isBase = typeof doc.schemaVersion !== 'undefined';
  if (isBase) {
    validateBase(doc, errors, warnings, opts);
  } else {
    validateEntry(doc, errors, warnings, opts);
    // Standalone entry files (142 of 143 in the real corpus) previously got
    // no reference checking at all — validateItemRefs was only reached via
    // validateBase. entriesIn20() already treats a non-base doc as its own
    // one-entry document, so this needs no changes to validateItemRefs itself.
    validateItemRefs(doc, errors, warnings, { alwaysWarn: true });
    validateCombos(doc, errors, warnings, { alwaysWarn: true });
    validateSameAsLevels(doc, errors);
  }
  validateAdvisories(doc, advisories);
  return { errors, warnings, advisories };
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
