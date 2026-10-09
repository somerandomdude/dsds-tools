# Contributing to dsds-mcp

Thanks for your interest in improving `dsds-mcp` — an MCP server for the
[Design System Documentation Spec (DSDS)](https://designsystemdocspec.org).

## Development setup

```sh
git clone https://github.com/somerandomdude/dsds-mcp.git
cd dsds-mcp
npm install
```

Requires Node.js >= 18.

### Linking a local lint plugin (e.g. `eslint-plugin-sanity-ui`)

`dsds doctor` checks that every plugin in a consuming project's `lintPlugins` config
resolves from `lintResolveDir` (see `packages/cli/src/doctor.js`, "lint plugins
resolve"). If that plugin is an unpublished local package — not on npm — plain
`npm install` won't find it, and the check fails with:

```
✗ lint plugins resolve
    eslint-plugin-sanity-ui — not resolvable from /path/to/dsds-mcp
```

Fix by symlinking the local package into this repo's `node_modules`:

```sh
cd /path/to/eslint-plugin-sanity-ui
npm link                       # registers the package globally

cd /path/to/dsds-mcp
npm link eslint-plugin-sanity-ui   # symlinks it into node_modules here
```

This only needs to be redone after a fresh clone or a `node_modules` wipe — the
link doesn't survive either. To undo: `npm unlink eslint-plugin-sanity-ui` from
`dsds-mcp`.

## Running locally

```sh
# Run the server against a DSDS document
DSDS_PATHS=/path/to/your.dsds.json npm run dev
```

See the README for the full list of environment variables (`DSDS_PATHS`,
`LINT_PLUGINS`, `ICON_PACKAGE`, `PACKAGE_EXPORT_PATHS`, etc.).

## Tests and checks

```sh
npm test                 # vitest unit + integration suite
npm run check:integrity  # DSDS reference-integrity guard
npm run lint:complexity  # function complexity and nesting limits
```

All three run in CI on every pull request. Please make sure they pass before opening one.

### Complexity check

`npm run lint:complexity` runs ESLint with two rules, set in `eslint.config.js`:

- `complexity`: at most 15 paths through a function.
- `max-depth`: blocks nested at most 4 deep.

It covers the first-party source. Tests, agent worktrees and the vendored spec in
`packages/mcp/src/spec/dsds-*` are left out.

Functions that were already over the limits when the check was added are recorded in
`eslint-suppressions.json`, so they don't fail the build. A new violation does: split
the function rather than adding it to the file.

When you bring a recorded function under the limits, the check fails until you remove
its entry:

```sh
npm run lint:complexity:prune
```

Commit the smaller `eslint-suppressions.json` with your change. The file should only
shrink. `npm run lint:complexity:baseline` re-records every current violation; use it
only if the limits change.

- Add or update tests for any behavior change.
- Keep the server **generic**: do not hard-code design-system–specific names,
  packages, or tokens. Anything system-specific belongs behind configuration
  (an env var / config option), not in the source.

## Pull requests

1. Branch from `main`.
2. Keep changes focused; one concern per PR.
3. Update the README and `CHANGELOG.md` (Unreleased section) when behavior changes.
4. Ensure `npm test` and `npm run check:integrity` pass.

## Reporting bugs and requesting features

Open an issue at https://github.com/somerandomdude/dsds-mcp/issues. For security
issues, follow [SECURITY.md](./SECURITY.md) instead of filing a public issue.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](./LICENSE).
