// Shared jsdom environment for component tests. Importing this module (before
// any component module) installs the DOM globals the custom elements rely on.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;

for (const key of [
  'window',
  'document',
  'HTMLElement',
  'customElements',
  'CustomEvent',
  'Event',
  'Node',
]) {
  globalThis[key] = window[key];
}

/** Flush pending microtasks/timers so queued focus + async work settles. */
export function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fire an input event after setting a control's value. */
export function typeInto(control, value) {
  control.value = value;
  control.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Fire a change event after setting a control's value. */
export function changeTo(control, value) {
  control.value = value;
  control.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/** Submit a form, honoring preventDefault. */
export function submit(form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

export { window };
