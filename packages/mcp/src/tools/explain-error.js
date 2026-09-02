/**
 * dsds_explain_error — pattern-matches a raw compiler/build error against a
 * small set of common, generic TypeScript/JSX mistakes and returns an
 * actionable fix hint for each match, not just the raw error text.
 *
 * Ported from agent-tester's `src/pipeline/error-hints.js`, where this same
 * logic lived gated behind that harness's private fix loop — useful only to
 * agents running inside that measurement tool. Exposing it as a first-class
 * MCP tool means any agent, in any project, can call it: reactively right
 * after a build/typecheck fails (paste the error, get a hint instead of
 * re-guessing from raw compiler type-soup), or proactively before writing
 * code, to check whether a pattern it's about to use is a known gotcha.
 *
 * Deliberately generic: this tool ships to every DSDS-documented project
 * regardless of which design system it targets, so patterns only recognize
 * the *shape* of common TypeScript/JSX error messages — never a specific
 * package, component name, or prop. Product-specific error explanations
 * belong in that project's own documentation (dsds_get_agent_context),
 * which this tool's "no match" response explicitly points to.
 */

export const explainErrorDef = {
  name: 'dsds_explain_error',
  description:
    'Explain a raw TypeScript/build error and return an actionable fix hint, not just the error text. ' +
    'Matches common, generic mistakes: an invalid/nonexistent prop, a missing required prop, a boolean prop ' +
    'given a string, a number given where a CSS string is expected, an implicit-any parameter, and editing ' +
    'scaffold/config files that should be left alone. Call this reactively right after a build or typecheck ' +
    'fails — paste the full error output — or proactively before writing code, to check whether a pattern ' +
    'you are about to use is a known gotcha. Read-only: never modifies files, never requires DSDS_PATHS.',
  inputSchema: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'string',
        description:
          'Raw error text — TypeScript compiler output, console errors, or both concatenated. Paste as ' +
          'much as you have; matching does not require a specific format or a single error.',
      },
    },
  },
};

export function explainErrorHandler({ error }) {
  const hints = deriveErrorHints(error);

  if (hints.length === 0) {
    return {
      content: [{
        type: 'text',
        text:
          'No known generic pattern matched this error. It may be specific to this project\'s design ' +
          'system rather than a common TypeScript/JSX mistake — check the relevant component\'s ' +
          'dsds_get_agent_context(identifier) for its documented props, required fields, and constraints ' +
          'before guessing a fix.',
      }],
    };
  }

  const lines = ['## Matched hints', ''];
  for (const hint of hints) lines.push(`- ${hint}`);
  lines.push(
    '',
    'These are generic pattern matches, not project-specific. Cross-check against the actual component\'s ' +
    'documentation (dsds_get_agent_context) before re-emitting code — a hint names the shape of the mistake, ' +
    'not necessarily the exact correct value for this design system.',
  );

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ---------------------------------------------------------------------------
// Ported from agent-tester's src/pipeline/error-hints.js (deriveErrorHints).
// Kept manually in sync; see that file's own header for why these patterns
// must stay generic. Pattern 6 (missing required prop) was added here — it
// was not in the original file, but is one of the most common, most clearly
// generic failure shapes observed across dsds-mcp's own measurement runs.
// ---------------------------------------------------------------------------

/**
 * Scan combined error text and return an ordered, de-duplicated list of fix hints.
 * @param {string} text - fatal error + console errors, concatenated
 * @returns {string[]}
 */
function deriveErrorHints(text) {
  if (!text) return [];
  const hints = new Set();

  // 1. Invalid prop: `Property 'X' does not exist on type '… <Component>Props …'`
  const propRe = /Property '([^']+)' does not exist on type '[^']*?\b([A-Z]\w+)Props/g;
  let m;
  while ((m = propRe.exec(text)) !== null) {
    const prop = m[1];
    const component = m[2];
    hints.add(
      `\`${component}\` has no \`${prop}\` prop (the type checker rejected it) — remove it, do not re-add it. Check the component's actual type definition for the correct prop name before re-emitting.`,
    );
  }

  // 2. Missing required prop: `Property 'X' is missing in type '…' but required in type '<Component>Props'`
  const missingRe = /Property '([^']+)' is missing in type '[^']*' but required in type '([A-Z]\w+)Props/g;
  while ((m = missingRe.exec(text)) !== null) {
    const prop = m[1];
    const component = m[2];
    hints.add(
      `\`${component}\` requires a \`${prop}\` prop that's missing here — add it before re-emitting. Check the component's documented required props (dsds_get_agent_context) rather than guessing a value or removing the element.`,
    );
  }

  // 3. Boolean prop given a string: `Type 'string' is not assignable to type 'Responsive<boolean>'`
  // Note: no trailing `'` anchor — optional props (the overwhelming majority)
  // render as `'Responsive<boolean> | undefined'`, not `'Responsive<boolean>'`
  // exactly. Anchoring on the closing quote meant this never matched a real
  // optional-prop error.
  if (/is not assignable to type '(?:Responsive<boolean>|boolean)/.test(text)) {
    hints.add(
      'A boolean prop was given a string (e.g. `fullWidth="true"`). Use the bare prop (`fullWidth`) or a brace boolean (`fullWidth={false}`), never a string.',
    );
  }

  // 4. Number where a CSS string is expected. Same trailing-quote fix as #3.
  if (/is not assignable to type 'Responsive<string>/.test(text)) {
    hints.add(
      'A sizing/grid prop (width, gridTemplateColumns, …) was given a number. These take CSS strings — use `width="320px"` or `gridTemplateColumns="repeat(3, 1fr)"`. (Spacing props like padding/gap are the opposite — integers.)',
    );
  }

  // 5. Implicit any on a parameter (TS7006) — almost always an event handler.
  const anyRe = /Parameter '([^']+)' implicitly has an 'any' type/g;
  const anyParams = new Set();
  while ((m = anyRe.exec(text)) !== null) anyParams.add(m[1]);
  if (anyParams.size) {
    hints.add(
      `Add a type to ${[...anyParams].map((p) => `\`${p}\``).join(", ")} — for an input handler use \`(e: React.ChangeEvent<HTMLInputElement>)\`, for a click use \`(e: React.MouseEvent)\`.`,
    );
  }

  // 6. Agent edited scaffold/config files it should leave alone.
  if (
    /tsconfig\.(?:json|app\.json|node\.json)|Unknown compiler option|'files' list .* is empty/i.test(
      text,
    )
  ) {
    hints.add(
      "Do not modify tsconfig.json / tsconfig.*.json or other scaffold files — they are pre-configured and valid. Only edit files under `src/`.",
    );
  }

  return [...hints];
}
