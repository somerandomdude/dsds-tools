const RESOURCE_PREFIX = 'dsds://entity/';

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
        text: JSON.stringify(entity, null, 2),
      };
    }
  }

  return null;
}
