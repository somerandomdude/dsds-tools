import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildOllamaRequest,
  extractOllamaMetrics,
  formatDuration,
  parseArguments,
  scoreResponse,
  sha256,
  summarizeSuite,
  validateEvaluation,
} from './local-model-evaluation-core.mjs';

const supportedCase = {
  id: 'button-secondary-html',
  stratum: 'supported',
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
  stratum: 'unsupported',
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

const layoutCase = {
  id: 'settings-page-layout',
  stratum: 'supported',
  task: 'Generate a settings page.',
  evidence: [['get', 'settings-page']],
  prompt: 'Return JSON only.',
  expect: {
    contract: 'layout-v1',
    layoutKind: 'settings-page',
    requiredRegions: ['page-header', 'settings-section', 'destructive-section'],
    requiredConstraints: ['single-primary-content-column', 'confirm-destructive-action'],
    requiredEvidence: ['settings-page', 'confirmation-dialog'],
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

  test('validates the structured layout contract and rejects a non-canonical status', () => {
    const response = {
      status: 'supported',
      layout: {
        kind: 'settings-page',
        regions: [
          { kind: 'page-header', title: 'Account settings' },
          { kind: 'settings-section', title: 'Profile' },
          { kind: 'destructive-section', title: 'Delete account' },
        ],
      },
      constraints: ['single-primary-content-column', 'confirm-destructive-action'],
      evidence: ['settings-page', 'confirmation-dialog'],
    };
    assert.equal(scoreResponse(JSON.stringify(response), layoutCase).pass, true);

    response.status = 'success';
    const score = scoreResponse(JSON.stringify(response), layoutCase);
    assert.equal(score.pass, false);
    assert.ok(score.failures.some(failure => failure.code === 'exact_mismatch' && failure.field === 'status'));
  });
});

describe('validateEvaluation', () => {
  test('accepts the supported case schema', () => {
    assert.equal(validateEvaluation(supportedCase), supportedCase);
  });

  test('accepts the layout contract schema', () => {
    assert.equal(validateEvaluation(layoutCase), layoutCase);
  });

  test('rejects an unknown assertion', () => {
    const evaluation = structuredClone(supportedCase);
    evaluation.expect.fields.html.containsAny = ['button'];

    assert.throws(() => validateEvaluation(evaluation), /Unknown .* assertion/);
  });

  test('rejects a missing or unknown stratum', () => {
    const evaluation = structuredClone(supportedCase);
    delete evaluation.stratum;
    assert.throws(() => validateEvaluation(evaluation), /stratum/);

    evaluation.stratum = 'maybe';
    assert.throws(() => validateEvaluation(evaluation), /stratum/);
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

describe('reproducible run metadata', () => {
  test('builds a deterministic loopback Ollama request', () => {
    assert.deepEqual(buildOllamaRequest('qwen2.5-coder:7b', 'evidence'), {
      model: 'qwen2.5-coder:7b',
      stream: false,
      format: 'json',
      keep_alive: '10m',
      options: {
        temperature: 0,
        seed: 42,
        num_ctx: 4096,
      },
      messages: [{ role: 'user', content: 'evidence' }],
    });
  });

  test('creates stable SHA-256 hashes', () => {
    assert.equal(
      sha256('DSDS'),
      'bdc2dcabf1aeb68ae1d509e0fd90256c3f4bac698690f9a6871849ac0986d455',
    );
  });

  test('extracts available Ollama metrics without inventing missing values', () => {
    assert.deepEqual(extractOllamaMetrics({
      done: true,
      total_duration: 12,
      prompt_eval_count: 34,
      eval_count: 56,
    }), {
      done: true,
      doneReason: null,
      createdAt: null,
      totalDurationNs: 12,
      loadDurationNs: null,
      promptEvalCount: 34,
      promptEvalDurationNs: null,
      evalCount: 56,
      evalDurationNs: null,
    });
  });

  test('formats wall-clock durations for the terminal summary', () => {
    assert.equal(formatDuration(345), '345 ms');
    assert.equal(formatDuration(12_345), '12.3 s');
    assert.equal(formatDuration(undefined), 'unknown');
  });
});

describe('summarizeSuite', () => {
  test('reports separate strata and the weighted readiness score', () => {
    const results = [
      fakeResult('supported-a', 'supported', true, 100),
      fakeResult('supported-a', 'supported', false, 300, 'required_literal_missing'),
      fakeResult('unsupported-a', 'unsupported', true, 200),
    ];

    const summary = summarizeSuite(results);

    assert.equal(summary.supported.passRate, 0.5);
    assert.equal(summary.unsupported.passRate, 1);
    assert.ok(Math.abs(summary.weightedScore - 0.6) < Number.EPSILON);
    assert.equal(summary.pass, false);
    assert.equal(summary.cases[0].medianDurationMs, 200);
    assert.deepEqual(summary.cases[0].failureCategories, ['supported extraction error']);
  });

  test('requires every unsupported run to pass', () => {
    const summary = summarizeSuite([
      fakeResult('supported-a', 'supported', true, 100),
      fakeResult('unsupported-a', 'unsupported', false, 100, 'unexpected_field'),
    ]);

    assert.equal(summary.pass, false);
    assert.deepEqual(summary.cases[1].failureCategories, ['unsupported invention']);
  });
});

function fakeResult(id, stratum, pass, wallClockMs, failureCode) {
  return {
    evaluation: { id, stratum },
    timing: { wallClockMs },
    score: {
      pass,
      failures: failureCode ? [{ code: failureCode }] : [],
    },
  };
}
