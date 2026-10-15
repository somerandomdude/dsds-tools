#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderLayoutPreview } from './layout-preview-core.mjs';

const { values } = parseArgs({ options: { result: { type: 'string' }, out: { type: 'string' } } });
if (!values.result) throw new Error('Usage: node scripts/render-layout-preview.mjs --result <run.json> [--out <page.html>]');
const resultPath = resolve(values.result);
const outputPath = values.out ? resolve(values.out) : resolve(dirname(resultPath), `${basename(resultPath, extname(resultPath))}.html`);
writeFileSync(outputPath, renderLayoutPreview(JSON.parse(readFileSync(resultPath, 'utf8'))), 'utf8');
console.log(`Preview: ${outputPath}`);
