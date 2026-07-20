// A minimal reactive store — the entire state-management layer for the app.
// No framework: just an immutable-ish state object, shallow-merge updates, and
// synchronous subscriber notification. This keeps data-binding explicit and
// fully testable without a DOM.

/**
 * Create a store seeded with `initial` state.
 *
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = { ...initial };
  const subscribers = new Set();

  /** Current state snapshot. */
  function getState() {
    return state;
  }

  /**
   * Update state. Accepts either a partial object (shallow-merged) or an
   * updater function returning the next full state. Notifies subscribers only
   * when the reference actually changes.
   */
  function setState(patch) {
    const next =
      typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    if (next === state) return;
    state = next;
    for (const fn of subscribers) fn(state);
  }

  /**
   * Register a subscriber, invoked on every change. Returns an unsubscribe
   * function.
   */
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { getState, setState, subscribe };
}
