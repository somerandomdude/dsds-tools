// Shared prompt runtime — the catalog of prompts and the renderer that turns
// one into messages.
//
// The counterpart of registry.js for MCP's second capability. The MCP server
// serves these over the prompts/* protocol methods; the CLI serves the same
// catalog through `dsds prompt`, so a shell-only agent can read the briefing
// an MCP client gets as a slash command.

import { BUILD_BRIEF, AUTHOR_BRIEF, ASK_BRIEF, PROMPT_META } from './briefs.js';
import { renderIntroEntity } from './intro.js';

export const INTRO_PROMPT_NAME = 'dsds-intro';

function promptMessage(text) {
  return { role: 'user', content: { type: 'text', text } };
}

// The three task briefs share one shape: an optional task line, then the brief.
const BRIEF_PROMPTS = [
  { meta: PROMPT_META.build, brief: BUILD_BRIEF, taskLabel: 'Your task' },
  { meta: PROMPT_META.author, brief: AUTHOR_BRIEF, taskLabel: 'Your task' },
  { meta: PROMPT_META.ask, brief: ASK_BRIEF, taskLabel: 'Your question' },
];

/**
 * Build the shared prompt runtime.
 *
 * `listPrompts` is a function rather than a static array because the intro
 * prompt only exists when intro entities are configured, and the caller's
 * intro getter is the authority on that.
 *
 * @param {object} [deps]
 * @param {() => Array} [deps.getIntro] - intro entities (DSDS_INTRO_PATHS)
 * @returns {{
 *   listPrompts: () => Array<{name: string, description: string, arguments: Array}>,
 *   getPrompt: (name: string, args?: object) => {messages: Array},
 * }}
 */
export function createPromptRuntime({ getIntro = () => [] } = {}) {
  function listPrompts() {
    const prompts = BRIEF_PROMPTS.map(({ meta }) => ({
      name: meta.name,
      description: meta.description,
      arguments: [{ name: 'task', description: meta.taskArgDescription, required: false }],
    }));

    const introEntities = getIntro();
    if (introEntities.length > 0) {
      const introNames = introEntities.map(e => e.name ?? e.identifier).join(', ');
      prompts.push({
        name: INTRO_PROMPT_NAME,
        description: `${introNames} — retrieve the design system introduction${introEntities.length > 1 ? 's' : ''} loaded on server start.`,
        arguments: [],
      });
    }

    return prompts;
  }

  // Render one prompt to MCP messages. Throws on an unknown name (the MCP
  // protocol reports this as a request error); callers that need a soft
  // failure should check listPrompts first.
  function getPrompt(name, args = {}) {
    const task = args.task ?? null;

    const brief = BRIEF_PROMPTS.find(p => p.meta.name === name);
    if (brief) {
      const lines = [];
      if (task) lines.push(`## ${brief.taskLabel}: ${task}`, '');
      lines.push(brief.brief);
      return { messages: [promptMessage(lines.join('\n'))] };
    }

    if (name === INTRO_PROMPT_NAME) {
      const introEntities = getIntro();
      if (introEntities.length === 0) {
        throw new Error('No intro entities configured. Set the DSDS_INTRO_PATHS environment variable.');
      }
      const text = introEntities.map(renderIntroEntity).filter(Boolean).join('\n\n');
      return { messages: [promptMessage(text)] };
    }

    throw new Error(`Unknown prompt: "${name}"`);
  }

  return { listPrompts, getPrompt };
}
