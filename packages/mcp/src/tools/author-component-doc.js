import { validateDocument } from '../validator.js';
import { BUNDLED_VERSION, SPEC_URL } from '../spec/version.js';

/**
 * dsds_author_component_doc — a stateless, step-by-step wizard for AUTHORING a
 * DSDS-compliant *component* document (the documentation JSON entity, not UI code).
 * (Formerly dsds_build_component; renamed so the name no longer reads as "implement
 * a component" — that interactive implementation wizard is now dsds_build_component,
 * in build-component.js.)
 *
 * Design (see dsdsmcpwizardplan.md): a single tool with a `step` enum. The
 * server holds no session state — the agent carries the accumulated `data`
 * object forward on every call and echoes it back verbatim. Each step returns
 * a uniform {@link StepResponse}: what was accepted, which step to call next,
 * and the field schema (with `allowedValues` from the spec constants) for that
 * next step. Any step probed cold returns its own field schema instead of an
 * error ("self-bootstrapping"), so the agent never has to guess.
 *
 * All enums, block `kind` strings, and field names below were verified against
 * src/spec/dsds.bundled.schema.json (v0.11.1) — NOT the planning doc, whose
 * constants were stale (e.g. it used `alpha`/`beta` statuses, an `entries`
 * anatomy field, and a `variants`/`states` array where the schema uses
 * `parts`/`items`).
 */

// ── Spec constants (verified against the bundled schema) ─────────────────────

// status & category are open strings (kebab-case pattern) in the schema. These
// are the standard values surfaced as suggestions; custom values are allowed.
export const STATUS_SUGGESTIONS = ['draft', 'experimental', 'stable', 'deprecated'];
export const CATEGORY_SUGGESTIONS = ['action', 'communication', 'containment', 'layout', 'navigation', 'selection', 'text', 'feedback'];

// Closed enums — the schema rejects anything outside these sets.
export const WCAG_LEVELS = ['A', 'AA', 'AAA'];
export const GUIDELINE_LEVELS = ['must', 'should', 'should-not', 'must-not']; // $defs.conformanceLevel
export const VARIANT_KINDS = ['flag', 'enum'];

// prop `type` and state `identifier` are open strings; these are suggestions.
export const PROP_TYPE_SUGGESTIONS = ['string', 'number', 'boolean', 'enum', 'object', 'array', 'function', 'node', 'ref'];
export const STATE_SUGGESTIONS = ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error', 'success', 'empty', 'readonly'];

// Component block kinds the wizard can produce, in the spec's `kind` spelling.
// Rich blocks have a configure_* step; the rest are emitted as minimal valid stubs.
const KEBAB_PATTERN = /^[a-z][a-z0-9-]*$/;

// Every block the wizard emits must be schema-valid. content, design-specifications,
// and (an empty) accessibility block each require at least one populated sub-field
// (verified: their schemas have an anyOf), so there is no valid "empty stub" form.
// content/design-specifications are therefore out of scope until they get a
// configure step; accessibility is in scope but requires a wcagLevel (below).
const SELECTABLE_BLOCKS = [
  'anatomy', 'api', 'variants', 'states', 'guidelines', 'accessibility',
];

// block kind → configure step id (only rich blocks appear here)
const CONFIGURE_STEP = {
  anatomy: 'configure_anatomy',
  api: 'configure_api',
  variants: 'configure_variants',
  states: 'configure_states',
  guidelines: 'configure_guidelines',
  accessibility: 'configure_accessibility',
};

const STEPS = [
  'start', 'metadata', 'select_blocks',
  'configure_anatomy', 'configure_api', 'configure_variants',
  'configure_states', 'configure_guidelines', 'configure_accessibility',
  'finalize',
];

// ── Tool definition ──────────────────────────────────────────────────────────

export const authorComponentDocDef = {
  name: 'dsds_author_component_doc',
  description:
    'Step-by-step wizard for AUTHORING a DSDS COMPONENT DOCUMENT (a documentation JSON entity) from scratch. ' +
    'This writes DOCUMENTATION — it does NOT generate or implement a component\'s UI/source code; to implement ' +
    'an existing component in code use dsds_build_component instead. Use when you want to be guided through ' +
    'documenting a component without knowing the DSDS schema; the wizard supplies valid field values and the ' +
    'output passes validation. For other entity kinds (token, theme, foundation, pattern, guide, chunk) or a ' +
    'multi-entity system use dsds_spec_scaffold. Start with step:"start" and no data; each response gives the ' +
    'next step and fields to populate, and you are done when "result" is present.',
  inputSchema: {
    type: 'object',
    properties: {
      step: {
        type: 'string',
        enum: STEPS,
        description: 'Always start with "start". Use the "nextStepId" from each response to advance.',
      },
      data: {
        type: 'object',
        description: 'The full "data" object returned by the previous step. Omit on the first call.',
      },
    },
    required: ['step'],
  },
};

// ── Field schemas surfaced to the agent ──────────────────────────────────────

const START_FIELDS = [
  { name: 'identifier', type: 'string', required: true, description: 'Stable kebab-case id, e.g. "button", "form-field". Must match /^[a-z][a-z0-9-]*$/.' },
  { name: 'name', type: 'string', required: true, description: 'Display name, e.g. "Button", "Form Field".' },
  { name: 'description', type: 'string', required: false, description: 'One or two sentences on what the component is and when to use it.' },
];

const METADATA_FIELDS = [
  { name: 'status', type: 'string', required: false, description: 'Lifecycle status (kebab-case). Custom values allowed.', allowedValues: STATUS_SUGGESTIONS, valuesAreSuggestions: true },
  { name: 'category', type: 'string', required: false, description: 'Taxonomy bucket (kebab-case). Custom values allowed.', allowedValues: CATEGORY_SUGGESTIONS, valuesAreSuggestions: true },
  { name: 'summary', type: 'string', required: false, description: 'One-line plain-text summary for list views. No markup.' },
  { name: 'tags', type: 'string[]', required: false, description: 'Array of free-text tags for search/filtering.' },
];

const SELECT_BLOCKS_FIELDS = [
  { name: 'selectedBlocks', type: 'string[]', required: true, description: 'Ordered list of documentation blocks to include (order is preserved in the output). Each gets a dedicated configure step. Pass an empty array for a bare component with no documentation blocks.', allowedValues: SELECTABLE_BLOCKS },
];

const ANATOMY_FIELDS = [
  { name: 'anatomyParts', type: 'object[]', required: true, description: 'Array of parts. Each: { identifier (string, required), name? (string), description (string, required), required? (boolean) }.' },
];

const API_FIELDS = [
  { name: 'apiProperties', type: 'object[]', required: true, description: 'Array of props. Each: { identifier (string, required), type (string, required), description (string, required), required? (boolean), defaultValue?, values? (string[] for enum types) }. "type" suggestions below; custom strings allowed.', allowedValues: PROP_TYPE_SUGGESTIONS, valuesAreSuggestions: true },
];

const VARIANTS_FIELDS = [
  { name: 'variantItems', type: 'object[]', required: true, description: 'Array of variants. Flag: { kind: "flag", identifier, description }. Enum: { kind: "enum", identifier, description, values: [{ identifier, description }] }.', allowedValues: VARIANT_KINDS },
];

const STATES_FIELDS = [
  { name: 'stateItems', type: 'object[]', required: true, description: 'Array of states. Each: { identifier (string, required), description (string, required) }. Identifier suggestions below; custom strings allowed.', allowedValues: STATE_SUGGESTIONS, valuesAreSuggestions: true },
];

const GUIDELINES_FIELDS = [
  { name: 'guidelineItems', type: 'object[]', required: true, description: 'Array of guidelines. Each: { guidance (string, required), level (enum, required), rationale? (string) }.', allowedValues: GUIDELINE_LEVELS },
];

const ACCESSIBILITY_FIELDS = [
  { name: 'wcagLevel', type: 'string', required: true, description: 'Target WCAG conformance level. Required — the accessibility block must assert at least this.', allowedValues: WCAG_LEVELS },
];

// ── Response helpers ─────────────────────────────────────────────────────────

function step(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/**
 * A step response. When `fields` is non-empty, populate those fields and call
 * `nextStepId` again with the merged `data`. When `result` is present, you're done.
 */
function respond({ validated, nextStep, nextStepId, fields = [], data, result }) {
  const payload = {
    validated: validated ?? null,
    nextStep,
    nextStepId,
    nextStepFields: fields,
    data,
  };
  if (result !== undefined) payload.result = result;
  return step(payload);
}

// ── Block-kind → step navigation ─────────────────────────────────────────────

/**
 * Returns the next step id given the agent-carried blockQueue (a list of
 * configure step ids). Pops the head; falls through to finalize when empty.
 */
function advance(data) {
  const queue = Array.isArray(data.blockQueue) ? data.blockQueue : [];
  if (queue.length === 0) {
    return { nextStepId: 'finalize', fields: [], remaining: [], nextStep: 'All blocks configured. Call "finalize" to assemble and validate the document.' };
  }
  const [next, ...remaining] = queue;
  return { nextStepId: next, fields: FIELDS_FOR_STEP[next], remaining, nextStep: NEXT_STEP_PROMPT[next] };
}

const FIELDS_FOR_STEP = {
  configure_anatomy: ANATOMY_FIELDS,
  configure_api: API_FIELDS,
  configure_variants: VARIANTS_FIELDS,
  configure_states: STATES_FIELDS,
  configure_guidelines: GUIDELINES_FIELDS,
  configure_accessibility: ACCESSIBILITY_FIELDS,
};

const NEXT_STEP_PROMPT = {
  configure_anatomy: 'Describe the component\'s anatomy (its named parts).',
  configure_api: 'Document the component\'s API (its props).',
  configure_variants: 'Document the component\'s variants.',
  configure_states: 'Document the component\'s interactive states.',
  configure_guidelines: 'Add usage guidelines (do / don\'t rules).',
  configure_accessibility: 'Document accessibility (target WCAG level).',
};

// ── Step handlers ─────────────────────────────────────────────────────────────

function handleStart(data) {
  const { identifier, name } = data;
  if (!identifier || !name) {
    return respond({
      nextStep: 'Provide the component identifier and display name.',
      nextStepId: 'start',
      fields: START_FIELDS,
      data,
    });
  }
  if (!KEBAB_PATTERN.test(identifier)) {
    return respond({
      validated: `Rejected: identifier "${identifier}" must be lowercase kebab-case (/^[a-z][a-z0-9-]*$/).`,
      nextStep: 'Provide a valid kebab-case identifier.',
      nextStepId: 'start',
      fields: START_FIELDS,
      data: { ...data, identifier: undefined },
    });
  }
  return respond({
    validated: `Accepted: identifier="${identifier}", name="${name}".`,
    nextStep: 'Provide component metadata (all optional, but recommended).',
    nextStepId: 'metadata',
    fields: METADATA_FIELDS,
    data: { ...data, identifier, name },
  });
}

function handleMetadata(data) {
  // All metadata is optional; accept whatever is present, validate kebab fields.
  for (const key of ['status', 'category']) {
    if (data[key] != null && !KEBAB_PATTERN.test(String(data[key]))) {
      return respond({
        validated: `Rejected: ${key} "${data[key]}" must be lowercase kebab-case.`,
        nextStep: 'Fix the metadata value.',
        nextStepId: 'metadata',
        fields: METADATA_FIELDS,
        data: { ...data, [key]: undefined },
      });
    }
  }
  const accepted = ['status', 'category', 'summary', 'tags'].filter(k => data[k] != null);
  return respond({
    validated: accepted.length ? `Accepted metadata: ${accepted.join(', ')}.` : 'No metadata provided (all optional).',
    nextStep: 'Select which documentation blocks to include.',
    nextStepId: 'select_blocks',
    fields: SELECT_BLOCKS_FIELDS,
    data,
  });
}

function handleSelectBlocks(data) {
  const selected = data.selectedBlocks;
  if (!Array.isArray(selected)) {
    // Not provided yet — probe. (An empty array is a valid choice: no blocks.)
    return respond({
      nextStep: 'Choose documentation blocks, or pass an empty array for none.',
      nextStepId: 'select_blocks',
      fields: SELECT_BLOCKS_FIELDS,
      data,
    });
  }
  const invalid = selected.filter(b => !SELECTABLE_BLOCKS.includes(b));
  if (invalid.length) {
    return respond({
      validated: `Rejected unknown block(s): ${invalid.join(', ')}.`,
      nextStep: `Choose from: ${SELECTABLE_BLOCKS.join(', ')}.`,
      nextStepId: 'select_blocks',
      fields: SELECT_BLOCKS_FIELDS,
      data: { ...data, selectedBlocks: undefined },
    });
  }
  // De-dupe while preserving order.
  const ordered = selected.filter((b, i) => selected.indexOf(b) === i);
  // Queue = the configurable blocks among the selection, in selected order.
  const blockQueue = ordered.filter(b => CONFIGURE_STEP[b]).map(b => CONFIGURE_STEP[b]);
  const nextData = { ...data, selectedBlocks: ordered, blockQueue };

  const nav = advance(nextData);
  return respond({
    validated: ordered.length ? `Selected blocks: ${ordered.join(', ')}.` : 'No blocks selected — documentBlocks will be omitted (0.13.0 forbids empty arrays).',
    nextStep: nav.nextStep,
    nextStepId: nav.nextStepId,
    fields: nav.fields,
    data: { ...nextData, blockQueue: nav.remaining },
  });
}

// Generic configure handler: validates a slice, stores it, advances the queue.
function makeConfigureHandler({ inputKey, storeKey, fields, validate }) {
  return function (data) {
    const value = data[inputKey];
    const err = validate(value);
    if (err) {
      return respond({
        validated: typeof err === 'string' ? `Rejected: ${err}` : undefined,
        nextStep: 'Provide the required block data.',
        nextStepId: data.__step, // set by router below
        fields,
        data: err === true ? data : { ...data, [inputKey]: undefined },
      });
    }
    // Store the slice under its canonical key. Clear the raw input only when it
    // differs from the store key (otherwise we'd wipe the value we just set).
    const nextData = { ...data, [storeKey]: value };
    if (inputKey !== storeKey) nextData[inputKey] = undefined;
    const nav = advance(nextData);
    return respond({
      validated: `Accepted ${storeKey} (${Array.isArray(value) ? value.length + ' item(s)' : 'set'}).`,
      nextStep: nav.nextStep,
      nextStepId: nav.nextStepId,
      fields: nav.fields,
      data: { ...nextData, blockQueue: nav.remaining },
    });
  };
}

// Wraps a per-item validator. Returns `true` (a probe signal) for an empty/missing
// array so the step re-shows its fields without discarding data; a string for a
// concrete rejection; null when every item passes.
const eachItem = (perItem) => (v) => {
  if (!Array.isArray(v) || v.length === 0) return true;
  for (let i = 0; i < v.length; i++) {
    const msg = perItem(v[i], i);
    if (msg) return msg;
  }
  return null;
};

const handleConfigureAnatomy = makeConfigureHandler({
  inputKey: 'anatomyParts', storeKey: 'anatomyParts', fields: ANATOMY_FIELDS,
  validate: eachItem((p, i) =>
    (!p || !p.identifier || !p.description) ? `part[${i}] needs both "identifier" and "description".` : null),
});

const handleConfigureApi = makeConfigureHandler({
  inputKey: 'apiProperties', storeKey: 'apiProperties', fields: API_FIELDS,
  validate: eachItem((p, i) =>
    (!p || !p.identifier || !p.type || !p.description) ? `property[${i}] needs "identifier", "type", and "description".` : null),
});

const handleConfigureVariants = makeConfigureHandler({
  inputKey: 'variantItems', storeKey: 'variantItems', fields: VARIANTS_FIELDS,
  validate: eachItem((v, i) => {
    if (!v || !VARIANT_KINDS.includes(v.kind)) return `variant[${i}].kind must be one of: ${VARIANT_KINDS.join(', ')}.`;
    if (!v.identifier || !v.description) return `variant[${i}] needs "identifier" and "description".`;
    if (v.kind === 'enum' && (!Array.isArray(v.values) || v.values.length === 0)) return `enum variant[${i}] needs a non-empty "values" array of { identifier, description }.`;
    return null;
  }),
});

const handleConfigureStates = makeConfigureHandler({
  inputKey: 'stateItems', storeKey: 'stateItems', fields: STATES_FIELDS,
  validate: eachItem((s, i) =>
    (!s || !s.identifier || !s.description) ? `state[${i}] needs both "identifier" and "description".` : null),
});

const handleConfigureGuidelines = makeConfigureHandler({
  inputKey: 'guidelineItems', storeKey: 'guidelineItems', fields: GUIDELINES_FIELDS,
  validate: eachItem((g, i) => {
    if (!g || !g.guidance) return `guideline[${i}] needs "guidance".`;
    if (!GUIDELINE_LEVELS.includes(g.level)) return `guideline[${i}].level must be one of: ${GUIDELINE_LEVELS.join(', ')}.`;
    return null;
  }),
});

function handleConfigureAccessibility(data) {
  if (data.wcagLevel == null) {
    // Probe — a valid accessibility block must assert at least a wcagLevel.
    return respond({
      nextStep: 'Provide the target WCAG level for the accessibility block.',
      nextStepId: 'configure_accessibility',
      fields: ACCESSIBILITY_FIELDS,
      data,
    });
  }
  if (!WCAG_LEVELS.includes(data.wcagLevel)) {
    return respond({
      validated: `Rejected: wcagLevel must be one of: ${WCAG_LEVELS.join(', ')}.`,
      nextStep: 'Provide a valid WCAG level.',
      nextStepId: 'configure_accessibility',
      fields: ACCESSIBILITY_FIELDS,
      data: { ...data, wcagLevel: undefined },
    });
  }
  const nextData = { ...data, accessibilityWcagLevel: data.wcagLevel, wcagLevel: undefined };
  const nav = advance(nextData);
  return respond({
    validated: `Accepted accessibility (WCAG ${nextData.accessibilityWcagLevel}).`,
    nextStep: nav.nextStep,
    nextStepId: nav.nextStepId,
    fields: nav.fields,
    data: { ...nextData, blockQueue: nav.remaining },
  });
}

function handleFinalize(data) {
  let result;
  try {
    result = assembleComponent(data);
  } catch (err) {
    return respond({
      validated: `Cannot assemble: ${err.message}`,
      nextStep: 'Go back to the named step and supply the missing data.',
      nextStepId: 'start',
      fields: START_FIELDS,
      data,
    });
  }

  const validation = validateDocument(result);
  if (!validation.valid) {
    const errs = validation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    return respond({
      validated: `Assembled, but failed schema validation: ${errs}`,
      nextStep: 'Revisit the relevant step to correct the data, then finalize again.',
      nextStepId: 'finalize',
      fields: [],
      data,
    });
  }

  return respond({
    validated: 'Document assembled and passes DSDS schema validation.',
    nextStep: 'Done. Use the "result" document — write it to a .dsds.json file.',
    nextStepId: 'finalize',
    fields: [],
    data,
    result,
  });
}

// ── Assembler (pure) ──────────────────────────────────────────────────────────

/**
 * Maps a single selected block kind to its DSDS block object. Returns null for
 * unknown kinds (defensive — select_blocks already filtered the list).
 */
function assembleBlock(kind, data) {
  switch (kind) {
    case 'anatomy':
      return { kind: 'anatomy', parts: (data.anatomyParts ?? []).map(p => ({
        identifier: p.identifier,
        ...(p.name != null ? { name: p.name } : {}),
        description: p.description,
        ...(p.required != null ? { required: p.required } : {}),
      })) };
    case 'api':
      return { kind: 'api', properties: (data.apiProperties ?? []).map(p => ({
        identifier: p.identifier,
        type: p.type,
        description: p.description,
        ...(p.required != null ? { required: p.required } : {}),
        ...(p.defaultValue !== undefined ? { defaultValue: p.defaultValue } : {}),
        ...(Array.isArray(p.values) ? { values: p.values } : {}),
      })) };
    case 'variants':
      return { kind: 'variants', items: (data.variantItems ?? []).map(v => v.kind === 'enum'
        ? { kind: 'enum', identifier: v.identifier, ...(v.name != null ? { name: v.name } : {}), description: v.description, values: (v.values ?? []).map(val => ({ identifier: val.identifier, ...(val.name != null ? { name: val.name } : {}), description: val.description })) }
        : { kind: 'flag', identifier: v.identifier, ...(v.name != null ? { name: v.name } : {}), description: v.description }) };
    case 'states':
      return { kind: 'states', items: (data.stateItems ?? []).map(s => ({
        identifier: s.identifier,
        ...(s.name != null ? { name: s.name } : {}),
        description: s.description,
      })) };
    case 'guidelines':
      return { kind: 'guidelines', items: (data.guidelineItems ?? []).map(g => ({
        guidance: g.guidance,
        level: g.level,
        ...(g.rationale != null ? { rationale: g.rationale } : {}),
      })) };
    case 'accessibility':
      return { kind: 'accessibility', ...(data.accessibilityWcagLevel != null ? { wcagLevel: data.accessibilityWcagLevel } : {}) };
    default:
      return null;
  }
}

export function assembleComponent(data) {
  if (!data.identifier) throw new Error('missing "identifier" (run the "start" step)');
  if (!data.name) throw new Error('missing "name" (run the "start" step)');

  const metadata = {};
  if (data.status != null) metadata.status = data.status;
  if (data.category != null) metadata.category = data.category;
  if (data.summary != null) metadata.summary = data.summary;
  if (Array.isArray(data.tags)) metadata.tags = data.tags;

  const documentBlocks = (data.selectedBlocks ?? [])
    .map(kind => assembleBlock(kind, data))
    .filter(Boolean);

  const entity = {
    kind: 'component',
    identifier: data.identifier,
    name: data.name,
    ...(data.description != null ? { description: data.description } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    // 0.13.0: empty collections violate minItems — omit rather than emit [].
    ...(documentBlocks.length ? { documentBlocks } : {}),
  };

  return {
    $schema: `${SPEC_URL}/v${BUNDLED_VERSION}/dsds.bundled.schema.json`,
    dsdsVersion: BUNDLED_VERSION,
    entity,
  };
}

// ── Router ─────────────────────────────────────────────────────────────────────

const STEP_HANDLERS = {
  start: handleStart,
  metadata: handleMetadata,
  select_blocks: handleSelectBlocks,
  configure_anatomy: handleConfigureAnatomy,
  configure_api: handleConfigureApi,
  configure_variants: handleConfigureVariants,
  configure_states: handleConfigureStates,
  configure_guidelines: handleConfigureGuidelines,
  configure_accessibility: handleConfigureAccessibility,
  finalize: handleFinalize,
};

export async function authorComponentDocHandler({ step: stepName, data = {} }) {
  const handler = STEP_HANDLERS[stepName];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown step "${stepName}". Valid steps: ${STEPS.join(', ')}. Start with "start".` }],
    };
  }
  // The generic configure handler needs to know which step it is (for re-prompts).
  const enriched = { ...data, __step: stepName };
  const result = handler(enriched);
  // Strip the internal marker from the echoed data so the agent never sees it.
  return stripInternal(result);
}

function stripInternal(response) {
  try {
    const parsed = JSON.parse(response.content[0].text);
    if (parsed.data && '__step' in parsed.data) delete parsed.data.__step;
    response.content[0].text = JSON.stringify(parsed);
  } catch {
    /* non-JSON payload — leave as-is */
  }
  return response;
}
