// Lists the real 0.20.0 authoring skills bundled with this server — see
// packages/mcp/skills/ (vendored verbatim from the design-system-
// documentation-schema repo's own 0.20.0 branch, .agents/skills/). This is
// the progressive-disclosure entry point: name + description only, so an
// agent can pick the right skill before spending context on the full
// content (dsds_get_skill).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUpdateNotice } from '../spec/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '../../skills');

/** Parses just the YAML frontmatter block of a SKILL.md — name/description/metadata. */
function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function loadSkills() {
  let dirs;
  try {
    dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return dirs
    .map((d) => {
      const path = resolve(SKILLS_DIR, d.name, 'SKILL.md');
      let text;
      try {
        text = readFileSync(path, 'utf-8');
      } catch {
        return null;
      }
      const front = parseFrontmatter(text);
      return { id: d.name, name: front.name ?? d.name, description: front.description ?? '', path, text };
    })
    .filter(Boolean);
}

export const listSkillsDef = {
  name: 'dsds_list_skills',
  description:
    'List the real DSDS 0.20.0 authoring skills bundled with this server — name and description only. ' +
    'Call dsds_get_skill with an id from this list to read the full skill. ' +
    'These are the actual skills from the design-system-documentation-schema repo\'s own 0.20.0 branch, not generated from this server\'s own knowledge.',
  inputSchema: { type: 'object', properties: {} },
};

export async function listSkillsHandler() {
  const skills = loadSkills();
  if (skills.length === 0) {
    return { content: [{ type: 'text', text: 'No skills bundled with this server (packages/mcp/skills/ is empty or missing).' }] };
  }

  const lines = ['# Available DSDS skills', ''];
  for (const s of skills) {
    lines.push(`## \`${s.id}\``, s.description, '');
  }
  lines.push('Call `dsds_get_skill({ id })` with one of the ids above to read the full skill.');

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
