# Plan 007: Deliver structured output as TOON

- Status: **REJECTED 2026-09-21**, after measuring it. The `renderTable` seam
  from Phase 1 is kept; the TOON branch, the `@toon-format/toon` dependency,
  the `format` argument on 26 signatures, the `DSDS_OUTPUT_FORMAT` env var,
  the `outputFormat` config key, the CLI `--format` flag and the ~50-token
  instruction legend are all removed. See "Why this was rejected" below.
- Priority: P2 — a real but modest token saving, with a comprehension risk attached
- Effort: S for tables only, M for tables + guideline records, plus a run to validate
- Depends on: nothing in code. Depends on a measurement run for the go/no-go.
- Format: [TOON](https://github.com/toon-format/toon), spec v4.1, `@toon-format/toon@4.1.1` (MIT)

## What TOON is, and the one number that matters

TOON (Token-Oriented Object Notation) declares an array's length and fields once
in a header, then emits one delimited row per record:

```
props[9]{prop,type,required,description}:
  `as`,`InteractiveAs<T>`,—,HTML element to render.
  `density`,`ButtonDensity`,—,Sets padding and gap together to specify size.
```

Its headline claim is **42.6% fewer tokens**, and that number is measured
**against JSON**. We do not emit JSON to the model — we emit Markdown tables,
which already amortise keys into a single header row the same way TOON does.
Measured here on 2026-09-10, same records, same truncation, 199 rows:

| Format | Tokens | vs Markdown |
| --- | --- | --- |
| Markdown table | 7,091 | — |
| JSON (minified) | 8,407 | +19% |
| YAML | 9,066 | +28% |
| JSON (pretty) | 12,185 | +72% |

So the honest framing is **TOON vs Markdown, not TOON vs JSON**, and the
realistic prize is single digits. Anyone citing 42.6% at us is quoting a
comparison we are not in.

## What we actually deliver

Measured across three real runs (22.22 ui5-cli, 21.13 and 07.55 ui5-frontload),
9,915,636 characters of tool payload:

| Tool | Share of payload |
| --- | --- |
| `dsds_get_agent_context` (+ `cli:context`) | **81.1%** |
| `dsds_get_chunk` (+ `cli:chunk`) | 7.0% |
| `dsds_check_exports` | 3.7% |
| `dsds_context_brief` | 2.9% |
| `list` + `search` + `get_entity` | 4.5% |
| everything else | <1% |

Anything that does not change `get_agent_context` is rounding error. Decomposing
175 real `get_agent_context` payloads by line shape:

| Shape | Share | TOON-eligible? |
| --- | --- | --- |
| Bullet / prose list | 60.3% | only if reshaped into records |
| **Pipe table** | **18.2%** | **yes, directly** |
| Prose | 13.6% | no |
| Code block | 4.2% | no — must stay verbatim |
| Heading | 3.3% | no |

## Measured savings, per shape

All with `gpt-tokenizer`, against the real corpus:

- **API prop tables** — 36 components, 399 prop rows: 11,571 → 10,032 tokens,
  **−13.3%**, and TOON was smaller on **36/36**. Only 1% of rows contain a comma,
  so quoting almost never fires here.
- **`list` / `search` tables** — 199 rows, the two columns we actually render:
  1,685 → 1,266 tokens, **−25%**.
- **Guideline bullets** — button's 19 RFC-2119 items: 616 → 586, **−4.9%**.
  Weak because `- **must** — ` is already nearly as tight as a TOON row, and
  6 of 19 rows contain a comma and get quoted.
- **Prose, code, headings** — not object data. TOON does not apply, and forcing
  it would be actively worse.

Weighting those by the shares above:

| Scenario | Saving on total payload | On a 327k-token iteration |
| --- | --- | --- |
| **A — tables only** (API + list/search) | **2.5%** | ~8,300 tokens |
| **B — tables + guideline records** | **4.9%** | ~16,100 tokens |

## The trap that makes TOON lose

Encoding `structuredContent` wholesale is worse than doing nothing. The default
`list` renders 2 columns while its structured half carries 6 fields, so a naive
`encode(result.structuredContent)` measured **+461%**, and the 6-field table
measured 10,673 TOON vs 6,457 Markdown — TOON *losing by 65%*.

Two causes, both avoidable: encoding fields we never render, and values
containing the delimiter (every `next` value holds quotes; summaries hold
commas) which forces per-cell quoting and erases the saving.

**Rule for the implementation: TOON encodes exactly the projection the Markdown
table would have rendered — never the raw structured object.**

## Architecture

There is no downstream consumer of our Markdown tables — nothing in either
package parses them, and the `--json` envelope is a separate path that stays
untouched. The change is confined to rendering.

Seven sites render pipe tables today:

```
spec/render-0.20.0.js        ← the API table; the only one that matters
tools/get-agent-context.js
tools/to-markdown.js
tools/get-examples.js
tools/spec-entity-schema.js
tools/list-entities.js
tools/search-entities.js
```

1. **Add one seam.** `src/render/table.js` exporting
   `renderTable(rows, columns, { format })`, returning Markdown or TOON. Every
   one of the seven sites calls it. No site decides the format itself.
2. **Thread the format from config**, not per-call: `outputFormat: 'markdown' |
   'toon'` in `dsds.config.mjs`, readable by both surfaces exactly as
   `introInline` already is, plus `--format` on the CLI for one-off inspection.
   A per-tool argument is the wrong shape — the choice is a property of the
   consumer, and an agent flipping formats mid-conversation defeats the cache.
3. **Default `markdown`.** Flip only if the validation run says to.
4. **Teach the format once.** TOON is not guaranteed to be in a model's
   training set. The instruction block needs ~40 tokens of legend
   (`name[N]{fields}:` then N rows). That sits in the cached prefix and is paid
   once per conversation, against a saving that scales with every lookup — but
   it must be counted in the comparison, not waved away.
5. **Pin exactly.** `@toon-format/toon@4.1.1`, no caret. Upstream describes the
   format as "stable, but also an idea in progress" and is on spec v4.1; a minor
   bump that changes encoding would silently change every payload we emit and
   invalidate any baseline taken before it.

We need `encode` only. The decoder is irrelevant — nothing reads TOON back.

## Phases

**Phase 1 — the seam, Markdown only (S).** Introduce `renderTable`, migrate all
seven sites, change no output. Verified by the existing suites passing
unchanged: 522 mcp + 148 cli. This is a pure refactor and is worth landing on
its own, because it is also where a future format change becomes one-line.

**Phase 2 — TOON behind the flag (S).** Implement the TOON branch and the
instruction legend. Default stays Markdown. Add tests: the projection rule
(never encode unrendered fields), delimiter-collision quoting, empty tables,
and a golden-file test per render site.

**Phase 3 — validate (M).** One paired agent-tester run, `ui5-frontload` vs
`ui5-frontload-toon`, same brief, same model, same invocation. Measure **both**
token usage and quality (build success, component accuracy, lint findings).
TOON's own README reports accuracy of 72.2% vs JSON's 71.4% on retrieval — a
0.8-point difference that is not evidence of comprehension parity on *our*
payloads, where the tabular content is an API contract the model writes code
against. A format that saves 2.5% and costs one build failure is a loss.

**Phase 4 — decide the default.** Flip to `toon` only if Phase 3 shows a token
saving with no quality regression. Otherwise keep it opt-in and record why.

## Why this was rejected

Measured, not assumed. Run `2026-09-21/18.16`, n=10 per arm, plus a corpus-wide
encoding comparison.

**The saving is 3.7% and that is near the ceiling.** Decomposing 310 real
`get_agent_context` payloads by line shape: bullet 56.4%, prose 26.2%,
**table 12.3%**, heading 2.6%, code 1.9%. Tables are the only TOON-eligible
shape, so no version of the tables-only scope does much better. The original
-2.5% estimate was sound; it just was not worth what it cost.

**The cost was spread much wider than the saving.** A `format` argument
threaded through 13 files and 26 signatures, a hard-pinned dependency upstream
describes as "stable, but also an idea in progress" (a minor bump silently
changes every payload and invalidates every baseline), three config surfaces
(env var, config key, CLI flag), two output shapes to test and golden-file,
and ~50 tokens of legend in the cached prefix because the model may not know
the format.

**Quality could not be settled, and could not have been.** Power analysis on
build success, 80% power, alpha .05: detecting 85% vs 90% needs **340
iterations per arm**. The planned n=30 rerun could only have detected a ~13
point swing. Phase 4's gate — "no quality regression" — is not provable at any
budget worth spending. The rerun was started and stopped at 4/60 once this
became clear.

**The one apparent quality signal was noise.** Trimmed lint findings were 1.90
(toon) vs 3.88 (markdown), p=0.172, driven almost entirely by
`require-icon-accessible-label` at 9 vs 0 — and 6 of those 9 came from a single
iteration. There is no mechanism from "prop table encoded as TOON" to "agent
remembers aria-labels on icon buttons".

**A 13.3% saving was sitting next to it, untouched.** The same payload audit
that produced these numbers found v3 migration guides being shipped to
greenfield agents on every lookup: 3.6x the TOON saving, one concept, no
dependency, no new config. See plan 008. Re-encoding was never the biggest
lever; it was just the one already written down.

### What was kept

Phase 1, the `renderTable` seam. Seven handlers each built their own pipe
table, with three different divider styles and three empty-cell conventions.
One function, 17 call sites, one convention. Worth keeping on legibility
alone, and it is where a future format decision would live.

### If you are reading this because you want to add a format again

Re-read "The trap that makes TOON lose" below, then answer two questions the
2026-09-21 work had to answer the hard way: what share of the payload is the
new format actually eligible for, and how many iterations would it take to
detect the quality effect you are worried about. If the answers are "about a
tenth" and "hundreds", the arithmetic has not changed.

## Phase 3 results — run `2026-09-21/18.16`, n=10 per arm

**Headline in the generated report is an artifact.** It shows toon at -56%
effective input and -94% output. Two baseline iterations caused all of it:

| arm | iter | eff. input | output | fixes | exit |
| --- | --- | --- | --- | --- | --- |
| markdown | 2 | 779,164 | 178,934 | 5 | build |
| markdown | 3 | 742,837 | 179,067 | 5 | build |

Drop those two and the input gap is **-4.9%**. Within-arm spread is
120k-353k, roughly 3x, so at n=10 an effect of a few percent sits well under
the noise floor. End-to-end tokens are the wrong instrument for this question.

**The encoding effect, measured directly on MCP payload bytes:**

| tool | toon avg | markdown avg | delta |
| --- | --- | --- | --- |
| `get_agent_context` | 10,541 | 10,911 | -3.4% |
| `get_chunk` | 6,199 | 6,567 | -5.6% |
| `list_entities` | 16,795 | 17,845 | -5.9% |
| `check_exports` | 2,671 | 2,704 | -1.2% |
| `context_brief` | 6,242 | 6,242 | -0.0% |

Raw per-iteration totals show toon *larger*; that is Simpson's paradox, the
arms drew a different tool mix. Holding the mix constant: **-3.7%**. The
plan predicted -2.5%. **The estimate was sound.**

**Quality is unresolved, not passed.** 10/10 builds vs 8/10 gives Fisher exact
two-tailed **p = 0.474**. Trimmed call volume is identical (28.0 vs 28.4 per
iteration), so the apparent "toon makes more calls" reading was also an
artifact. n=10 against a 2-event difference cannot clear Phase 4's gate.

**Ceiling check.** Decomposing 310 real `get_agent_context` payloads by line
shape: bullet 56.4%, prose 26.2%, **table 12.3%**, heading 2.6%, code 1.9%.
Tables are the only TOON-eligible shape, so -3.7% is close to the structural
maximum for the tables-only scope.

**Confound found and fixed.** `measure.performance` was `true` on the baseline
and `false` on the toon arm, so Lighthouse ran on one side only. It runs after
the agent finishes and so cannot explain the token or build results, but it
made every timing column incomparable. Matched 2026-09-21; the arms now differ
by `label` and `DSDS_OUTPUT_FORMAT` alone.

**Rerun in flight:** 30 iterations per arm, fixed brief
(`briefs/toon-phase3.txt`, the same Content Moderation Queue brief as `18.16`),
`--concurrency 1`. Powered to say something about quality rather than nothing.

## Scope calls to make explicitly

- **Guideline bullets are the difference between 2.5% and 4.9%,** and they carry
  the most risk. They are RFC-2119 instructions the agent is meant to obey, not
  data it looks up. Reshaping `- **must** — Buttons with a text prop…` into a
  CSV row changes how emphatic it reads for a 4.9% saving on that slice. Do
  Phase 3 on tables alone first; treat bullets as a separate experiment with its
  own quality gate.
- **Code blocks and chunks stay verbatim.** `dsds_get_chunk` is 7% of payload
  and is copy-paste source. It is out of scope permanently.

## STOP conditions

- Do not encode `structuredContent` directly anywhere. Project to the rendered
  columns first, or the change loses tokens instead of saving them.
- Do not flip the default before a paired run measures quality, not just size.
- Do not start while the working tree is the live target of a measurement run.
  Three surface changes already landed on 2026-09-10 (`Next` column,
  `dsds_get_examples`, opt-in summaries); runs before and after are not
  comparable, and adding a fourth mid-flight compounds it.
- If a TOON minor release changes encoding, re-baseline before comparing to any
  earlier run.

## The decision this plan asks for

Phase 1 is worth doing regardless — it is a refactor that pays for itself in
legibility. Phases 2–4 buy **2.5% (tables) or 4.9% (tables + bullets)** of total
token cost, against a comprehension risk that only a run can size.

For comparison, the opt-in-summaries change shipped the same day cut `dsds list`
by 60% and `search` by 42% for one afternoon's work, by *removing* content
rather than re-encoding it. If the goal is token cost rather than TOON
specifically, auditing what we send is the higher-yield lever, and the two are
independent.
