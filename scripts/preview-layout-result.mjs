#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const defaultSchemaSite = resolve(root, '../design-system-documentation-schema/site');
const { values } = parseArgs({ options: { html: { type: 'string' }, port: { type: 'string', default: '4173' }, 'docs-site': { type: 'string', default: defaultSchemaSite } } });
if (!values.html) throw new Error('Usage: node scripts/preview-layout-result.mjs --html <page.html> [--port 4173]');
const htmlPath = resolve(values.html);
const docsSite = resolve(values['docs-site']);
const port = Number(values.port);
if (!existsSync(htmlPath) || !existsSync(docsSite) || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview path or port');

const mime = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = path === '/' ? htmlPath
      : path === '/layout-preview.css' ? resolve(root, 'scripts/layout-preview.css')
      : path.startsWith('/docs-site/') ? resolve(docsSite, `.${path.slice('/docs-site'.length)}`)
      : null;
    if (!file || !file.startsWith(docsSite) && file !== htmlPath && !file.startsWith(resolve(root, 'scripts/'))) throw new Error('Not found');
    const type = mime[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/ (${basename(htmlPath)})`));
