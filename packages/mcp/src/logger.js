import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Append one JSON line to logs/YYYY-MM-DD.jsonl.
 *
 * Best-effort: never throws, so a write failure can't break the tool call that
 * triggered it. A no-op when `logsDir` is falsy (logging disabled). The entry is
 * stamped with an ISO `timestamp` unless it already carries one.
 *
 * Every entry SHOULD include a `type` discriminator ('tool' | 'access' | 'lint')
 * so log readers can classify it without inferring from shape. ('chunk' is the
 * pre-0.5 name for what 'access' now covers; readers still accept it.)
 */
export async function writeLog(logsDir, entry) {
  if (!logsDir) return;
  try {
    await mkdir(logsDir, { recursive: true });
    const now = new Date();
    const logPath = join(logsDir, `${now.toISOString().slice(0, 10)}.jsonl`);
    const record = { timestamp: now.toISOString(), ...entry };
    await appendFile(logPath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    /* best-effort — logging must never fail a tool call */
  }
}

// ── Content-access records ───────────────────────────────────────────────────
//
// A `type: 'tool'` line says a tool ran. It does not say what content came
// back, so "which entry do agents read most, and which part of it" was
// unanswerable for every tool except get_chunk. These helpers build the
// `type: 'access'` line that answers it.
//
// Handlers do not write logs. They attach the descriptor to their result as
// `access`, and registry.js's dispatch writes it and strips the key before the
// result reaches the transport. One write site, both surfaces, no I/O in a
// render path.

/**
 * A stable, greppable label for one section or document block.
 *
 * Shape: `kind`, `kind#Title`, `kind@audience`, or `kind#Title@audience`.
 * `for: all` is the common case and gets no suffix, so an `@agent` or
 * `@human` in a label always means something.
 *
 * Titles are free text; a `#` or `@` inside one would make the label
 * ambiguous, so both are stripped rather than escaped — this is a log label,
 * not a round-trippable key.
 */
export function sectionLabel(section) {
  if (!section) return 'unknown';
  if (typeof section === 'string') return section;
  let label = section.kind ?? 'unknown';
  const title = typeof section.title === 'string' ? section.title.trim() : '';
  if (title) label += `#${title.replace(/[#@]/g, ' ').replace(/\s+/g, ' ').trim()}`;
  const audience = section.for;
  if (audience && audience !== 'all') label += `@${audience}`;
  return label;
}

/**
 * Build the `access` descriptor a content handler attaches to its result.
 *
 * `sections` is what was actually rendered into the response, not what the
 * entry has on disk — the gap between the two is the point. A compact
 * get_agent_context call serves maybe four of an entry's twelve sections, and
 * `omitted` records how many it withheld.
 *
 * @param {object} o
 * @param {string} o.identifier         Resolved entry identifier (not the user's input).
 * @param {string} [o.name]             Human-facing name.
 * @param {string} [o.entityKind]       'component' | 'chunk' | 'pattern' | 'foundation' | …
 * @param {Array}  [o.sections]         Section/block objects or pre-made labels.
 * @param {Array}  [o.parts]            Generated views (traits, api, relationships) — not
 *                                      sections the entry declares, so kept separate.
 * @param {number} [o.omitted]          Sections deliberately withheld from this response.
 * @param {string} [o.mode]             Handler-specific view, ex: 'compact' | 'verbose'.
 * @param {number} [o.chars]            Response size, the cheapest proxy for context spend.
 * @param {string} [o.requested]        The raw input, when it differs from `identifier`.
 * @returns {object} descriptor, with empty/absent fields dropped
 */
export function accessRecord({ identifier, name, entityKind, sections, parts, omitted, mode, chars, requested }) {
  const record = { identifier };
  if (name && name !== identifier) record.name = name;
  if (entityKind) record.entityKind = entityKind;
  if (requested && requested.toLowerCase() !== String(identifier).toLowerCase()) record.requested = requested;
  if (mode) record.mode = mode;
  if (sections?.length) {
    record.sections = sections.map(sectionLabel);
    record.sectionCount = record.sections.length;
  }
  if (parts?.length) record.parts = [...parts];
  if (omitted) record.omitted = omitted;
  if (typeof chars === 'number') record.chars = chars;
  return record;
}
