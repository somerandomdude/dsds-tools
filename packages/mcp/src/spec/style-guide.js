// The DSDS authoring style guide (STYLE_GUIDE.md): the reading order of the
// things in a document, so every document reads the same way.
//
// Three warning-only rules, all `enforcement: advisory` in the vendored
// conformance-rules.yaml: DSDS-18 (sections), DSDS-19 (guideline items) and
// DSDS-21 (entries). None of this changes whether a document is *valid* — the
// schema accepts any order — so nothing here ever produces an error.
//
// Field order used to be four more rules here (DSDS-17, -20, -22, -23). 0.22.0
// retired them: field order has one right answer, so upstream applies it with
// `dsds-format` instead of reporting it. dsds_style_check runs the vendored
// formatter for that (see tools/style-check.js).
//
// Ported from upstream's scripts/validate/lint-docs.js at 0.22.0. Every
// canonical order is read from the vendored schema files at runtime (see
// schema-order.js) rather than transcribed.
import { join } from 'node:path';
import { loadYamlFile20 } from './dsds-lib.js';
import { declaredEnum, enumRanker, firstInversion, SCHEMA_DIR, SCHEMA_DIR_NAME } from './schema-order.js';

// ── Canonical orders, all schema-derived ────────────────────────────────────

// `kind` is a oneOf (a known enum, or a namespaced custom string) — the enum
// branch is the one that carries an order.
const KIND_AT = (d) => d.properties.kind.oneOf.find((m) => m.enum);
const ENTRY_KIND = declaredEnum('entries/entry.schema.yaml', KIND_AT);
const entryKindRank = enumRanker('entries/entry.schema.yaml', KIND_AT);
const SECTION_KIND = declaredEnum('sections/section.schema.yaml', KIND_AT);
const sectionKindRank = enumRanker('sections/section.schema.yaml', KIND_AT);

const AUDIENCE = declaredEnum('sections/section.schema.yaml', (d) => d.properties.for);
const audienceRank = enumRanker('sections/section.schema.yaml', (d) => d.properties.for);

const FRAMING_AT = (d) => d.allOf.find((m) => m.properties).properties.framing;
const FRAMING = declaredEnum('sections/guidelines.schema.yaml', FRAMING_AT);
const framingRank = enumRanker('sections/guidelines.schema.yaml', FRAMING_AT);

const LEVEL = declaredEnum('common/requirement-level.schema.yaml', (d) => d);
const levelRank = enumRanker('common/requirement-level.schema.yaml', (d) => d);

// §4's breadth scale: `when-to-use`, then `how-to-use`, in the order the
// schema lists `framing`. Until 0.22.0 a section declaring `tags` formed a
// third, narrowest tier, so tagging a section to classify it could move it.
// `tags` is classification only now.
const breadthRank = (section) => framingRank(section.framing);

const describeBreadth = (section) => `a \`framing: ${section.framing || FRAMING.fallback}\` section`;

const describeTier = (tier) => `both ${FRAMING.values[tier]}`;

// A section that leaves `for` out is ranked as the schema's default, so it has
// to be *named* as the default too — printing "for: undefined" would describe
// the document rather than the problem.
function describeAudience(section) {
  return section.for === undefined ? `${AUDIENCE.fallback} (defaulted)` : section.for;
}

/** Every entity in a document, with a JSON pointer to it. */
function entitiesWithPointers(doc) {
  const out = [];
  (doc.entries || []).forEach((e, i) => out.push([e, `/entries/${i}`]));
  (doc.shared || []).forEach((e, i) => out.push([e, `/shared/${i}`]));
  if (doc.id && !Array.isArray(doc.entries)) out.push([doc, '']);
  return out;
}

// ── Rule implementations ────────────────────────────────────────────────────
//
// Keyed by the rule `name` in conformance-rules.yaml, so catalog drift is
// detectable (see checkStyle20's own drift guard). ENTITY_RULES run once per
// entity; DOCUMENT_RULES run once per file against the raw parsed document.

const ENTITY_RULES = {
  // §4 — same-kind sections stay contiguous and general-to-specific; among
  // guidelines sections breadth decides first, then audience within a tier.
  'section-order': (entry, emit) => {
    const sections = entry.sections;
    if (!Array.isArray(sections) || sections.length < 2) return;

    const kindInversion = firstInversion(sections, (s) => sectionKindRank(s.kind));
    if (kindInversion) {
      emit(
        '/sections',
        `"${entry.id}" has a "${kindInversion[0].kind}" section before a "${kindInversion[1].kind}" section, out of STYLE_GUIDE.md's grouping — same-kind sections stay contiguous, ordered ${SECTION_KIND.values.join(', ')} (general to specific).`,
      );
      return; // fix grouping first — the checks below assume one contiguous guidelines run
    }

    const guidelinesRun = sections.filter((s) => s.kind === 'guidelines');
    const breadthInversion = firstInversion(guidelinesRun, breadthRank);
    if (breadthInversion) {
      emit(
        '/sections',
        `"${entry.id}" has ${describeBreadth(breadthInversion[0])} before ${describeBreadth(breadthInversion[1])} — STYLE_GUIDE.md §4 orders guidelines sections ${FRAMING.values.join(', ')}.`,
      );
      return; // fix breadth first — the audience sort only orders sections that TIE on breadth
    }

    // Audience, within one breadth tier only. Comparing across tiers would be
    // a false positive: a `for: agent` when-to-use section legitimately
    // precedes a `for: all` how-to-use one.
    const byBreadth = new Map();
    for (const s of guidelinesRun) {
      const tier = breadthRank(s);
      if (!byBreadth.has(tier)) byBreadth.set(tier, []);
      byBreadth.get(tier).push(s);
    }
    for (const [tier, run] of byBreadth) {
      const audienceInversion = firstInversion(run, (s) => audienceRank(s.for));
      if (audienceInversion) {
        emit(
          '/sections',
          `"${entry.id}" has a \`for: ${describeAudience(audienceInversion[0])}\` guidelines section before a \`for: ${describeAudience(audienceInversion[1])}\` one (${describeTier(tier)}) — STYLE_GUIDE.md orders audience ${AUDIENCE.values.join(', ')}, broadest readership first.`,
        );
        break;
      }
    }
  },

  // §5 — must, should, may, should-not, must-not. Items sharing a level keep
  // their relative order; only a strict level-to-level inversion is flagged.
  //
  // An item that borrows its rule via a `same-as` ref and declares no `level`
  // of its own takes the level of the rule it points to. 0.21.1 made that
  // shape the ordinary way to point at a shared rule, and the level it
  // borrows lives in the `shared[]` pool — usually in a different file from
  // the entry being checked. With `ctx.levels` (see guidelineLevelIndex) the
  // pointer is ranked at the borrowed level. Without it, or when the target
  // is not in the index, the pointer is skipped, not ranked: `enumRanker`
  // would otherwise sort an undeclared level LAST and report every pointer
  // above a `must` as an inversion.
  //
  // Skipping alone hid real breaks. When a shared rule's level changes, every
  // pointer to it can land out of order with nothing to notice: 23 breaks in
  // the Sanity UI corpus on 2026-09-29, most of them pointers. `dsds doctor`
  // runs this rule corpus-wide with the index (checkLevelOrderAcross).
  //
  // Upstream's lint-docs.js does the same as of 0.22.0, within one document.
  'guideline-item-level-order': (entry, emit, ctx = {}) => {
    (entry.sections || []).forEach((section, si) => {
      if (!section || section.kind !== 'guidelines' || !Array.isArray(section.items)) return;
      const rankable = section.items
        .filter(Boolean)
        .map((it) => ({ it, level: it.level ?? borrowedLevel(it, ctx.levels) }))
        .filter(({ it, level }) => level != null || !it.refs?.length);
      const inversion = firstInversion(rankable, ({ level }) => levelRank(level));
      if (inversion) {
        emit(
          `/sections/${si}/items`,
          `"${entry.id}" has a ${describeItemLevel(inversion[0])} item before a ${describeItemLevel(inversion[1])} one — STYLE_GUIDE.md orders guideline items ${LEVEL.values.join(', ')}. A pointer sits with the level of the rule it points to.`,
        );
      }
    });
  },
};

/** The level a pointer item borrows through `same-as`, if the index knows it. */
function borrowedLevel(item, levels) {
  if (!levels || !Array.isArray(item.refs)) return undefined;
  for (const ref of item.refs) {
    if (ref?.rel === 'same-as' && typeof ref.to === 'string' && levels.has(ref.to)) return levels.get(ref.to);
  }
  return undefined;
}

function describeItemLevel({ it, level }) {
  if (it.level != null) return `level: ${level}`;
  const target = it.refs.find((r) => r?.rel === 'same-as' && typeof r.to === 'string')?.to;
  return `pointer to ${target} (level: ${level})`;
}

/**
 * Map every guideline item with an `id` and a `level` to that level, keyed
 * `entryId#itemId` — the form a `same-as` ref uses.
 *
 * @param {Iterable<object>} entries - entries and `shared[]` entries
 * @returns {Map<string, string>}
 */
export function guidelineLevelIndex(entries) {
  const levels = new Map();
  for (const entry of entries) {
    if (!entry?.id) continue;
    for (const section of entry.sections || []) {
      if (section?.kind !== 'guidelines' || !Array.isArray(section.items)) continue;
      for (const it of section.items) {
        if (it?.id && it.level != null) levels.set(`${entry.id}#${it.id}`, it.level);
      }
    }
  }
  return levels;
}

/**
 * DSDS-19 across a whole corpus, pointers included.
 *
 * @param {object[]} entities - loaded entities; each carries the resolvable
 *   pool on `__sharedEntries` (shared[] plus every sibling entry).
 * @returns {{entry: string, file: string|undefined, pointer: string, message: string}[]}
 */
export function checkLevelOrderAcross(entities) {
  const pool = new Map();
  for (const e of entities) {
    for (const p of e?.__sharedEntries ?? []) if (p?.id && !pool.has(p.id)) pool.set(p.id, p);
    if (e?.id && !pool.has(e.id)) pool.set(e.id, e);
  }
  const levels = guidelineLevelIndex(pool.values());
  const findings = [];
  for (const entry of pool.values()) {
    ENTITY_RULES['guideline-item-level-order'](
      entry,
      (pointer, message) => findings.push({ entry: entry.id, file: entry.__filePath, pointer, message }),
      { levels },
    );
  }
  return findings;
}

const DOCUMENT_RULES = {
  // §1 — entries[] runs system, token, theme, component, entry, then any
  // namespaced custom kind. Order *within* one kind is not checked: the guide
  // asks for "whatever order reads best" there, a judgment, not a computation.
  'entry-order': (doc, emit) => {
    const entries = doc.entries;
    if (!Array.isArray(entries) || entries.length < 2) return;
    const inversion = firstInversion(entries, (e) => entryKindRank(e && e.kind));
    if (inversion) {
      emit(
        '/entries',
        `"${inversion[0].id}" (kind: ${inversion[0].kind}) comes before "${inversion[1].id}" (kind: ${inversion[1].kind}) — STYLE_GUIDE.md §1 orders entries ${ENTRY_KIND.values.join(', ')}, then any custom kind, so nothing precedes what it's built on.`,
      );
    }
  },

};

// ── Catalog binding ─────────────────────────────────────────────────────────

/**
 * The style-guide rules from the vendored catalog, joined to their
 * implementations: the STYLE_GUIDE.md ids that are still `advisory`. A retired
 * rule (`enforcement: none`) keeps its id in the catalog and drops out here.
 */
const STYLE_RULE_IDS = new Set(['DSDS-17', 'DSDS-18', 'DSDS-19', 'DSDS-20', 'DSDS-21', 'DSDS-22', 'DSDS-23']);

let cachedRules = null;

/** The style-guide rule catalog, checked against the schema's own list. */
export function styleRules() {
  if (cachedRules) return cachedRules;
  const catalog = loadYamlFile20(join(SCHEMA_DIR, 'conformance-rules.yaml'));
  const rules = (Array.isArray(catalog) ? catalog : []).filter((r) => STYLE_RULE_IDS.has(r.id) && r.enforcement === 'advisory');

  // Drift guard, in both directions. A catalog rule with no implementation
  // would silently check nothing; an implementation with no catalog entry
  // would report an id the spec no longer defines. Either is a tooling bug we
  // want loud at first use, not a documentation finding.
  const implemented = new Set([...Object.keys(ENTITY_RULES), ...Object.keys(DOCUMENT_RULES)]);
  const missing = rules.filter((r) => !implemented.has(r.name)).map((r) => `${r.id} '${r.name}'`);
  const catalogNames = new Set(rules.map((r) => r.name));
  const orphan = [...implemented].filter((n) => !catalogNames.has(n));
  if (missing.length || orphan.length) {
    const parts = [];
    if (missing.length) parts.push(`catalog rules with no implementation: ${missing.join(', ')}`);
    if (orphan.length) parts.push(`implementations with no catalog entry: ${orphan.join(', ')}`);
    throw new Error(`style-guide rule drift against ${SCHEMA_DIR_NAME}/conformance-rules.yaml — ${parts.join('; ')}`);
  }

  cachedRules = rules.map((r) => ({
    id: r.id,
    name: r.name,
    // `title` is the catalog's one-line statement of the rule; `description`
    // is the longer rationale. The heading wants the former.
    title: r.title,
    description: r.description,
    scope: r.name in DOCUMENT_RULES ? 'document' : 'entity',
    check: ENTITY_RULES[r.name] || DOCUMENT_RULES[r.name],
  }));
  return cachedRules;
}

/**
 * Run every style-guide rule (DSDS-18, -19, -21) over one parsed document.
 *
 * Findings are advisory by definition — they never make a document invalid.
 *
 * @param {object} doc - a parsed DSDS document (base or standalone entry)
 * @param {{levels?: Map<string, string>}} [ctx] - `levels` from
 *   guidelineLevelIndex, so DSDS-19 can rank pointers to rules in other files.
 *   The document's own entries and `shared[]` are always indexed.
 * @returns {{id: string, name: string, pointer: string, message: string}[]}
 */
export function checkStyle20(doc, ctx = {}) {
  const findings = [];
  if (!doc || typeof doc !== 'object') return findings;

  const own = guidelineLevelIndex(entitiesWithPointers(doc).map(([entity]) => entity));
  const levels = new Map([...(ctx.levels ?? []), ...own]);

  for (const rule of styleRules()) {
    const emit = (pointer, message) => findings.push({ id: rule.id, name: rule.name, pointer, message });
    if (rule.scope === 'document') {
      rule.check(doc, emit, { levels });
    } else {
      for (const [entity, at] of entitiesWithPointers(doc)) {
        if (!entity || typeof entity !== 'object') continue;
        rule.check(entity, (pointer, message) => emit(`${at}${pointer}`, message), { levels });
      }
    }
  }
  // Stable, document-order-ish output: group by rule id so a reader fixing one
  // class of problem sees them together.
  return findings.sort((a, b) => a.id.localeCompare(b.id) || a.pointer.localeCompare(b.pointer));
}
