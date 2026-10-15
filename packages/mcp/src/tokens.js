// Token index — the values behind a corpus's token entries.
//
// DSDS never stores a token's value in the documentation. A token entry's
// `source` points at the DTCG file that holds it (`./dtcg/json/space.tokens.json#space-1`),
// and a group entry points at the whole file. This module follows those
// pointers, reads the files, and joins each value to the entry that
// documents it. The corpus stays the only list of token files: nothing here
// is configured separately, so a file the docs stop referencing stops being
// served.
//
// CSS custom property names are read, not derived. When a `css/` directory
// sits beside the JSON (the `dist/json` + `dist/css` layout the token
// packages publish), each token is matched to the property the CSS actually
// declares. Guessing `--${name}` would be right today and silently wrong the
// next time a package renames one (`--shadow0` became `--shadow-0`).

import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const TOKEN_FILE = /\.tokens\.json$/;

// Parsed files, keyed by absolute path and invalidated on mtime, so a
// long-lived server sees an edited token file without a restart.
const fileCache = new Map();

function readCached(absPath, parse) {
  let mtimeMs;
  try {
    mtimeMs = statSync(absPath).mtimeMs;
  } catch {
    return null;
  }
  const hit = fileCache.get(absPath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.data;
  let data = null;
  try {
    data = parse(readFileSync(absPath, 'utf-8'));
  } catch {
    data = null;
  }
  fileCache.set(absPath, { mtimeMs, data });
  return data;
}

function splitHref(href) {
  const i = href.indexOf('#');
  return i < 0 ? [href, null] : [href.slice(0, i), href.slice(i + 1)];
}

/**
 * Every pointer on an entry that names a DTCG token file. Since 0.22.0 that's
 * a token's or theme's `source` field (a path, or `{href}`, with no `rel`), or
 * a `rel: source` ref on any other entry. `rel: file` and `related` are still
 * read, for a document that predates 0.22.0.
 */
function tokenFileRefs(entity) {
  const asRef = (r) => (typeof r === 'string' ? { href: r } : r);
  const source = (Array.isArray(entity.source) ? entity.source : [entity.source]).map(asRef);
  const isTokenFile = (r) => r && typeof r.href === 'string' && TOKEN_FILE.test(splitHref(r.href)[0]);
  return [
    ...source.filter(isTokenFile),
    ...[...(entity.refs ?? []), ...(entity.related ?? [])].filter((r) => (r?.rel === 'source' || r?.rel === 'file') && isTokenFile(r)),
  ];
}

/**
 * Flatten a DTCG document into tokens. A token is any object with `$value`;
 * everything else is a group. `$type` inherits down from the nearest group
 * that sets it, as the DTCG format specifies.
 */
function flattenDtcg(node, path = [], inheritedType = null, out = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return out;
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    out.push({ path, type, value: node.$value, description: node.$description ?? null, extensions: node.$extensions ?? null });
    return out;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    flattenDtcg(child, [...path, key], type, out);
  }
  return out;
}

/** `--name: value;` declarations in every CSS file beside a JSON file. */
function cssDeclarations(jsonPath) {
  const decls = new Map();
  const dir = dirname(jsonPath);
  for (const cssDir of [join(dir, '..', 'css'), dir]) {
    if (!existsSync(cssDir)) continue;
    let files = [];
    try {
      files = readdirSync(cssDir).filter(f => f.endsWith('.css'));
    } catch {
      continue;
    }
    for (const f of files) {
      const text = readCached(join(cssDir, f), t => t) ?? '';
      for (const m of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
        if (!decls.has(m[1])) decls.set(m[1], m[2].trim());
      }
    }
  }
  return decls;
}

// ── Value display ──────────────────────────────────────────────────────────

function dimension(v) {
  if (v && typeof v === 'object' && 'value' in v) return `${v.value}${v.unit ?? ''}`;
  return String(v);
}

function color(c) {
  if (typeof c === 'string') return c;
  if (!c || typeof c !== 'object') return String(c);
  const hex = c.hex ?? (Array.isArray(c.components)
    ? `#${c.components.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
    : null);
  const alpha = c.alpha ?? 1;
  return alpha < 1 ? `${hex} at ${Math.round(alpha * 1000) / 10}% opacity` : hex;
}

function firstFace(family) {
  const list = Array.isArray(family) ? family : String(family).split(',');
  const first = String(list[0] ?? '').trim();
  return list.length > 1 ? `${first}, …` : first;
}

/** A one-line reading of a DTCG value, by type. */
export function formatTokenValue(type, value) {
  if (typeof value === 'string') return value;
  switch (type) {
    case 'dimension':
    case 'duration':
      return dimension(value);
    case 'color':
      return color(value);
    case 'fontFamily':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'fontWeight':
    case 'number':
      return String(value);
    case 'typography': {
      const parts = [`${dimension(value.fontSize)} / ${value.lineHeight}`, `weight ${value.fontWeight}`];
      const ls = value.letterSpacing;
      if (ls && (typeof ls !== 'object' || ls.value !== 0)) parts.push(`letter spacing ${dimension(ls)}`);
      if (value.fontFamily) parts.push(firstFace(value.fontFamily));
      return parts.join(' · ');
    }
    case 'shadow': {
      const layers = Array.isArray(value) ? value : [value];
      return layers
        .map(l => [l.offsetX, l.offsetY, l.blur, l.spread].map(dimension).join(' ') + ` ${color(l.color)}`)
        .join(', ');
    }
    default:
      return JSON.stringify(value);
  }
}

// ── The index ──────────────────────────────────────────────────────────────

/**
 * Every token the loaded corpus references, with its value and the entry
 * that documents it.
 *
 * @param {Array} systems - loaded DSDS systems
 * @returns {{tokens: Array<object>, files: Array<{path: string, file: string, group: string|null, count: number}>}}
 */
export function buildTokenIndex(systems) {
  // absolute file → { group entity, token entities by pointer }
  const files = new Map();
  for (const system of systems ?? []) {
    for (const entity of system.entities ?? []) {
      if (!entity.__filePath) continue;
      for (const ref of tokenFileRefs(entity)) {
        const [rel, pointer] = splitHref(ref.href);
        const abs = resolve(dirname(entity.__filePath), rel);
        if (!files.has(abs)) files.set(abs, { groupEntity: null, byPointer: new Map() });
        const slot = files.get(abs);
        // `#space-1` (a DTCG reference path) and `#/space-1` (a JSON Pointer)
        // name the same token.
        if (pointer) slot.byPointer.set(pointer.replace(/^\//, '').replace(/\//g, '.'), entity);
        else slot.groupEntity ??= entity;
      }
    }
  }

  const tokens = [];
  const fileList = [];
  for (const [abs, slot] of files) {
    const doc = readCached(abs, JSON.parse);
    if (!doc) continue;
    const css = cssDeclarations(abs);
    const stem = basename(abs).replace(TOKEN_FILE, '');
    const group = slot.groupEntity?.metadata?.group ?? slot.groupEntity?.identifier ?? null;
    const flat = flattenDtcg(doc);
    for (const t of flat) {
      const dotted = t.path.join('.');
      const dashed = t.path.join('-');
      // A flat file keys tokens by their full name; a nested one by path.
      const name = t.path.length === 1 ? t.path[0] : dotted;
      const entry = slot.byPointer.get(dotted) ?? slot.byPointer.get(name) ?? null;
      const cssVar = [`--${name}`, `--${dashed}`].find(v => css.has(v)) ?? null;
      tokens.push({
        name,
        type: t.type,
        value: t.value,
        display: formatTokenValue(t.type, t.value),
        cssVar,
        css: cssVar ? css.get(cssVar) : null,
        description: entry?.description ?? t.description ?? null,
        entry: entry?.identifier ?? null,
        // DTCG has no modes of its own; a token file can carry a dark value
        // (or any other mode) in an extension. Any namespace's `modes` counts.
        modes: Object.values(t.extensions ?? {}).find(x => x && typeof x === 'object' && x.modes)?.modes ?? null,
        toned: Object.values(t.extensions ?? {}).find(x => x && typeof x === 'object' && x.toned)?.toned ?? null,
        entryKind: entry?.kind ?? null,
        group: entry?.metadata?.group ?? group,
        file: stem,
        path: abs,
      });
    }
    fileList.push({ path: abs, file: stem, group, count: flat.length });
  }

  resolveAliases(tokens);
  return { tokens, files: fileList };
}

/** Replace `{group.token}` alias values with the value they point at. */
function resolveAliases(tokens) {
  const byName = new Map();
  for (const t of tokens) {
    byName.set(t.name, t);
    byName.set(t.name.replace(/\./g, '-'), t);
  }
  const target = v => (typeof v === 'string' ? /^\{([^}]+)\}$/.exec(v)?.[1] : null);
  for (const t of tokens) {
    let ref = target(t.value);
    if (!ref) continue;
    const seen = new Set([t.name]);
    let hit = null;
    while (ref && !seen.has(ref)) {
      seen.add(ref);
      hit = byName.get(ref) ?? byName.get(ref.replace(/\./g, '-')) ?? null;
      ref = hit ? target(hit.value) : null;
    }
    if (hit && !target(hit.value)) {
      t.aliasOf = hit.name;
      t.type ??= hit.type;
      t.value = hit.value;
      t.display = `${formatTokenValue(hit.type, hit.value)} (alias of \`${hit.name}\`)`;
    }
  }

  // A token with modes reads as each value in turn: "#eeeef1 (`gray-100`)
  // light · #2d2f38 (`gray-900`) dark".
  const resolveOne = v => {
    const name = target(v);
    if (!name) return null;
    const hit = byName.get(name) ?? byName.get(name.replace(/\./g, '-'));
    return hit ? { hit, text: `${formatTokenValue(hit.type, hit.value)} (\`${hit.name}\`)` } : null;
  };
  for (const t of tokens) {
    if (!t.modes) continue;
    const light = t.aliasOf ? `${formatTokenValue(t.type, t.value)} (\`${t.aliasOf}\`)` : t.display;
    const parts = [`${light} light`];
    for (const [mode, v] of Object.entries(t.modes)) {
      const r = resolveOne(v);
      parts.push(`${r ? r.text : formatTokenValue(t.type, v)} ${mode}`);
    }
    t.display = parts.join(' · ');
    t.modeValues = Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, resolveOne(v)?.hit.value ?? v]));
  }
}

/** Lower-case with separators removed, so `font-weight` matches `fontWeight`. */
export function normalizeTokenKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
