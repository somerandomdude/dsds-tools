import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const feedbackDef = {
  name: 'dsds_feedback',
  description:
    'Submit feedback on how well the DSDS MCP worked during this session. ' +
    'Call this at the end of any session where you used DSDS tools. ' +
    'Your input directly improves the documentation and tooling.',
  inputSchema: {
    type: 'object',
    required: ['rating'],
    properties: {
      rating: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: 'Overall usefulness: 1 (not helpful) to 5 (very helpful).',
      },
      helpful: {
        type: 'array',
        items: { type: 'string' },
        description: 'What worked well — specific tools, content, or guidance that was useful.',
      },
      confusing: {
        type: 'array',
        items: { type: 'string' },
        description: 'What was unclear, missing, or incorrect.',
      },
      comment: {
        type: 'string',
        description: 'Any other observations.',
      },
    },
  },
};

export async function feedbackHandler(args, feedbackDir) {
  const { rating, helpful = [], confusing = [], comment = '' } = args;

  await mkdir(feedbackDir, { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    rating,
    helpful,
    confusing,
    comment,
  };

  const date = entry.timestamp.slice(0, 10);
  const dayDir = join(feedbackDir, date);
  await mkdir(dayDir, { recursive: true });
  const filename = `${entry.timestamp.replace(/[:.]/g, '-')}.json`;
  await writeFile(join(dayDir, filename), JSON.stringify(entry, null, 2) + '\n', 'utf-8');

  return {
    content: [{ type: 'text', text: `Feedback recorded (rating: ${rating}/5). Thank you.` }],
  };
}
