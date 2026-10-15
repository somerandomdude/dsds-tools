import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadYaml20 } from '../spec/dsds-lib.js';
import { looksLike20 } from '../spec/validator.js';
import { checkStyle20, guidelineLevelIndex, styleRules } from '../spec/style-guide.js';
import { VENDOR_DIR } from '../spec/schema-order.js';

// Upstream's dsds-format, vendored with the schema. It moves lines and never
// re-serialises, so the text it returns keeps the author's comments and wrapping.
const { formatText } = createRequire(import.meta.url)(join(VENDOR_DIR, 'scripts/format/format.js'));

export const styleCheckDef = {
  name: 'dsds_style_check',
  description:
    "Check a DSDS document against the authoring style guide (STYLE_GUIDE.md), which governs the ORDER things appear in. " +
    "Field order (every object's fields, and combos by subject) has one right answer, so this runs the spec's own formatter, dsds-format, and returns the reordered document: it moves lines and keeps comments. " +
    "Reading order is three advisory rules that report rather than fix, since an author can have a reason to break them: DSDS-18 (sections), DSDS-19 (guideline items by level) and DSDS-21 (entries by kind), each with a JSON pointer. " +
    'Ordering never affects validity, so this is separate from dsds_validate. Use it after a document validates.',
  inputSchema: {
    type: 'object',
    properties: {
      document: {
        type: 'string',
        description: 'The DSDS document as a YAML string (a base document, or a standalone entry file).',
      },
      suggest: {
        type: 'boolean',
        description:
          'Include the reordered document when its field order is off (default true). Set false to only say whether it needs reordering.',
      },
    },
    required: ['document'],
  },
};

/**
 * Guideline levels from the loaded design system, so DSDS-19 can rank a
 * pointer to a shared rule that lives in another file. Empty when nothing is
 * configured: the check then skips pointers it cannot resolve.
 */
function corpusLevels(getSystems) {
  let systems = [];
  try {
    systems = getSystems?.() ?? [];
  } catch {
    return new Map();
  }
  const pool = new Map();
  for (const system of systems) {
    for (const e of system.entities ?? []) {
      for (const p of e?.__sharedEntries ?? []) if (p?.id && !pool.has(p.id)) pool.set(p.id, p);
      if (e?.id && !pool.has(e.id)) pool.set(e.id, e);
    }
  }
  return guidelineLevelIndex(pool.values());
}

/** What dsds-format would do to the text: the reordered text, or null when it's already in order. */
function fieldOrder(text) {
  const result = formatText(text);
  return {
    text: result.changed ? result.text : null,
    unfixable: result.unfixable ?? [],
    error: result.error ?? null,
  };
}

function renderStyleCheck(text, doc, { suggest = true, levels } = {}) {
  const findings = checkStyle20(doc, { levels });
  const format = fieldOrder(text);
  const rules = styleRules();

  if (findings.length === 0 && !format.text && !format.unfixable.length && !format.error) {
    return {
      content: [{
        type: 'text',
        text: [
          '## Style guide: clean',
          '',
          `Field order matches the schema, and the ${rules.length} reading-order rules (${rules.map((r) => r.id).join(', ')}) pass.`,
        ].join('\n'),
      }],
    };
  }

  const lines = [
    '## Style guide',
    '',
    'These are advisory. Ordering does not affect validity, and `dsds_validate` is unaffected by anything here.',
  ];

  if (format.text || format.unfixable.length || format.error) {
    lines.push('', '### Field order (dsds-format)', '');
    if (format.error) lines.push(`dsds-format left the document alone: ${format.error}.`);
    if (format.text) {
      lines.push("Some fields aren't in the order the schema declares. dsds-format reorders them by moving lines, so comments and wrapping stay as written.");
      if (suggest) lines.push('', 'The document in order:', '', '```yaml', format.text.replace(/\n$/, ''), '```');
    }
    for (const u of format.unfixable) {
      lines.push(`- **${u.pointer}** is out of order but can't be moved safely (${u.reason}). Reorder it by hand: \`${u.order.join(', ')}\`.`);
    }
  }

  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.id)) byRule.set(f.id, []);
    byRule.get(f.id).push(f);
  }
  for (const [id, group] of byRule) {
    const rule = rules.find((r) => r.id === id);
    lines.push('', `### ${id} — ${rule?.title ?? rule?.name ?? ''}`, '');
    for (const f of group) lines.push(`- **${f.pointer || '/'}** — ${f.message}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/** Advisory ordering findings for a document. Never affects validity. */
export async function styleCheckHandler({ document, suggest = true }, getSystems) {
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
          text: "## Style check skipped\n\nThe style guide (STYLE_GUIDE.md) describes the DSDS model, and this document doesn't parse as one — it looks like legacy 0.15.2 JSON, or isn't a DSDS document at all. There is no 0.15.2 equivalent of these rules. Validate it with `dsds_validate` instead.",
        },
      ],
    };
  }

  return renderStyleCheck(document, doc, { suggest, levels: corpusLevels(getSystems) });
}
