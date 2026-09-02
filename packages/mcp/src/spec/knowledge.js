// Static spec knowledge derived from the DSDS 0.15.2 schema.
// Used by spec tools to describe entities and document blocks without parsing the full schema at runtime.

export const ENTITY_KINDS = ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group', 'chunk'];

export const ENTITY_DESCRIPTIONS = {
  component: {
    summary: 'Reusable UI element (e.g. Button, Modal, Input).',
    required: ['kind', 'identifier', 'name'],
    optionalTop: ['description', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'The workhorse entity. Use documentBlocks to document anatomy, API, variants, states, accessibility, etc. Use agentDocumentBlocks for agent-only guidance (same block kinds, never rendered for humans).',
  },
  guide: {
    summary: 'Long-form, reading-oriented documentation: getting-started guides, tutorials, conceptual overviews, migration guides, and contribution docs.',
    required: ['kind', 'identifier', 'name'],
    optionalTop: ['description', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'Use sections and steps blocks for narrative and procedural content. Guide category values: getting-started, tutorial, concept, migration, contribution.',
  },
  pattern: {
    summary: 'A multi-component solution for a recurring user need (e.g. Error Messaging, Empty State).',
    required: ['kind', 'identifier', 'name'],
    optionalTop: ['description', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'Patterns describe composition and interaction flows across components, not individual component behavior.',
  },
  foundation: {
    summary: 'A macro-level visual domain such as color, typography, spacing, or motion.',
    required: ['kind', 'identifier', 'name'],
    optionalTop: ['description', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'Use scale and principles blocks to document the rules and values that govern the foundation domain. Use sections blocks for free-form narrative prose — overviews, rationale, FAQs — that structured block kinds do not capture.',
  },
  theme: {
    summary: 'A named set of token overrides for a specific context (e.g. dark mode, high-contrast, brand variant).',
    required: ['kind', 'identifier', 'name'],
    optionalTop: ['description', 'source', 'overrides', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'Themes layer on top of base tokens. Use overrides to map token identifiers to new values.',
  },
  token: {
    summary: 'An individual design value — color, spacing, typography, etc.',
    required: ['kind', 'identifier', 'tokenType'],
    optionalTop: ['description', 'source', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'tokenType must be one of: color, dimension, fontFamily, fontWeight, fontStyle, duration, cubicBezier, number, string. DSDS documents the *why* of a token, not the value itself — use the W3C Design Tokens Format for values.',
  },
  'token-group': {
    summary: 'A hierarchical collection of related tokens (e.g. a color palette, a spacing scale).',
    required: ['kind', 'identifier'],
    optionalTop: ['description', 'tokenType', 'source', 'children', 'metadata', 'documentBlocks', 'agentDocumentBlocks', 'relationships', '$extensions'],
    notes: 'children is an array of token or token-group entities. tokenType can be set at the group level and inherited by children.',
  },
  chunk: {
    summary: 'A pre-composed block of code capturing a design system pattern — a copy-paste starting point built from the system\'s components.',
    required: ['kind', 'identifier', 'name', 'code'],
    optionalTop: ['description', 'documentBlocks', 'agentDocumentBlocks', 'metadata', 'relationships', '$extensions'],
    notes: 'Chunks accept `documentBlocks` and `agentDocumentBlocks` with the general block kinds (guidelines, useCases, accessibility, content, sections, checklist). The top-level `guidelines`/`useCases` shorthand was removed in 0.15.0 — use `documentBlocks`. The `code` object has two forms: inline (`code` + `language`) or referenced (`src` + `language`, where `src` is a path relative to the chunk file — must be relative). Declare the components this chunk composes in the top-level `relationships` array, e.g. { relation: "composes", target: "button", required: true }.',
  },
};

export const DOCUMENT_BLOCK_DESCRIPTIONS = {
  sections: {
    summary: 'Narrative prose organized into titled, optionally nested sections. Each section has a title, body (markdown), optional examples, and optional nested sections. Use for free-form content the structured block kinds do not capture — overviews, rationale, background, decision history, FAQs.',
    validFor: ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group'],
  },
  steps: {
    summary: 'An ordered or unordered procedure. Each step has a title, optional instruction, optional expected result, and an optional flag.',
    validFor: ['guide'],
  },
  guidelines: {
    summary: 'Actionable usage rules. Each item has `guidance` (the rule text) and `level` (RFC 2119: MUST, MUST_NOT, SHOULD, SHOULD_NOT). Optional: `rationale`, `evidence` (empirical backing), `category`, `target`, `criteria` (testable success criteria: identifier + verifiable statement), `references` (external standards like WCAG), `tags`, `examples`.',
    validFor: ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group'],
  },
  useCases: {
    summary: 'When-to-use and when-not-to-use scenarios. Optional `purpose` is the umbrella statement; each item in `items` has a `stance` ("recommended" or "discouraged") and an optional `alternative: { identifier, rationale }` for discouraged cases.',
    validFor: ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group'],
  },
  accessibility: {
    summary: 'WCAG compliance notes, keyboard behavior, ARIA attributes, contrast ratios, and optional testable `criteria`.',
    validFor: ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group'],
  },
  content: {
    summary: 'Copywriting rules, localization guidance, and label conventions.',
    validFor: ['component', 'guide', 'pattern', 'foundation', 'theme', 'token', 'token-group'],
  },
  anatomy: {
    summary: 'Named structural parts of the entity and their token mappings, with optional annotated examples.',
    validFor: ['component', 'pattern'],
  },
  api: {
    summary: 'Properties, events, slots, CSS custom properties, CSS parts, and data attributes. At least one of those arrays is required.',
    validFor: ['component'],
  },
  variants: {
    summary: 'Discrete option axes (e.g. emphasis: primary | secondary | ghost; size: sm | md | lg). Each value can carry a `rationale` and `examples`.',
    validFor: ['component', 'pattern'],
  },
  states: {
    summary: 'Interactive states and their visual/behavioral overrides (hover, focus, disabled, loading, etc.). Each state can carry a `rationale` and `examples`.',
    validFor: ['component', 'pattern'],
  },
  'design-specifications': {
    summary: 'Concrete measurements — spacing, sizing, typography — mapped to tokens or raw CSS values.',
    validFor: ['component'],
  },
  imports: {
    summary: 'Package import paths and framework-specific usage snippets.',
    validFor: ['component', 'guide'],
  },
  interactions: {
    summary: 'Step-by-step interaction flows describing how a user moves through the pattern.',
    validFor: ['pattern'],
  },
  principles: {
    summary: 'High-level rationale and rules governing the foundation domain.',
    validFor: ['foundation'],
  },
  scale: {
    summary: 'The discrete steps in a scale system (spacing scale, type scale, etc.).',
    validFor: ['foundation'],
  },
  motion: {
    summary: 'Duration and easing curves that govern animation within this foundation domain.',
    validFor: ['foundation'],
  },
};

// Which block types are valid per entity kind (documentBlocks AND agentDocumentBlocks)
export const VALID_BLOCKS_BY_KIND = {
  component: ['imports', 'anatomy', 'api', 'variants', 'states', 'design-specifications', 'guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  guide: ['sections', 'steps', 'imports', 'guidelines', 'useCases', 'accessibility', 'content', 'checklist'],
  pattern: ['interactions', 'anatomy', 'variants', 'states', 'guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  foundation: ['principles', 'scale', 'motion', 'guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  theme: ['guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  token: ['guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  'token-group': ['guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
  chunk: ['guidelines', 'useCases', 'accessibility', 'content', 'sections', 'checklist'],
};

export const METADATA_FIELDS = {
  summary: 'One-sentence plain-text summary shown in listings and search results.',
  status: '"draft" | "experimental" | "stable" | "deprecated" (string shorthand). Object form for detail: { overall, platforms: { react: { status, since }, ... }, deprecationNotice }.',
  tags: 'Array of strings for categorization and search filtering.',
  category: 'Grouping category within the design system (lowercase kebab-case).',
  since: 'Version string when this entity was introduced.',
  lastUpdated: 'ISO date string shorthand, or { date, note } for a change note.',
  aliases: 'Alternative names or identifiers for this entity.',
  preview: 'Visual or interactive preview: a presentation object (image, video, code snippet, or URL).',
  thumbnail: '{ url, alt } — thumbnail image with required alt text.',
  extends: 'Inheritance declaration from a base entity in a parent system: { identifier, system?, modifications? }.',
  governance: 'Accountability for the docs: { owner (required), lastReviewed? } — lastReviewed object form records who reviewed and which implementation version was verified (reviewedAgainst).',
  docOrigin: "How the documentation came to exist. String shorthand (e.g. 'extracted', 'authored') or object form for mixed origins.",
  links: 'DEPRECATED for entity relationships. `links` is for EXTERNAL resources only — { kind, url, label? } with kinds source, design, storybook, documentation, package, repository — and lives on anatomy/section entries, not on metadata. To relate one documented entity to another, use the top-level `relationships` array instead of a link.',
};

// `relationships` is a TOP-LEVEL entity field (beside identifier/name), not metadata.
// DSDS 0.12.0 introduced it as the single, typed way to express edges between entities.
export const RELATIONSHIPS_FIELD =
  'relationships: an array of typed, directional edges to other documented entities. Each edge: ' +
  '{ relation, target, role?, required?, versionConstraint? }. `relation` is one of depends-on (needs target to function), ' +
  'composes (built from target), part-of (member of target), alternative-to (interchangeable; symmetric), replaces ' +
  '(supersedes a deprecated target), extends (inherits from target); custom relations must be vendor-namespaced (e.g. acme.themes). ' +
  '`target` must match a documented entity\'s identifier. `required` (default false) is meaningful for depends-on/composes. ' +
  'Tools derive inverse edges (composed-by, dependency-of, contains, replaced-by) — do not author them.';

// NOTE: `description` is NOT metadata — it is a top-level entity property beside `identifier` and `name`.

// Minimal scaffolds per entity kind
const SCHEMA_URL = 'https://designsystemdocspec.org/v0.15.2/dsds.bundled.schema.json';

export const SCAFFOLDS = {
  component: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'component',
      identifier: 'my-component',
      name: 'My Component',
      description: 'Describe what this component does and when to use it.',
      metadata: { status: 'stable', tags: [] },
      documentBlocks: [],
    },
  },
  guide: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'guide',
      identifier: 'my-guide',
      name: 'My Guide',
      description: 'Describe what this guide covers.',
      metadata: { category: 'concept', status: 'stable' },
      documentBlocks: [],
    },
  },
  pattern: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'pattern',
      identifier: 'my-pattern',
      name: 'My Pattern',
      description: 'Describe the user need this pattern addresses.',
      metadata: { status: 'stable', tags: [] },
      documentBlocks: [],
    },
  },
  foundation: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'foundation',
      identifier: 'my-foundation',
      name: 'My Foundation',
      description: 'Describe the visual domain this foundation governs.',
      metadata: { status: 'stable' },
      documentBlocks: [],
    },
  },
  theme: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'theme',
      identifier: 'my-theme',
      name: 'My Theme',
      description: 'Describe the context or mode this theme is used for.',
      metadata: { status: 'stable' },
      overrides: [],
      documentBlocks: [],
    },
  },
  token: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'token',
      identifier: 'color-text-primary',
      tokenType: 'color',
      description: 'Describe what this token represents and when to use it.',
      metadata: { status: 'stable' },
      documentBlocks: [],
    },
  },
  'token-group': {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'token-group',
      identifier: 'color-text',
      description: 'Describe the collection of tokens in this group.',
      metadata: { status: 'stable' },
      children: [],
      documentBlocks: [],
    },
  },
  chunk: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    entity: {
      kind: 'chunk',
      identifier: 'my-chunk',
      name: 'My Chunk',
      description: 'Describe what pattern this chunk captures and which components it composes.',
      code: {
        language: 'tsx',
        code: '// Your pre-composed starting point here',
      },
      metadata: { status: 'stable', tags: [] },
    },
  },
  system: {
    $schema: SCHEMA_URL,
    dsdsVersion: '0.15.2',
    systemInfo: {
      name: 'My Design System',
      version: '1.0.0',
      organization: 'My Organization',
    },
    entityGroups: [
      {
        name: 'My Design System',
        entities: [],
      },
    ],
  },
};

// ── Real DSDS 0.20.0 (entries/sections/traits/sourceFiles/refs) ──────────────
//
// Everything above this line is the legacy 0.15.2 JSON model this server has
// always spoken. Below is the real 0.20.0 YAML model, from the actual
// design-system-documentation-schema repo's 0.20.0 branch — see
// packages/mcp/src/spec/schema-0.20.0/ for the vendored source schema and
// packages/mcp/skills/ for that branch's own authoring skills, which this
// data mirrors in prose. Kept as separate exports (not merged into the
// tables above) since the two models are genuinely different shapes, not
// versions of the same one: `id` vs `identifier`, `sections` vs
// `documentBlocks`, `traits`/`sourceFiles`/`combos` as top-level entry
// fields, `refs` instead of `relationships`. A document loaded from
// `.dsds.yaml` is real 0.20.0 (see loader.js's `__dsds20` flag); everything
// else on this server remains legacy 0.15.2.

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
