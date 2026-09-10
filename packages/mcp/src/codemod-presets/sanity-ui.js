// Codemod preset: @sanity/ui v3 → v5, via @sanity/ui-codemod.
//
// This file is DATA, not logic. It records which of that package's transforms
// were verified safe, which were verified unsafe and why, and the two package
// layout details a generic runner can't guess. src/tools/ui-codemods.js reads
// it through the preset registry and contains no knowledge of Sanity at all —
// a second design system adds a sibling file here and changes nothing else.
//
// Selected with LINT_UI_CODEMOD_PRESET=sanity-ui. Nothing is applied unless
// LINT_UI_CODEMODS is also switched on.
//
// Verified against @sanity/ui-codemod@1.0.0-alpha.7 by running each transform
// against real files (copied from Measurement/agent-tester output, plus
// synthetic snippets for container/grid/code/inline) and inspecting the actual
// output — not assumed from the package's own description.

/** @type {import('./index.js').CodemodPreset} */
export default {
  id: 'sanity-ui',
  description: '@sanity/ui v3 → v5 (@sanity/ui-codemod). Nine transforms verified safe at 1.0.0-alpha.7.',

  codemodPackage: '@sanity/ui-codemod',
  fromPackage: '@sanity/ui',
  toPackage: '@sanity/ui-v5',

  // How this package exposes a transform as an importable module. Its own
  // public subpath exports, e.g. '@sanity/ui-codemod/transforms/latest/box'.
  transformPath: '<pkg>/transforms/latest/<name>',

  transforms: ['box', 'code', 'container', 'flex', 'grid', 'heading', 'inline', 'stack', 'text'],

  // Transforms deliberately left out, with the reason each was rejected. Kept
  // as data so the finding survives a package upgrade: re-test these before
  // adding either one back.
  excluded: {
    card:
      'Leaves the target `Card` import completely untouched and inserts an unrelated, incorrect `Box` import instead. ' +
      'Reproducible on a fresh, untouched file — not a chaining artifact. A real bug in 1.0.0-alpha.7.',
    label:
      'Migrates v3 `Label`-used-as-a-heading-eyebrow to v5 `Eyebrow` (see the eyebrow component doc\'s own migration notes) ' +
      'rather than doing a general v3-Label → v5-Label import swap. Running it unconditionally would rewrite legitimate ' +
      'form-control `Label` usage into `Eyebrow`. That call needs a human or agent decision per site, not a blind lint-time fix.',
  },

  // The marker this package writes into its "please double check this" notes.
  // Every transform above shares one utility for them (insertTodoWarning,
  // fired by box/flex/grid's mapped-only value mismatches, heading's
  // warn-missing `as`, inline's warn-only margin props, and the same mechanism
  // in container/text/code/stack's own mods tables).
  //
  // That utility attaches the comment as a leading comment on the JSXElement
  // node itself. Printed via recast, a JS `//` comment in that position is
  // only safe when the element is the very first thing after `return (` or
  // `=> (`; everywhere else — i.e. any element nested inside another's
  // children, which is most real usage — it lands in JSX children position,
  // where `//` has no special meaning and prints as literal, visible text.
  //
  // Confirmed on a real agent-tester run (2026-09-03 16.11, ui5-mcp
  // iteration-10): `box`'s mapped-only fallback fired on ordinary
  // minHeight/maxWidth/minWidth values (anything outside its tiny keyword map
  // — "100vh" isn't 'full'/'auto'/'0'-'5', which is most real CSS values), and
  // 4 of 5 insertions landed in nested position and rendered literally on
  // screen. `heading`, `flex` and `grid` reproduce the same corruption under
  // equally ordinary usage; container/text/code/stack/inline route through the
  // identical shared utility and are presumed equally capable of it even
  // though the specific props tried during the review didn't trigger it.
  //
  // Declaring the marker is what lets the generic runner neutralize those
  // comments (see neutralizeUnsafeTodoComments) rather than each transform
  // needing its own fix. A preset that omits `todoMarker` simply skips that
  // pass.
  todoMarker: 'UI-CODEMOD TODO:',
};
