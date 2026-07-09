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
import { loadSystems } from 'dsds-mcp/src/loader.js';
import { validateDocument } from 'dsds-mcp/src/validator.js';
import { buildGraph, integrity as graphIntegrity } from 'dsds-mcp/src/graph.js';
import {
  checkExampleProps,
  checkIconImports,
  checkKindReferences,
  checkVersions,
  parseIconExports,
} from 'dsds-mcp/src/integrity.js';
import { BUILD_BRIEF } from 'dsds-mcp/src/briefs.js';
import { BUNDLED_VERSION } from 'dsds-mcp/src/spec/version.js';

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
      const rootResult = validateDocument(system.document);
      if (!rootResult.valid) {
        const first = rootResult.errors[0];
        problems.push(`${basename(system.filePath)}: ${rootResult.errors.length} schema error(s) — first: ${first.path}: ${first.message}`);
      }
      for (const refFile of collectRefFiles(system.document, system.filePath)) {
        filesChecked += 1;
        try {
          const doc = JSON.parse(readFileSync(refFile, 'utf-8'));
          const result = validateDocument(doc);
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
