import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Requires a package (or a package subpath, e.g. '@sanity/ui-codemod/transforms/latest/box')
// from a consumer project's own node_modules rather than dsds-mcp's own —
// mirrors how ESLint plugins are resolved via LINT_RESOLVE_DIR. Shared by
// lint-code.js (ESLint plugins) and ui-codemods.js (jscodeshift transform
// packages) so both resolve consumer-supplied packages the same way.
export async function requireFromProject(packageName, resolveDir) {
  const req = createRequire(resolve(resolveDir, 'package.json'));
  try {
    const mod = req(packageName);
    return mod.default ?? mod;
  } catch (err) {
    if (err.code === 'ERR_REQUIRE_ESM') {
      const resolved = req.resolve(packageName);
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default ?? mod;
    }
    throw err;
  }
}
