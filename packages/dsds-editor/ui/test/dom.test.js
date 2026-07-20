import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup.js';
import { el, clear, emit, appendChildren } from '../src/dom.js';

test('el sets class, text, and attributes', () => {
  const node = el('div', { class: 'x', id: 'y', 'data-n': '3' }, 'hello');
  assert.equal(node.className, 'x');
  assert.equal(node.id, 'y');
  assert.equal(node.getAttribute('data-n'), '3');
  assert.equal(node.textContent, 'hello');
});

test('el omits false/null props and boolean-true sets bare attr', () => {
  const node = el('input', { disabled: true, hidden: false, title: null });
  assert.ok(node.hasAttribute('disabled'));
  assert.ok(!node.hasAttribute('hidden'));
  assert.ok(!node.hasAttribute('title'));
});

test('el wires on* event handlers', () => {
  let clicked = 0;
  const node = el('button', { onClick: () => clicked++ });
  node.click();
  assert.equal(clicked, 1);
});

test('el appends nested and node children, skipping nullish', () => {
  const child = el('span', { text: 'c' });
  const node = el('div', {}, ['a', null, false], child, 5);
  assert.equal(node.childNodes.length, 3); // 'a', span, '5'
  assert.ok(node.contains(child));
});

test('clear removes all children', () => {
  const node = el('div', {}, 'a', 'b');
  clear(node);
  assert.equal(node.childNodes.length, 0);
});

test('emit dispatches a bubbling CustomEvent with detail', () => {
  const node = el('div');
  document.body.append(node);
  let detail = null;
  document.body.addEventListener('ping', (e) => (detail = e.detail));
  emit(node, 'ping', { n: 1 });
  assert.deepEqual(detail, { n: 1 });
  node.remove();
});

test('appendChildren flattens deeply', () => {
  const node = el('div');
  appendChildren(node, [['a', ['b', ['c']]]]);
  assert.equal(node.textContent, 'abc');
});
