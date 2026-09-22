#!/usr/bin/env node
// Render a DSDS corpus to Markdown pages.
//
//   dsds-markdown <config-or-index> [--out <dir>] [--id <identifier>] [--agent-content]
//
// With --id, one page goes to stdout. Without it, every entry in the loaded
// corpus is written to --out as <identifier>.md.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadSystems } from 'dsds-mcp/src/loader.js';
import { resolveConfig } from 'dsds-mcp/src/config.js';
import { entityToMarkdown } from './render.js';

const USAGE = `Usage: dsds-markdown [options]

Renders every entry of the loaded DSDS corpus as a Markdown page.

Options:
  --paths <file[,file]>  DSDS documents to load. Defaults to the resolved
                         dsds config (DSDS_CONFIG, dsds.config.mjs, DSDS_PATHS).
  --out <dir>            Write <identifier>.md per entry. Required unless --id.
  --id <identifier>      Render one entry to stdout instead.
  --agent-content        Include sections marked \`for: agent\`.
  --help                 Show this message.`;

const { values } = parseArgs({
  options: {
    paths: { type: 'string' },
    out: { type: 'string' },
    id: { type: 'string' },
    'agent-content': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  process.stdout.write(USAGE + '\n');
  process.exit(0);
}

const config = await resolveConfig({});
const paths = values.paths
  ? values.paths.split(',').map(p => resolve(p.trim())).filter(Boolean)
  : config.paths;

if (paths.length === 0) {
  process.stderr.write('dsds-markdown: no DSDS documents configured. Pass --paths, or set DSDS_PATHS / a dsds.config file.\n');
  process.exit(1);
}

const { systems, errors } = await loadSystems(paths);
for (const e of errors) process.stderr.write(`dsds-markdown: failed to load ${e.path}: ${e.error}\n`);

const entities = systems.flatMap(s => s.entities).filter(e => e.identifier);
if (entities.length === 0) {
  process.stderr.write('dsds-markdown: loaded no entries.\n');
  process.exit(1);
}

const propsConfig = { propsExtractorDir: config.propsExtractorDir, uiSourceRoot: config.uiSourceRoot };
const options = { includeAgentContent: values['agent-content'] };

if (values.id) {
  const entity = entities.find(e => e.identifier.toLowerCase() === values.id.toLowerCase());
  if (!entity) {
    process.stderr.write(`dsds-markdown: no entry "${values.id}". Loaded ${entities.length}.\n`);
    process.exit(1);
  }
  process.stdout.write(entityToMarkdown(entity, propsConfig, options) + '\n');
  process.exit(0);
}

if (!values.out) {
  process.stderr.write('dsds-markdown: --out <dir> is required when rendering the whole corpus.\n');
  process.exit(1);
}

const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

let written = 0;
for (const entity of entities) {
  const text = entityToMarkdown(entity, propsConfig, options);
  await writeFile(join(outDir, `${entity.identifier}.md`), text + '\n', 'utf-8');
  written++;
}
process.stdout.write(`dsds-markdown: wrote ${written} page${written === 1 ? '' : 's'} to ${outDir}\n`);
