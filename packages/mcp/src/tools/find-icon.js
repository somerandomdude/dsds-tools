import { findIconsByPurpose } from '../icon-suggest.js';
import { resolveIconGuidance } from '../icon-catalog.js';
import { readSubpathExports } from './check-exports.js';

export const findIconDef = {
  name: 'dsds_find_icon',
  description:
    'Find the icon for a purpose — "resolve", "reply", "settings", "show more" — from the design system\'s icon guidelines. ' +
    'Returns the best matches for each purpose with the subpath to import from, what each icon is for, and when not to use it. ' +
    'Use it before guessing an icon name. Read-only. Reads the docs\' icon asset entry (`kind: dsds.asset`, `assetType: icon`) when one is loaded, else an icon guidelines TSV (ICON_GUIDELINES_PATH).',
  inputSchema: {
    type: 'object',
    properties: {
      purposes: {
        type: 'array',
        items: { type: 'string' },
        description: 'What each icon is for, in plain words, e.g. ["resolve", "reply", "settings", "show more"]. A single string is accepted too.',
      },
    },
    required: ['purposes'],
  },
};

/** Icons for each purpose, limited to the icons the package really ships. */
export function findIconHandler({ purposes }, getExportPaths, getIconConfig = () => ({})) {
  const list = [...new Set((Array.isArray(purposes) ? purposes : [purposes]).filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim()))];
  const { guidelines, iconPackage } = resolveIconGuidance(getIconConfig() ?? {});
  if (!iconPackage || guidelines.size === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'No icon guidance found. Document the icon set as a `dsds.asset` entry with `assetType: icon`, or set ICON_PACKAGE and ICON_GUIDELINES_PATH (an icon guidelines TSV with "Icon name", "Alternative names" and "Purpose" columns).' }],
    };
  }
  if (list.length === 0) {
    return { isError: true, content: [{ type: 'text', text: 'Pass at least one purpose, e.g. `purposes: ["resolve", "settings"]`.' }] };
  }

  // Only icons the package ships. Without a readable exports map, trust the
  // guidelines and say so.
  const pkgPath = getExportPaths?.()?.get(iconPackage);
  const shipped = pkgPath ? readSubpathExports(pkgPath) : null;
  const icons = [...guidelines.keys()].filter((name) => !shipped || shipped.has(`./${name.replace(/Icon$/, '')}`));
  const subpath = (name) => `${iconPackage}/${name.replace(/Icon$/, '')}`;

  const lines = ['## Icons by purpose', ''];
  if (!shipped) lines.push(`> \`${iconPackage}\` has no readable exports map, so these come from the guidelines alone and are not checked against the package.`, '');
  for (const purpose of list) {
    const found = findIconsByPurpose(purpose, icons, guidelines);
    lines.push(`### "${purpose}"`, '');
    if (found.length === 0) {
      lines.push('No icon in the guidelines matches. Try another word for the same intent.', '');
      continue;
    }
    for (const f of found) {
      lines.push(`- **${f.name}** — \`import { ${f.name} } from '${subpath(f.name)}'\`${f.purpose ? `. ${f.purpose.replace(/\.?$/, '.')}` : ''}`);
      if (f.whenNotToUse) lines.push(`  - Not for: ${f.whenNotToUse.replace(/^-\s*/, '').replace(/\s+-\s+/g, ' ')}`);
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
