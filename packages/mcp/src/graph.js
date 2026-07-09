// In-memory bidirectional relationship graph (DSDS 0.13.0).
//
// Built in one O(edges) pass over the loaded entity catalog. Authors declare
// each edge once on the source entity (`entity.relationships`); the server
// derives the inverse edges so reverse queries ("what depends on me?") work
// without an authoring burden. The graph is transient — rebuilt on load,
// never persisted. See proposals/relationship-graph-mcp.md.

// The server owns this fixed inverse map; it is never authored.
const INVERSE = {
  'composes': 'composed-by',
  'depends-on': 'dependency-of',
  'part-of': 'contains',
  'replaces': 'replaced-by',
  'extends': 'extended-by',
  'alternative-to': 'alternative-to', // symmetric
};

// Relations whose authored graph is expected to be acyclic — cycles here are defects.
const ACYCLIC_RELATIONS = new Set(['composes', 'depends-on']);

export function inverseOf(relation) {
  return INVERSE[relation] ?? `inverse-of:${relation}`;
}

/**
 * Build the bidirectional graph from a flat list of resolved entities.
 *
 * Lenient by design: unresolved targets and cycles are recorded as integrity
 * findings rather than thrown — the graph is still served, with the problems
 * surfaced in tool responses.
 *
 * @param {Array<{identifier:string,name?:string,kind?:string,relationships?:Array}>} entities
 * @returns {{ nodes:Map, out:Map, in:Map, unresolved:Array, cycles:Array }}
 */
export function buildGraph(entities) {
  const nodes = new Map();
  for (const e of entities) {
    if (e?.identifier) nodes.set(e.identifier, { identifier: e.identifier, name: e.name ?? e.identifier, kind: e.kind });
  }

  const out = new Map();
  const incoming = new Map();
  const unresolved = [];
  const push = (m, id, edge) => { if (!m.has(id)) m.set(id, []); m.get(id).push(edge); };

  for (const e of entities) {
    const src = e?.identifier;
    if (!src) continue;
    for (const edge of e.relationships ?? []) {
      if (!edge?.relation || !edge?.target) continue;
      const targetResolved = nodes.has(edge.target);
      // authored (outgoing) edge
      push(out, src, {
        relation: edge.relation,
        target: edge.target,
        role: edge.role,
        required: !!edge.required,
        versionConstraint: edge.versionConstraint,
        resolved: targetResolved,
      });
      if (!targetResolved) unresolved.push({ source: src, relation: edge.relation, target: edge.target });
      // derived (incoming/inverse) edge on the target
      push(incoming, edge.target, {
        relation: inverseOf(edge.relation), // the reverse relation name
        via: edge.relation,                 // the authored relation that produced it
        target: src,                        // who points at this entity
        role: edge.role,
        required: !!edge.required,
        resolved: true,                     // src is always a real loaded entity
      });
    }
  }

  const cycles = detectCycles(nodes, out);
  return { nodes, out, in: incoming, unresolved, cycles };
}

// DFS cycle detection over ACYCLIC_RELATIONS edges only.
function detectCycles(nodes, out) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];
  const stack = [];

  function visit(id) {
    color.set(id, GRAY);
    stack.push(id);
    for (const edge of out.get(id) ?? []) {
      if (!ACYCLIC_RELATIONS.has(edge.relation)) continue;
      if (!nodes.has(edge.target)) continue;
      const c = color.get(edge.target) ?? WHITE;
      if (c === GRAY) {
        const i = stack.indexOf(edge.target);
        cycles.push([...stack.slice(i), edge.target]);
      } else if (c === WHITE) {
        visit(edge.target);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const id of nodes.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
  return cycles;
}

/**
 * A graph getter with an identity-keyed cache: the graph is rebuilt only when
 * the systems array itself is swapped for a new one (the MCP server's watcher
 * does this on file change; a one-shot CLI never does). Cost is O(edges) on
 * rebuild, zero otherwise. Shared by every transport that serves graph queries.
 */
export function createGraphGetter(getSystems) {
  let cache = { ref: null, graph: null };
  return () => {
    const systems = getSystems();
    if (cache.ref !== systems) {
      cache = { ref: systems, graph: buildGraph(systems.flatMap(s => s.entities)) };
    }
    return cache.graph;
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

const label = (graph, id) => {
  const n = graph.nodes.get(id);
  return n ? { identifier: id, name: n.name, kind: n.kind, resolved: true } : { identifier: id, resolved: false };
};

/** Entities that point at `id` (incoming/inverse edges). */
export function dependents(graph, id, { relation = null, transitive = false } = {}) {
  return traverse(graph, id, graph.in, relation, transitive, e => e.via);
}

/** Entities `id` points at (authored/outgoing edges). */
export function dependencies(graph, id, { relation = null, transitive = false } = {}) {
  return traverse(graph, id, graph.out, relation, transitive, e => e.relation);
}

// Shared walker. `relationKeyFn` selects which field to filter `relation` on.
function traverse(graph, id, edgeMap, relation, transitive, relationKeyFn) {
  const results = [];
  const seen = new Set([id]); // cycle guard, also excludes self
  const queue = [{ id, depth: 0 }];
  while (queue.length) {
    const { id: cur, depth } = queue.shift();
    for (const edge of edgeMap.get(cur) ?? []) {
      if (relation && relationKeyFn(edge) !== relation) continue;
      if (!transitive && depth > 0) continue;
      if (seen.has(edge.target)) continue;
      seen.add(edge.target);
      results.push({
        ...label(graph, edge.target),
        relation: edge.relation,
        via: edge.via,
        role: edge.role,
        required: edge.required,
        depth: depth + 1,
      });
      if (transitive) queue.push({ id: edge.target, depth: depth + 1 });
    }
  }
  return results;
}

/** Alternatives and replacements: alternative-to (symmetric), replaces, replaced-by. */
export function alternatives(graph, id) {
  const result = { alternatives: [], replaces: [], replacedBy: [] };
  for (const e of graph.out.get(id) ?? []) {
    if (e.relation === 'alternative-to') result.alternatives.push({ ...label(graph, e.target), role: e.role });
    else if (e.relation === 'replaces') result.replaces.push({ ...label(graph, e.target), role: e.role });
  }
  for (const e of graph.in.get(id) ?? []) {
    if (e.via === 'alternative-to') result.alternatives.push({ ...label(graph, e.target), role: e.role });
    else if (e.via === 'replaces') result.replacedBy.push({ ...label(graph, e.target), role: e.role });
  }
  // de-dupe alternatives by identifier (symmetric edges can appear from both sides)
  const seen = new Set();
  result.alternatives = result.alternatives.filter(a => (seen.has(a.identifier) ? false : seen.add(a.identifier)));
  return result;
}

/** Impact summary: direct + transitive dependents, grouped by authored relation, breaking edges flagged. */
export function impact(graph, id) {
  const direct = dependents(graph, id, { transitive: false });
  const all = dependents(graph, id, { transitive: true });
  const byRelation = {};
  for (const d of direct) (byRelation[d.via] ??= []).push(d);
  const breaking = all.filter(d => d.required); // required dependents break if this changes
  return {
    direct,
    transitive: all,
    byRelation,
    breaking,
    transitiveCount: all.length,
    directCount: direct.length,
  };
}

/** Whether the graph has any integrity problems worth flagging in responses. */
export function integrity(graph) {
  return {
    unresolved: graph.unresolved,
    cycles: graph.cycles,
    hasProblems: graph.unresolved.length > 0 || graph.cycles.length > 0,
  };
}
