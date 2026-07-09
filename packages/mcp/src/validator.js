import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('./spec/dsds.bundled.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);

/**
 * Validates a DSDS document object.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
export function validateDocument(doc) {
  const valid = validate(doc);
  if (valid) return { valid: true };

  const errors = (validate.errors ?? []).map(e => ({
    path: e.instancePath || '(root)',
    message: e.message,
    ...(e.params ? { params: e.params } : {}),
  }));

  return { valid: false, errors };
}

/**
 * Parses a JSON string and validates it.
 * Returns { valid, errors?, parseError? }
 */
export function validateJsonString(jsonString) {
  let doc;
  try {
    doc = JSON.parse(jsonString);
  } catch (err) {
    return { valid: false, parseError: `Invalid JSON: ${err.message}` };
  }
  return validateDocument(doc);
}
