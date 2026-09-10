# Local settings-page coding harness

From the sibling `dsdsds` checkout, with Ollama running and
`qwen2.5-coder:7b` already installed:

```sh
npm run generate:local
```

This runs the harness in `dsds-tools` against the source manifest's consumer
and config. The default manifest is
`evaluations/manifests/settings-page.json`, which targets the consumer's
`dsds.v020.config.mjs`. Install `dsds-tools` dependencies with `npm ci` once
before offline use. This is a development workflow requiring the two sibling
checkouts and Node 20+, not a published `dsds` command.

The runner prints a unique directory under `dsds-tools/evaluations/results/`.
It automatically collects six v0.20 entries and the account-settings
dependencies using the existing CLI. It asks Ollama for `index.html` and
`settings-page.js`, validates the response, and allows one repair attempt.
There is no manual context copying or model-controlled shell execution.

When it prints **Preview files created**, run the printed command:

```sh
npm run preview:local -- --run /absolute/path/to/the/printed/run-directory
```

Open the printed preview URL. The `/__checks` URL exercises live edits,
initial Cancel, Save feedback, Cancel to the last saved state, a second Save,
labels, and horizontal overflow at 375px and 1280px. These checks run in your
browser when you visit that URL; generation itself does not launch a browser.
Also check keyboard operation, focus visibility, and visual layout manually.

## Files and statuses

Each run preserves `evidence.json`, `prompt.txt`, model requests, raw responses,
Ollama metrics, and `report.json`. Successful static validation also creates:

```text
web/
  index.html
  settings-page.js
  src/                 snapshot of the consumer's existing assets
```

The preview server maps `/src/` to that snapshot and only serves the preview
and supported asset types. It binds to a loopback address on a free port.
Ctrl+C stops it. Generated files are ignored by Git and never overwrite the
consumer's implementation or previous runs.

- `dry_run`: context and prompt saved without calling the model.
- `preview_created`: files created after static checks; browser behavior has
  **not** been established by this status.
- `rejected`: output failed validation, including after the optional repair.
- `insufficient_evidence`: the model returned gaps and no files.
- `error`: setup, model request, timeout, or filesystem failure.

Non-preview live/replay outcomes exit with code 2. Setup failures exit with
code 1. An abstention is recorded as such; it is not proof the corpus actually
lacks the capability. No response is silently repaired by Codex or the harness.

## Other commands

```sh
# Inspect the exact collected evidence and prompt without calling Ollama.
npm run generate:local -- --dry-run

# Override the installed model; tags are never downloaded automatically.
npm run generate:local -- --model qwen2.5-coder:7b

# Check/materialize a saved full JSON response. This never calls Ollama.
npm run generate:local -- --response /absolute/path/to/response.txt

# Disable the one automatic repair attempt.
npm run generate:local -- --no-repair
```

From `dsds-tools`, the same command takes `--consumer ../dsdsds` (the default).
Use `--config <file>` for another config in that consumer, or
`--manifest /absolute/path/to/manifest.json` to select a different evidence
source. A manifest currently selects the entities, dependencies, required
source files, and optional preview asset root; this first prompt and validator
remain intentionally specific to the settings-page output contract. The next
schema-repo case should add a new prompt/validator pair rather than silently
pretend it is a settings page.

## What validation establishes

The runner parses JavaScript with Acorn and HTML with parse5. It checks the two
allowed file names, exact quote membership in the named entity, module imports,
known component attributes, required selectors and label/description slots,
stylesheet URL, and documented CSS variables. It rejects common network,
storage, dynamic import, and shadow-root access APIs. Incomplete model responses
are rejected even when their JSON parses. The model gets a 16K context setting,
4K output budget, and five-minute timeout per attempt; a conservative byte
budget prevents silent truncation of long repair conversations.

These checks are a focused quality gate, not a complete JavaScript security
analyzer or proof of every DSDS rule. Exact quote membership does not establish
that a quote supports the associated claim. The preview uses a browser content
security policy to block connections, inline scripts, forms, workers, and
frames in generated pages. Review generated code and browser behavior before
promoting anything into product code. Browser-check results are shown on the
check page; `report.json` intentionally retains `browserVerification: not_run`
because the generator did not execute those checks.
