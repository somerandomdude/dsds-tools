import { validateDoc20, looksLike20 } from '../spec/validator.js';
import { loadYaml20 } from '../spec/dsds-lib.js';
import { BUNDLED_VERSION, getUpdateNotice } from '../spec/version.js';

export const validateDef = {
  name: 'dsds_validate',
  description:
    "Validate a DSDS document with the spec's own reference validator, bundled with its schema. Accepts YAML or JSON: a base document (`schemaVersion` and `entries`) or a standalone entry (`id` and `kind`). Returns errors, warnings and documentation suggestions, each tagged with its rule id, or confirms the document is valid. Use this at any point while authoring.",
  inputSchema: {
    type: 'object',
    properties: {
      document: {
        type: 'string',
        description: 'The DSDS document as a JSON or YAML string.',
      },
      filePath: {
        type: 'string',
        description:
          "Optional: the absolute path this document was read from. Turns on DSDS-11 (relative `sourceFiles`, `source`, `rel: file` and `rel: source` paths exist on disk) and lets refs resolve across the files it links with `rel: file`. Omit it for a document you are drafting inline with no real file yet.",
      },
    },
    required: ['document'],
  },
};


// Fields and `rel` values 0.22.0 removed. A document written for 0.21 fails
// on them, and the error alone doesn't say a script exists that fixes them.
const REMOVED_IN_0_22 = new Set(['purpose', 'related', 'context']);
const RETIRED_RELS_0_22 = new Set([
  'composes', 'depends-on', 'part-of', 'implements', 'replaces', 'test', 'lint-rule', 'agent-test',
  'external-link', 'storybook', 'package', 'see-also', 'pairs-with', 'excludes',
]);

/** True when a document uses something 0.22.0 removed. */
function usesRemoved022(value) {
  if (Array.isArray(value)) return value.some(usesRemoved022);
  if (!value || typeof value !== 'object') return false;
  if (typeof value.rel === 'string' && RETIRED_RELS_0_22.has(value.rel)) return true;
  for (const [key, v] of Object.entries(value)) {
    if (key === '$extensions') continue;
    if (REMOVED_IN_0_22.has(key) && (key !== 'context' || typeof v === 'string')) return true;
    if (usesRemoved022(v)) return true;
  }
  return false;
}

function migrationHint(doc, errors, warnings) {
  if (!errors.length && !warnings.some((w) => w.startsWith('[DSDS-24]'))) return [];
  if (!usesRemoved022(doc)) return [];
  return [
    '',
    `### Migrating to ${BUNDLED_VERSION}`,
    '',
    'This document uses fields or `rel` values that 0.22.0 removed: `purpose` and `metadata.context` folded into `description`, `related` became `alternatives` (or `refines` on an agent rule), and pointers moved into fields named for their kind (`uses`, `extends`, `evidence`, `checks`, `replacedBy`).',
    'The spec repo ships `scripts/tools/migrate-to-0.22.js`, which makes these changes in place, keeps comments, and reports anything it can\'t decide. Pass every file of a project in one run.',
  ];
}

function render20(doc, filePath) {
  const { errors, warnings, advisories } = validateDoc20(doc, { filePath });
  const hint = migrationHint(doc, errors, warnings);
  const lines = [];
  if (errors.length === 0) {
    lines.push(`## Valid DSDS ${BUNDLED_VERSION} Document`, '', 'The document passes schema and semantic validation.');
  } else {
    lines.push(`## Validation Failed — ${errors.length} error${errors.length !== 1 ? 's' : ''}`, '', ...errors.map(e => `- ${e}`));
  }
  if (warnings.length) {
    lines.push('', `### ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`, '', ...warnings.map(w => `- ${w}`));
  }
  lines.push(...hint);
  if (advisories.length) {
    // Editorial/documentation-quality findings (DSDS-13+) — never affect
    // validity or isError, unlike errors/warnings above.
    lines.push('', `### ${advisories.length} documentation suggestion${advisories.length !== 1 ? 's' : ''}`, '', ...advisories.map(a => `- ${a}`));
  }
  return { isError: errors.length > 0, content: [{ type: 'text', text: lines.join('\n') }] };
}

/** Validate a document against the bundled schema and the conformance rules. */
export async function validateHandler({ document, filePath }) {
  let parsed;
  try {
    parsed = loadYaml20(document);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `## Parse Error

${err.message}` }],
    };
  }
  if (!looksLike20(parsed)) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `## Not a DSDS ${BUNDLED_VERSION} document

Expected \`entries\` with a \`schemaVersion\`, or a standalone entry with \`id\` and \`kind\`.`,
      }],
    };
  }
  const result = render20(parsed, filePath);
  const notice = getUpdateNotice();
  if (notice) result.content[0].text += notice;
  return result;
}
