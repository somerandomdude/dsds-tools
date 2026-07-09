import { getUpdateNotice } from '../spec/version.js';
import { resolvePropValues, isBooleanProp } from '../prop-types.js';

/**
 * dsds_build_component — a stateless, step-by-step wizard that walks an agent
 * through IMPLEMENTING an *existing* component from the loaded design system.
 *
 * It is the mirror image of dsds_author_component_doc: that tool authors a new
 * documentation document; this tool reads an already-documented component and
 * presents each of its props/options as a question, one at a time. For every
 * question the agent decides whether and how to use the prop, choosing only
 * from the options that prop actually offers. At the end (`finalize`) the
 * wizard returns the composed component as a JSX usage snippet.
 *
 * Stateless data-carry: the server holds no session state. The agent echoes a
 * small `data` object back on every call — just `{ identifier, choices, cursor }`.
 * The component itself is re-read from the loaded systems on each call (cheap,
 * in-memory) and the ordered question list is derived deterministically, so the
 * carried payload stays tiny regardless of component size.
 *
 * Where each question's options come from, in order:
 *   1. the `variants` block  — enum items become a closed option list; flag
 *      items become a boolean choice. (Richest, design-oriented options.)
 *   2. the `api` block props — a string-literal union type ('a' | 'b') becomes
 *      a closed option list; a boolean type becomes a flag; anything else is a
 *      free-input field carrying the raw TypeScript type as a hint.
 *   3. a synthetic `children` question if the api declares no `children` prop.
 */

// ── Tool definition ──────────────────────────────────────────────────────────

const STEPS = ['start', 'answer', 'finalize'];

export const buildComponentDef = {
  name: 'dsds_build_component',
  description:
    'THE REQUIRED WAY to compose any design-system component in code. Before writing JSX for a documented ' +
    'component (e.g. "button", "card") — a new instance, configuring props, or adjusting one — call this and ' +
    'use its output instead of hand-writing JSX or guessing props. Two calls: step:"start" with an "identifier" ' +
    'returns the full list of props and each prop\'s allowed values; step:"finalize" with that identifier and an ' +
    '"answers" map { propId: value } returns ready-to-use JSX in "result.code", guaranteed valid (result.lintSafe ' +
    '= true — do not lint it). The start response explains the exact fields. Returns reference JSX for you to adapt; ' +
    'does NOT emit, save, or create files in any project — you copy the code into your own files. Reads existing ' +
    'components; does NOT author documentation (use dsds_author_component_doc for that). Requires DSDS_PATHS.',
  inputSchema: {
    type: 'object',
    properties: {
      step: {
        type: 'string',
        enum: STEPS,
        description: 'Start with "start". Then "answer" for each question, then "finalize".',
      },
      identifier: {
        type: 'string',
        description: 'On step "start": the existing component to implement, e.g. "button" or "Button". Case-insensitive.',
      },
      answers: {
        type: 'object',
        description:
          'On step "finalize" (preferred): a map of { propId: value } for every prop you want to set, taken from ' +
          'the "questions" list returned by "start". Omit props you don\'t need. Use a boolean for flag props and ' +
          'one of the offered option values for enum props. Pass null for a prop to explicitly leave it unset.',
      },
      answer: {
        type: 'object',
        description:
          'On step "answer" (optional stepwise mode): your decision for the CURRENT question. Shape: { use: boolean, value?: <chosen option | free value> }. ' +
          'Set use:false to skip an optional prop. For enum/flag props, "value" must be one of the offered options.',
      },
      data: {
        type: 'object',
        description: 'The "data" object returned by the previous step. Omit on "start", and omit on a one-shot "finalize" (pass identifier + answers instead). Only needed for the optional stepwise "answer" mode.',
      },
    },
    required: ['step'],
  },
};

// ── Response helpers ─────────────────────────────────────────────────────────

function step(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function errorResp(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function respond({ overview, validated, nextStep, nextStepId, question, questions, data, result }) {
  const payload = { validated: validated ?? null, nextStep, nextStepId, data };
  if (overview !== undefined) payload.overview = overview;
  if (questions !== undefined) payload.questions = questions;
  if (question !== undefined) payload.question = question;
  if (result !== undefined) payload.result = result;
  return step(payload);
}

// ── Entity lookup (mirrors get-entity's case-insensitive id/name match) ───────

function findComponent(identifier, getSystems) {
  const systems = getSystems();
  if (!systems || systems.length === 0) {
    return { error: 'No DSDS files configured. Set the `DSDS_PATHS` environment variable to implement an existing component.' };
  }
  if (!identifier || typeof identifier !== 'string') {
    return { error: 'Provide an "identifier" — the existing component to implement, e.g. "button".' };
  }
  const needle = identifier.toLowerCase();
  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) return { entity };
  }
  return { notFound: true, error: `Component "${identifier}" not found.` };
}

function availableComponents(getSystems) {
  const out = [];
  for (const system of getSystems()) {
    for (const e of system.entities) {
      if (e.kind === 'component') out.push(e.identifier);
    }
  }
  return out;
}

// ── Type parsing ──────────────────────────────────────────────────────────────

// ── Question model ──────────────────────────────────────────────────────────

/**
 * Build the ordered question list for a component, deterministically (so the
 * server can rebuild it on every stateless call). Dedupes by identifier:
 * a variant and an api prop sharing a name yield one question (variant wins,
 * since its options are richer).
 */
function buildQuestions(entity) {
  const blocks = entity.documentBlocks ?? [];
  const variants = blocks.find(b => b.kind === 'variants');
  const api = blocks.find(b => b.kind === 'api');
  const questions = [];
  const seen = new Set();

  for (const item of (variants?.items ?? [])) {
    if (!item?.identifier || seen.has(item.identifier)) continue;
    seen.add(item.identifier);
    if (item.kind === 'enum') {
      questions.push({
        id: item.identifier, source: 'variant', kind: 'enum', required: false,
        description: item.description,
        options: (item.values ?? []).map(v => ({ value: v.identifier, description: v.description })),
      });
    } else {
      questions.push({ id: item.identifier, source: 'variant', kind: 'flag', required: false, description: item.description });
    }
  }

  for (const prop of (api?.properties ?? [])) {
    if (!prop?.identifier || seen.has(prop.identifier)) continue;
    seen.add(prop.identifier);
    const common = { id: prop.identifier, source: 'api', required: !!prop.required, description: prop.description, typeHint: prop.type };
    if (prop.defaultValue !== undefined) common.defaultValue = prop.defaultValue;

    if (prop.identifier === 'children') {
      questions.push({ ...common, kind: 'children' });
      continue;
    }
    // Spec-authority order: schema.enum → values → type-string parse. Systems
    // that document enums via `values` (no TS-style type string) get options too.
    const union = resolvePropValues(prop);
    if (union) {
      questions.push({ ...common, kind: 'enum', options: union.map(m => ({ value: m.value, isNumber: m.isNumber })) });
    } else if (isBooleanProp(prop)) {
      questions.push({ ...common, kind: 'flag' });
    } else {
      questions.push({ ...common, kind: 'free' });
    }
  }

  if (!seen.has('children')) {
    questions.push({
      id: 'children', source: 'synthetic', kind: 'children', required: false,
      description: 'Content rendered between the component\'s tags (text or child elements). Skip for a self-closing element.',
    });
  }

  return questions;
}

function presentQuestion(q, index, total) {
  const base = {
    questionId: q.id,
    index,
    total,
    prompt: `Use "${q.id}"?${q.description ? ' ' + q.description : ''}`,
    required: q.required,
    propKind: q.kind,
  };
  if (q.kind === 'enum') base.options = q.options;
  if (q.kind === 'flag') base.options = [{ value: true }, { value: false }];
  if (q.kind === 'free') base.typeHint = q.typeHint;
  if (q.kind === 'children') base.typeHint = 'children — plain text or JSX rendered between the tags';
  if (q.defaultValue !== undefined) base.defaultValue = q.defaultValue;
  base.answerWith = q.required
    ? 'Required — answer with { use: true, value }.'
    : 'Answer with { use: true, value } to set it, or { use: false } to skip.';
  return base;
}

function validateAnswerValue(q, value) {
  if (q.kind === 'enum') {
    if (value == null) return 'a value is required';
    const allowed = q.options.map(o => String(o.value));
    if (!allowed.includes(String(value))) {
      return `"${value}" is not a valid option for "${q.id}". Choose one of: ${allowed.join(', ')}.`;
    }
    return null;
  }
  if (q.kind === 'flag') {
    if (typeof value !== 'boolean') return `"${q.id}" is a boolean — value must be true or false.`;
    return null;
  }
  // free / children — accept any non-empty value
  if (value == null || (typeof value === 'string' && value.trim() === '')) return 'a value is required';
  return null;
}

// ── JSX assembly ──────────────────────────────────────────────────────────────

function pascalCase(id) {
  return String(id).replace(/(^|[-_\s]+)([a-z0-9])/g, (_, __, ch) => ch.toUpperCase());
}

const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;

function renderAttr(id, choice) {
  const { kind, value, typeHint } = choice;
  if (kind === 'flag') {
    return value === true ? id : `${id}={false}`;
  }
  if (kind === 'enum') {
    // A numeric union member is a JS number, not a string — emit `{3}`, never
    // `"3"`. (Design systems don't use numeric string-literal unions like '3'.)
    return NUMERIC_RE.test(String(value)) ? `${id}={${value}}` : `${id}="${value}"`;
  }
  // free input — decide string literal vs JSX expression.
  if (typeof value === 'number' || typeof value === 'boolean') return `${id}={${value}}`;
  if (typeof value === 'object' && value !== null) return `${id}={${JSON.stringify(value)}}`;
  const str = String(value).trim();
  // A numeric value is a number prop given as a string (e.g. an unparsed scale)
  // → expression, never a quoted string. Fixes `contentSize="3"` → `{3}`.
  if (NUMERIC_RE.test(str)) return `${id}={${str}}`;
  // The agent already wrote an expression, JSX, or array/object literal.
  if (str.startsWith('{')) return `${id}={${str.replace(/^\{([\s\S]*)\}$/, '$1')}}`; // unwrap added braces
  if (str.startsWith('<') || str.startsWith('[')) return `${id}={${str}}`;
  // "Hard" expression-typed props take a bare identifier as an expression
  // (e.g. icon={AddIcon}, as={Box}). ReactNode/element-content types are
  // deliberately NOT here: a plain-text value for them is a string and must be
  // quoted — fixes `label={Enable email digests}` → `label="Enable email digests"`.
  const hint = (typeHint ?? '').toLowerCase();
  const exprType = /elementtype|componenttype|exoticcomponent|=>|\bfunction\b|\bref\b|\bobject\b|\[\]/.test(hint);
  if (exprType) return `${id}={${str}}`;
  return `${id}="${str}"`;
}

function assembleJsx(entity, choices) {
  const name = entity.name || pascalCase(entity.identifier);
  const attrs = [];
  let children = null;
  for (const [id, choice] of Object.entries(choices ?? {})) {
    if (choice.kind === 'children') { children = choice.value; continue; }
    attrs.push(renderAttr(id, choice));
  }

  const multiline = attrs.length > 2;
  const attrStr = attrs.length
    ? (multiline ? `\n  ${attrs.join('\n  ')}\n` : ` ${attrs.join(' ')}`)
    : '';

  if (children == null || String(children).trim() === '') {
    return multiline ? `<${name}${attrStr}/>` : `<${name}${attrStr} />`;
  }
  const open = multiline ? `<${name}${attrStr}>` : `<${name}${attrStr}>`;
  return `${open}\n  ${String(children)}\n</${name}>`;
}

// ── Step handlers ─────────────────────────────────────────────────────────────

function handleStart({ identifier }, getSystems) {
  const lookup = findComponent(identifier, getSystems);
  if (lookup.error) {
    let msg = lookup.error;
    if (lookup.notFound) {
      const comps = availableComponents(getSystems);
      if (comps.length) msg += `\n\nAvailable components: ${comps.map(c => `\`${c}\``).join(', ')}`;
    }
    return errorResp(msg);
  }
  const { entity } = lookup;
  if (entity.kind !== 'component') {
    return errorResp(`"${identifier}" is a ${entity.kind}, not a component. dsds_build_component only implements components.`);
  }

  const questions = buildQuestions(entity);
  const data = { identifier: entity.identifier, choices: {}, cursor: 0 };
  const overview = buildOverview(entity, questions.length);

  if (questions.length === 0) {
    return respond({
      overview,
      nextStep: 'This component exposes no configurable props. Call step:"finalize" to get the composed element.',
      nextStepId: 'finalize',
      data,
    });
  }
  return respond({
    overview,
    validated: `Loaded "${entity.name ?? entity.identifier}" — ${questions.length} prop${questions.length === 1 ? '' : 's'}.`,
    nextStep:
      'Decide each prop below, then call step:"finalize" ONCE with an "answers" map { propId: value } — ' +
      'include only the props you want and omit the rest. (Optional: answer one prop at a time with step:"answer".)',
    nextStepId: 'finalize',
    questions: questions.map((q, i) => presentQuestion(q, i + 1, questions.length)),
    data,
  });
}

function buildOverview(entity, questionCount) {
  const lines = [`# Implementing ${entity.name ?? entity.identifier}`];
  if (entity.description) lines.push('', resolveText(entity.description));

  const useCases = (entity.documentBlocks ?? []).find(b => b.kind === 'useCases');
  const items = useCases?.items ?? [];
  const positive = items.filter(u => u.stance === 'recommended');
  const negative = items.filter(u => u.stance === 'discouraged');
  if (positive.length) {
    lines.push('', '**When to use:**');
    for (const u of positive) lines.push(`- ${u.description}`);
  }
  if (negative.length) {
    lines.push('', '**When not to use:**');
    for (const u of negative) {
      let line = `- ${u.description}`;
      if (u.alternative?.identifier) line += ` → consider \`${u.alternative.identifier}\` instead`;
      lines.push(line);
    }
  }
  lines.push('', `${questionCount} prop${questionCount === 1 ? '' : 's'} to consider — the wizard asks about each, offering only the options it allows.`);
  return lines.join('\n');
}

function resolveText(value) {
  return typeof value === 'string' ? value : (value?.value ?? '');
}

function handleAnswer({ data, answer }, getSystems) {
  const lookup = findComponent(data?.identifier, getSystems);
  if (lookup.error) return errorResp(`${lookup.error} (run step:"start" again with a valid identifier).`);

  const questions = buildQuestions(lookup.entity);
  const cursor = Number.isInteger(data?.cursor) ? data.cursor : 0;

  if (cursor >= questions.length) {
    return respond({
      nextStep: 'All questions answered. Call step:"finalize" to get the composed component.',
      nextStepId: 'finalize',
      data,
    });
  }

  const q = questions[cursor];

  // Cold probe — answer missing: re-present the current question, don't advance.
  if (answer == null || typeof answer !== 'object') {
    return respond({
      nextStep: 'Answer the current question.',
      nextStepId: 'answer',
      question: presentQuestion(q, cursor + 1, questions.length),
      data,
    });
  }

  const use = answer.use === true || (answer.use === undefined && answer.value !== undefined);
  const choices = { ...(data.choices ?? {}) };

  if (!use) {
    if (q.required) {
      return respond({
        validated: `"${q.id}" is required and cannot be skipped.`,
        nextStep: 'Provide a value for this prop.',
        nextStepId: 'answer',
        question: presentQuestion(q, cursor + 1, questions.length),
        data,
      });
    }
    delete choices[q.id];
  } else {
    const err = validateAnswerValue(q, answer.value);
    if (err) {
      return respond({
        validated: `Rejected: ${err}`,
        nextStep: 'Provide a valid value (or { use: false } to skip).',
        nextStepId: 'answer',
        question: presentQuestion(q, cursor + 1, questions.length),
        data,
      });
    }
    choices[q.id] = { kind: q.kind, value: answer.value, typeHint: q.typeHint };
  }

  const summary = use ? `Set ${q.id}=${JSON.stringify(answer.value)}.` : `Skipped ${q.id}.`;
  const nextCursor = cursor + 1;
  const nextData = { ...data, choices, cursor: nextCursor };

  if (nextCursor >= questions.length) {
    return respond({
      validated: summary,
      nextStep: 'All questions answered. Call step:"finalize" to get the composed component.',
      nextStepId: 'finalize',
      data: nextData,
    });
  }
  return respond({
    validated: summary,
    nextStep: 'Next prop.',
    nextStepId: 'answer',
    question: presentQuestion(questions[nextCursor], nextCursor + 1, questions.length),
    data: nextData,
  });
}

function handleFinalize({ identifier, data, answers }, getSystems) {
  const lookup = findComponent(identifier ?? data?.identifier, getSystems);
  if (lookup.error) return errorResp(`${lookup.error} (run step:"start" again with a valid identifier).`);

  const entity = lookup.entity;
  const questions = buildQuestions(entity);
  // Merge any prior stepwise choices with the one-shot "answers" map.
  const choices = { ...(data?.choices ?? {}) };

  const errors = [];
  const ignored = [];
  if (answers != null && typeof answers === 'object') {
    const byId = new Map(questions.map(q => [q.id, q]));
    for (const [id, value] of Object.entries(answers)) {
      const q = byId.get(id);
      if (!q) { ignored.push(id); continue; }
      if (value === null || value === undefined) { delete choices[id]; continue; } // explicit skip
      const err = validateAnswerValue(q, value);
      if (err) { errors.push(err); continue; }
      choices[id] = { kind: q.kind, value, typeHint: q.typeHint };
    }
  }

  if (errors.length) {
    return respond({
      validated: `Rejected ${errors.length} value(s): ${errors.join(' ')}`,
      nextStep: 'Correct the listed values in your "answers" map and call step:"finalize" again.',
      nextStepId: 'finalize',
      questions: questions.map((q, i) => presentQuestion(q, i + 1, questions.length)),
      data: { ...data, choices },
    });
  }

  const missing = questions.filter(q => q.required && !(q.id in choices));
  if (missing.length) {
    return respond({
      validated: `Cannot finalize — required prop(s) not set: ${missing.map(m => m.id).join(', ')}.`,
      nextStep: 'Add the required prop(s) to your "answers" map and call step:"finalize" again.',
      nextStepId: 'finalize',
      questions: missing.map((q, i) => presentQuestion(q, i + 1, missing.length)),
      data: { ...data, choices },
    });
  }

  const code = assembleJsx(entity, choices);
  const props = Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, v.value]));
  const notice = getUpdateNotice();
  const ignoredNote = ignored.length
    ? ` Ignored unknown prop(s) not on this component: ${ignored.join(', ')}.`
    : '';

  return respond({
    validated: `Composed component assembled.${ignoredNote}`,
    nextStep:
      `Use the snippet in "result.code" as-is. It uses only documented props and valid option values for ` +
      `${entity.name ?? entity.identifier}, so it is design-system-valid by construction — do NOT run it through ` +
      `the lint tools (that would only re-emit code you already have).${notice ? ' ' + notice : ''}`,
    nextStepId: 'finalize',
    data,
    result: {
      component: entity.name ?? entity.identifier,
      props,
      code,
      lintSafe: true,
    },
  });
}

// ── Router ─────────────────────────────────────────────────────────────────────

export async function buildComponentHandler({ step: stepName, identifier, answer, answers, data = {} } = {}, getSystems, getSummaries) {
  switch (stepName) {
    case 'start':    return handleStart({ identifier: identifier ?? data.identifier }, getSystems, getSummaries);
    case 'answer':   return handleAnswer({ data, answer }, getSystems);
    case 'finalize': return handleFinalize({ identifier: identifier ?? data.identifier, data, answers }, getSystems);
    default:
      return errorResp(`Unknown step "${stepName}". Valid steps: ${STEPS.join(', ')}. Start with step:"start" and an "identifier".`);
  }
}
