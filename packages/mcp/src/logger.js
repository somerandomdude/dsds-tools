import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Append one JSON line to logs/YYYY-MM-DD.jsonl.
 *
 * Best-effort: never throws, so a write failure can't break the tool call that
 * triggered it. A no-op when `logsDir` is falsy (logging disabled). The entry is
 * stamped with an ISO `timestamp` unless it already carries one.
 *
 * Every entry SHOULD include a `type` discriminator ('tool' | 'chunk' | 'lint')
 * so log readers can classify it without inferring from shape.
 */
export async function writeLog(logsDir, entry) {
  if (!logsDir) return;
  try {
    await mkdir(logsDir, { recursive: true });
    const now = new Date();
    const logPath = join(logsDir, `${now.toISOString().slice(0, 10)}.jsonl`);
    const record = { timestamp: now.toISOString(), ...entry };
    await appendFile(logPath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    /* best-effort — logging must never fail a tool call */
  }
}
