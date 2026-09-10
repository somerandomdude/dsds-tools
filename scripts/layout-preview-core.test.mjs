import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderLayoutPreview } from './layout-preview-core.mjs';

test('renders a semantic settings-page preview from a passing layout', () => {
  const html = renderLayoutPreview({ score: { pass: true }, response: JSON.stringify({ status: 'supported', layout: { kind: 'settings-page', regions: [{ kind: 'page-header', title: 'Account settings' }, { kind: 'settings-section', title: 'Profile' }, { kind: 'destructive-section', title: 'Delete account' }] } }) });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /data-dsds-region="settings-section"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /href="\/docs-site\/tokens.css"/);
});

test('refuses a failed evaluation result', () => {
  assert.throws(() => renderLayoutPreview({ score: { pass: false } }), /passing evaluation/);
});
