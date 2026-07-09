import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

/**
 * Extracts all entities from a parsed DSDS document.
 * Resolves $ref entries in the documentation array relative to baseDir.
 * visited prevents circular references.
 */
async function extractEntities(doc, baseDir, visited) {
  if (doc.entity) return [doc.entity];
  // v0.7 uses entityGroups; older documents used documentation
  const groups = doc.entityGroups ?? doc.documentation;
  if (!Array.isArray(groups)) return [];

  const entities = [];
  for (const group of groups) {
    if (group.$ref) {
      entities.push(...await resolveRef(group.$ref, baseDir, visited));
      continue;
    }
    // v0.7: one mixed entities array; each item may be an entity or a $ref
    if (Array.isArray(group.entities)) {
      for (const item of group.entities) {
        if (item?.$ref) entities.push(...await resolveRef(item.$ref, baseDir, visited));
        else if (item) entities.push(item);
      }
      continue;
    }
    // legacy (pre-0.7): per-kind typed arrays
    for (const key of ['components', 'guides', 'patterns', 'foundations', 'themes', 'tokens', 'tokenGroups']) {
      if (Array.isArray(group[key])) entities.push(...group[key]);
    }
  }
  return entities;
}

/**
 * Resolves a $ref string to a list of entities.
 * Handles both whole-file refs ("./tokens.dsds.json") and
 * fragment refs ("./button.dsds.json#/entity").
 */
async function resolveRef(ref, baseDir, visited) {
  const hashIdx = ref.indexOf('#');
  const filePart = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
  const fragment = hashIdx >= 0 ? ref.slice(hashIdx + 1) : null;

  if (!filePart) return [];

  const absPath = resolve(baseDir, filePart);
  if (visited.has(absPath)) return [];

  let raw;
  try {
    raw = await readFile(absPath, 'utf-8');
  } catch {
    return [];
  }

  const doc = JSON.parse(raw);
  const fileDir = dirname(absPath);
  const newVisited = new Set([...visited, absPath]);

  if (fragment) {
    const value = resolvePointer(doc, fragment);
    if (!value) return [];
    if (value.kind) {
      await resolveChunkCodeSrc(value, fileDir);
      return [value];
    }
    return extractEntities(value, fileDir, newVisited);
  }

  return extractEntities(doc, fileDir, newVisited);
}

/**
 * If a chunk entity uses code.src (referenced form), reads the file and
 * inlines its content as code.code so downstream tools see a plain string.
 */
async function resolveChunkCodeSrc(entity, dir) {
  if ((entity.kind === 'chunk' || entity.kind === 'blueprint') && entity.code?.src && !entity.code.code) {
    const codePath = resolve(dir, entity.code.src);
    try {
      entity.code.code = await readFile(codePath, 'utf-8');
    } catch {
      // leave code.code undefined — get-chunk will render an empty block
    }
  }
}

/** Resolves a JSON Pointer fragment (e.g. "/entity") against a document. */
function resolvePointer(doc, fragment) {
  const pointer = fragment.startsWith('/') ? fragment.slice(1) : fragment;
  if (!pointer) return doc;
  return pointer.split('/').reduce((obj, key) => obj?.[key], doc);
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
export async function loadIntroEntity(filePath) {
  if (!filePath) return null;
  try {
    const absPath = resolve(filePath);
    const raw = await readFile(absPath, 'utf-8');
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

async function loadFile(filePath) {
  const absPath = resolve(filePath);
  const raw = await readFile(absPath, 'utf-8');
  const document = JSON.parse(raw);
  const entities = await extractEntities(document, dirname(absPath), new Set([absPath]));
  return { filePath: absPath, document, entities };
}

export async function loadLintFiles(paths) {
  const files = [];
  const errors = [];
  await Promise.all(paths.map(async p => {
    try {
      const absPath = resolve(p);
      const raw = await readFile(absPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const rules = Array.isArray(parsed) ? parsed : (parsed.rules ?? []);
      const meta = Array.isArray(parsed) ? {} : { name: parsed.name, version: parsed.version };
      files.push({ filePath: absPath, meta, rules });
    } catch (err) {
      errors.push({ path: p, error: err.message });
    }
  }));
  return { files, errors };
}

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

export function summarizeEntities(systems) {
  return systems.flatMap(system =>
    system.entities.map(entity => ({
      identifier: entity.identifier,
      name: entity.name ?? entity.identifier,
      kind: entity.kind,
      status: resolveMetaStatus(entity.metadata),
      summary: resolveMetaSummary(entity.metadata),
      tags: resolveMetaTags(entity.metadata),
      filePath: system.filePath,
    }))
  );
}

// Handles both v0.2.2 array format and legacy object format
function resolveMetaStatus(metadata) {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'status')?.status ?? undefined;
  }
  const s = metadata.status;
  if (!s) return undefined;
  return typeof s === 'string' ? s : s.overall ?? s.value ?? undefined;
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
