#!/usr/bin/env node
/**
 * Batch-test of dsds_to_markdown: render every entity JSON in a DSDS tree to
 * Markdown, mirroring the source directory layout into an output dir. Drives
 * the exact handler the MCP tool uses (toMarkdownHandler + loadSystems).
 *
 *   node scripts/export-markdown.js <dsds-root> <system-file.json> <out-dir>
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { loadSystems } from '../src/loader.js';
import { toMarkdownHandler } from '../src/tools/to-markdown.js';

const [dsdsRoot, systemFile, outDir] = process.argv.slice(2);
if (!dsdsRoot || !systemFile || !outDir) {
  console.error('Usage: export-markdown.js <dsds-root> <system-file.json> <out-dir>');
  process.exit(1);
}

// Recursively collect every .json under the root.
async function findJson(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') out.push(...await findJson(p));
    } else if (e.name.endsWith('.json')) {
      out.push(p);
    }
  }
  return out;
}

const { systems, errors: loadErrors } = await loadSystems([resolve(systemFile)]);
for (const e of loadErrors ?? []) console.warn(`⚠ load error: ${e.path} — ${e.error}`);
const getSystems = () => systems;

const files = (await findJson(resolve(dsdsRoot))).sort();
const stats = { rendered: 0, skippedSystem: 0, notFound: [], empty: [], errored: [] };

for (const file of files) {
  const rel = relative(resolve(dsdsRoot), file);
  let doc;
  try {
    doc = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    stats.errored.push(`${rel}: bad JSON — ${err.message}`);
    continue;
  }

  // The system manifest has no `.entity` — it references entities via $ref.
  if (!doc.entity) {
    stats.skippedSystem++;
    console.log(`· ${rel} — system manifest (no single entity to render), skipped`);
    continue;
  }

  const identifier = doc.entity.identifier ?? doc.entity.name;
  const outPath = join(resolve(outDir), rel.replace(/\.json$/, '.md'));
  await mkdir(dirname(outPath), { recursive: true });

  const result = await toMarkdownHandler({ identifier }, getSystems);
  const text = result?.content?.[0]?.text ?? '';

  if (result?.isError) {
    stats.notFound.push(`${rel} (identifier="${identifier}"): ${text.split('\n')[0]}`);
    continue;
  }
  if (!text.trim()) {
    stats.empty.push(`${rel} (identifier="${identifier}")`);
  }
  await writeFile(outPath, text, 'utf8');
  stats.rendered++;
}

console.log('\n=== dsds_to_markdown batch ===');
console.log(`Source JSON files:   ${files.length}`);
console.log(`Rendered to .md:     ${stats.rendered}`);
console.log(`System manifest:     ${stats.skippedSystem} skipped`);
console.log(`Entity not found:    ${stats.notFound.length}`);
console.log(`Rendered but empty:  ${stats.empty.length}`);
console.log(`Errored:             ${stats.errored.length}`);
for (const m of stats.notFound) console.log(`  not-found: ${m}`);
for (const m of stats.empty) console.log(`  empty:     ${m}`);
for (const m of stats.errored) console.log(`  error:     ${m}`);
