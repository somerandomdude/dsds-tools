import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHandler } from '../../src/tools/validate.js';
import { BUNDLED_VERSION } from '../../src/spec/version.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures');

describe('validateHandler — auto-detects legacy JSON vs real 0.20.0 YAML', () => {
  it('validates a legacy 0.15.2 JSON document', async () => {
    const document = JSON.stringify({
      dsdsVersion: BUNDLED_VERSION,
      entity: { kind: 'component', identifier: 'x', name: 'X' },
    });
    const result = await validateHandler({ document });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Valid DSDS Document');
  });

  it('validates a real 0.20.0 YAML document', async () => {
    const document = readFileSync(resolve(fixturesDir, 'button.dsds.yaml'), 'utf-8');
    const result = await validateHandler({ document });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Valid DSDS 0.20.0 Document');
  });

  it('reports a real 0.20.0 semantic-rule violation with its [DSDS-XX] id', async () => {
    const document = readFileSync(resolve(fixturesDir, 'invalid-0.20.0/DSDS-04-unique-entry-id.yaml'), 'utf-8');
    const result = await validateHandler({ document });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('[DSDS-04]');
  });

  it('reports a genuine parse error once, not as a conflicting dual-format failure', async () => {
    const result = await validateHandler({ document: '{ not valid json ]' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Parse Error');
  });
});
