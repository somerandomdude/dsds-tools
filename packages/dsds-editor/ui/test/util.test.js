import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDate, basename, debounce } from '../src/util.js';

test('formatBytes scales units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

test('formatDate handles zero and valid timestamps', () => {
  assert.equal(formatDate(0), '—');
  assert.equal(formatDate(-1), '—');
  assert.notEqual(formatDate(1_700_000_000_000), '—');
});

test('basename returns final path segment', () => {
  assert.equal(basename('/Users/pj/proj'), 'proj');
  assert.equal(basename('/Users/pj/proj/'), 'proj');
  assert.equal(basename('C:\\work\\ds'), 'ds');
  assert.equal(basename(''), '');
});

test('debounce collapses rapid calls', async () => {
  let calls = 0;
  const fn = debounce(() => calls++, 10);
  fn();
  fn();
  fn();
  assert.equal(calls, 0);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(calls, 1);
});

test('debounce cancel prevents invocation', async () => {
  let calls = 0;
  const fn = debounce(() => calls++, 10);
  fn();
  fn.cancel();
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(calls, 0);
});
