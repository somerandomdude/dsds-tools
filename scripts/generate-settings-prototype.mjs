#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { OLLAMA_ENDPOINT, buildOllamaRequest, extractOllamaMetrics, sha256 } from './local-model-evaluation-core.mjs';
import { ENTITIES, makePrompt, validateResponse, validateCompletion } from './settings-prototype-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultManifestPath = join(root, 'evaluations/manifests/settings-page.json');

export function loadManifest(manifestPath = defaultManifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Manifest must be an object');
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) throw new Error('Manifest id is required');
  if (manifest.promptKind !== 'settings-page') throw new Error(`Unsupported prompt kind: ${manifest.promptKind ?? 'missing'}`);
  if (typeof manifest.config !== 'string' || !manifest.config.trim()) throw new Error('Manifest config is required');
  if (!Array.isArray(manifest.entities) || !manifest.entities.length || manifest.entities.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Manifest entities must be nonempty strings');
  if (new Set(manifest.entities).size !== manifest.entities.length) throw new Error('Manifest entities must be unique');
  if (manifest.entities.length !== ENTITIES.length || ENTITIES.some(id => !manifest.entities.includes(id))) throw new Error('The settings-page prompt requires the six settings entities');
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Manifest dependencies must be strings');
  if (!Array.isArray(manifest.requiredSourceFiles) || manifest.requiredSourceFiles.some(path => typeof path !== 'string' || !path.trim() || path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Manifest source files must be relative paths');
  const preview = manifest.preview ?? {};
  if (preview.sourceRoot != null && (typeof preview.sourceRoot !== 'string' || !preview.sourceRoot.trim() || preview.sourceRoot.startsWith('/') || preview.sourceRoot.split('/').includes('..'))) throw new Error('Manifest preview sourceRoot must be a relative path or null');
  if (preview.mount != null && (typeof preview.mount !== 'string' || !preview.mount.trim() || preview.mount.startsWith('/') || preview.mount.split('/').includes('..'))) throw new Error('Manifest preview mount must be a relative path');
  return { ...manifest, manifestPath, preview: { sourceRoot: null, mount: 'src', ...preview } };
}

export function collectEvidence(consumer, config, manifest = loadManifest()) {
  const env = { ...process.env };
  // The explicit experiment config must win over a shell's legacy corpus.
  delete env.DSDS_PATHS;
  delete env.DSDS_LOGS_DIR;
  function cli(args) {
    const result = spawnSync(process.execPath, [join(root, 'packages/cli/src/index.js'), ...args, '--config', config, '--json'], { cwd: consumer, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 2_000_000 });
    if (result.status !== 0) throw new Error(`DSDS ${args.join(' ')} failed: ${result.stderr || result.stdout || result.error}`);
    return JSON.parse(result.stdout);
  }
  const doctor = cli(['doctor']);
  const evidence = Object.fromEntries(manifest.entities.map(id => {
    const result = cli(['context', id]);
    if (!result.ok || typeof result.data !== 'string' || !result.data.trim()) throw new Error(`Missing context for ${id}`);
    return [id, result.data];
  }));
  const dependencies = Object.fromEntries(manifest.dependencies.map(id => [id, cli(['deps', id])]));
  return { evidence, doctor, dependencies };
}

function noSymlinks(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Source snapshot cannot include symlinks: ${path}`);
    if (stat.isDirectory()) noSymlinks(path);
  }
}

export function materialize(runDir, response, consumer, manifest = loadManifest()) {
  // Caller has validated the response; defend the write boundary independently.
  const paths = response.files.map(file => file.path);
  if (paths.length !== 2 || new Set(paths).size !== 2 || paths.some(path => !['index.html', 'settings-page.js'].includes(path))) throw new Error('Invalid output paths');
  const web = join(runDir, 'web');
  mkdirSync(web); // Exclusive: never reuse another run's files.
  if (manifest.preview.sourceRoot) {
    const sourceRoot = join(consumer, manifest.preview.sourceRoot);
    noSymlinks(sourceRoot);
    cpSync(sourceRoot, join(web, manifest.preview.mount), { recursive: true, errorOnExist: true, force: false });
  }
  for (const file of response.files) writeFileSync(join(web, file.path), file.content, { flag: 'wx' });
  return web;
}

function revision(dir) {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout?.trim() || null;
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    consumer: { type: 'string', default: '../dsdsds' }, config: { type: 'string' },
    manifest: { type: 'string', default: 'evaluations/manifests/settings-page.json' },
    model: { type: 'string', default: 'qwen2.5-coder:7b' }, response: { type: 'string' },
    'dry-run': { type: 'boolean', default: false }, 'no-repair': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log('generate:local --consumer <repo> [--model <tag>] [--dry-run | --response <saved-response.txt>] [--no-repair]\nCreates a unique evaluation run. Replay never calls Ollama. Preview with npm run preview:local -- --run <printed directory>.'); return; }
  if (values.response && values['dry-run']) throw new Error('Choose --response or --dry-run');
  const consumer = realpathSync(resolve(values.consumer));
  const manifestPath = isAbsolute(values.manifest) ? values.manifest : resolve(root, values.manifest);
  const manifest = loadManifest(manifestPath);
  const config = resolve(consumer, values.config ?? manifest.config);
  const packet = collectEvidence(consumer, config, manifest);
  for (const path of manifest.requiredSourceFiles) readFileSync(join(consumer, path));
  const prompt = makePrompt(packet.evidence);
  const outputRoot = join(root, 'evaluations/results');
  mkdirSync(outputRoot, { recursive: true });
  const runDir = mkdtempSync(join(outputRoot, 'settings-'));
  const save = (name, value) => writeFileSync(join(runDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), { flag: 'wx' });
  save('evidence.json', packet);
  save('prompt.txt', prompt);
  const sourceFiles = manifest.requiredSourceFiles;
  const sourceHashes = () => Object.fromEntries(sourceFiles.map(path => [path, sha256(readFileSync(join(consumer, path), 'utf8'))]));
  const report = { version: 1, manifest: manifest.id, manifestSha256: sha256(JSON.stringify(manifest)), consumer, consumerRevision: revision(consumer), toolsRevision: revision(root), sourceHashes: sourceHashes(), model: values.model, modelDigest: null, promptSha256: sha256(prompt), evidenceSha256: sha256(JSON.stringify(packet.evidence)), status: 'started', attempts: [], browserVerification: 'not_run' };
  console.log(`Run: ${runDir}`);
  if (values['dry-run']) { report.status = 'dry_run'; save('report.json', report); console.log('Evidence and prompt saved. No model called or preview written.'); return runDir; }
  const messages = [{ role: 'user', content: prompt }];
  try {
    if (!values.response) {
      const tags = await fetch(new URL('/api/tags', OLLAMA_ENDPOINT), { signal: AbortSignal.timeout(10_000) });
      if (!tags.ok) throw new Error(`Ollama model inventory HTTP ${tags.status}`);
      const installed = (await tags.json()).models?.find(model => model.name === values.model || model.model === values.model);
      if (!installed) throw new Error(`Model ${values.model} is not installed in Ollama`);
      report.modelDigest = installed.digest ?? null;
    }
    const maxAttempts = values.response || values['no-repair'] ? 1 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const request = { ...buildOllamaRequest(values.model, prompt), messages: [...messages] };
      request.options.num_ctx = 16384;
      request.options.num_predict = 4096;
      // Conservative byte budget is a guard, not an exact tokenizer count.
      if (Buffer.byteLength(JSON.stringify(messages)) + 4096 * 4 > 16384 * 3) throw new Error('Evidence plus repair exceeds the conservative context budget; refusing to truncate');
      save(`request-${attempt}.json`, request);
      console.log(values.response ? 'Checking saved Qwen response…' : `Qwen attempt ${attempt}/${maxAttempts} (local; up to 5 minutes)…`);
      const started = Date.now();
      let raw, payload;
      if (values.response) raw = readFileSync(resolve(values.response), 'utf8');
      else {
        const result = await fetch(OLLAMA_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(300_000) });
        if (!result.ok) throw new Error(`Ollama HTTP ${result.status}: ${(await result.text()).slice(0, 1000)}`);
        payload = await result.json();
        save(`ollama-${attempt}.json`, payload);
        raw = payload.message?.content ?? '';
      }
      save(`response-${attempt}.txt`, raw);
      const validation = payload ? validateCompletion(payload, packet.evidence) : validateResponse(raw, packet.evidence);
      const entry = { attempt, wallClockMs: Date.now() - started, metrics: payload ? extractOllamaMetrics(payload) : null, errors: validation.errors };
      report.attempts.push(entry);
      if (!validation.errors.length && validation.abstained) { report.status = 'insufficient_evidence'; report.gaps = validation.response.gaps; console.log(`Insufficient evidence: ${report.gaps.join('; ')}`); break; }
      if (!validation.errors.length) {
        if (JSON.stringify(sourceHashes()) !== JSON.stringify(report.sourceHashes)) throw new Error('Consumer source changed during generation; rerun to collect fresh evidence');
        materialize(runDir, validation.response, consumer, manifest);
        report.status = 'preview_created';
        console.log('Preview files created; static checks passed. Browser behavior still needs verification.');
        console.log(`Preview command: npm run preview:local -- --run ${runDir}`);
        break;
      }
      report.status = 'rejected';
      console.log(`Rejected: ${validation.errors.join('\n  ')}`);
      if (attempt < maxAttempts) messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Repair the complete JSON response using the original evidence. Fix these checks:\n${validation.errors.join('\n')}\nReturn both complete files and exact evidence quotes. No explanations outside JSON.` });
    }
  } catch (error) { report.status = 'error'; report.error = error.message; console.error(error.message); }
  save('report.json', report);
  if (report.status !== 'preview_created') process.exitCode = 2;
  return runDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(error => { console.error(error.message); process.exitCode = 1; });
