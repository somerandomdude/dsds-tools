import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { loadSystems, summarizeEntities } from './loader.js';

const DEBOUNCE_MS = 200;

/**
 * Watches all configured DSDS paths for changes.
 * On change, reloads the affected file and updates state in place so
 * all in-flight tool calls see the new data on their next invocation.
 */
export function startWatching(paths, state) {
  if (!paths.length) return;

  const debounces = new Map();

  for (const p of paths) {
    const absPath = resolve(p);
    try {
      watch(absPath, () => {
        clearTimeout(debounces.get(absPath));
        debounces.set(
          absPath,
          setTimeout(() => reloadFile(absPath, state), DEBOUNCE_MS)
        );
      });
    } catch (err) {
      process.stderr.write(`[dsds-mcp] Cannot watch ${absPath}: ${err.message}\n`);
    }
  }
}

async function reloadFile(absPath, state) {
  const { systems: fresh, errors } = await loadSystems([absPath]);

  if (errors.length > 0) {
    process.stderr.write(`[dsds-mcp] Reload error ${absPath}: ${errors[0].error}\n`);
    return;
  }

  if (fresh.length === 0) return;

  const idx = state.systems.findIndex(s => s.filePath === absPath);
  if (idx >= 0) {
    state.systems[idx] = fresh[0];
  } else {
    state.systems.push(fresh[0]);
  }

  state.summaries = summarizeEntities(state.systems);
  process.stderr.write(
    `[dsds-mcp] Reloaded ${absPath} (${fresh[0].entities.length} entities)\n`
  );
}
