import { validateJsonString } from '../validator.js';
import { getUpdateNotice } from '../spec/version.js';

export const validateDef = {
  name: 'dsds_validate',
  description:
    'Validate a DSDS JSON document against the bundled schema. Returns a list of validation errors, or confirms the document is valid. Use this at any point while authoring.',
  inputSchema: {
    type: 'object',
    properties: {
      document: {
        type: 'string',
        description: 'The DSDS document as a JSON string.',
      },
    },
    required: ['document'],
  },
};

export async function validateHandler({ document }) {
  const result = validateJsonString(document);

  if (result.parseError) {
    return {
      isError: true,
      content: [{ type: 'text', text: `## Validation Failed — Parse Error\n\n${result.parseError}` }],
    };
  }

  let text;
  if (result.valid) {
    text = '## Valid DSDS Document\n\nThe document passes schema validation.';
  } else {
    const errorLines = result.errors.map(e => `- **${e.path}**: ${e.message}`);
    text = [
      `## Validation Failed — ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`,
      '',
      ...errorLines,
    ].join('\n');
  }

  const notice = getUpdateNotice();
  if (notice) text += notice;

  return { content: [{ type: 'text', text }] };
}
