// What to say when nothing is loaded.
//
// This is the first thing a new user sees, so it has to point at the right
// product. The MCP and CLI answers genuinely differ — one edits a client
// config, the other runs `dsds init` — so unlike the rest of the shared
// prose this cannot be handled by vocabulary translation alone.
//
// The CLI copy also corrects a claim that was wrong for it: relative paths
// ARE supported in a config file, where they resolve against the file's own
// directory. Only the environment variable needs absolute paths.

export const MCP_GUIDANCE = [
  '## No DSDS files configured',
  '',
  'Set `DSDS_PATHS` in your MCP client config `env` block:',
  '',
  '```json',
  '"env": { "DSDS_PATHS": "/absolute/path/to/design-system.dsds.json" }',
  '```',
  '',
  'Multiple files: `DSDS_PATHS=/path/a.dsds.json,/path/b.dsds.json`',
  '',
  '**Common mistakes:**',
  '- Path starts with `~` — use the full absolute path instead (e.g. `/Users/you/...`)',
  '- Path is relative — only absolute paths are supported',
  '- `env` block is missing from the MCP server config',
  '',
  'Check the MCP server stderr logs for a startup message that confirms what loaded.',
  '',
  'Spec tools (`dsds_spec_overview`, `dsds_spec_scaffold`, `dsds_validate`) are always available without configuration.',
].join('\n');

export const CLI_GUIDANCE = [
  '## No DSDS files configured',
  '',
  'Run `dsds init` in your project root. It writes a `dsds.config.mjs`',
  'seeded from any DSDS_* environment variables you already have:',
  '',
  '```js',
  '// dsds.config.mjs',
  'export default {',
  "  paths: ['./design-system.dsds.yaml'],",
  '};',
  '```',
  '',
  'The file is found by walking up from the working directory, so it travels',
  'with the repo. Paths in it resolve against the file itself — relative is',
  'fine. `--config <file>` points at one explicitly.',
  '',
  'Prefer environment variables? `DSDS_PATHS` still works and still wins per',
  'key, but it needs absolute paths (no `~`).',
  '',
  'Then run `dsds doctor` to confirm what loaded.',
  '',
  'Spec commands (`dsds spec`, `dsds scaffold`, `dsds validate`) need no configuration.',
].join('\n');

export const MCP_BRIEF = 'No DSDS files configured. Set the `DSDS_PATHS` environment variable.';

export const CLI_BRIEF =
  'No DSDS files configured. Run `dsds init` to create a dsds.config.mjs, then `dsds doctor` to verify.';

/**
 * The "nothing is loaded" guidance for a surface.
 *
 * Handlers emit the MCP form; the CLI swaps it in at render time (see
 * vocabulary.js), which keeps the surface out of the handler signatures.
 *
 * @param {{surface?: 'mcp'|'cli'}} [options]
 * @returns {string}
 */
export function noDocumentsConfigured({ surface = 'mcp' } = {}) {
  return surface === 'cli' ? CLI_GUIDANCE : MCP_GUIDANCE;
}

// The one-line form, for handlers that only have room for a sentence.
export function noDocumentsConfiguredBrief({ surface = 'mcp' } = {}) {
  return surface === 'cli' ? CLI_BRIEF : MCP_BRIEF;
}

// ── Where the argument shapes come from ──────────────────────────────────
//
// An MCP client receives every tool's input schema on connect, so the model
// can see that `useCase` is an enum of three values and that `components`
// is an array before it calls anything. A CLI agent gets one tool whose
// schema is `args: string[]`, and discovers argument shapes by being wrong:
// measured 0.3% failed calls across 387 MCP run-arms versus 4.8-13.7%
// across the CLI arms, almost all of it invented flags and enum values.
//
// `dsds manifest --compact` is the same data the MCP client gets for free —
// 13KB of commands, arguments and allowed values. Nothing pointed agents at
// it, so nothing read it. These two strings are swapped by surface, like
// the pair above, because the MCP advice would be wrong on a CLI and the
// CLI advice names a command an MCP client cannot run.
export const MCP_SCHEMA_POINTER =
  'Your client already has every tool\'s input schema, including which arguments are ' +
  'required and which take a fixed set of values. Read it there rather than guessing.';

export const CLI_SCHEMA_POINTER =
  'Run `dsds manifest --compact` once if you are unsure of an argument. It lists every ' +
  'command with its arguments and allowed values (13KB), and is the only place those are ' +
  'stated in full — `--kind`, `--block` and `useCase` all take fixed sets. Porcelain also ' +
  'accepts the schema form, so `dsds brief --useCase build`, `dsds brief useCase=build` and ' +
  '`dsds brief build` are the same call.';
