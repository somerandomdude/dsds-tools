// Entity-kind knowledge for the live DSDS model.
//
// Field-level detail comes from the vendored schema at runtime (see
// schema-describe.js); what lives here is the per-kind summary and usage note
// that the schema itself does not carry.

export const ENTITY_KINDS_0_20_0 = ['component', 'token', 'theme', 'system', 'entry'];

// Every kind requires [id, kind, name, description] (entries/entry.schema.yaml).
// `entry` (generic) adds nothing beyond that base — use a namespaced custom
// `kind` (e.g. "acme.icon-library") for anything that doesn't fit the other four.
export const ENTITY_DESCRIPTIONS_0_20_0 = {
  component: {
    summary: 'A reusable UI element. Points at real source instead of hand-typing its API.',
    required: ['id', 'kind', 'name', 'description'],
    optionalTop: ['metadata', 'sourceFiles', 'specs', 'imports', 'traits', 'combos', 'refs', 'sections', '$extensions'],
    notes: '`sourceFiles` points a tool at the real file to extract props from — prefer this over hand-typing an API in a section. `specs` is different: it points at an already-extracted, machine-readable API contract document (e.g. a Custom Elements Manifest), for when that already exists instead of hand-extracting from `sourceFiles`. `traits` (not a section) declares every variant (`kind: enum`) and state (`kind: boolean`); `combos` declares pairing rules between them. Directory convention: `components/`.',
  },
  token: {
    summary: 'A single design token, from the Design Tokens Community Group (DTCG) format.',
    required: ['id', 'kind', 'name', 'description'],
    optionalTop: ['metadata', 'source', 'tokenType', 'combos', 'refs', 'sections', '$extensions'],
    notes: 'Never stores the real value — `source` points at the DTCG JSON file that does. `tokenType` is optional; a token can inherit its type from `metadata.group` instead of stating its own. There is no `token-group` kind — group related tokens with `metadata.group` (e.g. "color.action") on each member instead. Directory convention: `tokens/`.',
  },
  theme: {
    summary: 'A named set of token overrides for a specific context (dark mode, brand variant).',
    required: ['id', 'kind', 'name', 'description'],
    optionalTop: ['metadata', 'source', 'refs', 'sections', '$extensions'],
    notes: 'Points at its own DTCG override source rather than restating values. Directory convention: `themes/`.',
  },
  system: {
    summary: 'The design system itself — version, organization, url, license, platforms.',
    required: ['id', 'kind', 'name', 'description'],
    optionalTop: ['metadata', 'refs', 'sections', '$extensions'],
    notes: 'One per project, usually the `kind: system` entry inside the root `index.dsds.yaml`. When its `metadata.platforms` is set, every `platform` value used anywhere else in the document (a component\'s `sourceFiles`/`imports`, a status entry) must be one of them — DSDS-02.',
  },
  entry: {
    summary: 'The generic kind — anything that is not a component, token, theme, or system.',
    required: ['id', 'kind', 'name', 'description'],
    optionalTop: ['metadata', 'refs', 'sections', '$extensions'],
    notes: 'Use for a foundation, pattern, or guide — organize by directory for clarity (`foundations/`, `patterns/`, `guides/`) even though the schema `kind` is uniform. Use a namespaced custom kind (e.g. "acme.case-study") instead of the bare `entry` when the document wants its own recognizable name.',
  },
};

// Real 0.20.0 replaces the whole documentBlocks/agentDocumentBlocks model
// with one `sections` array. Every section kind is valid on every entry
// kind — there is no per-kind allow-list the way legacy VALID_BLOCKS_BY_KIND
// has one, so there's no 0.20.0 equivalent of that table.
export const SECTION_KIND_DESCRIPTIONS_0_20_0 = {
  definitions: {
    summary: 'Term/definition pairs. Use for anatomy, naming conventions, or a prop/event list only when there is no real source file to point `sourceFiles` at instead.',
    validFor: ENTITY_KINDS_0_20_0,
  },
  guidelines: {
    summary: 'A `statement` paired with a `level` (must/should/should-not/must-not/may — RFC 2119, lowercase-hyphenated). Carries `framing: when-to-use` (a fit judgment) or `how-to-use` (the default, an implementation rule).',
    validFor: ENTITY_KINDS_0_20_0,
  },
  steps: {
    summary: 'An ordered procedure or unordered checklist.',
    validFor: ENTITY_KINDS_0_20_0,
  },
  section: {
    summary: 'Generic prose — the catch-all for content the other three section kinds don\'t capture.',
    validFor: ENTITY_KINDS_0_20_0,
  },
};

// Every section kind can also carry `freeform`: headed, nestable prose
// alongside its own structured `items` — not a separate section kind.
export const SECTION_FREEFORM_NOTE =
  'Every section kind can carry `freeform` — headed, nestable prose — alongside its own structured `items`. Use it for narrative context a structured item can\'t hold; it is not a fifth section kind.';

// Minimal standalone-entry scaffolds (no schemaVersion/entries wrapper) —
// matches the dsds-add skill's own templates. `id` must match the filename
// (checkbox → checkbox.dsds.yaml).
export const SCAFFOLDS_0_20_0 = {
  component: {
    id: 'my-component',
    kind: 'component',
    name: 'My Component',
    description: 'Describe what this component does and when to use it.',
    // 0.20.0: empty arrays violate minItems — omit rather than emit [].
    // `metadata.tags` and a `sections` entry's `items` both require at
    // least one real element, so a truly empty starting point has neither.
    metadata: { status: { status: 'draft' } },
    sourceFiles: [{ platform: 'react', file: './src/MyComponent.tsx' }],
    // `traitType` is required on every trait as of 0.21.0, and it is the one
    // field a 0.20.x author does not expect. Both values appear here so the
    // scaffold teaches the distinction rather than leaving it to a validation
    // error: `size` is a dimension the caller configures, `loading` a
    // condition the component is in.
    traits: [
      {
        kind: 'enum',
        traitType: 'variant',
        id: 'size',
        description: 'Controls the overall scale.',
        values: [{ id: 'medium', description: 'The default size.' }],
      },
      {
        kind: 'boolean',
        traitType: 'state',
        id: 'loading',
        description: 'Shows a pending action and blocks interaction.',
      },
    ],
  },
  token: {
    id: 'color.action.primary',
    kind: 'token',
    name: 'Action Primary',
    description: 'Describe what this token represents and when to use it.',
    tokenType: 'color',
    metadata: { status: { status: 'draft' }, group: 'color.action' },
    source: './tokens.dtcg.json',
  },
  theme: {
    id: 'my-theme',
    kind: 'theme',
    name: 'My Theme',
    description: 'Describe the context or mode this theme is used for.',
    metadata: { status: { status: 'draft' } },
    source: './themes/my-theme.dtcg.json',
  },
  system: {
    id: 'my-design-system',
    kind: 'system',
    name: 'My Design System',
    description: 'Describe what this design system is and who it serves.',
    metadata: { version: '1.0.0', organization: 'My Organization', platforms: ['react'] },
  },
  entry: {
    id: 'my-entry',
    kind: 'entry',
    name: 'My Entry',
    description: 'Describe what this entry covers.',
    metadata: { status: { status: 'draft' } },
  },
};
