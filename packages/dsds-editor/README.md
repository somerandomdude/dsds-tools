# DSDS Editor

A native (macOS) visual editor for [Design System Documentation Spec](https://designsystemdocspec.org/)
(DSDS) projects. A project is just a folder of `*.dsds.json` documents on disk —
there is no database and no history; the filesystem is the single source of
truth.

## Stack

- **Tauri 2** — native shell + Rust backend for filesystem access.
- **Vanilla web components** — no UI framework, no bundler. The frontend is
  static ES modules loaded directly by the webview (`app.withGlobalTauri`).
- **A ~30-line reactive store** (`ui/src/store.js`) for state/data-binding.
- Third-party runtime dependencies: none beyond Tauri and its dialog plugin.

## Layout

Three columns, Zed-like:

| Column | Element | Responsibility |
| --- | --- | --- |
| Start | `<file-list>` | Browse/create/rename/delete `*.dsds.json` files — recurses into subfolders and shows the folder hierarchy (collapsible) |
| Middle | `<doc-editor>` | Edit the document's entity: core fields, metadata, document blocks |
| End | `<meta-panel>` | Read-only file + entity facts (filename, size, status, block counts, save state) |

Documents are addressed by their **project-relative path** (e.g.
`components/button.dsds.json`), which is the stable key used for select, read,
rename, and delete. Renaming can move a document between folders; missing
destination folders are created on write.

Edits auto-save to disk (debounced). Documents that fail to parse fall back to a
raw-JSON editor so data is never stranded. Blocks without a structured editor
(e.g. `anatomy`, `api`) are edited as raw JSON per block.

## Project structure

```
packages/dsds-editor/
├── ui/                       # frontend (static, no build step)
│   ├── index.html
│   ├── styles.css            # layout-only CSS; elements stay native/unstyled
│   ├── src/
│   │   ├── model.js          # DSDS templates, vocabularies, pure helpers
│   │   ├── store.js          # minimal reactive store
│   │   ├── api.js            # wraps Tauri commands (window.__TAURI__)
│   │   ├── dom.js, util.js   # tiny helpers
│   │   └── components/       # <dsds-app>, <file-list>, <doc-editor>, <meta-panel>
│   └── test/                 # node:test + jsdom
└── src-tauri/                # Rust backend
    └── src/
        ├── project.rs        # filesystem logic (path-traversal-safe) + unit tests
        └── lib.rs            # Tauri command wrappers
```

## Commands

```sh
npm install          # install dev tooling (@tauri-apps/cli, jsdom)

npm run dev          # launch the app (tauri dev)
npm run build        # produce a macOS .app bundle (tauri build)

npm test             # frontend tests (node:test + jsdom)
npm run test:rust    # Rust backend tests
npm run test:all     # both suites
```

## Testing

- **Frontend** (`ui/test/`): pure logic (model, store, util, dom) is tested
  directly; the web components and the full app shell are tested under jsdom
  with an in-memory fake of the filesystem API.
- **Backend** (`src-tauri/src/project.rs`): filesystem operations are unit
  tested against temporary directories, including path-traversal rejection.
