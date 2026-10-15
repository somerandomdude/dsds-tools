import { describe, it, expect } from 'vitest';
import { updateReadmeVersionSource } from '../scripts/update-schema.js';
import { readmeVersions } from '../src/integrity.js';

describe('updateReadmeVersionSource', () => {
  it('updates every README version reference checked by the integrity guard', () => {
    const source = [
      '**Bundled spec version:** 0.15.2',
      'Defaults to `0.15.2`.',
      'https://designsystemdocspec.org/v0.15.2/dsds.bundled.schema.json',
      '"dsdsVersion": "0.15.2"',
    ].join('\n');

    const updated = updateReadmeVersionSource(source, '0.15.2', '0.20.0');

    expect(readmeVersions(updated).every(({ version }) => version === '0.20.0')).toBe(true);
  });
});
