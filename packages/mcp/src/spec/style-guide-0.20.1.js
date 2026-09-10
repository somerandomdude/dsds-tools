// The DSDS authoring style guide (STYLE_GUIDE.md, new in spec v0.20.1):
// how to order things inside a document so every document reads the same way.
//
// Seven warning-only rules, DSDS-17 through DSDS-23, all `enforcement: advisory`
// in schema-0.20.1/conformance-rules.yaml. None of this changes whether a
// document is *valid* — the schema accepts any order — so nothing here ever
// produces an error, and `dsds_validate`'s verdict is unaffected.
//
// Ported from the upstream spec repo's scripts/validate/lint-docs.js at tag
// v0.20.1. Every canonical order is read from the vendored schema files at
// runtime (see schema-order.js) rather than transcribed, because the guide's
// own first rule is that the schema *is* the field order.
import { join } from 'node:path';
import { loadYamlFile20 } from './dsds20-lib.js';
import {
  declaredEnum,
  declaredProps,
  entryFieldOrder,
  enumRanker,
  EXTENSIONS_KEY,
  firstInversion,
  SCHEMA_DIR,
} from './schema-order.js';

// ── Canonical orders, all schema-derived ────────────────────────────────────

const SHARED_FIELD_ORDER = declaredProps('shared.schema.yaml');
const DOCUMENT_FIELD_ORDER = declaredProps('base.schema.yaml');

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

// §4's breadth scale has three tiers, not two: when-to-use, then how-to-use,
// then "a section really about one tag". The third isn't a field — it's true
// when every item names the same tag — so it's read from the items.
const TAG_TIER = FRAMING.values.length;

/**
 * The single tag a section is entirely about, or null.
 *
 * Two items minimum: a one-item section shares a tag with itself no matter
 * what, and treating that as "about one tag" would sort every lone tagged item
 * to the end for a reason no reader would recognize.
 */
function sharedTag(section) {
  const items = section.items;
  if (!Array.isArray(items) || items.length < 2) return null;
  if (!items.every((it) => it && Array.isArray(it.tags) && it.tags.length)) return null;
  const shared = items
    .map((it) => new Set(it.tags))
    .reduce((a, b) => new Set([...a].filter((tag) => b.has(tag))));
  return shared.size ? [...shared].sort()[0] : null;
}

// A tag-scoped section is the narrowest tier whatever its `framing`, so this
// replaces the framing rank rather than composing with it.
const breadthRank = (section) => (sharedTag(section) ? TAG_TIER : framingRank(section.framing));

function describeBreadth(section) {
  const tag = sharedTag(section);
  return tag ? `a section about one tag (\`${tag}\`)` : `a \`framing: ${section.framing || FRAMING.fallback}\` section`;
}

const describeTier = (tier) => (tier === TAG_TIER ? 'both about one tag' : `both ${FRAMING.values[tier]}`);

// A section that leaves `for` out is ranked as the schema's default, so it has
// to be *named* as the default too — printing "for: undefined" would describe
// the document rather than the problem.
function describeAudience(section) {
  return section.for === undefined ? `${AUDIENCE.fallback} (defaulted)` : section.for;
}

/** A shape built from a shared file plus a specific one: shared, own, then `$extensions`. */
function composedOrder(baseFile, memberFile) {
  const base = declaredProps(baseFile);
  const own = declaredProps(memberFile).filter((k) => !base.includes(k));
  return [...base.filter((k) => k !== EXTENSIONS_KEY), ...own, EXTENSIONS_KEY];
}

function itemOrder(kind) {
  const doc = loadYamlFile20(join(SCHEMA_DIR, 'sections', `${kind}.schema.yaml`));
  const inline = (doc.allOf || []).find((m) => m.properties);
  return Object.keys(inline.properties.items.items.properties);
}

const METADATA_ORDER = {
  entry: composedOrder('metadata/metadata.schema.yaml', 'metadata/entry-metadata.schema.yaml'),
  system: composedOrder('metadata/metadata.schema.yaml', 'metadata/system-metadata.schema.yaml'),
};
const ITEM_ORDER = {
  guidelines: itemOrder('guidelines'),
  definitions: itemOrder('definitions'),
  steps: itemOrder('steps'),
};
const COMBO_ORDER = declaredProps('common/combo.schema.yaml');
// ref.schema.yaml is a oneOf (a bare string, or the object form) — the object
// form is the only branch with fields to order.
const REF_ORDER = Object.keys(
  loadYamlFile20(join(SCHEMA_DIR, 'common', 'ref.schema.yaml')).oneOf.find((m) => m.properties).properties,
);

// §4: a section leads with `kind`, `for`, then the one field its kind adds,
// then the rest of the shared order. The only shape whose two lists interleave
// rather than concatenate.
const SECTION_KIND_FIELD = { guidelines: 'framing', steps: 'ordered' };
const SECTION_TAIL = declaredProps('sections/section.schema.yaml').filter((k) => k !== 'kind' && k !== 'for');
function sectionFieldOrder(kind) {
  const own = SECTION_KIND_FIELD[kind];
  return ['kind', 'for', ...(own ? [own] : []), ...SECTION_TAIL];
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
  // §2 — only the relative order of fields actually present is checked, so an
  // entry that omits a field is never flagged for its absence.
  'entry-field-order': (entry, emit) => {
    const order = entry.kind === undefined ? SHARED_FIELD_ORDER : entryFieldOrder(entry.kind);
    const actual = Object.keys(entry).filter((k) => order.includes(k));
    const inversion = firstInversion(actual, (k) => order.indexOf(k));
    if (inversion) {
      const source =
        entry.kind === undefined ? 'shared.schema.yaml' : `entries/entry.schema.yaml, then entries/${entry.kind}.schema.yaml`;
      emit(
        '',
        `"${entry.id}" has \`${inversion[0]}\` before \`${inversion[1]}\` — STYLE_GUIDE.md §2 says match the spec's own declared order, which for a ${entry.kind || 'shared'} entry (${source}) is [${order.join(', ')}]. Actual order here: [${actual.join(', ')}].`,
      );
    }
  },

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
        `"${entry.id}" has ${describeBreadth(breadthInversion[0])} before ${describeBreadth(breadthInversion[1])} — STYLE_GUIDE.md §4 orders guidelines sections ${FRAMING.values.join(', ')}, then sections about one tag.`,
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
  'guideline-item-level-order': (entry, emit) => {
    (entry.sections || []).forEach((section, si) => {
      if (!section || section.kind !== 'guidelines' || !Array.isArray(section.items)) return;
      const inversion = firstInversion(section.items, (it) => levelRank(it.level));
      if (inversion) {
        emit(
          `/sections/${si}/items`,
          `"${entry.id}" has a level: ${inversion[0].level} item before a level: ${inversion[1].level} one — STYLE_GUIDE.md orders guideline items ${LEVEL.values.join(', ')}.`,
        );
      }
    });
  },
};

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

  // §3/§4/§5/§6 — the field order of every shape nested inside an entry.
  'nested-field-order': (doc, emit) => {
    const check = (label, pointer, obj, order) => {
      const present = Object.keys(obj).filter((k) => order.includes(k));
      const inversion = firstInversion(present, (k) => order.indexOf(k));
      if (inversion) {
        emit(
          pointer,
          `${label} has \`${inversion[0]}\` before \`${inversion[1]}\` — its schema file declares [${order.filter((k) => present.includes(k)).join(', ')}].`,
        );
      }
    };

    // Refs turn up all over an entry (`refs`, `related`, `extends`, `evidence`,
    // `checks`, `specs`, `source`, …), so they're found by shape rather than by
    // field name. `$extensions` is skipped: it holds vendor data, and an object
    // in there carrying `href` is not a ref.
    const walkRefs = (node, pointer) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walkRefs(v, `${pointer}/${i}`));
        return;
      }
      if ('to' in node || 'href' in node) check('a ref', pointer, node, REF_ORDER);
      for (const [key, value] of Object.entries(node)) {
        if (key === EXTENSIONS_KEY) continue;
        if (value && typeof value === 'object') walkRefs(value, `${pointer}/${key}`);
      }
    };

    for (const [entity, at] of entitiesWithPointers(doc)) {
      if (!entity || typeof entity !== 'object') continue;
      if (entity.metadata && typeof entity.metadata === 'object') {
        const order = entity.kind === 'system' ? METADATA_ORDER.system : METADATA_ORDER.entry;
        check('a `metadata` block', `${at}/metadata`, entity.metadata, order);
      }
      (entity.combos || []).forEach((combo, ci) => {
        if (combo && typeof combo === 'object') check('a `combo`', `${at}/combos/${ci}`, combo, COMBO_ORDER);
      });
      (entity.sections || []).forEach((section, si) => {
        if (!section || typeof section !== 'object') return;
        const sectionAt = `${at}/sections/${si}`;
        check('a section', sectionAt, section, sectionFieldOrder(section.kind));
        if (section.metadata && typeof section.metadata === 'object') {
          check("a section's `metadata`", `${sectionAt}/metadata`, section.metadata, METADATA_ORDER.entry);
        }
        const order = ITEM_ORDER[section.kind];
        if (!order) return;
        (section.items || []).forEach((item, ii) => {
          if (item && typeof item === 'object') check(`a ${section.kind} item`, `${sectionAt}/items/${ii}`, item, order);
        });
      });
    }
    walkRefs(doc, '');
  },

  // §6 — combos[] sorts by subject, then by level within one subject.
  'combo-order': (doc, emit) => {
    for (const [entity, at] of entitiesWithPointers(doc)) {
      const combos = entity && entity.combos;
      if (!Array.isArray(combos) || combos.length < 2) continue;
      for (let i = 1; i < combos.length; i++) {
        const prev = combos[i - 1];
        const next = combos[i];
        const bySubject = String(prev && prev.subject).localeCompare(String(next && next.subject));
        if (bySubject > 0) {
          emit(
            `${at}/combos`,
            `subject "${prev.subject}" comes before "${next.subject}" — STYLE_GUIDE.md §6 sorts \`combos[]\` by \`subject\`, so every rule about one trait or token sits together.`,
          );
          break;
        }
        if (bySubject === 0 && levelRank(prev.level) > levelRank(next.level)) {
          emit(
            `${at}/combos`,
            `two combos share subject "${prev.subject}" but run level: ${prev.level} before level: ${next.level} — STYLE_GUIDE.md §6 orders them ${LEVEL.values.join(', ')} within one subject.`,
          );
          break;
        }
      }
    }
  },

  // §1 — only applies to a base document (has schemaVersion); a standalone
  // entry file has no document-level fields to order.
  'document-field-order': (doc, emit) => {
    if (typeof doc.schemaVersion === 'undefined') return;
    const actual = Object.keys(doc).filter((k) => DOCUMENT_FIELD_ORDER.includes(k));
    const inversion = firstInversion(actual, (k) => DOCUMENT_FIELD_ORDER.indexOf(k));
    if (inversion) {
      emit(
        '',
        `document has \`${inversion[0]}\` before \`${inversion[1]}\` — STYLE_GUIDE.md says match the spec's own declared order, which for a base document (base.schema.yaml) is [${DOCUMENT_FIELD_ORDER.join(', ')}]. Actual order here: [${actual.join(', ')}].`,
      );
    }
  },
};

// ── Catalog binding ─────────────────────────────────────────────────────────

/**
 * The style-guide rules from the vendored catalog, joined to their
 * implementations. `styleGuide: true` in conformance-rules.yaml is what marks
 * a rule as belonging to STYLE_GUIDE.md rather than the wider advisory tier;
 * we fall back to the known id range when the catalog predates that flag.
 */
const STYLE_RULE_IDS = new Set(['DSDS-17', 'DSDS-18', 'DSDS-19', 'DSDS-20', 'DSDS-21', 'DSDS-22', 'DSDS-23']);

let cachedRules = null;

export function styleRules() {
  if (cachedRules) return cachedRules;
  const catalog = loadYamlFile20(join(SCHEMA_DIR, 'conformance-rules.yaml'));
  const rules = (Array.isArray(catalog) ? catalog : []).filter((r) => STYLE_RULE_IDS.has(r.id));

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
    throw new Error(`style-guide rule drift against schema-0.20.1/conformance-rules.yaml — ${parts.join('; ')}`);
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
 * Run every style-guide rule (DSDS-17..23) over one parsed document.
 *
 * Findings are advisory by definition — they never make a document invalid.
 *
 * @param {object} doc - a parsed DSDS 0.20.x document (base or standalone entry)
 * @returns {{id: string, name: string, pointer: string, message: string}[]}
 */
export function checkStyle20(doc) {
  const findings = [];
  if (!doc || typeof doc !== 'object') return findings;

  for (const rule of styleRules()) {
    const emit = (pointer, message) => findings.push({ id: rule.id, name: rule.name, pointer, message });
    if (rule.scope === 'document') {
      rule.check(doc, emit);
    } else {
      for (const [entity, at] of entitiesWithPointers(doc)) {
        if (!entity || typeof entity !== 'object') continue;
        rule.check(entity, (pointer, message) => emit(`${at}${pointer}`, message));
      }
    }
  }
  // Stable, document-order-ish output: group by rule id so a reader fixing one
  // class of problem sees them together.
  return findings.sort((a, b) => a.id.localeCompare(b.id) || a.pointer.localeCompare(b.pointer));
}
