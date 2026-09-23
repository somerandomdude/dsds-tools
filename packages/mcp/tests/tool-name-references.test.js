// No agent-facing string may name a tool this server does not register.
//
// Added 2026-09-22. `dsds_lint_by_path` and `dsds_lint_inline` were
// consolidated into one `dsds_lint`, but four strings kept the old names —
// two of them inside ERROR messages, so an agent that hit a missing-file
// error was told, at its most confused moment, to call a tool that does not
// exist. A skill adapter note likewise still pointed at
// `dsds_spec_scaffold` / `dsds_author_component_doc`, both removed.
//
// Nothing caught it: the tool-name assertions in lint-code.test.js were
// pinning the stale names, so the suite actively defended the bug. The
// downstream cost was real — agent-tester's `ui5-frontload` arm referenced
// the old names in both its lint gate and its tool-exclusion list, and the
// resulting silent breakage roughly tripled one model's output tokens for a
// day before anyone traced it.
//
// This scans the source instead of trusting any single call site, so the
// next rename fails here rather than in someone's token bill.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildComponentDef } from '../src/tools/build-component.js';
import { checkExportsDef } from '../src/tools/check-exports.js';
import { contextBriefDef } from '../src/tools/context-brief.js';
import { explainErrorDef } from '../src/tools/explain-error.js';
import { feedbackDef } from '../src/tools/feedback.js';
import { getAgentContextDef } from '../src/tools/get-agent-context.js';
import { getChunkDef } from '../src/tools/get-chunk.js';
import { getDocumentBlockDef } from '../src/tools/get-document-block.js';
import { getEntityDef } from '../src/tools/get-entity.js';
import { getSkillDef } from '../src/tools/get-skill.js';
import { lintDef } from '../src/tools/lint-code.js';
import { listEntitiesDef } from '../src/tools/list-entities.js';
import { listSkillsDef } from '../src/tools/list-skills.js';
import { searchEntitiesDef } from '../src/tools/search-entities.js';
import { specEntitySchemaDef } from '../src/tools/spec-entity-schema.js';
import { styleCheckDef } from '../src/tools/style-check.js';
import { validateDef } from '../src/tools/validate.js';

const REGISTERED = new Set(
  [
    buildComponentDef, checkExportsDef, contextBriefDef, explainErrorDef, feedbackDef,
    getAgentContextDef, getChunkDef, getDocumentBlockDef, getEntityDef, getSkillDef,
    lintDef, listEntitiesDef, listSkillsDef, searchEntitiesDef, specEntitySchemaDef,
    styleCheckDef, validateDef,
  ].map((d) => d.name),
);

const srcDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../src');

function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) jsFiles(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('tool name references in source', () => {
  it('names no tool that is not registered', () => {
    const offenders = [];
    for (const file of jsFiles(srcDir)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const match of line.matchAll(/dsds_[a-z_]+/g)) {
          if (!REGISTERED.has(match[0])) {
            offenders.push(`${file.slice(srcDir.length + 1)}:${i + 1} → ${match[0]}`);
          }
        }
      });
    }
    // Reported as a list so a rename shows every site to update at once,
    // rather than one per test run.
    expect(offenders, `\nUnregistered tool names referenced in source:\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('keeps every registered name prefixed and lowercase', () => {
    for (const name of REGISTERED) {
      expect(name).toMatch(/^dsds_[a-z_]+$/);
    }
  });
});
