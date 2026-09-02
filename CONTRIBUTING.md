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
```

Both run in CI on every pull request. Please make sure they pass before opening one.

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
