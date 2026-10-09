import { buildTokenIndex, normalizeTokenKey } from '../tokens.js';
import { didYouMean } from '../suggest.js';
import { ERROR_CODES, notFoundError, toolError } from '../errors.js';

export const getTokensDef = {
  name: 'dsds_get_tokens',
  description:
    "Look up design tokens and their values: the pixel size of a spacing step, a radius, a type " +
    'style, a color. Values come from the DTCG token files the documentation references, so they ' +
    'are the values the package ships. Pass `names` for specific tokens (`space-3`, `--radius-2`), ' +
    '`group` for a whole scale (`space`, `radius`, `typography`, `heading`, `blue`), or `query` to ' +
    'search. Call with no arguments to list the groups.',
  inputSchema: {
    type: 'object',
    properties: {
      names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Token names, with or without the CSS `--` prefix: ["space-3", "--radius-2"].',
      },
      group: {
        type: 'string',
        description:
          'A token file (`space`, `radius`, `container`, `shadow`, `typography`, `color`, `font-weight`, ' +
          '`font-family`) or a name prefix (`heading`, `body`, `blue`).',
      },
      query: {
        type: 'string',
        description: 'Case-insensitive text matched at word starts in token names and descriptions.',
      },
    },
  },
};

function cleanName(raw) {
  return String(raw).trim().replace(/^var\(\s*/, '').replace(/\s*\)$/, '').replace(/^--/, '');
}

function inGroup(token, key) {
  const k = normalizeTokenKey(key);
  if (!k) return false;
  if (normalizeTokenKey(token.file) === k) return true;
  if (token.group && normalizeTokenKey(token.group) === k) return true;
  const lower = String(key).toLowerCase();
  return token.name.toLowerCase().startsWith(`${lower}-`) || token.name.toLowerCase().startsWith(`${lower}.`);
}

function escapeCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderTable(tokens) {
  const lines = [];
  const byFile = new Map();
  for (const t of tokens) {
    if (!byFile.has(t.file)) byFile.set(t.file, []);
    byFile.get(t.file).push(t);
  }
  for (const [file, rows] of byFile) {
    const types = [...new Set(rows.map(r => r.type).filter(Boolean))];
    lines.push(`## ${file}.tokens.json${types.length === 1 ? ` — ${types[0]}` : ''}`, '');
    lines.push('| Token | CSS custom property | Value | Use |', '| --- | --- | --- | --- |');
    for (const t of rows) {
      lines.push(
        `| \`${t.name}\` | ${t.cssVar ? `\`${t.cssVar}\`` : '—'} | ${escapeCell(t.display)} | ${escapeCell(t.description ?? '')} |`
      );
    }
    lines.push('');
  }
  return lines;
}

function structured(tokens, extra = {}) {
  return {
    tokens: tokens.map(({ name, type, value, display, cssVar, css, description, entry, group, file, aliasOf, modeValues, toned }) => ({
      name, type, value, display, cssVar, css, description, entry, group, file,
      ...(aliasOf ? { aliasOf } : {}), ...(modeValues ? { modes: modeValues } : {}), ...(toned ? { toned } : {}),
    })),
    ...extra,
  };
}

/** Token names and values, read from the DTCG files the corpus references. */
export function getTokensHandler({ names, group, query } = {}, getSystems) {
  const systems = getSystems();
  if (!systems || systems.length === 0) {
    return toolError({
      code: ERROR_CODES.NOT_CONFIGURED,
      text: 'No DSDS systems loaded. Set the DSDS_PATHS environment variable to point at your .dsds.yaml file(s).',
      message: 'No DSDS systems loaded.',
    });
  }

  const { tokens, files } = buildTokenIndex(systems);
  if (tokens.length === 0) {
    return toolError({
      code: ERROR_CODES.NOT_CONFIGURED,
      text:
        'No token values found. A token entry carries its value by reference: its `source` is a ' +
        '`rel: file` pointer to a DTCG `.tokens.json` file, such as ' +
        '`source: {href: ./dtcg/json/space.tokens.json#space-1, rel: file}`. None of the loaded ' +
        'entries has one that resolves.',
      message: 'No DTCG token files referenced by the loaded documentation.',
    });
  }

  const wantsNames = Array.isArray(names) && names.length > 0;
  if (!wantsNames && !group && !query) {
    const lines = [
      `# Design tokens`,
      '',
      `${tokens.length} tokens in ${files.length} DTCG files. Call again with \`group\`, \`names\` or \`query\` to get values.`,
      '',
      '| Group | Tokens | First … last |',
      '| --- | --- | --- |',
    ];
    for (const f of files) {
      const own = tokens.filter(t => t.path === f.path);
      const span = own.length > 1 ? `\`${own[0].name}\` … \`${own[own.length - 1].name}\`` : `\`${own[0]?.name ?? ''}\``;
      lines.push(`| \`${f.file}\`${f.group && normalizeTokenKey(f.group) !== normalizeTokenKey(f.file) ? ` (${f.group})` : ''} | ${f.count} | ${span} |`);
    }
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: { groups: files.map(({ file, group, count }) => ({ file, group, count })) },
    };
  }

  let selected = tokens;
  const notFound = [];
  if (wantsNames) {
    const byName = new Map(tokens.map(t => [t.name.toLowerCase(), t]));
    selected = [];
    for (const raw of names) {
      const n = cleanName(raw).toLowerCase();
      const hit = byName.get(n) ?? byName.get(n.replace(/\./g, '-')) ?? tokens.find(t => t.entry?.toLowerCase() === n);
      if (hit) {
        if (!selected.includes(hit)) selected.push(hit);
      } else {
        notFound.push(String(raw));
      }
    }
  }
  if (group) selected = selected.filter(t => inGroup(t, group));
  if (query) {
    // Match at a word start, so `card` finds Card's density and not "discard".
    const q = new RegExp(`(^|[^a-z0-9])${String(query).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    selected = selected.filter(t =>
      [t.name, t.cssVar, t.description, t.group, t.file].some(v => v && q.test(String(v).toLowerCase()))
    );
  }

  const allNames = tokens.map(t => t.name);
  if (selected.length === 0) {
    if (wantsNames && notFound.length === names.length && names.length === 1) {
      return notFoundError({ label: 'Token', input: names[0], candidates: allNames, code: ERROR_CODES.UNKNOWN_TOKEN });
    }
    const asked = [
      wantsNames ? `names ${names.map(n => `\`${n}\``).join(', ')}` : null,
      group ? `group \`${group}\`` : null,
      query ? `query \`${query}\`` : null,
    ].filter(Boolean).join(' and ');
    return toolError({
      code: ERROR_CODES.UNKNOWN_TOKEN,
      text: `No tokens match ${asked}. Call dsds_get_tokens with no arguments to list the groups: ${files.map(f => `\`${f.file}\``).join(', ')}.`,
      message: `No tokens match ${asked}.`,
      details: { names, group, query },
    });
  }

  const lines = [`# Design tokens (${selected.length})`, '', ...renderTable(selected)];
  if (notFound.length) {
    lines.push('## Not found', '');
    for (const n of notFound) {
      const near = didYouMean(cleanName(n), allNames, { limit: 3 });
      lines.push(`- \`${n}\`${near.length ? ` — did you mean ${near.map(x => `\`${x}\``).join(', ')}?` : ''}`);
    }
    lines.push('');
  }
  lines.push(
    'Pass a scale step to its prop (`padding={3}`, `radius={2}`, `<Text size={2}>`), not the value. ' +
      'Use the CSS custom property only in custom markup that no component covers.'
  );

  return {
    content: [{ type: 'text', text: lines.join('\n').trimEnd() }],
    structuredContent: structured(selected, notFound.length ? { notFound } : {}),
  };
}
