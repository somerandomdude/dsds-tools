# dsds-markdown-export

Render DSDS entries as publication-ready Markdown pages.

## Why it is its own package

`dsds-mcp` serves a design system to agents. This renders it for people, and
the two want different pages from the same document:

| `dsds-markdown-export` | `dsds get` / `dsds_get_entity` |
| --- | --- |
| `## Usage guidelines` → `### When to use` / `### When not to use` | `## When to use`, then each `## Guidelines` section |
| `## Best practices` → `### Do` / `### Don't` | — |
| `## Variants` → one section per trait | `## Traits (variants & states)` |
| — | `## Relationships`, `## Source files`, `## Imports` |

The layout is the product here. Section *content* renders through
`dsds-mcp`'s shared renderers, so a heading's contents never drift from what
the server delivers — only where it sits on the page differs.

## Use

```sh
# every entry in the configured corpus, one file each
dsds-markdown --out ./site/content

# one entry, to stdout
dsds-markdown --id card
```

Documents come from the same place the rest of the tooling reads them:
`--paths`, else `DSDS_CONFIG` / a `dsds.config.mjs` found by walking up, else
`DSDS_PATHS`.

| Option | |
| --- | --- |
| `--paths <file[,file]>` | DSDS documents to load |
| `--out <dir>` | write `<identifier>.md` per entry (required unless `--id`) |
| `--id <identifier>` | render one entry to stdout |
| `--agent-content` | include sections marked `for: agent` |

## As a library

```js
import { loadSystems } from 'dsds-mcp/src/loader.js';
import { entityToMarkdown } from 'dsds-markdown-export/src/render.js';

const { systems } = await loadSystems(['./index.dsds.yaml']);
const card = systems.flatMap(s => s.entities).find(e => e.identifier === 'card');
console.log(entityToMarkdown(card, {}));
```

`entityToMarkdown(entity, propsConfig, { includeAgentContent })` takes a
loaded entry and returns the page as a string. `propsConfig` is
`{ propsExtractorDir, uiSourceRoot }` and only affects the API table; pass
`{}` to render without one.
