// Suggests real icons for an icon name that doesn't exist.
//
// Agents guess icon names from other icon sets. In three days of agent-tester
// runs (2026-09-22..24) the most common misses were SettingsIcon (60),
// AlertIcon (28), InfoIcon (21), WarningIcon (20) and GridIcon (18). Spelling
// can't recover most of these — "Settings" looks nothing like "Cog" — so the
// match is on what the icon is FOR, read from the design system's icon
// guidelines: each row's alternative names and purpose. Name prefixes and
// spelling are used as well, for guesses the guidelines don't cover.
import { readFileSync, statSync } from 'node:fs';

/** Words in a PascalCase or spaced name, lowercased: "AlertCircle" → ["alert", "circle"]. */
export function nameWords(name) {
  return String(name)
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

let cache = { path: null, mtimeMs: 0, rows: new Map() };

/**
 * The icon guidelines TSV as Map<iconName, {aliases: string[], purpose: string}>.
 * Columns are found by header name, so column order can change. Cached until
 * the file changes; an unreadable file gives an empty map, never an error.
 */
export function loadIconGuidelines(path) {
  if (!path) return new Map();
  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return new Map();
  }
  if (cache.path === path && cache.mtimeMs === mtimeMs) return cache.rows;

  const rows = new Map();
  const [header, ...lines] = readFileSync(path, 'utf-8').split(/\r?\n/);
  const cols = header.split('\t').map((h) => h.trim().toLowerCase());
  const at = (name) => cols.indexOf(name);
  const iName = at('icon name');
  const iAlias = at('alternative names');
  const iPurpose = at('purpose');
  const iWhen = at('when to use');
  const iWhenNot = at('when not to use');
  if (iName < 0) return new Map();
  for (const line of lines) {
    const cells = line.split('\t');
    const name = cells[iName]?.trim();
    if (!name) continue;
    rows.set(name, {
      aliases: (cells[iAlias] ?? '').split('|').map((a) => a.trim().toLowerCase()).filter(Boolean),
      purpose: (cells[iPurpose] ?? '').trim(),
      whenToUse: iWhen >= 0 ? (cells[iWhen] ?? '').trim() : '',
      whenNotToUse: iWhenNot >= 0 ? (cells[iWhenNot] ?? '').trim() : '',
    });
  }
  cache = { path, mtimeMs, rows };
  return rows;
}

// Common guesses the guidelines' alternative names don't cover yet. Kept
// short on purpose: the TSV is the source, and a word belongs there first.
const FALLBACK = {
  gear: ['CogIcon'],
  'more vertical': ['EllipsisVerticalIcon'],
  kebab: ['EllipsisVerticalIcon'],
  exclamation: ['WarningOutlineIcon', 'ErrorOutlineIcon'],
};

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Up to `limit` real icons for a name that doesn't exist, best first.
 *
 * @param {string} guess - e.g. "SettingsIcon"
 * @param {Iterable<string>} icons - every real icon name
 * @param {Map<string, {aliases: string[], purpose: string}>} guidelines
 * @returns {Array<{name: string, purpose: string|null}>}
 */
export function suggestIcons(guess, icons, guidelines, limit = 3) {
  const words = nameWords(guess);
  if (!words.length) return [];
  const phrase = words.join(' ');
  const head = words[0];
  const scored = [];
  for (const icon of icons) {
    const g = guidelines.get(icon);
    const iconWords = nameWords(icon);
    const iconBase = iconWords.join('');
    let score = 0;
    for (const alias of g?.aliases ?? []) {
      const aliasWords = alias.split(/\s+/);
      if (alias === phrase) score = Math.max(score, 100);
      else if (words.every((w) => aliasWords.includes(w))) score = Math.max(score, 80);
      else if (alias === head) score = Math.max(score, 70);
      else if (aliasWords.includes(head)) score = Math.max(score, 45);
    }
    // "Eye" → EyeOpenIcon, "Info" → InfoOutlineIcon.
    if (iconWords[0] === head) score = Math.max(score, words.length === 1 ? 65 : 50);
    if (g?.purpose && nameWords(g.purpose.replace(/[^A-Za-z ]/g, ' ')).includes(head)) score = Math.max(score, 35);
    // Typos only. Short words are left out: two edits turn "gear" into "star".
    const typed = words.join('');
    const d = distance(typed, iconBase);
    if (d === 1 && typed.length >= 4) score = Math.max(score, 55);
    if (d === 2 && typed.length >= 7) score = Math.max(score, 45);
    const fallback = FALLBACK[phrase] ?? FALLBACK[head];
    if (fallback?.includes(icon)) score = Math.max(score, 75 - fallback.indexOf(icon));
    if (score >= 35) scored.push({ name: icon, score, purpose: g?.purpose || null });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, purpose }) => ({ name, purpose }));
}

// ── Lookup by purpose ───────────────────────────────────────────────────────
//
// Agents need "the icon for resolve", not a check of a name they already
// guessed. On 2026-10-08, 7 of 10 runs guessed names first (Resolve, Send,
// Eye, Warning) and asked for "a list of icon names mapped to common intents".
// The guidelines already say what each icon is for; this ranks by it.

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'or', 'and', 'in', 'on', 'icon', 'is', 'it', 'as', 'with', 'by', 'that', 'this']);

/** "Resolved comments" → ["resolv", "comment"]: lowercase words with a light suffix strip. */
function stems(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length >= 4 ? w.replace(/dden$/, 'd').replace(/(ing|ed|es|s|e)$/, '') : w));
}

/**
 * Icons for a purpose, best first: `{ name, purpose, whenNotToUse, score }`.
 * Ranked by, strongest first: an alternative name that is the whole query,
 * the icon's own name, alternative names, the stated purpose, and the "when
 * to use" text. Only names in `icons` (what the package ships) are returned.
 */
export function findIconsByPurpose(query, icons, guidelines, limit = 5) {
  const q = stems(query);
  if (!q.length) return [];
  const phrase = q.join(' ');
  const out = [];
  for (const icon of icons) {
    const g = guidelines.get(icon);
    const nameStems = stems(icon.replace(/Icon$/, ''));
    const aliasStems = (g?.aliases ?? []).map((a) => stems(a));
    const purposeStems = new Set(stems(g?.purpose ?? ''));
    const whenStems = new Set(stems(g?.whenToUse ?? ''));
    const share = (set) => q.filter((w) => set.has(w)).length / q.length;
    let score = 0;
    if (aliasStems.some((a) => a.join(' ') === phrase)) score = Math.max(score, 100);
    if (nameStems.join(' ') === phrase) score = Math.max(score, 95);
    if (q.every((w) => nameStems.includes(w))) score = Math.max(score, 85);
    if (aliasStems.some((a) => q.every((w) => a.includes(w)))) score = Math.max(score, 80);
    score = Math.max(score, 70 * share(new Set(nameStems)));
    score = Math.max(score, 65 * share(new Set(aliasStems.flat())));
    score = Math.max(score, 55 * share(purposeStems));
    score = Math.max(score, 35 * share(whenStems));
    if (score >= 30) out.push({ name: icon, score: Math.round(score), purpose: g?.purpose || null, whenNotToUse: g?.whenNotToUse || null });
  }
  out.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  // A strong match makes weak ones noise: "settings" finds CogIcon by its
  // alternative name, and DatabaseIcon only because its usage notes say
  // "settings" once. Keep what scores within reach of the best.
  const floor = Math.max(30, (out[0]?.score ?? 0) * 0.6);
  return out.filter((r) => r.score >= floor).slice(0, limit);
}
