import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';

// `logsDir` always holds a path — it defaults to the dsds-mcp package's own
// logs/ — so a consumer cannot tell "log here" from "nobody asked". The
// long-lived MCP server wants that default; a one-shot CLI and a test suite
// must not have it. `logsDirExplicit` is what separates the two.
//
// The symptom that prompted this: the CLI test suite appended "Test Chunk"
// fixture records to the real usage log, 9% of a day's chunk telemetry.
const withEnv = async (env, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

describe('config.logsDirExplicit', () => {
  it('is false when nothing asked for logging, even though logsDir has a path', async () => {
    await withEnv({ DSDS_LOGS_DIR: undefined, DSDS_CONFIG: undefined }, async () => {
      const cfg = await resolveConfig();
      expect(cfg.logsDir).toBeTruthy();
      expect(cfg.logsDirExplicit).toBe(false);
    });
  });

  it('is true when DSDS_LOGS_DIR is set', async () => {
    await withEnv({ DSDS_LOGS_DIR: '/tmp/dsds-logs-test', DSDS_CONFIG: undefined }, async () => {
      const cfg = await resolveConfig();
      expect(cfg.logsDirExplicit).toBe(true);
      expect(cfg.logsDir).toBe('/tmp/dsds-logs-test');
    });
  });
});
