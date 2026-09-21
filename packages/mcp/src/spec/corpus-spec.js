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

import { BUNDLED_VERSION } from './version.js';

/**
 * @param {(() => Array)|null} getSystems
 * @returns {'0.15.2'|'0.20.0'|'0.20.1'|'0.21.0'|string} the loaded schemaVersion, or
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
    // stamped on every entry the loader parses under that model. Which
    // release to name is a guess either way, so name the one this server
    // actually validates against rather than a fixed older number — pinning
    // it meant an undeclared corpus was described under 0.20.1 after the
    // 0.21.0 bump, missing required `traitType` and section `tags`.
    if (system?.entities?.some(e => e?.__dsds20)) return BUNDLED_VERSION;
  }
  return '0.15.2';
}
