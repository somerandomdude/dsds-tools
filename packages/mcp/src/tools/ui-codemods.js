// Generic lint-time codemod runner.
//
// Applies jscodeshift transforms from a configured package to one file's
// source, moving matched components from `fromPackage` to `toPackage`. It
// knows nothing about any particular design system: which transforms to run,
// how that package lays out its transform modules, and what its TODO comments
// look like all arrive as configuration.
//
// Design-system-specific knowledge lives in src/codemod-presets/ and is
// selected by name (LINT_UI_CODEMOD_PRESET). This file previously hardcoded a
// nine-name @sanity/ui allowlist and filtered the caller's `transformNames`
// against it, which meant any other design system could configure the pass
// fully and still silently get zero transforms — the config was accepted and
// then discarded. That allowlist is now sanity-ui.js's `transforms` array.
import { requireFromProject } from './require-from-project.js';

const JS_TS_EXTENSION = /\.(tsx|jsx|ts|js)$/;

/**
 * Resolve a transform's module specifier from a template.
 *
 * `<pkg>` and `<name>` are substituted; anything else is literal. A package
 * exposing transforms as subpath exports uses something like
 * `<pkg>/transforms/latest/<name>`, one exposing a flat module uses
 * `<pkg>/<name>`.
 *
 * @param {string} template
 * @param {string} pkg
 * @param {string} name
 * @returns {string}
 */
export function resolveTransformSpecifier(template, pkg, name) {
  return template.replaceAll('<pkg>', pkg).replaceAll('<name>', name);
}

/**
 * Build the matcher for a package's "please double check this" comments.
 *
 * Matches anywhere on a line, not just at line-start: recast doesn't always
 * put an inserted comment on its own line — observed merging onto a line that
 * already ends with an existing `{/* ... *\/}` JSX comment. Group 1 is
 * everything before the `//` on that line.
 *
 * @param {string} marker - e.g. 'UI-CODEMOD TODO:'
 */
function todoCommentPattern(marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(.*?)//\\s*(${escaped}.*)$`);
}

/**
 * Rewrite an unsafe `// <marker> ...` occurrence to the JSX-safe
 * `{/* <marker> ... *\/}` form when it would otherwise print inside JSX
 * children (verified valid in that position).
 *
 * Left as a plain `//` comment only when it is the very first thing on its
 * line AND that line immediately follows `return (` / `=> (` / a bare `(` —
 * the one position where `//` is already safe, and where `{/* *\/}` would
 * instead be a syntax error (two adjacent expressions with nothing joining
 * them). Any non-whitespace content before the `//` on the same line already
 * proves we're inside JSX children, so that case always converts regardless
 * of the previous line.
 *
 * A transform package that writes its notes some other way declares no
 * `todoMarker`, and this pass is skipped for it entirely.
 *
 * @param {string} code
 * @param {string} marker
 * @returns {{code: string, changed: boolean}}
 */
export function neutralizeUnsafeTodoComments(code, marker) {
  if (!marker) return { code, changed: false };
  const pattern = todoCommentPattern(marker);
  const lines = code.split('\n');
  let changed = false;
  let prevTrimmed = '';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;

    const match = lines[i].match(pattern);
    if (match) {
      const [, prefix, comment] = match;
      const prefixTrimmed = prefix.trim();
      const nextTrimmed = lines.slice(i + 1).find((l) => l.trim() !== '')?.trim() ?? '';
      const precedesJsx = nextTrimmed.startsWith('<');
      const isExpressionRoot = prefixTrimmed === '' && /\($/.test(prevTrimmed);
      if (precedesJsx && !isExpressionRoot) {
        lines[i] = `${prefix}{/* ${comment} */}`;
        changed = true;
      }
    }

    prevTrimmed = trimmed;
  }

  return { code: changed ? lines.join('\n') : code, changed };
}

function importsFromPackage(code, packageName) {
  return code.includes(`'${packageName}'`) || code.includes(`"${packageName}"`);
}

/**
 * Run each configured transform directly (no CLI Runner) against one file's
 * source, moving matched components from `fromPackage` to `toPackage`.
 *
 * A transform that isn't present in the configured package, or that throws, is
 * skipped rather than failing the whole lint pass — the ESLint pass afterward
 * still runs against whatever code survives here (pre-codemod, if every
 * transform was skipped).
 *
 * Every `transformNames` entry the caller passes is attempted. Vetting which
 * transforms are safe is the preset's job, not this runner's; see
 * src/codemod-presets/.
 *
 * @param {string} code
 * @param {string} filename
 * @param {object} opts
 * @param {string} opts.codemodPackage - the package holding the transforms. Resolved from resolveDir, like an ESLint plugin.
 * @param {string[]} opts.transformNames - transform names to attempt, in order
 * @param {string} opts.fromPackage - import source to migrate away from
 * @param {string} opts.toPackage - import source to migrate to
 * @param {string} opts.resolveDir - where codemodPackage and jscodeshift are installed
 * @param {string} [opts.transformPath] - module template with `<pkg>`/`<name>`; required to resolve anything
 * @param {string} [opts.todoMarker] - marker of the package's TODO comments; omit to skip neutralizing
 * @returns {Promise<{code: string, changed: boolean, appliedTransforms: string[], error?: string}>}
 */
export async function applyUiCodemods(code, filename, opts = {}) {
  const { codemodPackage, transformNames, fromPackage, toPackage, resolveDir, transformPath, todoMarker } = opts;
  const noop = { code, changed: false, appliedTransforms: [] };

  if (!codemodPackage || !transformNames?.length || !fromPackage || !toPackage) return noop;
  if (!transformPath) {
    return {
      ...noop,
      error:
        'No `transformPath` configured, so no transform module can be resolved. Set LINT_UI_CODEMOD_PRESET to a preset that declares one, or set LINT_UI_CODEMOD_TRANSFORM_PATH (e.g. "<pkg>/transforms/latest/<name>").',
    };
  }
  if (!JS_TS_EXTENSION.test(filename)) return noop;
  if (!importsFromPackage(code, fromPackage)) return noop; // fast path — nothing this package would touch

  let jscodeshift;
  try {
    jscodeshift = await requireFromProject('jscodeshift', resolveDir);
  } catch {
    return {
      ...noop,
      error:
        '`jscodeshift` is not installed in LINT_RESOLVE_DIR — required to run UI codemods during lint. Install it alongside your codemod package, or unset LINT_UI_CODEMODS.',
    };
  }

  const api = { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} };
  let current = code;
  const applied = [];

  for (const name of transformNames) {
    let transform;
    try {
      transform = await requireFromProject(resolveTransformSpecifier(transformPath, codemodPackage, name), resolveDir);
    } catch {
      continue; // not available in the configured package — skip quietly, not an error
    }
    try {
      const output = transform({ path: filename, source: current }, api, { fromPackage, toPackage });
      if (typeof output === 'string' && output !== current) {
        current = output;
        applied.push(name);
      }
    } catch {
      continue; // one transform failing shouldn't break lint for the rest
    }
  }

  // Mandatory when a marker is configured, not opt-in: any transform in the
  // package may produce an unsafe comment, so this runs whenever one fired
  // rather than being tied to which one did.
  if (applied.length > 0 && todoMarker) {
    current = neutralizeUnsafeTodoComments(current, todoMarker).code;
  }

  return { code: current, changed: applied.length > 0, appliedTransforms: applied };
}
