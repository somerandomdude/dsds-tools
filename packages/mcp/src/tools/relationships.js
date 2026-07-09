import { dependents, dependencies, alternatives, impact, integrity } from '../graph.js';
import { getUpdateNotice } from '../spec/version.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function notFound(graph, identifier) {
  const ids = [...graph.nodes.keys()];
  const hint = ids.length ? `\n\nAvailable identifiers: ${ids.slice(0, 40).map(i => `\`${i}\``).join(', ')}${ids.length > 40 ? '…' : ''}` : '';
  return { isError: true, content: [{ type: 'text', text: `Entity \`${identifier}\` not found.${hint}` }] };
}

function renderEdge(e) {
  const kind = e.kind ? ` (${e.kind})` : e.resolved === false ? ' *(unresolved target)*' : '';
  const role = e.role ? ` — ${e.role}` : '';
  const req = e.required ? ' **[required]**' : '';
  const rel = e.via ?? e.relation;
  return `- **${rel}** \`${e.identifier}\`${kind}${role}${req}`;
}

// A dependents/incoming result is only a lower bound when targets didn't resolve.
function partialNote(graph) {
  const { unresolved, cycles } = integrity(graph);
  const parts = [];
  if (unresolved.length) parts.push(`${unresolved.length} unresolved relationship target${unresolved.length === 1 ? '' : 's'} in the catalog`);
  if (cycles.length) parts.push(`${cycles.length} dependency cycle${cycles.length === 1 ? '' : 's'} detected`);
  if (parts.length === 0) return '';
  return `\n> ⚠️ partial: ${parts.join('; ')}. Reverse-graph results may be incomplete.`;
}

const tail = (graph) => {
  const p = partialNote(graph);
  const n = getUpdateNotice();
  return (p ? '\n' + p : '') + (n ? '\n' + n : '');
};

const SHARED_SCHEMA = {
  type: 'object',
  properties: {
    identifier: { type: 'string', description: 'The entity identifier (e.g. "button", "color-text-primary").' },
    relation: { type: 'string', description: 'Optional: filter to one authored relation (depends-on, composes, part-of, alternative-to, replaces, extends).' },
    transitive: { type: 'boolean', description: 'Default false. When true, walk the graph transitively (with a cycle guard).' },
  },
  required: ['identifier'],
};

// ── dsds_get_dependents ────────────────────────────────────────────────────────

export const getDependentsDef = {
  name: 'dsds_get_dependents',
  description:
    'List the entities that point AT this one (reverse edges) — answers "what breaks if I change this?". ' +
    'Defaults to direct dependents; pass transitive:true to walk the whole reverse graph. Filter with `relation` (the authored relation, e.g. depends-on).',
  inputSchema: SHARED_SCHEMA,
};

export async function getDependentsHandler({ identifier, relation, transitive }, getGraph) {
  const graph = getGraph();
  if (!graph.nodes.has(identifier)) return notFound(graph, identifier);
  const results = dependents(graph, identifier, { relation, transitive: !!transitive });
  const lines = [`# Dependents of \`${identifier}\`${transitive ? ' (transitive)' : ''}${relation ? ` — relation: ${relation}` : ''}`, ''];
  if (results.length === 0) lines.push('Nothing depends on this entity' + (relation ? ` via \`${relation}\`` : '') + '.');
  else results.forEach(e => lines.push(renderEdge(e)));
  lines.push(tail(graph));
  return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
}

// ── dsds_get_dependencies ──────────────────────────────────────────────────────

export const getDependenciesDef = {
  name: 'dsds_get_dependencies',
  description:
    'List what this entity needs / is built from (authored outgoing edges) — answers "what does this pattern compose?". ' +
    'Defaults to direct dependencies; pass transitive:true to walk the chain. Filter with `relation`.',
  inputSchema: SHARED_SCHEMA,
};

export async function getDependenciesHandler({ identifier, relation, transitive }, getGraph) {
  const graph = getGraph();
  if (!graph.nodes.has(identifier)) return notFound(graph, identifier);
  const results = dependencies(graph, identifier, { relation, transitive: !!transitive });
  const lines = [`# Dependencies of \`${identifier}\`${transitive ? ' (transitive)' : ''}${relation ? ` — relation: ${relation}` : ''}`, ''];
  if (results.length === 0) lines.push('This entity declares no dependencies' + (relation ? ` via \`${relation}\`` : '') + '.');
  else results.forEach(e => lines.push(renderEdge(e)));
  lines.push(tail(graph));
  return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
}

// ── dsds_get_alternatives ──────────────────────────────────────────────────────

export const getAlternativesDef = {
  name: 'dsds_get_alternatives',
  description:
    'List interchangeable options (alternative-to) and replacements (replaces / replaced-by) for an entity — answers ' +
    '"what can I use instead?" and surfaces deprecations (if this entity is replaced-by another, it is deprecated).',
  inputSchema: {
    type: 'object',
    properties: { identifier: { type: 'string', description: 'The entity identifier.' } },
    required: ['identifier'],
  },
};

export async function getAlternativesHandler({ identifier }, getGraph) {
  const graph = getGraph();
  if (!graph.nodes.has(identifier)) return notFound(graph, identifier);
  const { alternatives: alts, replaces, replacedBy } = alternatives(graph, identifier);
  const lines = [`# Alternatives for \`${identifier}\``, ''];
  if (replacedBy.length) {
    lines.push(`> **Deprecated** — superseded by: ${replacedBy.map(r => `\`${r.identifier}\``).join(', ')}. Prefer the replacement.`, '');
  }
  if (alts.length) {
    lines.push('## Interchangeable alternatives', '');
    alts.forEach(a => lines.push(`- \`${a.identifier}\`${a.kind ? ` (${a.kind})` : ''}${a.role ? ` — ${a.role}` : ''}`));
    lines.push('');
  }
  if (replaces.length) {
    lines.push('## Supersedes (this replaces)', '');
    replaces.forEach(r => lines.push(`- \`${r.identifier}\`${r.kind ? ` (${r.kind})` : ''} — deprecated, replaced by this entity`));
    lines.push('');
  }
  if (!alts.length && !replaces.length && !replacedBy.length) {
    lines.push('No alternatives or replacements declared for this entity.');
  }
  lines.push(tail(graph));
  return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
}

// ── dsds_impact ────────────────────────────────────────────────────────────────

export const impactDef = {
  name: 'dsds_impact',
  description:
    'Impact analysis for changing or removing an entity: direct and transitive dependents grouped by relation, with ' +
    'required edges flagged as breaking. The headline "what is the blast radius?" call.',
  inputSchema: {
    type: 'object',
    properties: { identifier: { type: 'string', description: 'The entity identifier to analyze.' } },
    required: ['identifier'],
  },
};

export async function impactHandler({ identifier }, getGraph) {
  const graph = getGraph();
  if (!graph.nodes.has(identifier)) return notFound(graph, identifier);
  const r = impact(graph, identifier);
  const lines = [`# Impact of changing \`${identifier}\``, ''];

  if (r.directCount === 0) {
    lines.push('Nothing depends on this entity — changing it has no documented downstream impact.');
  } else {
    lines.push(`**${r.directCount}** direct dependent${r.directCount === 1 ? '' : 's'}, **${r.transitiveCount}** total (transitive).`, '');
    if (r.breaking.length) {
      lines.push(`## ⚠️ Breaking (${r.breaking.length}) — these declare the edge as \`required\``, '');
      r.breaking.forEach(e => lines.push(`- \`${e.identifier}\`${e.kind ? ` (${e.kind})` : ''} — **${e.via}**${e.depth > 1 ? ` (depth ${e.depth})` : ''}`));
      lines.push('');
    }
    lines.push('## Direct dependents by relation', '');
    for (const [rel, items] of Object.entries(r.byRelation)) {
      lines.push(`**${rel}** (${items.length}):`);
      items.forEach(e => lines.push(`- \`${e.identifier}\`${e.kind ? ` (${e.kind})` : ''}${e.required ? ' **[required]**' : ''}`));
      lines.push('');
    }
  }
  lines.push(tail(graph));
  return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
}
