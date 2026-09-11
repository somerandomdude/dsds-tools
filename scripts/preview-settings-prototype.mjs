#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CSP } from './settings-prototype-core.mjs';

export function startPreview(runDir, port = 0) {
  const report = JSON.parse(readFileSync(join(runDir, 'report.json'), 'utf8'));
  if (report.status !== 'preview_created') throw new Error('This run has no validated preview');
  const web = realpathSync(join(runDir, 'web'));
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path === '/__checks' || path === '/__checks.js') {
        const filename = path === '/__checks' ? 'settings-preview-checks.html' : 'settings-preview-checks.js';
        const body = readFileSync(new URL(filename, import.meta.url));
        res.writeHead(200, { 'content-type': path === '/__checks' ? 'text/html' : 'text/javascript', 'content-security-policy': CSP.replace("frame-src 'none'", "frame-src 'self'"), 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body); return;
      }
      if (path !== '/' && path !== '/index.html' && path !== '/settings-page.js' && !path.startsWith('/src/')) throw new Error('Not served');
      const file = realpathSync(resolve(web, '.' + (path === '/' ? '/index.html' : path)));
      if (!file.startsWith(web + sep) || !mime[extname(file)]) throw new Error('Not served');
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': mime[extname(file)], 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}/\nBrowser checks: http://127.0.0.1:${server.address().port}/__checks\nCtrl+C stops the preview.`));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { run: { type: 'string' }, port: { type: 'string', default: '0' } } });
    if (!values.run) throw new Error('Required: --run <generated run directory>');
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    startPreview(resolve(values.run), port);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
