import { createHash } from 'node:crypto';

const VALUE_FLAGS = new Set(['--case', '--consumer', '--model', '--out']);
const BOOLEAN_FLAGS = new Set(['--dry-run', '--force']);

export const HARNESS_VERSION = 3;
export const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/chat';
export const OLLAMA_TIMEOUT_MS = 120_000;

export function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (BOOLEAN_FLAGS.has(flag)) {
      if (options[flag]) throw new Error(`Duplicate option: ${flag}`);
      options[flag] = true;
      continue;
    }

    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (Object.hasOwn(options, flag)) throw new Error(`Duplicate option: ${flag}`);

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[flag] = value;
    index += 1;
  }

  if (!options['--case']) throw new Error('Missing required option: --case');
  if (!options['--consumer']) throw new Error('Missing required option: --consumer');
  if (options['--dry-run'] && options['--out']) {
    throw new Error('Choose either --dry-run or --out, not both');
  }
  if (!options['--dry-run'] && !options['--out']) {
    throw new Error('A live run requires --out');
  }
  if (options['--force'] && !options['--out']) {
    throw new Error('--force is only valid with --out');
  }

  return {
    casePath: options['--case'],
    consumer: options['--consumer'],
    model: options['--model'] ?? 'qwen2.5-coder:7b',
    outputPath: options['--out'],
    dryRun: options['--dry-run'] ?? false,
    force: options['--force'] ?? false,
  };
}

export function validateEvaluation(evaluation) {
  if (!isPlainObject(evaluation)) throw new Error('Evaluation case must be a JSON object');
  requireNonEmptyString(evaluation.id, 'id');
  requireNonEmptyString(evaluation.task, 'task');
  requireNonEmptyString(evaluation.prompt, 'prompt');
  if (!['supported', 'unsupported'].includes(evaluation.stratum)) {
    throw new Error('stratum must be either supported or unsupported');
  }

  if (!Array.isArray(evaluation.evidence) || evaluation.evidence.length === 0) {
    throw new Error('evidence must be a non-empty array');
  }
  for (const [index, command] of evaluation.evidence.entries()) {
    if (!Array.isArray(command) || command.length === 0 || command.some(value => typeof value !== 'string' || value.length === 0)) {
      throw new Error(`evidence[${index}] must be a non-empty array of strings`);
    }
  }

  const { expect } = evaluation;
  if (!isPlainObject(expect)) throw new Error('expect must be an object');

  const allowedExpectKeys = new Set([
    'requiredFields', 'fields', 'allowAdditionalFields',
    'contract', 'layoutKind', 'requiredRegions', 'requiredConstraints', 'requiredEvidence',
  ]);
  rejectUnknownKeys(expect, allowedExpectKeys, 'expect');

  if (expect.contract !== undefined) {
    validateLayoutContractExpectation(expect);
    return evaluation;
  }

  if (!Array.isArray(expect.requiredFields) || expect.requiredFields.length === 0) {
    throw new Error('expect.requiredFields must be a non-empty array');
  }
  if (expect.requiredFields.some(field => typeof field !== 'string' || field.length === 0)) {
    throw new Error('expect.requiredFields must contain non-empty strings');
  }
  if (new Set(expect.requiredFields).size !== expect.requiredFields.length) {
    throw new Error('expect.requiredFields must not contain duplicates');
  }
  if (expect.allowAdditionalFields !== undefined && typeof expect.allowAdditionalFields !== 'boolean') {
    throw new Error('expect.allowAdditionalFields must be a boolean');
  }
  if (!isPlainObject(expect.fields) || Object.keys(expect.fields).length === 0) {
    throw new Error('expect.fields must be a non-empty object');
  }

  for (const requiredField of expect.requiredFields) {
    if (!Object.hasOwn(expect.fields, requiredField)) {
      throw new Error(`expect.requiredFields references unasserted field: ${requiredField}`);
    }
  }

  for (const [field, assertion] of Object.entries(expect.fields)) {
    if (!isPlainObject(assertion)) throw new Error(`expect.fields.${field} must be an object`);
    const allowedAssertionKeys = new Set(['equals', 'requiredLiterals', 'forbiddenLiterals']);
    rejectUnknownKeys(assertion, allowedAssertionKeys, `expect.fields.${field}`);
    if (Object.keys(assertion).length === 0) {
      throw new Error(`expect.fields.${field} must contain at least one assertion`);
    }
    if (assertion.equals !== undefined && typeof assertion.equals !== 'string') {
      throw new Error(`expect.fields.${field}.equals must be a string`);
    }
    validateStringArray(assertion.requiredLiterals, `expect.fields.${field}.requiredLiterals`);
    validateStringArray(assertion.forbiddenLiterals, `expect.fields.${field}.forbiddenLiterals`);
  }

  return evaluation;
}

export function scoreResponse(text, evaluation) {
  let response;

  try {
    response = JSON.parse(text);
  } catch (error) {
    return {
      pass: false,
      jsonValid: false,
      failures: [{ code: 'invalid_json', message: error.message }],
      fields: {},
    };
  }

  if (!isPlainObject(response)) {
    return {
      pass: false,
      jsonValid: true,
      failures: [{ code: 'invalid_response_type', message: 'Response must be a JSON object' }],
      fields: {},
    };
  }

  if (evaluation.expect.contract === 'layout-v1') {
    return scoreLayoutResponse(response, evaluation.expect);
  }

  const failures = [];
  const fieldResults = {};
  const expectedFields = Object.keys(evaluation.expect.fields);

  for (const field of evaluation.expect.requiredFields) {
    if (!Object.hasOwn(response, field)) {
      failures.push({ code: 'missing_field', field, message: `Missing required field: ${field}` });
    }
  }

  if (evaluation.expect.allowAdditionalFields !== true) {
    for (const field of Object.keys(response)) {
      if (!expectedFields.includes(field)) {
        failures.push({ code: 'unexpected_field', field, message: `Unexpected response field: ${field}` });
      }
    }
  }

  for (const [field, assertion] of Object.entries(evaluation.expect.fields)) {
    if (!Object.hasOwn(response, field)) continue;
    const value = response[field];
    const result = {
      pass: true,
      exactMatch: assertion.equals === undefined ? null : value === assertion.equals,
      requiredMissing: [],
      forbiddenFound: [],
    };

    if (typeof value !== 'string') {
      failures.push({ code: 'invalid_field_type', field, message: `${field} must be a string` });
      result.pass = false;
      fieldResults[field] = result;
      continue;
    }

    if (assertion.equals !== undefined && value !== assertion.equals) {
      failures.push({
        code: 'exact_mismatch',
        field,
        message: `${field} did not exactly match the expected value`,
      });
    }

    result.requiredMissing = (assertion.requiredLiterals ?? []).filter(literal => !value.includes(literal));
    result.forbiddenFound = (assertion.forbiddenLiterals ?? []).filter(literal => value.includes(literal));

    for (const literal of result.requiredMissing) {
      failures.push({ code: 'required_literal_missing', field, literal, message: `Missing required literal in ${field}: ${literal}` });
    }
    for (const literal of result.forbiddenFound) {
      failures.push({ code: 'forbidden_literal_found', field, literal, message: `Found forbidden literal in ${field}: ${literal}` });
    }

    result.pass = !failures.some(failure => failure.field === field);
    fieldResults[field] = result;
  }

  return {
    pass: failures.length === 0,
    jsonValid: true,
    failures,
    fields: fieldResults,
  };
}

function validateLayoutContractExpectation(expect) {
  if (expect.contract !== 'layout-v1') {
    throw new Error('expect.contract must be layout-v1');
  }
  requireNonEmptyString(expect.layoutKind, 'expect.layoutKind');
  validateStringArray(expect.requiredRegions, 'expect.requiredRegions');
  validateStringArray(expect.requiredConstraints, 'expect.requiredConstraints');
  validateStringArray(expect.requiredEvidence, 'expect.requiredEvidence');
  for (const name of ['requiredRegions', 'requiredConstraints', 'requiredEvidence']) {
    if (expect[name].length === 0 || new Set(expect[name]).size !== expect[name].length) {
      throw new Error(`expect.${name} must be a non-empty, unique string array`);
    }
  }
}

function scoreLayoutResponse(response, expect) {
  const failures = [];
  const requiredFields = ['status', 'layout', 'constraints', 'evidence'];
  const expectedFields = new Set(requiredFields);
  const fields = {};

  for (const field of requiredFields) {
    if (!Object.hasOwn(response, field)) {
      failures.push({ code: 'missing_field', field, message: `Missing required field: ${field}` });
    }
  }
  for (const field of Object.keys(response)) {
    if (!expectedFields.has(field)) {
      failures.push({ code: 'unexpected_field', field, message: `Unexpected response field: ${field}` });
    }
  }

  fields.status = { pass: response.status === 'supported', exactMatch: response.status === 'supported' };
  if (response.status !== 'supported') {
    failures.push({ code: 'exact_mismatch', field: 'status', message: 'status must exactly equal supported' });
  }

  const layout = response.layout;
  const layoutValid = isPlainObject(layout)
    && layout.kind === expect.layoutKind
    && Array.isArray(layout.regions)
    && layout.regions.every(region => isPlainObject(region)
      && Object.keys(region).every(key => key === 'kind' || key === 'title')
      && typeof region.kind === 'string'
      && typeof region.title === 'string');
  const actualRegions = layoutValid ? layout.regions.map(region => region.kind) : [];
  const missingRegions = expect.requiredRegions.filter(region => !actualRegions.includes(region));
  fields.layout = { pass: layoutValid && missingRegions.length === 0, missingRegions };
  if (!layoutValid) {
    failures.push({ code: 'invalid_layout', field: 'layout', message: 'layout must be {kind, regions[]}, with each region shaped as {kind, title}' });
  }
  for (const region of missingRegions) {
    failures.push({ code: 'required_region_missing', field: 'layout', region, message: `Missing required layout region: ${region}` });
  }

  const constraintsValid = Array.isArray(response.constraints) && response.constraints.every(value => typeof value === 'string');
  const missingConstraints = constraintsValid
    ? expect.requiredConstraints.filter(constraint => !response.constraints.includes(constraint))
    : expect.requiredConstraints;
  fields.constraints = { pass: constraintsValid && missingConstraints.length === 0, missingConstraints };
  if (!constraintsValid) {
    failures.push({ code: 'invalid_constraints', field: 'constraints', message: 'constraints must be an array of strings' });
  }
  for (const constraint of missingConstraints) {
    failures.push({ code: 'required_constraint_missing', field: 'constraints', constraint, message: `Missing required constraint: ${constraint}` });
  }

  const evidenceValid = Array.isArray(response.evidence) && response.evidence.every(value => typeof value === 'string');
  const missingEvidence = evidenceValid
    ? expect.requiredEvidence.filter(identifier => !response.evidence.includes(identifier))
    : expect.requiredEvidence;
  fields.evidence = { pass: evidenceValid && missingEvidence.length === 0, missingEvidence };
  if (!evidenceValid) {
    failures.push({ code: 'invalid_evidence', field: 'evidence', message: 'evidence must be an array of entry identifiers' });
  }
  for (const identifier of missingEvidence) {
    failures.push({ code: 'required_evidence_missing', field: 'evidence', identifier, message: `Missing required evidence identifier: ${identifier}` });
  }

  return { pass: failures.length === 0, jsonValid: true, failures, fields };
}

export function buildOllamaRequest(model, prompt) {
  return {
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
  };
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function extractOllamaMetrics(payload) {
  return {
    done: payload.done ?? null,
    doneReason: payload.done_reason ?? null,
    createdAt: payload.created_at ?? null,
    totalDurationNs: payload.total_duration ?? null,
    loadDurationNs: payload.load_duration ?? null,
    promptEvalCount: payload.prompt_eval_count ?? null,
    promptEvalDurationNs: payload.prompt_eval_duration ?? null,
    evalCount: payload.eval_count ?? null,
    evalDurationNs: payload.eval_duration ?? null,
  };
}

export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return 'unknown';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function summarizeSuite(results) {
  const byCase = new Map();

  for (const result of results) {
    const id = result.evaluation.id;
    const current = byCase.get(id) ?? {
      id,
      stratum: result.evaluation.stratum,
      runs: 0,
      passes: 0,
      durations: [],
      failureCategories: new Set(),
    };
    current.runs += 1;
    if (result.score.pass) current.passes += 1;
    if (Number.isFinite(result.timing?.wallClockMs)) current.durations.push(result.timing.wallClockMs);
    if (!result.score.pass) current.failureCategories.add(classifyFailure(result));
    byCase.set(id, current);
  }

  const cases = [...byCase.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => ({
      id: item.id,
      stratum: item.stratum,
      runs: item.runs,
      passes: item.passes,
      passRate: item.runs === 0 ? 0 : item.passes / item.runs,
      medianDurationMs: median(item.durations),
      failureCategories: [...item.failureCategories].sort(),
    }));

  const supported = summarizeStratum(results, 'supported');
  const unsupported = summarizeStratum(results, 'unsupported');
  const weightedScore = (supported.passRate * 0.8) + (unsupported.passRate * 0.2);

  return {
    cases,
    supported,
    unsupported,
    weightedScore,
    pass: supported.passRate >= 0.8 && unsupported.passRate === 1,
  };
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarizeStratum(results, stratum) {
  const matching = results.filter(result => result.evaluation.stratum === stratum);
  const passes = matching.filter(result => result.score.pass).length;
  return {
    runs: matching.length,
    passes,
    passRate: matching.length === 0 ? 0 : passes / matching.length,
  };
}

function classifyFailure(result) {
  const codes = new Set(result.score.failures.map(failure => failure.code));
  if (codes.has('invalid_json') || codes.has('invalid_response_type')) return 'invalid response format';
  if (result.evaluation.stratum === 'unsupported') return 'unsupported invention';
  return 'supported extraction error';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function validateStringArray(value, name) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
}

function rejectUnknownKeys(value, allowedKeys, name) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown ${name} assertion: ${key}`);
  }
}
