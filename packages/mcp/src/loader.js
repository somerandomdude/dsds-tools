import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { entriesIn20, isBaseDoc20, loadYaml20, resolveStatusDisplay20 } from './spec/dsds-lib.js';

// Loading normalises every entry so the rest of the server sees one shape:
//   - `identifier` aliases `id`, so lookups by identifier work everywhere.
//   - `relationships` is derived from the internal-pointer `refs` (`to`, not
//     `href`) in the shape graph.js expects. `rel: file` and external `href`
//     refs are excluded; the raw `refs` array stays on the entity.
//   - `__filePath` and `__sharedEntries` carry what the renderers need to
//     resolve a ref against the base document's shared pool.
const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

// `related` is the entry's primary typed-relationship list; `refs` is the
// catch-all for everything else "not covered by related or extends" (per
// common/ref.schema.yaml) but in practice also carries internal `to`
// pointers (e.g. `rel: composes`) alongside file/external ones. Both use
// the same {to, rel, role, required} shape, so both feed the graph.
function relationshipsFromRefs(entity) {
  const edges = [...(entity.related ?? []), ...(entity.refs ?? [])];
  return edges
    .filter(r => r && typeof r.to === 'string' && r.rel !== 'file')
    .map(r => ({
      relation: r.rel,
      target: r.to,
      role: r.role,
      required: !!r.required,
      versionConstraint: r.versionConstraint,
    }));
}

function normalizeEntity20(entity, filePath, sharedEntries) {
  if (!entity || typeof entity !== 'object') return entity;
  entity.identifier ??= entity.id;
  entity.relationships ??= relationshipsFromRefs(entity);
  entity.__dsds20 = true;
  // The entry's own originating file — needed to resolve refs with `rel:
  // file` that point at sibling non-YAML assets (e.g. a chunk's code file),
  // which are never followed/inlined by extractEntities20 below.
  entity.__filePath = filePath;
  // The base document's `shared[]` pool this entity was loaded alongside —
  // needed to resolve a `rel: same-as` ref (`to: "<sharedId>#<itemId>"`) at
  // render time. Empty for a standalone entry file (no base doc, no pool).
  entity.__sharedEntries = sharedEntries ?? [];
  return entity;
}

/**
 * Extracts every entity (and `shared` entry) from a real 0.20.0 YAML
 * document, following `refs` with `rel: file` transitively to sibling
 * documents, following each `rel: file` ref to its sibling.
 * own composition mechanism. `visited` (absolute paths) prevents cycles.
 *
 * `rootSharedEntries` carries the base document's `shared[]` pool down
 * through every sibling-file recursion. Only the *root* base document's
 * `shared` is ever meaningful — a sibling file is a single bare entity, not
 * its own base document, so `isBaseDoc20(siblingDoc)` is always false for
 * it and it never has a `shared` of its own to (wrongly) fall back to.
 * Before this, every entity loaded from a sibling file (which in this
 * corpus's one-file-per-entity convention is *every* entity except the
 * `kind: system` entry declared directly in the base doc) got `[]` instead
 * of the real pool, so `same-as` could never resolve for any of them —
 * caught by writing real `same-as` refs into the corpus and finding they
 * rendered as an unresolved "see shared-foundations#..." pointer instead of
 * the pooled statement.
 */
async function extractEntities20(doc, absPath, visited, rootSharedEntries = null) {
  const sharedEntries = rootSharedEntries ?? (isBaseDoc20(doc) ? (doc.shared ?? []) : []);
  const here = isBaseDoc20(doc)
    ? entriesIn20(doc).map(e => normalizeEntity20(e, absPath, sharedEntries))
    : [normalizeEntity20(doc, absPath, sharedEntries)];

  // Only a YAML-extensioned rel:file target is a sibling *entity* document —
  // a chunk's own code file (role: source, .tsx/.ts/etc.) is also rel:file
  // but must never be parsed as YAML. Relying on a parse-failure catch alone
  // is unsafe: a short/simple non-YAML file can coincidentally parse as a
  // valid (garbage) YAML scalar instead of throwing, silently adding a bogus
  // string "entity" to the loaded system.
  const fileRefs = (doc.refs ?? []).filter(
    r => r?.rel === 'file' && typeof r.href === 'string' && YAML_EXTENSIONS.has(extname(r.href))
  );
  if (fileRefs.length === 0) return here;

  const baseDir = dirname(absPath);
  const rest = [];
  for (const ref of fileRefs) {
    const siblingPath = resolve(baseDir, ref.href);
    if (visited.has(siblingPath)) continue;
    visited.add(siblingPath);
    try {
      const raw = await readFile(siblingPath, 'utf-8');
      const siblingDoc = loadYaml20(raw);
      rest.push(...await extractEntities20(siblingDoc, siblingPath, visited, sharedEntries));
    } catch {
      // A missing/unreadable sibling is silently skipped, same as the
      // a bad sibling file shouldn't take
      // the whole server down.
    }
  }
  return [...here, ...rest];
}

async function loadYamlFile(filePath) {
  const absPath = resolve(filePath);
  const raw = await readFile(absPath, 'utf-8');
  const document = loadYaml20(raw);
  const entities = await extractEntities20(document, absPath, new Set([absPath]));
  return { filePath: absPath, document, entities };
}





/**
 * Loads multiple intro entities from an array of file paths.
 * Returns only the successfully loaded entities (silently skips failures).
 */
export async function loadIntroEntities(paths) {
  if (!paths || paths.length === 0) return [];
  const results = await Promise.all(paths.map(loadIntroEntity));
  return results.filter(Boolean);
}

/**
 * Loads a single entity from a DSDS file for use as the intro entity.
 * Supports single-entity docs ({ entity: {...} }) and bare entity objects.
 */
async function loadIntroEntity(filePath) {
  if (!filePath) return null;
  try {
    const absPath = resolve(filePath);
    const raw = await readFile(absPath, 'utf-8');
    if (YAML_EXTENSIONS.has(extname(absPath))) {
      const doc = loadYaml20(raw);
      const entity = isBaseDoc20(doc) ? entriesIn20(doc)[0] : doc;
      if (!entity?.kind || !entity?.id) {
        process.stderr.write(`[dsds-mcp] Intro file at ${filePath} has no valid entry — skipping.\n`);
        return null;
      }
      return normalizeEntity20(entity, absPath);
    }
    const doc = JSON.parse(raw);
    const entity = doc.entity ?? doc;
    if (!entity?.kind || !entity?.identifier) {
      process.stderr.write(`[dsds-mcp] Intro file at ${filePath} has no valid entity — skipping.\n`);
      return null;
    }
    return entity;
  } catch (err) {
    process.stderr.write(`[dsds-mcp] Failed to load intro entity ${filePath}: ${err.message}\n`);
    return null;
  }
}


/** Load one DSDS document and its transitively referenced files. */
async function loadFile(filePath) {
  return loadYamlFile(resolve(filePath));
}


/** Load each path and its referenced files; returns loaded systems and per-path errors. */
export async function loadSystems(paths) {
  const systems = [];
  const errors = [];

  await Promise.all(
    paths.map(async p => {
      try {
        systems.push(await loadFile(p));
      } catch (err) {
        errors.push({ path: p, error: err.message });
      }
    })
  );

  return { systems, errors };
}

/** One summary row per entity: identifier, name, kind, status, summary, tags. */
export function summarizeEntities(systems) {
  return systems.flatMap(system =>
    system.entities.map(entity => ({
      identifier: entity.identifier,
      name: entity.name ?? entity.identifier,
      kind: entity.kind,
      status: resolveMetaStatus(entity.metadata),
      summary: entitySummary(entity),
      tags: resolveMetaTags(entity.metadata),
      filePath: system.filePath,
    }))
  );
}

/**
 * The one-line description of an entity, wherever the document keeps it.
 *
 * `metadata.summary` is one home; a document may instead put it in the
 * entity's top-level `description` — which is why every summary in a 0.20.0
 * corpus came back empty before this fallback existed: the Sanity UI
 * document has a good description on all 199 entities and `dsds list`
 * rendered 199 blank cells. Search reads this field too, so an empty summary
 * also meant no entity was findable by what it does, only by its name.
 *
 * @param {object} entity
 * @param {{maxLength?: number}} [options]
 * @returns {string|undefined}
 */
export function entitySummary(entity, { maxLength = 160 } = {}) {
  if (!entity) return undefined;

  const candidate =
    resolveMetaSummary(entity.metadata) ??
    resolveMetaDescription(entity.metadata) ??
    (typeof entity.description === 'string' ? entity.description : undefined) ??
    (typeof entity.purpose === 'string' ? entity.purpose : undefined) ??
    entity.agents?.intent;

  if (typeof candidate !== 'string') return undefined;

  const firstLine = candidate.split('\n')[0].trim();
  if (!firstLine) return undefined;
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength - 1)}…` : firstLine;
}

function resolveMetaDescription(metadata) {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'description')?.value ?? undefined;
  }
  const d = metadata.description;
  if (!d) return undefined;
  return typeof d === 'string' ? d : d.value ?? undefined;
}

// Handles both v0.2.2 array format and legacy object format
function resolveMetaStatus(metadata) {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'status')?.status ?? undefined;
  }
  const s = metadata.status;
  if (!s) return undefined;
  // Real 0.20.0 metadata.status is a bare string, one object shaped {status,
  // platform?, since?, deprecationNotice?, note?}, or — since the
  // per-platform array form was added — a list of them, one per platform.
  return typeof s === 'string' ? s : resolveStatusDisplay20(s) ?? s.overall ?? s.value ?? undefined;
}

function resolveMetaSummary(metadata) {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'summary')?.value ?? undefined;
  }
  const s = metadata.summary;
  if (!s) return undefined;
  return typeof s === 'string' ? s : s.value ?? undefined;
}

function resolveMetaTags(metadata) {
  if (!metadata) return [];
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'tags')?.items ?? [];
  }
  return metadata.tags ?? [];
}
