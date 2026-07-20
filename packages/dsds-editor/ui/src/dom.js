// Tiny DOM construction helper — a stand-in for JSX with zero dependencies.
// `el('div', { class: 'x', onClick: fn }, 'text', childNode)` builds and
// returns a real element. Kept deliberately small and framework-free.

/**
 * Create an element.
 * @param {string} tag
 * @param {Object} [props] - attributes/props. Special keys: `class`, `text`,
 *   `value`, `html`, and any `onEvent` handler (e.g. `onClick`, `onInput`).
 *   Boolean `true` sets a bare attribute; `false`/`null` omits it.
 * @param {...(Node|string|number|false|null|Array)} children
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  appendChildren(node, children);
  return node;
}

/** Append a (possibly nested) list of children, skipping nullish/false. */
export function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

/** Remove all children of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Dispatch a bubbling, composed CustomEvent from `node`. Used by components to
 * signal user intents up to the app shell.
 */
export function emit(node, type, detail) {
  node.dispatchEvent(
    new CustomEvent(type, { detail, bubbles: true, composed: true })
  );
}
