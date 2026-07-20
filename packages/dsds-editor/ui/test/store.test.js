import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';

test('getState returns the seeded state', () => {
  const store = createStore({ count: 0 });
  assert.deepEqual(store.getState(), { count: 0 });
});

test('setState shallow-merges a patch object', () => {
  const store = createStore({ a: 1, b: 2 });
  store.setState({ b: 3 });
  assert.deepEqual(store.getState(), { a: 1, b: 3 });
});

test('setState accepts an updater function', () => {
  const store = createStore({ count: 1 });
  store.setState((s) => ({ ...s, count: s.count + 1 }));
  assert.equal(store.getState().count, 2);
});

test('subscribers are notified on change', () => {
  const store = createStore({ n: 0 });
  const seen = [];
  store.subscribe((s) => seen.push(s.n));
  store.setState({ n: 1 });
  store.setState({ n: 2 });
  assert.deepEqual(seen, [1, 2]);
});

test('unsubscribe stops notifications', () => {
  const store = createStore({ n: 0 });
  const seen = [];
  const off = store.subscribe((s) => seen.push(s.n));
  store.setState({ n: 1 });
  off();
  store.setState({ n: 2 });
  assert.deepEqual(seen, [1]);
});

test('updater returning identical reference does not notify', () => {
  const store = createStore({ n: 0 });
  let calls = 0;
  store.subscribe(() => calls++);
  store.setState((s) => s); // same reference
  assert.equal(calls, 0);
});
