# Plan 005: Prove local docs-to-code authoring in a disposable sandbox

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report—do not improvise. When done, update this plan and the status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```sh
> git diff --stat 04df8de..HEAD -- \
>   scripts/ \
>   evaluations/ \
>   package.json \
>   README.md
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If Plan
> 004's strict JSON, metadata, or Ollama request behavior changed
> incompatibly, stop and reconcile this plan before implementation.

## Status

- **Priority**: P1
- **Effort**: M — 4–6 focused hours
- **Risk**: MEDIUM
- **Depends on**: Plan 003 / draft PR #1 and Plan 004
- **Category**: direction / evaluation
- **Planned at**: `dsds-tools` commit `04df8de`, 2026-07-24
- **Consumer reference**: `dsdsds` commit `a60f363`
- **Status**: TODO

## Goal

Prove one end-to-end, offline **authoring** story:

1. deterministic `dsds` CLI commands package Button documentation;
2. local Qwen generates a proposed `src/components/button.js`;
3. the proposal remains outside the real consumer repository;
4. deterministic checks validate response shape, provenance, allowed paths,
   JavaScript syntax, and documented public API facts; and
5. a human compares the proposal with the hidden real implementation and
   records a review.

This is the next step after Plan 004. Plan 004 measured whether Qwen can
extract and abstain. Plan 005 measures whether it can synthesize a bounded code
artifact from DSDS evidence without gaining shell or file-write authority.

## Why this matters

The Plan 004 benchmark passed its readiness gate, but extraction accuracy does
not prove useful code authoring. Before adding `dsds ask-local`,
`dsds generate-local`, a model adapter package, or fine-tuning, the project
needs one reviewable authoring demonstration.

Button is the right first story because its DSDS contract is complete and
small: two variants, three native types, one boolean state, one default slot,
one CSS part, one usage rule, and native keyboard behavior. The existing
implementation provides a hidden human reference, but must never enter the
model's evidence packet.

## Definitions

- **Evidence packet**: immutable JSON containing the task, exact CLI commands
  and outputs, hashes, selected authoring guidance, and generation contract.
- **Proposal artifact**: Qwen's raw JSON response plus timing and model
  metadata. It is not source code accepted into the product.
- **Disposable workspace**: an ignored directory populated only after the
  proposal passes response and path validation.
- **Deterministic validation**: checks performed by local code without asking a
  model to grade another model.
- **Human review**: a recorded comparison against repository conventions,
  accessibility expectations, and the hidden current Button implementation.

## Current state

### Plan 004 provides a reusable local-model foundation

`scripts/evaluate-local-model.mjs:39-50` currently:

```js
const evaluation = validateEvaluation(
  JSON.parse(readFileSync(resolve(casePath), 'utf8')),
);
const evidence = evaluation.evidence.map(command =>
  runCli(command, consumer),
);
const prompt = [
  'DSDS means Design System Documentation Spec. The evidence below is the only authority.',
  'If the requested example is absent, return {"status":"insufficient evidence"}.',
  '',
  'EVIDENCE',
  ...evidence.map(({ command, output }) =>
    `--- dsds ${command.join(' ')} ---\n${output}`),
  '',
  `TASK: ${evaluation.task}`,
  evaluation.prompt,
].join('\n');
```

`scripts/local-model-evaluation-core.mjs:204-216` defines the deterministic
Ollama request:

```js
{
  model,
  stream: false,
  format: 'json',
  keep_alive: '10m',
  options: {
    temperature: 0,
    seed: 42,
    num_ctx: 4096,
  },
  messages: [{ role: 'user', content: prompt }],
}
```

Reuse the loopback endpoint, timeout, hashing, timing, and model metadata.
Do not duplicate those functions or weaken Plan 004's strict behavior.

### The Button contract is explicit in CLI-readable documentation

At `../dsdsds/docs/components/button.dsds.json` at consumer commit `a60f363`:

```json
{
  "identifier": "variant",
  "type": "string",
  "values": ["primary", "secondary"],
  "defaultValue": "primary"
}
```

The same API block documents:

- `type`: `button`, `submit`, or `reset`; default `button`;
- `disabled`: boolean; default `false`;
- default slot: visible label and optional inline icon; and
- CSS part `button`: the native button.

Its guidelines require Button for in-page actions and Link for navigation. Its
accessibility block says Enter or Space activates the native button.

### The authoring guidance is already present

`../dsdsds/skills/dsds-web-components-authoring/SKILL.md:27-36` requires:

```md
- Prefer native semantics and a minimal API.
- Use slots for consumer-owned content and attributes/properties for state.
- Keep `observedAttributes`, rendering, examples, tests, package exports, and
  the DSDS API block synchronized.
- Document only facts supported by source or tests.
```

`../dsdsds/skills/dsds-web-components-authoring/references/component-contract.md`
adds:

```md
- Use a lowercase custom-element tag with a hyphen; register it once.
- Use native controls when possible.
- Use existing tokens; do not introduce unexplained visual values.
- Escape consumer text or use DOM APIs.
```

The packet may include these two guidance files with provenance and hashes.
It must not include other files implicitly.

### The real implementation is a hidden review reference

`../dsdsds/src/components/button.js` exists and registers `ds-button`. It must
not be read by the packet builder, copied to the workspace, placed in the
prompt, used as a few-shot example, or converted into scoring literals.

Only the human reviewer may open it **after** deterministic scoring completes.
The review compares contracts and repository conventions, not textual
similarity.

### Existing verification commands

`dsds-tools`:

```sh
npm test
```

Expected baseline: 21 evaluator tests, 86 CLI tests, and 149 MCP tests pass,
with one existing MCP skip.

`dsdsds`:

```sh
npm test
node --check src/components/button.js
```

Expected baseline: four contract tests pass and Button parses successfully.

## Architecture

```text
dsdsds DSDS docs ──→ dsds CLI JSON ─┐
                                     ├─→ immutable evidence packet
authoring guidance files ────────────┘
                                                ↓
                                       Ollama / local Qwen
                                                ↓
                                      raw proposal artifact
                                                ↓
                           response + provenance + path validation
                                                ↓
                                 explicit materialization command
                                                ↓
                                     ignored disposable workspace
                                                ↓
                           syntax + public-contract checks + human review
```

The model never receives tools. The harness performs retrieval before
inference. A separate, explicit command materializes a previously saved and
validated response.

## Required proposal format

Qwen must return one strict JSON object:

```json
{
  "status": "supported",
  "evidence_quotes": [
    {
      "source": "dsds get button --block api",
      "quote": "an exact substring from that evidence source"
    }
  ],
  "files": [
    {
      "path": "src/components/button.js",
      "content": "complete JavaScript source"
    }
  ],
  "assumptions": []
}
```

Rules:

- `status` must equal `supported`.
- `evidence_quotes` must be a non-empty array.
- Every quote must be an exact substring of the named packet source.
- `files` must contain exactly one file.
- The only allowed path is `src/components/button.js`.
- `content` must be a non-empty string.
- `assumptions` must be an array of strings.
- Unknown top-level and nested fields fail validation.
- Markdown fences or prose around the JSON fail validation.
- The runner must also support the exact abstention object
  `{"status":"insufficient evidence"}` for a future unsupported authoring case,
  but the Button case does not pass by abstaining.

## Commands the executor will add

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Preview packet | `npm run evaluate:authoring:local -- --case evaluations/authoring/cases/button-reconstruction.json --consumer ../dsdsds --dry-run` | prints packet and prompt; does not call Ollama |
| Generate proposal | `npm run evaluate:authoring:local -- --case evaluations/authoring/cases/button-reconstruction.json --consumer ../dsdsds --out evaluations/authoring/results/button-reconstruction.json` | saves strict result artifact; exits 0 only when response contract and provenance pass |
| Materialize | `npm run evaluate:authoring:materialize -- --result evaluations/authoring/results/button-reconstruction.json --workspace evaluations/authoring/workspaces/button-reconstruction` | writes exactly one validated file under the ignored workspace |
| Validate proposal | `npm run evaluate:authoring:check -- --case evaluations/authoring/cases/button-reconstruction.json --workspace evaluations/authoring/workspaces/button-reconstruction` | syntax and documented public-contract checks pass |
| Unit tests | `node --test scripts/local-model-evaluation-core.test.mjs scripts/local-authoring-core.test.mjs` | all evaluator and authoring tests pass |
| Full tests | `npm test` | all root and workspace tests pass |

## Scope

### In scope

- `scripts/evaluate-local-authoring.mjs` (new)
- `scripts/materialize-local-authoring.mjs` (new)
- `scripts/check-local-authoring.mjs` (new)
- `scripts/local-authoring-core.mjs` (new)
- `scripts/local-authoring-core.test.mjs` (new)
- `scripts/local-model-evaluation-core.mjs` only if a genuinely reusable
  function must be exported; do not change Plan 004 scoring semantics
- `evaluations/authoring/cases/button-reconstruction.json` (new)
- `evaluations/authoring/contracts/button-public-contract.json` (new)
- `evaluations/authoring/reports/plan-005-button-reconstruction.md` (new)
- `.gitignore`
- `package.json`
- `README.md`
- `plans/005-local-authoring-demo.md`
- `plans/README.md`

### Out of scope

- Any modification to `../dsdsds`.
- Any modification to `packages/cli` or `packages/mcp`.
- A public `dsds ask-local`, `generate-local`, `packet`, or similar command.
- MCP tool calling from Ollama.
- Fine-tuning, LoRA, embeddings, a vector store, or custom retrieval.
- Model-selected shell commands or paths.
- Applying generated source to the real consumer repository.
- Generating or modifying DSDS documentation in this plan.
- Automatically comparing generated text with the hidden reference source.
- Additional components or authoring cases.

## Git workflow

- Start only after Plan 003 and Plan 004 are rebased/merged, or explicitly use
  a stacked branch and document both dependencies.
- Branch: `codex/local-authoring-demo`.
- Follow the repository's conventional commit style.
- Suggested commits:
  1. `test: define local authoring response contract`
  2. `feat: add disposable local authoring runner`
  3. `docs: report button authoring demo`
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Freeze the authoring case and public contract

Create `evaluations/authoring/cases/button-reconstruction.json` with:

- ID `button-reconstruction`;
- task: implement `src/components/button.js` from supplied DSDS and authoring
  evidence;
- CLI evidence commands:
  - `brief build --task "Implement the documented Button component"`
  - `get button --block imports`
  - `get button --block api`
  - `get button --block guidelines`
  - `get button --block accessibility`
- the two explicit guidance-file paths named in "Current state";
- allowed output path `src/components/button.js`;
- a reference to the hidden public-contract file; and
- prompt instructions that specify the JSON shape but do not include hidden
  scoring literals or implementation source.

Create `evaluations/authoring/contracts/button-public-contract.json`. It may
encode only facts visible in the packet:

- custom element tag `ds-button`;
- named class export `DsButton`;
- native `button` control;
- observed public attributes `variant`, `type`, and `disabled`;
- variants `primary` and `secondary`, defaulting to `primary`;
- types `button`, `submit`, and `reset`, defaulting to `button`;
- disabled state reaches the native button;
- default slot;
- CSS part `button`;
- no navigation behavior;
- no external package dependency; and
- no undocumented public attributes, events, slots, or parts.

Do not derive requirements from the hidden source file.

**Verify**:

```sh
node -e '
  const c = require("./evaluations/authoring/cases/button-reconstruction.json");
  const p = require("./evaluations/authoring/contracts/button-public-contract.json");
  console.log(c.id, c.allowedOutputPaths, p.tagName);
'
```

Expected: prints `button-reconstruction`, only
`src/components/button.js`, and `ds-button`.

### Step 2: Implement and test the strict authoring response contract

In `scripts/local-authoring-core.mjs`, implement pure functions for:

- case validation;
- packet-source normalization;
- strict response parsing;
- exact response-shape validation;
- provenance validation;
- allowed relative-path validation;
- safe workspace path resolution; and
- public-contract scoring.

Path safety must reject:

- absolute paths;
- `..` traversal;
- empty or dot segments;
- backslash-based traversal;
- URL-like paths;
- NUL bytes;
- paths not explicitly allowlisted by the case; and
- symlink escapes during materialization.

The public-contract scorer must return named checks and failure reasons. Keep
syntax validation separate because it uses `node --check` on a materialized
file.

Add unit tests covering:

- valid supported response;
- invalid/fenced JSON;
- extra fields;
- empty or multiple files;
- wrong output path;
- Unix and backslash traversal;
- absolute path and URL path;
- quote with unknown source;
- quote not present in its source;
- unsupported status for the supported case;
- safe workspace containment;
- required public facts present;
- undocumented public surface detected; and
- no source write occurs during parsing or scoring.

**Verify**:

```sh
node --test scripts/local-authoring-core.test.mjs
```

Expected: all new tests pass without Ollama or filesystem writes.

### Step 3: Build the immutable evidence packet

In `scripts/evaluate-local-authoring.mjs`:

1. parse explicit arguments; reject unknown flags;
2. load and validate the case before retrieval;
3. run only the allowlisted `dsds` CLI commands with `--json`;
4. read only the explicit guidance files;
5. record command/file provenance and SHA-256 hashes;
6. assemble the exact generation contract and task;
7. hash the complete packet and prompt; and
8. support `--dry-run` without contacting Ollama.

Add a guard that resolves every packet input and rejects
`src/components/button.js` or any path under `src/components/`. The packet
builder must fail closed if the case attempts to include source code.

The packet must not contain:

- the current Button implementation;
- package export code;
- test expectations copied from the hidden source;
- prior Qwen responses; or
- hidden contract-scoring details beyond the documented task.

**Verify**:

```sh
npm run evaluate:authoring:local -- \
  --case evaluations/authoring/cases/button-reconstruction.json \
  --consumer ../dsdsds \
  --dry-run > /tmp/plan-005-packet.txt

rg -n 'dsds get button|component-contract|button.js' \
  /tmp/plan-005-packet.txt
```

Expected:

- CLI evidence and guidance provenance appear;
- `src/components/button.js` appears only as the requested output path;
- no implementation excerpt such as `const BUTTON_CSS` or
  `class DsButton extends HTMLElement` appears.

### Step 4: Generate and score without materializing

Reuse Plan 004's fixed loopback endpoint, JSON mode, deterministic options,
timeout, timing, token counts, model identity, and hashes.

Save a result artifact containing:

- `harnessVersion`;
- case and packet;
- packet and prompt hashes;
- requested and returned model tags;
- raw response;
- response-contract and provenance score;
- timing; and
- no materialized file.

Exit behavior:

- `0`: valid supported response and provenance;
- `1`: configuration, retrieval, transport, or artifact error;
- `2`: completed model response fails deterministic checks.

Raw results belong under ignored `evaluations/authoring/results/`.

**Verify**:

```sh
npm run evaluate:authoring:local -- \
  --case evaluations/authoring/cases/button-reconstruction.json \
  --consumer ../dsdsds \
  --out evaluations/authoring/results/button-reconstruction.json

test ! -e evaluations/authoring/workspaces/button-reconstruction
```

Expected: the proposal artifact exists and no workspace exists.

### Step 5: Require explicit, safe materialization

`scripts/materialize-local-authoring.mjs` must:

1. load an existing result artifact;
2. require its response and provenance score to pass;
3. reparse the raw response rather than trusting duplicated parsed fields;
4. require an explicit workspace path under
   `evaluations/authoring/workspaces/`;
5. refuse an existing non-empty workspace unless `--force` is supplied;
6. resolve every file beneath the workspace;
7. reject symlinked parents and path escapes; and
8. write exactly the allowlisted proposal files.

Do not accept a consumer-repository path as the workspace.

**Verify**:

```sh
npm run evaluate:authoring:materialize -- \
  --result evaluations/authoring/results/button-reconstruction.json \
  --workspace evaluations/authoring/workspaces/button-reconstruction

find evaluations/authoring/workspaces/button-reconstruction -type f -print
```

Expected: exactly
`evaluations/authoring/workspaces/button-reconstruction/src/components/button.js`.

### Step 6: Validate syntax and the documented public contract

`scripts/check-local-authoring.mjs` must:

1. rerun response/path validation against the result or workspace manifest;
2. invoke `node --check` on the generated JavaScript;
3. score only facts in `button-public-contract.json`;
4. print each named check as pass/fail; and
5. save a machine-readable check artifact beside the raw result.

Do not treat textual similarity to the hidden Button source as a check.
Static checks may conservatively fail ambiguous code and send it to human
review; they must not award a pass from comments that merely mention required
identifiers. Strip comments before literal or pattern checks.

**Verify**:

```sh
npm run evaluate:authoring:check -- \
  --case evaluations/authoring/cases/button-reconstruction.json \
  --workspace evaluations/authoring/workspaces/button-reconstruction
```

Expected: JavaScript syntax passes and every named public-contract check is
reported. Exit `0` only if all deterministic checks pass.

### Step 7: Perform and record human review

Only after deterministic scoring, open:

- the generated proposal;
- `../dsdsds/src/components/button.js`;
- `../dsdsds/src/shared/dom.js`;
- `../dsdsds/src/styles/tokens.css`; and
- the complete Button DSDS document.

Review:

- native semantics and keyboard behavior;
- attribute/property reflection;
- invalid-value fallback;
- disabled behavior;
- slot and CSS-part accuracy;
- use of existing helpers and tokens;
- lifecycle safety;
- consumer-content safety;
- undocumented public surface;
- maintainability and repository style; and
- unsupported assumptions.

Write `evaluations/authoring/reports/plan-005-button-reconstruction.md` with:

- both repository commit SHAs;
- model and Ollama version;
- packet and prompt hashes;
- deterministic check table;
- human review findings;
- whether changes would be required before applying;
- a short comparison with the hidden implementation without copying it;
- timing and token metrics; and
- final classification.

Classifications:

- **Ready as a reviewed proposal**: deterministic checks pass and only
  ordinary review edits remain.
- **Useful draft, material correction required**: grounded structure is useful
  but one or more contract, accessibility, or repository-convention changes
  are required.
- **Not useful**: invalid, invented, unsafe, or cheaper to rewrite.

Do not apply the proposal to `../dsdsds`.

**Verify**:

```sh
rg -n \
  'Repository commits|Packet hash|Deterministic checks|Human review|Classification' \
  evaluations/authoring/reports/plan-005-button-reconstruction.md
```

Expected: all five report sections exist.

### Step 8: Document the experimental workflow

Update the root README with:

- what the authoring demo measures;
- exact dry-run, generation, materialization, and validation commands;
- the separation between model response and explicit materialization;
- ignored artifact locations;
- no model tools or direct consumer writes; and
- a statement that this is experimental evaluation tooling, not a public
  `dsds` command.

Update `.gitignore` for:

```gitignore
evaluations/authoring/results/
evaluations/authoring/workspaces/
```

Update `package.json` with the three experimental scripts. Add the authoring
unit test to the root `npm test` workflow.

**Verify**:

```sh
npm test
git diff --check
git status -sb
```

Expected: all tests pass, no whitespace errors, raw results/workspaces are
ignored, and only files listed under "In scope" are modified.

## Test plan

Use Node's built-in test runner, matching
`scripts/local-model-evaluation-core.test.mjs`.

### Pure unit tests

`scripts/local-authoring-core.test.mjs` must cover:

- case schema;
- response schema;
- strict JSON;
- evidence-source lookup;
- exact quote provenance;
- path allowlisting and containment;
- traversal and symlink defenses;
- public-contract scoring; and
- stable hashes/metadata where shared functions are used.

### CLI integration tests

Add subprocess tests for:

- dry-run succeeds without Ollama;
- dry-run includes required evidence and excludes hidden source;
- invalid case exits `1`;
- model failure artifact exits `2`;
- materialization refuses a failing result;
- materialization refuses a consumer path;
- materialization refuses overwrite without `--force`; and
- check command returns non-zero for invalid JavaScript and a missing public
  contract.

Use temporary directories created by the tests; never use the real `dsdsds`
checkout as a write target.

### Manual local-model test

Run Button reconstruction once. Do not tune the hidden contract after viewing
the model output. If the contract itself is wrong, record the defect, correct
it using only DSDS evidence, reset the formal result, and explain the change
in the report as Plan 004 did.

## Done criteria

All must hold:

- [ ] Plan 003 and Plan 004 dependencies are recorded at their merged/rebased
      SHAs, or the branch is explicitly documented as stacked.
- [ ] The dry-run packet contains only allowlisted CLI evidence and guidance.
- [ ] The hidden Button implementation is absent from the packet and prompt.
- [ ] Qwen has no shell, network, MCP, or file-write tools.
- [ ] The raw proposal is saved before any file is materialized.
- [ ] Materialization requires a separate explicit command.
- [ ] Only `src/components/button.js` can be materialized.
- [ ] Materialization cannot target `../dsdsds` or escape the ignored
      workspace.
- [ ] Proposal JSON, provenance, paths, syntax, and public contract receive
      deterministic checks.
- [ ] The hidden implementation is used only for post-score human review.
- [ ] The report records deterministic and human findings separately.
- [ ] No generated source is committed.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.
- [ ] No files outside the in-scope list are modified.

## STOP conditions

Stop and report instead of improvising if:

- Plan 003 or Plan 004 changes the CLI evidence or Ollama harness
  incompatibly.
- `dsds doctor` is not fully green after the dependency rebase.
- The Button API evidence is incomplete or disagrees with the DSDS document.
- Building the packet requires reading the existing Button source.
- The model needs more than the 4,096-token context used in Plan 004.
- Correct validation requires adding a DOM emulation dependency.
- A safe materialization path cannot be proven using Node standard-library
  APIs.
- The proposal requires undocumented attributes, events, slots, parts, or
  dependencies to satisfy the task.
- The implementation would require modifying `../dsdsds`, CLI, or MCP code.
- Any verification step fails twice after a reasonable correction.

## Maintenance notes

- Reviewers should scrutinize packet provenance and path containment more than
  generated code aesthetics. Those boundaries make the demo safe.
- Keep authoring response validation separate from Plan 004's extraction
  scorer; their JSON shapes and risks differ.
- If Button reconstruction succeeds, the next plan may test one novel,
  human-authored DSDS contract in a fixture. Do not jump directly to modifying
  a real component.
- If it fails, classify whether the problem is evidence, prompt, model,
  deterministic checker, or repository convention before changing anything.
- A successful demo is evidence for designing a model-independent task-packet
  interface. It is not automatic justification for `dsds ask-local`,
  fine-tuning, or bundling Ollama into `dsds-tools`.
