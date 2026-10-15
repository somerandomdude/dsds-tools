// Complexity check for the first-party source. It runs only rules that measure
// how hard a function is to follow, not style.
//
//   npm run lint:complexity            # fails on any new violation
//   npm run lint:complexity:baseline   # records every current violation
//   npm run lint:complexity:prune      # drops entries for fixed functions
//
// Functions that were already over the limits when the check was added are
// recorded in eslint-suppressions.json, so they don't fail the build. A new
// violation does. Once a suppressed function is fixed, the check fails until
// `npm run lint:complexity:prune` drops its entry, so the file only shrinks.
// See CONTRIBUTING.md.
//
// The dsds_lint tool runs ESLint with `overrideConfigFile: true`, so this file
// never reaches the projects it lints.

export default [
  {
    ignores: [
      '**/node_modules/**',
      // Agent worktrees: copies of this source.
      '.claude/**',
      // Vendored, verbatim, from the DSDS spec repo by `npm run update-schema`.
      'packages/mcp/src/spec/dsds-*/**',
      '**/tests/**',
      '**/*.test.*',
      'evaluations/**',
      'logs/**',
      'feedback/**',
      'docs/**',
      'plans/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'module'},
    linterOptions: {reportUnusedDisableDirectives: 'off'},
    rules: {
      // Cyclomatic complexity: the number of paths through a function.
      // ESLint's default is 20.
      complexity: ['warn', 15],
      // Blocks nested inside one another in a single function.
      'max-depth': ['warn', 4],
    },
  },
]
