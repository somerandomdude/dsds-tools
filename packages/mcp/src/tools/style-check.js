import { loadYaml20 } from '../spec/dsds20-lib.js';
import { looksLike20 } from '../spec/validator-0.20.0.js';
import { checkStyle20, styleRules } from '../spec/style-guide-0.20.1.js';
import { entryFieldOrder, declaredProps } from '../spec/schema-order.js';

export const styleCheckDef = {
  name: 'dsds_style_check',
  description:
    "Check a DSDS 0.20.x document against the authoring style guide (STYLE_GUIDE.md, new in spec 0.20.1) — the seven advisory rules DSDS-17 through DSDS-23, which govern the ORDER things appear in: an entry's own fields, entries within a base document, sections and their grouping, guideline items by requirement level, nested shapes like metadata/combos/refs, and combos by subject. " +
    'Ordering never affects validity — the schema accepts any order — so this is deliberately separate from dsds_validate, which is unchanged and still the tool that answers "is this document allowed?". Use this one after a document already validates, to make it read the same way as every other document. ' +
    'Returns each finding with a JSON pointer to the offending spot, plus a suggested corrected field order where one applies.',
  inputSchema: {
    type: 'object',
    properties: {
      document: {
        type: 'string',
        description: 'The DSDS 0.20.x document as a YAML string (a base document, or a standalone entry file).',
      },
      suggest: {
        type: 'boolean',
        description:
          'Include a suggested corrected ordering for each field-order finding (default true). Set false for a terser report of just the problems.',
      },
    },
    required: ['document'],
  },
};

/**
 * The corrected field order for a finding, when the rule is about the order of
 * an object's own fields and we can name the intended sequence.
 *
 * Only the field-order rules get a suggestion. The others (section grouping,
 * item level order, combo sorting) reorder *array elements*, where the
 * corrected sequence depends on content the message already names, and where
 * the guide explicitly leaves ties to the author's judgment — printing a
 * concrete "do this" there would invent an order the guide declines to.
 */
function suggestionFor(finding, doc) {
  const present = (obj, order) => order.filter((k) => Object.prototype.hasOwnProperty.call(obj, k));

  if (finding.id === 'DSDS-20') {
    if (typeof doc?.schemaVersion === 'undefined') return null;
    return present(doc, declaredProps('base.schema.yaml'));
  }

  if (finding.id === 'DSDS-17') {
    // Resolve the pointer back to the entity the finding is about.
    const entity = resolvePointer(doc, finding.pointer);
    if (!entity || typeof entity !== 'object') return null;
    const order = entity.kind === undefined ? declaredProps('shared.schema.yaml') : entryFieldOrder(entity.kind);
    return present(entity, order);
  }

  // DSDS-22 covers many nested shapes; the message already names the declared
  // order for the specific one, so re-deriving it here would duplicate that.
  return null;
}

/** Minimal JSON-pointer resolve, enough for the `/entries/0`-style pointers we emit. */
function resolvePointer(doc, pointer) {
  if (!pointer) return doc;
  let node = doc;
  for (const rawSeg of pointer.split('/').slice(1)) {
    if (node == null) return null;
    const seg = rawSeg.replace(/~1/g, '/').replace(/~0/g, '~');
    node = Array.isArray(node) ? node[Number(seg)] : node[seg];
  }
  return node ?? null;
}

export function renderStyleCheck(doc, { suggest = true } = {}) {
  const findings = checkStyle20(doc);
  const ruleCount = styleRules().length;

  if (findings.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: [
            '## Style guide: clean',
            '',
            `The document follows STYLE_GUIDE.md — all ${ruleCount} ordering rules (DSDS-17..23) pass.`,
          ].join('\n'),
        },
      ],
    };
  }

  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.id)) byRule.set(f.id, []);
    byRule.get(f.id).push(f);
  }

  const lines = [
    `## Style guide — ${findings.length} ordering suggestion${findings.length !== 1 ? 's' : ''}`,
    '',
    'These are advisory. Ordering does not affect validity, and `dsds_validate` is unaffected by anything here.',
  ];

  for (const [id, group] of byRule) {
    const rule = styleRules().find((r) => r.id === id);
    lines.push('', `### ${id} — ${rule?.title ?? rule?.name ?? ''}`, '');
    for (const f of group) {
      lines.push(`- **${f.pointer || '/'}** — ${f.message}`);
      if (suggest) {
        const order = suggestionFor(f, doc);
        if (order?.length) lines.push(`  - Suggested order: \`${order.join(', ')}\``);
      }
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function styleCheckHandler({ document, suggest = true }) {
  let doc;
  try {
    doc = loadYaml20(document);
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `## Style check failed — Parse Error\n\n${e.message}` }],
    };
  }

  if (!looksLike20(doc)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: "## Style check skipped\n\nThe style guide (STYLE_GUIDE.md) describes the DSDS 0.20.x model, and this document doesn't parse as one — it looks like legacy 0.15.2 JSON, or isn't a DSDS document at all. There is no 0.15.2 equivalent of these rules. Validate it with `dsds_validate` instead.",
        },
      ],
    };
  }

  return renderStyleCheck(doc, { suggest });
}
