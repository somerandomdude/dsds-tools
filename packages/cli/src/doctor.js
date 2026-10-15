// dsds doctor — diagnose the configuration and the loaded DSDS documents
// (plan FR-12). Checks configuration presence, document loading, schema
// validation of the root documents AND every $ref-referenced entity file,
// spec version alignment, relationship graph integrity, example-code props,
// brief kind references, lint plugin resolution, and configured paths.
//
// Exit codes: 0 all checks pass · 2 one or more checks failed. Checks whose
// inputs are not configured are marked "skip" and never fail the run —
// mirroring dsds-mcp's check-integrity script.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { resolveConfig } from 'dsds-mcp/src/config.js';
import { loadSystems, loadIntroEntities, summarizeEntities } from 'dsds-mcp/src/loader.js';
import { createSurface } from 'dsds-mcp/src/surface.js';
import { looksLike20, sourceRootOf20, validateDoc20 } from 'dsds-mcp/src/spec/validator.js';
import { VENDOR_DIR } from 'dsds-mcp/src/spec/schema-order.js';
import { loadYaml20 } from 'dsds-mcp/src/spec/dsds-lib.js';
import { buildGraph, createGraphGetter, integrity as graphIntegrity } from 'dsds-mcp/src/graph.js';
import {
  checkExampleProps,
  checkIconImports,
  checkKindReferences,
  checkVersions,
  parseIconExports,
} from 'dsds-mcp/src/integrity.js';
import { BUILD_BRIEF } from 'dsds-mcp/src/briefs.js';
import { checkLevelOrderAcross } from 'dsds-mcp/src/spec/style-guide.js';
import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';
import { findTokenRefs, tokenMap, TOKEN_REF_SHAPE } from 'dsds-mcp/src/token-refs.js';
import { didYouMean } from 'dsds-mcp/src/suggest.js';

// Upstream's item-address model (processing model §2), from the vendored lib.js.
const { itemAddresses, resolveAddress } = createRequire(import.meta.url)(join(VENDOR_DIR, 'scripts/lib.js'));

/**
 * Validate one document, or report that it is not a DSDS document at all.
 *
 * `[DSDS-11]` (a `sourceFiles`/`source`/`rel: file` href that does not exist
 * on disk) arrives as a warning rather than an error, but doctor always has a
 * real `filePath` and a dangling file reference is exactly the build-health
 * problem it exists to catch — so it is promoted here.
 */
function validateAny(doc, filePath, { siblings, sourceRoot } = {}) {
  if (looksLike20(doc)) {
    const { errors, warnings } = validateDoc20(doc, { filePath, siblings, sourceRoot });
    const fileRefWarnings = warnings.filter((w) => w.startsWith('[DSDS-11]'));
    return {
      valid: errors.length === 0 && fileRefWarnings.length === 0,
      errors: [...errors, ...fileRefWarnings].map(message => ({ path: '(root)', message })),
    };
  }
  return {
    valid: false,
    errors: [{
      path: '(root)',
      message: `not a DSDS ${BUNDLED_VERSION} document — expected \`entries\` with a \`schemaVersion\`, or a standalone entry with \`id\` and \`kind\``,
    }],
  };
}

// loadSystems() mutates each 0.20.0 entity object in place as it normalizes
// it (identifier/relationships/__dsds20/__filePath/__sharedEntries all get
// added directly onto the object living inside doc.entries[]) — so
// re-validating `system.document` after loading trips the schema's
// `unevaluatedProperties: false` on every one of those injected fields.
// Re-reading the file fresh validates what's actually on disk, not a
// runtime-mutated copy of it.
function loadFreshForValidation(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  return filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? loadYaml20(raw) : JSON.parse(raw);
}

// Files referenced from a root document's entity groups ($ref at group level
// or inside a group's entities array). Fragments are stripped — we validate
// whole files.
function collectRefFiles(rootDoc, rootPath) {
  const refs = new Set();
  const groups = rootDoc.entityGroups ?? rootDoc.documentation ?? [];
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group?.$ref) refs.add(group.$ref);
      if (Array.isArray(group?.entities)) {
        for (const item of group.entities) if (item?.$ref) refs.add(item.$ref);
      }
    }
  }
  const base = dirname(rootPath);
  return [...refs]
    .map(ref => ref.split('#')[0])
    .filter(Boolean)
    .map(rel => resolve(base, rel));
}

/**
 * DSDS-05 across the whole corpus: every `entryId#itemId` ref on a section
 * item must name an entry (or `shared[]` entry) that exists, and an item id
 * inside it.
 *
 * The relationship-graph check above only sees entry-level refs, so refs on
 * individual guideline items — where every `same-as` lives — were never
 * checked. A `same-as` to a missing id passed doctor and rendered as a bare
 * "see X" line, identical to a working pointer. Found by migrating form
 * guidance to a `forms` pattern and watching every rule vanish from the
 * component pages with no error anywhere.
 *
 * @param {object[]} entities - loaded entities; each carries the resolvable
 *   pool on `__sharedEntries` (shared[] plus every sibling entry).
 * @returns {string[]} one line per unresolved ref
 */
export function checkItemRefs(entities) {
  const pool = new Map();
  for (const e of entities) {
    for (const p of e.__sharedEntries ?? []) if (p?.id && !pool.has(p.id)) pool.set(p.id, p);
    if (e?.id && !pool.has(e.id)) pool.set(e.id, e);
  }
  // Upstream's address model: an item's `id`, or the id derived from its
  // text when it has none, plus traits and trait values.
  const addressBooks = new Map();
  const addressesOf = (entry) => {
    if (!addressBooks.has(entry.id)) addressBooks.set(entry.id, itemAddresses(entry));
    return addressBooks.get(entry.id);
  };
  // Every field a `to` pointer can sit in on a section item: `refs`, and the
  // 0.22.0 named pointer fields. `related` is read for a document that predates them.
  const REF_KEYS = ['refs', 'uses', 'alternatives', 'refines', 'checks', 'evidence', 'related'];
  const problems = [];
  for (const entity of entities) {
    const walk = (o, path) => {
      if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (!o || typeof o !== 'object') return;
      for (const key of REF_KEYS) {
        for (const [i, ref] of (Array.isArray(o[key]) ? o[key] : []).entries()) {
          if (typeof ref?.to !== 'string') continue;
          const hash = ref.to.indexOf('#');
          if (hash === -1) {
            if (ref.rel === 'same-as') problems.push(`${entity.id} ${path}.${key}[${i}]: same-as "${ref.to}" has no #itemId to borrow from`);
            continue;
          }
          const entryId = ref.to.slice(0, hash);
          const itemId = ref.to.slice(hash + 1);
          const target = pool.get(entryId);
          if (!target) problems.push(`${entity.id} ${path}.${key}[${i}]: "${ref.to}" — no entry "${entryId}"`);
          else if (!resolveAddress(addressesOf(target), itemId).candidate) problems.push(`${entity.id} ${path}.${key}[${i}]: "${ref.to}" — "${entryId}" has no item "${itemId}"`);
        }
      }
      for (const [k, v] of Object.entries(o)) if (!REF_KEYS.includes(k)) walk(v, `${path}.${k}`);
    };
    walk(entity.sections ?? [], 'sections');
  }
  return problems;
}

// ── Token references and hardcoded token values ───────────────────────────

/** Every prose string on an entity, with a readable path. Code is skipped later. */
function entityStrings(entity, visit) {
  const walk = (o, path) => {
    if (typeof o === 'string') return visit(o, path);
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('__') || k === 'source' || k === 'refs' || k === 'related' || k === 'id') continue;
      walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(entity, '');
}

/**
 * `{name}` references that look like a token but name none.
 *
 * Only token-shaped names are reported (`space-33`, `content.action.delet`).
 * A single word in braces is usually quoted JSX (`{true}`), so it is left
 * alone even when it resolves to nothing.
 *
 * @returns {string[]} one line per broken reference
 */
export function checkTokenRefs(entities, tokens) {
  const names = [...tokens.keys()];
  const problems = [];
  for (const entity of entities) {
    entityStrings(entity, (text, path) => {
      for (const name of findTokenRefs(text)) {
        if (tokens.has(name) || !TOKEN_REF_SHAPE.test(name)) continue;
        const near = didYouMean(name, names, { limit: 3 });
        problems.push(`${entity.id} ${path}: {${name}} names no token${near.length ? ` — did you mean ${near.map(n => `{${n}}`).join(', ')}?` : ''}`);
      }
    });
  }
  return problems;
}

// Words before a value that say which scale it belongs to.
const FAMILY_HINTS = [
  { family: 'radius', re: /radius|corner|round/ },
  { family: 'typography', re: /font|text|type|heading|body|label|eyebrow|code|line.height|size\b/ },
  { family: 'container', re: /container|max-?width|measure|reading width/ },
  { family: 'space', re: /padding|margin|gap|spac|inset|density|step|offset/ },
];

// Words near a value that mark it as something other than a token: WCAG's
// 320px reflow width and 19px-bold large-text threshold, a 24px touch
// target, a viewport breakpoint, a component's minimum size, an icon size
// (set in the component's own CSS, not in a token file).
const NOT_A_TOKEN = /viewport|breakpoint|wcag|reflow|overflow|touch|target|screen|device|media|zoom|contrast|large text|\bbold|minimum|min(?:imum)?[- ]?(?:size|height|width)|icon size|\(all\)|means \d|stacks|horizontal scroll/;

// A column header that marks every cell under it as not a token value.
const NOT_A_TOKEN_COLUMN = /icon|height|width|breakpoint|min-?width|minimum/i;

/** The header of the markdown table column a character offset sits in, or null. */
function columnHeaderAt(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (!line.trim().startsWith('|')) return null;
  const col = (line.slice(0, offset - lineStart).match(/\|/g) ?? []).length;
  const lines = text.slice(0, lineStart).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  for (let i = lines.length - 1; i > 0; i--) {
    if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]) && lines[i].includes('-')) {
      return lines[i - 1].split('|')[col]?.trim() ?? null;
    }
    if (!lines[i].trim().startsWith('|')) break;
  }
  return null;
}

function familyOf(token) {
  if (token.type === 'typography') return 'typography';
  return String(token.file).toLowerCase();
}

function pxOf(token) {
  const v = token.value;
  if (token.type === 'dimension' && v && typeof v === 'object' && v.unit === 'px') return v.value;
  if (token.type === 'typography' && v?.fontSize?.unit === 'px') return v.fontSize.value;
  return null;
}

/**
 * Pixel values written into prose that equal a token's value.
 *
 * A match is a suggestion, not a verdict: a 12px width is not necessarily
 * `space-3`. The words just before the value pick the scale when they can
 * ("padding" → space, "radius" → radius); otherwise every candidate is
 * listed. Values inside code spans and blocks are skipped — `width="300px"`
 * is a sizing example, not a token.
 *
 * @returns {{hits: string[], count: number}}
 */
export function findHardcodedTokenValues(entities, tokens) {
  const byPx = new Map();
  for (const t of tokens.values()) {
    const px = pxOf(t);
    if (px == null) continue;
    const key = String(px);
    if (!byPx.has(key)) byPx.set(key, []);
    byPx.get(key).push(t);
  }
  const hits = [];
  for (const entity of entities) {
    entityStrings(entity, (text, path) => {
      if (!/\dpx\b/.test(text)) return;
      const prose = text.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((p, i) => (i % 2 ? ' '.repeat(p.length) : p)).join('');
      // A negative offset (−7px) and a border width (1px border) are never tokens.
      for (const m of prose.matchAll(/(?<![−\-\d.])(\d+(?:\.\d+)?)px\b(?!\s*(?:solid|border|stroke|outline|hairline))/g)) {
        let candidates = byPx.get(String(Number(m[1]))) ?? [];
        if (!candidates.length) continue;
        const before = prose.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
        const after = prose.slice(m.index, m.index + 40).toLowerCase();
        if (NOT_A_TOKEN.test(before.slice(-30) + after)) continue;
        const header = columnHeaderAt(prose, m.index);
        if (header && NOT_A_TOKEN_COLUMN.test(header)) continue;
        if (candidates.length > 1) {
          const hint = FAMILY_HINTS.find(h => h.re.test(before) && candidates.some(c => familyOf(c) === h.family));
          if (hint) candidates = candidates.filter(c => familyOf(c) === hint.family);
        }
        hits.push(`${entity.id} ${path}: ${m[0]} → ${candidates.map(c => `{${c.name}}`).join(' or ')}`);
      }
    });
  }
  return { hits, count: hits.length };
}

export async function runDoctor({ json = false, configPath = null } = {}) {
  const checks = [];
  const add = (name, status, details = []) => checks.push({ name, status, details });

  const cfg = await resolveConfig({ configPath });

  // ── Config source ──────────────────────────────────────────────────────────
  if (cfg.meta.configFileError) {
    add('config source', 'fail', [cfg.meta.configFileError]);
  } else if (cfg.meta.configFile) {
    add('config source', 'pass', [cfg.meta.configFile]);
  } else {
    add('config source', 'pass', ['environment variables only (no dsds.config file found)']);
  }

  // ── Configuration ──────────────────────────────────────────────────────────
  if (cfg.paths.length === 0) {
    add('DSDS_PATHS configured', 'fail', [
      'DSDS_PATHS is not set — the design system tools have nothing to serve.',
    ]);
  } else {
    add('DSDS_PATHS configured', 'pass', cfg.paths);
  }

  // ── Documents load ─────────────────────────────────────────────────────────
  let systems = [];
  if (cfg.paths.length > 0) {
    const { systems: loaded, errors } = await loadSystems(cfg.paths);
    systems = loaded;
    if (errors.length > 0) {
      add('documents load', 'fail', errors.map(e => `${e.path} — ${e.error}`));
    } else {
      add('documents load', 'pass', systems.map(s => `${basename(s.filePath)}: ${s.entities.length} entities`));
    }
  }

  const allEntities = systems.flatMap(s => s.entities);

  // ── Identifier uniqueness ──────────────────────────────────────────────────
  // Graph edges and entity lookups are identifier-keyed; a duplicate collapses
  // two entities into one address and makes every reference to it ambiguous.
  if (allEntities.length > 0) {
    const seen = new Map();
    const duplicates = [];
    for (const entity of allEntities) {
      if (!entity.identifier) continue;
      if (seen.has(entity.identifier)) {
        duplicates.push(
          `"${entity.identifier}" is declared by both a ${seen.get(entity.identifier)} and a ${entity.kind} — lookups and graph edges are ambiguous`
        );
      } else {
        seen.set(entity.identifier, entity.kind);
      }
    }
    add(
      'identifier uniqueness',
      duplicates.length > 0 ? 'fail' : 'pass',
      duplicates.length > 0 ? duplicates : [`${seen.size} unique identifiers`]
    );
  }

  // ── Schema validation: root documents + every referenced entity file ──────
  if (systems.length > 0) {
    const problems = [];
    let filesChecked = 0;
    for (const system of systems) {
      // A YAML system is the root document plus every file it reaches with
      // `rel: file`. Validate each one, all together, as upstream's CLI does
      // with files given at once: refs resolve across them, and the root
      // system's `metadata.sourceRoot` applies to every `sourceFiles` path.
      const files = [system.filePath, ...new Set(system.entities.map((e) => e?.__filePath).filter((f) => f && f !== system.filePath))];
      const docs = files.map((file) => {
        try {
          return { file, doc: loadFreshForValidation(file) };
        } catch (err) {
          problems.push(`${basename(file)}: unreadable — ${err.message}`);
          return null;
        }
      }).filter(Boolean);
      const siblings = docs.map((d) => d.doc);
      const sourceRoot = docs.length ? sourceRootOf20(docs[0].doc, system.filePath) : null;
      for (const { file, doc } of docs) {
        filesChecked += 1;
        const result = validateAny(doc, file, { siblings, sourceRoot });
        if (!result.valid) {
          const first = result.errors[0];
          problems.push(`${basename(file)}: ${result.errors.length} schema error(s) — first: ${first.path}: ${first.message}`);
        }
      }
      for (const refFile of collectRefFiles(system.document, system.filePath)) {
        filesChecked += 1;
        try {
          const doc = JSON.parse(readFileSync(refFile, 'utf-8'));
          const result = validateAny(doc, refFile);
          if (!result.valid) {
            const first = result.errors[0];
            problems.push(`${basename(refFile)}: ${result.errors.length} schema error(s) — first: ${first.path}: ${first.message}`);
          }
        } catch (err) {
          problems.push(`${basename(refFile)}: unreadable — ${err.message}`);
        }
      }
    }
    add(
      'schema validation',
      problems.length > 0 ? 'fail' : 'pass',
      problems.length > 0 ? problems : [`${filesChecked} document(s) valid against bundled spec ${BUNDLED_VERSION}`]
    );
  }

  // ── Spec version alignment ─────────────────────────────────────────────────
  if (cfg.paths.length > 0) {
    const sources = [{ label: 'config default (DSDS_SCHEMA_VERSION)', version: cfg.schemaVersion }];
    for (const path of cfg.paths) {
      try {
        const doc = JSON.parse(readFileSync(path, 'utf-8'));
        if (doc.dsdsVersion) sources.push({ label: `dsdsVersion in ${basename(path)}`, version: doc.dsdsVersion });
      } catch {
        /* reported by the load check */
      }
    }
    const drift = checkVersions(BUNDLED_VERSION, sources);
    add('spec version alignment', drift.length > 0 ? 'fail' : 'pass', drift.length > 0 ? drift : [`all sources at ${BUNDLED_VERSION}`]);
  }

  // ── Relationship graph ─────────────────────────────────────────────────────
  if (allEntities.length > 0) {
    const graph = buildGraph(allEntities);
    const gi = graphIntegrity(graph);
    const details = [
      ...gi.unresolved.map(u => `unresolved: ${u.source} —${u.relation}→ ${u.target}`),
      ...gi.cycles.map(c => `cycle: ${c.join(' → ')}`),
    ];
    add(
      'relationship graph',
      gi.hasProblems ? 'fail' : 'pass',
      gi.hasProblems ? details : [`${graph.nodes.size} nodes, no unresolved targets, no cycles`]
    );
  }

  // ── Item references (DSDS-05, corpus-wide) ─────────────────────────────────
  if (allEntities.length > 0) {
    const problems = checkItemRefs(allEntities);
    add(
      'item references',
      problems.length ? 'fail' : 'pass',
      problems.length ? problems : ['every entryId#itemId ref on a section item resolves'],
    );
  }

  // ── Guideline level order (DSDS-19, corpus-wide) ───────────────────────────
  // A pointer item takes the level of the shared rule it points to, which
  // usually lives in another file. A single-document style check skips such
  // pointers, so when a shared rule's level changed, every pointer to it
  // could land out of order unnoticed. Advisory, like every style rule: a
  // warning, never a failure.
  if (allEntities.length > 0) {
    const findings = checkLevelOrderAcross(allEntities);
    add(
      'guideline level order',
      findings.length ? 'warn' : 'pass',
      findings.length
        ? [
            `${findings.length} guidelines section(s) out of must, should, may, should-not, must-not order`,
            ...findings.map((f) => `${f.file ? `${basename(f.file)} ` : ''}${f.entry}${f.pointer}: ${f.message}`),
          ]
        : ['every guidelines section runs must, should, may, should-not, must-not, pointers included'],
    );
  }

  // ── Token references ───────────────────────────────────────────────────────
  // `{space-3}` in prose is served as "`space-3` (12px)". A reference that
  // resolves to nothing would be served raw, so it fails here instead.
  if (allEntities.length > 0) {
    const tokens = tokenMap(systems);
    if (tokens.size === 0) {
      add('token references', 'skip', ['no DTCG token files referenced by any entry'] );
    } else {
      const broken = checkTokenRefs(allEntities, tokens);
      add('token references', broken.length ? 'fail' : 'pass', broken.length ? broken : [`every {token} reference resolves (${tokens.size} tokens)`]);
      const { hits, count } = findHardcodedTokenValues(allEntities, tokens);
      add(
        'hardcoded token values',
        count ? 'warn' : 'pass',
        count ? [`${count} pixel value(s) in prose match a token — write the reference instead`, ...hits] : ['no pixel value in prose duplicates a token'],
      );
    }
  }

  // ── Example code props ─────────────────────────────────────────────────────
  if (allEntities.length > 0) {
    const errors = checkExampleProps(allEntities);
    add('example code props', errors.length > 0 ? 'fail' : 'pass', errors.length > 0 ? errors : ['examples use only documented props']);
  }

  // ── Brief kind references ──────────────────────────────────────────────────
  if (allEntities.length > 0) {
    const kinds = new Set(allEntities.map(e => e.kind).filter(Boolean));
    const errors = checkKindReferences(BUILD_BRIEF, kinds);
    add('brief kind references', errors.length > 0 ? 'fail' : 'pass', errors.length > 0 ? errors : ['every kind the briefs reference is populated']);
  }

  // ── Icon imports (needs ICON_PACKAGE + PACKAGE_EXPORT_PATHS) ───────────────
  const chunks = allEntities
    .filter(e => e.kind === 'chunk' && e.code?.code)
    .map(e => ({ identifier: e.identifier, code: e.code.code }));
  if (chunks.length > 0) {
    const iconPackage = cfg.iconPackage;
    const iconsPath = iconPackage ? cfg.packageExportPaths.get(iconPackage) : null;
    if (!iconPackage) {
      add('icon imports', 'skip', ['ICON_PACKAGE not set']);
    } else if (!iconsPath) {
      add('icon imports', 'skip', [`PACKAGE_EXPORT_PATHS has no ${iconPackage} entry`]);
    } else {
      try {
        const exports = parseIconExports(readFileSync(join(iconsPath, 'dist/index.d.ts'), 'utf-8'));
        if (exports.size === 0) {
          add('icon imports', 'skip', [`no exports parsed from ${iconsPath}`]);
        } else {
          const errors = checkIconImports(chunks, exports, iconPackage);
          add(
            'icon imports',
            errors.length > 0 ? 'fail' : 'pass',
            errors.length > 0 ? errors : [`${chunks.length} chunk(s) checked against ${exports.size} exports`]
          );
        }
      } catch (err) {
        add('icon imports', 'skip', [`could not read ${iconPackage} exports: ${err.message}`]);
      }
    }
  }

  // ── Lint plugins resolve ───────────────────────────────────────────────────
  if (cfg.lintPlugins.length > 0) {
    const req = createRequire(resolve(cfg.lintResolveDir, 'package.json'));
    const unresolvable = [];
    for (const name of cfg.lintPlugins) {
      try {
        req.resolve(name);
      } catch {
        unresolvable.push(`${name} — not resolvable from ${cfg.lintResolveDir}`);
      }
    }
    add('lint plugins resolve', unresolvable.length > 0 ? 'fail' : 'pass', unresolvable.length > 0 ? unresolvable : cfg.lintPlugins);
  }

  // ── Package export paths exist ─────────────────────────────────────────────
  if (cfg.packageExportPaths.size > 0) {
    const missing = [...cfg.packageExportPaths.entries()]
      .filter(([, path]) => !existsSync(path))
      .map(([pkg, path]) => `${pkg} → ${path} (missing)`);
    add('package export paths', missing.length > 0 ? 'fail' : 'pass', missing.length > 0 ? missing : [...cfg.packageExportPaths.keys()]);
  }

  // ── Intro entity paths exist ───────────────────────────────────────────────
  if (cfg.introPaths?.length > 0) {
    const missing = cfg.introPaths.filter(path => !existsSync(path));
    add('intro entity paths', missing.length > 0 ? 'fail' : 'pass', missing.length > 0 ? missing.map(p => `${p} (missing)`) : cfg.introPaths);
  }

  // ── MCP surface ────────────────────────────────────────────────────────────
  // The CLI and the MCP server serve one surface; this reports what it
  // resolves to for this project and proves each part actually renders.
  // Reading every resource is the point: a resource that throws on
  // serialization is invisible until something asks for it.
  {
    const introEntities = await loadIntroEntities(cfg.introPaths);
    const surface = createSurface({
      getSystems: () => systems,
      getSummaries: () => summarizeEntities(systems),
      getIntro: () => introEntities,
      getGraph: createGraphGetter(() => systems),
      enableFeedback: cfg.enableFeedback,
      introInline: cfg.introInline,
    });

    const failures = [];
    const details = [];

    details.push(`${surface.toolDefs.length} tools — dsds tool <name>`);

    const prompts = surface.listPrompts();
    for (const { name } of prompts) {
      try {
        surface.getPrompt(name);
      } catch (err) {
        failures.push(`prompt ${name} — ${err.message}`);
      }
    }
    details.push(`${prompts.length} prompts (${prompts.map(p => p.name).join(', ')}) — dsds prompt <name>`);

    const resources = surface.listResources();
    const unreadable = [];
    for (const { uri } of resources) {
      try {
        if (!surface.readResource(uri)) unreadable.push(`${uri} — not readable`);
      } catch (err) {
        unreadable.push(`${uri} — ${err.message}`);
      }
    }
    failures.push(...unreadable);
    details.push(`${resources.length} resources — dsds resource <uri>`);

    try {
      const instructions = surface.getInstructions();
      details.push(`${instructions.length} chars of agent instructions — dsds instructions`);
    } catch (err) {
      failures.push(`instructions — ${err.message}`);
    }

    add('mcp surface', failures.length > 0 ? 'fail' : 'pass', failures.length > 0 ? failures : details);
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const failed = checks.filter(c => c.status === 'fail');
  const code = failed.length > 0 ? 2 : 0;

  if (json) {
    process.stdout.write(
      JSON.stringify({ ok: code === 0, exitCode: code, bundledSpecVersion: BUNDLED_VERSION, checks }, null, 2) + '\n'
    );
  } else {
    const icon = { pass: '✓', fail: '✗', skip: '–', warn: '!' };
    const lines = [`dsds doctor — bundled spec ${BUNDLED_VERSION}`, ''];
    for (const check of checks) {
      lines.push(`${icon[check.status]} ${check.name}`);
      const limit = check.status === 'pass' ? 3 : 20;
      for (const detail of check.details.slice(0, limit)) lines.push(`    ${detail}`);
      if (check.details.length > limit) lines.push(`    … ${check.details.length - limit} more`);
    }
    const warned = checks.filter(c => c.status === 'warn').length;
    const warnNote = warned ? ` (${warned} warning${warned === 1 ? '' : 's'})` : '';
    lines.push('', failed.length > 0 ? `✗ ${failed.length} check(s) failed${warnNote}` : `✓ all checks passed${warnNote}`);
    process.stdout.write(lines.join('\n') + '\n');
  }

  return code;
}
