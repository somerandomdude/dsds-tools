# Offline local-model workflow

Use this workflow when a coding agent has shell access but no network or MCP
client—for example, during travel. It deliberately uses the existing `dsds`
CLI as the source of grounded DSDS context. It does not add a second retrieval
system, or a bundled design-system corpus.

## Before going offline

Do this while connected, from the design-system repository that contains the
DSDS documents:

```sh
# Keep a local checkout of dsds-tools and install its workspace dependencies.
git clone https://github.com/somerandomdude/dsds-tools.git ../dsds-tools
cd ../dsds-tools
npm install

# Return to the consumer project and ensure its config discovers real docs.
cd /path/to/design-system
node ../dsds-tools/packages/cli/src/index.js doctor
node ../dsds-tools/packages/cli/src/index.js manifest --json > .dsds-cli-manifest.json
```

Commit the consumer project's `dsds.config.mjs` (or `.js` / `.json`) and its
DSDS documents. The config uses paths relative to itself, so it continues to
work from a portable checkout. Avoid commands that fetch packages (`npx`, a
fresh `npm install`, or remote MCP setup) once offline.

Rehearse the actual offline path by disabling network access and running
`doctor`, `brief`, `search`, and `context` against the checkout. Fix every
path or dependency issue before the trip.

## A bounded task loop

Ask the model to work on one small, independently verifiable story. Start each
story by saving the CLI's JSON outputs as the task's evidence:

```sh
DSDS='node ../dsds-tools/packages/cli/src/index.js'

$DSDS brief build --task 'Add an accessible secondary action button' --json \
  > /tmp/dsds-brief.json
$DSDS search button --kind component --json > /tmp/dsds-search.json
$DSDS context button --json > /tmp/dsds-button-context.json
$DSDS get button --block api --json > /tmp/dsds-button-api.json
```

Use a different component identifier when the story calls for one. Give the
local model the task, the relevant JSON files, and the repository's existing
code conventions. The model should:

1. Treat those files as the design-system authority for the task.
2. State which DSDS facts it used before editing.
3. Say it does not know when the context is missing or conflicting; it must
   not invent props, variants, imports, or accessibility rules.
4. Keep its change small and run the project's local checks afterward.

The saved JSON is intentionally task-scoped. It prevents a smaller model from
having to search a large document corpus, while retaining the CLI's source
paths and structured result envelope for review.

## Verification and handoff

After the model's change, verify the project normally, then re-run the DSDS
checks that apply to the story:

```sh
# Replace the path with an added or edited DSDS document when applicable.
$DSDS validate docs/components/button.dsds.json
$DSDS doctor
```

Keep the implementation, the task prompt, and the saved context together in
the branch or handoff. On reconnecting, a more capable agent can review the
diff against the same evidence and resolve questions that were honestly left
open offline.

## Choosing offline work

Good local-model stories are repetitive or narrowly constrained: mapping
existing tokens, updating a known documentation block, adding test cases from
an established pattern, or wiring a known component variant. Defer new API
design, cross-system migrations, and tasks whose answer depends on information
outside the checked-out repository.
