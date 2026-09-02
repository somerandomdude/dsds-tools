import { validateJsonString } from '../validator.js';
import { validateDoc20, looksLike20 } from '../spec/validator-0.20.0.js';
import { loadYaml20 } from '../spec/dsds20-lib.js';
import { getUpdateNotice } from '../spec/version.js';

export const validateDef = {
  name: 'dsds_validate',
  description:
    'Validate a DSDS document against the bundled schema. Accepts either legacy 0.15.2 JSON or real 0.20.0 YAML — auto-detected from the content (JSON parses as JSON; a real 0.20.0 document parses as YAML and has entries/id+kind shaped like the real 0.20.0 model). Returns a list of validation errors, or confirms the document is valid. Use this at any point while authoring.',
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

function renderLegacy(document) {
  const result = validateJsonString(document);
  if (result.parseError) {
    return { isError: true, content: [{ type: 'text', text: `## Validation Failed — Parse Error\n\n${result.parseError}` }] };
  }
  const text = result.valid
    ? '## Valid DSDS Document\n\nThe document passes schema validation.'
    : [
        `## Validation Failed — ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`,
        '',
        ...result.errors.map(e => `- **${e.path}**: ${e.message}`),
      ].join('\n');
  return { content: [{ type: 'text', text }] };
}

function render20(doc, filePath) {
  const { errors, warnings, advisories } = validateDoc20(doc, { filePath });
  const lines = [];
  if (errors.length === 0) {
    lines.push('## Valid DSDS 0.20.0 Document', '', 'The document passes schema and semantic validation.');
  } else {
    lines.push(`## Validation Failed — ${errors.length} error${errors.length !== 1 ? 's' : ''}`, '', ...errors.map(e => `- ${e}`));
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

export async function validateHandler({ document, filePath }) {
  // A real 0.20.0 document is YAML; try that path first and use it whenever
  // the parsed result actually looks like the real 0.20.0 shape (entries+
  // schemaVersion, or a standalone entry with id+kind). Anything else falls
  // back to the legacy JSON validator, which reports its own parse error if
  // the text isn't valid JSON either — so a genuinely malformed document
  // still gets one clear error, not two conflicting ones.
  let parsedAsYaml;
  try {
    parsedAsYaml = loadYaml20(document);
  } catch {
    parsedAsYaml = undefined;
  }
  if (looksLike20(parsedAsYaml)) {
    const result = render20(parsedAsYaml, filePath);
    const notice = getUpdateNotice();
    if (notice) result.content[0].text += notice;
    return result;
  }

  const result = renderLegacy(document);
  const isParseError = result.content[0].text.includes('Parse Error');
  if (!isParseError) {
    const notice = getUpdateNotice();
    if (notice) result.content[0].text += notice;
  }
  return result;
}
