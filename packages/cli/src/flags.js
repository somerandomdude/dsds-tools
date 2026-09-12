import { didYouMean } from 'dsds-mcp/src/suggest.js';

// Bridge between a tool's JSON Schema and command-line flags.
//
// Flat scalar properties (string, number, integer, boolean) become flags named
// exactly after the schema property (`--identifier`, `--useCase`). Arrays and
// objects arrive through --args / --args-file as JSON. Flag values win over
// keys in --args.

export const BASE_OPTIONS = {
  args: { type: 'string' },
  'args-file': { type: 'string' },
  config: { type: 'string' },
  json: { type: 'boolean' },
  quiet: { type: 'boolean' },
  'no-log': { type: 'boolean' },
  format: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

/**
 * Turn a node:util parseArgs failure into something actionable.
 *
 * Its own text for an unrecognized flag explains how to pass a positional
 * argument that starts with a dash — advice for a different problem, with no
 * mention of what the valid flags are or which one you probably meant.
 *
 * @param {Error} err - the error parseArgs threw
 * @param {object} options - the parseArgs options that were in effect
 * @returns {string}
 */
export function explainParseError(err, options = {}) {
  const unknown = /Unknown option '(-{1,2}[^']+)'/.exec(err.message)?.[1];
  if (!unknown) return err.message;

  const bare = unknown.replace(/^-+/, '').split('=')[0];
  const known = Object.keys(options);
  const suggestions = didYouMean(bare, known);

  const lines = [`Unknown option \`${unknown}\`.`];
  if (suggestions.length > 0) {
    lines.push(`Did you mean ${suggestions.map(s => `\`--${s}\``).join(' or ')}?`);
  }
  if (known.length > 0) {
    lines.push(`Available: ${known.map(k => `--${k}`).join(', ')}`);
  }
  return lines.join('\n');
}

// parseArgs options for one tool: the base flags plus one flag per flat scalar
// schema property. Returns flagProps mapping flag name → schema type so values
// can be coerced back (parseArgs only knows string|boolean).
export function optionsForTool(def) {
  const options = { ...BASE_OPTIONS };
  const flagProps = {};
  for (const [name, prop] of Object.entries(def.inputSchema?.properties ?? {})) {
    if (name in BASE_OPTIONS) continue; // reserved flag name — reachable via --args only
    if (prop.type === 'boolean') {
      options[name] = { type: 'boolean' };
      flagProps[name] = 'boolean';
    } else if (prop.type === 'string' || prop.type === 'number' || prop.type === 'integer') {
      options[name] = { type: 'string' };
      flagProps[name] = prop.type;
    }
    // arrays / objects / untyped: --args only
  }
  return { options, flagProps };
}

export function coerceFlagValues(values, flagProps) {
  const out = {};
  for (const [name, kind] of Object.entries(flagProps)) {
    const v = values[name];
    if (v === undefined) continue;
    if (kind === 'boolean') {
      out[name] = v;
    } else if (kind === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`--${name} expects a number, got "${v}"`);
      out[name] = n;
    } else if (kind === 'integer') {
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) throw new Error(`--${name} expects an integer, got "${v}"`);
      out[name] = n;
    } else {
      out[name] = v;
    }
  }
  return out;
}
