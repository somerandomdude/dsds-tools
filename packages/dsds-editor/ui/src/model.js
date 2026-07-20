// DSDS document model: templates, schema-derived vocabularies, and pure
// helpers for reading and mutating documents. This module has no DOM or Tauri
// dependencies so it can be unit-tested directly under `node --test`.
//
// Reference: https://designsystemdocspec.org/ (spec 0.14.0)

export const DSDS_VERSION = '0.14.0';
export const SCHEMA_REF =
  'https://designsystemdocspec.org/schema/dsds.bundled.schema.json';

export const DSDS_SUFFIX = '.dsds.json';

// The entity kinds a document can describe.
export const ENTITY_KINDS = [
  'component',
  'token',
  'token-group',
  'theme',
  'foundation',
  'pattern',
  'guide',
  'chunk',
];

// Metadata.status lifecycle values.
export const STATUS_VALUES = ['draft', 'experimental', 'stable', 'deprecated'];

// Document block kinds available to every entity.
export const GENERAL_BLOCK_KINDS = [
  'guidelines',
  'use-cases',
  'accessibility',
  'content',
  'sections',
  'checklist',
];

// Additional block kinds scoped to particular entity kinds.
export const SCOPED_BLOCK_KINDS = {
  component: ['anatomy', 'api', 'variants', 'states', 'design-specifications'],
  pattern: ['anatomy', 'variants', 'states', 'interactions'],
  foundation: ['principles', 'scale', 'motion'],
  guide: ['steps', 'imports'],
  token: [],
  'token-group': [],
  theme: [],
  chunk: [],
};

// Field definitions for the item rows of collection-style blocks. The editor
// renders a form from these; blocks not listed here fall back to raw JSON
// editing so no data is ever lost.
export const BLOCK_ITEM_FIELDS = {
  guidelines: [
    { key: 'guidance', type: 'textarea', label: 'Guidance' },
    {
      key: 'level',
      type: 'select',
      label: 'Level',
      options: ['must', 'should', 'may', 'should-not', 'must-not'],
    },
    { key: 'rationale', type: 'textarea', label: 'Rationale' },
    { key: 'category', type: 'text', label: 'Category' },
  ],
  'use-cases': [
    { key: 'description', type: 'textarea', label: 'Description' },
    {
      key: 'stance',
      type: 'select',
      label: 'Stance',
      options: ['recommended', 'discouraged'],
    },
  ],
  states: [
    { key: 'identifier', type: 'text', label: 'Identifier' },
    { key: 'name', type: 'text', label: 'Name' },
    { key: 'description', type: 'textarea', label: 'Description' },
  ],
  principles: [
    { key: 'title', type: 'text', label: 'Title' },
    { key: 'description', type: 'textarea', label: 'Description' },
  ],
  sections: [
    { key: 'title', type: 'text', label: 'Title' },
    { key: 'body', type: 'textarea', label: 'Body' },
  ],
  content: [{ key: 'description', type: 'textarea', label: 'Description' }],
  checklist: [
    { key: 'label', type: 'text', label: 'Label' },
    {
      key: 'level',
      type: 'select',
      label: 'Level',
      options: ['must', 'should', 'may', 'should-not', 'must-not'],
    },
    { key: 'category', type: 'text', label: 'Category' },
  ],
};

// The `items`-bearing block kinds this editor knows how to render as forms.
export const COLLECTION_BLOCK_KINDS = Object.keys(BLOCK_ITEM_FIELDS);

/** Every document block kind valid for a given entity kind. */
export function blockKindsFor(entityKind) {
  const scoped = SCOPED_BLOCK_KINDS[entityKind] || [];
  return [...scoped, ...GENERAL_BLOCK_KINDS];
}

/** DSDS identifiers are kebab-case starting with a letter (tokens excepted). */
export function isValidIdentifier(id) {
  return typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id);
}

/** Suggested filename for an entity, e.g. `button.dsds.json`. */
export function filenameFor(identifier) {
  return `${identifier}${DSDS_SUFFIX}`;
}

/** True when `name` is a well-formed DSDS document filename. */
export function isValidDocName(name) {
  if (typeof name !== 'string' || !name.endsWith(DSDS_SUFFIX)) return false;
  const stem = name.slice(0, -DSDS_SUFFIX.length);
  if (stem.length === 0) return false;
  return !/[\\/\0]/.test(name);
}

/**
 * Build a fresh single-entity DSDS document.
 * @param {string} kind - one of ENTITY_KINDS
 * @param {string} identifier - kebab-case identifier
 * @param {string} [name] - human-readable name (defaults to the identifier)
 */
export function newDocument(kind, identifier, name) {
  const entity = {
    kind,
    identifier,
    name: name || identifier,
    description: '',
    metadata: { status: 'draft' },
    documentBlocks: [],
  };
  return {
    $schema: SCHEMA_REF,
    dsdsVersion: DSDS_VERSION,
    entity,
  };
}

/** Create an empty block of the given kind, shaped for the editor. */
export function newBlock(kind) {
  if (COLLECTION_BLOCK_KINDS.includes(kind)) {
    return { kind, items: [newBlockItem(kind)] };
  }
  // Unknown/specialty block: start with just the discriminator.
  return { kind };
}

/** Create an empty item for a collection block, with known keys present. */
export function newBlockItem(blockKind) {
  const fields = BLOCK_ITEM_FIELDS[blockKind] || [];
  const item = {};
  for (const field of fields) {
    item[field.key] = field.options ? field.options[0] : '';
  }
  return item;
}

/**
 * Parse raw file text into a document object.
 * @returns {{ doc: object|null, error: string|null }}
 */
export function parseDoc(text) {
  try {
    const doc = JSON.parse(text);
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      return { doc: null, error: 'Document root must be a JSON object' };
    }
    return { doc, error: null };
  } catch (e) {
    return { doc: null, error: e.message };
  }
}

/** Serialize a document to pretty JSON with a trailing newline. */
export function serializeDoc(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Return the primary entity of a document. Single-entity documents expose it
 * as `entity`; grouped documents expose `entityGroups[].entities[]` — in which
 * case the first entity of the first group is treated as primary.
 * @returns {object|null}
 */
export function getPrimaryEntity(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.entity && typeof doc.entity === 'object') return doc.entity;
  const groups = doc.entityGroups;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group && Array.isArray(group.entities) && group.entities[0]) {
        return group.entities[0];
      }
    }
  }
  return null;
}

/**
 * Return a new document with the primary entity replaced by `entity`,
 * preserving whichever shape (`entity` vs `entityGroups`) the document uses.
 */
export function setPrimaryEntity(doc, entity) {
  const next = { ...doc };
  if (doc.entity && typeof doc.entity === 'object') {
    next.entity = entity;
    return next;
  }
  if (Array.isArray(doc.entityGroups)) {
    next.entityGroups = doc.entityGroups.map((group, gi) => {
      if (gi !== firstGroupWithEntity(doc)) return group;
      const entities = group.entities.slice();
      entities[0] = entity;
      return { ...group, entities };
    });
    return next;
  }
  // No entity present yet: attach as a single entity.
  next.entity = entity;
  return next;
}

function firstGroupWithEntity(doc) {
  return doc.entityGroups.findIndex(
    (g) => g && Array.isArray(g.entities) && g.entities[0]
  );
}

/**
 * Derive display facts about a document for the metadata panel. Tolerates
 * missing or malformed fields, always returning a fully-populated object.
 */
export function deriveMeta(entry, doc) {
  const entity = getPrimaryEntity(doc) || {};
  const metadata = entity.metadata || {};
  const documentBlocks = Array.isArray(entity.documentBlocks)
    ? entity.documentBlocks
    : [];
  const agentBlocks = Array.isArray(entity.agentDocumentBlocks)
    ? entity.agentDocumentBlocks
    : [];
  return {
    filename: entry?.name ?? '',
    path: entry?.path ?? '',
    size: entry?.size ?? 0,
    modified: entry?.modified ?? 0,
    kind: entity.kind ?? '—',
    identifier: entity.identifier ?? '—',
    status: normalizeStatus(metadata.status),
    summary: metadata.summary ?? '',
    since: metadata.since ?? '',
    lastUpdated: normalizeLastUpdated(metadata.lastUpdated),
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    blockCount: documentBlocks.length,
    agentBlockCount: agentBlocks.length,
  };
}

/** Status may be a plain string or an object with an `overall` field. */
export function normalizeStatus(status) {
  if (typeof status === 'string') return status;
  if (status && typeof status === 'object') {
    return status.overall ?? status.status ?? '';
  }
  return '';
}

/** lastUpdated may be an ISO string or an object with a `date`. */
export function normalizeLastUpdated(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.date ?? '';
  return '';
}

/** Split a comma-separated string into a trimmed, non-empty list. */
export function parseList(text) {
  return String(text)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The folder portion of a project-relative path, or '' at the root. */
export function dirnameOfPath(relPath) {
  const i = String(relPath).lastIndexOf('/');
  return i === -1 ? '' : relPath.slice(0, i);
}

/** Replace the filename stem of a relative path, keeping its folder. */
export function replaceStem(relPath, newStem) {
  const dir = dirnameOfPath(relPath);
  const file = filenameFor(newStem);
  return dir ? `${dir}/${file}` : file;
}

/**
 * Build a nested folder/file tree from a flat list of documents. Each document
 * is placed by its `relPath` (falling back to `name` for a flat list). Folders
 * and files are returned sorted case-insensitively by name.
 *
 * @param {Array<{name:string, relPath?:string}>} docs
 * @returns {{ folders: Array<{name,path,folders,files}>, files: Array }}
 */
export function buildTree(docs) {
  const root = { folders: new Map(), files: [] };
  for (const doc of docs || []) {
    const rel = String(doc.relPath || doc.name || '');
    const segments = rel.split('/').filter(Boolean);
    segments.pop(); // drop the file segment; the doc itself carries the name
    let node = root;
    let acc = '';
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      if (!node.folders.has(segment)) {
        node.folders.set(segment, {
          name: segment,
          path: acc,
          folders: new Map(),
          files: [],
        });
      }
      node = node.folders.get(segment);
    }
    node.files.push(doc);
  }
  return finalizeNode(root);
}

function finalizeNode(node) {
  const byName = (a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  return {
    folders: [...node.folders.values()]
      .map((f) => ({ name: f.name, path: f.path, ...finalizeNode(f) }))
      .sort(byName),
    files: node.files.slice().sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ),
  };
}
