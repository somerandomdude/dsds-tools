// Small pure formatting/utility helpers, kept DOM-free for easy testing.

/** Format a byte count as a short human-readable string. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format an epoch-milliseconds timestamp as a locale date-time string.
 * Returns an em dash for falsy/zero timestamps.
 */
export function formatDate(millis) {
  const n = Number(millis) || 0;
  if (n <= 0) return '—';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

/** Last path segment of a filesystem path (handles / and \\). */
export function basename(path) {
  if (!path) return '';
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Debounce `fn` by `wait` ms. Returns a function with a `.cancel()` method. */
export function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
