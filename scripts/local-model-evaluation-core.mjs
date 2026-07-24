import { createHash } from 'node:crypto';

const VALUE_FLAGS = new Set(['--case', '--consumer', '--model', '--out']);
const BOOLEAN_FLAGS = new Set(['--dry-run', '--force']);

export const HARNESS_VERSION = 2;
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

  const allowedExpectKeys = new Set(['requiredFields', 'fields', 'allowAdditionalFields']);
  rejectUnknownKeys(expect, allowedExpectKeys, 'expect');

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
