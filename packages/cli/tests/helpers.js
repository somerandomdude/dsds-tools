import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../src/index.js', import.meta.url));
export const BUTTON_FIXTURE = fileURLToPath(new URL('./fixtures/button.dsds.json', import.meta.url));
export const VALID_SYSTEM = fileURLToPath(new URL('./fixtures/valid/system.dsds.json', import.meta.url));
export const VALID_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/valid', import.meta.url));
// Resolve the dsds-mcp package wherever the installer put it (hoisted to the
// workspace root in the monorepo, nested under node_modules otherwise).
export const DSDS_MCP_DIR = dirname(createRequire(import.meta.url).resolve('dsds-mcp/package.json'));

// Isolated default cwd: config-file discovery walks upward from cwd, so tests
// must not run from a directory whose ancestors could contain a real
// dsds.config file.
const NEUTRAL_CWD = mkdtempSync(join(tmpdir(), 'dsds-cli-neutral-'));

// Run the CLI with a clean environment (no inherited DSDS/LINT config), an
// isolated cwd, an optional env override, and optional stdin input. Resolves
// with the exit code instead of rejecting, so tests can assert non-zero exits.
export function runCli(args, { env = {}, cwd = NEUTRAL_CWD, input } = {}) {
  const cleaned = { ...process.env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('DSDS_') || key.startsWith('LINT_') || key === 'PACKAGE_EXPORT_PATHS' || key === 'ICON_PACKAGE') {
      delete cleaned[key];
    }
  }
  Object.assign(cleaned, env);
  return new Promise(resolve => {
    const child = execFile(process.execPath, [BIN, ...args], { env: cleaned, cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}
