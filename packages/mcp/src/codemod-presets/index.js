// Codemod presets: per-design-system configuration for the lint-time codemod
// pass, as data.
//
// The runner in src/tools/ui-codemods.js is generic — it knows how to resolve
// and apply jscodeshift transforms, and nothing about any particular design
// system. Everything system-specific (which transforms are safe, how that
// package lays out its transform modules, what marker its TODO comments use)
// lives in a preset here and is selected by name with LINT_UI_CODEMOD_PRESET.
//
// Adding a design system means adding one file next to sanity-ui.js and
// listing it below. No change to the runner, the config loader, or the tools.
//
// Every field a preset supplies is a DEFAULT: an explicit LINT_UI_CODEMOD_*
// environment variable always wins, so a preset can be adopted wholesale or
// used as a starting point.
import sanityUi from './sanity-ui.js';

/**
 * @typedef {object} CodemodPreset
 * @property {string}   id             - the name used in LINT_UI_CODEMOD_PRESET
 * @property {string}   description    - one line, shown when an unknown preset is named
 * @property {string}   codemodPackage - package to resolve transforms from
 * @property {string}   fromPackage    - import source the transforms migrate away from
 * @property {string}   toPackage      - import source they migrate to
 * @property {string}   transformPath  - module template, with `<pkg>` and `<name>` placeholders
 * @property {string[]} transforms     - transform names to attempt, in order
 * @property {Record<string,string>} [excluded] - name → why it is deliberately not listed
 * @property {string}   [todoMarker]   - marker of this package's TODO comments; omit to skip neutralizing
 */

const PRESETS = new Map([[sanityUi.id, sanityUi]]);

/** Every registered preset. */
export function listCodemodPresets() {
  return [...PRESETS.values()];
}

/**
 * Look up a preset by id.
 *
 * Throws on an unknown id rather than falling back silently: a typo would
 * otherwise leave the codemod pass configured with nothing to run, which looks
 * exactly like "there was nothing to change" and is invisible in lint output.
 *
 * @param {string} id
 * @returns {CodemodPreset}
 */
export function getCodemodPreset(id) {
  const preset = PRESETS.get(id);
  if (!preset) {
    const available = [...PRESETS.keys()].map((k) => `"${k}"`).join(', ') || '(none registered)';
    throw new Error(
      `Unknown codemod preset "${id}" (LINT_UI_CODEMOD_PRESET). Available: ${available}. ` +
        'Add one under src/codemod-presets/ and register it in that directory\'s index.js, or configure ' +
        'LINT_UI_CODEMOD_PACKAGE / _TRANSFORMS / _TRANSFORM_PATH / _FROM_PACKAGE / _TO_PACKAGE directly instead.',
    );
  }
  return preset;
}
