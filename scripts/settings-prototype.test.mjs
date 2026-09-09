import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ENTITIES, IMPORTS, CSP, validateResponse, validateCompletion } from './settings-prototype-core.mjs';
import { materialize } from './generate-settings-prototype.mjs';
import { startPreview } from './preview-settings-prototype.mjs';

const evidence = Object.fromEntries(ENTITIES.map(id => [id, `The documented ${id} contract. Use \`--ds-space-4\` for spacing.`]));
const input = (id, type = 'text') => `<ds-text-input id="${id}" name="${id}" type="${type}"><span slot="label">${id}</span><span slot="description">Help</span></ds-text-input>`;
const checkbox = id => `<ds-checkbox id="${id}" name="${id}"><span slot="label">${id}</span><span slot="description">Help</span></ds-checkbox>`;
function candidate() {
  return { status: 'ready', evidence_used: ENTITIES.map(entity => ({ entity, quote: `The documented ${entity} contract.` })), gaps: [], files: [
    { path: 'index.html', content: `<!doctype html><html><head><link rel="stylesheet" href="/src/styles/tokens.css"><style>body {padding: var(--ds-space-4)}</style></head><body><h1>Settings</h1>${input('display-name')}${input('email', 'email')}${checkbox('product-updates')}${checkbox('account-activity')}<ds-button id="save">Save</ds-button><ds-button id="cancel" variant="secondary">Cancel</ds-button><p id="status" role="status"></p><script type="module" src="./settings-page.js"></script></body></html>` },
    { path: 'settings-page.js', content: IMPORTS.map(p => `import ${JSON.stringify(p)};`).join('\n') },
  ] };
}
const check = value => validateResponse(JSON.stringify(value), evidence);
test('accepts plain and fenced envelopes; static acceptance does not claim behavior', () => {
  assert.deepEqual(check(candidate()).errors, []);
  assert.deepEqual(validateResponse('```json\n' + JSON.stringify(candidate()) + '\n```', evidence).errors, []);
});
test('rejects malformed JSON and malformed field types without crashing', () => {
  for (const raw of ['no json', '[]', 'null', '{}']) assert.ok(validateResponse(raw, evidence).errors.length);
  for (const value of [null, {}, 3, 'bad']) { const c = candidate(); c.evidence_used = value; assert.ok(check(c).errors.length); }
});
test('abstention never carries files and requires concrete gaps', () => {
  assert.equal(check({ status: 'insufficient_evidence', gaps: ['Missing live state'], files: [] }).abstained, true);
  assert.ok(check({ ...candidate(), status: 'insufficient_evidence', gaps: ['Missing'] }).errors.length);
});
test('rejects traversal, absolute paths, duplicate and missing files', () => {
  for (const path of ['../index.html', '/tmp/index.html', 'src/components/button.js', 'index.html']) {
    const c = candidate(); c.files[1].path = path; assert.ok(check(c).errors.length);
  }
});
test('rejects corrupt JavaScript from the observed Qwen failure', () => {
  const c = candidate(); c.files[1].content += "\ndocument.getElementById('save').addEventListener('cliccanceled.';";
  assert.match(check(c).errors.join('\n'), /JavaScript syntax/);
});
test('rejects invented stylesheets, labels, tokens and component attributes', () => {
  const mutations = [
    h => h.replace('/src/styles/tokens.css', '../../src/components/styles.css'),
    h => h.replaceAll('slot="label"', 'slot="unknown"'),
    h => h.replace('--ds-space-4', '--ds-space-invented'),
    h => h.replace('<ds-button id="save"', '<ds-button invented="true" id="save"'),
    h => h.replaceAll('ds-checkbox', 'ds-toggle'),
  ];
  for (const mutate of mutations) { const c = candidate(); c.files[0].content = mutate(c.files[0].content); assert.ok(check(c).errors.length); }
});
test('rejects unsupported imports, network and shadow access', () => {
  for (const code of ['import "https://example.com/a.js";', 'fetch("/");', 'element.shadowRoot;', 'import("/src/components/button.js");', 'element.innerHTML = "x";']) {
    const c = candidate(); c.files[1].content += '\n' + code; assert.ok(check(c).errors.length);
  }
});
test('requires quotes from the correct entity', () => {
  const c = candidate(); c.evidence_used[0].quote = 'A made up statement'; assert.ok(check(c).errors.length);
});
test('rejects truncated generation even when its JSON is valid', () => {
  const payload = { message: { content: JSON.stringify(candidate()) }, done: true, done_reason: 'length' };
  assert.ok(validateCompletion(payload, evidence).errors.length);
  assert.deepEqual(validateCompletion({ ...payload, done_reason: 'stop' }, evidence).errors, []);
  assert.ok(validateCompletion({ message: payload.message }, evidence).errors.length);
});
test('materialization and preview isolate files from the repo and run report', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsds-prototype-test-'));
  const consumer = join(temp, 'consumer'); const run = join(temp, 'run');
  mkdirSync(join(consumer, 'src'), { recursive: true }); mkdirSync(run);
  writeFileSync(join(consumer, 'src', 'fixture.js'), 'export const value = 1;');
  const c = candidate(); materialize(run, c, consumer);
  assert.equal(existsSync(join(consumer, 'index.html')), false);
  assert.equal(readFileSync(join(run, 'web', 'index.html'), 'utf8'), c.files[0].content);
  assert.throws(() => materialize(run, c, consumer));
  writeFileSync(join(run, 'report.json'), JSON.stringify({ status: 'preview_created' }));
  const server = startPreview(run); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const result = await fetch(url); assert.equal(result.status, 200); assert.equal(result.headers.get('content-security-policy'), CSP);
    assert.equal((await fetch(url + '/report.json')).status, 404);
    assert.equal((await fetch(url + '/src/%2e%2e%2freport.json')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('source symlinks fail instead of copying files outside consumer source', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsds-prototype-link-test-'));
  const consumer = join(temp, 'consumer'); const run = join(temp, 'run');
  mkdirSync(join(consumer, 'src'), { recursive: true }); mkdirSync(run);
  writeFileSync(join(temp, 'secret'), 'test-only'); symlinkSync(join(temp, 'secret'), join(consumer, 'src', 'link'));
  assert.throws(() => materialize(run, candidate(), consumer), /symlinks/);
});
