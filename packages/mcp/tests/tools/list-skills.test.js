import { describe, it, expect } from 'vitest';
import { listSkillsHandler, loadSkills } from '../../src/tools/list-skills.js';
import { getSkillHandler } from '../../src/tools/get-skill.js';

describe('loadSkills', () => {
  it('finds the four real vendored skills with parsed frontmatter', () => {
    const skills = loadSkills();
    const ids = skills.map(s => s.id).sort();
    expect(ids).toEqual(['dsds-add', 'dsds-specs', 'dsds-update', 'dsds-validate']);
    for (const skill of skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.text).toContain('---'); // frontmatter fence present
    }
  });
});

describe('listSkillsHandler', () => {
  it('lists every skill by id with its description', async () => {
    const result = await listSkillsHandler();
    const text = result.content[0].text;
    expect(text).toContain('dsds-add');
    expect(text).toContain('dsds-specs');
    expect(text).toContain('dsds-update');
    expect(text).toContain('dsds-validate');
    expect(result.isError).toBeFalsy();
  });
});

describe('getSkillHandler', () => {
  it('returns the full skill content for a known id', async () => {
    const result = await getSkillHandler({ id: 'dsds-add' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('# Add a DSDS Spec');
  });

  it('appends the dsds-mcp adapter note without mutating the vendored text', async () => {
    const result = await getSkillHandler({ id: 'dsds-add' });
    expect(result.content[0].text).toContain('Using this skill through dsds-mcp');
  });

  it('returns isError for an unknown id, listing the real available ids', async () => {
    const result = await getSkillHandler({ id: 'nonexistent' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('dsds-add');
  });
});
