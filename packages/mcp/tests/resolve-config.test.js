import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveConfig, findConfigFile, CONFIG_FILENAMES } from '../src/config.js';

const ENV_KEYS = [
  'DSDS_CONFIG', 'DSDS_PATHS', 'DSDS_INTRO_PATHS', 'DSDS_INTRO_PATH', 'DSDS_SCHEMA_VERSION',
  'LINT_PATHS', 'LINT_PLUGINS', 'LINT_RESOLVE_DIR', 'LINT_SOURCE_DIR',
  'PACKAGE_EXPORT_PATHS', 'ICON_PACKAGE', 'DSDS_ENABLE_FEEDBACK', 'DSDS_INTRO_INLINE',
  'DSDS_FEEDBACK_DIR', 'DSDS_LOGS_DIR',
];

describe('resolveConfig', () => {
  const orig = { ...process.env };
  let dir;

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    dir = mkdtempSync(join(tmpdir(), 'dsds-config-'));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (orig[key] === undefined) delete process.env[key];
      else process.env[key] = orig[key];
    }
  });

  it('returns env/default config with null meta when no file exists', async () => {
    const config = await resolveConfig({ cwd: dir });
    expect(config.meta.configFile).toBeNull();
    expect(config.meta.configFileError).toBeNull();
    expect(config.paths).toEqual([]);
  });

  it('loads a JSON config file and resolves relative paths against its directory', async () => {
    writeFileSync(join(dir, 'dsds.config.json'), JSON.stringify({
      paths: ['./docs/system.dsds.json'],
      lintPlugins: ['eslint-plugin-x'],
      packageExportPaths: { '@acme/ui': './node_modules/@acme/ui' },
      enableFeedback: false,
    }));
    const config = await resolveConfig({ cwd: dir });
    expect(config.meta.configFile).toBe(resolve(dir, 'dsds.config.json'));
    expect(config.paths).toEqual([resolve(dir, 'docs/system.dsds.json')]);
    expect(config.lintPlugins).toEqual(['eslint-plugin-x']);
    expect(config.packageExportPaths.get('@acme/ui')).toBe(resolve(dir, 'node_modules/@acme/ui'));
    expect(config.enableFeedback).toBe(false);
  });

  it('loads an .mjs config file', async () => {
    writeFileSync(join(dir, 'dsds.config.mjs'), `export default { paths: ['./a.dsds.json'], iconPackage: '@acme/icons' };\n`);
    const config = await resolveConfig({ cwd: dir });
    expect(config.paths).toEqual([resolve(dir, 'a.dsds.json')]);
    expect(config.iconPackage).toBe('@acme/icons');
  });

  it('discovers the config file by walking up from a nested cwd', async () => {
    writeFileSync(join(dir, 'dsds.config.json'), JSON.stringify({ paths: ['./root.dsds.json'] }));
    const nested = join(dir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    const config = await resolveConfig({ cwd: nested });
    expect(config.meta.configFile).toBe(resolve(dir, 'dsds.config.json'));
    expect(config.paths).toEqual([resolve(dir, 'root.dsds.json')]);
  });

  it('lets environment variables win per key over the file', async () => {
    writeFileSync(join(dir, 'dsds.config.json'), JSON.stringify({
      paths: ['./from-file.dsds.json'],
      lintPlugins: ['eslint-plugin-from-file'],
    }));
    process.env['DSDS_PATHS'] = '/from/env.dsds.json';
    const config = await resolveConfig({ cwd: dir });
    expect(config.paths).toEqual(['/from/env.dsds.json']);           // env wins
    expect(config.lintPlugins).toEqual(['eslint-plugin-from-file']); // file fills the rest
  });

  it('honors an explicit configPath option', async () => {
    const custom = join(dir, 'custom.config.json');
    writeFileSync(custom, JSON.stringify({ paths: ['./x.dsds.json'] }));
    const config = await resolveConfig({ cwd: tmpdir(), configPath: custom });
    expect(config.meta.configFile).toBe(custom);
    expect(config.paths).toEqual([resolve(dir, 'x.dsds.json')]);
  });

  it('honors the DSDS_CONFIG environment variable', async () => {
    const custom = join(dir, 'via-env.config.json');
    writeFileSync(custom, JSON.stringify({ schemaVersion: '9.9.9' }));
    process.env['DSDS_CONFIG'] = custom;
    const config = await resolveConfig({ cwd: tmpdir() });
    expect(config.meta.configFile).toBe(custom);
    expect(config.schemaVersion).toBe('9.9.9');
  });

  it('reports a missing explicit config file as an error and falls back to env', async () => {
    const config = await resolveConfig({ cwd: dir, configPath: join(dir, 'nope.config.json') });
    expect(config.meta.configFile).toBeNull();
    expect(config.meta.configFileError).toContain('not found');
    expect(config.paths).toEqual([]);
  });

  it('reports an unparseable file as an error and falls back to env', async () => {
    writeFileSync(join(dir, 'dsds.config.json'), '{ not json');
    process.env['DSDS_PATHS'] = '/env/wins.dsds.json';
    const config = await resolveConfig({ cwd: dir });
    expect(config.meta.configFileError).toContain('failed to load');
    expect(config.paths).toEqual(['/env/wins.dsds.json']);
  });

  it('accepts comma-separated strings for list keys', async () => {
    writeFileSync(join(dir, 'dsds.config.json'), JSON.stringify({ paths: './a.json, ./b.json' }));
    const config = await resolveConfig({ cwd: dir });
    expect(config.paths).toEqual([resolve(dir, 'a.json'), resolve(dir, 'b.json')]);
  });
});

describe('findConfigFile', () => {
  it('prefers mjs over js over json in the same directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsds-config-order-'));
    writeFileSync(join(dir, 'dsds.config.json'), '{}');
    writeFileSync(join(dir, 'dsds.config.mjs'), 'export default {};\n');
    expect(findConfigFile(dir)).toBe(resolve(dir, CONFIG_FILENAMES[0]));
  });
});
