/**
 * Integrity checks — pure functions, no I/O. The guard (scripts/check-integrity.js)
 * supplies the data; these decide pass/fail. Each returns an array of error strings
 * (empty = pass).
 *
 * Covers the three reference classes from the integrity PRD:
 *   1. every import from the configured icon package (ICON_PACKAGE) resolves to a real export
 *   2. no brief directs agents to an entity kind that returns nothing
 *   3. one spec version across every source
 */

/** Build the `import { … } from '<pkg>'` matcher for a given package name. */
function iconImportBlock(iconPackage) {
  const escaped = iconPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`, 'g');
}

/** Extract the imported names from every `import { … } from '<iconPackage>'`. */
export function extractIconImports(code, iconPackage) {
  const names = new Set();
  if (!iconPackage) return [];
  const re = iconImportBlock(iconPackage);
  let m;
  while ((m = re.exec(code ?? '')) !== null) {
    for (const part of m[1].split(',')) {
      // Strip comments, whitespace, and `as` aliases → the source export name.
      const name = part.replace(/\/\/.*$/gm, '').trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z][A-Za-z0-9]*$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/** Parse exported icon names from the icon package's `dist/index.d.ts` string. */
export function parseIconExports(dts) {
  const set = new Set();
  const re = /(?:export\s+)?declare const\s+([A-Z][A-Za-z0-9]*Icon)\b/g;
  let m;
  while ((m = re.exec(dts ?? '')) !== null) set.add(m[1]);
  return set;
}

/** Flag any icon import in chunk code that is not a real export of the icon package. */
export function checkIconImports(chunks, iconExports, iconPackage) {
  const errors = [];
  for (const { identifier, code } of chunks) {
    for (const name of extractIconImports(code, iconPackage)) {
      if (!iconExports.has(name)) {
        errors.push(`Chunk "${identifier}" imports "${name}" from ${iconPackage}, which is not an export.`);
      }
    }
  }
  return errors;
}

/**
 * Flag directive references (`kind=X`, `kind: "X"`) to an entity kind that has no
 * loaded entities — i.e. an agent told to query a layer that returns nothing.
 * `kindsWithEntities` is a Set of kinds present in the loaded DSDS.
 */
export function checkKindReferences(text, kindsWithEntities) {
  const errors = [];
  const re = /kind\s*[=:]\s*['"`]?([a-z][a-z-]*)['"`]?/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(text ?? '')) !== null) {
    const kind = m[1].toLowerCase();
    if (seen.has(kind)) continue;
    seen.add(kind);
    if (!kindsWithEntities.has(kind)) {
      errors.push(`A brief directs agents to "kind=${kind}", but no loaded entity has that kind — the query returns nothing.`);
    }
  }
  return errors;
}

// ── R4: example code uses only real props ────────────────────────────────────
//
// Docs drift: an example shows `<Tooltip content="…">` while the shipped prop is
// `text`. The MCP then actively teaches a build error. This check extracts JSX
// from every example block and validates each prop used on a *documented*
// component against that component's api-block prop list.

// Props valid on any component: React/DOM globals, event handlers, aria/data
// attributes, and the shared ui-poc prop families (margin, padding, layout,
// tone…) that api blocks do not re-list per component.
const SHARED_PROP_RE = new RegExp(
  '^(' +
  [
    // react/dom globals
    'key', 'ref', 'id', 'className', 'style', 'role', 'tabIndex', 'title', 'hidden',
    'htmlFor', 'href', 'target', 'rel', 'type', 'disabled', 'src', 'alt', 'placeholder',
    'value', 'defaultValue', 'checked', 'defaultChecked', 'name', 'autoFocus', 'draggable',
    'rows', 'cols', 'min', 'max', 'step', 'maxLength', 'lang', 'dir',
    // shared ui-poc families (LayoutProps/MarginProps/ToneProps/TypographyProps)
    'as', 'tone', 'scheme', 'density', 'radius', 'shadow', 'display',
    'margin', 'marginX', 'marginY', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'gap', 'columnGap', 'rowGap',
    'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
    'flexGrow', 'flexShrink', 'flexBasis', 'flexDirection', 'flexWrap',
    'alignItems', 'alignSelf', 'justifyContent',
    'gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow',
    'gridColumn', 'gridRow', 'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd',
    'overflow', 'overflowX', 'overflowY', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'zIndex',
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'size', 'muted', 'weight', 'align', 'lineClamp',
  ].join('|') +
  ')$|^(on[A-Z]|aria-|data-)',
);

/** Collect every example code string from an entity's document blocks. */
export function extractExampleCode(entity) {
  const out = [];
  const visit = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== 'object') return;
    if (node.presentation?.kind === 'code' && typeof node.presentation.code === 'string') {
      out.push(node.presentation.code);
    }
    for (const key of ['body', 'instruction', 'guidance']) {
      const text = node[key];
      if (typeof text !== 'string') continue;
      for (const m of text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) out.push(m[1]);
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(entity?.documentBlocks);
  visit(entity?.agentDocumentBlocks);
  return out;
}

/**
 * Extract [{component, prop}] pairs from JSX opening tags in a code string.
 *
 * Docs teach right-vs-wrong in paired examples: a line marked ✗ (or a comment
 * saying wrong/invalid) shows the API mistake on purpose. Tags that appear
 * while the nearest preceding marker is a "wrong" marker are skipped — only
 * code presented as correct is validated.
 */
export function extractJsxProps(code) {
  const src = code ?? '';
  // Per-line marker state: true = inside an intentional wrong-example region.
  const lines = src.split('\n');
  const wrongAt = [];
  let wrong = false;
  for (const line of lines) {
    if (/✗|✘|⛔|\/\/.*\b(wrong|invalid|not valid|don'?t)\b|\{\/\*.*\b(wrong|invalid|not valid|don'?t)\b/i.test(line)) wrong = true;
    else if (/✓|✔|\/\/.*\b(correct|right|instead|fix)\b|\{\/\*.*\b(correct|right|instead|fix)\b/i.test(line)) wrong = false;
    wrongAt.push(wrong);
  }
  const lineOfIndex = (idx) => src.slice(0, idx).split('\n').length - 1;

  const pairs = [];
  const tagRe = /<([A-Z][A-Za-z0-9.]*)((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    if (wrongAt[lineOfIndex(m.index)]) continue; // intentional wrong example
    const component = m[1];
    // Strip expression containers and quoted strings so their contents can't
    // masquerade as attribute names, then strip spreads.
    const attrs = m[2]
      .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')
      .replace(/"[^"]*"|'[^']*'/g, ' ')
      .replace(/\.\.\./g, ' ');
    for (const a of attrs.matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9-]*)\s*(?==|\s|$)/g)) {
      pairs.push({ component, prop: a[1] });
    }
  }
  return pairs;
}

/**
 * Validate example JSX props against each documented component's api block.
 * `entities` = all loaded entities. Only components documented with an api
 * block are checked; unknown/local components are skipped.
 */
export function checkExampleProps(entities) {
  const errors = [];
  // component display name -> { identifier, props }
  const byName = new Map();
  for (const e of entities ?? []) {
    if (e.kind !== 'component') continue;
    const api = [...(e.documentBlocks ?? []), ...(e.agentDocumentBlocks ?? [])]
      .find((b) => b?.kind === 'api');
    if (!api?.properties?.length) continue;
    const props = new Set(api.properties.map((p) => p.identifier).filter(Boolean));
    if (e.name) byName.set(e.name, { identifier: e.identifier, props });
  }

  for (const e of entities ?? []) {
    for (const code of extractExampleCode(e)) {
      for (const { component, prop } of extractJsxProps(code)) {
        const target = byName.get(component);
        if (!target) continue; // native tag, local component, or undocumented
        if (target.props.has(prop) || SHARED_PROP_RE.test(prop)) continue;
        errors.push(
          `Example in "${e.identifier}" uses <${component} ${prop}=…>, but "${prop}" is not a prop of ` +
          `${component} ("${target.identifier}" api block lists: ${[...target.props].join(', ')}).`,
        );
      }
    }
  }
  return [...new Set(errors)];
}

/** Flag any version source that does not match the bundled spec version. */
export function checkVersions(bundled, sources) {
  const errors = [];
  for (const { label, version } of sources) {
    if (version !== bundled) {
      errors.push(`Version drift: ${label} is "${version}", expected "${bundled}".`);
    }
  }
  return errors;
}

/** Extract spec-version strings from the README (for the version check). */
export function readmeVersions(readme) {
  const out = [];
  const push = (re, label) => { const m = (readme ?? '').match(re); if (m) out.push({ label, version: m[1] }); };
  push(/Bundled spec version:\*\*\s*([0-9][0-9.]*)/, 'README "Bundled spec version"');
  push(/Defaults to `([0-9][0-9.]*)`/, 'README "DSDS_SCHEMA_VERSION default"');
  for (const m of (readme ?? '').matchAll(/designsystemdocspec\.org\/v([0-9][0-9.]*)\//g)) out.push({ label: 'README schema URL', version: m[1] });
  for (const m of (readme ?? '').matchAll(/"dsdsVersion":\s*"([0-9][0-9.]*)"/g)) out.push({ label: 'README dsdsVersion example', version: m[1] });
  return out;
}
