import { validateDoc20, looksLike20 } from '../spec/validator.js';
import { loadYaml20 } from '../spec/dsds-lib.js';
import { BUNDLED_VERSION, getUpdateNotice } from '../spec/version.js';

export const validateDef = {
  name: 'dsds_validate',
  description:
    'Validate a DSDS document against the bundled schema. Accepts real 0.20.0 YAML — auto-detected from the content (JSON parses as JSON; a real 0.20.0 document parses as YAML and has entries/id+kind shaped like the real 0.20.0 model). Returns a list of validation errors, or confirms the document is valid. Use this at any point while authoring.',
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
          'Optional: the absolute path this document was read from. Only needed to also check DSDS-11 (that a relative sourceFiles/source/rel:file href actually exists on disk, resolved relative to this path) — omit it for a document you are drafting inline with no real file yet.',
      },
    },
    required: ['document'],
  },
};


/**
 * The one error every 0.20.x corpus hits on the way to 0.21.0.
 *
 * `traitType` became required on every component trait, so a document that
 * was valid yesterday now fails once per trait. The schema error names the
 * missing property correctly but says nothing about which of the two values
 * to write, and an author reading "must have required property" has no way to
 * know a mechanical migration exists. Both facts belong next to the error.
 *
 * Nothing else in the release needs this: `tags` on a section is optional, so
 * no existing document fails for it.
 */
function migrationHint(errors) {
  const missing = errors.filter((e) => /required property 'traitType'/.test(String(e))).length;
  if (!missing) return [];
  return [
    '',
    `### Migrating to ${BUNDLED_VERSION}`,
    '',
    `\`traitType\` is required on every component trait as of 0.21.0 — ${missing} trait${missing !== 1 ? 's' : ''} here ${missing !== 1 ? 'are' : 'is'} missing it.`,
    'Use `variant` for a dimension the caller configures (`size`, `tone`), and `state` for a condition the component can be in (`hover`, `loading`, `disabled`).',
    'A `state` is not always something the component sets on its own — `disabled` and `loading` are states the caller turns on.',
    'The spec repo ships `scripts/tools/migrate-to-0.21.js`, which adds the field in place and prints every trait whose value it had to guess.',
  ];
}

function render20(doc, filePath) {
  const { errors, warnings, advisories } = validateDoc20(doc, { filePath });
  const lines = [];
  if (errors.length === 0) {
    lines.push(`## Valid DSDS ${BUNDLED_VERSION} Document`, '', 'The document passes schema and semantic validation.');
  } else {
    lines.push(`## Validation Failed — ${errors.length} error${errors.length !== 1 ? 's' : ''}`, '', ...errors.map(e => `- ${e}`));
    lines.push(...migrationHint(errors));
  }
  if (warnings.length) {
    lines.push('', `### ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`, '', ...warnings.map(w => `- ${w}`));
  }
  if (advisories.length) {
    // Editorial/documentation-quality findings (DSDS-12+) — never affect
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
