import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suggestIcons } from '../icon-suggest.js';
import { resolveIconGuidance } from '../icon-catalog.js';

export const checkExportsDef = {
  name: 'dsds_check_exports',
  description:
    'Check whether specific components or exports actually exist in a configured package. Use this before importing a component — catches cases where docs describe a component that the package has not yet shipped. ' +
    'Icons are checked too: pass an icon name (`CogIcon`) to get the subpath to import it from, or a subpath import specifier (`@sanity/icons/Cog`) to confirm it exists. ' +
    'Read-only: returns which names exist; does NOT modify packages, install anything, or write files. Requires PACKAGE_EXPORT_PATHS to be configured.',
  inputSchema: {
    type: 'object',
    properties: {
      components: {
        type: 'array',
        items: { type: 'string' },
        description: 'Component, export or icon names, or subpath import specifiers, e.g. ["Box", "TextInput", "CogIcon", "@sanity/icons/Cog"].',
      },
    },
    required: ['components'],
  },
};

/** Report which of the named components the configured packages actually export. */
export function checkExportsHandler({ components }, getExportPaths, getIconConfig = () => ({})) {
  // An agent sometimes sends the same name twice; answer it once.
  components = [...new Set(components)];
  // Icon guidance comes from the docs' icon asset entry when one is loaded,
  // else from the TSV; resolved lazily, only if an icon needs suggestions.
  const iconConfig = getIconConfig() ?? {};
  const iconPackage = iconConfig.iconPackage ?? null;
  const loadGuidance = () => resolveIconGuidance(iconConfig).guidelines;
  const packagePaths = getExportPaths();

  if (packagePaths.size === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: [
          'No packages configured for export checking.',
          '',
          'Set PACKAGE_EXPORT_PATHS in your MCP config:',
          '  PACKAGE_EXPORT_PATHS=@your-org/ui=/path/to/your-ui/packages/ui',
          '',
          'Multiple packages (comma-separated):',
          '  PACKAGE_EXPORT_PATHS=@your-org/ui=/path/to/your-ui/packages/ui,@your-org/icons=/path/to/your-icons',
        ].join('\n'),
      }],
    };
  }

  const packageExports = new Map();
  const packageErrors = [];

  for (const [pkgName, pkgPath] of packagePaths) {
    try {
      packageExports.set(pkgName, readPackageExports(pkgPath));
    } catch (err) {
      packageErrors.push(`${pkgName}: ${err.message}`);
    }
  }

  if (packageExports.size === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to read any package exports:\n${packageErrors.join('\n')}` }],
    };
  }

  const lines = ['## Export check', ''];

  // Every icon the icon package really has. @sanity/icons keeps each name at
  // its root typed `never`, so the deprecated-to-never set is the full list.
  const iconExports = iconPackage ? packageExports.get(iconPackage) : null;
  const allIcons = iconExports
    ? [...new Set([...iconExports.deprecated.keys(), ...[...iconExports.names].filter((n) => /Icon$/.test(n))])]
    : [];
  const iconSubpath = (name) => `${iconPackage}/${name.replace(/Icon$/, '')}`;
  let iconGuidelines = null;
  const iconLines = [];

  const subpaths = new Map(); // pkgName → Set of subpaths, or null when it has no exports map
  const subpathsOf = (pkgName) => {
    if (!subpaths.has(pkgName)) subpaths.set(pkgName, readSubpathExports(packagePaths.get(pkgName)));
    return subpaths.get(pkgName);
  };

  for (const name of components) {
    // A subpath import specifier, e.g. `@sanity/icons/Cog`. Agents could not
    // check these before (2026-10-07: "dsds_check_exports only checks the
    // package root, so subpath icon names could not be verified").
    const pkgName = [...packagePaths.keys()]
      .filter((p) => name.startsWith(`${p}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (pkgName) {
      const rest = name.slice(pkgName.length + 1);
      const known = subpathsOf(pkgName);
      const isIconPkg = pkgName === iconPackage;
      if (known === null) {
        lines.push(`? **${name}** — \`${pkgName}\` has no \`exports\` map in its package.json, so its subpaths cannot be checked.`);
      } else if (known.has(`./${rest}`)) {
        lines.push(`✓ **${name}** — subpath exists${isIconPkg ? `; it exports \`${rest}Icon\`` : ''}`);
      } else if (isIconPkg && allIcons.length) {
        iconGuidelines ??= loadGuidance();
        const suggestions = suggestIcons(`${rest}Icon`, allIcons, iconGuidelines);
        const hint = suggestions.length
          ? ` Did you mean ${suggestions.map((s) => `\`${iconSubpath(s.name)}\``).join('; ')}?`
          : ' No close match — check the icon guidelines for the icon that fits the purpose.';
        lines.push(`✗ **${name}** — no such subpath in \`${pkgName}\`.${hint}`);
      } else {
        lines.push(`✗ **${name}** — no such subpath in \`${pkgName}\``);
      }
      continue;
    }

    const found = [];
    const deprecated = []; // { pkgName, note }
    const notFound = [];
    for (const [pkgName, exports] of packageExports) {
      if (!exports.names.has(name)) {
        notFound.push(pkgName);
      } else if (exports.deprecated.has(name)) {
        deprecated.push({ pkgName, note: exports.deprecated.get(name) });
      } else {
        found.push(pkgName);
      }
    }

    // A real icon: say where to import it from. It used to be reported as a
    // warning ("deprecated to `never`; will not compile"), which agents read as
    // the icon being broken — 23 feedback items across 13 runs.
    const iconAtRoot = iconPackage && deprecated.find((d) => d.pkgName === iconPackage);
    if (found.length === 0 && iconAtRoot) {
      // The subpath is derived from the name, so confirm the package really
      // ships it. A package with no exports map cannot be checked; say nothing.
      const known = subpathsOf(iconPackage);
      const sub = `./${name.replace(/Icon$/, '')}`;
      if (known && !known.has(sub)) {
        lines.push(`✗ **${name}** — listed at the \`${iconPackage}\` root, but \`${iconSubpath(name)}\` does not exist`);
        continue;
      }
      iconLines.push(name);
      lines.push(`✓ **${name}** — import from \`${iconSubpath(name)}\``);
      continue;
    }

    if (found.length > 0) {
      lines.push(`✓ **${name}** — exported from ${found.map(p => `\`${p}\``).join(', ')}`);
    } else if (deprecated.length > 0) {
      for (const { pkgName, note } of deprecated) {
        lines.push(`⚠ **${name}** — present in \`${pkgName}\`'s types but deprecated to \`never\`; importing it will not compile. ${note}`);
      }
    } else if (allIcons.length && /Icon$/.test(name)) {
      iconGuidelines ??= loadGuidance();
      const suggestions = suggestIcons(name, allIcons, iconGuidelines);
      const hint = suggestions.length
        ? ` Did you mean ${suggestions
            .map((s) => `\`${s.name}\`${s.purpose ? ` (${s.purpose.replace(/\.$/, '')})` : ''} — \`${iconSubpath(s.name)}\``)
            .join('; ')}?`
        : ' No close match — check the icon guidelines for the icon that fits the purpose.';
      lines.push(`✗ **${name}** — not an icon in \`${iconPackage}\`.${hint}`);
    } else {
      lines.push(`✗ **${name}** — not found in ${notFound.map(p => `\`${p}\``).join(', ')}`);
    }
  }

  if (iconLines.length) {
    lines.splice(2, 0,
      `> Each icon is imported from its own subpath, e.g. \`import { ${iconLines[0]} } from '${iconSubpath(iconLines[0])}'\`. ` +
      `The \`${iconPackage}\` root still lists every icon name, typed \`never\`, so a root import does not compile.`,
      '');
  }

  if (packageErrors.length > 0) {
    lines.push('', '### Package read errors', '');
    for (const e of packageErrors) lines.push(`- ${e}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

/**
 * The subpaths a package's `exports` map declares (`./Cog`, …), or null when
 * it has no map. Never throws: an unreadable package.json reads as no map.
 */
export function readSubpathExports(pkgPath) {
  try {
    const { exports } = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
    if (!exports || typeof exports !== 'object') return null;
    return new Set(Object.keys(exports).filter((k) => k.startsWith('./')));
  } catch {
    return null;
  }
}

function readPackageExports(pkgPath) {
  // Try dist/index.d.ts first — the built declaration file has all exports flattened
  try {
    const dts = readFileSync(join(pkgPath, 'dist/index.d.ts'), 'utf8');
    return { names: parseDts(dts), deprecated: findDeprecatedNeverExports(dts) };
  } catch {
    // fall through
  }

  // Fall back to src/index.ts — follow export * from lines
  const src = readFileSync(join(pkgPath, 'src/index.ts'), 'utf8');
  return { names: parseSrcIndex(src, pkgPath), deprecated: findDeprecatedNeverExports(src) };
}

/**
 * Finds names that are still listed in an `export { ... }` block for
 * discoverability, but are typed `never` behind an `@deprecated` JSDoc tag —
 * a real pattern in @sanity/icons v5, which kept every pre-v5 icon name
 * exported from the root entry (so search/autocomplete still finds it) while
 * making it uncompilable, to point authors at the real per-icon subpath.
 * A plain "is this name exported" check reports these as present, which is
 * technically true and practically wrong: the name resolves to `never` and
 * fails to compile the moment it's used as a value or JSX component.
 *
 * Returns Map<name, guidance> where guidance is the @deprecated tag's text
 * (which for @sanity/icons already names the correct replacement import).
 */
function findDeprecatedNeverExports(content) {
  const deprecated = new Map();
  for (const m of content.matchAll(/\/\*\*([\s\S]*?)\*\/\s*\n\s*declare const (\w+)\s*:\s*never\s*;/g)) {
    const [, comment, name] = m;
    const deprecatedMatch = comment.match(/@deprecated\s+([\s\S]*)/);
    if (!deprecatedMatch) continue;
    const note = deprecatedMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    deprecated.set(name, note);
  }
  return deprecated;
}

/**
 * Extract named exports from a compiled .d.ts file.
 *
 * Handles:
 *   export declare function Foo
 *   export declare class Foo
 *   export declare const Foo
 *   export declare type Foo / interface Foo / enum Foo
 *   export { Foo_2 as Foo, Bar }
 *   export declare const List: typeof ListRoot  (compound: List.Item, List.ItemText, …)
 */
function parseDts(content) {
  const names = new Set();

  for (const m of content.matchAll(/^export declare (?:function|class|const|type|interface|enum)\s+(\w+)/gm)) {
    names.add(m[1]);
  }

  for (const m of content.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === 'default') continue;
      // "Foo_2 as Foo" → take the alias; bare "Foo" → take as-is
      const asMatch = trimmed.match(/\bas\s+(\w+)$/);
      if (asMatch) {
        names.add(asMatch[1]);
      } else {
        const nameMatch = trimmed.match(/^(\w+)/);
        if (nameMatch) names.add(nameMatch[1]);
      }
    }
  }

  // Compound component support (Foo.Bar pattern).
  //
  // TypeScript namespace merging produces:
  //   declare namespace ListRoot { var Item: ...; var ItemText: ... }
  //   export declare const List: typeof ListRoot
  //
  // Build a map of namespace name → capitalized member names, then for each
  // export aliasing a namespace via `typeof`, emit Foo.Bar entries.

  const namespaceMembers = new Map();
  for (const m of content.matchAll(/^declare namespace (\w+)\s*\{([^}]+)\}/gms)) {
    const members = [];
    for (const varMatch of m[2].matchAll(/\bvar\s+(\w+)/g)) {
      if (/^[A-Z]/.test(varMatch[1])) members.push(varMatch[1]);
    }
    if (members.length > 0) namespaceMembers.set(m[1], members);
  }

  for (const m of content.matchAll(/^export declare const (\w+):\s*typeof\s+(\w+)/gm)) {
    const members = namespaceMembers.get(m[2]);
    if (members) {
      for (const member of members) names.add(`${m[1]}.${member}`);
    }
  }

  // Also handle directly-exported namespaces:
  //   export declare namespace Foo { var Bar: ... }
  for (const m of content.matchAll(/^export declare namespace (\w+)\s*\{([^}]+)\}/gms)) {
    for (const varMatch of m[2].matchAll(/\bvar\s+(\w+)/g)) {
      if (/^[A-Z]/.test(varMatch[1])) names.add(`${m[1]}.${varMatch[1]}`);
    }
  }

  return names;
}

/**
 * Extract named exports from a TypeScript barrel file (src/index.ts).
 * Follows export * from './...' lines and reads each module for its exports.
 */
function parseSrcIndex(content, basePath) {
  const names = new Set();
  const srcBase = join(basePath, 'src');

  for (const m of content.matchAll(/^export \* from ['"](\.[^'"]+)['"]/gm)) {
    const relPath = m[1];
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      try {
        const fileContent = readFileSync(join(srcBase, relPath + ext), 'utf8');
        for (const em of fileContent.matchAll(/^export (?:function|class|const|type|interface|enum)\s+(\w+)/gm)) {
          names.add(em[1]);
        }
        break;
      } catch {
        // try next extension
      }
    }
  }

  return names;
}
