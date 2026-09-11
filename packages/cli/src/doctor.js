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
import { validateDocument } from 'dsds-mcp/src/validator.js';
import { looksLike20, validateDoc20 } from 'dsds-mcp/src/spec/validator-0.20.0.js';
import { loadYaml20 } from 'dsds-mcp/src/spec/dsds20-lib.js';
import { buildGraph, createGraphGetter, integrity as graphIntegrity } from 'dsds-mcp/src/graph.js';
import {
  checkExampleProps,
  checkIconImports,
  checkKindReferences,
  checkVersions,
  parseIconExports,
} from 'dsds-mcp/src/integrity.js';
import { BUILD_BRIEF } from 'dsds-mcp/src/briefs.js';
import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';

// Dispatches to the real 0.20.0 validator for a real 0.20.0 document (YAML
// entries/sections shape), the legacy validator otherwise — mirrors the
// dsds_validate MCP tool's own auto-detection so `dsds doctor` doesn't run
// the wrong schema against a real 0.20.0 doc (it did, before this: every
// 0.20.0 document failed with "(root): must have required property
// 'entityGroups'", a legacy-only field).
function validateAny(doc, filePath) {
  if (looksLike20(doc)) {
    const { errors, warnings } = validateDoc20(doc, { filePath });
    // DSDS-11 (a sourceFiles/source/rel:file href that doesn't exist on
    // disk) only runs when filePath is supplied — doctor always has one,
    // unlike the dsds_validate MCP tool's pasted-document case — and is
    // exactly the kind of "does this actually point at something real"
    // build-health problem doctor already looks for elsewhere, so it's
    // folded into `errors` here rather than silently dropped.
    const fileRefWarnings = warnings.filter((w) => w.startsWith('[DSDS-11]'));
    return {
      valid: errors.length === 0 && fileRefWarnings.length === 0,
      errors: [...errors, ...fileRefWarnings].map(message => ({ path: '(root)', message })),
    };
  }
  return validateDocument(doc);
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
      filesChecked += 1;
      const rootResult = validateAny(loadFreshForValidation(system.filePath), system.filePath);
      if (!rootResult.valid) {
        const first = rootResult.errors[0];
        problems.push(`${basename(system.filePath)}: ${rootResult.errors.length} schema error(s) — first: ${first.path}: ${first.message}`);
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
    const icon = { pass: '✓', fail: '✗', skip: '–' };
    const lines = [`dsds doctor — bundled spec ${BUNDLED_VERSION}`, ''];
    for (const check of checks) {
      lines.push(`${icon[check.status]} ${check.name}`);
      const limit = check.status === 'pass' ? 3 : 20;
      for (const detail of check.details.slice(0, limit)) lines.push(`    ${detail}`);
      if (check.details.length > limit) lines.push(`    … ${check.details.length - limit} more`);
    }
    lines.push('', failed.length > 0 ? `✗ ${failed.length} check(s) failed` : '✓ all checks passed');
    process.stdout.write(lines.join('\n') + '\n');
  }

  return code;
}
