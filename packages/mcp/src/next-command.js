// The next call, emitted as data.
//
// A search result that says `data-table | sanity.chunk` has told the caller
// what it found and not how to read it. The mapping from kind to tool is
// real but implicit: a `sanity.chunk` is fetched with dsds_get_chunk, a
// component with dsds_get_agent_context, and nothing in the result says so.
// Every caller has to already know, and an agent that guesses wrong spends a
// turn finding out.
//
// So each row carries its own next call. The text is written canonically —
// `dsds_get_chunk(app-shell)` — and `toCliVocabulary` rewrites it to
// `dsds chunk app-shell` for the shell, so one string serves both surfaces
// and neither can drift from the other.

// Kinds are namespaced in the 0.20.x model (`sanity.chunk`) and bare in the
// legacy one (`chunk`). Match on the last segment so both resolve.
function baseKind(kind) {
  const raw = String(kind ?? '').toLowerCase();
  const dot = raw.lastIndexOf('.');
  return dot === -1 ? raw : raw.slice(dot + 1);
}

/**
 * The canonical tool call that reads this entity in full.
 *
 * Chunks are pre-assembled code: the chunk tool is the only one that returns
 * their code block, so it is never right to send a caller to get_entity for
 * one. Everything else goes to get_agent_context rather than get_entity —
 * the instructions' HARD RULE already requires it before using a component
 * in code, and pointing at the weaker call here would contradict that.
 *
 * @param {{identifier?: string, kind?: string}} entity
 * @returns {string|null} canonical call, or null without an identifier
 */
export function nextCommandFor(entity) {
  const identifier = entity?.identifier;
  if (!identifier) return null;
  const kind = baseKind(entity.kind);
  // Quoted deliberately. `toCliVocabulary` reads a lone bare word as a
  // parameter name and renders it as a placeholder — `dsds context button`
  // would come out `dsds context <button>`, telling the reader to substitute
  // something for a value that IS the value. Hyphenated identifiers slipped
  // past that by accident; quoting makes every identifier a literal.
  const arg = JSON.stringify(String(identifier));
  if (kind === 'chunk') return `dsds_get_chunk(${arg})`;
  return `dsds_get_agent_context(${arg})`;
}
