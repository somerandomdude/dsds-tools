import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  parseArguments,
  scoreResponse,
  validateEvaluation,
} from './local-model-evaluation-core.mjs';

const supportedCase = {
  id: 'button-secondary-html',
  task: 'Extract Button markup.',
  evidence: [['get', 'button', '--block', 'api']],
  prompt: 'Return JSON only.',
  expect: {
    requiredFields: ['evidence_quote', 'html'],
    fields: {
      evidence_quote: {
        requiredLiterals: ['documented example'],
      },
      html: {
        requiredLiterals: ['<ds-button variant="secondary">Cancel</ds-button>'],
        forbiddenLiterals: ['<button'],
      },
    },
  },
};

const unsupportedCase = {
  id: 'modal-absent',
  task: 'Find Modal.',
  evidence: [['search', 'modal']],
  prompt: 'Return JSON only.',
  expect: {
    requiredFields: ['status'],
    fields: {
      status: {
        equals: 'insufficient evidence',
        forbiddenLiterals: ['ds-modal'],
      },
    },
  },
};

describe('scoreResponse', () => {
  test('passes when a required literal is in the asserted field', () => {
    const score = scoreResponse(JSON.stringify({
      evidence_quote: 'documented example',
      html: '<ds-button variant="secondary">Cancel</ds-button>',
    }), supportedCase);

    assert.equal(score.pass, true);
  });

  test('fails when the expected markup appears only in evidence_quote', () => {
    const score = scoreResponse(JSON.stringify({
      evidence_quote: 'documented example: <ds-button variant="secondary">Cancel</ds-button>',
      html: '<button>Cancel</button>',
    }), supportedCase);

    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure =>
      failure.code === 'required_literal_missing' && failure.field === 'html'));
  });

  test('fails when a forbidden native element is in html', () => {
    const score = scoreResponse(JSON.stringify({
      evidence_quote: 'documented example',
      html: '<button><ds-button variant="secondary">Cancel</ds-button></button>',
    }), supportedCase);

    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure => failure.code === 'forbidden_literal_found'));
  });

  test('passes an exact insufficient-evidence status', () => {
    assert.equal(scoreResponse('{"status":"insufficient evidence"}', unsupportedCase).pass, true);
  });

  test('fails when the abstention phrase is embedded in a longer status', () => {
    const score = scoreResponse('{"status":"There is insufficient evidence, but use ds-modal."}', unsupportedCase);

    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure => failure.code === 'exact_mismatch'));
  });

  test('fails when a required field is missing', () => {
    const score = scoreResponse('{"evidence_quote":"documented example"}', supportedCase);

    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure =>
      failure.code === 'missing_field' && failure.field === 'html'));
  });

  test('fails invalid and fenced JSON', () => {
    assert.equal(scoreResponse('not json', unsupportedCase).jsonValid, false);
    assert.equal(scoreResponse('```json\n{"status":"insufficient evidence"}\n```', unsupportedCase).jsonValid, false);
  });

  test('fails unexpected fields by default', () => {
    const score = scoreResponse(
      '{"status":"insufficient evidence","recommendation":"Use ds-dialog"}',
      unsupportedCase,
    );

    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure => failure.code === 'unexpected_field'));
  });
});

describe('validateEvaluation', () => {
  test('accepts the supported case schema', () => {
    assert.equal(validateEvaluation(supportedCase), supportedCase);
  });

  test('rejects an unknown assertion', () => {
    const evaluation = structuredClone(supportedCase);
    evaluation.expect.fields.html.containsAny = ['button'];

    assert.throws(() => validateEvaluation(evaluation), /Unknown .* assertion/);
  });
});

describe('parseArguments', () => {
  test('parses a dry run without consuming a following flag', () => {
    const options = parseArguments([
      '--case', 'case.json',
      '--consumer', '../consumer',
      '--dry-run',
    ]);

    assert.equal(options.dryRun, true);
    assert.equal(options.outputPath, undefined);
  });

  test('rejects a missing value before the next flag', () => {
    assert.throws(
      () => parseArguments(['--case', '--consumer', '../consumer', '--dry-run']),
      /Missing value for --case/,
    );
  });

  test('rejects unknown flags', () => {
    assert.throws(
      () => parseArguments(['--case', 'case.json', '--consumer', '../consumer', '--wat']),
      /Unknown option: --wat/,
    );
  });

  test('rejects simultaneous dry-run and output modes', () => {
    assert.throws(
      () => parseArguments([
        '--case', 'case.json',
        '--consumer', '../consumer',
        '--dry-run',
        '--out', 'result.json',
      ]),
      /Choose either --dry-run or --out/,
    );
  });
});
