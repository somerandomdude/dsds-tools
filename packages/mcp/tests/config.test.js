import { homedir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const orig = { ...process.env };

  afterEach(() => {
    for (const key of ['DSDS_PATHS', 'DSDS_SCHEMA_VERSION', 'LINT_PLUGINS', 'LINT_RESOLVE_DIR', 'DSDS_ENABLE_FEEDBACK']) {
      if (orig[key] === undefined) delete process.env[key];
      else process.env[key] = orig[key];
    }
  });

  it('enables feedback by default', () => {
    delete process.env['DSDS_ENABLE_FEEDBACK'];
    expect(loadConfig().enableFeedback).toBe(true);
  });

  it('disables feedback for falsy DSDS_ENABLE_FEEDBACK values', () => {
    for (const v of ['false', '0', 'no', 'off', 'OFF', 'False']) {
      process.env['DSDS_ENABLE_FEEDBACK'] = v;
      expect(loadConfig().enableFeedback, `value ${v}`).toBe(false);
    }
  });

  it('keeps feedback enabled for truthy DSDS_ENABLE_FEEDBACK values', () => {
    for (const v of ['true', '1', 'yes', 'on']) {
      process.env['DSDS_ENABLE_FEEDBACK'] = v;
      expect(loadConfig().enableFeedback, `value ${v}`).toBe(true);
    }
  });

  it('returns empty paths when DSDS_PATHS is not set', () => {
    delete process.env['DSDS_PATHS'];
    const config = loadConfig();
    expect(config.paths).toEqual([]);
  });

  it('splits DSDS_PATHS by comma', () => {
    process.env['DSDS_PATHS'] = '/a/b.json,/c/d.json';
    const config = loadConfig();
    expect(config.paths).toEqual(['/a/b.json', '/c/d.json']);
  });

  it('trims whitespace from paths', () => {
    process.env['DSDS_PATHS'] = '  /a/b.json , /c/d.json  ';
    const config = loadConfig();
    expect(config.paths).toEqual(['/a/b.json', '/c/d.json']);
  });

  it('filters empty strings from paths', () => {
    process.env['DSDS_PATHS'] = '/a/b.json,,/c/d.json';
    const config = loadConfig();
    expect(config.paths).toEqual(['/a/b.json', '/c/d.json']);
  });

  it('defaults schemaVersion to the bundled spec version', () => {
    delete process.env['DSDS_SCHEMA_VERSION'];
    const config = loadConfig();
    expect(config.schemaVersion).toBe('0.13.0');
  });

  it('uses DSDS_SCHEMA_VERSION when set', () => {
    process.env['DSDS_SCHEMA_VERSION'] = '0.3.0';
    const config = loadConfig();
    expect(config.schemaVersion).toBe('0.3.0');
  });

  it('expands ~ in DSDS_PATHS to the home directory', () => {
    process.env['DSDS_PATHS'] = '~/Documents/design.dsds.json';
    const config = loadConfig();
    expect(config.paths).toEqual([`${homedir()}/Documents/design.dsds.json`]);
  });

  it('expands ~ in DSDS_PATHS with multiple paths', () => {
    process.env['DSDS_PATHS'] = '~/a.dsds.json,/absolute/b.dsds.json';
    const config = loadConfig();
    expect(config.paths).toEqual([`${homedir()}/a.dsds.json`, '/absolute/b.dsds.json']);
  });

  it('returns empty lintPlugins when LINT_PLUGINS is not set', () => {
    delete process.env['LINT_PLUGINS'];
    const config = loadConfig();
    expect(config.lintPlugins).toEqual([]);
  });

  it('splits LINT_PLUGINS by comma', () => {
    process.env['LINT_PLUGINS'] = 'eslint-plugin-a,eslint-plugin-b';
    const config = loadConfig();
    expect(config.lintPlugins).toEqual(['eslint-plugin-a', 'eslint-plugin-b']);
  });

  it('trims whitespace from LINT_PLUGINS', () => {
    process.env['LINT_PLUGINS'] = '  eslint-plugin-a , eslint-plugin-b  ';
    const config = loadConfig();
    expect(config.lintPlugins).toEqual(['eslint-plugin-a', 'eslint-plugin-b']);
  });

  it('defaults lintResolveDir to cwd when LINT_RESOLVE_DIR is not set', () => {
    delete process.env['LINT_RESOLVE_DIR'];
    const config = loadConfig();
    expect(config.lintResolveDir).toBe(process.cwd());
  });

  it('sets lintResolveDir from LINT_RESOLVE_DIR', () => {
    process.env['LINT_RESOLVE_DIR'] = '/some/project';
    const config = loadConfig();
    expect(config.lintResolveDir).toBe('/some/project');
  });

  it('expands ~ in LINT_RESOLVE_DIR', () => {
    process.env['LINT_RESOLVE_DIR'] = '~/my-project';
    const config = loadConfig();
    expect(config.lintResolveDir).toBe(`${homedir()}/my-project`);
  });
});
