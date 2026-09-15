// Which DSDS model the loaded documents are actually written in.
//
// The three spec tools each defaulted `spec` to legacy 0.15.2. Against a
// 0.20.1 corpus that made the no-argument call — the common one — describe a
// model none of the loaded files use: `identifier` instead of `id`,
// `documentBlocks` instead of `sections`, plus `agentDocumentBlocks` and
// `relationships`, which 0.20.x does not have at all. An agent reading that
// and then reading a real document sees two different shapes and no
// indication which is current.
//
// Defaulting to the corpus fixes the common call without removing the
// choice: `spec` still accepts any of the three, which is what a reader
// working on a legacy document needs.

/**
 * @param {(() => Array)|null} getSystems
 * @returns {'0.15.2'|'0.20.0'|'0.20.1'|string} the loaded schemaVersion, or
 *   '0.15.2' when nothing is loaded — a server with no DSDS_PATHS behaves
 *   exactly as it did before.
 */
export function corpusSpec(getSystems) {
  if (typeof getSystems !== 'function') return '0.15.2';
  let systems;
  try { systems = getSystems(); } catch { return '0.15.2'; }
  for (const system of systems ?? []) {
    const declared = system?.document?.schemaVersion;
    if (typeof declared === 'string' && declared.trim()) return declared.trim();
    // A document that omits schemaVersion still gets the 0.20.x marker
    // stamped on every entry the loader parses under that model.
    if (system?.entities?.some(e => e?.__dsds20)) return '0.20.1';
  }
  return '0.15.2';
}
