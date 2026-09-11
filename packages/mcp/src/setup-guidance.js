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
