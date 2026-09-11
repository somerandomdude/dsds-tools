const RESOURCE_PREFIX = 'dsds://entity/';

// loadSystems() annotates each 0.20.0 entity in place with bookkeeping the
// renderers need — __dsds20, __filePath, and __sharedEntries, the base
// document's shared[] pool. That pool holds entities carrying the same pool,
// so a loaded entity is a cyclic object graph and JSON.stringify throws on
// it ("Converting circular structure to JSON"). None of it is part of the
// DSDS document either, so drop every internal key: the resource body is
// then what the author wrote, and serializing it terminates.
const dropInternalKeys = (key, value) => (key.startsWith('__') ? undefined : value);

export function listResources(getSummaries) {
  return getSummaries().map(s => ({
    uri: `${RESOURCE_PREFIX}${encodeURIComponent(s.identifier)}`,
    name: s.name ?? s.identifier,
    description: [s.kind, s.status].filter(Boolean).join(' · ') + (s.summary ? ` — ${s.summary}` : ''),
    mimeType: 'application/json',
  }));
}

export function readResource(uri, getSystems) {
  if (!uri.startsWith(RESOURCE_PREFIX)) return null;

  const identifier = decodeURIComponent(uri.slice(RESOURCE_PREFIX.length)).toLowerCase();

  for (const system of getSystems()) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === identifier
    );
    if (entity) {
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(entity, dropInternalKeys, 2),
      };
    }
  }

  return null;
}
