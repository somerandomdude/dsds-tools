// Porcelain: curated commands over the shared tool registry (plan FR-11).
//
// Each entry maps positional arguments and a few flags onto a registry tool
// call. `dsds build` wraps the dsds_build_component wizard as a two-shot
// command (list props, then finalize with --answers) so shell agents get the
// guided compose path without the stateful start/answer/finalize protocol.
// The author wizard (dsds_author_component_doc) and dsds_feedback remain
// porcelain-free (FR-13) — they are multi-turn conversational tools; reach
// them via `dsds tool` when needed.
//
// Commands may define exitCode(result, text) to implement the "ran but found
// problems" contract (FR-7): 0 success · 1 error · 2 findings.

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export class UsageError extends Error {}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

const pick = (values, ...names) => {
  const out = {};
  for (const name of names) {
    if (values[name] !== undefined) out[name] = values[name];
  }
  return out;
};

export const PORCELAIN = {
  list: {
    summary: 'List entities in the loaded design system',
    usage: 'dsds list [--kind <kind>] [--status <status>] [--limit <n>] [--no-summaries] [--next]',
    options: {
      kind: { type: 'string', description: 'Filter by entity kind (component, chunk, pattern, token-group, …)' },
      status: { type: 'string', description: 'Filter by status (draft, experimental, stable, deprecated)' },
      limit: { type: 'string', description: 'Show at most this many entities per kind' },
      'no-summaries': { type: 'boolean', description: 'Bare identifier index, without the one-line summary each entity carries by default' },
      next: { type: 'boolean', description: 'Append the follow-up command for each result (off by default)' },
    },
    positionals: { min: 0, max: 0 },
    build(pos, values) {
      const limit = parseLimit(values.limit);
      const filters = pick(values, 'kind', 'status');
      // `list` defaults summaries ON (see the handler's note); the flag is
      // the negation. `search` keeps the opposite default, so only forward
      // an explicit false when the user asked for it.
      const extras = {
        ...(values['no-summaries'] ? { summaries: false } : {}),
        ...(values.next ? { nextCommands: true } : {}),
      };
      if (Object.keys(filters).length > 0) {
        return { tool: 'dsds_search_entities', args: { ...filters, ...extras, ...(limit ? { limit } : {}) } };
      }
      return { tool: 'dsds_list_entities', args: { ...extras, ...(limit ? { limit } : {}) } };
    },
  },

  search: {
    summary: 'Search entities by text query',
    usage: 'dsds search <query> [--kind <kind>] [--status <status>] [--limit <n>] [--summaries] [--next]',
    options: {
      kind: { type: 'string', description: 'Filter by entity kind' },
      status: { type: 'string', description: 'Filter by status' },
      limit: { type: 'string', description: 'Show at most this many results' },
      summaries: { type: 'boolean', description: 'Add a one-line summary per result (off by default)' },
      next: { type: 'boolean', description: 'Append the follow-up command for each result (off by default)' },
    },
    schemaKeys: ['query'],
    positionals: { min: 1, max: 1, label: '<query>' },
    build([query], values) {
      const limit = parseLimit(values.limit);
      return {
        tool: 'dsds_search_entities',
        args: {
          query,
          ...pick(values, 'kind', 'status'),
          ...(values.summaries ? { summaries: true } : {}),
          ...(values.next ? { nextCommands: true } : {}),
          ...(limit ? { limit } : {}),
        },
      };
    },
  },

  get: {
    summary: 'Get full documentation for an entity',
    usage: 'dsds get <identifier> [--block <blockType>]',
    options: {
      block: { type: 'string', description: 'Return a single document block (e.g. api, guidelines, accessibility)' },
    },
    schemaKeys: ['identifier'],
    flagAliases: { blockType: 'block' },
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) =>
      values.block
        ? { tool: 'dsds_get_document_block', args: { identifier, blockType: values.block } }
        : { tool: 'dsds_get_entity', args: { identifier } },
  },

  context: {
    summary: 'LLM-optimized rules and constraints for an entity',
    usage: 'dsds context <identifier> [--verbose]',
    options: { verbose: { type: 'boolean', description: 'Include full detail' } },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) => ({
      tool: 'dsds_get_agent_context',
      args: { identifier, ...pick(values, 'verbose') },
    }),
  },

  chunk: {
    summary: 'Pre-assembled code chunk with guidelines and use cases',
    usage: 'dsds chunk <identifier>',
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier]) => ({ tool: 'dsds_get_chunk', args: { identifier } }),
  },

  examples: {
    summary: 'Worked examples that use an entity — an index, not their code',
    usage: 'dsds examples <identifier> [--next]',
    options: {
      next: { type: 'boolean', description: 'Append the fetch command for each example (off by default)' },
    },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) => ({
      tool: 'dsds_get_examples',
      args: { identifier, ...(values.next ? { nextCommands: true } : {}) },
    }),
  },

  build: {
    summary: 'Compose a documented component into valid JSX — list its props, then finalize with answers',
    usage: "dsds build <component> [--answers '<json>']",
    options: {
      answers: {
        type: 'string',
        description:
          "JSON map { propId: value } — returns ready-to-use JSX in result.code. Omit to first list the component's props and their allowed values.",
      },
    },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<component>' },
    build([identifier], values) {
      if (values.answers === undefined) {
        // No answers yet → the "start" step: enumerate props + allowed values.
        return { tool: 'dsds_build_component', args: { step: 'start', identifier } };
      }
      let answers;
      try {
        answers = JSON.parse(values.answers);
      } catch (err) {
        throw new UsageError(`--answers must be valid JSON: ${err.message}`);
      }
      if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
        throw new UsageError('--answers must be a JSON object map { propId: value }');
      }
      return { tool: 'dsds_build_component', args: { step: 'finalize', identifier, answers } };
    },
    // The wizard returns a JSON payload. A rejected/incomplete finalize (bad
    // value, missing required prop) is a "ran but found problems" case → exit 2;
    // listing props (start) and a successful compose stay at 0.
    exitCode(result, text) {
      if (result.isError) return 1;
      try {
        const p = JSON.parse(text);
        if (p && typeof p.validated === 'string' && /^(Rejected|Cannot finalize)/.test(p.validated)) return 2;
      } catch {
        /* not JSON — treat as success */
      }
      return 0;
    },
  },

  deps: {
    summary: 'What an entity needs / is built from',
    usage: 'dsds deps <identifier> [--relation <relation>] [--transitive]',
    options: {
      relation: { type: 'string', description: 'Filter by relation (composes, depends-on, part-of, …)' },
      transitive: { type: 'boolean', description: 'Follow edges transitively' },
    },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) => ({
      tool: 'dsds_get_dependencies',
      args: { identifier, ...pick(values, 'relation', 'transitive') },
    }),
  },

  dependents: {
    summary: 'What points at an entity',
    usage: 'dsds dependents <identifier> [--relation <relation>] [--transitive]',
    options: {
      relation: { type: 'string', description: 'Filter by relation' },
      transitive: { type: 'boolean', description: 'Follow edges transitively' },
    },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) => ({
      tool: 'dsds_get_dependents',
      args: { identifier, ...pick(values, 'relation', 'transitive') },
    }),
  },

  impact: {
    summary: 'Blast radius: what breaks if this entity changes',
    usage: 'dsds impact <identifier>',
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier]) => ({ tool: 'dsds_impact', args: { identifier } }),
  },

  alternatives: {
    summary: 'Interchangeable options and replacements',
    usage: 'dsds alternatives <identifier>',
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier]) => ({ tool: 'dsds_get_alternatives', args: { identifier } }),
  },

  markdown: {
    summary: 'Export an entity as markdown',
    usage: 'dsds markdown <identifier> [--include-agent-content]',
    options: {
      'include-agent-content': {
        type: 'boolean',
        description: 'Also render `for: agent` sections (default: human-facing sections only)',
      },
    },
    schemaKeys: ['identifier'],
    positionals: { min: 1, max: 1, label: '<identifier>' },
    build: ([identifier], values) => ({
      tool: 'dsds_to_markdown',
      args: { identifier, includeAgentContent: !!values['include-agent-content'] },
    }),
  },

  brief: {
    summary: 'Task briefing before building, authoring, or answering',
    usage: 'dsds brief <build|author|ask> [--task <text>]',
    options: { task: { type: 'string', description: 'The task at hand, woven into the briefing' } },
    schemaKeys: ['useCase'],
    positionals: { min: 1, max: 1, label: '<build|author|ask>' },
    build: ([useCase], values) => ({
      tool: 'dsds_context_brief',
      args: { useCase, ...pick(values, 'task') },
    }),
  },

  scaffold: {
    summary: 'Blank DSDS JSON template for an entity kind',
    usage: 'dsds scaffold <kind>',
    schemaKeys: ['kind'],
    positionals: { min: 1, max: 1, label: '<kind>' },
    build: ([kind]) => ({ tool: 'dsds_spec_scaffold', args: { kind } }),
  },

  spec: {
    summary: 'DSDS spec reference: overview, entity schema, block types',
    usage: 'dsds spec overview | schema <kind> | blocks <kind>',
    positionals: { min: 1, max: 2, label: 'overview | schema <kind> | blocks <kind>' },
    build([sub, kind]) {
      if (sub === 'overview') {
        if (kind) throw new UsageError('usage: dsds spec overview');
        return { tool: 'dsds_spec_overview', args: {} };
      }
      if (sub === 'schema' || sub === 'blocks') {
        if (!kind) throw new UsageError(`usage: dsds spec ${sub} <kind>`);
        return {
          tool: sub === 'schema' ? 'dsds_spec_entity_schema' : 'dsds_spec_document_blocks',
          args: { kind },
        };
      }
      throw new UsageError('usage: dsds spec overview | schema <kind> | blocks <kind>');
    },
  },

  'check-exports': {
    summary: 'Verify components are real exports of the configured package',
    usage: 'dsds check-exports <Component…>',
    variadicKey: 'components',
    positionals: { min: 1, max: Infinity, label: '<Component…>' },
    build: components => ({ tool: 'dsds_check_exports', args: { components } }),
  },

  validate: {
    summary: 'Validate a DSDS document against the bundled schema',
    usage: 'dsds validate <file>',
    positionals: { min: 1, max: 1, label: '<file>' },
    build([file]) {
      let document;
      try {
        document = readFileSync(file, 'utf-8');
      } catch (err) {
        throw new UsageError(`cannot read ${file}: ${err.message}`);
      }
      return { tool: 'dsds_validate', args: { document, filePath: resolvePath(file) } };
    },
    // Findings (schema errors, parse errors) are exit 2; only usage problems are 1.
    exitCode: (result, text) => (text.includes('Validation Failed') ? 2 : result.isError ? 1 : 0),
  },

  lint: {
    summary: 'Lint files (or stdin) against the configured design system ESLint plugins',
    usage: 'dsds lint <path…> [--apply [--dry-run]] | dsds lint --stdin [--filename <name>]',
    options: {
      stdin: { type: 'boolean', description: 'Lint code piped on stdin instead of files' },
      filename: { type: 'string', description: 'Filename for parser inference in --stdin mode (e.g. App.tsx)' },
      apply: {
        type: 'boolean',
        description: 'OVERWRITES the files in place with auto-fixed code (path mode only). Preview with --dry-run first',
      },
      'dry-run': {
        type: 'boolean',
        description: 'With --apply, report what would be rewritten without touching any file',
      },
    },
    variadicKey: 'files',
    positionals: { min: 0, max: Infinity, label: '<path…>' },
    async build(paths, values) {
      if (values['dry-run'] && !values.apply) {
        throw new UsageError('--dry-run only means something with --apply (linting never writes on its own)');
      }
      if (values.stdin) {
        if (values.apply) throw new UsageError('--apply requires path mode (stdin has no file to write back to)');
        const code = await readStdin();
        if (!code.trim()) throw new UsageError('no code received on stdin');
        return {
          tool: 'dsds_lint_inline',
          args: { code, ...pick(values, 'filename') },
        };
      }
      if (paths.length === 0) {
        throw new UsageError('usage: dsds lint <path…> | dsds lint --stdin [--filename <name>]');
      }
      return {
        tool: 'dsds_lint_by_path',
        args: {
          files: paths.map(path => ({ path })),
          // --dry-run runs the fixer but keeps `apply` off, so the report
          // shows what would change and nothing is written.
          ...(values.apply && !values['dry-run'] ? { apply: true } : {}),
        },
      };
    },
    // isError = environment problems (no plugins, eslint missing) → 1.
    // Remaining violations or per-file errors (missing file, parse crash) → 2.
    exitCode(result) {
      if (result.isError) return 1;
      const sc = result.structuredContent;
      if (sc && (sc.remaining > 0 || (sc.files ?? []).some(f => f.error))) return 2;
      return 0;
    },
  },
};


// ── One calling convention ───────────────────────────────────────────────
//
// Porcelain takes positionals (`dsds get button`); the `dsds tool` escape
// hatch takes the tool's own schema flags (`--identifier button`, `--args
// '{…}'`). Both are correct, which is the trap: an agent that has seen one
// guesses it everywhere. Measured across the four 2026-09-11 ui5-cli runs,
// 25 of 55 failed calls were a right-shaped argument aimed at the wrong
// convention — `brief --useCase build`, `check-exports --components [...]`,
// `check-exports --args '{"components":[…]}'`. The MCP surface never has
// this problem because each tool has exactly one shape and publishes it.
//
// So porcelain now accepts all three forms for the same call. A command
// declares which schema keys its positionals stand for, and anything
// missing is filled from the matching flag or from `--args` JSON.

/** Flags a command accepts as stand-ins for its positionals. */
export function aliasOptions(spec) {
  const out = {};
  for (const key of spec.schemaKeys ?? []) out[key] = { type: 'string' };
  if (spec.variadicKey) out[spec.variadicKey] = { type: 'string' };
  for (const key of Object.keys(spec.flagAliases ?? {})) out[key] = { type: 'string' };
  return out;
}

// A list arrives as JSON (`'["Box","Card"]'`), comma-separated, or
// whitespace-separated. All three are things an agent actually typed.
function splitList(value) {
  const raw = String(value).trim();
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fall through to delimiter splitting */ }
  }
  return raw.split(/[,\s]+/).filter(Boolean);
}

function argsObject(values) {
  if (typeof values.args !== 'string' || values.args.trim() === '') return {};
  try {
    const parsed = JSON.parse(values.args);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new UsageError(`--args must be a JSON object. ${values.args.slice(0, 40)}… did not parse.`);
  }
}

/**
 * Fill missing positionals from schema-named flags or `--args`.
 *
 * Positionals always win: an explicit `dsds get button --identifier card`
 * uses `button`, because the positional is the documented form and silently
 * preferring the flag would be the more surprising of the two.
 *
 * @returns {string[]} positionals to hand to `spec.build`
 */
export function resolvePositionals(spec, positionals, values) {
  const { min = 0 } = spec.positionals ?? {};

  // `key=value` as a positional. MCP tool arguments are named, so an agent
  // carrying that habit writes `dsds brief useCase=build` — 5 of the 55
  // failures. Lift those into `values` before anything else looks at them,
  // but only for keys this command actually knows: a genuine positional
  // that happens to contain `=` must survive untouched.
  const known = new Set([...(spec.schemaKeys ?? []), spec.variadicKey, ...Object.keys(spec.flagAliases ?? {})].filter(Boolean));
  const literal = [];
  for (const arg of positionals) {
    const m = /^([A-Za-z][\w-]*)=(.*)$/.exec(arg);
    if (m && known.has(m[1])) {
      if (values[m[1]] === undefined) values[m[1]] = m[2];
    } else {
      literal.push(arg);
    }
  }
  positionals = literal;

  if (positionals.length >= min) return positionals;

  const fromArgs = argsObject(values);
  const filled = [...positionals];

  // Variadic commands (check-exports, lint) take one list, not a sequence.
  if (spec.variadicKey && filled.length === 0) {
    const raw = values[spec.variadicKey] ?? fromArgs[spec.variadicKey];
    if (raw !== undefined) {
      return Array.isArray(raw) ? raw.map(String) : splitList(raw);
    }
  }

  for (let i = filled.length; i < (spec.schemaKeys ?? []).length; i++) {
    const key = spec.schemaKeys[i];
    const value = values[key] ?? fromArgs[key];
    if (value === undefined) break;
    filled.push(String(value));
  }
  return filled;
}

/**
 * Flags whose schema name differs from the porcelain name (`--blockType`
 * for `--block`). Applied before `build` reads `values`, so a command's own
 * code keeps using the short name it already knows.
 */
export function applyFlagAliases(spec, values) {
  const fromArgs = argsObject(values);
  for (const [schemaName, flagName] of Object.entries(spec.flagAliases ?? {})) {
    if (values[flagName] === undefined) {
      const value = values[schemaName] ?? fromArgs[schemaName];
      if (value !== undefined) values[flagName] = String(value);
    }
  }
  return values;
}

export function checkPositionals(spec, positionals) {
  const { min = 0, max = Infinity } = spec.positionals ?? {};
  if (positionals.length < min || positionals.length > max) {
    throw new UsageError(`usage: ${spec.usage}`);
  }
}

export function porcelainHelp(name, spec) {
  const lines = [spec.usage, '', spec.summary + '.'];
  const options = Object.entries(spec.options ?? {});
  if (options.length > 0) {
    lines.push('', 'Options');
    for (const [flag, def] of options) {
      lines.push(`  --${flag}${def.type === 'string' ? ' <value>' : ''}  ${def.description ?? ''}`);
    }
  }
  lines.push('', `Exit codes: 0 success · 1 error${spec.exitCode ? ' · 2 ran but found problems' : ''}`);
  return lines.join('\n');
}

// --limit arrives as a string from parseArgs; the tools want a number.
function parseLimit(raw) {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--limit expects a positive integer, got "${raw}"`);
  return n;
}
