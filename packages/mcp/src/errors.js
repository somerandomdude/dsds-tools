// Errors a caller can branch on.
//
// Every failure here already said the right thing in prose — "Entity
// \"buton\" not found." followed by a did-you-mean. What it did not do was
// say it in a form anything could act on. A caller wanting to retry with the
// suggested identifier had to regex the message, and a caller wanting to
// tell "unknown entity" from "nothing configured" had to match on wording
// that exists to be readable, not stable.
//
// So the prose stays exactly as it is, and the same facts travel beside it:
// a stable `code`, and the suggestions the message already computed, as
// data. Nothing is removed — `content` is unchanged for every existing
// caller, and `structuredContent` gains the machine-readable half.
//
// Codes are stable identifiers. Rewording a message is free; changing a code
// is a breaking change for anyone who branched on it.

import { didYouMean, notFoundMessage } from './suggest.js';

export const ERROR_CODES = {
  /** No DSDS files are configured — the server has nothing to serve. */
  NOT_CONFIGURED: 'ERR_NOT_CONFIGURED',
  /** An identifier that names no entity in the loaded systems. */
  UNKNOWN_ENTITY: 'ERR_UNKNOWN_ENTITY',
  /** An identifier that names no chunk. */
  UNKNOWN_CHUNK: 'ERR_UNKNOWN_CHUNK',
  /** A filter value (kind, status) outside the set actually present. */
  UNKNOWN_FILTER: 'ERR_UNKNOWN_FILTER',
  /** A block type this entity does not carry. */
  UNKNOWN_BLOCK: 'ERR_UNKNOWN_BLOCK',
  /** Arguments were missing or the wrong shape. */
  INVALID_ARGUMENT: 'ERR_INVALID_ARGUMENT',
};

/**
 * Build a tool error carrying both the prose and the structured facts.
 *
 * @param {object} options
 * @param {string} options.code - one of ERROR_CODES
 * @param {string} options.text - the human-readable message, already rendered
 * @param {string} [options.message] - one-line summary; defaults to the first line of `text`
 * @param {Array<{value: string, reason: string}>} [options.suggestions]
 * @param {object} [options.details] - extra structured context (field, input, valid values)
 * @returns {{isError: true, content: Array, structuredContent: object}}
 */
export function toolError({ code, text, message, suggestions = [], details = {} }) {
  return {
    isError: true,
    content: [{ type: 'text', text }],
    structuredContent: {
      error: {
        code,
        message: message ?? String(text).split('\n')[0],
        ...(suggestions.length > 0 ? { suggestions } : {}),
        ...(Object.keys(details).length > 0 ? { details } : {}),
      },
    },
  };
}

/**
 * Why a candidate was offered, in the same vocabulary `didYouMean` ranks by.
 *
 * The reason is not decoration: "similar name" and "contains your text" are
 * different kinds of confidence, and a caller deciding whether to auto-retry
 * a single suggestion wants to know which one it got.
 *
 * @param {string} input
 * @param {string[]} matches - already ranked, closest first
 * @returns {Array<{value: string, reason: string}>}
 */
export function describeSuggestions(input, matches) {
  const needle = String(input ?? '').toLowerCase();
  return (matches ?? []).map(value => {
    const hay = String(value).toLowerCase();
    const reason =
      hay.includes(needle) ? `contains "${input}"`
        : needle.includes(hay) ? `contained in "${input}"`
          : 'similar spelling';
    return { value, reason };
  });
}

/**
 * The "not found" case, prose and structure from one call.
 *
 * Four handlers built this same result by hand — get_entity, get_chunk,
 * get_agent_context and the relationship tools — which is how three of them
 * ended up without a code once one gained it. One helper, one shape.
 *
 * @param {object} options
 * @param {string} options.label - 'Entity', 'Chunk', …
 * @param {string} options.input
 * @param {Iterable<string>} options.candidates
 * @param {string} [options.listHint]
 * @param {string} [options.code] - defaults to UNKNOWN_ENTITY
 * @param {string} [options.text] - override the rendered prose entirely
 * @returns {{isError: true, content: Array, structuredContent: object}}
 */
export function notFoundError({ label, input, candidates, listHint, code, text }) {
  const pool = [...(candidates ?? [])];
  const matches = didYouMean(input, pool);
  return toolError({
    code: code ?? ERROR_CODES.UNKNOWN_ENTITY,
    text: text ?? notFoundMessage({ label, input, candidates: pool, listHint }),
    message: `${label} "${input}" not found.`,
    suggestions: describeSuggestions(input, matches),
    details: { input },
  });
}
