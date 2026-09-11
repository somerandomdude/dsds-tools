// "Did you mean …?" — the small piece of help that turns a dead end into a
// next step.
//
// The alternative, and what these replaced, was dumping every candidate: on
// the Sanity UI document that is 199 identifiers on one unwrapped line, which
// a human cannot read and which costs an agent a page of context to say
// "no". A handful of near misses answers the actual question.

// Damerau-Levenshtein (optimal string alignment), capped: once the best
// possible score exceeds `max` we stop caring how much worse it gets.
//
// Counting an adjacent transposition as one edit rather than two matters
// more than it sounds: swapping two letters is the most common typo there
// is, and under plain Levenshtein "crad" scores 2 against "card" — outside
// the tolerance a four-letter word gets, so the obvious suggestion was
// missed.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  // Three rows: i-2 is what a transposition looks back at.
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
    curr = new Array(b.length + 1);
  }

  return prev[b.length];
}

// How far off a candidate may be and still be worth offering. Scaled to the
// input so "btn" doesn't match everything and a long identifier still
// tolerates a typo or two.
function tolerance(input) {
  if (input.length <= 4) return 1;
  if (input.length <= 8) return 2;
  return 3;
}

/**
 * Rank candidates by how plausibly they are what the user meant.
 *
 * Substring matches come first (typing "dialog" for "confirmation-dialogs" is
 * a partial recall, not a typo), then close spellings.
 *
 * @param {string} input
 * @param {Iterable<string>} candidates
 * @param {{limit?: number}} [options]
 * @returns {string[]} best matches, closest first; empty when nothing is close
 */
export function didYouMean(input, candidates, { limit = 5 } = {}) {
  const needle = String(input ?? '').toLowerCase();
  if (!needle) return [];
  const max = tolerance(needle);

  const scored = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const hay = String(candidate).toLowerCase();
    if (hay === needle) continue;

    if (hay.includes(needle) || needle.includes(hay)) {
      // Prefer the closest-length substring match: "button" over
      // "list-button-item" when the input was "buton".
      scored.push({ candidate, rank: 0, score: Math.abs(hay.length - needle.length) });
      continue;
    }

    const distance = editDistance(needle, hay, max);
    if (distance <= max) scored.push({ candidate, rank: 1, score: distance });
  }

  scored.sort((a, b) => a.rank - b.rank || a.score - b.score || String(a.candidate).localeCompare(String(b.candidate)));
  return scored.slice(0, limit).map(s => s.candidate);
}

/**
 * Every entity identifier across the loaded systems — the candidate pool for
 * an entity "did you mean".
 *
 * @param {Array} systems
 * @returns {string[]}
 */
export function entityIdentifiers(systems) {
  const out = [];
  for (const system of systems ?? []) {
    for (const entity of system.entities ?? []) {
      if (entity.identifier) out.push(entity.identifier);
    }
  }
  return out;
}

/**
 * Render a "not found" message that suggests near misses and always names a
 * way to see the full list.
 *
 * @param {object} options
 * @param {string} options.label - what was not found, e.g. 'Entity'
 * @param {string} options.input - what the user asked for
 * @param {Iterable<string>} options.candidates
 * @param {string} options.listHint - how to see everything, e.g. 'dsds_list_entities'
 * @returns {string}
 */
export function notFoundMessage({ label, input, candidates, listHint }) {
  const matches = didYouMean(input, candidates);
  const lines = [`${label} "${input}" not found.`];
  if (matches.length > 0) {
    lines.push('', `Did you mean: ${matches.map(m => `\`${m}\``).join(', ')}?`);
  }
  if (listHint) lines.push('', `Run ${listHint} to see everything available.`);
  return lines.join('\n');
}
